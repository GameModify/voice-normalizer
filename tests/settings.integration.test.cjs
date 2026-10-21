"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getPreset } = require("../src/audio/settings");
const { createUserState } = require("../src/audio/leveler");

const { mockClock } = require("./clock.cjs");

function makePlugin(t, level, inputSettings) {
  const advanceClock = mockClock(t);
  let detected = 1;
  let interval = 100;
  let volume = 100;
  const conn = {
    context: "default",
    remoteAudioSSRCs: new Map([["friend", 42]]),
    getUserIdBySsrc() {
      return undefined;
    },
    getStats() {
      advanceClock(interval);
      return {
        rtp: { inbound: { audio: [{ ssrc: 42, audioLevel: level, audioDetected: detected }] } },
      };
    },
  };
  const actions = {
    setLocalVolume(id, next) {
      assert.equal(id, "friend");
      volume = next;
    },
  };
  const stores = {
    MediaEngineStore: {
      getLocalVolume() {
        return volume;
      },
    },
    UserStore: {
      getCurrentUser() {
        return { id: "self" };
      },
      getUser(id) {
        return { username: id };
      },
    },
    VoiceStateStore: {
      getCurrentClientVoiceChannelId() {
        return "room";
      },
      getVoiceStatesForChannel() {
        return { a: { userId: "friend" }, b: { userId: "self" } };
      },
    },
    SelectedChannelStore: {
      getChannelId() {
        return "room";
      },
    },
  };
  global.BdApi = {
    Webpack: {
      getModule(predicate) {
        return [
          actions,
          {
            getMediaEngine() {
              return {
                eachConnection(fn) {
                  fn(conn);
                },
              };
            },
          },
        ].find(predicate);
      },
      getStore(name) {
        return stores[name];
      },
    },
    ContextMenu: {
      patch() {
        return () => {};
      },
      buildItem(x) {
        return x;
      },
    },
    UI: { showToast() {} },
    Data: {
      load() {
        return null;
      },
      save() {},
    },
  };
  const Plugin = require("../VoiceNormalizer.plugin.js");
  const plugin = new Plugin();
  plugin.start();
  t.after(() => plugin.stop());
  plugin.select("friend", true);
  plugin.updateSettings(inputSettings);
  // Seed an established session: selection now also works before joining a call.
  plugin.connection = conn;
  const state = createUserState(100);
  plugin.states.set("friend", state);
  state.ema = level;
  state.voiceCount = 15;
  state.activityPolls = 2;
  return {
    plugin,
    getVolume: () => volume,
    setInput: (next, active = 1) => {
      level = next;
      detected = active;
    },
    setInterval: (next) => {
      interval = next;
    },
  };
}

test("real controller bounds attenuation and preserves original volume on stop", async (t) => {
  const state = makePlugin(t, 0.5, {
    ...getPreset("balanced"),
    attack: 0.2,
  });
  await state.plugin.tick(state.plugin.generation);
  assert.ok(state.getVolume() < 95 && state.getVolume() > 94);
  state.plugin.turnOff();
  assert.equal(state.getVolume(), 100);
  delete global.BdApi;
});

test("real controller uses configured slow release", async (t) => {
  const state = makePlugin(t, 0.045, {
    ...getPreset("balanced"),
    release: 0.05,
  });
  await state.plugin.tick(state.plugin.generation);
  assert.ok(state.getVolume() > 100.9 && state.getVolume() < 101.1);
  state.plugin.turnOff();
  assert.equal(state.getVolume(), 100);
  delete global.BdApi;
});

async function poll(state, count = 1) {
  for (let index = 0; index < count; index++) await state.plugin.tick(state.plugin.generation);
  return state.getVolume();
}

test("a shout is reduced in bounded steps; pauses hold and recovery needs speech", async (t) => {
  const state = makePlugin(t, 0.06, getPreset("balanced"));
  await poll(state, 70);
  const boosted = state.getVolume();
  assert(boosted > 150 && boosted < 160, "sustained quiet speech is still boosted");
  state.setInput(0.8);
  await poll(state);
  const ducked = state.getVolume();
  assert(ducked < boosted * 0.9 && ducked > boosted * 0.8, "no abrupt drop to minimum gain");
  state.setInput(0, 0);
  await poll(state, 100);
  assert.equal(state.getVolume(), ducked, "a long pause neither releases nor deepens ducking");
  state.setInput(0.06);
  for (let index = 0; index < 10; index++) {
    await poll(state);
    assert(state.getVolume() <= ducked + 0.001, "silence did not spend the recovery hold");
  }
  const beforeRecovery = state.getVolume();
  for (let index = 0; index < 80; index++) {
    const previous = state.getVolume();
    await poll(state);
    assert(state.getVolume() <= previous * 1.021, "recovery has a relative speed limit");
  }
  assert(state.getVolume() > beforeRecovery + 10, "quiet speech eventually recovers");
  state.plugin.turnOff();
  assert.equal(state.getVolume(), 100);
});

test("alternating loud and quiet fragments cannot pump volume back up between peaks", async (t) => {
  const state = makePlugin(t, 0.06, getPreset("balanced"));
  await poll(state, 70);
  let peakVolume = state.getVolume();
  for (let cycle = 0; cycle < 8; cycle++) {
    state.setInput(0.7);
    await poll(state, 2);
    assert(state.getVolume() <= peakVolume);
    peakVolume = state.getVolume();
    state.setInput(0.055);
    await poll(state, 4);
    assert(state.getVolume() <= peakVolume + 0.001, "short quiet gaps do not release attenuation");
  }
  state.setInput(0.04);
  await poll(state, 250);
  assert(state.getVolume() > 120, "persistent quiet speech is not stuck at the ducked level");
});

test("the deadband suppresses tiny target changes and short noise never boosts volume", async (t) => {
  const state = makePlugin(t, 0.095, getPreset("balanced"));
  await poll(state, 20);
  for (let index = 0; index < 40; index++) {
    state.setInput(index % 2 ? 0.094 : 0.096);
    await poll(state);
  }
  assert.equal(state.getVolume(), 100);
  for (let index = 0; index < 12; index++) {
    state.setInput(0, 0);
    await poll(state);
    state.setInput(0.012);
    await poll(state, 2);
  }
  assert.equal(state.getVolume(), 100, "isolated one- and two-poll sounds are not boosted");
});

test("release speed follows elapsed polling time, and a stalled poll cannot cause a catch-up jump", async (t) => {
  const run = async (interval, count) => {
    const state = makePlugin(t, 0.045, getPreset("balanced"));
    state.setInterval(interval);
    await poll(state, count);
    const finalVolume = state.getVolume();
    state.plugin.stop();
    return finalVolume;
  };
  const fast = await run(100, 11);
  const slow = await run(200, 6);
  assert(Math.abs(fast - slow) < 0.01, "equal elapsed time gives equal recovery");
  const state = makePlugin(t, 0.045, getPreset("balanced"));
  await poll(state);
  const previous = state.getVolume();
  state.setInterval(10000);
  await poll(state);
  assert(
    state.getVolume() < previous * 1.052,
    "missing statistics do not spend seconds of recovery at once",
  );
});

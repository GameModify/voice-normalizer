"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getPreset } = require("../src/audio/settings");
const { createUserState } = require("../src/audio/leveler");

function makePlugin(t, level, inputSettings) {
  let volume = 100;
  const conn = {
    context: "default",
    remoteAudioSSRCs: new Map([["friend", 42]]),
    getUserIdBySsrc() {
      return undefined;
    },
    getStats() {
      return { rtp: { inbound: { audio: [{ ssrc: 42, audioLevel: level, audioDetected: 1 }] } } };
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
  return { plugin, getVolume: () => volume };
}

test("real controller applies selected attack and preserves original volume on stop", async (t) => {
  const state = makePlugin(t, 0.5, {
    ...getPreset("balanced"),
    attack: 0.2,
  });
  await state.plugin.tick(state.plugin.generation);
  assert.ok(state.getVolume() < 90.01 && state.getVolume() > 88.99);
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
  assert.ok(state.getVolume() > 104.9 && state.getVolume() < 105.1);
  state.plugin.turnOff();
  assert.equal(state.getVolume(), 100);
  delete global.BdApi;
});

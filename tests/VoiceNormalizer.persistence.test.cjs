const { test } = require("node:test");
const assert = require("node:assert/strict");
const Plugin = require("../VoiceNormalizer.plugin.js");

function fixture(t, saved = ["friend"]) {
  let connection;
  let participants = ["friend"];
  const volume = new Map([["friend", 100]]);
  const data = { targets: saved };
  const writes = [];
  const actions = {
    setLocalVolume(id, value) {
      writes.push([id, value]);
      volume.set(id, value);
    },
  };
  const provider = {
    getMediaEngine: () => ({ eachConnection: (cb) => connection && cb(connection) }),
  };
  const stores = {
    MediaEngineStore: { getLocalVolume: (id) => volume.get(id) ?? 100 },
    VoiceStateStore: {
      getCurrentClientVoiceChannelId: () => "room",
      getVoiceStatesForChannel: () => participants.map((userId) => ({ userId })),
    },
    UserStore: { getCurrentUser: () => ({ id: "self" }) },
  };
  global.BdApi = {
    Data: {
      load: (_, key) => structuredClone(data[key]),
      save: (_, key, value) => {
        data[key] = structuredClone(value);
      },
    },
    Webpack: {
      getStore: (name) => stores[name],
      getModule: (predicate) => [actions, provider].find(predicate),
    },
    ContextMenu: { patch: () => () => {} },
    UI: { showToast() {} },
  };
  const plugins = [];
  const create = () => {
    const p = new Plugin();
    plugins.push(p);
    p.start();
    return p;
  };
  t.after(() => plugins.forEach((p) => p.stop()));
  return {
    data,
    volume,
    writes,
    create,
    setParticipants: (list) => {
      participants = list;
    },
    connect() {
      connection = {
        getUserIdBySsrc: () => "friend",
        getStats: () => ({
          rtp: { inbound: { audio: [{ ssrc: 123, audioLevel: 0.4, audioDetected: 1 }] } },
        }),
      };
      return connection;
    },
    disconnect: () => {
      connection = null;
    },
  };
}

test("saved user IDs survive a new plugin instance and startup outside a call", async (t) => {
  const f = fixture(t, []);
  let p = f.create();
  p.select("friend", true);
  assert.deepEqual(f.data.targets, ["friend"]);
  await p.tick(p.generation);
  assert(p.targets.has("friend"));
  p.stop();
  p = f.create();
  assert(p.targets.has("friend"));
  f.connect();
  await p.tick(p.generation);
  assert(f.volume.get("friend") < 100);
});

test("disconnect and channel switch restore baseline and restart calibration", async (t) => {
  const f = fixture(t);
  f.connect();
  const p = f.create();
  await p.tick(p.generation);
  const oldState = p.states.get("friend");
  f.disconnect();
  await p.tick(p.generation);
  assert.equal(f.volume.get("friend"), 100);
  assert.equal(p.states.size, 0);
  assert(p.enabled && p.targets.has("friend"));
  f.connect();
  await p.tick(p.generation);
  assert.notEqual(p.states.get("friend"), oldState);
  f.connect();
  await p.tick(p.generation);
  assert.equal(p.states.get("friend").base, 100);
});

test("a participant leaving is restored and remembered for a later join", async (t) => {
  const f = fixture(t);
  f.connect();
  const p = f.create();
  await p.tick(p.generation);
  f.setParticipants([]);
  await p.tick(p.generation);
  assert.equal(f.volume.get("friend"), 100);
  assert.equal(p.states.size, 0);
  f.setParticipants(["friend"]);
  await p.tick(p.generation);
  assert(f.volume.get("friend") < 100);
});

test("unchecking and disabling for all persist, plugin stop preserves choices", async (t) => {
  const f = fixture(t);
  const p = f.create();
  p.select("other", true);
  p.select("friend", false);
  assert.deepEqual(f.data.targets, ["other"]);
  p.stop();
  assert.deepEqual(f.data.targets, ["other"]);
  const next = f.create();
  next.turnOff();
  assert.deepEqual(f.data.targets, []);
  assert.equal(next.timer, null);
});

test("muted users stay muted and unmuting starts with a fresh baseline", async (t) => {
  const f = fixture(t);
  f.connect();
  const p = f.create();
  await p.tick(p.generation);
  f.volume.set("friend", 0);
  await p.tick(p.generation);
  assert.equal(f.volume.get("friend"), 0);
  assert.equal(p.states.size, 0);
  f.volume.set("friend", 80);
  await p.tick(p.generation);
  assert.equal(p.states.get("friend").base, 80);
  p.stop();
  assert.equal(f.volume.get("friend"), 80);
});

test("late getStats results cannot change volume after stop or connection change", async (t) => {
  const f = fixture(t);
  let conn = f.connect();
  const p = f.create();
  let finish;
  conn.getStats = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = p.tick(p.generation);
  f.connect();
  finish({});
  await pending;
  assert.equal(f.writes.length, 0);
  conn = f.connect();
  conn.getStats = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const stopped = p.tick(p.generation);
  p.stop();
  finish({});
  await stopped;
  assert.equal(f.writes.length, 0);
});

test("invalid stored targets are ignored and save failures are visible", (t) => {
  const f = fixture(t, [null, 123, "", "friend", "friend", {}]);
  const p = f.create();
  assert.deepEqual([...p.targets], ["friend"]);
  BdApi.Data.save = () => {
    throw Error("disk unavailable");
  };
  p.select("other", true);
  assert.match(p.status, /disk unavailable/);
});

test("stop cancels the manual volume test and restores volume immediately", async (t) => {
  const f = fixture(t, []);
  const p = f.create();
  const pending = p.halfVolumeTest("friend");
  assert.equal(f.volume.get("friend"), 50);
  p.stop();
  assert.equal(f.volume.get("friend"), 100);
  await pending;
  assert.equal(p.testRunning, false);
});

test("existing 1.2 profiles and custom settings survive loading and saving", (t) => {
  const f = fixture(t, []);
  f.data.settings = {
    profile: "custom",
    targetLevel: 0.12,
    minGain: 0.5,
    maxGain: 1.7,
    attack: 0.7,
    release: 0.15,
  };
  const p = f.create();
  assert.deepEqual(p.settings, f.data.settings);
  p.updateSettings({ ...p.settings, maxGain: 99 });
  assert.equal(f.data.settings.maxGain, 2);
  assert.equal(f.data.settings.targetLevel, 0.12);
});

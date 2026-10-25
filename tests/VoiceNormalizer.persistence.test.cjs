const { test } = require("node:test");
const assert = require("node:assert/strict");

const { fixture: coreFixture } = require("./plugin-fixture.cjs");
function fixture(t, saved = ["friend"]) {
  return coreFixture(t, { targets: saved, connected: false });
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
  f.setVolume("friend", 0);
  await p.tick(p.generation);
  assert.equal(f.volume.get("friend"), 0);
  assert.equal(p.states.size, 0);
  f.setVolume("friend", 80);
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
  f.connect();
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
    minGain: 0.5,
    maxGain: 1.7,
    attack: 0.7,
    release: 0.15,
  };
  const p = f.create();
  assert.deepEqual(p.settings, f.data.settings);
  p.updateSettings({ ...p.settings, maxGain: 99 });
  assert.equal(f.data.settings.maxGain, 2);
  assert.equal(f.data.settings.profile, "custom");
});

test("a stalled statistics request times out and does not block later connections", async (t) => {
  const f = fixture(t);
  const connection = f.connect();
  connection.getStats = () => new Promise(() => {});
  const p = f.create();
  await p.tick(p.generation);
  assert.equal(p.diagnostic.failures, 1);
  assert.equal(p.pendingStats, null);
  f.connect();
  await p.tick(p.generation);
  assert(f.volume.get("friend") < 100);
});

test("cancelled statistics cannot clear the slot owned by a restarted session", async (t) => {
  const f = fixture(t);
  const connection = f.connect();
  let finishOld;
  connection.getStats = () =>
    new Promise((resolve) => {
      finishOld = resolve;
    });
  const p = f.create();
  const old = p.tick(p.generation);
  p.stop();
  p.start();
  const nextConnection = f.connect();
  let finishNext;
  const data = nextConnection.getStats();
  nextConnection.getStats = () =>
    new Promise((resolve) => {
      finishNext = resolve;
    });
  const next = p.tick(p.generation);
  const request = p.pendingStats;
  await old;
  finishOld(data);
  assert.equal(p.pendingStats, request);
  assert.equal(f.writes.length, 0);
  finishNext(data);
  await next;
  assert(f.volume.get("friend") < 100);
});

test("high user baselines can be attenuated and restored without changing the slider", async (t) => {
  const f = fixture(t);
  f.setVolume("friend", 500);
  f.connect();
  const p = f.create();
  await f.tick(p, 4);
  assert(f.volume.get("friend") < 500);
  assert.equal(f.preferences.get("friend"), 500);
  assert.equal(p.write("friend", 3), false);
  p.stop();
  assert.equal(f.volume.get("friend"), 500);
});

test("very small volumes still normalize and a manual change establishes a new baseline", async (t) => {
  const f = fixture(t);
  f.setVolume("friend", 0.01);
  f.connect();
  const p = f.create();
  await p.tick(p.generation);
  assert(f.volume.get("friend") < 0.01);

  f.setVolume("friend", 0.003);
  await p.tick(p.generation);
  assert.equal(p.states.get("friend").base, 0.003);
  p.stop();
  assert.equal(f.volume.get("friend"), 0.003);
});

test("manual volume diagnostics restore high baselines and respect a new zero setting", async (t) => {
  const f = fixture(t, []);
  f.connect();
  f.setVolume("friend", 500);
  const p = f.create();
  const high = p.halfVolumeTest("friend");
  assert.equal(f.volume.get("friend"), 250);
  p.stop();
  await high;
  assert.equal(f.volume.get("friend"), 500);
  p.start();
  f.setVolume("friend", 0.01);
  const quiet = p.halfVolumeTest("friend");
  assert.equal(f.volume.get("friend"), 0.005);
  f.setVolume("friend", 0);
  p.stop();
  await quiet;
  assert.equal(f.volume.get("friend"), 0);
});

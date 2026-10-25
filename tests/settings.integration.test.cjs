const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./plugin-fixture.cjs");

test("playback correction leaves the Discord slider and preference store unchanged", async (t) => {
  const f = fixture(t, { level: 0.025 });
  const p = f.create();
  await f.tick(p, 35);
  assert(f.volume.get("friend") > 150);
  assert(f.volume.get("friend") <= 200);
  assert.equal(f.preferences.get("friend"), 100);
  assert.equal(f.getActionWrites(), 0);
  assert.equal(p.read("friend"), 100);
  assert(p.getLiveSnapshot("friend").ratio > 1.5);
  p.stop();
  assert.equal(f.volume.get("friend"), 100);
  assert.equal(f.saved.runtime.phase, "applied");
});

test("initial ordinary speech is calibrated to the user's comfortable volume", async (t) => {
  const f = fixture(t, { level: 0.025, seedReference: false, volumes: { friend: 65, self: 100 } });
  const p = f.create();
  await f.tick(p, 30);
  const state = p.states.get("friend");
  assert.equal(state.reference, 0.025);
  assert.equal(f.volume.get("friend"), 65);
  assert.equal(f.preferences.get("friend"), 65);
  f.setInput(0.002);
  await f.tick(p, 35);
  assert(f.volume.get("friend") > 90, "speech below the old 0.008 gate is audibly boosted");
  assert.equal(state.reference, 0.025);
});

test("manual volume changes preserve voice learning and become the new playback base", async (t) => {
  const f = fixture(t, { level: 0.025 });
  const p = f.create();
  await f.tick(p, 35);
  const state = p.states.get("friend"),
    count = state.voiceCount,
    reference = state.reference;
  f.setVolume("friend", 60);
  await f.tick(p, 2);
  assert.equal(state.base, 60);
  assert.equal(state.reference, reference);
  assert(state.voiceCount > count);
  assert.equal(f.preferences.get("friend"), 60);
  assert(f.volume.get("friend") > 60);
  p.stop();
  assert.equal(f.volume.get("friend"), 60);
  assert.equal(f.preferences.get("friend"), 60);
});

test("native volume synchronization is corrected without being mistaken for a manual reset", async (t) => {
  const f = fixture(t, { level: 0.025 });
  const p = f.create();
  await f.tick(p, 35);
  const before = p.states.get("friend");
  f.getConnection().setLocalVolume("friend", 100);
  assert(f.volume.get("friend") > 150);
  await f.tick(p, 2);
  assert.equal(p.states.get("friend"), before);
  assert.equal(f.preferences.get("friend"), 100);
});

test("relative normalization is independent of native volume units and allows headroom at a high slider setting", async (t) => {
  const f = fixture(t, { level: 0.025, scale: 0.01, volumes: { friend: 200, self: 100 } });
  const p = f.create();
  await f.tick(p, 40);
  assert(f.volume.get("friend") > 3);
  assert(f.volume.get("friend") <= 4);
  assert.equal(f.preferences.get("friend"), 200);
  p.stop();
  assert.equal(f.volume.get("friend"), 2);
});

test("a shout is reduced and ordinary speech recovers without the old long-average delay", async (t) => {
  const f = fixture(t, { level: 0.5 });
  const p = f.create();
  await f.tick(p, 12);
  const low = f.volume.get("friend");
  assert(low < 55);
  f.setInput(0, 0);
  await f.tick(p, 100);
  assert.equal(f.volume.get("friend"), low);
  f.setInput(0.1);
  await f.tick(p, 35);
  assert(
    f.volume.get("friend") > 90,
    "normal speech returns near the comfortable base within 3.5 seconds",
  );
  assert(f.volume.get("friend") <= 101);
});

test("quiet speech gets stronger while short noise events never trigger a boost", async (t) => {
  const f = fixture(t, { level: 0.1 });
  const p = f.create();
  await f.tick(p, 10);
  for (let i = 0; i < 15; i++) {
    f.setInput(0, 0);
    await f.tick(p);
    f.setInput(0.002);
    await f.tick(p, 2);
  }
  assert.equal(f.volume.get("friend"), 100);
  f.setInput(0.002);
  await f.tick(p, 30);
  assert(f.volume.get("friend") > 145);
  f.setInput(0.002, 0);
  const held = f.volume.get("friend");
  await f.tick(p, 40);
  assert.equal(f.volume.get("friend"), held);
});

test("missing statistics require new speech confirmation without losing calibration", async (t) => {
  const f = fixture(t, { level: 0.025 });
  const p = f.create();
  await f.tick(p, 20);
  const state = p.states.get("friend"),
    reference = state.reference;
  f.setMissing(true);
  const held = f.volume.get("friend");
  await f.tick(p, 5);
  assert.equal(f.volume.get("friend"), held);
  assert.equal(state.reference, reference);
  f.setMissing(false);
  await f.tick(p, 2);
  assert.equal(f.volume.get("friend"), held);
  await f.tick(p, 10);
  assert(f.volume.get("friend") > held);
});

test("unsupported independent output fails closed instead of moving the user slider", async (t) => {
  const f = fixture(t);
  delete f.getConnection().getLocalVolume;
  const p = f.create();
  await f.tick(p, 20);
  assert.equal(p.writer, null);
  assert.equal(f.saved.runtime.phase, "unavailable");
  assert.equal(f.preferences.get("friend"), 100);
  assert.equal(f.volume.get("friend"), 100);
  assert.equal(f.getActionWrites(), 0);
});

test("stream connections and other participants are never modified", async (t) => {
  const f = fixture(t, { targets: ["friend"], roster: ["friend", "other", "self"] });
  const p = f.create();
  await f.tick(p, 15);
  assert.equal(f.volume.get("other") ?? 100, 100);
  assert.equal(f.volume.get("self"), 100);
  p.stop();
  f.getConnection().context = "stream";
  p.start();
  await f.tick(p, 10);
  assert.equal(p.connection, null);
});

test("an output error cannot erase manual preferences and disposal removes the native hook", async (t) => {
  const f = fixture(t, { level: 0.1 });
  const original = f.getConnection().setLocalVolume;
  const p = f.create();
  await f.tick(p);
  p.stop();
  assert.equal(f.getConnection().setLocalVolume, original);
  f.getConnection().setLocalVolume = () => {
    throw Error("native writer failed");
  };
  p.start();
  f.setInput(0.5);
  await f.tick(p, 3);
  assert(p.diagnostic.writes === 0);
  assert.equal(f.preferences.get("friend"), 100);
  p.stop();
  assert.equal(p.output, null);
});

test("a stopped plugin cannot reinstall the native hook through a stale diagnostic button", async (t) => {
  const f = fixture(t, { targets: [] });
  const p = f.create();
  p.stop();
  const setter = f.getConnection().setLocalVolume;
  await p.halfVolumeTest("friend");
  assert.equal(p.output, null);
  assert.equal(p.timer, null);
  assert.equal(f.getConnection().setLocalVolume, setter);
});

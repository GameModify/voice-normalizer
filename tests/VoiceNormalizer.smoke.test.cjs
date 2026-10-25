const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./plugin-fixture.cjs");
test("native half-volume test keeps the slider stable and restores playback", async (t) => {
  const f = fixture(t, { targets: [] });
  const p = f.create();
  const pending = p.halfVolumeTest("friend");
  assert.equal(f.volume.get("friend"), 50);
  assert.equal(f.preferences.get("friend"), 100);
  await pending;
  assert.equal(f.volume.get("friend"), 100);
  assert.equal(p.testRunning, false);
  p.stop();
});

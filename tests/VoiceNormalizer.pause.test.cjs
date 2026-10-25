const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./plugin-fixture.cjs");
test("pauses and delayed native readback never rewrite the user's baseline", async (t) => {
  const f = fixture(t);
  const p = f.create();
  await f.tick(p, 12);
  const state = p.states.get("friend"),
    ref = state.reference,
    volume = f.volume.get("friend");
  f.setInput(0, 0);
  await f.tick(p, 40);
  assert.equal(f.volume.get("friend"), volume);
  assert.equal(state.reference, ref);
  f.getConnection().getLocalVolume = () => 123;
  f.setInput(0.1);
  await f.tick(p, 30);
  assert.equal(state.base, 100);
  assert.equal(state.reference, ref);
  assert.equal(f.preferences.get("friend"), 100);
  p.stop();
  assert.equal(f.volume.get("friend"), 100);
});

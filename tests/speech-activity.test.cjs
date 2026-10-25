const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createUserState, calculateGain } = require("../src/audio/leveler");
function update(state, count, level, detected = 1) {
  let gain;
  for (let i = 0; i < count; i++) {
    const t = (state.lastObservationAt ?? 0) + 100;
    gain = calculateGain(state, level, detected, t);
  }
  return gain;
}
test("ordinary speech calibrates neutrally, including a consistently quiet speaker", () => {
  for (const level of [0.002, 0.05, 0.4]) {
    const s = createUserState(100);
    assert.equal(update(s, 25, level), 1);
    assert.equal(s.reference, level);
  }
});
test("one or two isolated events never learn a new voice reference", () => {
  const s = createUserState(100);
  for (let i = 0; i < 25; i++) {
    update(s, 1, 0, 0);
    update(s, 2, 0.02);
  }
  assert.equal(s.reference, null);
  assert.equal(s.voiceCount, 0);
});
test("speech relative to the learned reference can both attenuate and boost", () => {
  const s = createUserState(100, 0.1);
  assert(update(s, 15, 0.4) < 1);
  assert(update(s, 20, 0.02) > 1);
  assert.equal(s.reference, 0.1);
});
test("a sudden relative peak is guarded before continuous speech is confirmed", () => {
  const s = createUserState(100, 0.1);
  assert(update(s, 1, 0.8) < 1);
  assert.equal(s.voiceCount, 0);
  assert.equal(s.reference, 0.1);
});
test("ordinary variation around the reference has a neutral zone", () => {
  const s = createUserState(100, 0.1);
  assert.equal(update(s, 20, 0.105), 1);
  assert.equal(update(s, 20, 0.095), 1);
});

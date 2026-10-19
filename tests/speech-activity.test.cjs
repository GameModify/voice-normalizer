const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createUserState, calculateGain } = require("../src/audio/leveler");

function update(state, samples, level, detected = 1) {
  let result;
  for (let index = 0; index < samples; index++) {
    result = calculateGain(state, level, detected, (index + 1) * 100);
    state.lastGain = result;
  }
  return result;
}

test("short microphone pops do not change the confirmed voice average", () => {
  const state = createUserState(100);
  update(state, 13, 0.35);
  const previousAverage = state.ema;
  const previousCount = state.voiceCount;
  const previousStableGain = state.stableGain;
  assert.ok(previousCount > 7);

  calculateGain(state, 0, 0, 1500);
  calculateGain(state, 0.012, 1, 1600);
  calculateGain(state, 0.02, 1, 1700);
  calculateGain(state, 0, 0, 1800);

  assert.equal(state.ema, previousAverage);
  assert.equal(state.voiceCount, previousCount);
  assert.equal(state.stableGain, previousStableGain);
});

test("continuous quiet speech qualifies and gradually raises gain", () => {
  const state = createUserState(100);
  const gain = update(state, 15, 0.03);
  assert.ok(state.voiceCount >= 7);
  assert.ok(state.ema > 0);
  assert.ok(gain > 1);
});

test("a sudden loud transient ducks immediately without contaminating average", () => {
  const state = createUserState(100);
  const spike = calculateGain(state, 0.85, true, 100);
  assert.ok(spike < 1);
  assert.equal(state.ema, null);
  assert.equal(state.voiceCount, 0);
  const after = calculateGain(state, 0, false, 200);
  assert.equal(after, 1);
});

test("the normalized gain is retained throughout a pause", () => {
  const state = createUserState(100);
  const before = update(state, 15, 0.4);
  assert.ok(before < 1);
  const avg = state.ema;
  for (let time = 1700; time <= 2700; time += 100) {
    const value = calculateGain(state, 0, false, time);
    assert.equal(value, state.stableGain);
  }
  assert.equal(state.ema, avg);
});

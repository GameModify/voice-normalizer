"use strict";

const { detectSpeech } = require("./speech-activity");
const { DEFAULT_SETTINGS } = require("./settings");

function createUserState(base, reference = null) {
  return {
    base,
    reference,
    calibration: [],
    ema: null,
    voiceCount: 0,
    lastGain: 1,
    stableGain: 1,
    lastLevel: 0,
    activityPolls: 0,
    talking: false,
    lastSpeechSampleAt: null,
    lastObservationAt: null,
    envelopeAt: null,
    recoveryHoldMs: 0,
  };
}
function interruptSpeech(state) {
  state.activityPolls = 0;
  state.talking = false;
  state.lastSpeechSampleAt = null;
  state.lastObservationAt = null;
  state.envelopeAt = null;
}
function calculateGain(state, level, detected, timestamp, settings = DEFAULT_SETTINGS) {
  if (state.lastObservationAt !== null && timestamp - state.lastObservationAt > 500)
    interruptSpeech(state);
  state.lastObservationAt = timestamp;
  const { active, confirmed } = detectSpeech(state, level, detected);
  if (confirmed) {
    const elapsed =
      state.lastSpeechSampleAt === null
        ? 100
        : Math.max(0, Math.min(250, timestamp - state.lastSpeechSampleAt));
    const alpha = 1 - Math.exp(-elapsed / 450);
    state.ema = state.ema === null ? level : state.ema * (1 - alpha) + level * alpha;
    state.lastSpeechSampleAt = timestamp;
    state.voiceCount++;
    if (state.reference === null) {
      state.calibration.push(level);
      if (state.calibration.length >= 15) {
        const sorted = [...state.calibration].sort((a, b) => a - b);
        state.reference = sorted[Math.floor(sorted.length / 2)];
        state.calibration = [];
      }
    }
  }
  if (state.reference === null) return 1;
  let gain = state.stableGain;
  if (confirmed && state.ema > 0) {
    const difference = Math.log(state.reference / state.ema);
    const deadband = Math.log(1.12);
    const strength =
      settings.profile === "soft" ? 0.6 : settings.profile === "aggressive" ? 0.95 : 0.8;
    gain = Math.exp(
      Math.sign(difference) * Math.max(0, Math.abs(difference) - deadband) * strength,
    );
    gain = Math.max(settings.minGain, Math.min(settings.maxGain, gain));
    if (settings.mode === "attenuate") gain = Math.min(1, gain);
    state.stableGain = gain;
  }
  if (active && level > state.reference * 1.8)
    gain = Math.min(gain, (state.reference * 1.8) / level);
  gain = Math.max(settings.minGain, Math.min(settings.maxGain, gain));
  return settings.mode === "attenuate" ? Math.min(1, gain) : gain;
}

module.exports = { createUserState, calculateGain, interruptSpeech };

"use strict";

const { detectSpeech } = require("./speech-activity");

function createUserState(base) {
  return {
    base,
    lastWrite: null,
    lastWriteTime: 0,
    ema: null,
    voiceCount: 0,
    writeUnconfirmed: 0,
    lastLevel: 0,
    lastGain: 1,
    stableGain: 1,
    activityPolls: 0,
    lastSpeechSampleAt: null,
    talking: false,
  };
}

/**
 * Isolated events may duck loud peaks, but do not update the persistent
 * voice average or the held gain. The controller handles volume ramps.
 */
function calculateGain(state, level, detected, timestamp) {
  const { active, confirmed } = detectSpeech(state, level, detected);
  if (confirmed) {
    const elapsed =
      state.lastSpeechSampleAt === null
        ? 100
        : Math.max(50, Math.min(250, timestamp - state.lastSpeechSampleAt));
    const alpha = 1 - Math.exp(-elapsed / 3000);
    state.ema = state.ema === null ? level : state.ema * (1 - alpha) + level * alpha;
    state.lastSpeechSampleAt = timestamp;
    state.voiceCount++;
  }

  let gain = state.stableGain;
  if (confirmed && state.voiceCount >= 7 && state.ema !== null) {
    gain = Math.max(0.45, Math.min(2.0, 0.095 / Math.max(state.ema, 0.006)));
  } else if (confirmed && level > 0.18) {
    gain = Math.min(1, 0.18 / level);
  }

  // Peak attenuation remains responsive even during unconfirmed short noises.
  if (active && level > 0.18) gain = Math.min(gain, 0.18 / level);

  gain = Math.max(0.45, Math.min(2.0, gain));
  if (confirmed) state.stableGain = gain;
  return gain;
}

module.exports = { createUserState, calculateGain };

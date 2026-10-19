"use strict";

const { detectSpeech } = require("./speech-activity");
const { DEFAULT_SETTINGS } = require("./settings");

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
 * RTP statistics are not samples and cannot provide a true peak limiter.
 * Isolated events may trigger ducking, but never affect the learned average.
 */
function calculateGain(state, level, detected, timestamp, settings = DEFAULT_SETTINGS) {
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
    gain = settings.targetLevel / Math.max(state.ema, 0.006);
  } else if (confirmed && level > 0.18) {
    gain = Math.min(1, 0.18 / level);
  }

  // A short loud spike is still ducked before speech has been confirmed.
  if (active && level > 0.18) gain = Math.min(gain, 0.18 / level);

  gain = Math.max(settings.minGain, Math.min(settings.maxGain, gain));
  if (confirmed) state.stableGain = gain;
  return gain;
}

module.exports = { createUserState, calculateGain };

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
    envelopeAt: null,
    recoveryHoldMs: 0,
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
    // Brief quiet syllables should not immediately erase a recent loud phrase.
    const window = state.ema !== null && level < state.ema ? 6000 : 3000;
    const alpha = 1 - Math.exp(-elapsed / window);
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

  gain = Math.max(settings.minGain, Math.min(settings.maxGain, gain));
  if (settings.mode === "attenuate") gain = Math.min(1, gain);
  if (confirmed) state.stableGain = gain;
  // Keep the peak guard separate from the learned speech target. Otherwise a
  // single peak can become the target again at the start of the next phrase.
  if (active && level > 0.18) gain = Math.max(settings.minGain, Math.min(gain, 0.18 / level));
  return gain;
}

module.exports = { createUserState, calculateGain };

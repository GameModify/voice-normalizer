"use strict";

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
    lastSpeechSampleAt: null,
    talking: false,
  };
}

// This is deliberately the same gain law as version 1.0.7.
// Keep changes to how speech is classified in separate feature branches.
function calculateGain(st, level, detected, timestamp) {
  const talking = (detected === 1 || detected === true) && level >= 0.006;
  st.talking = talking;
  if (talking) {
    // About 3 seconds for a 63% adjustment in speaking-time average.
    // Clamp elapsed time so a long silent pause does not erase the history.
    const time = timestamp;
    const elapsed =
      st.lastSpeechSampleAt === null
        ? 100
        : Math.max(50, Math.min(250, time - st.lastSpeechSampleAt));
    const alpha = 1 - Math.exp(-elapsed / 3000);
    st.ema = st.ema === null ? level : st.ema * (1 - alpha) + level * alpha;
    st.lastSpeechSampleAt = time;
    st.voiceCount++;
  }
  // HOLD the last gain through silence: do not reset to full volume
  // immediately before the speaker starts talking again.
  let gain = talking ? 1 : Number.isFinite(st.lastGain) ? st.lastGain : 1;
  if (talking && st.voiceCount >= 7 && st.ema !== null) {
    gain = Math.max(0.45, Math.min(2.0, 0.095 / Math.max(st.ema, 0.006)));
  } else if (talking && level > 0.18) {
    gain = Math.min(1, 0.18 / level);
  }
  // Fast peak attenuation remains separate from the slow speech average.
  if (talking && level > 0.18) gain = Math.min(gain, 0.18 / level);
  gain = Math.max(0.45, Math.min(2.0, gain));
  return gain;
}

module.exports = { createUserState, calculateGain };

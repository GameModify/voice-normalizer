"use strict";

const RECOVERY_HOLD_MS = 350;
const DEADBAND = Math.log(1.015);

// Smooth Discord's internal volume ratio, not calibrated audio dB. Limit both
// the remaining-distance response and the relative movement per second.
function smoothVolume(state, current, desired, timestamp, settings) {
  let elapsed =
    state.envelopeAt === null ? 100 : Math.max(0, Math.min(250, timestamp - state.envelopeAt));
  state.envelopeAt = timestamp;
  // A pause must not undo ducking, consume the hold, or amplify background noise.
  if (!state.activityPolls) return current;

  const difference = Math.log(desired / current);
  if (Math.abs(difference) <= DEADBAND) return current;
  const reducing = difference < 0;
  if (reducing) {
    state.recoveryHoldMs = RECOVERY_HOLD_MS;
  } else {
    if (!state.talking) return current;
    const held = Math.min(state.recoveryHoldMs, elapsed);
    state.recoveryHoldMs -= held;
    elapsed -= held;
    if (elapsed <= 0) return current;
  }

  const speed = reducing
    ? settings.attack
    : current < 1
      ? Math.max(0.2, settings.release)
      : settings.release;
  const weight = 1 - Math.pow(1 - speed, elapsed / 100);
  const maxStep = (speed * (reducing ? 3 : current < 1 ? 4 : 3) * elapsed) / 1000;
  const step = Math.max(-maxStep, Math.min(maxStep, difference * weight));
  return current * Math.exp(step);
}

module.exports = { smoothVolume };

"use strict";

// All values are multipliers or normalized RTP statistics, NOT Discord slider percentages.
const PRESETS = Object.freeze({
  soft: Object.freeze({
    profile: "soft",
    maxGain: 1.3,
    minGain: 0.65,
    attack: 0.4,
    release: 0.06,
  }),
  balanced: Object.freeze({
    profile: "balanced",
    maxGain: 2,
    minGain: 0.45,
    attack: 0.65,
    release: 0.1,
  }),
  aggressive: Object.freeze({
    profile: "aggressive",
    maxGain: 2,
    minGain: 0.35,
    attack: 0.85,
    release: 0.18,
  }),
});

const DEFAULT_SETTINGS = PRESETS.balanced;
const BOUNDS = Object.freeze({
  maxGain: [1, 2],
  minGain: [0.25, 1],
  attack: [0.2, 0.9],
  release: [0.03, 0.3],
});

function clampNumber(value, [min, max], fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function normalizeSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_SETTINGS };
  }
  const profile = ["soft", "balanced", "aggressive", "custom"].includes(input.profile)
    ? input.profile
    : "custom";

  const result = { profile };
  for (const [key, bounds] of Object.entries(BOUNDS)) {
    result[key] = clampNumber(input[key], bounds, DEFAULT_SETTINGS[key]);
  }
  return result;
}

function getPreset(profile) {
  return normalizeSettings(PRESETS[profile] || PRESETS.balanced);
}

module.exports = { DEFAULT_SETTINGS, PRESETS, BOUNDS, normalizeSettings, getPreset };

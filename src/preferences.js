"use strict";

const PROFILES = ["soft", "balanced", "aggressive"];
const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 32;

function normalizePreferences(input) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const profiles = {};
  if (value.profiles && typeof value.profiles === "object") {
    for (const [id, profile] of Object.entries(value.profiles)) {
      if (
        validId(id) &&
        PROFILES.includes(profile) &&
        !["__proto__", "constructor", "prototype"].includes(id)
      )
        profiles[id] = profile;
    }
  }
  return {
    scope: value.scope === "all" ? "all" : "selected",
    mode: value.mode === "attenuate" ? "attenuate" : "normalize",
    language: ["en", "ru"].includes(value.language) ? value.language : "auto",
    excluded: [...new Set((Array.isArray(value.excluded) ? value.excluded : []).filter(validId))],
    profiles,
  };
}

module.exports = { normalizePreferences, PROFILES };

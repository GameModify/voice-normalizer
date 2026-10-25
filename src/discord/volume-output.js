"use strict";

const validVolume = (value) => Number.isFinite(value) && value >= 0;

// The connection owns playback volume. MediaEngineStore remains the user's
// preference; automatic writes never dispatch AUDIO_SET_LOCAL_VOLUME.
class VolumeOutput {
  constructor(connection, patcher, readPreference) {
    this.connection = connection;
    this.readPreference = readPreference;
    this.entries = new Map();
    this.ownWrite = false;
    this.supported =
      typeof connection?.getLocalVolume === "function" &&
      typeof connection?.setLocalVolume === "function" &&
      typeof readPreference === "function" &&
      typeof patcher?.before === "function";
    if (!this.supported) return;
    try {
      this.unpatch = patcher.before("VoiceNormalizer", connection, "setLocalVolume", (_, args) => {
        const entry = this.entries.get(String(args[0]));
        if (this.ownWrite || !entry || !validVolume(args[1])) return;
        // A native request from Discord is the new uncorrected playback base.
        // Preserve the correction while the actual user preference changes.
        entry.base = args[1];
        entry.applied = args[1] * entry.gain;
        args[1] = entry.applied;
      });
      if (typeof this.unpatch !== "function") this.supported = false;
    } catch (_) {
      this.supported = false;
    }
  }
  prepare(id) {
    id = String(id);
    if (!this.supported) return null;
    let entry = this.entries.get(id);
    if (!entry) {
      let base;
      try {
        // Desktop getLocalVolume returns a ratio (1 at normal volume), while
        // setLocalVolume accepts the same units as MediaEngineStore (100).
        // Never feed the connection getter back into its setter.
        base = this.readPreference(id);
      } catch (_) {
        return null;
      }
      if (!validVolume(base) || base === 0) return null;
      entry = { base, gain: 1, applied: base };
      // Re-establish the saved preference before calibration. A previous
      // plugin instance may have left a temporary playback correction behind.
      this.ownWrite = true;
      try {
        this.connection.setLocalVolume(id, base);
      } finally {
        this.ownWrite = false;
      }
      this.entries.set(id, entry);
    }
    return entry;
  }
  apply(id, gain) {
    const entry = this.prepare(id);
    if (!entry || !Number.isFinite(gain) || gain < 0 || gain > 2) return false;
    const next = entry.base * gain;
    if (!validVolume(next)) return false;
    this.ownWrite = true;
    try {
      this.connection.setLocalVolume(String(id), next);
      entry.gain = gain;
      entry.applied = next;
      return true;
    } finally {
      this.ownWrite = false;
    }
  }
  restore(id, muted = false) {
    const entry = this.entries.get(String(id));
    if (!entry) return;
    this.entries.delete(String(id));
    this.ownWrite = true;
    try {
      this.connection.setLocalVolume(String(id), muted ? 0 : entry.base);
    } finally {
      this.ownWrite = false;
    }
  }
  dispose() {
    for (const id of [...this.entries.keys()]) {
      try {
        this.restore(id);
      } catch (_) {}
    }
    this.unpatch?.();
    this.supported = false;
  }
}

module.exports = { VolumeOutput };

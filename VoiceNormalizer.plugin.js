/**
 * @name VoiceNormalizer
 * @author -$erent*-
 * @authorLink https://github.com/GameModify
 * @version 1.3.0-beta.4
 * @description Adaptive voice leveling for selected users or everyone. Profiles, reduce-only mode, and English/Russian controls (beta).
 */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/audio/speech-activity.js
var require_speech_activity = __commonJS({
  "src/audio/speech-activity.js"(exports2, module2) {
    "use strict";
    var MIN_ACTIVITY_LEVEL = 8e-3;
    var REQUIRED_ACTIVE_POLLS = 3;
    function detectSpeech(state, level, detected) {
      const active = (detected === true || detected === 1) && level >= MIN_ACTIVITY_LEVEL;
      state.activityPolls = active ? Math.min(REQUIRED_ACTIVE_POLLS, state.activityPolls + 1) : 0;
      const confirmed = active && state.activityPolls >= REQUIRED_ACTIVE_POLLS;
      state.talking = confirmed;
      return { active, confirmed };
    }
    module2.exports = { detectSpeech, MIN_ACTIVITY_LEVEL, REQUIRED_ACTIVE_POLLS };
  }
});

// src/audio/settings.js
var require_settings = __commonJS({
  "src/audio/settings.js"(exports2, module2) {
    "use strict";
    var PRESETS = Object.freeze({
      soft: Object.freeze({
        profile: "soft",
        targetLevel: 0.095,
        maxGain: 1.3,
        minGain: 0.65,
        attack: 0.4,
        release: 0.06
      }),
      balanced: Object.freeze({
        profile: "balanced",
        targetLevel: 0.095,
        maxGain: 2,
        minGain: 0.45,
        attack: 0.65,
        release: 0.1
      }),
      aggressive: Object.freeze({
        profile: "aggressive",
        targetLevel: 0.105,
        maxGain: 2,
        minGain: 0.35,
        attack: 0.85,
        release: 0.18
      })
    });
    var DEFAULT_SETTINGS2 = PRESETS.balanced;
    var BOUNDS = Object.freeze({
      targetLevel: [0.04, 0.25],
      maxGain: [1, 2],
      minGain: [0.25, 1],
      attack: [0.2, 0.9],
      release: [0.03, 0.3]
    });
    function clampNumber(value, [min, max], fallback) {
      return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
    }
    function normalizeSettings2(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { ...DEFAULT_SETTINGS2 };
      }
      const profile = ["soft", "balanced", "aggressive", "custom"].includes(input.profile) ? input.profile : "custom";
      const result = { profile };
      for (const [key, bounds] of Object.entries(BOUNDS)) {
        result[key] = clampNumber(input[key], bounds, DEFAULT_SETTINGS2[key]);
      }
      return result;
    }
    function getPreset2(profile) {
      return normalizeSettings2(PRESETS[profile] || PRESETS.balanced);
    }
    module2.exports = { DEFAULT_SETTINGS: DEFAULT_SETTINGS2, PRESETS, BOUNDS, normalizeSettings: normalizeSettings2, getPreset: getPreset2 };
  }
});

// src/audio/leveler.js
var require_leveler = __commonJS({
  "src/audio/leveler.js"(exports2, module2) {
    "use strict";
    var { detectSpeech } = require_speech_activity();
    var { DEFAULT_SETTINGS: DEFAULT_SETTINGS2 } = require_settings();
    function createUserState2(base) {
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
        talking: false
      };
    }
    function calculateGain2(state, level, detected, timestamp, settings = DEFAULT_SETTINGS2) {
      const { active, confirmed } = detectSpeech(state, level, detected);
      if (confirmed) {
        const elapsed = state.lastSpeechSampleAt === null ? 100 : Math.max(50, Math.min(250, timestamp - state.lastSpeechSampleAt));
        const alpha = 1 - Math.exp(-elapsed / 3e3);
        state.ema = state.ema === null ? level : state.ema * (1 - alpha) + level * alpha;
        state.lastSpeechSampleAt = timestamp;
        state.voiceCount++;
      }
      let gain = state.stableGain;
      if (confirmed && state.voiceCount >= 7 && state.ema !== null) {
        gain = settings.targetLevel / Math.max(state.ema, 6e-3);
      } else if (confirmed && level > 0.18) {
        gain = Math.min(1, 0.18 / level);
      }
      if (active && level > 0.18) gain = Math.min(gain, 0.18 / level);
      gain = Math.max(settings.minGain, Math.min(settings.maxGain, gain));
      if (settings.mode === "attenuate") gain = Math.min(1, gain);
      if (confirmed) state.stableGain = gain;
      return gain;
    }
    module2.exports = { createUserState: createUserState2, calculateGain: calculateGain2 };
  }
});

// src/preferences.js
var require_preferences = __commonJS({
  "src/preferences.js"(exports2, module2) {
    "use strict";
    var PROFILES = ["soft", "balanced", "aggressive"];
    var validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 32;
    function normalizePreferences2(input) {
      const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
      const profiles = {};
      if (value.profiles && typeof value.profiles === "object") {
        for (const [id, profile] of Object.entries(value.profiles)) {
          if (validId(id) && PROFILES.includes(profile) && !["__proto__", "constructor", "prototype"].includes(id))
            profiles[id] = profile;
        }
      }
      return {
        scope: value.scope === "all" ? "all" : "selected",
        mode: value.mode === "attenuate" ? "attenuate" : "normalize",
        language: ["en", "ru"].includes(value.language) ? value.language : "auto",
        excluded: [...new Set((Array.isArray(value.excluded) ? value.excluded : []).filter(validId))],
        profiles
      };
    }
    module2.exports = { normalizePreferences: normalizePreferences2, PROFILES };
  }
});

// src/i18n.js
var require_i18n = __commonJS({
  "src/i18n.js"(exports2, module2) {
    "use strict";
    var en = {
      ready: "VoiceNormalizer: right-click a user to control voice leveling",
      off: "Off",
      waitingChannel: "Waiting for a voice channel",
      waitingUser: "Waiting for this user",
      waitingSpeech: "Waiting for speech",
      learning: "Learning average voice level",
      active: "Voice leveling active",
      muted: "Muted in Discord",
      unavailable: "Waiting for voice data",
      writerWaiting: "Waiting for Discord volume controls",
      noData: "No data yet",
      none: "None",
      unknown: "Not checked",
      participant: "Participant",
      error: "Error: {0}",
      saveError: "Could not save preferences: {0}",
      loadError: "Could not load preferences: {0}",
      toggle: "Level this user's voice",
      profile: "Profile",
      globalProfile: "Default profile",
      inherit: "Use default",
      soft: "Soft",
      balanced: "Balanced",
      aggressive: "Aggressive",
      custom: "Custom",
      reset: "Reset learning",
      resetDone: "Voice learning reset",
      settingsTitle: "VoiceNormalizer \xB7 {0}",
      help: "Uses each person's Discord volume as the baseline. Choices are saved; voice levels are learned again after reconnecting.",
      scope: "Who to process",
      selected: "Selected people",
      all: "Everyone in the voice channel",
      scopeNote: "Everyone includes people who join later. You can still exclude individual users.",
      mode: "Voice leveling",
      normalize: "Boost quiet \xB7 reduce loud",
      attenuate: "Only reduce loud voices",
      modeNote: "Only reduce never raises volume above the person's Discord baseline.",
      language: "Language",
      auto: "Discord language",
      addPeople: "Channel participants",
      managedPeople: "Selected people",
      individualSettings: "Individual settings",
      listCount: "{0} \xB7 {1}",
      managedCount: "{0} \xB7 {1} enabled / {2}",
      excludedPeople: "Excluded from everyone mode",
      noPeople: "Join a voice channel to see participants.",
      noSelected: "No people selected yet.",
      noExcluded: "No exclusions.",
      allSelected: "Everyone in this channel is already enabled.",
      enable: "Enable",
      disable: "Disable",
      enabled: "Enabled",
      excluded: "Excluded",
      stopAll: "Disable for everyone",
      advanced: "Advanced",
      advancedNote: "RTP is relative audio statistics, not Discord slider percentage or LUFS. This is not an instant audio limiter.",
      targetLevel: "Target RTP level",
      maxGain: "Maximum boost",
      minGain: "Minimum gain",
      attack: "Volume reduction speed",
      release: "Volume increase speed",
      perPoll: "per poll",
      baseline: "of baseline",
      correction: "Volume: {0}% of baseline",
      diagnostics: "Diagnostics",
      test: "Test \xD70.5",
      testBusy: "Disable voice leveling before running the volume test",
      noWriter: "Discord volume controls are unavailable",
      noVolume: "Could not read this user's volume",
      testStarted: "Half-volume test: 3 seconds",
      testResult: "Half-volume test: {0}",
      confirmed: "confirmed",
      unconfirmed: "not confirmed",
      volumeError: "Volume write failed: {0}",
      manualBase: "Manual volume changed \xB7 using new baseline",
      meter: "VoiceNormalizer voice status",
      profileNote: "Quick presets. Detailed controls are under Advanced.",
      profileFor: "Profile for this person",
      settingsSaved: "Settings saved"
    };
    var ru = {
      ready: "VoiceNormalizer: \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 \u041F\u041A\u041C \u043F\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0443",
      off: "\u0412\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
      waitingChannel: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u043A\u0430\u043D\u0430\u043B",
      waitingUser: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430",
      waitingSpeech: "\u0416\u0434\u0451\u043C \u0440\u0435\u0447\u044C",
      learning: "\u041E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u043C \u0441\u0440\u0435\u0434\u043D\u044E\u044E \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C",
      active: "\u0412\u044B\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u043D\u0438\u0435 \u0430\u043A\u0442\u0438\u0432\u043D\u043E",
      muted: "\u0413\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u0432 Discord \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430",
      unavailable: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435",
      writerWaiting: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C\u044E Discord",
      noData: "\u0415\u0449\u0451 \u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445",
      none: "\u041D\u0435\u0442",
      unknown: "\u041D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D",
      participant: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A",
      error: "\u041E\u0448\u0438\u0431\u043A\u0430: {0}",
      saveError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: {0}",
      loadError: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: {0}",
      toggle: "\u0412\u044B\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0442\u044C \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u0433\u043E\u043B\u043E\u0441\u0430",
      profile: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C",
      globalProfile: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E",
      inherit: "\u041A\u0430\u043A \u0443 \u0432\u0441\u0435\u0445",
      soft: "\u041C\u044F\u0433\u043A\u0438\u0439",
      balanced: "\u0411\u0430\u043B\u0430\u043D\u0441",
      aggressive: "\u0410\u0433\u0440\u0435\u0441\u0441\u0438\u0432\u043D\u044B\u0439",
      custom: "\u041C\u043E\u0439",
      reset: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043E\u0431\u0443\u0447\u0435\u043D\u0438\u0435",
      resetDone: "\u041E\u0431\u0443\u0447\u0435\u043D\u0438\u0435 \u0433\u043E\u043B\u043E\u0441\u0430 \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u043E",
      settingsTitle: "VoiceNormalizer \xB7 {0}",
      help: "\u0417\u0430 \u043E\u0441\u043D\u043E\u0432\u0443 \u0431\u0435\u0440\u0451\u0442\u0441\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u043A\u0430\u0436\u0434\u043E\u0433\u043E \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0432 Discord. \u0412\u044B\u0431\u043E\u0440 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F; \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0443\u0440\u043E\u0432\u0435\u043D\u044C \u0440\u0435\u0447\u0438 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u044F\u0435\u0442\u0441\u044F \u0437\u0430\u043D\u043E\u0432\u043E.",
      scope: "\u041A\u043E\u0433\u043E \u043E\u0431\u0440\u0430\u0431\u0430\u0442\u044B\u0432\u0430\u0442\u044C",
      selected: "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 \u043B\u044E\u0434\u0435\u0439",
      all: "\u0412\u0441\u0435\u0445 \u0432 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u043C \u043A\u0430\u043D\u0430\u043B\u0435",
      scopeNote: "\u0420\u0435\u0436\u0438\u043C \u0434\u043B\u044F \u0432\u0441\u0435\u0445 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 \u0438 \u043D\u0430 \u043D\u043E\u0432\u044B\u0445 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432. \u041E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u0445 \u043B\u044E\u0434\u0435\u0439 \u043C\u043E\u0436\u043D\u043E \u0438\u0441\u043A\u043B\u044E\u0447\u0438\u0442\u044C.",
      mode: "\u0412\u044B\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u043D\u0438\u0435 \u0433\u043E\u043B\u043E\u0441\u0430",
      normalize: "\u0423\u0441\u0438\u043B\u0438\u0432\u0430\u0442\u044C \u0442\u0438\u0445\u043E\u0435 \xB7 \u043F\u0440\u0438\u0433\u043B\u0443\u0448\u0430\u0442\u044C \u0433\u0440\u043E\u043C\u043A\u043E\u0435",
      attenuate: "\u0422\u043E\u043B\u044C\u043A\u043E \u043F\u0440\u0438\u0433\u043B\u0443\u0448\u0430\u0442\u044C \u0433\u0440\u043E\u043C\u043A\u043E\u0435",
      modeNote: "\u0412 \u0440\u0435\u0436\u0438\u043C\u0435 \u043F\u0440\u0438\u0433\u043B\u0443\u0448\u0435\u043D\u0438\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u043D\u0435 \u043F\u043E\u0434\u043D\u0438\u043C\u0430\u0435\u0442\u0441\u044F \u0432\u044B\u0448\u0435 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u0430 \u0432 Discord.",
      language: "\u042F\u0437\u044B\u043A",
      auto: "\u041A\u0430\u043A \u0432 Discord",
      addPeople: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043A\u0430\u043D\u0430\u043B\u0430",
      managedPeople: "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438",
      individualSettings: "\u0418\u043D\u0434\u0438\u0432\u0438\u0434\u0443\u0430\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
      listCount: "{0} \xB7 {1}",
      managedCount: "{0} \xB7 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u043E {1} \u0438\u0437 {2}",
      excludedPeople: "\u0418\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u0438\u0437 \u0440\u0435\u0436\u0438\u043C\u0430 \u0434\u043B\u044F \u0432\u0441\u0435\u0445",
      noPeople: "\u0412\u043E\u0439\u0434\u0438\u0442\u0435 \u0432 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u043A\u0430\u043D\u0430\u043B, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432.",
      noSelected: "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u044B.",
      noExcluded: "\u0418\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0439 \u043D\u0435\u0442.",
      allSelected: "\u0412\u0441\u0435 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u044D\u0442\u043E\u0433\u043E \u043A\u0430\u043D\u0430\u043B\u0430 \u0443\u0436\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B.",
      enable: "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C",
      disable: "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C",
      enabled: "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u043E",
      excluded: "\u0418\u0441\u043A\u043B\u044E\u0447\u0451\u043D",
      stopAll: "\u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445",
      advanced: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E",
      advancedNote: "RTP \u2014 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0430\u0443\u0434\u0438\u043E, \u0430 \u043D\u0435 \u043F\u0440\u043E\u0446\u0435\u043D\u0442\u044B \u043F\u043E\u043B\u0437\u0443\u043D\u043A\u0430 Discord \u0438\u043B\u0438 LUFS. \u042D\u0442\u043E \u043D\u0435 \u043C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u044B\u0439 \u0430\u0443\u0434\u0438\u043E\u043B\u0438\u043C\u0438\u0442\u0435\u0440.",
      targetLevel: "\u0426\u0435\u043B\u0435\u0432\u043E\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C RTP",
      maxGain: "\u041C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0435 \u0443\u0441\u0438\u043B\u0435\u043D\u0438\u0435",
      minGain: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u043E\u044D\u0444\u0444\u0438\u0446\u0438\u0435\u043D\u0442 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438",
      attack: "\u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u043F\u0440\u0438\u0433\u043B\u0443\u0448\u0435\u043D\u0438\u044F",
      release: "\u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u043F\u043E\u0432\u044B\u0448\u0435\u043D\u0438\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438",
      perPoll: "\u0437\u0430 \u043E\u043F\u0440\u043E\u0441",
      baseline: "\u043E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439",
      correction: "\u0413\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C: {0}% \u043E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439",
      diagnostics: "\u0414\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u043A\u0430",
      test: "\u0422\u0435\u0441\u0442 \xD70.5",
      testBusy: "\u041F\u0435\u0440\u0435\u0434 \u0440\u0443\u0447\u043D\u044B\u043C \u0442\u0435\u0441\u0442\u043E\u043C \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0432\u044B\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u043D\u0438\u0435",
      noWriter: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C\u044E Discord \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E",
      noVolume: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430",
      testStarted: "\u0422\u0435\u0441\u0442 \u043F\u043E\u043B\u043E\u0432\u0438\u043D\u043D\u043E\u0439 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438: 3 \u0441\u0435\u043A\u0443\u043D\u0434\u044B",
      testResult: "\u0422\u0435\u0441\u0442 \u043F\u043E\u043B\u043E\u0432\u0438\u043D\u043D\u043E\u0439 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438: {0}",
      confirmed: "\u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D",
      unconfirmed: "\u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D",
      volumeError: "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u0438 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438: {0}",
      manualBase: "\u0413\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430 \u0432\u0440\u0443\u0447\u043D\u0443\u044E \xB7 \u043F\u0440\u0438\u043D\u044F\u0442\u0430 \u043D\u043E\u0432\u0430\u044F \u0431\u0430\u0437\u0430",
      meter: "VoiceNormalizer: \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0433\u043E\u043B\u043E\u0441\u0430",
      profileNote: "\u0411\u044B\u0441\u0442\u0440\u044B\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u0438. \u0422\u043E\u0447\u043D\u044B\u0435 \u043F\u0430\u0440\u0430\u043C\u0435\u0442\u0440\u044B \u043D\u0430\u0445\u043E\u0434\u044F\u0442\u0441\u044F \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \xAB\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\xBB.",
      profileFor: "\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u044D\u0442\u043E\u0433\u043E \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430",
      settingsSaved: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B"
    };
    function languageFor2(preference, discordLocale) {
      if (["ru", "en"].includes(preference)) return preference;
      return String(discordLocale || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
    }
    function translate2(language, key, ...values) {
      const template = (language === "ru" ? ru : en)[key] ?? en[key] ?? key;
      return template.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ""));
    }
    module2.exports = { en, ru, languageFor: languageFor2, translate: translate2 };
  }
});

// package.json
var require_package = __commonJS({
  "package.json"(exports2, module2) {
    module2.exports = {
      name: "voice-normalizer",
      version: "1.3.0-beta.4",
      private: true,
      description: "Adaptive voice leveler for BetterDiscord",
      scripts: {
        build: "node scripts/build.cjs",
        check: "node scripts/build.cjs --check && eslint src scripts && prettier --check src scripts tests eslint.config.js package.json",
        format: "prettier --write src scripts tests eslint.config.js package.json",
        test: "node --test tests/*.test.cjs"
      },
      devDependencies: {
        "@eslint/js": "^10.0.1",
        esbuild: "^0.28.2",
        eslint: "^10.13.0",
        prettier: "^3.9.10"
      }
    };
  }
});

// src/ui/dom.js
var require_dom = __commonJS({
  "src/ui/dom.js"(exports2, module2) {
    "use strict";
    function element(doc, tag, text = "", style = "") {
      const node = doc.createElement(tag);
      node.textContent = text;
      node.style.cssText = style;
      return node;
    }
    function button(doc, text, action) {
      const node = element(
        doc,
        "button",
        text,
        "padding:7px 10px;border-radius:6px;border:1px solid var(--background-modifier-accent);background:var(--background-secondary);color:var(--text-normal);cursor:pointer;font:inherit;font-size:12px"
      );
      node.type = "button";
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        action();
      });
      return node;
    }
    function choices(doc, options, value, onChange, label) {
      const root = element(doc, "div", "", "display:flex;gap:6px;flex-wrap:wrap");
      root.setAttribute("role", "radiogroup");
      root.setAttribute("aria-label", label);
      const buttons = options.map(([key, text]) => {
        const node = button(doc, text, () => onChange(key));
        node.dataset.value = key;
        node.setAttribute("role", "radio");
        node.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          const index = options.findIndex(([option]) => option === key);
          const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
          buttons[next][1].focus();
          onChange(options[next][0]);
        });
        root.append(node);
        return [key, node];
      });
      const update = (selected) => {
        for (const [key, node] of buttons) {
          node.setAttribute("aria-checked", String(selected === key));
          node.style.background = selected === key ? "var(--brand-500,#5865f2)" : "var(--background-secondary)";
          node.style.color = selected === key ? "white" : "var(--text-normal)";
        }
      };
      update(value);
      return { element: root, update };
    }
    module2.exports = { element, button, choices };
  }
});

// src/ui/settings-controls.js
var require_settings_controls = __commonJS({
  "src/ui/settings-controls.js"(exports2, module2) {
    "use strict";
    var { getPreset: getPreset2 } = require_settings();
    var { translate: translate2 } = require_i18n();
    var { element, choices } = require_dom();
    var FIELDS = [
      ["targetLevel", 0.04, 0.25, 5e-3],
      ["maxGain", 1, 2, 0.05],
      ["minGain", 0.25, 1, 0.05],
      ["attack", 0.2, 0.9, 0.05],
      ["release", 0.03, 0.3, 0.01]
    ];
    function createSettingsControls(doc, initial, updateSettings, t = (key, ...values) => translate2("en", key, ...values)) {
      let current = { ...initial };
      const section = element(doc, "section", "", "display:flex;flex-direction:column;gap:8px");
      section.append(element(doc, "h3", t("globalProfile"), "margin:0;font-size:14px"));
      const presets = choices(
        doc,
        ["soft", "balanced", "aggressive", "custom"].map((key) => [key, t(key)]),
        current.profile,
        (profile) => {
          const next = profile === "custom" ? { ...current, profile } : getPreset2(profile);
          refresh(updateSettings(next));
        },
        t("globalProfile")
      );
      section.append(presets.element, element(doc, "small", t("profileNote")));
      const advanced = element(
        doc,
        "details",
        "",
        "padding:10px;border:1px solid var(--background-modifier-accent);border-radius:8px"
      );
      advanced.append(element(doc, "summary", t("advanced"), "cursor:pointer;font-weight:600"));
      const body = element(
        doc,
        "div",
        "",
        "display:flex;flex-direction:column;gap:12px;padding-top:10px"
      );
      body.append(element(doc, "small", t("advancedNote")));
      advanced.append(body);
      section.append(advanced);
      const sliders = [];
      for (const [key, min, max, step] of FIELDS) {
        const row = element(doc, "label", "", "display:flex;flex-direction:column;gap:6px");
        const output = element(doc, "span");
        const slider = element(doc, "input");
        slider.type = "range";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.dataset.setting = key;
        slider.setAttribute("aria-label", t(key));
        slider.addEventListener("input", () => {
          refresh(updateSettings({ ...current, [key]: Number(slider.value), profile: "custom" }));
        });
        row.append(output, slider);
        body.append(row);
        sliders.push({ key, slider, output });
      }
      function refresh(next = current) {
        current = { ...next };
        presets.update(current.profile);
        for (const { key, slider, output } of sliders) {
          if (doc.activeElement !== slider) slider.value = String(current[key]);
          const value = current[key];
          const suffix = ["attack", "release"].includes(key) ? t("perPoll") : key === "targetLevel" ? "RTP" : t("baseline");
          output.textContent = `${t(key)}: ${(value * 100).toFixed(key === "targetLevel" ? 1 : 0)}% ${suffix}`;
        }
      }
      section.refresh = refresh;
      section.advanced = advanced;
      refresh();
      return section;
    }
    module2.exports = { createSettingsControls };
  }
});

// src/ui/settings-panel.js
var require_settings_panel = __commonJS({
  "src/ui/settings-panel.js"(exports2, module2) {
    "use strict";
    var { version } = require_package();
    var { element, button, choices } = require_dom();
    var { createSettingsControls } = require_settings_controls();
    function createSettingsPanel2(plugin, doc) {
      const root = element(
        doc,
        "div",
        "",
        "padding:16px;display:flex;flex-direction:column;gap:16px;color:var(--text-normal)"
      );
      root.addEventListener("click", (event) => event.stopPropagation());
      root.addEventListener("pointerdown", (event) => event.stopPropagation());
      const t = (...args) => plugin.t(...args);
      const managedIds = /* @__PURE__ */ new Set([...plugin.targets, ...plugin.preferences.excluded]);
      let language;
      let refreshView;
      const disclosures = /* @__PURE__ */ new Map();
      const openStates = /* @__PURE__ */ new Map();
      const remember = (key, node) => {
        disclosures.set(key, node);
        node.open = openStates.get(key) || false;
      };
      const build = () => {
        language = plugin.language();
        for (const [key, node] of disclosures) openStates.set(key, node.open);
        disclosures.clear();
        root.replaceChildren();
        const section = (key) => {
          const node = element(doc, "section", "", "display:flex;flex-direction:column;gap:8px");
          node.append(element(doc, "h3", t(key), "margin:0;font-size:14px"));
          root.append(node);
          return node;
        };
        const disclosure = (key, label) => {
          const node = element(
            doc,
            "details",
            "",
            "padding:12px;border:1px solid var(--background-modifier-accent);border-radius:8px"
          );
          node.dataset.section = key;
          const summary = element(
            doc,
            "summary",
            label,
            "cursor:pointer;font-weight:600;font-size:14px"
          );
          const body = element(
            doc,
            "div",
            "",
            "display:flex;flex-direction:column;gap:8px;padding-top:12px"
          );
          node.append(summary, body);
          remember(key, node);
          return { root: node, summary, body };
        };
        root.append(element(doc, "h2", t("settingsTitle", version), "margin:0;font-size:18px"));
        root.append(
          element(
            doc,
            "p",
            t("help"),
            "margin:0;line-height:1.5;color:var(--text-muted);font-size:13px"
          )
        );
        const languageSection = section("language");
        const languageControl = choices(
          doc,
          [
            ["auto", t("auto")],
            ["ru", "\u0420\u0443\u0441\u0441\u043A\u0438\u0439"],
            ["en", "English"]
          ],
          plugin.preferences.language,
          (value) => plugin.updatePreferences({ language: value }),
          t("language")
        );
        languageSection.append(languageControl.element);
        const scopeSection = section("scope");
        const scope = choices(
          doc,
          [
            ["selected", t("selected")],
            ["all", t("all")]
          ],
          plugin.preferences.scope,
          (value) => plugin.updatePreferences({ scope: value }),
          t("scope")
        );
        scopeSection.append(scope.element, element(doc, "small", t("scopeNote")));
        const modeSection = section("mode");
        const mode = choices(
          doc,
          [
            ["normalize", t("normalize")],
            ["attenuate", t("attenuate")]
          ],
          plugin.preferences.mode,
          (value) => plugin.updatePreferences({ mode: value }),
          t("mode")
        );
        modeSection.append(mode.element, element(doc, "small", t("modeNote")));
        const controls = createSettingsControls(
          doc,
          plugin.settings,
          (next) => plugin.updateSettings(next),
          t
        );
        root.append(controls);
        const availableSection = disclosure("addPeople", t("addPeople"));
        root.append(availableSection.root);
        const available = availableSection.body;
        const availableEmpty = element(doc, "small", t("noPeople"));
        available.append(availableEmpty);
        const availableRows = /* @__PURE__ */ new Map();
        const managedSection = disclosure("managedPeople", t("managedPeople"));
        root.append(managedSection.root);
        const managed = managedSection.body;
        const managedEmpty = element(doc, "small", t("noSelected"));
        managed.append(managedEmpty);
        const cards = /* @__PURE__ */ new Map();
        const advanced = controls.advanced;
        root.append(advanced);
        advanced.dataset.section = "advanced";
        remember("advanced", advanced);
        advanced.append(languageSection);
        const diagnostics = element(
          doc,
          "pre",
          "",
          "white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;padding:10px;background:var(--background-secondary);border-radius:6px"
        );
        const tests = element(doc, "div", "", "display:flex;flex-direction:column;gap:6px");
        const testRows = /* @__PURE__ */ new Map();
        advanced.append(tests);
        advanced.append(element(doc, "strong", t("diagnostics")), diagnostics);
        const allOff = button(doc, t("stopAll"), () => plugin.turnOff());
        advanced.append(allOff);
        refreshView = () => {
          languageControl.update(plugin.preferences.language);
          scope.update(plugin.preferences.scope);
          mode.update(plugin.preferences.mode);
          controls.refresh(plugin.settings);
          const roster = plugin.participants();
          const names = new Map(roster.map((person) => [person.id, person.name]));
          const currentIds = new Set(roster.map((person) => person.id));
          availableEmpty.style.display = roster.length ? "none" : "";
          for (const [id, row] of availableRows) {
            if (!currentIds.has(id)) {
              row.root.remove();
              availableRows.delete(id);
            }
          }
          for (const [id, row] of testRows) {
            if (!currentIds.has(id)) {
              row.root.remove();
              testRows.delete(id);
            }
          }
          for (const person of roster) {
            let testRow = testRows.get(person.id);
            if (!testRow) {
              const node = element(doc, "div", "", "display:flex;gap:8px;align-items:center");
              const name = element(doc, "span", "", "flex:1");
              const test = button(
                doc,
                t("test"),
                () => plugin.halfVolumeTest(person.id).then(() => plugin.refreshPanels())
              );
              node.append(name, test);
              tests.append(node);
              testRow = { root: node, name, test };
              testRows.set(person.id, testRow);
            }
            testRow.name.textContent = person.name;
            testRow.test.disabled = plugin.enabled || plugin.testRunning;
            let row = availableRows.get(person.id);
            if (!row) {
              const node = element(
                doc,
                "div",
                "",
                "display:flex;gap:8px;align-items:center;padding:8px;border-radius:6px;background:var(--background-secondary)"
              );
              node.dataset.userId = person.id;
              const name = element(doc, "span", "", "flex:1");
              const enable = button(
                doc,
                t("enable"),
                () => plugin.select(person.id, !plugin.isSelected(person.id))
              );
              node.append(name, enable);
              available.append(node);
              row = { root: node, name, enable };
              availableRows.set(person.id, row);
            }
            row.name.textContent = person.name;
            const selected = plugin.isSelected(person.id);
            row.enable.disabled = false;
            row.enable.textContent = t(selected ? "disable" : "enable");
            row.enable.setAttribute("aria-pressed", String(selected));
            if (plugin.isSelected(person.id)) managedIds.add(person.id);
          }
          for (const id of [...plugin.targets, ...plugin.preferences.excluded]) managedIds.add(id);
          managedEmpty.style.display = managedIds.size ? "none" : "";
          for (const id of managedIds) {
            let card = cards.get(id);
            if (!card) {
              const node = element(
                doc,
                "div",
                "",
                "padding:12px;border:1px solid var(--background-modifier-accent);border-radius:8px;display:flex;flex-direction:column;gap:8px"
              );
              node.dataset.userId = id;
              const name = element(doc, "strong");
              const status = element(doc, "div", "", "font-size:13px;color:var(--text-muted)");
              status.setAttribute("role", "status");
              const detail = element(doc, "small");
              const profile = choices(
                doc,
                ["inherit", "soft", "balanced", "aggressive"].map((key) => [key, t(key)]),
                plugin.profileFor(id),
                (value) => plugin.setUserProfile(id, value),
                t("profileFor")
              );
              const actions = element(doc, "div", "", "display:flex;gap:6px;flex-wrap:wrap");
              const toggle = button(doc, "", () => plugin.select(id, !plugin.isSelected(id)));
              const reset = button(doc, t("reset"), () => plugin.resetLearning(id));
              const heading = element(
                doc,
                "div",
                "",
                "display:flex;gap:8px;align-items:center;justify-content:space-between"
              );
              heading.append(name, toggle);
              const individual = disclosure(`user:${id}`, t("individualSettings"));
              actions.append(reset);
              individual.body.append(profile.element, actions);
              node.append(heading, status, detail, individual.root);
              managed.append(node);
              card = { root: node, name, status, detail, profile, toggle, reset };
              cards.set(id, card);
            }
            const user = BdApi.Webpack.getStore("UserStore")?.getUser?.(id);
            card.name.textContent = names.get(id) || user?.globalName || user?.username || id;
            const selected = plugin.isSelected(id);
            card.status.textContent = t(plugin.userStatus(id, roster));
            card.detail.textContent = selected && plugin.states.has(id) ? t("correction", (plugin.getLiveSnapshot(id).ratio * 100).toFixed(0)) : "";
            card.profile.update(plugin.profileFor(id));
            card.toggle.textContent = t(selected ? "disable" : "enable");
            card.toggle.setAttribute("aria-pressed", String(selected));
            card.reset.disabled = !plugin.states.has(id);
          }
          availableSection.summary.textContent = t("listCount", t("addPeople"), roster.length);
          managedSection.summary.textContent = t(
            "managedCount",
            t("managedPeople"),
            [...managedIds].filter((id) => plugin.isSelected(id)).length,
            managedIds.size
          );
          diagnostics.textContent = [
            plugin.status,
            plugin.writerInfo,
            `scope=${plugin.preferences.scope}, mode=${plugin.preferences.mode}, selected=${plugin.targets.size}`,
            JSON.stringify(plugin.diagnostic, null, 2),
            plugin.mappingDebug,
            plugin.lastWriteError
          ].join("\n");
        };
      };
      const refresh = () => {
        if (language !== plugin.language()) build();
        refreshView();
      };
      build();
      refresh();
      plugin.panelRefreshers.add(refresh);
      const timer = setInterval(() => {
        if (!root.isConnected) {
          clearInterval(timer);
          plugin.panels.delete(timer);
          plugin.panelRefreshers.delete(refresh);
          return;
        }
        refresh();
      }, 400);
      plugin.panels.add(timer);
      return root;
    }
    module2.exports = { createSettingsPanel: createSettingsPanel2 };
  }
});

// src/discord/stats-request.js
var require_stats_request = __commonJS({
  "src/discord/stats-request.js"(exports2, module2) {
    "use strict";
    function createStatsRequest2(connection, timeoutMs = 2e3) {
      let cancel;
      const promise = new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          callback(value);
        };
        const timer = setTimeout(
          () => finish(reject, new Error("Voice statistics timed out")),
          timeoutMs
        );
        cancel = () => finish(resolve, null);
        try {
          Promise.resolve(connection.getStats()).then(
            (data) => finish(resolve, data),
            (error) => finish(reject, error)
          );
        } catch (error) {
          finish(reject, error);
        }
      });
      return { promise, cancel: () => cancel() };
    }
    module2.exports = { createStatsRequest: createStatsRequest2 };
  }
});

// src/index.js
var { createUserState, calculateGain } = require_leveler();
var { DEFAULT_SETTINGS, normalizeSettings, getPreset } = require_settings();
var { normalizePreferences } = require_preferences();
var { languageFor, translate } = require_i18n();
var { createSettingsPanel } = require_settings_panel();
var { createStatsRequest } = require_stats_request();
module.exports = class VoiceNormalizer {
  constructor() {
    this.targets = /* @__PURE__ */ new Set();
    this.states = /* @__PURE__ */ new Map();
    this.enabled = false;
    this.started = false;
    this.timer = null;
    this.pendingStats = null;
    this.generation = 0;
    this.connection = null;
    this.writer = null;
    this.writerInfo = "Not checked";
    this.unpatches = [];
    this.panels = /* @__PURE__ */ new Set();
    this.status = "Off";
    this.diagnostic = {
      polls: 0,
      packets: 0,
      mapped: 0,
      writes: 0,
      confirmed: 0,
      failures: 0,
      latest: "\u2014"
    };
    this.testRunning = false;
    this.testBaseline = null;
    this.maxInternalVolume = 200;
    this.settings = { ...DEFAULT_SETTINGS };
    this.preferences = normalizePreferences();
    this.panelRefreshers = /* @__PURE__ */ new Set();
    this.mappingDebug = "No data yet";
    this.lastWriteError = "None";
  }
  start() {
    if (this.started) return;
    this.started = true;
    this.loadSettings();
    this.loadTargets();
    this.loadPreferences();
    this.resolveWriter();
    this.installMenus();
    this.resume();
    BdApi.UI.showToast(this.t("ready"), { type: "info" });
  }
  stop() {
    this.started = false;
    this.cancelTest?.();
    this.suspend();
    for (const unpatch of this.unpatches) {
      try {
        unpatch();
      } catch (_) {
      }
    }
    this.unpatches = [];
    for (const t of this.panels) clearInterval(t);
    this.panels.clear();
    this.panelRefreshers.clear();
    this.mediaProvider = null;
  }
  language() {
    let locale;
    try {
      const store = BdApi.Webpack.getStore("LocaleStore");
      locale = store?.locale ?? store?.getLocale?.();
    } catch (_) {
    }
    return languageFor(this.preferences.language, locale);
  }
  t(key, ...values) {
    return translate(this.language(), key, ...values);
  }
  refreshPanels() {
    for (const refresh of this.panelRefreshers) refresh();
  }
  loadPreferences() {
    try {
      this.preferences = normalizePreferences(BdApi.Data?.load?.("VoiceNormalizer", "preferences"));
    } catch (error) {
      this.toast(this.t("loadError", String(error?.message || error)), "error");
    }
  }
  updatePreferences(patch) {
    this.preferences = normalizePreferences({ ...this.preferences, ...patch });
    try {
      BdApi.Data.save("VoiceNormalizer", "preferences", this.preferences);
    } catch (error) {
      this.toast(this.t("saveError", String(error?.message || error)), "error");
    }
    for (const id of [...this.states.keys()]) {
      if (!this.isSelected(id)) this.restore(id);
    }
    if (this.preferences.scope === "all" || this.targets.size) this.resume();
    else this.suspend();
    this.refreshPanels();
    return this.preferences;
  }
  isSelected(id) {
    id = String(id);
    const self = BdApi.Webpack.getStore("UserStore")?.getCurrentUser?.()?.id;
    if (!id || id === self) return false;
    return this.preferences.scope === "all" ? !this.preferences.excluded.includes(id) : this.targets.has(id);
  }
  effectiveTargets(participants = this.participants()) {
    return this.preferences.scope === "all" ? new Set(participants.map((person) => person.id).filter((id) => this.isSelected(id))) : new Set(this.targets);
  }
  profileFor(id) {
    return Object.hasOwn(this.preferences.profiles, String(id)) ? this.preferences.profiles[String(id)] : "inherit";
  }
  setUserProfile(id, profile) {
    const profiles = { ...this.preferences.profiles };
    if (profile === "inherit") delete profiles[String(id)];
    else profiles[String(id)] = profile;
    this.updatePreferences({ profiles });
  }
  settingsFor(id) {
    const profile = this.profileFor(id);
    return {
      ...profile === "inherit" ? this.settings : getPreset(profile),
      mode: this.preferences.mode
    };
  }
  resetLearning(id) {
    this.restore(String(id));
    this.toast(this.t("resetDone"));
    this.refreshPanels();
  }
  userStatus(id, participants = null) {
    if (!this.started || !this.isSelected(id)) return "off";
    if (!this.connection) return "waitingChannel";
    const roster = participants ?? this.participants();
    if (!roster.some((person) => person.id === String(id))) return "waitingUser";
    if (this.read(id) === 0) return "muted";
    const state = this.states.get(String(id));
    if (!state || performance.now() - (state.sampleAt ?? 0) > 1500) return "unavailable";
    if (!state.talking) return "waitingSpeech";
    return state.voiceCount < 7 ? "learning" : "active";
  }
  loadTargets() {
    try {
      const saved = BdApi.Data?.load?.("VoiceNormalizer", "targets");
      this.targets = new Set(
        (Array.isArray(saved) ? saved : []).filter(
          (id) => typeof id === "string" && id.length > 0 && id.length <= 32
        )
      );
    } catch (error) {
      this.toast(this.t("loadError", String(error?.message || error)), "error");
    }
  }
  saveTargets() {
    try {
      BdApi.Data.save("VoiceNormalizer", "targets", [...this.targets]);
    } catch (error) {
      this.toast(this.t("saveError", String(error?.message || error)), "error");
    }
  }
  resetConnection(conn = null) {
    for (const id of [...this.states.keys()]) this.restore(id);
    this.connection = conn;
  }
  suspend() {
    this.enabled = false;
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.pendingStats?.cancel();
    this.pendingStats = null;
    this.resetConnection();
    this.status = this.t("off");
  }
  resume() {
    if (!this.started || this.enabled || this.preferences.scope !== "all" && !this.targets.size)
      return;
    this.enabled = true;
    const generation = ++this.generation;
    this.timer = setInterval(() => {
      this.tick(generation).catch(() => {
      });
    }, 100);
    this.status = this.t("waitingChannel");
  }
  loadSettings() {
    try {
      this.settings = normalizeSettings(BdApi.Data?.load?.("VoiceNormalizer", "settings"));
    } catch (_) {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    return this.settings;
  }
  updateSettings(next) {
    this.settings = normalizeSettings(next);
    try {
      BdApi.Data?.save?.("VoiceNormalizer", "settings", this.settings);
    } catch (error) {
      this.toast(this.t("saveError", String(error?.message || error)), "error");
    }
    this.refreshPanels();
    return { ...this.settings };
  }
  store() {
    return BdApi.Webpack.getStore("MediaEngineStore");
  }
  read(id) {
    try {
      const value = this.store()?.getLocalVolume?.(String(id));
      return Number.isFinite(value) && value >= 0 && value < 1e3 ? value : null;
    } catch (_) {
      return null;
    }
  }
  resolveWriter() {
    this.writer = null;
    try {
      const mod = BdApi.Webpack.getModule(
        (m) => m && typeof m.setLocalVolume === "function" && typeof m.getLocalVolume !== "function" && typeof m.getStats !== "function"
      );
      if (mod) {
        this.writer = (id, value) => mod.setLocalVolume(String(id), value, "default");
        this.writerInfo = "MediaEngineActions.setLocalVolume (default)";
        return true;
      }
    } catch (_) {
    }
    this.writerInfo = "setLocalVolume not found";
    return false;
  }
  connect() {
    try {
      if (!this.mediaProvider && performance.now() < (this.providerRetryAt || 0)) return null;
      const provider = this.mediaProvider || BdApi.Webpack.getModule((m) => typeof m?.getMediaEngine === "function");
      this.mediaProvider = provider;
      if (!provider) this.providerRetryAt = performance.now() + 5e3;
      let conn = null;
      provider?.getMediaEngine?.()?.eachConnection?.((c) => {
        if (!conn && typeof c?.getStats === "function" && typeof c?.getUserIdBySsrc === "function" && c.context !== "stream")
          conn = c;
      });
      return conn;
    } catch (_) {
      return null;
    }
  }
  participants() {
    const voice = BdApi.Webpack.getStore("VoiceStateStore");
    const users = BdApi.Webpack.getStore("UserStore");
    const selected = BdApi.Webpack.getStore("SelectedChannelStore");
    const channels = [
      voice?.getCurrentClientVoiceChannelId?.(),
      selected?.getVoiceChannelId?.(),
      selected?.getChannelId?.()
    ].filter(Boolean);
    let items = [];
    for (const channel of channels) {
      try {
        const states = voice?.getVoiceStatesForChannel?.(channel);
        items = Object.values(states || {}).flatMap((s) => Array.isArray(s) ? s : [s]);
        if (items.length) break;
      } catch (_) {
      }
    }
    const self = users?.getCurrentUser?.()?.id;
    return [
      ...new Set(items.map((s) => s?.userId || s?.user_id).filter((v) => v && v !== self))
    ].map((id) => ({
      id: String(id),
      name: users?.getUser?.(id)?.globalName || users?.getUser?.(id)?.username || this.t("participant")
    }));
  }
  toast(msg, type = "info") {
    this.status = msg;
    try {
      BdApi.UI.showToast(msg, { type });
    } catch (_) {
    }
  }
  write(id, value) {
    id = String(id);
    const limit = Math.max(
      this.maxInternalVolume,
      this.states.get(id)?.base || 0,
      this.testBaseline?.id === id ? this.testBaseline.base : 0
    );
    if (!this.writer || !Number.isFinite(value) || value < 0 || value > limit) {
      this.lastWriteError = "Value " + String(value) + " outside allowed range 0\u2013" + limit;
      return false;
    }
    try {
      this.writer(String(id), value);
      this.diagnostic.writes++;
      this.lastWriteError = "None";
      return true;
    } catch (e) {
      this.lastWriteError = String(e?.message || e);
      this.status = this.t("volumeError", this.lastWriteError);
      return false;
    }
  }
  ceilingFor(base) {
    return base > 4 ? Math.max(200, base) : Math.min(4, base * 2);
  }
  volumeTolerance(reference, relative, baseline, absolute) {
    return Math.max(Math.min(absolute, baseline * 0.01), reference * relative);
  }
  restore(id) {
    const st = this.states.get(id);
    if (!st) return;
    const now = this.read(id);
    if (st.lastWrite !== null && Number.isFinite(now) && now > 0 && Math.abs(now - st.lastWrite) <= this.volumeTolerance(st.lastWrite, 0.035, st.base, 0.03)) {
      this.write(id, st.base);
    }
    this.states.delete(id);
  }
  turnOff() {
    this.suspend();
    this.targets.clear();
    this.saveTargets();
    this.updatePreferences({ scope: "selected", excluded: [] });
  }
  select(id, on) {
    id = String(id);
    if (!id || id === BdApi.Webpack.getStore("UserStore")?.getCurrentUser?.()?.id) return;
    if (!on) {
      this.targets.delete(id);
      this.restore(id);
      this.saveTargets();
      const excluded = this.preferences.scope === "all" ? [.../* @__PURE__ */ new Set([...this.preferences.excluded, id])] : this.preferences.excluded.filter((value) => value !== id);
      this.updatePreferences({ excluded });
      return;
    }
    if (this.testRunning) {
      this.toast(this.t("testBusy"), "warning");
      return;
    }
    this.targets.add(id);
    this.resume();
    this.saveTargets();
    this.updatePreferences({ excluded: this.preferences.excluded.filter((value) => value !== id) });
  }
  // Discord's getUserIdBySsrc is not guaranteed to return a user ID.
  // Prefer confirmed user IDs from the local voice-state participant list.
  resolveId(conn, ssrc, allowed = new Set(this.participants().map((p) => p.id))) {
    try {
      const value = conn.getUserIdBySsrc?.(ssrc);
      const id = String(value?.userId ?? value?.id ?? value ?? "");
      if (allowed.has(id)) return id;
    } catch (_) {
    }
    const remote = conn.remoteAudioSSRCs;
    const entries = remote instanceof Map ? [...remote.entries()] : remote && typeof remote === "object" ? Object.entries(remote) : [];
    this.mappingDebug = "remoteAudioSSRCs: " + (remote instanceof Map ? "Map" : Array.isArray(remote) ? "Array" : typeof remote) + ", entries: " + entries.length;
    const wanted = String(ssrc);
    const matches = /* @__PURE__ */ new Set();
    for (const [rawKey, rawValue] of entries) {
      const key = String(rawKey);
      const value = rawValue;
      if (allowed.has(key)) {
        if (String(value) === wanted) matches.add(key);
        if (value && typeof value === "object" && [value.ssrc, value.audioSSRC, value.audioSsrc, value.audio_ssrc].some(
          (v) => String(v) === wanted
        )) {
          matches.add(key);
        }
      }
      if (key === wanted) {
        const id = String(value?.userId ?? value?.user_id ?? value?.id ?? value ?? "");
        if (allowed.has(id)) matches.add(id);
      }
      if (value && typeof value === "object") {
        const id = String(value.userId ?? value.user_id ?? value.id ?? "");
        if (allowed.has(id) && [value.ssrc, value.audioSSRC, value.audioSsrc, value.audio_ssrc].some(
          (v) => String(v) === wanted
        )) {
          matches.add(id);
        }
      }
    }
    return matches.size === 1 ? [...matches][0] : "";
  }
  collect(conn, data, allowed = new Set(this.participants().map((p) => p.id))) {
    const map = /* @__PURE__ */ new Map();
    let packets = 0, mapped = 0;
    for (const group of Object.values(data?.rtp?.inbound || {})) {
      const samples = Array.isArray(group) ? group : Object.values(group || {});
      for (const sample of samples) {
        if (!Number.isFinite(sample?.ssrc) || !Number.isFinite(sample?.audioLevel) || sample.audioLevel < 0 || sample.audioLevel > 1)
          continue;
        packets++;
        const id = this.resolveId(conn, sample.ssrc, allowed);
        if (!id) continue;
        mapped++;
        const existing = map.get(id);
        if (!existing || sample.audioLevel > existing.level)
          map.set(id, { level: sample.audioLevel, detected: sample.audioDetected });
      }
    }
    return { map, packets, mapped };
  }
  async tick(generation) {
    if (!this.enabled || this.pendingStats || this.testRunning || generation !== this.generation)
      return;
    let request;
    try {
      const conn = this.connect();
      if (conn !== this.connection) this.resetConnection(conn);
      if (!conn) {
        this.status = this.t("waitingChannel");
        return;
      }
      if (!this.writer) {
        if (!this.writerRetryAt || performance.now() >= this.writerRetryAt) {
          this.resolveWriter();
          this.writerRetryAt = performance.now() + 5e3;
        }
        this.status = this.t("writerWaiting");
        return;
      }
      request = createStatsRequest(conn);
      this.pendingStats = request;
      const data = await request.promise;
      if (!data || !this.enabled || generation !== this.generation) return;
      if (this.connect() !== conn) {
        this.resetConnection();
        return;
      }
      const allowed = new Set(this.participants().map((person) => person.id));
      for (const id of [...this.states.keys()]) {
        if (!allowed.has(id) || !this.isSelected(id)) this.restore(id);
      }
      const { map, packets, mapped } = this.collect(conn, data, allowed);
      this.diagnostic.polls++;
      this.diagnostic.packets = packets;
      this.diagnostic.mapped = mapped;
      this.status = this.t("waitingSpeech");
      for (const id of this.effectiveTargets([...allowed].map((id2) => ({ id: id2 })))) {
        if (!allowed.has(id)) continue;
        const input = map.get(id);
        if (!input) {
          this.status = this.t("unavailable");
          continue;
        }
        const level = input.level;
        const now = this.read(id);
        if (!Number.isFinite(now) || now <= 0) {
          this.states.delete(id);
          this.status = this.t(now === 0 ? "muted" : "unavailable");
          continue;
        }
        let st = this.states.get(id);
        if (!st || st.lastWrite === null && st.base !== now) {
          st = createUserState(now);
          this.states.set(id, st);
        }
        st.lastLevel = level;
        st.sampleAt = performance.now();
        if (st.lastWrite !== null) {
          const diff = Math.abs(now - st.lastWrite);
          if (diff > this.volumeTolerance(st.lastWrite, 0.04, st.base, 0.04)) {
            if (performance.now() - st.lastWriteTime < 700) {
              st.writeUnconfirmed++;
              continue;
            }
            st.base = now;
            st.ema = null;
            st.voiceCount = 0;
            st.lastWrite = null;
            st.lastGain = 1;
            st.stableGain = 1;
            st.activityPolls = 0;
            st.lastSpeechSampleAt = null;
            st.talking = false;
            st.writeUnconfirmed = 0;
            this.status = this.t("manualBase");
            continue;
          }
          st.writeUnconfirmed = 0;
          this.diagnostic.confirmed++;
        }
        const settings = this.settingsFor(id);
        const gain = calculateGain(st, level, input.detected, performance.now(), settings);
        const ceiling = Math.min(
          this.ceilingFor(st.base),
          settings.mode === "attenuate" ? st.base : Infinity
        );
        const floor = Math.min(0.02, st.base * settings.minGain);
        const desired = Math.max(floor, Math.min(ceiling, st.base * gain));
        const delta = desired - now;
        const weight = delta < 0 ? settings.attack : settings.release;
        const next = Math.max(floor, Math.min(ceiling, now + delta * weight));
        st.lastGain = next / st.base;
        this.diagnostic.latest = "audio=" + level.toFixed(3) + ", average=" + (st.ema ?? 0).toFixed(3) + ", gain=" + st.lastGain.toFixed(2) + "x, store=" + now.toFixed(3) + "\u2192" + next.toFixed(3);
        this.status = this.t(
          !st.talking ? "waitingSpeech" : st.voiceCount < 7 ? "learning" : "active"
        );
        if (Math.abs(next - now) > Math.min(8e-3, st.base * 5e-3)) {
          if (this.write(id, next)) {
            st.lastWrite = next;
            st.lastWriteTime = performance.now();
          }
        }
      }
    } catch (e) {
      if (!this.enabled || generation !== this.generation) return;
      this.diagnostic.failures++;
      this.status = this.t("error", String(e?.message || e));
    } finally {
      if (this.pendingStats === request) this.pendingStats = null;
    }
  }
  async halfVolumeTest(id) {
    if (this.enabled || this.testRunning) {
      this.toast(this.t("testBusy"), "warning");
      return;
    }
    if (!this.writer && !this.resolveWriter()) {
      this.toast(this.t("noWriter"), "warning");
      return;
    }
    id = String(id);
    const before = this.read(id);
    if (!Number.isFinite(before) || before <= 0) {
      this.toast(this.t("noVolume"), "warning");
      return;
    }
    this.testRunning = true;
    this.testBaseline = { id, base: before };
    const target = before * 0.5;
    const tolerance = this.volumeTolerance(target, 0.08, before, 0.035);
    try {
      if (!this.write(id, target)) throw new Error(this.lastWriteError);
      this.status = this.t("testStarted");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3e3);
        this.cancelTest = () => {
          clearTimeout(timer);
          const now = this.read(id);
          if (Number.isFinite(now) && now > 0 && Math.abs(now - target) < tolerance)
            this.write(id, before);
          resolve();
        };
      });
      const after = this.read(id);
      const ok = Number.isFinite(after) && after > 0 && Math.abs(after - target) < tolerance;
      this.status = this.t("testResult", this.t(ok ? "confirmed" : "unconfirmed"));
    } catch (e) {
      this.status = this.t("error", String(e?.message || e));
    } finally {
      try {
        const now = this.read(id);
        if (Number.isFinite(now) && now > 0 && Math.abs(now - target) < tolerance)
          this.write(id, before);
      } catch (_) {
      }
      this.testRunning = false;
      this.testBaseline = null;
      this.cancelTest = null;
    }
  }
  insertNearVolume(tree, item) {
    const matches = [];
    const visited = /* @__PURE__ */ new Set();
    const walk = (node, depth) => {
      if (!node || depth > 9 || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if (Array.isArray(node)) {
        node.forEach((x) => walk(x, depth + 1));
        return;
      }
      const children = node.props?.children;
      if (Array.isArray(children)) {
        children.forEach((child, index) => {
          const p = child?.props || {};
          const label = [p.id, p.label, p.title].filter((v) => typeof v === "string").join(" ").toLowerCase();
          let weight = 0;
          if (/volume|громкост/.test(label)) weight = 4;
          else if (/mute|заглуш/.test(label)) weight = 2;
          if (weight) matches.push({ children, index, weight });
          walk(child, depth + 1);
        });
      } else walk(children, depth + 1);
    };
    walk(tree, 0);
    matches.sort((a, b) => b.weight - a.weight);
    try {
      if (matches.length) {
        const m = matches[0];
        m.children.splice(m.index + 1, 0, item);
      } else if (Array.isArray(tree?.props?.children)) tree.props.children.unshift(item);
    } catch (_) {
    }
  }
  getLiveSnapshot(id) {
    const st = this.states.get(String(id));
    const active = this.isSelected(id);
    const actual = this.read(id);
    const base = st?.base;
    const relative = Number.isFinite(actual) && Number.isFinite(base) && base > 0 ? actual / base : 1;
    const ratio = Math.max(0, Math.min(2, relative));
    const gainDb = ratio > 0 ? 20 * Math.log10(ratio) : -60;
    const level = Number.isFinite(st?.lastLevel) ? st.lastLevel : 0;
    const average = Number.isFinite(st?.ema) ? st.ema : 0;
    return {
      active,
      ratio,
      gainDb,
      level,
      average,
      hasAudio: Boolean(st && st.voiceCount > 0),
      volumeKnown: Number.isFinite(actual),
      current: actual,
      base
    };
  }
  menuMeterComponent() {
    if (this._menuMeter) return this._menuMeter;
    const R = BdApi.React;
    this._menuMeter = ({ userId }) => {
      const [, rerender] = R.useState(0);
      R.useEffect(() => {
        const timer = setInterval(() => rerender((value) => value + 1), 200);
        this.panels.add(timer);
        return () => {
          clearInterval(timer);
          this.panels.delete(timer);
        };
      }, []);
      const data = this.getLiveSnapshot(userId);
      return R.createElement(
        "div",
        {
          style: {
            padding: "7px 11px",
            minWidth: 205,
            fontSize: 12,
            color: "var(--text-normal)",
            pointerEvents: "none"
          },
          "aria-label": this.t("meter")
        },
        R.createElement("div", null, this.t(this.userStatus(userId))),
        data.active && Number.isFinite(data.base) ? R.createElement(
          "div",
          { style: { marginTop: 5, color: "var(--text-muted)" } },
          this.t("correction", (data.ratio * 100).toFixed(0))
        ) : null
      );
    };
    return this._menuMeter;
  }
  installMenus() {
    for (const nav of ["user-context", "user-profile-actions"]) {
      try {
        const unpatch = BdApi.ContextMenu.patch(nav, (tree, props) => {
          const id = props?.user?.id;
          if (!id || id === BdApi.Webpack.getStore("UserStore")?.getCurrentUser?.()?.id) return;
          const item = BdApi.ContextMenu.buildItem({
            id: "voice-normalizer-toggle",
            type: "toggle",
            label: this.t("toggle"),
            checked: this.isSelected(id),
            action: () => this.select(id, !this.isSelected(id))
          });
          const controls = BdApi.ContextMenu.buildItem({
            type: "submenu",
            id: "voice-normalizer-options",
            label: "VoiceNormalizer",
            items: [
              ...["inherit", "soft", "balanced", "aggressive"].map((profile) => ({
                type: "radio",
                id: "voice-normalizer-profile-" + profile,
                group: "voice-normalizer-profile",
                label: this.t(profile),
                checked: this.profileFor(id) === profile,
                action: () => this.setUserProfile(id, profile)
              })),
              { type: "separator" },
              {
                id: "voice-normalizer-reset",
                label: this.t("reset"),
                disabled: !this.states.has(String(id)),
                action: () => this.resetLearning(id)
              }
            ]
          });
          if (controls) this.insertNearVolume(tree, controls);
          try {
            const meter = BdApi.ContextMenu.buildItem({
              type: "control",
              id: "voice-normalizer-live-meter",
              control: () => BdApi.React.createElement(this.menuMeterComponent(), { userId: String(id) })
            });
            if (meter) this.insertNearVolume(tree, meter);
          } catch (error) {
            this.status = this.t("error", String(error?.message || error));
          }
          this.insertNearVolume(tree, item);
        });
        if (typeof unpatch === "function") this.unpatches.push(unpatch);
      } catch (_) {
      }
    }
  }
  getSettingsPanel() {
    return createSettingsPanel(this, document);
  }
};

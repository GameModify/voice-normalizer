/**
 * @name VoiceNormalizer
 * @author GameModify
 * @authorLink https://github.com/GameModify
 * @version 1.2.0-alpha
 * @description Selected-user adaptive voice leveling (experimental). Average speech tracking and conservative peak ducking.
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
    function getPreset(profile) {
      return normalizeSettings2(PRESETS[profile] || PRESETS.balanced);
    }
    module2.exports = { DEFAULT_SETTINGS: DEFAULT_SETTINGS2, PRESETS, BOUNDS, normalizeSettings: normalizeSettings2, getPreset };
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
      if (confirmed) state.stableGain = gain;
      return gain;
    }
    module2.exports = { createUserState: createUserState2, calculateGain: calculateGain2 };
  }
});

// src/ui/settings-controls.js
var require_settings_controls = __commonJS({
  "src/ui/settings-controls.js"(exports2, module2) {
    "use strict";
    var { getPreset } = require_settings();
    var FIELDS = [
      [
        "targetLevel",
        "\u0426\u0435\u043B\u044C RTP (\u0443\u0441\u043B\u043E\u0432\u043D\u044B\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C)",
        0.04,
        0.25,
        5e-3,
        (v) => (v * 100).toFixed(1) + "%"
      ],
      ["maxGain", "\u041C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0435 \u0443\u0441\u0438\u043B\u0435\u043D\u0438\u0435", 1, 2, 0.05, (v) => (v * 100).toFixed(0) + "% \u043E\u0442 \u0431\u0430\u0437\u044B"],
      [
        "minGain",
        "\u041C\u0430\u043A\u0441\u0438\u043C\u0430\u043B\u044C\u043D\u043E\u0435 \u043E\u0441\u043B\u0430\u0431\u043B\u0435\u043D\u0438\u0435",
        0.25,
        1,
        0.05,
        (v) => (20 * Math.log10(v)).toFixed(1) + " \u0434\u0411"
      ],
      [
        "attack",
        "\u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u0443\u043C\u0435\u043D\u044C\u0448\u0435\u043D\u0438\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438",
        0.2,
        0.9,
        0.05,
        (v) => Math.round(v * 100) + "% \u0437\u0430 \u043E\u043F\u0440\u043E\u0441"
      ],
      [
        "release",
        "\u0421\u043A\u043E\u0440\u043E\u0441\u0442\u044C \u0443\u0432\u0435\u043B\u0438\u0447\u0435\u043D\u0438\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438",
        0.03,
        0.3,
        0.01,
        (v) => Math.round(v * 100) + "% \u0437\u0430 \u043E\u043F\u0440\u043E\u0441"
      ]
    ];
    function createSettingsControls2(doc, initial, updateSettings) {
      let current = { ...initial };
      const section = doc.createElement("section");
      section.style.cssText = "padding:12px;border-radius:10px;background:var(--background-secondary);display:flex;flex-direction:column;gap:11px";
      const heading = doc.createElement("strong");
      heading.textContent = "\u0413\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438";
      const note = doc.createElement("div");
      note.style.cssText = "color:var(--text-muted);font-size:12px;line-height:1.35";
      note.textContent = "\u0426\u0435\u043B\u044C RTP \u2014 \u043E\u0442\u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0432\u0445\u043E\u0434\u044F\u0449\u0435\u0433\u043E \u0430\u0443\u0434\u0438\u043E, \u043D\u0435 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u043F\u043E\u043B\u0437\u0443\u043D\u043A\u0430 Discord. \u0423\u0441\u0438\u043B\u0435\u043D\u0438\u0435 \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u043E \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0438\u043C \u043F\u043E\u0442\u043E\u043B\u043A\u043E\u043C Discord; \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.";
      section.append(heading, note);
      const presetRow = doc.createElement("label");
      presetRow.style.cssText = "display:flex;gap:10px;align-items:center;justify-content:space-between";
      const presetText = doc.createElement("span");
      presetText.textContent = "\u041F\u0440\u043E\u0444\u0438\u043B\u044C";
      const select = doc.createElement("select");
      select.style.cssText = "padding:6px;background:var(--input-background);color:var(--text-normal);border:1px solid var(--background-modifier-accent);border-radius:6px";
      for (const [key, name] of [
        ["soft", "\u041C\u044F\u0433\u043A\u0438\u0439"],
        ["balanced", "\u0411\u0430\u043B\u0430\u043D\u0441"],
        ["aggressive", "\u0410\u0433\u0440\u0435\u0441\u0441\u0438\u0432\u043D\u044B\u0439"],
        ["custom", "\u041C\u043E\u0439"]
      ]) {
        const option = doc.createElement("option");
        option.value = key;
        option.textContent = name;
        select.append(option);
      }
      presetRow.append(presetText, select);
      section.append(presetRow);
      const controls = [];
      function refresh() {
        select.value = current.profile;
        for (const { key, slider, output, format } of controls) {
          slider.value = String(current[key]);
          output.textContent = format(current[key]);
        }
      }
      function commit(next) {
        current = updateSettings(next);
        refresh();
      }
      select.addEventListener("change", () => {
        if (select.value === "custom") {
          commit({ ...current, profile: "custom" });
        } else {
          commit(getPreset(select.value));
        }
      });
      for (const [key, label, min, max, step, format] of FIELDS) {
        const row = doc.createElement("div");
        row.style.cssText = "display:flex;flex-direction:column;gap:5px";
        const info = doc.createElement("div");
        info.style.cssText = "display:flex;gap:8px;justify-content:space-between;font-size:12px";
        const title = doc.createElement("span");
        title.textContent = label;
        const output = doc.createElement("span");
        output.style.fontVariantNumeric = "tabular-nums";
        const slider = doc.createElement("input");
        slider.type = "range";
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.style.width = "100%";
        slider.addEventListener("input", () => {
          commit({ ...current, [key]: Number(slider.value), profile: "custom" });
        });
        info.append(title, output);
        row.append(info, slider);
        section.append(row);
        controls.push({ key, slider, output, format });
      }
      refresh();
      return section;
    }
    module2.exports = { createSettingsControls: createSettingsControls2 };
  }
});

// src/index.js
var { createUserState, calculateGain } = require_leveler();
var { DEFAULT_SETTINGS, normalizeSettings } = require_settings();
var { createSettingsControls } = require_settings_controls();
module.exports = class VoiceNormalizer {
  constructor() {
    this.targets = /* @__PURE__ */ new Set();
    this.states = /* @__PURE__ */ new Map();
    this.enabled = false;
    this.timer = null;
    this.busy = false;
    this.generation = 0;
    this.connection = null;
    this.writer = null;
    this.writerInfo = "\u043D\u0435 \u043F\u0440\u043E\u0432\u0435\u0440\u0435\u043D";
    this.unpatches = [];
    this.panels = /* @__PURE__ */ new Set();
    this.status = "\u0412\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u043E";
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
    this.maxInternalVolume = 200;
    this.settings = { ...DEFAULT_SETTINGS };
    this.mappingDebug = "\u0435\u0449\u0451 \u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445";
    this.lastWriteError = "\u043D\u0435\u0442";
  }
  start() {
    this.loadSettings();
    this.resolveWriter();
    this.installMenus();
    BdApi.UI.showToast("VoiceNormalizer: \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u0438 \u041F\u041A\u041C \u043F\u043E \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044E", { type: "info" });
  }
  stop() {
    this.turnOff();
    for (const unpatch of this.unpatches) {
      try {
        unpatch();
      } catch (_) {
      }
    }
    this.unpatches = [];
    for (const t of this.panels) clearInterval(t);
    this.panels.clear();
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
      this.status = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: " + String(error?.message || error);
    }
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
    this.writerInfo = "\u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D setLocalVolume";
    return false;
  }
  connect() {
    try {
      const provider = BdApi.Webpack.getModule((m) => typeof m?.getMediaEngine === "function");
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
      name: users?.getUser?.(id)?.globalName || users?.getUser?.(id)?.username || "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A"
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
    if (!this.writer || !Number.isFinite(value) || value < 0 || value > this.maxInternalVolume) {
      this.lastWriteError = "\u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435 " + String(value) + " \u0432\u043D\u0435 \u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u043E\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430 0\u2013" + this.maxInternalVolume;
      return false;
    }
    try {
      this.writer(String(id), value);
      this.diagnostic.writes++;
      this.lastWriteError = "\u043D\u0435\u0442";
      return true;
    } catch (e) {
      this.lastWriteError = String(e?.message || e);
      this.status = "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u0438 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438: " + this.lastWriteError;
      return false;
    }
  }
  ceilingFor(base) {
    return base > 4 ? 200 : Math.min(4, base * 2);
  }
  restore(id) {
    const st = this.states.get(id);
    if (!st) return;
    const now = this.read(id);
    if (st.lastWrite !== null && Number.isFinite(now) && Math.abs(now - st.lastWrite) <= Math.max(0.03, st.lastWrite * 0.035)) {
      this.write(id, st.base);
    }
    this.states.delete(id);
  }
  turnOff() {
    this.enabled = false;
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const id of [...this.states.keys()]) this.restore(id);
    this.targets.clear();
    this.connection = null;
    this.status = "\u0412\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u043E";
  }
  select(id, on) {
    id = String(id);
    if (!on) {
      this.targets.delete(id);
      this.restore(id);
      if (!this.targets.size) this.turnOff();
      else this.status = "\u0412\u044B\u0431\u0440\u0430\u043D\u043E: " + this.targets.size;
      return;
    }
    if (this.testRunning) {
      this.toast("\u0417\u0430\u0432\u0435\u0440\u0448\u0438 \u0440\u0443\u0447\u043D\u043E\u0439 \u0442\u0435\u0441\u0442", "warning");
      return;
    }
    if (!this.writer && !this.resolveWriter()) {
      this.toast("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043C\u0435\u0442\u043E\u0434 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C\u044E Discord", "error");
      return;
    }
    const conn = this.connect();
    const current = this.read(id);
    if (!conn || !Number.isFinite(current) || current <= 0) {
      this.toast("\u041D\u0435\u0442 \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u044F \u0438\u043B\u0438 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F", "warning");
      return;
    }
    this.targets.add(id);
    this.states.set(id, createUserState(current));
    if (!this.enabled) {
      this.enabled = true;
      this.connection = conn;
      const generation = ++this.generation;
      this.timer = setInterval(() => {
        this.tick(generation).catch(() => {
        });
      }, 100);
    }
    this.status = "\u0412\u043A\u043B\u044E\u0447\u0435\u043D\u043E \xB7 \u0436\u0434\u0451\u043C \u0440\u0435\u0447\u044C \xB7 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439: " + this.targets.size;
  }
  // Discord's getUserIdBySsrc is not guaranteed to return a user ID.
  // Prefer confirmed user IDs from the local voice-state participant list.
  resolveId(conn, ssrc) {
    const allowed = new Set(this.participants().map((p) => p.id));
    try {
      const value = conn.getUserIdBySsrc?.(ssrc);
      const id = String(value?.userId ?? value?.id ?? value ?? "");
      if (allowed.has(id)) return id;
    } catch (_) {
    }
    const remote = conn.remoteAudioSSRCs;
    const entries = remote instanceof Map ? [...remote.entries()] : remote && typeof remote === "object" ? Object.entries(remote) : [];
    this.mappingDebug = "remoteAudioSSRCs: " + (remote instanceof Map ? "Map" : Array.isArray(remote) ? "Array" : typeof remote) + ", \u0437\u0430\u043F\u0438\u0441\u0435\u0439: " + entries.length;
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
  collect(conn, data) {
    const map = /* @__PURE__ */ new Map();
    let packets = 0, mapped = 0;
    for (const group of Object.values(data?.rtp?.inbound || {})) {
      const samples = Array.isArray(group) ? group : Object.values(group || {});
      for (const sample of samples) {
        if (!Number.isFinite(sample?.ssrc) || !Number.isFinite(sample?.audioLevel)) continue;
        packets++;
        const id = this.resolveId(conn, sample.ssrc);
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
    if (!this.enabled || this.busy || this.testRunning || generation !== this.generation) return;
    this.busy = true;
    try {
      const conn = this.connect();
      if (!conn || conn !== this.connection) {
        this.turnOff();
        this.status = "\u0421\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0438\u0437\u043C\u0435\u043D\u0438\u043B\u043E\u0441\u044C \u2014 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E";
        return;
      }
      const data = await Promise.resolve(conn.getStats());
      if (!this.enabled || generation !== this.generation) return;
      const { map, packets, mapped } = this.collect(conn, data);
      this.diagnostic.polls++;
      this.diagnostic.packets = packets;
      this.diagnostic.mapped = mapped;
      for (const id of [...this.targets]) {
        const st = this.states.get(id);
        if (!st) continue;
        const input = map.get(id);
        if (!input) {
          this.status = "SSRC \u043D\u0435 \u0441\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D \u0441 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u043C \u0447\u0435\u043B\u043E\u0432\u0435\u043A\u043E\u043C";
          continue;
        }
        const level = input.level;
        st.lastLevel = level;
        const now = this.read(id);
        if (!Number.isFinite(now) || now <= 0) {
          this.status = "\u041D\u0435\u0442 \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438 \u0432 store";
          continue;
        }
        if (st.lastWrite !== null) {
          const diff = Math.abs(now - st.lastWrite);
          if (diff > Math.max(0.04, st.lastWrite * 0.04)) {
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
            this.status = "\u0420\u0443\u0447\u043D\u0430\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0430 \u2014 \u043D\u043E\u0432\u0430\u044F \u0431\u0430\u0437\u0430";
            continue;
          }
          st.writeUnconfirmed = 0;
          this.diagnostic.confirmed++;
        }
        const gain = calculateGain(st, level, input.detected, performance.now(), this.settings);
        const ceiling = this.ceilingFor(st.base);
        const desired = Math.max(0.02, Math.min(ceiling, st.base * gain));
        const delta = desired - now;
        const weight = delta < 0 ? this.settings.attack : this.settings.release;
        const next = Math.max(0.02, Math.min(ceiling, now + delta * weight));
        st.lastGain = next / st.base;
        this.diagnostic.latest = "audio=" + level.toFixed(3) + ", \u0441\u0440\u0435\u0434\u043D\u0435\u0435=" + (st.ema ?? 0).toFixed(3) + ", gain=" + st.lastGain.toFixed(2) + "x, store=" + now.toFixed(3) + "\u2192" + next.toFixed(3);
        this.status = "\u0410\u043A\u0442\u0438\u0432\u043D\u043E \xB7 " + this.diagnostic.latest;
        if (Math.abs(next - now) > 8e-3) {
          if (this.write(id, next)) {
            st.lastWrite = next;
            st.lastWriteTime = performance.now();
          }
        }
      }
    } catch (e) {
      this.diagnostic.failures++;
      this.status = "\u041E\u0448\u0438\u0431\u043A\u0430: " + String(e?.message || e);
    } finally {
      this.busy = false;
    }
  }
  async halfVolumeTest(id) {
    if (this.enabled || this.testRunning) {
      this.toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u044B\u043A\u043B\u044E\u0447\u0438 \u0430\u0432\u0442\u043E\u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443", "warning");
      return;
    }
    if (!this.writer && !this.resolveWriter()) {
      this.toast("\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043C\u043E\u0434\u0443\u043B\u044C \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438", "warning");
      return;
    }
    id = String(id);
    const before = this.read(id);
    if (!Number.isFinite(before) || before <= 0) {
      this.toast("\u041D\u0435 \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u0430 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C", "warning");
      return;
    }
    this.testRunning = true;
    const target = Math.max(0.01, before * 0.5);
    try {
      if (!this.write(id, target)) throw new Error("\u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0437\u043D\u0430\u0447\u0435\u043D\u0438\u0435");
      this.status = "\u0422\u0435\u0441\u0442 \xD70.5 \u0437\u0430\u043F\u0443\u0449\u0435\u043D \u2014 3 \u0441\u0435\u043A\u0443\u043D\u0434\u044B \u043F\u043E\u043D\u0438\u0436\u0435\u043D\u043D\u043E\u0439 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438";
      await new Promise((r) => setTimeout(r, 3e3));
      const after = this.read(id);
      const ok = Number.isFinite(after) && Math.abs(after - target) < Math.max(0.035, target * 0.08);
      this.status = "\u0422\u0435\u0441\u0442 \xD70.5: \u0434\u043E=" + before.toFixed(4) + ", \u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F=" + target.toFixed(4) + ", Discord=" + String(Number.isFinite(after) ? after.toFixed(4) : after) + ", \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442=" + (ok ? "\u041E\u041A" : "\u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043D");
    } catch (e) {
      this.status = "\u041E\u0448\u0438\u0431\u043A\u0430 \u0442\u0435\u0441\u0442\u0430: " + String(e?.message || e);
    } finally {
      try {
        const now = this.read(id);
        if (Number.isFinite(now) && Math.abs(now - target) < Math.max(0.035, target * 0.08))
          this.write(id, before);
      } catch (_) {
      }
      this.testRunning = false;
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
    const active = this.targets.has(String(id));
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
        const handle = setInterval(() => rerender((t) => t + 1), 150);
        return () => clearInterval(handle);
      }, []);
      const data = this.getLiveSnapshot(userId);
      const text = (str, style = {}) => R.createElement("div", { style }, str);
      const bar = (value, color) => R.createElement(
        "div",
        {
          style: {
            height: 6,
            background: "var(--background-tertiary)",
            borderRadius: 6,
            overflow: "hidden",
            width: "100%"
          }
        },
        R.createElement("div", {
          style: {
            width: (Math.max(0, Math.min(1, value)) * 100).toFixed(1) + "%",
            height: "100%",
            background: color,
            borderRadius: 6,
            transition: "width 150ms linear"
          }
        })
      );
      return R.createElement(
        "div",
        {
          style: {
            minWidth: 205,
            maxWidth: 250,
            padding: "7px 11px",
            display: "flex",
            flexDirection: "column",
            gap: 5,
            fontSize: 11,
            color: "var(--text-normal)",
            pointerEvents: "none"
          },
          "aria-label": "VoiceNormalizer: \u0438\u043D\u0434\u0438\u043A\u0430\u0442\u043E\u0440 \u0433\u043E\u043B\u043E\u0441\u0430"
        },
        text(data.active ? "\u041D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F: \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430" : "\u041D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u044F: \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D\u0430", {
          fontWeight: 600,
          color: data.active ? "var(--text-positive)" : "var(--text-muted)"
        }),
        text("\u0412\u0445\u043E\u0434\u044F\u0449\u0438\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C: " + (data.level * 100).toFixed(1) + "%"),
        bar(data.level, "var(--brand-500,#5865f2)"),
        text("\u0421\u0440\u0435\u0434\u043D\u0438\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C: " + (data.average * 100).toFixed(1) + "%"),
        bar(data.average, "#44bba4"),
        text(
          data.active && data.volumeKnown && Number.isFinite(data.base) ? "\u0413\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C: " + (data.ratio * 100).toFixed(0) + "% \u043E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \xB7 " + (data.gainDb >= 0 ? "+" : "") + data.gainDb.toFixed(1) + " \u0434\u0411" : "\u0412\u043A\u043B\u044E\u0447\u0438 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u0435"
        ),
        bar(data.active ? data.ratio / 2 : 0.5, "#faa61a")
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
            label: "\u0412\u044B\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0442\u044C \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u0433\u043E\u043B\u043E\u0441\u0430",
            checked: this.targets.has(String(id)),
            action: () => this.select(id, !this.targets.has(String(id)))
          });
          try {
            const meter = BdApi.ContextMenu.buildItem({
              type: "control",
              id: "voice-normalizer-live-meter",
              control: () => BdApi.React.createElement(this.menuMeterComponent(), { userId: String(id) })
            });
            if (meter) this.insertNearVolume(tree, meter);
          } catch (error) {
            this.status = "\u0418\u043D\u0434\u0438\u043A\u0430\u0442\u043E\u0440 \u0432 \u041F\u041A\u041C \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: " + String(error?.message || error);
          }
          this.insertNearVolume(tree, item);
        });
        if (typeof unpatch === "function") this.unpatches.push(unpatch);
      } catch (_) {
      }
    }
  }
  getSettingsPanel() {
    const root = document.createElement("div");
    root.style.cssText = "padding:18px;display:flex;flex-direction:column;gap:12px;color:var(--text-normal)";
    const title = document.createElement("h3");
    title.textContent = "VoiceNormalizer \xB7 1.2.0 Alpha";
    title.style.margin = "0";
    const help = document.createElement("p");
    help.textContent = "\u041F\u041A\u041C \u043D\u0430 \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0435 \u2192 \u0412\u044B\u0440\u0430\u0432\u043D\u0438\u0432\u0430\u0442\u044C \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u0433\u043E\u043B\u043E\u0441\u0430. \u0421\u0440\u0435\u0434\u043D\u044F\u044F \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432\u043E \u0432\u0440\u0435\u043C\u044F \u0440\u0435\u0447\u0438. \u041F\u0440\u0438 \u043C\u043E\u043B\u0447\u0430\u043D\u0438\u0438 \u0443\u0441\u0438\u043B\u0435\u043D\u0438\u0435 \u043D\u0435 \u0443\u0432\u0435\u043B\u0438\u0447\u0438\u0432\u0430\u0435\u0442\u0441\u044F.";
    help.style.cssText = "margin:0;color:var(--text-muted);line-height:1.4";
    const livePanel = document.createElement("div");
    livePanel.style.cssText = "display:flex;flex-direction:column;gap:8px";
    const debug = document.createElement("pre");
    debug.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;border-radius:9px;background:var(--background-secondary);font-size:12px";
    const people = document.createElement("div");
    people.style.cssText = "display:flex;flex-direction:column;gap:8px;max-height:240px;overflow:auto";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
    const makeButton = (text, fn, secondary = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText = "padding:9px 12px;border-radius:9px;border:0;cursor:pointer;font-weight:600;color:white;background:" + (secondary ? "var(--background-tertiary)" : "var(--brand-500,#5865f2)");
      b.onclick = fn;
      return b;
    };
    const refresh = () => {
      people.replaceChildren();
      const list = this.participants();
      for (const person of list) {
        const line = document.createElement("div");
        line.style.cssText = "display:flex;gap:8px;align-items:center;padding:9px;background:var(--background-secondary);border-radius:9px";
        const name = document.createElement("span");
        name.textContent = person.name;
        name.style.flex = "1";
        const test = makeButton(
          "\u0422\u0435\u0441\u0442 \xD70.5",
          () => this.halfVolumeTest(person.id).then(render),
          true
        );
        test.disabled = this.enabled || this.testRunning;
        const enabled = this.targets.has(person.id);
        const toggle = makeButton(enabled ? "\u0412\u044B\u043A\u043B\u044E\u0447\u0438\u0442\u044C" : "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C", () => {
          this.select(person.id, !enabled);
          refresh();
          render();
        });
        line.append(name, test, toggle);
        people.append(line);
      }
      if (!list.length) people.textContent = "\u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0438 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B. \u041F\u0440\u043E\u0432\u0435\u0440\u044C \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0439 \u043A\u0430\u043D\u0430\u043B.";
    };
    const render = () => {
      livePanel.replaceChildren();
      const roster = new Map(this.participants().map((p) => [p.id, p.name]));
      if (!this.targets.size) {
        const empty = document.createElement("div");
        empty.textContent = "\u0416\u0438\u0432\u043E\u0439 \u0438\u043D\u0434\u0438\u043A\u0430\u0442\u043E\u0440 \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043D\u043E\u0440\u043C\u0430\u043B\u0438\u0437\u0430\u0446\u0438\u0438.";
        empty.style.cssText = "color:var(--text-muted);font-size:12px";
        livePanel.append(empty);
      }
      for (const id of this.targets) {
        const v = this.getLiveSnapshot(id);
        const card = document.createElement("div");
        card.style.cssText = "background:var(--background-secondary);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px";
        const name = document.createElement("div");
        name.textContent = roster.get(id) || "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C";
        name.style.cssText = "font-weight:700;font-size:13px";
        const detail = document.createElement("div");
        detail.style.cssText = "font-size:12px;color:var(--text-muted)";
        detail.textContent = "\u0413\u043E\u043B\u043E\u0441 " + (v.level * 100).toFixed(1) + "% \xB7 \u0421\u0440\u0435\u0434\u043D\u0435\u0435 " + (v.average * 100).toFixed(1) + "% \xB7 \u0413\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u044C " + (v.ratio * 100).toFixed(0) + "% \u043E\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 (" + (v.gainDb >= 0 ? "+" : "") + v.gainDb.toFixed(1) + " \u0434\u0411)";
        const track = document.createElement("div");
        track.style.cssText = "height:7px;overflow:hidden;border-radius:6px;background:var(--background-tertiary);position:relative";
        const fill = document.createElement("div");
        fill.style.cssText = "height:100%;background:var(--brand-500,#5865f2);transition:width 200ms";
        fill.style.width = Math.min(100, Math.max(0, v.ratio * 50)).toFixed(1) + "%";
        const baseMark = document.createElement("div");
        baseMark.style.cssText = "position:absolute;left:50%;top:0;height:100%;width:2px;background:var(--text-normal);opacity:.55";
        track.append(fill, baseMark);
        card.append(name, detail, track);
        livePanel.append(card);
      }
      debug.textContent = [
        "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435: " + this.status,
        "\u041C\u043E\u0434\u0443\u043B\u044C: " + this.writerInfo,
        "\u0412\u044B\u0431\u0440\u0430\u043D\u043E: " + this.targets.size + ", \u043E\u043F\u0440\u043E\u0441\u043E\u0432: " + this.diagnostic.polls,
        "\u0412\u0445\u043E\u0434\u044F\u0449\u0438\u0445 \u043F\u043E\u0442\u043E\u043A\u043E\u0432: " + this.diagnostic.packets + ", \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u044B \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438: " + this.diagnostic.mapped,
        "\u0417\u0430\u043F\u0438\u0441\u0435\u0439 \u0433\u0440\u043E\u043C\u043A\u043E\u0441\u0442\u0438: " + this.diagnostic.writes + ", \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u0439: " + this.diagnostic.confirmed,
        "\u0421\u043E\u043F\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u0438\u0435: " + this.mappingDebug,
        "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u043E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u043F\u0438\u0441\u0438: " + this.lastWriteError,
        "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0435: " + this.diagnostic.latest
      ].join("\n");
    };
    const stop = makeButton(
      "\u25A0 \u041E\u0442\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0434\u043B\u044F \u0432\u0441\u0435\u0445",
      () => {
        this.turnOff();
        refresh();
        render();
      },
      true
    );
    const reload = makeButton("\u21BB \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432", () => {
      refresh();
      render();
    });
    actions.append(stop, reload);
    const controls = createSettingsControls(
      document,
      this.settings,
      (next) => this.updateSettings(next)
    );
    root.append(title, help, controls, livePanel, people, actions, debug);
    refresh();
    render();
    const timer = setInterval(() => {
      if (!root.isConnected) {
        clearInterval(timer);
        this.panels.delete(timer);
        return;
      }
      render();
    }, 400);
    this.panels.add(timer);
    return root;
  }
};

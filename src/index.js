const { createUserState, calculateGain, interruptSpeech } = require("./audio/leveler");
const { smoothVolume } = require("./audio/gain-envelope");
const { DEFAULT_SETTINGS, normalizeSettings, getPreset } = require("./audio/settings");
const { normalizePreferences } = require("./preferences");
const { languageFor, translate } = require("./i18n");
const { createSettingsPanel } = require("./ui/settings-panel");
const { createStatsRequest } = require("./discord/stats-request");

module.exports = class VoiceNormalizer {
  constructor() {
    this.targets = new Set();
    this.states = new Map();
    this.enabled = false;
    this.started = false;
    this.timer = null;
    this.pendingStats = null;
    this.generation = 0;
    this.connection = null;
    this.writer = null;
    this.writerInfo = "Not checked";
    this.unpatches = [];
    this.panels = new Set();
    this.status = "Off";
    this.diagnostic = {
      polls: 0,
      packets: 0,
      mapped: 0,
      writes: 0,
      confirmed: 0,
      failures: 0,
      latest: "—",
    };
    this.testRunning = false;
    this.testBaseline = null;
    // Discord builds can expose percent-like or amplitude-like internal volumes.
    this.maxInternalVolume = 200;
    this.settings = { ...DEFAULT_SETTINGS };
    this.preferences = normalizePreferences();
    this.panelRefreshers = new Set();
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
      } catch (_) {}
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
    } catch (_) {}
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
    return this.preferences.scope === "all"
      ? !this.preferences.excluded.includes(id)
      : this.targets.has(id);
  }
  effectiveTargets(participants = this.participants()) {
    return this.preferences.scope === "all"
      ? new Set(participants.map((person) => person.id).filter((id) => this.isSelected(id)))
      : new Set(this.targets);
  }
  profileFor(id) {
    return Object.hasOwn(this.preferences.profiles, String(id))
      ? this.preferences.profiles[String(id)]
      : "inherit";
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
      ...(profile === "inherit" ? this.settings : getPreset(profile)),
      mode: this.preferences.mode,
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
          (id) => typeof id === "string" && id.length > 0 && id.length <= 32,
        ),
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
    if (!this.started || this.enabled || (this.preferences.scope !== "all" && !this.targets.size))
      return;
    this.enabled = true;
    const generation = ++this.generation;
    this.timer = setInterval(() => {
      this.tick(generation).catch(() => {});
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
      return Number.isFinite(value) && value >= 0 && value < 1000 ? value : null;
    } catch (_) {
      return null;
    }
  }
  resolveWriter() {
    this.writer = null;
    try {
      const mod = BdApi.Webpack.getModule(
        (m) =>
          m &&
          typeof m.setLocalVolume === "function" &&
          typeof m.getLocalVolume !== "function" &&
          typeof m.getStats !== "function",
      );
      if (mod) {
        this.writer = (id, value) => mod.setLocalVolume(String(id), value, "default");
        this.writerInfo = "MediaEngineActions.setLocalVolume (default)";
        return true;
      }
    } catch (_) {}
    this.writerInfo = "setLocalVolume not found";
    return false;
  }
  connect() {
    try {
      if (!this.mediaProvider && performance.now() < (this.providerRetryAt || 0)) return null;
      const provider =
        this.mediaProvider ||
        BdApi.Webpack.getModule((m) => typeof m?.getMediaEngine === "function");
      this.mediaProvider = provider;
      if (!provider) this.providerRetryAt = performance.now() + 5000;
      let conn = null;
      provider?.getMediaEngine?.()?.eachConnection?.((c) => {
        if (
          !conn &&
          typeof c?.getStats === "function" &&
          typeof c?.getUserIdBySsrc === "function" &&
          c.context !== "stream"
        )
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
      selected?.getChannelId?.(),
    ].filter(Boolean);
    let items = [];
    for (const channel of channels) {
      try {
        const states = voice?.getVoiceStatesForChannel?.(channel);
        items = Object.values(states || {}).flatMap((s) => (Array.isArray(s) ? s : [s]));
        if (items.length) break;
      } catch (_) {}
    }
    const self = users?.getCurrentUser?.()?.id;
    return [
      ...new Set(items.map((s) => s?.userId || s?.user_id).filter((v) => v && v !== self)),
    ].map((id) => ({
      id: String(id),
      name:
        users?.getUser?.(id)?.globalName || users?.getUser?.(id)?.username || this.t("participant"),
    }));
  }
  toast(msg, type = "info") {
    this.status = msg;
    try {
      BdApi.UI.showToast(msg, { type });
    } catch (_) {}
  }
  write(id, value) {
    id = String(id);
    // Never increase the general limit, but allow restoring an observed baseline
    // established by Discord/BetterVolume above that limit.
    const limit = Math.max(
      this.maxInternalVolume,
      this.states.get(id)?.base || 0,
      this.testBaseline?.id === id ? this.testBaseline.base : 0,
    );
    if (!this.writer || !Number.isFinite(value) || value < 0 || value > limit) {
      this.lastWriteError = "Value " + String(value) + " outside allowed range 0–" + limit;
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
    if (
      st.lastWrite !== null &&
      Number.isFinite(now) &&
      now > 0 &&
      Math.abs(now - st.lastWrite) <= this.volumeTolerance(st.lastWrite, 0.035, st.base, 0.03)
    ) {
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
      const excluded =
        this.preferences.scope === "all"
          ? [...new Set([...this.preferences.excluded, id])]
          : this.preferences.excluded.filter((value) => value !== id);
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
    } catch (_) {}
    const remote = conn.remoteAudioSSRCs;
    const entries =
      remote instanceof Map
        ? [...remote.entries()]
        : remote && typeof remote === "object"
          ? Object.entries(remote)
          : [];
    this.mappingDebug =
      "remoteAudioSSRCs: " +
      (remote instanceof Map ? "Map" : Array.isArray(remote) ? "Array" : typeof remote) +
      ", entries: " +
      entries.length;
    const wanted = String(ssrc);
    const matches = new Set();
    for (const [rawKey, rawValue] of entries) {
      const key = String(rawKey);
      const value = rawValue;
      if (allowed.has(key)) {
        if (String(value) === wanted) matches.add(key);
        if (
          value &&
          typeof value === "object" &&
          [value.ssrc, value.audioSSRC, value.audioSsrc, value.audio_ssrc].some(
            (v) => String(v) === wanted,
          )
        ) {
          matches.add(key);
        }
      }
      if (key === wanted) {
        const id = String(value?.userId ?? value?.user_id ?? value?.id ?? value ?? "");
        if (allowed.has(id)) matches.add(id);
      }
      if (value && typeof value === "object") {
        const id = String(value.userId ?? value.user_id ?? value.id ?? "");
        if (
          allowed.has(id) &&
          [value.ssrc, value.audioSSRC, value.audioSsrc, value.audio_ssrc].some(
            (v) => String(v) === wanted,
          )
        ) {
          matches.add(id);
        }
      }
    }
    return matches.size === 1 ? [...matches][0] : "";
  }
  collect(conn, data, allowed = new Set(this.participants().map((p) => p.id))) {
    const map = new Map();
    let packets = 0,
      mapped = 0;
    for (const group of Object.values(data?.rtp?.inbound || {})) {
      const samples = Array.isArray(group) ? group : Object.values(group || {});
      for (const sample of samples) {
        if (
          !Number.isFinite(sample?.ssrc) ||
          !Number.isFinite(sample?.audioLevel) ||
          sample.audioLevel < 0 ||
          sample.audioLevel > 1
        )
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
          this.writerRetryAt = performance.now() + 5000;
        }
        this.status = this.t("writerWaiting");
        return;
      }
      request = createStatsRequest(conn);
      this.pendingStats = request;
      const data = await request.promise;
      if (!data || !this.enabled || generation !== this.generation) return;
      // A channel may change while getStats is pending.
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
      for (const id of this.effectiveTargets([...allowed].map((id) => ({ id })))) {
        if (!allowed.has(id)) continue;
        const input = map.get(id);
        if (!input) {
          const state = this.states.get(id);
          if (state) interruptSpeech(state);
          this.status = this.t("unavailable");
          continue;
        }
        const level = input.level;
        const now = this.read(id);
        if (!Number.isFinite(now) || now <= 0) {
          // Keep muted users muted and recalibrate if their slider is raised later.
          this.states.delete(id);
          this.status = this.t(now === 0 ? "muted" : "unavailable");
          continue;
        }
        let st = this.states.get(id);
        if (!st || (st.lastWrite === null && st.base !== now)) {
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
            // An external slider change establishes a new baseline.
            st = createUserState(now);
            st.lastLevel = level;
            st.sampleAt = performance.now();
            this.states.set(id, st);
            this.status = this.t("manualBase");
            continue;
          }
          st.writeUnconfirmed = 0;
          this.diagnostic.confirmed++;
        }
        const settings = this.settingsFor(id);
        const timestamp = performance.now();
        const gain = calculateGain(st, level, input.detected, timestamp, settings);
        const ceiling = Math.min(
          this.ceilingFor(st.base),
          settings.mode === "attenuate" ? st.base : Infinity,
        );
        const floor = Math.min(0.02, st.base * settings.minGain);
        const desired = Math.max(floor, Math.min(ceiling, st.base * gain));
        const next = Math.max(
          floor,
          Math.min(ceiling, smoothVolume(st, now, desired, timestamp, settings)),
        );
        st.lastGain = next / st.base;
        this.diagnostic.latest =
          "audio=" +
          level.toFixed(3) +
          ", average=" +
          (st.ema ?? 0).toFixed(3) +
          ", gain=" +
          st.lastGain.toFixed(2) +
          "x, store=" +
          now.toFixed(3) +
          "→" +
          next.toFixed(3);
        this.status = this.t(
          !st.talking ? "waitingSpeech" : st.voiceCount < 7 ? "learning" : "active",
        );
        if (Math.abs(next - now) > Math.min(0.008, st.base * 0.005)) {
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
        const timer = setTimeout(resolve, 3000);
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
      } catch (_) {}
      this.testRunning = false;
      this.testBaseline = null;
      this.cancelTest = null;
    }
  }
  insertNearVolume(tree, item) {
    const matches = [];
    const visited = new Set();
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
          const label = [p.id, p.label, p.title]
            .filter((v) => typeof v === "string")
            .join(" ")
            .toLowerCase();
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
    } catch (_) {}
  }
  getLiveSnapshot(id) {
    const st = this.states.get(String(id));
    const active = this.isSelected(id);
    const actual = this.read(id);
    const base = st?.base;
    const relative =
      Number.isFinite(actual) && Number.isFinite(base) && base > 0 ? actual / base : 1;
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
      base,
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
            pointerEvents: "none",
          },
          "aria-label": this.t("meter"),
        },
        R.createElement("div", null, this.t(this.userStatus(userId))),
        data.active && Number.isFinite(data.base)
          ? R.createElement(
              "div",
              { style: { marginTop: 5, color: "var(--text-muted)" } },
              this.t("correction", (data.ratio * 100).toFixed(0)),
            )
          : null,
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
          // Like ContextMenu.buildItem's toggle hook, this belongs to the menu render.
          // Radio items have no built-in state: refresh their checked props on click.
          const [, rerenderMenu] = BdApi.React.useState(0);
          const item = BdApi.ContextMenu.buildItem({
            id: "voice-normalizer-toggle",
            type: "toggle",
            label: this.t("toggle"),
            checked: this.isSelected(id),
            action: () => this.select(id, !this.isSelected(id)),
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
                action: () => {
                  this.setUserProfile(id, profile);
                  rerenderMenu((value) => value + 1);
                },
              })),
              { type: "separator" },
              {
                id: "voice-normalizer-reset",
                label: this.t("reset"),
                disabled: !this.states.has(String(id)),
                action: () => this.resetLearning(id),
              },
            ],
          });
          if (controls) this.insertNearVolume(tree, controls);
          // React clears the meter's refresh interval when the menu unmounts.
          try {
            const meter = BdApi.ContextMenu.buildItem({
              type: "control",
              id: "voice-normalizer-live-meter",
              control: () =>
                BdApi.React.createElement(this.menuMeterComponent(), { userId: String(id) }),
            });
            if (meter) this.insertNearVolume(tree, meter);
          } catch (error) {
            this.status = this.t("error", String(error?.message || error));
          }
          this.insertNearVolume(tree, item);
        });
        if (typeof unpatch === "function") this.unpatches.push(unpatch);
      } catch (_) {}
    }
  }
  getSettingsPanel() {
    return createSettingsPanel(this, document);
  }
};

const { createUserState, calculateGain } = require("./audio/leveler");
const { DEFAULT_SETTINGS, normalizeSettings } = require("./audio/settings");
const { createSettingsControls } = require("./ui/settings-controls");

module.exports = class VoiceNormalizer {
  constructor() {
    this.targets = new Set();
    this.states = new Map();
    this.enabled = false;
    this.timer = null;
    this.busy = false;
    this.generation = 0;
    this.connection = null;
    this.writer = null;
    this.writerInfo = "не проверен";
    this.unpatches = [];
    this.panels = new Set();
    this.status = "Выключено";
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
    // Discord builds can expose percent-like or amplitude-like internal volumes.
    this.maxInternalVolume = 200;
    this.settings = { ...DEFAULT_SETTINGS };
    this.mappingDebug = "ещё нет данных";
    this.lastWriteError = "нет";
  }
  start() {
    this.loadSettings();
    this.loadTargets();
    this.resolveWriter();
    this.installMenus();
    this.resume();
    BdApi.UI.showToast("VoiceNormalizer: настройки и ПКМ по пользователю", { type: "info" });
  }
  stop() {
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
    this.mediaProvider = null;
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
      this.toast(
        "Не удалось загрузить выбранных пользователей: " + String(error?.message || error),
        "error",
      );
    }
  }
  saveTargets() {
    try {
      BdApi.Data.save("VoiceNormalizer", "targets", [...this.targets]);
    } catch (error) {
      this.toast(
        "Не удалось сохранить выбор пользователей: " + String(error?.message || error),
        "error",
      );
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
    this.resetConnection();
    this.status = "Выключено";
  }
  resume() {
    if (this.enabled || !this.targets.size) return;
    this.enabled = true;
    const generation = ++this.generation;
    this.timer = setInterval(() => {
      this.tick(generation).catch(() => {});
    }, 100);
    this.status = "Ожидаем голосовой канал и речь выбранных пользователей";
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
      this.status = "Не удалось сохранить настройки: " + String(error?.message || error);
    }
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
    this.writerInfo = "не найден setLocalVolume";
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
      name: users?.getUser?.(id)?.globalName || users?.getUser?.(id)?.username || "Участник",
    }));
  }
  toast(msg, type = "info") {
    this.status = msg;
    try {
      BdApi.UI.showToast(msg, { type });
    } catch (_) {}
  }
  write(id, value) {
    if (!this.writer || !Number.isFinite(value) || value < 0 || value > this.maxInternalVolume) {
      this.lastWriteError =
        "значение " + String(value) + " вне допустимого диапазона 0–" + this.maxInternalVolume;
      return false;
    }
    try {
      this.writer(String(id), value);
      this.diagnostic.writes++;
      this.lastWriteError = "нет";
      return true;
    } catch (e) {
      this.lastWriteError = String(e?.message || e);
      this.status = "Ошибка записи громкости: " + this.lastWriteError;
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
    if (
      st.lastWrite !== null &&
      Number.isFinite(now) &&
      now > 0 &&
      Math.abs(now - st.lastWrite) <= Math.max(0.03, st.lastWrite * 0.035)
    ) {
      this.write(id, st.base);
    }
    this.states.delete(id);
  }
  turnOff() {
    this.suspend();
    this.targets.clear();
    this.saveTargets();
  }
  select(id, on) {
    id = String(id);
    if (!id || id === BdApi.Webpack.getStore("UserStore")?.getCurrentUser?.()?.id) return;
    if (!on) {
      this.targets.delete(id);
      this.restore(id);
      if (!this.targets.size) this.suspend();
      else this.status = "Выбрано: " + this.targets.size;
      this.saveTargets();
      return;
    }
    if (this.testRunning) {
      this.toast("Заверши ручной тест", "warning");
      return;
    }
    if (this.targets.has(id)) return;
    this.targets.add(id);
    this.resume();
    this.saveTargets();
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
      ", записей: " +
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
    if (!this.enabled || this.busy || this.testRunning || generation !== this.generation) return;
    this.busy = true;
    try {
      const conn = this.connect();
      if (conn !== this.connection) this.resetConnection(conn);
      if (!conn) {
        this.status = "Ожидаем голосовой канал · выбор пользователей сохранён";
        return;
      }
      if (!this.writer) {
        if (!this.writerRetryAt || performance.now() >= this.writerRetryAt) {
          this.resolveWriter();
          this.writerRetryAt = performance.now() + 5000;
        }
        this.status = "Ожидаем модуль управления громкостью Discord";
        return;
      }
      const data = await Promise.resolve(conn.getStats());
      if (!this.enabled || generation !== this.generation) return;
      // A channel may change while getStats is pending.
      if (this.connect() !== conn) {
        this.resetConnection();
        return;
      }
      const allowed = new Set(this.participants().map((person) => person.id));
      for (const id of [...this.states.keys()]) {
        if (!allowed.has(id)) this.restore(id);
      }
      const { map, packets, mapped } = this.collect(conn, data, allowed);
      this.diagnostic.polls++;
      this.diagnostic.packets = packets;
      this.diagnostic.mapped = mapped;
      this.status = "Ожидаем речь выбранных пользователей";
      for (const id of [...this.targets]) {
        if (!allowed.has(id)) continue;
        const input = map.get(id);
        if (!input) {
          this.status = "SSRC не сопоставлен с выбранным человеком";
          continue;
        }
        const level = input.level;
        const now = this.read(id);
        if (!Number.isFinite(now) || now <= 0) {
          // Keep muted users muted and recalibrate if their slider is raised later.
          this.states.delete(id);
          this.status = "Нет значения громкости в store";
          continue;
        }
        let st = this.states.get(id);
        if (!st || (st.lastWrite === null && st.base !== now)) {
          st = createUserState(now);
          this.states.set(id, st);
        }
        st.lastLevel = level;
        if (st.lastWrite !== null) {
          const diff = Math.abs(now - st.lastWrite);
          if (diff > Math.max(0.04, st.lastWrite * 0.04)) {
            if (performance.now() - st.lastWriteTime < 700) {
              st.writeUnconfirmed++;
              continue;
            }
            // An external slider change establishes a new baseline.
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
            this.status = "Ручная громкость изменена — новая база";
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
        this.diagnostic.latest =
          "audio=" +
          level.toFixed(3) +
          ", среднее=" +
          (st.ema ?? 0).toFixed(3) +
          ", gain=" +
          st.lastGain.toFixed(2) +
          "x, store=" +
          now.toFixed(3) +
          "→" +
          next.toFixed(3);
        this.status = "Активно · " + this.diagnostic.latest;
        if (Math.abs(next - now) > 0.008) {
          if (this.write(id, next)) {
            st.lastWrite = next;
            st.lastWriteTime = performance.now();
          }
        }
      }
    } catch (e) {
      this.diagnostic.failures++;
      this.status = "Ошибка: " + String(e?.message || e);
    } finally {
      this.busy = false;
    }
  }
  async halfVolumeTest(id) {
    if (this.enabled || this.testRunning) {
      this.toast("Сначала выключи автообработку", "warning");
      return;
    }
    if (!this.writer && !this.resolveWriter()) {
      this.toast("Не найден модуль громкости", "warning");
      return;
    }
    id = String(id);
    const before = this.read(id);
    if (!Number.isFinite(before) || before <= 0) {
      this.toast("Не прочитана громкость", "warning");
      return;
    }
    this.testRunning = true;
    const target = Math.max(0.01, before * 0.5);
    try {
      if (!this.write(id, target)) throw new Error("не удалось отправить значение");
      this.status = "Тест ×0.5 запущен — 3 секунды пониженной громкости";
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        this.cancelTest = () => {
          clearTimeout(timer);
          const now = this.read(id);
          if (Number.isFinite(now) && Math.abs(now - target) < Math.max(0.035, target * 0.08))
            this.write(id, before);
          resolve();
        };
      });
      const after = this.read(id);
      const ok =
        Number.isFinite(after) && Math.abs(after - target) < Math.max(0.035, target * 0.08);
      this.status =
        "Тест ×0.5: до=" +
        before.toFixed(4) +
        ", ожидается=" +
        target.toFixed(4) +
        ", Discord=" +
        String(Number.isFinite(after) ? after.toFixed(4) : after) +
        ", результат=" +
        (ok ? "ОК" : "не подтверждён");
    } catch (e) {
      this.status = "Ошибка теста: " + String(e?.message || e);
    } finally {
      try {
        const now = this.read(id);
        if (Number.isFinite(now) && Math.abs(now - target) < Math.max(0.035, target * 0.08))
          this.write(id, before);
      } catch (_) {}
      this.testRunning = false;
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
    const active = this.targets.has(String(id));
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
        const handle = setInterval(() => rerender((t) => t + 1), 150);
        return () => clearInterval(handle);
      }, []);
      const data = this.getLiveSnapshot(userId);
      const text = (str, style = {}) => R.createElement("div", { style }, str);
      const bar = (value, color) =>
        R.createElement(
          "div",
          {
            style: {
              height: 6,
              background: "var(--background-tertiary)",
              borderRadius: 6,
              overflow: "hidden",
              width: "100%",
            },
          },
          R.createElement("div", {
            style: {
              width: (Math.max(0, Math.min(1, value)) * 100).toFixed(1) + "%",
              height: "100%",
              background: color,
              borderRadius: 6,
              transition: "width 150ms linear",
            },
          }),
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
            pointerEvents: "none",
          },
          "aria-label": "VoiceNormalizer: индикатор голоса",
        },
        text(data.active ? "Нормализация: включена" : "Нормализация: выключена", {
          fontWeight: 600,
          color: data.active ? "var(--text-positive)" : "var(--text-muted)",
        }),
        text("Входящий уровень: " + (data.level * 100).toFixed(1) + "%"),
        bar(data.level, "var(--brand-500,#5865f2)"),
        text("Средний уровень: " + (data.average * 100).toFixed(1) + "%"),
        bar(data.average, "#44bba4"),
        text(
          data.active && data.volumeKnown && Number.isFinite(data.base)
            ? "Громкость: " +
                (data.ratio * 100).toFixed(0) +
                "% от исходной · " +
                (data.gainDb >= 0 ? "+" : "") +
                data.gainDb.toFixed(1) +
                " дБ"
            : "Включи обработку, чтобы увидеть изменение",
        ),
        bar(data.active ? data.ratio / 2 : 0.5, "#faa61a"),
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
            label: "Выравнивать громкость голоса",
            checked: this.targets.has(String(id)),
            action: () => this.select(id, !this.targets.has(String(id))),
          });
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
            this.status = "Индикатор в ПКМ недоступен: " + String(error?.message || error);
          }
          this.insertNearVolume(tree, item);
        });
        if (typeof unpatch === "function") this.unpatches.push(unpatch);
      } catch (_) {}
    }
  }
  getSettingsPanel() {
    const root = document.createElement("div");
    root.style.cssText =
      "padding:18px;display:flex;flex-direction:column;gap:12px;color:var(--text-normal)";
    const title = document.createElement("h3");
    title.textContent = "VoiceNormalizer · 1.2.1 Alpha";
    title.style.margin = "0";
    const help = document.createElement("p");
    help.textContent =
      "ПКМ на участнике → Выравнивать громкость голоса. Выбор сохраняется по user ID после перезапуска Discord и смены канала. В новом соединении средний уровень речи вычисляется заново. При молчании усиление не увеличивается.";
    help.style.cssText = "margin:0;color:var(--text-muted);line-height:1.4";
    const livePanel = document.createElement("div");
    livePanel.style.cssText = "display:flex;flex-direction:column;gap:8px";
    const debug = document.createElement("pre");
    debug.style.cssText =
      "white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;border-radius:9px;background:var(--background-secondary);font-size:12px";
    const people = document.createElement("div");
    people.style.cssText =
      "display:flex;flex-direction:column;gap:8px;max-height:240px;overflow:auto";
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
    const makeButton = (text, fn, secondary = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText =
        "padding:9px 12px;border-radius:9px;border:0;cursor:pointer;font-weight:600;color:white;background:" +
        (secondary ? "var(--background-tertiary)" : "var(--brand-500,#5865f2)");
      b.onclick = fn;
      return b;
    };
    const refresh = () => {
      people.replaceChildren();
      const list = this.participants();
      for (const person of list) {
        const line = document.createElement("div");
        line.style.cssText =
          "display:flex;gap:8px;align-items:center;padding:9px;background:var(--background-secondary);border-radius:9px";
        const name = document.createElement("span");
        name.textContent = person.name;
        name.style.flex = "1";
        const test = makeButton(
          "Тест ×0.5",
          () => this.halfVolumeTest(person.id).then(render),
          true,
        );
        test.disabled = this.enabled || this.testRunning;
        const enabled = this.targets.has(person.id);
        const toggle = makeButton(enabled ? "Выключить" : "Включить", () => {
          this.select(person.id, !enabled);
          refresh();
          render();
        });
        line.append(name, test, toggle);
        people.append(line);
      }
      if (!list.length) people.textContent = "Участники не найдены. Проверь голосовой канал.";
    };
    const render = () => {
      livePanel.replaceChildren();
      const roster = new Map(this.participants().map((p) => [p.id, p.name]));
      if (!this.targets.size) {
        const empty = document.createElement("div");
        empty.textContent = "Живой индикатор появится после включения нормализации.";
        empty.style.cssText = "color:var(--text-muted);font-size:12px";
        livePanel.append(empty);
      }
      for (const id of this.targets) {
        const v = this.getLiveSnapshot(id);
        const card = document.createElement("div");
        card.style.cssText =
          "background:var(--background-secondary);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:7px";
        const name = document.createElement("div");
        name.textContent =
          roster.get(id) || BdApi.Webpack.getStore("UserStore")?.getUser?.(id)?.username || id;
        name.style.cssText = "font-weight:700;font-size:13px";
        const detail = document.createElement("div");
        detail.style.cssText = "font-size:12px;color:var(--text-muted)";
        detail.textContent =
          "Голос " +
          (v.level * 100).toFixed(1) +
          "% · Среднее " +
          (v.average * 100).toFixed(1) +
          "% · Громкость " +
          (v.ratio * 100).toFixed(0) +
          "% от исходной (" +
          (v.gainDb >= 0 ? "+" : "") +
          v.gainDb.toFixed(1) +
          " дБ)";
        const track = document.createElement("div");
        track.style.cssText =
          "height:7px;overflow:hidden;border-radius:6px;background:var(--background-tertiary);position:relative";
        const fill = document.createElement("div");
        fill.style.cssText =
          "height:100%;background:var(--brand-500,#5865f2);transition:width 200ms";
        fill.style.width = Math.min(100, Math.max(0, v.ratio * 50)).toFixed(1) + "%";
        const baseMark = document.createElement("div");
        baseMark.style.cssText =
          "position:absolute;left:50%;top:0;height:100%;width:2px;background:var(--text-normal);opacity:.55";
        track.append(fill, baseMark);
        const remove = makeButton(
          "Отключить для пользователя",
          () => {
            this.select(id, false);
            refresh();
            render();
          },
          true,
        );
        if (!this.states.has(id))
          detail.textContent = "Выбор сохранён · ожидаем участника и голосовые данные";
        card.append(name, detail, track, remove);
        livePanel.append(card);
      }
      debug.textContent = [
        "Состояние: " + this.status,
        "Модуль: " + this.writerInfo,
        "Выбрано: " + this.targets.size + ", опросов: " + this.diagnostic.polls,
        "Входящих потоков: " +
          this.diagnostic.packets +
          ", определены пользователи: " +
          this.diagnostic.mapped,
        "Записей громкости: " +
          this.diagnostic.writes +
          ", подтверждений: " +
          this.diagnostic.confirmed,
        "Сопоставление: " + this.mappingDebug,
        "Последняя ошибка записи: " + this.lastWriteError,
        "Последнее: " + this.diagnostic.latest,
      ].join("\n");
    };
    const stop = makeButton(
      "■ Отключить для всех",
      () => {
        this.turnOff();
        refresh();
        render();
      },
      true,
    );
    const reload = makeButton("↻ Обновить участников", () => {
      refresh();
      render();
    });
    actions.append(stop, reload);
    const controls = createSettingsControls(document, this.settings, (next) =>
      this.updateSettings(next),
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

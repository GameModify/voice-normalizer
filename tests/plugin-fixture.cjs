const Plugin = require("../VoiceNormalizer.plugin.js");
const { mockClock } = require("./clock.cjs");

function createPatcher() {
  return {
    before(_, object, name, callback) {
      const original = object[name];
      const wrapper = function (...args) {
        callback(this, args);
        return original.apply(this, args);
      };
      object[name] = wrapper;
      return () => {
        object[name] = original;
      };
    },
  };
}

function fixture(t, options = {}) {
  const advance = mockClock(t);
  const saved = { targets: options.targets ?? ["friend"], ...options.data };
  const preferences = new Map(Object.entries(options.volumes ?? { friend: 100, self: 100 }));
  const scale = options.scale ?? 1;
  const volume = new Map([...preferences].map(([id, value]) => [id, value * scale]));
  const writes = [];
  let roster = options.roster ?? ["friend", "self"];
  let level = options.level ?? 0.4;
  let detected = 1,
    interval = 100,
    missing = false;
  let connection;
  const connect = () => {
    connection = {
      context: "default",
      getLocalVolume: (id) => volume.get(id) ?? 100 * scale,
      setLocalVolume: (id, value) => {
        writes.push([id, value]);
        volume.set(id, value);
      },
      getUserIdBySsrc: (ssrc) => roster[ssrc - 1],
      remoteAudioSSRCs: new Map(roster.map((id, i) => [id, i + 1])),
      getStats: () => {
        advance(interval);
        return {
          rtp: {
            inbound: {
              audio: missing
                ? []
                : roster.map((_, i) => ({
                    ssrc: i + 1,
                    audioLevel: level,
                    audioDetected: detected,
                  })),
            },
          },
        };
      },
    };
    return connection;
  };
  const setVolume = (id, value) => {
    preferences.set(id, value);
    if (connection) connection.setLocalVolume(id, value * scale);
    else volume.set(id, value * scale);
  };
  let actionWrites = 0;
  const actions = {
    setLocalVolume: (id, value) => {
      actionWrites++;
      setVolume(id, value);
    },
  };
  const engine = {
    eachConnection: (cb) => {
      if (connection) cb(connection);
    },
  };
  const stores = {
    LocaleStore: { locale: "ru" },
    MediaEngineStore: { getLocalVolume: (id) => preferences.get(id) ?? 100 },
    UserStore: { getCurrentUser: () => ({ id: "self" }), getUser: (id) => ({ username: id }) },
    VoiceStateStore: {
      getCurrentClientVoiceChannelId: () => "room",
      getVoiceStatesForChannel: () => roster.map((userId) => ({ userId })),
    },
  };
  global.BdApi = {
    Data: {
      load: (_, key) => structuredClone(saved[key]),
      save: (_, key, value) => {
        saved[key] = structuredClone(value);
      },
    },
    Webpack: {
      getStore: (name) => stores[name],
      getModule: (predicate) => [actions, { getMediaEngine: () => engine }].find(predicate),
    },
    Patcher: createPatcher(),
    ContextMenu: { patch: () => () => {} },
    UI: { showToast() {} },
  };
  const plugins = [];
  const create = () => {
    const plugin = new Plugin();
    plugin.start();
    plugins.push(plugin);
    if (options.seedReference !== false) for (const id of roster) plugin.references.set(id, 0.1);
    return plugin;
  };
  if (options.connected !== false) connect();
  t.after(() => plugins.forEach((p) => p.stop()));
  return {
    create,
    volume,
    preferences,
    writes,
    saved,
    data: saved,
    stores,
    connect,
    setVolume,
    disconnect: () => {
      connection = null;
    },
    setParticipants: (next) => {
      roster = next;
    },
    setRoster: (next) => {
      roster = next;
    },
    setLevel: (next) => {
      level = next;
      detected = next > 0 ? 1 : 0;
    },
    setInput: (next, active = 1) => {
      level = next;
      detected = active;
    },
    setInterval: (next) => {
      interval = next;
    },
    setMissing: (next) => {
      missing = next;
    },
    getConnection: () => connection,
    getActionWrites: () => actionWrites,
    tick: async (p, count = 1) => {
      for (let i = 0; i < count; i++) await p.tick(p.generation);
    },
  };
}
module.exports = { fixture, createPatcher };

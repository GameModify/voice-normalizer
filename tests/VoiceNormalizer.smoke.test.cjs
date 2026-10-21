const { mockClock } = require("./clock.cjs");
const advanceClock = mockClock();
// Smoke tests for VoiceNormalizer without connecting to Discord.
const assert = require("node:assert/strict");
const modPath = "../VoiceNormalizer.plugin.js";
const volume = new Map([["friend", 1]]);
let level = 0.4,
  detected = 1;
const actions = {
  setLocalVolume(id, v) {
    volume.set(id, v);
  },
};
const conn = {
  context: "default",
  getStats() {
    advanceClock();
    return Promise.resolve({
      rtp: { inbound: { a: [{ ssrc: 123, audioLevel: level, audioDetected: detected }] } },
    });
  },
  getUserIdBySsrc(ssrc) {
    return ssrc === 123 ? "friend" : null;
  },
};
const stores = {
  MediaEngineStore: {
    getLocalVolume(id) {
      return volume.get(id) ?? 1;
    },
  },
  UserStore: {
    getCurrentUser() {
      return { id: "self" };
    },
    getUser(id) {
      return { globalName: id };
    },
  },
  VoiceStateStore: {
    getCurrentClientVoiceChannelId() {
      return "channel";
    },
    getVoiceStatesForChannel() {
      return { friend: { userId: "friend" } };
    },
  },
  SelectedChannelStore: {
    getChannelId() {
      return "channel";
    },
  },
};
global.BdApi = {
  Webpack: {
    getModule(pred) {
      const options = [
        actions,
        {
          getMediaEngine() {
            return {
              eachConnection(cb) {
                cb(conn);
              },
            };
          },
        },
      ];
      return options.find(pred);
    },
    getStore(name) {
      return stores[name];
    },
  },
  ContextMenu: {
    patch() {
      return () => {};
    },
    buildItem() {
      return {};
    },
  },
  UI: { showToast() {} },
};
const Plugin = require(modPath);
const p = new Plugin();
(async () => {
  p.start();
  assert.equal(p.resolveWriter(), true, "action lookup");
  assert.equal(p.read("friend"), 1);
  await p.halfVolumeTest("friend");
  assert(Math.abs(volume.get("friend") - 1) < 0.00001, "manual test restored");
  p.select("friend", true);
  const token = p.generation;
  level = 0.4;
  await p.tick(token);
  assert(volume.get("friend") < 1, "loud speech reduced volume");
  const reduced = volume.get("friend");
  p.turnOff();
  assert(Math.abs(volume.get("friend") - 1) < 0.00001, "disable restored volume");
  volume.set("friend", 1);
  level = 0.012;
  p.select("friend", true);
  for (let i = 0; i < 15; i++) await p.tick(p.generation);
  assert(volume.get("friend") > 1, "soft speech boosted");
  assert(volume.get("friend") <= 2, "absolute ceiling held");
  p.turnOff();
  assert(Math.abs(volume.get("friend") - 1) < 0.00001, "boost restore");
  console.log(
    "PASS: writer, 50% temporary test, peak reduction, soft speech boost, cap, restoration",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

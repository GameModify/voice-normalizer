const assert = require("node:assert/strict");
const Plugin = require("../VoiceNormalizer.plugin.js");
let loudness = 0.55,
  isTalking = 1,
  volume = 100;
const actions = {
  setLocalVolume(id, v) {
    assert.equal(id, "friend");
    volume = v;
  },
};
const conn = {
  remoteAudioSSRCs: new Map([["friend", 123]]),
  getUserIdBySsrc() {
    return undefined;
  },
  getStats() {
    return Promise.resolve({
      rtp: { inbound: { audio: [{ ssrc: 123, audioLevel: loudness, audioDetected: isTalking }] } },
    });
  },
};
global.BdApi = {
  Webpack: {
    getModule(f) {
      return [
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
      ].find(f);
    },
    getStore(n) {
      if (n === "MediaEngineStore")
        return {
          getLocalVolume() {
            return volume;
          },
        };
      if (n === "UserStore")
        return {
          getCurrentUser() {
            return { id: "self" };
          },
          getUser(id) {
            return { username: id };
          },
        };
      if (n === "VoiceStateStore")
        return {
          getCurrentClientVoiceChannelId() {
            return "room";
          },
          getVoiceStatesForChannel() {
            return { a: { userId: "friend" }, b: { userId: "self" } };
          },
        };
      if (n === "SelectedChannelStore")
        return {
          getChannelId() {
            return "room";
          },
        };
    },
  },
  ContextMenu: {
    patch() {
      return () => {};
    },
    buildItem(v) {
      return v;
    },
  },
  UI: { showToast() {} },
};
(async () => {
  const p = new Plugin();
  p.start();
  p.select("friend", true);
  for (let i = 0; i < 14; i++) await p.tick(p.generation);
  const st = p.states.get("friend");
  assert(st.ema > 0.4, "average initialized");
  assert(volume < 50, "loudness reduced");
  const savedAverage = st.ema,
    savedVolume = volume;
  loudness = 0;
  isTalking = 0;
  for (let i = 0; i < 20; i++) await p.tick(p.generation);
  assert.equal(st.ema, savedAverage, "silence holds average");
  assert(Math.abs(volume - savedVolume) < 1, "silence holds gain");
  loudness = 0.05;
  isTalking = 1;
  for (let i = 0; i < 10; i++) await p.tick(p.generation);
  assert(st.ema > 0.3, "slow average should not collapse on quieter short speech");
  p.turnOff();
  assert(Math.abs(volume - 100) < 0.0001, "original volume restored");
  console.log("PASS: loud speech attenuation, silence hold, slow average, resumed speech, restore");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

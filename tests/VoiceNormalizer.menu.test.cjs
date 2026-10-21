const assert = require("node:assert/strict");
const Plugin = require("../VoiceNormalizer.plugin.js");
let menuPatch;
const nativeVolumeItem = { props: { id: "user-volume", label: "Громкость пользователя" } };
global.BdApi = {
  Webpack: {
    getModule(match) {
      const exports = [
        { setLocalVolume() {}, setLocalPan() {} },
        {
          getMediaEngine() {
            return { eachConnection() {} };
          },
        },
      ];
      return exports.find(match);
    },
    getStore(name) {
      if (name === "UserStore")
        return {
          getCurrentUser() {
            return { id: "me" };
          },
        };
      if (name === "MediaEngineStore")
        return {
          getLocalVolume() {
            return 40;
          },
        };
    },
  },
  UI: { showToast() {} },
  ContextMenu: {
    patch(nav, cb) {
      if (nav === "user-context") menuPatch = cb;
      return () => {};
    },
    buildItem(props) {
      return { props };
    },
  },
  React: {
    createElement(type, props, ...children) {
      return { type, props, children };
    },
    useState() {
      return [0, () => {}];
    },
    useEffect(fn) {
      const clean = fn();
      clean();
    },
  },
};
const plugin = new Plugin();
plugin.start();
assert.equal(typeof menuPatch, "function");
const tree = { props: { children: [nativeVolumeItem] } };
menuPatch(tree, { user: { id: "friend" } });
assert.equal(tree.props.children.length, 4);
const ids = tree.props.children.map((x) => x.props.id);
assert.equal(ids[0], "user-volume");
assert(ids.includes("voice-normalizer-toggle"));
assert(ids.includes("voice-normalizer-live-meter"));
const options = tree.props.children.find((x) => x.props.id === "voice-normalizer-options");
assert.equal(options.props.items.filter((item) => item.type === "radio").length, 4);
const chooseSoft = options.props.items.find((item) => item.id === "voice-normalizer-profile-soft");
chooseSoft.action();
assert.equal(plugin.profileFor("friend"), "soft");
const control = tree.props.children.find((x) => x.props.id === "voice-normalizer-live-meter");
const reactNode = control.props.control();
assert.equal(typeof reactNode.type, "function");
const visual = reactNode.type(reactNode.props);
assert.equal(visual.type, "div");
plugin.stop();
console.log("PASS: context menu placement, live control, render and hook cleanup");

const assert = require("node:assert/strict");
const Plugin = require("../VoiceNormalizer.plugin.js");
let menuPatch;
let renderMenu;
let hookIndex = 0;
const hookStates = [];
const saved = {};
const nativeVolumeItem = { props: { id: "user-volume", label: "Громкость пользователя" } };
global.BdApi = {
  Data: {
    load: (_, key) => saved[key],
    save: (_, key, value) => {
      saved[key] = structuredClone(value);
    },
  },
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
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hookStates)) hookStates[index] = initial;
      return [
        hookStates[index],
        (next) => {
          hookStates[index] = typeof next === "function" ? next(hookStates[index]) : next;
          renderMenu();
        },
      ];
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
let tree;
renderMenu = () => {
  hookIndex = 0;
  tree = { props: { children: [nativeVolumeItem] } };
  menuPatch(tree, { user: { id: "friend" } });
};
renderMenu();
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
// No voice data, polling or reopening the menu may be needed for checked state.
for (const profile of ["balanced", "inherit", "aggressive", "soft", "inherit", "balanced"]) {
  const submenu = tree.props.children.find((item) => item.props.id === "voice-normalizer-options");
  const radios = submenu.props.items.filter((item) => item.type === "radio");
  const next = radios.find((item) => item.id === "voice-normalizer-profile-" + profile);
  assert.equal(next.checked, false);
  next.action();
  const updated = tree.props.children.find((item) => item.props.id === "voice-normalizer-options");
  assert.deepEqual(
    updated.props.items.filter((item) => item.checked).map((item) => item.id),
    [next.id],
  );
  assert.equal(plugin.profileFor("friend"), profile);
  assert.equal(saved.preferences.profiles.friend ?? "inherit", profile);
  assert.equal(plugin.states.size, 0);
  assert.equal(plugin.timer, null);
}
const control = tree.props.children.find((x) => x.props.id === "voice-normalizer-live-meter");
const reactNode = control.props.control();
assert.equal(typeof reactNode.type, "function");
const visual = reactNode.type(reactNode.props);
assert.equal(visual.type, "div");
plugin.stop();
const restarted = new Plugin();
restarted.start();
assert.equal(restarted.profileFor("friend"), "balanced");
restarted.stop();
console.log(
  "PASS: context menu placement, immediate profile checks without speech, persistence and hook cleanup",
);

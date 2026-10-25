const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { structuredClone } = global;

const root = path.resolve(__dirname, "..");
const { version } = require("../package.json");
assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
execFileSync(process.execPath, [path.join(__dirname, "build.cjs"), "--check"]);
const destination = path.join(root, "dist", `voice-normalizer-${version}`);
const files = ["VoiceNormalizer.plugin.js", "LICENSE"];
const allowed = [...files, "SHA256SUMS.txt"];
fs.mkdirSync(destination, { recursive: true });
for (const file of fs.readdirSync(destination)) {
  assert(allowed.includes(file), `Unexpected release file: ${file}`);
}
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(destination, file));
const plugin = fs.readFileSync(path.join(destination, files[0]), "utf8");
const license = fs
  .readFileSync(path.join(destination, "LICENSE"), "utf8")
  .replace(/\r\n?/g, "\n")
  .trim();
fs.writeFileSync(path.join(destination, "LICENSE"), license + "\n");
assert(plugin.includes(`@version ${version}\n`), "Plugin version mismatch");
assert(plugin.includes(license), "Plugin must include the MIT license");
assert(!/\brequire\s*\(/.test(plugin), "Plugin must not require external runtime files");

// Run the staged file without Node imports, a live Discord connection, disk data,
// or network access. Each instance shares only this fresh in-memory data store.
const data = new Map();
const timers = new Set();
const exported = { exports: {} };
const sandbox = {
  module: exported,
  exports: exported.exports,
  console,
  performance: { now: () => 0 },
  setInterval: () => {
    const timer = {};
    timers.add(timer);
    return timer;
  },
  clearInterval: (timer) => timers.delete(timer),
  setTimeout: () => {
    throw Error("Unexpected asynchronous work during package smoke check");
  },
  clearTimeout: () => {},
  BdApi: {
    Data: {
      load: (_, key) => structuredClone(data.get(key)),
      save: (_, key, value) => data.set(key, structuredClone(value)),
    },
    Webpack: { getModule: () => undefined, getStore: () => undefined },
    UI: { showToast: () => {} },
    ContextMenu: { patch: () => () => {} },
  },
};
vm.runInNewContext(plugin, sandbox, { filename: files[0], timeout: 3000 });
assert.equal(typeof exported.exports, "function");
const first = new exported.exports();
first.start();
assert.equal(first.settings.profile, "balanced");
assert.equal(first.preferences.scope, "selected");
assert.equal(first.targets.size, 0);
first.select("demo-user", true);
first.stop();
const second = new exported.exports();
second.start();
assert(second.targets.has("demo-user"), "Selection did not survive restart");
second.stop();
assert.equal(timers.size, 0, "Stopping the plugin left an interval running");
const checksums = files.map((file) => {
  const bytes = fs.readFileSync(path.join(destination, file));
  return `${crypto.createHash("sha256").update(bytes).digest("hex")}  ${file}`;
});
fs.writeFileSync(path.join(destination, "SHA256SUMS.txt"), checksums.join("\n") + "\n");
assert.deepEqual(fs.readdirSync(destination).sort(), allowed.sort());
console.log(`Release ${version}: staged plugin smoke check passed`);
console.log(path.relative(root, destination));
console.log(checksums.join("\n"));

const { buildSync } = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const { version } = require("../package.json");
const metadata = `/**
 * @name VoiceNormalizer
 * @author GameModify
 * @authorLink https://github.com/GameModify
 * @version ${version}
 * @description Selected-user adaptive voice leveling (experimental). Average speech tracking and conservative peak ducking.
 */`;
const output = path.join(root, "VoiceNormalizer.plugin.js");

const result = buildSync({
  entryPoints: [path.join(root, "src", "index.js")],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "chrome120",
  write: false,
  legalComments: "none",
  logLevel: "warning",
});
const built = metadata + "\n" + result.outputFiles[0].text;
if (process.argv.includes("--check")) {
  const existing = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  if (existing !== built) {
    console.error("Generated VoiceNormalizer.plugin.js is not up to date: run npm run build");
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(output, built);
  console.log("Built " + path.relative(root, output) + " (" + built.length + " chars)");
}

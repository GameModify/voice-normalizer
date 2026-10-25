"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PRESETS,
  BOUNDS,
  DEFAULT_SETTINGS,
  getPreset,
  normalizeSettings,
} = require("../src/audio/settings");
const { createUserState, calculateGain } = require("../src/audio/leveler");
const { createSettingsControls } = require("../src/ui/settings-controls");

test("balanced profile preserves the original normalization constants", () => {
  const settings = getPreset("balanced");
  assert.equal(settings.maxGain, 2);
  assert.equal(settings.minGain, 0.45);
  assert.equal(settings.attack, 0.65);
  assert.equal(settings.release, 0.1);
  assert.deepEqual(normalizeSettings(undefined), settings);
});

test("invalid saved settings fall back safely and valid values are bounded", () => {
  const settings = normalizeSettings({
    profile: "custom",
    targetLevel: -1,
    maxGain: 999,
    minGain: NaN,
    attack: -100,
    release: Infinity,
  });
  assert.equal(settings.maxGain, 2);
  assert.equal(settings.minGain, DEFAULT_SETTINGS.minGain);
  assert.equal(settings.attack, 0.2);
  assert.equal(settings.release, DEFAULT_SETTINGS.release);
});

test("custom gain limits apply to deviations from the learned reference", () => {
  const quiet = createUserState(100, 0.1);
  quiet.ema = 0.045;
  quiet.voiceCount = 15;
  const custom = normalizeSettings({
    profile: "custom",
    targetLevel: 0.18,
    maxGain: 1.25,
    minGain: 0.75,
    attack: 0.7,
    release: 0.08,
  });
  for (let t = 0; t < 500; t += 100) calculateGain(quiet, 0.05, 1, t, custom);
  const boosted = calculateGain(quiet, 0.05, 1, 500, custom);
  assert.equal(boosted, 1.25);
  const loud = createUserState(100, 0.1);
  const reduced = calculateGain(loud, 0.8, 1, 0, custom);
  assert.equal(reduced, 0.75);
});

test("BetterDiscord settings persist and survive plugin restart", () => {
  let saved = null;
  let saveCalls = 0;
  global.BdApi = {
    Data: {
      load(name, key) {
        assert.equal(name, "VoiceNormalizer");
        if (key === "targets") return [];
        if (key === "preferences") return undefined;
        assert.equal(key, "settings");
        return saved;
      },
      save(name, key, value) {
        assert.equal(name, "VoiceNormalizer");
        assert.equal(key, "settings");
        saved = value;
        saveCalls++;
      },
    },
    Webpack: {
      getModule() {
        return null;
      },
      getStore() {
        return null;
      },
    },
    ContextMenu: {
      patch() {
        return () => {};
      },
    },
    UI: { showToast() {} },
  };
  const Plugin = require("../VoiceNormalizer.plugin.js");
  const first = new Plugin();
  first.start();
  first.updateSettings(getPreset("soft"));
  assert.equal(saveCalls, 1);
  assert.equal(saved.maxGain, 1.3);
  first.stop();
  const second = new Plugin();
  second.start();
  assert.equal(second.settings.profile, "soft");
  assert.equal(second.settings.attack, 0.4);
  second.stop();
  delete global.BdApi;
});

test("control panel changes profiles without native dropdowns and keeps advanced sliders", () => {
  const { createDocument, traverse } = require("./fake-dom.cjs");
  const doc = createDocument();
  let settings = getPreset("balanced");
  const panel = createSettingsControls(doc, settings, (input) => {
    settings = normalizeSettings(input);
    return settings;
  });
  const elements = traverse(panel);
  const soft = elements.find((node) => node.dataset.value === "soft");
  const sliders = elements.filter((node) => node.tag === "input" && node.type === "range");
  assert.equal(sliders.length, 4);
  assert.equal(
    elements.some((node) => node.tag === "select"),
    false,
  );
  assert.equal(panel.advanced.open, false);
  soft.fire("click");
  assert.equal(settings.maxGain, 1.3);
  const targetSlider = sliders[0];
  targetSlider.value = "1.5";
  targetSlider.fire("input");
  assert.equal(settings.profile, "custom");
  assert.equal(settings.maxGain, 1.5);
  assert.equal(
    traverse(panel).find((node) => node.dataset.value === "soft"),
    soft,
  );
});

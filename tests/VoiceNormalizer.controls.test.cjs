const { test } = require("node:test");
const assert = require("node:assert/strict");
const Plugin = require("../VoiceNormalizer.plugin.js");
const { createDocument, traverse } = require("./fake-dom.cjs");
const { en, ru, languageFor, translate } = require("../src/i18n");

const { fixture: coreFixture } = require("./plugin-fixture.cjs");
function fixture(t) {
  const f = coreFixture(t, {
    targets: [],
    roster: ["a", "b", "self"],
    volumes: { a: 100, b: 80, self: 100 },
    level: 0.03,
  });
  global.document = createDocument();
  t.after(() => {
    delete global.document;
  });
  return f;
}

test("everyone mode follows new participants, excludes self, and survives restart", async (t) => {
  const f = fixture(t);
  let p = f.create();
  p.updatePreferences({ scope: "all" });
  for (let i = 0; i < 15; i++) await p.tick(p.generation);
  assert(f.volume.get("a") > 100);
  assert(f.volume.get("b") > 80);
  assert.equal(f.volume.get("self"), 100);
  f.setRoster(["a", "b", "c", "self"]);
  await p.tick(p.generation);
  assert(p.states.has("c"));
  p.stop();
  p = f.create();
  assert.equal(p.preferences.scope, "all");
  await p.tick(p.generation);
  assert(p.states.has("a"));
});

test("everyone exclusions persist; returning to selected restores other people", async (t) => {
  const f = fixture(t);
  let p = f.create();
  p.select("a", true);
  p.updatePreferences({ scope: "all" });
  f.setLevel(0.6);
  await p.tick(p.generation);
  assert(f.volume.get("b") < 80);
  p.select("b", false);
  assert.equal(f.volume.get("b"), 80);
  assert.equal(p.isSelected("b"), false);
  p.stop();
  p = f.create();
  assert.equal(p.isSelected("b"), false);
  p.select("b", true);
  await p.tick(p.generation);
  p.select("b", false);
  p.updatePreferences({ scope: "selected" });
  assert.deepEqual([...p.effectiveTargets()], ["a"]);
  assert.equal(f.volume.get("b"), 80);
});

test("reduce-only never boosts quiet voices and takes effect after a boosted session", async (t) => {
  const f = fixture(t);
  const p = f.create();
  p.updatePreferences({ scope: "all", mode: "attenuate" });
  for (let i = 0; i < 15; i++) await p.tick(p.generation);
  assert.equal(f.volume.get("a"), 100);
  assert.equal(f.volume.get("b"), 80);
  p.updatePreferences({ mode: "normalize" });
  for (let i = 0; i < 15; i++) await p.tick(p.generation);
  assert(f.volume.get("a") > 100);
  p.updatePreferences({ mode: "attenuate" });
  await p.tick(p.generation);
  assert(f.volume.get("a") <= 100);
  f.setLevel(0.8);
  await p.tick(p.generation);
  assert(f.volume.get("a") < 100);
});

test("individual profiles persist, inherit global changes, and reset learning preserves choice", async (t) => {
  const f = fixture(t);
  let p = f.create();
  p.select("a", true);
  p.setUserProfile("a", "soft");
  assert.equal(p.settingsFor("a").maxGain, 1.3);
  p.updateSettings({ ...p.settings, maxGain: 1.6, profile: "custom" });
  assert.equal(p.settingsFor("b").maxGain, 1.6);
  assert.equal(p.settingsFor("a").maxGain, 1.3);
  for (let i = 0; i < 15; i++) await p.tick(p.generation);
  assert(p.states.get("a").voiceCount > 7);
  p.resetLearning("a");
  assert.equal(f.volume.get("a"), 100);
  assert(p.targets.has("a"));
  await p.tick(p.generation);
  assert.equal(p.states.get("a").voiceCount, 0);
  p.stop();
  p = f.create();
  assert.equal(p.profileFor("a"), "soft");
  p.setUserProfile("a", "inherit");
  assert.equal(p.settingsFor("a").maxGain, 1.6);
});

test("friendly statuses distinguish learning, active speech, pauses, and mute", async (t) => {
  const f = fixture(t);
  const p = f.create();
  p.select("a", true);
  p.references.delete("a");
  assert.equal(p.userStatus("a"), "unavailable");
  for (let i = 0; i < 3; i++) await p.tick(p.generation);
  assert.equal(p.userStatus("a"), "learning");
  for (let i = 0; i < 20; i++) await p.tick(p.generation);
  assert.equal(p.userStatus("a"), "active");
  f.setLevel(0);
  await p.tick(p.generation);
  assert.equal(p.userStatus("a"), "waitingSpeech");
  f.setVolume("a", 0);
  assert.equal(p.userStatus("a"), "muted");
});

test("profile and participant controls keep their DOM nodes during updates", (t) => {
  const f = fixture(t);
  const p = f.create();
  p.select("a", true);
  const panel = p.getSettingsPanel();
  const section = (key) => panel.children.find((node) => node.dataset.section === key);
  const addSection = section("addPeople");
  const managedSection = section("managedPeople");
  assert(panel.children.indexOf(addSection) < panel.children.indexOf(managedSection));
  const availableRow = addSection.children[1].children.find((node) => node.dataset.userId === "a");
  const card = managedSection.children[1].children.find((node) => node.dataset.userId === "a");
  const soft = traverse(panel).find((node) => node.dataset.value === "soft");
  soft.fire("click");
  assert.equal(p.settings.profile, "soft");
  assert(traverse(panel).includes(soft));
  assert.equal(traverse(panel).filter((node) => node.tag === "select").length, 0);
  const details = traverse(panel).find((node) => node.tag === "details");
  assert.equal(details.open, false);
  p.select("a", false);
  assert.equal(
    managedSection.children[1].children.find((node) => node.dataset.userId === "a"),
    card,
  );
  assert.equal(
    addSection.children[1].children.find((node) => node.dataset.userId === "a"),
    availableRow,
  );
  assert.equal(availableRow.children[1].disabled, false);
  assert.equal(p.panelRefreshers.size, 1);
  p.stop();
  assert.equal(p.panels.size, 0);
  assert.equal(p.panelRefreshers.size, 0);
});

test("language follows Discord, can be overridden, and both dictionaries cover the same keys", (t) => {
  const f = fixture(t);
  const p = f.create();
  assert.equal(p.language(), "ru");
  const panel = p.getSettingsPanel();
  p.updatePreferences({ language: "en" });
  assert.equal(p.t("waitingSpeech"), "Waiting for speech");
  assert(panel.textContent.includes("Who to process"));
  p.stop();
  const next = f.create();
  assert.equal(next.language(), "en");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  assert.equal(languageFor("auto", "de"), "en");
  assert.equal(translate("en", "correction", 80), "Automatic correction: ×80");
});

test("editing settings on a disabled plugin cannot start voice processing", async (t) => {
  const f = fixture(t);
  const p = f.create();
  p.stop();
  p.updatePreferences({ scope: "all", mode: "attenuate" });
  p.select("a", true);
  assert.equal(p.enabled, false);
  assert.equal(p.timer, null);
  assert.equal(p.userStatus("a"), "off");
  await p.tick(p.generation);
  assert.equal(p.states.size, 0);
  p.start();
  await p.tick(p.generation);
  assert(p.states.has("a"));
});

test("the top participant button toggles both ways in selected and everyone scopes", (t) => {
  const f = fixture(t);
  const p = f.create();
  const panel = p.getSettingsPanel();
  const section = panel.children.find((node) => node.dataset.section === "addPeople");
  const row = section.children[1].children.find((node) => node.dataset.userId === "a");
  const toggle = row.children[1];
  assert.equal(toggle.disabled, false);
  toggle.fire("click");
  assert.equal(p.isSelected("a"), true);
  assert.equal(toggle.textContent, p.t("disable"));
  assert.equal(toggle.attributes["aria-pressed"], "true");
  toggle.fire("click");
  assert.equal(p.isSelected("a"), false);
  assert.equal(toggle.textContent, p.t("enable"));
  p.updatePreferences({ scope: "all" });
  assert.equal(p.isSelected("a"), true);
  assert.equal(toggle.disabled, false);
  toggle.fire("click");
  assert.equal(p.isSelected("a"), false);
  assert(p.preferences.excluded.includes("a"));
  toggle.fire("click");
  assert.equal(p.isSelected("a"), true);
  assert.equal(p.preferences.excluded.includes("a"), false);
  assert.equal(
    section.children[1].children.find((node) => node.dataset.userId === "a"),
    row,
  );
});

test("disclosures retain expansion through refresh and language changes", (t) => {
  const f = fixture(t);
  const p = f.create();
  p.select("a", true);
  const panel = p.getSettingsPanel();
  const find = (key) => traverse(panel).find((node) => node.dataset.section === key);
  for (const key of ["addPeople", "managedPeople", "user:a", "advanced"]) {
    assert.equal(find(key).tag, "details");
    assert.equal(find(key).open, false);
  }
  const available = find("addPeople");
  available.open = true;
  find("user:a").open = true;
  p.updatePreferences({ scope: "all" });
  assert.equal(find("addPeople"), available);
  assert.equal(available.open, true);
  assert.equal(find("managedPeople").open, false);
  assert(find("managedPeople").children[0].textContent.includes("2"));
  p.updatePreferences({ language: "en" });
  assert.equal(find("addPeople").open, true);
  assert.equal(find("user:a").open, true);
  assert.equal(find("managedPeople").open, false);
  assert(traverse(find("advanced")).some((node) => node.textContent === "Language"));
});

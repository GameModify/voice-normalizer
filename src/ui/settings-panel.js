"use strict";

const { version } = require("../../package.json");
const { element, button, choices } = require("./dom");
const { createSettingsControls } = require("./settings-controls");

function createSettingsPanel(plugin, doc) {
  const root = element(
    doc,
    "div",
    "",
    "padding:16px;display:flex;flex-direction:column;gap:16px;color:var(--text-normal)",
  );
  // Keep events inside BetterDiscord's settings modal without blocking keyboard focus.
  root.addEventListener("click", (event) => event.stopPropagation());
  root.addEventListener("pointerdown", (event) => event.stopPropagation());
  const t = (...args) => plugin.t(...args);
  const managedIds = new Set([...plugin.targets, ...plugin.preferences.excluded]);
  let language;
  let refreshView;
  let advancedOpen = false;

  const build = () => {
    language = plugin.language();
    root.replaceChildren();
    const section = (key) => {
      const node = element(doc, "section", "", "display:flex;flex-direction:column;gap:8px");
      node.append(element(doc, "h3", t(key), "margin:0;font-size:14px"));
      root.append(node);
      return node;
    };
    root.append(element(doc, "h2", t("settingsTitle", version), "margin:0;font-size:18px"));
    root.append(
      element(
        doc,
        "p",
        t("help"),
        "margin:0;line-height:1.5;color:var(--text-muted);font-size:13px",
      ),
    );
    const languageSection = section("language");
    const languageControl = choices(
      doc,
      [
        ["auto", t("auto")],
        ["ru", "Русский"],
        ["en", "English"],
      ],
      plugin.preferences.language,
      (value) => plugin.updatePreferences({ language: value }),
      t("language"),
    );
    languageSection.append(languageControl.element);
    const scopeSection = section("scope");
    const scope = choices(
      doc,
      [
        ["selected", t("selected")],
        ["all", t("all")],
      ],
      plugin.preferences.scope,
      (value) => plugin.updatePreferences({ scope: value }),
      t("scope"),
    );
    scopeSection.append(scope.element, element(doc, "small", t("scopeNote")));
    const modeSection = section("mode");
    const mode = choices(
      doc,
      [
        ["normalize", t("normalize")],
        ["attenuate", t("attenuate")],
      ],
      plugin.preferences.mode,
      (value) => plugin.updatePreferences({ mode: value }),
      t("mode"),
    );
    modeSection.append(mode.element, element(doc, "small", t("modeNote")));

    const controls = createSettingsControls(
      doc,
      plugin.settings,
      (next) => plugin.updateSettings(next),
      t,
    );
    root.append(controls);

    // The enable list stays above the managed cards in every mode.
    const available = section("addPeople");
    const availableEmpty = element(doc, "small", t("noPeople"));
    available.append(availableEmpty);
    const availableRows = new Map();
    const managed = section("managedPeople");
    const managedEmpty = element(doc, "small", t("noSelected"));
    managed.append(managedEmpty);
    const cards = new Map();

    const advanced = controls.advanced;
    root.append(advanced);
    advanced.open = advancedOpen;
    advanced.addEventListener("toggle", () => {
      advancedOpen = advanced.open;
    });
    const diagnostics = element(
      doc,
      "pre",
      "",
      "white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;padding:10px;background:var(--background-secondary);border-radius:6px",
    );
    const tests = element(doc, "div", "", "display:flex;flex-direction:column;gap:6px");
    const testRows = new Map();
    advanced.append(tests);
    advanced.append(element(doc, "strong", t("diagnostics")), diagnostics);
    const allOff = button(doc, t("stopAll"), () => plugin.turnOff());
    root.append(allOff);

    refreshView = () => {
      languageControl.update(plugin.preferences.language);
      scope.update(plugin.preferences.scope);
      mode.update(plugin.preferences.mode);
      controls.refresh(plugin.settings);
      const roster = plugin.participants();
      const names = new Map(roster.map((person) => [person.id, person.name]));
      const currentIds = new Set(roster.map((person) => person.id));
      availableEmpty.style.display = roster.length ? "none" : "";
      for (const [id, row] of availableRows) {
        if (!currentIds.has(id)) {
          row.root.remove();
          availableRows.delete(id);
        }
      }
      for (const [id, row] of testRows) {
        if (!currentIds.has(id)) {
          row.root.remove();
          testRows.delete(id);
        }
      }
      for (const person of roster) {
        let testRow = testRows.get(person.id);
        if (!testRow) {
          const node = element(doc, "div", "", "display:flex;gap:8px;align-items:center");
          const name = element(doc, "span", "", "flex:1");
          const test = button(doc, t("test"), () =>
            plugin.halfVolumeTest(person.id).then(() => plugin.refreshPanels()),
          );
          node.append(name, test);
          tests.append(node);
          testRow = { root: node, name, test };
          testRows.set(person.id, testRow);
        }
        testRow.name.textContent = person.name;
        testRow.test.disabled = plugin.enabled || plugin.testRunning;
        let row = availableRows.get(person.id);
        if (!row) {
          const node = element(
            doc,
            "div",
            "",
            "display:flex;gap:8px;align-items:center;padding:8px;border-radius:6px;background:var(--background-secondary)",
          );
          node.dataset.userId = person.id;
          const name = element(doc, "span", "", "flex:1");
          const enable = button(doc, t("enable"), () =>
            plugin.select(person.id, !plugin.isSelected(person.id)),
          );
          node.append(name, enable);
          available.append(node);
          row = { root: node, name, enable };
          availableRows.set(person.id, row);
        }
        row.name.textContent = person.name;
        const selected = plugin.isSelected(person.id);
        row.enable.disabled = false;
        row.enable.textContent = t(selected ? "disable" : "enable");
        row.enable.setAttribute("aria-pressed", String(selected));
        if (plugin.isSelected(person.id)) managedIds.add(person.id);
      }
      for (const id of [...plugin.targets, ...plugin.preferences.excluded]) managedIds.add(id);
      managedEmpty.style.display = managedIds.size ? "none" : "";
      for (const id of managedIds) {
        let card = cards.get(id);
        if (!card) {
          const node = element(
            doc,
            "div",
            "",
            "padding:12px;border:1px solid var(--background-modifier-accent);border-radius:8px;display:flex;flex-direction:column;gap:8px",
          );
          node.dataset.userId = id;
          const name = element(doc, "strong");
          const status = element(doc, "div", "", "font-size:13px;color:var(--text-muted)");
          status.setAttribute("role", "status");
          const detail = element(doc, "small");
          const profile = choices(
            doc,
            ["inherit", "soft", "balanced", "aggressive"].map((key) => [key, t(key)]),
            plugin.profileFor(id),
            (value) => plugin.setUserProfile(id, value),
            t("profileFor"),
          );
          const actions = element(doc, "div", "", "display:flex;gap:6px;flex-wrap:wrap");
          const toggle = button(doc, "", () => plugin.select(id, !plugin.isSelected(id)));
          const reset = button(doc, t("reset"), () => plugin.resetLearning(id));
          actions.append(reset, toggle);
          node.append(name, status, detail, profile.element, actions);
          managed.append(node);
          card = { root: node, name, status, detail, profile, toggle, reset };
          cards.set(id, card);
        }
        const user = BdApi.Webpack.getStore("UserStore")?.getUser?.(id);
        card.name.textContent = names.get(id) || user?.globalName || user?.username || id;
        const selected = plugin.isSelected(id);
        card.status.textContent = t(plugin.userStatus(id, roster));
        card.detail.textContent =
          selected && plugin.states.has(id)
            ? t("correction", (plugin.getLiveSnapshot(id).ratio * 100).toFixed(0))
            : "";
        card.profile.update(plugin.profileFor(id));
        card.toggle.textContent = t(selected ? "disable" : "enable");
        card.reset.disabled = !plugin.states.has(id);
      }
      diagnostics.textContent = [
        plugin.status,
        plugin.writerInfo,
        `scope=${plugin.preferences.scope}, mode=${plugin.preferences.mode}, selected=${plugin.targets.size}`,
        JSON.stringify(plugin.diagnostic, null, 2),
        plugin.mappingDebug,
        plugin.lastWriteError,
      ].join("\n");
    };
  };
  const refresh = () => {
    if (language !== plugin.language()) build();
    refreshView();
  };
  build();
  refresh();
  plugin.panelRefreshers.add(refresh);
  const timer = setInterval(() => {
    if (!root.isConnected) {
      clearInterval(timer);
      plugin.panels.delete(timer);
      plugin.panelRefreshers.delete(refresh);
      return;
    }
    refresh();
  }, 400);
  plugin.panels.add(timer);
  return root;
}

module.exports = { createSettingsPanel };

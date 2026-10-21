"use strict";

const { getPreset } = require("../audio/settings");
const { translate } = require("../i18n");
const { element, choices } = require("./dom");

const FIELDS = [
  ["targetLevel", 0.04, 0.25, 0.005],
  ["maxGain", 1, 2, 0.05],
  ["minGain", 0.25, 1, 0.05],
  ["attack", 0.2, 0.9, 0.05],
  ["release", 0.03, 0.3, 0.01],
];

function createSettingsControls(
  doc,
  initial,
  updateSettings,
  t = (key, ...values) => translate("en", key, ...values),
) {
  let current = { ...initial };
  const section = element(doc, "section", "", "display:flex;flex-direction:column;gap:8px");
  section.append(element(doc, "h3", t("globalProfile"), "margin:0;font-size:14px"));
  const presets = choices(
    doc,
    ["soft", "balanced", "aggressive", "custom"].map((key) => [key, t(key)]),
    current.profile,
    (profile) => {
      const next = profile === "custom" ? { ...current, profile } : getPreset(profile);
      refresh(updateSettings(next));
    },
    t("globalProfile"),
  );
  section.append(presets.element, element(doc, "small", t("profileNote")));
  const advanced = element(
    doc,
    "details",
    "",
    "padding:10px;border:1px solid var(--background-modifier-accent);border-radius:8px",
  );
  advanced.append(element(doc, "summary", t("advanced"), "cursor:pointer;font-weight:600"));
  const body = element(
    doc,
    "div",
    "",
    "display:flex;flex-direction:column;gap:12px;padding-top:10px",
  );
  body.append(element(doc, "small", t("advancedNote")));
  advanced.append(body);
  section.append(advanced);
  const sliders = [];
  for (const [key, min, max, step] of FIELDS) {
    const row = element(doc, "label", "", "display:flex;flex-direction:column;gap:6px");
    const output = element(doc, "span");
    const slider = element(doc, "input");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.dataset.setting = key;
    slider.setAttribute("aria-label", t(key));
    slider.addEventListener("input", () => {
      refresh(updateSettings({ ...current, [key]: Number(slider.value), profile: "custom" }));
    });
    row.append(output, slider);
    body.append(row);
    sliders.push({ key, slider, output });
  }
  function refresh(next = current) {
    current = { ...next };
    presets.update(current.profile);
    for (const { key, slider, output } of sliders) {
      if (doc.activeElement !== slider) slider.value = String(current[key]);
      const value = current[key];
      const suffix = ["attack", "release"].includes(key)
        ? t("perPoll")
        : key === "targetLevel"
          ? "RTP"
          : t("baseline");
      output.textContent = `${t(key)}: ${(value * 100).toFixed(key === "targetLevel" ? 1 : 0)}% ${suffix}`;
    }
  }
  section.refresh = refresh;
  section.advanced = advanced;
  refresh();
  return section;
}
module.exports = { createSettingsControls };

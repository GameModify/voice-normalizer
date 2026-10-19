"use strict";

const { getPreset } = require("../audio/settings");

const FIELDS = [
  [
    "targetLevel",
    "Цель RTP (условный уровень)",
    0.04,
    0.25,
    0.005,
    (v) => (v * 100).toFixed(1) + "%",
  ],
  ["maxGain", "Максимальное усиление", 1, 2, 0.05, (v) => (v * 100).toFixed(0) + "% от базы"],
  [
    "minGain",
    "Максимальное ослабление",
    0.25,
    1,
    0.05,
    (v) => (20 * Math.log10(v)).toFixed(1) + " дБ",
  ],
  [
    "attack",
    "Скорость уменьшения громкости",
    0.2,
    0.9,
    0.05,
    (v) => Math.round(v * 100) + "% за опрос",
  ],
  [
    "release",
    "Скорость увеличения громкости",
    0.03,
    0.3,
    0.01,
    (v) => Math.round(v * 100) + "% за опрос",
  ],
];

function createSettingsControls(doc, initial, updateSettings) {
  let current = { ...initial };
  const section = doc.createElement("section");
  section.style.cssText =
    "padding:12px;border-radius:10px;background:var(--background-secondary);display:flex;flex-direction:column;gap:11px";

  const heading = doc.createElement("strong");
  heading.textContent = "Глобальные настройки нормализации";
  const note = doc.createElement("div");
  note.style.cssText = "color:var(--text-muted);font-size:12px;line-height:1.35";
  note.textContent =
    "Цель RTP — относительная статистика входящего аудио, не громкость ползунка Discord. Усиление ограничено внутренним потолком Discord; изменения сохраняются автоматически.";
  section.append(heading, note);

  const presetRow = doc.createElement("label");
  presetRow.style.cssText =
    "display:flex;gap:10px;align-items:center;justify-content:space-between";
  const presetText = doc.createElement("span");
  presetText.textContent = "Профиль";
  const select = doc.createElement("select");
  select.style.cssText =
    "padding:6px;background:var(--input-background);color:var(--text-normal);border:1px solid var(--background-modifier-accent);border-radius:6px";
  for (const [key, name] of [
    ["soft", "Мягкий"],
    ["balanced", "Баланс"],
    ["aggressive", "Агрессивный"],
    ["custom", "Мой"],
  ]) {
    const option = doc.createElement("option");
    option.value = key;
    option.textContent = name;
    select.append(option);
  }
  presetRow.append(presetText, select);
  section.append(presetRow);

  const controls = [];
  function refresh() {
    select.value = current.profile;
    for (const { key, slider, output, format } of controls) {
      slider.value = String(current[key]);
      output.textContent = format(current[key]);
    }
  }
  function commit(next) {
    current = updateSettings(next);
    refresh();
  }

  select.addEventListener("change", () => {
    if (select.value === "custom") {
      commit({ ...current, profile: "custom" });
    } else {
      commit(getPreset(select.value));
    }
  });

  for (const [key, label, min, max, step, format] of FIELDS) {
    const row = doc.createElement("div");
    row.style.cssText = "display:flex;flex-direction:column;gap:5px";
    const info = doc.createElement("div");
    info.style.cssText = "display:flex;gap:8px;justify-content:space-between;font-size:12px";
    const title = doc.createElement("span");
    title.textContent = label;
    const output = doc.createElement("span");
    output.style.fontVariantNumeric = "tabular-nums";
    const slider = doc.createElement("input");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.style.width = "100%";
    slider.addEventListener("input", () => {
      commit({ ...current, [key]: Number(slider.value), profile: "custom" });
    });
    info.append(title, output);
    row.append(info, slider);
    section.append(row);
    controls.push({ key, slider, output, format });
  }

  refresh();
  return section;
}

module.exports = { createSettingsControls };

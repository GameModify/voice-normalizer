"use strict";

function element(doc, tag, text = "", style = "") {
  const node = doc.createElement(tag);
  node.textContent = text;
  node.style.cssText = style;
  return node;
}
function button(doc, text, action) {
  const node = element(
    doc,
    "button",
    text,
    "padding:7px 10px;border-radius:6px;border:1px solid var(--background-modifier-accent);background:var(--background-secondary);color:var(--text-normal);cursor:pointer;font:inherit;font-size:12px",
  );
  node.type = "button";
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return node;
}
// Real buttons avoid native select popups stealing focus from Discord's modal.
function choices(doc, options, value, onChange, label) {
  const root = element(doc, "div", "", "display:flex;gap:6px;flex-wrap:wrap");
  root.setAttribute("role", "radiogroup");
  root.setAttribute("aria-label", label);
  const buttons = options.map(([key, text]) => {
    const node = button(doc, text, () => onChange(key));
    node.dataset.value = key;
    node.setAttribute("role", "radio");
    node.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const index = options.findIndex(([option]) => option === key);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
      buttons[next][1].focus();
      onChange(options[next][0]);
    });
    root.append(node);
    return [key, node];
  });
  const update = (selected) => {
    for (const [key, node] of buttons) {
      node.setAttribute("aria-checked", String(selected === key));
      node.style.background =
        selected === key ? "var(--brand-500,#5865f2)" : "var(--background-secondary)";
      node.style.color = selected === key ? "white" : "var(--text-normal)";
    }
  };
  update(value);
  return { element: root, update };
}
module.exports = { element, button, choices };

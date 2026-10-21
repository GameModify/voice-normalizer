function createDocument() {
  class Node {
    constructor(tag) {
      this.tag = tag;
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.children = [];
      this.listeners = {};
      this.value = "";
      this.open = false;
      this.isConnected = true;
    }
    set textContent(value) {
      this.text = value;
      this.children = [];
    }
    get textContent() {
      return (this.text || "") + this.children.map((child) => child.textContent).join("");
    }
    append(...nodes) {
      for (const node of nodes) {
        node.remove();
        node.parent = this;
        this.children.push(node);
      }
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
    replaceChildren(...nodes) {
      for (const child of [...this.children]) child.remove();
      this.text = "";
      this.append(...nodes);
    }
    setAttribute(key, value) {
      this.attributes[key] = value;
    }
    addEventListener(type, listener) {
      (this.listeners[type] ||= []).push(listener);
    }
    fire(type) {
      if (type === "click" && this.disabled) return;
      for (const listener of this.listeners[type] || []) listener({ stopPropagation() {} });
    }
  }
  return { createElement: (tag) => new Node(tag), activeElement: null };
}
const traverse = (node) => [node, ...node.children.flatMap(traverse)];
module.exports = { createDocument, traverse };

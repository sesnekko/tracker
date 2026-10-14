/* Kleines DOM für Abgleich-Tests (P64): baut aus innerHTML echte Elementbäume, damit Editoren ihre gerenderten
   Kontrollen, Listener und Neuzeichnungen wirklich durchlaufen. Unterstützt die von der App genutzten Teile:
   Selektoren (Tag, #id, .klasse, [attr], [attr="wert"], Nachfahre, Komma), closest, dataset, value/checked,
   classList, Ereignisse mit Bubbling, insertAdjacentHTML/-Element, remove, textContent. Kein vollständiger Browser. */
const VOID = new Set(['input', 'br', 'img', 'hr', 'meta', 'link']);
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

class Text { constructor(t) { this.nodeType = 3; this.textContent = t; this.parentNode = null; } }
class Element {
  constructor(tag, attrs = {}, doc) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.childNodes = []; this.parentNode = null;
    this.listeners = {}; this.style = {}; this.doc = doc;
    this._value = attrs.value !== undefined ? attrs.value : null; this.checked = 'checked' in attrs; this.disabled = 'disabled' in attrs;
    const el = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => typeof k === 'string' ? el.attrs['data-' + kebab(k)] : undefined,
      set: (_, k, v) => { el.attrs['data-' + kebab(k)] = String(v); return true; },
      ownKeys: () => Object.keys(el.attrs).filter(a => a.startsWith('data-')).map(a => camel(a.slice(5))),
      getOwnPropertyDescriptor: (_, k) => el.attrs['data-' + kebab(k)] !== undefined ? { enumerable: true, configurable: true, value: el.attrs['data-' + kebab(k)] } : undefined
    });
    this.classList = {
      list: () => (el.attrs.class || '').split(/\s+/).filter(Boolean),
      contains: c => el.classList.list().includes(c),
      add: (...cs) => { el.attrs.class = [...new Set([...el.classList.list(), ...cs])].join(' '); },
      remove: (...cs) => { el.attrs.class = el.classList.list().filter(c => !cs.includes(c)).join(' '); },
      toggle: (c, on) => { const has = el.classList.contains(c); if (on === undefined ? !has : on) el.classList.add(c); else el.classList.remove(c); }
    };
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  get name() { return this.attrs.name || ''; }
  get type() { return (this.attrs.type || (this.tagName === 'INPUT' ? 'text' : '')).toLowerCase(); }
  get className() { return this.attrs.class || ''; }
  get placeholder() { return this.attrs.placeholder || ''; }
  get hidden() { return 'hidden' in this.attrs; }
  set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get options() { return this.querySelectorAll('option'); }
  get value() {
    if (this.tagName === 'SELECT') { const o = this.options, s = o.find(x => x._selected) || o.find(x => 'selected' in x.attrs) || o[0]; return s ? s.value : ''; }
    if (this.tagName === 'OPTION') return this.attrs.value !== undefined ? this.attrs.value : this.textContent;
    if (this.tagName === 'TEXTAREA') return this._value !== null ? this._value : this.textContent;
    return this._value !== null ? this._value : '';
  }
  set value(v) {
    if (this.tagName === 'SELECT') { this.options.forEach(o => { o._selected = o.value === String(v); }); return; }
    this._value = String(v);
  }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(t) { this.childNodes = [new Text(String(t))]; this.childNodes[0].parentNode = this; }
  getAttribute(a) { return this.attrs[a] !== undefined ? this.attrs[a] : null; }
  setAttribute(a, v) { this.attrs[a] = String(v); }
  hasAttribute(a) { return this.attrs[a] !== undefined; }
  removeAttribute(a) { delete this.attrs[a]; }
  set innerHTML(html) { this.childNodes = []; parseInto(this, String(html), this.doc); }
  get innerHTML() { return ''; }
  insertAdjacentHTML(pos, html) {
    const tmp = new Element('div', {}, this.doc); parseInto(tmp, html, this.doc);
    tmp.childNodes.slice().forEach(n => this.insertAdjacentElement(pos, n));
  }
  insertAdjacentElement(pos, node) {
    const at = (parent, i) => { if (node.parentNode) node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1); node.parentNode = parent; parent.childNodes.splice(i, 0, node); };
    if (pos === 'afterbegin') at(this, 0);
    else if (pos === 'beforeend') at(this, this.childNodes.length);
    else if (pos === 'afterend' && this.parentNode) at(this.parentNode, this.parentNode.childNodes.indexOf(this) + 1);
    else if (pos === 'beforebegin' && this.parentNode) at(this.parentNode, this.parentNode.childNodes.indexOf(this));
    return node;
  }
  appendChild(node) { return this.insertAdjacentElement('beforeend', node); }
  prepend(node) { return this.insertAdjacentElement('afterbegin', node); }
  remove() { if (this.parentNode) { this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; } }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  get isConnected() { let x = this; while (x.parentNode) x = x.parentNode; return x === this.doc.root; }
  descendants() { const out = []; const walk = e => e.children.forEach(c => { out.push(c); walk(c); }); walk(this); return out; }
  querySelectorAll(sel) { return this.descendants().filter(e => matches(e, sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  matches(sel) { return matches(this, sel); }
  closest(sel) { for (let e = this; e && e.nodeType === 1; e = e.parentNode) if (matches(e, sel)) return e; return null; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); }
  dispatchEvent(ev) {
    const e = Object.assign(Object.create(ev), { type: ev.type, target: this, bubbles: ev.bubbles !== false, defaultPrevented: false });
    e.preventDefault = () => { e.defaultPrevented = true; };
    // wie im Browser: eine Ausnahme im Listener erreicht nicht den Aufrufer, sondern den Fehlerhandler des Fensters
    const call = (n, f) => { try { f.call(n, e); } catch (error) { (this.doc.errors = this.doc.errors || []).push(error); if (this.doc.onerror) this.doc.onerror(error); } };
    for (let n = this; n; n = e.bubbles ? n.parentNode : null) { e.currentTarget = n; (n.listeners && n.listeners[ev.type] || []).slice().forEach(f => call(n, f)); if (!e.bubbles) break; }
    return !e.defaultPrevented;
  }
  focus() { this.doc.activeElement = this; }
  blur() { if (this.doc.activeElement === this) this.doc.activeElement = null; }
  click() { this.dispatchEvent({ type: 'click', bubbles: true }); }
  scrollIntoView() {}
}
function parseInto(parent, html, doc) {
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z0-9-]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let cur = parent, m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) { for (let e = cur; e && e !== parent; e = e.parentNode) if (e.tagName === m[1].toUpperCase()) { cur = e.parentNode; break; } continue; }
    if (m[2]) {
      const attrs = {}, ar = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
      while ((a = ar.exec(m[3] || ''))) attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      const el = new Element(m[2], attrs, doc); el.parentNode = cur; cur.childNodes.push(el);
      if (!VOID.has(m[2].toLowerCase()) && !m[4]) cur = el;
      continue;
    }
    const t = new Text(decode(m[5])); t.parentNode = cur; cur.childNodes.push(t);
  }
}
function simple(e, part) {
  const re = /([a-zA-Z0-9-]+)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]|:checked/g; let m, ok = true, any = false;
  while ((m = re.exec(part))) {
    any = true;
    if (m[0] === ':checked') ok = ok && !!e.checked;
    else if (m[1]) ok = ok && e.tagName === m[1].toUpperCase();
    else if (m[2]) ok = ok && e.id === m[2];
    else if (m[3]) ok = ok && e.classList.contains(m[3]);
    else if (m[4]) { const v = e.attrs[m[4]], want = m[5] ?? m[6] ?? m[7]; ok = ok && v !== undefined && (want === undefined || v === want); }
  }
  return any && ok;
}
function matches(e, sel) {
  return sel.split(',').some(group => {
    const parts = group.trim().split(/\s+/);
    if (!simple(e, parts[parts.length - 1])) return false;
    // wie im Browser: Vorfahren dürfen auch außerhalb des Elements liegen, auf dem gesucht wird
    let anc = e.parentNode;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (anc && anc.nodeType === 1 && !simple(anc, parts[i])) anc = anc.parentNode;
      if (!anc || anc.nodeType !== 1) return false;
      anc = anc.parentNode;
    }
    return true;
  });
}
/* Ein Dokument mit Wurzel; getElementById sucht im Baum */
function createDocument() {
  const doc = { activeElement: null };
  doc.root = new Element('body', {}, doc);
  doc.create = (tag, attrs) => new Element(tag, attrs, doc);
  doc.getElementById = id => doc.root.id === id ? doc.root : doc.root.descendants().find(e => e.id === id) || null;
  return doc;
}
/* Eingabe wie im Browser: fokussieren, Wert setzen, input- und change-Ereignis */
function type(el, value) {
  el.dispatchEvent({ type: 'pointerdown', bubbles: true }); el.focus(); el.dispatchEvent({ type: 'focusin', bubbles: true });
  el.value = value;
  el.dispatchEvent({ type: 'input', bubbles: true }); el.dispatchEvent({ type: 'change', bubbles: true });
}
module.exports = { createDocument, type, Element };

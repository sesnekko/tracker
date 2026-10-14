const vm = require('node:vm');
const Data = require('../data-store.js');
const AssetModel = require('../asset-model.js');
const LoanHistory = require('../loan-history.js');
const LoanModel = require('../loan-model.js');
class MemoryStorage {
  constructor(values = {}) { this.values = { ...values }; this.failWrites = false; }
  get length() { return Object.keys(this.values).length; }
  key(i) { return Object.keys(this.values)[i]; }
  getItem(k) { return Object.hasOwn(this.values, k) ? this.values[k] : null; }
  setItem(k, v) { if (this.failWrites) throw new Error('Quota exceeded'); this.values[k] = String(v); }
  removeItem(k) { delete this.values[k]; }
}
/* Web Locks wie im Browser (exklusiv, der Reihe nach; ifAvailable liefert null, solange belegt). Ohne gemeinsame Sperre
   ist jedes App-Fenster des Harness ein eigener Browser; Tests mit mehreren Fenstern geben eine gemeinsame mit. */
function memoryLocks() {
  const held = new Set(), queue = [];
  const run = (name, cb, resolve, reject) => {
    held.add(name);
    let result;
    try { result = Promise.resolve(cb({ name, mode: 'exclusive' })); } catch (e) { result = Promise.reject(e); }
    const done = () => {
      held.delete(name);
      const i = queue.findIndex(q => q.name === name);
      if (i >= 0) { const q = queue.splice(i, 1)[0]; run(q.name, q.cb, q.resolve, q.reject); }
    };
    result.then(v => { done(); resolve(v); }, e => { done(); reject(e); });
  };
  return {
    held: name => held.has(name),
    request(name, opts, cb) {
      if (typeof opts === 'function') { cb = opts; opts = {}; }
      return new Promise((resolve, reject) => {
        if (!held.has(name)) { run(name, cb, resolve, reject); return; }
        if (opts.ifAvailable) { Promise.resolve().then(() => cb(null)).then(resolve, reject); return; }
        queue.push({ name, cb, resolve, reject });
      });
    }
  };
}
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-08T10:00:00Z'])); }
}
// Execute the actual legacy importer and numerical model, isolating only DOM
// rendering/network startup. Comparison uses the pre-migration implementation.
function app(html, storage = new MemoryStorage(), options = {}) {
  const elements = new Map(), listeners = { window: {}, document: {} };
  const listen = where => (type, f) => { (listeners[where][type] = listeners[where][type] || []).push(f); };
  const el = id => {
    if (!elements.has(id)) elements.set(id, { id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, files: [], dataset: {}, value: '', querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, focus() {}, scrollIntoView() {} });
    return elements.get(id);
  };
  const context = vm.createContext({
    AssetsData: Data, LoanModel, LoanHistory, AssetModel, localStorage: storage, Date: FixedDate,
    console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {},
    confirm: () => true, alert() {}, navigator: { locks: options.locks || memoryLocks() }, window: { addEventListener: listen('window'), matchMedia: () => ({ matches: false }), navigator: {} },
    location: { reload() {} },
    document: { body: { children: [], classList: { add() {}, remove() {}, toggle() {} } }, activeElement: null, referrer: '', readyState: 'loading', addEventListener: listen('document'), getElementById: el, querySelector: () => null, querySelectorAll: () => [] },
    FileReader: class { readAsText(f) { this.onload({ target: { result: f.contents } }); } }
  });
  const script = html.split('<script>').at(-1).split('</script>')[0];
  vm.runInContext(script, context);
  vm.runInContext("buildDynamicFormForTest=buildDynamicForm;picker={setVal(){}};render=()=>{};buildAssetParamsTable=()=>{};updateLifetimeInputs=()=>{};buildDynamicForm=()=>{};navigateToPage=()=>{};_ask=async()=>true;", context);
  // wie _startApp: Schreibrecht erfragen (mit freier Sperre sofort); ältere Stände ohne appStorage starten wie bisher
  if (options.ready !== false) vm.runInContext("typeof appStorage!=='undefined'&&typeof appStorage.ready==='function'&&appStorage.ready()", context);
  return {
    context, storage, el,
    /* Browser-Ereignisse an die App (storage, pagehide, pageshow, freeze, resume …) */
    fire(where, type, event = {}) { (listeners[where][type] || []).forEach(f => f(event)); },
    run(code) { return vm.runInContext(code, context); },
    json(code) { return JSON.parse(vm.runInContext('JSON.stringify(' + code + ')', context)); },
    csv(contents) { context.fixture = { target: { files: [{ name: 'old.csv', contents }], value: 'old.csv' } }; vm.runInContext('handleCsvUpload(fixture)', context); }
  };
}

module.exports = { app, MemoryStorage, FixedDate, memoryLocks };

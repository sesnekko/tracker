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
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-08T10:00:00Z'])); }
}
// Execute the actual legacy importer and numerical model, isolating only DOM
// rendering/network startup. Comparison uses the pre-migration implementation.
function app(html, storage = new MemoryStorage()) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, files: [], dataset: {}, value: '', querySelectorAll: () => [], querySelector: () => null, addEventListener() {}, focus() {}, scrollIntoView() {} });
    return elements.get(id);
  };
  const context = vm.createContext({
    AssetsData: Data, LoanModel, LoanHistory, AssetModel, localStorage: storage, Date: FixedDate,
    console: { log() {}, warn() {}, error() {} },
    setTimeout() {}, clearTimeout() {}, setInterval() {},
    confirm: () => true, alert() {}, navigator: {}, window: { addEventListener() {}, matchMedia: () => ({ matches: false }), navigator: {} },
    location: { reload() {} },
    document: { body: { children: [], classList: { add() {}, remove() {}, toggle() {} } }, activeElement: null, referrer: '', readyState: 'loading', addEventListener() {}, getElementById: el, querySelector: () => null, querySelectorAll: () => [] },
    FileReader: class { readAsText(f) { this.onload({ target: { result: f.contents } }); } }
  });
  const script = html.split('<script>').at(-1).split('</script>')[0];
  vm.runInContext(script, context);
  vm.runInContext("buildDynamicFormForTest=buildDynamicForm;picker={setVal(){}};render=()=>{};buildAssetParamsTable=()=>{};updateLifetimeInputs=()=>{};buildDynamicForm=()=>{};navigateToPage=()=>{};", context);
  return {
    context, storage, el,
    run(code) { return vm.runInContext(code, context); },
    json(code) { return JSON.parse(vm.runInContext('JSON.stringify(' + code + ')', context)); },
    csv(contents) { context.fixture = { target: { files: [{ name: 'old.csv', contents }], value: 'old.csv' } }; vm.runInContext('handleCsvUpload(fixture)', context); }
  };
}

module.exports = { app, MemoryStorage, FixedDate };

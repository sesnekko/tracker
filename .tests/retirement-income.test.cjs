const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Data = require('../data-store.js');
const { app, MemoryStorage, FixedDate } = require('./app-harness.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const demoCSV = fs.readFileSync(path.join(__dirname, 'demo_export.csv'), 'utf8');
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);
const addIncome = (a, row) => a.run(`(()=>{const bd=loadBudgetData();bd.einkommen.push(${JSON.stringify(row)});saveBudgetData(bd);})()`);

test('a budget income marked for retirement counts in the forecast and survives a backup', () => {
  const a = app(html); a.csv(demoCSV);
  addIncome(a, { id: 'rent-1', name: 'Mieteinnahmen Garage', subcat: '', kind: 'income', targetGroupId: null, retirement: true, values: Array(12).fill(150) });
  const item = a.json('appStorage.document()').budget.items.find(i => i.id === 'rent-1');
  assert.equal(item.retirementIncome, true);
  const plan = a.json('(()=>{const p=buildPlan();return{inc:p.retInc,entry:p.pensions.find(x=>x.budget)};})()');
  assert.deepEqual(plan.inc.map(r => [r.name, r.amount, r.duplicate]), [['Mieteinnahmen Garage', 150, null]]);
  assert.equal(plan.entry.amount, 150);
  assert.equal(plan.entry.from, 0);
  const backup = a.json('appStorage.exportBackup(new Date("2026-10-08"))');
  const b = app(html); b.context.backup = backup; b.run('appStorage.importBackup(backup)');
  assert.ok(b.json('loadBudgetData()').einkommen.find(r => r.id === 'rent-1').retirement);
  // Only incomes may carry the flag.
  const bad = JSON.parse(JSON.stringify(backup)); bad.budget.items.find(i => i.kind !== 'income').retirementIncome = true;
  assert.throws(() => Data.validate(bad), /nur für Einnahmen/);
});

test('an income that is already a pension under Altersvorsorge is recognised and not counted twice', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),{emType:1,em:700})));");
  addIncome(a, { id: 'em-1', name: 'Erwerbsminderungsrente', subcat: '', kind: 'income', targetGroupId: null, retirement: true, values: Array(12).fill(700) });
  const r = a.json('(()=>{const p=buildPlan();return{inc:p.retInc,budget:p.pensions.filter(x=>x.budget).length};})()');
  assert.equal(r.inc[0].duplicate, 'Erwerbsminderungsrente');
  assert.equal(r.budget, 0, 'the EM pension is counted once, from the pension section');
  // Other entries: statutory pension, "Weitere Renten" by name.
  a.run("appStorage.setItem('lt-pensions',JSON.stringify([{name:'Betriebsrente',amount:180,from:67}]));");
  assert.equal(a.run("_retIncomeDuplicate('Betriebsrente Firma')"), 'Betriebsrente');
  assert.equal(a.run("_retIncomeDuplicate('Mieteinnahmen')"), null);
  // Without an EM pension in the pension section, the budget EM income counts until the Regelaltersgrenze.
  a.run("appStorage.setItem('lt-drv',JSON.stringify((()=>{const d=getDrv();delete d.emType;delete d.em;return d;})()));appStorage.setItem('lt-birth-year','1980');");
  const entry = a.json('buildPlan().pensions.find(x=>x.budget)');
  assert.equal(entry.amount, 700);
  assert.equal(entry.until, 67);
});

test('income explanations show the calculation; the EM pension is never added to the old-age pension', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-drv',JSON.stringify(Object.assign(getDrv(),{points:20,salary:30000,emType:1,em:700})));");
  const plan = a.json('(()=>{const p=buildPlan();return{drv:p.drv,em:p.pensions.filter(x=>x.from===0&&!x.budget),grv:p.pensions.filter(x=>x.from===p.drv.age&&x.drv)};})()');
  // The EM pension ends exactly when the old-age pension starts: no year has both.
  assert.equal(plan.em[0].until, plan.drv.age);
  const text = a.run('_explainDrv(buildPlan().drv)');
  assert.match(text, /Rentenpunkte/);
  assert.match(text, /Rentenwert/);
  assert.match(text, /mindestens die volle EM-Rente/);
  assert.match(a.run("_explainEm(buildPlan().drv,'',true)"), /nicht in der Summe/);
});

test('an AV-Depot linked to an asset position takes its value from the position and converts to the pension at payout', () => {
  const a = app(html); a.csv(demoCSV);
  a.run("appStorage.setItem('lt-birth-year','1985');");
  // Use an existing asset position as the depot position.
  const pos = a.json("_fc.fields.find(f=>f.category==='etf').id");
  a.run(`appStorage.setItem('lt-av-depots',JSON.stringify([{id:'depot-1',name:'AV-Depot',person:'',contrib:150,pos:'${pos}'}]))`);
  const doc = a.json('appStorage.document()');
  assert.equal(doc.retirement.pensionDepots[0].positionId, pos);
  const value = a.json(`_posValueNow('${pos}')`);
  assert.ok(value > 0);
  near(a.json(`_avdResolve(getAvDepots()[0]).balance`), value);
  // A position that does not exist is not linked.
  const bad = JSON.parse(JSON.stringify(doc)); bad.retirement.pensionDepots[0].positionId = 'missing';
  assert.throws(() => Data.validate(bad), /unbekannte Position/);
  // The forecast: the group holding only depot positions turns into the pension at payout.
  a.run(`(()=>{const f=_fc.fields.find(x=>x.id==='${pos}');f.displayGroup=AVD_GROUP;saveFieldConfig(_fc);_fc=loadFieldConfig();})()`);
  const g = a.json('(()=>{const p=buildPlan();const g=p.groups.find(x=>x.key===AVD_GROUP);const d=simulatePlan(p,p.s.withdrawFrom,{record:true});const j=p.groups.indexOf(g);return{convertAt:g.convertAt,from:p.avd[0].fromMain,before:d.per[j][g.convertAt-1-p.firstAge],after:d.per[j][g.convertAt+1-p.firstAge]};})()');
  assert.equal(g.convertAt, g.from);
  assert.ok(g.before > 0);
  assert.equal(g.after, 0);
});

test('appearance "System" is stored and survives a backup', () => {
  const store = Data.createStore(new MemoryStorage());
  store.setItem('darkMode', '2');
  assert.equal(store.document().preferences.theme, 'system');
  const target = Data.createStore(new MemoryStorage());
  target.importBackup(JSON.parse(JSON.stringify(store.exportBackup(new FixedDate()))));
  assert.equal(target.getItem('darkMode'), '2');
  const bad = Data.empty(); bad.preferences.theme = 'auto';
  assert.throws(() => Data.validate(bad), /ungültig/);
});

test('the Assets chart window ends at the selected month', () => {
  const a = app(html);
  const keys = JSON.stringify(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  a.run("selectedMonth='2026-06'");
  assert.deepEqual(a.json(`_netWindow(${keys},3)`), { min: 3, max: 5 });
  a.run("selectedMonth='2026-03'");
  assert.deepEqual(a.json(`_netWindow(${keys},3)`), { min: 0, max: 2 });
  assert.deepEqual(a.json(`_netWindow(${keys},0)`), { min: 0, max: 2 });
});

test('a new one-time event starts with an empty amount instead of a fixed 0', () => {
  const a = app(html);
  const html0 = a.run("_planRowsHTML([{name:'',year:2031,amount:'',from:'',to:''},{name:'Auto',year:2030,amount:0,from:'',to:''},{name:'Erbe',year:2032,amount:5000,from:'',to:''}],EVENT_COLS,'live','ev')");
  const amounts = [...html0.matchAll(/data-k="amount" value="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(amounts, ['', '', '5000']);
});

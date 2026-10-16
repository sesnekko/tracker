/* 15.10.2026: Die Prognose übernimmt die Abschreibung der Vermögenswerte (Daten → Vermögenswerte → Position). Eine Position
   mit gültiger Abschreibung bekommt einen eigenen Topf; sein Wert folgt Monat für Monat dem Abschreibungsplan statt der
   Rendite der Gruppe (vorher z. B. pauschal −5 % für Fahrzeuge). Schwankung wirkt dort nicht; Positionen ohne Abschreibung
   behalten Rendite und Schwankung ihrer Gruppe. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, MemoryStorage } = require('./app-harness.cjs');
const Data = require('../data-store.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const demoJSON = fs.readFileSync(path.join(__dirname, '..', 'demo_backup.json'), 'utf8');

// Kleiner Haushalt: Konto, Auto (mit/ohne Abschreibung), optional ein zweites Fahrzeug ohne Abschreibung in derselben Gruppe
function fixture({ dep, second } = {}) {
  const d = Data.empty();
  d.groups = [{ id: 'g1', name: 'Cash', assumptions: {} }, { id: 'g2', name: 'Fahrzeuge', assumptions: {} }];
  d.positions = [
    { id: 'konto', name: 'Girokonto', category: 'cash', groupId: 'g1', archived: false, custom: false, ticker: null, unit: null },
    { id: 'auto', name: 'Auto', category: 'vehicle', groupId: 'g2', archived: false, custom: true, ticker: null, unit: null, liquidity: 'illiquid', valuation: 'manual', ...(dep ? { depreciation: dep } : {}) }
  ];
  const vals = [{ positionId: 'konto', value: 50000 }, { positionId: 'auto', value: 20000 }];
  if (second) {
    d.positions.push({ id: 'roller', name: 'Roller', category: 'vehicle', groupId: 'g2', archived: false, custom: true, ticker: null, unit: null, liquidity: 'illiquid', valuation: 'manual' });
    vals.push({ positionId: 'roller', value: 4000 });
  }
  d.snapshots = [{ month: '2026-09', positions: vals.map(v => ({ ...v })) }, { month: '2026-10', positions: vals }];
  return app(html, new MemoryStorage({ [Data.KEY]: JSON.stringify(d) }));
}
// Gruppenwert (nominal) je Prognosejahr und der Wert laut Plan im selben Kalendermonat
const pathOf = (a, key, ids) => a.json(`(()=>{const p=buildPlan(),j=p.groups.findIndex(g=>g.key===${JSON.stringify(key)}),d=simulatePlan(p,p.s.withdrawFrom,{record:true});
  const fs=_vf().filter(f=>${JSON.stringify(ids)}.includes(f.id));
  return Array.from({length:Math.min(p.nSteps,40)},(_,y)=>{const k=Math.round((p.firstAge+y-p.currentAge)*12),ym=LoanModel.addMonths(p.ym0,k);
    return{y,sim:d.perGross[j][y],plan:fs.reduce((x,f)=>x+(AssetModel.depreciatedValue(f.depreciation,ym)||0),0)};});})()`);

test('Demo: das Familienauto folgt in der Prognose seinem Abschreibungsplan (1 % je Monat)', () => {
  const a = app(html, new MemoryStorage({ [Data.KEY]: demoJSON }));
  const rows = pathOf(a, 'Auto', ['familienauto']);
  rows.forEach(r => assert.ok(Math.abs(r.sim - r.plan) < 1, `Jahr ${r.y}: ${r.sim} ≠ ${r.plan}`));
  assert.ok(rows[10].sim < rows[0].sim * 0.35, 'deutlich gefallen');
  const g = a.json("(()=>{const g=buildPlan().groups.find(x=>x.key==='Auto');return{depShare:g.depShare,b:g._buckets.map(b=>!!b.dep)};})()");
  assert.equal(g.depShare, 1); assert.deepEqual(g.b, [true]);
});

test('Gemischte Gruppe: die Garagen schreiben ab, der Rest der Immobilien wächst mit der Gruppenrendite', () => {
  const a = app(html, new MemoryStorage({ [Data.KEY]: demoJSON }));
  const r = a.json(`(()=>{const p=buildPlan(),j=p.groups.findIndex(g=>g.key==='Immobilien'),g=p.groups[j],d=simulatePlan(p,p.s.withdrawFrom,{record:true}),y=10,k=Math.round((p.firstAge+y-p.currentAge)*12);
    const gar=_vf().find(f=>f.label==='Garagen'),plain=g._buckets.filter(b=>!b.dep).reduce((x,b)=>x+b.value,0);
    return{depShare:g.depShare,sim:d.perGross[j][y],gar:AssetModel.depreciatedValue(gar.depreciation,LoanModel.addMonths(p.ym0,k)),plain,ret:g.ret,months:k};})()`);
  assert.ok(r.depShare > 0.1 && r.depShare < 0.2);
  const rest = r.sim - r.gar;
  const expected = r.plain * Math.exp(Math.log(1 + r.ret) / 12 * r.months);
  assert.ok(Math.abs(rest / expected - 1) < 0.01, `Rest ${Math.round(rest)} ≈ ${Math.round(expected)}`);
});

test('Feste Abschreibung je Jahr: fällt bis 0 und bleibt dort, nie negativ', () => {
  const dep = { method: 'absolute', amount: 5000, interval: 'year', startMonth: '2026-10', startValue: 20000 };
  const a = fixture({ dep });
  const rows = pathOf(a, 'Fahrzeuge', ['auto']);
  rows.forEach(r => assert.ok(Math.abs(r.sim - r.plan) < 1, `Jahr ${r.y}: ${r.sim} ≠ ${r.plan}`));
  assert.ok(rows.slice(5).every(r => r.sim === 0), 'nach vier Jahren 0');
});

test('Ohne Abschreibung: wie bisher Rendite der Gruppe; mit Abschreibung keine Schwankung im Monte-Carlo', () => {
  const plain = fixture();
  const r = plain.json(`(()=>{const p=buildPlan(),g=p.groups.find(x=>x.key==='Fahrzeuge');return{dep:g._buckets.some(b=>b.dep),depShare:g.depShare,ret:g.ret,depF:p.depF.every(x=>x===null)};})()`);
  assert.deepEqual(r, { dep: false, depShare: 0, ret: -0.05, depF: true });
  const a = fixture({ dep: { method: 'percent', amount: 15, interval: 'year', startMonth: '2026-01', startValue: 23000 } });
  a.run("getAssetParam=(ap,k,f,c)=>f==='vol'&&k==='Fahrzeuge'?40:({ret:0,vol:0,saving:0,retDyn:0,volDyn:0,tax:0,avail:0})[f]??0");
  const mc = a.json(`(()=>{const p=buildPlan(),j=p.groups.findIndex(g=>g.key==='Fahrzeuge'),rnd=_mcNormals(MC_RUNS,p.nSteps,p.groups.length);
    return [0,1,2].map(run=>Math.round(simulatePlan(p,p.s.withdrawFrom,{rnd,run,record:true}).perGross[j][8]));})()`);
  assert.equal(new Set(mc).size, 1, 'alle Läufe gleich: ' + mc.join(', '));
});

test('Gruppe mit und ohne Abschreibung: Sparraten landen im Topf ohne Abschreibung', () => {
  const a = fixture({ dep: { method: 'percent', amount: 1, interval: 'month', startMonth: '2026-01', startValue: 22000 }, second: true });
  const r = a.json(`(()=>{const p=buildPlan(),g=p.groups.find(x=>x.key==='Fahrzeuge'),t=p.buckets[g.target];return{n:g._buckets.length,targetDep:!!t.dep,depShare:Math.round(g.depShare*100)};})()`);
  assert.deepEqual(r, { n: 2, targetDep: false, depShare: 83 });
});

test('Annahmen und Erklärung: Hinweis statt Rendite, wenn die Gruppe ganz abgeschrieben wird', () => {
  assert.match(html, /const depAll=g\.depShare>=0\.999,depSome=!depAll&&g\.depShare>0\.001;/);
  assert.match(html, /Der Wert folgt der Abschreibung \(Daten → Vermögenswerte → Position\)\. Rendite und Schwankung wirken hier nicht\./);
  assert.match(html, /Positionen mit Abschreibung folgen ihrem Abschreibungsplan \(Daten → Vermögenswerte\)\. Rendite und Schwankung gelten für den Rest der Gruppe\./);
  assert.match(html, /if\(!depAll\)\{\n      html\+=field\(g,'ret','Rendite'/);
  assert.match(html, /g\.depShare>=0\.999\?`<td colspan="2">\$\{L\('laut Abschreibung','per depreciation'\)\}<\/td>`/);
});

test('Startbestand aus einem anderen Monat (Live-Monat voraus bzw. veralteter Stand): Wert danach genau laut Plan', () => {
  const dep = { method: 'percent', amount: 1, interval: 'month', startMonth: '2025-01', startValue: 28000 };
  const Asset = require('../asset-model.js');
  for (const month of ['2026-11', '2026-08']) {
    const d = Data.empty();
    d.groups = [{ id: 'g1', name: 'Cash', assumptions: {} }, { id: 'g2', name: 'Fahrzeuge', assumptions: {} }];
    d.positions = [
      { id: 'konto', name: 'Girokonto', category: 'cash', groupId: 'g1', archived: false, custom: false, ticker: null, unit: null },
      { id: 'auto', name: 'Auto', category: 'vehicle', groupId: 'g2', archived: false, custom: true, ticker: null, unit: null, liquidity: 'illiquid', valuation: 'manual', depreciation: dep }
    ];
    d.snapshots = [{ month, positions: [{ positionId: 'konto', value: 50000 }, { positionId: 'auto', value: Asset.depreciatedValue(dep, month) }] }];
    const a = app(html, new MemoryStorage({ [Data.KEY]: JSON.stringify(d) }));
    assert.equal(a.run('buildPlan().latestKey'), month);
    pathOf(a, 'Fahrzeuge', ['auto']).forEach(r => assert.ok(Math.abs(r.sim - r.plan) < 1, `${month}, Jahr ${r.y}: ${r.sim} ≠ ${r.plan}`));
  }
});

/* 16.10.2026: Sparquote auf der Budget-Seite = Ersparnis ÷ Einnahmen. Ersparnis = Einnahmen − Ausgaben (Fixkosten inkl.
   Kreditzinsen + Lebenshaltung), also Sparpläne, Tilgung und der Rest, der nach allen Ausgaben übrig bleibt. Vorher zählte
   nur der Vermögensaufbau (Sparpläne + Tilgung): der Rest fehlte, und eine Sondertilgung aus vorhandenem Guthaben zählte
   als neue Ersparnis. Alle Quoten rechnen über alle Planmonate mit derselben Basis (BU2). Auf dem iPhone stehen nur die
   Kacheln Einnahmen und Sparquote. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, MemoryStorage } = require('./app-harness.cjs');
const Data = require('../data-store.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const item = (id, name, category, kind, months, extra = {}) => ({ id, name, category, subcategory: '', kind, targetGroupId: null, monthlyAmounts: months, ...extra });
const all = v => Array(12).fill(v);
function budget(items) {
  const d = Data.empty();
  d.groups = [{ id: 'g1', name: 'ETF', assumptions: {} }];
  d.budget = { items, standingOrders: [], oneTime: [] };
  return app(html, new MemoryStorage({ [Data.KEY]: JSON.stringify(d) }));
}

test('Sparquote: Sparpläne, Tilgung und der Rest nach allen Ausgaben; geplant nur Sparpläne', () => {
  const a = budget([
    item('b1', 'Gehalt', 'einkommen', 'income', all(4000)),
    item('b2', 'Miete', 'fixe', 'expense', all(1200)),
    item('b3', 'Lebensmittel', 'variable', 'expense', all(800)),
    item('b4', 'ETF Sparplan', 'sparen', 'saving', all(500), { targetGroupId: 'g1' })
  ]);
  const c = a.json('calcBudgetMonth(loadBudgetData(),0)');
  assert.equal(c.ersparnis, 2000);
  assert.equal(c.frei, 1500);
  assert.equal(c.sparquote, 50, 'Monat: (4.000 − 2.000) ÷ 4.000');
  const q = a.json('_budgetQuotes(loadBudgetData())');
  assert.equal(q.savings, 0.5); assert.equal(q.planned, 0.125);
  assert.equal(q.fix, 0.3); assert.equal(q.variable, 0.2); assert.equal(q.saveAvg, 2000);
});

test('Ausgaben über den Einnahmen: negative Sparquote', () => {
  const a = budget([item('b1', 'Gehalt', 'einkommen', 'income', all(2000)), item('b2', 'Miete', 'fixe', 'expense', all(2500))]);
  assert.equal(a.json('_budgetQuotes(loadBudgetData())').savings, -0.25);
  assert.match(html, /pctTxt=v=>\(v<0\?'−':''\)\+Math\.abs\(q\(v\)\)\+'%'/);
});

test('Gleiche Basis (BU2): Einnahmen erst ab Juli, Ausgaben das ganze Jahr', () => {
  const half = Array(12).fill(0).map((_, i) => i >= 6 ? 4000 : 0);
  const a = budget([item('b1', 'Gehalt', 'einkommen', 'income', half), item('b2', 'Miete', 'fixe', 'expense', all(1000))]);
  const q = a.json('_budgetQuotes(loadBudgetData())');
  // 24.000 € Einnahmen, 12.000 € Miete im Jahr: halbe Fixkostenquote, nicht 1.000 ÷ 4.000 = 25 %
  assert.equal(q.fix, 0.5); assert.equal(q.savings, 0.5);
});

test('Ohne Einnahmen: keine Quote', () => {
  const a = budget([item('b2', 'Miete', 'fixe', 'expense', all(1000))]);
  assert.equal(a.json('_budgetQuotes(loadBudgetData())'), null);
});

test('Kachel-Text und iPhone: nur Einnahmen und Sparquote', () => {
  assert.match(html, /@media \(max-width:767px\)\{#page-budget \.kpi-item\.kpi-wide-only\{display:none\}\}/);
  const tiles = [...html.matchAll(/<div class="kpi-item( kpi-wide-only)?">\s*<div class="kpi-flip-inner">\s*<div class="kpi-face-front">\s*<div class="kpi-label">([^<]+)<\/div>\s*<div class="kpi-val[^"]*" id="budget-/g)].map(m => [m[2], !!m[1]]);
  assert.deepEqual(tiles, [['Einnahmen', false], ['Fixkosten', true], ['Lebenshaltung', true], ['Sparquote', false]]);
  assert.match(html, /Anteil der Einnahmen, der nicht ausgegeben wird: Sparpläne, Tilgung und was nach allen Ausgaben übrig bleibt\. Kreditzinsen zählen als Ausgabe\./);
  const en = fs.readFileSync(path.join(__dirname, '..', 'i18n-en.js'), 'utf8');
  assert.match(en, /'Anteil der Einnahmen, der nicht ausgegeben wird: [^']+': 'Share of income that is not spent: /);
});

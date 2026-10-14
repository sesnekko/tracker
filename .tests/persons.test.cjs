/* Personenmodell (Schema 14, Entscheidung 14.10.2026): Personen sind „Ich“ (retirement.primary) und weitere Personen
   (retirement.people). Budget-Einnahmen und weitere Einkünfte lassen sich einer Person zuordnen. Das Gehalt einer
   Person kommt aus ihren Budget-Einnahmen; das Feld monthlyNetIncome aus Schema 13 entfällt und wird migriert. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Data = require('../data-store.js');
const { MemoryStorage } = require('./app-harness.cjs');

const budget = rows => JSON.stringify({ einkommen: rows, fixe: [], variable: [], sparen: [], accounts: {}, standingOrders: [] });
const income = (id, name, amount, extra = {}) => ({ id, name, subcat: '', kind: 'income', targetGroupId: null, values: Array(12).fill(amount), ...extra });
const legacy = {
  'lt-birth-year': '1985',
  'lt-drv-extra': JSON.stringify([{ id: 'person-1', name: 'Anna', by: 1987, until: 67 }]),
  budgetData: budget([income('budget-1', 'Nettogehalt Max', 3200, { person: 'person-main' }), income('budget-2', 'Nettogehalt Anna', 1800, { person: 'person-1' }), income('budget-3', 'Kindergeld', 250)]),
  'lt-pensions': JSON.stringify([{ id: 'income-1', name: 'Betriebsrente Anna', amount: 180, from: 67, person: 'person-1' }, { id: 'income-2', name: 'Miete', amount: 300, from: 65 }])
};
const store = (values = legacy) => Data.createStore(new MemoryStorage(values));

test('Schema 14: Budget-Einnahmen und weitere Einkünfte tragen eine Person', () => {
  const s = store(), doc = s.document();
  assert.equal(doc.schemaVersion, Data.VERSION);
  const items = Object.fromEntries(doc.budget.items.map(i => [i.name, i.personId]));
  assert.equal(items['Nettogehalt Max'], doc.retirement.primary.id);
  assert.equal(items['Nettogehalt Anna'], 'person-1');
  assert.equal(items.Kindergeld, undefined, 'ohne Person = Haushalt');
  assert.equal(doc.retirement.incomes[0].personId, 'person-1');
  assert.equal(doc.retirement.incomes[1].personId, undefined, 'ohne Person = ich');
  const bd = JSON.parse(s.getItem('budgetData'));
  assert.equal(bd.einkommen[1].person, 'person-1');
  assert.equal(JSON.parse(s.getItem('lt-pensions'))[0].person, 'person-1');
  const r = Data.createStore(new MemoryStorage()); r.importBackup(s.exportBackup());
  assert.deepEqual(r.document(), doc, 'Export → Import unverändert');
});
test('Schema 14: Zuordnungen zu gelöschten Personen fallen weg, Daten bleiben', () => {
  const s = store();
  s.setItem('lt-drv-extra', '[]');
  const doc = s.document();
  assert.equal(doc.budget.items.find(i => i.name === 'Nettogehalt Anna').personId, undefined);
  assert.equal(doc.budget.items.find(i => i.name === 'Nettogehalt Anna').monthlyAmounts[0], 1800);
  assert.equal(doc.retirement.incomes[0].personId, undefined, 'Einkunft gehört dann mir, wie bei Depots');
  // Ausgaben und Sparposten tragen keine Person
  s.setItem('budgetData', budget([income('budget-9', 'Gehalt', 1000, { person: 'person-main', kind: 'expense' })]));
  assert.equal(s.document().budget.items[0].personId, undefined);
});
test('Schema 14: ungültige Personenverweise werden beim Import abgelehnt', () => {
  const s = store(), raw = JSON.stringify(s.document());
  for (const mutate of [
    d => { d.budget.items[0].personId = 'person-x'; },
    d => { d.budget.items.find(i => i.name === 'Kindergeld').kind = 'expense'; d.budget.items.find(i => i.name === 'Kindergeld').personId = 'person-1'; },
    d => { d.retirement.incomes[1].personId = 'person-x'; },
    d => { d.retirement.people[0].monthlyNetIncome = -5; }
  ]) {
    const bad = s.exportBackup(); mutate(bad);
    assert.throws(() => s.importBackup(bad));
    assert.equal(JSON.stringify(s.document()), raw);
  }
});
function v13(extra) {
  const doc = store().document();
  doc.schemaVersion = 13;
  doc.budget.items.forEach(i => delete i.personId);
  doc.retirement.incomes.forEach(i => delete i.personId);
  Object.assign(doc.retirement.people[0], extra);
  return doc;
}
test('Migration 13 → 14: Nettogehalt wird dem passenden Budgetposten zugeordnet', () => {
  const s = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(v13({ monthlyNetIncome: 1800 })) })), doc = s.document();
  assert.equal(doc.schemaVersion, Data.VERSION);
  assert.equal(doc.retirement.people[0].monthlyNetIncome, undefined);
  assert.equal(doc.budget.items.find(i => i.name === 'Nettogehalt Anna').personId, 'person-1');
  assert.equal(doc.budget.items.length, 3, 'kein zusätzlicher Posten, nichts doppelt');
});
test('Migration 13 → 16: ohne eindeutig passenden Posten entsteht kein Budgetposten; der Betrag bleibt zur Zuordnung (P35)', () => {
  // Bis Review 14.10.2026 entstand hier „Nettogehalt Kim“. Das konnte ein vorhandenes Gehalt mit anderem Namen
  // verdoppeln (P35). Jetzt bleibt der alte Betrag erhalten und die App fragt nach.
  const old = v13({ name: 'Kim', monthlyNetIncome: 900 });
  const s = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(old) })), doc = s.document();
  assert.deepEqual(doc.budget.items, old.budget.items, 'Budget unverändert');
  assert.equal(doc.retirement.people[0].monthlyNetIncome, 900);
  // ohne Budget: es entsteht auch kein Budget
  const nob = v13({ name: 'Kim', monthlyNetIncome: 900 }); nob.budget = null; nob.accounts = [];
  const d2 = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(nob) })).document();
  assert.equal(d2.budget, null);
  assert.equal(d2.retirement.people[0].monthlyNetIncome, 900);
  // Import einer Schema-13-Sicherung migriert genauso
  const t = Data.createStore(new MemoryStorage()); t.importBackup(v13({ monthlyNetIncome: 1800 }));
  assert.equal(t.document().budget.items.find(i => i.name === 'Nettogehalt Anna').personId, 'person-1', 'eindeutig gleicher Posten');
});
test('Migration 12 → 14: ältere Dokumente bleiben unverändert', () => {
  const doc = v13({}); doc.schemaVersion = 12;
  const migrated = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(doc) })).document();
  assert.deepEqual({ ...migrated, schemaVersion: 12 }, doc);
});

/* ── Kinder als Personen (Schema 14): Kindergeld und Kinderzulage werden aus ihnen abgeleitet ── */
const withKids = { ...legacy, 'lt-children': JSON.stringify([
  { id: 'child-1', name: 'Lena', by: 2019, bm: 5, parent: 'person-1' },
  { id: 'child-2', name: 'Tom', by: 2022, until: 25 }]) };
test('Kinder: Name, Geburtsmonat, Kindergeld bis 25 und Kinderzulage bei einem Elternteil', () => {
  const s = store(withKids), doc = s.document();
  assert.deepEqual(doc.retirement.children, [
    { id: 'child-1', name: 'Lena', birthYear: 2019, birthMonth: 5, allowanceParentId: 'person-1' },
    { id: 'child-2', name: 'Tom', birthYear: 2022, childBenefitUntilAge: 25 }]);
  assert.deepEqual(JSON.parse(s.getItem('lt-children')), [
    { id: 'child-1', name: 'Lena', by: 2019, bm: 5, parent: 'person-1' }, { id: 'child-2', name: 'Tom', by: 2022, until: 25 }]);
  const r = Data.createStore(new MemoryStorage()); r.importBackup(s.exportBackup());
  assert.deepEqual(r.document(), doc);
  // ohne Kinder kein Feld; ein gelöschter Elternteil gibt die Zulage an mich zurück
  assert.equal(store().document().retirement.children, undefined);
  s.setItem('lt-drv-extra', '[]');
  assert.equal(s.document().retirement.children[0].allowanceParentId, undefined);
});
test('Kinder: ungültige Angaben werden beim Import abgelehnt', () => {
  const s = store(withKids), raw = JSON.stringify(s.document());
  for (const mutate of [
    d => { d.retirement.children[0].birthMonth = 13; },
    d => { d.retirement.children[0].childBenefitUntilAge = 21; },
    d => { d.retirement.children[0].allowanceParentId = 'child-2'; },
    d => { d.retirement.children[1].id = 'person-1'; },
    d => { delete d.retirement.children[0].birthYear; },
    d => { d.retirement.pensionDepots = [{ id: 'depot-1', name: 'D', personId: d.retirement.primary.id, monthlyContribution: 50, childBirthYears: [2019] }]; }
  ]) {
    const bad = s.exportBackup(); mutate(bad);
    assert.throws(() => s.importBackup(bad));
    assert.equal(JSON.stringify(s.document()), raw);
  }
});
test('Migration: Kinder-Jahrgänge der Depots werden zu Kindern, die Zulage rechnet gleich', () => {
  const doc = v13({}); delete doc.retirement.people[0].monthlyNetIncome;
  doc.schemaVersion = 11;
  const main = doc.retirement.primary.id;
  doc.retirement.pensionDepots = [
    { id: 'depot-1', name: 'Max', personId: main, monthlyContribution: 150, childBirthYears: [2019] },
    { id: 'depot-2', name: 'Anna', personId: 'person-1', monthlyContribution: 50, childBirthYears: [2019, 2022, 2022] },
    { id: 'depot-3', name: 'Anna 2', personId: 'person-1', monthlyContribution: 10, childBirthYears: [2022] }];
  const m = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(doc) })).document();
  // bisher: jedes Kind zählt bei der zuerst genannten Person (ich), ein Jahrgang so oft wie in einem Depot
  assert.deepEqual(m.retirement.children.map(c => [c.birthYear, c.allowanceParentId ?? 'ich']), [[2019, 'ich'], [2022, 'person-1'], [2022, 'person-1']]);
  assert.ok(m.retirement.children.every(c => /^Kind/.test(c.name)));
  assert.ok(m.retirement.pensionDepots.every(d => !('childBirthYears' in d)));
});

/* ── Arbeitszeit und Altersvorsorge je Lebensphase (Schema 15, Entscheidung 14.10.2026) ── */
test('Schema 15: Arbeitszeit und Altersvorsorge je Phase werden je Person gespeichert', () => {
  const s = store({ ...legacy, 'lt-p1-work': '80', 'lt-p2-work': '50',
    'lt-drv-extra': JSON.stringify([{ id: 'person-1', name: 'Anna', by: 1987, until: 67, w1: 50, w2: 100, w4: 0, pen2: 50, pen3: 0 }]) });
  const doc = s.document(), p = doc.retirement.people[0];
  assert.deepEqual([p.phase1WorkPercent, p.phase2WorkPercent, p.phase3WorkPercent, p.phase4WorkPercent, p.phase2PensionPercent, p.phase3PensionPercent, p.phase4PensionPercent],
    [50, 100, undefined, 0, 50, 0, undefined]);
  assert.deepEqual([doc.forecast.settings.phase1WorkPercent, doc.forecast.settings.phase2WorkPercent], [80, 50], 'eigene Werte in den Prognose-Annahmen');
  assert.deepEqual(JSON.parse(s.getItem('lt-drv-extra'))[0], { id: 'person-1', name: 'Anna', by: 1987, until: 67, w1: 50, w2: 100, w4: 0, pen2: 50, pen3: 0 });
  const r = Data.createStore(new MemoryStorage()); r.importBackup(s.exportBackup());
  assert.deepEqual(r.document(), doc, 'Export → Import unverändert');
});
test('Schema 15: ungültige Phasenwerte werden beim Import abgelehnt', () => {
  const s = store({ ...legacy, 'lt-drv-extra': JSON.stringify([{ id: 'person-1', name: 'Anna', by: 1987, until: 67, w2: 50 }]) }), raw = JSON.stringify(s.document());
  for (const mutate of [
    d => { d.retirement.people[0].phase2WorkPercent = 120; },
    d => { d.retirement.people[0].phase3PensionPercent = 250; },
    d => { d.retirement.people[0].phase1WorkPercent = -5; },
    d => { d.retirement.people[0].phase1PensionPercent = 50; },
    d => { d.retirement.primary.phase2WorkPercent = 50; },
    d => { d.retirement.people[0].partTimeFromAge = 60; d.retirement.people[0].partTimePercent = 50; }
  ]) {
    const bad = s.exportBackup(); mutate(bad);
    assert.throws(() => s.importBackup(bad));
    assert.equal(JSON.stringify(s.document()), raw);
  }
});
test('Migration 14 → 16: Teilzeit ab einem Alter bleibt genau erhalten (P36)', () => {
  // Bis Review 14.10.2026 wurde Teilzeit der Phase zugeordnet, in der sie überwiegt; dabei ging der genaue Beginn
  // verloren (P36). Jetzt bleibt er unverändert, bis die Umstellung in der App bestätigt wird.
  const v14 = people => {
    const d = store({ ...legacy, 'lt-save-until': '55', 'lt-withdraw-from': '62', 'lt-pension-age': '67' }).document();
    d.schemaVersion = 14; d.retirement.people = people.map((x, i) => ({ id: 'person-' + (i + 1), name: 'P' + i, birthYear: 1987, workUntilAge: 67, statutoryPension: {}, ...x }));
    Data.validate(d); return d;
  };
  const cases = [{ partTimeFromAge: 60, partTimePercent: 50 }, { partTimeFromAge: 40, partTimePercent: 60 }, { partTimeFromAge: 52, partTimePercent: 80 }, { partTimeFromAge: 44, partTimePercent: 30 }];
  const m = Data.migrate(v14(cases)).retirement.people;
  assert.deepEqual(m.map(p => [p.partTimeFromAge, p.partTimePercent]), cases.map(c => [c.partTimeFromAge, c.partTimePercent]));
  assert.ok(m.every(p => !Object.keys(p).some(k => /^phase\dWorkPercent$/.test(k))));
  const doc = Data.createStore(new MemoryStorage({ [Data.KEY]: JSON.stringify(v14([cases[0]])) })).document();
  assert.equal(doc.schemaVersion, Data.VERSION);
  assert.deepEqual([doc.retirement.people[0].partTimeFromAge, doc.retirement.people[0].partTimePercent], [60, 50]);
});

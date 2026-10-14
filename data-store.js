/* Versioned, local data model. UI/calculation adapters keep the existing app's
 * numerical behaviour while persistence and backups use one explicit document. */
(function (root) {
  'use strict';
  const KEY = 'vermoegen-data-v1';
  // Stand vor dem letzten Update (Rohtext), geschrieben direkt vor dem ersten Speichern eines migrierten Dokuments (P37).
  const BACKUP_KEY = 'vermoegen-data-v1-before-update';
  const FORMAT = 'vermoegen-backup';
  const VERSION = 17;
  const CATEGORIES = ['cash', 'etf', 'stock', 'bitcoin', 'crypto', 'metal', 'realEstate', 'vehicle', 'other', 'bav', 'illiquid', 'liab'];
  const BUDGET_CATEGORIES = ['einkommen', 'fixe', 'variable', 'sparen'];
  const MODULES = ['assets', 'liab', 'pension', 'budget', 'forecast'];
  const PROFILES = { Cash: 'cash', ETF: 'etf', Bitcoin: 'bitcoin', Aktien: 'stocks',
    Edelmetalle: 'metals', BAV: 'pension', Uhren: 'watches', Sonstiges: 'misc',
    Immobilien: 'realEstate', Krypto: 'crypto', Kredite: 'loans' };
  const profileFor = name => own(PROFILES, name) ? PROFILES[name] : null;
  const SETTINGS = {
    'lt-life-expect': 'lifeExpectancyAge', 'lt-plan-horizon': 'planningHorizonAge',
    'lt-inflation': 'inflationPercent', 'lt-save-until': 'saveUntilAge',
    'lt-savings-growth': 'savingsGrowthPercent', 'lt-withdraw-from': 'retirementAge',
    'lt-monthly-withdraw': 'monthlySpending', 'lt-safety': 'safetyPercent',
    // Version 10: Lebensphasen. saveUntilAge beendet das Ansparen (Phase 2 beginnt), retirementAge die Arbeit
    // (Vorruhestand), pensionStartAge beginnt die Rente (Phase 4). Fehlende Felder = bisheriges Verhalten.
    'lt-pension-age': 'pensionStartAge', 'lt-pension-spending': 'pensionSpending',
    'lt-p2-saving': 'phase2SavingPercent', 'lt-p2-work': 'phase2WorkPercent', 'lt-p2-withdraw': 'phase2MonthlyWithdrawal',
    // Version 11: Altersvorsorge (Betriebsrente, Altersvorsorgedepots) getrennt vom privaten Sparen,
    // im Weiterarbeiten und im Vorruhestand je in % der heutigen Beiträge.
    'lt-p2-pension': 'phase2PensionPercent', 'lt-p3-saving': 'phase3SavingPercent', 'lt-p3-pension': 'phase3PensionPercent',
    // Version 15: Arbeitszeit der eigenen Person schon in Phase 1 (leer = 100 %); in Phase 2 leer = wie in Phase 1.
    // Altersvorsorge leer = solange die Person arbeitet 100 %, danach keine.
    'lt-p1-work': 'phase1WorkPercent'
  };
  // Version 15: weitere Personen je Lebensphase (Phasen und Alter der eigenen Person): Arbeitszeit in % einer Vollzeitstelle
  // (leer = wie in der Phase davor, Phase 1: 100) und Altersvorsorge in % der heutigen Beiträge (leer = solange sie arbeitet).
  const PERSON_PHASES = {
    w1: 'phase1WorkPercent', w2: 'phase2WorkPercent', w3: 'phase3WorkPercent', w4: 'phase4WorkPercent',
    pen2: 'phase2PensionPercent', pen3: 'phase3PensionPercent', pen4: 'phase4PensionPercent'
  };
  const ASSUMPTIONS = {
    ret: 'returnPercent', vol: 'volatilityPercent', saving: 'monthlySaving',
    volDyn: 'volatilityTrendPercent', retDyn: 'returnTrendPercent',
    avail: 'availableFromAge', tax: 'withdrawalDeductionPercent'
  };
  const LOANS = {
    rate: 'interestPercent', pay: 'monthlyPayment', extra: 'annualExtraPayment',
    fixed: 'fixedUntilYear', follow: 'followUpInterestPercent',
    principal: 'principalAmount', repayment: 'initialRepaymentPercent', fixedYears: 'fixedInterestYears'
  };
  const DRV = {
    points: 'points', salary: 'annualSalary', age: 'retirementAge',
    deduct: 'deductionPercent', rw: 'pensionPointValue', de: 'averageSalary',
    bbg: 'contributionCeiling',
    // Version 7: laufende Erwerbsminderungsrente (1 = teilweise, 2 = voll) der eigenen Person,
    // seit Version 8 auch für weitere Personen.
    emType: 'disabilityType', em: 'disabilityPension', emUntil: 'disabilityUntilYear', emLimit: 'earningsLimit'
  };
  // Gemeinsame Rechengrößen stehen nur bei der eigenen Person und gelten für alle.
  const DRV_PRIMARY = ['pensionPointValue', 'averageSalary', 'contributionCeiling'];
  // Version 8: Altersvorsorgedepots (ab 2027) je Person; fehlende Felder = Standardwerte der App.
  const AV_DEPOT = {
    contrib: 'monthlyContribution', balance: 'balance', start: 'startYear', ret: 'returnPercent',
    from: 'payoutAge', lump: 'lumpSumPercent', deduct: 'deductionPercent'
  };
  const birthYears = value => (String(value ?? '').match(/\d{4}/g) || []).map(Number);
  // Version 7: Beamtenversorgung der eigenen Person (Ruhegehalt aus Bezügen und Dienstjahren).
  const CIVIL = {
    pay: 'pensionableSalary', years: 'serviceYears', age: 'retirementAge',
    from: 'startAge', deduct: 'deductionPercent'
  };
  const LEGACY_KEYS = ['fieldConfig', 'finData', 'budgetData', 'loanParams',
    'lt-drv', 'lt-drv-extra', 'lt-children', 'lt-av-depots', 'lt-beamte', 'lt-pensions', 'lt-events', 'lt-asset-params',
    'lt-birth-year', 'lt-birth-month', 'v2-modules', 'darkMode', 'appLang', 'customFields',
    ...Object.keys(SETTINGS)];
  const copy = value => JSON.parse(JSON.stringify(value));
  const record = () => Object.create(null);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const parse = (values, key, fallback) => values[key] == null ? fallback : JSON.parse(values[key]);
  const number = value => {
    if (value == null || value === '') return undefined;
    const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('Ungültiger Zahlenwert: ' + value);
    return n;
  };
  const mapped = (value, names) => {
    const out = {};
    for (const [old, key] of Object.entries(names)) {
      const n = number(value && value[old]);
      if (n !== undefined) out[key] = n;
    }
    return out;
  };
  const unmapped = (value, names) => {
    const out = {};
    for (const [old, key] of Object.entries(names)) if (own(value, key)) out[old] = value[key];
    return out;
  };
  function empty() {
    return {
      format: FORMAT, schemaVersion: VERSION, currency: 'EUR',
      groups: [], positions: [], snapshots: [], accounts: [],
      budget: null, loans: [],
      retirement: { primary: { id: 'person-main', name: 'Eigene Person', statutoryPension: {} }, people: [], incomes: [] },
      forecast: { settings: {}, events: [] },
      preferences: { theme: null, modules: Object.fromEntries(MODULES.map(k => [k, true])), expandedSections: {}, onboardingCompleted: false }
    };
  }
  function nextId(prefix, used) {
    let i = 1;
    while (used.has(prefix + i)) i++;
    const id = prefix + i;
    used.add(id);
    return id;
  }
  function idsFor(prefix, previous) {
    const used = new Set(previous.map(x => x.id));
    const claimed = new Set();
    return (row, index) => {
      const byId = previous.find(p => p.id === row.id);
      let id;
      if (byId) id = claimed.has(byId.id) ? nextId(prefix, used) : byId.id;
      // New rows from the app bring their own ID; keep it instead of borrowing a namesake's.
      else if (typeof row.id === 'string' && /^[a-zA-Z0-9äöüß_-]+$/.test(row.id) && !used.has(row.id)) { id = row.id; used.add(id); }
      else {
        const match = previous.find(p => !claimed.has(p.id) && p.name === row.name);
        id = match ? match.id : nextId(prefix, used);
      }
      claimed.add(id);
      return id;
    };
  }
  // Name heuristics are confined to legacy/new-row conversion. The saved model
  // records the resulting kind and reference, so subsequent renames are safe.
  function budgetKind(row, category) {
    if (row.kind) return row.kind;
    if (category === 'einkommen') return 'income';
    const text = ((row.name || '') + ' ' + (row.subcat || '')).toLowerCase();
    if (/tilgung|kreditrate|darlehen|annuit|baufinanz|hypothek/.test(text))
      return /tilgung/.test(text) ? 'principal' : 'loanPayment';
    if (category === 'sparen' || (category === 'variable' &&
      (/etf|btc|bitcoin|cash|sparplan/.test(text) || (row.subcat || '').toLowerCase() === 'sparen'))) return 'saving';
    return 'expense';
  }
  function guessTarget(row, groups, positions, data) {
    const name = (row.name || '').toLowerCase();
    const latest = data[Object.keys(data).sort().pop()] || {};
    const hasDebt = g => positions.some(p => p.category === 'liab' && p.groupId === g.id && +(latest._details || {})[p.id] > 0);
    const category = (g, cat) => positions.some(p => p.groupId === g.id && p.category === cat);
    let g = groups.find(g => name.includes(g.name.toLowerCase()));
    if (!g && /tilgung|kredit|darlehen/.test(name)) g = groups.find(hasDebt);
    if (!g && /btc|bitcoin|krypto|crypto/.test(name)) g = groups.find(g => /bitcoin|krypto|crypto/i.test(g.name)) || groups.find(g => category(g, 'other'));
    if (!g && /gold|silber|edelmetall/.test(name)) g = groups.find(g => /edelmetall|gold/i.test(g.name));
    if (!g && /aktie/.test(name)) g = groups.find(g => /aktie/i.test(g.name));
    if (!g && /bauspar|bav|rente|riester|rürup|vorsorge/.test(name)) g = groups.find(g => category(g, 'bav'));
    if (!g && /cash|tagesgeld|sparbuch/.test(name)) g = groups.find(g => category(g, 'cash'));
    if (!g && /etf|msci|s&p|sparpl/.test(name)) g = groups.find(g => category(g, 'etf'));
    return g ? g.id : null;
  }
  function fromLegacy(values, previous = empty()) {
    const doc = empty();
    const config = parse(values, 'fieldConfig', { fields: [] });
    const fields = copy(config.fields || []);
    for (const f of parse(values, 'customFields', [])) if (!fields.some(x => x.id === f.id))
      fields.push({ ...f, category: f.category || 'cash', displayGroup: f.displayGroup || f.label });
    const data = parse(values, 'finData', {});
    // Very early versions stored category totals without individual positions.
    // Keep those totals as explicit historical positions instead of losing them.
    for (const entry of Object.values(data)) if (!entry._details) {
      entry._details = {};
      for (const category of CATEGORIES) if (number(entry[category])) {
        const id = 'legacy-total-' + category;
        if (!fields.some(f => f.id === id)) fields.push({ id, label: 'Historischer Bestand (' + category + ')', category, displayGroup: category });
        entry._details[id] = number(entry[category]);
      }
    }
    doc.groups = previous.groups.map(g => ({ id: g.id, name: g.name, defaultProfile: g.defaultProfile === undefined ? profileFor(g.name) : g.defaultProfile, assumptions: {} }));
    const usedGroups = new Set(previous.groups.map(g => g.id));
    const group = name => {
      name = String(name);
      let g = doc.groups.find(g => g.name === name);
      if (!g) {
        const old = previous.groups.find(g => g.name === name);
        g = { id: old ? old.id : nextId('group-', usedGroups), name, defaultProfile: profileFor(name), assumptions: {} };
        doc.groups.push(g);
      }
      return g;
    };
    doc.positions = fields.map(f => ({
      id: f.id, name: f.label, category: f.category,
      groupId: group(f.displayGroup || f.category).id,
      archived: false, custom: f.custom ?? f.id.startsWith('custom-'),
      ticker: f.ticker || null,
      unit: f.hasUnits ? { name: f.unitLabel || 'Stk', key: f.unitId || f.id } : null,
      ...Object.fromEntries(['liquidity','valuation','instrument','lastQuote','depreciation'].filter(k=>own(f,k)&&f[k]!=null).map(k=>[k,copy(f[k])]))
    }));
    for (const p of previous.positions) if (!doc.positions.some(x => x.id === p.id))
      doc.positions.push({ ...copy(p), archived: true });
    // Deleted fields still have historical values. Archive rather than discard them.
    const known = new Set(doc.positions.map(p => p.id));
    for (const entry of Object.values(data)) for (const id of Object.keys(entry._details || {})) if (!known.has(id)) {
      const old = previous.positions.find(p => p.id === id);
      doc.positions.push(old ? { ...copy(old), archived: true, groupId: group(previous.groups.find(g => g.id === old.groupId).name).id } :
        { id, name: id, category: 'other', groupId: group('Archiv').id, archived: true, custom: id.startsWith('custom-'), ticker: null, unit: null });
      known.add(id);
    }
    // Preserve quantity-only legacy records as archived positions as well.
    for (const entry of Object.values(data)) for (const key of Object.keys(entry._units || {})) if (!doc.positions.some(p => p.unit && p.unit.key === key)) {
      const p = doc.positions.find(p => p.id === key);
      if (p) p.unit = { name: 'Stk', key };
      else {
        doc.positions.push({ id: key, name: key, category: 'other', groupId: group('Archiv').id, archived: true, custom: false, ticker: null, unit: { name: 'Stk', key } });
        known.add(key);
      }
    }
    doc.snapshots = Object.keys(data).sort().map(month => {
      const e = data[month], details = e._details || {}, units = e._units || {};
      const snapshot = { month, positions: doc.positions.filter(p => own(details, p.id) || (p.unit && own(units, p.unit.key))).map(p => {
        const v = { positionId: p.id };
        if (own(details, p.id)) v.value = number(details[p.id]);
        if (p.unit && own(units, p.unit.key)) v.quantity = number(units[p.unit.key]);
        return v;
      }) };
      // Version 5: months reconstructed from price history stay marked until confirmed.
      if (e._estimated === true) snapshot.estimated = true;
      return snapshot;
    });
    const params = parse(values, 'lt-asset-params', {});
    for (const [name, value] of Object.entries(params)) group(name).assumptions = mapped(value, ASSUMPTIONS);
    const loans = parse(values, 'loanParams', {});
    // Older forecast rows embedded loan parameters in a group. Migrate those
    // directly onto the sole liability, matching the old migrateLoanParams().
    for (const [name, p] of Object.entries(params)) if (p.loanRate != null || p.loanPay != null) {
      const liabilities = doc.positions.filter(x => !x.archived && x.category === 'liab' && x.groupId === group(name).id);
      if (liabilities.length === 1) {
        const id = liabilities[0].id, old = loans[id];
        if (!old || (!(+old.rate > 0) && !(+old.pay > 0))) loans[id] = { rate: p.loanRate || 0, pay: p.loanPay || 0 };
      } else throw new Error('Alte Kreditparameter für „' + name + '“ können keinem eindeutigen Kredit zugeordnet werden');
    }
    for (const [id, value] of Object.entries(loans)) {
      if (!doc.positions.some(p => p.id === id)) {
        const old = previous.positions.find(p => p.id === id);
        doc.positions.push({ id, name: old ? old.name : id, category: 'liab', groupId: group(old ? previous.groups.find(g => g.id === old.groupId).name : 'Archiv').id, archived: true, custom: id.startsWith('custom-'), ticker: null, unit: null });
      }
      const loan={ positionId: id, ...mapped(value, LOANS) };
      if(own(value,'assetId'))loan.linkedAssetId=value.assetId;
      if(value.firstDue)loan.firstPaymentMonth=value.firstDue;
      if(own(value,'extras'))loan.extraPayments=copy(value.extras);
      doc.loans.push(loan);
    }
    const bd = parse(values, 'budgetData', null);
    if (bd) {
      const accountId = idsFor('account-', previous.accounts);
      doc.accounts = Object.entries(bd.accounts || {}).map(([name, iban], i) => ({ id: accountId({ name }, i), name, iban }));
      const endpoint = name => {
        const a = doc.accounts.find(a => a.name === name);
        return a ? { type: 'account', accountId: a.id } : { type: 'label', name };
      };
      const itemId = idsFor('budget-', previous.budget ? previous.budget.items : []);
      doc.budget = { items: [], standingOrders: [] };
      for (const category of BUDGET_CATEGORIES) for (const row of bd[category] || []) {
        const kind = budgetKind(row, category);
        const targetGroupId = own(row, 'targetGroupId') ? row.targetGroupId :
          (kind === 'saving' || kind === 'principal' || kind === 'loanPayment' ? guessTarget(row, doc.groups, doc.positions, data) : null);
        const item = { id: itemId(row), name: row.name, category, subcategory: row.subcat || '', kind, targetGroupId, monthlyAmounts: row.values.map(v => number(v) ?? 0) };
        // Version 6: a loan payment may name its loan, so its rate is split and never counted twice.
        if (row.loanId) item.loanId = row.loanId;
        // Version 9: a saving item may stand for an Altersvorsorgedepot, which then replaces it.
        if (row.depotId && kind === 'saving') item.depotId = row.depotId;
        // Version 11: an income may continue in retirement and then counts as retirement income.
        if (row.retirement && kind === 'income') item.retirementIncome = true;
        // Version 14: an income belongs to a person (salary until that person's end of work); checked below.
        if (row.person && kind === 'income') item.personId = String(row.person);
        // Version 17: Arbeitszeit zum Gehalt (Vollzeit 100, Teilzeit x %); gilt als heutige Arbeitszeit der Person
        const wp = number(row.workPct);
        if (wp !== undefined && item.personId && !item.retirementIncome) item.workPercent = wp;
        doc.budget.items.push(item);
      }
      const orderId = idsFor('order-', previous.budget ? previous.budget.standingOrders : []);
      doc.budget.standingOrders = (bd.standingOrders || []).map((r, i) => ({ id: orderId(r, i), from: endpoint(r.from), to: endpoint(r.to), amount: number(r.amount) ?? 0 }));
      // Version 4: one-time payments belong to one calendar month and never repeat.
      const onceId = idsFor('once-', (previous.budget && previous.budget.oneTime) || []);
      doc.budget.oneTime = (bd.oneTime || []).map((r, i) => {
        const category = BUDGET_CATEGORIES.includes(r.category) ? r.category : 'variable';
        return { id: onceId(r, i), name: r.name, category, kind: budgetKind(r, category), month: r.month, amount: number(r.amount) ?? 0, targetGroupId: r.targetGroupId ?? null };
      });
    }
    const primary = doc.retirement.primary;
    primary.id = previous.retirement.primary.id;
    primary.name = previous.retirement.primary.name;
    for (const [key, field] of [['lt-birth-year', 'birthYear'], ['lt-birth-month', 'birthMonth']]) {
      const n = number(values[key]);
      // Ein ungültiger Geburtsmonat aus der App überschreibt den gespeicherten Wert nicht (der Import prüft streng).
      if (field === 'birthMonth' && n !== undefined && !(Number.isInteger(n) && n >= 1 && n <= 12)) {
        if (own(previous.retirement.primary, 'birthMonth')) primary.birthMonth = previous.retirement.primary.birthMonth;
        continue;
      }
      if (n !== undefined) primary[field] = n;
    }
    primary.statutoryPension = mapped(parse(values, 'lt-drv', {}), DRV);
    const civil = mapped(parse(values, 'lt-beamte', {}), CIVIL);
    if (Object.keys(civil).length) primary.civilServicePension = civil;
    const personId = idsFor('person-', previous.retirement.people);
    doc.retirement.people = parse(values, 'lt-drv-extra', []).map((r, i) => {
      const p = { id: personId(r, i), name: r.name || '', statutoryPension: mapped(r, DRV) };
      const by = number(r.by), until = number(r.until);
      if (by !== undefined) p.birthYear = by;
      if (until !== undefined) p.workUntilAge = until;
      Object.assign(p, mapped(r, PERSON_PHASES));
      // Version 16 (P36): Teilzeit ab einem Alter der Person aus Schema 14 bleibt genau erhalten, bis sie bewusst auf
      // Lebensphasen umgestellt wird. Unvollständiges wird nicht still verworfen, die Prüfung lehnt es ab.
      const ptFrom = number(r.ptFrom), ptPct = number(r.ptPct);
      if (ptFrom !== undefined) p.partTimeFromAge = ptFrom;
      if (ptPct !== undefined) p.partTimePercent = ptPct;
      // Version 16 (P35): Nettogehalt aus Schema 13, das noch keinem Budgetposten zugeordnet ist.
      const net = number(r.net);
      if (net !== undefined) p.monthlyNetIncome = net;
      // Version 17: Beamtenversorgung auch für weitere Personen (jede Altersvorsorge gehört zu einer Person)
      if (r.bv && typeof r.bv === 'object') { const c = mapped(r.bv, CIVIL); if (Object.keys(c).length) p.civilServicePension = c; }
      // Version 14: das Gehalt einer Person kommt aus ihren Budget-Einnahmen (budget.items[].personId), nicht mehr aus „net“.
      return p;
    });
    const depotId = idsFor('depot-', previous.retirement.pensionDepots || []);
    const personIds = [primary.id, ...doc.retirement.people.map(p => p.id)];
    doc.retirement.pensionDepots = parse(values, 'lt-av-depots', []).map((r, i) => {
      // Ohne gültige Person (z. B. weitere Rente gelöscht) gehört das Depot zur eigenen Person.
      const d = { id: depotId(r, i), name: r.name || '', personId: personIds.includes(r.person) ? r.person : primary.id, ...mapped(r, AV_DEPOT) };
      if (d.monthlyContribution === undefined) d.monthlyContribution = 0;
      const kids = birthYears(r.kids);
      if (kids.length) d.childBirthYears = kids;
      // Version 16 (P37): frühere Kinder-Jahrgänge, die kein gültiges Geburtsjahr sind, warten auf Klärung
      if (Array.isArray(r.kidsOpen) && r.kidsOpen.length) d.unresolvedChildBirthYears = r.kidsOpen.map(y => number(y));
      // Version 11: the depot's value can come from an asset position (with quotes) in the overview.
      if (r.pos && doc.positions.some(p => p.id === r.pos && p.category !== 'liab')) d.positionId = r.pos;
      return d;
    });
    // Version 14: Kinder als Personen. Kindergeld und Kinderzulage werden aus ihnen abgeleitet; Zeilen ohne Geburtsjahr
    // fehlen noch (z. B. während der Eingabe) und werden nicht gespeichert. Ohne gültigen Elternteil zählt die Zulage bei mir.
    const childId = idsFor('child-', previous.retirement.children || []);
    const children = parse(values, 'lt-children', []).map((r, i) => {
      const by = number(r.by); if (!(Number.isInteger(by) && by >= 1900 && by <= 2200)) return null;
      const c = { id: childId(r, i), name: String(r.name || '').trim() || 'Kind', birthYear: by };
      const bm = number(r.bm); if (Number.isInteger(bm) && bm >= 1 && bm <= 12) c.birthMonth = bm;
      if (number(r.until) === 25) c.childBenefitUntilAge = 25;
      if (r.parent && r.parent !== primary.id && personIds.includes(r.parent)) c.allowanceParentId = r.parent;
      return c;
    }).filter(Boolean);
    if (children.length) { doc.retirement.children = children; doc.retirement.pensionDepots.forEach(d => delete d.childBirthYears); }
    else moveDepotChildren(doc);
    // A removed depot leaves its budget item as an ordinary saving item.
    const depotIds = new Set(doc.retirement.pensionDepots.map(d => d.id));
    if (doc.budget) for (const item of doc.budget.items) if (own(item, 'depotId') && !depotIds.has(item.depotId)) delete item.depotId;
    // A removed person leaves its incomes as household incomes.
    if (doc.budget) for (const item of doc.budget.items) if (own(item, 'personId') && !personIds.includes(item.personId)) { delete item.personId; delete item.workPercent; }
    const incomeId = idsFor('income-', previous.retirement.incomes);
    doc.retirement.incomes = parse(values, 'lt-pensions', []).map((r, i) => {
      const item = { id: incomeId(r, i), name: r.name || '', monthlyAmount: number(r.amount) ?? 0, fromAge: number(r.from) ?? 0 };
      // Version 14: eine Einkunft einer weiteren Person; Alter dann in deren Alter. Ohne (gültige) Person gehört sie mir.
      if (r.person && r.person !== primary.id && personIds.includes(r.person)) item.personId = r.person;
      // Version 13: optionales Ende einer Einkunft (z. B. Teilzeitjob oder Vermietung bis zu einem Alter).
      // Ein Ende vor dem Beginn (z. B. während der Eingabe) wird nicht gespeichert; der Import lehnt es ab.
      const until = number(r.until);
      if (until !== undefined && until > 0 && until > item.fromAge) item.untilAge = until;
      return item;
    });
    for (const [key, field] of Object.entries(SETTINGS)) {
      const n = number(values[key]);
      if (n !== undefined) doc.forecast.settings[field] = n;
    }
    const eventId = idsFor('event-', previous.forecast.events);
    const ref = value => value === '*' ? { type: 'liquid' } : !value ? { type: 'external' } : { type: 'group', groupId: group(value).id };
    doc.forecast.events = parse(values, 'lt-events', []).map((r, i) => {
      const amount = number(r.amount) ?? 0;
      const legacy = r.from == null && r.to == null;
      const cash = fields.find(f => f.category === 'cash');
      const from = legacy ? (amount < 0 ? '*' : '') : r.from;
      const to = legacy ? (amount >= 0 && cash ? (cash.displayGroup || 'cash') : '') : r.to;
      return { id: eventId(r, i), name: r.name || '', year: number(r.year) ?? 0, amount: Math.abs(amount), from: ref(from), to: ref(to) };
    });
    const mods = parse(values, 'v2-modules', {});
    doc.preferences.onboardingCompleted = previous.preferences.onboardingCompleted === true;
    for (const k of MODULES) doc.preferences.modules[k] = mods[k] !== false;
    // Version 11: 'system' follows the device setting.
    doc.preferences.theme = values.darkMode === '0' ? 'light' : values.darkMode === '1' ? 'dark' : values.darkMode === '2' ? 'system' : null;
    // Version 12: language of the app (German by default).
    if (values.appLang === 'en' || values.appLang === 'de') doc.preferences.language = values.appLang;
    for (const key of Object.keys(values)) if (key.startsWith('ui-open-')) doc.preferences.expandedSections[key.slice(8)] = values[key] === '1';
    validate(doc);
    return doc;
  }
  function toLegacy(doc) {
    const values = record();
    const put = (k, v) => { values[k] = JSON.stringify(v); };
    const groupName = id => doc.groups.find(g => g.id === id).name;
    const fields = doc.positions.filter(p => !p.archived).map(p => {
      const f = { id: p.id, label: p.name, category: p.category, displayGroup: groupName(p.groupId), hasUnits: !!p.unit, custom: p.custom };
      for(const k of ['liquidity','valuation','instrument','lastQuote','depreciation'])if(own(p,k))f[k]=copy(p[k]);
      if (p.ticker) f.ticker = p.ticker;
      if (p.unit) { f.unitLabel = p.unit.name; f.unitId = p.unit.key; }
      return f;
    });
    put('fieldConfig', { fields, liveTickers: {} });
    const data = record();
    for (const snapshot of doc.snapshots) {
      const e = { cash: 0, etf: 0, other: 0, bav: 0, illiquid: 0, liab: 0, _details: record(), _units: record() };
      for (const v of snapshot.positions) {
        const p = doc.positions.find(p => p.id === v.positionId);
        if (own(v, 'value')) { e._details[p.id] = v.value; if (!p.archived) e[p.category] = (e[p.category]||0) + v.value; }
        if (own(v, 'quantity')) e._units[p.unit.key] = v.quantity;
      }
      if (snapshot.estimated) e._estimated = true;
      data[snapshot.month] = e;
    }
    put('finData', data);
    if (doc.budget) {
      const bd = Object.fromEntries(BUDGET_CATEGORIES.map(k => [k, []]));
      bd.accounts = Object.fromEntries(doc.accounts.map(a => [a.name, a.iban]));
      const endpoint = v => v.type === 'account' ? doc.accounts.find(a => a.id === v.accountId).name : v.name;
      bd.standingOrders = doc.budget.standingOrders.map(o => ({ id: o.id, from: endpoint(o.from), to: endpoint(o.to), amount: o.amount }));
      for (const r of doc.budget.items) bd[r.category].push({ id: r.id, name: r.name, subcat: r.subcategory, kind: r.kind, targetGroupId: r.targetGroupId, targetGroup: r.targetGroupId ? groupName(r.targetGroupId) : null, ...(r.loanId ? { loanId: r.loanId } : {}), ...(r.depotId ? { depotId: r.depotId } : {}), ...(r.retirementIncome ? { retirement: true } : {}), ...(r.personId ? { person: r.personId } : {}), ...(own(r, 'workPercent') ? { workPct: r.workPercent } : {}), values: copy(r.monthlyAmounts) });
      bd.oneTime = copy(doc.budget.oneTime || []);
      put('budgetData', bd);
    }
    const lp = record();
    for (const l of doc.loans) {
      const p=unmapped(l, LOANS);
      if(own(l,'linkedAssetId'))p.assetId=l.linkedAssetId;
      if(own(l,'firstPaymentMonth'))p.firstDue=l.firstPaymentMonth;
      if(own(l,'extraPayments'))p.extras=copy(l.extraPayments);
      lp[l.positionId]=p;
    }
    put('loanParams', lp);
    const primary = doc.retirement.primary;
    if (own(primary, 'birthYear')) values['lt-birth-year'] = String(primary.birthYear);
    if (own(primary, 'birthMonth')) values['lt-birth-month'] = String(primary.birthMonth);
    put('lt-drv', unmapped(primary.statutoryPension, DRV));
    if (own(primary, 'civilServicePension')) put('lt-beamte', unmapped(primary.civilServicePension, CIVIL));
    put('lt-drv-extra', doc.retirement.people.map(p => ({ id: p.id, name: p.name, by: p.birthYear ?? '', until: p.workUntilAge ?? '',
      ...unmapped(p, PERSON_PHASES), ...(own(p, 'partTimeFromAge') ? { ptFrom: p.partTimeFromAge } : {}),
      ...(own(p, 'partTimePercent') ? { ptPct: p.partTimePercent } : {}), ...(own(p, 'monthlyNetIncome') ? { net: p.monthlyNetIncome } : {}),
      ...(own(p, 'civilServicePension') ? { bv: unmapped(p.civilServicePension, CIVIL) } : {}),
      ...unmapped(p.statutoryPension, DRV) })));
    put('lt-children', (doc.retirement.children || []).map(c => ({ id: c.id, name: c.name, by: c.birthYear, ...(c.birthMonth ? { bm: c.birthMonth } : {}),
      ...(c.childBenefitUntilAge ? { until: c.childBenefitUntilAge } : {}), ...(c.allowanceParentId ? { parent: c.allowanceParentId } : {}) })));
    put('lt-av-depots', (doc.retirement.pensionDepots || []).map(d => ({
      id: d.id, name: d.name, person: d.personId === primary.id ? '' : d.personId,
      ...unmapped(d, AV_DEPOT), ...(d.childBirthYears ? { kids: d.childBirthYears.join(', ') } : {}),
      ...(d.unresolvedChildBirthYears ? { kidsOpen: d.unresolvedChildBirthYears.slice() } : {}),
      ...(d.positionId ? { pos: d.positionId } : {})
    })));
    put('lt-pensions', doc.retirement.incomes.map(p => ({ id: p.id, name: p.name, amount: p.monthlyAmount, from: p.fromAge, ...(p.untilAge !== undefined ? { until: p.untilAge } : {}), ...(p.personId ? { person: p.personId } : {}) })));
    for (const [key, field] of Object.entries(SETTINGS)) if (own(doc.forecast.settings, field)) values[key] = String(doc.forecast.settings[field]);
    const endpoint = ref => ref.type === 'external' ? '' : ref.type === 'liquid' ? '*' : groupName(ref.groupId);
    put('lt-events', doc.forecast.events.map(e => ({ id: e.id, name: e.name, year: e.year, amount: e.amount, from: endpoint(e.from), to: endpoint(e.to) })));
    const ap = record();
    for (const g of doc.groups) if (Object.keys(g.assumptions).length) ap[g.name] = unmapped(g.assumptions, ASSUMPTIONS);
    put('lt-asset-params', ap);
    put('v2-modules', doc.preferences.modules);
    if (doc.preferences.theme !== null) values.darkMode = doc.preferences.theme === 'dark' ? '1' : doc.preferences.theme === 'system' ? '2' : '0';
    if (doc.preferences.language) values.appLang = doc.preferences.language;
    for (const [key, value] of Object.entries(doc.preferences.expandedSections)) values['ui-open-' + key] = value ? '1' : '0';
    return values;
  }
  function validate(doc) {
    const fail = (path, message) => { throw new Error(path + ': ' + message); };
    const object = (v, path, keys, required = keys) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'Objekt erwartet');
      for (const k of Object.keys(v)) if (!keys.includes(k)) fail(path + '.' + k, 'unbekanntes Feld');
      for (const k of required) if (!own(v, k)) fail(path + '.' + k, 'fehlt');
    };
    const array = (v, p) => { if (!Array.isArray(v)) fail(p, 'Liste erwartet'); };
    const text = (v, p, nonempty = false) => {
      if (typeof v !== 'string' || (nonempty && !v.trim())) fail(p, 'Text erwartet');
      if (['__proto__', 'constructor', 'prototype'].includes(v)) fail(p, 'reservierter Name');
    };
    const num = (v, p, min = -Infinity) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min) fail(p, 'ungültige Zahl'); };
    const month = (v,p) => { if(typeof v!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))fail(p,'YYYY-MM erwartet'); };
    const bool = (v, p) => { if (typeof v !== 'boolean') fail(p, 'Ja/Nein erwartet'); };
    const id = (v, p) => { text(v, p, true); if (!/^[a-zA-Z0-9äöüß_-]+$/.test(v) || ['__proto__', 'constructor', 'prototype'].includes(v)) fail(p, 'ungültige ID'); };
    const unique = (rows, path, key = 'id') => {
      array(rows, path); const ids = new Set();
      for (const r of rows) { if (!r || typeof r !== 'object') fail(path, 'Objekt erwartet'); id(r[key], path + '.' + key); if (ids.has(r[key])) fail(path, 'doppelte ID ' + r[key]); ids.add(r[key]); }
      return ids;
    };
    const numericObject = (v, p, keys) => { object(v, p, keys, []); for (const [k, n] of Object.entries(v)) num(n, p + '.' + k); };
    const ref = (v, p, ids, key) => { if (!ids.has(v)) fail(p, 'unbekannter Verweis ' + v); };
    // Reject prototype keys anywhere, including dictionaries used by adapters.
    const safeKeys = (v, p = 'Datei') => {
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) { if (['__proto__', 'constructor', 'prototype'].includes(k)) fail(p, 'unzulässiger Schlüssel'); safeKeys(v[k], p + '.' + k); }
    };
    safeKeys(doc);
    object(doc, 'Datei', ['format', 'schemaVersion', 'currency', 'exportedAt', 'groups', 'positions', 'snapshots', 'accounts', 'budget', 'loans', 'retirement', 'forecast', 'preferences'], ['format', 'schemaVersion', 'currency', 'groups', 'positions', 'snapshots', 'accounts', 'budget', 'loans', 'retirement', 'forecast', 'preferences']);
    if (doc.format !== FORMAT) fail('format', 'keine Assets-Sicherung');
    if (![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,VERSION].includes(doc.schemaVersion)) fail('schemaVersion', 'nicht unterstützte Version ' + doc.schemaVersion);
    if (doc.currency !== 'EUR') fail('currency', 'nur EUR wird unterstützt');
    if (own(doc, 'exportedAt') && (typeof doc.exportedAt !== 'string' || !Number.isFinite(Date.parse(doc.exportedAt)))) fail('exportedAt', 'ungültiges Datum');
    const groups = unique(doc.groups, 'groups');
    const groupNames = new Set();
    for (const g of doc.groups) {
      object(g, 'Gruppe', ['id', 'name', 'defaultProfile', 'assumptions'], ['id', 'name', 'assumptions']); text(g.name, 'Gruppenname', true);
      if (g.defaultProfile !== undefined && g.defaultProfile !== null && !Object.values(PROFILES).includes(g.defaultProfile)) fail('defaultProfile', 'unbekanntes Standardprofil');
      if (groupNames.has(g.name)) fail('groups', 'doppelter Gruppenname'); groupNames.add(g.name);
      numericObject(g.assumptions, 'Annahmen', Object.values(ASSUMPTIONS));
    }
    const positions = unique(doc.positions, 'positions');
    const unitKeys = new Set();
    for (const p of doc.positions) {
      object(p, 'Position', ['id', 'name', 'category', 'groupId', 'archived', 'custom', 'ticker', 'unit', 'liquidity', 'valuation', 'instrument', 'lastQuote', 'depreciation'], ['id', 'name', 'category', 'groupId', 'archived', 'custom', 'ticker', 'unit']);
      if(own(p,'liquidity')&&!['liquid','illiquid'].includes(p.liquidity))fail('liquidity','ungültig');
      if(own(p,'valuation')&&!['manual','market'].includes(p.valuation))fail('valuation','ungültig');
      if(p.instrument!=null){
        object(p.instrument,'Kursquelle',['provider','symbol','exchange','currency','name']);
        if(!['yahoo','kraken','bitcoin'].includes(p.instrument.provider))fail('Kursquelle','unbekannter Anbieter');
        for(const k of ['symbol','exchange','currency','name'])text(p.instrument[k],'Kursquelle.'+k,k==='symbol');
      }
      if(p.valuation==='market'&&(!p.unit||!p.instrument))fail('Bewertung','Stückzahl-Einheit und Kursquelle erforderlich');
      if(own(p,'depreciation')){
        const d=p.depreciation;
        object(d,'Abschreibung',['method','amount','interval','startMonth','startValue']);
        if(!['percent','absolute'].includes(d.method))fail('Abschreibung.method','ungültig');
        if(!['month','quarter','year'].includes(d.interval))fail('Abschreibung.interval','ungültig');
        month(d.startMonth,'Abschreibung.startMonth');num(d.startValue,'Abschreibung.startValue',0);num(d.amount,'Abschreibung.amount',Number.MIN_VALUE);
        if(d.method==='percent'&&d.amount>100)fail('Abschreibung.amount','höchstens 100 %');
        if(p.category==='liab')fail('Abschreibung','nur für Vermögenswerte');
      }
      if(p.lastQuote!=null){
        object(p.lastQuote,'Letzter Kurs',['priceEUR','price','currency','asOf','fetchedAt']);
        num(p.lastQuote.priceEUR,'Kurs in EUR',Number.MIN_VALUE);num(p.lastQuote.price,'Kurs',Number.MIN_VALUE);text(p.lastQuote.currency,'Kurswährung',true);
        for(const k of ['asOf','fetchedAt'])if(typeof p.lastQuote[k]!=='string'||!Number.isFinite(Date.parse(p.lastQuote[k])))fail('Kurs.'+k,'ungültiger Zeitpunkt');
      }
      text(p.name, 'Positionsname', true); if (!CATEGORIES.includes(p.category)) fail('category', 'unbekannte Kategorie');
      ref(p.groupId, 'groupId', groups); bool(p.archived, 'archived'); bool(p.custom, 'custom');
      if (p.ticker !== null) text(p.ticker, 'ticker');
      if (p.unit !== null) {
        object(p.unit, 'Einheit', ['name', 'key']); text(p.unit.name, 'Einheit', true); id(p.unit.key, 'Einheiten-ID');
        if (unitKeys.has(p.unit.key)) fail('unit', 'doppelte Einheiten-ID'); unitKeys.add(p.unit.key);
      }
    }
    array(doc.snapshots, 'snapshots'); const months = new Set();
    for (const s of doc.snapshots) {
      object(s, 'Monatsstand', ['month', 'positions', 'estimated'], ['month', 'positions']);
      if (own(s, 'estimated')) bool(s.estimated, 'Monatsstand.estimated');
      if (typeof s.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s.month)) fail('month', 'YYYY-MM erwartet');
      if (months.has(s.month)) fail('month', 'doppelter Monat'); months.add(s.month);
      unique(s.positions, 'Monatspositionen', 'positionId');
      for (const v of s.positions) {
        object(v, 'Monatsposition', ['positionId', 'value', 'quantity'], ['positionId']); ref(v.positionId, 'positionId', positions);
        if (!own(v, 'value') && !own(v, 'quantity')) fail('Monatsposition', 'Wert oder Stückzahl fehlt');
        if (own(v, 'value')) num(v.value, 'Wert');
        if (own(v, 'quantity')) { num(v.quantity, 'Stückzahl', 0); if (!doc.positions.find(p => p.id === v.positionId).unit) fail('quantity', 'Position hat keine Einheit'); }
      }
    }
    const accounts = unique(doc.accounts, 'accounts'); const names = new Set();
    for (const a of doc.accounts) {
      object(a, 'Konto', ['id', 'name', 'iban']); text(a.name, 'Kontoname', true); text(a.iban, 'IBAN');
      if (names.has(a.name)) fail('accounts', 'doppelter Kontoname'); names.add(a.name);
    }
    if (doc.budget !== null) {
      object(doc.budget, 'Budget', ['items', 'standingOrders', 'oneTime'], ['items', 'standingOrders']); unique(doc.budget.items, 'Budgetposten');
      if (own(doc.budget, 'oneTime')) {
        unique(doc.budget.oneTime, 'Einmalige Zahlungen');
        for (const o of doc.budget.oneTime) {
          object(o, 'Einmalige Zahlung', ['id', 'name', 'category', 'kind', 'month', 'amount', 'targetGroupId']);
          text(o.name, 'Name der Zahlung', true);
          if (!BUDGET_CATEGORIES.includes(o.category)) fail('Einmalige Zahlung', 'unbekannte Kategorie');
          if (!['income', 'expense', 'saving'].includes(o.kind)) fail('Einmalige Zahlung', 'unbekannte Art');
          month(o.month, 'Einmalige Zahlung.month'); num(o.amount, 'Einmalige Zahlung.amount', 0);
          if (o.targetGroupId !== null) ref(o.targetGroupId, 'Einmalige Zahlung.Ziel', groups);
        }
      }
      for (const b of doc.budget.items) {
        object(b, 'Budgetposten', ['id', 'name', 'category', 'subcategory', 'kind', 'targetGroupId', 'monthlyAmounts', 'loanId', 'depotId', 'retirementIncome', 'personId', ...(doc.schemaVersion >= 17 ? ['workPercent'] : [])], ['id', 'name', 'category', 'subcategory', 'kind', 'targetGroupId', 'monthlyAmounts']);
        if (own(b, 'workPercent')) {
          num(b.workPercent, 'Arbeitszeit', 0);
          if (!(b.workPercent > 0 && b.workPercent <= 100)) fail('Budgetposten.Arbeitszeit', 'mehr als 0 und höchstens 100 % erwartet');
          if (!own(b, 'personId') || own(b, 'retirementIncome')) fail('Budgetposten.Arbeitszeit', 'nur für das Gehalt einer Person');
        }
        if (own(b, 'retirementIncome') && (b.retirementIncome !== true || b.kind !== 'income')) fail('Budgetposten.Ruhestand', 'nur für Einnahmen');
        if (own(b, 'personId')) {
          ref(b.personId, 'Budgetposten.Person', new Set(doc.retirement ? [doc.retirement.primary.id, ...doc.retirement.people.map(p => p.id)] : []));
          if (b.kind !== 'income') fail('Budgetposten.Person', 'nur für Einnahmen');
        }
        if (own(b, 'depotId')) {
          ref(b.depotId, 'Budgetposten.Altersvorsorgedepot', new Set((doc.retirement && doc.retirement.pensionDepots || []).map(d => d.id)));
          if (b.kind !== 'saving') fail('Budgetposten.Altersvorsorgedepot', 'nur für Sparposten');
        }
        if (own(b, 'loanId')) { ref(b.loanId, 'Budgetposten.Kredit', positions); if (doc.positions.find(p => p.id === b.loanId).category !== 'liab') fail('Budgetposten.Kredit', 'keine Verbindlichkeit'); }
        text(b.name, 'Budgetname', true); text(b.subcategory, 'Unterkategorie');
        if (!BUDGET_CATEGORIES.includes(b.category)) fail('Budgetkategorie', 'unbekannt');
        if (!['income', 'expense', 'saving', 'principal', 'loanPayment'].includes(b.kind)) fail('Budgetart', 'unbekannt');
        if (b.targetGroupId !== null) ref(b.targetGroupId, 'Budgetziel', groups);
        array(b.monthlyAmounts, 'Budgetmonate'); if (b.monthlyAmounts.length !== 12) fail('Budgetmonate', 'zwölf Werte erwartet');
        b.monthlyAmounts.forEach(n => num(n, 'Budgetbetrag'));
      }
      unique(doc.budget.standingOrders, 'Daueraufträge');
      const endpoint = (e, p) => {
        if (!e || !['account', 'label'].includes(e.type)) fail(p, 'ungültiges Ziel');
        if (e.type === 'account') { object(e, p, ['type', 'accountId']); ref(e.accountId, p, accounts); }
        else { object(e, p, ['type', 'name']); text(e.name, p, true); }
      };
      for (const o of doc.budget.standingOrders) { object(o, 'Dauerauftrag', ['id', 'from', 'to', 'amount']); endpoint(o.from, 'Von'); endpoint(o.to, 'Nach'); num(o.amount, 'Dauerauftragsbetrag', 0); }
    } else if (doc.accounts.length) fail('budget', 'Konten benötigen einen Budgetbereich');
    unique(doc.loans, 'Kredite', 'positionId');
    for (const l of doc.loans) {
      object(l, 'Kredit', ['positionId', ...Object.values(LOANS), 'linkedAssetId', 'firstPaymentMonth', 'extraPayments'], ['positionId']); ref(l.positionId, 'Kreditposition', positions);
      if (doc.positions.find(p => p.id === l.positionId).category !== 'liab') fail('Kredit', 'Position ist keine Verbindlichkeit');
      for (const k of Object.values(LOANS)) if(own(l,k))num(l[k], 'Kredit.' + k, 0);
      if(own(l,'linkedAssetId')&&l.linkedAssetId!==null){
        ref(l.linkedAssetId,'Verknüpfter Vermögenswert',positions);
        if(doc.positions.find(p=>p.id===l.linkedAssetId).category==='liab')fail('Kredit','Verknüpfung muss auf einen Vermögenswert zeigen');
      }
      if(own(l,'firstPaymentMonth'))month(l.firstPaymentMonth,'Erster Fälligkeitstermin');
      if(own(l,'extraPayments')){
        unique(l.extraPayments,'Sondertilgungen');
        for(const e of l.extraPayments){
          object(e,'Sondertilgung',['id','month','amount']);month(e.month,'Sondertilgungsmonat');num(e.amount,'Sondertilgungsbetrag',0);
          if(l.firstPaymentMonth&&e.month<l.firstPaymentMonth)fail('Sondertilgung','Termin liegt vor der ersten Fälligkeit');
        }
      }
    }
    object(doc.retirement, 'Altersvorsorge', ['primary', 'people', 'children', 'incomes', 'pensionDepots'], ['primary', 'people', 'incomes']);
    const person = (p, primary) => {
      // monthlyNetIncome gab es nur in Schema 13; migrate() ordnet es einem Budgetposten zu.
      // partTimeFromAge/partTimePercent gab es nur in Schema 14; migrate() verteilt sie auf die Lebensphasen.
      // Seit Version 16 wieder erlaubt: Teilzeit ab Alter (P36, bis zur bewussten Umstellung) und ein noch nicht
      // zugeordnetes Nettogehalt aus Schema 13 (P35).
      const v = doc.schemaVersion;
      object(p, 'Person', ['id', 'name', 'birthYear', ...(primary ? ['birthMonth', 'civilServicePension'] : ['workUntilAge',
        ...(v === 14 || v >= 16 ? ['partTimeFromAge', 'partTimePercent'] : []), ...(v >= 15 ? Object.values(PERSON_PHASES) : []),
        ...(v === 13 || v >= 16 ? ['monthlyNetIncome'] : []), ...(v >= 17 ? ['civilServicePension'] : [])]), 'statutoryPension'], ['id', 'name', 'statutoryPension']);
      if (own(p, 'partTimeFromAge') && Object.keys(PERSON_PHASES).some(k => k[0] === 'w' && own(p, PERSON_PHASES[k])))
        fail('Teilzeit', 'Teilzeit ab Alter und Arbeitszeit je Phase schließen sich aus');
      for (const k of Object.values(PERSON_PHASES)) if (own(p, k)) {
        num(p[k], k, 0);
        if (p[k] > (k.endsWith('WorkPercent') ? 100 : 200)) fail(k, k.endsWith('WorkPercent') ? 'höchstens 100 % erwartet' : 'höchstens 200 % erwartet');
      }
      if (own(p, 'partTimeFromAge') !== own(p, 'partTimePercent')) fail('Teilzeit', 'ab Alter und Arbeitszeit gehören zusammen');
      if (own(p, 'partTimeFromAge')) {
        num(p.partTimeFromAge, 'Teilzeit ab', 0); num(p.partTimePercent, 'Arbeitszeit', 0);
        if (!(p.partTimeFromAge > 0)) fail('Teilzeit ab', 'Alter erwartet');
        if (p.partTimePercent >= 100) fail('Arbeitszeit', 'unter 100 % erwartet');
        if (own(p, 'workUntilAge') && p.partTimeFromAge >= p.workUntilAge) fail('Teilzeit ab', 'muss vor dem Arbeitsende liegen');
      }
      text(p.name, 'Personenname');
      for (const k of ['birthYear', 'birthMonth', 'workUntilAge']) if (own(p, k)) num(p[k], k);
      if (own(p, 'birthMonth') && !(Number.isInteger(p.birthMonth) && p.birthMonth >= 1 && p.birthMonth <= 12)) fail('birthMonth', '1 bis 12 erwartet');
      if (own(p, 'monthlyNetIncome')) num(p.monthlyNetIncome, 'Nettogehalt', 0);
      numericObject(p.statutoryPension, 'Gesetzliche Rente', Object.values(DRV));
      if (own(p, 'civilServicePension')) numericObject(p.civilServicePension, 'Beamtenversorgung', Object.values(CIVIL));
      if (!primary && DRV_PRIMARY.some(k => own(p.statutoryPension, k))) fail('Gesetzliche Rente', 'Gemeinsame Rentenwerte gehören zur eigenen Person');
      if (own(p.statutoryPension, 'disabilityType') && ![1, 2].includes(p.statutoryPension.disabilityType)) fail('Erwerbsminderungsrente', 'teilweise (1) oder voll (2) erwartet');
    };
    unique([doc.retirement.primary, ...doc.retirement.people], 'Personen'); person(doc.retirement.primary, true); doc.retirement.people.forEach(p => person(p, false));
    if (own(doc.retirement, 'children')) {
      // Kinder (Version 14): IDs eindeutig über alle Personen; Kinderzulage bei einem Erwachsenen
      unique([doc.retirement.primary, ...doc.retirement.people, ...doc.retirement.children], 'Personen');
      const adults = new Set([doc.retirement.primary.id, ...doc.retirement.people.map(p => p.id)]);
      for (const c of doc.retirement.children) {
        object(c, 'Kind', ['id', 'name', 'birthYear', 'birthMonth', 'childBenefitUntilAge', 'allowanceParentId'], ['id', 'name', 'birthYear']);
        text(c.name, 'Name des Kindes');
        if (!(Number.isInteger(c.birthYear) && c.birthYear >= 1900 && c.birthYear <= 2200)) fail('Kind.birthYear', 'Geburtsjahr erwartet');
        if (own(c, 'birthMonth') && !(Number.isInteger(c.birthMonth) && c.birthMonth >= 1 && c.birthMonth <= 12)) fail('Kind.birthMonth', '1 bis 12 erwartet');
        if (own(c, 'childBenefitUntilAge') && c.childBenefitUntilAge !== 25) fail('Kind.childBenefitUntilAge', '25 erwartet (ohne Angabe 18)');
        if (own(c, 'allowanceParentId')) ref(c.allowanceParentId, 'Kind.allowanceParentId', adults);
      }
    }
    if (own(doc.retirement, 'pensionDepots')) {
      unique(doc.retirement.pensionDepots, 'Altersvorsorgedepots');
      const personIds = new Set([doc.retirement.primary.id, ...doc.retirement.people.map(p => p.id)]);
      for (const d of doc.retirement.pensionDepots) {
        // Kinder-Jahrgänge am Depot gab es bis Version 13; migrate() macht daraus Kinder (Personen)
        object(d, 'Altersvorsorgedepot', ['id', 'name', 'personId', ...(doc.schemaVersion < 14 ? ['childBirthYears'] : []), ...(doc.schemaVersion >= 16 ? ['unresolvedChildBirthYears'] : []), 'positionId', ...Object.values(AV_DEPOT)], ['id', 'name', 'personId', 'monthlyContribution']);
        if (own(d, 'unresolvedChildBirthYears')) {
          array(d.unresolvedChildBirthYears, 'Ungeklärte Kinder-Jahrgänge');
          if (!d.unresolvedChildBirthYears.length) fail('Ungeklärte Kinder-Jahrgänge', 'leer – Feld weglassen');
          d.unresolvedChildBirthYears.forEach(y => num(y, 'Ungeklärter Kinder-Jahrgang'));
        }
        if (own(d, 'positionId')) { const pos = doc.positions.find(p => p.id === d.positionId); if (!pos || pos.category === 'liab') fail('Altersvorsorgedepot.positionId', 'unbekannte Position ' + d.positionId); }
        text(d.name, 'Depotname');
        ref(d.personId, 'Altersvorsorgedepot.personId', personIds);
        for (const k of Object.values(AV_DEPOT)) if (own(d, k)) num(d[k], 'Altersvorsorgedepot.' + k, 0);
        if (own(d, 'lumpSumPercent') && d.lumpSumPercent > 30) fail('Altersvorsorgedepot', 'Teilauszahlung höchstens 30 %');
        if (own(d, 'childBirthYears')) { array(d.childBirthYears, 'Kinder'); d.childBirthYears.forEach(y => num(y, 'Geburtsjahr Kind', 1900)); }
      }
    }
    unique(doc.retirement.incomes, 'Weitere Renten');
    const otherPeople = new Set(doc.retirement.people.map(p => p.id));
    for (const p of doc.retirement.incomes) { object(p, 'Weitere Rente', ['id', 'name', 'monthlyAmount', 'fromAge', 'untilAge', 'personId'], ['id', 'name', 'monthlyAmount', 'fromAge']);
      if (own(p, 'personId')) ref(p.personId, 'Weitere Rente.Person', otherPeople); text(p.name, 'Rentenname'); num(p.monthlyAmount, 'Rentenbetrag'); num(p.fromAge, 'Rentenbeginn');
      if (own(p, 'untilAge')) { num(p.untilAge, 'Rentenende'); if (p.untilAge <= p.fromAge) fail('Rentenende', 'muss nach dem Beginn liegen'); } }
    object(doc.forecast, 'Prognose', ['settings', 'events']); numericObject(doc.forecast.settings, 'Prognose-Annahmen', Object.values(SETTINGS));
    unique(doc.forecast.events, 'Ereignisse');
    const eventRef = (e, source) => {
      if (!e || !['external', 'group', ...(source ? ['liquid'] : [])].includes(e.type)) fail('Ereignisziel', 'ungültig');
      object(e, 'Ereignisziel', e.type === 'group' ? ['type', 'groupId'] : ['type']);
      if (e.type === 'group') ref(e.groupId, 'Ereignisgruppe', groups);
    };
    for (const e of doc.forecast.events) { object(e, 'Ereignis', ['id', 'name', 'year', 'amount', 'from', 'to']); text(e.name, 'Ereignisname'); num(e.year, 'Ereignisjahr'); num(e.amount, 'Ereignisbetrag', 0); eventRef(e.from, true); eventRef(e.to, false); }
    object(doc.preferences, 'Einstellungen', ['theme', 'modules', 'expandedSections', 'onboardingCompleted', 'language'], ['theme', 'modules', 'expandedSections']);
    if (own(doc.preferences, 'language') && !['de', 'en'].includes(doc.preferences.language)) fail('language', 'de oder en erwartet');
    if (own(doc.preferences, 'onboardingCompleted')) bool(doc.preferences.onboardingCompleted, 'onboardingCompleted');
    if (![null, 'light', 'dark', 'system'].includes(doc.preferences.theme)) fail('theme', 'ungültig');
    object(doc.preferences.modules, 'Bereiche', MODULES); MODULES.forEach(k => bool(doc.preferences.modules[k], k));
    const expanded = doc.preferences.expandedSections;
    if (!expanded || typeof expanded !== 'object' || Array.isArray(expanded)) fail('expandedSections', 'Objekt erwartet');
    Object.entries(expanded).forEach(([k, v]) => { text(k, 'Bereich'); bool(v, 'Aufgeklappt'); });
    return doc;
  }
  // Ältere Schemas auf den aktuellen Stand bringen (Version bleibt; load/importBackup setzen sie danach). Jeder Schritt
  // ist wiederholbar und verändert nichts fachlich: Was sich nicht eindeutig übertragen lässt, bleibt als Originalwert
  // stehen und wird in der App geklärt (Review 14.10.2026, P35–P37). Teilzeit aus Schema 14 bleibt unverändert (P36).
  function migrate(doc) {
    if (doc.schemaVersion < 14 && doc.retirement) moveDepotChildren(doc);
    if (doc.schemaVersion === 13 && doc.retirement) moveNetIncome(doc);
    return doc;
  }
  // Version 13 → 16 (P35): Das Nettogehalt einer weiteren Person (monthlyNetIncome) zählte in Schema 13 nur in der
  // Prognose; Budgetposten liefen unabhängig davon. Zugeordnet wird nur, was eindeutig dasselbe Gehalt ist: genau ein noch
  // freier Einnahmeposten, dessen Name den Namen der Person enthält und dessen Monatsbetrag gleich ist. Sonst bleibt der
  // Betrag stehen (er zählt weiter als ihr Gehalt) und die App fragt nach. Es entsteht nie ein zusätzlicher Posten.
  function moveNetIncome(doc) {
    for (const p of doc.retirement.people) {
      if (!own(p, 'monthlyNetIncome')) continue;
      const net = p.monthlyNetIncome;
      if (!(net > 0)) { delete p.monthlyNetIncome; continue; }
      const name = String(p.name || '').replace(/\(.*?\)/g, '').trim().toLowerCase();
      const items = doc.budget ? doc.budget.items : [];
      const avg = i => (i.monthlyAmounts || []).reduce((a, v) => a + (+v || 0), 0) / 12;
      const free = items.filter(i => i.kind === 'income' && !i.retirementIncome && !own(i, 'personId'));
      const hits = name ? free.filter(i => i.name.toLowerCase().includes(name) && Math.abs(avg(i) - net) < 0.5) : [];
      if (hits.length === 1) { hits[0].personId = p.id; delete p.monthlyNetIncome; }
    }
    return doc;
  }
  // Version 14: Kinder-Jahrgänge an Altersvorsorgedepots werden Kinder (Personen). Wie bisher zählt jedes Kind bei der
  // zuerst genannten Person (ich, dann weitere Personen) und ein Jahrgang so oft, wie er in einem Depot dieser Person steht;
  // die Kinderzulage rechnet damit gleich. Kindergeld bis zum Jahr des 18. Geburtstags (ohne Angabe).
  function moveDepotChildren(doc) {
    const r = doc.retirement, depots = r.pensionDepots || [];
    if (!depots.some(d => own(d, 'childBirthYears'))) return doc;
    // P37: Früher war jede Zahl ab 1900 erlaubt (z. B. 2019.5). Nur ganze Jahre 1900–2200 werden Kinder; die übrigen
    // Werte bleiben unverändert am Depot (unresolvedChildBirthYears) und werden in der App geklärt, nie gerundet.
    const valid = y => Number.isInteger(y) && y >= 1900 && y <= 2200;
    for (const d of depots) if (own(d, 'childBirthYears')) {
      const open = d.childBirthYears.filter(y => !valid(y));
      if (open.length) d.unresolvedChildBirthYears = [...(d.unresolvedChildBirthYears || []), ...open];
      d.childBirthYears = d.childBirthYears.filter(valid);
    }
    const order = [r.primary.id, ...r.people.map(p => p.id)], claimed = {}, children = (r.children || []).slice();
    const used = new Set([...order, ...children.map(c => c.id)]);
    for (const pid of order) {
      const cnt = {};
      depots.filter(d => d.personId === pid && own(d, 'childBirthYears')).forEach(d => {
        const c = {}; d.childBirthYears.forEach(y => { c[y] = (c[y] || 0) + 1; });
        Object.entries(c).forEach(([y, n]) => { cnt[y] = Math.max(cnt[y] || 0, n); });
      });
      Object.keys(cnt).sort().forEach(y => {
        for (let k = claimed[y] || 0; k < cnt[y]; k++) {
          let n = children.length + 1, id; do id = 'child-' + n++; while (used.has(id)); used.add(id);
          const c = { id, name: 'Kind (' + y + ')' + (k ? ' ' + (k + 1) : ''), birthYear: +y };
          if (pid !== r.primary.id) c.allowanceParentId = pid;
          children.push(c);
        }
        claimed[y] = Math.max(claimed[y] || 0, cnt[y]);
      });
    }
    depots.forEach(d => delete d.childBirthYears);
    if (children.length) r.children = children;
    return doc;
  }
  /* Schreibrecht zwischen Fenstern (P34, überarbeitet nach P55/P63, Reviews vom 14.10.2026).
     Zwischen Fenstern sind Lesen und Schreiben von localStorage keine gemeinsame Operation. Deshalb schreibt immer nur EIN
     Fenster: das, das die exklusive Web Lock „vermoegen-writer“ hält (Chrome, Safari, Firefox, auch als PWA und – geprüft –
     Chrome mit file://). Zustände (Übergänge: .docs/DATA_MODEL.md, „Schreibrecht zwischen Fenstern“):
       pending      Start oder Rückkehr: die Antwort auf die Sperranfrage steht aus – höchstens timing.start, dann reader
       writer       hält die Sperre und hat den neuesten Stand geladen; nur hier wird gespeichert
       reader       ein anderes Fenster schreibt; dieses wartet im Hintergrund auf die Sperre
       failed       Sperre erhalten, die Übernahme scheiterte aber (z. B. Speicher voll): Sperre wieder frei, nichts
                    verändert, nicht eingereiht; request() versucht es erneut
       suspended    Seite verlassen (pagehide, freeze, auch bfcache): Sperre wirklich freigegeben, nicht eingereiht;
                    resume() erwirbt sie neu und lädt dabei den aktuellen Stand
       unsupported  keine nutzbaren Web Locks (fehlen oder abgelehnt): geschützter Lesemodus; schreiben erst nach
                    ausdrücklicher Entscheidung (allowSingle) – nie automatisch
       single       ohne Sperren vorgesehen (Tests, Werkzeuge) oder nach allowSingle: nur die Konflikterkennung P1/P54
     „Hier bearbeiten“ bittet das schreibende Fenster über vermoegen-writer-request um Abgabe; es gibt ab, wenn dort gerade
     nichts bearbeitet wird, und schreibt vorher die Abgabe-Marke vermoegen-writer. Weil Daten und Marke denselben Weg
     nehmen, sieht das übernehmende Fenster mit der Marke auch die letzten Daten. Jedes Verlassen beginnt eine neue Epoche:
     Rückrufe einer früheren Epoche geben eine verspätet erteilte Sperre sofort zurück und ändern den Zustand nicht. Kein
     Pfad endet mit einer unbehandelten Ablehnung; ready() und request() enden immer innerhalb ihrer Frist. */
  const WRITER_LOCK = 'vermoegen-writer', WRITER_KEY = 'vermoegen-writer', REQUEST_KEY = 'vermoegen-writer-request';
  function createWriterGate(storage, options = {}) {
    const locks = options.locks || null;
    const t = Object.assign({ poll: 25, handover: 600, request: 2500, start: 2500 }, options.timing || {});
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    let state = locks ? 'pending' : options.requireLocks ? 'unsupported' : 'single';
    let hold = null, queued = null, epoch = 0, failure = null, wakers = [], readyPromise = null;
    const listeners = [];
    const emit = () => listeners.forEach(f => { try { f(state); } catch (e) { /* Anzeige darf das Speichern nicht stören */ } });
    const wake = () => { const w = wakers; wakers = []; w.forEach(f => f()); };
    const set = next => { if (state === next) return; state = next; emit(); wake(); };
    const read = k => { try { return JSON.parse(storage.getItem(k)); } catch (e) { return null; } };
    // Die Marke ist nur ein Hinweis für die Übergabe, die Sperre selbst schützt: ein Schreibfehler bleibt ohne Folgen.
    const mark = (st, extra) => {
      try { storage.setItem(WRITER_KEY, JSON.stringify(Object.assign({ id, state: st, at: Date.now() }, extra || {}))); }
      catch (e) { /* ohne Marke wartet ein übernehmendes Fenster höchstens timing.handover */ }
    };
    // Warten, bis ok() gilt oder die Frist abläuft; Speicher-Ereignisse und Zustandswechsel wecken sofort auf.
    const until = (ok, ms) => new Promise(done => {
      const end = Date.now() + Math.max(0, ms);
      let over = false, timer = null, listed = false;
      const step = () => {
        if (over) return;
        if (ok() || Date.now() >= end) { over = true; clearTimeout(timer); done(ok()); return; }
        if (!listed) { listed = true; wakers.push(() => { listed = false; step(); }); }
        clearTimeout(timer); timer = setTimeout(step, Math.max(0, Math.min(t.poll, end - Date.now())));
      };
      step();
    });
    // Synchrone Ausnahmen der Lock-API wie Ablehnungen behandeln
    const call = f => { try { return Promise.resolve(f()); } catch (e) { return Promise.reject(e); } };
    // Sperre erhalten (Rückruf des Browsers). Das Ergebnis hält die Sperre, bis free() es auflöst; es lehnt nie ab.
    const take = my => new Promise(resolve => {
      let done = false;
      const free = () => { if (done) return; done = true; if (hold === free) hold = null; resolve(); };
      if (my !== epoch || state === 'suspended') { free(); return; }
      hold = free;
      const promote = () => {
        if (my !== epoch || hold !== free) { free(); return; }
        // Übernahme: neuesten Stand laden, beim ersten Start alte Schlüssel übernehmen. Scheitert das, bleibt alles, wie es ist.
        try { if (options.onPromote) options.onPromote(); }
        catch (e) { failure = e; free(); set('failed'); return; }
        failure = null; mark('active'); set('writer');
      };
      // Übergabe: zuerst die Abgabe-Marke des vorherigen Fensters abwarten, damit dessen letzte Daten sichtbar sind
      const prev = read(WRITER_KEY);
      if (prev && prev.id !== id && prev.state === 'active') {
        until(() => { const m = read(WRITER_KEY); return !m || m.id !== prev.id || m.state !== 'active'; }, t.handover).then(promote);
      } else promote();
    });
    // Im Hintergrund auf die Sperre warten. Abgelehnte oder abgebrochene Anfragen enden ohne Ausnahme; request() stellt neu an.
    const queue = () => {
      if (queued || !locks || state === 'suspended') return;
      const my = epoch, ctl = typeof AbortController === 'function' ? new AbortController() : null, q = { ctl };
      queued = q;
      call(() => locks.request(WRITER_LOCK, ctl ? { signal: ctl.signal } : {}, () => { if (queued === q) queued = null; return take(my); }))
        .catch(e => { if (queued === q) queued = null; if (my !== epoch) return; failure = e; emit(); wake(); });
    };
    // Erste Anfrage beim Start und nach der Rückkehr: sofort schreiben, wenn frei, sonst lesen und anstellen.
    const acquire = () => {
      const my = ++epoch;
      set('pending');
      call(() => locks.request(WRITER_LOCK, { ifAvailable: true }, lock => {
        if (my !== epoch) return null;
        if (!lock) { if (state === 'pending') set('reader'); queue(); return null; }
        return take(my);
      })).catch(e => {
        if (my !== epoch) return;
        // Der Browser verweigert Web Locks (z. B. Sicherheitsregel): geschützter Lesemodus statt ungesichertem Schreiben
        failure = e;
        if (state === 'pending' || state === 'reader') set('unsupported');
      });
      return until(() => state !== 'pending', t.start).then(() => {
        // keine Antwort: zum Ansehen weiter; wird die Sperre später doch erteilt, übernimmt das Fenster dann
        if (my === epoch && state === 'pending') set('reader');
        return state;
      });
    };
    const gate = {
      id,
      state: () => state,
      canWrite: () => state === 'single' || state === 'writer',
      failure: () => failure,
      onChange(f) { listeners.push(f); },
      start() {
        if (!readyPromise) readyPromise = locks && state === 'pending' ? acquire() : Promise.resolve(state);
        return readyPromise;
      },
      // Ein anderes Fenster hat Marke oder Bitte geschrieben (storage-Ereignis)
      onStorage(key) {
        if (key === REQUEST_KEY && state === 'writer') {
          const req = read(REQUEST_KEY);
          if (req && req.id !== id) {
            let busy = true;
            try { busy = !!(options.isBusy && options.isBusy()); } catch (e) { /* im Zweifel nicht abgeben */ }
            if (busy) mark('active', { busyFor: req.id, req: req.at });
            else gate.release();
          }
        }
        wake();
      },
      // Abgeben auf Bitte: Marke zuerst, dann die Sperre; danach wieder im Hintergrund anstellen
      release() {
        if (state !== 'writer' || !hold) return;
        mark('released');
        const free = hold;
        set('reader'); free(); queue();
      },
      // Seite verlassen (pagehide, freeze): Schreibrecht und Sperre wirklich abgeben, nicht wieder anstellen
      suspend() {
        if (!locks || state === 'suspended' || state === 'unsupported' || state === 'single') return;
        epoch++;
        if (state === 'writer') mark('released');
        const q = queued; queued = null;
        if (q && q.ctl) { try { q.ctl.abort(); } catch (e) { /* älterer Browser: der späte Rückruf gibt die Sperre zurück */ } }
        const free = hold;
        set('suspended');
        if (free) free();
      },
      // Rückkehr (pageshow aus dem bfcache, resume): neu erwerben; bei Erhalt wird der aktuelle Stand geladen
      resume() {
        if (state !== 'suspended') return Promise.resolve(state);
        return acquire();
      },
      // Lesemodus ohne Web Locks: dieses Fenster schreibt erst nach ausdrücklicher Entscheidung allein
      allowSingle() {
        if (state !== 'unsupported') return state;
        try { if (options.onPromote) options.onPromote(); } catch (e) { failure = e; emit(); return state; }
        failure = null; set('single');
        return state;
      },
      // „Hier bearbeiten“: Antwort 'writer', 'busy' (dort wird bearbeitet), 'timeout' (keine Antwort), 'failed' (Übernahme
      // gescheitert), 'denied' (Sperranfrage abgelehnt), 'unsupported' oder 'suspended' – immer innerhalb von
      // timing.request, auch wenn die erste Sperranfrage noch unbeantwortet ist
      async request() {
        const end = Date.now() + t.request;
        if (gate.canWrite()) return 'writer';
        if (state === 'unsupported' || state === 'suspended') return state;
        if (state === 'pending') await until(() => state !== 'pending', end - Date.now());
        if (gate.canWrite()) return 'writer';
        if (state === 'pending') return 'timeout';
        if (state === 'unsupported') return state;
        if (state === 'failed') set('reader');
        failure = null;
        queue();
        const at = Date.now() + Math.random();
        try { storage.setItem(REQUEST_KEY, JSON.stringify({ id, at })); } catch (e) { /* ohne Bitte bleibt das Warten auf eine freie Sperre */ }
        let busy = false;
        const denied = () => !queued && !!failure && state === 'reader';
        await until(() => {
          if (gate.canWrite() || state === 'failed' || state === 'suspended' || denied()) return true;
          const m = read(WRITER_KEY); busy = !!(m && m.busyFor === id && m.req === at); return busy;
        }, end - Date.now());
        return gate.canWrite() ? 'writer' : state === 'failed' || state === 'suspended' ? state : denied() ? 'denied' : busy ? 'busy' : 'timeout';
      }
    };
    return gate;
  }
  function createStore(storage, options = {}) {
    let current, draft = null, draftRev = 0, cachedLegacy = null;
    // lastRaw: the stored text this window last read or wrote. Another window of the same origin shares the
    // storage; if the stored text differs before a write, that window saved in between (P1).
    let lastRaw = null;
    /* P54: rev zählt die Stände, die dieses Fenster von außen übernommen hat (anderes Fenster, Übernahme des
       Schreibrechts, Rückkehr, Konflikt). Eine Bearbeitung beruht auf der Revision, mit der ihre Eingaben angezeigt
       wurden (withBase). Ist der Stand inzwischen ein anderer, wird nichts gespeichert (Fehlercode STALE) – auch nicht
       nach einer Übernahme des Schreibrechts, die den Stand still neu lädt. Ohne eigene Basis gilt mit trackView die
       Revision, die die Seite zuletzt angezeigt hat (markShown); ohne trackView (Tests, Werkzeuge) keine. */
    let rev = 0, shown = 0, base = null;
    // P37: Rohtext eines älteren Schemas, der vor dem ersten Speichern des migrierten Stands gesichert wird
    let before = null;
    const load = raw => {
      const parsed = JSON.parse(raw);
      before = parsed && parsed.schemaVersion < VERSION ? raw : null;
      const doc = migrate(validate(parsed));
      // Version 2 adds asset metadata and categories, version 3 optional depreciation.
      // Older versions keep their semantics through the adapter defaults.
      doc.schemaVersion=VERSION;
      delete doc.exportedAt;
      // Profile identity is independent of a group's editable display name.
      for (const g of doc.groups) if (g.defaultProfile === undefined) g.defaultProfile = profileFor(g.name);
      return validate(doc);
    };
    // Take over another window's state. A running transaction keeps its draft; its commit is rejected (STALE).
    const adopt = raw => {
      const doc = load(raw); current = doc; lastRaw = raw; cachedLegacy = null; rev++;
      if (options.onExternal) { try { options.onExternal(rev); } catch (e) { /* Anzeige darf das Laden nicht stören */ } }
    };
    let legacyKeys = null;
    const gate = createWriterGate(storage, {
      locks: options.locks, requireLocks: options.requireLocks, isBusy: options.isBusy, timing: options.timing,
      // Schreibrecht erhalten: den neuesten Stand übernehmen (eine Übergabe kann gerade gespeichert haben). Offene
      // Bearbeitungen behalten ihre Basis (P54). Jeder Fehler wirft und führt zu „failed“ mit freier Sperre (P55, P65).
      onPromote() {
        const raw = storage.getItem(KEY);
        if (raw !== null) {
          // P65: Ein unlesbarer fremder Stand (z. B. einer neueren App-Version) bleibt unangetastet; kein Schreibrecht.
          if (raw !== lastRaw) {
            try { adopt(raw); } catch (e) {
              const error = new Error('Die gespeicherten Daten konnten nicht gelesen werden und bleiben unverändert (' + e.message + ').');
              error.code = 'UNREADABLE';
              throw error;
            }
          }
          // P65: Ein inzwischen vorhandenes Hauptdokument ersetzt die beim Start vorgemerkte Erstübernahme. Es wird nur
          // übernommen; ein älteres Schema wird erst beim nächsten regulären Speichern geschrieben, nach der
          // Originalsicherung (P37). Die alten Schlüssel bleiben unberührt.
          legacyKeys = null;
        } else if (legacyKeys) writeLegacy();
      }
    });
    const persisted = storage.getItem(KEY);
    // First start with the old keys: persist first, so quota/parse failures leave every legacy key untouched.
    const writeLegacy = () => {
      const raw = JSON.stringify(current);
      storage.setItem(KEY, raw);
      lastRaw = raw;
      for (const k of legacyKeys) storage.removeItem(k);
      legacyKeys = null;
    };
    if (persisted !== null) {
      current = load(persisted);
      lastRaw = persisted;
    } else {
      const values = record();
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (LEGACY_KEYS.includes(k) || k.startsWith('ui-open-')) values[k] = storage.getItem(k);
      }
      current = fromLegacy(values);
      legacyKeys = Object.keys(values);
      // Mit Web Locks schreibt erst das Fenster, das die Sperre erhält (onPromote)
      if (gate.canWrite()) writeLegacy();
    }
    const readOnly = () => {
      // der Grund richtet sich nach dem Zustand des Schreibrechts (P55)
      const st = gate.state(), f = gate.failure();
      const error = new Error(st === 'unsupported' ? 'Nur ansehen: Dieser Browser kann nicht sicherstellen, dass nur ein Fenster speichert. Diese Änderung wurde nicht gespeichert.'
        : st === 'failed' && f && f.code === 'UNREADABLE' ? 'Nur ansehen: Die gespeicherten Daten konnten nicht gelesen werden und bleiben unverändert. Diese Änderung wurde nicht gespeichert.'
        : st === 'failed' ? 'Nur ansehen: Die Daten konnten in diesem Fenster nicht übernommen werden (z. B. Speicher voll). Diese Änderung wurde nicht gespeichert.'
        : st === 'suspended' ? 'Nur ansehen: Diese Seite ist gerade nicht aktiv. Diese Änderung wurde nicht gespeichert.'
        : 'Nur ansehen: Die Daten sind in einem anderen Fenster zum Bearbeiten geöffnet. Diese Änderung wurde nicht gespeichert.');
      error.code = 'READ_ONLY';
      if (options.onReadOnly) options.onReadOnly(error);
      return error;
    };
    const stale = () => {
      const error = new Error('Nicht gespeichert: Die Daten wurden inzwischen in einem anderen Fenster geändert. Deine Eingaben sind noch da.');
      error.code = 'STALE';
      return error;
    };
    const commit = doc => {
      validate(doc);
      const raw = JSON.stringify(doc);
      // Nothing changed (e.g. removing an absent legacy key): no write, so no conflict with another window either.
      if (raw === lastRaw) { current = doc; cachedLegacy = null; return; }
      // P34: nur das Fenster mit Schreibrecht speichert
      if (!gate.canWrite()) throw readOnly();
      // P54: Eingaben, die auf einem älteren Stand beruhen, überschreiben den neueren nie
      const need = base !== null ? base : options.trackView ? shown : null;
      if (need !== null && need !== rev) throw stale();
      const stored = storage.getItem(KEY);
      if (stored !== null && stored !== lastRaw) {
        // Never overwrite another window's save: adopt it (an unreadable one, e.g. from a newer app version,
        // throws and stays untouched) and reject this change.
        adopt(stored);
        const error = new Error('Die Daten wurden in einem anderen Fenster geändert. Der neue Stand ist geladen, deine letzte Änderung wurde nicht gespeichert.');
        error.code = 'CONFLICT';
        if (options.onConflict) options.onConflict(error);
        throw error;
      }
      // P37: vor dem ersten Speichern eines migrierten Stands das unveränderte Original sichern
      if (before !== null && stored === before) storage.setItem(BACKUP_KEY, before);
      storage.setItem(KEY, raw);
      before = null;
      lastRaw = raw;
      current = doc;
      cachedLegacy = null;
    };
    const legacy = () => draft || (cachedLegacy || (cachedLegacy = toLegacy(current)));
    const change = (key, value, remove) => {
      if (!LEGACY_KEYS.includes(key) && !key.startsWith('ui-open-')) throw new Error('Unbekannter Datenschlüssel: ' + key);
      const values = copy(legacy());
      if (remove) delete values[key]; else values[key] = String(value);
      if (draft) draft = values;
      else commit(fromLegacy(values, current));
    };
    return {
      // P34: Schreibrecht zwischen Fenstern
      ready() { return gate.start(); },
      canWrite() { return gate.canWrite(); },
      writerState() { return gate.state(); },
      writerFailure() { return gate.failure(); },
      onWriterChange(f) { gate.onChange(f); },
      requestWrite() { return gate.request(); },
      releaseWrite() { gate.release(); },
      allowSingle() { return gate.allowSingle(); },
      // P63: Seite verlassen und zurückkehren (pagehide/pageshow, freeze/resume)
      suspend() { gate.suspend(); },
      resume() { return gate.resume(); },
      leave() { gate.suspend(); },
      onStorage(key) { gate.onStorage(key); },
      // P54: Revisionen (siehe oben)
      revision() { return rev; },
      shownRevision() { return shown; },
      markShown() { shown = rev; return rev; },
      withBase(value, fn) {
        if (!Number.isInteger(value)) throw new Error('Ungültige Basis');
        const prev = base; base = value;
        try { return fn(); } finally { base = prev; }
      },
      // P37: Stand vor dem letzten Update (Rohtext und Version), solange er gesichert ist
      backupBeforeUpdate() {
        const raw = storage.getItem(BACKUP_KEY);
        if (raw === null) return before !== null ? { raw: before, version: JSON.parse(before).schemaVersion, pending: true } : null;
        let version = null; try { version = JSON.parse(raw).schemaVersion; } catch (e) { /* Rohtext bleibt trotzdem exportierbar */ }
        return { raw, version, pending: false };
      },
      getItem(key) { const values = legacy(); return own(values, key) ? values[key] : null; },
      setItem(key, value) { change(key, value, false); },
      removeItem(key) { change(key, null, true); },
      clear() { if (draft) draft = record(); else commit(empty()); },
      beginTransaction() { if (draft) throw new Error('Import läuft bereits'); draft = copy(legacy()); draftRev = rev; },
      commitTransaction() {
        if (!draft) throw new Error('Kein Import aktiv');
        // auch ein abgelehnter Abschluss (Konflikt, nur ansehen, veraltet, ungültig) beendet die Transaktion
        try {
          if (draftRev !== rev) throw stale();
          commit(fromLegacy(draft, current));
        } finally { draft = null; }
      },
      // Another window saved (storage event): take over its state without writing. Returns whether it changed.
      reload() {
        const raw = storage.getItem(KEY);
        if (raw === null || raw === lastRaw) return false;
        adopt(raw);
        return true;
      },
      rollbackTransaction() { draft = null; },
      document() { return copy(current); },
      exportBackup(date = new Date()) { return { ...copy(current), exportedAt: date.toISOString() }; },
      importBackup(value) {
        const doc = migrate(copy(validate(value))); doc.schemaVersion=VERSION; delete doc.exportedAt; validate(doc);
        for (const g of doc.groups) if (g.defaultProfile === undefined) g.defaultProfile = profileFor(g.name);
        commit(doc);
      },
      primaryId() { return current.retirement.primary.id; },
      groupName(id) { const g = current.groups.find(g => g.id === id); return g ? g.name : null; },
      defaultGroupName(name) {
        const g = current.groups.find(g => g.name === name);
        return g ? Object.keys(PROFILES).find(k => PROFILES[k] === g.defaultProfile) || null : name;
      },
      renameGroup(id, name) { const doc = copy(current); const g = doc.groups.find(g => g.id === id); if (!g) throw new Error('Unbekannte Gruppe'); g.name = name; commit(doc); },
      renamePosition(id, name) { const doc = copy(current); const p = doc.positions.find(p => p.id === id); if (!p) throw new Error('Unbekannte Position'); p.name = name; commit(doc); }
    };
  }
  const api = { KEY, BACKUP_KEY, FORMAT, VERSION, empty, validate, migrate, fromLegacy, toLegacy, createStore, createWriterGate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AssetsData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

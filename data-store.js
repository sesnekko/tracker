/* Versioned, local data model. UI/calculation adapters keep the existing app's
 * numerical behaviour while persistence and backups use one explicit document. */
(function (root) {
  'use strict';
  const KEY = 'vermoegen-data-v1';
  const FORMAT = 'vermoegen-backup';
  const VERSION = 6;
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
    'lt-monthly-withdraw': 'monthlySpending', 'lt-safety': 'safetyPercent'
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
    bbg: 'contributionCeiling'
  };
  const LEGACY_KEYS = ['fieldConfig', 'finData', 'budgetData', 'loanParams',
    'lt-drv', 'lt-drv-extra', 'lt-pensions', 'lt-events', 'lt-asset-params',
    'lt-birth-year', 'lt-birth-month', 'v2-modules', 'darkMode', 'customFields',
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
      if (n !== undefined) primary[field] = n;
    }
    primary.statutoryPension = mapped(parse(values, 'lt-drv', {}), DRV);
    const personId = idsFor('person-', previous.retirement.people);
    doc.retirement.people = parse(values, 'lt-drv-extra', []).map((r, i) => {
      const p = { id: personId(r, i), name: r.name || '', statutoryPension: mapped(r, DRV) };
      const by = number(r.by), until = number(r.until);
      if (by !== undefined) p.birthYear = by;
      if (until !== undefined) p.workUntilAge = until;
      return p;
    });
    const incomeId = idsFor('income-', previous.retirement.incomes);
    doc.retirement.incomes = parse(values, 'lt-pensions', []).map((r, i) => ({ id: incomeId(r, i), name: r.name || '', monthlyAmount: number(r.amount) ?? 0, fromAge: number(r.from) ?? 0 }));
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
    doc.preferences.theme = values.darkMode === '0' ? 'light' : values.darkMode === '1' ? 'dark' : null;
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
      for (const r of doc.budget.items) bd[r.category].push({ id: r.id, name: r.name, subcat: r.subcategory, kind: r.kind, targetGroupId: r.targetGroupId, targetGroup: r.targetGroupId ? groupName(r.targetGroupId) : null, ...(r.loanId ? { loanId: r.loanId } : {}), values: copy(r.monthlyAmounts) });
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
    put('lt-drv-extra', doc.retirement.people.map(p => ({ id: p.id, name: p.name, by: p.birthYear ?? '', until: p.workUntilAge ?? '', ...unmapped(p.statutoryPension, DRV) })));
    put('lt-pensions', doc.retirement.incomes.map(p => ({ id: p.id, name: p.name, amount: p.monthlyAmount, from: p.fromAge })));
    for (const [key, field] of Object.entries(SETTINGS)) if (own(doc.forecast.settings, field)) values[key] = String(doc.forecast.settings[field]);
    const endpoint = ref => ref.type === 'external' ? '' : ref.type === 'liquid' ? '*' : groupName(ref.groupId);
    put('lt-events', doc.forecast.events.map(e => ({ id: e.id, name: e.name, year: e.year, amount: e.amount, from: endpoint(e.from), to: endpoint(e.to) })));
    const ap = record();
    for (const g of doc.groups) if (Object.keys(g.assumptions).length) ap[g.name] = unmapped(g.assumptions, ASSUMPTIONS);
    put('lt-asset-params', ap);
    put('v2-modules', doc.preferences.modules);
    if (doc.preferences.theme !== null) values.darkMode = doc.preferences.theme === 'dark' ? '1' : '0';
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
    if (doc.format !== FORMAT) fail('format', 'keine Vermögen-Sicherung');
    if (![1,2,3,4,5,VERSION].includes(doc.schemaVersion)) fail('schemaVersion', 'nicht unterstützte Version ' + doc.schemaVersion);
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
        object(b, 'Budgetposten', ['id', 'name', 'category', 'subcategory', 'kind', 'targetGroupId', 'monthlyAmounts', 'loanId'], ['id', 'name', 'category', 'subcategory', 'kind', 'targetGroupId', 'monthlyAmounts']);
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
    object(doc.retirement, 'Altersvorsorge', ['primary', 'people', 'incomes']);
    const person = (p, primary) => {
      object(p, 'Person', ['id', 'name', 'birthYear', ...(primary ? ['birthMonth'] : ['workUntilAge']), 'statutoryPension'], ['id', 'name', 'statutoryPension']);
      text(p.name, 'Personenname');
      for (const k of ['birthYear', 'birthMonth', 'workUntilAge']) if (own(p, k)) num(p[k], k);
      numericObject(p.statutoryPension, 'Gesetzliche Rente', Object.values(DRV));
      if (!primary && ['pensionPointValue', 'averageSalary', 'contributionCeiling'].some(k => own(p.statutoryPension, k))) fail('Gesetzliche Rente', 'Gemeinsame Rentenwerte gehören zur eigenen Person');
    };
    unique([doc.retirement.primary, ...doc.retirement.people], 'Personen'); person(doc.retirement.primary, true); doc.retirement.people.forEach(p => person(p, false));
    unique(doc.retirement.incomes, 'Weitere Renten');
    for (const p of doc.retirement.incomes) { object(p, 'Weitere Rente', ['id', 'name', 'monthlyAmount', 'fromAge']); text(p.name, 'Rentenname'); num(p.monthlyAmount, 'Rentenbetrag'); num(p.fromAge, 'Rentenbeginn'); }
    object(doc.forecast, 'Prognose', ['settings', 'events']); numericObject(doc.forecast.settings, 'Prognose-Annahmen', Object.values(SETTINGS));
    unique(doc.forecast.events, 'Ereignisse');
    const eventRef = (e, source) => {
      if (!e || !['external', 'group', ...(source ? ['liquid'] : [])].includes(e.type)) fail('Ereignisziel', 'ungültig');
      object(e, 'Ereignisziel', e.type === 'group' ? ['type', 'groupId'] : ['type']);
      if (e.type === 'group') ref(e.groupId, 'Ereignisgruppe', groups);
    };
    for (const e of doc.forecast.events) { object(e, 'Ereignis', ['id', 'name', 'year', 'amount', 'from', 'to']); text(e.name, 'Ereignisname'); num(e.year, 'Ereignisjahr'); num(e.amount, 'Ereignisbetrag', 0); eventRef(e.from, true); eventRef(e.to, false); }
    object(doc.preferences, 'Einstellungen', ['theme', 'modules', 'expandedSections', 'onboardingCompleted'], ['theme', 'modules', 'expandedSections']);
    if (own(doc.preferences, 'onboardingCompleted')) bool(doc.preferences.onboardingCompleted, 'onboardingCompleted');
    if (![null, 'light', 'dark'].includes(doc.preferences.theme)) fail('theme', 'ungültig');
    object(doc.preferences.modules, 'Bereiche', MODULES); MODULES.forEach(k => bool(doc.preferences.modules[k], k));
    const expanded = doc.preferences.expandedSections;
    if (!expanded || typeof expanded !== 'object' || Array.isArray(expanded)) fail('expandedSections', 'Objekt erwartet');
    Object.entries(expanded).forEach(([k, v]) => { text(k, 'Bereich'); bool(v, 'Aufgeklappt'); });
    return doc;
  }
  function createStore(storage) {
    let current, draft = null, cachedLegacy = null;
    const persisted = storage.getItem(KEY);
    if (persisted !== null) {
      current = validate(JSON.parse(persisted));
      // Version 2 adds asset metadata and categories, version 3 optional depreciation.
      // Older versions keep their semantics through the adapter defaults.
      current.schemaVersion=VERSION;
      delete current.exportedAt;
      // Profile identity is independent of a group's editable display name.
      for (const g of current.groups) if (g.defaultProfile === undefined) g.defaultProfile = profileFor(g.name);
    } else {
      const values = record();
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (LEGACY_KEYS.includes(k) || k.startsWith('ui-open-')) values[k] = storage.getItem(k);
      }
      current = fromLegacy(values);
      // Persist first: quota/parse failures leave every legacy key untouched.
      storage.setItem(KEY, JSON.stringify(current));
      for (const k of Object.keys(values)) storage.removeItem(k);
    }
    const commit = doc => {
      validate(doc);
      storage.setItem(KEY, JSON.stringify(doc));
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
      getItem(key) { const values = legacy(); return own(values, key) ? values[key] : null; },
      setItem(key, value) { change(key, value, false); },
      removeItem(key) { change(key, null, true); },
      clear() { if (draft) draft = record(); else commit(empty()); },
      beginTransaction() { if (draft) throw new Error('Import läuft bereits'); draft = copy(legacy()); },
      commitTransaction() {
        if (!draft) throw new Error('Kein Import aktiv');
        const doc = fromLegacy(draft, current);
        commit(doc); draft = null;
      },
      rollbackTransaction() { draft = null; },
      document() { return copy(current); },
      exportBackup(date = new Date()) { return { ...copy(current), exportedAt: date.toISOString() }; },
      importBackup(value) {
        const doc = copy(validate(value)); doc.schemaVersion=VERSION; delete doc.exportedAt;
        for (const g of doc.groups) if (g.defaultProfile === undefined) g.defaultProfile = profileFor(g.name);
        commit(doc);
      },
      groupName(id) { const g = current.groups.find(g => g.id === id); return g ? g.name : null; },
      defaultGroupName(name) {
        const g = current.groups.find(g => g.name === name);
        return g ? Object.keys(PROFILES).find(k => PROFILES[k] === g.defaultProfile) || null : name;
      },
      renameGroup(id, name) { const doc = copy(current); const g = doc.groups.find(g => g.id === id); if (!g) throw new Error('Unbekannte Gruppe'); g.name = name; commit(doc); },
      renamePosition(id, name) { const doc = copy(current); const p = doc.positions.find(p => p.id === id); if (!p) throw new Error('Unbekannte Position'); p.name = name; commit(doc); }
    };
  }
  const api = { KEY, FORMAT, VERSION, empty, validate, fromLegacy, toLegacy, createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AssetsData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Data=require('../data-store.js');
const {app,MemoryStorage}=require('./app-harness.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'..','demo_backup.json'),'utf8'));
function context(){return app(html);}
test('welcome offers guided setup, existing backup and demo; tour is reachable from Data',()=>{
  const a=context();
  const welcome=a.run('guideWelcome()');
  assert.match(welcome,/Geführt einrichten/);
  assert.match(welcome,/Bestehende Daten laden/);
  assert.match(welcome,/Mit Demo-Daten ausprobieren/);
  assert.match(html,/onclick="startOnboarding\('data'\)"/);
  a.run("startOnboarding('welcome')");
  assert.deepEqual(a.json('_guideKeys()'),['wealth','budget','forecast','data','positions','backup']);
  assert.match(a.el('onboardingOverlay').innerHTML,/1 von 6/);
  assert.equal(a.json('appStorage.document().snapshots.length'),0);
});
test('Max persona can start with three positions without inventing ticker or quantity',()=>{
  const a=context();
  a.context.rows=[{name:'Girokonto',category:'cash',amount:'2.000'}, {name:'Tagesgeld',category:'cash',amount:'4.000'}, {name:'MSCI World ETF',category:'etf',amount:'2.500'}];
  const doc=a.json("prepareOnboardingDocument(AssetsData.empty(),rows,'2026-10')");
  Data.validate(doc);
  assert.equal(doc.positions.length,3);
  assert.equal(doc.snapshots[0].positions.reduce((n,p)=>n+p.value,0),8500);
  assert.ok(doc.positions.every(p=>p.unit===null&&p.ticker===null));
  assert.equal(doc.preferences.modules.forecast,false);
  assert.equal(doc.preferences.modules.budget,false);
  assert.equal(doc.preferences.onboardingCompleted,true);
  const store=Data.createStore(new MemoryStorage());store.importBackup(doc);
  const restored=Data.createStore(new MemoryStorage());restored.importBackup(store.exportBackup());
  assert.deepEqual(restored.document(),doc);
  restored.setItem('darkMode','0');
  assert.equal(restored.document().preferences.onboardingCompleted,true);
});
test('debts remain positive balances and net wealth is assets minus liabilities',()=>{
  const a=context();a.context.rows=[{name:'Wohnung',category:'illiquid',amount:'315.000'},{name:'Kredit Wohnung',category:'liab',amount:'202.000'}];
  a.run("appStorage.importBackup(prepareOnboardingDocument(AssetsData.empty(),rows,'2026-10'));_fc=loadFieldConfig();_modsCache=null;");
  const c=a.json("calc(loadData()['2026-10'])");
  assert.equal(c.assets,315000);assert.equal(c.liab,202000);assert.equal(c.net,113000);
  assert.equal(a.json('appStorage.document().preferences.modules.liab'),true);
});
test('invalid, incomplete and negative values cannot advance or persist',()=>{
  const a=context();
  for(const row of [{name:'',category:'cash',amount:'100'}, {name:'Konto',category:'cash',amount:''}, {name:'Konto',category:'cash',amount:'-100'}, {name:'Konto',category:'cash',amount:'1,2,3'}, {name:'Konto',category:'cash',amount:'100abc'}, {name:'Konto',category:'invalid',amount:'100'}]){
    a.context.rows=[row];assert.throws(()=>a.run('validateOnboardingPositions(rows)'));
  }
  a.run("startOnboarding('welcome');_guideStep=4;_guideDraft.positions=[{name:'Konto',category:'cash',amount:'abc'}];guideNav(1);");
  assert.equal(a.json('_guideStep'),4);assert.equal(a.json('appStorage.document().snapshots.length'),0);
  assert.match(a.el('onboardingError').textContent,/gültigen Betrag/);
});
test('decimal and zero amounts work; entirely blank rows remain optional',()=>{
  const a=context();a.context.rows=[{name:'Konto',category:'cash',amount:'1.500,50'},{name:'Leer',category:'cash',amount:'0'},{name:'',category:'cash',amount:''}];
  assert.deepEqual(a.json('validateOnboardingPositions(rows)').map(p=>p.value),[1500.5,0]);
  const doc=a.json("prepareOnboardingDocument(AssetsData.empty(),[],'2026-10')");
  assert.equal(doc.snapshots.length,0);assert.equal(doc.preferences.onboardingCompleted,true);
});
test('replay never replaces existing data or changes active modules',()=>{
  const a=context();a.context.original=fixture;a.context.rows=[{name:'Other',category:'cash',amount:'999'}];
  const doc=a.json("prepareOnboardingDocument(original,rows,'2026-10')");
  const expected=JSON.parse(JSON.stringify(fixture));expected.preferences.onboardingCompleted=true;
  assert.deepEqual(doc,expected);
  a.run("appStorage.importBackup(original);startOnboarding('data');");
  assert.deepEqual(a.json('_guideKeys()'),['wealth','budget','forecast','data','backup']);
  assert.match(a.el('onboardingOverlay').innerHTML,/1 von 5/);
});
test('a budget-only profile is recognized as existing data',()=>{
  const a=context();const doc=Data.empty();
  doc.budget={items:[{id:'budget-1',name:'Gehalt',category:'einkommen',subcategory:'',kind:'income',targetGroupId:null,monthlyAmounts:Array(12).fill(2400)}],standingOrders:[]};
  a.context.existing=doc;a.run("appStorage.importBackup(existing);startOnboarding('data');");
  assert.equal(a.json('_guideNew'),false);
  assert.equal(a.json('_guideKeys().length'),5);
  assert.equal(a.json('appStorage.document().budget.items[0].monthlyAmounts[0]'),2400);
});
test('cancel keeps storage untouched, preserves draft on rejection and returns to start',()=>{
  const a=context(),before=a.storage.getItem(Data.KEY);
  a.run("startOnboarding('welcome');_guideDraft.positions=[{name:'Konto',category:'cash',amount:'100'}];confirm=()=>false;cancelOnboarding();");
  assert.equal(a.json('_guideActive'),true);
  a.run('confirm=()=>true;cancelOnboarding();');
  assert.equal(a.json('_guideActive'),false);
  assert.equal(a.storage.getItem(Data.KEY),before);
  assert.match(a.el('onboardingOverlay').innerHTML,/Geführt einrichten/);
});
test('back navigation retains input and skip has an explicit no-values outcome',()=>{
  const a=context();a.run("startOnboarding('welcome');_guideStep=4;_guideDraft.positions=[{name:'Konto',category:'cash',amount:'100'}];guideNav(-1);guideNav(1);");
  assert.equal(a.json('_guideDraft.positions[0].amount'),'100');
  a.run('guideSkipPositions();');
  assert.equal(a.json('_guideStep'),5);assert.deepEqual(a.json('_guideDraft.positions'),[]);
  assert.match(a.el('onboardingOverlay').innerHTML,/Zur Vermögensseite/);
});
test('completion prepares current and live months in one document; quota keeps the draft',()=>{
  const a=context();a.context.rows=[{name:'Konto',category:'cash',amount:'100'}];
  const doc=a.json("prepareOnboardingDocument(AssetsData.empty(),rows,'2026-10','2026-11')");
  assert.deepEqual(doc.snapshots.map(s=>s.month),['2026-10','2026-11']);
  assert.deepEqual(doc.snapshots[0].positions,doc.snapshots[1].positions);
  const before=a.storage.getItem(Data.KEY);
  a.run("startOnboarding('welcome');_guideStep=5;_guideDraft.positions=rows;");
  a.storage.failWrites=true;a.run('finishOnboarding()');
  assert.equal(a.storage.getItem(Data.KEY),before);
  assert.equal(a.json('_guideDraft.positions[0].amount'),'100');
  assert.match(a.el('onboardingError').textContent,/Quota/);
});
test('completion lands on Assets with a next-step link to Data, including skipped input and replay',()=>{
  for(const mode of ['positions','skip','replay']){
    const a=context();a.context.existing=fixture;
    if(mode==='replay')a.run('appStorage.importBackup(existing)');
    a.run("_v2ApplyModules=()=>{};navigateToPage=page=>{landedPage=page};startOnboarding('data');");
    if(mode==='positions')a.run("_guideDraft.positions=[{name:'Konto',category:'cash',amount:'100'}]");
    if(mode==='skip')a.run('guideSkipPositions()');
    a.el('onboardingNextStep').hidden=true;
    a.run('finishOnboarding()');
    assert.equal(a.json('landedPage'),'home');
    assert.equal(a.el('onboardingNextStep').hidden,false);
    assert.equal(a.json('_guideActive'),false);
    assert.equal(a.json('appStorage.document().preferences.onboardingCompleted'),true);
    assert.equal(a.el('onboardingOverlay').style.display,'none');
    if(mode==='positions')assert.equal(a.json('appStorage.document().snapshots[0].positions[0].value'),100);
    const notice=html.match(/<aside id="onboardingNextStep"[\s\S]*?<\/aside>/)[0];
    assert.match(notice,/Verbindlichkeiten, Einnahmen &amp; Ausgaben/);
    a.context.event={preventDefault(){}};
    a.run(notice.match(/<a[^>]*onclick="([^"]+)"/)[1]);
    assert.equal(a.json('landedPage'),'import');
  }
});

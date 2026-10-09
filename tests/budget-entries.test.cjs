const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {app,MemoryStorage}=require('./app-harness.cjs');
const Data=require('../data-store.js');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function fixture(){
  const d=Data.empty();
  d.groups=[{id:'g1',name:'ETF',assumptions:{}}];
  d.budget={items:[
    {id:'budget-1',name:'Gehalt',category:'einkommen',subcategory:'',kind:'income',targetGroupId:null,monthlyAmounts:Array(12).fill(3000)},
    {id:'budget-2',name:'Kfz-Versicherung',category:'fixe',subcategory:'Auto',kind:'expense',targetGroupId:null,monthlyAmounts:[0,0,480,0,0,0,0,0,0,0,0,0]}
  ],standingOrders:[],oneTime:[
    {id:'once-1',name:'Autoreparatur',category:'variable',kind:'expense',month:'2026-11',amount:800,targetGroupId:null}
  ]};
  return d;
}
function context(doc=fixture(),month='2026-11'){
  const a=app(html,new MemoryStorage({[Data.KEY]:JSON.stringify(doc)}));a.context.CSS={escape:String};a.run(`selectedMonth='${month}'`);return a;
}
/* Sheet-Felder im Harness: Elemente sind Platzhalter, Werte werden direkt gesetzt */
function fill(a,values,custom=false){
  for(const [k,v] of Object.entries(values))a.el(k).value=v;
  a.el('b-customOn').getAttribute=()=>String(custom);
}

test('one-time payments travel in the backup and malformed entries are rejected',()=>{
  const store=Data.createStore(new MemoryStorage());store.importBackup(fixture());
  const copy=Data.createStore(new MemoryStorage());copy.importBackup(store.exportBackup());
  assert.deepEqual(copy.document().budget.oneTime,fixture().budget.oneTime);
  assert.equal(copy.document().schemaVersion,4);
  for(const bad of [{month:'11/26'},{kind:'principal'},{category:'other'},{amount:-1},{name:''},{targetGroupId:'missing'},{extra:1}]){
    const d=fixture();Object.assign(d.budget.oneTime[0],bad);assert.throws(()=>Data.validate(d));
  }
  const v3=fixture();delete v3.budget.oneTime;v3.schemaVersion=3;assert.doesNotThrow(()=>Data.validate(v3));
});

test('rhythms map onto the twelve plan values and are read back from them',()=>{
  const a=context();
  assert.deepEqual(a.json("_budgetValues('month',50,0)"),Array(12).fill(50));
  assert.deepEqual(a.json("_budgetValues('quarter',100,4)"),[0,100,0,0,100,0,0,100,0,0,100,0]);
  assert.deepEqual(a.json("_budgetValues('year',480,2)"),[0,0,480,0,0,0,0,0,0,0,0,0]);
  assert.deepEqual(a.json("_budgetRhythm([0,100,0,0,100,0,0,100,0,0,100,0])"),{rhythm:'quarter',amount:100,start:1});
  assert.deepEqual(a.json("_budgetRhythm([0,0,480,0,0,0,0,0,0,0,0,0])"),{rhythm:'year',amount:480,start:2});
  assert.equal(a.json("_budgetRhythm([3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,6000,3000])").rhythm,'custom');
  assert.equal(a.run("_rhythmText({rhythm:'year',start:2})"),'jährlich im März');
});

test('a one-time payment counts only in its own month and never in the plan averages',()=>{
  const a=context();
  const nov=a.json('calcBudgetMonth(loadBudgetData(),10,true)');
  assert.equal(nov.variable,800);assert.ok(nov.varItems.some(i=>i.once&&i.label==='Autoreparatur · einmalig'));
  assert.equal(a.json('calcBudgetMonth(loadBudgetData(),10)').variable,0);
  assert.equal(a.json('calcBudgetMonth(loadBudgetData(),9,true)').variable,0);
  assert.equal(a.json("_avgBudget(loadBudgetData(),'variable')"),0);
  a.run("selectedMonth='2027-11'");assert.equal(a.json('calcBudgetMonth(loadBudgetData(),10,true)').variable,0,'no repetition next year');
});

test('new recurring entry: yearly insurance lands in its due month only',()=>{
  const a=context();
  a.run('openBudgetSheet()');
  fill(a,{'b-mode':'recurring','b-name':'Hausrat','b-type':'expense','b-cost':'fixe','b-amount':'120','b-rhythm':'year','b-start':'5','b-subcat':'Versicherungen'});
  a.run('_submitSheet()');
  assert.equal(a.run('_sheetOpen'),false,a.el('dsError').textContent);
  const item=a.json('appStorage.document()').budget.items.find(i=>i.name==='Hausrat');
  assert.equal(item.category,'fixe');assert.equal(item.kind,'expense');assert.equal(item.subcategory,'Versicherungen');
  assert.deepEqual(item.monthlyAmounts,[0,0,0,0,0,120,0,0,0,0,0,0]);
});

test('new one-time entry: saving with target, in the chosen month',()=>{
  const a=context();
  a.run("openBudgetSheet({mode:'once'})");
  fill(a,{'b-mode':'once','b-name':'Bonus ins Depot','b-type':'saving','b-amount':'1.500','b-month':'2026-12','b-target':'g1'});
  a.run('_submitSheet()');
  const once=a.json('appStorage.document()').budget.oneTime.find(o=>o.name==='Bonus ins Depot');
  assert.deepEqual({...once,id:undefined},{id:undefined,name:'Bonus ins Depot',category:'sparen',kind:'saving',month:'2026-12',amount:1500,targetGroupId:'g1'});
  assert.match(once.id,/^once-/);
});

test('editing keeps the id, custom month values are stored as entered, and invalid input stores nothing',()=>{
  const a=context();
  a.run("openBudgetSheet({ref:'einkommen:budget-1'})");
  fill(a,{'b-name':'Gehalt','b-type':'income','b-m0':'3.000','b-m1':'3.000','b-m2':'3.000','b-m3':'3.000','b-m4':'3.000','b-m5':'3.000','b-m6':'3.000','b-m7':'3.000','b-m8':'3.000','b-m9':'3.000','b-m10':'6.000','b-m11':'3.000'},true);
  a.run('_submitSheet()');
  const item=a.json('appStorage.document()').budget.items.find(i=>i.id==='budget-1');
  assert.equal(item.monthlyAmounts[10],6000);assert.equal(item.monthlyAmounts[0],3000);
  const b=context(),before=b.storage.getItem(Data.KEY);
  b.run("openBudgetSheet({once:'once-1'})");fill(b,{'b-name':'Autoreparatur','b-type':'expense','b-cost':'variable','b-amount':'abc','b-month':'2026-11'});
  b.run('_submitSheet()');
  assert.equal(b.storage.getItem(Data.KEY),before);assert.equal(b.run('_sheetOpen'),true);
});

test('deleting a one-time payment removes only that entry',()=>{
  const a=context();a.run('confirm=()=>true');
  a.run("openBudgetSheet({once:'once-1'});_deleteBudgetEntry()");
  const b=a.json('appStorage.document()').budget;
  assert.deepEqual(b.oneTime,[]);assert.equal(b.items.length,2);
});

test('the Data page lists recurring entries with their rhythm and one-time payments separately',()=>{
  const a=context();
  const list=a.run('_budgetListHTML()');
  assert.match(list,/Kfz-Versicherung<\/span><small>jährlich im März · Auto/);
  assert.match(list,/Einmalige Zahlungen/);assert.match(list,/Autoreparatur<\/span><small>Nov 2026 · Ausgabe/);
  assert.match(list,/data-ds-open="add-budget"/);
});

test('accounts and standing orders can be created, renamed and deleted; orders follow a renamed account',()=>{
  const a=context();
  a.run('openAccountSheet()');fill(a,{'a-name':'Girokonto','a-iban':'de89 3704 0044 0532 0130 00'});a.run('_submitSheet()');
  a.run('openAccountSheet()');fill(a,{'a-name':'Haushalt','a-iban':''});a.run('_submitSheet()');
  a.run('openOrderSheet()');fill(a,{'o-from':'Girokonto','o-to':'Haushalt','o-amount':'1.200'});a.run('_submitSheet()');
  let b=a.json('appStorage.document()').budget,accounts=a.json('appStorage.document()').accounts;
  assert.deepEqual(accounts.map(x=>[x.name,x.iban]),[['Girokonto','DE89370400440532013000'],['Haushalt','']]);
  assert.equal(b.standingOrders.length,1);assert.equal(b.standingOrders[0].amount,1200);
  assert.deepEqual(b.standingOrders[0].to,{type:'account',accountId:accounts[1].id});
  a.run("openAccountSheet('Haushalt')");fill(a,{'a-name':'Haushaltskonto','a-iban':''});a.run('_submitSheet()');
  const legacy=a.json('loadBudgetData()');
  assert.equal(legacy.standingOrders[0].to,'Haushaltskonto');assert.ok('Haushaltskonto' in legacy.accounts);
  a.run('confirm=()=>true');a.run("openAccountSheet('Girokonto');_deleteAccount()");
  b=a.json('appStorage.document()').budget;
  assert.deepEqual(b.standingOrders[0].from,{type:'label',name:'Girokonto'},'order keeps the name as a label');
  a.run(`openOrderSheet('${b.standingOrders[0].id}');_deleteOrder()`);
  assert.deepEqual(a.json('appStorage.document()').budget.standingOrders,[]);
});

test('invalid accounts and orders store nothing',()=>{
  const a=context(),before=a.storage.getItem(Data.KEY);
  for(const [sheet,values] of [['openAccountSheet()',{'a-name':'','a-iban':''}],['openAccountSheet()',{'a-name':'X','a-iban':'123'}],['openOrderSheet()',{'o-from':'A','o-to':'A','o-amount':'10'}],['openOrderSheet()',{'o-from':'A','o-to':'B','o-amount':'0'}]]){
    a.run('_closeSheet(true)');a.run(sheet);fill(a,values);a.run('_submitSheet()');
    assert.equal(a.storage.getItem(Data.KEY),before);assert.equal(a.run('_sheetOpen'),true);
  }
});

test('without standing orders the money flow shows a hint that links to the Data page',()=>{
  const a=context();
  a.run("renderBudgetSankey(calcBudgetMonth(loadBudgetData(),10,true))");
  const hint=a.el('sankeyWrap').innerHTML;
  assert.match(hint,/Noch kein Geldfluss/);assert.match(hint,/_openDataSection\('budget','ds-moneyflow'\)/);
  const empty=app(html,new MemoryStorage());empty.run("renderBudgetSankey(null)");
  assert.match(empty.el('sankeyWrap').innerHTML,/_openDataSection\('budget','ds-budget-items'\)/);
  assert.doesNotMatch(html,/class="budget-add"/);
});

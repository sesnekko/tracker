const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Loan=require('../loan-model.js');
const Data=require('../data-store.js');
const {app,MemoryStorage}=require('./app-harness.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const params={principal:100000,rate:4,repayment:2,firstDue:'2026-01',fixedYears:10,assetId:'home',extras:[]};
function document(){
  const doc=Data.empty();
  doc.groups=[{id:'homes',name:'Immobilien',assumptions:{}},{id:'cars',name:'Autos',assumptions:{}},{id:'debts',name:'Kredite',assumptions:{}}];
  const position=(id,name,category,groupId)=>({id,name,category,groupId,archived:false,custom:true,ticker:null,unit:null});
  doc.positions=[position('home','Haus','illiquid','homes'),position('car','Auto','illiquid','cars'),position('debt','Hauskredit','liab','debts')];
  doc.snapshots=[{month:'2026-10',positions:[{positionId:'home',value:500000},{positionId:'car',value:25000},{positionId:'debt',value:99999}]}];
  doc.loans=[{positionId:'debt',principalAmount:100000,interestPercent:4,initialRepaymentPercent:2,firstPaymentMonth:'2026-01',fixedInterestYears:10,linkedAssetId:'home',extraPayments:[]}];
  return doc;
}
function context(doc=document()){
  const a=app(html);a.context.fixture=doc;
  a.run("appStorage.importBackup(fixture);_fc=loadFieldConfig();_modsCache=null;selectedMonth='2026-10';CSS={escape:s=>s}");return a;
}

test('annuity starts with principal × (interest + initial repayment) / 12 and declining interest',()=>{
  assert.equal(Loan.payment(params),500);
  const s=Loan.schedule(params);
  assert.deepEqual(s.rows[0],{month:'2026-01',opening:100000,interest:333.33,payment:500,principal:166.67,extra:0,totalPayment:500,balance:99833.33});
  assert.ok(s.rows[1].interest<s.rows[0].interest);
  assert.ok(s.rows[1].principal>s.rows[0].principal);
  assert.equal(s.rows[1].payment,500);
  assert.equal(s.rows.at(-1).balance,0);
  assert.ok(s.rows.at(-1).payment<=500);
});
test('dated special repayments aggregate, reduce following interest and cannot overpay',()=>{
  const s=Loan.schedule({...params,extras:[{id:'a',month:'2026-01',amount:20000},{id:'b',month:'2026-01',amount:5000},{id:'c',month:'2026-02',amount:999999}]});
  assert.equal(s.rows[0].extra,25000);
  assert.equal(s.rows[1].interest,Loan.cents(s.rows[0].balance*4/1200));
  assert.equal(s.payoff,'2026-02');assert.equal(s.rows[1].balance,0);
  assert.equal(s.rows[1].extra,Loan.cents(s.rows[1].opening+s.rows[1].interest-s.rows[1].payment));
  assert.equal(Loan.at({...params,principal:1200,rate:0,pay:100},'2025-12').totalPayment,0);
});
test('zero interest, first due date, final partial payment and fixed interest change are exact',()=>{
  const p={principal:1250,rate:0,pay:100,firstDue:'11/26',fixedYears:1};
  assert.equal(Loan.normalizeMonth('11/26'),'2026-11');assert.equal(Loan.normalizeMonth('13/26'),null);
  assert.equal(Loan.at(p,'2026-10').balance,0);
  const s=Loan.schedule(p);assert.equal(s.payoff,'2027-11');assert.equal(s.rows.at(-1).payment,50);assert.equal(s.totalInterest,0);
  assert.equal(Loan.at(p,'2028-01').totalPayment,0);
  const q={...params,principal:10000,pay:100,rate:6,fixedYears:1,follow:12};
  const schedule=Loan.schedule(q);assert.equal(schedule.fixedEnd,'2026-12');
  assert.equal(schedule.rows[12].interest,Loan.cents(schedule.rows[11].balance*12/1200));
});
test('single-file transfer retains stable asset links, dates and extra rows across rename and archive',()=>{
  const doc=document();doc.loans[0].extraPayments=[{id:'extra-1',month:'2026-12',amount:1000}];
  const store=Data.createStore(new MemoryStorage());store.importBackup(doc);
  store.renamePosition('home','Familienhaus');
  store.setItem('darkMode','1');
  const facade=JSON.parse(store.getItem('loanParams'));
  assert.equal(facade.debt.assetId,'home');assert.equal(facade.debt.firstDue,'2026-01');assert.equal(facade.debt.extras[0].amount,1000);
  const second=Data.createStore(new MemoryStorage());second.importBackup(store.exportBackup());
  assert.deepEqual(second.document().loans,store.document().loans);
  const fields=JSON.parse(second.getItem('fieldConfig'));fields.fields=fields.fields.filter(f=>f.id!=='home');
  second.setItem('fieldConfig',JSON.stringify(fields));
  assert.equal(second.document().positions.find(p=>p.id==='home').archived,true);
  assert.equal(second.document().loans[0].linkedAssetId,'home');
});
test('invalid links, dates, negative terms and special repayments fail atomically',()=>{
  const store=Data.createStore(new MemoryStorage());store.importBackup(document());const before=store.document();
  for(const change of [l=>l.linkedAssetId='debt',l=>l.linkedAssetId='missing',l=>l.firstPaymentMonth='2026-13',l=>l.interestPercent=-1,l=>l.extraPayments=[{id:'a',month:'2025-12',amount:100}],l=>l.extraPayments=[{id:'a',month:'2026-12',amount:-10}]]){
    const bad=document();change(bad.loans[0]);assert.throws(()=>store.importBackup(bad));assert.deepEqual(store.document(),before);
  }
});
test('derived balances and explicit asset link are used in wealth and forecast grouping',()=>{
  const a=context(),closing=Loan.at(params,'2026-10').balance;
  assert.equal(a.json("loadData()['2026-10']._details.debt"),closing);
  assert.equal(a.json("calc(loadData()['2026-10']).liab"),closing);
  assert.equal(a.json("_liabTargetGroup(_fc.fields.find(f=>f.id==='debt'))"),'Immobilien');
  assert.equal(a.json("buildNetGroups(loadData()['2026-10']._details,true).find(g=>g.key==='Immobilien').val"),500000-closing);
  a.run("const lp=getLoanParams();lp.debt.assetId='car';appStorage.setItem('loanParams',JSON.stringify(lp))");
  assert.equal(a.json("_liabTargetGroup(_fc.fields.find(f=>f.id==='debt'))"),'Autos');
});
test('budget uses each month’s actual interest, principal and extras without double counting matching rows',()=>{
  const doc=document();doc.loans[0].extraPayments=[{id:'extra-1',month:'2026-12',amount:1000}];const a=context(doc);
  a.context.bd={einkommen:[{name:'Gehalt',values:Array(12).fill(2500)}],fixe:[{name:'Hauskredit',kind:'loanPayment',values:Array(12).fill(500)}],variable:[],sparen:[]};
  const jan=a.json('calcBudgetMonth(bd,0)'),dec=a.json('calcBudgetMonth(bd,11)');
  assert.equal(jan.fixkosten,333.33);assert.equal(jan.tilgung,166.67);assert.equal(jan.frei,2000);
  assert.equal(dec.fixkosten+dec.tilgung,1500);assert.equal(dec.frei,1000);assert.ok(dec.fixkosten<jan.fixkosten);
  assert.equal(a.json('calcBudgetMonth(null,0).fixkosten'),333.33);
});
test('forecast loan outflow and remaining balance come from the same monthly schedule',()=>{
  const a=context();a.run("appStorage.setItem('lt-birth-year','1980');appStorage.setItem('lt-birth-month','1');appStorage.setItem('lt-plan-horizon','50')");
  const plan=a.json('buildPlan(getLifetimeSettings())');
  const group=plan.groups.find(g=>g.key==='Immobilien'),loan=group.loans[0];assert.ok(loan.contractSteps);
  assert.equal(loan.contractSteps[0].balance,Loan.at(params,'2026-12').balance);
  assert.equal(loan.contractSteps[0].cost,1000); // November and December after October snapshot.
  const sim=a.json('simulatePlan(buildPlan(getLifetimeSettings()),0,{record:true})');
  assert.equal(sim.loanOut['0'],1000);
});
test('date display and draft special payments preserve full years and German thousands',()=>{
  const a=context();
  assert.equal(a.run("_loanMonthLabel('1998-04')"),'04/1998');
  assert.equal(Loan.normalizeMonth(a.run("_loanMonthLabel('1998-04')")),'1998-04');
  assert.match(a.run("_loanExtraHTML('debt',{id:'a',month:'11/26',amount:'10.000'})"),/value="10\.000"/);
});
test('editing payment recalculates initial repayment; incomplete special payments cannot be saved',()=>{
  const a=context();
  const inputs={principal:{value:'100.000',dataset:{k:'principal'}},rate:{value:'4',dataset:{k:'rate'}},repayment:{value:'2',dataset:{k:'repayment'}},pay:{value:'1000',dataset:{k:'pay'}},firstDue:{value:'01/26',dataset:{k:'firstDue'}}};
  a.context.document.querySelector=selector=>{
    const k=selector.match(/data-k="([^"]+)"/);return k?inputs[k[1]]:null;
  };
  a.context.document.querySelectorAll=selector=>selector.includes('input[data-loan')?Object.values(inputs):[];
  a.run("_syncLoanPayment('debt','pay')");assert.equal(inputs.repayment.value,'8');
  a.el('loanExtras-debt').querySelectorAll=()=>[{dataset:{extraId:'a'},querySelector:selector=>({value:selector==='[data-extra-month]'?'11/26':''})}];
  assert.throws(()=>a.run("_loanFromInputs('debt',true)"),/Sondertilgung/);
  inputs.firstDue.value='13/26';assert.throws(()=>a.run("_loanFromInputs('debt',true)"),/Fälligkeit/);
});

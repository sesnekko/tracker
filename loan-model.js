(function(root){
  'use strict';
  const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
  function normalizeMonth(value){
    const raw=String(value||'').trim();
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(raw))return raw;
    const m=raw.match(/^(0?[1-9]|1[0-2])\/(\d{2}|\d{4})$/);
    return m?(m[2].length===2?'20'+m[2]:m[2])+'-'+m[1].padStart(2,'0'):null;
  }
  const index=ym=>+ym.slice(0,4)*12+(+ym.slice(5)-1);
  const month=i=>Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0');
  const addMonths=(ym,n)=>month(index(ym)+n);
  const payment=p=>Number.isFinite(p.pay)?p.pay:cents((+p.principal||0)*((+p.rate||0)+(+p.repayment||0))/1200);
  function configured(p){return !!p&&Number.isFinite(p.principal)&&p.principal>=0.01&&!!normalizeMonth(p.firstDue)&&Number.isFinite(p.rate)&&p.rate>=0&&Number.isFinite(payment(p))&&payment(p)>=0.01;}
  const cache=new Map();
  function schedule(p){
    if(!configured(p))return null;
    const key=JSON.stringify(p);if(cache.has(key))return cache.get(key);
    const start=normalizeMonth(p.firstDue),fixedMonths=Math.round((+p.fixedYears||0)*12);
    const fixedEnd=fixedMonths>0?addMonths(start,fixedMonths-1):p.fixed?String(p.fixed)+'-12':null;
    const extras=new Map();
    for(const e of p.extras||[]){const ym=normalizeMonth(e.month);if(ym)extras.set(ym,(extras.get(ym)||0)+(+e.amount||0));}
    const rows=[];let balance=cents(p.principal),totalInterest=0,totalExtra=0,restAtFixed=null,payoff=null;
    for(let i=0;i<1200&&balance>0;i++){
      const ym=addMonths(start,i),opening=balance;
      const rate=fixedEnd&&ym>fixedEnd&&Number.isFinite(p.follow)?p.follow:p.rate;
      const interest=cents(opening*rate/1200);
      const regular=cents(Math.min(payment(p),opening+interest));
      const principal=cents(regular-interest);
      balance=cents(opening+interest-regular);
      const wanted=(extras.get(ym)||0)+(ym.endsWith('-12')?(+p.extra||0):0);
      const extra=cents(Math.min(balance,wanted));balance=cents(balance-extra);
      totalInterest=cents(totalInterest+interest);totalExtra=cents(totalExtra+extra);
      rows.push({month:ym,opening,interest,payment:regular,principal,extra,totalPayment:cents(regular+extra),balance});
      if(ym===fixedEnd)restAtFixed=balance;
      if(balance===0){payoff=ym;break;}
      if(balance>1e14)break;
    }
    if(fixedEnd&&restAtFixed===null&&payoff&&payoff<=fixedEnd)restAtFixed=0;
    const result={rows,start,fixedEnd,restAtFixed,payoff,totalInterest,totalExtra,remaining:balance,payment:payment(p)};
    if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
  }
  function at(p,ym){
    const s=schedule(p);if(!s)return null;
    const i=index(ym)-index(s.start);
    if(i>=0&&i<s.rows.length)return s.rows[i];
    return {month:ym,opening:i<0?0:s.remaining,interest:0,payment:0,principal:0,extra:0,totalPayment:0,balance:i<0?0:s.remaining};
  }
  const api={normalizeMonth,addMonths,payment,configured,schedule,at,cents};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LoanModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);

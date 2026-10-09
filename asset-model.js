/* Asset metadata is independent of a month's quantity and valuation. */
(function(root){
  'use strict';
  const categories={
    cash:{name:'Konten & Bargeld',liquidity:'liquid',unit:'Stück'},
    etf:{name:'ETF & Fonds',liquidity:'liquid',unit:'Stück'},
    stock:{name:'Aktie',liquidity:'liquid',unit:'Stück'},
    bitcoin:{name:'Bitcoin',liquidity:'liquid',unit:'BTC'},
    crypto:{name:'Krypto',liquidity:'liquid',unit:'Coins'},
    metal:{name:'Edelmetall',liquidity:'liquid',unit:'oz'},
    realEstate:{name:'Immobilie',liquidity:'illiquid',unit:'Stück'},
    vehicle:{name:'Fahrzeug',liquidity:'illiquid',unit:'Stück'},
    illiquid:{name:'Sonstiger Sachwert',liquidity:'illiquid',unit:'Stück'},
    bav:{name:'Altersvorsorge',liquidity:'illiquid',unit:'Stück'},
    other:{name:'Sonstige Anlage',liquidity:'liquid',unit:'Stück'}
  };
  const liquidity=f=>f.liquidity||categories[f.category]?.liquidity||'illiquid';
  const valuation=f=>f.valuation||(f.ticker&&f.hasUnits?'market':'manual');
  const instrument=f=>f.instrument||(f.ticker?{provider:f.ticker==='BTC'?'bitcoin':'yahoo',symbol:f.ticker==='BTC'?'XBTEUR':f.ticker,exchange:'',currency:'',name:f.label}:null);
  const key=i=>i?i.provider+'|'+i.symbol:'';
  const money=n=>Math.round((n+Number.EPSILON)*100)/100;
  /* Abschreibung: ab dem Kaufmonat sinkt der Wert am Ende jedes vollen Zeitraums,
     prozentual vom jeweiligen Restwert oder um einen festen Betrag, nie unter null. */
  const PERIOD_MONTHS={month:1,quarter:3,year:12};
  const monthIndex=ym=>/^\d{4}-(0[1-9]|1[0-2])$/.test(ym||'')?+ym.slice(0,4)*12+(+ym.slice(5)-1):null;
  function depreciationValid(d){
    return !!d&&['percent','absolute'].includes(d.method)&&!!PERIOD_MONTHS[d.interval]&&monthIndex(d.startMonth)!==null&&
      Number.isFinite(d.startValue)&&d.startValue>=0&&Number.isFinite(d.amount)&&d.amount>0&&(d.method!=='percent'||d.amount<=100);
  }
  function depreciatedValue(d,ym){
    if(!depreciationValid(d))return null;
    const k=monthIndex(ym)-monthIndex(d.startMonth);if(k<0)return null;
    const n=Math.floor(k/PERIOD_MONTHS[d.interval]);
    const v=d.method==='percent'?d.startValue*Math.pow(1-d.amount/100,n):d.startValue-d.amount*n;
    return money(Math.max(0,v));
  }
  const api={categories,liquidity,valuation,instrument,key,money,PERIOD_MONTHS,depreciationValid,depreciatedValue};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AssetModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);

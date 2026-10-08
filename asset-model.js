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
  const api={categories,liquidity,valuation,instrument,key,money};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AssetModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);

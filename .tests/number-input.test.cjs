/* P10: ein deutsches Zahlenmodell für alle Eingaben. Komma = Dezimalzeichen, Punkt (oder Leerzeichen) nur als
   Tausendertrennzeichen in Dreiergruppen. Alles andere ist ungültig und wird nie still umgedeutet.
   CSV-Dateien (parseCsvNumber) und gespeicherte Werte (_lsNum) sind keine Eingaben und bleiben unberührt. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, context } = require('./forecast-fixture.cjs');

const a = context(fixture());
const parse = t => a.json(`(()=>{const n=parseGermanNumber(${JSON.stringify(t)});return Number.isFinite(n)?n:null;})()`);
const throws = code => { try { a.run(code); return null; } catch (e) { return e.message; } };

test('P10: gültige deutsche Zahlen', () => {
  const ok = { '1.500': 1500, '1.500,50': 1500.5, '7,5': 7.5, '1500': 1500, '0,25': 0.25, '0': 0,
    '12.345.678,9': 12345678.9, '1 000': 1000, '1 000,5': 1000.5, '€ 1.200': 1200, '1.200 €': 1200,
    '3 %': 3, '-10': -10, '−2,5': -2.5, '+4': 4, '0,00000001': 1e-8, '007': 7 };
  for (const [t, v] of Object.entries(ok)) assert.equal(parse(t), v, t);
});
test('P10: mehrdeutige oder falsche Eingaben sind ungültig statt umgedeutet', () => {
  for (const t of ['1.5', '0.5', '0.250', '1.5000', '1.500.5', '1,2,3', '1,5.000', ',5', '5,', 'abc', '', ' ', '1 5', '1..500', '1.500,', '--5'])
    assert.equal(parse(t), null, JSON.stringify(t));
});
test('P10: Stückzahl, Betrag und Einrichtung lesen gleich', () => {
  assert.equal(a.json('_assetNumber("1.500",true)'), 1500, 'früher 1,5');
  assert.equal(a.json('_assetNumber("0,00000001",true)'), 1e-8);
  assert.equal(a.json('_assetNumber("1.500,25")'), 1500.25);
  assert.match(throws('_assetNumber("1.5",true)'), /Stückzahl/);
  assert.match(throws('_assetNumber("0.5")'), /Gesamtwert/);
  assert.match(throws('_sheetMoney("1.5","Wert")'), /Wert: .*1\.250,50/);
  assert.equal(a.json('_setupNum("1.500","Stückzahl")'), 1500);
  assert.match(throws('_setupNum("2.5","Bedarf")'), /Bedarf/);
  assert.equal(a.json('_setupQty("1.500")'), 1500, 'früher 1,5');
  assert.equal(a.json('parseNumberWithThousands("1.5")'), 0, 'früher 15');
  assert.equal(a.json('parseNumberWithThousands("1.500,5")'), 1500.5);
});
test('P10: angezeigte Werte lassen sich unverändert wieder einlesen', () => {
  for (const q of [1e-8, 0.5, 1500, 1234.5678, 21000000]) assert.equal(a.json(`_assetNumber(_qtyInput(${q}),true)`), q, String(q));
  for (const m of [0.5, 1250.5, 1500, 99999.99]) assert.equal(a.json(`_sheetMoney(_moneyInput(${m}))`), m, String(m));
});
test('P10: relative Eingabe im Monatsstand nutzt dasselbe Modell', () => {
  const ms = (v, before, qty) => a.json(`(()=>{const n=_msNum({value:${JSON.stringify(v)},dataset:{before:${JSON.stringify(String(before))}${qty ? ',msQty:"1"' : ''}}});return Number.isFinite(n)?n:null;})()`);
  assert.equal(ms('+1.000', 2500), 3500);
  assert.equal(ms('−250,50', 1000), 749.5);
  assert.equal(ms('+1.5', 10, true), null, 'ungültig, nicht 11,5 oder 25');
  assert.equal(ms('1.500', 0, true), 1500);
});

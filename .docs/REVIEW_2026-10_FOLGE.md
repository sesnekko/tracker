# Unabhängiger Folge-Review – Datensicherheit P34–P38

Prüfdatum: 14.10.2026. Basis: `1b57aa83ae3ce57eb71c956bbd63ba869c258533`. Geprüft wurde **der nicht committete Arbeitsstand**, einschließlich `.tests/data-safety.test.cjs`, gegen `git diff 1b57aa8`. Schema 16, Cache `verm-v123`, `data-store.js?v=25`, `i18n-en.js?v=9`. Alle Code-Verweise gelten für diese Arbeitskopie, nicht für die Zeilennummern des Basiscommits.

## 1. Zusammenfassung

**Gesamturteil: P38 ist behoben; P34–P37 sind teilweise behoben. Eine vollständige Freigabe des Datensicherheitsblocks ist noch nicht gerechtfertigt.** Die ursprüngliche Gehaltsverdopplung, der Verlust des gewöhnlichen Teilzeitbeginns und die Ladeblockade bei 2019,5 als Kinderjahrgang sind in den ursprünglichen Standardfällen beseitigt. Die neue Suite besteht mit **283/283 Tests**, das bestehende fachliche Audit mit **22/22 Sollwerten**. Zusätzliche Tests zeigen jedoch **zehn neue Befunde: vier hoch, fünf mittel, einer niedrig**. Am schwersten wiegt eine Regression bei der automatischen Schreibübernahme: Ein offener Entwurf kann einen inzwischen gespeicherten Wert ohne Konfliktmeldung zurücksetzen; das wurde im Harness und in zwei echten Chrome-Tabs bestätigt. Außerdem stimmen die Teilzeit-Umstellung „ab heute“ und die Behandlung gemischter beziehungsweise mehrfach an Depots erfasster Kinderjahrgänge nicht mit dem angekündigten Ergebnis überein. Die Fehlerbehandlung beim Erwerb der Web Lock und die Freigabe bei Navigation benötigen weitere Arbeit. P39–P53 wurden auftragsgemäß nicht erneut bewertet oder als neue Befunde gezählt.

## 2. Urteil zu P34–P38

| Befund | Urteil | Beleg der Behebung im ursprünglichen Fall | Verbleibende Einschränkungen |
| --- | --- | --- | --- |
| P34 – gleichzeitiges Speichern | **teilweise** | Mit funktionierender exklusiver Web Lock wird eine Änderung im zweiten Store mit `READ_ONLY` abgelehnt. Chrome zeigt tatsächlich „Nur ansehen“; freiwillige Übergabe und Übernahme nach Schließen funktionieren. | Offene Entwürfe verlieren bei Übernahme ihre Konfliktbasis: P54. Fehler-/Timeoutpfade: P55. Navigation: P63. Ohne oder bei abgelehnten Locks tritt das ursprüngliche Schreibrennen weiterhin auf; dieser Rückfall ist dokumentiert, aber keine vollständige Behebung von P34. |
| P35 – Gehaltsmigration | **teilweise** | Schema 13 mit Anna 1.800 € und „Gehalt Partnerin“ 1.800 €: Budget bleibt **1.800 € statt früher 3.600 €**, `monthlyNetIncome` bleibt erhalten. Zuordnung zu einem vorhandenen Posten ändert die Budgetsumme nicht. | Zuordnung ist bei mehreren passenden Personen nicht eindeutig: P61. Haushaltskarte behauptet beim offenen Altgehalt fälschlich eine Budgetquelle: P62. |
| P36 – Teilzeitmigration | **teilweise** | Alter 48 und Anteil 50 % bleiben als Originalfelder erhalten. Der unabhängig gerechnete Verlauf bei Beginn 43 stimmt mit 5.600 € bei Alter 44 überein; auch die Rentenpunkte folgen der exakten Grenze. | Umstellung auf eine schon aktuelle Phase verschiebt den Gehaltsbezug und widerspricht der Vorschau: P56. Unverändertes Phasen-Sheet entfernt gültige Beitragsfaktoren: P59. Ein im alten Schema zulässiges Beginnalter 0 lädt nicht mehr: P60. |
| P37 – alte Kinderjahrgänge | **teilweise** | 2019,5 lädt ohne Fehler und bleibt unverändert unter `unresolvedChildBirthYears`. Beim ersten Schreiben eines aus dem Speicher geladenen älteren Dokuments wird das Original bytegenau gesichert. Fehler beim Sichern beziehungsweise Schreiben verändern das gespeicherte Hauptdokument nicht. | Gemischte Jahrgänge verändern die Kinderzahl: P57. Mehrfache Klärung desselben an zwei Depots hinterlegten Kindes erzeugt zusätzliche Kinder: P58. Die Originalsicherung beim Import einer alten Datei hat einen engeren Geltungsbereich als die allgemeine Formulierung der Dokumentation; siehe Abschnitt 4. |
| P38 – historische Kursübernahme | **behoben** | Ursprünglicher Fall A.DE → B.DE: erneuter Abruf; **10 × 50 = 500 € aus B.DE**, kein Überschreiben mit 1.000 € aus A.DE. Mengenänderung während der Rückfrage führt zu erneuter Bestätigung; Abbruch erhält den geänderten Stand. | Geprüfter Umfang: Instrument-/Mengen-/Wertänderungen, begrenzte Wiederholungen, parallele Aufrufe, externer Store plus Reload und Fehler beim Speichern. Kein Fehler der neuen Schutzlogik reproduziert. Die bekannten fachlichen Kursprobleme P39 ff. sind ausdrücklich außerhalb dieser Bewertung. |

### Qualität der neuen Regressionstests

Die neuen Tests sind überwiegend sinnvoll: Einkommen bleibt erhalten, Grenzen werden bewahrt, Sollwerte sind durch einfache Arithmetik hergeleitet. Die Änderung der früheren Erwartungen für Gehalts- und Teilzeitmigration ist durch die ursprünglichen Befunde begründet; sie ist keine bloße Anpassung an beliebige neue Ergebnisse.

Die aktuellen Tests wurden zusätzlich mit **altem `index.html` und altem `data-store.js` aus 1b57aa8** in einer Kopie unter `/tmp/followup-old-target` ausgeführt:

```sh
git show 1b57aa8:index.html > /tmp/followup-old-index.html
git show 1b57aa8:data-store.js > /tmp/followup-old-store.cjs
# Nur unter /tmp: Testdateien, Harness und Module kopieren;
# dort index.html/data-store.js durch die beiden alten Dateien ersetzen.
node --test /tmp/followup-old-target/.tests/data-safety.test.cjs \
  /tmp/followup-old-target/.tests/quote-history.test.cjs
```

Ergebnis: **31 Tests, 11 bestanden, 20 fehlgeschlagen**. Acht bestandene Tests sind bereits vorhandene Kurskontrollen; drei neue Kontrollen bestehen auch am alten Stand: eindeutig passendes Gehalt, Export-/Import-Wiederholbarkeit und atomarer Kurs-Speicherfehler. Das ist für Kontrolltests richtig. Die P34-Tests scheitern am alten Stand bereits an `store.ready is not a function`; damit allein ist der alte numerische Verlustfall nicht ausgeführt. Die ursprüngliche kontrollierte Verschachtelung wurde deshalb separat wiederholt. Ohne Locks beziehungsweise bei abgelehnten Locks liefert sie auch jetzt nur `{safetyPercent:90}`; die zwischenzeitlich gesetzte Inflation 3 geht verloren.

Der simulierte Browser in `data-safety.test.cjs` liefert Storage-Ereignisse **synchron** und modelliert weder bfcache noch offene App-Sheets während einer Promotion. Der normale Browser verarbeitet diese Abläufe anders. Die neuen Fehler P54/P63 können durch dieses Modell deshalb nicht erkannt werden. Für die nächste Runde sind echte Browser-Lebenszyklustests und ein Entwurf mit eigener Basisrevision notwendig.

## 3. Neue Befunde ab P54

| ID | Schwere | Bereich | Kurztitel |
| --- | --- | --- | --- |
| P54 | hoch | Schreibübernahme | Offener Leserentwurf überschreibt den übernommenen aktuellen Stand |
| P55 | mittel | Schreibsperre | Fehler und ausbleibende Antworten können Erwerb/Übernahme dauerhaft hängen lassen |
| P56 | hoch | Teilzeit-Klärung | Umstellung „ab heute“ widerspricht der Vorschau und erhöht das Einkommen |
| P57 | hoch | Kinder-Migration | Gültiger und vorläufiger Jahrgang desselben Jahres werden zu einem Kind zusammengezogen |
| P58 | hoch | Kinder-Klärung | Dasselbe an zwei Depots erfasste Kind wird beim Klären verdoppelt |
| P59 | mittel | Phasen-Sheet | Gültiger Beitragsfaktor einer Person mit alter Teilzeit geht beim No-op-Speichern verloren |
| P60 | mittel | Schema-Kompatibilität | Im alten Schema gültiger Teilzeitbeginn 0 blockiert das Laden |
| P61 | mittel | Gehaltsmigration | Mehrdeutiger Personenbezug wird abhängig von der Listenreihenfolge zugeordnet |
| P62 | niedrig | Haushaltskarte | Unzugeordnetes Altgehalt wird fälschlich als „aus dem Budget“ bezeichnet |
| P63 | mittel | Browser-Lebenszyklus | Nach Navigation bleibt die Schreibsperre belegt, bis der alte Tab zurückkehrt |

### Gemeinsamer Vorspann für die Reproduktionen

Die JavaScript-Blöcke verwenden ausschließlich die echte Rechenlogik im bestehenden Harness und `MemoryStorage`. Aus dem Projektverzeichnis starten; Skripte unter `/tmp` speichern. Standarddatum: 08.10.2026, eigene Person Januar 1985, Alter 41,75. Rendite, Inflation und Abzüge sind standardmäßig 0. Jahresstände 42/43/44 enthalten 3/15/27 Monate ab Oktober 2026.

```js
const Data = require(process.cwd() + '/data-store.js');
const {fixture, context, simulate, MemoryStorage} =
  require(process.cwd() + '/.tests/forecast-fixture.cjs');
const set = (a,k,v) => {
  a.context.reviewValue=v;
  a.run(`appStorage.setItem('${k}',JSON.stringify(reviewValue))`);
};
function salary(a,n=600) {
  set(a,'budgetData',{
    einkommen:[{id:'salary',name:'Gehalt Anna',kind:'income',person:'p1',values:Array(12).fill(n)}],
    fixe:[],variable:[],sparen:[],accounts:{},standingOrders:[]
  });
}
function oldChildren(years,count=1) {
  const d=fixture(undefined,{saveUntilAge:60,retirementAge:60,pensionStartAge:67,planningHorizonAge:90});
  d.schemaVersion=12;
  d.retirement.pensionDepots=Array.from({length:count},(_,i)=>({
    id:'d'+i,name:'Depot '+i,personId:d.retirement.primary.id,
    monthlyContribution:150,childBirthYears:years
  }));
  return d;
}
const loaded = d => Data.createStore(new MemoryStorage({[Data.KEY]:JSON.stringify(d)})).document();
```

### P54 – Offener Entwurf überschreibt nach Promotion fremde Änderungen

**Ort:** [data-store.js:878](</Users/lukasthielen/Documents/Claude/Assets App/data-store.js:878>) (`onPromote`, bedingungsloses `adopt` bei neuer Revision), [index.html:7213](</Users/lukasthielen/Documents/Claude/Assets App/index.html:7213>) (Writer-Wechsel), [index.html:11435](</Users/lukasthielen/Documents/Claude/Assets App/index.html:11435>) (Speichern der vorhandenen Sheet-Werte).

**Reproduktion in zwei echten Chrome-Tabs auf Port 8124:**

1. In einer zuvor leeren Testherkunft `http://127.0.0.1:8124/index.html` die Demo laden. A schreibt, B zeigt „Nur ansehen“.
2. B öffnet Prognose → Vorruhestand. Im geöffneten Sheet steht Bedarf 3.200 €. Ein probeweises Speichern von 3.500 € wird zunächst korrekt mit `READ_ONLY` abgelehnt; das Feld anschließend wieder auf 3.200 setzen.
3. A öffnet dasselbe Sheet, speichert **4.000 €** und schließt danach den Tab. Die neue Annahme ist vor dem Schließen sichtbar; Entnahme der Demo steigt von 1.275 auf 2.075 €/Monat.
4. B übernimmt automatisch. Der Lesemodus-Hinweis verschwindet; das alte Sheet enthält weiter 3.200 €.
5. B speichert diesen alten Entwurf. Die App meldet **„Gespeichert“**, keinen Konflikt. Erneutes Öffnen bestätigt **3.200 €**; Entnahme ist wieder 1.275 €/Monat.

**Erwartet / tatsächlich:** Der seit Öffnen des Entwurfs geänderte Wert 4.000 € bleibt erhalten, oder B erhält eine Konfliktentscheidung. Tatsächlich wird er still um **800 €/Monat** zurückgesetzt. Zusätzlicher deterministischer Harness-Test mit exklusiven Mock-Locks: vor dem Speichern ist der Store von B bereits bei 4.000, sein Feld bei `3.200`; danach gespeicherter Wert 3.200, `error:null`, `writer:true`.

**Ursache:** Promotion lädt den neuen Stand und aktualisiert `lastRaw`, auch wenn im lesenden Fenster ein Sheet offen ist. Damit sieht der spätere Commit keine abweichende Speicherrevision mehr. Die Eingaben gehören aber noch zur alten Revision. Die Schreibsperre serialisiert Writer, ersetzt keine Konfliktprüfung des Entwurfs.

**Behebung:** Basisrevision beim Öffnen/Beginn jeder Bearbeitung festhalten und beim Speichern prüfen. Nach einer Promotion offene Entwürfe nicht still auf eine neue Basis setzen; sichtbar abgleichen oder ablehnen. Alternativ im Leser zunächst echte Bearbeitung verhindern und beim Übergang sämtliche editierbaren Ansichten neu aus dem aktuellen Stand aufbauen, ohne vorhandene Eingaben unbemerkt zu verwerfen.

**Regression:** `reader draft retains its original revision when promoted`: obiger Chrome-Ablauf und atomare Harness-Reproduktion; A=4.000 bleibt, B muss neu abgleichen. Auch Daten-Bearbeiten-Modus, Budget-, Kredit- und Migrations-Sheets prüfen.

### P55 – Sperrfehler enden nicht in einem abschließenden, wiederherstellbaren Zustand

**Ort:** [data-store.js:783](</Users/lukasthielen/Documents/Claude/Assets App/data-store.js:783>) (`take`, innere `wait.then` ohne Fehlerpfad), [data-store.js:795](</Users/lukasthielen/Documents/Claude/Assets App/data-store.js:795>) (`queue`, fehlendes Catch), [data-store.js:841](</Users/lukasthielen/Documents/Claude/Assets App/data-store.js:841>) (`request`, unbefristetes Warten auf `readyPromise`).

**Reproduktion A – Quota bei der Erstübernahme alter Schlüssel:**

```js
(async()=>{
  const errors=[],capture=e=>errors.push(e.message);
  process.on('unhandledRejection',capture);
  const st=new MemoryStorage({'lt-inflation':'2'}); st.failWrites=true;
  const s=Data.createStore(st,{locks:{request:(name,opts,cb)=>cb({name})}});
  let ready=false; s.ready().then(()=>ready=true);
  await new Promise(r=>setTimeout(r,30));
  st.failWrites=false;
  await new Promise(r=>setTimeout(r,20));
  console.log({state:s.writerState(),canWrite:s.canWrite(),ready,errors,
    original:st.getItem('lt-inflation'),document:st.getItem(Data.KEY)});
  process.removeListener('unhandledRejection',capture);
})();
```

**Erwartet / tatsächlich A:** Verständlicher Speicherfehler, freigegebene Sperre und ein erneuter Versuch nach Beseitigung der Quota-Ursache. Tatsächlich `state:'pending'`, `canWrite:false`, `ready:false`, unbehandelte Ablehnung `Quota exceeded`; Originalschlüssel bleibt `2`, Hauptdokument bleibt `null`. Auch nach wieder möglichem Schreiben erfolgt keine Erholung. Der äußere Lock-Halte-Promise bleibt offen. Der 3-s-App-Rückfall macht daraus eine sichtbare App im Lesemodus, repariert den Erwerb aber nicht.

**Zusätzliche reproduzierte Pfade:** Liefert der erste `ifAvailable`-Aufruf `null` und wird der danach eingereihte Lock-Aufruf abgelehnt, bleibt der Store `reader` und produziert `queued request denied` als unbehandelte Ablehnung. Antwortet der erste Aufruf überhaupt nicht, bleibt `requestWrite()` über eine auf **20 ms** gesetzte Requestfrist hinaus offen (nach 80 ms noch `pending`): Die Frist beginnt erst nach dem unbegrenzten `await readyPromise`. Diese Fälle wurden mit kontrollierten Lock-APIs geprüft, nicht durch Manipulation eines produktiven Browser-Speichers.

**Ursache:** Fehler aus `onPromote`, der Erstübernahme oder `mark()` erreichen den äußeren Promise-/Freigabepfad nicht. Einreihen und anfängliches Warten haben ebenfalls keinen vollständigen Fehler-/Timeoutabschluss.

**Behebung:** Erwerb, Promotion und Freigabe gemeinsam mit `try/catch/finally` absichern. Bei Fehler Sperre freigeben, `ready()` abschließen, Original erhalten und Wiederholen erlauben. Die Gesamtfrist der Übernahme muss auch das anfängliche Warten umfassen. Den Rückfall auf ungesichertes Schreiben nicht als Fehlerbehandlung verwenden.

**Regression:** `writer gate recovers from initial quota, rejected queue and unanswered request`: keine unbehandelten Ablehnungen, keine zurückbleibende Lock-Haltung, begrenzte Wartezeit und erfolgreicher kontrollierter Wiederholungsversuch.

### P56 – Umstellung auf Teilzeit „ab heute“ berechnet das Gegenteil der Vorschau

**Ort:** [index.html:9364](</Users/lukasthielen/Documents/Claude/Assets App/index.html:9364>) (`_partTimePreview`), [index.html:9374](</Users/lukasthielen/Documents/Claude/Assets App/index.html:9374>) (`_convertPartTime`), heutiger Gehaltsbezug [index.html:8904](</Users/lukasthielen/Documents/Claude/Assets App/index.html:8904>).

**Reproduktion:** 20.000 € Cash, eigener Vorruhestand bereits begonnen, Bedarf 1.000 €/Monat. Anna Januar 1985, Gehalt 600 €, arbeitet bis 44, alte Teilzeit 50 % ab 43. Umstellung auf Phase 1 = ab heute.

```js
const d=fixture([{id:'cash',group:'Cash',cat:'cash',value:20000}],
  {monthlySpending:1000,pensionSpending:1000,pensionStartAge:50});
d.schemaVersion=14;
d.retirement.people=[{id:'p1',name:'Anna',birthYear:1985,workUntilAge:44,
  partTimeFromAge:43,partTimePercent:50,statutoryPension:{}}];
const a=context(loaded(d)); salary(a);
console.log('vorher',simulate(a).total);
console.log('Vorschau',a.json("_partTimePreview('p1',1)"));
a.run("_convertPartTime('p1',1)");
console.log('nachher',simulate(a).total);
```

**Erwartet / tatsächlich:** Vorher korrekt mit Alter 44: **20.000 − 15 × 400 − 12 × 700 = 5.600 €**. Die Vorschau kündigt 15 Monate frühere Teilzeit und **−4.500 € Einkommen** an. Dafür müssten alle 27 Monate nur 300 € Gehalt zählen: **20.000 − 27 × 700 = 1.100 €**, also genau 4.500 € weniger als vorher. Tatsächlich nach Umstellung **9.200 €**, somit **3.600 € mehr** als vorher; 600 € Gehalt laufen weiterhin bis 44.

**Ursache:** Die Umstellung setzt den aktuellen Arbeitsanteil auf 50 %, lässt Budget-/Altgehalt und Brutto aber unverändert. Das Modell interpretiert das unveränderte Gehalt danach als heutigen Teilzeitbetrag und teilt künftige Arbeitsanteile durch den neuen Referenzanteil 0,5. Die Vorschau unterstellt dagegen, 600 € blieben die bisherige Vollzeitbasis.

**Behebung:** Der Umstellungsablauf muss die Gehaltsbasis ausdrücklich und konsistent übertragen. Beispielsweise alten Referenzanteil bewahren oder Budget-/Alt-Netto und Brutto erst nach transparenter Bestätigung anpassen. Vorschau aus dem tatsächlich entstehenden vollständigen Plan rechnen; keine alleinige Grenzverschiebungsformel verwenden.

**Regression:** `conversion to a current phase agrees with income preview`: im obigen Szenario Vorschau und Simulation beide −4.500 €, Endbestand 1.100 € bei entsprechender Basisentscheidung. Auch aktuelle Phase 2/3, schon laufende Teilzeit und Brutto/Rentenpunkte prüfen.

### P57 – Gemischte Kinderjahrgänge verlieren ein Kind in der Zulagenrechnung

**Ort:** [index.html:9468](</Users/lukasthielen/Documents/Claude/Assets App/index.html:9468>) (`_openChildKids`), insbesondere Abzug bereits erfasster Kinder ab Zeile 9476.

**Reproduktion:** Ein altes Depot enthält zwei Einträge `[2019,2019.5]`.

```js
const a=context(loaded(oldChildren([2019,2019.5])));
console.log(a.json('getChildren()'));
console.log(a.json('getAvDepots()'));
console.log(a.json('avdYear(getLifetimeSettings(),getAvDepots()[0],2027)'));
```

**Erwartet / tatsächlich:** Die ausdrücklich beibehaltene alte Regex-Auswertung findet in `"2019, 2019.5"` **zwei** Jahrgänge 2019. Auch der tatsächliche alte `_avdParams` aus 7504901 wurde dazu im Harness ausgeführt und liefert `[2019,2019]`. Bei 1.800 € Eigenbeitrag verlangt das beibehaltene aktuelle Fördermodell zwei Kinder: **600 € Kinderzulage, insgesamt 1.140 €** inklusive 540 € Grundzulage. Tatsächlich migriert ein gültiges Kind und ein offener Eintrag; gezählt wird nur **ein Kind, 300 € Kinderzulage, insgesamt 840 €**. Es fehlen **300 €/Jahr**. Die alte allgemeine Förderformel wird damit nicht neu bewertet; geprüft ist die behauptete Erhaltung der Kinderzahl.

**Ursache:** `_openChildKids` ermittelt die Höchstzahl ausschließlich aus den offenen Einträgen und zieht davon die vorhandenen gültigen Kinder ab. Bei einem gültigen plus einem offenen Eintrag ergibt sich `1 − 1 = 0` zusätzliche Kinder, statt insgesamt zwei.

**Behebung:** Gültige und vorläufige Einträge je ursprünglichem Depot gemeinsam zählen und erst danach über Depots abgleichen. Informationen über die ursprüngliche Zusammengehörigkeit erhalten, statt unterschiedliche Datenteile über die Jahreszahl allein zusammenzuführen.

**Regression:** `mixed valid and unresolved child years retain total child count`: `[2019,2019.5]` → zwei für die bisherige Zulagenrechnung; zusätzlich Zwillinge, mehrere Depots und unterschiedliche Eltern prüfen.

### P58 – Klärung zweier Depotverweise erzeugt ein zusätzliches Kind

**Ort:** [index.html:9387](</Users/lukasthielen/Documents/Claude/Assets App/index.html:9387>) (`_resolveChildYear`, bedingungsloses `kids.push`).

**Reproduktion:** Zwei Depots derselben Person tragen jeweils `[2019.5]`. Nach der Migration zählen sie nach der neuen gemeinsamen Logik zusammen als ein vorläufiges Kind. Beide Einträge werden nacheinander als Jahrgang 2019 geklärt:

```js
const a=context(loaded(oldChildren([2019.5],2)));
const show=()=>a.json('({children:getChildren(),subsidies:getAvDepots().map(d=>avdYear(getLifetimeSettings(),d,2027))})');
console.log('vorher',show());
a.run("_resolveChildYear('d0',2019.5,2019)"); console.log('erste Klärung',show());
a.run("_resolveChildYear('d1',2019.5,2019)"); console.log('zweite Klärung',show());
```

**Erwartet / tatsächlich:** Wenn beide Verweise dasselbe Kind meinen, bleibt nach Klärung ein Kind; eine abweichende Entscheidung für ein zweites Kind muss ausdrücklich angeboten werden. Vorher: ein Kind, Haushalt insgesamt **300 € Kinderzulage**. Nach erster Klärung weiter ein Kind. Nach zweiter Klärung **zwei Kinderobjekte, 600 € Kinderzulage**; Gesamtzulage steigt von **840 auf 1.140 €/Jahr**. Die automatische Kindergeldrechnung zählt anschließend ebenfalls zwei Kinder, **518 statt 259 €/Monat**. Das sind zusätzliche gespeicherte Personen, nicht der bereits offene Prognosebefund P40/P41.

**Ursache:** Die vorläufige Rechnung führt Depotverweise zusammen, die Klärung behandelt jeden Verweis als neue Person. Es gibt keine Auswahl eines bereits geklärten Kindes. Die Vorschau zeigt nur „Kind Jahrgang 2019“, nicht die Veränderung der Haushalts-Kinderzahl und sämtlicher Zahlungen.

**Behebung:** Depotverweise auf ein gemeinsames vorläufiges Kind abbilden. Im Dialog vorhandenes Kind zuordnen oder ausdrücklich neues Kind anlegen; Zwillinge müssen dabei weiterhin möglich sein. Vorher-/Nachher-Anzeige muss Kinderzahl, Kindergeld und Zulagen enthalten.

**Regression:** `resolving a repeated depot child reference does not create a duplicate person`: beide Verweise auf dasselbe Kind → eine Person und 300 € Kinderzulage; ausdrückliche Auswahl „weiteres Kind“ → zwei Personen.

### P59 – Unverändertes Phasen-Sheet entfernt Beitragsfaktoren

**Ort:** [index.html:11242](</Users/lukasthielen/Documents/Claude/Assets App/index.html:11242>) (alte Teilzeitperson aus `adults` ausgeschlossen), [index.html:11248](</Users/lukasthielen/Documents/Claude/Assets App/index.html:11248>) (dieselbe Liste für Altersvorsorge), [index.html:11333](</Users/lukasthielen/Documents/Claude/Assets App/index.html:11333>) (alle Phasenfelder löschen und nur vorhandene Eingaben zurückschreiben).

**Reproduktion:** Gültiges Schema-16-Dokument: Anna hat alte Teilzeit ab 48, 50 %, und zusätzlich `phase2PensionPercent:50`. Ein Depot beträgt 150 €/Monat. Die Kombination ist erlaubt; ausgeschlossen sind nur Arbeitszeit-Phasenwerte, nicht Altersvorsorgewerte. Alle tatsächlich erzeugten Inputwerte werden unverändert in die Harness-DOM übernommen:

```js
const d=fixture(undefined,{saveUntilAge:50,retirementAge:60,pensionStartAge:67,monthlySpending:3000});
d.retirement.people=[{id:'p1',name:'Anna',birthYear:1985,workUntilAge:67,
  partTimeFromAge:48,partTimePercent:50,phase2PensionPercent:50,statutoryPension:{points:12}}];
const a=context(d);
set(a,'lt-av-depots',[{id:'d1',name:'Anna depot',person:'p1',contrib:150,from:65}]);
const own=()=>a.json('avdYear(getLifetimeSettings(),getAvDepots()[0],2036).own');
console.log('vorher',own());
a.run('renderLifetimePageCalcs=()=>{};openPhasesSheet()');
const body=a.el('dsBody').innerHTML;
for(const m of body.matchAll(/<input\b[^>]*>/g)){
  const id=m[0].match(/\bid="([^"]+)"/),v=m[0].match(/\bvalue="([^"]*)"/);
  if(id)a.el(id[1]).value=v?v[1]:'';
}
a.run('_savePhasesSheet()');
console.log('nachher',own(),a.json('getDrvExtra()[0]'));
```

**Erwartet / tatsächlich:** Unverändertes Speichern behält 50 % und damit **900 €/Jahr** Eigenbeitrag in Phase 2. Tatsächlich fehlt das Altersvorsorgefeld schon beim Öffnen, `pen2` wird beim Speichern gelöscht und der Beitrag wird **1.800 €/Jahr**. Die alte Teilzeitgrenze selbst bleibt erhalten. Dies ist ein neu eingeführter Feldverlust, nicht die bekannte Cent-Rundung P51.

**Ursache:** Arbeitszeit und Altersvorsorge teilen eine gefilterte Erwachsenenliste. Der Save-Pfad unterscheidet „Feld nicht vorhanden“ nicht von „Nutzer hat ein vorhandenes Feld geleert“.

**Behebung:** Separate Listen für Arbeitszeit- und Beitragsfelder. Beitragswerte auch für alte Teilzeitprofile bearbeiten und erhalten; nicht dargestellte gültige Felder bei einem Save grundsätzlich behalten.

**Regression:** `unchanged legacy-part-time phase sheet preserves pension percentages`: die obigen 50 % und 900 € bleiben erhalten; auch `pen3`/`pen4`, 0 % und 200 % prüfen.

### P60 – Alte gültige Teilzeit ab Alter 0 ist nicht mehr ladbar

**Ort:** [data-store.js:628](</Users/lukasthielen/Documents/Claude/Assets App/data-store.js:628>) (neue Prüfung `partTimeFromAge > 0`), vor der Migration in `load` ab Zeile 863.

**Reproduktion:**

```js
const d=fixture(); d.schemaVersion=14;
d.retirement.people=[{id:'p1',name:'Anna',birthYear:1985,workUntilAge:67,
  partTimeFromAge:0,partTimePercent:50,statutoryPension:{}}];
try { loaded(d); } catch(e) { console.log(e.message); }
```

Der Validator aus 1b57aa8 wurde separat auf genau dieses Dokument angewendet und akzeptiert es: `Old.validate(d) === true`.

**Erwartet / tatsächlich:** Ein altes zulässiges Dokument erhält einen ladefähigen, nachvollziehbaren Übergang. Die neue Version bricht schon vor der Migration mit **`Teilzeit ab: Alter erwartet`** ab. Keine gespeicherte Änderung wurde dabei beobachtet. Alter 0 ist ein Randwert; der Befund betrifft die Kompatibilität des ganzen Dokuments, nicht die Behauptung einer realistischen Arbeitsplanung ab Geburt.

**Ursache:** Neue Wertebereichsprüfung gilt auch für alte Schemas. Das Original kann die in P37 vorgesehene Klärung damit nicht erreichen.

**Behebung:** Alte Zulässigkeit zunächst prüfen und einen kompatiblen beziehungsweise expliziten Klärungspfad anbieten. Wenn 0 die bereits laufende Teilzeit ausdrücken soll, diese Bedeutung bestätigen lassen; nicht den ganzen Haushalt durch die neue Prüfung blockieren.

**Regression:** `formerly valid schema14 zero boundary has a recoverable migration`: Original bleibt erhalten und erreichbar; neue Eingaben dürfen weiterhin strengere Bereichsregeln haben.

### P61 – Gehaltszuordnung ist zwischen Personen nicht eindeutig

**Ort:** [data-store.js:710](</Users/lukasthielen/Documents/Claude/Assets App/data-store.js:710>) (`moveNetIncome`, Zuordnung während der Personeniteration).

**Reproduktion:** Schema 13 enthält zwei Erwachsene mit gleichem Namen Anna, unterschiedlichen IDs/Arbeitsenden, je 600 € Altgehalt. Im Budget gibt es einen freien Posten „Gehalt Anna“ mit 600 €.

```js
const d=fixture(undefined,{saveUntilAge:50,retirementAge:60,pensionStartAge:67});
d.schemaVersion=13;
d.retirement.people=[43,60].map((until,i)=>({id:'p'+(i+1),name:'Anna',birthYear:1985,
  workUntilAge:until,monthlyNetIncome:600,statutoryPension:{}}));
d.budget={items:[{id:'salary',name:'Gehalt Anna',category:'einkommen',subcategory:'',
  kind:'income',targetGroupId:null,monthlyAmounts:Array(12).fill(600)}],standingOrders:[]};
console.log(loaded(d).budget.items[0].personId);
d.retirement.people.reverse();
console.log(loaded(d).budget.items[0].personId);
```

**Erwartet / tatsächlich:** Mehrdeutiger Personenbezug bleibt unzugeordnet und muss geklärt werden. Tatsächlich Reihenfolge vorwärts **p1**, rückwärts **p2**. Das zugehörige Altgehalt wird jeweils entfernt. Budgetsumme bleibt korrekt 600 €; betroffen ist dessen fachlicher Eigentümer und damit, ob der Budget-Cashflow schon mit Arbeitsende 43 oder erst mit 60 sinkt. Der Test entscheidet nicht, welchem Erwachsenen der Posten wirklich gehört; genau diese Information fehlt.

**Ursache:** Eindeutigkeit wird nur als „ein passender Posten für diese Person“ geprüft, nicht als eindeutige Verbindung zwischen allen Personen und allen Posten. Ein früherer Schleifendurchlauf nimmt späteren Kandidaten den Posten weg.

**Behebung:** Kandidaten zunächst für sämtliche Personen ermitteln. Nur eine beidseitig eindeutige Verbindung automatisch übernehmen; kollidierende Namen/Beträge zur Klärung erhalten. Auch Teilnamen wie Ann/Anna berücksichtigen.

**Regression:** `salary migration is order independent for ambiguous household names`: Umkehr der Personenliste ändert keine automatische Zuordnung; beide Originalbeträge bleiben bis zur Entscheidung erhalten.

### P62 – Haushaltskarte bezeichnet offenes Altgehalt als Budgetgehalt

**Ort:** [index.html:9171](</Users/lukasthielen/Documents/Claude/Assets App/index.html:9171>) (`_personContextHTML`, unbedingter Quelltext).

**Reproduktion:** Schema 13 ohne Budget, Anna 600 € Altgehalt, Arbeit bis 44. Nach Migration:

```js
const d=fixture(); d.schemaVersion=13;
d.retirement.people=[{id:'p1',name:'Anna',birthYear:1985,workUntilAge:44,
  monthlyNetIncome:600,statutoryPension:{}}];
const a=context(loaded(d));
console.log(a.json('loadBudgetData()'));
console.log(a.json("_personContextHTML('p1')"));
```

**Erwartet / tatsächlich:** Klarer Hinweis „aus früherer Version, noch nicht im Budget zugeordnet“. Tatsächlich `loadBudgetData() === null`, aber die Karte zeigt **„Gehalt 600 €/Monat bis 44 · aus dem Budget“**. Das betrifft auch den englischen Text „from the budget“. Die Rechnung selbst behält das Gehalt in diesem geprüften Fall korrekt bei.

**Ursache:** Die neue Unterscheidung `netInBudget` wird für den Cashflow verwendet, nicht für den Quelltext der Haushaltskarte.

**Behebung:** Quelle anhand derselben Unterscheidung darstellen und direkt zur Zuordnung verlinken.

**Regression:** `pending legacy salary context states its actual source`: ohne Budget keine Behauptung „aus dem Budget“; nach Zuordnung korrekte Budgetquelle, deutsch und englisch.

### P63 – Navigation lässt die Sperre ohne erreichbaren Besitzer belegt

**Ort:** [data-store.js:838](</Users/lukasthielen/Documents/Claude/Assets App/data-store.js:838>) (`leave`, nur Marke, keine Auflösung des Lock-Halte-Promise), [index.html:7185](</Users/lukasthielen/Documents/Claude/Assets App/index.html:7185>) (`pagehide`).

**Reproduktion in Chrome, dieselbe Demo-Testherkunft:**

1. Zwei Tabs A/B. B fordert „Edit here“ an, A ist nicht beschäftigt: B erhält erfolgreich das Schreibrecht, A wird Leser.
2. B navigiert vollständig von `index.html` zu `http://127.0.0.1:8124/demo_backup.json`. Die Ziel-URL und die JSON-Seite wurden vor dem nächsten Schritt sichtbar bestätigt; es handelt sich nicht um eine noch laufende Navigation.
3. A bleibt „View only“. „Edit here“ endet nach der Requestfrist mit **„The other window does not respond. Please close or reload it and try again.“**
4. Erst B → Zurück zur App löst die wartende Übergabe aus: B zeigt Leserstatus, A kann wieder schreiben.

**Erwartet / tatsächlich:** Ein Dokument, das beim Navigieren die App verlässt, gibt seine Lock-Haltung kontrolliert frei; ein Rückkehrer muss das Recht neu erwerben. Tatsächlich kann der verbleibende App-Tab während der Abwesenheit nicht übernehmen. Die wiederholte Anforderung ist zeitlich begrenzt, jedoch nur durch Rückkehr beziehungsweise Schließen des anderen Tabs erfolgreich. Datenverlust wurde in diesem Test nicht beobachtet.

**Ursache:** `leave()` schreibt `released`, hält intern aber weiter `state:'writer'` und den Lock-Promise. Es verlässt sich auf die Vernichtung des Dokuments. Das beobachtete Verhalten passt zu einem im bfcache erhaltenen Dokument mit verzögerten Ereignissen; **`pagehide.persisted` wurde nicht ausgelesen, dieser konkrete Browsermechanismus bleibt ein Verdacht**. Bestätigt ist der oben beschriebene Blockadeablauf und die fehlende explizite Freigabe.

**Behebung:** Eigenen Suspend-/Resume-Pfad für `pagehide`/`pageshow` implementieren. Beim Suspend Lock tatsächlich freigeben und nicht sofort wieder einreihen; beim Resume erneut erwerben, Stand laden und offene Entwürfe mit ihrer alten Revision behandeln (P54). Eine reine Abgabe-Marke reicht nicht.

**Regression:** `navigation and bfcache restore never leave an unreachable writer owner`: echter Chrome-Test mit Navigation, vollständig bestätigter Zielseite, Übernahme im anderen Tab und Rückkehr. Zusätzlich `persisted:true` erfassen und prüfen, dass zu keinem Zeitpunkt zwei Writer entstehen.

## 4. Geprüft ohne Befund und Grenzen des Nachweises

### Suite, Audit und Dateiversionen

```sh
node --test .tests/
node .scripts/audit-forecast.cjs
```

**283/283 bestanden**, rund 1,95 s. Audit **22 Prüfungen, 0 Abweichungen**. Demo im festen Harness: letzter Stand 2026-10, Alter 41,75, Erfolg 100 %, sicher ab 52. Schema/Script-Versionen und Cache-Erhöhung sind in HTML und `sw.js` konsistent. Die Demo-Dateien bleiben unverändert auf Schema 15 und laden in Schema 16.

### Zwei unabhängige Handrechnungen

Alle Zahlen beziehen sich auf Nullrendite, Nullinflation und Nullabzug; Startcash 20.000 €.

| Fall | Eingaben | Rechnung und Soll mit 42 / 43 / 44 | Tatsächlich |
| --- | --- | --- | --- |
| Offenes Altgehalt | eigener Arbeitsstopp mit 43; Anna 600 €, Arbeit bis 44; kein Budget; Bedarf ab eigenem Stopp 1.000 € | bis 43 keine Entnahme; danach 12 × (1.000−600) = 4.800 €. **20.000 / 20.000 / 15.200 €** | identisch; `_incomeChange(...,42)=0`, `netInBudget=false` |
| Exakte alte Teilzeit | eigene Arbeit bereits beendet; Anna 600 €, ab 43 50 %, bis 44; Bedarf 1.000 € | 3 × 400; dann insgesamt 15 × 400; anschließend 12 × 700. **18.800 / 14.000 / 5.600 €** | identisch |

Beim zweiten Fall zusätzlich: Brutto 51.944 €, Durchschnittsentgelt 51.944 €, zwölf bisherige Punkte. Neue Punkte: **1,25 volle Jahre + 1 halbes Jahr = 1,75**, Gesamtpunkte **13,75**. `calcDrvExtra` liefert beide Werte exakt. Die Gehaltseinträge enden/beginnen am Alter 43: 600 €, danach 300 € bis 44. Der bestehende Zeitstrahl und die Kurztexte verwenden die exakte Grenze; die bekannte gleiche Farbe verschiedener Teilzeitanteile wurde nicht erneut bewertet.

### Migrationen, Sicherung und Transaktionen

Zusätzliche synthetische Fälle für Schemas **12, 13, 14, 15 und 16**: Export → Import des migrierten Dokuments jeweils identisch. Adapter-Updates bewahren Personen-, Altgehalts-, Teilzeit- und offene Kinderwerte. Bei Schemas ohne Depotliste kann eine optionale leere Liste hinzukommen; kein finanzieller Wert ging dadurch verloren. Text-/Schlüsselreihenfolge wurde getrennt von fachlichem Inhalt verglichen.

Gezielte Quota-Fälle: Fehler beim Schreiben von `vermoegen-data-v1-before-update` lässt das ursprüngliche Hauptdokument und den In-Memory-Stand unverändert. Erfolgreiche Originalsicherung und danach scheiterndes Hauptdokument-Schreiben lässt das Hauptdokument ebenfalls unverändert; die nützliche Originalsicherung bleibt erhalten. Ungültiges `unresolvedChildBirthYears:['x']`, ein nicht ganzes Klärungsjahr 2020,5 sowie widersprüchliche Arbeitszeitmodelle werden abgelehnt, ohne den Hauptstand zu ändern. Der Fehler P55 betrifft den **asynchronen initialen Erwerb**, nicht diese bereits korrekt abgefangenen normalen Commit-Fehler.

Die normalen Zuordnungs-/Klärungstransaktionen und Ablehnung ungültiger Werte sind durch die ausgeführte Suite belegt. Die reine Anzeige von Vorschauen schrieb im Harness nichts. Ein unveränderter vollständiger manueller Abbruch-Durchlauf sämtlicher neuer Migrations-Sheets konnte wegen des blockierten Browser-Dateiimports nicht durchgeführt werden; dazu wird keine vollständige Browserabdeckung behauptet.

**Einschränkung der Originalsicherung:** `createStore.load` hält den älteren gespeicherten Rohtext fest; dieser Pfad ist bytegenau geprüft. `importBackup(oldObject)` in einen bereits aktuellen Store setzt diese Rohtextinformation nicht neu: Im zusätzlichen Importfall blieb `backupBeforeUpdate() === null`. Der importierte alte Dateiinhalt ist typischerweise beim Nutzer vorhanden; es wurde hier kein Verlust dieser Datei festgestellt. Die Dokumentation sollte den Sicherungspfad auf „älteres Dokument aus dem lokalen Speicher“ begrenzen oder die zugesagte lokale Originalsicherung ausdrücklich auch beim Import ergänzen. Dies wird als Geltungsbereich der neuen Funktion festgehalten, nicht als weiterer Datenverlustbefund gezählt.

### Schreibrechte und Browser

Im simulierten exklusiven Lock-System funktionieren normaler Erwerb, Übergabe, `busy`, Schließen/Absturz, gleichzeitige Übernahmeanfragen und anschließende Speicherung. Bei zwei gleichzeitigen Anfragen erhält genau ein Fenster das Recht; das andere bleibt Leser und kann mit Timeout enden. Zusätzliche tatsächliche Prüfungen von `renameGroup` und `renamePosition` im lesenden Store liefern `READ_ONLY`; Speicher bleibt identisch. Transaktion, Import und Zurücksetzen im Leser werden durch die Suite abgelehnt. Erstübernahme alter Schlüssel erfolgt im Normalfall erst nach Writer-Erwerb.

Im echten Chrome wurde die zuvor leere Herkunft **127.0.0.1:8124** benutzt und ausschließlich die Demo geladen. Verifiziert: Leseranzeige, Ablehnung einer Bedarfsänderung, automatische Übernahme nach Schließen, freiwillige Übergabe im Leerlauf und englische `busy`-Meldung. Die kritischen Gegenbeispiele P54/P63 wurden ebenfalls im echten Browser beobachtet. Englische Sperrleiste, Übernahmebestätigung und Meldung über einen nicht antwortenden Besitzer sind in den besuchten Ansichten vollständig übersetzt. Auch der exakte neue `READ_ONLY`-Fehlertext ist im Wörterbuch vorhanden.

Eine zusätzliche Sichtprüfung im In-App-Browser auf **localhost:8124** zeigte die neuen Script-Versionen, aber keine Leserleiste zwischen dessen Tabs; daraus wurde keine Aussage über echte Chrome-Locks abgeleitet. Der verbindliche Mehrfenster-Nachweis erfolgte deshalb in Chrome. Der Server auf Port 8124 lief bereits; **Port 8123 wurde nicht benutzt**. Eigene Testtabs wurden abschließend geschlossen. Der vorhandene produktive `file://`-Tab wurde nicht geöffnet oder bedient.

**Browsergrenzen:** Der Import der synthetischen Datei `/tmp/followup-ui.json` scheiterte an der fehlenden Chrome-Erweiterungsberechtigung für Dateizugriff. Die Berechtigung wurde nicht erweitert. Die synthetischen Migrationsfälle wurden deshalb im Harness geprüft, die Browserabläufe mit der erlaubten Demo. Ein eigenes leeres Chrome-Profil für `file://` lässt sich mit den verfügbaren Browserwerkzeugen nicht erstellen; der `file://`-Start wurde in dieser Runde **nicht unabhängig bestätigt**. Der frühere Browserwerkzeug-Schutz gegen `file:` wurde nicht umgangen. Ebenso fehlen ein echter iPhone-PWA-Test und ein erzwungener Betriebssystem-Absturz. Die behaupteten Chrome-`file://`-Tests aus PROBLEME.md sind Nachweise des Implementierers, nicht dieses Reviews.

### P38: Zusätzliche Belastungsfälle ohne Befund

Über die sechs neuen Kurstests hinaus:

- Drei fortlaufende Mengenänderungen während dreier Bestätigungen: Funktion endet mit `false`, nach genau drei Rückfragen; Wert bleibt **20 €**, nur die absichtlich geänderte Stückzahl wird 4. Keine Endlosschleife.
- Zwei parallele Aufrufe mit einem Rückfrage-Stub, der den vorhandenen Dialog wie `_ask` schützt: Ergebnisse **`[true,false]`**, einmalige Übernahme **1 × 100 = 100 €**. Die echte `_ask`-Funktion lehnt einen zweiten gleichzeitig offenen Dialog ebenfalls ab.
- Ein anderer Store ändert während der Rückfrage die Stückzahl 1 → 10; nach dem Reload wird erneut gefragt. Ablehnung der zweiten Rückfrage endet mit `false`; **20 € bleibt erhalten, Stückzahl 10 bleibt erhalten**. Dies ist ein kontrollierter externer Store-/Reload-Test, kein zusätzlicher Browsertest der Kursprovider.
- Ursprünglicher Instrumentwechsel A.DE → B.DE: Abrufliste `['A.DE','B.DE']`, Ergebnis **500 €**, Stückzahl 10. Das Ergebnis stammt ausschließlich vom neuen Instrument.

### Leistung und Start

Demo auf dem verfügbaren Mac, Node 20, echter VM-Rechenkern, aufgewärmte Läufe, fünf Wiederholungen. Monte-Carlo und Suche jeweils einschließlich neuem Plan; 500 Monte-Carlo-Läufe. Keine DOM-/Chart- oder Netzwerkzeit:

| Operation | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| `buildPlan` | 7,10 ms | 7,45 ms | 8,08 ms |
| neuer Plan + Monte-Carlo | 98,97 ms | 104,21 ms | 130,85 ms |
| neuer Plan + `findRetireAge` | 391,25 ms | 398,69 ms | 459,82 ms |

Für die Demo bleibt die Rechenzeit unter einer Sekunde. Der erste Review lag bei ungefähr 6,6/101/392 ms; die Unterschiede rechtfertigen in diesem kleinen Vergleich keine Behauptung eines allgemeinen Performanceproblems. Ein kalter iPhone-Start oder eine Obergrenze für beliebig viele Personen/Depots wurde nicht gemessen.

Der App-Start mit nie aufgelöstem Lock-Promise wurde im Harness durch Abfangen der echten Timer geprüft: vor dem 3.000-ms-Timer kein `initApp`; nach Auslösen genau einmal `initApp` und Leseranzeige, auch wenn `ready` später endet. Damit funktioniert der definierte Start-Rückfall. Es ist kein Nachweis einer 3-s-Obergrenze für vollständiges Rendering, Netzwerk oder die spätere Übernahme; deren Fehlerpfad steht in P55.

### Dokumentation dieser Runde

Neue Schemaschlüssel, Versionsnummern, die grundsätzlich exakte Teilzeiterhaltung und die fehlende Garantie im Rückfall ohne Locks sind dokumentiert und im Code vorhanden. Die pauschalen Aussagen **„Eine Migration verändert nichts fachlich“** und **„rechnet wie in der früheren Version“** in [DATA_MODEL.md:570](</Users/lukasthielen/Documents/Claude/Assets App/.docs/DATA_MODEL.md:570>) sind durch P57 für gemischte Jahrgänge widerlegt. Die Vorher-/Nachher-Zusage zur Umstellung ist durch P56 widerlegt; die vollständige Datensicherheit durch P54. Diese Widersprüche gehören zu den jeweiligen neuen Befunden, werden nicht als zusätzliche Dokumentations-IDs gezählt. Alte veraltete Stellen aus P53 wurden auftragsgemäß nicht erneut gezählt.

## 5. Offene Entscheidungen mit Empfehlung

1. **Bearbeitung im Lesefenster:** Empfehlung: entweder tatsächlich schreibgeschützte Eingaben bis zur Übernahme oder Entwürfe mit eigener Basisrevision und einer expliziten Konfliktentscheidung. Ein stilles Aktualisieren des Stores genügt nicht. P54 hat Vorrang vor weiteren Funktionsänderungen.
2. **Browser ohne nutzbare Web Locks:** Empfehlung: standardmäßig geschützter Lesemodus mit klarer Erklärung oder ein nachweislich sicherer alternativer Speicherpfad. Der dokumentierte Rückfall auf P1 erhält das ursprüngliche Datenverlustrisiko. Ungesichertes Schreiben nicht automatisch als gleichwertigen Betriebsmodus darstellen.
3. **Teilzeit-Umstellung in die aktuelle Phase:** Empfehlung: die bisherige Gehalts-/Bruttobasis explizit erhalten oder eine verständliche Anpassung bestätigen lassen. Vorher-/Nachher aus beiden vollständigen Plänen berechnen, einschließlich Rentenpunkten und Budgetwirkung.
4. **Kinderidentität bei mehreren Depotverweisen:** Empfehlung: vorhandenes Kind zuordnen oder ausdrücklich ein weiteres Kind anlegen. Jahrgang allein ist keine Identität; Zwillinge und dasselbe Kind in zwei Verträgen müssen unterscheidbar bleiben.
5. **Originalsicherung beim Import:** Empfehlung: entweder auch den importierten alten Stand lokal sichern und den Umfang korrekt erläutern, oder die Funktion klar auf die Aktualisierung vorhandener lokaler Daten begrenzen. Die Sicherung darf nicht als allgemeine Garantie für sämtliche Importpfade beschrieben werden.

Empfohlene Reihenfolge der nächsten Umsetzung: **P54/P55/P63**, danach **P56/P59**, anschließend **P57/P58/P60/P61** und die kleine Textkorrektur P62. Danach diesen Block erneut unabhängig prüfen; P39–P53 bleiben für ihre eigene Runde.

## 6. Integrität und Wiederholbarkeit

Skripte und Logs ausschließlich unter `/tmp`, unter anderem:

- `/tmp/followup-original.cjs`: ursprüngliche Reproduktionen P34–P37.
- `/tmp/followup-lock-repros.cjs`: Promotion mit offenem Entwurf, Lock-Quota, gleichzeitige Anfragen, abgelehnte Locks.
- `/tmp/followup-repros-unchanged.cjs`: Kinderfälle, Teilzeit-Umstellung und unverändert aus dem gerenderten HTML befülltes Phasen-Sheet.
- `/tmp/followup-more.cjs`: zwei Handhaushalte, mehrdeutige Personenzuordnung, semantische Adaptervergleiche.
- `/tmp/followup-boundaries.cjs`: Startfrist, ausbleibende Lock-Antwort, Leser-Umbenennen und Quota nach erfolgreicher Originalsicherung.
- `/tmp/followup-quotes.cjs`: begrenzte Wiederholungen, parallele Aufrufe, externer Stand und neuer Instrumentabruf.
- `/tmp/review-followup-suite.log`, `/tmp/review-followup-audit.json`, `/tmp/followup-old-test-results.log`.

Die wesentlichen Reproduktionen sind im Bericht enthalten; temporäre Dateien sind ergänzende Nachweise. Vor Beginn wurden SHA-256-Prüfsummen der **82 vorhandenen Projektdateien außerhalb `.git`** erfasst. Der abschließende Vergleich ergab **0 Änderungen an diesen 82 Dateien**; als einzige neue Datei liegt `.docs/REVIEW_2026-10_FOLGE.md` vor. Die Änderungen von Claude bleiben unangetastet. Erster Review, App-Code, Tests, Daten, Demo und bestehende Dokumentation werden durch dieses Review nicht verändert; neu ist ausschließlich dieser Bericht. Keine Commits, Pushes oder Deployments.

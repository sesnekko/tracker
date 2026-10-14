# Unabhängiges Folge-Review 2: Schreibsicherheit, Entwürfe und Lebenszyklus

**Datum:** 14.10.2026. **Basis:** aktueller nicht committeter Arbeitsstand auf Commit `1b57aa83ae3ce57eb71c956bbd63ba869c258533`. Schema 17, `verm-v125`, `data-store.js?v=27`, `i18n-en.js?v=11`. Gegenprobe: `/tmp/assets-pre-p54/`.

Geprüft wurden P54, P55 und P63 aus `REVIEW_2026-10_FOLGE.md` sowie damit zusammenhängende Regressionen. Die Implementierer-Aussagen in PROBLEME.md und DATA_MODEL.md wurden als Behauptungen behandelt. Keine Umsetzung, kein iOS-Code, keine Änderung an vorhandenen Projektdateien. P39–P53 und P56–P62 bleiben außerhalb dieses Reviews offen; sie werden hier nicht erneut nummeriert.

## 1. Ergebnis

| Ausgangsbefund | Urteil | Nachweis und verbleibende Lücke |
| --- | --- | --- |
| **P54 – Leserentwurf überschreibt nach Übernahme** | **Teilweise behoben** | Der verbindliche 3.200→4.000-Fall ist im echten Chrome behoben. Auch eine echte eigene Änderung bleibt mit Vergleichswert erhalten. Der neue Abgleich schreibt jedoch einen Betrag auf das falsche Ereignis (P64), verliert Schalteränderungen (P66), vergisst eigene Einrichtungsangaben beim zweiten Konflikt (P67) und verliert Entwürfe bei fremdem Sprachwechsel (P68). |
| **P55 – Fehler und Fristen beim Erwerb** | **Teilweise behoben** | Die drei ursprünglichen Fehlerpfade – Quota bei Erstübernahme, abgelehnte Warteschlange und unbeantwortete erste Anfrage – sind behoben. Der neue `failed`-Pfad wird bei einem unlesbaren neueren Dokument aber umgangen. Bei einer noch vorgemerkten Erstübernahme kann dieses Dokument sogar überschrieben werden; auch eine Originalsicherung kann entfallen (P65). |
| **P63 – Navigation hält Sperre** | **Behoben im geprüften Umfang** | Vollständige Navigation zu `demo_backup.json` gibt in echtem Chrome die Bearbeitung an den anderen Tab ab; Zurück zeigt den alten Tab als Leser. Die automatisierten Lebenszyklus-, Verspätungs- und Konkurrenzfälle bestehen. Ein eigener Nachweis echter bfcache-Ereigniswerte, Safari/iPhone-PWA und tatsächlicher Browser-Freeze fehlt; siehe Abschnitt 6. |

**Neue Befunde: 5, davon 2 hoch und 3 mittel.** Keine Freigabe der gesamten Schreibsicherheit: P64 und P65 sind Datenintegritätsfehler und sollten vor dem nächsten fachlichen Ausbau korrigiert werden.

Pflichtläufe selbst ausgeführt:

- `node --test .tests/`: **309/309 bestanden**, 0 übersprungen, etwa **4,592 s**.
- `node .scripts/audit-forecast.cjs`: **22 Prüfungen, 0 Abweichungen**.
- Neue Lifecycle-Datei gegen die Kopie vor dieser Runde: **1/21 bestanden, 20/21 gescheitert**. Die Anzahl stimmt, aber nicht jeder Fehler ist eine fachliche Gegenprobe: neun scheitern bereits an fehlenden neuen APIs/Variablen. Details unten.

## 2. Ausgangsbefunde, Lösung und Tests

### P54: eigene Basis eines Entwurfs

**Ursprüngliche Reproduktion, echter Chrome:** A ist Writer, B Leser. B öffnet Prognose → Lebensphasen mit Bedarf 3.200 €. A öffnet dieselben Phasen, speichert 4.000 € und schließt. B übernimmt automatisch und speichert seinen alten Entwurf.

**Erwartet:** A bleibt mit 4.000 € gespeichert; B erhält eine verständliche Konfliktentscheidung.

**Tatsächlich:** B erhält auf Englisch „Not saved: data was saved in another window in the meantime. This now shows the current state. You had not changed anything here.“ Das Sheet wird mit Bedarf 4.000 € neu geöffnet. Die alte 3.200-Eingabe wird bei diesem unveränderten Entwurf nicht übernommen. Kein Rückfall auf 3.200 €.

Zusätzlicher echter Chrome-Fall: B ändert einen zuvor angezeigten Bedarf von 4.500 € auf 3.700 €, A speichert 4.800 € und schließt. Bs erster Speicherversuch wird abgelehnt. B sieht die eigene Eingabe 3.700 € wieder eingetragen und „Inzwischen gespeichert: 4.800“. Keine automatische Übernahme des eigenen Betrags. Danach wurde abgebrochen.

**Bewertung der Basisprüfung:** `revision()` zählt übernommene fremde Stände, `withBase()` setzt die Entwurfsbasis, und `commit()` lehnt eine veraltete Basis mit `STALE` ab. Transaktionen speichern ihre Anfangsrevision und werden nach fremder Übernahme abgelehnt. Die Übernahme des Schreibrechts setzt die offene Entwurfsbasis nicht mehr neu. Das behebt den ursprünglichen Fehler.

`trackView`/`markShown` schützt Schreibwege ohne ausdrückliche Basis. Die Ausnahmen über `_fieldWrite()` sind nur dann sachlich vertretbar, wenn sie den aktuellen Speicher lesen und ausschließlich die beabsichtigte Einzeländerung ergänzen. Sie ersetzen keine eigene Basis für eine vollständig aus der Anzeige eingesammelte Liste. Genau an dieser Grenze liegt P64.

**Tests:** Der Test „verbindlicher Kontrollfall“ scheitert am alten Stand mit **3.200 statt 4.000**, der Kreditfall mit **2.500 statt 3.000**, Budget mit **3.100 statt 3.500**, Daten-Bearbeiten mit **1980 statt 1984**, der Importfall mit **Inflation 0 statt 7**. Das sind aussagekräftige Gegenproben gegen echte Überschreibungen.

**Wichtige Grenze des Harness:** Eingaben werden dort überwiegend durch `a.el(id).value` gesetzt. `dsBody.innerHTML` erzeugt keine echten DOM-Knoten, `querySelectorAll()` liefert standardmäßig `[]`, und Pointer-/Fokus-/Eingabeereignisse der Sheet-Kontrollen werden nicht wirklich durchlaufen. Deshalb prüft die Assertion „Eingabe 3.200 noch da“ nicht zuverlässig den neu aufgebauten realen Dialog: Das alte Attrappenfeld bleibt erhalten, obwohl der echte Browser im unveränderten Kontrollfall 4.000 zeigt. Die gespeicherte Zahl und Konfliktentscheidung sind sinnvoll geprüft; vollständiger Eingabeabgleich, Schalter, DOM-Identitäten und Sprachwechsel sind dadurch nicht abgedeckt.

**Inventur der Schreibwege:** Die nachfolgende Tabelle trennt Codeprüfung, vorhandene automatisierte Prüfungen und selbst durchgeführte Browserprüfungen. Sie ist keine Behauptung, jeder Dialog sei vollständig im Browser durchgetestet worden.

| Schreibweg | Im Code geprüft | Dynamischer Nachweis / Ergebnis |
| --- | --- | --- |
| Positions-, Kredit-, Monats- und Verlauf-Sheets; neue Position/Verbindlichkeit | `_openSheet` nimmt Basis, `_submitSheet` speichert mit ihr; Wiederöffnen vorhanden | Kredit-Konflikt im Lifecycle-Test; normale Positions-/Monats-/Verlaufsfälle in der Gesamtsuite. Keine eigene vollständige Mehrtab-Prüfung jedes dieser Sheets. |
| Budget-, Konto-, Dauerauftrag-Sheets; Anlegen | dieselbe zentrale Sheet-Basis; Wiederöffnen vorhanden | Budget-Konflikt im Lifecycle-Test; normale Konto-/Order-Fälle in Suite. Browser: Verlust des Ruhestandsschalters, P66. |
| Löschen nach Rückfrage | Account/Order/Budget fangen stale Fehler über `_sheetFailNow`; außerhalb `_submitSheet` gilt überwiegend die Standardbasis `shown` | Speicher schützt vor fremdem Stand. Keine eigene vollständige Browsermatrix aller Löschdialoge; ausdrückliche Erfassung der Basis vor jeder Rückfrage wäre leichter belastbar als implizite Abhängigkeit von `shown`. |
| Daten-Bearbeiten, Panel „+ Vermögenswert hinzufügen“ | `saveEntry` mit `_editBase`; `addCustomField` außerhalb eines Sheets verwendet Standardbasis, transaktionales Schreiben, Fehler lädt `_fc` zurück | Daten-Bearbeiten-Konflikt in Lifecycle-Test; Add-/Rebuild-Kontrollen in Suite. Kein eigener vollständiger Konflikttest des Panels mit allen Eingabetypen. |
| Lebensphasen | zentrale Sheet-Basis und Wiederöffnen | ursprünglicher P54-Fall, eigene Eingabe, nur Fokus und fremde Sprache in echtem Chrome geprüft. |
| Gehalt zuordnen, Kinder-Jahrgang, Teilzeit umstellen | zentrale Sheet-Basis; Wiederöffnen; Kinderklärung öffnet nur weiterhin ungeklärten Eintrag | Kinder-Konflikt in Lifecycle-Datei; normale Migrationen in Suite. Fachliche Altbefunde bleiben offen. |
| Einrichtung/Mini-Setups | `_setup.base`, `_setupFinish` mit Basis, `_setupStale` | erster Konflikt schützt; zweiter Konflikt verliert eigene Angabe, P67. |
| Willkommen/Rundgang | `finishOnboarding` baut aus aktuellem Dokument und schreibt mit aktueller Revision | bestehende Onboarding-Tests bestanden; kein eigener vollständiger Mehrtab-Rundgang. |
| JSON/CSV-Import | Basis vor Dateilesen/Rückfrage; JSON- und CSV-Schreiben geschützt; stale Nachricht statt Erfolg | JSON-Konflikt während Rückfrage in Lifecycle-Test; CSV-/Import-/Rollback-Suite bestanden. |
| Zurücksetzen, Demo | Basis vor Rückfrage bzw. Laden; stale Importmeldung | Codepfade geprüft; keine eigene vollständige Browserprüfung aller Rückfrage-Verschachtelungen. Demo ausschließlich im isolierten Testkontext verwendet. |
| `quoteHistoryFlow` | Basis und Instrument-/Bestandsstempel; erneute Rückfrage bei stale, begrenzte Runden | Quote-History-Suite einschließlich P38 bestanden. Kein neuer Instrument-Verwechslungshinweis festgestellt. |
| Live-Einzelfelder | aktuelle Revision, einzelne Änderung | Codeprüfung; Lesen bleibt geschützt. In-App-Browser: Inflation im Lesemodus abgelehnt. |
| Annahmen je Anlage | aktuelle Annahmen werden vor Einzeländerung gelesen | Codeprüfung; kein separater vollständiger Mehrtab-Test jeder Annahme. |
| „Sparraten aus Budget“ | bestätigt ausgewählte Sparraten, ergänzt aktuellen Annahmenspeicher | Codeprüfung; keine eigene Rückfrage-Race-Browserprüfung. |
| Live-Ereignisliste / weitere Einkünfte | Basis beim Zeichnen, aber Abgleich nach Zeilenindex | **fehlerhaft: P64**, echter Chrome und ausführbarer Speicher-Nachweis. |
| Hintergrundkurse, Monatswechsel, `_startupWrites` | Schreibrecht/Standardbasis; Monatswechsel setzt Marker nach `STALE` zurück; Startwartung wird nach Übernahme vorgemerkt | Suite und Codeprüfung; STALE-Warnungen für abgelehnte Hintergrundkurse im Browser gesehen. Das ist kein Erfolgsnachweis dieser Speicherung. Keine generelle Endlosschleife beobachtet. |

Beim normalen Neuaufbau nach fremder Speicherung und beim Start wird `markShown()` gesetzt. Vollständige Neuaufbauten über weitere Hilfsfunktionen haben keinen durchgängig eigenen `markShown`-Aufruf; bei eigenen Speicherungen erhöht sich `revision` jedoch nicht. Allein daraus folgt daher kein belegter Fehler. Ich melde keine vermutete dauerhafte Blockade ohne Reproduktion.

### P55: Fehler, Freigabe und Fristen

**Ursprüngliche Fälle:**

1. Quota bei Erstübernahme von `lt-inflation=2`: `ready()` endet als `failed`, Sperre wird freigegeben, Altschlüssel bleiben und kein neues Dokument wird geschrieben. Nach Freigabe des Speichers gelingt `requestWrite()`; Inflation 2 wird übernommen und danach normal geändert.
2. Abgelehnte eingereihte Sperranfrage: keine unbehandelte Ablehnung; erneute Anfrage endet als `denied`, nach Beseitigung der Ursache als `writer`. Die Warteschlangenmarkierung bleibt nicht dauerhaft hängen.
3. Nie beantwortete erste Anfrage: in der Prüfung mit Startfrist 80 ms / Anfragefrist 40 ms endet die Anfrage als `timeout`, `ready()` als `reader`; nach Beseitigung des Fehlers kann das Fenster über eine neue Anfrage schreiben. Die Anfragefrist umfasst das Warten auf die erste Antwort.

Diese Fälle sind in der selbst ausgeführten Lifecycle-Datei enthalten. Am alten Stand gibt es Quota-Ablehnungen und eine über 500 ms hängende Anfrage bei wesentlich kürzerer Testfrist. Der Start-Guard nach 3 s besteht an beiden Ständen und ist kein neu behobener Fehler.

**Zusätzliche Störungen:**

- Erste Anfrage fehlt, lehnt ab oder wirft synchron: kein automatisches ungesichertes Schreiben; `unsupported`, Änderung bleibt ungespeichert, `allowSingle` nur ausdrücklich. Tests bestanden.
- Marke kann nicht geschrieben werden: Übergabe gelingt dennoch; die Marke ist Hinweis, die Sperre Schutz. Eigener zielgenauer Speicherfehler-Nachweis bestanden.
- Bitte kann nicht geschrieben werden: Anfrage endet als `timeout`, bisheriges Dokument unverändert; kein unbegrenztes Warten. Die freie Sperre kann später ohne Bitte übernommen werden. Eigener Nachweis bestanden.
- Späte Erteilung nach Suspend und Queue-Abbruch: vorhandene Epochentests bestanden; verspätete Sperren werden freigegeben, kein Writer aktiviert.
- Unlesbarer neuerer Stand bei Übernahme: **nicht korrekt**, siehe P65. Hier unterdrückt `onPromote` den Fehler und umgeht den vorgesehenen Zustand `failed`.

Alle Lock-Aufrufe sind gegen synchrone Ausnahmen und abgelehnte Promises umschlossen. Das beseitigt die ursprünglichen unbehandelten Ablehnungen. Die feste Frist ist eine Timer-/Event-Loop-Frist, keine Echtzeitgarantie bei blockiertem Browserprozess.

**Erneuter Versuch nach erster Ablehnung:** Nach einer ersten Ablehnung bleibt das Fenster `unsupported`, selbst wenn die Lock-API bei der nächsten Anfrage wieder funktionieren würde. Eigene Probe: Ursache entfernt, `requestWrite()` liefert weiterhin `unsupported`, `canWrite=false`. Das ist die gewählte Zustandsarchitektur; eine neue Seite kann Locks neu prüfen. Der vorhandene Knopf bietet aber direkt den riskanteren Einzelmodus. Empfehlung: einen geschützten Neuversuch bzw. „Neu laden und erneut prüfen“ neben dem Einzelmodus anbieten. Nicht als eigener Datenverlustbefund nummeriert.

**Meldungen:** `reader`, `failed` und `unsupported` erhalten unterschiedliche Leiste/Knöpfe; `busy`, `denied`, `failed` und Timeout werden in der Übernahme-Rückmeldung unterschieden. Die Übernahmefunktion setzt ihren Busy-Guard und den Knopf in `finally` zurück. Die englischen und deutschen Kernmeldungen sind als `L()` vorhanden; ein echter englischer Konflikt und beide langen Speicherhinweise wurden gesehen. `suspended` wird sichtbar nicht eigenständig angeboten; ein ausdrücklich gestarteter Übernahmeversuch während Suspend fällt in die allgemeine Timeout-Erklärung. Keine vollständige Browserprüfung jedes Zustands in beiden Sprachen.

### P63: Verlassen und Rückkehr

**Ursprünglicher echter Chrome-Fall:** Writer navigiert vollständig zu `http://127.0.0.1:8124/demo_backup.json`. Das JSON-Dokument wurde im DOM-Snapshot gesehen, die Navigation also tatsächlich ausgeführt. Die Nur-ansehen-Leiste des anderen Tabs verschwindet, bevor der alte Tab zurückkehrt. Nach Zurück zeigt der alte Tab wieder „View only“ und „Edit here“. Die ursprüngliche Blockade ist nicht mehr aufgetreten.

**Automatisiert:** `pagehide`/`freeze` → `suspended`, tatsächliche Freigabe des Hold-Promise, Queue-Abbruch, kein neues Anstellen während Suspend. Rückkehr über `pageshow` mit `persisted`, `resume` und „wieder sichtbar“ erwirbt neu und lädt den aktuellen Stand. Ein nur verdeckter Tab behält die Sperre und beantwortet Bitten. Späte Queue- und erste Erwerbsrückrufe aus einer alten Epoche ändern keinen Zustand und halten keine Sperre. Schließen/Absturz wird vom Testbrowser als Browserfreigabe simuliert.

Zusätzlich selbst ausgeführt: **15 Durchläufe** mit zwei gleichzeitigen Übernahmeanfragen, **120 unmittelbar protokollierte Zustandswechsel**, gemeinsame Node-Uhr (`performance.now()`), **maximal ein Writer**, keine vom Testbrowser festgestellte Verletzung. Dies ist ein kontrollierter API-/Zustandsnachweis, keine Messung von Writer-Intervallen echter Chrome-Tabs.

Vor dem ersten Aufbau eintreffendes Storage-Ereignis: eigener kontrollierter App-Lauf ergibt vor Init `applied=0`, `pending=true`; nach `_startApp` `applied=1`, `initDone=true`. Dabei wurden Renderfunktionen ersetzt; das prüft das Vormerken und die Reihenfolge, keine vollständige Start-DOM-Integration.

## 3. Neue Befunde

| ID | Schwere | Bereich | Kurztitel |
| --- | --- | --- | --- |
| **P64** | **Hoch (P1)** | P54 / Live-Ereignisse | Konfliktabgleich schreibt Betrag in eine andere Ereigniszeile |
| **P65** | **Hoch (P1)** | P55 / Erstübernahme / P37 | Ladefehler verschluckt: fremdes Dokument überschrieben oder Originalsicherung ausgelassen |
| **P66** | **Mittel (P2)** | P54 / Budget-Sheet | Eigene Schalteränderung verschwindet und wird als „nichts geändert“ bezeichnet |
| **P67** | **Mittel (P2)** | P54 / Einrichtung | Zweiter Konflikt überschreibt zuvor erhaltene eigene Angabe |
| **P68** | **Mittel (P2)** | P54 / Sprache / Dialog | Fremder Sprachwechsel löst Reload aus und verliert offenen Entwurf |

### P64 – Ereignisbetrag landet bei einem anderen Ereignis

**Ort:** `index.html:10857`, insbesondere `10861` (Zuordnung), `10865` (automatisches erneutes Speichern). Betroffen ist `_planListStale`, verwendet vom Live-Listen-Editor.

**Reproduktion, echter Chrome:**

1. B ist Leser und hält das Betragsfeld „Renovierung“, Jahr 2030, 15.000 € fokussiert.
2. A entfernt Renovierung und legt ein anderes Ereignis „Reise“, Jahr 2031, Betrag 5.000 € an. Die Anzahl der Zeilen bleibt eins. B zeigt weiterhin die alte Zeile.
3. A schließt. B übernimmt und gibt **11.000 € in das alte Renovierungsfeld** ein.
4. Der Editor zeichnet neu, zeigt **Reise mit 11.000 €** und meldet „Changed in another window – current state loaded, your entry was applied to it.“ Nach Reload ist Reise weiterhin 11.000 €. Kein weiterer Speicherschritt war nötig.

**Zusätzliche ausführbare Gegenprobe:** `node /tmp/followup2-events.cjs`, Ausgabe `/tmp/followup2-events.log`. Der tatsächliche Editorcode wird im App-Harness ausgeführt; ein kleiner DOM-Ersatz verarbeitet seine gerenderten Zeilen und Eingabe-Listener. Der echte Datenadapter schreibt in MemoryStorage. Ausgang E1=Auto/10.000 und E2=Haus/20.000; fremder Stand E2=Haus/20.000 und E3=Reise/5.000. B bearbeitet das alte E1-Feld mit 11.000. Ergebnis im gespeicherten Dokument:

```text
E2 Haus, 2030, amount=11000, from={type:'group',groupId:'g0'}, to={type:'external'}
E3 Reise, 2032, amount=5000, from={type:'group',groupId:'g0'}, to={type:'external'}
```

Die für Haus vorgesehene Entnahme wird damit unbeabsichtigt um 9.000 € reduziert. Es handelt sich um tatsächlich gespeicherte falsche Daten, nicht nur eine irreführende Anzeige.

**Erwartet:** Eine Eingabe wird nur demselben weiterhin vorhandenen Ereignis anhand seiner ID zugeordnet. Bei gelöschtem oder ersetztem Ereignis bleibt der neue Stand unverändert; B erhält die eigene Eingabe zurück bzw. eine explizite Entscheidung. Die Zeilenanzahl ist kein Identitätsnachweis.

**Ursache:** Obwohl die Zeilen `data-row-id` besitzen, sucht der Abgleich `now[i]` und prüft nur die gleiche Zeilenanzahl. Anschließend löst `dispatchEvent` den neuen Live-Speicherlistener aus. Die Basisprüfung greift beim ersten Schreiben, aber der Abgleich legitimiert danach eine fachlich falsche Zuordnung auf der aktuellen Basis.

**Behebung:** Nach dauerhafter Ereignis-ID zuordnen, auch neu angelegte Zeilen aus dem tatsächlich gespeicherten Dokument neu zeichnen. Fehlende/mehrdeutige IDs führen zu einem sichtbaren, ungespeicherten Entwurf. Eine bei Konflikt wieder eingesetzte Eingabe sollte erst nach ausdrücklicher Bestätigung gespeichert werden, sofern eine fachliche Zuordnung unsicher ist.

**Regressionstest:** `P54: ersetzte Ereigniszeile gleicher Listenlänge übernimmt keinen Betrag des gelöschten Ereignisses`. Mit echten Eingabeereignissen und kontrolliertem fremdem Stand; E2 bleibt 20.000, E3 bleibt 5.000. Zusätzlich reine Umordnung, Löschen+Anlegen bei gleicher Länge, fehlende ID und Reaktion ohne erneute Bestätigung testen.

**Einordnung:** Neu eingeführte Fehlzuordnung im Abgleich. Der vorherige Stand hatte den bekannten P54-Überschreibungsfehler; das ist kein Beleg für die Korrektheit des neuen Abgleichs.

### P65 – `onPromote` verschluckt einen Ladefehler und schreibt trotzdem

**Ort:** `data-store.js:982`, insbesondere `984–985`; `writeLegacy` ab `990`.

**Reproduktion A, selbst ausgeführter kontrollierter Store:**

1. Speicher enthält nur `lt-inflation=2`. Fenster B wird erstellt, erste Lock-Antwort kontrolliert verzögert. B merkt eine Erstübernahme vor; der zentrale Dokument-Schlüssel ist beim Erstellen noch leer.
2. Bevor B die Sperre erhält, liegt dort ein fremdes Dokument mit `schemaVersion=999`.
3. Die Sperre wird B erteilt. `adopt(raw)` wirft beim Validieren, der Fehler wird gefangen und ignoriert. `writeLegacy()` wird trotzdem ausgeführt.
4. **Tatsächlich:** `ready='writer'`, fremder Rohtext **nicht erhalten**, gespeicherte Version **17**, alter Schlüssel entfernt, **keine Originalsicherung**.

Skript: `node /tmp/followup2-faults.cjs`; Log `/tmp/followup2-faults.log`, Fall „legacy + unreadable newer raw“.

**Erwartet:** `failed`, kein Schreibrecht, Sperre frei, fremder Rohtext und alte Schlüssel unverändert. Nach Korrektur des Dokuments kontrollierter erneuter Versuch. Eine unbekannte neue Version darf niemals durch die ältere App ersetzt werden.

**Reproduktion B, gültiger älterer fremder Stand:** Gleiches Startrennen, fremdes Dokument nun gültiges Schema 15. Nach Übernahme steht bereits Schema 17 auf der Platte, `BACKUP_KEY=null`; `backupBeforeUpdate()` zeigt das Original zunächst nur noch als **pending im Speicher**. Nach der nächsten Änderung ist auch diese Referenz weg; `BACKUP_KEY` bleibt null. Skript `/tmp/followup2-legacy-adopt.cjs`, Log gleichnamig mit `.log`.

**Erwartet:** Das unveränderte Schema-15-Original wird vor der ersten Persistierung des migrierten Dokuments dauerhaft gesichert. Ein ausschließlich im Fenster gehaltener pending Rohtext ersetzt die Originalsicherung nicht.

**Weitere Variante:** Wenn B schon mit einem gültigen Hauptdokument startete, das fremde Dokument später unlesbar wird und B dann übernimmt, wird zwar nichts überschrieben, B wird aber **writer**, `writerFailure=null` und hält die Sperre weiter. Ein Schreibversuch endet mit „schemaVersion: nicht unterstützte Version 999“ statt eines definierten Übernahmefehlers. Das widerspricht dem dokumentierten `failed`-Übergang und der Aussage, ein Writer habe erfolgreich den neuesten Stand geladen.

**Ursache:** Der innere Catch in `onPromote` verhindert, dass `take()` seinen neuen Fehlerpfad mit Freigabe ausführt. Die weiterhin gesetzte `legacyKeys`-Markierung löst danach einen direkten Schreibweg aus, der den Konflikt- und Originalsicherungsweg von `commit()` umgeht. Auch ein leerer vorgemerkter Altschlüsselsatz ist als Array truthy.

**Behebung:** Ladefehler aus `onPromote` an die Gate-Freigabe weiterreichen. Sobald ein Hauptdokument vorhanden ist, darf die ursprünglich vorgemerkte Erstübernahme es nicht direkt ersetzen. Migrationen vorhandener Dokumente müssen über den gleichen Sicherungs-/Konfliktpfad wie normale Änderungen gehen. Die alten Schlüssel erst nach einem tatsächlich sicheren Abschluss entfernen.

**Regressionstests:**

- `P55: unlesbarer fremder Stand vor erster Sperrerteilung bleibt unangetastet und gibt die Sperre frei`: Rohtext bytegleich, Altschlüssel erhalten, failed, kein Hold, keine unbehandelte Ablehnung; nach Behebung erneuter Versuch erfolgreich.
- `P37/P55: fremdes Schema-15-Dokument während vorgemerkter Erstübernahme wird vor Persistierung gesichert`: Sicherung bytegleich, auch nach weiterer Änderung und Neustart vorhanden.
- `P55: unlesbarer neuer Stand bei späterer Promotion aktiviert keinen Writer`: gleicher Freigabenachweis ohne Altschlüssel.

**Einordnung:** In dieser Prüfung sichtbar gewordene Lücke des bereits vorhandenen `onPromote`-/Altschlüsselpfads; nicht behauptet, erst diese Runde habe das Verschlucken eingeführt. Der nun behauptete vollständige Fehlerpfad behebt sie noch nicht.

### P66 – Eigene Änderung eines Budget-Schalters geht verloren

**Ort:** `index.html:7367` (`_touch`), `7378` (`_ctlList`), `7505` (`_sheetReconcile`); fachlicher Schalter `b-retOn` in `8601`, Auswertung in `8707`.

**Reproduktion, echter Chrome:** B öffnet „Miete Garage“, 125 €/Monat, „Also in retirement“ ist eingeschaltet. B schaltet diesen Schalter **aus**. A speichert eine unabhängige Ereignisänderung und schließt. B übernimmt und speichert seinen Budgetentwurf.

**Tatsächlich:** Speichern wird zunächst korrekt abgelehnt. Der neu geöffnete Dialog zeigt den Schalter wieder **eingeschaltet** und meldet **„You had not changed anything here.“** Die eigene Entscheidung über das Ruhestandseinkommen ist verloren; kein „Nicht übertragen“-Hinweis, keine Markierung der eigenen Schalteränderung.

**Erwartet:** Schalter bleibt nach dem Abgleich aus und als eigene Änderung markiert; bei Änderung desselben Schalters durch A Vergleichswert anzeigen. Der gespeicherte Stand bleibt bis zum erneuten ausdrücklichen Speichern erhalten.

**Ursache:** Die selbstgebauten Schalter sind `<span role="switch" aria-checked="…">`, keine Inputs. `_ctlList` sammelt nur input/select/textarea, `_touch` berücksichtigt neben diesen nur Segment- und Datumssteuerung. Ihre Änderung fällt vollständig aus Snapshot und Änderungsmenge. Die native Checkbox-Behandlung hilft diesen Elementen nicht. Derselbe strukturelle blinde Fleck betrifft weitere selbstgebaute Schalter, z. B. individuelle Monatswerte; diese anderen Fälle wurden nicht separat im Browser bestätigt.

**Behebung:** Sämtliche fachlichen Bedienelemente mit stabiler Kennung erfassen, einschließlich `role=switch`, und ihren kanonischen Zustand lesen und wieder anwenden. Dabei UI-Abhängigkeiten aktualisieren, ohne bereits etwas zu speichern. Alternativ zu nativen Checkboxen wechseln.

**Regressionstest:** `P54: eigene Ruhestandsschalteränderung bleibt nach fremder Speicherung erhalten`. Echter DOM, Pointer/Klick/Change, fremde unabhängige Speicherung, Promotion und erster Save. Schalter false bleibt, Hinweis auf eigene Änderung statt „nichts geändert“, dauerhaft gespeicherter alter Wert bleibt bis zum zweiten Save. Auch individuelle Monatswerte und echte Checkboxen abdecken.

**Einordnung:** Neue Verluststelle durch den neuen Abgleich; die ursprüngliche Speicherung war nach P54 unsicher, aber dieser Abgleich darf eigene Schalterentscheidungen nicht vergessen.

### P67 – Beim zweiten Einrichtungskonflikt wird eine eigene Angabe zur Vorbelegung

**Ort:** `index.html:12494` (`_setupStale`), insbesondere `12500` (Vergleich) und `12501` (neue Vorbelegung).

**Ausführbare Reproduktion:** `node /tmp/followup2-setup.cjs`, Log `/tmp/followup2-setup.log`. Es wird `_setupFinish()` tatsächlich aufgerufen; kein direkter Ersatz der Konfliktlogik.

1. Mini-Setup „future“ beginnt mit Bedarf 3.200 €, Vorbelegung 3.200. B trägt **eigene 3.700 €** ein.
2. Ein anderer Store speichert Inflation 3. B bestätigt. Konflikt wird erkannt; Bedarf 3.700 bleibt zu Recht erhalten.
3. Vor der erneuten Bestätigung speichert der andere Store Bedarf **4.000 €**.
4. B bestätigt erneut. Der zweite Konflikt wird ebenfalls erkannt, aber Bs Setup enthält nun **4.000 statt eigener 3.700**. Die Meldung behauptet dennoch, die eigenen Angaben seien noch da.

**Erwartet:** Nur unveränderte ursprüngliche Vorbelegungen folgen einem neueren Stand. Die einmal als eigene Änderung erhaltenen 3.700 € bleiben auch bei wiederholten Konflikten eigene Eingabe.

**Ursache:** Nach dem ersten Abgleich wird `s.prefill={...f}` auf den gesamten neuen Formularzustand gesetzt. Eigene Angaben werden so zur neuen vermeintlichen Vorbelegung. Beim nächsten Konflikt gilt `f[k]===pre[k]` und der Fremdwert überschreibt sie.

**Behebung:** Ursprung der Vorbelegung und explizit eigene Felder getrennt halten; ein Abgleich darf die Kennzeichnung eigener Angaben nicht löschen. Ein Vergleichsstand für fremde Änderungen kann separat fortgeschrieben werden.

**Regressionstest:** `P54: eigene Einrichtungsangabe überlebt zwei aufeinanderfolgende fremde Speicherungen`. Eigene 3.700 bleiben nach beiden Konflikten erhalten, ursprünglicher unveränderter Rentenbeginn darf folgen. Bei erneuter ausdrücklicher Bestätigung werden die gewünschten eigenen Angaben auf den aktuellen Stand ergänzt. Drei Konflikte, leere/gelöschte Vorbelegungen und Rückkehr in den Assistenten ergänzen.

**Einordnung:** Neu eingeführte Verluststelle in `_setupStale`.

### P68 – Fremde Sprache führt beim Abgleich zum Verlust des Entwurfs

**Ort:** `index.html:7508` (`_sheetReconcile` ruft Neuaufbau), `7238` (sofortiger `location.reload()` bei anderer Sprache). Derselbe Neuaufbau wird von `_editReconcile` verwendet; diesen zweiten Edit-Modus-Fall habe ich nicht im Browser reproduziert.

**Reproduktion, echter Chrome:** B hält ein englisches Lebensphasen-Sheet offen und ändert Bedarf 4.000 auf **3.700 €**. A stellt Sprache auf Deutsch, lädt dadurch neu und wird anschließend geschlossen. B zeigt seinen englischen Entwurf weiter. B übernimmt und klickt Save.

**Tatsächlich:** Der Abgleich löst einen vollständigen Reload aus. B landet auf der deutschen Vermögensseite; Sheet und eigene Eingabe sind verschwunden. Neu geöffnet zeigt Lebensphasen weiter **4.000**, nicht 3.700. Kein sichtbarer Entwurfsexport oder Hinweis, aus dem die eigene Eingabe rekonstruiert werden kann.

**Erwartet:** Fremde Sprache aktualisieren, sobald der Entwurf gesichert, verworfen oder ausdrücklich übernommen wurde; alternativ vor Reload Entwurf mit stabilen fachlichen Kennungen erhalten und danach wiederherstellen. Eine Änderung der Sprache darf offene fachliche Eingaben nicht verlieren.

**Ursache:** `_sheetReconcile` hält `mine` nur im laufenden JavaScript-Aufruf. `_applyExternalChange` sieht eine andere Sprache und fordert vor dem erneuten Öffnen den vollständigen Reload an. Selbst ein unmittelbar wieder aufgebauter Dialog überlebt diesen Reload nicht.

**Behebung:** Sprachwechsel bei offenen Entwürfen bis zur Entscheidung aufschieben oder den Entwurf zuverlässig über den Reload hinweg sichern. Kein bloßes Wiederöffnen vor `location.reload`; das behebt den Verlust nicht.

**Regressionstest:** `P54: fremder Sprachwechsel erhält den eigenen offenen Entwurf`. Zwei echte Tabs bzw. DOM-Test mit tatsächlich ausgeführtem Reload. Eigene 3.700 wieder sichtbar, fremder gespeicherter Bedarf 4.000 unverändert, erst bewusste Bestätigung darf speichern. Auch Daten-Bearbeiten und Einrichtung separat prüfen.

**Einordnung:** Der Sprach-Reload existierte bereits; die neue erzwungene Abgleichsequenz macht ihn beim eigenen Speicherversuch zu einem unmittelbaren Verlust offener Eingaben.

## 4. Testqualität und Gegenprobe

### Was die 20 alten Fehler tatsächlich beweisen

Die vier Kopien entsprechen den angegebenen SHA-256-Präfixen; volle Prüfsummen:

```text
index.html    395c5fa812331d8f974b7444ea7f9a93abf66c81f0137ca54f0e161840f5b109
data-store.js 2a5c42db10307562354a743ce3e784cada406054593a7fe8bea657f3ff50e958
i18n-en.js    e42046b3e65715ecabfa2775c82cb5cf42dea273af9e0eaf56a982aa1f85912e
sw.js         9e95ddc1cb293b722e04edb0655b2492f9b2d2291be334fd76eebb4afc10be36
```

Unter `/tmp/followup2-old/` wurden die aktuellen übrigen Module, Tests und Skripte kopiert, dann diese vier Dateien durch den vorherigen Stand ersetzt. Lauf: `node --test /tmp/followup2-old/.tests/writer-lifecycle.test.cjs`.

| Fehlergruppe | Anzahl | Aussagekraft |
| --- | ---: | --- |
| Fehlende neue APIs/Variable: revision, markShown, suspend, writerFailure, `_takingOver` | **9** | Interface-/Integrationsänderung nachgewiesen; kein vollständig durchlaufener fachlicher Altfehler. |
| Quota führt zu unbehandelter Ablehnung | **2** | trifft ursprünglichen P55-Pfad. |
| Anfrage endet nicht innerhalb von 500 ms trotz kurzer Testfrist | **1** | trifft ursprüngliche unbeschränkte Anfangswartezeit. |
| Verändertes Verhalten / gespeicherte falsche Werte / falscher Lifecycle-Zustand | **8** | fünf fachliche Überschreibungen, zwei fehlende Suspend-Übergänge und ein unsicherer automatischer Fallback. |
| Bestehender 3-s-Start-Guard | **1 bestanden** | Kontrollfall, kein neu behobener Fehler. |

Der kombinierte Kredit-/Kinder-Test bricht am alten Kreditfall ab; seine Kinderhälfte liefert dort keinen eigenen Alt-Reproduktionsnachweis. Der „gleichzeitige Übernahme“-Test scheitert am alten Stand erst an fehlendem `suspend()` beim Aufräumen; seine vorangehenden Exklusivitätsprüfungen können bereits bestanden haben. Diese beiden Unterschiede sollten in der Dokumentation nicht zu einer stärkeren Aussage zusammengezogen werden.

### Änderung des App-Harness

Web Locks im Harness und das Aufrufen von `ready()` sind fachlich begründet: Die Produktions-App wartet ebenfalls auf die Schreibentscheidung. Ohne diesen Schritt würden bisherige numerische/Adaptertests nur den absichtlich geschützten Lesemodus testen.

Der Standard-Harness erteilt freie Locks jedoch **synchron** innerhalb `request`, während ein echter Browser den Callback asynchron ausführt. Der Harness ruft `ready()` auf, wartet dessen Promise aber nicht ab. Eigener Kontrolllauf mit asynchronem Lock-Callback:

```text
unmittelbar nach app(): setItem → READ_ONLY
nach await appStorage.ready(): derselbe setItem → gespeichert (3)
```

Damit sind bestehende synchrone Tests weiterhin geeignet für numerische Regeln, Adapter und bereits initialisierte Einzel-Writer-Flows. Sie beweisen keine reale Startreihenfolge. Es wurde keine abgeschwächte fachliche Erwartung für diese Runde gefunden, die allein durch das neue Harness ein falsches Ergebnis legitimieren würde. Die neue Lifecycle-Datei nutzt dagegen einen gemeinsamen asynchronen Testbrowser und wartet die jeweiligen Zustände ab; das ist die richtige Richtung.

**Verdeckte Bereiche:** kein realistischer DOM für den vollständigen Entwurfsabgleich, keine echten Reloads, kein echter bfcache, keine native radio/switch/date-Integration im Standard-Harness. P64, P66 und P68 konnten bei grüner Suite im realen Browser auftreten. P67 hat keine Wiederholungsprüfung im bestehenden Testumfang. P65 hat keinen Test für ein zwischen Store-Erstellung und Lock-Erteilung auftauchendes Hauptdokument.

### Geänderte Fallback-Erwartung

Die geänderte Erwartung in `data-safety.test.cjs` – nach erster Lock-Ablehnung **unsupported statt single** – ist sachlich richtig und durch das Reviewziel gedeckt. Früher wurde nach einer Ablehnung automatisch ohne Exklusivität geschrieben. Jetzt ist vor dem Einzelmodus eine ausdrücklich getroffene Entscheidung nötig; der Test prüft zunächst `READ_ONLY` und unveränderte Altschlüssel. Das ist keine bloße Anpassung an die Implementierung, sondern prüft die geforderte Grenze.

`allowSingle()` selbst kann absichtlich zwei Fenster ohne Sperre zulassen. P1/P54 erkennen sequenzielle bzw. bereits übernommene Änderungen, machen Lesen+Schreiben aber nicht atomar. Der Test beweist nur die ausdrückliche Aktivierung, keine Mehrfenstersicherheit dieses Modus.

## 5. Geprüft ohne weiteren Befund

- P1-Konflikt, Transaktionsrollback, reload ohne Schreiben und Ablehnung eines unlesbaren fremden Standes bei normalem Commit: Gesamtsuite bestanden. P65 betrifft den davon abweichenden Promotions-/Erstübernahmepfad.
- P34 normale Übergabe, busy-Antwort und gesperrte Schreibwege im Leser-/Suspendzustand: automatisierte Prüfungen bestanden. Anlegen/Import/Umbenennen/clear werden durch die Speichergrenze geschützt.
- Quota bei normaler Erstübernahme: Originalschlüssel bleiben erhalten, neue Fehlerbehandlung setzt frei und kann erneut versuchen. Keine automatisch entsperrte unsichere Speicherung.
- P35–P37 vorhandene Migrationstests und normale Originalsicherung bestanden; die zusätzliche Startrenn-Variante in P65 ist davon nicht abgedeckt. Bekannte fachliche P56–P62 bleiben offen.
- P38 Instrumentwechsel, Kursverlauf und atomare Kursübernahme: Quote-Suite bestanden. Keine zusätzliche fachliche Prüfung der weiterhin offenen FX-Thematik P39.
- Im realen Browser blieb beim unveränderten Geldfeld ein bloßer Fokus ohne Eingabe eine Nichtänderung: 4.000→Darstellung 4000→Blur wurde nicht als eigene fachliche Änderung übernommen; fremde 4.500 wurden korrekt angezeigt.
- Sichtbar getestete echte eigene Geldänderung wurde mit korrektem Vergleichswert wieder eingesetzt. Gespeichert wurde beim ersten konflikthaften Sheet-Save nichts Eigenes.
- Lange `dsToast`-Meldung: ergänzend In-App-Browser, **375×812**, Deutsch und Englisch: Box **x=16, Breite 343 px, Höhe 58,59 px**, mehrzeilig innerhalb des Viewports. Englisch bei **1720×1267**: Breite **348,22 px**, Höhe **38,30 px**, kein horizontaler Überlauf. Screenshots wurden angesehen. Diese CSS-Prüfung ist kein iPhone-PWA-Nachweis.
- Versionsbezüge passen: HTML und Service Worker enthalten v27/v11; Cache v125; tatsächliche DOM-Script-URLs im Chrome ebenfalls v27/v11.

**Leistung:** eigener lokaler Node-Mikrovergleich, dieselbe unveränderte Demo, 30 Durchläufe je Stand, erste fünf verworfen:

| Operation | Vor dieser Runde, Median | Aktuell, Median |
| --- | ---: | ---: |
| Store laden/validieren/migrieren | 0,982 ms | 0,911 ms |
| Inflation ändern, validieren und in MemoryStorage speichern | 1,820 ms | 1,992 ms |

Der Unterschied beim Speichern beträgt in dieser kleinen Probe etwa 0,17 ms. Daraus folgt keine relevante Leistungsregression im geprüften Speicherpfad. Es ist **keine** Kaltstart-/Render-/LocalStorage-/iPhone-Messung: MemoryStorage, warmes Node, kein Chartaufbau und kein Netzwerk. Die längere Gesamttestzeit enthält insbesondere echte Wartefristen der neuen Tests und ist keine Messung der Appgeschwindigkeit.

## 6. Grenzen des Nachweises

### Automatisierte Nachweise

Pflichtsuite und Audit, Altstand-Gegenprobe, fünf zusätzliche ausführbare Probegruppen für Fehler, Abgleich, Ereignisspeicherung, Einrichtung und Grenzen; außerdem Startrennen, konkurrierende Anfragen mit gemeinsamer Node-Uhr und kleiner Performancevergleich. DOM-Ersatz und APIsimulation sind jeweils gekennzeichnet. Keine dieser Simulationen wird als tatsächlicher OS-Absturz, Browser-Freeze oder bfcache-Nachweis bezeichnet.

### Tatsächlich ausgeführte Browserprüfungen

**Chrome:** installiert **155.0.8059.40** (Info.plist gelesen), vom Browsertool ausgewiesenes verbundenes Profil **Lukas**, ausschließlich eigene temporäre Tabs auf **127.0.0.1:8124** mit isolierten Demo-Daten. Ein eigener neuer Tab ist **kein eigenes leeres Browserprofil**. Der vorhandene isolierte Demo-Speicher wurde für die synthetischen Beträge/Ereignisse verwendet; Projekt-Demo und Sicherungsdateien blieben unverändert.

Tatsächlich gesehen: verbindlicher P54-Kontrollfall; echter eigener Geldentwurf samt fremdem Vergleichswert; nur Fokus ohne Änderung; P63 komplette Navigation zum sichtbaren JSON-Ziel und Zurück; Schließen und ein Reload; P64 falsche Ereigniszuordnung mit Persistenz nach Reload; P66 Verlust des Ruhestandsschalters; P68 Reload mit Entwurfsverlust. Englisch und Deutsch im jeweiligen Zusammenhang. Kein Browser-Finanzdatenexport, keine Extension-Berechtigung geändert.

**Codex In-App-Browser:** eigene Demo-Tabs, tatsächliche 375- und Desktop-Abmessungen per DOM bestätigt; abgelehnte Inflationseingabe im Lesemodus und Geometrie/Umbruch des deutschen und englischen Toasts. Diese Engine-/Profilprüfung wird ausdrücklich getrennt vom echten Chrome-Lebenszyklus bewertet. Engineversion nicht selbst ermittelt.

**Nicht selbst nachgewiesen:** `pagehide.persisted`/`pageshow.persisted` in echtem Chrome, Navigationstyp `BackForwardCacheRestore`, `Page.backForwardCacheNotUsed`, Writer-Intervalle echter Tabs mit gemeinsamer Uhr, echte gleichzeitige Klicks zweier Chrome-Leser, echte Navigation mit gezielt verhindertem bfcache. Die verfügbaren read-only Browserauswertungen liefern DOM-Informationen; der Versuch, navigator/performance auszulesen, war in diesem Auswertungskontext nicht verfügbar. Es wurden keine mutierenden Listener oder CDP-Instrumentierung in die Seiten injiziert. Deshalb behaupte ich keinen eigenen bfcache-Nachweis. Claudes dokumentierter headless-Nachweis ist nicht mit diesem Review nachgeprüft worden.

Der Chrome-Viewport-Override ergab trotz Aufruf weiterhin DOM-Breite 1720; er wurde nicht als 375-px-Chrome-Prüfung gezählt. Die tatsächlich bestätigte Größenprüfung erfolgte ergänzend im In-App-Browser. Temporäre Overrides wurden zurückgesetzt, eigene Tabs geschlossen.

### Nicht geprüfte Plattformen / Abläufe

Safari macOS/iOS, native iPhone-PWA, Firefox, realer Browser-Freeze, Betriebssystem-/Prozess-Absturz, Speicher-Quota des echten Geräts, vollständige Mehrtab-Matrix jedes Dialogs mit allen Kontrolltypen, Offline-Service-Worker-Upgrade zwischen zwei realen Appversionen. `file://` wurde in diesem Review nicht bedient: kein eigenes leeres Profil mit verfügbaren erlaubten Dateizugriffsrechten eingerichtet; keine Browser-Sicherheits- oder Erweiterungsrechte verändert. Port 8123 und produktive file://-Tabs wurden nicht geöffnet oder bedient.

Die Pflichtprüfung ist damit aussagekräftig für die bestätigten Fehler und Kontrollfälle, aber kein vollständiger Nachweis aller geforderten Plattform-/Lifecycle-Eigenschaften.

## 7. Dokumentation und offene Entscheidungen

**Stimmig:** Zustände, request-/Startfristen, echte Suspend-Freigabe, Epochengrenze, bewusster Fallback, zentrale Entwurfsbasis und neuer Service-Worker-Stand sind beschrieben und im Code nachvollziehbar. PROGNOSE/BUDGET enthalten die ergänzten Hinweise zum Konfliktabgleich.

**Zu korrigieren nach den Implementierungen:**

1. „Writer hat den neuesten Stand geladen“ sowie „Laden wirft → failed, Sperre frei“ gilt derzeit nicht bei verschlucktem `adopt`-Fehler (P65).
2. „Unlesbarer Stand wird nie überschrieben“ und unveränderte Originalsicherung gelten nicht für die beschriebene vorgemerkte Erstübernahme (P65).
3. „Nur bediente und geänderte Felder werden übernommen“ / „eigene Angaben bleiben“ ist für Schalter, wiederholte Einrichtung und Sprachwechsel falsch (P66–P68).
4. „Ereigniszeilen sind gleich geblieben“ darf nicht mit gleicher Zeilenanzahl gleichgesetzt werden; automatische Wiederübernahme ist fachlich fehlerhaft (P64).
5. „20 von 21 scheitern“ als Zähler stimmt; als Aussage, 20 ursprüngliche fachliche Fehler seien jeweils vollständig reproduziert worden, ist es zu weitgehend. API-Fehler und nicht erreichte Testhälften getrennt nennen.

**Empfehlungen für die nächsten Entscheidungen:**

- **Zuerst P64 und P65 beheben**, dann P66–P68 in der Abgleichlogik korrigieren. Erst danach erneut unabhängiges Review dieser Schreibsicherheit; P39–P53 und P56–P62 bleiben für ihre fachliche Runde eingeplant.
- **Einzelmodus ohne Sperren:** als bewusstes Notverfahren für ein tatsächlich einziges geöffnetes Fenster verständlich, als belastbare Datenintegritätsgarantie für täglichen Mehrfensterbetrieb **nicht vertretbar**. P1/P54 ersetzen keine Exklusivität. Standard-Lesemodus beibehalten, geschützten Lock-Neuversuch anbieten, Grenze des Einzelmodus ausdrücklich dokumentieren. Falls verlustfreier Mehrfensterbetrieb zugesagt werden soll, ihn bis zu einem atomaren Alternativverfahren nicht zum Schreiben freischalten.
- **Konflikt bei Live-Listen:** vollständige Listen mit dauerhaften IDs behandeln. Unklare Zuordnung darf keine automatische Speicherung auslösen. Ob bei nachweislich gleicher ID eine eigene Live-Eingabe sofort erneut gespeichert werden soll, ist eine Produktentscheidung; sicherer ist eine sichtbare Bestätigung bei gleichzeitig verändertem Feld.
- **iPhone-PWA-Freigabe:** Safari/PWA mit realem Hintergrundwechsel und gemeinsamem Speicher sowie nachgewiesenem Lifecycle testen. Chrome ist kein Ersatz für diese Nutzungsform.

Keine dieser Empfehlung wurde in App oder Dokumentation umgesetzt; dieses Review ändert ausschließlich den Prüfbericht.

## 8. Integrität und Reproduktionsartefakte

Vor Beginn wurden **84 Projektdateien außerhalb `.git`** vollständig per SHA-256 erfasst, einschließlich vorhandener Berichte, Demo, Tests und `.claude`-Dateien. Baseline: `/tmp/followup2-baseline.json`. **Abschließender Vergleich: 84/84 vorhandene Dateien unverändert, keine gelöscht, genau eine neue Datei: `.docs/REVIEW_2026-10_FOLGE2.md`.** Ergebnisdatei: `/tmp/followup2-integrity.json`. Insbesondere beide früheren Reviews, App, Tests, Demo und vorhandene Dokumentation sind bytegleich.

Eigene Artefakte dieser Runde unter `/tmp`:

- `followup2-baseline.json`, `followup2-integrity.json` – Anfangsprüfsummen und abschließender Vergleich.
- `followup2-suite.log`, `followup2-audit.json` – Pflichtläufe.
- `followup2-store.diff`, `followup2-index.diff` – Vergleich mit dem gesicherten Vorher-Stand.
- `followup2-old/`, `followup2-old-tests.log` – isolierte Gegenprobe mit aktuellen Tests/Modulen und vier vorherigen Dateien.
- `followup2-helper.cjs` – ausschließlich unter `/tmp` extrahierte Testhilfen, keine Testausführung beim Import; lädt tatsächliche Projektmodule.
- `followup2-faults.cjs`, `followup2-faults.log` – Fehler, unlesbarer Stand, gezielte Marken-/Bitte-Schreibfehler, Ablehnung/Neuversuch.
- `followup2-legacy-adopt.cjs`, `followup2-legacy-adopt.log` – gültiger alter Fremdstand, verlorene Originalsicherung.
- `followup2-reconcile.cjs`, `followup2-reconcile.log` – kleinere Abgleich- und wiederholte Vorbelegungsprobe.
- `followup2-events.cjs`, `followup2-events.log` – tatsächlicher Live-Editor, Minimal-DOM, echte gespeicherte Ereignisverwechslung.
- `followup2-setup.cjs`, `followup2-setup.log` – zwei echte Setup-Speicherversuche mit Konflikten.
- `followup2-boundaries.cjs`, `followup2-boundaries.log`, `followup2-transitions.json` – asynchroner Harness-Kontrollfall, Startrennen, 15 gleichzeitige Erwerbsläufe und 120 Zustandswechsel.
- `followup2-performance.cjs`, `followup2-performance.log` – reproduzierbarer Mikrovergleich.
- `followup2-browser.md` – Protokoll der selbst bedienten Browserfälle, Fehlversuch beim vorbereitenden Eingeben, Grenzen und Bereinigung.

Keine Commits, Pushes oder Deployments. Keine bestehende Dokumentation, Appdatei, Testdatei, Demo-Datei oder Sicherung geändert. Browserseitige Eingaben betreffen ausschließlich die isolierte Demo/Synthetik auf Port 8124.

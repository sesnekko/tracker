# Unabhängiges Folge-Review 3 – P64 und P65

**Datum:** 14.10.2026. **Geprüfter Stand:** Commit `b9f80d4` auf `main`; vorheriger Repository-Commit `1b57aa8`. Arbeitsbaum vor der Prüfung ohne Änderungen an getrackten Dateien; ungetrackt `.claude/` und `.docs/IOS_SPEC.md`. Versionen: `data-store.js?v=28`, `i18n-en.js?v=12`, `verm-v126`, Schema 17.

**Vergleich für diese Runde:** die mit Prüfsummen gesicherten Dateien aus `/tmp/assets-pre-p64/`, nicht der gesamte ältere Repository-Commit. `b9f80d4` enthält auch frühere Arbeiten; dieses Review beurteilt die gezielte Umsetzung von P64/P65 und dazugehörige Rückschritte. Implementierer-Dokumentation und dessen `/tmp/assets-p64-*`-Artefakte ersetzen keine eigenen Nachweise.

Nur dieser neue Bericht wird im Projekt angelegt. Keine App, Tests, bestehenden Berichte, Dokumentation, Demo oder Sicherungen geändert. Keine iOS-Implementierung, Commits, Pushes oder Deployments.

## 1. Zusammenfassung und Freigabeempfehlung

| Ausgangsbefund | Urteil | Ergebnis |
| --- | --- | --- |
| **P64 – Abgleich verwechselt Ereignisse** | **Teilweise behoben** | Der ursprüngliche Fall ist im synthetischen Store und in zwei echten Chrome-Tabs behoben. Gelöschte Editorzeilen werden nicht mehr automatisch überschrieben, gleicher ID wird nur nach Bestätigung zugeordnet. Es bleiben wiederverwendete IDs aus dem CSV-/Adapterpfad (P71) und der Verlust offener Abgleichentwürfe bei weiteren Aktualisierungen (P70). |
| **P65 – ungesicherte Erstübernahme nach Ladefehler** | **Teilweise behoben** | Die ursprünglichen Fälle A, B, C und der Kontrollfall D bestehen. Fehler führen zu `failed`, Freigabe und unverändertem Rohtext; normale Originalsicherung funktioniert. Ein fehlgeschlagener Ladeversuch verändert jedoch die interne Sicherungsreferenz. Bei Wiederherstellung desselben ursprünglichen Rohtexts und Neuversuch geht die Originalsicherung verloren (P69). |

**Vier neue Befunde: zwei hoch, einer mittel, einer niedrig.**

**Keine Freigabe der Schreibsicherheit für den täglichen Mehrfensterbetrieb.** Zuerst P69 und P71 korrigieren, anschließend P70. Die bereits bekannten offenen Abgleichlücken P66–P68 bleiben ebenfalls offen. P72 ist eine kleinere neue Sprachlücke im hinzugefügten Konflikthinweis.

Selbst ausgeführte Pflichtläufe:

- `node --test .tests/`: **322/322 bestanden**, 0 übersprungen, etwa **4,118 s**.
- `node .scripts/audit-forecast.cjs`: **22 Prüfungen, 0 Abweichungen**.
- Aktuelle Lifecycle-Datei gegen `/tmp/assets-pre-p64/`: **22/34 bestanden, 12/34 gescheitert**. Die ursprünglichen 21 Tests bestehen; unter den 13 neuen bestehen nur P65(D), zwölf scheitern. Gründe in Abschnitt 4.
- Dokumentierter älterer Vergleich „20 von 21“ separat erneut ausgeführt: **1 bestanden, 20 gescheitert, 13 neue Tests übersprungen**. Neun Fehler sind fehlende Schnittstellen/Variablen. Die korrigierte Aufschlüsselung in PROBLEME.md stimmt.

## 2. Prüfung der ursprünglichen Befunde

### P64 – Identität und ausdrückliche Übernahme

**Verbindlicher synthetischer Fall, selbst ausgeführter Test:** Alter Entwurf E1 Auto 10.000 / E2 Haus 20.000; fremder Stand E2 Haus 20.000 / E3 Reise 5.000. Eingabe 11.000 in das alte E1-Feld. Rohtext bleibt unverändert, Haus bleibt 20.000, Reise 5.000. Hinweis nennt Auto, 11.000 und „entfernt“; kein Übernehmen-Knopf für die gelöschte Zeile. Es wird nichts automatisch geschrieben.

**Verbindlicher echter Chrome-Fall:** Leser hält Renovierung 15.000 fokussiert. Writer entfernt sie, legt Reise 5.000 mit neuer ID an und schließt. Leser gibt 11.000 im alten Renovierungsfeld ein. Liste zeigt Reise 5.000; Hinweis erklärt die nicht übertragbare Renovierungseingabe. Nach Reload weiter Reise 5.000. Geladene Scriptversionen v28/v12 selbst im DOM verifiziert.

**Gleiche ID, echter Chrome:** Leser hält Reise 5.000. Writer ändert Name auf Urlaub und Betrag auf 7.000 und schließt. Leser gibt 6.000 ein. Zunächst bleibt Urlaub 7.000 gespeichert; Hinweis nennt eigene 6.000 und fremde 7.000. Erst Klick „Meine Eingaben übernehmen“ schreibt **Urlaub 6.000**, fremder Name bleibt. Reload bestätigt Persistenz.

**Bewertung der Implementierung:**

- `_newRowId` vergibt schon beim Editor-Anlegen eine Kennung, anschließend wird aus dem gespeicherten Stand neu gezeichnet. Das behebt den ursprünglichen Editor-Fall mit wiederverwendeter kleinster freier Nummer.
- `_planListMine` ermittelt abweichende Felder anhand der gezeichneten Fassung und des stabil gebliebenen `data-i` innerhalb dieses DOM-Entwurfs. `data-i` wird hier zum Vergleich mit der Ausgangszeile verwendet; die spätere Zuordnung zum gespeicherten Dokument läuft über die ID. Das ist im geprüften Entfernen-/Umordnungsfall korrekt.
- `_planListNote` speichert beim Aufbau nichts. Fehlende/leere/mehrfache Identität wird als nicht übertragbar erklärt. Übertragbare Änderungen werden erst über den Knopf ergänzt, auf einer festgehaltenen Revision.
- Der Knopf liest den aktuellen Speicher und ergänzt nur die genannten Felder; im geprüften einfachen Fall bleiben fremder Name, Jahr und andere Zeilen erhalten.
- Wenn vor dem Knopf nochmals fremd gespeichert wurde und der Hinweis noch vorhanden ist, weist die Basisprüfung den ersten Klick zurück. Der Hinweis wird mit demselben Entwurf und neuem Vergleichswert aufgebaut. Erst ein weiterer ausdrücklicher Klick übernimmt. Dieser isolierte Kontrollfall besteht.

**Eigene zusätzliche Kontrollfälle:**

| Fall | Nachweis | Ergebnis |
| --- | --- | --- |
| Umordnung bei gleichen IDs | Lifecycle-Test und eigener Mehrfachentwurf | richtige Zeile, keine Übernahme nach Position |
| Dasselbe Feld fremd geändert | Lifecycle-Test, echte Chrome-Tabs | erst Bestätigung speichert eigenen Betrag |
| Anderes Feld fremd geändert | Test: Jahr 2033; Browser: Name Urlaub | fremdes Feld bleibt |
| Mehrere eigene, im Lesefenster abgelehnte Eingaben | eigener Lauf mit E1-Betrag und E2-Name/Betrag | alle drei werden genannt und auf die richtigen IDs übertragen; fremde Jahre bleiben |
| Neue Editorzeile mit ID beim Anlegen | zwei neue Lifecycle-Tests | gespeicherte ID wird sofort gezeichnet; Editor-Löschen/Anlegen verwendet die alte Nummer nicht wieder |
| Fehlende, leere, mehrfache ID | Lifecycle-Test | nicht übertragen, eigene Werte erklärt; keine automatische Speicherung |
| Entfernen bei veraltetem Stand, zweite Zeile zuvor geändert | eigener Lauf | Entfernen nicht ausgeführt; E2s 22.000 bleiben korrekt E2 zugeordnet, nicht E1 |
| Hinzufügen bei veraltetem Stand, eigener Name geleert | eigener Lauf | neue Zeile nicht angelegt, leere Namenseingabe erhalten und erst nach Bestätigung gespeichert |
| Zahlen-/Textvergleich | eigener Lauf | 10.000 vs 10000 und äußere Leerzeichen erzeugen keine falschen eigenen Änderungen; tatsächliches Leeren wird erkannt |
| HTML-Escaping | eigener Lauf mit img-/b-Text in Name/Eingabe | Text wird genannt; kein img-/b-Element im Hinweis erzeugt |
| Live-Editor weiterer Renten/Einkünfte | eigener DOM-/Store-Lauf über `renderPensionEditor` | eigene 220 €/Monat gehen zu R1; fremdes Rentenalter 68 bleibt, R2 bleibt unverändert |
| Allgemeiner Abgleich mit Sondertilgungs-ID | Lifecycle-Test | x1 bleibt x1 nach Einfügen von x0 |
| Zeilen mit gleicher ID in getrennten Listen | eigener DOM-Lauf | Container-Namespace unterscheidet L1/p1 und L2/p1 |

**Allgemeiner Abgleich:** Die neue Mehrdeutigkeitsprüfung verhindert eine Übertragung, wenn ein Feldschlüssel mehrfach vorkommt. Aus tatsächlich gerendertem Demo-HTML wurden **61 Daten-Seiten-Kontrollen**, **21 Lebensphasen-**, **14 Positions-**, **16 Kredit-** und **26 Budget-Kontrollen** untersucht: keine als mehrdeutig markierten Kontrollen. Haushalt, das Demo-Kind, Personenrenten und Depots sind im gerenderten Daten-Seitenbestand enthalten. Das ist eine strukturelle Kontrolle der Schlüssel; keine vollständige Konflikt-Browsermatrix aller Personen-/Kinder-/Depot-/Sheet-Flows.

**Verbleibende Grenzen:** Die Entwürfe leben nur im jeweiligen Hinweisknoten und dessen Listener-Closure; weitere Neuaufbauten halten sie nicht zuverlässig (P70). IDs sind außerhalb des neuen Editor-Anlegepfads weiterhin wiederverwendbar (P71). Der Satz „gleiche ID beweist gleiche Zeile“ reicht deshalb noch nicht als globale fachliche Garantie.

Neue weitere Rentenzeilen im Daten-Bearbeiten-Modus erhalten nun ebenfalls `_newRowId('income-')`. Dieser Codepfad wurde gelesen; normale Daten-/Pensionsprüfungen der Suite bestehen. Ein eigener vollständiger Browser-Konfliktlauf dieses Form-Anlegepfads wurde nicht durchgeführt.

### P65 – Übernahme und Originalsicherung

**Ursprüngliche Fälle, selbst ausgeführte neue Tests:**

| Fall | Erwartung | Tatsächlich |
| --- | --- | --- |
| A: Altschlüssel, verzögerter erster Lock, fremdes Schema 999 | failed, freie Sperre, Rohtext/Altschlüssel erhalten, Neuversuch möglich | erfüllt; Korrektur durch gültiges anderes Dokument gelingt |
| A, Korrektur durch Entfernen | Erstübernahme nur bei dann fehlendem Hauptdokument | erfüllt; Altschlüssel erst nach Erfolg entfernt |
| B: fremdes gültiges Schema 15 während vorgemerkter Erstübernahme | vor der ersten regulären Speicherung bytegleiche Sicherung, nach weiterer Speicherung/Neustart erhalten | erfüllt |
| C: gültiger Start, vor späterer Übernahme unlesbares Dokument | kein Writer, Sperre frei, verständlicher Fehler, sicherer Neuversuch | erfüllt; `UNREADABLE` und `READ_ONLY` mit passendem Grund |
| D: gültiges aktuelles fremdes Dokument erscheint | übernehmen, nicht ersetzen | erfüllt; Kontrollfall besteht auch vorher |

**Bewertung:** Der innere Catch verschluckt den Ladefehler nicht mehr. `onPromote` wirft `UNREADABLE`, `take()` führt den vorhandenen Freigabe-/failed-Pfad aus. Ein beim Sperrerhalt bereits vorhandenes Hauptdokument lässt die vorgemerkte Erstübernahme entfallen; ein älteres Dokument wird über den regulären Commit samt Originalsicherung geschrieben. Das behebt die in FOLGE2 genannten ursprünglichen Überschreibungen und die normale Sicherungsumgehung.

**Zusätzliche Varianten, selbst ausgeführt:**

- **Unlesbarer Stand bei `resume`:** erste Antwort kann noch reader sein, solange die vorherige Lock-Haltung asynchron freigegeben wird; anschließend failed/UNREADABLE. Sperre frei, Rohtext unverändert, geschützter erneuter Versuch gelingt.
- **Unlesbarer Stand bei `allowSingle`:** bleibt unsupported, kein Schreibrecht, `writerFailure.code=UNREADABLE`, Rohtext unverändert. Nach Korrektur gelingt die erneut ausdrücklich aufgerufene Einzelmodus-Freigabe. Kein automatischer Fallback beobachtet.
- **Unlesbarer Stand bei Übergabe mit Abgabe-Marke:** Übernahmeanfrage endet failed; Sperre frei, Rohtext unverändert, keine Testbrowser-Verletzung.
- **Dokument erscheint und verschwindet vor erster Erteilung:** wenn bei Erteilung kein Hauptdokument vorliegt, werden die alten Schlüssel korrekt übernommen (Inflation 2).
- **Quota bei normaler Altschlüsselübernahme:** failed, Altschlüssel 2 erhalten, kein Hauptdokument; nach Behebung geschützter Neuversuch erfolgreich.
- **Quota bei Originalsicherung:** Hauptdokument bytegleich erhalten, Sicherung bleibt pending; nach Behebung reguläre Speicherung mit bytegleicher Sicherung erfolgreich.
- **Gültiger Fremdstand übernommen, Altschlüssel bleiben:** tatsächlich unverändert vorhanden, wie dokumentiert. Bei manuellem Entfernen nur des Hauptschlüssels und frischem Store werden diese alten Werte wieder übernommen. Dies ist ein dokumentierter Restpfad, siehe offene Entscheidung; kein Beleg, dass normales App-Zurücksetzen diesen Weg auslöst.
- **Rückkehr zum identischen alten Rohtext nach failed:** fehlerhaft, P69. Diese Variante fehlt in den neuen Tests.

**Meldungen/Knöpfe:** Die echten Anzeige- und Übernahmefunktionen wurden mit dem tatsächlich fehlgeschlagenen synthetischen Store und dem kleinen DOM ausgeführt. Deutsch: Leiste nennt unlesbare Daten und „Erneut versuchen“; erneuter Fehler erklärt unveränderte Daten; Knopf wieder bedienbar. Englisch: „View only … could not be read … stays unchanged“, „Try again“, entsprechender Dialog. Die READ_ONLY-Meldung wird durch den geladenen tatsächlichen i18n-Eintrag korrekt übersetzt. Das sind **keine Browser-Speichermanipulationen**, sondern kontrollierte Ausführung der tatsächlichen UI-Funktionen.

P55-Fristen/Quota-/Queuepfade und P63-Suspend-/Resume-/Verspätungsfälle der vorhandenen 21 Lifecycle-Tests bestehen weiterhin. P1/P34/P37-Kontrollen und normale Erstübernahme in der Gesamtsuite bestehen. Der besondere Sicherungsverlust in P69 wird von diesen normalen Fällen nicht erfasst.

## 3. Neue Befunde

| ID | Schwere | Bereich | Kurztitel |
| --- | --- | --- | --- |
| **P69** | **Hoch (P1)** | P65 / P37 | Fehlgeschlagener Ladeversuch löscht die Referenz für die Originalsicherung |
| **P70** | **Mittel (P2)** | P64 / P54 | Offener Abgleichentwurf geht bei weiterer Aktualisierung oder zweitem Entwurf verloren |
| **P71** | **Hoch (P1)** | P64 / CSV / Identität | CSV-Import verwendet gelöschte ID erneut; alte Eingabe wird der neuen Position zugeordnet |
| **P72** | **Niedrig (P3)** | P64 / Englisch | Neuer englischer Konflikthinweis enthält deutsche Feldbezeichnungen |

### P69 – Originalsicherung nach fehlgeschlagener Übernahme verloren

**Ort:** `data-store.js:960`, insbesondere `962` (Mutation vor Validierung); `982` (`onPromote`, Überspringen bei identischem `lastRaw`); Sicherung in `commit` ab `1060`.

**Ausführbare Reproduktion:** `node /tmp/followup3-store-probes.cjs`, Log `/tmp/followup3-store-probes.log`. Gemeinsamer asynchroner Testbrowser mit exklusive Locks; tatsächliche Store-Implementierung.

1. Hauptdokument enthält gültiges **Schema 15**, Rohtext `original`; es gibt keine vorhandene BACKUP_KEY-Sicherung. A ist Writer, B Reader. Bs `backupBeforeUpdate()` meldet das pending Schema-15-Original.
2. Fremdes Hauptdokument wird unlesbar: `{"schemaVersion":999}`. A verlässt; B übernimmt, endet korrekt in failed.
3. Bereits in diesem Zustand gibt Bs `backupBeforeUpdate()` **null** zurück: die bisherige Sicherungsreferenz wurde beim fehlgeschlagenen Laden gelöscht.
4. Ursache korrigieren, indem **derselbe bytegleiche ursprüngliche Schema-15-Rohtext** wieder unter dem Hauptschlüssel liegt.
5. B fordert erneut Schreibrecht an, erhält writer und speichert Inflation 3.
6. Hauptdokument wird Schema 17, aber **BACKUP_KEY=null**; das originale Schema-15-Dokument wurde nicht dauerhaft gesichert.

Ausgabe:

```text
backupBeforeFault 15
failed failed null
retry writer
after valid retry { backupRaw: false, backup: null, version: 17 }
```

**Erwartet:** Ein fehlgeschlagener Ladeversuch lässt nicht nur das aktuelle Dokument, sondern auch die zugehörige pending Sicherungsreferenz unverändert. Nach Korrektur und erster erfolgreicher Persistierung muss BACKUP_KEY exakt `original` enthalten und bei Neustart erhalten bleiben.

**Ursache:** `load(raw)` setzt `before` vor `validate(parsed)`. Bei Schema 999 wird `before=null`, danach wirft die Validierung. `current` und `lastRaw` bleiben jedoch beim früheren gültigen Dokument. Wird genau dieses wiederhergestellt, prüft `onPromote` `raw===lastRaw` und lädt nicht erneut; die Sicherungsreferenz wird nicht repariert. `commit` schreibt den migrierten Stand ohne Original.

**Behebung:** Laden/Validieren/Migrieren einschließlich der Kandidaten-Sicherungsreferenz zunächst ohne Mutation des Store-Zustands abschließen. Erst nach vollständigem Erfolg Dokument, Rohtext, Sicherungsmetadaten und Revision gemeinsam übernehmen. Ein failed-Neuversuch darf nicht mit bereits beschädigten Metadaten weiterlaufen.

**Regressionstest:** `P65/P37: identischer Schema-15-Rohtext nach failed erhält seine Originalsicherung`. Pending Original vor Fehler, unveränderte Referenz nach Fehler, Wiederherstellung bytegleich, Neuversuch, erfolgreiche Änderung, BACKUP_KEY bytegleich und Neustartkontrolle. Varianten für `reload`, `resume` und ausdrücklich aufgerufenes `allowSingle` mit prüfen.

**Einordnung:** Die frühe Metadatenmutation existierte bereits. Der neue sauber gemeldete failed-/Retry-Pfad macht die Lücke nun nachvollziehbar sichtbar; nicht behauptet, diese Runde habe die frühe Zuweisung neu eingeführt. Das ursprüngliche unlesbare Fremddokument wird inzwischen geschützt – der Fehler liegt im nachfolgenden Recovery-/Sicherungspfad.

### P70 – Hinweis und eigene Eingaben überleben Aktualisierungen nicht

**Ort:** `index.html:10857–10860` (je Neuaufbau neue gezeichnete Fassung), `10896–10899` (`_planListNote` zeichnet neu); `7222` (`_uiBusy`) und `7235` (`_applyExternalChange`). Der offene Listenhinweis wird nicht als laufende Bearbeitung gehalten.

**Reproduktion im echten Chrome:**

1. Leser D hält Urlaub 6.000; Writer C speichert 7.000 und schließt.
2. D gibt 6.500 ein. Der neue Hinweis zeigt eigene **6.500**, fremde 7.000 und „Meine Eingaben übernehmen“.
3. Neuer Tab E fordert Bearbeitung an. Er erhält sie **trotz offenem Hinweis**.
4. E speichert 8.000. D zeigt danach nur Urlaub 8.000; **Hinweis und eigene 6.500 verschwinden**. D hat weder bestätigt noch verworfen. Knopfanzahl „Meine Eingaben übernehmen“ ist 0.

**Zusätzliche ausführbare Variante:** `node /tmp/followup3-probes.cjs`, Log `/tmp/followup3-probes.log`.

- B erhält ersten Hinweis für Auto: eigene 11.000, fremde 12.000.
- Ein anderer Store speichert Auto 13.000 und Haus 21.000; B erhält das Schreibrecht wieder.
- B bearbeitet ein anderes Feld, Haus 22.000.
- Der neue Hinweis nennt nur noch Haus 22.000. Auto 11.000 ist verloren. „Übernehmen“ speichert Auto 13.000 / Haus 22.000.

Das zweite Beispiel prüft den Listen-Editor und echten Store; der App-Harness ersetzt den allgemeinen Seitenaufbau. Es ergänzt den realen Browserfall, ersetzt ihn nicht.

**Erwartet:** Eigene offene Änderungen bleiben getrennt vom neu gezeichneten Speicherstand erhalten, bis sie ausdrücklich übernommen oder verworfen wurden. Weitere fremde Speicherung bzw. zusätzliche eigene Eingabe aktualisiert den Abgleich, ohne frühere offene Felder zu löschen. Der Hinweis darf nicht durch einen normalen Neuaufbau verschwinden.

**Ursache:** `mine` ist nur lokales Closure des aktuellen Hinweises. Das Neuzeichnen setzt `drawn` auf den frischen Stand; weitere `_planListMine`-Aufrufe kennen den früheren Entwurf nicht mehr. `_uiBusy` erkennt Edit-Modus, Sheet, einige Panels/Overlays und fokussierte Eingabefelder, aber keinen offenen Listen-Abgleich. Nach Neuaufbau ist das alte Eingabefeld vom DOM getrennt; normale Fremdaktualisierung kann den gesamten Hinweis entfernen.

**Behebung:** Offenen Entwurf als Zustand je Liste/ID/Feld halten, nicht nur im Hinweisknoten. Seiten-/Listenaufbauten müssen ihn wieder darstellen und weitere eigene Eingaben ergänzen. Ein offener Abgleich ist eine laufende Bearbeitung für Übergabe-/Neuaufbaulogik; wenn fremde Aktualisierungen dennoch eingelesen werden, muss der Entwurf unabhängig davon erhalten bleiben. Nur ausdrückliches Verwerfen entfernt ihn.

**Regressionstests:**

- `P64/P54: Fremdspeicherung erhält offenen Listen-Abgleich`: Hinweis 6.500 bleibt nach weiterer Speicherung 8.000 erhalten, gespeicherte 8.000 unverändert, neuer Vergleichswert angezeigt; keine automatische Speicherung.
- `P64: zweiter Konflikt ergänzt vorhandene eigene Felder`: Auto 11.000 plus Haus 22.000 beide erhalten, Übernahme nur bewusst und auf aktuellem Stand.
- Echter Browser bzw. integrierter DOM-/Start-/Storage-Lauf mit vollständigem Seitenneuaufbau, nicht nur isolierter Editor. Zusätzlich normalen Hintergrund-/Sichtbarkeitsneuaufbau und Entfernen/Hinzufügen bei offenem Hinweis prüfen.

**Einordnung:** Neue Verluststelle des neuen Listenhinweises. Sie ist vom bekannten zweiten Einrichtungskonflikt P67 und vom Sprachwechsel P68 unabhängig; hier bleibt die Sprache gleich und es geht um Live-Listen.

### P71 – Wiederverwendete IDs über den tatsächlichen CSV-Import

**Ort:** `data-store.js:108` (`nextId`), `114–126` (`idsFor`, Nummern-/Namensabgleich); `index.html:4489–4501` (CSV-Ereignisse ohne IDs); `_planListNote` `10897–10905`, Übernahme `10921–10923`.

**Ausführbare Reproduktion:** `node /tmp/followup3-id-reuse.cjs`, Log `/tmp/followup3-id-reuse.log`. Der tatsächliche `handleCsvUpload`-Pfad wird über `a.csv()` ausgeführt; CSV ausschließlich als synthetischer Text im MemoryStorage-Harness.

1. B hat alten Entwurf mit `event-1 Auto 10.000` und `event-2 Renovierung 15.000`.
2. A entfernt Renovierung. Aktueller Speicher enthält nur noch event-1.
3. A importiert:

```csv
Typ;Name;Jahr;Betrag;Von;Nach
prognose-ereignis;Auto;2030;10000;*;
prognose-ereignis;Reise;2032;5000;*;
```

4. Die neue Reise erhält vom Adapter **event-2**, also Renovierungs gelöschte ID. A schließt; B übernimmt.
5. B gibt 11.000 im alten Renovierungsfeld ein. Der Hinweis nennt **Renovierung**, eigene 11.000, „inzwischen gespeichert: 5000“ und bietet **Meine Eingaben übernehmen**. Er meldet nicht, dass Renovierung entfernt wurde.
6. Klick schreibt **Reise 11.000**, obwohl die Eingabe Renovierung galt.

Ausgabe:

```text
after actual CSV: event-1 Auto 10000; event-2 Reise 5000
note: „Renovierung“ ... „11000“ ... gespeichert: 5000 ... Meine Eingaben übernehmen
after Apply: event-1 Auto 10000; event-2 Reise 11000
```

In diesem Nachweis ist Reise eine Ausgabe aus liquiden Mitteln. Der fachlich falsche Abgleich erhöht ihre geplante Ausgabe um 6.000 €. Anders als im alten P64-Fall ist ein Klick nötig; er legitimiert aber eine nicht nachgewiesene, falsche Identität.

**Erwartet:** Neue Reise hat eine neue Lebenszeit-Kennung oder ein verlässliches Import-/Generationsmerkmal verhindert den alten Abgleich. Der alte Renovierungsentwurf wird als nicht übertragbar erklärt und darf Reise nicht verändern.

**Ursache:** `_newRowId` schützt nur die umgestellten Editor-Anlegewege. `nextId`/`idsFor` kennen entfernte IDs nicht und verwenden weiterhin die kleinste freie Nummer. Der CSV-Import liefert keine eigenen IDs. Die neue Abgleichlogik setzt jedoch voraus, eine gespeicherte ID bezeichne über alle Änderungen hinweg dasselbe fachliche Objekt. Eindeutigkeit innerhalb des aktuellen Arrays ist dafür nicht ausreichend.

**Behebung:** Identität über alle Erzeugungswege sichern, insbesondere importierte neue Zeilen und Legacy-/Namensabgleich. Für neue Objekte keine gelöschten Lebenszeit-IDs erneut vergeben. Wenn ein Import keine belastbare Identität liefert, betroffene alte Entwürfe nicht automatisch derselben ID zuordnen; ggf. Import-/Dokumentgeneration zur Entwurfsbasis ergänzen. Bestehende Referenzen und Legacy-Kompatibilität dabei erhalten. Ein Namensvergleich ist kein Ersatz für eine Lebenszeit-Kennung, weil legitime Renames unterstützt werden.

**Regressionstest:** `P64: CSV nach Löschen verwendet eine neue Identität und trifft keinen alten Entwurf`. Tatsächlichen CSV-Parser verwenden; Auto bleibt erhalten, Reise 5.000, Renovierung 11.000 wird nur als nicht übertragbar genannt. Zusätzlich weitere Renten/Einkünfte und relevante Migration-/Importpfade prüfen.

**Einordnung:** Der Nummernallocator ist älter. Die Umsetzung behauptet Schutz durch stabile IDs und verbessert den Editor, lässt aber diesen ausdrücklich im Auftrag genannten Restpfad offen. Dieser neue Nachweis zeigt die weiterhin mögliche fachliche Fehlzuordnung über den normalen Import.

### P72 – Neue englische Konfliktzeile bleibt teilweise deutsch

**Ort:** `index.html:10903`, `escHTML(m.col.label)` ohne Übersetzung vor Einbettung in den bereits englischen Gesamtsatz; Spaltenbezeichnungen ab `10790`/`10795`.

**Reproduktion im echten Chrome:** Sprache Englisch, Konflikt beim Betrag derselben Ereignis-ID. Der Hinweis lautet:

```text
Not saved: the list was changed in another window in the meantime. This now shows the current state.
„Urlaub“ · Betrag €: your entry „8500“ – saved meanwhile: 9000.
Apply my entries / Discard
```

Das Feld daneben heißt korrekt **Amount €**. Gleicher Befund im 375-px-Durchlauf mit eigener 10.500 und fremder 11.000.

**Erwartet:** „Amount €“ statt „Betrag €“, entsprechend übersetzte Bezeichnungen für weitere deutsche Spalten.

**Ursache:** Die einzelnen Spaltenlabels werden normalerweise als getrennte DOM-Texte übersetzt. Im neuen Hinweis sind sie in einen dynamischen Gesamtsatz eingebettet; die bestehende Übersetzung des Einzeltexts greift dort nicht.

**Behebung:** Spaltenlabel vor dem Zusammensetzen sprachabhängig auflösen. Text weiterhin escapen; keine Übersetzung auf Basis ungesicherter HTML-Fragmente.

**Regressionstest:** `P64: Konflikthinweis verwendet lokalisierte Spaltenlabels`. Echter i18n-Lauf mit Betrag/Jahr/Von/Nach bzw. Rentenspalten, nicht nur `_lang='en'` ohne Übersetzungsebene.

**Abgrenzung:** P52 enthält bereits bekannte teilweise deutsche dynamische Validierung. Dieser Befund betrifft den **in dieser Runde neu eingeführten Abgleichhinweis**; dessen bisheriger allgemeiner Konflikttoast war Englisch. Andere alte Sprachlücken werden nicht erneut gemeldet.

## 4. Testqualität, Gegenprobe und Dokumentation

### Mini-DOM: was es leistet

Die neuen P64-Tests bauen aus dem tatsächlich gerenderten HTML einen Elementbaum, suchen darin Kontrollen, ändern Werte über `type`, lösen input/change aus und klicken tatsächliche Editor-Knöpfe. `_planListEditor`, seine Listener, der Abgleich und der tatsächliche Store werden durchlaufen. Das ist deutlich aussagekräftiger als bloßes Setzen einer Attrappen-ID.

Für die geprüften Basisfälle unterstützt mini-dom ausreichend:

- relevante Tag-/ID-/Klassen-/Attribut-/Nachfahrenselektoren;
- DOM-Neuaufbau, `closest`, data-i/data-row-id, Entfernen/Einfügen;
- Inputwerte, häufige Select-Auswahl, bubbling Events;
- Handlerfehler werden wie Browser-Listenerfehler an einen Fehlerkanal weitergegeben.

**Grenzen:**

- Kein vollständiges Browser-DOM oder Browser-Ereignismodell. Capture-Optionen werden nicht modelliert; `focus()`/`blur()` lösen selbst keine nativen Fokusereignisse aus; `type` simuliert einen vereinfachten Ablauf.
- Entfernen fokussierter DOM-Knoten synchronisiert nicht den gesamten App-Dokumentfokus. Das separate Mini-DOM wird nur über `getElementById` eingebunden; allgemeine Dokumentselektoren und `_uiBusy` sehen nicht zwingend denselben Baum/Fokus.
- Select-Setter und Radios sind vereinfacht: fehlende Select-Optionen und native wechselseitige Radio-Abwahl werden nicht vollständig nachgebildet. Layout, readonly/disabled, Form-Defaults, echter Datepicker, tatsächliche Reloads und bfcache fehlen.
- Der Standard-App-Harness ersetzt `buildDynamicForm`, Renderfunktionen und Navigation. Ein isolierter Live-Editor wird dadurch nicht wie bei echter Seitenaktualisierung zerstört. **P70 konnte deshalb trotz grüner Tests im Browser auftreten.**
- Listenerfehler werden in `doc.errors` gesammelt; die Tests sollten unerwartete Einträge ausdrücklich ausschließen. Ein geschluckter Fehler ist kein erfolgreicher UI-Ablauf.

Fazit: geeignet als kleiner Komponenten-/Adaptertest, aber kein vollständiger Browserersatz. Der echte Chrome-Gegenlauf ist notwendig und bestätigt sowohl die Grundkorrektur als auch den Integrationsverlust.

### Die 13 neuen Tests gegen den Vorher-Stand

In `/tmp/followup3-old/` liegen die aktuellen übrigen Module und Tests; index.html, data-store.js, i18n-en.js sowie sw.js stammen aus `/tmp/assets-pre-p64/`. Die Prüfsummen stimmen mit dortigem SHA256SUMS überein:

```text
index.html    85bd4f30ece591dc8b6764c53f5c7fb70d2d6bba02f02e18a27b70e49badf282
data-store.js 50d5eeff98c4fe0155d1db6cd74bcb45e2921563264c170ef1e2826ecc572e90
i18n-en.js    a3b0476a4cfe8fea0fa39853137a90ff5d924b830203ef59fc78d286067f87d8
sw.js         a8d17ba8d255e6ddc166048296ac387ca2acf744ddda3121392da419afbd85ec
```

Lauf: `node --test /tmp/followup3-old/.tests/writer-lifecycle.test.cjs`.

| Test-Nr. / neuer Fall | Vorheriges Ergebnis | Einordnung |
| --- | --- | --- |
| 22 P64 verbindlich | Haus wird 11.000 statt 20.000, Rohtext geändert | fachlicher Altfehler |
| 23 gleiche ID, gleiches Feld | eigener Betrag wird ohne Bestätigung gespeichert | fachlicher Altfehler |
| 24 gleiche ID, anderes Feld | Betrag wird ohne Bestätigung gespeichert | fachlicher Altfehler |
| 25 Umordnung | falsche Zeile wird geändert / automatisch gespeichert | fachlicher Altfehler |
| 26 fehlende/mehrfache ID | neuer Hinweis fehlt, Zugriff auf dessen textContent ergibt TypeError | fehlendes UI-Verhalten, **keine fehlende neue JS-Schnittstelle**; explizites assert auf Hinweis wäre klarer |
| 27 neue Zeile | gespeicherte ID wird nicht sofort im Editor gezeichnet | fachlicher Identitäts-/UI-Fehler |
| 28 allgemeiner Abgleich | x1s 150 landen nach Einfügen bei x0 | fachlicher Altfehler |
| 29 P65 A | writer statt failed | fachlicher Fehlerpfad |
| 30 P65 A / Entfernen | writer statt failed beim ersten Fehler | fachlicher Fehlerpfad; spätere Recovery-Assertions werden dort nicht erreicht |
| 31 P65 B | Original schon Schema 17 statt unverändert Schema 15 | fachlicher Altfehler; spätere Sicherungs-/Neustart-Assertions nicht erreicht |
| 32 P65 C | writer trotz unlesbarem Stand | fachlicher Fehlerpfad |
| 33 P65 D | besteht | Kontrollfall, keine neu behobene Regression |
| 34 gelöschte ID | neue Editorzeile verwendet wieder event-2 | fachlicher Identitätsfehler |

**12/13 neue Fehler und ein Kontrollfall sind bestätigt.** Anders als beim früheren „20/21“-Lauf scheitern sie nicht bereits an fehlenden Methoden wie revision/suspend. Der TypeError in Test 26 bezeichnet einen fehlenden Hinweis; er sollte künftig als absichtliche UI-Assertion formuliert sein.

Die Alt-Gegenprobe prüft jeweils nur bis zum ersten Fehler. Sie beweist daher nicht, dass jede nachfolgende Assertion am alten Stand erreicht wurde; die Dokumentation sollte diese Grenze weiterhin beachten.

### Prüfung der korrigierten „20 von 21“-Aufschlüsselung

Die aktuelle Datei wurde zusätzlich in `/tmp/followup3-pre54/` mit den älteren index/data-store/i18n-Dateien aus `/tmp/assets-pre-p54/` ausgeführt:

```sh
node --test --test-name-pattern='^(P54|P55|P63|P34/)' /tmp/followup3-pre54/.tests/writer-lifecycle.test.cjs
```

Ergebnis: 20 Fehler, ein bestandener 3-s-Start-Kontrollfall, die 13 neuen P64/P65-Tests übersprungen. Neun der 20 Fehler sind fehlende APIs/Variable, zwei Quota-Ablehnungen, einer hängende Anfrage, acht Verhalten-/Werte-/Zustandsfehler. Kredit-/Kinder-Test erreicht seine Kinderhälfte nicht; der Konkurrenztest scheitert erst beim alten Aufräumen. **Die ergänzte Aufschlüsselung in PROBLEME.md ist korrekt.**

### Dokumentation gegen Code

Die wesentlichen Korrekturen aus FOLGE2, Abschnitt 7, sind aufgenommen:

- UNREADABLE/failed und Freigabe sowie Übernahme statt ungesicherter Erstübernahme beschrieben;
- Originalsicherung des übernommenen älteren Fremddokuments über regulären Commit beschrieben;
- Ereignisabgleich über IDs und ausdrücklichen Knopf statt gleicher Zeilenanzahl beschrieben;
- P66–P68 ausdrücklich als offene Grenzen genannt;
- 20/21-Zähler fachlich aufgeschlüsselt;
- P65(D) korrekt als Kontrollfall bezeichnet;
- Browser-/Simulationsnachweise getrennt, Schema/Script-/Cacheversionen konsistent.

**Noch zu weitgehend:** „Original dauerhaft erhalten“ deckt P69 nicht ab; „alle eigenen Eingaben“ ohne Verlust über weitere Aktualisierungen deckt P70 nicht ab; „nie die einer gelöschten Zeile“ gilt für den neuen Editorpfad, nicht für den CSV-/Adapterpfad P71. Diese Aussagen nach den Korrekturen präzisieren. In der vorhandenen P54-Tabelle steht weiterhin die ältere Attrappenfeld-Aussage, 3.200 blieben nach Neuaufbau im Sheet; der reale unveränderte Kontrollfall zeigte im früheren Review den aktuellen Wert 4.000. Das ist eine bereits bekannte Nachweisgrenze, kein neuer Befund.

## 5. Geprüft ohne weiteren Befund

- Gesamtsuite und numerischer Audit bestehen. Dies ist keine neue vollständige fachliche Freigabe der Prognose; P39–P53 und P56–P62 bleiben außerhalb dieser Runde offen.
- P1-Konflikterkennung, P34-Schreibrecht/Übergabe, P55-Fristen/Queue-/Quota-/Knopfpfade und P63-Suspend/Epochen bleiben in den ausgeführten Tests intakt.
- Echte Chrome-Navigation: Writer vollständig zu `demo_backup.json`, JSON-Ziel sichtbar; anderer Tab übernimmt ohne Rückkehr. Zurück ist der alte Tab Leser. Kein neuer P63-Rückschritt beobachtet.
- Normale Erstübernahme und P37-Sicherung sowie deren Quota-Abbruch erhalten das Original; besonderer fehlgeschlagener Lade-/Restore-Pfad P69 separat.
- Grundabgleich über echte gespeicherte IDs und explizite Bestätigung in Chrome funktioniert; keine automatische Speicherung im ursprünglichen Konfliktfall.
- Fremde andere Felder bleiben bei geprüfter Bestätigung erhalten; Ereignis- und Renteneditor haben passende eigene Kontrollfälle.
- Allgemeine Schlüsselprüfung der tatsächlich gerenderten genannten Demo-Kontrollen zeigt keine neu künstlich mehrdeutigen Felder. Sondertilgungs- und Container-Namespace-Kontrollen bestehen.
- HTML-Escaping von Namen/Eingaben im Hinweis besteht in der kontrollierten DOM-Prüfung.
- 375×812 im echten Chrome: Konflikthinweis x=36, Breite=303, Höhe≈183,48 px; Knöpfe innerhalb dieser Breite. Separater mobiler Ablauf über bottom navigation, Klick „Apply my entries“ erfolgreich, danach Urlaub 10.500 auch nach Reload. Screenshot der ersten Größenumstellung war teilweise von Navigation überlagert und wurde nicht als vollständige Sicht-/Bedienprüfung gewertet. Kein iPhone-Nachweis.
- Versionsbezüge v28/v12 und Cache v126 passen; tatsächliche Chrome-Script-URLs vor relevanten Läufen verifiziert. Erster gecachter Start war noch v27/v11; nach Reload aktueller Stand, daher keine falsche Zuordnung dieses Starts zur neuen Umsetzung.

**Lokaler Performance-Mikrovergleich:** unveränderte Demo, 30 Durchläufe je Version, erste fünf verworfen, Node/MemoryStorage:

| Operation | Vor P64/P65, Median | Aktuell, Median |
| --- | ---: | ---: |
| Store laden/validieren/migrieren | 0,879 ms | 0,849 ms |
| Inflation speichern/validieren/serialisieren | 1,638 ms | 1,733 ms |

Keine relevante Regression in dieser kleinen Speicherpfadprobe; Unterschied beim Speichern ≈0,095 ms. Kein Browser-Kaltstart-, echter LocalStorage-, Chart-, Netzwerk- oder iPhone-Benchmark. Die Testsuite enthält Wartepfade und ist keine Messung der App-Startzeit.

## 6. Grenzen und offene Entscheidungen

### Automatisierte Nachweise

322 Tests, 22 Auditprüfungen, aktuelle Lifecycle-Datei gegen zwei Vorher-Stände, eigene zusätzliche Store-/DOM-/Import-/Recovery-/UI-Text-/Performance-Skripte. Tatsächliche Implementierung und gespeicherte Werte wurden geprüft; vereinfachte DOM-/Lock-/Storagebestandteile sind jeweils gekennzeichnet. Simulierte Suspend-/Freeze-/Crashabläufe sind keine tatsächlichen Betriebssystemereignisse.

### Tatsächlich ausgeführte Browserprüfungen

**Echtes Chrome**, verbundenes Profil **Lukas**, installierte Version **155.0.8059.40** laut Info.plist; keine eigene unabhängige Laufzeitversionsabfrage. Alle Browseraktionen über `cua_repl`, ausschließlich eigene temporäre Tabs auf **http://127.0.0.1:8124/**. Kein eigenes leeres Browserprofil; der vorhandene isolierte Demo-Speicher aus früheren Prüfungen wurde verwendet und mit synthetischen Namen/Beträgen/Sprache bedient.

Selbst gesehen und protokolliert: ursprünglicher P64-Fall inklusive Reload; gleiche ID inklusive Bestätigung, fremdem Namen und Reload; P70-Hinweisverlust bei einer weiteren Übernahme/Fremdspeicherung; neuer englischer Hinweis; tatsächliche 375-px-Geometrie und erfolgreich bediente Bestätigung mit Persistenz nach Reload; P63-Navigation/Zurück. Abschließende Abfrage der error-Konsole des letzten neu angelegten Kontrolltabs war leer; kein umfassender Fehlerfreiheit-Nachweis sämtlicher Tabs daraus abgeleitet.

P65 wurde **nicht im echten Browser durch Manipulation des Hauptdokuments** geprüft. Die vorhandenen erlaubten Browserauswertungen sind read-only/DOM-basiert; unbekannte Rohdokumente wurden ausschließlich in isoliertem MemoryStorage eingelegt. Leiste/Übernahmedialog/Lesemodus sind separat kontrollierte Ausführung der tatsächlichen Funktionen, keine echte Browserfault-Injektion.

Keine selbst protokollierten echten `pagehide.persisted`-/`pageshow.persisted`-Werte, keine Bestätigung des bfcache-Navigationstyps, keine gemeinsamen Writer-Intervalle echter Tabs. Die erfolgreiche Navigation beweist den konkreten Freigabe-/Rückkehrablauf, nicht seine Engine-interne Cacheursache.

Alle eigenen Tabs geschlossen, Größenänderungen zurückgesetzt. Keine produktiven Tabs, Port 8123 oder produktive file://-App geöffnet/bedient. Keine Sicherheits-/Erweiterungsrechte verändert. Projekt-Demo und Sicherungsdateien unverändert; Browseränderungen ausschließlich in der isolierten Demo.

### Nicht geprüfte Plattformen und Integrationen

Safari macOS/iOS, native iPhone-PWA, Firefox, file:// in eigenem Leerprofil, tatsächlicher OS-/Browserabsturz oder Browser-Freeze, echte Geräte-Quota, vollständige Mehrfenster-/Fokus-/Reload-Matrix aller Sheets und Daten-Bearbeiten-Flows, sämtliche CSV-/JSON-/Migrationsidentitäten, Offline-Upgrade mit gemischten Appversionen. Der mobile Chrome-Viewport ersetzt keine Safari-/iPhone-PWA-Prüfung.

### Entscheidungen und Empfehlungen

1. **Zuerst P69 und P71:** Laden muss Store-Zustand atomar übernehmen; Identität muss auch über Import-/Adapterpfade hinweg belastbar sein. Die ursprünglichen Fixes beibehalten und mit Recovery-/Importketten erweitern.
2. **P70 vor Mehrfensterfreigabe:** Entwürfe dauerhaft als UI-Zustand halten und normale Aktualisierungen/Übergaben berücksichtigen. Ein Hinweis mit Listener-Closure ist kein ausreichender Entwurfsspeicher.
3. **Zurückbleibende Altschlüssel:** Die bewusste „unberührt lassen“-Entscheidung schützt zunächst gegen Datenverlust. Sie ermöglicht aber nach manuellem Entfernen des Hauptschlüssels eine erneute Übernahme veralteter Werte. Empfehlung: klarer Marker bzw. ausdrücklicher Wiederherstellungsweg statt stiller Wiederverwendung bereits abgelöster Schlüssel. Normales App-Zurücksetzen schreibt ein leeres Hauptdokument; dieser manuelle Entfernen-Fall darf nicht als aktuell bestätigter App-Resetfehler bezeichnet werden.
4. **Einzelmodus:** bleibt ausdrückliches Notverfahren mit P1/P54; keine Exklusivitätsgarantie. In dieser Runde kein automatischer unsicherer Fallback gefunden. Für tägliche Mehrfensterzusagen geschützten Modus voraussetzen.
5. **Tests:** Komponenten-Mini-DOM weiter nutzen, aber echte Seitenaktualisierung, Fokusverlust, offene Entwürfe und Import-/Recoveryketten ergänzen; unerwartete doc.errors assertieren. Gegenproben bis zum ersten Fehler nicht als Ausführung jeder nachfolgenden Assertion darstellen.
6. **Bekannte Lücken:** P66–P68, P56–P62 und P39–P53 unverändert offen. Kein erneutes Numerieren dieser Punkte. P72 kann zusammen mit der neuen Hinweisoberfläche bzw. der späteren Sprachrunde korrigiert werden.

## 7. Integrität und Reproduktionsartefakte

Vor Beginn wurden **86 Projektdateien außerhalb `.git`** per SHA-256 erfasst, einschließlich der drei vorhandenen Prüfberichte, App, Tests, Demo, Dokumentation und ungetrackter Dateien. Baseline `/tmp/followup3-baseline.json`. **Abschlussvergleich: 86/86 vorhandene Dateien bytegleich, keine gelöscht; genau eine neue Datei: `.docs/REVIEW_2026-10_FOLGE3.md`.** Ergebnis `/tmp/followup3-integrity.json`. Insbesondere alle drei früheren Berichte, App, Tests, Demo und vorhandene Dokumentation sind unverändert.

Eigene Artefakte unter `/tmp`:

- `followup3-baseline.json`, `followup3-integrity.json` – Anfangsprüfsummen und Abschlussvergleich.
- `followup3-suite.log`, `followup3-audit.json` – Pflichtläufe.
- `followup3-index.diff`, `followup3-store.diff` – Vergleich mit Vorher-Kopie.
- `followup3-old/`, `followup3-old-tests.log` – 34-Tests-Gegenprobe, vier gesicherte Vorher-Dateien.
- `followup3-pre54/`, `followup3-pre54-tests.log` – erneute Gegenprobe der früheren 21 Tests.
- `followup3-helper.cjs` – aus Testcode extrahierte Hilfen unter /tmp, tatsächliche Projektmodule unverändert geladen.
- `followup3-store-probes.cjs`, `.log` – P69 und zurückbleibende Altschlüssel.
- `followup3-probes.cjs`, `.log` – Verlust früherer offener Listenänderung beim zweiten Entwurf.
- `followup3-id-reuse.cjs`, `.log` – tatsächlicher CSV-Import und falsche Identität.
- `followup3-controls.cjs`, `.log` – tatsächliche gerenderte Daten-Seite, Kontrollschlüssel/Namespaces.
- `followup3-extra-controls.cjs`, `.log` – gerenderte Phasen-/Positions-/Kredit-/Budget-Sheets, Mehrdeutigkeit.
- `followup3-list-cases.cjs`, `.log` – mehrere Leserentwürfe und weiterer Renteneditor.
- `followup3-store-boundaries.cjs`, `.log` – resume, allowSingle, Quota, Dokument erscheint/verschwindet.
- `followup3-note-cases.cjs`, `.log` – Escaping und wiederholte Bestätigung auf neuer Basis.
- `followup3-remove-cases.cjs`, `.log` – Entfernen/Hinzufügen bei stale, data-i, Zahlen/Text/leerer Name.
- `followup3-handover.cjs`, `.log` – UNREADABLE bei Übergabe mit Marke.
- `followup3-unreadable-ui.cjs`, `.log` – tatsächliche UNREADABLE-Anzeige-/Übernahmefunktionen und Übersetzung.
- `followup3-performance.cjs`, `.log` – kleiner Speicherpfadvergleich.
- `followup3-browser.md` – selbst bediente Browserabläufe, Profile/Versionen und Grenzen.

Keine bestehenden Projektdateien geändert, keine produktiven Daten benutzt, keine Demo-/Sicherungsdateien geändert. Kein Commit, Push oder Deployment durch dieses Review.

# Daten – Seite, Speicherung und Sicherung

Stand: 14.10.2026, Code-Stand `7504901` (Schema 12). Funktionsnamen beziehen sich auf
`index.html` bzw. `data-store.js`; Zeilennummern sind Näherungswerte.

Verwandt: [README.md](README.md) · [DATA_MODEL.md](DATA_MODEL.md) (Sicherungsformat und
Schema-Historie, maßgeblich) · [VERMOEGEN.md](VERMOEGEN.md) · [BUDGET.md](BUDGET.md) ·
[PROGNOSE.md](PROGNOSE.md) · [EINRICHTUNG.md](EINRICHTUNG.md)

---

## 1. Zweck

Die Daten-Seite (`#page-import`) ist der einzige Ort, an dem Werte erfasst und geändert werden:

- Monatsstand,
- Positionen und Kredite,
- Altersvorsorge,
- Budget,
- Prognose-Annahmen,
- Einstellungen, Sicherung, Hilfe.

Sie gliedert sich in Abschnitte, die über Bereichsschalter ein- und ausgeschaltet werden.

---

## 2. Seitenaufbau (`buildDynamicForm`, Z. ≈8319)

| Abschnitt | Inhalt | Bearbeitung |
| --- | --- | --- |
| **Aktueller Stand** (`_monthCardHTML`) | Monat, Summe, Hinweis, ob er berechnet oder unbestätigt ist; Knopf „Aktualisieren“ | Monats-Sheet `openMonthSheet()` |
| **Nach dem Update** (`_migrationCardHTML`, Schema 16) | nur wenn eine Migration etwas nicht eindeutig übernehmen konnte (Review P35–P37): Gehalt einer Person zuordnen, Kinder-Jahrgang klären, Teilzeit ab Alter optional umstellen; dazu „Stand vor dem Update sichern“. Bis zur Klärung rechnet die App wie die frühere Version | je Punkt ein Sheet mit Vorher/Nachher: `openNetIncomeSheet`, `openChildYearSheet`, `openPartTimeSheet` |
| **Nach und nach ergänzen** (`_nextStepsHTML`) | bis zu 3 Vorschläge, ausblendbar | Vorschlag startet ein Sheet oder eine Mini-Einrichtung (siehe EINRICHTUNG.md) |
| **Haushalt** (`data-sec=household`, seit Schema 14, immer sichtbar) | Jede Person als eigene Karte mit Kopf (Initiale, Name, Rolle, Jahrgang) und Kontext (was ihr zugeordnet ist: Gehalt aus dem Budget, Rente, Pension, Depots, weitere Einkünfte, Kinderzulage; bei Kindern Kindergeld mit Enddatum). Unter dem Kopf jeder erwachsenen Person ein Zeitstrahl mit „In den Lebensphasen ändern“ (öffnet das Lebensphasen-Sheet bei dieser Person): bei „Ich“ die vier Phasen, bei weiteren Personen „Vollzeit → Teilzeit → ohne Arbeit → Rente“ in ihrem Alter. Arbeitszeit und Altersvorsorge je Phase, Arbeitsende und Rentenbeginn stehen nur im Lebensphasen-Sheet (Entscheidung 14.10.2026). Im Kontext steht das Gehalt je Abschnitt („3.200 €/Monat bis 50, dann 1.600 € (50 %) bis 60“). „Ich“: Name (seit 15.10.2026; leer = „Ich“, sonst überall, wo du neben anderen Personen stehst: Haushalt, Lebensphasen, Einkommen im Ruhestand, Auswahl „Für“ und „Person“), Geburtsjahr und -monat, im Bearbeiten-Modus änderbar (seit 14.10.2026 nur hier, nicht mehr unter „Prognose & Annahmen“; unverändert wird nichts geschrieben). Weitere Personen: Name und Geburtsjahr; ihre gesetzliche Rente und Beamtenversorgung stehen unter Altersvorsorge, im Kontext als Ergebnis („Gesetzliche Rente 960 € netto ab 67“). Kinder: Name, Geburtsjahr, Geburtsmonat, Kindergeld bis 18/25, Kinderzulage bei. Die Zeile „Name“ erscheint nur im Bearbeiten-Modus. Unterzeile des Abschnitts: Personen, Kinder, Kindergeld | **Bearbeiten-Modus** → `saveEntry()` (`lt-drv-extra` mit den Phasenwerten aus dem gespeicherten Stand über `_withPersonPhases`, `lt-children`); ein Kind ohne Geburtsjahr wird mit Hinweis abgelehnt |
| **Vermögenswerte** (`data-mod=assets`) | Liste der Positionen (`_assetListHTML`) | Sheet je Position `openAssetSheet(id)`, neu `openAddAssetSheet()` |
| **Verbindlichkeiten** (`data-mod=liab`) | Liste der Kredite (`_liabListHTML`) | `openLoanSheet(id)`, neu `openAddLiabSheet()` |
| **Altersvorsorge** (`data-mod=pension`) | Jede Altersvorsorge gehört zu einer Person (Entscheidung 14.10.2026). **Gesetzliche Rente** je Person als Karte mit Kopf: deine mit Rentenwert, Ø-Entgelt und BBG (gelten für alle), weitere Personen mit Rentenpunkten, Brutto, Rentenbeginn (ihr Alter), Abzügen und Erwerbsminderung (`_pvDrvRowsHTML`); leere Karten nur im Bearbeiten-Modus. **Beamtenversorgung** je Person (`dpBv` für dich, `_pvBvRowsHTML` für weitere Personen, Schema 17), im Bearbeiten-Modus „+ Beamtenversorgung · Name“. Altersvorsorgedepots und weitere Renten & Einkünfte mit „Für“ eine Person; Ergebnis je Karte live (`_pvResults`) | **Bearbeiten-Modus** → `saveEntry()`; Personen werden aus Haushalt und Altersvorsorge zusammengeführt (`_mergePersonRows`): fehlt ein Bereich, bleibt sein gespeicherter Stand |
| **Einnahmen & Ausgaben** (`data-mod=budget`) | automatische Kreditraten, Depots und Kindergeld, Posten (Einnahmen mit Person), einmalige Zahlungen, Konten, Daueraufträge | Sheets (siehe BUDGET.md) |
| **Prognose & Annahmen** (`#v2-forecast-sec`, statisches HTML) | Vorschau Erfolgschance; Lebenserwartung, Horizont, Inflation, Sicherheit (Geburtsdaten seit 14.10.2026 im Haushalt); Lebensphasen (eine Zeile mit Zeitstrahl, öffnet das Lebensphasen-Sheet); Ereignisse; Rendite und Sparrate je Anlage | **sofort gespeichert** (`lt-set`-Felder, `_planListEditor`, `buildAssetParamsTable`). Einzelne Felder gelten auf dem aktuellen Stand; die Ereignisliste beruht auf dem Stand beim Zeichnen. Nach einer fremden Änderung speichert sie nichts, zeigt den aktuellen Stand und nennt die eigenen Eingaben; übertragen wird nur auf dieselbe Zeile (gespeicherte ID) und erst mit „Meine Eingaben übernehmen“ (P54, P64) |
| Kacheln Einstellungen, Sicherung, Hilfe | `openInfoSheet('settings'\|'data'\|'help')` aus `<template id="tpl-…">` | siehe Abschnitt 5 |

Jeder Abschnitt ist ein `<details>`. Der Untertitel kommt aus `_v2SubText`, z. B.
„15 Positionen · 670.144 €“ oder „Restschuld …“. Ist der Bereich ausgeschaltet, steht dort
„Ausgeschaltet · in den Einstellungen einschalten“; ein Tipp öffnet dann die Einstellungen.

### 2.1 Drei Arten zu bearbeiten

1. **Sheet** (`_openSheet`/`_submitSheet`/`_closeSheet`) – Positionen, Kredite, Monatsstand,
   Verlauf, Budget, Konten, Daueraufträge, Phasen, Depot-Position:
   - Fehler bleiben im Sheet sichtbar (`_sheetError`).
   - Hat man etwas geändert, fragt das Schließen nach („Änderungen verwerfen?“).
   - Gespeichert wird in einer Transaktion.
   - Während ein Sheet offen ist, pausieren Hintergrundkurse (`_isEditing()`).
2. **Bearbeiten-Modus** – nur Altersvorsorge:
   - Die Kopfleiste zeigt Abbrechen/Speichern; `setFormReadOnly(false)`.
   - Ungespeicherte Änderungen fangen Seitenwechsel ab (`_resolvePendingEdits`).
3. **Sofort gespeichert** – Prognose & Annahmen: jede Eingabe schreibt direkt und löst eine
   entprellte Neuberechnung aus.

---

## 3. Sheets im Detail

| Sheet | Funktionen | Kerninhalt |
| --- | --- | --- |
| Monatsstand | `openMonthSheet`, `_saveMonthSheet` | Alle Positionen eines Monats auf einmal. Euro- oder Stückzahl-Zeile, Kurs aus Live-Kurs, letztem Kurs oder Wert ÷ Stückzahl. Relative Eingabe „+250“/„−80“. Abschnitte „Bitte prüfen“, „Selten geändert“, „Läuft automatisch“. Vorschläge aus dem Trend bzw. Sparplan. Speichern bestätigt berechnete Werte (`_loanHistory`, `_estimated` fallen weg). Danach Erinnerung an eine Sicherung, falls die letzte über 30 Tage alt ist. Details: DATA_MODEL.md „Monatsabschluss“ |
| Position | `openAssetSheet`, `_saveAssetSheet`, `_assetSheetHTML` | Name, Art, Wert oder Stückzahl. Bewertung „Selbst eintragen“ oder „Per Kurs“ (Kursquelle, Ticker, „Kurs prüfen“, Bestätigung). Liquidität, Abschreibung, „Im Besitz seit“. Verlauf bearbeiten, Position entfernen (archiviert) |
| Neue Position | `openAddAssetSheet`, `addCustomField` | Gruppe nach Art (`CATEGORY_GROUPS`). Mit „Im Besitz seit“ bekommen frühere Monate denselben Wert, ohne andere Werte zu ändern |
| Verlauf | `openHistorySheet`, `_historyCalc`, `_saveHistorySheet`, `quoteHistoryFlow` | Stückzahl bzw. Wert je früherem Monatsstand (Stand zum Monatswechsel). Bei Kurspositionen ergibt sich der Wert aus Stückzahl × Kurs zum Monatswechsel (Schlusskurs des Vormonats). „Werte aus Kursen übernehmen“ berechnet alle Monate mit Stückzahl neu, nach Rückfrage (P30). „Verlauf neu berechnen“ rechnet die heutige Stückzahl mit Monatskursen zurück (`reconstructHolding`) |
| Kredit | `openLoanSheet`, `_saveLoanSheet`, `_loanFromInputs` | Restschuld von Hand **oder** Vertrag: Betrag, Sollzins, anfängliche Tilgung bzw. Rate, erste Rate, Zinsbindung, Anschlusszins, Sondertilgungen. Verknüpfung mit Vermögenswert, Tilgungsplan je Jahr |
| Budget, Konto, Dauerauftrag | siehe BUDGET.md | |
| Lebensphasen | `openPhasesSheet` | siehe PROGNOSE.md |
| Depot ins Vermögen | `openAvdPositionSheet` | Altersvorsorgedepot als gebundene Position mit Kurssuche |

Gemeinsame Regeln:
- **Zahlen werden deutsch gelesen** (P10, seit 14.10.2026 ein Parser für alle Eingaben:
  `parseGermanNumber`): Komma = Dezimalzeichen, Punkt oder Leerzeichen nur als
  Tausendertrennzeichen in Dreiergruppen, € und % dürfen dabeistehen, ein Vorzeichen davor.

  | Eingabe | gelesen als |
  | --- | --- |
  | „1.500“, „1 500“, „1500“ | 1.500 |
  | „1.500,50“, „7,5“, „0,25“ | 1.500,50 · 7,5 · 0,25 |
  | „€ 1.200“, „3 %“, „−2,5“ | 1.200 · 3 · −2,5 |
  | „1.5“, „0.5“, „0.250“, „1.5000“, „,5“ | **ungültig** (rot markiert, Speichern wird mit Beispiel abgelehnt) |

  Vorher gab es sechs Parser mit unterschiedlichen Regeln („1.500“ Stück = 1,5, „1.5“ in Altpfaden
  = 15). Nicht betroffen: der CSV-Import (`parseCsvNumber`, Dateiformat) und gespeicherte Werte
  (`_lsNum`). Felder vom Typ `number` (Lebenserwartung, Horizont, Sicherheit) liest der Browser.
  Tests: `number-input.test.cjs`.
- Datumsfelder sind Knöpfe, die den Monats- oder Jahres-Picker öffnen (`_dateFieldHTML`);
  freie Eingabe wie MM/JJ gibt es nicht.
- Nach jeder Änderung baut `_afterDataChange()` Seite, Vermögen, Budget und Prognose neu.

---

### 3.y Kompakte Darstellung (14.10.2026)

- **Altersvorsorge ohne Bearbeiten:** je Person und Art eine Zeile mit dem Ergebnis (`_pensionSummaryHTML`: gesetzliche
  Rente, EM-Rente, Beamtenpension, Altersvorsorgedepots, weitere Renten; gleiche Rechnung wie die Felder). Die Felder
  (`.pv-fields`) erscheinen erst beim Bearbeiten; Antippen einer Zeile startet das Bearbeiten und scrollt zur passenden
  Karte (`_pvJump`). Gespeichert wird unverändert über die Felder (`saveEntry`).
- **Haushalt:** Lebensphasen als eine Textzeile mit „Lebensphasen ›“ statt Zeitstrahl; Geburtsjahr, Monat und weitere
  Felder nur beim Bearbeiten (der Kopf nennt den Jahrgang).
- **Nach und nach ergänzen:** nur der erste Vorschlag mit Erklärung, die weiteren einzeilig (Erklärung als Tooltip).
- **Prognose & Annahmen:** nur noch eine Sprungzeile (`#dsForecastJump`, Unterzeile mit der Erfolgschance); der Abschnitt
  selbst steht unten auf der Prognose-Seite (PROGNOSE.md, Abschnitt 2).
- **Einheiten einheitlich:** Bestände „€“, monatliche Beträge „€/Monat“, jährliche „€/Jahr“ (z. B. „Brutto €/Jahr“,
  „Bezüge brutto €/Monat“, „EM-Rente netto €/Monat“, „BBG €/Jahr“).

### 3.x Persona-Befunde vom 14.10.2026 (Daten-Seite)

- Kredit-Sheet: „Zinsbindung bis“ (Jahr) steht immer und gilt auch ohne Darlehensvertrag; „Zinsbindung in Jahren“ (ab der
  ersten Rate) nur bei schon erfassten Krediten. Fehlt etwas für den Tilgungsplan, nennt die Meldung die Felder.
  Ohne Vertrag „schuldenfrei ca. …“ (A12).
- Weitere Renten & Einkünfte: Spalte „Netto €/Monat“, Info mit Abzügen für Betriebsrente und Versorgungswerk (A13);
  Überschrift im Lesemodus nur mit Einträgen; Hinweis gegen Vertrag und Rente, wenn es Vermögen „Altersvorsorge“ gibt (A3).
- Altersvorsorge im Lesemodus: eine leere eigene Karte der gesetzlichen Rente erscheint erst beim Bearbeiten (C12).
- Vermögensart „Altersvorsorge“ ist wieder wählbar (A3).
- Vorschläge: prognoserelevante zuerst, „Rente für <Person> ergänzen“, Zinsbindung nur beim Immobilienkredit (B5).
- Lange Positionsnamen und Abschnitts-Unterzeilen zweizeilig statt abgeschnitten (C9).
- „Alle Daten löschen“ entfernt auch die Kopie vor dem Update und die Gerätemerker (A7, siehe DATA_MODEL.md).

## 4. Speicherung (`data-store.js`)

### 4.1 Ein Dokument, Legacy-Schlüssel als Adapter

- Gespeichert wird **ein** JSON-Dokument: `localStorage['vermoegen-data-v1']`, Schema 12, ≈45 KB
  mit den Demo-Daten.
- Die App spricht weiter die alten Schlüssel (`fieldConfig`, `finData`, `budgetData`,
  `loanParams`, `lt-*`, `v2-modules`, `darkMode`, `appLang`, `ui-open-*`) über
  `appStorage.getItem/setItem/removeItem`.

| Vorgang | Was passiert | Kosten (Demo) |
| --- | --- | --- |
| Lesen | `toLegacy(doc)` einmal, dann zwischengespeichert | ≈0,02 ms |
| Schreiben | Kopie der Legacy-Werte → Schlüssel ändern → `fromLegacy(values, current)` → `validate()` → ganzes Dokument schreiben | ≈1,8 ms (Node), ≈5 ms (Browser); bei 2,4 MB ≈73 ms |
| Transaktion | `beginTransaction()` sammelt mehrere Schreibvorgänge im Entwurf; `commitTransaction()` prüft und schreibt einmal; `rollbackTransaction()` verwirft | – |

- **Ein schreibendes Fenster (Review P34, P55, P63):** Nur das Fenster mit der Web Lock `vermoegen-writer` speichert;
  weitere Fenster zeigen oben „Nur ansehen – die Daten sind in einem anderen Fenster zum Bearbeiten geöffnet“ mit „Hier
  bearbeiten“. Ein Speicherversuch dort wird abgelehnt; nichts wird geschrieben. Scheitert die Übernahme (z. B. Speicher
  voll), steht dort „Speichern war nicht möglich …“ mit „Erneut versuchen“; ohne nutzbare Web Locks „dieser Browser kann
  nicht sicherstellen, dass nur ein Fenster speichert“ mit „Nur hier bearbeiten …“ (erst nach Bestätigung). Wer die Seite
  verlässt (Navigation, Schließen, bfcache), gibt das Schreibrecht sofort ab und erwirbt es bei der Rückkehr neu; ein
  nur verdeckter Tab behält es. Die App startet erst, wenn feststeht, ob das Fenster schreibt (spätestens nach 3 s zum
  Ansehen); Wartung beim Start (Live-Monat, Gruppierung) holt ein Fenster nach, sobald es übernimmt. Zustände und
  Übergänge in DATA_MODEL.md „Schreibrecht zwischen Fenstern“.
- **Bearbeitungen mit Basis (Review P54):** Jede Bearbeitung (Sheet, Daten-Bearbeiten, Einrichtung, Import, Ereignisliste)
  merkt sich den Stand, mit dem sie begann. Wurde inzwischen anderswo gespeichert – auch wenn dieses Fenster gerade das
  Schreibrecht übernommen hat –, wird nichts gespeichert: Das Sheet bzw. die Daten-Seite zeigt den aktuellen Stand, trägt
  die hier geänderten Felder markiert wieder ein (mit „Inzwischen gespeichert: …“, wenn das andere Fenster dasselbe Feld
  geändert hat) und speichert erst beim erneuten Speichern.
- Unbekannte Schlüssel lösen einen Fehler aus („Unbekannter Datenschlüssel“).
- Schlägt `validate()` oder das Speicherkontingent fehl, bleibt der gespeicherte Stand
  unverändert (Tests: `data-model.test.cjs` „quota failures are atomic …“).
- Beim ersten Start mit alten Schlüsseln migriert `createStore` alles in das Dokument und
  löscht die alten Schlüssel erst danach.
- **Größe**: neue Demo 92 KB. Pro Position und Monat ≈50 Byte. 50 Jahre × 100 Positionen =
  2,4 MB, im Browser ≈4,8 MB und damit am Limit von `localStorage`. Eine Warnung gibt es nicht
  (PROBLEME.md, P6).
- **Mehrere Fenster** (seit 14.10.2026, P1/D9 behoben): Jedes Fenster hält eine eigene Kopie
  (`current`) und merkt sich den zuletzt gelesenen Stand (`lastRaw`). Vor jedem Schreiben prüft
  `commit`, ob ein anderes Fenster inzwischen gespeichert hat. Dann übernimmt der Speicher dessen
  Stand und lehnt die eigene Änderung mit `code: 'CONFLICT'` ab; ein offenes Sheet wird wie oben (P54) mit dem
  aktuellen Stand neu geöffnet. Einen unlesbaren fremden Stand (neuere
  App-Version) überschreibt er nie. Das `storage`-Ereignis ruft `appStorage.reload()` auf und
  zeichnet die Seite neu, sobald kein Sheet offen ist und kein Feld den Fokus hat; ein verdecktes
  Fenster übernimmt beim Wiedererscheinen. Übernehmen schreibt nichts, Schreiben ohne inhaltliche
  Änderung ebenfalls nicht, damit sich zwei offene Fenster nicht gegenseitig auslösen.
  Tests: `concurrency.test.cjs`; im Browser mit zwei Tabs geprüft.
- Ist das Dokument unlesbar, zeigt die App eine Fehlerseite mit dem Knopf
  „Gespeicherte Daten zur Wiederherstellung sichern“. Er lädt alle Rohwerte als
  `vermoegen-wiederherstellung.json` herunter.

### 4.2 IDs und Namen

`fromLegacy(values, previous)` hält IDs stabil (`idsFor`). Gruppen, Personen, Depots,
Ereignisse, Konten und Budgetposten behalten beim Umbenennen ihre ID.

### 4.3 Werte nur auf dem Gerät (nicht in der Sicherung)

| Schlüssel | Inhalt |
| --- | --- |
| `vermoegen-last-backup` | Zeitpunkt der letzten Sicherung |
| `vermoegen-chart-defaults` | Chart-Standards je Seite |
| `vermoegen-month-done`, `vermoegen-month-reminder` | Monatsstand erledigt bzw. Erinnerung weggewischt (je Live-Monat) |
| `vermoegen-tips-dismissed` | ausgeblendete Vorschläge „Nach und nach ergänzen“ |
| `vermoegen-loan-history-seen` | Kredit-Hinweis schon gezeigt |

---

## 5. Einstellungen, Sicherung, Hilfe

### 5.1 Einstellungen (`tpl-settings`)

- **Bereiche**: Vermögenswerte, Verbindlichkeiten, Altersvorsorge, Einnahmen & Ausgaben, Prognose
  (`_v2SetMod`). Ausgeschaltete Bereiche werden ausgeblendet und nicht berechnet; Daten bleiben.
  Seiten ohne aktiven Bereich verschwinden aus der Navigation (`_v2ApplyModules`).
- **Erscheinungsbild**: Hell, Dunkel, System (`setThemeMode`; `preferences.theme`, Legacy `darkMode` 0/1/2).
- **Sprache**: Deutsch oder Englisch (`setLanguage` → Neuladen; `preferences.language`).
- **Darstellung der Charts**: Zeitraum, Flächen, Skala je Seite (je Gerät).

### 5.2 Sicherung (`tpl-data`)

- **Exportieren** (`exportBackup`):
  - Datei `master_export_YYYY-MM-DD.json` = Dokument + `exportedAt`.
  - Auf Touch-Geräten über das Teilen-Menü, nur die Datei (sonst legt iOS eine zusätzliche
    Textdatei ab); sonst als Download.
  - Merkt sich den Zeitpunkt (`_backupDone`).
- **Stand vor dem Update sichern** (`_downloadBeforeUpdate`, nur sichtbar, wenn vorhanden): unveränderter Rohtext der
  Daten vor der letzten Umstellung auf ein neues Schema (`vermoegen-data-v1-before-update`, Review P37), Datei
  `vermoegen_vor-update_vN.json`.
- **Wiederherstellen** (`handleDataUpload`):
  - JSON: prüfen (`AssetsData.validate`), Rückfrage mit Stand, Anzahl Monate und Positionen,
    dann **vollständig ersetzen** (`importBackup`) und neu laden.
  - CSV: altes Format über `handleCsvUpload`, **ergänzt** Monate, statt zu ersetzen
    (Transaktion, Rollback bei Fehlern).
- **Alle Daten löschen** (`resetApp`): Rückfrage, `appStorage.clear()`, neu laden.
- Der Hinweis „Noch keine Sicherung · empfohlen“ bzw. „Zuletzt vor X Tagen“ und ein Punkt an
  der Kachel erscheinen ohne Sicherung oder nach mehr als 30 Tagen (`_refreshBackupInfo`).

### 5.3 Hilfe (`tpl-help`)

App kennenlernen (Rundgang), Demo-Daten laden (ersetzt alles nach Rückfrage), Versionsnummer.

### 5.4 Erinnerungen

- **Monatsstand** (`_monthNotif`): in den ersten 7 Tagen eines Monats.
  - Mitteilung oben, Punkt an der Navigation, solange der Live-Monat nicht gespeichert ist.
  - Wegwischen gilt für diesen Monat.
- **Kreditverlauf**: einmal je Kredit.
- **Nächster Schritt**: nach der Einrichtung.

---

## 6. Tests

- `data-model.test.cjs`:
  - Migration, CSV-Import, Sicherung auf neuem Gerät,
  - stabile IDs, Null vs. fehlend,
  - Archiv, kaputte/zukünftige Dateien,
  - Speicherkontingent, Rollback, Demo.
- `data-sheets.test.cjs`:
  - Positions- und Monats-Sheet (atomar, deutsche Zahlen),
  - Kredit-Sheet, Archivieren,
  - Kurse pausieren im Sheet,
  - „Im Besitz seit“, Picker statt Texteingabe.
- `month-sheet.test.cjs`: relative Eingabe, Vorschläge, Erinnerung, Stückzahl-Zeilen, Abschreibung.
- `dialogs.test.cjs`: kein natives `confirm/alert`; Abbrechen lässt Daten unverändert;
  ungespeicherte Änderungen.
- `position-entry.test.cjs`, `assets.test.cjs`, `depreciation.test.cjs`, `loans.test.cjs`:
  Erfassung je Positionsart.
- `concurrency.test.cjs` (seit 14.10.2026): zwei Fenster, Transaktion mit Konflikt, `reload()`,
  unlesbarer fremder Stand, Schreiben ohne Änderung.
- `writer-lifecycle.test.cjs` (Folge-Review P54, P55, P63): Entwürfe mit Basis (Kontrollfall 3.200/4.000, Kredit-,
  Budget- und Kinder-Sheet, Daten-Bearbeiten, Import), Fehlerpfade beim Erwerb, Verlassen und Rückkehr, späte Rückrufe,
  gleichzeitige Übernahme, gesperrte Schreibwege; Testbrowser mit asynchronen Ereignissen und bfcache-Modell.
- `pension-rules.test.cjs` „Schema 13“: neue Felder, Migration aus Schema 12, abgelehnte Importe,
  unvollständige Eingaben in der App.
- Nicht abgedeckt: `resetApp` mit Gerätewerten (siehe D2), Bereichsschalter-Wechsel mit offenen Sheets.

**Nach der Fehlerbehebung (14.10.2026, Browser Port 8124, Demo Schema 13):** alle 17 Positionen
und Kredite, Monats-Sheet und Phasen-Sheet ohne Änderung gespeichert → Dokument unverändert;
Export → Import identisch; keine Konsolenfehler.

**Gesamttest 14.10.2026 vor der Fehlerbehebung** (neue Demo, Details in [PROBLEME.md](PROBLEME.md)):
- **34 Sheets** geöffnet und unverändert gespeichert:
  - alle 17 aktiven Positionen, 12 Budgetposten, 2 Konten, 2 Daueraufträge, Phasen;
  - Dokument vorher und nachher verglichen.
  - Einziger Unterschied: Bei fünf Positionen ohne Stückzahl (Tagesgeld, Girokonto, Bargeld,
    Wohnung, Familienauto) kommt `unit` hinzu (D6, P2).
  - Das Monats-Sheet ändert nichts.
- **Bereichsschalter**: Alle fünf einzeln aus- und eingeschaltet; nur `preferences.modules` ändert sich.
- **Export → Import**: Ergebnis identisch, Datei 92.681 Byte, Schema 12.
- **Import-Zufallstest** (600 Mutationen): 486 abgelehnt, 113 angenommen, kein Absturz.
  Angenommen werden auch unsinnige Werte (D7).
- **Verweise**: Garage archiviert (Kredit bleibt und zeigt auf sie), Kredit archiviert
  (Budget-Rate behält `loanId`), Konto gelöscht (Daueraufträge werden zu Bezeichnungen).
  Kein Absturz, aber kein Hinweis (D8).
- **Barrierefreiheit**:
  - 33 Eingabefelder der Daten-Seite haben kein verknüpftes Label (`<label>` ohne `for`).
  - Kleine Tippflächen (Jahrespfeile 23 × 31 px).

---

## 7. Befunde

| # | Schwere | Befund |
| --- | --- | --- |
| D1 | niedrig | Drei Bearbeitungsarten; `saveEntry()` trägt Altlasten |
| D2 | niedrig | „Alle Daten löschen“ lässt Gerätewerte stehen |
| D3 | niedrig | Unbenutzte Funktionen |
| D4 | niedrig | Monatserinnerung nur in der ersten Woche |
| D5 | niedrig | Prognose-Annahmen ohne Bereichsprüfung |
| D6 | **hoch** | Speichern ohne Änderung setzt `hasUnits`/`unit` (Folge: VERMOEGEN.md V5, PROBLEME.md P2) – **behoben** |
| D7 | niedrig | Import nimmt unsinnige Werte an (negative Monatswerte, Sicherheit 150 %, Zins 500 %, Rendite 10¹⁵ → NaN …); Geburtsmonat seit Schema 13 geprüft |
| D8 | niedrig | Archivieren hinterlässt verwaiste Verweise ohne Hinweis |
| D9 | **hoch** | Zwei Fenster überschreiben sich (PROBLEME.md, P1) – **behoben** |
| D10 | mittel | Sechs Zahlen-Parser mit unterschiedlichen Regeln (Abschnitt 3, PROBLEME.md P10) – **behoben** (deutsches Zahlenmodell) |

**D1 – Drei Bearbeitungsarten; `saveEntry()` trägt Altlasten.** Positionen und Budget
arbeiten mit Sheets, die Altersvorsorge mit einem Bearbeiten-Modus, die Prognose-Annahmen
speichern sofort. Für Nutzer ist das uneinheitlich: In der Altersvorsorge muss man
„Speichern“ tippen, eine Zeile darunter nicht.

`saveEntry()` enthält außerdem noch Pfade für Formulare, die die Seite nicht mehr rendert:
- Monatsfelder `f-<id>`,
- Budget-Eingaben `.budget-input`,
- Kreditfelder `data-loan`.

Wirksam ist nur noch der Teil für die Altersvorsorge. Vorschlag: Altersvorsorge auf Sheets
umstellen und `saveEntry` auf diesen Teil reduzieren.

**D2 – „Alle Daten löschen“ lässt Gerätewerte stehen.** `resetApp()` leert nur das Dokument.
Erhalten bleiben:
- `vermoegen-last-backup`: Die Sicherungsanzeige meldet nach dem Neuanfang „Zuletzt vor X
  Tagen“, die Empfehlung für eine erste Sicherung bleibt aus.
- `vermoegen-tips-dismissed`: Vorschläge bleiben ausgeblendet.
- Monatsstand erledigt, Kredit-Hinweis gesehen.

Vorschlag: diese Schlüssel beim Zurücksetzen mitlöschen; Chart-Standards dürfen bleiben.

**D3 – Unbenutzte Funktionen.** Nirgends aufgerufen (statisch geprüft):

| Funktion | Bemerkung |
| --- | --- |
| `_flowColumnsHTML`, `_flowPeriod`, `_flowSumHTML` | alte Vermögensentwicklung |
| `_loanCardHTML` | |
| `addBudgetField`, `toggleBudgetFieldEditor` | altes Budget-Formular |
| `buildTutorialHTML` | |
| `fetchBitcoinEUR`, `fetchETFPrice` | vor `fetchInstrumentQuote` |
| `getFieldsByCategory` | |
| `setTheme` | |
| `_positionEditorHTML` | nur noch in Tests verwendet |

Entfernen verkleinert `index.html` und vermeidet Verwechslungen.

**D4 – Monatserinnerung nur in der ersten Woche.** Wer den Monatsstand bis zum 7. nicht
speichert, bekommt danach keine Erinnerung mehr für diesen Monat. Das ist gewollt, sollte
aber bekannt sein.

**D5 – Prognose-Annahmen ohne Bereichsprüfung.** Die Felder (`min`/`max` im HTML) schützen
nur die Eingabe. Beim Import prüft `validate()` nur, dass es Zahlen sind. Siehe PROGNOSE.md, B12.

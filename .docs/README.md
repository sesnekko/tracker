# Assets – Übersicht und Kontext

Stand: 14.10.2026, Analyse auf Code-Stand `7504901` (Schema 12); Fehlerbehebung, Personenmodell und Lebensphasen
in Commit `1b57aa8` (Schema 15). Danach Review-Runde P34–P38, Anmerkungen aus dem Test, Folge-Review P54, P55, P63 und
Folge-Review 2 P64, P65 (Commit `b9f80d4`), die Persona-Befunde und die kompaktere Daten- und Prognose-Seite (Commit `50300cc`),
danach EM-Rente mit Zurechnungszeit und Besitzschutz, das Altersvorsorgedepot Monat für Monat und die EM-Rente mit
Entgeltpunkten laut Bescheid (15.10.2026): Schema 19,
Service-Worker-Cache `verm-v135`,
`data-store.js?v=32`, `i18n-en.js?v=17`. Unabhängige Prüfberichte:
[REVIEW_2026-10.md](REVIEW_2026-10.md), [REVIEW_2026-10_FOLGE.md](REVIEW_2026-10_FOLGE.md),
[REVIEW_2026-10_FOLGE2.md](REVIEW_2026-10_FOLGE2.md), [REVIEW_2026-10_FOLGE3.md](REVIEW_2026-10_FOLGE3.md).
Status aller Befunde: [PROBLEME.md](PROBLEME.md), Abschnitt 0.
Diese Datei ist der Einstieg in die Dokumentation in `.docs/`: Architektur, gemeinsame
Begriffe, Arbeitsweise und alle Befunde der Analyse vom 14.10.2026 an einem Ort. Ergänzt um
den Gesamt- und Stresstest mit den überarbeiteten Demo-Daten; alle Probleme, Konflikte und
offenen Punkte daraus stehen in [PROBLEME.md](PROBLEME.md).

| Dokument | Inhalt |
| --- | --- |
| [VERMOEGEN.md](VERMOEGEN.md) | Startseite: Nettovermögen, Chart, Kacheln, Asset-Liste, Vermögensentwicklung, Live-Kurse |
| [BUDGET.md](BUDGET.md) | Budget: Jahresplan, Monatsrechnung, Kreditraten, Depots, Geldfluss |
| [PROGNOSE.md](PROGNOSE.md) | Prognose: Lebensphasen, Planmodell, Simulation, Monte-Carlo, Renten, Partner-Story |
| [DATEN.md](DATEN.md) | Daten-Seite: Erfassung, Sheets, Speicherung, Einstellungen, Sicherung |
| [EINRICHTUNG.md](EINRICHTUNG.md) | Willkommen, Rundgang, geführte Einrichtung, Vorschläge |
| [PROBLEME.md](PROBLEME.md) | **Alle Probleme, Konflikte und offenen Punkte** aus Analyse und Gesamttest, mit Testprotokoll und empfohlener Reihenfolge |
| [DATA_MODEL.md](DATA_MODEL.md) | Sicherungsformat, Felder, Schema-Historie (maßgeblich für das Datenformat) |
| `IOS_SPEC.md` | Spezifikation der nativen iOS-App (nur lokal, nicht im Repo) |

---

## 1. Architektur

Eine statische Single-File-PWA ohne Build-Schritt und ohne Server. Alle Daten liegen im Browser
des Geräts.

| Datei | Rolle |
| --- | --- |
| `index.html` (≈12.000 Zeilen) | HTML, CSS und das Hauptskript (ein `<script>`-Block am Ende) |
| `data-store.js` | versioniertes Dokument, Legacy-Adapter, Prüfung, Transaktionen (`AssetsData`) |
| `asset-model.js` | Kategorien, Liquidität, Bewertung, Abschreibung (`AssetModel`) |
| `loan-model.js` | Annuitätendarlehen: Rate, Tilgungsplan, Monatswerte (`LoanModel`) |
| `loan-history.js` | Kreditverläufe aus Verträgen ableiten, beim Speichern wieder entfernen (`LoanHistory`) |
| `i18n-en.js` | englisches Wörterbuch (`window.I18N_EN`) |
| `sw.js` | Service Worker: `index.html` stale-while-revalidate, Module cache-first, Kurs-APIs network-first |
| `demo_backup.json` / `.js` | Demo-Haushalt; `.js` für den Start über `file://` |
| `manifest.json`, Icons, `logo-a.png` | PWA |
| `.tests/`, `.scripts/`, `.docs/` | Tests (Node), Demo-Build, Dokumentation – gehören nicht zum App-Kern |

Ladereihenfolge: `i18n-en.js` → `data-store.js` → `loan-model.js` → `loan-history.js` →
`asset-model.js` → Hauptskript (`initApp`).

Externe Bibliotheken:
- Chart.js 4.4.1 und chartjs-plugin-datalabels über jsDelivr,
- IBM Plex Sans über Google Fonts.

Netzwerk:
- Kurse: Kraken direkt; Yahoo über den eigenen Proxy `finance-proxy.atracker.workers.dev`.
- Wechselkurse: Frankfurter.

Ausgeliefert wird über GitHub Pages (`sesnekko.github.io/tracker`). Auf dem Mac läuft eine
manuell kopierte Fassung aus Dropbox über `file://`, ohne Service Worker.

### Versionen bei Änderungen

| Was ändert sich | Was ist zu tun |
| --- | --- |
| ein Modul | `?v=` im `<script>`-Tag **und** in `sw.js` erhöhen |
| beliebige ausgelieferte Datei | `CACHE` in `sw.js` erhöhen |
| Datenformat | `VERSION` in `data-store.js` erhöhen, ältere Versionen weiter annehmen, DATA_MODEL.md ergänzen, Demo neu bauen |

`index.html` kommt per stale-while-revalidate: Nach einem Deploy zeigt der erste Start noch
die alte Fassung, der zweite die neue.

---

## 2. Gemeinsame Begriffe

- **Dokument**:
  - `localStorage['vermoegen-data-v1']`.
  - Die App liest und schreibt über `appStorage` mit den alten Schlüsseln (`finData`,
    `fieldConfig`, `budgetData`, `loanParams`, `lt-*` …).
  - Jeder Schreibvorgang baut das Dokument neu, prüft es und schreibt es ganz – außer es hat sich
    nichts geändert. Hat ein anderes Fenster inzwischen gespeichert, lehnt der Speicher ab
    (`code: 'CONFLICT'`) und übernimmt den fremden Stand (P1).
  - Seit Schema 16 (Review P34) schreibt nur das Fenster mit der Web Lock `vermoegen-writer`; weitere Fenster
    zeigen „Nur ansehen“ und lehnen jedes Speichern mit `code: 'READ_ONLY'` ab („Hier bearbeiten“ übernimmt). Wer die
    Seite verlässt, gibt das Schreibrecht wirklich ab (P63); Fehler und ausbleibende Antworten enden bestimmt, ohne Web
    Locks gilt ein erklärter Lesemodus (P55). Zustände: DATA_MODEL.md „Schreibrecht zwischen Fenstern“.
  - Jede Bearbeitung speichert mit ihrer Basis (`appStorage.withBase(revision, fn)`, ohne eigene Basis der zuletzt
    angezeigte Stand). Beruht sie auf einem älteren Stand, schreibt der Speicher nichts (`code: 'STALE'`); die App
    öffnet mit dem aktuellen Stand neu und trägt die eigenen Änderungen markiert wieder ein (P54). Neue Schreibwege
    brauchen eine Basis: im Sheet über `_submitSheet`/`_sheetFail`, sonst `withBase` mit der Revision beim Beginn der
    Bearbeitung oder `_fieldWrite` für einen einzelnen Wert ohne abgeleitete Daten. Listenzeilen werden im Abgleich nur
    über ihre gespeicherte Kennung zugeordnet; neue Zeilen bekommen sie beim Anlegen (`_newRowId`, P64).
  - Was eine Migration nicht eindeutig übertragen kann, bleibt als Originalwert erhalten und wird in der Karte
    „Nach dem Update“ geklärt; vor dem ersten Speichern nach einem Update wird der alte Stand gesichert
    (`vermoegen-data-v1-before-update`, Review P35–P37).
  - Mehrere Änderungen gehören in `beginTransaction()/commitTransaction()`.
  - Details: DATEN.md, Abschnitt 4.
- **Live-Monat**: Der laufend aktualisierte Stand „Heute“ liegt unter dem **Folgemonat**
  (`nextYM()`, im Oktober also `2026-11`). Nur er bekommt Live-Kurse. `selectedMonth` steht
  beim Start darauf. Das Budget rechnet im Live-Monat mit dem Kalendermonat (`_budgetYM()`,
  BU1/P7); die Prognose startet im Kalendermonat mit dem letzten Stand bis einschließlich
  Live-Monat (P28).
- **Position → Gruppe → Kategorie**:
  - Positionen gehören zu einer Gruppe (`displayGroup`, z. B. „ETF“).
  - Die Kategorie bestimmt Liquidität und Standardannahmen.
  - Verbindlichkeiten zählen zur Gruppe des verknüpften Vermögenswerts (`_liabTargetGroup`).
- **Bereiche** (`v2-modules`): Vermögenswerte, Verbindlichkeiten, Altersvorsorge, Einnahmen &
  Ausgaben, Prognose. Ausgeschaltet bedeutet ausgeblendet und nicht berechnet; die Daten
  bleiben in der Sicherung.
- **Heutige Kaufkraft**: Alle Eingaben der Prognose und alle Prognose-Ergebnisse sind real;
  gerechnet wird nominal.
- **Sprache**:
  - Der Code ist deutsch; Englisch entsteht zur Laufzeit über `_tr()` und das Wörterbuch.
  - Lange, zusammengesetzte Texte stehen direkt zweisprachig im Code (`L('de','en')`).
  - Neue sichtbare Texte brauchen einen Eintrag in `i18n-en.js` oder `L()`.
- **Dialoge**: Nur `_ask()` (eigener Dialog) – kein `confirm()`/`alert()`. Die Vorschau im
  Claude-Browser unterdrückt native Dialoge.

### Datenfluss

```
 Erfassung (Daten-Seite, Einrichtung, CSV/JSON-Import)
        │  appStorage.setItem / Transaktion
        ▼
 Dokument vermoegen-data-v1 ──toLegacy──► finData · fieldConfig · budgetData · loanParams · lt-*
        │                                           │
        │ loadData() = Stände + LoanHistory + Abschreibung
        ▼                                           ▼
 Vermögen (calc, Gruppen, Flows) ◄─ Live-Kurse    Budget (calcBudgetMonth)
        │                                           │ Sparraten, Ruhestandseinnahmen
        └──────────────► Prognose (buildPlan → simulatePlan / runMonteCarlo) ◄┘
                                     │
                                     └─► Partner-Story
```

---

## 3. Arbeitsweise

### Tests

- Aufruf: `node --test .tests/` – 35 Testdateien, 378 Tests, alle grün (15.10.2026 nach der Transparenz der Altersrente
  nach EM-Rente, `em-transparency.test.cjs`, der einheitlichen Daten-Seite,
  `data-page-lists.test.cjs`, Schema 19, EM-Rente mit
  Entgeltpunkten laut Bescheid, `em-old-age.test.cjs`, dem eigenen Namen, `own-name.test.cjs`, und der Monatsrechnung des
  Altersvorsorgedepots; 14.10.2026 nach der Review-Runde
  P34–P38, den Anmerkungen aus dem Test, dem Folge-Review P54, P55, P63, dem Folge-Review 2 P64, P65 und den
  Persona-Befunden, `persona-fixes.test.cjs`;
  `data-safety.test.cjs` für Fenster, Migrationen und Originalsicherung, `writer-lifecycle.test.cjs` für Schreibrecht,
  Entwürfe, Lebenszyklus und Abgleich von Listen mit asynchronem Testbrowser; `mini-dom.cjs` ist eine Testhilfe, die aus
  gerendertem HTML echte Elementbäume baut). Dazu `node .scripts/audit-forecast.cjs` (22 fachliche Sollwerte, 0 Abweichungen;
  Exit-Code 1 bei Abweichungen).
- Neue fachliche Tests: `forecast-cashflow.test.cjs` und `pension-rules.test.cjs` auf der Fixture
  `forecast-fixture.cjs` (Rendite, Inflation, Abzug 0, damit jede Erwartung nachrechenbar ist),
  `flows.test.cjs`, `concurrency.test.cjs`, `number-input.test.cjs` (deutsches Zahlenmodell),
  `quote-history.test.cjs` (Historie aus Kursen), `persons.test.cjs` (Personen, Kinder, Migration 13 → 14),
  `household.test.cjs` (Kindergeld in Budget und Prognose). `APP_HTML=<Pfad>` rechnet die Fixture-Tests gegen einen
  älteren Stand von `index.html`.
- `app-harness.cjs` führt das Hauptskript in einer `vm` mit DOM-Attrappe aus. Es schneidet am
  **letzten** `<script>` ab. Deshalb nie die Zeichenfolge `<script>` in Kommentare im Hauptskript
  schreiben.
- Nach `appStorage.importBackup()` im Harness `_fc = loadFieldConfig(); _modsCache = null;`
  setzen, sonst sind die Positionen leer.

### Demo

`demo_backup.json` ist die Quelle (in der App bearbeitet und exportiert). `node .scripts/build-demo.cjs`
ändert keine Inhalte: Es setzt die aktuelle `schemaVersion`, entfernt `exportedAt` und den Live-Monat
eines Exports und erzeugt `demo_backup.js` (`window.ASSETS_DEMO_BACKUP`) für die lokal geöffnete App.
`demo-file.test.cjs` prüft, dass beide übereinstimmen. Stand 14.10.2026: Schema 13, 34 Monate,
19 Positionen, Gehälter Max und Anna zugeordnet, Kind Lena (2019, Kinderzulage bei Anna; Kindergeld automatisch,
der frühere Posten „Kindergeld“ ist entfernt), Posten
„Altersvorsorge-Beiträge“ entfernt (DEMO-6), Historie der Kurspositionen mit echten Kursen
(`node .scripts/demo-quote-history.cjs`, danach `node .scripts/build-demo.cjs`; DEMO-5).

### Vorschau

- Konfigurationen in `.claude/launch.json`: `assets-app` (Port 8123) und `assets-persona`
  (Port 8124, für zerstörende Tests).
- Der Service Worker liefert Module cache-first. Nach Änderungen deshalb registrierte Worker
  abmelden, Caches löschen und mit `fetch(url, {cache:'reload'})` neu holen.

### Mac

Nach jeder Änderung den ganzen App-Ordner nach
`~/Dropbox/Finanzen/Budgets/Assets App` kopieren (inkl. `i18n-en.js`).

---

## 4. Alle Befunde (Analyse 14.10.2026)

Alle Befunde sind am Code nachvollzogen und, wo Zahlen genannt sind, mit `demo_backup.json` im
Test-Harness oder in der Vorschau nachgerechnet. Details und Vorschläge stehen im jeweiligen
Dokument.

**Stand nach der Fehlerbehebung 14.10.2026:** P1–P5, P7–P9, P11–P13, P17–P29, B14, BU1, V1, V5, D6,
D9, E1, E5 und DEMO-1 bis DEMO-4 sind behoben (PROBLEME.md, Abschnitt 0). Die Tabellen unten
zeigen den Analysestand. Aus dem unabhängigen Review vom 14.10.2026 ([REVIEW_2026-10.md](REVIEW_2026-10.md)) sind
P34–P38 umgesetzt; aus dem Folge-Review ([REVIEW_2026-10_FOLGE.md](REVIEW_2026-10_FOLGE.md)) P54, P55 und P63, aus dem
Folge-Review 2 ([REVIEW_2026-10_FOLGE2.md](REVIEW_2026-10_FOLGE2.md)) P64 und P65. Offen: P66–P68,
P56–P62 und P39–P53.

### Zuerst angehen

Neu aus dem Gesamttest (Details in PROBLEME.md):

| # | Bereich | Befund | Warum wichtig |
| --- | --- | --- | --- |
| P1 | Daten | **Zwei offene Fenster überschreiben sich** | Nachgestellt: Änderungen eines Fensters gehen beim Speichern im anderen verloren; Live-Kurse schreiben alle 10 s |
| P2 | Vermögen | **Speichern ohne Änderung macht aus Sparleistung „Sonstiges“** | Drei Konten unverändert gespeichert: Cash-Sparleistung 7.413 € → 0 €, „Gespart“ 56.825 € → 49.412 € |
| P5 | Prognose | **Partnergehalt endet mit deinem Arbeitsende** | Demo: Anna arbeitet bis 2054, die Prognose rechnet ab 2045 ohne ihr Gehalt (≈194.000 €) |

Aus der Analyse:

| # | Bereich | Befund | Warum wichtig |
| --- | --- | --- | --- |
| B2 | Prognose | Gesetzliche Rente vor der Regelaltersgrenze **ohne Abschlag** (0,3 % je Monat) | Demo „Rente ab 63“: 1.281 € statt ≈1.097 €; überschätzt jeden Vorruhestand mit früherem Rentenbeginn |
| E1 | Einrichtung | Hochgerechnete Rente aus der Renteninformation wird als **heutige** Punkte gespeichert | Bei Arbeitsende vor 67 werden fehlende Beitragsjahre trotzdem angerechnet (≈−13 % bei 5 Jahren) |
| BU1 | Budget | Budget zeigt standardmäßig den Plan des **Folgemonats** | Am 14.10. „Plan Nov“; im Dezember Januar des Folgejahres inkl. Kreditraten des nächsten Jahres |
| V1 | Vermögen | Vermögensentwicklung ordnet Kredite nach eigener Gruppe statt nach verknüpftem Vermögenswert | Neu angelegte Kredite: Tilgung fehlt in den Asset-Details (Demo 12.195 € → 0 €); kreditfinanzierte Käufe nicht neutral |

### Danach

| # | Bereich | Schwere | Befund |
| --- | --- | --- | --- |
| B1 | Prognose | mittel | „Sicher möglich ab“ rechnet Renten mit dem geplanten statt dem geprüften Arbeitsende |
| B3 | Prognose | mittel | Geburtsmonat wird ignoriert (`birthMonth: 1` fest) |
| B4 | Prognose | mittel | Median-Linie (Monte-Carlo) und Asset-Flächen (Erwartungspfad) passen nicht zusammen (Demo mit 62: 1,61 vs. 1,21 Mio €) |
| B5 | Prognose | mittel | Hohe Schwankung (Krypto 55 %) hebt Median und Erfolgschance spürbar an |
| BU2 | Budget | niedrig | Ø Einnahmen nur über Monate mit Einnahmen, Ausgaben über zwölf Monate |
| B6–B12 | Prognose | niedrig | frei werdende Kreditrate, nominale Sparraten, Zielkapital ohne Ereignisse, Depot-Gruppe, unsichtbare Altelemente, Bereich Vermögen aus, Importprüfung |
| BU3–BU6 | Budget | niedrig | Schlagwörter als Teilwörter, Geldfluss einstufig, Zinsanteil ohne Vertrag, Übersetzungslücke „quartalsweise“ |
| V2–V4 | Vermögen | niedrig | Illiquide minus alle Schulden, Vormonatsvergleich bei Lücken, Folgemonat-Konvention |
| D1–D5 | Daten | niedrig | drei Bearbeitungsarten und Altlasten in `saveEntry`, Zurücksetzen lässt Gerätewerte stehen, tote Funktionen, Monatserinnerung nur Woche 1, Importprüfung |
| E2–E3 | Einrichtung | niedrig | Demo setzt Sprache zurück; Ansparen = Arbeitsende nach „Zukunft planen“ |

Weitere aus dem Gesamttest (mittel):
- „Sicher möglich ab“ mit der neuen Demo 57 statt 58 (B1/P9).
- Zahleneingabe: „1.500“ Stück = 1,5 (P10) – behoben, deutsches Zahlenmodell.
- Einkommen im Ruhestand: Summe und Altersangaben passen nicht zu den Phasen (P11/P12).
- Ereignis im laufenden Jahr ignoriert (P13).
- Abschreibung einzelner Positionen wirkt nicht in der Prognose (P14).
- Sparposten ohne aktive Zielgruppe (P15) – in der Demo behoben, Hinweis in der App offen.
- Kein Schutz vor dem Speicherlimit (P6).

Dazu kommen die Demo-Konflikte DEMO-1 bis DEMO-7.

### Testlücken (übergreifend)

Seit 14.10.2026 abgedeckt: `calcFlows` (P2, P8), `findRetireAge` (P9, P23, Nichtmonotonie), zwei
Fenster (P1, gleichzeitiges Schreiben P34 mit simuliertem Browser aus gemeinsamem Speicher und Web Locks; P54, P55,
P63 mit asynchronen Ereignissen, bfcache-Modell und echten Chrome-Läufen per HTTP und `file://`),
Migrationen mit Originalwerten (P35–P37), Kursübernahme bei Instrument- und Datenwechsel (P38), unveränderte Sheets
(Browser), Ereignis im laufenden Jahr (P13). Weiter offen:

- Eigenschaften der Monte-Carlo-Simulation, `targetCapital`.
- `_avgBudget` mit Lücken, Geldfluss.
- Bereichsschalter-Kombinationen (Vermögen aus, Kredite an).
- Zurücksetzen mit Gerätewerten.
- (Zahlen-Parser seit 14.10.2026 abgedeckt: `number-input.test.cjs`.)

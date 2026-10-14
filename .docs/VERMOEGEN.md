# Vermögen – Seite, Datenstruktur und Logik

Stand: 14.10.2026, Code-Stand `7504901` (Schema 12). Funktionsnamen beziehen sich auf
`index.html`, sofern nicht anders angegeben; Zeilennummern sind Näherungswerte.

Verwandt: [README.md](README.md) · [DATEN.md](DATEN.md) (Erfassung) · [PROGNOSE.md](PROGNOSE.md) ·
[DATA_MODEL.md](DATA_MODEL.md)

---

## 1. Zweck

Die Startseite (`#page-home`) zeigt den Stand eines Monats:

- Nettovermögen,
- Verlauf über die Zeit,
- Aufteilung nach Gruppen,
- woher die Veränderung kommt (gespart oder Wertänderung).

Erfasst wird hier nichts. Werte entstehen auf der Daten-Seite, durch Live-Kurse, aus
Kreditverträgen und aus Abschreibungen.

---

## 2. Grundbegriffe

### 2.1 Monatsstand und „Heute“

- Ein Monatsstand ist ein Eintrag in `finData[YYYY-MM]` (im Dokument: `snapshots[]`) mit
  `_details` (Wert je Position) und `_units` (Stückzahl je Einheit).
- Der **live aktualisierte Stand liegt im Folgemonat** (`nextYM()`). Im Oktober heißt der
  Stand „Heute“ also `2026-11`.
  - `ensureNextMonth()` legt ihn beim Start als Kopie des neuesten Stands an.
  - `_handleMonthRollover()` legt ihn an, wenn die App über einen Monatswechsel offen bleibt.
- Nur dieser Monat erhält Live-Kurse (`applyLivePrices`).
- `selectedMonth` ist der angezeigte Monat. Gewählt wird er über den Kalender oben links
  (`buildPicker`), Standard ist `nextYM()`. Alle Seiten folgen ihm: Vermögen, Budget-Jahr,
  Chart-Fenster.

### 2.2 Positionen, Kategorien, Gruppen

- **Position** (`_fc.fields[]`, im Dokument `positions[]`) mit diesen Feldern:
  - `id`, `label`, `category`, `displayGroup` (Gruppe),
  - optional `liquidity`, `valuation` (`market` | `manual`), `instrument`, `lastQuote`,
    `hasUnits`/`unitId`/`unitLabel`, `depreciation`.
- **Kategorien** (`AssetModel.categories`):

  | liquide | illiquide | Schuld |
  | --- | --- | --- |
  | `cash`, `etf`, `stock`, `bitcoin`, `crypto`, `metal`, `other` | `realEstate`, `vehicle`, `illiquid`, `bav` | `liab` |

  `liquidity` kann die Kategorie überschreiben, z. B. ein gebundenes Depot.
- **Gruppe** = `displayGroup || category`. Neue Vermögenswerte kommen in die Gruppe ihrer Art
  (`CATEGORY_GROUPS`, z. B. „ETF“). Neue Verbindlichkeiten bekommen eine **eigene** Gruppe
  (ihren Namen).
- **Verbindlichkeit → Gruppe** (`_liabTargetGroup`): zuerst die Gruppe des verknüpften
  Vermögenswerts (`loanParams[id].assetId`), sonst die eigene Gruppe, falls darin Vermögen
  liegt, sonst die größte illiquide Gruppe (`_orphanLiabTarget`, gemerkt).
- Ausgeschaltete Bereiche (`v2-modules.assets`/`.liab`) fallen über `_vf()` aus allen
  Berechnungen heraus.

### 2.3 Werte eines Monats (`loadData()`)

`loadData()` = gespeicherte Stände (`finData`), dann:

1. `LoanHistory.build()`:
   - Bei vollständigem Darlehensvertrag kommt die Restschuld jedes Monats aus dem
     Tilgungsplan (`LoanModel.at`).
   - Fehlende Monate seit der ersten Rate werden ergänzt (`_loanHistory.generated`).
   - Der Wert des verknüpften Vermögenswerts wird dabei mit der letzten Beobachtung
     fortgeschrieben (`estimatedAssetIds`).
2. `_applyDepreciation()`: Positionen mit Abschreibung erhalten ihren Wert je Monat aus
   `AssetModel.depreciatedValue`; vor dem Kauf zählen sie 0.

Beim Speichern (`saveData` → `LoanHistory.stored`) fallen berechnete Monate, geschätzte Werte
und Abschreibungswerte wieder weg. Gespeichert wird nur, was beobachtet oder eingegeben wurde.
Kosten mit den Demo-Daten (34 Monate): ≈0,5 ms je `loadData()`.

### 2.4 Kennzahlen eines Monats (`calc(e)`)

| Wert | Formel |
| --- | --- |
| `liquid` | Summe liquider Positionen |
| `illiquidGross` | Summe illiquider Positionen |
| `liab` | Summe der Verbindlichkeiten |
| `illiquid` („Illiquides Vermögen“) | illiquide − **alle** Verbindlichkeiten |
| `assets` (Bruttovermögen) | liquide + illiquide |
| `net` (Nettovermögen) | Bruttovermögen − Verbindlichkeiten |

---

## 3. Seitenaufbau

| Element | ID | Funktion |
| --- | --- | --- |
| Hinweis „Dein nächster Schritt“ (nach Einrichtung) | `#onboardingNextStep` | `dismissOnboardingNext()` |
| Hero: Netto- (ohne Kredite-Bereich: Brutto-)vermögen, Veränderung zum Vormonat | `#kpi-net`, `#kpi-net-delta` | `renderKPIs()`; Tipp auf den Wert → `resetHomeChart()` |
| Chart Nettovermögen | `#chartNet` | `renderNetChart()`, `setupChartInteraction()` |
| Zeitraum 1/3/5 J/Alle, Asset-Flächen, Log | `[data-range]`, `#assetsToggleBtn`, `#scaleToggleBtn` | `setNetRange()`, Toggles |
| 4 Kacheln: Brutto, Liquide, Illiquide, Verbindlichkeiten | `.kpi-item[data-kpi]` | Tipp → `setKpiChartFilter()` |
| Asset-Liste je Gruppe (Anteil, Veränderung, Balken) | `#legendAssets` (+ `-ipad`) | `renderPieChart()` → `showAssetDetail()` |
| Vermögensentwicklung | `#flowSection` | `renderFlowSection()` → `calcFlows()` |
| Live-Status (Punkt oben rechts) | `#liveDot` | `updateLiveDot()`, Popup `showLivePopup()` |

`render()` (Z. ≈3934) zeichnet in dieser Reihenfolge: Live-Status, Isolation zurücksetzen,
Kennzahlen, Chart, Liste, Vermögensentwicklung; danach die Prognose, falls sie sichtbar ist.

Ab 768 px berechnet `_fitHomeChart()` die Chart-Höhe so, dass die ganze Seite ohne Scrollen ins
Fenster passt (300–900 px). Der Prognose-Chart bekommt dieselbe Höhe.

---

## 4. Logik der Elemente

### 4.1 Hero und Kacheln (`renderKPIs`)

- Werte animiert über `animateKpiValue()` (Ziffern-Slots).
- **Veränderung**: zum vorherigen **vorhandenen** Monat (`sorted[idx−1]`), nicht zwingend zum
  Kalendervormonat.
- Ohne Stand im gewählten Monat: „—“; liegt der Monat in der Zukunft, zusätzlich
  „Keine Daten für zukünftigen Monat“.
- **Kachel-Filter** (`kpiChartFilter` = `assets` | `liquid` | `illiquid` | `liab`):
  - Hero und Hauptlinie zeigen die Summe der Kategorie (`_kpiFilterTotal`).
  - Die Unterlinien zeigen nur passende Gruppen (`_kpiFilterGroups`).
  - Die Liste graut fremde Gruppen aus (`_applyKpiListDim`).
  - Der Chart wird nicht neu aufgebaut, sondern morpht (`_morphNetChart`).

### 4.2 Chart (`renderNetChart`)

- Er braucht mindestens 2 Monate, sonst gibt es keinen Chart.
- Er lädt immer **alle** Monate; das sichtbare Fenster setzt `_netWindow(keys, netRange)` und
  endet am gewählten Monat.

Datensätze:

0. Hauptlinie: Nettovermögen bzw. gefilterte Summe. Crosshair und Hero lesen immer diesen Datensatz.
1. Vermögen (ausgeblendet)
2. Verbindlichkeiten negativ (ausgeblendet)
3. … Gruppen (`_netChartGroups`): Vermögen der Gruppe − zugeordnete Kredite, Grautöne von dunkel nach hell.

Weitere Regeln:
- Die y-Achse (`_netYLimits`) spannt nur die sichtbaren Monate und Linien auf, ohne auf
  „schöne“ Werte zu runden.
- Crosshair: Fahren oder Tippen zeigt im Hero den Wert und Monat.
- Tippen auf eine Listenzeile hebt die Linie hervor (`highlightChartLine`). Die Einzel-Asset-
  Isolation zeigt dann nur diese Gruppe (`body.iso-mode`).
- Chart-Standards (Zeitraum, Flächen, Log) gelten je Gerät: `localStorage['vermoegen-chart-defaults']`,
  `_chartDefaults()`, editierbar unter Einstellungen → Darstellung. Sie sind nicht Teil der Sicherung.

### 4.3 Asset-Liste (`_legendModel`, `buildNetGroups`)

- Gruppen mit Kredit erscheinen netto; Gruppen mit negativem Eigenkapital werden gezeigt,
  aber ohne Anteil.
- Anteil = Wert ÷ Summe der positiven Gruppen.
- Veränderung = zum Vormonat (`_prevDetails`).
- Eine Gruppe mit nur einer Position trägt deren Namen (`_groupDisplayName`).
- Das Symbol kommt aus Namen und Kategorie (`_v2Icon`).

### 4.4 Asset-Details (`showAssetDetail`)

Popup mit:
- Positionen der Gruppe, Stückzahlen und zugeordneten Krediten,
- Netto und Beleihung (Kredit ÷ Wert), sonst Gesamt,
- den letzten 12 Monaten: Sparleistung, Kursentwicklung (mit Rendite p. a.), sonstige
  Wertänderung (`calcFlows(…, onlyGroup)`).

### 4.5 Vermögensentwicklung (`calcFlows`, `renderFlowSection`)

Zerlegt die Veränderung des Nettovermögens zwischen zwei Monaten. Monat für Monat:

Stand nach der Fehlerbehebung vom 14.10.2026 (P2, P8):

| Fall | Zählt als |
| --- | --- |
| Stückzahl in einem der beiden Monate erfasst, beide Monate > 0 | Stückzahl-Änderung × aktueller Kurs = **Kauf/Verkauf** (Sparleistung); Rest = **Kursentwicklung** |
| Stückzahl erfasst, ganz neu oder ganz verkauft | Sparleistung |
| Stückzahl in einem Monat erfasst, im anderen fehlt sie (Wert > 0) | **Sonstiges** (nie Kursentwicklung) |
| keine Stückzahl erfasst: `cash`, `bav` | Sparleistung |
| keine Stückzahl erfasst: ganz neu oder ganz verkauft | Sparleistung (Kauf/Verkauf ist eine Umschichtung) |
| keine Stückzahl erfasst: übrige Wertänderung (Sachwerte) | Sonstiges |
| Verbindlichkeit sinkt / steigt | Tilgung = Sparleistung / neuer Kredit = Abfluss |
| Sachwert und Kredit **derselben Gruppe** steigen | kreditfinanzierter Kauf, neutralisiert |

Ein Kredit gehört dabei zur Gruppe seines verknüpften Vermögenswerts (`_liabTargetGroup`, wie in
Liste, Chart und Prognose), auch wenn er in einer eigenen Gruppe steht. Ein Neukauf in der Gruppe
verbraucht den Kreditanstieg zuerst; nur der Rest gleicht eine Werterhöhung aus. So wird derselbe
Kredit nicht zweimal verrechnet.

- Die Sparleistung wird je Monat saldiert: Umschichtungen heben sich auf, positiv =
  Einzahlungen, negativ = Entnahmen.
- `hasUnits` heißt nur „Stückzahl erfassbar“. Neu angelegte Positionen bekommen es weiterhin;
  beim Speichern eines Sheets setzt die App es nur noch mit Stückzahl oder Kursbewertung, damit
  ein Speichern ohne Änderung das Dokument nicht ändert. Für die Zerlegung zählt seit der
  Korrektur nur, ob eine Stückzahl erfasst ist (V5/P2 behoben).
- Ein neu angelegter Sachwert zählt im ersten Monat in voller Höhe als Sparleistung („neu
  gekauft“). Ein Kredit dazu gleicht das aus, auch in eigener Gruppe (V1/P8 behoben). Ein Kauf
  aus dem Konto ist insgesamt neutral (Konto −, Sachwert +).
- **Kursrendite p. a.** = `(1 + Kursentwicklung ÷ Ø investiertes Kapital mit Stückzahl)^(12/Monate) − 1`,
  ab 3 Monaten.

Die Karte zeigt:
- Zeitraum 3 M / 6 M / 1 J / Alle bis zum gewählten Monat,
- Säulen je Monat, Quartal oder Jahr (`_flowBuckets`); eine angetippte Säule zeigt sich im Kopf,
- Eckdaten:
  - Ø Sparleistung pro Monat,
  - Kursrendite p. a.,
  - **Notgroschen** = Cash ÷ Ø Budget-Ausgaben pro Monat (nur mit Budget),
  - **Verschuldung** = Verbindlichkeiten ÷ Bruttovermögen.

Auf-/Zuklappen merkt sich `ui-open-flow`.

**Kacheln auf dem iPhone**: Unter 768 px sind „Bruttovermögen“ und „Verbindlichkeiten“
ausgeblendet (CSS Z. ≈946); sichtbar bleiben „Liquides“ und „Illiquides Vermögen“. Der
Kachel-Filter für Verbindlichkeiten ist dort nicht erreichbar.

### 4.6 Live-Kurse

| Quelle | Funktion | Takt |
| --- | --- | --- |
| Bitcoin, Kraken-Paare (`provider: bitcoin`/`kraken`) | `livePriceTick()` → `fetchInstrumentQuote` (Kraken, Proxy als Rückfall) | alle 10 s |
| Wertpapiere (`provider: yahoo`) | `etfPriceTick()` (Yahoo über Proxy, Fremdwährung über Frankfurter/Yahoo, GBp ÷ 100) | alle 60 s |

Regeln:
- Kurse gelten nur für Positionen mit `valuation: market` und Stückzahl.
- Gleiche Instrumente werden nur einmal abgefragt.
- `lastQuote` wird in der Feldkonfiguration gespeichert.
- `applyLivePrices()` schreibt `Kurs × Stückzahl` **nur in den Live-Monat**, nur bei echter
  Änderung, nie während einer Bearbeitung und nie während der Chart-Interaktion. Danach
  aktualisiert es Kennzahlen, Liste, Vermögensentwicklung und den betroffenen Chart-Punkt.
- Bei einem Fehler bleibt der letzte Kurs; die Position ist in `_quoteErrors` markiert, der
  Punkt wird rot.
- Ausgeblendete Seite (`document.hidden`): keine Abrufe.
- Auf dem Mac über `file://` scheitern nur Abrufe gleicher Dateien; Kurs-APIs laufen über das Netz.

**Historische Werte aus Kursen** (seit 14.10.2026, PROBLEME.md P30):
- Ein Monatsstand M ist der Stand beim Wechsel in den Monat M; so friert auch der Live-Monat ein
  („Heute“ im Oktober = Stand November = Kurs Ende Oktober). Historisch wird deshalb mit dem
  **Schlusskurs des Vormonats** bewertet: Stand M = Stückzahl im Stand M × Monatsschlusskurs von
  M−1 in Euro. Fremdwährungen rechnet `fetchMonthlyPricesEUR` mit dem Wechselkurs desselben
  Monatsendes um (Yahoo-Monatsbalken `EURUSD=X` usw.).
- `quoteHistoryFlow(id)` lädt die Monatskurse, ermittelt die Abweichungen (`quoteHistoryChanges`)
  und fragt vor dem Überschreiben (Anzahl und Zeitraum der Monate, größte Änderung, Tipp zur
  Sicherung). Ohne Bestätigung, ohne Kurse oder ohne Abweichung ändert sich nichts. Geändert werden
  nur gespeicherte Monate vor dem Live-Monat mit Stückzahl > 0; Monate ohne Stückzahl oder ohne
  Kurs bleiben, ebenso manuelle Positionen. Alles in einer Transaktion.
- Angeboten wird das nach dem Umstellen einer Position auf Kurse (oder einer neuen Kursquelle),
  wenn frühere Monate Stückzahlen haben, nach dem Anlegen einer Kursposition mit „Im Besitz seit“
  und jederzeit im Verlauf einer Position („Werte aus Kursen übernehmen“).
- Monate ohne Handel füllt Yahoo mit dem letzten Kurs auf (Umsatz 0, Hoch = Tief). `_yahooMonthly`
  lässt sie aus; sie gelten als „kein Kurs“ (P31).
- Tests: `quote-history.test.cjs`. Die Einrichtung (`reconstructHolding`) bewertet seit P32 ebenfalls mit dem
  Kurs zum Monatswechsel.

### 4.7 Kreditverläufe im Vermögen

Vollständige Verträge erzeugen ihre Restschuld-Historie selbst (siehe 2.3). Ein
Hinweis erscheint einmal je Kredit als Mitteilung (`_loanHistoryNotif`). Gruppen mit
verknüpftem Kredit zeigen Eigenkapital; es kann auch negativ sein.

---

## 5. Tests

- `assets.test.cjs`:
  - Kategorien, Stückzahl und Cent-Genauigkeit,
  - Liquiditäts-Override wirkt auf Kennzahlen, Filter und Prognose,
  - Kurse nur im Live-Monat,
  - Yahoo/Kraken-Auswertung (Pence, Umrechnung),
  - Fehlerfall behält den letzten Kurs.
- `loan-history.test.cjs`: abgeleitete Monate, Beobachtungen bleiben, Netto-Historie mit
  negativem Eigenkapital, Sicherung rekonstruiert dieselbe Historie.
- `depreciation.test.cjs`: Abschreibungsplan bestimmt jeden Monat.
- `retirement-income.test.cjs`: Chart-Fenster endet am gewählten Monat.
- `setup.test.cjs`:
  - Achse spannt nur sichtbare Monate auf,
  - Gruppen nach Art,
  - Chart-Standards je Seite.
- `flows.test.cjs` (seit 14.10.2026): `calcFlows` mit Konto ohne Stückzahl (P2), Kauf und
  Kursentwicklung mit Stückzahl, Kauf eines Sachwerts aus dem Konto, Kredit in eigener Gruppe
  und Neubewertung im selben Monat (P8).
- `concurrency.test.cjs`: zwei Fenster auf einem Speicher (P1).
- Nicht abgedeckt:
  - Kursrendite p. a. von `calcFlows`,
  - Kachel-Filter und Morph,
  - Asset-Details.

**Gesamttest 14.10.2026** (neue Demo, Details in [PROBLEME.md](PROBLEME.md)):
- **Invariante** „Summe der Gruppen = Nettovermögen“ in allen 35 Monaten erfüllt.
- Kachel-Filter, Asset-Details aller 8 Gruppen, Zeiträume, Vermögensentwicklung
  (3/6/12/Alle) und Live-Popup laufen ohne Fehler.
- Laufzeit im Browser: `render()` 22 ms, `loadData()` 0,7 ms.

---

## 6. Befunde

Mit den Demo-Daten im Test-Harness nachgerechnet.

| # | Schwere | Befund |
| --- | --- | --- |
| V1 | mittel | Vermögensentwicklung ordnet Kredite nach `displayGroup` statt nach der verknüpften Gruppe – **behoben** (P8) |
| V2 | niedrig | „Illiquides Vermögen“ zieht alle Verbindlichkeiten ab |
| V3 | niedrig | Veränderung zum vorhandenen, nicht zum Kalendervormonat |
| V4 | niedrig | Schlüssel des Live-Monats ist der Folgemonat |
| V5 | **hoch** | Speichern ohne Änderung macht aus Sparleistung „Sonstiges“ (PROBLEME.md, P2) – **behoben** |
| V6 | niedrig | Kurssprünge im Live-Monat der neuen Demo (PROBLEME.md, DEMO-5) – **behoben** (Historie aus echten Kursen) |

**V1 – Vermögensentwicklung ordnet Kredite falsch zu.** In der neuen Demo sichtbar:
Garagenkauf 01/2026 für 60.000 €, finanziert über „Kredit Garagen“ in eigener Gruppe. Die
Immobilien-Details zeigen „Sparleistung +72.231 €“ für 12 Monate.

 `calcFlows` filtert mit
`f.displayGroup || f.category` und neutralisiert kreditfinanzierte Käufe nur innerhalb dieser
Gruppe. Überall sonst (Liste, Chart, Details, Prognose) gilt `_liabTargetGroup` (verknüpfter
Vermögenswert). Neue Kredite bekommen beim Anlegen ihre **eigene** Gruppe und werden über
`assetId` verknüpft. Damit sind gerade neu angelegte Kredite betroffen:
- **Asset-Details der Immobilie**: Sparleistung der letzten 12 Monate in der Demo 12.195 €.
  Liegt der Kredit in der Gruppe „Immobilienkredit“: **0 €**, die Tilgung fehlt.
- **Kreditfinanzierter Kauf**: Wohnung und Kredit steigen in verschiedenen Gruppen. Der Kauf
  erscheint dann als Abfluss (neuer Kredit) plus „Sonstiges“ (Wertzuwachs) statt neutral.
- Vorschlag: In `calcFlows` für Verbindlichkeiten `_liabTargetGroup(f)` verwenden. Ein Test
  sollte das mit einem Kredit in eigener Gruppe absichern.
- **Behoben 14.10.2026**: `calcFlows` nutzt `_liabTargetGroup(f)`; Neukäufe verbrauchen den
  Kreditanstieg zuerst. Demo, Immobilien-Details 10/2025–10/2026: Sparleistung 72.195 € →
  12.955 € (Tilgungen), Sonstiges 13.929 € (Neubewertung der Wohnung +10.000 €, Abschreibung der
  Garagen). Die Gesamtwerte aller Gruppen bleiben gleich. Tests: `.tests/flows.test.cjs` (P8).

**V2 – „Illiquides Vermögen“ zieht alle Verbindlichkeiten ab.** Auch Konsumschulden wie die
Kreditkarte mindern das illiquide, nie das liquide Vermögen. Das entspricht der
Kachel-Erklärung, ist aber bei Haushalten ohne Immobilie irritierend: illiquide kann negativ
werden, während liquide unberührt bleibt. Optional: nicht verknüpfte Schulden vom liquiden
Vermögen abziehen.

**V3 – Veränderung zum vorhandenen, nicht zum Kalendervormonat.** Fehlen Monate, umfasst
„+x € zum Vormonat“ mehrere Monate, ohne dass es dasteht.

**V4 – Schlüssel des Live-Monats ist der Folgemonat.** Das ist Absicht und in DATA_MODEL.md
erwähnt, für neue Entwickler aber überraschend: Stand „Heute“ im Oktober = `2026-11`. Neuer
Code, der „aktuellen Monat“ braucht, muss `nextYM()` verwenden, nicht `currentYM()`.

**V5 – Speichern ohne Änderung macht aus Sparleistung „Sonstiges“.** Siehe 4.5 und
PROBLEME.md, P2. In der Vorschau wurden Tagesgeld, Girokonto und Bargeld je einmal
unverändert gespeichert:

| Wert, letzte 12 Monate | vorher | nachher |
| --- | --- | --- |
| Cash-Sparleistung | +7.413 € | 0 € |
| Cash „Sonstiges“ | 0 € | +7.413 € |
| „Gespart“ gesamt | 56.825 € | 49.412 € |

Vorschlag: in `calcFlows` den Stückzahl-Zweig nur bei erfasster Stückzahl verwenden.

**Behoben 14.10.2026**: so umgesetzt; bestehende Daten sind ohne Migration wieder richtig. Im
Browser wurden alle 17 Positionen und Kredite der Demo ohne Änderung gespeichert: Das Dokument
blieb unverändert. Tests: `.tests/flows.test.cjs` (P2).

**V6 – Kurssprünge im Live-Monat der neuen Demo.** Aktien und Ethereum sind jetzt per Kurs
bewertet, die Historie hat aber die alten Demo-Kurse: Apple +35 %, Ethereum −32 % in einem
Monat. Die Krypto-Details zeigen „Kursentwicklung ≈ −76 % pro Jahr“. Kein Fehler der App,
sondern der Daten.

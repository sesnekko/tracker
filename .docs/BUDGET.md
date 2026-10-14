# Budget – Seite, Datenstruktur und Logik

Stand: 14.10.2026, Code-Stand `7504901` (Schema 12). Funktionsnamen beziehen sich auf
`index.html`; Zeilennummern sind Näherungswerte.

Verwandt: [README.md](README.md) · [DATEN.md](DATEN.md) (Erfassung im Bereich „Einnahmen &
Ausgaben“) · [PROGNOSE.md](PROGNOSE.md) · [DATA_MODEL.md](DATA_MODEL.md)

---

## 1. Zweck

Das Budget ist ein **wiederkehrender Jahresplan ohne Jahresbezug**: zwölf Monatswerte je
Posten, Januar bis Dezember. Die Seite (`#page-budget`) zeigt:

- Ø Monatseinnahmen,
- Fixkosten, Lebenshaltung und Sparquote,
- eine Aufschlüsselung des gewählten Monats,
- den Geldfluss zwischen Konten aus den Daueraufträgen.

Das Budget liefert außerdem Werte an andere Bereiche:

- **Prognose**: Sparraten-Vorschlag (`deriveSavingsFromBudget`), Einnahmen im Ruhestand
  (`retirementIncome`), Partner-Story (Einnahmen, Vermögensaufbau).
- **Vermögen**: Notgroschen = Cash ÷ Ø Ausgaben.

---

## 2. Datenstruktur

### 2.1 Legacy-Schlüssel `budgetData` (so liest die App)

```js
{
  einkommen: [Posten], fixe: [Posten], variable: [Posten], sparen: [Posten],
  oneTime:   [{id, name, category, kind, month:'YYYY-MM', amount, targetGroupId}],
  accounts:  {Kontoname: IBAN},
  standingOrders: [{id, from, to, amount}]          // Namen von Konten oder freie Bezeichnungen
}
Posten = {id, name, subcat, kind, values:[12 Zahlen], targetGroupId?, targetGroup?,
          loanId?, depotId?, retirement?}
```

### 2.2 Dokument (`data-store.js`)

| Dokument | Inhalt |
| --- | --- |
| `budget.items[]` | `{id, name, category ('einkommen'\|'fixe'\|'variable'\|'sparen'), subcategory, kind, targetGroupId, monthlyAmounts[12], loanId?, depotId?, retirementIncome?}` |
| `budget.oneTime[]` | einmalige Zahlung in genau einem Kalendermonat (Version 4) |
| `budget.standingOrders[]` | `from`/`to` = `{type:'account', accountId}` oder `{type:'label', name}` |
| `accounts[]` (Wurzel) | `{id, name, iban}` |
| `budget = null` | Budget nicht eingerichtet |

**Art (`kind`)**: `income`, `expense`, `saving`, `principal` (Tilgung), `loanPayment` (Kreditrate).
Alte Posten ohne Art bekommen sie einmalig bei der Migration über Namensmuster
(`budgetKind`, z. B. „Tilgung“ → `principal`, „ETF/Sparplan“ → `saving`). Danach zählt die
gespeicherte Art; Umbenennen ändert nichts mehr.

**Verknüpfungen**:

| Feld | Version | Wirkung |
| --- | --- | --- |
| `targetGroupId` | – | Zielgruppe eines Sparpostens/einer Tilgung im Vermögen |
| `loanId` | 6 | Rate gehört zu diesem Kredit |
| `depotId` | 9 | Sparposten wird durch ein Altersvorsorgedepot ersetzt |
| `retirementIncome` | 11 | Einnahme läuft im Ruhestand weiter |

**Rhythmus** wird nicht gespeichert, sondern aus den zwölf Werten abgelesen (`_budgetRhythm`):

| Rhythmus | Bedingung |
| --- | --- |
| monatlich | alle 12 Werte gleich |
| jährlich | genau ein Wert ≠ 0 |
| vierteljährlich | 4 gleiche Werte im Abstand von 3 Monaten |
| je Monat unterschiedlich | alles andere |

`_budgetValues()` macht das Umgekehrte.

---

## 3. Monatsrechnung (`calcBudgetMonth(bd, monthIdx, includeOnce, ym)`)

Eingang: Planmonat `monthIdx` (0–11). Das **Kalenderjahr kommt aus `_budgetYM()`**: im Live-Monat
(„Heute“, intern `nextYM()`) der laufende Kalendermonat, sonst der gewählte Monat (seit
14.10.2026, BU1/P7). Optional gibt `ym` den Monat direkt vor (Prognose, Finanzierungsprüfung).
Das Jahr bestimmt automatische Kreditraten, Depotbeiträge und einmalige Zahlungen.

| Quelle | Zählt als |
| --- | --- |
| `einkommen` | Einnahmen; optional einer Person zugeordnet (`person`, seit Schema 14). Ein Posten, dessen Name „Kindergeld“ enthält, entfällt, sobald Kinder erfasst sind |
| `fixe` | Fixkosten; Kreditraten werden aufgeteilt (siehe unten) |
| `variable` mit Art `saving` | Sparpläne |
| `variable` sonst | variable Ausgaben (Lebenshaltung); Kreditraten aufgeteilt |
| `sparen` | Sparpläne; ein mit einem Depot verknüpfter Posten entfällt nur in Monaten, in denen das Depot tatsächlich eine automatische Beitragszeile hat (P26) |
| einmalige Zahlungen (nur `includeOnce`, nur im eigenen Kalendermonat) | je nach Art |
| **automatische Kreditraten** (`_automaticLoanRows`: jeder Kredit mit vollständigem Vertrag) | Zins → Fixkosten; Tilgung + Sondertilgung → Tilgung. Gleichnamige manuelle Posten fallen weg |
| **Altersvorsorgedepots** (`_automaticDepotRows`, nur mit Bereich Altersvorsorge) | Beitrag → Sparpläne; Zulage (Jahresbetrag ÷ 12) → Einnahme **und** Sparplan |
| **Kindergeld** (`_automaticChildRows`, seit Schema 14) | 259 € je Kind mit Anspruch in diesem Monat (§ 66 EStG: Geburtsmonat bis Monat des 18. bzw. 25. Geburtstags) → Einnahme, Unterkategorie „Kinder“ |

**Kreditraten aufteilen**:

1. Verknüpft (`loanId`) und Vertrag vorhanden → Posten entfällt (die automatische Rate gilt).
2. Verknüpft ohne Vertrag → Zins = Restschuld des letzten Monats × Sollzins ÷ 12, Rest = Tilgung.
3. Nicht verknüpft, aber Kreditdaten vorhanden → Zinsanteil = `loanInterestShare()` (Zinsen ÷
   Raten über alle Altkredite), gleicher Anteil für jede Rate.
4. Sonst: Posten „Tilgung“ zählt ganz als Tilgung, andere Kreditraten bleiben Ausgabe.

**Ergebnis**:

```
ausgaben  = fixkosten + variable
aufbau    = sparplaene + tilgung          (Vermögensaufbau)
frei      = einnahmen − ausgaben − aufbau
sparquote = aufbau ÷ einnahmen
```

**Durchschnitt** (`_avgBudget(bd, feld)`): über die zwölf Planmonate. Ausnahme: Für
`einnahmen` zählen **nur Monate mit Einnahmen** (siehe Befund BU2). Einmalige Zahlungen
zählen nie in den Durchschnitt.

---

## 4. Seitenaufbau (`renderBudgetPage`, Z. ≈5747)

| Element | Wert |
| --- | --- |
| Hero „Ø Monatseinnahmen“ | `_avgBudget('einnahmen')`; darunter Minimum und Maximum der Monatseinnahmen (auch wenn beide gleich sind: „↓ 5.375 € • ↑ 5.375 €“) |
| Kachel Einnahmen | Einnahmen **des Planmonats** („Plan Nov“) |
| Kachel Fixkosten | Ø Fixkosten, % der Ø Einnahmen |
| Kachel Lebenshaltung | Ø variable Ausgaben, % der Ø Einnahmen |
| Kachel Sparquote | Ø Vermögensaufbau ÷ Ø Einnahmen |
| Aufschlüsselung (`renderBudgetBreakdown`) | gewählter Monat inkl. einmaliger Zahlungen (siehe unten) |
| Geldfluss (`renderBudgetSankey`) | Daueraufträge (siehe unten) |

Auf iPad und Mac verkleinert `_fitBudget()` erst die Mindesthöhe des Geldflusses und dann die
Kästen (bis 84 px), damit die Seite ohne Scrollen passt. Reicht das nicht, scrollt sie.
Gemessen mit der neuen Demo:

| Fenster | Ergebnis |
| --- | --- |
| 1147 × 1378 (dein Mac-Fenster) | passt |
| 1440 × 900 | scrollt (1.132 px) |
| iPhone 375 × 812 | scrollt wie vorgesehen |

Die Aufschlüsselung zeigt den gewählten Monat. Die Kacheln Fixkosten und Lebenshaltung
zeigen dagegen den Jahresdurchschnitt. In der Demo heißt das: „Ausgaben 2.518 €“ im November
gegenüber Ø 1.580 + 960 = 2.540 € in den Kacheln.

### 4.1 Aufschlüsselung

Gestapelte Balken, ausklappbar:
- **Einnahmen**,
- **Ausgaben**: Fixe und variable Ausgaben mit Unterkategorien,
- **Vermögensaufbau**: Sparpläne und Tilgung,
- zuletzt **Nicht verplant** bzw. **Überplant** (rot).

Seit dem 13.10.2026 ist alles absteigend nach Betrag sortiert: Kategorien, Unterkategorien,
Einzelposten.

Unterkategorien: Die eigene `subcat` des Postens hat Vorrang. Ohne sie greift eine
Schlagwortliste:
- Fix: Haus, Betreuung, Versicherungen, Verträge, Autos, Sonstiges.
- Variabel: Lebensmittel, Lifestyle, Drogerie, Medikamente, Frisör, Sonstiges.

### 4.2 Geldfluss

- Zweispaltiges Sankey: links die Quellkonten, rechts die Zielkonten, Breite nach Betrag.
- Daueraufträge mit `from === 'Kindergeld'` werden nicht als Quelle gezeigt, sondern dem Ziel
  zugerechnet.
- Tippen auf eine Karte dreht sie um und zeigt die IBAN.
- Ohne Einnahmen oder ohne Daueraufträge erscheint ein Hinweis mit Sprung zur Daten-Seite.
- Die Spaltentitel lauten „Einnahmen“ und „Ausgaben“. Die rechte Spalte zeigt aber Zielkonten
  (Haushaltskonto, Lastschriften, Depot), keine Ausgaben.
- Demo: Daueraufträge 4.300 €, Plan-Einnahmen 5.375 €. Ein Abgleich findet nicht statt (BU4).

---

## 5. Erfassung (Daten-Seite, Bereich „Einnahmen & Ausgaben“)

- **Liste** (`_budgetListHTML`):
  - je Kategorie absteigend nach Jahressumme,
  - Rhythmus, Unterkategorie, „ersetzt durch Kreditvertrag/Altersvorsorgedepot“,
  - einmalige Zahlungen getrennt; älter als ein Jahr eingeklappt.
- **Sheet** (`openBudgetSheet` / `_saveBudgetSheet`):
  - Wiederkehrend oder einmalig; Einnahme, Ausgabe (fix/variabel) oder Sparen.
  - Betrag mit Rhythmus und Monat, oder zwölf eigene Werte.
  - Optional: Gruppe (`subcat`), „Fließt in“ (Zielgruppe beim Sparen), „Kreditrate für“
    (verknüpft einen Kredit), „Beitrag für“ (verknüpft ein Depot), „Auch im Ruhestand“ (bei
    Einnahmen, mit Dublettenprüfung `_retIncomeDuplicate`).
  - Speichern in einer Transaktion. Die ID bleibt beim Bearbeiten erhalten.
- **Konten** (`openAccountSheet`): Name und IBAN; Umbenennen zieht die Daueraufträge mit.
- **Daueraufträge** (`openOrderSheet`): Von, Nach (Konto oder freie Bezeichnung), Betrag pro Monat.

---

## 6. Tests

- `budget-entries.test.cjs`:
  - einmalige Zahlungen (Sicherung, nur im eigenen Monat, nie im Durchschnitt),
  - Rhythmus hin und zurück,
  - Bearbeiten behält die ID,
  - Konten und Daueraufträge.
- `loans.test.cjs`: Budget nutzt Zins, Tilgung und Sondertilgung des Vertrags je Monat, ohne Doppelzählung.
- `pension-depot.test.cjs`: Beitrag als Sparen, Zulage als Einnahme und Sparen, verknüpfter
  Posten wird ersetzt.
- `setup.test.cjs`: verknüpfte Rate in Zins und Tilgung, Kreditvorschlag aus dem Namen.
- `i18n.test.cjs`: Sortierung der Daten-Seiten-Liste.
- Nicht abgedeckt:
  - `_avgBudget` mit Lücken,
  - Unterkategorie-Schlagworte,
  - Geldfluss (Sankey),
  - Jahr des Budgets bei `selectedMonth` im Folgejahr.

**Gesamttest 14.10.2026** (neue Demo, Details in [PROBLEME.md](PROBLEME.md)):
- Alle 12 Planmonate mit drei Kreditverträgen, Sondertilgungen und Depots nachgerechnet:
  - Zins- und Tilgungsanteile sinken bzw. steigen je Monat richtig.
  - März (Autokredit +1.000 €) und August (Wohnung +2.500 €) sind korrekt „Überplant“ (−31 € / −1.531 €).
  - Die Depots erscheinen erst ab 2027.
- Kacheln, Aufschlüsselung, Geldfluss und Monatswechsel laufen ohne Fehler; die Seite baut in 14 ms auf.
- Ein Sparposten auf eine Gruppe ohne aktive Positionen (Altersvorsorge-Beiträge, 70 €) zählt
  im Budget, fehlt aber in der Prognose (BU7).

---

## 7. Befunde

| # | Schwere | Befund |
| --- | --- | --- |
| BU1 | mittel | Budget zeigt standardmäßig den Plan des Folgemonats – **behoben** (P7) |
| BU2 | niedrig | Ø Einnahmen und Ø Ausgaben haben verschiedene Basen |
| BU3 | niedrig | Schlagwörter treffen Teilwörter |
| BU4 | niedrig | Geldfluss nur einstufig, „Kindergeld“ fest im Code, kein Abgleich mit dem Plan |
| BU5 | niedrig | Zinsanteil ohne Vertrag bleibt das ganze Jahr gleich |
| BU6 | niedrig | Übersetzungslücke beim Rhythmus |
| BU7 | mittel | Sparposten auf eine Gruppe ohne aktive Positionen verschwindet in der Prognose (PROBLEME.md, P15) – in der Demo behoben, Hinweis in der App offen |

**BU1 – Budget zeigt standardmäßig den Plan des Folgemonats.** Nachgerechnet mit der neuen
Demo und dem Datum 15.12.2026:
- Plan Januar 2027 statt Dezember 2026.
- Ø Vermögensaufbau 2.158 → 2.206 €, Ø Einnahmen 5.375 → 5.465 €, weil die Depots 2027 beginnen.
- Auch die Daten-Seite zeigt dann „Automatische Kreditraten · Jan 2027“.

 `selectedMonth` steht beim
Start auf dem Live-Monat `nextYM()`. Im Vorschau-Browser am 14.10.2026 nachgeprüft: Die Kachel
zeigt „**Plan Nov**“. Folgen:
- Die Aufschlüsselung zeigt die Werte des Folgemonats; einmalige Zahlungen des laufenden
  Monats fehlen.
- Im Dezember springt der Plan auf Januar **des Folgejahres**. Automatische Kreditraten und
  Depotzulagen werden dann mit dem nächsten Jahr gerechnet.
- Vorschlag: Für das Budget aus dem Live-Monat den Kalendermonat ableiten
  (`selectedMonth === nextYM() ? currentYM() : selectedMonth`) und das Jahr daraus nehmen.
- **Behoben 14.10.2026**: genau so als `_budgetYM()`; Budget-Seite und Daten-Seite
  („Automatische Kreditraten“, Depots) nutzen ihn. Test: `forecast-cashflow.test.cjs` P7.

**P26 – Verknüpfter Sparposten verschwand vor Beginn des Depots** (PROBLEME.md, P26).
Behoben 14.10.2026: Der Posten entfällt nur, wenn im selben Monat eine automatische Depotzeile
existiert. Vor 2027, nach dem letzten Beitragsjahr oder bei Beitrag 0 zählt der Posten weiter.

**Personen im Budget** (Schema 14, Entscheidung 14.10.2026): Im Budget-Eintrag wählst du bei Einnahmen die Person
(Haushalt, Ich, weitere Personen). Das Gehalt einer weiteren Person ist der Ø ihrer zugeordneten Einnahmen ohne „Auch
im Ruhestand“; die Prognose zählt es nach deinem Arbeitsende bis zu ihrem Arbeitsende, je Lebensphase nach ihrer
Arbeitszeit. Ordnest du dein eigenes Gehalt dir zu, rechnet die Prognose auch deine Arbeitszeit je Phase mit (Schema 15):
Solange du arbeitest, ändert sich der Haushaltssaldo mit allen zugeordneten Gehältern. Ohne Zuordnung wirkt deine
Arbeitszeit nur auf Rentenpunkte und Dienstjahre. Haushaltseinnahmen (z. B. Miete) ändern die Prognose nicht. Das Kindergeld kommt automatisch aus den Kindern (Daten →
Haushalt) und erscheint auf der Daten-Seite als „Kindergeld · automatisch“. Demo, Januar 2026: 5.384 € Einnahmen
(inkl. 259 € Kindergeld für Lena).

**Budget und Prognose** (P24, behoben 14.10.2026): Die Prognose prüft die Sparraten der Phase 1
gegen den Überschuss des Budgets im laufenden Jahr (`_planFunding`: Einnahmen ohne Depotzulagen
− Ausgaben − Tilgung − eigene Depotbeiträge). Liegen die Sparraten darüber, entnimmt sie die
Lücke jeden Monat aus dem Vermögen und zeigt das in der Ergebnis-Karte. Einmalzahlungen gehen
nicht in diese Prüfung ein.

**BU2 – Ø Einnahmen und Ø Ausgaben haben verschiedene Basen.** `_avgBudget('einnahmen')` zählt
nur Monate mit Einnahmen, alle anderen Werte mitteln über zwölf Monate. Beispiel: Einnahmen
nur von Juli bis Dezember (Posten mitten im Jahr angelegt) → Ø Einnahmen = voller
Monatswert, Ø Ausgaben = halber Wert. Fixkosten- und Lebenshaltungsquote sowie die Sparquote
erscheinen dann zu günstig. Vorschlag: gleiche Basis verwenden, z. B. Monate, in denen
irgendein Posten einen Wert hat.

**BU3 – Schlagwörter treffen Teilwörter.** Die Zuordnung ohne eigene Unterkategorie prüft
`includes()`:
- „dm“ trifft „Admiral“, „gas“ trifft „Gastronomie“, „auto“ trifft „Automat“.
- Einige Begriffe sind haushaltsspezifisch („ogata“, „essensgeld“).

Wirkt nur auf die Darstellung. Vorschlag: Wortgrenzen (`\b`) und die Liste als Konstante
neben `CATEGORY_GROUPS`.

**BU4 – Geldfluss nur einstufig.**
- Ein Konto, das Geld empfängt und weitergibt (Haushaltskonto → Lastschriften), erscheint
  links und rechts.
- Die Sonderbehandlung hängt am exakten Namen „Kindergeld“; „Kindergeld Anna“ wäre eine
  normale Quelle.
- Daueraufträge haben keinen Rhythmus und werden nicht mit dem Plan abgeglichen. Fehlende
  oder überzählige Beträge fallen nicht auf.

**BU5 – Zinsanteil ohne Vertrag bleibt das ganze Jahr gleich.** Bei verknüpften Raten ohne
Vertrag gilt die Restschuld des letzten Monats für alle zwölf Planmonate. Ohne Verknüpfung
gilt ein gemeinsamer Zinsanteil für alle Raten. Bei mehreren Krediten mit unterschiedlichen
Zinsen ist die Aufteilung je Rate damit ungenau, die Summe stimmt.

**BU6 – Übersetzungslücke beim Rhythmus.** `_rhythmText` liefert „quartalsweise (Jan, Apr, …)“.
Dafür fehlt ein Eintrag in `i18n-en.js`; im englischen Modus bleibt der Text deutsch.

**BU7 – Sparposten auf eine Gruppe ohne aktive Positionen.** (Stand 14.10.2026: In der Demo ist der
Posten entfernt, Budget und Prognose zeigen beide 825 €. Die App selbst weist auf solche Posten
weiterhin nicht hin.) In der neuen Demo zielt
„Altersvorsorge-Beiträge“ (70 €/Monat) auf die Gruppe „Altersvorsorge“. Deren beide
Positionen sind archiviert. Die Gruppe fehlt deshalb im Planmodell der Prognose:

| Anzeige | Sparen |
| --- | --- |
| Budget | 895 € |
| Phasen-Karte der Prognose | 825 € |
| „Sparraten aus Budget übernehmen“ | „Nicht zugeordnet: Altersvorsorge-Beiträge“ |

Vorschlag: beim Archivieren der letzten Position einer Gruppe auf verknüpfte Budgetposten
hinweisen.

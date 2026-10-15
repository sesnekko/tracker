# Prognose – Seite, Datenstruktur und Rechenlogik

Stand: 14.10.2026 nach der Fehlerbehebung (Schema 13, noch nicht committet). Die Analyse
entstand auf Code-Stand `7504901`; Abschnitte 4 bis 7 beschreiben das neue **Monatsmodell**, das
die Befunde P18–P29 behebt (Status je Befund: [PROBLEME.md](PROBLEME.md), Abschnitt 0). Alle
Funktionsnamen beziehen sich auf `index.html`, sofern nicht anders angegeben. Zeilennummern sind
Näherungswerte und dienen nur zur Orientierung.

Verwandte Dokumente: [DATA_MODEL.md](DATA_MODEL.md) (Sicherungsformat, Schema-Historie),
[README.md](README.md) (Übersicht aller Bereiche).

---

## 1. Zweck

Die Prognose beantwortet drei Fragen:

1. **Reicht das Geld?** Erfolgschance = Anteil von 500 simulierten Marktverläufen, in denen das
   entnehmbare Vermögen bis zum Planungshorizont (Standard 95) nie ausgeht.
2. **Ab wann ist der Ruhestand sicher möglich?** Frühestes Alter, ab dem die Erfolgschance das
   Sicherheitsniveau (Standard 85 %) erreicht.
3. **Wie entwickelt sich das Vermögen?** Median und 10.–90.-Perzentil je Lebensjahr, in heutiger
   Kaufkraft, gegliedert in vier Lebensphasen.

Grundprinzip: **Alle Eingaben sind in heutiger Kaufkraft.** Die Simulation rechnet nominal
(mit Inflation), die Anzeige rechnet wieder in heutige Kaufkraft zurück (`defl()`).

---

## 2. Seitenaufbau (`#page-lifetime`, ab Zeile ≈2325)

Von oben nach unten:

| Element | ID / Klasse | Befüllt von | Sichtbar |
| --- | --- | --- | --- |
| Hero „Nettovermögen heute“ | `#lt-hero`, `#lt-hero-pill` | `_v2LtHeroRest()`, beim Fahren über den Chart `showAtIdx()` | ja |
| Lebensbalken (Geburt / heute / Ø Lebensende) | `#lt-progress-collapse` | `renderLifetimePageCalcs()` | **nein** (CSS Z. ≈1515 `display:none!important`) |
| Ziel-Balken (verfügbar / Ziel) | `#lt-target-section` | `renderLifetimePageCalcs()`, Crosshair | **nein** (gleicher Container) |
| Chart | `#chartLifetime` (Chart.js `charts['lifetime']`) | `renderLifetimePageCalcs()` | ja |
| Zeitraum 5 J / 10 J / 25 J / Alle, Flächen, Log | `[data-lt-range]`, `#ltAssetsToggleBtn`, `#ltLogToggleBtn` | Zustand `ltRange`, `ltShowAssets`, `ltUseLog` (Z. ≈2625, Standard aus „Darstellung der Charts“) | ja |
| Ergebnis-Karte „Vorruhestand/Ruhestand mit X“ | `#v2-lt-summary` | `_v2LtSummary()`: Erfolgschance mit Ziel in einer Zeile („Was bedeutet das? ›“ → `openSuccessExplain`), ein Satz, zwei Kacheln (Verfügbar mit X, Sicher möglich ab); die Skala entfällt. Die Kennzahlen Vermögen am Horizont, Ø Rendite und Schuldenfrei sind seit 15.10.2026 entfernt | ja |
| Lebensphasen-Karte | `#v2-lt-phases` | `_v2LtPhases()`: je Phase **eine Zeile** (Name, Zeitraum, Wert); Antippen klappt die Beschreibung auf (`_v2Fold`), dort „Phase bearbeiten ›“ → `openPhasesSheet(i)`. Weitere Personen nur als eigener Phasenbalken (die Zeilen „Weitere Personen“ sind seit 15.10.2026 entfernt: Balken, „Einkommen im Ruhestand“ und „Bearbeiten“ zeigen dasselbe). Unter jedem Balken ist der Rentenbeginn immer beschriftet (`_ticksHTML`); eine zu nahe Marke davor entfällt | ja |
| „Annahmen bearbeiten“ | `#v2-lt-open` | klappt den Abschnitt „Annahmen“ unten auf dieser Seite auf und scrollt hin (`_v2OpenForecastSettings`) | ja |
| 4 KPI-Kacheln (Ziel, Erfolgschance, Rente möglich ab, Bei Rentenbeginn) | `.kpi-grid`, `#lt-target-real` … | `renderLifetimePageCalcs()` | **nein** (CSS Z. ≈1516) |
| Einkommen im Ruhestand | `#lt-more-list` | `renderLifetimePageCalcs()`: Summe, Deckung, mit mehreren Personen je Person eine aufklappbare Zwischensumme (`.v2-inc-grp`), sonst die Einzelzeilen; Fußnote nur mit weiteren Personen oder EM-Rente | ja |
| „So wird gerechnet“, Partner-Story | `.v2-lt-links`: `[data-info=lt-method]` (`INFO['lt-method']`), `#psOpen` → `openPartnerStory()` | zwei Zeilen in einer Karte | Partner-Story nur mit weiterer erwachsener Person |
| Annahmen | `#ltAssume` > `#v2-forecast-sec` (Lebensplanung, Lebensphasen, Ereignisse, Rendite & Sparrate je Asset) | `updateLifetimeInputs()`, `renderEventEditor()`, `buildAssetParamsTable()`; speichert sofort (`v2-live`). Seit 14.10.2026 hier statt auf der Daten-Seite; die Optik kommt aus denselben Regeln (`:is(#page-import,#ltAssume)`) | ja, zugeklappt |

Lebensphasen mit weiteren Personen: je Person ein Phasenbalken auf derselben Zeitachse (heute bis zum Planhorizont, Alter
der Person; `_personBarHTML`: Vollzeit, Teilzeit, ohne Arbeit, Rente in den Farben der Phasen). Die Erklärung der
Erfolgschance (`openSuccessExplain`) steht in einer Infobox mit begrenzter Höhe; der Text scrollt, Titel und „Schließen“
bleiben stehen.

Auf dem Mac (≥1280 px) liegt alles ab der Ergebnis-Karte in der rechten Spalte `.desk-rail`; die Annahmen stehen
darunter (Bereich `assume`, höchstens 860 px breit).

Eingaben, die auf der Prognose wirken, liegen auf der Daten-Seite (Bereiche „Haushalt“ und „Altersvorsorge“), unten auf
dieser Seite (Annahmen) und im Phasen-Sheet. Alle Lebensphasen-Parameter
(Phasengrenzen, Bedarf, Sparen, Entnahme, Arbeitszeit und Altersvorsorge je Person, Arbeitsende und
Rentenbeginn weiterer Personen) stehen nur im Phasen-Sheet (8.4), das von dieser Seite aus geöffnet wird.

---

## 3. Datenquellen

Die App liest und schreibt weiterhin über Legacy-Schlüssel (`appStorage.getItem/setItem`), die
`data-store.js` auf das versionierte Dokument abbildet (siehe DATA_MODEL.md).

### 3.1 Einstellungen (`getLifetimeSettings()`, Z. ≈8608)

| Legacy-Schlüssel | Dokumentfeld (`forecast.settings.*`) | Feld in `s` | Standard |
| --- | --- | --- | --- |
| `lt-birth-year` | `retirement.primary.birthYear` | `birthYear` | 1990 |
| `lt-birth-month` | `retirement.primary.birthMonth` | `birthMonth` (1–12) | 1 (Januar); seit Schema 13 mit Auswahl auf der Daten-Seite (B3/P17) |
| `lt-life-expect` | `lifeExpectancyAge` | `lifeExpect` | 85 |
| `lt-plan-horizon` | `planningHorizonAge` | `planHorizon` | 95 |
| `lt-inflation` | `inflationPercent` | `inflation` | 2 |
| `lt-save-until` | `saveUntilAge` | `saveUntil` (Ende Phase 1) | 60 |
| `lt-savings-growth` | `savingsGrowthPercent` | `savingsGrowth` | 0 |
| `lt-withdraw-from` | `retirementAge` | `withdrawFrom` (Ende der Arbeit) | 60 |
| `lt-pension-age` | `pensionStartAge` | `pensionAge` (Beginn Phase 4) | DRV-Alter, sonst Regelaltersgrenze |
| `lt-monthly-withdraw` | `monthlySpending` | `monthlyWithdraw` (Bedarf Phase 3) | 2.000 |
| `lt-pension-spending` | `pensionSpending` | `pensionSpending` (Bedarf Phase 4) | wie Phase 3 |
| `lt-p1-work` | `phase1WorkPercent` (Schema 15) | `p1Work` (0–1), deine Arbeitszeit in Phase 1 | 100 % |
| `lt-p2-work` | `phase2WorkPercent` | `p2Work` (0–1) | wie Phase 1 |
| `lt-p2-saving` | `phase2SavingPercent` | `p2Saving` (0–2) | 0 % |
| `lt-p2-pension` | `phase2PensionPercent` | `p2Pension` (0–2) | 100 % (solange du arbeitest) |
| `lt-p2-withdraw` | `phase2MonthlyWithdrawal` | `p2Withdraw` €/Monat | 0 |
| `lt-p3-saving` | `phase3SavingPercent` | `p3Saving` | 0 % |
| `lt-p3-pension` | `phase3PensionPercent` | `p3Pension` | 0 % |
| `lt-safety` | `safetyPercent` | `safety` (auf 50–99 begrenzt) | 85 |
| `lt-pensions` | `retirement.incomes[]` | `pensions` (`{name, amount, from, until?}`; `until` seit Schema 13) | [] |
| `lt-events` | `forecast.events[]` | `events` | [] |
| `lt-asset-params` | `groups[].assumptions` | `assetParams` | {} |

`_ltPhases(s)` leitet daraus die Phasengrenzen ab:

```
phase2From = min(saveUntil, withdrawFrom)    Ende Ansparen
workEnd    = withdrawFrom                    Ende der Arbeit = Beginn Vorruhestand
phase4From = max(withdrawFrom, pensionAge)   Beginn Rente
```

Damit sind die Grenzen immer geordnet. Eine Phase mit Dauer 0 entfällt. `_phaseAt(s, age)`
liefert die Phase 1–4 eines Alters.

Arbeit je Phase (Schema 15): `workRef` = deine Arbeitszeit in der Phase, in der heute liegt (`_workRef`);
dafür gilt dein Budget-Gehalt. `_ownWork(s)` und `_personWork(s, p)` liefern je Person das Profil
`{w[4], ref, pen[4], workEndMain, shift}`; `_workFactor(prof, a)` = Anteil des heutigen Gehalts in deinem
Alter a (0 nach dem Arbeitsende), `_pensionFactor(prof, a)` = Anteil der heutigen Altersvorsorge-Beiträge,
`_workSegs(prof, cur)` = Abschnitte gleicher Arbeitszeit für Texte, Zeitstrahl und Einkommenskarte.

### 3.2 Weitere Quellen

| Quelle | Funktion | Inhalt |
| --- | --- | --- |
| `finData` (Monatsstände) | `loadData()` = gespeicherte Stände + Kreditverläufe (`LoanHistory.build`) + Abschreibung | Startwerte je Position aus dem letzten Monat **bis einschließlich Live-Monat** (`latestKey`); spätere Stände sind Zukunft und zählen nicht (P28) |
| `fieldConfig` (`_fc.fields`) | `_vf()` | Positionen, Gruppe (`displayGroup`), Kategorie, Liquidität; ausgeschaltete Bereiche fehlen |
| `loanParams` | `getLoanParams()`, `LoanModel` | Darlehensverträge oder Altdaten (Zins, Rate, Zinsbindung, Anschlusszins, Sondertilgung) |
| `lt-drv` | `getDrv()`, `calcDrvPension()` | gesetzliche Rente, optional laufende EM-Rente |
| `lt-drv-extra` | `getDrvExtra()`, `calcDrvExtra()` | weitere Personen: Name, Geburtsjahr, gesetzliche Rente (+EM), Arbeiten bis (`until`), Rente ab (`age`), seit Schema 15 Arbeitszeit `w1`–`w4` und Altersvorsorge `pen2`–`pen4` je Phase. Das Gehalt kommt seit Schema 14 aus ihren Budget-Einnahmen. Seit Schema 16 aus früheren Versionen: `ptFrom`/`ptPct` (Teilzeit ab Alter, schließt `w1`–`w4` aus) und `net` (noch nicht zugeordnetes Nettogehalt) |
| `lt-beamte` | `getBeamte()`, `calcBeamtePension()` | Beamtenversorgung |
| `lt-av-depots` | `getAvDepots()`, `calcAvDepot()` | Altersvorsorgedepots ab 2027 |
| `budgetData` | `_retirementIncomes()`, `_planFunding()`, `_personSalary()` | Budget-Einnahmen mit „Auch im Ruhestand“; Überschuss des laufenden Jahres für die Finanzierungsprüfung der Sparraten (P24); Gehalt je Person (Ø ihrer zugeordneten Einnahmen), auch deins, wenn es dir zugeordnet ist |
| `v2-modules` | `_mod()` | Bereichsschalter: ohne `pension` keine Renten; ohne `budget` keine Budget-Einnahmen; `assets`/`liab` filtern Positionen |

---

## 4. Ablauf einer Berechnung

```
renderLifetimePageCalcs()                         (Z. ≈9771)
 ├─ getLifetimeSettings() → _ltPhases()
 ├─ buildPlan(s)                                  (Z. ≈9027)  Planmodell
 ├─ Cache-Schlüssel calcKey = [s, latestKey, groups, Alter in Monaten, pensions]
 │   └─ bei Änderung:
 │       det = simulatePlan(plan, R, {record:true})   Erwartungspfad (Median-Renditen)
 │       mc  = runMonteCarlo(plan, R, true)           500 Läufe + Perzentile
 │       retireAge = findRetireAge(plan)              aufsteigende Suche, je Kandidat eigener Plan und 500 Läufe
 │       tc  = targetCapital(plan, R, det)            Zielkapital
 ├─ Einkommen im Ruhestand, Eckdaten, Ziel-Balken, KPIs
 ├─ Chart (historisch + Median + Band + Asset-Flächen + Phasenmarker)
 ├─ _ltState = {...}  (für Crosshair und Partner-Story)
 ├─ _v2LtSummary(), _v2LtPhases()
 └─ setupLifetimeInteraction()                    Crosshair
```

`R = s.withdrawFrom` ist das geplante Ende der Arbeit. Eingaben lösen die Neuberechnung über
`_ltScheduleRender()` aus (250–400 ms entprellt).

---

## 5. Planmodell (`buildPlan`)

### 5.1 Zeitachse

- `currentAge = _ageAt(s, Jahr, Monat)` – Alter zu Beginn des laufenden Kalendermonats, mit
  Geburtsmonat (P17). Monat `k = 0` ist der laufende Monat (`ym0 = currentYM()`), Alter im Monat
  `k` = `currentAge + k/12`.
- `_kAt(plan, Alter)` = erster Monat, in dem dieses Alter erreicht ist. Alle Grenzen (Phasen,
  Rentenbeginn und -ende, Verfügbarkeit, Depot-Auszahlung, Ereignisse) liegen auf dieser einen
  Monatsachse (P21).
- `firstAge = floor(currentAge) + 1`, `horizonAge = max(planHorizon, firstAge+1, ceil(withdrawFrom)+1)`,
  `nMonths = (horizonAge − currentAge) × 12`.
- Aufgezeichnet wird zu jedem ganzen Lebensjahr (`firstAge`, `firstAge+1`, … `horizonAge`), jeweils
  zu Beginn des Monats, in dem das Alter erreicht ist (`nSteps` Werte). Chart, Phasen und
  Perzentile nutzen diese Jahreswerte; gerechnet wird in Monaten.

### 5.2 Gruppen

Positionen werden zu Gruppen zusammengefasst (Gruppe = `displayGroup`, sonst Kategorie):

- Verbindlichkeiten zählen zur Gruppe ihres verknüpften Vermögenswerts (`_liabTargetGroup`).
- `gross` = Summe der Positionswerte des letzten Monats, `debt` = Summe der Restschulden.
- `cat` = Kategorie mit dem größten Wert in der Gruppe; sie steuert die Standardannahmen.
- Jede Gruppe besteht aus **Töpfen** (`plan.buckets`) je Liquiditätsklasse: liquide, `bav`,
  illiquide und je verknüpftem Altersvorsorgedepot ein eigener Topf (P19, P20). Entnehmbar sind
  liquide und `bav`-Töpfe ab „Verfügbar ab“; illiquide Töpfe (Immobilie, Auto, gebundene ETFs)
  werden **nie verkauft**. Ein gebundener ETF sperrt damit nicht mehr den liquiden Teil derselben
  Gruppe.
- Gruppen ohne Wert, Schuld und Sparrate fallen weg, außer ein Ereignis nutzt sie
  (z. B. späterer Immobilienkauf).
- Verknüpfte Altersvorsorgedepots (`plan.dynDepots`): Der Topf wächst mit Beiträgen und Zulagen
  und wird zum eigenen Auszahlungsmonat zur Rente (Auszahlplan bis 85 aus dem **simulierten**
  Kapital, optional 30 % sofort ins Cash). Andere Depots derselben Gruppe bleiben unberührt.
- Sortiert nach Nettowert absteigend.

### 5.3 Annahmen je Gruppe (`getAssetParam`, Z. ≈8680)

Auflösung je Feld in dieser Reihenfolge:

1. eigener Wert in `lt-asset-params[Gruppenname]`,
2. Profil nach Standard-Gruppenname (`LT_ASSET_DEFAULTS`, z. B. „ETF“ 7 %/15 %, Sparrate 500),
3. Kategorie (`LT_CAT_DEFAULTS`, z. B. `etf` 6 %/15 %, Abzug 10 %; `bav` 2 %/3 %, Abzug 25 %, verfügbar ab 62),
4. Rückfall: Rendite 5 %, Schwankung 10 %, sonst 0.

| Feld | Bedeutung | Einheit |
| --- | --- | --- |
| `ret` | langfristige **geometrische** Rendite (= Median-Wachstum) | % p. a. |
| `vol` | Schwankung (Standardabweichung der Log-Rendite) | % p. a. |
| `retDyn`, `volDyn` | relative jährliche Änderung von Rendite/Schwankung | % p. a. |
| `saving` | Sparrate in die Gruppe | €/Monat (nominal) |
| `avail` | entnehmbar ab Alter | Jahre |
| `tax` | pauschaler Abzug bei Entnahme | % |

Vorberechnet je Gruppe und Jahr: `lnr = ln(1 + ret·(1+retDyn)^y)` (Rendite mindestens −95 %) und
`vol·(1+volDyn)^y`.

### 5.4 Kredite

- Mit vollständigem Vertrag (`LoanModel.configured`): Restschuld und Zahlungen kommen aus dem
  monatlichen Tilgungsplan (`contractSteps` je Simulationsjahr). Prognose und Kreditverlauf
  nutzen damit denselben Plan.
- Mit Altdaten (nur Zins/Rate): monatliche Annuität mit Zinsbindung, Anschlusszins und
  Sondertilgung im Dezember (nur solange gearbeitet wird).
- Ohne Kreditdaten (`legacyDebt`): Die Sparrate der Gruppe wirkt als Tilgung, solange
  gearbeitet wird; ohne Zins.
- Bis zum Ende der Arbeit zahlt das Einkommen die Raten (sie mindern das Vermögen nicht).
  Danach kommen sie zum Bedarf hinzu (`loanOut`).

### 5.5 Ereignisse (`lt-events`, `_normEvent`)

`{name, year, amount, from, to}` – Betrag in heutiger Kaufkraft, gebucht im **Juli** des Jahres;
ein Ereignis des laufenden Jahres nach Juli gilt im aktuellen Monat (P13), frühere Jahre entfallen.
`from`: `''` extern, `'*'` liquide anteilig, sonst Gruppenname. `to`: `''` extern (Ausgabe), sonst
Gruppenname. Ereignisse „extern → extern“ fallen weg. Alte Ereignisse ohne Von/Nach werden
umgedeutet: positiv = Zufluss ins Cash, negativ = Ausgabe aus liquiden Mitteln. Die Teilauszahlung
eines nicht verknüpften Altersvorsorgedepots wird als Ereignis „extern → liquide“ eingefügt.
Gebucht wird nur der finanzierte Teil; der Rest ist ein Fehlbetrag (P22).
Jedes Ereignis hat eine dauerhafte Kennung (`id`, neue Zeilen `event-…` beim Anlegen). Der Editor unter „Prognose &
Annahmen“ ordnet Eingaben nach einer fremden Änderung allein über sie zu und überträgt erst auf ausdrücklichen Wunsch
(Review P64, DATA_MODEL.md „Schreibrecht zwischen Fenstern“).

### 5.6 Renten und Einkommen (`plan.pensions`)

Eine Liste `{amount (€/Monat, heutige Kaufkraft), from (eigenes Alter), until?, kind, always?}`.
Sie zählt im Haushaltssaldo **ab deinem Arbeitsende**; vorher deckt das Arbeitseinkommen den
Haushalt (es steckt im Budget). Ausnahme `always`: Depot-Auszahlungen zählen immer, weil sie in
keinem Budget stehen.

| Quelle | `kind` | Betrag | Beginn / Ende |
| --- | --- | --- | --- |
| Weitere Renten & Einkünfte (`lt-pensions`) | `income` | Betrag | ab „ab Alter“ (Standard 67), optional bis „bis Alter“; mit Person in deren Alter, umgerechnet auf deines (`_personShift`) |
| Gesetzliche Rente (`calcDrvPension`) | `drv` | netto, mit Zugangsfaktor | ab `drv.age` (eigener Wert, sonst Beginn Phase 4), frühestens 63 |
| Laufende EM-Rente (eigene Person) | `em` | voller Zahlbetrag (nach der Arbeit kein Hinzuverdienst) | ab 0 bis zum Ende der EM-Rente |
| Beamtenpension (`calcBeamtePension`) | `bv` | netto, mit Abschlag | ab Pensionsalter, frühestens 63; 0 unter fünf Dienstjahren |
| Altersvorsorgedepot (`calcAvDepot`) | `avd` (`always`) | Auszahlplan netto, real gleichbleibend; verknüpfte Depots aus dem simulierten Topf (`dyn`) | ab Auszahlung bis 85 (Alter der Person, umgerechnet) |
| Weitere Personen, Beamtenpension (`calcBeamteExtra`, Schema 17) | `bv` | netto, Dienstjahre nach ihrer Arbeitszeit je Phase (Anteil Vollzeit) | ab ihrem Pensionsbeginn, umgerechnet auf dein Alter |
| Weitere Personen, Rente (`calcDrvExtra`) | `drv`, `em` | Altersrente; EM-Rente mit Anrechnung, solange die Person arbeitet | umgerechnet auf das eigene Alter |
| Weitere Personen, Gehalt (Schema 14/15) | `work` | Ø ihrer zugeordneten Budget-Einnahmen (`_personSalary`) × Arbeitszeit der Phase ÷ Arbeitszeit heute; ein Eintrag je Abschnitt gleicher Arbeitszeit (`_workSegs`) | ab 0 bis zum Arbeitsende der Person (eigenes Alter); zählt erst nach deinem Arbeitsende (P5) |
| Kindergeld (Schema 14) | `kindergeld` | 259 € je Kind | ab 0 bis zum Monat des 18. (25.) Geburtstags; zählt nach deinem Arbeitsende; keine Rente (Phasentexte zeigen es getrennt) |
| Budget-Einnahmen „Auch im Ruhestand“ (`_retirementIncomes`) | `budget` | Ø der zwölf Planmonate | ab Ende der Arbeit; EM-Namen bis Regelaltersgrenze; Dubletten (`_retIncomeDuplicate`) zählen nicht |

Rentenformeln im Überblick (Rechtsgrundlagen in 7.1):

- **Gesetzlich**: Entgeltpunkte = heutige Punkte + (Gehalt, gedeckelt an der BBG ÷ Durchschnittsentgelt) ×
  Arbeitsjahre bis Arbeitsende (`_workYears`: je Phase × Arbeitszeit ÷ Arbeitszeit heute, weil das Bruttogehalt
  für die heutige Arbeitszeit gilt; danach keine).
  Brutto = Punkte × Rentenwert (42,52 €) × **Zugangsfaktor** (1 − 0,003 je Monat vor der
  Regelaltersgrenze, höchstens −14,4 %; 1 + 0,005 je Monat danach); netto = brutto × (1 − Abzüge %).
  Beginn frühestens mit 63. Nach einer EM-Rente (seit 15.10.2026, Schema 18): Punkte, die Grundlage der EM-Rente
  waren, behalten deren Zugangsfaktor (§ 77 Abs. 3), neue Punkte zählen mit dem der Altersrente (nach einer bis zur
  Regelaltersgrenze laufenden EM-Rente 1); die Zurechnungszeit zählt nicht mit. Besitzschutz (§ 88): beginnt die
  Altersrente höchstens 24 Monate nach dem Ende der EM-Rente, mindestens deren persönliche Entgeltpunkte mit
  Rentenartfaktor 1 (teilweise × 2). Angesetzt wird der höhere Wert.
- **EM-Rente** (`calcEm`): Zahlbetrag laut Bescheid oder aus (Punkte + Zurechnungszeit) × Zugangsfaktor × Rentenartfaktor
  × Rentenwert. Hinzuverdienstgrenze laut Bescheid bei beiden Arten, sonst gesetzlich 2026 (voll 20.763,75 €, teilweise
  41.527,50 €). 40 % des Überschusses mindern die Bruttorente; netto um die Abzüge verringert.
- **Beamte**: Anspruch ab fünf Dienstjahren. Ruhegehaltssatz 1,79375 % je Dienstjahr, höchstens
  71,75 %, mindestens 35 %. Antragsruhestand frühestens mit 63; Abschlag 3,6 % je Jahr vor der
  Altersgrenze, höchstens 14,4 %; kein Abschlag mit 65 und 45 Dienstjahren.
- **AV-Depot**: je Person und Jahr (`_avdYearAll`): Grundzulage 50 % auf die ersten 360 €, 25 % bis
  1.800 € (höchstens 540 €), Kinderzulage 100 % bis 300 € **je Kind** (jedes Kind bei einer Person),
  beides erst ab 120 € Eigenbeitrag; Bonus 200 € einmal je Person im ersten Beitragsjahr unter 25.
  Verteilung auf die Depots nach Eigenbeitrag. Beiträge folgen den Phasen und der Person des Depots
  (`_avdParams().factor` → `_pensionFactor`: eingetragener Anteil je Phase, sonst 100 %, solange sie arbeitet);
  Kapital real verrentet bis 85, optional 30 % Teilauszahlung. Läuft die Auszahlung schon, wird das
  heutige Guthaben bis 85 verrentet.

---

## 6. Simulation (`_planSchedule`, `simulatePlan`)

Ein Lauf in **Monatsschritten** `k = 0 … nMonths−1`. `rnd = null` ergibt den **Erwartungspfad**
(jede Gruppe wächst genau mit `ret`). Mit Zufallszahlen ergibt sich ein Monte-Carlo-Lauf.

Phasen im Lauf (`retireAge = R` = Ende der Arbeit; die Suche prüft andere `R` mit eigenem Plan):

```
a2 = min(saveUntil, R)       inSave  = Monate vor a2            (Ansparen)
                             inWork  = zwischen a2 und R        (Weiterarbeiten)
a4 = max(R, pensionAge)      inEarly = zwischen R und a4        (Vorruhestand)
                             ab R: kein Arbeitseinkommen        (Vorruhestand + Rente)
```

**Fahrplan je `R`** (`_planSchedule`, deterministisch, je `R` zwischengespeichert), alle Beträge
nominal (× Inflation bzw. × Sparraten-Steigerung bis zum Monat):

- `out[k]`: Bedarf ab `R` (Phase 3 `monthlyWithdraw`, Phase 4 `pensionSpending`), Entnahme in
  Phase 2 (`p2Withdraw`), Kreditraten ab `R`, **alle Beiträge ab `R`** (privat und Vorsorge,
  AV-Eigenbeiträge) als Umbuchung aus dem Vermögen (P18), vor `R` der Fehlbetrag des Haushaltssaldos
  (siehe unten; ohne Änderungen gegenüber heute die Finanzierungslücke aus P24).
- `inc[k]`: Renten und Einkommen aus 5.6, nur ab `R` (Depot-Auszahlungen immer); vor `R` zusätzlich
  angelegtes Mehreinkommen aus dem Haushaltssaldo.
- **Haushaltssaldo während der Arbeit** (Schema 15): `ΔI(k)` = Änderung aller Gehälter gegenüber heute
  (`_incomeChange`: deines und das weiterer Personen, je Budget-Gehalt × (Arbeitszeit der Phase ÷ Arbeitszeit heute − 1),
  nach dem Arbeitsende einer Person −Gehalt), `ΔOwn(k)` = Eigenbeiträge der Altersvorsorgedepots im Jahr von k minus
  im Budgetjahr (ab 2027 laufen die Depots an, Altersvorsorge % je Phase und Person). Bedarf aus dem Vermögen:
  `need = (Sparraten der Phase − Budgetüberschuss − ΔI) × Steigerung + ΔOwn`; ist er positiv, kommt er aus dem
  Vermögen, sonst wird ein positives `ΔI − ΔOwn` bis zur Höhe des freien Betrags zusätzlich angelegt. Ohne
  Änderungen ist das genau die Finanzierungslücke aus P24. Das Budget-Gehalt gilt für die Arbeitszeit von heute.
- Rentenpunkte: relativ zum heutigen Bruttogehalt nach Arbeitszeit je Phase (`_workYears`, weitere Personen über
  `workSegs` in ihrem Alter); Dienstjahre der Beamtenversorgung als Anteil einer Vollzeitstelle.
- `contrib[topf][k]`: Sparraten je Phase (Phase 1 voll, Phase 2 `bav` × `p2Pension`, sonst ×
  `p2Saving`, Phase 3 × `p3Pension`/`p3Saving`), AV-Beiträge und Zulagen in verknüpfte Depot-Töpfe.
- Kredite: Restschuld je Gruppe und Monat aus dem Vertrag oder der Annuität.

**Je Monat** (`simulatePlan`):

0. **Depot-Umwandlung**: Ein verknüpftes Depot erreicht seinen Auszahlungsmonat → Topf auf 0,
   Teilauszahlung ins Cash, Monatsrate aus dem simulierten Kapital (real, bis 85).
1. **Beiträge** in die Töpfe einbuchen (aus Arbeit bezahlt oder im Saldo als Ausgabe enthalten).
2. **Ereignisse**: Quelle Gruppe brutto inkl. Abzug, Rest anteilig aus freien Anlagen; nur der
   finanzierte Teil geht ans Ziel (P22).
3. **Haushaltssaldo** `inc − out` (+ Depot-Raten): negativ → Entnahme, positiv → Einzahlung in die
   Einzahlungsgruppe (Cash, sonst erste entnehmbare Gruppe ohne Schuld).
4. **Wertentwicklung** je Topf mit der Monatsrendite der Gruppe. Im Monte-Carlo-Lauf je
   Lebensjahr ein Zufallswert je Gruppe, gleichmäßig auf die Monate des Jahres verteilt:
   `exp(lnr/12 + vol·√(m/12)·(√0,3·F + √0,7·ε_j)/m)` mit gemeinsamem Marktfaktor `F`
   (paarweise Korrelation 0,3).
5. **Aufzeichnung** zu Beginn des Monats, in dem ein ganzes Lebensjahr erreicht ist: `total` =
   Summe aller Töpfe − Restschulden; `avail` = entnehmbare Töpfe in diesem Alter; optional je Gruppe.

**Entnahme `withdraw(amount)`**: anteilig aus allen entnehmbaren Töpfen nach Wert. Die Kapazität
ist `Wert × (1 − Abzug)`. Reicht sie nicht, werden alle geleert, und es gibt einen Fehlbetrag.
Der erste Fehlbetrag über 1 € setzt `shortfallAge` (Alter zu Beginn des Monats); der Lauf gilt dann
als gescheitert. Das kann auch vor dem Ruhestand passieren, wenn ein Ereignis oder eine
Finanzierungslücke nicht gedeckt ist.

**Erhaltung**: Umbuchungen (Beiträge nach dem Arbeitsende, Ereignisse zwischen Gruppen, Kauf aus
Cash) ändern das Gesamtvermögen nicht; Vermögen entsteht nur durch Rendite, Einkommen, Zulagen
und externe Zuflüsse. Die Tests in `forecast-cashflow.test.cjs` prüfen das mit Rendite 0.

---

## 7. Monte-Carlo, Kennzahlen

- **Zufallszahlen** (`_mcNormals`): Ein fester Seed (mulberry32-artig) und Box-Muller-Normalzahlen,
  `500 × nSteps × (G+1)`, zwischengespeichert. Alle Szenarien nutzen dieselben Zahlen. Darum
  ändern sich die Ergebnisse nur durch Eingaben, nicht durch Zufall.
- **Erfolgschance** = Anteil der Läufe ohne `shortfallAge`.
- **Perzentile** (`p10/p50/p90/avail50`): je Jahr **unabhängig** über die Läufe sortiert (Index
  `floor(q·500)`). Das Band ist darum kein einzelner Verlauf.
- **Frühestes Ruhestandsalter** (`findRetireAge`): aufsteigende Suche über ganze Jahre von heute
  bis Horizont − 1 (mindestens ein Jahr Ruhestand im Planungszeitraum, P23). Jeder Kandidat bekommt
  mit `_planForRetire` seinen eigenen Plan: Rentenpunkte, Dienstzeit und Depotbeiträge werden mit
  diesem Arbeitsende neu berechnet (P9/B1). Weil die Erfolgschance nicht immer mit dem Alter
  steigt (z. B. Entnahme in Phase 2), wird nicht binär gesucht (B14). `_mcPass` bricht früh ab,
  sobald das Ergebnis feststeht.
- **Zielkapital** (`targetCapital`): Barwert von `Bedarf − Renten + Kreditraten` ab Ruhestand bis
  zum Horizont, je Jahr ÷ (1 − Ø Abzug), abgezinst mit der realen Rendite der entnehmbaren
  Gruppen bei Rentenbeginn (gewichtet nach dem Erwartungspfad).
- **Verfügbar bei Rentenbeginn** = `avail50` im Alter `round(R)`, real. **Deckung** = verfügbar ÷ Ziel.
- **Phasen-Karte**: Median-Nettovermögen am Ende jeder Phase; „Fehlbetrag mit X“ in der Phase, in
  der die Hälfte der Läufe ihren ersten Fehlbetrag hatte (`failAge50`, P27). Ein kleines
  Restvermögen bei gedecktem Bedarf ist kein Fehlbetrag.
- **Phasen-Karte, weitere Personen**: je Person eine Zeile mit `_personPhaseText` („Teilzeit 50 % bis 48 ·
  Vollzeit bis 67 · Rente ab 67“, ihr Alter) und ihrer gesetzlichen Rente netto.
- **Erklärung der Erfolgschance** (`openSuccessExplain`, Tipp auf die Prozentzahl): was die Zahl bedeutet (x von 500
  Durchläufen, Ziel), wie simuliert wird (Monte-Carlo, Jahresrendite je Gruppe, Korrelation 0,3, feste Zufallszahlen),
  was jeden Monat passiert, wann ein Lauf scheitert, Tabelle der Annahmen je Anlage, „Sicher möglich ab“ und Grenzen –
  mit den aktuellen Zahlen aus `_ltState`.
- **Hinweise in der Ergebnis-Karte** (`_v2LtNotes`): Sparraten über dem Budgetüberschuss
  (Betrag der monatlichen Entnahme, P24) und ein Startstand, der älter als der Vormonat ist (P28). Der Hinweis zu
  Änderungen des Haushaltseinkommens während der Arbeit („Ab 50 ist das Haushaltseinkommen … niedriger/höher als
  heute …“) ist seit 15.10.2026 entfernt; gerechnet wird unverändert (Lücke aus dem Vermögen, Mehreinkommen angelegt).
  Das Phasen-Sheet nennt die Änderung weiter unter der jeweiligen Phase (`_phaseEffectTxt`).

### 7.1 Rechtsgrundlagen und Geltungsbereich

Geprüft am 14.10.2026 gegen die amtlichen Texte (gesetze-im-internet.de, Bundesrat-Drucksache):

| Regel | Quelle | Umsetzung | Nicht abgebildet |
| --- | --- | --- | --- |
| Vorzeitige Altersrente frühestens mit 63 | § 36 Satz 2, § 236 SGB VI | `calcDrvPension` | Wartezeit 35 Jahre (vorausgesetzt), §§ 37, 38 |
| Zugangsfaktor −0,003 je Monat früher, +0,005 je Monat später | § 77 Abs. 2 SGB VI | `zf` | – |
| Ruhegehalt erst nach fünf Dienstjahren | § 4 Abs. 1 BeamtVG | `eligible` | Dienstbeschädigung |
| Satz 1,79375 % je Jahr, höchstens 71,75 %, mindestens 35 % | § 14 Abs. 1 und 4 BeamtVG | `rate` | amtsunabhängige Mindestversorgung |
| Abschlag 3,6 % je Jahr, höchstens 14,4 % bei Antragsruhestand; keiner mit 65 und 45 Jahren | § 14 Abs. 3 BeamtVG | `cut` | 45 Jahre vereinfacht als Dienstjahre |
| Antragsruhestand frühestens mit 63 | § 52 Abs. 3 BBG | `age` | Schwerbehinderung, Landesrecht |
| Zulagen je Berechtigtem; Kinderzulage je Kind; Mindesteigenbeitrag 120 € | §§ 84–86 EStG i. d. F. BR-Drs. 206/26, Art. 2 Nr. 7–9 | `avdSubsidy`, `_avdYearAll` (Kinder aus `retirement.children`, „Kinderzulage bei“) | mittelbar Berechtigte (§ 79 Satz 2), mehr als zwei Verträge, Prüfung der gesetzlichen Zuordnung (§ 85 Abs. 2) |
| Kindergeld 259 € je Kind und Monat | § 66 Abs. 1 EStG (Stand 2026) | `CHILD_BENEFIT`, `_automaticChildRows`, Prognose `kindergeld` | künftige Erhöhungen |
| Anspruch vom Geburtsmonat bis zum Monat des 18. Geburtstags, in Ausbildung bis 25 | § 66 Abs. 2, § 32 Abs. 3 und Abs. 4 Nr. 2 EStG | `_childStart`, `_childEnd` | § 32 Abs. 4 Nr. 1 und 3, Kinderzuschlag, Kinderfreibetrag |

Die Werte für Rentenwert (42,52 € ab 1.7.2026), Durchschnittsentgelt (51.944 €), BBG (101.400 €)
und Hinzuverdienstgrenzen 2026 sind Standardwerte und können auf der Daten-Seite überschrieben
werden. Die Beamtenversorgung gilt für den **Bund**; Länder regeln abweichend.
- **Eckdaten**: Vermögen am Horizont (Median), Ø Rendite p. a. (gewichtet nach Bruttowert,
  nominal und real), „Schuldenfrei“ (spätestes Tilgungsende aller Kredite mit Daten).

---

## 8. Darstellung

### 8.1 Chart

Datensätze in dieser Reihenfolge (das Aktualisieren setzt sie über den Index):

0. 90. Perzentil, gestrichelt, Fläche bis 1
1. Median (MC `p50`), gestrichelt grün
2. 10. Perzentil, gestrichelt
3. Historisch: je Lebensjahr der letzte Monatsstand, mit der **angenommenen** Inflation in heutige Kaufkraft umgerechnet
4. … Asset-Flächen je Gruppe: Historie und danach **Erwartungspfad** `det.per` (nicht gestapelt)

Weitere Darstellungsregeln:
- Die Projektion wird am letzten historischen Punkt angebunden.
- Log-Skala: Werte unter 1.000 € werden auf 1.000 gesetzt.
- `ltRange` begrenzt die x-Achse ab heute.
- Das Plugin `_ltMarkerPlugin` zeichnet senkrechte Linien bei den künftigen Phasenwechseln in
  den Phasenfarben `--lp1…4`. Überschneiden sich die Namen, zeigt es nur das Alter.

### 8.2 Crosshair (`setupLifetimeInteraction`)

Beim Fahren oder Tippen über den Chart zeigt der Hero den Wert im gewählten Alter. Das Label
lautet „Mit X Jahren (Jahr) · Phase“, die Pille „80 % zwischen p10 und p90“ bzw.
„Historischer Stand“. Außerdem aktualisiert der Crosshair den (unsichtbaren) Lebens- und
Ziel-Balken.

### 8.3 Einkommen im Ruhestand

Seit 14.10.2026 je Person gegliedert (Ich, weitere Personen, Haushalt), jeweils mit Zwischensumme zum Rentenbeginn; jede
Zeile trägt `who` ('' = ich, ID, 'hh' = Haushalt). Gehaltsabschnitte weiterer Personen erscheinen nur, soweit sie nach
deinem Arbeitsende laufen. Beamtenpensionen weiterer Personen (Schema 17) stehen bei ihnen.

Seit 14.10.2026 (`_incomeCard`, P11/P12): Die Karte zeigt die Summe **zum Beginn der Rentenphase**
und darunter zwei Zeilen: „Mit X: deckt …“ (Deckung des Bedarfs der Rentenphase) und
„Lebenslang ab Y: …“ (nur lebenslange Einkommen, sobald alle begonnen haben; befristete
Einkünfte, Gehälter und Auszahlpläne mit Ende zählen dort nicht). Die Zeilen lassen sich antippen
und öffnen den Rechenweg (`_explainDrv/Em/Bv/Avd`). Altersangaben stehen in deinem Alter, bei
weiteren Personen deren Alter in Klammern. Das Gehalt einer weiteren Person steht je Abschnitt
gleicher Arbeitszeit in einer Zeile („Gehalt Anna (25 %)“ ab 50 bis 60 (Anna 58), Schema 15). Demo:
„Mit 67: deckt deinen Bedarf von 3.000 €“ (1.800 € davon Annas Gehalt bis 69), „Lebenslang ab 69:
2.478 € (83 %)“.

### 8.4 Phasen-Sheet (`openPhasesSheet`)

Alle Lebensphasen-Parameter an einer Stelle (Entscheidung 14.10.2026): die vier Phasen (in deinem
Alter) mit Arbeitszeit, Altersvorsorge und Arbeitsende **je erwachsene Person** (Schema 15). Einen eigenen Abschnitt je
Person gibt es nicht mehr: Das Arbeitsende weiterer Personen steht in Phase 2 in der Zeile „Arbeiten bis Alter“ neben
deinem, ihr Rentenbeginn bei ihrer gesetzlichen Rente unter Daten → Altersvorsorge; ihr Zeitstrahl steht oben im Sheet.
Jeder Abschnitt ist ein ausklappbares `<details class="lp-sec">`; der Kopf zeigt Name, Dauer und eine Zusammenfassung
(z. B. „bis 60 · Ich 50 % · Anna Vollzeit · Sparen 20 %“). Ohne Fokus sind alle Abschnitte zu; `openPhasesSheet(n)`
öffnet Phase n, `openPhasesSheet('p-<id>')` Phase 2 (aus der Prognose-Karte „Lebensphasen“ und der Haushaltskarte).

| Feld im Sheet | Phasen | Datenmodell | leer |
| --- | --- | --- | --- |
| Arbeitszeit % „Ich“ (`lpw-me-<n>`) | 1, 2 | `forecast.settings.phase1WorkPercent`, `phase2WorkPercent` | Phase 1: 100, Phase 2: wie Phase 1 |
| Arbeitszeit % weitere Person (`lpw-<id>-<n>`) | 1–4 | `people[].phase<n>WorkPercent` | wie in der Phase davor (Phase 1: 100) |
| Arbeitszeit heute aus dem Budget (Schema 17) | 1 | `budget.items[].workPercent` beim Gehalt | ist sie dort angegeben, zeigt Phase 1 sie nur an (kein Feld) |
| Altersvorsorge % „Ich“ (`lpv-me-<n>`) | 2, 3 | `phase2PensionPercent`, `phase3PensionPercent` | 100 %, solange du arbeitest, sonst 0 |
| Altersvorsorge % weitere Person (`lpv-<id>-<n>`) | 2–4 | `people[].phase<n>PensionPercent` | 100 %, solange sie arbeitet, sonst 0 |
| Arbeiten bis Alter, Phase 2: „Ich“ (`lp-a3`) und weitere Personen (`lpp-<id>-until`) | – | `retirementAge` bzw. `people[].workUntilAge` | deins Pflicht; weitere Personen: gleiches Alter wie du |
| Rentenbeginn weiterer Personen | – | `statutoryPension.retirementAge` | nicht im Sheet, sondern bei ihrer gesetzlichen Rente (Daten → Altersvorsorge) |

Arbeitszeit ist der Anteil einer Vollzeitstelle (0–100), Altersvorsorge der Anteil der heutigen
Beiträge (0–200; Betriebsrenten-Sparraten zählen zu dir, Altersvorsorgedepots zu ihrer Person). In ein
Altersvorsorgedepot fließen Beiträge und Zulagen nur, solange die Person arbeitet (seit 15.10.2026, `_avdParams().factor`):
im Vorruhestand und danach nichts mehr, auch mit einem Vorsorge-Anteil für die Phase (der gilt dort nur für
Vorsorge-Gruppen wie eine private Rentenversicherung); das Kapital verzinst sich bis zum Auszahlungsbeginn weiter. Unter
den Arbeitsphasen steht, wie sich das Haushaltseinkommen ändert („Ab 50: Einkommen −2.500 €/Monat
gegenüber heute; Altersvorsorgedepots +200 €/Monat → 1.284 €/Monat aus dem Vermögen“, `_phaseEffectTxt`).
„Zusätzliche Entnahme“ ist nur noch für Ausgaben über dem Budget gedacht, Einkommenslücken rechnet die App.

`_phasesDraft()` prüft und baut ein Entwurfs-`s` und die Personenliste (ungültig, z. B. „Kim:
Arbeitszeit (Weiterarbeiten): bitte eine Zahl zwischen 0 und 100“, dann wird nichts gespeichert).
`_phasesPreview()` rechnet beim Tippen (250 ms entprellt) eine Monte-Carlo-Erfolgschance mit dem
Entwurf (`buildPlan(s,{drv,bv,people})`) und vergleicht sie mit dem gespeicherten Stand; Köpfe,
Platzhalter (was leer gilt) und Zeitstrahlen der Personen folgen live.

Die Haushaltskarte (Daten-Seite) hat diese Felder nicht mehr; sie zeigt den Zeitstrahl und „In den
Lebensphasen ändern“. Beim Speichern der Karte übernimmt `_withPersonPhases()` die Phasenwerte aus
dem gespeicherten Stand, damit sie nicht verloren gehen.

Beim Speichern (`_savePhasesSheet`, in einer Transaktion):
- Werte, die dem Standard entsprechen, werden entfernt; Arbeitszeit und Altersvorsorge werden
  gespeichert, wenn sie eingetragen sind, und entfernt, wenn das Feld leer ist.
- Eine gesetzliche Rente, deren Alter mit dem bisherigen Rentenbeginn übereinstimmte, zieht mit.
  Dasselbe gilt für das Pensionsalter der Beamtenversorgung.
- Weitere Personen werden mit ihren übrigen Feldern unverändert in `lt-drv-extra` zurückgeschrieben.
- Danach ziehen Prognose, Daten-Seite und die Haushaltskarten nach (`_refreshHouseholdCards`).
- Das Sheet beruht auf dem Stand beim Öffnen (Review P54). Wurde inzwischen in einem anderen Fenster gespeichert –
  auch wenn dieses Fenster gerade das Schreibrecht übernommen hat –, speichert es nichts: Es öffnet mit dem aktuellen
  Stand neu, trägt nur die hier geänderten Felder markiert wieder ein (Abschnitt aufgeklappt, bei gleichzeitiger
  fremder Änderung mit „Inzwischen gespeichert: …“) und speichert erst beim erneuten „Sichern“ (DATA_MODEL.md,
  „Schreibrecht zwischen Fenstern“).

### 8.5 Annahmen je Anlage (`buildAssetParamsTable`)

Steht auf der Daten-Seite unter „Prognose & Annahmen“.
- Je Gruppe gibt es eine aufklappbare Karte mit Sparrate, Rendite, Trend, Schwankung und
  Schwankungs-Trend, bei entnehmbaren Gruppen zusätzlich „Verfügbar ab“ und „Abzug“.
- Jede Eingabe wird sofort in `lt-asset-params` gespeichert; ein leeres Feld setzt den Standardwert. Gespeichert wird nur
  dieses eine Feld auf dem aktuellen Stand (Review P54); eine gleichzeitige fremde Änderung anderer Felder bleibt erhalten.
- „Sparraten aus Budget übernehmen“ (`deriveSavingsFromBudget`) ordnet Budget-Sparposten den
  Gruppen zu: zuerst über das gespeicherte Ziel, sonst über Namensmuster.

### 8.6 Partner-Story

`_psData()` nutzt `_ltState` (dieselben Zahlen wie die Seite): Median je Phasenende, Renten je
Alter, Budget-Einnahmen und Vermögensaufbau, Ereignisse ab heute, spätestes Tilgungsende.
`_psSlides()` baut bis zu zehn Folien; Phasen mit Dauer 0 entfallen. Arbeitet eine weitere Person
über dein Arbeitsende hinaus, nennen Vorruhestand und Rente ihr Gehalt getrennt von den Renten
(„Ab 2045 ist für einen von euch Schluss mit Arbeit. Anna arbeitet bis 2054 weiter: …“, P5).
Es werden keine Daten gespeichert. Details in DATA_MODEL.md, Abschnitt „Partner-Story“.

---

### 8.x Persona-Befunde vom 14.10.2026 (Darstellung)

- Kennzahl „Verfügbar mit <Alter>“ statt „Vermögen mit …“: entnehmbares Vermögen; die Lebensphasen zeigen weiter das
  Gesamtvermögen (C3).
- Entfallene Phasen stehen nicht mehr als Zeile, sondern als Notiz „Weiterarbeiten entfällt · unter Bearbeiten planbar“ (C4).
- Vorruhestand: Beginnt in der Phase eine Rente oder Pension, nennt der Text den Wechsel („ab 62: 2.424 € Rente, deckt den
  Bedarf“; C5).
- Einkommen im Ruhestand: Zwischensumme einer Person, deren Einkommen erst später beginnt, ab diesem Alter („1.422 € ab
  69“; C6); Name und Zeitraum stehen untereinander statt abgeschnitten (C9).
- Pension: Ein gewünschter Beginn vor 63 wird angehoben und erklärt („Gewünscht ab 60: Antragsruhestand frühestens …“,
  `calcBeamtePension().want`; A4).
- Gesetzliche Rente: Hinweise bei sehr wenigen Punkten ohne weitere Beiträge (Wartezeit, A10) und bei Punkten, die schon
  die EM-Rente ergeben (Zurechnungszeit, A5). Rentenwert, Ø-Entgelt und BBG eingeklappt unter „Rechengrößen“ (C12).
- Neues Ereignis: „Liquide (anteilig) → Extern (Ausgabe)“; „Extern → Extern“ mit Hinweis in der Zeile (A9). Jahresauswahl
  in Seiten ab dem frühesten wählbaren Jahr (C11). Platzhalter Inflation 2 %, Lebenserwartung 85 (C11).
- Partner-Story nur mit weiterer erwachsener Person (C7).

## 9. Leistung und Cache

Gemessen in Node auf dem Mac mit den Demo-Daten, Monatsmodell (14.10.2026):

| Schritt | Zeit |
| --- | --- |
| `buildPlan` | ≈13 ms |
| Erwartungspfad | ≈4 ms |
| Monte-Carlo inkl. Perzentile | ≈235 ms beim ersten Aufruf, ≈92 ms danach |
| `findRetireAge` (je Kandidat eigener Plan, früher Abbruch in `_mcPass`) | ≈490 ms |

Eine vollständige Neuberechnung dauert also gut 0,7 s, auf dem iPhone voraussichtlich mehr.
`_ltCalcCache` verhindert sie bei reinen Darstellungswechseln (Zeitraum, Log, Theme).
Das Phasen-Sheet rechnet bei jeder Eingabe eine Monte-Carlo-Erfolgschance ohne Perzentile.

---

## 10. Tests

Abgedeckt (`node --test .tests/`):

- **Phasen** (`life-phases.test.cjs`): Grenzen, Punkte und Dienstzeit je Phase, Sparen und
  Entnahme in Phase 2, Bedarf je Phase, Phasen-Sheet, Schema 10.
- **Renten**: EM-Rente (`disability-pension.test.cjs`), Beamte (`civil-pension.test.cjs`),
  AV-Depot (`pension-depot.test.cjs`), Budget-Einnahmen und Dubletten (`retirement-income.test.cjs`).
- **Kredite in der Prognose**: Zahlungen und Restschuld aus demselben Plan (`loans.test.cjs`).
- **Migration** (`data-model.test.cjs`): Eingaben der Prognose gleich wie im Altmodell `1f17a25`;
  Ergebnisse gleich zwischen migrierten und frisch importierten Daten (seit der Modelländerung
  P18–P29 kein Ergebnisvergleich mit dem Altmodell mehr).
- **Geldfluss und Zeitachse** (`forecast-cashflow.test.cjs`, Fixture `forecast-fixture.cjs` mit
  Rendite, Schwankung, Inflation und Abzug 0): Umbuchungen erzeugen kein Geld (P18), unterfinanzierte
  Käufe (P22), Haushaltsdefizit (P24), Depot-Umwandlung je Depot, Mischgruppe, laufende Auszahlung
  (P19), gesperrte Positionen (P20), gebrochene Alter, Einkommen ab 42,5, Freigabe ab 42 (P21),
  Ereignis im laufenden Jahr (P13), künftiger Snapshot (P28), Geburtsmonat (P17), kein Ruhestand am
  Horizont (P23), Suchkandidaten mit eigenen Renten (P9), nicht monotone Suche, Fehlbetrag statt
  Liquiditätsschwelle (P27), Budgetmonat (P7).
- **Rentenregeln** (`pension-rules.test.cjs`): Zugangsfaktor und Beginn ab 63 (P3), Pension (P29),
  Zulagen je Person und Kind (P25), Partnergehalt in Simulation und Texten (P5), Einkommenskarte
  (P11/P12), Schema 13.
- **Haushalt** (`household.test.cjs`): Kindergeld in Budget und Prognose; Arbeitszeit je Phase und Person
  (Gehalt nach deinem Arbeitsende, Sparlücke und Mehreinkommen während der Arbeit, eigene Teilzeit mit und ohne
  zugeordnetes Gehalt, Rentenpunkte, Teilzeit schon heute), Altersvorsorge je Phase und Person, Einkommenskarte und
  Hinweise, Phasen-Sheet (Speichern, Ablehnen, Abschnitte, Zusammenfassungen, Platzhalter), Haushaltskarte.
- **Personen** (`persons.test.cjs`): Zuordnungen, Kinder, Schema 15 und Migration 14 → 15.
- `APP_HTML=<alte index.html>` rechnet die Fixture-Tests gegen einen alten Stand (Gegenprobe).

Nicht abgedeckt:

- Eigenschaften der Monte-Carlo-Simulation: ohne Schwankung gilt p10 = p50 = p90 = Erwartungspfad;
  feste Zufallszahlen.
- `targetCapital` als eigener Fall.
- Sparraten-Steigerung.
- Bereichsschalter: Vermögen aus, Kredite an (siehe Befund B11).

**Nach der Fehlerbehebung (14.10.2026):** Audit `node .scripts/audit-forecast.cjs` 22 Prüfungen,
0 Abweichungen. Demo (Start 2026-10): Erfolgschance 100 %, „sicher ab“ 52; ohne Annas
Nettogehalt 95,8 % und 58 (PROBLEME.md, Frage 7).

**Gesamttest 14.10.2026 vor der Fehlerbehebung** (neue Demo; Details in [PROBLEME.md](PROBLEME.md)):

| Größe | Wert |
| --- | --- |
| Erfolgschance | 96 % |
| „Sicher möglich ab“ | 57 (richtig wäre 58, B1) |
| Zielkapital | 361.654 € |
| Verfügbar mit 60 | 976.434 € |
| Median mit 60 | 1,32 Mio € |
| Erwartungspfad mit 60 | 1,16 Mio € |
| Monte-Carlo | 211 ms |
| `findRetireAge` | 387 ms |

- **Zufallstest** mit 120 Extremkonfigurationen (Geburtsjahr 1930–2012, Horizont 60–120,
  Inflation −3 bis 15 %, Bedarf 0–50.000 €, Phase-2-Entnahme bis 10.000 €):
  - keine Abstürze, keine NaN-Werte, Ziel immer ≥ 0, Ergebnisalter immer im gültigen Bereich;
  - in 14 Fällen sinkt die Erfolgschance mit späterem Ruhestand (alle mit Phase-2-Entnahme, B14).
- **Browser**: Ergebnis-Karte, Phasen, Einkommen, Crosshair (Historie und Projektion),
  Zeiträume, Log-Skala und Partner-Story (10 Folien) laufen fehlerfrei.
  Neuberechnung 128 ms, aus dem Cache 12 ms.

---

## 11. Befunde

Alle Befunde sind mit den Demo-Daten (`demo_backup.json`) im Test-Harness nachgerechnet.
Schwere: **hoch** = falsches Ergebnis, das Entscheidungen beeinflussen kann · **mittel** =
spürbare Verzerrung · **niedrig** = Randfall oder Aufräumen.

| # | Schwere | Befund | Status 14.10.2026 |
| --- | --- | --- | --- |
| B1 | mittel | „Sicher möglich ab“ rechnet Renten mit dem **geplanten** Arbeitsende | behoben (P9) |
| B2 | hoch | Gesetzliche Rente vor der Regelaltersgrenze **ohne Abschlag** | behoben (P3); Beamte zusätzlich korrigiert (P29) |
| B3 | mittel | Geburtsmonat wird ignoriert | behoben (P17) |
| B4 | mittel | Median-Linie und Asset-Flächen passen nicht zusammen | offen (P16) |
| B5 | mittel | Hohe Schwankungen heben den Median stark an | offen, Modellgrenze (PROBLEME.md 8.2) |
| B6 | niedrig | Frei werdende Kreditrate wird nicht angespart | offen |
| B7 | niedrig | Sparraten sind nominal konstant | offen |
| B8 | niedrig | Zielkapital ohne Ereignisse | offen |
| B9 | niedrig | Depot-Gruppe vor der Auszahlung ohne Beiträge | behoben (P19: Beiträge und Zulagen fließen in den Depot-Topf) |
| B10 | niedrig | Unsichtbare Altelemente werden weiter berechnet | offen |
| B11 | niedrig | Vermögen aus, Kredite an → 0 % Erfolgschance | offen |
| B12 | niedrig | Keine Bereichsprüfung der Prognose-Annahmen beim Import | offen (nur Geburtsmonat seit Schema 13 geprüft) |
| B13 | mittel | Einkommen im Ruhestand: Summe und Altersangaben passen nicht zu den Phasen (PROBLEME.md, P11/P12) | behoben |
| B14 | niedrig | Ruhestandssuche nicht monoton bei Entnahme in Phase 2 | behoben (aufsteigende Suche) |
| B15 | **hoch** | Gehalt einer weiteren Person endet mit deinem Arbeitsende (PROBLEME.md, P5) | behoben (Schema 13) |
| B16 | mittel | Ereignis im laufenden Jahr wird ab Juli ignoriert (PROBLEME.md, P13) | behoben |
| B17 | mittel | Abschreibung einzelner Positionen wirkt nicht in der Prognose (PROBLEME.md, P14) | offen |

**B1 – „Sicher möglich ab“ nutzt Renten des geplanten Arbeitsendes.** `buildPlan` rechnet
Rentenpunkte, Dienstzeit und Depotbeiträge einmal mit `s.workEnd`. `findRetireAge` variiert
dann nur `retireAge` in `simulatePlan`. Ein früherer Ruhestand bekommt also die Punkte eines
späteren Arbeitsendes gutgeschrieben, ein späterer zu wenige.

Demo-Erfolgschance mit festen bzw. neu berechneten Renten:

| Alter | feste Renten | neu berechnet |
| --- | --- | --- |
| 55 | 84,2 % | 81,2 % |
| 56 | 87,0 % | 85,2 % |
| 58 | 93,8 % | 92,4 % |

Hier zufällig ohne Folgen (beide ergeben 56). **Mit deiner neuen Demo sehr wohl**: 57 J.
mit festen Renten 86,0 %, mit neu berechneten 84,4 % < 85 %. Die App zeigt „Sicher möglich
ab 57“, richtig wäre 58. Liegt die Grenze knapp am Sicherheitsniveau,
verschiebt sich das Ergebnis aber um ein Jahr. Vorschlag: In `findRetireAge` je Kandidat den
Plan mit `withdrawFrom = Kandidat` neu bauen (Kosten: ≈6 × `buildPlan`, ≈25 ms).

**B2 – Gesetzliche Rente vor der Regelaltersgrenze ohne Abschlag.** `calcDrvPension`
übernimmt `pensionAge` als Rentenbeginn, ohne 0,3 % je Monat abzuziehen (höchstens 14,4 %).
Die Wartezeit von 35 Jahren für einen vorzeitigen Beginn wird ebenfalls nicht geprüft.

Demo ohne eigenes DRV-Alter, „Rente ab 63“: 1.281 € netto ab 63. Richtig wären etwa 1.097 €
(−14,4 %). Umgekehrt fehlt der Zuschlag von 0,5 % je Monat bei späterem Beginn. Die
Beamtenpension rechnet ihren Abschlag dagegen korrekt.

Vorschlag: In `calcDrvPension` `(rag − age)·12·0,3 %` abziehen bzw. `(age − rag)·12·0,5 %`
zuschlagen und den Rechenweg in `_explainDrv` ergänzen.

**B3 – Geburtsmonat wird ignoriert.** `getLifetimeSettings()` setzt `birthMonth: 1` fest,
obwohl das Schema `retirement.primary.birthMonth` kennt und der CSV-Import `lt-birth-month`
schreibt. Bei einem Dezember-Geburtstag ist jedes Alter bis zu 11 Monate zu hoch. Das betrifft
Phasenbeginn, Rentenbeginn, Punkte bis Arbeitsende und die Regelaltersgrenze der Jahrgänge
1959–1963. In der Oberfläche gibt es kein Eingabefeld dafür.

**B4 – Median-Linie und Asset-Flächen passen nicht zusammen.** Die Hauptlinie ist der Median
der Gesamtsumme über 500 Läufe; die Flächen zeigen den Erwartungspfad je Gruppe.

| Demo, Alter | Median der Summe | Erwartungspfad |
| --- | --- | --- |
| 62 | 1,61 Mio € | 1,21 Mio € |
| 95 | 4,71 Mio € | 2,67 Mio € |

Die Flächen ergeben in der Summe also nicht die Linie. Vorschlag: Flächen je Gruppe ebenfalls
als Median ausweisen oder die Linie klar als „Median“ und die Flächen als „Erwartungswert je
Anlage“ beschriften.

**B5 – Hohe Schwankungen heben den Median stark an.** Die Rendite ist als geometrisches
Mittel gemeint. Eine Gruppe mit 55 % Schwankung (Bitcoin, Krypto) hat damit ein
arithmetisches Mittel von etwa Rendite + 15 Prozentpunkten. Die rechtsschiefe Verteilung hebt
den Median der Summe.

| Demo, Alter 62 | Median | Erfolgschance | sicher ab |
| --- | --- | --- | --- |
| mit Krypto-Schwankung | 1,61 Mio € | 99,2 % | 56 |
| ohne Krypto-Schwankung | 1,33 Mio € | 100 % | 55 |

Mathematisch folgerichtig, aber für Nutzer schwer zu durchschauen. Vorschlag: Hinweis in
„So wird gerechnet“; optional jährliches Rebalancing als Modellvariante.

**B6 – Frei werdende Kreditrate wird nicht angespart.** Gruppen mit Schulden erhalten nie eine
Sparrate (`g.debt > 0` bezieht sich auf die Anfangsschuld). Nach dem Tilgungsende
verschwindet die Rate aus dem Modell. Demo: Autokredit 400 €/Monat bis 07/2029, danach weder
gespart noch ausgegeben. Konservativ, aber ein häufiger Hebel in echten Plänen. Vorschlag:
Option „frei werdende Rate ansparen in …“.

**B7 – Sparraten sind nominal konstant.** Bedarf, Renten und Ereignisse steigen mit der
Inflation, Sparraten nur mit „Sparrate steigt %“. Bei 2 % Inflation und 0 % Steigerung haben
500 € nach 20 Jahren noch die Kaufkraft von 336 €. Laut Info-Text ist das so gewollt, wirkt
aber konservativ. Vorschlag: Standard für „Sparrate steigt“ = Inflation, oder ein Hinweis im
Phasen-Sheet.

**B8 – Zielkapital ohne Ereignisse.** `targetCapital` berücksichtigt weder Ereignisse nach dem
Ruhestand noch die Entnahme in Phase 2. Demo mit einer zusätzlichen Ausgabe von 100.000 € im
Jahr 2060: Zielkapital unverändert 245.516 €. Die Erfolgschance enthält das Ereignis dagegen.

**B9 – Depot-Gruppe vor der Auszahlung ohne Beiträge.**
- Ist ein Depot als Position im Vermögen verknüpft, wächst die Gruppe im Chart nur mit der
  Rendite. Beiträge und Zulagen stecken nur in `calcAvDepot`. Im Chart steht das Depot bis
  zur Auszahlung also zu niedrig.
- Randfall: Hat die Auszahlung schon begonnen (`started`), ist `netto = 0`. Die Gruppe wird
  trotzdem auf 0 gesetzt, und der Wert verschwindet ohne Rente.

**B10 – Unsichtbare Altelemente werden weiter berechnet.**
- Die vier KPI-Kacheln, der Lebensbalken und der Ziel-Balken sind per CSS ausgeblendet
  (Z. ≈1515–1516), werden aber bei jeder Berechnung und jeder Crosshair-Bewegung aktualisiert.
- Der Crosshair sucht `#lt-asset-params-table tr[data-asset-key]`. Die Annahmen sind seit
  Design 2 Karten (`div.v2-ap`), dieser Code läuft also ins Leere.
- Vorschlag: entfernen oder die Werte (Ziel, Deckung) sichtbar in die Ergebnis-Karte übernehmen.

**B11 – Vermögen aus, Kredite an.** Dann besteht der Plan nur aus Schulden (Demo: Auto 0/12.006,
Immobilien 0/213.887), und die Seite zeigt 0 % Erfolgschance statt des Hinweises
„Schalte Vermögenswerte ein“. Vorschlag: In `renderLifetimePageCalcs` ohne `_mod('assets')`
direkt `clearKpis()`.

**B12 – Keine Bereichsprüfung beim Import.** `forecast.settings` wird nur als Zahlenobjekt
geprüft. Ungeordnete Phasen ordnet `_ltPhases` stillschweigend (min/max), und unplausible
Werte (negative Inflation, Horizont unter dem heutigen Alter) laufen durch. Niedrig, weil das
Phasen-Sheet die Reihenfolge erzwingt.

**B13 – Einkommen im Ruhestand passt nicht zu den Phasen.** Siehe 8.3.
- Die Summe sollte die Einkommen bei Rentenbeginn zeigen, oder Beginn und Ende je Zeile
  im eigenen Alter.
- Die Altersangaben sollten auf das eigene Alter umgerechnet werden (`fromMain`/`untilMain`
  sind schon vorhanden).

**B14 – Ruhestandssuche nicht monoton.** Die binäre Suche in `findRetireAge` setzt voraus,
dass die Erfolgschance mit späterem Ruhestand steigt. Mit „Entnahme €/Monat“ im
Weiterarbeiten wird über die ganze Phase entnommen. Bei 1.000 €/Monat sinkt die Chance ab 70
wieder (98 % mit 80, 95 % mit 95). Bei hohen Entnahmen meldet die App „nicht erreichbar“,
obwohl der geplante Ruhestand 100 % hat. Mit realistischen Werten unauffällig.

**B15 – Gehalt einer weiteren Person endet mit deinem Arbeitsende.** Für weitere Personen
rechnet `calcDrvExtra` nur Rentenpunkte bis „Arbeiten bis Alter“. Das laufende Einkommen
fehlt in Phase 3 und 4. Demo: Anna arbeitet bis 2054, die Prognose entnimmt ab 2045 den vollen
Bedarf. Das sind rund 194.000 € Einnahmen in heutiger Kaufkraft, die fehlen.

**B16 – Ereignis im laufenden Jahr.** Ereignisse liegen zur Jahresmitte (`_ageAt(year, 6)`)
und gelten nur, wenn sie nach heute liegen. Ab Juli fällt ein Ereignis des laufenden Jahres
weg. Getestet: 50.000 € „2026“ am 14.10. → nicht im Plan.

**B17 – Abschreibung einzelner Positionen.** Die Prognose rechnet je Gruppe mit einer Rendite.
Demo: Die Garage verliert 0,2 % im Monat (≈ −2,4 % p. a.), die Gruppe Immobilien wächst aber
mit +2 % p. a.

### Weitere Modellgrenzen (bewusst, dokumentieren statt ändern)

- Rendite und Schwankung werden je Lebensjahr gezogen und gleichmäßig auf die Monate verteilt;
  innerhalb eines Jahres gibt es keine eigene Monatsschwankung.
- Weitere Personen haben denselben Geburtsmonat wie du. Ihre Arbeitszeit wechselt an deinen
  Phasengrenzen, ihr Arbeitsende in ihrem Alter. Solange du arbeitest, steckt ihr Gehalt im Budget;
  Änderungen gegenüber heute gleicht der Haushaltssaldo aus (siehe Fahrplan).
- Daten aus früheren Versionen (Schema 16, Review P35–P37): Ein noch nicht zugeordnetes Nettogehalt aus Schema 13
  zählt wie damals nur nach deinem Arbeitsende als Gehalt der Person, nicht im Budget und nicht in der
  Einkommensänderung während deiner Arbeit. „Teilzeit ab Alter“ aus Schema 14 rechnet monatsgenau ab diesem Alter
  (eigene Arbeitsgrenzen `wb` statt der Phasen); die Arbeitszeit je Phase gilt für diese Person erst nach dem
  Umstellen. Ungeklärte Kinder-Jahrgänge an Depots zählen für die Kinderzulage wie in der früheren Version.
- Dein eigenes Gehalt kennt die App nur, wenn es im Budget dir zugeordnet ist; sonst wirkt deine
  Arbeitszeit nur auf Rentenpunkte und Dienstjahre (Hinweis im Phasen-Sheet).
- Betriebsrenten-Sparraten (Gruppen der Kategorie Betriebsrente) zählen zu dir; eine Zuordnung zu
  einer weiteren Person gibt es noch nicht.
- Die Finanzierungsprüfung (P24) nutzt das Budget des laufenden Kalenderjahres; Einmalzahlungen
  zählen nicht.

- Entnahmen erfolgen anteilig aus allen entnehmbaren Anlagen, ohne Reihenfolge und ohne Rebalancing.
- Der Abzug bei Entnahme gilt pauschal auf den ganzen Betrag, nicht nur auf den Gewinnanteil.
- Sachwerte werden nie verkauft; ein leeres liquides Vermögen gilt als Scheitern, auch mit Immobilie.
- Schulden ohne Kreditdaten bleiben nach dem Arbeitsende nominal unverändert (kein Zins, keine Rate).
- Renten sind voll inflationsgesichert (in heutiger Kaufkraft konstant); Betriebsrenten sind real oft schwächer angepasst.
- Die historische Linie nutzt die angenommene Inflation, nicht die tatsächliche.

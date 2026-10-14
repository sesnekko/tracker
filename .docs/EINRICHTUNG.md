# Willkommen, Rundgang und Einrichtung

Stand: 14.10.2026, Code-Stand `7504901` (Schema 12). Funktionsnamen beziehen sich auf
`index.html`; Zeilennummern sind Näherungswerte. Hintergrund zu den Personas:
`.docs/Onboarding Persona/` (lokal, nicht im Repo).

Verwandt: [README.md](README.md) · [DATEN.md](DATEN.md) · [PROGNOSE.md](PROGNOSE.md) ·
[DATA_MODEL.md](DATA_MODEL.md) (Abschnitt „Geführter Einstieg“)

---

## 1. Zweck und Prinzip

Neue Nutzer kommen mit wenigen Schätzwerten zu einem ersten Stand. Alles Weitere schlägt die
Daten-Seite nach und nach vor („Nach und nach ergänzen“, siehe Memory „Progressive
onboarding“). Grundsätze im Code:

- Jeder Schritt ist optional.
- Abbrechen speichert nichts.
- Am Ende wird ein komplettes Dokument gebaut, geprüft und in einem Zug übernommen
  (`importBackup`).
- Mit vorhandenen Daten startet die volle Einrichtung nicht (`hasOnboardingData`).

---

## 2. Willkommen (`guideWelcome`, `showOnboarding`)

Erscheint beim Start, solange `hasOnboardingData(doc)` falsch ist, also keine Positionen,
Monate, Gruppen, Konten, Budgetposten, Kredite, Renten oder Prognose-Einstellungen vorhanden sind.
Willkommen, Rundgang und Einrichtung zählen als Bearbeitung: Solange sie offen sind, gibt das Fenster sein
Schreibrecht nicht an ein anderes Fenster ab (Review P34, „Hier bearbeiten“ meldet dann „beschäftigt“). In einem
Fenster, das nur ansieht, scheitert das Speichern der Einrichtung mit der Meldung „Nur ansehen …“. Die Einrichtung
beruht auf dem Stand bei ihrem Start (Review P54): Wurde inzwischen in einem anderen Fenster gespeichert, speichert
„Fertig“ nichts, sondern meldet es; unveränderte vorbelegte Angaben (Geburtsjahr, Arbeitsende, Bedarf) zeigen dann den
aktuellen Stand, eigene Angaben bleiben, und erneutes Bestätigen ergänzt sie auf dem aktuellen Stand.

- Hintergrund: animierte Kurvenlinien wie Charts (`WELCOME_SERIES`, `_drawWelcomeWaves`,
  Splines), die nur einblenden.
- Drei Punkte: Alles im Blick · Eine Minute im Monat · Privat auf diesem Gerät.
- Aktionen:
  - **Geführt einrichten** → `startSetup()`.
  - **Bestehende Daten laden** → Datei-Upload (JSON oder CSV).
  - **Mit Demo-Daten ausprobieren** → `_v2LoadDemo()`:
    - Über `https:` wird `demo_backup.json` geladen (`fetch`).
    - Über `file://` (Mac-Dropbox-Kopie) wird stattdessen das Skript `demo_backup.js`
      eingebunden, weil Chrome dort `fetch` auf lokale Dateien blockiert.
    - Das Theme bleibt erhalten.

Das Overlay setzt alle anderen Elemente auf `inert`. Der Fokus kehrt beim Schließen zurück.

---

## 3. Rundgang (`startOnboarding`, `guideRender`, `_guideContent`)

Fünf Bildschirme: Vermögen · Budget · Prognose · Daten · Sicherung. Jeder hat ein Beispiel und
einen Satz zur Bedienung.

- Auf dem iPhone (unter 768 px) läuft er wie Stories: 8 s je Bild, Tippen rechts/links, Halten
  pausiert, nach unten wischen schließt (`_bindGuideStory`).
- Ab Tablet-Breite gibt es Knöpfe.
- Letzter Bildschirm: Neue Nutzer bekommen „Jetzt einrichten“ (→ Einrichtung). Bestehende
  Nutzer bekommen „Fertig“ (`finishOnboarding`; setzt nur `onboardingCompleted`).
- Erneut erreichbar über Daten → Hilfe → „App kennenlernen“. Das ersetzt nie Daten und ändert
  keine Bereichsschalter (Test „replay never replaces existing data“).

---

## 4. Einrichtung (`startSetup(mode)`)

### 4.1 Modi und Schritte (`_setupSteps`)

| Modus | Schritte | Aufruf |
| --- | --- | --- |
| `full` | focus → assets → (history) → debts → (budget) → (future → pension) → done | Willkommen |
| `budget` | budget | Vorschlag „Monatsbudget einrichten“ |
| `future` | future → pension | Vorschlag „Zukunft planen“ |
| `pension` | pension | Vorschlag „Rente ergänzen“ |

- **focus**: Was soll die App können? „Vermögen im Blick“ ist immer dabei, dazu optional
  Monatsbudget und Zukunft & Ruhestand. Nicht gewählte Bereiche bleiben ausgeschaltet und
  werden später vorgeschlagen.
- **assets**: Chips für Girokonto, Tagesgeld, ETF, Aktien, Bitcoin, Krypto, Gold, Immobilie,
  Auto, Sonstiges (`SETUP_ASSETS`).
  - Wert in Euro oder (bei ETF, Aktie, Bitcoin, Krypto, Gold) als Stückzahl.
  - Wert = Stückzahl × aktueller Kurs (`_setupLoadQuote` → `fetchInstrumentQuote`). Bitcoin
    und Gold haben eine feste Kursquelle (`SETUP_FIXED_INSTRUMENTS`); Wertpapiere werden über
    Namen oder ISIN gesucht (`searchInstruments`, Yahoo, deutsche Handelsplätze zuerst).
- **history** (nur für Anlagen mit Kurs): „Seit wann hast du deine Anlagen?“ – Monat und Jahr,
  einmal gekauft oder Sparplan.
  - `_setupBuildHistory` lädt Monatskurse (`fetchMonthlyPricesEUR`: Yahoo monatlich, Schlusskurs
    = Monatsende, Fremdwährung mit Monatskurs umgerechnet).
  - `reconstructHolding` baut daraus den Stückzahl-Verlauf. Sparplan: jeden Monat Betrag ÷ Kurs.
    Was zum heutigen Bestand fehlt, gilt als Einmalkauf zu Beginn; ein zu großer Sparplan wird
    verkleinert.
  - Konten und Sachwerte stehen in der Vergangenheit mit dem heutigen Wert.
  - Alle so erzeugten Monate tragen `estimated: true`, bis der Nutzer sie bestätigt.
- **debts**: „Hast du Kredite?“ Für Immobilienkredit, Autokredit, Ratenkredit, Privatdarlehen,
  Kreditkarte und Sonstiges werden Restschuld, optional Rate und Zins (0–50 %) erfasst.
  Immobilien- und Autokredit werden mit der einzigen Immobilie bzw. dem einzigen Auto verknüpft.
- **budget**: Einnahmen, Fixkosten, Lebenshaltung, Sparen (+ Ziel-Anlage).
  - Kreditraten aus dem Schritt „debts“ kommen als eigener Posten dazu.
  - Angezeigt wird „bleibt jeden Monat übrig“.
  - Die Sparrate geht direkt in die Annahmen der Ziel-Anlage (`monthlySaving`).
- **future**: Geburtsjahr (1920 bis heute − 14), Ruhestand mit (40–85), Bedarf pro Monat
  (vorbelegt aus Fixkosten + Lebenshaltung).
- **household** (seit 14.10.2026 der erste Schritt der vollständigen Einrichtung): „Wer gehört zu deinem
  Haushalt?“ – eigenes Geburtsjahr (optional), Partner/in (Name, Geburtsjahr) und Kinder (Name, Geburtsjahr).
  Ergebnis: `retirement.primary.birthYear`, `retirement.people[]`, `retirement.children[]`. Das Kindergeld zeigt der
  Schritt sofort an; im Budget-Schritt steht es als eigene Zeile („automatisch aus deinen Kindern“), zählt in
  „bleibt übrig“ mit und landet nicht im Einkommen (keine Doppelzählung). Geburtsjahre werden beim Verlassen des
  Felds nicht als Betrag formatiert. Test: `setup.test.cjs` „Haushalt“.
- **pension**: bisher erreichte Rente brutto pro Monat laut Renteninformation („Ihre bislang
  erreichte Rentenanwartschaft entspräche einer monatlichen Rente von“), gespeichert als heutige
  Punkte `points = Betrag ÷ Rentenwert`, und optional das Bruttogehalt im Jahr
  (`statutoryPension.annualSalary`), aus dem die Prognose Punkte bis zum Arbeitsende hochrechnet.
  Ein Hinweis warnt vor der „künftigen Regelaltersrente“ (setzt Beiträge bis 67 voraus). „Weiß ich
  nicht“ überspringt beides. Seit 14.10.2026 (E1/P4); vorher wurde die Hochrechnung als heutige
  Punkte gespeichert.
- **done**: Zusammenfassung (Ausgangspunkt, Annahmen, drei Vorschläge für später).

Validierung (`_setupNum`, `_setupAssetRows`, `_setupDebtRows`, `_setupBudget`, `_setupFuture`):
- Deutsche Zahlen.
- Leere Zeilen werden ignoriert.
- Fehlermeldungen nennen die Zeile („Tagesgeld: Bitte …“).

### 4.2 Dokument bauen (`buildSetupDocument`, Z. ≈11126)

- **full**:
  - Positionen in Gruppen nach Art (`CATEGORY_GROUPS`); Kredite in eigene Gruppen mit
    `loans[]` (Verknüpfung, Zins, Rate).
  - Monatsstand für den **Kalendermonat** (`currentYM`) **und** den Live-Monat (`nextYM`) mit
    gleichen Werten. Davor liegen die berechneten Monate (`estimated: true`).
  - Bereiche: Vermögen an, Kredite nur mit Schulden, Budget/Prognose/Altersvorsorge aus. Sie
    werden durch die folgenden Schritte eingeschaltet.
  - `onboardingCompleted = true`.
- **budget**: Posten `setup-income`, `setup-loans`, `setup-fixed`, `setup-living`,
  `setup-saving` mit zwölf gleichen Werten. Bereich Budget an.
- **future**: `birthYear`, `retirementAge = saveUntilAge = Ruhestandsalter`, `monthlySpending`.
  Phase 2 ist damit leer. Bereich Prognose an.
- **pension**: `statutoryPension.points`, Bereich Altersvorsorge an.
- Am Ende `AssetsData.validate(doc)`, dann `importBackup` (`_setupFinish`). Danach geht es zur
  Startseite mit dem Hinweis „Dein nächster Schritt“; bei Mini-Einrichtungen zur passenden
  Seite mit „Gespeichert“.

### 4.3 Vorschläge danach (`_nextSteps`, Z. ≈11635)

Höchstens drei, in dieser Reihenfolge geprüft. Jeder lässt sich ausblenden
(`vermoegen-tips-dismissed`, je Gerät).

1. Ersten Vermögenswert anlegen
2. Budgetposten mit Kredit verknüpfen
3. Sparposten mit Altersvorsorgedepot verknüpfen
4. Monatsbudget einrichten
5. Zukunft planen
6. Rente ergänzen
7. Altersvorsorgedepot planen (bis 2028)
8. Live-Kurs für eine Position
9. Budget genauer aufteilen (solange `setup-fixed/living` existieren)
10. Kredit genauer erfassen
11. Lebensphasen planen
12. Annahmen prüfen
13. Erste Sicherung erstellen

---

## 5. Mitteilungen

`.ob-notif` (nächster Schritt, Monatsstand, Kreditverlauf) sehen aus wie Push-Banner:
- Antippen löst die Aktion aus.
- Nach oben wischen entfernt sie (`_initNotifSwipe`).
- Seitlich wischen geht erst ab Tablet-Breite.
- Die Monatserinnerung erscheint nur, wenn keine andere Mitteilung sichtbar ist.

---

## 6. Tests

- `onboarding.test.cjs`:
  - Willkommen-Aktionen,
  - Persona Max mit drei Positionen,
  - Schulden positiv, ungültige Werte,
  - Wiederholung ersetzt nichts,
  - Abbrechen schreibt nichts,
  - Abschluss schreibt Kalender- und Live-Monat,
  - Speicherkontingent.
- `setup.test.cjs` (23 Tests):
  - Personas P01 Max, P03 Müller, P06 Julia,
  - leere Zeilen, übersprungene Bereiche, Mini-Einrichtungen,
  - Vorschläge,
  - Verlauf aus Kursen (Einmalkauf, Sparplan, ohne Vormonat),
  - Stückzahl-Eingabe,
  - Gruppen nach Art,
  - Kreditrate in Zins und Tilgung.
- P4 (seit 14.10.2026): erreichte Anwartschaft als heutige Punkte, Gehalt bringt Punkte nur bis
  zum Arbeitsende (Ruhestand mit 63: 25 + 21,25 Punkte, keine Jahre bis 67), ungültiges Gehalt
  wird erklärt und nichts gespeichert.
- Nicht abgedeckt: Demo laden im englischen Modus (siehe E2).

---

## 7. Befunde

| # | Schwere | Befund |
| --- | --- | --- |
| E1 | mittel | Rente aus der Renteninformation wird als heutige Punkte gespeichert – **behoben** (P4) |
| E2 | niedrig | Demo laden setzt die Sprache auf Deutsch zurück |
| E3 | niedrig | „Zukunft planen“ setzt Ansparen und Arbeitsende auf dasselbe Alter |
| E4 | mittel | Stückzahlen mit Tausenderpunkt: „1.500“ Stück wird 1,5 (gleicher Parser wie DATEN.md D10) |
| E5 | mittel | Mac (`file://`) lädt die alte Demo aus `demo_backup.js` (PROBLEME.md, DEMO-1) – **behoben** |

**E1 – Rente aus der Renteninformation wird als heutige Punkte gespeichert.** Die
Einrichtung bittet um den Betrag unter „Höhe Ihrer künftigen Regelaltersrente“. Diese
Hochrechnung unterstellt Beiträge **bis zur Regelaltersgrenze**. Die App speichert ihn als
heutige Entgeltpunkte (`points = Betrag ÷ 42,52`) ohne Gehalt. Auf der Daten-Seite heißt
dasselbe Feld aber „bisher gesammelte Entgeltpunkte“ (Info-Text `drv-points`), und die
Prognose rechnet weitere Punkte nur bis zum Arbeitsende.

Folge: Wer früher aufhört (Vorruhestand), bekommt die Beitragsjahre bis 67 trotzdem voll
gutgeschrieben. Beispiel: Ende der Arbeit mit 62 statt 67 bedeutet etwa 5 Punkte weniger, also
rund −13 % Rente. Zusammen mit dem fehlenden Abschlag bei früherem Rentenbeginn
(PROGNOSE.md, B2) wird die Rente deutlich überschätzt.

Vorschlag: In der Einrichtung nach der „bereits erreichten Rentenanwartschaft“ fragen
(= heutige Punkte) und optional nach dem Bruttogehalt. Oder den Betrag als Hochrechnung
kennzeichnen und bei Arbeitsende vor der Regelaltersgrenze anteilig kürzen.

**Behoben 14.10.2026** mit der ersten Variante (Anwartschaft + optionales Gehalt). Einträge, die
früher über die Einrichtung gespeichert wurden, sind nicht als Hochrechnung erkennbar und bleiben
unverändert; wer damals die künftige Regelaltersrente eingetragen hat, sollte die Punkte auf der
Daten-Seite (Altersvorsorge → Gesetzliche Rente) prüfen. Zusätzlich gilt jetzt der Abschlag bei
früherem Rentenbeginn (P3).

**E2 – Demo laden setzt die Sprache auf Deutsch zurück.** `_v2LoadDemo`/`_v2RestoreDemo`
übernehmen aus den aktuellen Einstellungen nur das Theme. `demo_backup.json` enthält kein
`preferences.language`. Im englischen Modus springt die App nach dem Laden der Demo also auf
Deutsch. Vorschlag: auch `preferences.language` übernehmen.

**E3 – „Zukunft planen“ setzt Ansparen und Arbeitsende auf dasselbe Alter.** Die Einrichtung
setzt `saveUntilAge = retirementAge`, Phase 2 ist damit leer. Das ist richtig für den Einstieg.
Wer später im Phasen-Sheet nur „Weiterarbeiten bis“ nach hinten schiebt, bekommt aber eine
Phase 2 **ohne privates Sparen** (Standard 0 %), weil „Ansparen bis“ stehen bleibt. Kein
Fehler, aber leicht zu übersehen; ein Hinweis im Phasen-Sheet würde helfen.

**E4 – Stückzahlen mit Tausenderpunkt.** Die Einrichtung liest Stückzahlen mit
`_assetNumber(…, true)`. Dort ist der Punkt ein Dezimaltrennzeichen: „1.500“ Fondsanteile
werden zu 1,5. Der Wert ist dann um den Faktor 1.000 zu klein, und der Fehler fällt erst in
der Übersicht auf.

**E5 – Mac lädt die alte Demo.**
- „Mit Demo-Daten ausprobieren“ lädt über `https` die JSON, über `file://` das Skript
  `demo_backup.js`.
- Nach deiner Überarbeitung ist nur die JSON neu. Auf dem Mac erscheint deshalb die alte Demo
  (34 Monate, ohne Garagen), auf dem iPhone die neue.
- Der Test `demo-file` schlägt deshalb fehl.

# Probleme, Konflikte und offene Punkte

Stand: 14.10.2026. Befunde erhoben auf Code-Stand `7504901` (Schema 12) mit deinen überarbeiteten
Demo-Daten (`demo_backup.json`, Export vom 13.10.2026 19:49, Schema 11, 35 Monate, 19 Positionen).
**Fehlerbehebung am 14.10.2026** (noch nicht committet, Schema 13): Status je Befund in
[Abschnitt 0](#0-status-der-fehlerbehebung-14102026) und als Zeile „Status“ beim Befund.

Dieses Dokument sammelt alles, was beim ausführlichen Funktionstest und beim Stresstest
aufgefallen ist, nach Wichtigkeit geordnet. Jede Angabe ist mit Zahlen belegt: entweder im
Test-Harness (Node, echtes Hauptskript) oder im Vorschau-Browser (Port 8124) mit den neuen
Demo-Daten. Die Detail-Dokumente ([VERMOEGEN](VERMOEGEN.md), [BUDGET](BUDGET.md),
[PROGNOSE](PROGNOSE.md), [DATEN](DATEN.md), [EINRICHTUNG](EINRICHTUNG.md)) verweisen hierher.
Ältere Befundnummern (B…, BU…, V…, D…, E…) sind in Klammern angegeben.

---

## Übersicht

| Stufe | Anzahl | Bedeutung |
| --- | --- | --- |
| **Hoch** | 13 | Datenverlust oder falsche Zahlen, die im Alltag sichtbar sind oder Entscheidungen beeinflussen; einschließlich P18–P29 aus der unabhängigen Fachprüfung |
| **Mittel** | 16 | spürbare Verzerrung oder Widerspruch zwischen zwei Anzeigen; einschließlich P18–P29 |
| **Demo-Daten** | 7 | Konflikte durch die überarbeitete Demo |
| **Niedrig** | rund 25 | Randfälle, Darstellung, Übersetzung, Aufräumen |
| **Offene Fragen** | 6 | Entscheidungen, die du treffen solltest, bevor korrigiert wird |

Testsuite mit den neuen Demo-Daten: **169 von 171 Tests grün**. Die 2 Fehlschläge betreffen nur die
Demo (siehe DEMO-1 und DEMO-3), nicht die App-Logik. Nach der Fehlerbehebung: **253 von 253**.

**Unabhängige Fachprüfung vom 14.10.2026:** zwölf zusätzliche Befunde P18–P29
(acht hoch, vier mittel), ausführlich in Abschnitt 8. Ein gesondertes, wiederholbares
Audit prüft 22 finanzielle Erwartungen: drei Kontrollfälle stimmen, 19 Teilprüfungen
zeigen Abweichungen. Diese 19 Abweichungen gehören zu zwölf Befunden und sind keine
19 zusätzlichen Fehler. Die bestehende Testsuite wurde unverändert erneut ausgeführt.

---

## 0. Status der Fehlerbehebung (14.10.2026)

Befundnummern bleiben unverändert. **Behoben** heißt: Ursache im Code beseitigt, Wirkung mit einem
Regressionstest belegt, dessen Erwartung unabhängig hergeleitet ist (Rechtsregel oder einfache
Geldfluss-Arithmetik), und der am alten Stand `7504901` fehlschlägt. Ausnahmen sind beim Befund genannt.

**Nachprüfen:**

```sh
node --test .tests/
node .scripts/audit-forecast.cjs
APP_HTML=/tmp/alt.html node --test .tests/forecast-cashflow.test.cjs .tests/pension-rules.test.cjs   # gegen einen alten Stand
```

Den alten Stand erzeugt `git show 7504901:index.html > /tmp/alt.html`. Ergebnis am 14.10.2026:
**288 von 288 Tests grün** (nach der achten Runde: Anmerkungen aus dem Test), Audit
**0 von 22 Abweichungen** (vorher 19). Gegen `7504901` scheitern
alle neuen Fehlertests; nur die Kontrollfälle bestehen (Einzelheiten in Abschnitt 6).

| # | Status | Änderung | Nachweis |
| --- | --- | --- | --- |
| P1 | Behoben | `data-store.js`: Der Speicher merkt sich den zuletzt gelesenen Stand. Hat ein anderes Fenster inzwischen gespeichert, übernimmt er dessen Stand und lehnt die eigene Änderung ab (Fehlercode `CONFLICT`). Einen unlesbaren Stand (z. B. von einer neueren App-Version) überschreibt er nie. Neu: `reload()`. Schreibvorgänge ohne inhaltliche Änderung entfallen. `index.html`: Das `storage`-Ereignis übernimmt den fremden Stand ohne Neuladen, sobald nichts bearbeitet wird; ein offenes Sheet meldet beim Speichern den Konflikt; Live-Kurse fangen Konflikte ab | `concurrency.test.cjs` (6 Tests). Browser (Port 8124, zwei Tabs): Änderung kommt im anderen Tab an, Speichern im offenen Sheet wird mit Hinweis abgelehnt, fremde Änderung bleibt erhalten. Eine erste Fassung mit Neuladen erzeugte eine Neulade-Schleife und wurde ersetzt |
| P2 | Behoben | `calcFlows`: Stückzahl-Zweig nur, wenn eine Stückzahl erfasst ist; Neukauf oder Verkauf ohne Stückzahl ist eine Umschichtung. `_saveAssetSheet` und `saveEntry` setzen die Einheit nur mit Stückzahl oder Kursbewertung | `flows.test.cjs` (3). Browser: alle 17 Positionen und Kredite der Demo ohne Änderung gespeichert → Dokument unverändert. Bestehende Daten sind ohne Migration richtig. Neu angelegte Positionen bekommen weiter eine Einheit (in `assets.test.cjs` so festgelegt, nach der Korrektur ohne Wirkung auf die Flüsse) |
| P3 | Behoben (Geltungsbereich) | `calcDrvPension`: Zugangsfaktor nach § 77 SGB VI (−0,3 % je Monat vor, +0,5 % je Monat nach der Regelaltersgrenze), frühestens mit 63 (§ 36 SGB VI); Erklärung und Info-Texte | `pension-rules.test.cjs` P3 (2). Nicht geprüft: 35 Jahre Wartezeit. Nicht abgebildet: §§ 37, 38 SGB VI |
| P4 | Behoben für neue Eingaben | Einrichtung fragt nach der bislang erreichten Rentenanwartschaft (= heutige Punkte) und optional nach dem Bruttogehalt | `setup.test.cjs` P4. Offen: Früher über die Einrichtung eingetragene Hochrechnungen sind nicht erkennbar und bleiben unverändert |
| P5 | Behoben | Schema 13: `retirement.people[].monthlyNetIncome`. Die Prognose zählt das Nettogehalt ab deinem Arbeitsende bis zum Arbeitsende der Person; Phasen, Partner-Story und Einkommenskarte nennen es „Gehalt“, nicht Rente | `pension-rules.test.cjs` P5 (3) |
| P6 | Offen | – | – |
| P7 | Behoben | `_budgetYM()`: „Heute“ plant den laufenden Kalendermonat; Budget- und Daten-Seite nutzen ihn | `forecast-cashflow.test.cjs` P7 (nachträglich ergänzt; die Korrektur entstand vor dem Test) |
| P8 | Behoben | `calcFlows` ordnet Kredite der Gruppe des finanzierten Vermögenswerts zu (`_liabTargetGroup`). Ein Neukauf verbraucht den Kreditanstieg zuerst, damit derselbe Kredit nicht zusätzlich eine Neubewertung ausgleicht | `flows.test.cjs` P8 (2). Demo, Immobilien 10/2025–10/2026: Einzahlungen 72.195 € → 12.955 € (im Wesentlichen Tilgung); Gesamtsummen unverändert |
| P9 | Behoben | `findRetireAge`: jeder Kandidat mit eigenem Plan (`_planForRetire`, Renten und Beiträge neu berechnet) | `forecast-cashflow.test.cjs` P9. Demo ohne Annas Gehalt: 58 statt 57 |
| P10 | Behoben | Deutsches Zahlenmodell (Entscheidung 14.10.2026): `parseGermanNumber` ist der einzige Parser für Eingaben; Komma = Dezimalzeichen, Punkt/Leerzeichen nur als Tausendertrennzeichen in Dreiergruppen, „1.5“ ist ungültig. `_parseDec`, `_assetNumber`, `_sheetMoney`, `_setupNum`, Kreditfelder, Einrichtung und Altpfade nutzen ihn; ungültige Zahlenfelder werden rot markiert. CSV-Import und gespeicherte Werte bleiben unberührt | `number-input.test.cjs` (5). Geänderte Erwartung in `assets.test.cjs`: Stückzahl „1.000.000“ ist jetzt gültig. Browser: „1.5“ markiert und beim Speichern abgelehnt, „1.500“ = 1.500 |
| P11 | Behoben | `_incomeCard`: Summe und Deckung zum Beginn der Rentenphase; „Lebenslang ab“ zählt nur lebenslange Einkommen, keine befristeten Einkünfte und keine Auszahlpläne mit Ende | `pension-rules.test.cjs` P11/P12. Browser-Demo: „Mit 67: deckt deinen Bedarf von 3.000 €“, „Lebenslang ab 69: 2.478 € (83 %)“ |
| P12 | Behoben | Altersangaben in deinem Alter, bei weiteren Personen deren Alter in Klammern | wie P11 |
| P13 | Behoben | Ereignisse des laufenden Jahres gelten ab dem aktuellen Monat | `forecast-cashflow.test.cjs` P13 |
| P14 | Offen | Modellgrenze: Prognose kennt nur Annahmen je Gruppe | – |
| P15 | Teilweise | In der Demo behoben (DEMO-6). Offen: Die App weist auf einen Sparposten mit verwaister Zielgruppe nicht hin | Demo-Test prüft, dass kein Sparposten auf eine Gruppe ohne aktive Position zielt |
| P16 | Offen | – | – |
| P17 | Behoben | Geburtsmonat (Auswahl auf der Daten-Seite), Alter auf den Monat genau; Schema 13 prüft 1–12 | `forecast-cashflow.test.cjs` P17, `pension-rules.test.cjs` Schema 13 |
| P18 | Behoben | Neues Monatsmodell: Beiträge nach dem Arbeitsende sind Umbuchungen aus dem Vermögen, AV-Eigenbeiträge ebenso | P18a/b in `forecast-cashflow.test.cjs` und im Audit |
| P19 | Behoben | Jedes verknüpfte Depot ist ein eigener Topf, wird zum eigenen Auszahlungsmonat umgewandelt und zahlt aus dem simulierten Kapital; eine laufende Auszahlung verrentet das heutige Guthaben | P19a/b und „payout already started“; Audit P19a/b |
| P20 | Behoben | Töpfe je Liquiditätsklasse innerhalb einer Gruppe | P20; Audit |
| P21 | Behoben | Eine monatliche Zeitachse für Bedarf, Einkommen, Phasen, Freigaben und Ereignisse | P21a–c; Audit |
| P22 | Behoben | Ereignisse buchen nur den finanzierten Teil, der Rest ist Fehlbetrag | P22; Audit |
| P23 | Behoben | Suche nur bis Horizont − 1, jeder Kandidat hat mindestens ein Ruhestandsjahr | P23; Audit |
| P24 | Behoben | `_planFunding`: Sparraten über dem Budgetüberschuss entnimmt die Prognose monatlich aus dem Vermögen; Hinweis in der Ergebnis-Karte | P24; Audit. Offen: Einmalzahlungen im Budget werden nicht als Ereignisse übernommen |
| P25 | Behoben | `_avdYearAll`: Eigenbeiträge je Person und Jahr, Mindesteigenbeitrag 120 €, Kinderzulage je Kind und nur bei einer Person, Bonus einmal je Person, Verteilung nach Eigenbeitrag | `pension-depot.test.cjs`, `pension-rules.test.cjs` P25 (3); Audit P25a–c. Eine bestehende Erwartung (`sub(100,1)`) wurde mit Verweis auf § 86 EStG n. F. korrigiert |
| P26 | Behoben | Ein verknüpfter Budgetposten wird nur ersetzt, wenn es im Monat eine automatische Depotzeile gibt | P26; Audit |
| P27 | Behoben | Lebensphasen zeigen „Fehlbetrag mit X“ aus den simulierten Fehlbeträgen (Hälfte der Läufe), keine Liquiditätsschwelle | P27; Audit |
| P28 | Behoben | Startbestand = letzter Stand bis einschließlich Live-Monat; Hinweis, wenn der Startstand älter als der Vormonat ist | P28; Audit |
| P29 | Behoben (Bund) | `calcBeamtePension`: mindestens 5 Dienstjahre, frühestens mit 63, Abschlag höchstens 14,4 %, kein Abschlag mit 65 und 45 Jahren | `pension-rules.test.cjs` P29; Audit P29a/b. Nicht abgebildet: Landesrecht, Dienstunfähigkeit, Schwerbehinderung |
| Nichtmonotonie | Behoben | lineare Suche statt Binärsuche | `forecast-cashflow.test.cjs` „search: a later retirement …“ |
| DEMO-1 | Behoben | `demo_backup.js` aus `demo_backup.json` erzeugt | Test `demo-file` |
| DEMO-2 | Behoben | `.scripts/build-demo.cjs` normalisiert nur noch die JSON und erzeugt die JS-Datei; Inhalte ändert es nicht | – |
| DEMO-3 | Behoben | Test „bundled JSON demo …“ auf deine Demo umgestellt, Budgetwerte unabhängig aus den Posten hergeleitet | `data-model.test.cjs` |
| DEMO-4 | Behoben | Schema 13, `exportedAt` und Live-Monat 2026-11 entfernt (dieser enthielt nur abgeleitete Werte: Kurse, Restschulden, Abschreibung) | Test „bundled JSON demo …“ |
| DEMO-5 | Behoben | Neue Funktion „Werte aus Kursen übernehmen“ (P30) auf die Demo angewendet: alle sieben Kurspositionen mit echten Monatsschlusskursen (`.scripts/demo-prices.json`, `.scripts/demo-quote-history.cjs`). Nestlé hat erst ab Mai 2025 Kurse; davor bleiben die Demo-Werte | Script-Ausgabe: 6 × 34 Monate und 17 Monate Nestlé neu; außer diesen Werten ist die Demo unverändert |
| DEMO-6 | Behoben | Budgetposten „Altersvorsorge-Beiträge“ (70 €) entfernt, Sparrate der leeren Gruppe auf 0; Budget 825 € Sparen = Prognose | Demo-Test (Sparen 825 €, frei 1.039 €) |
| DEMO-7 | Geprüft | nach P8: Immobilien-Einzahlungen 12.955 € statt 72.195 € | siehe P8 |
| Demo: Annas Gehalt | Erledigt | Mit dem Personenmodell ist „Nettogehalt Anna“ im Budget Anna zugeordnet (statt eines eigenen Feldes); das Feld `monthlyNetIncome` aus Schema 13 entfällt | Wirkung auf die Demo unverändert: Erfolgschance 100 %, „sicher ab“ 52 (ohne Annas Gehalt 95,8 % und 58) |
| Personenmodell | Umgesetzt (Entscheidung 14.10.2026) | Schema 14: Budget-Einnahmen und weitere Einkünfte tragen eine Person; das Gehalt einer weiteren Person ist der Ø ihrer zugeordneten Budget-Einnahmen und zählt nach deinem Arbeitsende bis zu ihrem Arbeitsende; „ab/bis Alter“ einer Einkunft gilt im Alter ihrer Person. Daten-Seite: neuer Abschnitt „Haushalt“ (weitere Personen, Kinder); Budget-Eintrag: Auswahl „Person“; weitere Einkünfte: „Für“. Lebensphasen und Bedarf richten sich nach dir | `persons.test.cjs` (6 + 3), `pension-rules.test.cjs` „Personen“, Browser |
| Kinder | Umgesetzt (Entscheidung 14.10.2026) | Kinder sind Personen (`retirement.children`). Kindergeld 259 € je Kind (§ 66 EStG) als automatische Budgetzeile, ersetzt einen eigenen Posten „Kindergeld“; in der Prognose nach deinem Arbeitsende bis zum 18. (25.) Geburtstag. Kinderzulage der Depots aus den Kindern („Kinderzulage bei“). Jahrgänge an Depots werden migriert, die Zulage rechnet gleich. Einrichtung beginnt mit „Wer gehört zu deinem Haushalt?“ | `household.test.cjs` (4), `persons.test.cjs`, `setup.test.cjs` „Haushalt“, angepasste Erwartungen in `pension-depot.test.cjs` und `pension-rules.test.cjs` (P25) im Test begründet |
| P30 | Behoben | Neu: „Werte aus Kursen übernehmen“ (`quoteHistoryFlow`). Stand M = Stückzahl im Stand M × Schlusskurs des Vormonats in Euro, umgerechnet mit dem Wechselkurs desselben Monatsendes (so friert auch der Live-Monat ein). Rückfrage mit Umfang und größter Änderung vor dem Überschreiben; angeboten nach dem Umstellen auf Kurse, beim Anlegen einer Kursposition mit „Im Besitz seit“ und als Knopf im Verlauf. Der Verlaufs-Sheet bewertet mit demselben Kurs | `quote-history.test.cjs` (8). Browser: verfälschter Monat erkannt, Rückfrage, Wert nach „Überschreiben“ korrekt |
| P31 | Behoben | Neu gefunden: Yahoo füllt Monate ohne Handel mit dem letzten Kurs (Umsatz 0, Hoch = Tief), z. B. NESR.DE bis April 2025 durchgehend 90,56 €. `_yahooMonthly` lässt solche Monate aus; sie gelten als „kein Kurs“ (auch für die Einrichtung und den Verlauf) | `quote-history.test.cjs` |
| Teilzeit weiterer Personen | Umgesetzt (Entscheidung 14.10.2026) | Neue Felder je weiterer Person „Teilzeit ab Alter“ und „Arbeitszeit %“ (Schema 14). Gehalt in der Prognose und neue Rentenpunkte ab dann anteilig; sinkt ihr Gehalt (Teilzeit oder Arbeitsende), während du noch arbeitest, kommt die Sparlücke monatlich aus dem Vermögen, mit Hinweis in der Ergebnis-Karte. Karte mit Zeitstrahl „voll → Teilzeit → ohne Arbeit → Rente“. Demo-Probe: Anna 50 % ab 60 → Rente 995 € statt 1.078 €, Erfolgschance 99 %, sicher ab 54 | `household.test.cjs` (5), `persons.test.cjs` (2) |
| Arbeitszeit und Altersvorsorge je Phase und Person | Umgesetzt (Entscheidung 14.10.2026) | Schema 15: Im Lebensphasen-Sheet je Phase ein Feld je erwachsene Person für Arbeitszeit (% einer Vollzeitstelle, leer = wie davor) und Altersvorsorge (% der heutigen Beiträge, leer = solange die Person arbeitet). „Teilzeit ab Alter“ aus Schema 14 bleibt seit Schema 16 genau erhalten und wird erst nach Bestätigung umgestellt (P36). Solange du arbeitest, ändert sich der Haushaltssaldo mit allen Gehältern, auch deinem eigenen, und mit den Eigenbeiträgen der Altersvorsorgedepots: Lücken kommen aus dem Vermögen, Mehreinkommen wird angelegt (vorher wirkte deine eigene Teilzeit nur auf Rentenpunkte). Demo unverändert 100 % / sicher ab 52; im Browser: Phase 1 Max Vollzeit/Anna 50 %, Phase 2 Max 50 %/Anna 25 % + 500 € Entnahme → 93 % | `household.test.cjs` (9), `persons.test.cjs` (3), `life-phases.test.cjs`, Browser 8124 |
| Lebensphasen gesammelt | Umgesetzt (Entscheidung 14.10.2026) | Arbeitsende, Teilzeit und Rentenbeginn weiterer Personen stehen nur noch im Lebensphasen-Sheet (Prognose), nicht mehr doppelt auf der Haushaltskarte. Das Sheet hat ausklappbare Abschnitte je Phase und je Person mit Zusammenfassung im Kopf; die Prognose-Karte „Lebensphasen“ zeigt je Person eine Zeile, die das Sheet bei ihr öffnet. Die Haushaltskarte zeigt Zeitstrahl und „In den Lebensphasen ändern“ und behält die Phasenwerte beim Speichern. Browser: Teilzeit im Sheet gesetzt → Dokument, Prognose-Karte und Haushaltskarte stimmen; Speichern ohne Änderung ändert nur P33 | `household.test.cjs` (3) |
| P32 | Behoben | Die Einrichtung (`reconstructHolding`) bewertet Stand M jetzt mit dem Kurs zum Monatswechsel (Schlusskurs von M−1); für den ersten bekannten Kursmonat ohne Vormonat dessen eigener Kurs. Stückzahlen und Kaufmonat unverändert; der laufende Kalendermonat behält den in der Einrichtung eingetragenen Wert | `setup.test.cjs` (Erwartung [1100, 900, 1200] → [1000, 1100, 900], im Test begründet) |
| P33 | Offen (niedrig) | Neu gefunden, besteht schon in `7504901`: Speichern im Bearbeiten-Modus der Daten-Seite schreibt bei leerem „Rentenbeginn“ der eigenen gesetzlichen Rente `retirementAge: 0` ins Dokument (`_drvFromInputs`). Inhaltlich neutral (0 = automatisch), widerspricht aber „Speichern ohne Änderung ändert nichts“ | Browser-Vergleich vorher/nachher |

**Unabhängiges Review vom 14.10.2026** ([REVIEW_2026-10.md](REVIEW_2026-10.md), geprüfter Stand `1b57aa8`): Befunde
P34–P53. Umgesetzt in dieser Runde: **P34–P38** (Schutz vorhandener Daten). P39–P53 sind offen und folgen in
späteren Runden. Umgesetzt heißt hier: Reproduktion aus dem Review behoben und durch einen Regressionstest abgesichert,
der am Stand `1b57aa8` fehlschlägt. Ein unabhängiger Folge-Review steht noch aus.

| Befund | Status | Ursache und Lösung | Regressionstest und Erwartung |
| --- | --- | --- | --- |
| P34 Schreibrennen zwischen Fenstern | Umgesetzt | Lesen und Schreiben von localStorage sind zwischen Fenstern keine gemeinsame Operation. Jetzt schreibt nur ein Fenster: Es hält die exklusive Web Lock `vermoegen-writer`. Weitere Fenster zeigen „Nur ansehen“ mit „Hier bearbeiten“; jeder Schreibweg des Speichers lehnt dort mit `READ_ONLY` ab (Meldung „Nur ansehen … nicht gespeichert“). Übergabe auf Bitte (nicht während einer Bearbeitung) mit Abgabe-Marke, damit das übernehmende Fenster den letzten Stand sieht; schließt das schreibende Fenster, übernimmt das nächste. Start der App erst nach der Entscheidung (Rückfall nach 3 s: „Nur ansehen“); lehnt der Browser Web Locks ab oder fehlen sie, galt damals nur P1 – seit P55 bleibt das Fenster im erklärten Lesemodus. Wartung beim Start und Hintergrund-Kurse schreiben nur mit Schreibrecht. Geprüft: Chrome per HTTP (Port 8124) und Chrome mit `file://` (headless, zwei Tabs: Sperre, Übergabe, Schließen) | `data-safety.test.cjs` P34 (5): kontrollierte Verschachtelung aus dem Review – A schreibt während des Speicherns von B: Inflation 3 bleibt, B wird mit `READ_ONLY` abgelehnt (vorher: Inflation 3 still verloren); Übergabe mit Übernahme des Stands; „beschäftigt“; Absturz des schreibenden Fensters; alle Schreibwege gesperrt; Rückfall ohne Sperre |
| P35 Gehaltsmigration | Umgesetzt | Die Namenssuche hielt „kein eindeutiger Treffer“ für „kein Gehalt“ und legte einen zusätzlichen Posten an. Jetzt wird nur zugeordnet, was eindeutig dasselbe Gehalt ist (genau ein freier Einnahmeposten mit dem Namen der Person und gleichem Betrag). Sonst bleibt `monthlyNetIncome` erhalten (Schema 16), zählt wie in Schema 13 nur in der Prognose als Gehalt, und die Karte „Nach dem Update“ bietet die Zuordnung mit Vorher/Nachher (Budget-Einnahmen und Gehalt in der Prognose) an: vorhandener Posten oder ausdrücklich neuer Posten | `data-safety.test.cjs` P35 (4): „Gehalt Partnerin“, „Gehalt“, zwei gleiche Gehälter, abweichender Betrag, kein Posten → Einnahmen unverändert (vorher 3.600 € statt 1.800 €); Vorschau 5.000 → 5.000 € bzw. → 6.800 € bei neuem Posten; Wiederholung und Export/Import gleich |
| P36 Teilzeitmigration | Umgesetzt | Die Migration ordnete Teilzeit der Phase zu, in der sie überwiegt, und verlor den genauen Beginn. Jetzt bleiben `partTimeFromAge`/`partTimePercent` erhalten (Schema 16) und rechnen genau wie in Schema 14 (Gehalt und Rentenpunkte monatsgenau ab dem Alter). Umstellung auf Lebensphasen nur über „Teilzeit umstellen“ mit Wirkung je Phase (z. B. „ab 50 statt 48: 24 Monate länger volles Gehalt +7.200 €“); Teilzeit ab Alter und Arbeitszeit je Phase schließen sich aus | `data-safety.test.cjs` P36 (4): Beginn 48 bleibt; Beginn 43 innerhalb einer Phase: Vermögen mit 44 = 20.000 − 15 × 400 − 12 × 700 = 5.600 € (vorher 9.200 €); Vorschau +7.200 €; Ausschluss beider Angaben |
| P37 Alte Kinderjahrgänge | Umgesetzt | Früher war jede Zahl ab 1900 erlaubt (z. B. 2019,5); die Migration machte daraus ein ungültiges Kind und blockierte das Laden. Jetzt werden nur ganze Jahre 1900–2200 Kinder; andere Werte bleiben unverändert am Depot (`unresolvedChildBirthYears`), rechnen wie die frühere Version (vierstellige Jahreszahl im Text) und werden über die Karte geklärt (ganzes Jahr oder nicht übernehmen; nie gerundet). Vor dem ersten Speichern eines migrierten Stands sichert der Speicher das unveränderte Original (`vermoegen-data-v1-before-update`), exportierbar über die Karte und Daten → Sicherung | `data-safety.test.cjs` P37 (4): Laden statt Blockade (vorher „Kind.birthYear: Geburtsjahr erwartet“), Original Byte für Byte gesichert, gemischte Werte, Kinderzulage 2027 mit 1 Kind und 2038 ohne, 2020,5 abgelehnt ohne Änderung, ungültiger Stand nie gespeichert |
| P38 Historische Kursübernahme | Umgesetzt | Der Abruf nutzte die alte Instrumentkennung, die Berechnung die aktuellen Daten. Jetzt werden Instrument und Prüfstand (Stückzahl und Wert je betroffenem Monat) nach dem Abruf, vor der Rückfrage und nach der Bestätigung verglichen; bei neuem Instrument wird neu abgerufen, bei geänderten Daten neu berechnet und erneut gefragt; geschrieben wird nur der zuletzt bestätigte Stand (Prüfung auch in der Transaktion) | `quote-history.test.cjs` P38 (6): Wechsel A.DE → B.DE während des Abrufs: 10 × 50 € = 500 € aus B.DE (vorher 10 × 100 € = 1.000 € aus A.DE); B.DE nicht abrufbar: Werte bleiben; Stückzahl während der Rückfrage 12 → 20: zweite Rückfrage, 20 × 95 €; Ablehnung: nur die eigene Änderung bleibt; Instrumentwechsel während der Rückfrage; Teilfehler: nichts geändert |

**Anmerkungen aus dem Test vom 14.10.2026** (nach der Review-Runde, noch ohne Folge-Review):

| Anmerkung | Status | Umsetzung | Tests |
| --- | --- | --- | --- |
| Eigenes Geburtsjahr/-monat unter Daten nicht änderbar | Umgesetzt | Die Ich-Karte im Haushalt zeigte die Werte nur an; geändert wurde unter „Prognose & Annahmen“. Jetzt im Bearbeiten-Modus auf der Ich-Karte (Jahr per Auswahl, Monat); unter „Prognose & Annahmen“ entfernt, damit es eine Stelle gibt. Unverändert wird nichts geschrieben | Browser (Monat geändert, sonst kein Unterschied außer Live-Kurs) |
| Erwerbsminderungsrente stand im Haushalt; nur eine gesetzliche Rente unter Altersvorsorge | Umgesetzt (Schema 17) | Haushalt nur noch Name und Geburtsjahr. Unter Altersvorsorge je Person eine Karte „Gesetzliche Rente“ (Punkte, Brutto, Rentenbeginn, Abzüge, Erwerbsminderung) und „Beamtenversorgung“, auch für weitere Personen (`people[].civilServicePension`, Dienstjahre nach ihrer Arbeitszeit je Phase). Gespeichert über `_mergePersonRows`: Was ein Bereich nicht zeigt, bleibt | `household.test.cjs` „Personen speichern …“, „Beamtenversorgung einer weiteren Person …“ (5 + 18,25 + 3,5 … = 31,75 Dienstjahre), `civil-pension.test.cjs` (angepasst, begründet); Browser |
| Vollzeit/Teilzeit beim Einkommen festlegen und in die Prognose übernehmen | Umgesetzt (Schema 17) | Budget-Eintrag einer Person: „Arbeitszeit“ Vollzeit oder Teilzeit x % (`budget.items[].workPercent`). Gilt als Arbeitszeit heute (Phase 1) für Gehalt, Rentenpunkte und Dienstjahre; das Lebensphasen-Sheet zeigt sie dann nur an | `household.test.cjs` „Arbeitszeit am Gehalt“ (2): 10.000 + 15 × 500 + 12 × 600; Prüfregeln; Browser |
| Warum „Weitere Personen“ im Lebensphasen-Sheet? | Umgesetzt | Der Abschnitt hielt Arbeitsende und Rentenbeginn weiterer Personen in ihrem Alter. Jetzt: Arbeitsende in Phase 2 in der Zeile „Arbeiten bis Alter“ neben deinem, Rentenbeginn bei ihrer gesetzlichen Rente, Zeitstrahl oben im Sheet; Teilzeit ab Alter (Schema 14) als Hinweis in Phase 2 | `household.test.cjs` (Sheet-Tests angepasst) |
| Ausführliche Erklärung zur Erfolgschance | Umgesetzt | Tipp auf die Prozentzahl öffnet `openSuccessExplain` mit den aktuellen Zahlen (Bedeutung, Monte-Carlo, Monatsablauf, Scheitern, Annahmen je Anlage, „Sicher möglich ab“, Grenzen). „So wird gerechnet“ korrigiert (Monat für Monat statt Jahr für Jahr) | Browser (Deutsch) |
| „Einkommen im Ruhestand“ seltsam aufgebaut | Umgesetzt | Je Person gegliedert (Ich, weitere Personen, Haushalt) mit Zwischensumme zum Rentenbeginn; Gehaltsabschnitte vor deinem Arbeitsende entfallen dort | `household.test.cjs` „Einkommen im Ruhestand: jede Zeile gehört …“; Erwartung „Einkommenskarte“ angepasst (begründet); Browser |

**Folge-Review vom 14.10.2026** ([REVIEW_2026-10_FOLGE.md](REVIEW_2026-10_FOLGE.md)): Befunde P54–P63. Umgesetzt in
dieser Runde: **P54, P55, P63** (Schreibrecht, Entwürfe, Lebenszyklus) als gemeinsame Lösung in Speicher und App. Offen
für spätere Runden: P56–P62 und weiterhin P39–P53. Umgesetzt heißt: Reproduktion aus dem Folge-Review behoben und durch
Regressionstests abgesichert, die am Stand vor dieser Runde fehlschlagen. Zustände und Übergänge des Schreibrechts:
DATA_MODEL.md „Schreibrecht zwischen Fenstern“. Kein Schemawechsel (weiter Version 17).

| Befund | Status | Ursache und Lösung | Regressionstest und Erwartung |
| --- | --- | --- | --- |
| P54 Leserentwurf überschreibt nach Übernahme | Umgesetzt; laut Folge-Review 2 teilweise (Lücken P64, P66–P68) | Die Übernahme des Schreibrechts lud den neuen Stand und setzte damit still die Konfliktbasis offener Eingaben neu; ein alter Entwurf speicherte danach ohne Konflikt. Jetzt zählt der Speicher übernommene fremde Stände (`revision()`), jede Bearbeitung speichert mit ihrer Basis (`withBase`) und wird bei neuerem Stand abgelehnt (`STALE`, nichts geschrieben); ohne eigene Basis gilt der zuletzt angezeigte Stand (`trackView`, `markShown`). Basen für Sheets (Speichern, Löschen, Anlegen), Daten-Bearbeiten, Einrichtung, JSON-/CSV-Import, Zurücksetzen, Demo, Kursverlauf und die Ereignisliste. Bei Ablehnung öffnet das Sheet bzw. die Daten-Seite mit dem aktuellen Stand neu; nur hier bediente und geänderte Felder werden wieder eingetragen, markiert und bei gleichzeitiger fremder Änderung mit „Inzwischen gespeichert: …“ ergänzt; gespeichert wird erst beim erneuten Speichern. Import, Zurücksetzen, Demo: „Nichts geändert …“. Auch ein Konflikt nach P1 läuft so ab | `writer-lifecycle.test.cjs`: verbindlicher Kontrollfall – B öffnet 3.200, A speichert 4.000 und schließt, B übernimmt und speichert: **4.000 bleibt**, Meldung „Nicht gespeichert: In einem anderen Fenster …“, Sheet offen, Eingabe 3.200 noch da; erst erneutes Speichern übernimmt bewusst (3.600). Ebenso Kredit-Sheet (Restschuld 3.000 bleibt), Kinder-Klärung (Jahrgang bleibt offen), Budget-Sheet (3.500 bleibt), Daten-Bearbeiten (Geburtsjahr 1984 bleibt, Dialog), JSON-Import während der Rückfrage (Inflation 7 bleibt, nichts importiert), Transaktion und `trackView` im Speicher. Am alten Stand: 3.200, 2.500, 3.100, 1980 und Inflation 0 gespeichert |
| P55 Fehler und fehlende Antworten beim Erwerb | Umgesetzt; laut Folge-Review 2 teilweise (Lücke P65) | Fehler aus Übernahme, Erstübernahme alter Schlüssel und Marke erreichten den Halte-Promise nicht; eingereihte Anfragen hatten kein Catch; `requestWrite` wartete unbegrenzt auf die erste Antwort; ohne/abgelehnte Locks wurde automatisch ungesichert geschrieben. Jetzt: neuer Zustand `failed` (Sperre sofort frei, Original unverändert, „Erneut versuchen“), alle Lock-Aufrufe mit Catch und gegen synchrone Ausnahmen gesichert, abgelehnte Anfragen enden als `denied` mit erneutem Anstellen, `ready()` endet nach höchstens 2,5 s, `requestWrite` innerhalb seiner Frist einschließlich des Wartens auf die erste Antwort, 3-s-Start zum Ansehen bleibt. Ohne nutzbare Web Locks: erklärter Lesemodus `unsupported`; „Nur hier bearbeiten …“ erst nach Bestätigung (dann P1 und P54). Meldungen nennen den jeweiligen Grund; der Knopf ist nie dauerhaft gesperrt | `writer-lifecycle.test.cjs`: Speicher voll bei der Erstübernahme → `failed` in < 1 s, keine Lock-Haltung, `lt-inflation` = 2 und kein Dokument, nach Beseitigung `writer` und Inflation 2 übernommen; erneutes Scheitern → `failed`; abgelehnte Warteschlange ohne unbehandelte Ablehnung, `denied`, danach `writer`; keine erste Antwort → `timeout` nach < 200 ms bei 40-ms-Frist, `ready()` = reader; ohne/abgelehnte/werfende Locks → `unsupported`, `READ_ONLY`, erst `allowSingle()` schreibt; Knopf nach Fehler bedienbar; 3-s-Start genau einmal. `data-safety.test.cjs` „lehnt der Browser die Sperre ab“: Erwartung geändert (`single` → `unsupported`, begründet im Test) |
| P63 Navigation lässt die Sperre belegt | Umgesetzt; laut Folge-Review 2 behoben im geprüften Umfang | `leave()` schrieb nur die Marke und hielt Sperre und Writer-Zustand. Jetzt: `pagehide` und `freeze` → `suspended` (Marke, wartende Anfrage abbrechen, Sperre wirklich frei, nicht wieder anstellen, neue Epoche); `pageshow` mit `persisted`, `resume` oder wieder sichtbar → neu erwerben und Stand neu laden, offene Entwürfe nach P54. Späte Rückrufe einer früheren Epoche geben eine Sperre sofort zurück. Ein nur verdeckter Tab behält das Schreibrecht und beantwortet Bitten. Dazu: storage-Ereignisse vor dem ersten Aufbau der Seite werden erst danach übernommen (Startrennen, im Browsertest gefunden) | `writer-lifecycle.test.cjs`: Writer verlässt die Seite → anderer Tab übernimmt ohne Rückkehr, keine eigene Anfrage in der Warteschlange; Rückkehr → `reader` mit dem Stand des anderen, Schreiben gesperrt; nach dessen Schließen wieder Writer; späte Rückrufe (ohne Abbruch, verspätete erste Antwort) → Sperre frei, Zustand bleibt `suspended`; freeze/resume; verdeckter Tab gibt auf Bitte ab; gleichzeitige Anfragen → genau ein Writer; alle Schreibwege im lesenden und verlassenen Fenster gesperrt. Am alten Stand bleibt der Tab nach `pagehide` Writer |

**Nachweise dieser Runde.** *Automatisiert:* `node --test .tests/` **309/309** (neu `writer-lifecycle.test.cjs` mit 21 Tests;
Testbrowser mit asynchronen storage-Ereignissen und Sperr-Rückrufen, bfcache-Seiten ohne Ereignisse, Prüfung „höchstens
ein Writer, und er hält die Sperre“ nach jedem Ereignis). Gegenprobe: dieselbe Datei gegen Kopien von `index.html` und
`data-store.js` vor dieser Runde: 20 von 21 scheitern, nur der Kontrolltest „3-s-Start“ besteht. Genauer (Einordnung aus
dem Folge-Review 2): 9 davon scheitern an fehlenden neuen Schnittstellen und sind damit keine fachliche Gegenprobe, 2 an
der unbehandelten Quota-Ablehnung, 1 an der unbegrenzten Anfrage, 8 an gespeicherten falschen Werten bzw. einem falschen
Zustand; der Kredit-/Kinder-Test erreicht am alten Stand seine Kinderhälfte nicht, der Test gleichzeitiger Anfragen
scheitert dort erst beim Aufräumen. Audit
`node .scripts/audit-forecast.cjs`: 22 Prüfungen, 0 Abweichungen. Der App-Harness stellt jetzt Web Locks wie der
Browser bereit und fragt beim Laden das Schreibrecht an (wie `_startApp`); Erwartungen anderer Tests unverändert.
*Im Browser ausgeführt* (Chrome 155 headless über das DevTools-Protokoll, jeweils frisches leeres Profil): **HTTP
`127.0.0.1:8124` mit der Demo** und **`file://` mit einer Kopie unter `/tmp` und synthetischen Daten**. Kontrollfall P54
(3.500 im Lesefenster abgelehnt, A speichert 4.000 und schließt, B übernimmt, altes Sheet zeigt 3.200, Speichern →
„Nicht gespeichert …“, Sheet zeigt 4.000, gespeichert bleibt 4.000); eigene Änderung 3.700 bleibt markiert neben
„Inzwischen gespeichert: 4.500“, erst erneutes Speichern speichert 3.700; Writer navigiert zu `demo_backup.json` → anderer
Tab schreibt nach rund 20–30 ms; Zurück → alter Tab liest mit dem neuen Stand, Schreiben gesperrt, nach Schließen des
anderen wieder Writer; zwei gleichzeitige Übernahmeanfragen → `writer`/`timeout`; Writer-Intervalle aller Tabs ohne
Überschneidung (Zeitstempel mit gemeinsamer Uhr); Lesemodus ohne Web Locks mit Dialog und passender Meldung; keine
Konsolenfehler. **bfcache:** nur für HTTP belegt – `pagehide` und `pageshow` mit `persisted: true`, Navigationstyp
`BackForwardCacheRestore`. Für `file://` nutzt Chrome keinen bfcache (`SchemeNotHTTPOrHTTPS`), die Rückkehr lädt neu.
*Nicht geprüft:* Safari auf macOS und iOS, iPhone-PWA (Wechsel in den Hintergrund), Firefox, ein vom Browser
eingefrorener Hintergrund-Tab (`freeze` nur im Testbrowser) und ein echter Absturz des Betriebssystems. Port 8123 und die
produktive `file://`-Kopie wurden nicht benutzt.

**Folge-Review 2 vom 14.10.2026** ([REVIEW_2026-10_FOLGE2.md](REVIEW_2026-10_FOLGE2.md)): Befunde P64–P68. Umgesetzt in
dieser Runde: **P64 und P65**. Offen: P66–P68 (Abgleich: Schalter, wiederholter Einrichtungskonflikt, fremder
Sprachwechsel), weiterhin P56–P62 und P39–P53. „Umgesetzt“ ist noch keine unabhängige Freigabe; sie folgt im nächsten
Review. Kein Schemawechsel (weiter Version 17); Versionen `data-store.js?v=28`, `i18n-en.js?v=12`, Cache `verm-v126`.

| Befund | Status | Ursache und Lösung | Regressionstest und Erwartung |
| --- | --- | --- | --- |
| P64 Abgleich ordnet Eingabe einem anderen Ereignis zu | Umgesetzt | `_planListStale` ordnete nach Zeilenindex und gleicher Zeilenanzahl zu und speicherte die übertragene Eingabe per `dispatchEvent` sofort. Jetzt schreibt die Liste bei einem Konflikt nichts, zeichnet den aktuellen Stand und nennt alle eigenen Eingaben (abweichend von der gezeichneten Fassung, auch im Lesefenster abgelehnte). Zuordnung allein über die gespeicherte Zeilen-ID; fehlende, leere oder mehrfache ID → „nicht übertragen“ mit Grund. Übertragbares wird erst mit „Meine Eingaben übernehmen“ geschrieben, und zwar nur die genannten Felder in die Zeile mit derselben ID (andere, fremd geänderte Felder bleiben). Neue Zeilen erhalten ihre ID beim Anlegen (eindeutig, nie die einer gelöschten; vorher vergab der Speicher die kleinste freie Nummer neu) und werden aus dem gespeicherten Stand gezeichnet. Gilt für Ereignisse und den gleich gebauten Editor weiterer Renten/Einkünfte (im Bearbeiten-Modus erhalten neue Renten-Zeilen ebenfalls sofort eine ID). Dieselbe Regel im allgemeinen Abgleich von Sheets und Daten-Bearbeiten: Zeilen über `data-row-id`/`data-extra-id`, mehrfach vorkommende Kennungen werden nie übertragen | `writer-lifecycle.test.cjs` mit kleinem echtem DOM (`mini-dom.cjs`) und Eingabeereignissen über die gerenderten Kontrollen: verbindlicher Fall E1 Auto 10.000 / E2 Haus 20.000 → fremd E2 Haus / E3 Reise 5.000, Eingabe 11.000 im alten E1-Feld: **Rohtext unverändert, Haus 20.000, Reise 5.000**, Hinweis nennt „Auto“, 11.000, „entfernt“, kein Übernehmen-Knopf. Weiter: dasselbe Feld fremd geändert (12.000 bleibt bis „Übernehmen“, dann 11.000), anderes Feld fremd geändert (fremdes Jahr 2033 bleibt), Umordnung (Auto bekommt 11.000), fehlende und mehrfache ID (nichts übertragen, beide Eingaben genannt), neue Zeile (gespeicherte ID ab dem Zeichnen, über alle Eingaben dieselbe), keine Wiederverwendung einer gelöschten ID, allgemeiner Abgleich (Sondertilgung x1 bleibt x1, nicht x0) |
| P65 Übernahme verschluckt Ladefehler | Umgesetzt | `onPromote` fing Fehler aus `adopt` ab; eine beim Start vorgemerkte Erstübernahme schrieb danach direkt über `writeLegacy` – über ein fremdes unlesbares Dokument, und bei einem gültigen älteren Dokument ohne Originalsicherung. Jetzt: unlesbares Dokument → Fehler `UNREADABLE`, Zustand `failed`, Sperre frei, Rohtext und alte Schlüssel bytegleich; liegt beim Erhalt der Sperre ein Dokument vor, wird nur dieses übernommen und die vorgemerkte Erstübernahme entfällt (alte Schlüssel bleiben). Ein älteres Schema wird erst bei der nächsten regulären Speicherung geschrieben, davor wird das Original wie bei P37 gesichert. Meldungen für ein unlesbares Dokument eigens formuliert (Leiste, „Erneut versuchen“, Lesemodus) | `writer-lifecycle.test.cjs`: (A) erste Sperrerteilung verzögert, vorher fremdes Schema-999-Dokument: `failed`, Sperre frei, Rohtext bytegleich, `lt-inflation`=2, keine unbehandelte Ablehnung; nach Korrektur `writer`, vorhandener Stand übernommen, nicht ersetzt; Variante Korrektur durch Entfernen: Erstübernahme gelingt, Altschlüssel erst danach entfernt. (B) gültiges Schema-15-Dokument: Original vor der ersten Speicherung bytegleich gesichert, auch nach weiterer Änderung und Neustart. (C) gültiger Start, später unlesbarer Stand vor der Übernahme: `failed`, kein Writer, Sperre frei, Meldung „konnten nicht gelesen werden“, sicherer Neuversuch. (D) gültiges aktuelles Dokument erscheint: übernommen, nicht überschrieben – **Kontrollfall**, besteht auch am Vorher-Stand |

**Nachweise dieser Runde (P64, P65).** *Automatisiert:* `node --test .tests/` **322/322**; `writer-lifecycle.test.cjs`
jetzt 34 Tests (13 neu). Audit `node .scripts/audit-forecast.cjs`: 22 Prüfungen, 0 Abweichungen. Vorher-Stand mit
Prüfsummen unter `/tmp/assets-pre-p64/` (`SHA256SUMS`), Gegenprobe in `/tmp/assets-p64-oldrun/` (aktuelle Tests, vorherige
`index.html`, `data-store.js`, `i18n-en.js`). *Gegenprobe:* 12 der 13 neuen Tests scheitern am Vorher-Stand, und zwar am
beanstandeten Verhalten: P64-Kontrollfall speichert 11.000 bei **Haus** (Skript `/tmp/assets-p64-events-repro.cjs`: vorher
`E2 Haus 11000`, nachher `E2 Haus 20000`); gleiche ID/anderes Feld/Umordnung speichern ohne weitere Nutzeraktion (bei der
Umordnung in die falsche Zeile); die neue Zeile wird ohne gespeicherte ID gezeichnet; eine neue Zeile erhält die gelöschte
Kennung `event-2`; der allgemeine Abgleich trägt x1s 150 bei x0 ein; P65 A und A-Variante werden `writer` statt `failed`
(fremdes Dokument überschrieben), B ersetzt das Schema-15-Original ohne Sicherung, C wird `writer` trotz unlesbarem
Stand. Der Test „fehlende oder mehrdeutige ID“ scheitert am Vorher-Stand am fehlenden Hinweis (dort nur ein Toast, die
erste Eingabe wird nicht genannt). P65 (D) ist ein Kontrollfall und besteht an beiden Ständen.
*Im Browser ausgeführt* (Chrome 155 headless über das DevTools-Protokoll, frisches leeres Profil, nur
`http://127.0.0.1:8124`, isolierte Demo mit synthetischem Ereignis; Eingaben als echte Klicks und Texteingaben per
`Input.dispatchMouseEvent`/`Input.insertText`): B (Leser) hält das Betragsfeld von „Renovierung“ (15.000) fokussiert; A
entfernt Renovierung, legt ein Ereignis an, tippt „Reise“ und 5.000 und schließt; B übernimmt, das alte Feld steht noch da;
Eingabe 11.000 → Rohtext unverändert, Liste zeigt Reise 5.000, Hinweis „„Renovierung“ · Betrag €: deine Eingabe „11.000“ –
nicht übertragen – dieser Eintrag wurde in einem anderen Fenster entfernt“; nach Neuladen weiter Reise 5.000; keine
Konsolenfehler (Skript `/tmp/assets-p64-browser.mjs`, Log `/tmp/assets-p64-browser-final2.log`). P65 wurde nicht im Browser,
sondern mit dem asynchronen Testbrowser geprüft (Simulation). *Nicht geprüft:* Safari macOS/iOS, iPhone-PWA, Firefox,
`file://` in dieser Runde, eine echte neuere App-Version auf demselben Gerät. Port 8123 und produktive `file://`-Tabs nicht
benutzt.

**Anforderungen vom 15.10.2026** (gepusht in `9147d5f`; Schema 18, `data-store.js?v=30`, `i18n-en.js?v=14`,
Cache `verm-v128`):

| Punkt | Änderung | Nachweis |
| --- | --- | --- |
| EM-Rentenprognose | Zurechnungszeit (`disabilityCreditedPoints`) und Zugangsfaktor der EM-Rente (`disabilityAccessFactor`) getrennt von den tatsächlichen Punkten (Schema 18). Altersrente: alte Punkte mit dem Zugangsfaktor der EM-Rente, neue mit dem der Altersrente (§ 77 Abs. 3), Zurechnungszeit nur über den Besitzschutz; Besitzschutz mit Rentenartfaktor 1,0, auch wenn die EM-Rente bis 24 Monate vorher endet (§ 88). Hinzuverdienstgrenze laut Bescheid bei beiden Arten. EM-Rente ohne Zahlbetrag aus Punkten; Abgleich mit dem Bescheid (> 15 % Abweichung → Hinweis). Erklärung zeigt den Rechenweg | `em-conversion.test.cjs` (7 der 10 Tests); geändert mit Begründung: `disability-pension.test.cjs` (Grenze bei voller EM bleibt; Zugangsfaktor der alten Punkte), `retirement-income.test.cjs` (Text Besitzschutz), `data-model.test.cjs` (neue Kennwerte aus dem Vergleich ausgenommen) |
| Infobox Erfolgschance | Höchstens 84 % der Höhe, Text scrollt, Titel und „Schließen“ bleiben; Überschriften, Listen und Tabelle gestaltet; Verweis auf „Prognose → Annahmen“ | Test „Infobox“, Browser (iPhone-Größe) |
| AV-Depot im Vorruhestand | Beiträge und Zulagen nur, solange die Person arbeitet; der Vorsorge-Anteil im Vorruhestand gilt nur noch für Vorsorge-Gruppen. Das Kapital verzinst sich bis zur Auszahlung weiter (geprüft: deterministisch und im Topf eines verknüpften Depots) | Test „Altersvorsorgedepot“; geändert mit Begründung: `life-phases.test.cjs`, `forecast-cashflow.test.cjs` P18b und Audit P18b (verlangten Einzahlungen nach dem Arbeitsende) |
| Phasenbalken je Person | Prognose → Lebensphasen: je Person ein Balken auf derselben Zeitachse, im Alter der Person | Test „Phasenbalken“, Browser |

`node --test .tests/` **348/348**, Audit **22/0**.

**Darstellung, Abstände und Umbrüche (15.10.2026)**, gefunden mit einem Prüfskript im Browser (gestapelte oder
nebeneinanderliegende Kästen ohne Abstand, Beschriftungen, die in ihr Feld laufen) auf allen Seiten, im Bearbeiten-Modus, in
acht Sheets und in allen Einrichtungsschritten, auf 375 px und 1440 px, Deutsch und Englisch:
- „Bearbeiten“ über Haushalt und Altersvorsorge ohne Abstand zum Inhalt → 12 px (`.ds-sec-actions`).
- Info-Symbol ⓘ rutschte allein in eine neue Zeile; lange Wörter („Erwerbsminderung“) liefen unter das Eingabefeld →
  Beschriftung mit Info-Symbol als Flex-Zeile, Silbentrennung für Beschriftungen (`hyphens:auto`, Seite ist `lang="de"`).
- Karten „Ich“ und Beamtenversorgung doppelt eingerückt (Karte in Karte), dadurch zu schmale Beschriftungsspalte → innerer
  Kasten entfällt. Auswahlfeld „Erwerbsminderung“ heißt „EM-Rente“.
- „% p. a.“ brach zwischen „p.“ und „a.“ um → geschütztes Leerzeichen; „Ziel 85 %“ ebenso.
- „Rhythmus“ wurde neben dem Umschalter getrennt → Umschalter auf schmalen Bildschirmen etwas schmaler.
- Rechengrößen: Pfeil rutschte in eine zweite Zeile → Werte bei Platzmangel mit „…“.
- Prognose: Abstand unter dem kleinen Balken „nötig: …“. Die drei Kennzahlen unter dem Statusblock (Vermögen mit 95, Ø Rendite, Schuldenfrei) auf Wunsch entfernt.
- Startseite: Kredit ohne Vermögenswert mit eingerückter Unterzeile → „Kredit ohne Zuordnung“ ohne leeres Prozentfeld.
- Einrichtung: Fortschrittsbalken 4 px über „Zurück“ und × → 12 px. Phasen-Sheet: „Ich“ über dem eigenen Balken.
- Prognose → Lebensphasen: Zeilen „Weitere Personen“ entfernt (doppelt zu Balken und Einkommen); unter jedem Balken ist der
  Rentenbeginn immer beschriftet, bei Claudia stand vorher 65 statt 67.
Nicht beanstandet (bewusst so): Zeilen einer Liste mit Trennlinie, Segmente der Budget-Balken, Rückseiten der Kacheln.

**Altersvorsorgedepot: Kapital Monat für Monat (15.10.2026)**, Anlass: die Erklärung nannte 60.807 € „mit 67“, die eigene
Nachrechnung (195 €/Monat inkl. Zulage, 5 %, 186 Monate Einzahlung, 204 Monate Wachstum) 123.993,72 €.
- Der Hauptunterschied war kein Rechenfehler: die App zeigte nur die heutige Kaufkraft (Inflation 2 % über 33 Jahre).
  Die Erklärung nennt jetzt beides: „Kapital mit 67: 124.098 € … In heutiger Kaufkraft sind das 64.880 €“.
- Echte Ungenauigkeiten, behoben:
  - Beiträge und Zulagen kamen als ein Jahresbetrag am Jahresende; jetzt jeden Monat.
  - Das Arbeitsende wurde je Kalenderjahr zur Jahresmitte geprüft: ein Wechsel ab Juli strich alle Beiträge des Jahres,
    einer bis Juni zählte das ganze Jahr. Jetzt monatsgenau. Damit ist **P42** (REVIEW_2026-10) behoben.
  - Verzinst wurde nur bis zum Beginn des Auszahlungsjahres; jetzt bis zum Monat des Auszahlungsbeginns.
  - Die Planrechnung (verknüpftes Depot als eigener Topf) verteilt Beiträge mit denselben Monatsgewichten.
- Verbleibender Unterschied zur eigenen Rechnung (+104 € nominal): im angebrochenen letzten Jahr (sechs Monate, 900 €
  Eigenbeitrag) ist die gesetzliche Zulage 315 € (50 % auf 360 € + 25 % auf 540 €), nicht anteilig 270 €.
- Tests: `pension-depot.test.cjs` „depot capital: monthly contributions …“ (unabhängige Monatsformel, 186 Beitragsmonate,
  nominal und real auf den Cent) und „depot contributions survive a midyear work stop“ (P42: Juli-Wechsel 900 € / 315 €,
  April 450 € / 202,50 €, Oktober 1.350 € / 427,50 €, anderer Geburtsmonat). Vorher: 2027 `null`, Eigenbeitrag 0.

Dazu Darstellung auf dem iPhone (Rückmeldung mit Bildschirmfotos):
- Mitlaufender „Bearbeiten“ (Daten) und die Leiste „Bearbeiten · Abbrechen · Speichern“ lagen in der installierten App im
  Unschärfe-Verlauf unter der Statusleiste → dort 18 px unterhalb der sicheren Zone, wie die Kopfzeile.
- Lebensphasen-Sheet: über dem Zeitstrahl-Kopf 6 px Lücke, beim Scrollen rückte er 6 px hoch und haftete dann
  (Sticky bleibt im Inhaltsbereich von `.ds-body`) → oberes Padding dort 0, Kopf `top:0`; vor und während des Scrollens
  an derselben Stelle (Browser: 0 px bei Scrollposition 0–200).
- Phasenkarten: „Bedarf 5.000“ und „€“ in getrennten Zeilen. Der Text nutzt jetzt die freie Breite (statt einer
  verschachtelten Spalten-Flexbox, die WebKit zu schmal bemaß), Zahl und Einheit sind fest verbunden („5.000 €“, „50 %“,
  „p. a.“). Geprüft bei 320 px: keine Einheit allein am Zeilenanfang. `household.test.cjs` erwartet dafür geschützte
  Leerzeichen.

`node --test .tests/` **351/351**, Audit **22/0**.

**Persona-Simulation vom 14.10.2026** (`.docs/Onboarding Persona/Ergebnis_Simulation_2026-10-14.md`, 14 Personas,
Befunde A1–A13, B1–B6, C1–C14). Umgesetzt in dieser Runde, kein Schemawechsel (weiter Version 17); Versionen
`data-store.js?v=29`, `i18n-en.js?v=13`, Cache `verm-v127`. Nicht Teil dieser Runde: Folge-Review 3
(REVIEW_2026-10_FOLGE3.md, P69–P72) sowie P66–P68, P56–P62 und P39–P53.

| Befund | Status | Änderung |
| --- | --- | --- |
| A1 Rente nur für die eigene Person, nur gesetzlich | Umgesetzt | Rentenschritt „Wie bist du/seid ihr fürs Alter abgesichert?“ je erwachsener Person: gesetzlich, Beamtenpension, Versorgungswerk, schon laufende Rente, weiß nicht (EINRICHTUNG.md 4.1). Vorschlag „Rente für <Person> ergänzen“, wenn eine weitere Person gar keine Altersvorsorge hat |
| A2 Einnahmen nur als eine Haushaltszeile | Umgesetzt | Budget-Schritt: Nettogehalt je Person (`personId`), „Mieteinnahmen & Co.“ mit `retirementIncome`; Zukunft-Schritt: Ruhestand der Partnerin/des Partners (`workUntilAge`) |
| A3 Gebundene Werte als frei verfügbares „Sonstiges“ | Umgesetzt | Chips „Altersvorsorge“ (`bav`, ab 62) und „Beteiligung“ (`illiquid`); Kategorie Altersvorsorge auf der Daten-Seite wieder wählbar; Hinweise gegen Vertrag **und** Rente (Einrichtung, Altersvorsorge) |
| A4 Pension „ab 60“ still auf 62 angehoben | Umgesetzt (erklärt) | `calcBeamtePension` liefert den gewünschten Beginn (`want`); Ergebniszeile und Erklärung nennen die Anhebung. Einrichtung: Altersgrenze optional, Beginn = eigener Ruhestand. Rechenregel unverändert (Bundesrecht) |
| A5 EM-Rente plus Teilzeitgehalt doppelt | Teilweise (Hinweis) | Ergeben die Punkte schon die EM-Rente (≥ 95 %), fragt die Ergebniszeile nach der Zurechnungszeit. Die Rechnung selbst setzt weiter Punkte **ohne** Zurechnungszeit voraus (Info-Text `drv-points`) |
| A6 Stille Standardrenditen | Umgesetzt (sichtbar) | Abschluss nennt das angenommene Wachstum der gewählten Anlagen. **Werte unverändert** (Bitcoin 15 %, Konto 0 %) – Entscheidung offen, Abschnitt 5 |
| A7 „Alle Daten löschen“ unvollständig | Umgesetzt | `clear({discardBackup:true})` entfernt auch `vermoegen-data-v1-before-update` und legt keine neue Kopie an; dazu die Gerätemerker (letzte Sicherung, Monat erledigt, Erinnerung, Kreditverläufe, Tipps, Chart-Ansicht) |
| A8 Ruhestand in der Vergangenheit ohne Rückfrage | Umgesetzt | Rückfrage „Schon im Ruhestand?“; bei Ja ist die eigene Rente als „Bekomme schon Rente“ vorgewählt |
| A9 Neues Ereignis zählt nicht | Umgesetzt | Standard „Liquide (anteilig) → Extern (Ausgabe)“; bei „Extern → Extern“ ein Hinweis in der Zeile |
| A10 Keine Wartezeitprüfung | Teilweise (Hinweis) | Unter 5 Punkten ohne weitere Beiträge: Hinweis auf fünf Beitragsjahre. Der Betrag wird weiter gerechnet (die Wartezeit lässt sich aus Punkten nicht sicher ableiten) |
| A11 Teilzeitwechsel zu einem Datum | Offen | Braucht ein neues Feld im Datenmodell (Schema 18) – Entscheidung offen, Abschnitt 5 |
| A12 Zinsbindung nur mit Darlehensvertrag | Umgesetzt | „Zinsbindung bis“ (Jahr) steht immer und gilt ohne Vertrag; „in Jahren“ nur, wenn schon erfasst. Die Meldung nennt die fehlenden Felder; Schuldenfrei-Datum ohne Vertrag „ca.“ |
| A13 Weitere Renten brutto oder netto | Umgesetzt | Spalte „Netto €/Monat“, Info mit Abzügen für Betriebsrente und Versorgungswerk; Einrichtung fragt netto |
| B1 Wertpapiere starten mit Stückzahl | Umgesetzt | Alle Anlagen starten in Euro |
| B2 Nur „bisher erreichte Anwartschaft“ | Umgesetzt | Wahl „Bisher erreicht“ / „Künftige Rente“ (Näherung, ohne Gehalt) |
| B3 Sparrate in genau eine Position | Umgesetzt | „Sparrate auf mehrere Anlagen aufteilen“; mehrere Sparpläne aus dem Verlauf-Schritt vorbelegt |
| B4 Kein Vermögensziel | Offen | Neues Feld nötig (Schema 18) – Entscheidung offen |
| B5 Unpassende Vorschläge | Umgesetzt | Rente je Person; Zinsbindung nur beim Immobilienkredit, sonst „Rate und Zins für …“; prognoserelevante Vorschläge zuerst |
| B6 Fortschrittsbalken wächst | Umgesetzt | Feste Kapitel |
| C1 Erster Monat grauer Block | Umgesetzt | „Dein Verlauf beginnt jetzt.“ statt einer gleichförmigen Fläche, Zeitraumleiste ausgeblendet |
| C2 Kredit ohne Verknüpfung dem Auto zugerechnet | Umgesetzt | Eigene Zeile „Kredit · keinem Vermögenswert zugeordnet“; das Auto behält seinen Wert. Ältere Kredite ohne Angabe zur Verknüpfung unverändert (P8) |
| C3 „Vermögen mit 65“ doppeldeutig | Umgesetzt | „Verfügbar mit 65“ (entnehmbar); die Lebensphasen zeigen weiter das Gesamtvermögen |
| C4 Entfallene Phasen als Zeile | Umgesetzt | Kurze Notiz unter der Liste |
| C5 Phasentext ohne Rente in der Phase | Umgesetzt | Vorruhestand nennt „ab 62: … Rente, …“ |
| C6 „Claudia 0 € mit 67“ | Umgesetzt | Zwischensumme ab dem ersten Einkommen der Person („1.422 € ab 69“) |
| C7 Partner-Story bei Alleinstehenden | Umgesetzt | Nur mit weiterer erwachsener Person |
| C8 Minuszeichen uneinheitlich | Umgesetzt | `fmt`/`fmtCompact` mit „−“, nie „−0 €“ |
| C9 Abgeschnittene Texte | Umgesetzt | Positionsnamen und Abschnitts-Unterzeilen zweizeilig, Einkommenszeilen mit Zeitraum darunter, Pfeil am letzten Wort, breitere Auswahl „Fließt in“, kürzerer Text „Ausgeschaltet · unter Einstellungen“ |
| C10 Budget-Chip unerklärt | Umgesetzt | „je Monat zwischen … und …“ bzw. „jeden Monat gleich“ |
| C11 Platzhalter, Jahresauswahl | Umgesetzt | Inflation „2“, Lebenserwartung „85“; Jahresseiten ab dem frühesten Jahr (2026–2037) |
| C12 Altersvorsorge im Lesemodus | Umgesetzt | Leere eigene Karte und leere Überschriften erst beim Bearbeiten; Rentenwert, Ø-Entgelt, BBG eingeklappt unter „Rechengrößen“ |
| C13 „Dein nächster Schritt“ verdeckt die Zahl | Umgesetzt | Erscheint verzögert, verschwindet nach 11 s |
| C14 Text beim Löschen | Umgesetzt | „Tipp: vorher „Sicherung exportieren“ verwenden.“ |

**Danach kompaktere Daten- und Prognose-Seite** (auf deinen Wunsch, gleiche Runde): Altersvorsorge und Haushalt ohne
Bearbeiten als Zusammenfassung, Vorschläge einzeilig, „Prognose & Annahmen“ auf die Prognose-Seite verlegt, Statusblock
mit Kennzahlen, Lebensphasen und Einkommen aufklappbar, einheitliche Einheiten (DATEN.md 3.y, PROGNOSE.md 2). Keine
Änderung an Speicherwegen.

**Nachweise dieser Runde.** `node --test .tests/` **338/338** (davon 3 Tests zur kompakten Darstellung) (neu `persona-fixes.test.cjs`, 16 Tests; geändert
`data-sheets.test.cjs` „pension contracts can be chosen …“, weil A3 genau das Ausblenden der Kategorie beanstandet).
Audit 22 Prüfungen, 0 Abweichungen. Browser (Port 8124, iPhone-Größe dunkel, Desktop 1440 hell): P10 Wagner komplett
durch die neue Einrichtung (Pension ab 62 mit Hinweis, Claudia bis 65, Sparrate auf drei Anlagen, Kredit als eigene
Zeile, erster Monat mit Leerzustand), Jahresauswahl, neues Ereignis. *Nicht geprüft:* Safari/iPhone-PWA, `file://`.

**Schema 16** (`data-store.js`, `VERSION = 16`, liest 1–16): siehe DATA_MODEL.md „Daten aus früheren Versionen
erhalten (Version 16)“. Die Demo-Datei bleibt in dieser Runde auf Schema 15 (keine Demo-Änderungen); die App lädt
sie verlustfrei in Version 16 (`data-model.test.cjs`, Erwartung im Test begründet). Geänderte ältere Tests mit
Begründung: `persons.test.cjs` „Migration 13 → 16“ (kein neuer Posten mehr) und „Migration 14 → 16“ (Teilzeit
bleibt), weil genau dieses Verhalten der Review beanstandet hat.

**Schema 13** (`data-store.js`, `VERSION = 13`, liest 1–13): `retirement.people[].monthlyNetIncome`
(≥ 0, nur weitere Personen), `retirement.incomes[].untilAge` (> `fromAge`),
`retirement.primary.birthMonth` streng 1–12. Ältere Dokumente werden ohne Verlust übernommen;
ungültige Werte lehnt der Import ab, ohne gespeicherte Daten zu ändern. Unvollständige Eingaben in
der App (Ende vor Beginn, negatives Gehalt, Monat 13) speichert der Adapter nicht, statt den
Speichervorgang abzulehnen. Tests: `pension-rules.test.cjs` „Schema 13“ (4).

### 0.1 Was offen bleibt

**Offene Befunde:** P6 (Speicherlimit), P14 (Abschreibung in der Prognose), P15 (Hinweis auf
verwaiste Sparposten in der App), P16 (Median und Asset-Flächen), P33 (`retirementAge: 0` beim Speichern),
die niedrigen Befunde aus Abschnitt 4 (u. a. E2, E3, Importprüfung von Wertebereichen,
Barrierefreiheit, Übersetzungslücken).

**Modellgrenzen** (bewusst nicht modelliert, in Info-Texten genannt):

- Gesetzliche Rente: 35 Jahre Wartezeit für den Beginn ab 63 werden vorausgesetzt, nicht geprüft;
  Altersrente für besonders langjährig Versicherte (§ 38) und für schwerbehinderte Menschen (§ 37)
  fehlt.
- Beamtenversorgung nach Bundesrecht (BeamtVG, BBG); Landesrecht, Dienstunfähigkeit,
  Schwerbehinderung und die amtsunabhängige Mindestversorgung fehlen. Die 45 Jahre für den
  abschlagsfreien Ruhestand mit 65 werden vereinfacht als Dienstjahre gezählt.
- Altersvorsorgedepot (BR-Drs. 206/26): mittelbar Berechtigte (§ 79 Satz 2 EStG n. F.) und die
  Grenze von zwei geförderten Verträgen fehlen; Kindergeld wird bis zum Jahr des 18. Geburtstags
  angenommen. Depots ohne Position im Vermögen zahlen eine deterministisch berechnete Rate.
- Weitere Erwachsene haben denselben Geburtsmonat wie du. Ihre Arbeitszeit wechselt an deinen Phasengrenzen
  (Schema 15), ihr Arbeitsende liegt in ihrem Alter. Lebensphasen und Bedarf richten sich nach dir. Betriebsrenten-
  Sparraten zählen zu dir. Die Prüfung aus P24 nutzt das Budget des laufenden Jahres.
- Kindergeld: 259 € (Stand 2026) in heutiger Kaufkraft, bis 18 oder (Ausbildung) 25. Nicht abgebildet: künftige
  Erhöhungen (z. B. 2027), § 32 Abs. 4 Nr. 1 und 3 (arbeitsuchend, Behinderung), Kinderzuschlag, Kinderfreibetrag,
  Elterngeld. Die Kinderzulage gilt bei dem gewählten Elternteil; die gesetzliche Zuordnung (Mutter, auf Antrag
  Vater, § 85 Abs. 2 EStG) wird nicht geprüft.
- Einmalzahlungen im Budget werden nicht automatisch Prognose-Ereignisse (P24).
- 500 simulierte Läufe: Standardfehler etwa 1,6 Prozentpunkte bei 85 % (Abschnitt 8.2).

**Entscheidungen für dich:** keine offen. Bewusst nicht umgesetzt: eigener Bedarfswechsel je Person, eigene
Spar- und Vorsorgequoten je Person.

---

## 1. Hoch

### P1 – Zwei offene Fenster überschreiben sich gegenseitig (Datenverlust)

- **Status (14.10.2026):** Behoben. Konflikterkennung im Speicher, Übernahme fremder Stände ohne Neuladen; `concurrency.test.cjs`.
- **Was passiert**: Jedes Fenster hält das ganze Dokument im Speicher (`createStore` → `current`)
  und schreibt bei jeder Änderung das **ganze** Dokument zurück. Ein `storage`-Ereignis wird
  nicht ausgewertet.
- **Nachgestellt** mit zwei Stores auf demselben Speicher:
  1. Fenster A setzt die Inflation auf 3 % → danach speichert Fenster B die Sicherheit →
     Inflation wieder 2 %.
  2. Fenster A speichert Tagesgeld 99.999 € → danach ändert Fenster B das Budget → Tagesgeld
     wieder 32.916 €.
- **Wann es dich trifft**:
  - zwei Tabs oder Fenster derselben Herkunft (z. B. Chrome-App und ein zweites Chrome-Fenster
    mit derselben `file://`-Datei, oder Safari-Tab und PWA auf dem iPhone);
  - verschärfend: Jedes sichtbare Fenster schreibt alle 10 s Live-Kurse (`applyLivePrices`).
    Ein zweites, unbeachtet offenes Fenster überschreibt so laufend frische Eingaben.
- **Vorschlag**:
  - `window.addEventListener('storage', …)`: Dokument neu laden, offene Sheets warnen.
  - Vor jedem Schreiben prüfen, ob sich der gespeicherte Stand seit dem Lesen geändert hat
    (Versionszähler im Dokument).

### P2 – Speichern ohne Änderung macht aus Spar-Einzahlungen „Wertänderung“ (V5)

- **Status (14.10.2026):** Behoben. `calcFlows` nutzt den Stückzahl-Zweig nur mit erfasster Stückzahl; Speichern ohne Änderung lässt das Dokument unverändert; `flows.test.cjs`.
- **Was passiert**: `_saveAssetSheet` setzt bei **jedem** Speichern `hasUnits: true` (im Dokument:
  `unit: {name:'Stück', key}`), auch bei Konten und Sachwerten ohne Stückzahl. `addCustomField`
  macht das bei jeder neu angelegten Position. `calcFlows` prüft `hasUnits` **vor** der
  Kategorie `cash`. Ohne erfasste Stückzahl landet jede Veränderung im Topf „Sonstiges“
  statt in der Sparleistung.
- **Nachgestellt** in der Vorschau:
  - Tagesgeld, Girokonto und Bargeld je einmal öffnen und unverändert speichern.
  - Cash-Sparleistung der letzten 12 Monate: **+7.413 € → 0 €**, Sonstiges: 0 → +7.413 €.
  - Gesamt „Gespart“: 56.825 € → 49.412 €.
- Ebenfalls betroffen: Wohnung, Familienauto (gleiche Änderung im Dokument).
- **Wann es dich trifft**: bei jedem Konto, das du je über das Positions-Sheet gespeichert oder in
  der App neu angelegt hast. Deine echte Vermögensentwicklung ist dann vermutlich schon verzerrt.
- **Vorschlag**:
  - In `calcFlows` den Stückzahl-Zweig nur nehmen, wenn in einem der beiden Monate eine
    Stückzahl erfasst ist; sonst nach Kategorie.
  - `hasUnits` nicht pauschal setzen. Bestehende Daten sind dann ohne Migration wieder richtig.

### P3 – Gesetzliche Rente vor der Regelaltersgrenze ohne Abschlag (B2)

- **Status (14.10.2026):** Behoben für §§ 36, 77 SGB VI (Zugangsfaktor, frühestens 63). Wartezeit und §§ 37/38 nicht abgebildet; `pension-rules.test.cjs`.
- „Rente ab 63“ in der Demo ergibt 1.281 € netto ab 63. Richtig wären etwa 1.097 €
  (−0,3 % je Monat, höchstens −14,4 %).
- Ein Zuschlag bei späterem Beginn fehlt ebenso.
- Die Wartezeit von 35 Jahren wird nicht geprüft.
- Details: PROGNOSE.md, B2.

### P4 – Die Einrichtung speichert die hochgerechnete Rente als heutige Punkte (E1)

- **Status (14.10.2026):** Behoben für neue Eingaben (erreichte Anwartschaft + optionales Gehalt); frühere Einträge bleiben unverändert; `setup.test.cjs`.
- Die Einrichtung fragt nach „Höhe Ihrer künftigen Regelaltersrente“. Diese Hochrechnung setzt
  Beiträge bis 67 voraus. Die App speichert den Betrag als **bereits erreichte** Punkte ohne Gehalt.
- Wer früher aufhört, bekommt die fehlenden Jahre trotzdem gutgeschrieben: bei 5 Jahren etwa
  +13 % Rente. Zusammen mit P3 deutlich zu optimistisch.
- Details: EINRICHTUNG.md, E1.

### P5 – Das Gehalt der Partnerin oder des Partners endet mit deinem Arbeitsende

- **Status (14.10.2026):** Behoben. Schema 13 `monthlyNetIncome`, Gehalt zählt nach deinem Arbeitsende bis zum Arbeitsende der Person; `pension-rules.test.cjs`.
- **Was passiert**: Die Lebensphasen gelten für den ganzen Haushalt, gesteuert vom Arbeitsende
  der Hauptperson. Für weitere Personen rechnet die App nur Rentenpunkte bis „Arbeiten bis
  Alter“, nicht deren laufendes Einkommen.
- **In der Demo**:
  - Max hört mit 60 auf (2045). Anna arbeitet laut Eintrag bis 67 (2054) und verdient 1.800 €
    netto im Monat.
  - Die Prognose entnimmt ab 2045 trotzdem den vollen Bedarf von 3.200 € aus dem Vermögen, als
    gäbe es kein Einkommen mehr.
  - Auch die Partner-Story sagt „Ab 2045 ist Schluss mit Arbeit“.
- **Größenordnung**: rund 9 Jahre × 1.800 € ≈ 194.000 € (heutige Kaufkraft) fehlen auf der
  Einnahmenseite. Die Prognose ist für Paare in dieser Lage deutlich zu pessimistisch.
- **Umgehung heute**: keine saubere. „Auch im Ruhestand“ im Budget hat kein Ende,
  „Weitere Renten & Einkünfte“ hat nur einen Beginn.
- **Vorschlag**: Einkommen je Person mit Ende (z. B. „Nettogehalt bis Alter“) oder
  „Weitere Einkünfte“ mit „bis Alter“.

---

## 2. Mittel

| # | Bereich | Befund | Beleg | Status |
| --- | --- | --- | --- | --- |
| P7 | Budget | **Plan des Folgemonats als Standard** (BU1) | Am 14.10. „Plan Nov“. Mit Datum 15.12.2026: Plan Januar **2027**, Ø Vermögensaufbau 2.158 → 2.206 €, Ø Einnahmen 5.375 → 5.465 €, weil die Depots 2027 starten | Behoben |
| P8 | Vermögen | **Kredit in eigener Gruppe** verfälscht die Vermögensentwicklung (V1) | Neue Demo: Garagenkauf 01/2026 für 60.000 € über „Kredit Garagen“ (eigene Gruppe). Immobilien-Details: „Sparleistung +72.231 €“ in 12 Monaten | Behoben |
| P9 | Prognose | **„Sicher möglich ab“ ein Jahr zu früh** (B1) | Neue Demo: 57 J. bei 86,0 %. Mit Renten für Arbeitsende 57: 84,4 % < 85 %. Richtig: 58 | Behoben |
| P10 | Daten | **Zahleneingabe uneinheitlich** | „1.500“ als Stückzahl = **1,5**, als Betrag = 1.500. „0.5“: neue Position → Fehler, bestehende → 0,5. Alter Parser `parseNumberWithThousands`: „1.5“ → 15, „0.5“ → 5 (nur noch in Altpfaden) | Offen |
| P11 | Prognose | **Einkommen im Ruhestand: Summe und Deckung widersprechen den Phasen** | Karte: 2.899 €/Monat, „Deckt 97 %“. Phase 4 und Partner-Story mit 67: 1.668 € Renten. Die Karte summiert auch Renten, die erst mit 69 beginnen (Anna) oder mit 85 enden (Depots) | Behoben |
| P12 | Prognose | **Altersangaben im falschen Bezug** | „Rente Anna ab 67“, „AV-Depot Anna ab 67 bis 85“: Annas Alter, ohne Hinweis. Gerechnet wird ab deinem Alter 69 bzw. bis 87 | Behoben |
| P13 | Prognose | **Ereignis im laufenden Jahr wird ignoriert** | Ereignis „2026, 50.000 €“ am 14.10. eingetragen → fehlt im Plan. Grund: Ereignisse gelten ab Juli des Jahres; danach sind sie „vergangen“. Das Eingabefeld bietet das laufende Jahr trotzdem an | Behoben |
| P14 | Prognose | **Abschreibung einer Position wirkt nicht in der Prognose** | Garagen −0,2 %/Monat (≈ −2,4 % p. a.), die Gruppe Immobilien wächst aber mit +2 % p. a. Die Prognose kennt nur Annahmen je Gruppe | Offen |
| P15 | Budget/Prognose | **Sparposten ohne Ziel in der Prognose** | „Altersvorsorge-Beiträge“ 70 €/Monat zielt auf „Altersvorsorge“, deren Positionen archiviert sind. Budget zählt 895 € Sparen, Prognose nur 825 € (Phasen-Karte). „Sparraten aus Budget übernehmen“ meldet „Nicht zugeordnet: Altersvorsorge-Beiträge“ | Offen |
| P16 | Prognose | **Median-Linie und Asset-Flächen passen nicht zusammen** (B4/B5) | Neue Demo, mit 60: Median 1,32 Mio €, Erwartungspfad 1,16 Mio €; mit 95: 3,37 vs. 2,25 Mio € | Offen |
| P17 | Prognose | **Geburtsmonat wird ignoriert** (B3) | `birthMonth: 1` fest | Behoben |
| P6 | Daten | **Keine Warnung vor dem Speicherlimit** | ≈50 Byte je Position und Monat; 50 Jahre × 100 Positionen = 2,4 MB (≈4,8 MB im Browser, am Limit von `localStorage`). Speichern ist atomar, aber es gibt keine Vorwarnung. Für ≈20 Positionen weit über 100 Jahre Luft. Vorschlag: Größe in den Einstellungen zeigen, ab 3 MB warnen | Offen |

---

## 3. Konflikte durch die überarbeiteten Demo-Daten

| # | Konflikt | Folge | Vorschlag | Status |
| --- | --- | --- | --- | --- |
| DEMO-1 | `demo_backup.js` nicht neu erzeugt | Auf dem Mac (`file://`) lädt „Demo ausprobieren“ die **alte** Demo (34 Monate, ohne Garagen), auf iPhone/Web die neue. Test `demo-file` schlägt fehl | `demo_backup.js` aus der JSON erzeugen (`window.ASSETS_DEMO_BACKUP = …`) | Behoben |
| DEMO-2 | `.scripts/build-demo.cjs` baut die Demo aus `.tests/demo_export.csv` | Ein Lauf des Skripts **überschreibt deine Änderungen** | Ab jetzt die JSON als Quelle: Skript auf „JSON → JS“ umstellen, CSV-Teil entfernen oder umbenennen | Behoben |
| DEMO-3 | Test „bundled JSON demo …“ prüft feste Werte der alten Demo (Schema 12, 34 Monate, 17 Positionen, 3 Kurspositionen, Budget 1.094 € frei …) | Fehlschlag, obwohl die App richtig rechnet | Test auf die neue Demo umstellen (Werte aus dieser Analyse) | Behoben |
| DEMO-4 | Demo ist ein App-Export: Schema 11, `exportedAt`, **Live-Monat 2026-11** enthalten, `lastQuote` mit Zeitstempeln | Wird beim Laden akzeptiert (Version 11 erlaubt). Ab Dezember ist 2026-11 ein gewöhnlicher Monat, die Lücken bis „heute“ füllt nur der Kreditverlauf. Das alte Build-Skript hat den Live-Monat bewusst entfernt | Live-Monat entfernen, Schema 12 setzen, `exportedAt` löschen | Behoben |
| DEMO-5 | Aktien und Ethereum jetzt mit Live-Kurs, die Historie aber mit den alten Demo-Kursen | Künstlicher Sprung im Live-Monat: Apple +35 % (228 → 308 €), Amazon +14 %, Ethereum −32 % (3.300 → 2.237 €). Krypto zeigt „Kursentwicklung ≈ −76 % pro Jahr“ | Oktober-Werte an die gespeicherten Kurse anpassen oder die Positionen in der Demo manuell lassen | Offen (Entscheidung) |
| DEMO-6 | „Rente Privat“ und „Betriebliche Altersvorsorge“ archiviert, Gruppe „Altersvorsorge“ behält Annahmen (Sparrate 70, verfügbar ab 67, Abzug 28 %), Budgetposten bleibt | P15; außerdem verschwinden beide Positionen rückwirkend aus der ganzen Historie (so gewollt) | Budgetposten löschen oder umhängen; Gruppe entfernen | Offen (Entscheidung) |
| DEMO-7 | „Kredit Garagen“ liegt in eigener Gruppe | macht P8 in der Demo sichtbar; Garagen als Immobilie mit Abschreibung (P14) | bewusst lassen (zeigt den Fehler), nach Korrektur von P8 prüfen | Geprüft nach P8 |

---

## 4. Niedrig

### Prognose

- **Ruhestandssuche bei Entnahme in Phase 2** (**behoben** 14.10.2026: lineare Suche, Test
  „search: a later retirement …“): Die binäre Suche setzt voraus, dass die
  Erfolgschance mit späterem Ruhestand steigt. Mit Entnahme im Weiterarbeiten stimmt das nicht:
  bei 1.000 €/Monat 98 % mit 80 und 95 % mit 95. Im Zufallstest ergab sich in 14 von 120
  Extremkonfigurationen „nicht erreichbar“, obwohl der geplante Ruhestand 100 % hatte.
  Mit realistischen Werten (≤ 600 €) unauffällig.
- **Bereich Vermögen aus, Kredite an**: Prognose 0 %, Startseite −284.140 € (B11).
- Weitere aus PROGNOSE.md: frei werdende Kreditrate (B6), nominale Sparraten (B7), Zielkapital
  ohne Ereignisse (B8), Depot-Gruppe (B9), unsichtbare Altelemente (B10), Importprüfung (B12).

### Vermögen

- Auf dem iPhone sind die Kacheln „Bruttovermögen“ und „Verbindlichkeiten“ ausgeblendet
  (CSS Z. ≈946). Der Filter „nur Verbindlichkeiten“ ist dort nicht erreichbar.
- Ein neu angelegter, manuell bewerteter Sachwert zählt im ersten Monat in voller Höhe als
  „Sparleistung“ (Fall „neu gekauft“). Kreditfinanzierte Käufe gleicht nur der Gruppenabgleich
  aus (P8). **Stand 14.10.2026:** bewusst so gelassen und vereinheitlicht: Ein Kauf ist eine
  Umschichtung (aus dem Konto oder über einen Kredit, auch in eigener Gruppe) und damit insgesamt
  neutral. Wird ein Wert erstmals erfasst, den du schon länger besitzt, zählt er weiterhin als
  Einzahlung; dafür gibt es „Im Besitz seit“.
- Aus VERMOEGEN.md: Illiquide minus alle Schulden (V2), Vormonatsvergleich bei Lücken (V3),
  Folgemonat-Konvention (V4).

### Budget

- Hero zeigt „↓ 5.375 € • ↑ 5.375 €“, auch wenn Minimum und Maximum gleich sind.
- Geldfluss: Die rechte Spalte heißt „Ausgaben“, zeigt aber Zielkonten. Summe der Daueraufträge
  (4.300 €) und Plan-Einnahmen (5.375 €) werden nicht abgeglichen.
- Bei 1440 × 900 scrollt die Budget-Seite (1.132 px); `_fitBudget` gleicht nur knappe Überhänge aus.
- Aus BUDGET.md: Ø-Basis (BU2), Schlagwörter (BU3), Geldfluss einstufig (BU4), Zinsanteil (BU5).

### Daten und Speicherung

- **Prüfung beim Import lässt Unsinniges durch** (getestet, alles angenommen):
  - negative Monatswerte und negative Budgetbeträge,
  - Geburtsjahr 0 oder 3000, Geburtsmonat 13 (Monat seit Schema 13 abgelehnt),
  - Inflation −50 %, Sicherheit 150 %, Horizont 20,
  - Ruhestand vor Ansparende, Zins 500 %,
  - Rendite 10¹⁵ (führt zu NaN in der Prognose), negative Schwankung, Abzug 150 %,
  - Depotbeitrag 10⁹, negative Rentenpunkte, Ereignisjahr 1900.

  Strukturfehler (falsche Monate, Dubletten, unbekannte Felder, falsche Referenzen) werden
  zuverlässig abgelehnt. Im Zufallstest (600 Mutationen) kam es zu **keinem** Absturz.
- **Verwaiste Verweise nach dem Archivieren**: Ein Kredit zeigt weiter auf die archivierte
  Garage; die Budget-Rate behält `loanId` des archivierten Kredits und zählt dann voll als
  Fixkosten. Kein Hinweis für den Nutzer.
- **Barrierefreiheit**: 33 Eingabefelder auf der Daten-Seite (u. a. Altersvorsorge) haben kein verknüpftes Label
  (`<label>` ohne `for`). Kleine Tippflächen: Jahrespfeile im Kalender 23 × 31 px,
  „Entfernen“ 61 × 24 px (Apple empfiehlt mindestens 44 × 44 pt).
- **Leistung bei großen Beständen**: Jedes Speichern baut das ganze Dokument neu (Demo 5 ms,
  2,4 MB 73 ms). Das Budget rechnet pro Aufbau rund 60 Monatswerte, und jeder kopiert das
  ganze Dokument (`_automaticLoanRows` → `appStorage.document()`). Bei 2,4 MB dauern zwölf
  Monate 209 ms. Mit der Demo unkritisch (Seite 14 ms).
- Aus DATEN.md: drei Bearbeitungsarten (D1), Zurücksetzen lässt Gerätewerte (D2), tote
  Funktionen (D3), Monatserinnerung nur Woche 1 (D4).

### Einrichtung

- Demo laden setzt die Sprache auf Deutsch zurück (E2).
- „Zukunft planen“ setzt Ansparen = Arbeitsende (E3).
- Stückzahlen in der Einrichtung nutzen denselben Parser wie P10 („1.500“ Stück → 1,5). **Behoben** mit P10.

### Übersetzung (englischer Modus, mit neuer Demo gesucht)

Nicht übersetzt:
- „≈ +30,5 % pro Jahr“ (Asset-Details, Kursentwicklung),
- „Läuft automatisch · 3 Kredite · 2 Abschreibungen“ (nur die Einzahl „Abschreibung“ ist im Wörterbuch),
- „Zuletzt heute / gestern / vor X Tagen“ (Sicherung),
- „quartalsweise (…)“ (BU6).

---

## 5. Offene Fragen an dich

Stand 14.10.2026: Fragen 2, 3 und 5 sind mit der Fehlerbehebung beantwortet (siehe Abschnitt 0),
Fragen 1, 4, 6, 7 und 8 hast du entschieden.

1. **Live-Monat**: Soll „Heute“ intern beim Folgemonat bleiben? Das beträfe nur noch die
   Speicherung; das Budget rechnet seit der Korrektur von P7 aus dem Kalendermonat. Oder soll die
   Konvention umgestellt werden (größerer Umbau, Migration)? **Entschieden 14.10.2026: „Heute“
   bleibt intern der Folgemonat.** Das Budget (`_budgetYM()`) und die Prognose (`latestKey`) leiten
   den Kalendermonat daraus ab; die Konvention wird nicht umgestellt.
2. **Haushalt mit zwei Personen**: Soll die Prognose Arbeitsende und Nettogehalt je Person
   kennen (P5)? Das berührt Phasen, Partner-Story und Sheet. **Umgesetzt** (Nettogehalt je
   weiterer Person bis „Arbeiten bis Alter“; die Phasen bleiben am eigenen Arbeitsende).
3. **Rentenabschlag**: Automatisch aus „Rente ab“ rechnen (P3)? Und soll die Einrichtung nach
   der bereits erreichten Anwartschaft fragen statt nach der Hochrechnung (P4)? **Umgesetzt.**
4. **Stückzahlen mit Punkt** (**entschieden: deutsches Zahlenmodell**, P10): „1.500“ als 1.500 Stück (deutsch) oder als 1,5 (heute)? Ein
   Kompromiss: Punkt mit genau drei Nachkommastellen bei Stückzahlen ≥ 1 als Tausender lesen
   und bei Mehrdeutigkeit nachfragen.
5. **Demo-Daten als Quelle**: Ist deine JSON ab jetzt die maßgebliche Demo? Dann
   Build-Skript, Test und `demo_backup.js` darauf umstellen (DEMO-1 bis DEMO-4). **Umgesetzt.**
6. **Archivierte Altersvorsorge-Positionen**: Gewollt, dass die Gruppe „Altersvorsorge“ in der
   Demo leer ist? Wenn ja, sollte der Budgetposten weg oder auf eine andere Gruppe zeigen (DEMO-6).
   **Entschieden: Posten entfernt.**
7. **Annas Nettogehalt in der Demo**: Die Demo enthält jetzt `monthlyNetIncome: 1800` (wie der
   Budgetposten). Dadurch steigt die Demo-Erfolgschance von 95,8 % auf 100 % und „sicher ab“
   sinkt von 58 auf 52. **Entschieden:** Personenmodell mit Kindern; das Gehalt kommt aus dem Budget mit
   Personenzuordnung, Kinder sind Personen (Abschnitt 0). Arbeitszeit je Phase und Person ist umgesetzt (Schema 15); ein eigener
   Bedarfswechsel je Person ist bewusst nicht eingebaut (Lebensphasen und Bedarf richten sich nach dir).
8. **Kursprünge in der Demo (DEMO-5)**: Historie an die gespeicherten Kurse anpassen oder die
   Aktien und Ethereum in der Demo manuell bewerten? **Entschieden:** Kurse werden historisch
   angewendet, mit Rückfrage vor dem Überschreiben (P30).
9. **Standardrenditen (A6, Persona 14.10.2026)**: Bitcoin und Krypto 15 % als Median-Wachstum bei 50–55 % Schwankung,
   Konto 0 %. Sie sind jetzt sichtbar, aber unverändert. Senken (z. B. Bitcoin 8 %, Konto 1,5 %)? Das ändert die Prognose
   bestehender Nutzer, die keinen eigenen Wert eingetragen haben.
10. **Teilzeitwechsel zu einem Datum (A11) und Vermögensziel (B4)**: beide brauchen neue Felder (Schema 18). Umsetzen?
11. **Planhorizont mehrerer Personen**: „Planen bis“ gilt im Alter der Hauptperson; jüngere Personen enden früher.
    Horizont auf die jüngste Person beziehen (Modelländerung) oder so lassen?

---

## 6. Testprotokoll

| Bereich | Vorgehen | Ergebnis |
| --- | --- | --- |
| Testsuite | `node --test .tests/` | 169/171; 2 Fehlschläge nur Demo (DEMO-1, DEMO-3) |
| Vermögen | Harness: Kennzahlen, Gruppen, Invariante „Summe der Gruppen = Netto“ für alle 35 Monate, Filter, Flows, Abschreibung, Kreditverläufe. Browser: Filter, Asset-Details aller 8 Gruppen, Zeiträume, Vermögensentwicklung (3/6/12/Alle), Live-Popup | Invariante in allen Monaten erfüllt; P2, P8, DEMO-5 |
| Budget | Harness: alle 12 Monate mit Krediten, Sondertilgungen, Depots; Dezember-Datum. Browser: Kacheln, Aufschlüsselung, Geldfluss, Monatswechsel | P7, P15; Sondertilgungsmonate korrekt „Überplant“ |
| Prognose | Harness: Plan, Renten, Simulation, Monte-Carlo, Ziel, Phasen, Suche mit neu berechneten Renten. Browser: Ergebnis-Karte, Phasen, Einkommen, Crosshair, Zeiträume, Log, Partner-Story (10 Folien) | P5, P9, P11–P14, P16 |
| Daten | Browser: 34 Sheets geöffnet und unverändert gespeichert, Vergleich des Dokuments vorher/nachher; Monats-Sheet; alle 5 Bereichsschalter aus/an; Export → Import | P2 (einziger Unterschied: Einheit bei 5 Positionen); Monats-Sheet unverändert; Schalter ändern nur `modules`; Export/Import identisch |
| Zahleneingabe | 24 Eingaben × 6 Parser | P10 |
| Zwei Fenster | zwei Stores auf einem Speicher | P1 |
| Großer Bestand | 10/30/50 Jahre × 30/60/100 Positionen × 3/6/10 Kredite | stabil, P6, Leistung |
| Prognose-Zufallstest | 120 Extremkonfigurationen (Geburtsjahr 1930–2012, Horizont 60–120, Inflation −3 bis 15 %, Bedarf 0–50.000 €) | keine Abstürze, keine NaN, Ziel immer ≥ 0; 14 Fälle nicht monoton (Phase-2-Entnahme) |
| Import-Zufallstest | 600 Mutationen der Demo | 486 abgelehnt, 113 angenommen, 0 Abstürze, 1 NaN (Rendite 10¹⁵) |
| Datum | 14.10., 15.11., 15.12., 31.12.2026, 1.1. und 8.1.2027 | Jahreswechsel korrekt; P7, P13; Monatserinnerung nur 1.–7. |
| Verweise | Garage archiviert, Kredit archiviert, Konto gelöscht | keine Abstürze; verwaiste Verweise |
| Englisch | Seiten, Asset-Details, 25 Sheets, Rentenerklärungen | 4 Lücken |
| Darstellung | iPhone 375 × 812, Mac 1147 × 1378 (dein Fenster), 1440 × 900 | kein horizontales Scrollen; Prognose scrollt im Mac-Fenster (2.350 px), Budget bei 1440 × 900 |
| Leistung (Browser, Demo) | Zeitmessung | Vermögen 22 ms, Budget 14 ms, Prognose neu 128 ms / aus Cache 12 ms, Daten-Seite 14 ms, Speichern 5 ms |
| Barrierefreiheit | Labels, Tippflächen | 33 Felder ohne Label, kleine Flächen |

Die Testskripte liegen nur im Arbeitsverzeichnis dieser Sitzung, nicht im Repo. Sinnvoll
wären als feste Tests: P1, P2, P8, P10, P13 und der Monotonie-/Volatilitätstest der Simulation.

**Fehlerbehebung 14.10.2026** (feste Tests im Repo):

| Bereich | Vorgehen | Ergebnis |
| --- | --- | --- |
| Testsuite | `node --test .tests/` | 218/218; nach P10, P30, P31 und DEMO-5/6: 231/231; nach Personen, Kindern und P32: 246/246; nach Teilzeit: 253/253; Lebensphasen gesammelt: 256/256; Arbeitszeit je Phase und Person: 260/260; Review P34–P38: 283/283; Anmerkungen aus dem Test: 288/288; Folge-Review P54, P55, P63: 309/309; Folge-Review 2 P64, P65: 322/322; Persona-Befunde 14.10. und kompakte Darstellung: 338/338; Anforderungen 15.10. (EM, Depot, Infobox, Balken): 348/348 |
| Audit | `node .scripts/audit-forecast.cjs` | 22 Prüfungen, 0 Abweichungen (vorher 19). Demo: Start 2026-10, Erfolgschance 100 %, sicher ab 52 (ohne Annas Gehalt 95,8 % und 58) |
| Neue Tests | `forecast-cashflow.test.cjs` (21: Geldfluss-Erhaltung, Zeitgrenzen, Depot-Auszahlungen, Suchkandidaten, Haushaltsdefizit), `pension-rules.test.cjs` (14: Renten, Pension, Zulagen, Partnergehalt, Einkommenskarte, Schema 13), `flows.test.cjs` (5), `concurrency.test.cjs` (6), `setup.test.cjs` P4 | alle grün |
| Gegenprobe | dieselben Tests gegen `7504901` (`APP_HTML=…` bzw. Kopie der alten Dateien) | alle Fehlertests scheitern am alten Stand; nur Kontrollfälle bestehen |
| Geänderte Erwartungen | `pension-depot.test.cjs` `sub(100,1)` (§ 86: unter 120 € keine Zulage); `data-model.test.cjs` vergleicht Eingaben mit dem Altmodell und Ergebnisse nur noch zwischen migrierten und frisch importierten Daten (Modelländerung P18–P29); Demo-Test mit Werten deiner Demo | jeweils im Test begründet |
| Browser (Port 8124) | Demo geladen; Prognose, Phasen, Einkommenskarte, Partner-Story, Englisch; alle 17 Positions-/Kredit-Sheets, Monats-Sheet und Phasen-Sheet ohne Änderung gespeichert; Export → Import; zwei Tabs | Dokument unverändert, Export/Import identisch, keine Konsolenfehler; zwei Tabs ohne Neulade-Schleife, Konflikt wird gemeldet |
| Leistung (Node) | Demo | Plan 13 ms, Erwartungspfad 4 ms, 500 Läufe 92–235 ms, Suche 491 ms (zwischengespeichert) |

---

## 7. Empfohlene Reihenfolge

Stand 14.10.2026: Die Schritte 1 bis 6 sind erledigt (Abschnitt 0). Offen bleibt Schritt 7.

1. **P2** (kleine Änderung, wirkt sofort auf deine echten Daten) und **P8** (gleiche Funktion `calcFlows`).
2. **P1** Schutz bei zwei Fenstern.
3. **DEMO-1 bis DEMO-4** aufräumen, damit Tests und Mac-Demo wieder stimmen.
4. **P3, P4, P9**: Rentenrechnung (Abschlag, Anwartschaft, Suche mit neu berechneten Renten).
5. **P7, P13, P11, P12**: Darstellung und Zeitbezug.
6. **P5** (Einkommen je Person), sobald Frage 2 entschieden ist.
7. Rest nach Bedarf.

Die unabhängige Fachprüfung erweitert diese Reihenfolge: Vor einer Verwendung der
Prognose als Grundlage für einen Ruhestandsentscheid sind zusätzlich die Finanzierung
der Beiträge (P18/P24), die Depot-Umwandlung (P19), die Zeitachse (P21/P23),
finanzierte Ereignisse (P22) sowie die Renten-/Förderregeln (P25/P29) zu korrigieren.

---

## 8. Unabhängige fachliche Prüfung der Finanz- und Lebensplanung

### 8.1 Umfang, Verfahren und Ergebnis

Prüfung des lokalen Code-Stands `7504901` am 14.10.2026. Zuerst wurden
`PROGNOSE.md`, `VERMOEGEN.md` und `BUDGET.md` gelesen, anschließend das Hauptskript,
die Speicheradapter, Darlehensmodelle und vorhandenen Tests. Die bisherigen Befunde
bleiben bestehen; die folgenden Einträge ergänzen sie bzw. präzisieren B9.

Die Gegenbeispiele verwenden das echte Hauptskript im bestehenden Node-Harness und
valide Schema-12-Dokumente. Sämtliche Parameteränderungen erfolgen in `MemoryStorage`.
Die Webapp und `demo_backup.json` werden nicht verändert. Keine UI- oder
Produktionsdaten werden für diese Prüfung überschrieben.

**Eignung:** Für Bestandsübersicht und das Erkunden von Annahmen ist die App grundsätzlich
nützlich. Die Prognose ist derzeit jedoch keine ausreichend belastbare Grundlage für
„Ich kann mit X aufhören zu arbeiten“. Es gibt sowohl zu optimistische als auch zu
pessimistische Rechenfehler. Eine konservative Renditeannahme behebt insbesondere keine
erzeugten Geldzuflüsse, doppelt angesetztes Kapital oder falsch zugeordnete Zeiträume.

**Wiederholen:**

```sh
node .scripts/audit-forecast.cjs
node --test .tests/
```

Das Audit liegt unter [audit-forecast.cjs](../.scripts/audit-forecast.cjs). Es vergleicht
die tatsächlichen Ergebnisse mit unabhängigen Sollwerten aus einfachen Geldfluss- und
Zeitrechnungen. Es endet bei Abweichungen bewusst mit **Exit-Code 1** und gibt für jede
Prüfung Soll/Ist als JSON aus. Es gehört nicht zur regulären Testsuite und behauptet
keine erfolgreich abgeschlossene Fehlerbehebung.

Der vorhandene Harness fixiert das Datum auf **08.10.2026**, nicht auf das Datum der
Prüfung. Geboren im Januar 1985 ergibt deshalb `currentAge = 41.75`. Wenn nicht anders
angegeben, gelten in den Gegenbeispielen Rendite, Schwankung, Inflation und
Entnahmeabzug jeweils **0**. Damit entstehen die Unterschiede durch die Fachlogik,
nicht durch zufällige Kurse oder Rundung. Kleine Horizonte dienen zur Isolierung der
Fehler; es sind keine Empfehlungen für einen echten Plan.

Erneute Demo-Prüfung: Startmonat `2026-11`, Erfolgschance **96,0 %**, Suchergebnis **57**
im aktuellen Modell. **Nach der Fehlerbehebung (14.10.2026):** Startmonat `2026-10` (Live-Monat
aus der Demo entfernt), ohne Annas Gehalt 95,8 % und 58, mit Annas Gehalt 100 % und 52. Diese Zahlen sind keine fachliche Freigabe. Insbesondere bleibt
der bereits dokumentierte Kandidatenfehler P9 bestehen; eine höhere Testabdeckung der
Einzelfunktionen belegt nicht die Finanzierbarkeit des gesamten Haushaltsplans.

| Befund | Stufe | Kernaussage | Audit | Status |
| --- | --- | --- | --- | --- |
| P18 | Hoch | Beiträge im Vorruhestand werden ohne Finanzierung gutgeschrieben | P18a/b | Behoben |
| P19 | Hoch | Depotkapital verschwindet zu früh oder wird doppelt berücksichtigt | P19a/b | Behoben |
| P20 | Mittel | Ein gebundener ETF sperrt die gesamte gemischte Gruppe | P20 | Behoben |
| P21 | Hoch | Jahresraster verschiebt Beginn, Einkommen und Verfügbarkeit | P21a–c | Behoben |
| P22 | Hoch | Nicht finanzierter Kauf erzeugt trotzdem volles Zielvermögen | P22 | Behoben |
| P23 | Hoch | Suche nennt Ruhestand am Horizont ohne einen Entnahmezeitraum | P23 | Behoben |
| P24 | Hoch | Ein überplantes Budget verhindert keine unfinanzierten Sparraten | P24 | Behoben |
| P25 | Hoch | Depotzulagen falsch pro Kind, pro Person und unter Mindestbeitrag | P25a–c | Behoben |
| P26 | Mittel | Budgetbeitrag verschwindet schon vor Beginn des Ersatzdepots | P26 | Behoben |
| P27 | Mittel | „Aufgebraucht“ trotz vollständig gedecktem Bedarf und Restvermögen | P27 | Behoben |
| P28 | Mittel | Zukünftiger Monatsstand wird als Startvermögen heute verwendet | P28 | Behoben |
| P29 | Hoch | Beamtenpension ohne Anspruch und mit falschem Abschlagsmaximum | P29a/b | Behoben |

### P18 – Private und Vorsorgebeiträge im Vorruhestand sind nicht finanziert

- **Status (14.10.2026):** Behoben. Beiträge nach dem Arbeitsende sind Umbuchungen aus dem Vermögen; Test und Audit P18a/b.
- **Stufe:** Hoch; echter Geldflussfehler, keine Renditeannahme.
- **Code:** `simulatePlan`, Abschnitt 3, `index.html:9220–9228`; `calcAvDepot`
  und `avdYear`, `index.html:8888–8922`.
- **Ursache:** `p3Saving` und `p3Pension` steuern zusätzliche Einzahlungen. In Phase 3
  ist die Arbeit beendet. Private Einzahlungen werden trotzdem direkt zu `A[j]` addiert,
  ohne sie aus laufendem Überschuss oder anderem Vermögen zu finanzieren. Die eigene
  Einzahlung eines AV-Depots fließt in dessen künftige Auszahlung, wird aber ebenfalls
  nicht vom entnehmbaren Vermögen abgezogen. Der Bedarfsblock enthält diese Beiträge nicht.
- **Reproduktion P18a:** 1.000 € Cash, kein Einkommen, kein Bedarf, Cash-Sparrate
  100 €/Monat, Vorruhestand ab heute, privates Sparen in Phase 3 = 100 %.
  Simulation: **1.300 → 2.500 → 3.700 €** mit Alter 42/43/44. Ohne externe Mittel
  müssen insgesamt 1.000 € erhalten bleiben; ein Transfer innerhalb des Vermögens
  erzeugt keine zusätzlichen 2.700 €.
- **Reproduktion P18b:** 150 €/Monat im AV-Depot, Vorsorge in Phase 3 = 100 %.
  Für 2027 sind 1.800 € Eigenbeitrag vorgesehen; die 1.000 € Cash bleiben trotzdem
  vollständig stehen. Im isolierten Beispiel werden 14.400 € künftige Eigenbeiträge
  plus Förderung in 18.720 € Auszahlungskapital umgerechnet, ohne den Eigenbeitrag
  zu finanzieren. Der Fehlbetrag wird nicht gemeldet.
- **Auswirkung:** Mehr Sparen nach dem Arbeitsende kann die Erfolgschance künstlich
  erhöhen. Nutzer können gleichzeitig ihren gesamten Bedarf entnehmen und neue
  Beiträge leisten, obwohl dieselben Mittel zweimal benötigt werden.
- **Korrektur:** Beiträge aus einem gemeinsamen Haushalts-Cashflow finanzieren.
  Eigenbeiträge aus Überschuss oder einer tatsächlichen Vermögensentnahme bezahlen;
  interne Umschichtungen netto neutral halten. Nur echte Förderungen sind Zuflüsse.
  Finanzierungslücken müssen wie andere Fehlbeträge zum Scheitern führen.

### P19 – Umwandlung von Vorsorgedepots erfolgt für die ganze Gruppe

- **Status (14.10.2026):** Behoben. Ein Topf je verknüpftem Depot, Umwandlung zum eigenen Termin, Auszahlung aus dem simulierten Kapital. Nicht verknüpfte Depots bleiben deterministisch (Modellgrenze unten).
- **Stufe:** Hoch; konkretisiert den vorhandenen Befund B9 um zwei eigenständige Fälle.
- **Code:** `buildPlan`, `avdAt`/`convertAt`, `index.html:9037–9080`;
  `simulatePlan`, Schritt 0, `index.html:9179–9180`.
- **Ursache:** Die Gruppe bekommt den **frühesten** Auszahlungstermin aller verknüpften
  Depotpositionen. Besteht sie nur aus Depotpositionen, wird ihr gesamtes Kapital
  dann auf null gesetzt. Sobald eine normale Position beigemischt ist, wird dagegen
  gar kein Depotkapital entfernt. Die Rentenliste wird unabhängig davon aufgebaut.
- **P19a:** Ein Depot mit 10.000 € zahlt ab 65, eines mit 20.000 € erst ab 70;
  beide in derselben Gruppe, daneben 1.000 € Cash. Erstes Depot zahlt bei 0 % Rendite
  500 €/Jahr. Mit 66 zeigt die App **1.500 €** statt **21.500 €** nach ihrer eigenen
  Umwandlungskonvention: Die 20.000 € des zweiten Depots verschwinden fünf Jahre zu früh.
  Die feste Sammelgruppe „Altersvorsorgedepots“ macht diesen Fall bei mehreren Personen
  oder unterschiedlichen Auszahlungsaltern besonders naheliegend.
- **P19b:** Depot mit 10.000 € plus gewöhnlicher gebundener ETF mit 1.000 € in
  derselben Gruppe, daneben 1.000 € Cash. Mit 66 stehen **12.500 €** statt
  **2.500 €**: Depotkapital bleibt stehen, während bereits 500 € Depotrente zufließen.
- **Korrektur:** Depotkapital positionsweise führen und je Auszahlungstermin umstellen.
  Die Anzeigegruppe darf weder die Kapitalrechte anderer Positionen löschen noch
  die Auszahlungsquelle duplizieren. Regressionen: zwei Depots mit unterschiedlichen
  Terminen, Mischgruppe und der schon in B9 genannte bereits laufende Auszahlplan.
- **Zusätzliche Modellgrenze** (seit 14.10.2026 nur noch für Depots ohne Position im Vermögen:
  verknüpfte Depots zahlen aus dem simulierten Kapital): `calcAvDepot` berechnet die künftige Depotrente einmal
  deterministisch; sie reagiert in den 500 Läufen nicht auf den tatsächlich simulierten
  Depotpfad. Für ein Depot ohne Kapitalgarantie ist diese Rate keine garantierte
  Rente. Kapitalpfad und Auszahlung müssen aus derselben Simulation stammen oder
  diese Modellvereinfachung muss deutlich sichtbar sein.

### P20 – Liquidität hängt von der Gruppierung anderer Positionen ab

- **Status (14.10.2026):** Behoben. Töpfe je Liquiditätsklasse in der Gruppe; Test und Audit P20.
- **Stufe:** Mittel; dokumentierte konservative Gruppenregel mit großer, bisher nicht
  ausreichend sichtbarer Auswirkung auf den konkreten Plan.
- **Code:** `buildPlan`, Zusammenfassung `gm[g].liquidity`, `index.html:9040–9077`.
- **P20:** Liquider ETF 30.000 € und gebundener ETF 1.000 €, gemeinsame Gruppe „ETF“.
  Die Vermögensseite zählt korrekt **30.000 € liquide**. Die Prognose behandelt
  **alle 31.000 € als nicht entnehmbar** und liefert bei 100 €/Monat Bedarf bis 44
  **0 %** statt 100 %. Schon das Hinzufügen einer kleinen gebundenen Position kann
  den bisher entnehmbaren Bestand vollständig sperren.
- **Abgrenzung:** Das ist kein Fehler in `calc`; es ist ein Informationsverlust beim
  Aufbau des Prognosemodells. Der konservative Ansatz ist in den Unterlagen erwähnt,
  erklärt aber nicht ausreichend den Widerspruch zwischen beiden Seiten.
- **Korrektur:** Je Gruppe getrennte Liquiditäts-/Verfügbarkeitstöpfe führen oder
  Positionen individuell simulieren. Falls die Gruppenregel vorläufig bleibt,
  explizit den dadurch gesperrten Betrag und die betroffenen Positionen anzeigen.

### P21 – Jahresraster verwendet widersprüchliche Zeitpunkte

- **Status (14.10.2026):** Behoben. Monatliche Zeitachse; Test und Audit P21a–c.
- **Stufe:** Hoch; sowohl optimistische als auch pessimistische Verzerrungen.
- **Code:** `simulatePlan`, Phasen/Renten über `prevAge`, Entnahmen über `age`,
  `index.html:9173–9271`. Das Phasen-Sheet akzeptiert gebrochene Altersangaben
  (`_phasesDraft`), bildet aber keine passenden Simulationsintervalle.
- **P21a:** 10.000 € Cash, Ruhestand mit **42,5**, Bedarf 1.000 €/Monat.
  Zum Alter 43 stehen weiterhin **10.000 €**, obwohl seit 42,5 sechs Monate Bedarf
  von 6.000 € angefallen sind; richtig sind **4.000 €**. Der Beginn wird bis 43 verschoben.
- **P21b:** 10.000 € Cash, Ruhestand ab heute, Bedarf 1.000 €/Monat, laufendes
  Einkommen von 1.000 €/Monat ab **42,5**. Richtiger Cashpfad bis 42/43/44:
  **7.000 / 1.000 / 1.000 €**. Die App zeigt **7.000 / 0 / 0 €** und meldet
  Fehlbetrag mit 43, weil das Einkommen erst ab dem nächsten Jahresanfang berücksichtigt wird.
- **P21c:** 3.000 € Kapital verfügbar **erst ab 42**, kein anderes Vermögen,
  Vorruhestand heute mit 41,75; bis 42 Bedarf 1.000 €/Monat, danach Bedarf 0.
  Die App entnimmt die 3.000 € schon zur Deckung des Quartals **vor Freigabe** und
  meldet 100 % Erfolg. Tatsächlich fehlt die Überbrückungsliquidität.
- **Weiterer Zusammenhang:** Innerhalb eines Jahres werden zunächst Renditen,
  Sparraten und Ereignisse gebucht, erst danach der gesamte laufende Bedarf.
  Damit wird auch die zwischenzeitliche Zahlungsfähigkeit nicht geprüft.
- **Korrektur:** Ein gemeinsamer Monats-Cashflow oder Intervalle, die an allen
  Phasen-, Renten-, Verfügbarkeits- und Ereignisgrenzen geteilt werden.
  Einkommen und Bedarf zeitanteilig berücksichtigen; Zahlungsfähigkeit muss vor
  einem späteren Zufluss/Freigabetermin bestehen. Nur eine einheitliche Rundung des
  Alters behebt diese drei unterschiedlichen Fehler nicht.

### P22 – Fehlende Finanzierung erzeugt trotzdem den vollen Kaufwert

- **Status (14.10.2026):** Behoben. Nur der finanzierte Teil wird umgebucht; Test und Audit P22.
- **Stufe:** Hoch; verletzt die Erhaltung des Vermögens bei einer internen Transaktion.
- **Code:** `simulatePlan`, Ereignisse, `index.html:9238–9256`.
- **P22:** 100 € Cash, Immobilienwert 0, Ereignis „2027: Kauf für 1.000 € aus
  Cash in Immobilie“. Cash wird geleert; 900 € fehlen. Trotzdem werden der Immobilie
  **volle 1.000 €** gutgeschrieben. Nettovermögen steigt ohne Rendite, Einkommen,
  Förderung oder neu gebuchte Schuld von **100 auf 1.000 €**.
- **Wichtige Einordnung:** Der Lauf wird wegen `shortfallAge` bereits als gescheitert
  gezählt. Die Erfolgschance wird durch diesen Fall nicht fälschlich erfolgreich;
  **Vermögenspfad, Median/Band und spätere Zustände** sind dennoch künstlich erhöht.
- **Korrektur:** Nicht finanzierte Transaktion nicht vollständig ausführen.
  Entweder atomar abbrechen, nur den finanzierten Teil übertragen oder eine
  ausdrücklich modellierte zusätzliche Schuld buchen. Niemals nur das fehlende
  Geld markieren und dann den vollen Zielwert addieren. Test: finanzierte
  Umschichtung erhält Vermögen; unterfinanzierte erzeugt kein zusätzliches Kapital.

### P23 – „Sicher möglich ab“ kann einen Ruhestand ohne Ruhestandsdauer ausweisen

- **Status (14.10.2026):** Behoben. Suche bis Horizont − 1; Test und Audit P23.
- **Stufe:** Hoch; unabhängig vom schon bekannten Renten-Kandidatenfehler P9.
- **Code:** `findRetireAge`, obere Grenze `hi = plan.horizonAge`, `index.html:9325–9337`;
  `simulatePlan` endet beim Horizont und prüft `inRet` am Schrittanfang.
- **P23:** 100 € Cash, keine Sparrate/Einkünfte, Bedarf 1.000 €/Monat,
  Horizont 45. Ruhestand 44: **0 %** Erfolg. Ruhestand 45: **100 %** Erfolg;
  Suchergebnis **45**. Beim letzteren Kandidaten fällt **kein einziger**
  Ruhestandsmonat in die Simulation. Ein nicht finanzierbarer Ruhestand wird so
  als erreichbar ausgewiesen.
- **Korrektur:** Mindestdauer nach jedem Kandidaten sicherstellen oder Kandidaten
  außerhalb des durchgehend geprüften Ruhestandszeitraums als nicht aussagekräftig
  ablehnen. Bei festem Endalter kann kein Ruhestand genau an diesem Endalter als
  finanziell geprüft gelten. Zusätzlich P9 und die bekannte Nichtmonotonie beheben.

### P24 – Die Prognose akzeptiert Sparraten aus einem nicht finanzierbaren Budget

- **Status (14.10.2026):** Behoben. Lücke zwischen Sparraten und Budgetüberschuss wird monatlich entnommen und angezeigt; Einmalzahlungen bleiben offen.
- **Stufe:** Hoch; fehlende fachliche Verbindung zwischen Haushaltsplan und Simulation.
- **Code:** `calcBudgetMonth`, `deriveSavingsFromBudget`, `simulatePlan`.
  `buildPlan` übernimmt Sparannahmen unabhängig von Einnahmen/Ausgaben des Budgets.
- **P24:** Einkommen 1.000 €/Monat, Lebenshaltung 1.200 €, Sparposten Cash 500 €.
  Budget zeigt korrekt **−700 € frei**. Die Prognose mit derselben Sparrate lässt
  1.000 € Start-Cash dagegen bis Alter 43 auf **8.500 €** steigen. Sie modelliert
  weder den laufenden Ausgabenfehlbetrag noch die fehlende Finanzierungsquelle des Sparens.
- **Abgrenzung:** Eine frei gewählte Sparrate als Szenario ist legitim. Sobald die
  App aber Budgetwerte übernimmt oder den Haushaltsplan zusammenhängend erläutert,
  muss eine Überplanung erkennbar sein. Die aktuellen Ergebniswerte gelten trotz
  negativem Budget ohne entsprechende Einschränkung.
- **Korrektur:** Sparfähigkeit und Einkommen phasenweise prüfen. Bei überplantem
  Budget entweder einen tatsächlichen Vermögensabfluss simulieren oder die Prognose
  sichtbar als **nicht finanzierter Wunschplan** markieren. Keine stille Kappung:
  dadurch würde das Budgetdefizit ebenfalls verschwinden. Einmalige Budgetzahlungen
  werden derzeit auch nicht automatisch als Prognoseereignisse berücksichtigt;
  dafür braucht es eine ausdrücklich erklärte Übergabe oder einen Abgleich.

### P25 – Förderrechnung von AV-Depots ist pro Kind und pro Person inkonsistent

- **Status (14.10.2026):** Behoben. Zulagen je Person und Kind, Mindestbeitrag, Bonus einmal; Tests und Audit P25a–c.
- **Stufe:** Hoch; betrifft Budget und hochgerechnete Depotrenten gleichermaßen.
- **Code:** `avdSubsidy`, `avdYear`, `index.html:8859–8893`; getrennte Berechnung
  je Depot in `_automaticDepotRows` und `calcAvDepot`.
- **P25a:** `avdSubsidy(300, 2)` liefert **300 € Kinderzulage**. Der vom Modell
  verwendete Fördersatz von 100 % bis 300 € **je Kind** ergibt **600 €**.
  Ursache: `min(own, 300 * kids)` statt `min(own, 300) * kids`.
- **P25b:** Dieselbe Person, dasselbe Kind, zwei Depots mit jeweils 150 €/Monat:
  Förderung **1.680 €/Jahr**. Ein Depot mit insgesamt 300 €/Monat liefert
  **840 €**. Die Aufteilung eines identischen Eigenbeitrags vervielfacht die
  Grundzulage und dieselbe Kinderzulage; diese hängen an Person/Kind, nicht an
  der Zahl der Depots.
- **P25c:** 100 € Eigenbeitrag im Jahr ohne Kind erzeugen **50 € Grundzulage**,
  obwohl der Mindesteigenbeitrag 120 € beträgt.
- **Quellenabgleich:** Die beschlossene Fassung nennt Förderung je Zulageberechtigtem,
  Kinderzulage je Kind und den Mindestbeitrag. Siehe
  [Gesetzesbeschluss, BR-Drs. 206/26, Artikel 2 Nr. 7–9, PDF-Seiten 7–8](https://dserver.bundestag.de/brd/2026/0206-26.pdf).
  Die Fachkorrektur muss auf dem maßgeblichen Rechtsstand für das Beitragsjahr basieren.
  Die hier überprüften Formeln sind bereits gegenüber den im Tool verwendeten Regeln inkonsistent.
- **Korrektur:** Eigenbeiträge je Person/Jahr zusammenführen, Berechtigung und
  Mindestbeitrag prüfen, jedes Kind eindeutig zuordnen, globale Zulage berechnen
  und danach auf die Verträge verteilen. Derselbe Berufseinsteigerbonus darf
  ebenfalls nicht pro Depot erneut entstehen. Kindergeldberechtigung wird bisher
  pauschal bis zum Jahr des 18. Geburtstags angenommen; Abweichungen müssen als
  Modellannahme erkennbar oder separat erfassbar sein.

### P26 – Ein verknüpfter Budgetposten verschwindet außerhalb des Beitragszeitraums

- **Status (14.10.2026):** Behoben. Ersatz nur mit automatischer Depotzeile im selben Monat; Test und Audit P26.
- **Stufe:** Mittel; echter Budgetfehler beim Wechsel in ein Vorsorgedepot.
- **Code:** `_depotLinked`, `index.html:7018`; Ausschluss im `sparen`-Zweig von
  `calcBudgetMonth`, `index.html:5710–5716`.
- **P26:** Budgetbeitrag 150 €/Monat, mit einem Depot verknüpft, das erst 2027
  beginnt. Für Oktober 2026 zeigt das Budget **0 € Sparen** statt 150 €.
  `_depotLinked` prüft nur, ob das Depot existiert. Die automatischen Zeilen sind
  für 2026 noch leer, der manuelle Posten wurde aber schon ausgeschlossen.
  Dieselbe Lücke entsteht nach dem letzten Beitragsjahr oder bei Beitrag 0.
- **Korrektur:** Einen Posten nur ersetzen, wenn für genau diesen Monat tatsächlich
  eine passende automatische Beitragszeile existiert. Soll die Verknüpfung den
  alten Plan schon davor bewusst beenden, muss das eine explizite Änderung des
  Budgetpostens mit sichtbarem Enddatum sein.

### P27 – Warnung „aufgebraucht“ verwendet eine Liquiditätsschwelle statt Fehlbeträge

- **Status (14.10.2026):** Behoben. „Fehlbetrag mit X“ aus simulierten Fehlbeträgen; Test und Audit P27.
- **Stufe:** Mittel; Widerspruch zwischen Erfolgschance und Lebensphasen-Karte.
- **Code:** `_v2LtPhases`, Suche `mc.avail50 < 1000`, `index.html:10274–10291`.
- **P27:** 500 € Cash, laufendes Einkommen 1.000 €/Monat deckt Bedarf von
  1.000 €/Monat vollständig. Der Cashpfad bleibt **500 / 500 / 500 €**;
  Erfolgschance **100 %**, kein Fehlbetrag. Trotzdem steht „**aufgebraucht mit 42**“.
- **Ursache:** „Unter 1.000 € verfügbar“ ist weder „kein Geld mehr“ noch
  „Bedarf nicht mehr finanzierbar“. Aus einem kleinen Restvermögen wird ein
  vermeintlicher Zeitpunkt des Scheiterns.
- **Korrektur:** Tatsächliche Fehlbeträge bzw. deren Verteilung anzeigen.
  Eine gewünschte Mindestreserve separat als Reserveverletzung definieren,
  nicht als Aufbrauch. Auch ein bewusst vollständig verbrauchtes Kapital am
  Horizont kann bei gedecktem Bedarf ein erfolgreicher Plan sein.

### P28 – Startzeit und Startbestand gehören nicht zwingend zum selben Datum

- **Status (14.10.2026):** Behoben. Startstand bis einschließlich Live-Monat, Hinweis bei altem Stand; Test und Audit P28.
- **Stufe:** Mittel; bei großen zukünftigen Beständen erhebliche Verzerrung.
- **Code:** `buildPlan`, `latestKey`/`currentAge`, `index.html:9029–9036`;
  Kreditzeilen werden ebenfalls über `r.month > latestKey` abgeschnitten.
- **P28:** Erfasster Oktober-2026-Bestand 1.000 €, zusätzlicher zulässiger Snapshot
  Januar 2040 mit 1 Mio €. Die Prognose startet **heute mit 41,75 Jahren und
  1 Mio €**, nicht mit 1.000 €. Die bis 2040 nötige Vermögensbildung wird übersprungen.
- **Zusammenhang mit V4:** Auch der absichtlich verwendete Folgemonat `2026-11`
  braucht eine explizite Live-Markierung/Datumsinterpretation. Er darf nicht als
  allgemeine Regel dienen, beliebige zukünftige Snapshots zu heutigen Werten zu machen.
- **Korrektur:** Gemeinsames `asOf` für Vermögensstand, Restschulden und Zeitachse.
  Entweder am tatsächlichen Stichtag starten oder nur den letzten Stand bis heute
  einschließlich explizit markiertem Live-Stand wählen. Zukunftsstände separat behandeln.
  Bei alten Beständen zusätzlich den veralteten Stichtag zeigen.

### P29 – Beamtenversorgung ist entgegen der bisherigen Dokumentation nicht allgemein korrekt

- **Status (14.10.2026):** Behoben für das Bundesrecht (5 Jahre, ab 63, höchstens 14,4 %, 65/45); Test und Audit P29a/b.
- **Stufe:** Hoch; zwei belegte Fehler bereits im Bundesmodell. Landesrecht ist
  nicht durch eine einzige universelle Formel abgedeckt.
- **Code:** `calcBeamtePension`, `index.html:8980–8996`.
- **P29a:** 4.000 € ruhegehaltfähige Bezüge, vier Dienstjahre, keine weiteren
  Dienstjahre, kein Dienstunfähigkeitsfall: Die Formel liefert **256,004 €/Monat**
  für Beginn mit 63. Der reguläre Anspruch fehlt bei weniger als fünf Dienstjahren;
  § 4 Abs. 1 BeamtVG nennt eine gesonderte Ausnahme für Dienstunfähigkeit.
  [§ 4 BeamtVG](https://www.gesetze-im-internet.de/beamtvg/__4.html).
- Diese Versorgungsbeispiele verwenden abweichend vom Standard Jahrgang 1964,
  heutiges Alter 62,75 und Arbeitsende heute; die eingegebenen Dienstjahre werden
  deshalb nicht um zusätzliche künftige Dienstjahre erhöht.
- **P29b:** Bundesbeamter, Ruhestand auf Antrag mit 63, Regelgrenze 67,
  40 Dienstjahre, 4.000 € Bezüge, Abzüge 0. Die App begrenzt den Abschlag auf
  **10,8 %** und rechnet **2.560,04 €**. Für diesen Antragsfall sind **14,4 %**
  maßgeblich: **2.456,72 €**, Differenz **103,32 €/Monat**.
  Die unterschiedlichen Höchstgrenzen und Ausnahmen stehen in
  [§ 14 Abs. 3 BeamtVG](https://www.gesetze-im-internet.de/beamtvg/BJNR024850976.html).
- **Dokumentationskorrektur:** Die Aussage in `PROGNOSE.md`, B2, dass die
  Beamtenpension ihren Abschlag korrekt berechne, gilt nicht allgemein.
- **Korrektur:** Geltungsbereich, Ruhestandsgrund, Voraussetzungen und ggf.
  Ausnahmen erfassen; für nicht modellierte Fälle keine scheinbar genaue
  Pension ausweisen. Diese Beispielrechnung ist keine vollständige Prüfung
  aller Versorgungs- und Anrechnungsregeln.

### 8.2 Modellgrenzen, die von Rechenfehlern getrennt bleiben müssen

Folgende Punkte sind keine neuen P-Nummern, aber für die Eignung der Ergebnisse wesentlich:

- **500 Läufe sind keine Sicherheitsgarantie.** Bei einem geschätzten Erfolgsanteil
  von 85 % beträgt der reine Monte-Carlo-Standardfehler näherungsweise
  `sqrt(0.85 * 0.15 / 500) = 1,60 Prozentpunkte`; ein approximatives 95-%-Intervall
  hat etwa ±3,1 Prozentpunkte Breite um den Schätzwert. Ein fester Seed macht
  Ergebnisse wiederholbar, beseitigt diese Unsicherheit aber nicht. Modellrisiko
  kommt zusätzlich hinzu. „Sicher ab“ sollte daher als Ergebnis **unter den
  Annahmen des Modells** formuliert werden; nahe Grenzwerten sind mehrere Seeds
  bzw. mehr Läufe und eine Stabilitätsprüfung nötig.
- **Geometrische Rendite und Volatilität:** B5 ist bei der tatsächlich verwendeten
  Lognormalformel mathematisch plausibel, nicht automatisch ein Rechenfehler.
  Hohe Schwankung bei festem Median-Wachstum erhöht den Mittelwert und kann den
  Median eines diversifizierten Summenportfolios erhöhen. Das ersetzt keine
  plausible Kalibrierung der Rendite, Korrelation und Trends.
- **Jahresrendite vor Entnahme** (seit 14.10.2026 erledigt: Das Modell rechnet in Monaten,
  Entnahme vor der Monatsrendite): Monatlicher Bedarf wird erst nach der ganzen
  Jahresrendite entnommen. Die laufend benötigten Beträge bleiben dadurch zu
  lange investiert. Das ist besonders am Beginn des Ruhestands und bei knapper
  Liquidität relevant; ein Monatsreferenzmodell sollte die Abweichung messen.
- **Steuern, Renten und Lebensrisiken:** Pauschale Abzüge auf die gesamte Entnahme,
  real konstante Renten und kein expliziter Hinterbliebenen-/Pflege-/Immobilienkostenplan
  sind Vereinfachungen. Sie sollten als Annahmen erkennbar sein. Ein Szenario ohne
  diese Kosten belegt nicht, dass sie im tatsächlichen Haushaltsplan gedeckt sind.
- **Zielkapital:** B8 bleibt eine grobe Barwertkennzahl ohne alle Ereignisse und
  dynamische Portfolioentwicklung; es ist kein zweiter unabhängiger Beleg für
  die Monte-Carlo-Erfolgschance. Ergebnis-Karte, Ziel und Liquiditätsfehler dürfen
  nicht gegeneinander als vermeintliche Bestätigung verwendet werden.

### 8.3 Empfohlene fachliche Freigabekriterien

Vor einem belastbaren Ruhestandsurteil sollten mindestens folgende Invarianten gelten:

1. Jeder Beitrag und jede Ausgabe hat eine Finanzierungsquelle. Umschichtungen
   erhöhen das Vermögen ausschließlich durch ausdrücklich gebuchte externe Zuflüsse.
2. Ein und dasselbe Depotkapital kann nicht zugleich als verbleibendes Kapital und
   vollständige künftige Auszahlungsquelle angesetzt werden; andere Depots bleiben erhalten.
3. Zahlung, Einkommen, Rentenbeginn und Kapitalfreigabe beziehen sich auf dieselbe
   Zeitachse. Der Plan bleibt auch zwischen jährlichen Anzeigezeitpunkten zahlungsfähig.
4. Alle Suchkandidaten erhalten ihre eigenen Renten-/Beitragsparameter und einen
   tatsächlich geprüften Ruhestandszeitraum; eine nicht monotone Suche liefert kein
   falsches „nicht erreichbar“ oder „sicher ab“.
5. Haushaltsbudget und Sparannahmen sind abgeglichen oder sichtbar als unabhängige
   Wunschannahmen markiert. Förder- und Rentenansprüche werden nicht vervielfacht.
6. Anzeige von Fehlbeträgen, Phasen und Erfolgschance bleibt widerspruchsfrei;
   Modellannahmen und Monte-Carlo-Unsicherheit sind erkennbar.

Die drei erfolgreichen Audit-Kontrollen belegen normale Summierung, regelmäßige
Entnahme ohne Rendite/Inflation und die Erhaltung bei einer vollständig finanzierten
Umschichtung. Die 19 Abweichungen zeigen, warum diese Basisfunktionen allein die
fachliche Freigabe der gesamten Prognose noch nicht rechtfertigen.

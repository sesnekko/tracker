# Datenmodell und Sicherungen

Die App speichert ihren vollständigen Datenbestand als **ein JSON-Dokument** im
Browser (`vermoegen-data-v1`). Eine Sicherung exportiert dieses Dokument als eine
einzige Datei `master_export_YYYY-MM-DD.json` (bis Oktober 2026 `vermoegen_YYYY-MM-DD.json`). Für den Gerätewechsel werden keine
weiteren Dateien benötigt. Die Datei ist UTF-8 und wird lesbar eingerückt.

## Struktur, Version 12

| Feld | Inhalt |
| --- | --- |
| `format`, `schemaVersion`, `currency` | `vermoegen-backup`, `12`, `EUR` |
| `exportedAt` | ISO-Zeitpunkt; nur in exportierten Dateien |
| `groups` | Stabile Gruppen-IDs, Namen, Standardprofil und Prognoseannahmen |
| `positions` | Stabile Positions-IDs, Namen, Kategorien, Liquidität, Bewertung, Kursquelle, Einheit und Archivstatus |
| `snapshots` | Monatsstände (`YYYY-MM`) mit Positions-ID, Wert und optionaler Stückzahl; `estimated: true` kennzeichnet berechnete Monate |
| `accounts` | Konten mit ID, Name und IBAN |
| `budget` | Zwölfmonatiger Plan ohne Jahresbezug, Budgetposten, Daueraufträge und einmalige Zahlungen (`oneTime`); `null`, wenn nicht eingerichtet |
| `loans` | Darlehensparameter, über `positionId` einer Verbindlichkeit zugeordnet |
| `retirement` | Eigene Person (gesetzliche Rente, optional laufende Erwerbsminderungsrente und Beamtenversorgung), weitere Personen mit gesetzlicher Rente (optional laufende Erwerbsminderungsrente), Altersvorsorgedepots und weitere Renteneinkünfte |
| `forecast` | Lebensplanung, Lebensphasen mit Bedarf je Phase, Inflation, Sicherheitsniveau und einmalige Ereignisse |
| `preferences` | Theme, Sprache, fünf Bereichsschalter, Aufklappzustände und Abschluss des Onboardings |

Beispiel einer Verbindung (Auszug, keine vollständige Sicherung):

```json
{
  "groups": [
    {"id": "group-1", "name": "Immobilien", "assumptions": {"returnPercent": 2}}
  ],
  "positions": [
    {"id": "wohnung", "name": "Wohnung", "category": "illiquid", "groupId": "group-1", "archived": false, "custom": false, "ticker": null, "unit": null},
    {"id": "kredit-wohnung", "name": "Wohnungskredit", "category": "liab", "groupId": "group-1", "archived": false, "custom": false, "ticker": null, "unit": null}
  ],
  "snapshots": [
    {"month": "2026-10", "positions": [{"positionId": "wohnung", "value": 315000}, {"positionId": "kredit-wohnung", "value": 202000}]}
  ],
  "loans": [
    {"positionId": "kredit-wohnung", "interestPercent": 3.1, "monthlyPayment": 1550, "fixedUntilYear": 2033}
  ]
}
```

## Regeln

- Namen dienen der Anzeige. Gruppen-, Positions-, Konto-, Budget-, Personen- und
  Ereignis-IDs bleiben bei Umbenennungen erhalten. Auch das Standardprofil einer
  Gruppe bleibt erhalten; eine Umbenennung ändert keine Standardrenditen. Prognoseereignisse und
  Budget-Sparziele verweisen auf Gruppen-IDs, Daueraufträge auf Konto-IDs oder
  ausdrücklich freie Bezeichnungen.
- Kategorie-Summen, Nettovermögen, Sparquote, Rentenhochrechnungen und
  Simulationsergebnisse werden abgeleitet und nicht redundant gespeichert.
- Geldbeträge sind Zahlen in **EUR**, keine formatierten Texte. Dezimalstellen und
  Stückzahlen werden ohne zusätzliche Rundung übertragen. Geld und Stückzahlen
  haben getrennte Felder. Prozentwerte sind Prozentpunkte: `3.1` bedeutet 3,1 %.
- Ein nicht gesetzter Prognoseparameter fehlt im Objekt und verwendet den
  Standardwert dieser Modellversion. `0` bleibt ein ausdrücklich gesetzter Wert.
  Historische CSV-Dateien enthalten teils keine expliziten Nullpositionen; diese
  werden für die bisherigen Berechnungen weiterhin als null Euro ausgewertet.
- Monatsstände und Zukunftsereignisse sind getrennt. Das bisherige Verhalten des
  Live-Monats bleibt erhalten: Der Folgemonat wird aus dem neuesten Stand erzeugt
  und mit Live-Kursen bewertet. Es wird kein neues Buchungs- oder Transaktionsmodell
  eingeführt.
- Das manuelle Budget bleibt ein wiederkehrender Plan mit genau zwölf Werten,
  Januar bis Dezember. Vollständige Darlehensverträge ergänzen für das ausgewählte
  Kalenderjahr die tatsächlichen monatlichen Zinsen, Tilgungen und Sondertilgungen.
  Gleichnamige manuelle Kreditposten werden bei der Berechnung ersetzt, nicht gelöscht.
- Entfernte Positionen werden archiviert; historische Werte bleiben in der
  Sicherung, fließen aber nicht mehr in die aktuellen Summen ein.
- Alle Bereiche bleiben in der Datei, auch wenn ihre Anzeige/Berechnung über
  einen Schalter ausgeschaltet ist. Flüchtige Interaktionen wie Chart-Hover
  werden nicht als Einstellungen gespeichert.

## Migration und Import

`data-store.js` enthält die Strukturprüfung, Migration und Speicherzugriffe.
Beim ersten Start werden die bisherigen Browser-Schlüssel zusammengeführt.
Erst nach erfolgreicher Prüfung und Speicherung werden die alten App-Schlüssel
entfernt. Andere Daten des Browsers bleiben unberührt. Bei beschädigten Daten oder
Speicherfehlern wird die App angehalten; der ursprüngliche Speicher lässt sich
über den Wiederherstellungs-Download sichern.

JSON-Sicherungen werden vollständig geprüft und nach einer Vorschau mit
Datum, Monatsständen und Positionsanzahl **ersetzend** importiert. Der Import
übernimmt auch die Einstellungen und lädt die App anschließend neu.
Nicht unterstützte Formatversionen, unbekannte Felder, falsche Datentypen,
doppelte IDs, ungültige Monate und fehlende Verweise werden abgewiesen.
Es gibt keine automatische Zusammenführung verschiedener Gerätebestände.

Alte CSV-Dateien bleiben importierbar. Ihre bisherige Zusammenführungslogik bleibt
erhalten, wird aber als eine Transaktion gespeichert: Ungültige CSV-Dateien führen
zu keinem teilweisen Import. Namensheuristiken werden bei der Altformatübernahme
in explizite Budgetarten und Verweise übersetzt. Die bestehenden Berechnungs- und
Formularfunktionen erhalten über Adapter ihre bisherigen Objektformen; diese
Adapter sind kein zweiter persistenter Datenbestand.

Schemaänderungen oder Änderungen der Bedeutung von Standardwerten erfordern
eine neue `schemaVersion` und eine explizite Migration. Unbekannte zukünftige
Versionen dürfen nicht stillschweigend gelesen oder heruntergestuft werden.

## Prüfung und Demo

```sh
node --test .tests/data-model.test.cjs
node .scripts/build-demo.cjs
```

Die Tests vergleichen Monatswerte, Budget und Monte-Carlo-Ergebnisse mit dem
Stand vor der Migration (`1f17a25`). Sie prüfen außerdem Gerätewechsel,
Umbenennungen, archivierte Daten, ungültige Importe, Speicherfehler und die
tatsächlichen Export-/Importfunktionen. `demo_backup.json` ist die neue Demo für
die App; `.tests/demo_export.csv` bleibt eine Test- und Kompatibilitätsvorlage.

Die JSON-Demo zeigt einen fiktiven Haushalt mit 34 Monatsständen von Januar 2024
bis Oktober 2026: Konten, zwei ETFs, die Einzelaktien Apple, Amazon und Nestlé,
getrennte Bitcoin- und Ethereum-Positionen, physisches Gold, Altersvorsorge, Wohnung
und Familienauto. Das Nettovermögen wächst von rund 190.000 € auf 430.000 €. Die
Kurse folgen erfundenen, aber realistisch schwankenden Verläufen mit festem
Zufallsstartwert (gemeinsame Korrekturen, Krypto-Rücksetzer), sodass jeder Build gleich ist.
Immobilien- und Autokredit sind mit ihren Assets verknüpft. Restschulden stammen
aus vollständigen Annuitätenverträgen einschließlich datierter Sondertilgungen.
Budget, Daueraufträge, Rentenangaben und Prognoseereignisse sind enthalten; die
automatischen Kreditraten werden nicht zusätzlich als manuelle Budgetposten gezählt.
Alle Bestände, Kurse und Annahmen sind erfundene Beispiele. Die Bewertung bleibt
manuell, damit die Demo offline funktioniert und Live-Kurse keine Beispielwerte
ersetzen. Kursquellen für ETFs, Bitcoin und Ethereum sind als Asset-Angaben
hinterlegt. Konten tragen den Zusatz „Demo“ und enthalten keine IBAN.

## Darlehen und Asset-Verknüpfung

Ein Darlehen verweist mit `positionId` auf seine Verbindlichkeit und optional mit
`linkedAssetId` auf einen Vermögenswert. `null` bedeutet ausdrücklich ohne
Verknüpfung. Bei alten Krediten ohne dieses Feld bleibt die bisherige
Gruppenzuordnung erhalten. Umbenennungen ändern die IDs nicht; Verweise auf
archivierte Vermögenswerte bleiben in der Sicherung erhalten.

```json
{
  "positionId": "kredit-wohnung",
  "linkedAssetId": "wohnung",
  "principalAmount": 100000,
  "interestPercent": 4,
  "initialRepaymentPercent": 2,
  "firstPaymentMonth": "2026-01",
  "fixedInterestYears": 10,
  "monthlyPayment": 500,
  "extraPayments": [
    {"id": "sonder-1", "month": "2026-12", "amount": 5000}
  ]
}
```

Die anfängliche Monatsrate ist Darlehensbetrag × (Sollzins + anfängliche Tilgung)
/ 1200. Eine manuell geänderte Rate passt den anfänglichen Tilgungssatz an.
Die Berechnung in `loan-model.js` verzinst die Restschuld monatlich mit Sollzins
/ 12, bucht die Rate und anschließend Sondertilgungen zum Monatsende und rundet
auf Cent. Die letzte Rate und Sondertilgungen werden auf die offene Schuld
begrenzt. Die erste Fälligkeit kennzeichnet den ersten Zahlungsmonat; vor diesem
Monat zeigt das Modell keine Darlehensschuld. Tagesgenaue Auszahlung und
Rumpfmonate werden nicht modelliert.

Die Sollzinsbindung wird als Dauer in Jahren gespeichert (auch halbe Jahre sind
möglich). Ein optionaler `followUpInterestPercent` gilt ab dem Folgemonat nach
Ablauf. Ohne Anschlusszins bleibt der Sollzins für die Planung unverändert;
die UI nennt diese Annahme im Tilgungsplan. Der Berechnungshorizont beträgt
maximal 100 Jahre, ein nicht getilgter Rest wird ausdrücklich ausgewiesen.
Die Annuitätenberechnung folgt der Beschreibung im
[Tilgungsrechner der Sparkasse](https://www.sparkasse.de/rechner/tilgungsrechner.html).

Bei vollständigen Darlehensdaten (`principalAmount`, `firstPaymentMonth`,
Sollzins und eine positive Rate bzw. anfängliche Tilgung) werden die
Monatsendschulden für die Vermögensanzeige aus dem Vertrag abgeleitet. Vorhandene
Snapshots bleiben erhalten; ihre manuellen Restschulden werden für dieses
Darlehen in der Anzeige durch berechnete Werte ersetzt. Budget und Prognose
verwenden denselben Monatsplan. Alte Kredite mit aktueller Restschuld und
`monthlyPayment` bleiben unverändert nutzbar, ebenso ihre bisherigen Felder
`fixedUntilYear` und `annualExtraPayment`.

Alle Darlehensangaben und einzelnen Sondertilgungen werden weiterhin in derselben
JSON-Datei gesichert. Die neuen Felder sind optional; bisherige Sicherungen
bleiben importierbar.

## Geführter Einstieg

Der Startbildschirm bietet „Geführt einrichten“, „Bestehende Daten laden“ und
„Mit Demo-Daten ausprobieren“. „Geführt einrichten“ startet die Einrichtung: eine
Frage je Screen, Schätzwerte genügen, jeder Schritt lässt sich überspringen.

1. Schwerpunkte: Vermögen (immer), optional Monatsbudget und Zukunft & Ruhestand.
   Nicht gewählte Bereiche bleiben ausgeschaltet.
2. Vermögenswerte: Antippen einer Art (Girokonto, ETF, Immobilie …) legt eine
   Zeile mit Name und Wert an. Bei Bitcoin, Gold, ETF, Aktie und Krypto lässt sich
   zwischen Euro und Stückzahl (BTC, Unzen, Stück) wechseln; Standard ist die
   Stückzahl. Bei Stückzahl lädt die App den aktuellen Kurs (bei Wertpapieren nach
   der Auswahl über die Suche, die Zeile übernimmt dann den Namen des Wertpapiers)
   und speichert Kursquelle, Stückzahl und Wert.
2a. Bisheriger Verlauf (nur bei ETF, Aktie, Bitcoin, Krypto und Gold, optional):
   Wertpapier per Name oder ISIN suchen (Yahoo-Suche, deutscher Handelsplatz
   bevorzugt, höchstens drei Treffer; Bitcoin und Gold ohne Suche), „Seit“ Monat
   und Jahr, „Einmal“ oder „Mit Sparplan“ samt Monatsbetrag. Eine gewählte
   Kursquelle stellt die Position auf automatische Bewertung (Stückzahl = Wert ÷
   aktueller Kurs). Mit „Seit“ lädt die App Monatsschlusskurse (Yahoo, Fremdwährung
   mit dem Monatskurs in EUR) und rechnet den Stückzahl-Verlauf zurück: einmal
   gekauft = gleiche Stückzahl; Sparplan = jeden Monat Betrag ÷ Kurs, der Rest bis
   zum heutigen Bestand als Einmalkauf am Anfang, ein zu hoher Sparplan wird auf den
   heutigen Bestand verkleinert. Vor dem Kauf ist die Position nicht im Bestand.
   Alle übrigen Positionen (Konten, Sachwerte, Schulden) stehen in diesen Monaten
   mit ihrem heutigen Wert. Die Monate tragen `estimated: true`, die Daten-Seite
   zeigt „Aus Kursverlauf berechnet“; „Sichern“ im Monat bestätigt die Werte und
   entfernt die Kennzeichnung. Scheitert ein Kursabruf, beginnt der Verlauf dieser
   Position heute. Sparpläne werden im Budget als „Sparen & Anlegen“ vorgeschlagen.
3. Schulden: Nein/Ja; je Schuld Restschuld, optional Monatsrate und Zins.
   Immobilien- bzw. Autokredit werden mit der einzigen Immobilie bzw. dem einzigen
   Auto verknüpft, sonst ausdrücklich ohne Verknüpfung (`linkedAssetId: null`).
4. Budget (falls gewählt): Einnahmen, Fixkosten, Lebenshaltung, Sparen und die
   Zielanlage des Gesparten. Kreditraten kommen aus Schritt 3 als Posten der Art
   `loanPayment` und werden in Zins und Tilgung aufgeteilt. Die Sparrate wird
   zugleich als `monthlySaving` der Zielgruppe gespeichert.
5. Zukunft (falls gewählt): Geburtsjahr, Ruhestandsalter (zugleich „Sparen bis“)
   und Bedarf; der Bedarf wird aus Fixkosten und Lebenshaltung vorgeschlagen.
6. Rente: Betrag laut Renteninformation (brutto/Monat), gespeichert als
   Rentenpunkte (Betrag / Rentenwert). „Weiß ich nicht“ lässt die Altersvorsorge aus.

Alles wird am Ende als ein Dokument geprüft und gespeichert
(`buildSetupDocument`); bei einem Fehler bleibt der Speicher unverändert. Positionen
derselben Art teilen sich eine Gruppe (Cash, ETF, Aktien, Bitcoin, Krypto,
Edelmetalle, Immobilien, Fahrzeuge …); jede Schuld erhält eine eigene Gruppe. Der aktuelle Monat und der
Live-Monat bekommen denselben Stand, damit der Chart sofort eine Linie zeigt.
Die Einrichtung ersetzt nie vorhandene Daten.

Danach zeigt die Daten-Seite „Nach und nach ergänzen“: höchstens drei passende
Vorschläge (z. B. Budget einrichten, Zukunft planen, Rente ergänzen, Live-Kurs
verbinden, Budget aufteilen, Kredit genauer erfassen, erste Sicherung). Budget,
Zukunft und Rente öffnen dieselben Schritte als kurze Einzel-Assistenten, die nur
diesen Bereich ergänzen; „Abbrechen“ speichert nichts. Erledigte Vorschläge
verschwinden, ausgeblendete werden je Gerät unter `vermoegen-tips-dismissed`
gemerkt (nicht Teil der Sicherung). Beim Verbinden eines Live-Kurses schlägt die
App nach der Kursprüfung die Stückzahl aus dem bisherigen Wert vor.

Auf der Daten-Seite unter „Hilfe“ lässt sich der Rundgang „App kennenlernen“ starten. Er zeigt
fünf kurze Screens zu Vermögen, Budget, Prognose, Datenpflege und Sicherung. Auf
schmalen Bildschirmen (iPhone) läuft er wie Stories ab: Segmente oben laufen ab
und blättern weiter, Tippen rechts/links blättert, Halten pausiert, nach unten
wischen schließt. Ab Tablet-Breite gibt es Knöpfe. Im Rundgang werden keine Werte
erfasst; bei leerem Bestand bietet sein letzter Screen „Jetzt einrichten“.
Vermögenswerte und Verbindlichkeiten sind feste, eigenständig schaltbare Bereiche
auf der Daten-Seite. Neue Verbindlichkeiten werden direkt in ihrem eigenen
Bereich angelegt; die Auswahl für Vermögenswerte enthält ausschließlich Anlagen.
Auf der Daten-Seite stehen Positionen als Liste; Tippen öffnet ein Sheet nur für
diese Position (Wert, Stückzahl, Angaben, Entfernen) mit eigenem „Sichern“.
„Aktualisieren“ erfasst alle Werte eines Monats in einer Liste. Ein Sheet schreibt
einen Monatsstand nur, wenn sich ein Wert ändert; fehlt der Monat, werden die übrigen
Werte aus dem Vormonat übernommen. Während ein Sheet offen ist, speichern
Hintergrund-Kurse nichts. Beim Anlegen kann optional „Im Besitz seit“ (MM/JJ)
angegeben werden: Der Wert wird dann für jeden Monat ab diesem Zeitpunkt
gespeichert. Vorhandene Monate erhalten nur die neue Position, Lücken übernehmen
den Vormonat, vor dem ersten erfassten Monat wird nichts anderes ergänzt.
Der Zeitpunkt der letzten Sicherung liegt je Gerät unter
`vermoegen-last-backup` und ist kein Teil der Sicherung.
`preferences.onboardingCompleted` verhindert einen erneuten automatischen
Startbildschirm nach bewusstem Überspringen. Das optionale Feld bleibt mit
bisherigen JSON-Sicherungen kompatibel.

## Asset-Angaben und Live-Kurse (Version 2)

Asset-Angaben gehören in `positions`. Monatswerte stehen weiterhin getrennt in
`snapshots.positions` (`quantity` und `value` in EUR). Stückzahlen sind bei
manueller Bewertung optional und dürfen Bruchteile enthalten. Bitcoin und
Krypto sind eigenständige Kategorien: `bitcoin` bzw. `crypto`. Weitere Kategorien:
`cash`, `etf`, `stock`, `metal`, `realEstate`, `vehicle`, `illiquid` (sonstige
Sachwerte), `bav` und `other`. `liab` bleibt für Verbindlichkeiten reserviert.

Zusätzliche optionale Asset-Angaben:

```json
{
  "liquidity": "liquid",
  "valuation": "market",
  "instrument": {
    "provider": "yahoo",
    "symbol": "IUSQ.DE",
    "exchange": "XETRA",
    "currency": "EUR",
    "name": "Name aus der Kursquelle"
  },
  "lastQuote": {
    "priceEUR": 100.25,
    "price": 100.25,
    "currency": "EUR",
    "asOf": "2026-10-08T09:00:00Z",
    "fetchedAt": "2026-10-08T10:00:00Z"
  }
}
```

`liquidity` ist unabhängig von der Kategorie (`liquid` / `illiquid`). Sie
steuert Vermögenssummen und Filter. Neu angelegte Assets kommen in die Gruppe
ihrer Art (z. B. „ETF“) und bekommen keine erfundene Sparrate; die Sparrate einer
bestehenden Gruppe bleibt erhalten. Die Vermögensübersicht zeigt Gruppen mit nur
einer Position und ohne Art-Namen (z. B. das frühere „Sonstiges“) mit dem Namen der
Position. Die Prognose berücksichtigt die
Verfügbarkeit der Gruppe; bei alten Gruppen mit gemischten Assets gilt eine
illiquide Einstufung konservativ für die gesamte Gruppe. Gebundene Altersvorsorge
bleibt über das Verfügbarkeitsalter planbar.

`valuation` ist `manual` oder `market`. Neue Kursquellen müssen vor dem
Übernehmen geprüft und durch Bestätigung des angezeigten Instruments ausgewählt
werden. Automatische Bewertung erfordert eine Stückzahl. Änderungen an Ticker
oder Anbieter benötigen eine erneute Prüfung. Die Bezeichnung und monatlichen
Bestände werden nie an Kursdienste übertragen; die Abfrage enthält nur den Ticker
bzw. das Handelspaar. Es gibt keine automatische Ableitung eines Yahoo-Tickers
aus einer WKN oder ISIN. Vorhandene Ticker aus alten Sicherungen bleiben erhalten.

Wertpapiere nutzen den bisherigen Yahoo-Abruf mit explizitem Börsenticker.
Fremdwährungen werden in EUR umgerechnet, GBp/GBX zuerst in GBP. Kryptowerte
nutzen EUR-Paare der öffentlichen
[Kraken-Ticker-API](https://docs.kraken.com/api-reference/market-data/get-ticker-information);
Bitcoin nutzt `XBTEUR`. Yahoo liefert den Marktzeitpunkt, Kraken den letzten
Handelspreis ohne dessen Zeitpunkt: dort entspricht `asOf` dem Abrufzeitpunkt.
Die UI unterscheidet diese Angaben bei der Kursprüfung. Die APIs können
ausfallen oder Kurse verzögert liefern. Bei Ausfall bleiben letzter Kurs und
Wert erhalten, die Kursübersicht nennt den fehlgeschlagenen Abruf samt letztem
Zeitpunkt. Nur der Live-Monat wird im Hintergrund neu bewertet. Historische
Monatsstände werden durch neue Kurse nicht verändert. Eine neue Position wird
bewusst mit dem beim Anlegen geprüften Kurs im ausgewählten Monat erfasst.

Version-1-Sicherungen und gespeicherte Bestände werden beim Einlesen explizit
auf Version 2 übernommen. Alte Kategorien, Liquiditätsdefaults und Kursmodi
bleiben dabei erhalten: ohne explizite Angaben gelten die bisherigen
Kategorie-Vorgaben und Ticker plus Einheit als automatische Bewertung. Die
Adapter erhalten diese Semantik bei weiteren Änderungen. Alle Angaben und
letzten Kurse werden in derselben einzelnen JSON-Sicherung übertragen.

## Automatische Kredithistorie

`loan-history.js` ergänzt den sichtbaren Monatsverlauf ab der ersten Fälligkeit
bis zum aktuellen bzw. letzten vorhandenen Monat (maximal 100 Jahre). Das
Nettovermögen berücksichtigt die Monatsendschuld aus dem Annuitätenplan; das
verknüpfte Asset zeigt seinen Bruttowert minus seine verknüpften Kredite.
Mehrere Kredite und Sondertilgungen werden gemeinsam berücksichtigt.
Asset-Details enthalten die verknüpften Darlehen, auch bei negativem Eigenkapital.

Monate ohne gespeicherten Stand werden aus dem Vertrag berechnet. Ein fehlender
Wert des verknüpften Assets wird mit dem letzten zuvor erfassten Wert
fortgeschrieben; vor dessen erster Erfassung wird der erste bekannte Wert
rückwirkend verwendet. Diese Asset-Werte sind ausdrücklich Schätzungen, keine
rekonstruierten Marktpreise. Beobachtete Werte, explizite Nullwerte und
Stückzahlen bleiben erhalten. Vor dem ersten erfassten Portfolio-Monat wird nur
der verknüpfte Asset-Wert ergänzt, kein unbekannter früherer Kontostand erfunden.
Der Chart und die Data-Seite kennzeichnen berechnete Monatsstände.

Die Ergänzungen sind eine berechnete Ansicht (`_loanHistory` nur im UI-Adapter),
kein zweiter Datenbestand. Normale Speichervorgänge erzeugen keine zusätzlichen
historischen Snapshots und schreiben geschätzte Asset-Werte nicht als
Beobachtungen fest. Nutzer können einen berechneten Monat bewusst bearbeiten
und mit „Sichern“ als eigenen Monatsstand erfassen. Der Live-Monat bleibt wie
bisher ein beschreibbarer Snapshot für Kurse und neue Angaben. Die Historie
entsteht nach einer JSON-Übertragung erneut aus denselben Vertragsdaten und
erfassten Monatswerten; weiterhin genügt eine einzelne Datei.

## Abschreibung (Version 3)

Nicht liquide Vermögenswerte mit selbst eingetragenem Wert können optional
automatisch abgeschrieben werden. Die Angaben stehen an der Position:

```json
{
  "depreciation": {
    "method": "percent",
    "amount": 15,
    "interval": "year",
    "startMonth": "2024-03",
    "startValue": 32000
  }
}
```

`method` ist `percent` (Prozent vom jeweiligen Restwert) oder `absolute`
(fester Betrag in EUR je Zeitraum), `interval` ist `month`, `quarter` oder `year`.
`startMonth` ist der Kaufmonat, `startValue` der Kaufwert. Im Kaufmonat gilt der
Kaufwert; am Ende jedes vollen Zeitraums sinkt der Wert, nie unter null. Prozent
höchstens 100.

Die Abschreibung bestimmt den Wert: Ab dem Kaufmonat wird jeder Monat aus dem Plan
berechnet, davor zählt die Position null. Eigene Monatswerte dieser Position
bleiben gespeichert, werden aber in der Anzeige ersetzt; berechnete Werte werden
nicht als eigene Werte festgeschrieben. Beim Einschalten werden fehlende Monate ab
dem Kaufmonat angelegt (übrige Werte aus dem Vormonat). Beim Ausschalten gelten
eigene Monatswerte wieder, übrige Monate übernehmen den zuletzt berechneten Wert,
damit der Verlauf erhalten bleibt.

Version 1- und 2-Dateien werden weiterhin gelesen und beim Speichern als Version 3
geschrieben. Ältere App-Versionen lehnen Version-3-Dateien ab, statt die
Abschreibung stillschweigend zu verwerfen.

## Verlauf einer Position bearbeiten

Im Sheet einer Position führt „Verlauf bearbeiten“ zu allen früheren Monaten dieser
Position. Mit Kursquelle wird die Stückzahl bearbeitet; der Wert ist Stückzahl ×
Monatsschlusskurs (fehlt der Kurs, gilt gespeicherter Wert ÷ Stückzahl), sonst der
Euro-Wert. „Verlauf neu berechnen“ nutzt dieselbe Rückrechnung wie die Einrichtung
(seit wann, einmal oder Sparplan) ausgehend von der heutigen Stückzahl; vor dem
Kaufmonat steht 0, neu angelegte Monate sind berechnet gekennzeichnet. Gespeichert
wird erst mit „Sichern“ und nur für geänderte Monate. „Aktualisieren“ in einem
vergangenen Monat zeigt Positionen mit Kursquelle ebenfalls als Stückzahl.

## Beamtenversorgung (Version 7)

Die eigene Person kann `civilServicePension` tragen: ruhegehaltfähige Bezüge pro
Monat (`pensionableSalary`), bisherige Dienstjahre (`serviceYears`), Altersgrenze
(`retirementAge`, 0 = gesetzliche Regelaltersgrenze), optional früherer
Pensionsbeginn (`startAge`) und pauschale Abzüge (`deductionPercent`). Das Feld fehlt,
solange keine Bezüge eingetragen sind; Dateien der Version 6 bleiben lesbar.

Die Pension wird nicht gespeichert, sondern berechnet: Dienstjahre bis „Sparen bis
Alter“ bzw. Pensionsbeginn hochgerechnet, 1,79375 % Ruhegehaltssatz je Jahr,
höchstens 71,75 %, ab fünf Dienstjahren mindestens 35 %. Vor der Altersgrenze werden
3,6 % je Jahr abgezogen, höchstens 10,8 %. Bezüge gelten in heutiger Kaufkraft. Die
Pension fließt wie die gesetzliche Rente in die Prognose ein, solange der Bereich
Altersvorsorge eingeschaltet ist.

## Erwerbsminderungsrente (Version 7)

Eine laufende Erwerbsminderungsrente der eigenen Person steht bei der gesetzlichen
Rente: `disabilityType` (1 = teilweise, 2 = voll), Zahlbetrag netto pro Monat
(`disabilityPension`), optional das letzte Bezugsjahr (`disabilityUntilYear`, fehlt =
bis zur Regelaltersgrenze) und bei teilweiser Erwerbsminderung die persönliche
Hinzuverdienstgrenze (`earningsLimit`, fehlt = Mindestgrenze). Der Hinzuverdienst ist
das Bruttojahresgehalt (`annualSalary`); er bringt weiter Rentenpunkte. Liegt er über
der Grenze (2026: voll 20.763,75 €, teilweise mindestens 41.527,50 €), werden 40 % des
übersteigenden Betrags auf die Bruttorente angerechnet; den Zahlbetrag mindert das um
diesen Betrag abzüglich der pauschalen Abzüge (`deductionPercent`, Kranken-/Pflege-
versicherung und Steuer).

In der Prognose deckt die EM-Rente ab dem Ende der Arbeit (Vorruhestand) einen Teil des
Bedarfs, bis sie endet – dann ohne Anrechnung, weil kein Hinzuverdienst mehr fließt. Vor dem
Ende der Arbeit wird angenommen, dass sie als Einnahme im Budget steht und in die
Sparraten einfließt. Läuft sie bis zur Regelaltersgrenze, wird sie dort automatisch zur
Altersrente, auch wenn die Rentenphase später beginnt. Diese Altersrente ist der höhere
Wert aus dem Besitzschutz (mindestens die volle Erwerbsminderungsrente, bei teilweiser
also das Doppelte des Zahlbetrags) und der Hochrechnung aus Rentenpunkten plus Punkten
aus dem Hinzuverdienst bis zum Ende der Arbeit. Rentenpunkte daher ohne Zurechnungszeit
eintragen, sonst zählt sie doppelt. Endet die EM-Rente vorher, gilt die normale
Hochrechnung.

## Erwerbsminderungsrente weiterer Personen (Version 8)

Weitere Personen (`retirement.people`) können dieselben vier EM-Felder in ihrer
`statutoryPension` tragen wie die eigene Person. Rentenwert, Durchschnittsentgelt und
Beitragsbemessungsgrenze bleiben gemeinsame Werte der eigenen Person und werden bei
weiteren Personen abgewiesen. `disabilityUntilYear` und die Regelaltersgrenze beziehen
sich auf das Geburtsjahr der jeweiligen Person; die Prognose rechnet beides auf das
eigene Alter um. Die EM-Rente einer weiteren Person deckt wie die eigene ab dem eigenen
Vorruhestand einen Teil des Bedarfs, bis sie endet: mit Anrechnung, solange die Person
noch arbeitet („Arbeiten bis“), danach ohne. Dateien der Version 7 bleiben
unverändert lesbar.

## Altersvorsorgedepots (Version 8)

`retirement.pensionDepots` enthält beliebig viele geförderte Altersvorsorgedepots
(ab 2027, Altersvorsorgereformgesetz). Jedes Depot gehört über `personId` der eigenen
Person oder einer weiteren Person und hat einen monatlichen Eigenbeitrag
(`monthlyContribution`). Optional: Guthaben heute (`balance`), erstes Beitragsjahr
(`startYear`, fehlt = 2027), Rendite (`returnPercent`, fehlt = 5 %), Auszahlungsbeginn
(`payoutAge`, fehlt = Regelaltersgrenze, gerechnet wird mit 65 bis 70), Teilauszahlung zu
Beginn (`lumpSumPercent`, 0 bis 30), Abzüge auf die Auszahlung (`deductionPercent`, fehlt =
20 %) und Geburtsjahre der Kinder mit Kindergeld (`childBirthYears`). Das Feld fehlt in
Dateien der Version 7; sie bleiben lesbar. Verweist ein Depot beim Speichern auf eine
entfernte Person, gehört es danach der eigenen Person.

Zulagen und Auszahlung werden berechnet, nicht gespeichert: Grundzulage 50 % auf die
ersten 360 € Eigenbeitrag im Jahr und 25 % auf weitere Beiträge bis 1.800 € (höchstens
540 €), Kinderzulage 100 % des Eigenbeitrags bis 300 € je Kind bis zum Jahr des 18.
Geburtstags, einmalig 200 € Berufseinsteigerbonus, wer zu Beginn des ersten Beitragsjahres
jünger als 25 ist. Beiträge laufen bis „Sparen bis Alter“ bzw. „Arbeiten bis Alter“ der
Person, höchstens bis zur Auszahlung. Ausgezahlt wird als Auszahlplan bis 85 in heutiger
Kaufkraft; die Prognose zählt ihn als Einkommen, eine Teilauszahlung fließt ins liquide
Vermögen. Der steuerliche Sonderausgabenabzug in der Ansparphase wird nicht eingerechnet.

## Lebensphasen (Version 10)

Die Prognose rechnet in vier Phasen. Ihre Grenzen und Annahmen stehen in
`forecast.settings`; fehlende Felder bedeuten das bisherige Verhalten.

| Phase | beginnt mit | Annahmen |
| --- | --- | --- |
| 1 Ansparen | heute | Sparraten je Anlage, `savingsGrowthPercent` |
| 2 Weiterarbeiten | `saveUntilAge` | `phase2WorkPercent` (Arbeitszeit, Standard 100), `phase2SavingPercent` (private Vermögensbildung in % der heutigen Sparraten, Standard 0), `phase2PensionPercent` (Altersvorsorge in % der heutigen Beiträge, Standard 100, ab Version 11), `phase2MonthlyWithdrawal` (€/Monat, Standard 0) |
| 3 Vorruhestand | `retirementAge` | `monthlySpending` aus dem liquiden Vermögen; ab Version 11 optional `phase3SavingPercent` und `phase3PensionPercent` (Standard 0) |
| 4 Rente | `pensionStartAge` | `pensionSpending` (Standard: wie `monthlySpending`) |

- Die Grenzen folgen aufeinander: Phase 2 beginnt bei `min(saveUntilAge, retirementAge)`,
  Phase 4 bei `max(retirementAge, pensionStartAge)`. Eine Phase ohne Dauer entfällt.
- `pensionStartAge` fehlt: Rentenbeginn der gesetzlichen Rente (`statutoryPension.retirementAge`)
  bzw. die Regelaltersgrenze. Eine gesetzliche Rente ohne eigenes Alter beginnt mit Phase 4;
  stimmt ihr Alter mit Phase 4 überein, zieht das Phasen-Sheet es beim Verschieben mit
  (ebenso das Antragsalter der Beamtenversorgung).
- Rentenpunkte und Dienstzeit wachsen in Phase 1 voll und in Phase 2 anteilig zur Arbeitszeit.
  Altersvorsorge (Sparraten der Gruppen mit Kategorie `bav` und Beiträge eigener
  Altersvorsorgedepots) läuft in Phase 1 voll, in Phase 2 und 3 mit dem jeweiligen Prozentsatz,
  danach nicht mehr; die Depot-Hochrechnung rechnet das Jahr für Jahr (Alter zur Jahresmitte).
  Private Vermögensbildung (übrige Sparraten) entsprechend mit den Spar-Prozentsätzen.
  Kreditraten zahlt bis zum Ende der Arbeit das Einkommen.
- Mit `phase2WorkPercent: 0` und `phase2PensionPercent: 0` entspricht die Rechnung genau dem Modell bis Version 9
  (zwischen „Sparen bis“ und „Ruhestand ab“ weder Sparen noch Rentenpunkte); die Tests
  vergleichen das mit dem Stand `1f17a25`.
- Dateien der Version 9 bleiben lesbar und erhalten die Standardwerte.

## Einkommen im Ruhestand, Depots im Vermögen, Erscheinungsbild (Version 11)

- **Budget-Einnahmen im Ruhestand**: `retirementIncome: true` an einem Budgetposten der Art
  `income` (nur dort erlaubt). Der Monatsschnitt zählt ab dem Ende der Arbeit als Einkommen
  im Ruhestand, in heutiger Kaufkraft. Ist die Einnahme schon unter Altersvorsorge erfasst
  (Erwerbsminderungsrente, gesetzliche Rente, Pension, Altersvorsorgedepot, gleichnamige
  weitere Rente), zählt sie nicht doppelt; das Budget-Sheet zeigt das an. Eine so markierte
  Erwerbsminderungsrente ohne Eintrag unter Altersvorsorge endet an der Regelaltersgrenze.
- **Altersvorsorgedepot im Vermögen**: optional `positionId` am Depot, verweist auf eine
  Vermögensposition (nicht `liab`). Angelegt über die Depot-Karte mit Kurssuche, in der Gruppe
  „Altersvorsorgedepots“, gebunden (`illiquid`). Der aktuelle Wert der Position ersetzt das
  eingetragene Guthaben. In der Prognose zählt die Gruppe bis zum Auszahlungsbeginn zum
  Vermögen, danach steckt das Kapital in der monatlichen Auszahlung (nicht doppelt).
- **Erscheinungsbild**: `preferences.theme` kann zusätzlich `system` sein (folgt dem Gerät).

## Sprache (Version 12)

- `preferences.language`: `de` (Standard, auch wenn das Feld fehlt) oder `en`; Legacy-Schlüssel
  `appLang`. Andere Werte lehnt die Prüfung ab. Umgestellt wird unter Daten → Einstellungen →
  Sprache; die App lädt danach neu. Dateien der Version 11 bleiben lesbar (Deutsch).
- **Übersetzung**: Die App ist auf Deutsch geschrieben. Im englischen Modus übersetzt
  `_tr()` jeden angezeigten Text (Textknoten sowie `placeholder`, `title`, `aria-label`,
  `data-date-ph`, `data-date-title`) über `window.I18N_EN` aus `i18n-en.js`, auch später
  eingefügte Inhalte (MutationObserver). Reihenfolge: exakter Text → Vorlage, in der Zahlen
  und Monatsnamen zu `{0}`, `{1}` … werden (Monatsnamen sind zu diesem Zeitpunkt schon
  englisch) → Regeln (`[RegExp, Ersetzung]`) für Texte mit Namen. Was nicht passt, bleibt
  stehen – so bleiben eigene Bezeichnungen der Nutzer unverändert.
- Lange, aus vielen Teilen gebaute Texte (Rechenwege der Renten, Phasen, Partner-Story)
  stehen direkt zweisprachig im Code: `L('deutsch','english')`. `data-no-tr` schließt ein
  Element von der Übersetzung aus (z. B. der Sprachschalter selbst).
- Monatsnamen, Phasennamen und die Info-Texte (`INFO`) werden beim Start ersetzt. Zahlen,
  Beträge und Datumsangaben behalten das deutsche Format.
- **Neue Texte**: deutschen Text wie gewohnt schreiben und die englische Fassung in
  `i18n-en.js` ergänzen (Schlüssel getrimmt, Zahlen als Platzhalter). `.tests/i18n.test.cjs`
  prüft Platzhalter und Vollständigkeit der Info-Texte.

## Partner-Story

Am Ende der Prognose-Seite (`#psOpen`) erklärt eine Folge von Story-Seiten den ganzen Plan
ohne Fachbegriffe: heutiges Vermögen, monatliches Sparen, die vier Lebensphasen, die
Marktsimulation, große Ereignisse und ein Fazit. Alle Werte kommen aus `buildPlan()` und der
Monte-Carlo-Simulation, in heutiger Kaufkraft. Bedienung: Tippen rechts/links, Halten pausiert,
nach unten wischen, Esc oder × schließt. Es werden keine Daten gespeichert.

## Altersvorsorgedepots im Budget (Version 9)

Ab dem ersten Beitragsjahr erscheint jedes Depot automatisch im Budget: der Eigenbeitrag
als Sparposten unter Vermögensaufbau, die Zulage (inklusive Berufseinsteigerbonus im
ersten Jahr) als Monatsschnitt des Jahresbetrags sowohl als Einnahme als auch unter
Vermögensaufbau. „Nicht verplant“ sinkt dadurch nur um den Eigenbeitrag. Gezählt wird nur,
solange der Bereich Altersvorsorge eingeschaltet ist; die Übernahme der Sparraten in die
Prognose lässt diese Zeilen aus, weil das Depot dort ein eigenes Modell hat.

Ein Sparposten kann mit `depotId` auf ein Depot zeigen („Beitrag für“). Er wird dann durch
die automatischen Zeilen ersetzt und nie zusätzlich gezählt. Wird das Depot entfernt, bleibt
der Posten ein gewöhnlicher Sparposten. Dateien der Version 8 bleiben lesbar.

Wird unter „Weitere Renten & Einkünfte“ ein Rürup- oder Basisrentenvertrag
eingetragen, zeigt die Daten-Seite einen sachlichen Hinweis: Er ist nicht in ein
Altersvorsorgedepot übertragbar, nur als lebenslange Rente auszahlbar, und für neue
Beiträge lohnt ein Vergleich.

## Kreditraten im Budget (Version 6)

Ein wiederkehrender Budgetposten kann mit `loanId` auf eine Verbindlichkeit zeigen
(„Kreditrate für“ im Sheet; der passende Kredit wird aus dem Namen vorgeschlagen,
z. B. „Kreditrate Auto“ → „Autokredit“). Hat der Kredit einen vollständigen Vertrag,
ersetzt die automatische Rate den Posten, er wird nie zusätzlich gezählt. Ohne
Vertrag wird die Rate in Zins (Restschuld des letzten Monats × Sollzins / 12) und
Tilgung (Vermögensaufbau der Gruppe des Kredits) getrennt. Unverknüpfte Ausgaben,
die nach einer Kreditrate klingen, schlägt die Daten-Seite zum Verknüpfen vor.

## Monatsabschluss

„Aktualisieren“ öffnet den Monatsstand. Jede Position wird in ihrer Einheit erfasst: mit
Stückzahl (Kursposition oder erfasste Einheit wie oz) als Stückzahl, sonst in Euro. Der Wert
einer Stückzahl ist Stückzahl × Kurs; ohne automatischen Kurs gilt der bisherige Kurs (Wert ÷
Stückzahl), „Kurs ändern“ blendet ein eigenes Kursfeld ein. Bleiben Stückzahl und Kurs einer
Position ohne Kursquelle unverändert, bleibt der gespeicherte Wert exakt erhalten.

Abschnitte: „Bitte prüfen“ (mit dem Vormonat vorbelegt, Konten zuerst), „Selten geändert“
(Wert bzw. Stückzahl seit mindestens drei Monaten gleich, eingeklappt) und „Läuft
automatisch“ (Kreditverträge und Abschreibungen mit Rate und Veränderung zum Vormonat,
eingeklappt). Abschreibungen werden für jeden Monat berechnet und nicht gespeichert, ein neuer
Monat setzt sie also selbst fort. Ein Vorschlag erscheint, solange Wert bzw. Stückzahl noch dem
Vormonat entspricht: der Ø-Sparplan aus dem Budget, wenn seine Gruppe genau eine Position hat
(bei Stückzahlen umgerechnet mit dem Kurs), sonst bei Konten und Vorsorgeverträgen der Ø der
letzten drei Veränderungen, wenn sie alle in dieselbe Richtung gingen. „+250“ bzw. „−80“
rechnet mit dem Wert beim Antippen; ein Ergebnis unter null ist ungültig. Große Sprünge
(Euro: über 25 % und über 5.000 €; Stückzahl oder eigener Kurs: über 50 %) zeigen einen
Hinweis, blockieren aber nicht. Unten stehen Nettovermögen, Veränderung zum Vormonat (davon
Kurse) und „Übernehmen“.

In der ersten Woche eines Monats erinnert eine Mitteilung samt Punkt am Daten-Tab an den
Monatsstand, bis er für den laufenden Monat übernommen wurde. Danach bietet die App eine
Sicherung an, wenn noch keine existiert oder die letzte älter als 30 Tage ist. Erledigt
und weggeklickt werden je Gerät unter `vermoegen-month-done` und
`vermoegen-month-reminder` gemerkt und sind nicht Teil der Sicherung.

## Darstellung der Charts

Unter den Bereichen der Daten-Seite stehen drei Kacheln: „Einstellungen“
(Bereiche ein- und ausschalten, Erscheinungsbild, Darstellung der Charts),
„Sicherung“ (Sicherung exportieren, wiederherstellen, alle Daten löschen) und „Hilfe“
(Rundgang, Demo-Daten). Ein ausgeschalteter Bereich bleibt auf der Daten-Seite als
Zeile sichtbar; ein Tipp darauf öffnet die Einstellungen. Ein roter Punkt an
„Sicherung“ erinnert an eine fällige Sicherung (noch nie oder vor mehr als 30 Tagen). Unter
„Einstellungen“ wählt man je Seite (Vermögen, Prognose), wie der Chart
startet: Zeitraum, Ansicht (mit Asset-Flächen oder nur Linie) und Skala (linear oder
logarithmisch). Ein Tipp auf den Gesamtwert oben auf der Seite entfernt alle Filter
(Kachel-Filter, einzelnes Asset, Zeitraum, Ansicht, Skala) und stellt diese
Standards wieder her. Die Einstellungen gelten je Gerät unter
`vermoegen-chart-defaults` und sind nicht Teil der Sicherung.

## Gruppen nach Art

Beim Start ordnet die App automatisch entstandene Einzelgruppen der Gruppe ihrer Art
zu: Gruppen, die frühere Versionen beim Anlegen nach der Position benannt haben, und
„Sonstiges“ aus alten CSV-Importen, wenn darin nur ein Fahrzeug steckt. Gibt es die
Zielgruppe noch nicht, wird die Gruppe umbenannt; sonst ziehen Position, Sparrate,
Budget-Sparziele und Ereignisse um. Selbst benannte Gruppen bleiben unverändert.

## Berechnete Monate (Version 5)

Ein Monatsstand kann `"estimated": true` tragen. Das betrifft Monate, die bei der
Einrichtung aus Kursverläufen und den Angaben des Nutzers berechnet wurden. Das
Feld fehlt bei erfassten Monaten. Ältere Dateien (Version 1–4) bleiben gültig;
ältere App-Versionen lehnen Version-5-Dateien ab, statt die Kennzeichnung zu
verwerfen.

## Einnahmen und Ausgaben (Version 4)

Wiederkehrende Posten bleiben Teil des Zwölfmonatsplans (`budget.items`,
`monthlyAmounts`). Die App bietet die Rhythmen monatlich, quartalsweise und
jährlich mit Fälligkeitsmonat an und schreibt daraus die zwölf Werte; beim
Bearbeiten wird der Rhythmus aus den Werten abgelesen. Abweichende Muster (z. B.
Gehalt mit Weihnachtsgeld) bleiben als „je Monat unterschiedlich“ erhalten.

Einmalige Zahlungen gehören zu genau einem Kalendermonat und wiederholen sich nicht:

```json
{"id": "once-1", "name": "Autoreparatur", "category": "variable", "kind": "expense",
 "month": "2026-11", "amount": 800, "targetGroupId": null}
```

`category` ist eine Budgetkategorie, `kind` `income`, `expense` oder `saving`,
`targetGroupId` optional die Zielgruppe einer Sparzahlung. Sie zählen nur im Budget
ihres Monats und fließen nicht in Ø-Werte, Min/Max des Jahres, abgeleitete
Sparraten oder die Prognose ein. Version-3-Dateien ohne `oneTime` bleiben gültig.

Konten (`accounts`, Name und optional IBAN) und Daueraufträge
(`budget.standingOrders`, Von/Nach und Betrag pro Monat) werden auf der Daten-Seite
unter „Einnahmen & Ausgaben“ gepflegt. Von/Nach ist ein Konto oder eine freie
Bezeichnung (z. B. Kindergeld). Umbenennen eines Kontos passt seine Daueraufträge
an; beim Löschen bleiben sie mit der bisherigen Bezeichnung erhalten. Ohne
Einnahmen bzw. ohne Daueraufträge zeigt die Budget-Seite anstelle des Geldflusses
einen Hinweis mit Sprung zur passenden Stelle der Daten-Seite.

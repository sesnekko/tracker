# Datenmodell und Sicherungen

Die App speichert ihren vollständigen Datenbestand als **ein JSON-Dokument** im
Browser (`vermoegen-data-v1`). Eine Sicherung exportiert dieses Dokument als eine
einzige Datei `vermoegen_YYYY-MM-DD.json`. Für den Gerätewechsel werden keine
weiteren Dateien benötigt. Die Datei ist UTF-8 und wird lesbar eingerückt.

## Struktur, Version 2

| Feld | Inhalt |
| --- | --- |
| `format`, `schemaVersion`, `currency` | `vermoegen-backup`, `2`, `EUR` |
| `exportedAt` | ISO-Zeitpunkt; nur in exportierten Dateien |
| `groups` | Stabile Gruppen-IDs, Namen, Standardprofil und Prognoseannahmen |
| `positions` | Stabile Positions-IDs, Namen, Kategorien, Liquidität, Bewertung, Kursquelle, Einheit und Archivstatus |
| `snapshots` | Monatsstände (`YYYY-MM`) mit Positions-ID, Wert und optionaler Stückzahl |
| `accounts` | Konten mit ID, Name und IBAN |
| `budget` | Zwölfmonatiger Plan ohne Jahresbezug, Budgetposten und Daueraufträge; `null`, wenn nicht eingerichtet |
| `loans` | Darlehensparameter, über `positionId` einer Verbindlichkeit zugeordnet |
| `retirement` | Eigene Person, weitere Personen mit gesetzlicher Rente und weitere Renteneinkünfte |
| `forecast` | Lebensplanung, Bedarf, Inflation, Sicherheitsniveau und einmalige Ereignisse |
| `preferences` | Theme, fünf Bereichsschalter, Aufklappzustände und Abschluss des Onboardings |

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
node --test tests/data-model.test.cjs
node scripts/build-demo.cjs
```

Die Tests vergleichen Monatswerte, Budget und Monte-Carlo-Ergebnisse mit dem
Stand vor der Migration (`1f17a25`). Sie prüfen außerdem Gerätewechsel,
Umbenennungen, archivierte Daten, ungültige Importe, Speicherfehler und die
tatsächlichen Export-/Importfunktionen. `demo_backup.json` ist die neue Demo für
die App; `demo_export.csv` bleibt eine Test- und Kompatibilitätsvorlage.

Die JSON-Demo zeigt einen fiktiven Haushalt mit 34 Monatsständen von Januar 2024
bis Oktober 2026: Konten, zwei ETFs, eine Beispielaktie, getrennte Bitcoin- und
Ethereum-Positionen, physisches Gold, Altersvorsorge, Wohnung und Familienauto.
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
„Mit Demo-Daten ausprobieren“. Unter Daten → Einrichtung & Hilfe lässt sich der
Rundgang erneut starten. Neue Nutzer erhalten sechs kurze Schritte zu Vermögen,
Budget, Prognose, Datenpflege, optionalen ersten Positionen und Sicherung.
Bei bestehenden Daten entfällt die Eingabe der ersten Positionen.
Nach dem Abschluss öffnet sich die Vermögensseite. Ein Hinweis führt zur
Daten-Seite, um Verbindlichkeiten, Einnahmen, Ausgaben und weitere Angaben zu ergänzen.

Eigene Eingaben bleiben bis zum Abschluss ein Entwurf. Beim Abschluss werden
aktuelle Bestände und der Live-Monat gemeinsam gespeichert. Unbekannte
Stückzahlen, Ticker und Rentenwerte werden nicht ergänzt. Budget, Altersvorsorge
und Prognose werden bei einem neuen Bestand zunächst ausgeschaltet und können
später unter Daten aktiviert werden. Ein leeres Budget lässt sich dort einrichten.
Vermögenswerte und Verbindlichkeiten sind feste, eigenständig schaltbare Bereiche
auf der Daten-Seite. Neue Verbindlichkeiten werden direkt in ihrem eigenen
Bereich angelegt; die Auswahl für Vermögenswerte enthält ausschließlich Anlagen.
Bestehende Positionen lassen sich im Bearbeiten-Modus direkt an ihrer Zeile entfernen.
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
steuert Vermögenssummen und Filter. Neu angelegte Assets bekommen eine eigene
Gruppe und keine erfundene Sparrate. Die Prognose berücksichtigt die
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

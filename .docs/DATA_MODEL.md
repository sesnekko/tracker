# Datenmodell und Sicherungen

Die App speichert ihren vollständigen Datenbestand als **ein JSON-Dokument** im
Browser (`vermoegen-data-v1`). Eine Sicherung exportiert dieses Dokument als eine
einzige Datei `master_export_YYYY-MM-DD.json` (bis Oktober 2026 `vermoegen_YYYY-MM-DD.json`). Für den Gerätewechsel werden keine
weiteren Dateien benötigt. Die Datei ist UTF-8 und wird lesbar eingerückt.

## Struktur, Version 20

| Feld | Inhalt |
| --- | --- |
| `format`, `schemaVersion`, `currency` | `vermoegen-backup`, `20`, `EUR` |
| `exportedAt` | ISO-Zeitpunkt; nur in exportierten Dateien |
| `groups` | Stabile Gruppen-IDs, Namen, Standardprofil und Prognoseannahmen |
| `positions` | Stabile Positions-IDs, Namen, Kategorien, Liquidität, Bewertung, Kursquelle, Einheit und Archivstatus |
| `snapshots` | Monatsstände (`YYYY-MM`) mit Positions-ID, Wert und optionaler Stückzahl; `estimated: true` kennzeichnet berechnete Monate |
| `accounts` | Konten mit ID, Name und IBAN |
| `budget` | Zwölfmonatiger Plan ohne Jahresbezug, Budgetposten, Daueraufträge und einmalige Zahlungen (`oneTime`); `null`, wenn nicht eingerichtet |
| `loans` | Darlehensparameter, über `positionId` einer Verbindlichkeit zugeordnet |
| `retirement` | Haushalt und Altersvorsorge: eigene Person (Geburtsjahr und -monat, gesetzliche Rente, optional laufende Erwerbsminderungsrente und Beamtenversorgung), weitere Personen mit gesetzlicher Rente (optional laufende Erwerbsminderungsrente), Kinder, Altersvorsorgedepots und weitere Renteneinkünfte (optional mit Ende und Person) |
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

### Schreibrecht zwischen Fenstern (P34, überarbeitet nach P54, P55 und P63)

Lesen und Schreiben von localStorage bilden zwischen Fenstern keine gemeinsame Operation; ein Vergleich vor dem
Schreiben verkleinert das Zeitfenster nur. Deshalb schreibt nur das Fenster, das die exklusive Web Lock
`vermoegen-writer` hält (`createWriterGate` in `data-store.js`). Weitere Fenster lesen mit und zeigen „Nur ansehen“;
jeder Schreibweg (`setItem`, `removeItem`, `clear`, Transaktion, Import, Umbenennen, Erstübernahme alter Schlüssel)
lehnt dort mit `code: 'READ_ONLY'` ab. Das Dokumentformat ändert sich dadurch nicht (weiter Version 17).

| Zustand | Bedeutung | darf schreiben |
| --- | --- | --- |
| `pending` | Start oder Rückkehr: Antwort auf die Sperranfrage steht aus, höchstens `timing.start` (2,5 s), dann `reader` | nein |
| `writer` | hält die Sperre und hat den neuesten Stand geladen | ja |
| `reader` | ein anderes Fenster schreibt; dieses wartet im Hintergrund eingereiht auf die Sperre | nein |
| `failed` | Sperre erhalten, die Übernahme scheiterte – Speicher voll beim ersten Speichern alter Schlüssel oder ein gespeichertes Dokument, das diese Version nicht lesen kann (`code: 'UNREADABLE'`, z. B. von einer neueren App-Version, P65): Sperre wieder frei, alte Schlüssel und Dokument bytegleich unverändert, nicht eingereiht | nein |
| `suspended` | Seite verlassen (`pagehide`, `freeze`, auch bfcache): Sperre wirklich freigegeben, nicht eingereiht | nein |
| `unsupported` | keine nutzbaren Web Locks (fehlen, abgelehnt, Ausnahme): geschützter, erklärter Lesemodus | nein |
| `single` | ohne Sperren vorgesehen (Tests, Werkzeuge) oder nach ausdrücklicher Entscheidung „Nur hier bearbeiten …“: nur Konflikterkennung P1 und Basisprüfung P54 | ja |

| Übergang | Auslöser |
| --- | --- |
| `pending` → `writer` | Sperre sofort frei (`ifAvailable`); vorher wird die Abgabe-Marke eines vorherigen Fensters abgewartet (höchstens `timing.handover`, 0,6 s), dann der Stand geladen |
| `pending` → `reader` | Sperre belegt (dann eingereiht) oder keine Antwort innerhalb von `timing.start` (kommt die Sperre später doch, wird übernommen) |
| `pending`/`reader` → `unsupported` | Lock-API fehlt oder lehnt die erste Anfrage ab |
| `reader` → `writer` | eingereihte Anfrage erteilt (das schreibende Fenster hat abgegeben, wurde verlassen, geschlossen oder ist abgestürzt) |
| `pending`/`reader` → `failed` | Sperre erteilt, Laden des gespeicherten Dokuments oder Erstübernahme wirft; die Sperre wird sofort wieder freigegeben |
| `failed` → `reader` → … | `requestWrite()` („Erneut versuchen“) stellt neu an |
| `writer` → `reader` | Bitte eines anderen Fensters (`vermoegen-writer-request`), wenn hier nichts bearbeitet wird: erst Abgabe-Marke, dann Sperre frei, wieder einreihen |
| jeder Zustand außer `unsupported`/`single` → `suspended` | `pagehide`, `freeze`: Abgabe-Marke (falls Writer), wartende Anfrage abbrechen, Sperre frei, neue Epoche |
| `suspended` → `pending` | `pageshow` mit `persisted`, `resume` oder wieder sichtbar (`visibilitychange`): neu erwerben, Stand neu laden |
| `unsupported` → `single` | nur nach ausdrücklicher Bestätigung im Dialog („Nur in diesem Fenster bearbeiten?“) |

**Übernahme und Erstübernahme (P65).** Beim Erhalt der Sperre lädt das Fenster das gespeicherte Dokument, wenn es sich
seit dem eigenen letzten Stand geändert hat. Kann es das nicht lesen, endet die Übernahme als `failed` (kein Schreibrecht,
Sperre frei, nichts verändert, „Erneut versuchen“). Hat das Fenster beim Start kein Dokument vorgefunden und die
Übernahme alter Einzelschlüssel vorgemerkt, gilt: Liegt beim Erhalt der Sperre inzwischen ein Dokument vor, wird nur dieses
übernommen; die vorgemerkte Erstübernahme entfällt und die alten Schlüssel bleiben unberührt. Ein älteres Schema wird
dabei nicht sofort neu geschrieben, sondern erst bei der nächsten regulären Speicherung – und davor wie jedes ältere
Dokument unverändert unter `vermoegen-data-v1-before-update` gesichert (P37). Nur wenn kein Dokument vorliegt, werden die
alten Schlüssel übernommen und erst nach dem erfolgreichen Schreiben des Dokuments entfernt.

Ein **nur verdecktes** Fenster (`visibilitychange` hidden) behält das Schreibrecht und beantwortet weiter
Übergabe-Bitten; erst ein **verlassenes oder eingefrorenes** Dokument gibt es ab. Jedes Verlassen beginnt eine neue
Epoche: Ein Rückruf der Lock-API aus einer früheren Epoche (z. B. eine verspätet erteilte Sperre ohne Abbruch-Unterstützung)
gibt die Sperre sofort zurück und ändert den Zustand nicht. Alle Lock-Aufrufe sind gegen Ablehnung und synchrone
Ausnahmen abgesichert; `ready()` endet immer (spätestens nach `timing.start`), `requestWrite()` antwortet immer
innerhalb von `timing.request` (2,5 s, einschließlich des Wartens auf die erste Antwort) mit `writer`, `busy`,
`timeout`, `failed`, `denied` (Anfrage abgelehnt), `unsupported` oder `suspended`. Die App startet nach spätestens 3 s
zum Ansehen, auch wenn der Browser nie antwortet; das Schreibrecht folgt dann, sobald es kommt.

**Basis jeder Bearbeitung (P54).** Der Speicher zählt mit `revision()` die Stände, die ein Fenster von außen übernimmt
(fremde Speicherung per `reload()`, Übernahme des Schreibrechts, Rückkehr, Konflikt). Eine Bearbeitung beruht auf der
Revision, mit der ihre Eingaben angezeigt wurden, und speichert mit `withBase(revision, fn)`. Ist der Stand inzwischen
ein anderer, schreibt der Speicher nichts und wirft `code: 'STALE'`; die Übernahme des Schreibrechts aktualisiert den
Stand, aber nie die Basis einer offenen Bearbeitung. Ohne eigene Basis gilt mit `trackView` die Revision, die die Seite
zuletzt angezeigt hat (`markShown()` beim Aufbau der Seite und nach jeder übernommenen fremden Änderung). So schreiben
auch Hintergrundvorgänge (z. B. Kurse) nie aus einem veralteten Zwischenspeicher der Seite. Transaktionen merken sich ihre
Revision beim Beginn. Basen in der App: Sheets (beim Öffnen, für Speichern, Löschen und Anlegen im Sheet), Daten-Bearbeiten
(beim Start), Einrichtung (beim Start, vorbelegte unveränderte Werte folgen dem neuen Stand), JSON-/CSV-Import, Zurücksetzen
und Demo (vor der Rückfrage), Kursverlauf (bei der Rückfrage), Ereignisliste der Prognose-Annahmen (beim Zeichnen).
Einzelwerte, die nichts aus der Anzeige übernehmen (aufgeklappt, Thema, Sprache, Bereiche, ein einzelnes Annahmefeld, die
bestätigten Sparraten aus dem Budget), gelten auf dem aktuellen Stand.

Wird eine Speicherung als veraltet abgelehnt, öffnet die App das Sheet bzw. die Daten-Seite mit dem aktuellen Stand neu
und trägt nur die Felder wieder ein, die in diesem Fenster bedient **und** geändert wurden (Ausgangswerte beim ersten
Bedienen, markiert, Abschnitte aufgeklappt). Hat das andere Fenster dasselbe Feld geändert, steht dessen Wert daneben
(„Inzwischen gespeichert: …“). Gespeichert wird erst, wenn man erneut speichert. Lässt sich das Sheet nicht mehr öffnen
(Eintrag inzwischen gelöscht), nennt ein Dialog die eigenen Eingaben. Ein Import, ein Zurücksetzen oder das Laden der
Demo wird abgelehnt („Nichts geändert …“).

Die **Ereignisliste** (und der gleich gebaute Editor weiterer Renten/Einkünfte) speichert bei jeder Eingabe die ganze Liste.
Beruht sie auf einem älteren Stand, schreibt sie nichts, zeichnet den aktuellen Stand und nennt in einem Hinweis alle
eigenen Eingaben, die von der gezeichneten Fassung abweichen (P64). Eine Eingabe gehört allein über die gespeicherte
Kennung der Zeile zu einem Eintrag – nie über Position, Anzahl oder Namen. Fehlt die Zeile inzwischen, ist die Kennung
leer oder mehrfach vorhanden, wird die Eingabe nur genannt („nicht übertragen …“). Sonst bietet der Hinweis „Meine
Eingaben übernehmen“: Erst dieser Klick schreibt genau die genannten Felder in die Zeile mit derselben Kennung; andere,
inzwischen fremd geänderte Felder dieser Zeile bleiben. Neue Zeilen erhalten ihre Kennung beim Anlegen (`event-…`,
`income-…`, eindeutig, nie die einer gelöschten Zeile) und werden danach aus dem gespeicherten Stand gezeichnet. Auch der
allgemeine Abgleich von Sheets und Daten-Bearbeiten ordnet Zeilen nur über ihre Kennung (`data-row-id`, bei
Sondertilgungen `data-extra-id`) zu; Felder, deren Kennung mehrfach vorkommt, werden nie übertragen.

**Bekannte offene Lücken des Abgleichs (Folge-Review 2):** Eigene Änderungen an selbstgebauten Schaltern (z. B. „Auch im
Ruhestand“) werden nicht erkannt (P66); bei einem zweiten Konflikt in der Einrichtung kann eine eigene Angabe dem neuen
Stand weichen (P67); ein Sprachwechsel in einem anderen Fenster lädt neu und verliert einen offenen Entwurf (P68).

**Tests und Nachweise.** Automatisiert: `.tests/writer-lifecycle.test.cjs` mit einem Testbrowser, der storage-Ereignisse
und Sperr-Rückrufe asynchron liefert, bfcache-Seiten keine Ereignisse zustellt und nach jedem Ereignis prüft, dass höchstens
ein Fenster schreibt und es die Sperre hält; dazu `.tests/data-safety.test.cjs` (P34). Für den Abgleich von Listen baut
`.tests/mini-dom.cjs` aus dem gerenderten HTML echte Elementbäume (Kontrollen, Listener, Neuzeichnen, Ereignisse mit
Bubbling); es ist kein vollständiger Browser. Einzelheiten der Gegenproben am jeweiligen Vorher-Stand: PROBLEME.md. Im Browser geprüft (Chrome 155 headless, eigenes leeres Profil): `http://127.0.0.1:8124`
mit der Demo und `file://` mit einer Kopie unter `/tmp` und synthetischen Daten – Kontrollfall P54, eigene Änderung mit
fremdem Wert, Navigation weg und zurück, gleichzeitige Übernahmeanfragen, Lesemodus ohne Web Locks; Writer-Intervalle aller
Tabs ohne Überschneidung; P64 mit echten Klicks und Eingaben (CDP) einschließlich Neuladen. bfcache ist nur für HTTP belegt (`pagehide`/`pageshow` mit `persisted: true`,
Navigationstyp `BackForwardCacheRestore`); Chrome nutzt ihn für `file://` nicht (`SchemeNotHTTPOrHTTPS`), dort lädt die
Rückkehr neu. Nicht geprüft: Safari (macOS/iOS), iPhone-PWA, Firefox, ein vom Browser eingefrorener Hintergrund-Tab
(`freeze`, nur im Testbrowser) und ein echter Betriebssystem-Absturz.

**Mehrere Fenster (seit Version 13 der App, ohne Formatänderung; bleibt als zweite Sicherung):** Alle Fenster derselben
Herkunft teilen sich einen Speicher. Der Speicher merkt sich den zuletzt gelesenen Stand und
prüft vor jedem Schreiben, ob ein anderes Fenster inzwischen gespeichert hat. Dann übernimmt er
dessen Stand und lehnt die eigene Änderung ab (Fehler mit `code: 'CONFLICT'`), statt sie darüber
zu schreiben. Einen Stand, den diese App-Version nicht lesen kann (z. B. von einer neueren
Version), überschreibt er nie. `reload()` übernimmt einen fremden Stand ohne zu schreiben; die App
ruft es beim `storage`-Ereignis auf, sobald nichts bearbeitet wird, und zeichnet die Seite neu.
Ein Schreibvorgang ohne inhaltliche Änderung schreibt nichts. Tests: `.tests/concurrency.test.cjs`.

## Prüfung und Demo

```sh
node --test .tests/data-model.test.cjs
node .scripts/build-demo.cjs
```

Die Tests vergleichen Monatswerte, Budget und die Eingaben der Prognose mit dem
Stand vor der Migration (`1f17a25`). Die Prognose-Ergebnisse selbst vergleichen sie seit der
Fehlerbehebung P18–P29 zwischen migrierten und frisch importierten Daten, weil sich das
Rechenmodell bewusst geändert hat (siehe PROBLEME.md, Abschnitt 0). Sie prüfen außerdem Gerätewechsel,
Umbenennungen, archivierte Daten, ungültige Importe, Speicherfehler und die
tatsächlichen Export-/Importfunktionen. `demo_backup.json` ist die Demo für
die App und die **Quelle**: Sie wird in der App bearbeitet und exportiert.
`.scripts/build-demo.cjs` ändert keine Inhalte, sondern normalisiert die Datei (aktuelle
`schemaVersion`, ohne `exportedAt`, ohne den Live-Monat eines Exports) und erzeugt daraus
`demo_backup.js` für die lokal geöffnete App. Die Demo-Datei steht derzeit auf Schema 15 (in der Review-Runde
P34–P38 bewusst nicht verändert); die App lädt sie verlustfrei in Version 16. Inhalte ändern nur bewusste, einzeln dokumentierte
Schritte wie `.scripts/demo-quote-history.cjs` (Historie aus Kursen). `.tests/demo_export.csv` bleibt eine Test- und
Kompatibilitätsvorlage; die frühere CSV-basierte Fassung des Skripts steht in der Git-Historie
(`7504901`).

Die JSON-Demo zeigt einen fiktiven Haushalt (Max, Anna und Lena, Jahrgang 2019) mit 34 Monatsständen von
Januar 2024 bis Oktober 2026: Konten, zwei ETFs, die Einzelaktien Apple, Amazon und Nestlé,
getrennte Bitcoin- und Ethereum-Positionen, physisches Gold, Wohnung, Familienauto und seit
Januar 2026 Garagen (60.000 €, mit Abschreibung) über den „Kredit Garagen“ in eigener Gruppe.
Die Altersvorsorge-Positionen sind archiviert. Wohnungs-, Auto- und Garagenkredit sind mit
ihren Assets verknüpft; Restschulden stammen aus vollständigen Annuitätenverträgen einschließlich
datierter Sondertilgungen. Budget (Januar 2026: 5.384 € Einnahmen inkl. 259 € automatisches Kindergeld,
1.661 € Ausgaben, 1.850 € Kreditraten, 825 € Sparen; die Gehälter sind Max und Anna zugeordnet), Daueraufträge,
Rentenangaben (Anna arbeitet bis 67; Lenas Kinderzulage zählt bei Anna), Lebensphasen (Ansparen bis 50,
Max im Weiterarbeiten bis 60 mit 50 %: seit Schema 15 sinkt damit sein dem Budget zugeordnetes Gehalt),
zwei Altersvorsorgedepots ab 2027 und Prognoseereignisse sind enthalten; die automatischen
Kreditraten werden nicht zusätzlich als manuelle Budgetposten gezählt.
ETFs, Bitcoin, die drei Aktien und Ethereum werden mit Live-Kurs bewertet; der gespeicherte Kurs
ist der Rückfall ohne Netz. Ihre Historie (Stückzahlen erfunden) ist mit echten Monatsschlusskursen
bewertet: `.scripts/demo-quote-history.cjs` wendet „Werte aus Kursen übernehmen“ mit den Kursen aus
`.scripts/demo-prices.json` (abgerufen am 14.10.2026) an. Nestlé hat erst ab Mai 2025 Kurse; davor
bleiben die erfundenen Werte. Alle Bestände und Annahmen sind erfundene Beispiele.
Konten enthalten keine IBAN.

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
Hochrechnung. Seit Version 19 siehe „Entgeltpunkte laut EM-Bescheid, Untergrenze und Schätzung“
(Gesamtwert laut Bescheid und Zurechnungszeit als Teil davon; rechnerische Untergrenze in persönlichen Entgeltpunkten).

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
| 1 Ansparen | heute | Sparraten je Anlage, `savingsGrowthPercent`; seit Version 15 `phase1WorkPercent` (deine Arbeitszeit, Standard 100) |
| 2 Weiterarbeiten | `saveUntilAge` | `phase2WorkPercent` (Arbeitszeit, Standard 100, seit Version 15: wie Phase 1), `phase2SavingPercent` (private Vermögensbildung in % der heutigen Sparraten, Standard 0), `phase2PensionPercent` (Altersvorsorge in % der heutigen Beiträge, Standard 100, ab Version 11), `phase2MonthlyWithdrawal` (€/Monat, Standard 0) |
| 3 Vorruhestand | `retirementAge` | `monthlySpending` aus dem liquiden Vermögen; ab Version 11 optional `phase3SavingPercent` und `phase3PensionPercent` (Standard 0) |
| 4 Rente | `pensionStartAge` | `pensionSpending` (Standard: wie `monthlySpending`) |

- Die Grenzen folgen aufeinander: Phase 2 beginnt bei `min(saveUntilAge, retirementAge)`,
  Phase 4 bei `max(retirementAge, pensionStartAge)`. Eine Phase ohne Dauer entfällt.
- `pensionStartAge` fehlt: Rentenbeginn der gesetzlichen Rente (`statutoryPension.retirementAge`)
  bzw. die Regelaltersgrenze. Eine gesetzliche Rente ohne eigenes Alter beginnt mit Phase 4;
  stimmt ihr Alter mit Phase 4 überein, zieht das Phasen-Sheet es beim Verschieben mit
  (ebenso das Antragsalter der Beamtenversorgung).
- Rentenpunkte und Dienstzeit wachsen je Phase anteilig zur Arbeitszeit (seit Version 15 relativ zur
  Arbeitszeit von heute, Dienstzeit als Anteil einer Vollzeitstelle).
  Altersvorsorge (Sparraten der Gruppen mit Kategorie `bav` und Beiträge eigener
  Altersvorsorgedepots) läuft in Phase 1 voll, in Phase 2 und 3 mit dem jeweiligen Prozentsatz,
  danach nicht mehr; die Depot-Hochrechnung rechnet das Monat für Monat (seit 15.10.2026; vorher Jahr für Jahr mit dem
  Alter zur Jahresmitte).
  Weitere Personen haben seit Version 15 eigene Werte je Phase (Abschnitt „Arbeitszeit und
  Altersvorsorge je Lebensphase“).
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

## Monatsstand und Stichtag

Ein Monatsstand `M` ist der Stand beim Wechsel in den Monat `M`. Der Live-Monat („Heute“) ist der
Folgemonat (`nextYM()`, Entscheidung 14.10.2026: bleibt so) und friert ein, wenn der Kalender in
diesen Monat wechselt. Historische Kurswerte rechnen deshalb mit dem Schlusskurs des Vormonats
(VERMOEGEN.md, 4.6). Budget und Prognose leiten den Kalendermonat daraus ab (`_budgetYM()`,
`latestKey`).

## Konten im Geldfluss (Version 20)

Seit 16.10.2026 können Einnahmen und Ausgaben einem Konto zugeordnet werden; die Daten-Seite prüft damit die
Daueraufträge (BUDGET.md, Abschnitt 5) und ermittelt fehlende.

| Feld (seit Version 20, optional) | Inhalt | Legacy |
| --- | --- | --- |
| `budget.items[].accountId` | Konto des Postens: Eingang (Einnahme) bzw. Abbuchung (Ausgabe, Sparen) | `budgetData.<kategorie>[].account` (Kontoname) |
| `loans[].accountId` | Konto, von dem die Rate abgebucht wird (auch Zins, Tilgung, Sondertilgung) | `loanParams[id].account` |
| `retirement.children[].accountId` | Konto, auf das das Kindergeld kommt | `lt-children[].account` |
| `retirement.pensionDepots[].accountId` | Konto, von dem der eigene Beitrag abgebucht wird (die Zulage fließt direkt ins Depot) | `lt-av-depots[].account` |

- Jeder Verweis zeigt auf `accounts[].id` (Prüfung: unbekanntes Konto wird abgelehnt). In den Legacy-Werten steht wie bei
  Daueraufträgen der **Kontoname**; `fromLegacy` löst ihn am Ende auf, wenn die Konten feststehen. Ein unbekannter Name
  entfällt, statt einen toten Verweis zu speichern.
- Umbenennen eines Kontos zieht alle Verweise mit (`_renameAccountRefs`, in einer Transaktion), Löschen entfernt sie nach
  Rückfrage (die Rückfrage nennt die Zahl der betroffenen Einträge).
- Migration 19 → 20: keine; ältere Dokumente haben keine Konten-Verweise und bleiben unverändert. Ein Dokument mit
  Version 20 lehnt eine ältere App ab: Sicherungen erst importieren, wenn alle Geräte aktualisiert sind.

## Entgeltpunkte laut EM-Bescheid, Untergrenze und Schätzung (Version 19)

Anforderung vom 15.10.2026: die gesamten Entgeltpunkte laut Rentenbescheid und den darin enthaltenen Anteil der
Zurechnungszeit erfassen; die App leitet daraus die Werte für die Altersrente ab, ohne Punkte doppelt zu zählen.

| Feld | Inhalt | Legacy |
| --- | --- | --- |
| `statutoryPension.disabilityTotalPoints` (neu) | Entgeltpunkte gesamt laut EM-Bescheid, mit Zurechnungszeit (≥ 0) | `lt-drv.emTotal`, `lt-drv-extra[].emTotal` |
| `statutoryPension.disabilityCreditedPoints` | seit Version 19 der **darin enthaltene** Anteil der Zurechnungszeit (≤ Gesamtwert); in Version 18 zusätzlich zu `points` | `emZz` |
| `statutoryPension.points` | bei einer EM-Rente mit Gesamtwert nicht erlaubt (> 0); ohne Gesamtwert Rentenpunkte aus einer früheren Version | `points` |

Prüfung (Version 19, nur mit EM-Art 1 oder 2): `disabilityCreditedPoints` verlangt `disabilityTotalPoints` und ist höchstens
so groß; `points > 0` neben `disabilityTotalPoints` wird abgelehnt. Ohne EM-Art bleiben EM-Felder wirkungslos und werden
nicht geprüft (wie bisher).

Abgeleitet (`_emPoints`, `_emPep`, `calcEm`, `calcDrvPension`):
- **Tatsächlich erworben** = Gesamtwert − Zurechnungszeit. Nur diese Punkte zählen in der Altersrente aus Punkten, dazu
  neue Punkte aus Beschäftigung ab heute. Andere beitragsfreie Zeiten (Schule, Krankheit …) bleiben darin, weil sie auch
  in der Altersrente zählen.
- **EM-Rente** ohne Zahlbetrag: Gesamtwert × Zugangsfaktor × Rentenartfaktor × Rentenwert × (1 − Abzüge).
- **Zugangsfaktor der alten Punkte** (§ 77 Abs. 3 SGB VI): der der EM-Rente; bei **teilweiser** EM nur für die Hälfte,
  die andere Hälfte mit dem der Altersrente (Satz 2), z. B. 0,5 × 0,892 + 0,5 × 1,0 = 0,946.
- **Rechnerische Untergrenze nach heutigem Rentenrecht** (Besitzschutz, § 88 Abs. 1 Satz 2; bis 15.10.2026 als
  „gesicherte Mindestleistung“ bezeichnet): Sie bezieht sich auf persönliche Entgeltpunkte, nicht auf einen garantierten
  Nettobetrag. Persönliche Entgeltpunkte der EM-Rente (Gesamtwert ×
  Zugangsfaktor) × Rentenartfaktor 1,0 × Rentenwert × (1 − Abzüge), wenn die Altersrente spätestens 24 Monate nach dem
  Ende der EM-Rente beginnt. Ohne Gesamtwert aus dem Zahlbetrag zurückgerechnet (Zahlbetrag ÷ (Rentenartfaktor ×
  Rentenwert × (1 − Abzüge))) – das ergibt wie bisher den doppelten Zahlbetrag bei teilweiser EM.
- **Geschätzte Altersrente** = der höhere Wert aus Punkten und Untergrenze; damit rechnet die Prognose. Beides ist als
  **vereinfachte Modellrechnung** gekennzeichnet (Ergebniszeile, Erklärung, Zeile im Einkommen): Die tatsächliche Bewertung
  der Zurechnungszeit und späterer Beitragszeiten kann abweichen; der Nettobetrag hängt vom künftigen Rentenwert, von
  Beiträgen und Steuern ab.
- **Nicht berechnet** (in Ergebniszeile und Erklärung genannt): Die Zeit der EM-Rente zählt in der Altersrente als
  Anrechnungszeit (§ 58 Abs. 1 Satz 1 Nr. 5); Monate mit Beiträgen bekommen mindestens deren Wert (§ 71 Abs. 2). Die
  Altersrente kann deshalb höher ausfallen als geschätzt. Punkte aus einer Beschäftigung zwischen Bescheid und heute sind
  nicht enthalten.

Migration 18 → 19 (`moveDisabilityPoints`, Bedeutung bleibt erhalten):
- EM-Rente mit getrennter Zurechnungszeit: `disabilityTotalPoints = points + disabilityCreditedPoints`, `points` entfällt;
  die tatsächlichen Punkte (Gesamtwert − Zurechnungszeit) sind genau die bisherigen `points`.
- EM-Rente mit Rentenpunkten ohne Zurechnungszeit: offen, ob die Punkte sie enthalten. Sie bleiben unverändert und
  rechnen wie bisher (als tatsächlich erworben; Untergrenze aus dem Zahlbetrag). Die Karte „Nach dem Update“ bietet
  „Entgeltpunkte der EM-Rente klären“ an: Die Person wählt, ob die Punkte der Gesamtwert laut Bescheid (mit
  Zurechnungszeit) oder die tatsächlich erworbenen sind, trägt die Zurechnungszeit ein und sieht Vorher/Nachher
  (`openEmPointsSheet`, `_applyEmLegacy`). Ohne Entscheidung bleibt alles wie bisher.
- EM-Felder ohne EM-Art: unverändert (wirkungslos).
- Ein Dokument mit Version 19 lehnt eine ältere App ab; Sicherungen erst importieren, wenn alle Geräte aktualisiert sind.
- Tests: `.tests/em-old-age.test.cjs`.

## Zurechnungszeit, Zugangsfaktor und Besitzschutz (Version 18, seit Version 19 abgelöst)

Anforderung vom 15.10.2026: tatsächlich erworbene Entgeltpunkte und Zurechnungszeit getrennt erfassen, bei der Umwandlung
in die Altersrente Zugangsfaktor, Rentenartfaktor und Besitzschutz berücksichtigen, individuelle Hinzuverdienstgrenzen
ermöglichen.

| Feld (seit Version 18) | Inhalt | Legacy |
| --- | --- | --- |
| `statutoryPension.disabilityCreditedPoints` | Entgeltpunkte aus der Zurechnungszeit laut Bescheid (≥ 0), getrennt von `points` (nur tatsächlich erworbene Punkte) | `lt-drv.emZz`, `lt-drv-extra[].emZz` |
| `statutoryPension.disabilityAccessFactor` | Zugangsfaktor der EM-Rente laut Bescheid (> 0 bis 1; fehlt = 0,892) | `lt-drv.emZf`, `lt-drv-extra[].emZf` |

Bei der eigenen Person und bei weiteren Personen. `earningsLimit` gilt seit Version 18 bei **beiden** Arten (Grenze laut
Bescheid; fehlt = gesetzliche Grenze 2026: teilweise 41.527,50 €, voll 20.763,75 €). Vorher wurde sie bei voller EM
verworfen und bei teilweiser mindestens auf die gesetzliche Grenze angehoben.

Rechnung (`calcEm`, `calcDrvPension`):
- **EM-Rente**: der Zahlbetrag laut Bescheid; fehlt er, aus Punkten: (Punkte + Zurechnungszeit) × Zugangsfaktor ×
  Rentenartfaktor (teilweise 0,5, voll 1,0) × Rentenwert × (1 − Abzüge). Mit beiden Angaben vergleicht die App und weist
  bei mehr als 15 % Abweichung darauf hin.
- **Altersrente aus Punkten** (§ 77 Abs. 3 SGB VI): Punkte, die schon Grundlage der EM-Rente waren, behalten deren
  Zugangsfaktor; neue Punkte aus Beschäftigung zählen mit dem Faktor der Altersrente (nach einer bis zur Regelaltersgrenze
  laufenden EM-Rente 1,0). Die Zurechnungszeit zählt hier nicht mit.
- **Besitzschutz** (§ 88 Abs. 1 Satz 2 SGB VI): Beginnt die Altersrente spätestens 24 Monate nach dem Ende der EM-Rente,
  mindestens deren persönliche Entgeltpunkte mit Rentenartfaktor 1,0 (bei teilweiser EM das Doppelte des Zahlbetrags).
  Angesetzt wird der höhere Wert.
- Nicht abgebildet: die Erhöhung des Zugangsfaktors für Monate ohne EM-Bezug vor der Altersgrenze (§ 77 Abs. 3 Satz 3),
  wenn die EM-Rente früh endet; dann rechnet die Altersrente mit dem normalen Zugangsfaktor.
- Migration 17 → 18: keine Umwandlung (nur neue, optionale Felder). Ein Dokument mit Version 18 lehnt eine ältere App ab
  (zum Beispiel die Mac-Kopie vor dem Update); Sicherungen deshalb erst importieren, wenn beide Geräte aktualisiert sind.
- Tests: `.tests/em-conversion.test.cjs`.

## Altersvorsorge je Person und Arbeitszeit am Gehalt (Version 17)

Entscheidung 14.10.2026: Jede Altersvorsorge gehört zu einer Person; die Arbeitszeit von heute steht beim Gehalt.

| Feld (seit Version 17) | Inhalt | Legacy |
| --- | --- | --- |
| `retirement.people[].civilServicePension` | Beamtenversorgung einer weiteren Person, Felder wie bei `primary.civilServicePension` (`pensionableSalary`, `serviceYears`, `retirementAge`, `startAge`, `deductionPercent`). Dienstjahre wachsen nach ihrer Arbeitszeit je Phase (Anteil Vollzeit), Pension ab ihrem Pensionsbeginn | `lt-drv-extra[].bv` = `{pay, years, age, from, deduct}` |
| `budget.items[].workPercent` | Arbeitszeit zum Gehalt in % einer Vollzeitstelle (> 0 bis 100), nur bei Einnahmen mit `personId` und ohne `retirementIncome`. Die Summe je Person (höchstens 100) ist ihre Arbeitszeit heute (Phase 1); fehlt sie, gilt `phase1WorkPercent` bzw. 100. Wird die Person gelöscht, entfallen `personId` und `workPercent` | `budgetData.einkommen[].workPct` |

- Migration 16 → 17: keine Umwandlung nötig (nur neue, optionale Felder); ältere Dokumente lesen sich unverändert.
- Die Eingabefelder: Beamtenversorgung je Person unter Daten → Altersvorsorge, Arbeitszeit im Budget-Eintrag des Gehalts.
- Tests: `.tests/household.test.cjs` (Beamtenversorgung weiterer Personen, Arbeitszeit am Gehalt), `.tests/civil-pension.test.cjs`.

## Daten aus früheren Versionen erhalten (Version 16)

Unabhängiges Review vom 14.10.2026, Befunde P35–P37 (siehe PROBLEME.md, Abschnitt 0): Eine Migration verändert
nichts fachlich. Was sich nicht eindeutig übertragen lässt, bleibt als Originalwert stehen, rechnet wie in der früheren
Version und wird in der App unter Daten → „Nach dem Update“ geklärt, jeweils mit Vorher/Nachher.

| Feld (seit Version 16) | Inhalt | Legacy (`lt-drv-extra`, `lt-av-depots`) |
| --- | --- | --- |
| `retirement.people[].monthlyNetIncome` | Nettogehalt aus Schema 13, noch keinem Budgetposten zugeordnet (≥ 0). Zählt wie damals nur in der Prognose als Gehalt der Person (nicht im Budget und nicht in der Einkommensänderung während deiner Arbeit), solange ihr kein Budgetposten zugeordnet ist | `net` |
| `retirement.people[].partTimeFromAge`, `partTimePercent` | Teilzeit ab einem Alter der Person aus Schema 14 (beide zusammen, Alter > 0, Anteil 0 bis unter 100, vor `workUntilAge`). Rechnet genau wie in Schema 14: voll bis zum Beginn, danach der Anteil; hat sie schon begonnen, ist das Budget-Gehalt bereits das Teilzeitgehalt. Schließt `phase<n>WorkPercent` aus | `ptFrom`, `ptPct` |
| `retirement.pensionDepots[].unresolvedChildBirthYears` | frühere Kinder-Jahrgänge, die kein ganzes Jahr 1900–2200 sind (z. B. 2019.5), unverändert. Für die Kinderzulage zählen sie wie in der früheren Version (vierstellige Jahreszahl im Text, je Person höchstens so oft wie in einem ihrer Depots) | `kidsOpen` |

- **Migration ≤ 13 → 16:** gültige Kinder-Jahrgänge an Depots werden Kinder (wie in Version 14), die übrigen kommen nach
  `unresolvedChildBirthYears`. Das Laden scheitert daran nicht mehr.
- **Migration 13 → 16:** `monthlyNetIncome` wird nur dann einem Budgetposten zugeordnet (und entfernt), wenn genau ein
  freier Einnahmeposten den Namen der Person enthält und denselben Monatsbetrag hat. Es entsteht nie ein zusätzlicher
  Budgetposten; neue Posten legt nur die Klärung in der App an, wenn du es auswählst.
- **Migration 14 → 16:** Teilzeit ab Alter bleibt. Die Umstellung („Teilzeit umstellen“) setzt `phase<n>WorkPercent` der
  gewählten Phase und entfernt beide Felder.
- **Stand vor dem Update:** Vor dem ersten Speichern eines Dokuments älterer Version legt der Speicher dessen
  unveränderten Rohtext unter `vermoegen-data-v1-before-update` ab (nur der letzte; kein Teil der Sicherungsdatei). Das
  gilt auch für ein älteres Dokument, das ein anderes Fenster ablegt, während dieses noch auf das Schreibrecht wartet (P65).
  Herunterladen über die Karte „Nach dem Update“ oder Daten → Sicherung („Stand vor dem Update sichern“).
  „Alle Daten löschen“ ruft `clear({discardBackup: true})`: Das leere Dokument wird ohne neue Kopie geschrieben und
  die vorhandene Kopie entfernt (Persona-Befund A7, 14.10.2026). Scheitert das Speichern (nur ansehen, veraltet),
  bleiben Dokument und Kopie unverändert. `clear()` ohne Option sichert wie bisher.
- **Weitere Schlüssel (kein Teil des Dokuments, Review P34):** `vermoegen-writer` (Marke des schreibenden Fensters:
  `id`, `state` active/released, `at`, bei Ablehnung einer Bitte `busyFor` und `req`) und `vermoegen-writer-request`
  (Bitte um Übergabe: `id`, `at`). Beide sind nur Hinweise für die Übergabe; die Web Lock selbst schützt (siehe
  „Schreibrecht zwischen Fenstern“).
  Siehe „Mehrere Fenster“ unter „Migration und Import“.
- Tests: `.tests/data-safety.test.cjs`, `.tests/persons.test.cjs`.

## Arbeitszeit und Altersvorsorge je Lebensphase (Version 15)

Entscheidung 14.10.2026: Alle Lebensphasen-Parameter stehen im Lebensphasen-Sheet der Prognose. Für jede erwachsene
Person gibt es je Phase (Phasen in deinem Alter: 1 Ansparen, 2 Weiterarbeiten, 3 Vorruhestand, 4 Rente) eine
Arbeitszeit und einen Anteil der Altersvorsorge, z. B. Phase 1: du Vollzeit, Anna Teilzeit; Phase 2: du 50 %, Anna 25 %.

| Feld | Inhalt | fehlt |
| --- | --- | --- |
| `forecast.settings.phase1WorkPercent` | deine Arbeitszeit in Phase 1 in % einer Vollzeitstelle (0–100). Legacy `lt-p1-work` | 100 |
| `forecast.settings.phase2WorkPercent` | wie bisher, Phase 2 (Ich arbeite ab Phase 3 nicht mehr) | wie Phase 1 |
| `forecast.settings.phase2PensionPercent`, `phase3PensionPercent` | wie bisher: deine Altersvorsorge in % der heutigen Beiträge | solange du arbeitest 100 %, danach 0 (= bisherige Standardwerte) |
| `people[].phase<n>WorkPercent` (n = 1–4) | Arbeitszeit der Person in Phase n (0–100). Legacy `w1` … `w4` in `lt-drv-extra` | wie in der Phase davor, Phase 1: 100 |
| `people[].phase<n>PensionPercent` (n = 2–4) | Altersvorsorge der Person in Phase n (0–200 % der heutigen Beiträge). Legacy `pen2` … `pen4` | solange sie arbeitet (vor `workUntilAge`) 100 %, danach 0 |

- Das Budget-Gehalt einer Person gilt für die Arbeitszeit der Phase, in der heute liegt; in anderen Phasen zählt
  Gehalt × Arbeitszeit ÷ Arbeitszeit heute. Nach `workUntilAge` arbeitet die Person nicht mehr.
- **Migration 14 → 15 (historisch, ersetzt):** Im Stand `1b57aa8` wurden `partTimeFromAge`/`partTimePercent` der
  Phase zugeordnet, in der die Teilzeit überwiegt. Das verlor den genauen Beginn (Review P36). Seit Version 16 bleiben
  beide Felder erhalten, siehe unten. Ein bereits so migriertes Dokument lässt sich nicht automatisch zurückholen.
- Tests: `.tests/household.test.cjs` (Arbeitszeit je Phase), `.tests/persons.test.cjs` (Schema 15, Migration).

## Personen und Kinder (Version 14)

Entscheidung 14.10.2026: Der Haushalt besteht aus Personen. Einkünfte und Altersvorsorge werden ihnen zugeordnet;
Kindergeld und Kinderzulage leitet die App aus den Kindern ab.

| Feld | Inhalt |
| --- | --- |
| `retirement.primary` | „Ich“ (ID bleibt, z. B. `person-main`). `name` ist seit 15.10.2026 änderbar (Daten → Haushalt → Ich, höchstens 40 Zeichen; App-Schlüssel `lt-own-name`, kein Schemawechsel). Leer = Standardname „Eigene Person“, den die App nie anzeigt (dort „Ich“); ein eigener Name steht überall, wo du neben anderen Personen genannt wirst |
| `retirement.people[]` | weitere Erwachsene: `id`, `name`, `birthYear`, `workUntilAge`, `statutoryPension`; seit Version 15 optional je Lebensphase `phase1WorkPercent` … `phase4WorkPercent` und `phase2PensionPercent` … `phase4PensionPercent` (siehe oben). Arbeitszeit, Altersvorsorge, `workUntilAge` und `statutoryPension.retirementAge` werden im Lebensphasen-Sheet gepflegt, die übrigen Felder auf der Haushaltskarte |
| `retirement.children[]` | Kinder: `id` (`child-…`), `name`, `birthYear`; optional `birthMonth` (1–12, fehlt = Januar), `childBenefitUntilAge: 25` (Ausbildung; fehlt = 18), `allowanceParentId` (Erwachsener, bei dem die Kinderzulage zählt; fehlt = ich). Das Feld fehlt ohne Kinder. Legacy-Schlüssel `lt-children` (`by`, `bm`, `until`, `parent`) |
| `budget.items[].personId` | nur bei Einnahmen: wessen Einkommen (fehlt = Haushalt, z. B. Miete). Das Gehalt einer weiteren Person ist der Ø ihrer zugeordneten Einnahmen ohne „Auch im Ruhestand“. Legacy `person` |
| `retirement.incomes[].personId` | weitere Einkunft einer weiteren Person; `fromAge`/`untilAge` gelten dann in deren Alter (fehlt = ich). Legacy `person` |

- IDs sind über eigene Person, weitere Personen und Kinder eindeutig. Wird eine Person gelöscht, fallen ihre
  Zuordnungen weg (Einnahmen werden Haushalt, Einkünfte und Kinderzulage gehören dann mir); Beträge bleiben.
- **Kindergeld** wird nicht gespeichert, sondern berechnet: 259 € je Kind und Monat (§ 66 Abs. 1 EStG, Stand 2026) vom
  Geburtsmonat bis zum Monat des 18. bzw. 25. Geburtstags (§ 66 Abs. 2, § 32 Abs. 3, Abs. 4 Nr. 2 EStG). Es erscheint
  als automatische Budgetzeile und ersetzt einen eigenen Posten, dessen Name „Kindergeld“ enthält.
- **Migration nach 14:** Schema 13: `people[].monthlyNetIncome` wird dem eindeutig passenden, noch nicht zugeordneten
  Einnahmeposten zugeordnet (Name enthält den Namen der Person), sonst entsteht „Nettogehalt <Name>“ mit dem Betrag
  in allen zwölf Monaten (ohne Budget: Budget mit diesem Posten). Alle Versionen bis 13:
  `pensionDepots[].childBirthYears` werden Kinder („Kind (2019)“); wie bisher zählt jedes Kind bei der zuerst genannten
  Person und ein Jahrgang so oft, wie er in einem Depot dieser Person steht, die Kinderzulage rechnet also gleich.
  Danach sind beide Felder nicht mehr erlaubt; ein Import mit ihnen in Version 14 wird abgelehnt.
- `Data.migrate(doc)` führt das beim Laden, beim Import und in `.scripts/build-demo.cjs` aus.
- Tests: `.tests/persons.test.cjs`, `.tests/household.test.cjs`, `.tests/setup.test.cjs` (Haushalt).

## Geburtsmonat, Nettogehalt weiterer Personen, Einkünfte mit Ende (Version 13)

- `retirement.primary.birthMonth`: ganze Zahl 1–12 (fehlt = Januar). Das Alter wird auf den Monat
  genau gerechnet. Weitere Personen haben denselben Geburtsmonat (Modellannahme).
- `retirement.people[].monthlyNetIncome`: Nettogehalt dieser Person in €/Monat (≥ 0, nur weitere
  Personen; Legacy-Feld `net` in `lt-drv-extra`). **Nur in Version 13**; seit Version 14 kommt das Gehalt aus
  den zugeordneten Budget-Einnahmen (siehe oben, Migration).
- `retirement.incomes[].untilAge`: optionales Ende einer weiteren Einkunft (größer als `fromAge`;
  Legacy-Feld `until` in `lt-pensions`). Fehlt es, läuft die Einkunft lebenslang.
- **Migration:** Dateien der Versionen 1–12 werden ohne Änderung übernommen (die neuen Felder
  fehlen dann). Der Import lehnt ab: Geburtsmonat außerhalb 1–12 oder nicht ganzzahlig, negatives
  Nettogehalt, Nettogehalt bei der eigenen Person, Ende vor oder gleich dem Beginn. Unvollständige
  Eingaben in der App (z. B. Ende kurz vor dem Beginn während des Tippens, Monat 13) speichert der
  Adapter nicht, statt den Speichervorgang abzulehnen. Tests: `.tests/pension-rules.test.cjs`.

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
ohne Fachbegriffe: heutiges Vermögen, monatliches Sparen, der Zinseszins, die vier Lebensphasen, die
Marktsimulation, große Ereignisse, eine Einschätzung (Stufe, Tacho, bis zu drei Punkte; keine Anlageberatung) und
ein Fazit; seit 16.10.2026 bunt mit Bildern und Witzen. Alle Werte kommen aus `buildPlan()` und der
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

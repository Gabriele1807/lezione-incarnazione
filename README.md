# Il dogma dell'incarnazione — presentazione per proiezione

Lezione di catechesi (per un altro relatore, fuori dal ciclo «La Bibbia e il Corano"). **Lezione unica**: segue
solo la struttura del documento del relatore, con un'identità grafica propria e immagini proprie; nessuna slide,
nessun dipinto e nessuna palette della Lezione 1, nessuna parola araba. 26 scene, 6 tappe, tutto offline.

## Come aprirla
Doppio click su `index.html` (Edge o Chrome). Il primo click o tasto attiva lo schermo intero.
Proiezione senza barre: `msedge --kiosk "file:///…/index.html" --edge-kiosk-type=fullscreen`. PC lenti: `index.html?statico`.

## Comandi
click / → / spazio / PagGiù / Invio = avanti · ← / PagSu = indietro · `M` vista d'insieme · `I` indice ·
numero + `Invio` salta a una slide · `F` fullscreen · `Esc` esce.
Nelle tabelle delle slide 7, 15 e 19 le risposte compaiono una per click (al loro posto un «?»).

## Identità grafica «Icona»
Fondo blu lapislazzuli profondo `#0A1531`, oro brunito `#D2AE5C`, rosso cinabro `#C2452F`, avorio `#F4ECD8`.
Ogni scena sta in una cornice a doppio filetto d'oro; titoli in maiuscoletto spaziato e centrati con un rombo
di cinabro; citazioni in cartigli blu (senza filo laterale), etichetta con la croce ✠; riquadri come pannelli
d'icona con il capo in cinabro; fascia del messaggio chiave in cinabro. Le icone delle scene d'apertura stanno
in una **nicchia ad arco**, come su un'iconostasi. Stile nel blocco «IDENTITÀ ICONA» in fondo a `css/style.css`.
Colori delle fonti: oro = Scrittura · cinabro chiaro = Messa, liturgia, Padri.

## Vista d'insieme: la Tenda
Giovanni 1:14: il Verbo «venne ad abitare» (letteralmente *pose la tenda*) in mezzo a noi. La vista d'insieme è
la **pianta del tabernacolo**, disegnata per intero: il recinto dell'atrio con le cortine di lino e le colonne di
bronzo, la porta tessuta in blu, porpora, scarlatto e lino; la tenda con le assi d'oro e il suo ingresso tessuto;
il velo che separa il Santo dal Santo dei Santi, squarciato dove passa il cammino (Matteo 27:51); la gloria che
risplende sull'arca. Non c'è un sentiero: c'è l'**asse processionale** dritto, da oriente a occidente, e ogni
parte della lezione è un luogo del tabernacolo:

| Luogo | Parte |
|---|---|
| La porta | Apertura |
| L'altare degli olocausti | I · Il Verbo si fece carne |
| La conca | II · Come avvenne |
| Il candelabro (nel Santo, con la tavola dei pani) | III · Il mistero |
| L'altare dell'incenso (davanti al velo) | IV · La salvezza |
| L'arca dell'alleanza (Santo dei Santi) | V · L'amore divino |

Il luogo della parte in corso si illumina; il tratto d'asse percorso si accende d'oro; atrio, Santo e Santo dei
Santi si accendono quando tutte le loro parti sono state viste. Il pulsante della mappa (in alto a destra) è una
piccola pianta del tabernacolo. Codice: `TENT_X` e blocco «LA TENDA» in `js/app.js`; stili «pianta del
tabernacolo» in fondo a `css/style.css`.
Movimenti: zoom dalla mappa nella tappa, volo lungo il cammino tra le parti, **zoom nel dettaglio** dall'icona
dell'Annunciazione di Ustjug (il Bambino nel grembo della Vergine) alla slide 10.

## Struttura (come nel documento)
| Parte | Slide |
|---|---|
| Apertura | 1 titolo · 2 la proclamazione (Giovanni 1:14, 1 Timoteo 3:16, 1 Giovanni 4:2,3) |
| I · Il Verbo si fece carne | 3–8: chi si è fatto uomo, corpo/anima/spirito, «si è incarnato e si è fatto uomo», perché un vero corpo (eresie), uguale all'uomo in tutto |
| II · Come avvenne | 9–12: lo Spirito Santo e la Vergine, san Cirillo e la liturgia, la natura di Adamo prima del peccato |
| III · Il mistero | 13–15: illimitato e limitato, «senza mescolanza…», fame, croce e Lazzaro |
| IV · La salvezza | 16–20: la strada della salvezza, perché l'uomo e non Satana, neonato/adulto/Cristo, giustizia e amore |
| V · L'amore divino | 21–26: la barriera e la venuta, di nuovo figli, l'immagine rinnovata, eterni come Dio, chiusura con la lode |

## Scelte di contenuto
- Testi del documento ripresi senza riformulare; ogni affermazione dottrinale ha il suo versetto.
- Giovanni 1:14, 1 Timoteo 3:16, 1 Giovanni 4:2,3 come nel documento (traduzione non CEI 2008: etichetta senza «CEI 2008»).
- «Salmo 50» → Salmo 51:7 (numerazione CEI).

## Immagini (pubblico dominio, Wikimedia Commons, in `assets/art/`)
Cristo Pantocratore (VI sec., Sinai) · Rublëv, Trinità (c. 1411, Tret'jakov) · Madre di Dio di Vladimir (XII sec.,
Tret'jakov) · Annunciazione di Ustjug (XII sec., Tret'jakov) · Natività (XV sec., Cattedrale dell'Annunciazione,
Mosca) · Santi Cirillo e Atanasio, icona · San Gregorio, icona (XV sec., Tret'jakov) · Anastasis (c. 1320, Chora,
Istanbul) · Michelangelo, Creazione di Adamo · Kramskoj, Cristo nel deserto (1872) · Rembrandt, I tre crocifissi
(1653, Met); La resurrezione di Lazzaro (c. 1630, LACMA); Il sacrificio di Isacco (1635) · Van Eyck, Agnello
mistico (1432, Gand) · Blake, Il sogno di Giacobbe (c. 1805) · Masaccio, Cacciata dal Paradiso (c. 1425).

## Verifiche (ultimo esito)
`strumenti\verifica.ps1`: **326/326** testi identici nella pagina; **26 scene, 0 fuori dal palco** a 1920×1080 e
1280×720. Guardate: vista d'insieme, slide 1, 2, 3, 5, 10, 12, 17, 26. Vista d'insieme iniziale e finale guardate
dopo il ridisegno del tabernacolo. Transizioni controllate nel DOM: 9→10 (zoom sull'icona), 9→8 e 20→21→20
(volo lungo l'asse tra le parti, con il tratto d'asse che si accende e si spegne).

## Da controllare a mano
- Testi liturgici e patristici del documento (san Cirillo, Messa gregoriana, «Il Santo da te nascerà», «la Sua
  Divinità non si è mai separata…», «Hai benedetto la mia natura in Te», «Prese ciò che era nostro…»).
- «Il Verbo di Dio divenne uomo per renderci dei» attribuita a San Gregorio come nel documento (spesso è citata
  da Atanasio, *L'incarnazione del Verbo* 54). La slide 7 attribuisce ad Ario, come nel documento, la tesi
  «corpo e anima, a cui poi si unì la divinità» (di solito associata ad Apollinare).
- Il pentimento di Adamo (slide 18) non ha un versetto esplicito.
- I versetti CEI 2008 aggiunti, parola per parola; le didascalie delle icone di Cirillo e Gregorio.
- Le transizioni in aula con → e ←.

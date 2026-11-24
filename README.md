# NightRider

Navigatore gratuito a tema neon, con mappa 3D, GPS, ricerca indirizzi, percorsi con guida vocale e avvisi sugli autovelox fissi. Funziona dal browser e si può installare come app su iPhone e Android.

## Come metterlo online con GitHub Pages

1. Su github.com crea un nuovo repository pubblico, per esempio `nightrider`.
2. Nel repository scegli "Add file", poi "Upload files". Trascina dentro **tutto il contenuto** di questa cartella (compreso `.nojekyll` e la cartella `icons`), non la cartella stessa. Conferma con "Commit changes".
3. Vai in "Settings", poi "Pages". In "Build and deployment" scegli "Deploy from a branch", branch `main`, cartella `/ (root)`, e salva.
4. Dopo uno o due minuti la pagina mostra l'indirizzo, di solito `https://TUO-NOME.github.io/nightrider/`. Apri quell'indirizzo dal telefono.

Serve l'indirizzo con `https`: senza, il browser non dà la posizione GPS. GitHub Pages lo fornisce.

## Installarlo come app

- **iPhone:** apri l'indirizzo in Safari, tocca Condividi, poi "Aggiungi a Home".
- **Android o radio Android:** apri l'indirizzo in Chrome, menù a tre puntini, "Installa app" o "Aggiungi a schermata Home".

Alla prima apertura consenti l'accesso alla posizione. Se il GPS non c'è o lo rifiuti, puoi provare tutto con la posizione di esempio a Milano e la simulazione.

## Come si usa

1. Scrivi la destinazione nella barra di ricerca e scegli un risultato.
2. Compaiono fino a tre percorsi diversi (più veloce, più breve, meno svolte, senza autostrade o alternativo). Avvia resta spento finché non ne scegli uno: toccane uno e la mappa lo evidenzia. "Avvia" parte con il GPS, "Prova senza muoverti" simula il percorso da fermo.
3. Sulla mappa: trascina con un dito, pizzica per lo zoom (con due dita puoi anche ruotare), oppure usa + e −. Se allontani ancora la vista si passa alla mappa del mondo e poi al globo intero; avvicinandoti si torna alla vista di guida. Le strade principali hanno un bordo al neon: fucsia per le autostrade, ambra per le extraurbane principali, ciano per le statali e viola chiaro per le provinciali; i nomi delle vie si possono spegnere dal menù. Il pulsante 2D/3D cambia la vista, il mirino riporta alla tua posizione.
3b. **Tocco lungo sulla mappa** (circa mezzo secondo): compare una scheda con il nome del posto. "Vai qui" calcola il percorso verso quel punto, "Aggiungi tappa" (con un percorso già scelto, anche mentre guidi) lo inserisce come tappa intermedia, numerata sulla mappa.
4. Durante la guida vedi la prossima svolta, gli avvisi autovelox, il limite e la velocità.
5. Nel menù in alto a destra: lingua (italiano, inglese, spagnolo, francese, tedesco), stile delle indicazioni (Classico, Cyberpunk, Divertente, Rockerboy, Netrunner; gli stili sono in italiano e inglese), voce (puoi usare qualsiasi voce installata sul dispositivo: nuove voci si scaricano dalle impostazioni di iPhone o Android, poi tocca "Aggiorna voci"), segnala un autovelox nella tua posizione, chiave TomTom opzionale.

## Traffico (opzionale)

Il traffico in tempo reale non esiste con servizi del tutto gratuiti e senza chiave. In alternativa puoi creare un account gratuito su developer.tomtom.com, copiare la tua chiave API e incollarla nel menù. Senza chiave l'app funziona comunque, con durate senza traffico.

## Da dove arrivano i dati

| Cosa | Servizio gratuito |
| --- | --- |
| Strade ed edifici | OpenStreetMap, tile vettoriali di OpenFreeMap |
| Autovelox e limiti di velocità | OpenStreetMap, tramite Overpass API (quattro server alternativi) |
| Mappa del mondo e globo | Tile di OpenFreeMap |
| Percorsi e indicazioni | OSRM (server pubblici) |
| Ricerca indirizzi | Photon e Nominatim |

La posizione e le destinazioni vengono inviate a questi servizi per ottenere i dati. Nient'altro lascia il dispositivo e l'app non usa un suo server.

## Limiti da conoscere

- **Traffico:** il traffico in tempo reale non è disponibile con servizi gratuiti. Le durate sono stime senza traffico.
- **Autovelox:** sono quelli fissi segnati su OpenStreetMap. Possono mancare, essere cambiati o non più attivi. Non ci sono avvisi sui controlli mobili.
- **Server pubblici:** sono pensati per un uso leggero. Con molti utenti vanno sostituiti con servizi propri o a pagamento.
- **Schermo spento:** su iPhone e su molti telefoni Android, con lo schermo spento o l'app in secondo piano il GPS si ferma. Per questo l'app chiede di tenere lo schermo acceso in navigazione.
- **Voce:** usa le voci installate sul dispositivo. Su alcune radio Android non c'è una sintesi vocale.
- **Sicurezza:** non usare l'app mentre guidi se non è fissata e rispetta sempre limiti e segnaletica.

## Per chi vuole modificarlo

Non serve nessuna compilazione: sono file statici (`index.html`, `app.css`, `app.js`, `lang.js`, `sw.js`, `manifest.webmanifest`). Per provarlo in locale avvia un server nella cartella, per esempio `python3 -m http.server 8000`, e apri `http://localhost:8000`. Il GPS funziona su `localhost` e su indirizzi `https`.

Dopo ogni modifica cambia il nome della cache in `sw.js` (`nightrider-v5`, poi `v6` e così via), così i telefoni scaricano la versione nuova.

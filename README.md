# @sforzinda/palio-giochi-ufficiali

Package condiviso (consumato come git submodule + alias di build, sullo stesso
modello di [`@sforzinda/palio-games`](https://github.com/Sforzinda/palio-games))
con le viste **ufficiali** del Palio di Vigevano: estrazioni, risultati live e,
in arrivo, l'inserimento dei risultati.

Consumato da:
- [`fantapalio`](https://github.com/Sforzinda/fantapalio) — sotto `/estrazioni-palio`, `/palio-live`, `/palio-live-mobile` (in fase di migrazione)
- [`palio-giochi-sito`](https://github.com/Sforzinda/palio-giochi-sito) — `giochi.paliodivigevano.it`, sotto `/estrazioni` e `/risultati`

Entrambi i consumatori si collegano allo **stesso progetto Supabase "Fanta"**
usato oggi da fantapalio (non quello dei minigiochi di `@sforzinda/palio-games`).

## Uso

Aggiungere come submodule e alias in `vite.config.ts`/`tsconfig.json`, come già
fatto per `palio-games` in fantapalio:

```ts
// vite.config.ts
resolve: {
  alias: {
    '@sforzinda/palio-giochi-ufficiali': path.resolve(__dirname, './palio-giochi-ufficiali/src/index.ts'),
  },
},
```

```ts
import { initPalioGiochiUfficiali, PalioDraw } from '@sforzinda/palio-giochi-ufficiali';

initPalioGiochiUfficiali({
  supabaseUrl: import.meta.env.VITE_SUPABASE_DATABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
```

Importare anche `src/styles/palio-draw.css` (per `<PalioDraw />`) e
`src/styles/palio-winner.css` (per `<PalioLive />`/`<PalioLiveMobile />`, che
usano `<PalioWinnerCelebration />`) nel CSS globale dell'app.

**Nota**: `<PalioLive />`/`<PalioLiveMobile />` qui NON includono le "sfide"
(QR code per punti Fanta) presenti nella versione originale su fantapalio —
è una feature di gamification del Fanta, volutamente esclusa dai risultati
ufficiali pubblici (vedi discussione issue #97).

## Stato

- [x] `/estrazioni` — `usePalioLiveData` + `PalioDraw` (porting da fantapalio)
- [x] `/risultati` — vista live `PalioLive`/`PalioLiveMobile` + `PalioWinnerCelebration` (porting da fantapalio, senza le sfide Fanta)
- [x] `/risultati/gestione` — `PalioResultsInput`: inserimento risultati ufficiali, gestione batterie (estrazione/modifica manuale) e correzione manuale del calcolo, dietro login + `can_manage_palio_games()`. Non chiama mai il ricalcolo punteggi Fanta (resta esclusivo dell'Admin del Fanta).
- [x] Cena degli Auspici (competizione autonoma e **non ufficiale**, separata dai
  Punti Palio — vedi Regolamento Cena degli Auspici): `useAuspiciData` +
  `<AuspiciClassifica />` per la classifica pubblica, `<AuspiciGestione />` per
  gestire il roster partecipanti, inserire i risultati delle 5 prove,
  bonus/penalità e Carte Auspicio, dietro lo stesso login +
  `can_manage_palio_games()`. I partecipanti (`auspici_participants`, scoped
  per edizione) non coincidono necessariamente con le 12 Contrade ufficiali:
  l'edizione può includere squadre extra valide solo per questo evento (es.
  Corte Ducale, Sforzinda, Musici e Alfieri dell'Onda Sforzesca, Aurora
  Noctis, Il Biancofiore, Armati del Duca, Arcieri del Duca) — i Punti
  Auspicio si adattano al numero effettivo di partecipanti. Usa tabelle
  `auspici_*` dedicate (schema in
  [`sql/auspici-serata.sql`](sql/auspici-serata.sql)), create sullo stesso
  progetto Supabase "Fanta" ma completamente separate da `palio_*`: nessuna
  interferenza con le estrazioni/risultati ufficiali.

## Accesso Direttivo del sito Giochi

La predisposizione SSO appartiene al repository consumatore
[`palio-giochi-sito`](https://github.com/Sforzinda/palio-giochi-sito), che contiene
il Worker Cloudflare configurato per il sito. L'adattatore disabilitato, il pulsante,
il routing e i test sono mantenuti lì; questo package conserva il login
ordinario e i permessi preesistenti di amministratori, giudici e responsabili.
Non contiene endpoint broker, deleghe o conversioni di sessioni Supabase.

Il broker Direttivo 1.0.1 risulta pubblicato; il sito mantiene il nuovo accesso
disabilitato e il codice non è ancora pubblicato. La futura autorizzazione delegata
richiede identità Supabase Auth verificata in CassaPalio
(`hpxhnhdzoiflfdruvsiv`), `public.profiles.role = 'admin'` **e** appartenenza
attiva in `public.direttivo_members`, collegate per UUID. Un admin cassa senza
appartenenza attiva va negato. Ogni azione delegata richiede introspezione
backend con sessione centrale attiva, audience e scadenza valide, appartenenza
e ruolo correnti e `director_role` aggiornato. Gli incarichi non implicano
una gerarchia o permessi aggiuntivi locali.

Il package riceve URL e chiave pubblica del database dall'app consumatrice:
il project ref effettivo del deploy deve essere verificato nel sito. I widget
attuali effettuano scritture dal browser sotto RLS e non possono essere
sbloccati con una semplice delega o con ruoli provenienti dal browser.
Vedere il README del sito per configurazione proposta, vincoli e verifiche
obbligatorie prima dell'attivazione. Nessun SSO è dichiarato operativo.

## Record dei giochi

In Gestione → Giochi, sotto la scelta della prova, si può salvare il **record
precedente** con contrada, anno e valore. Il riferimento è specifico per gioco
ed edizione e va inserito per ogni nuova edizione; resta invariato quando viene
superato, per conservare il confronto storico. È modificabile o rimovibile dai
soli gestori dei giochi.

Per le prove a tempo il valore è il tempo ufficiale in secondi, comprensivo delle
penalità (fino a due decimali); per il Melocotogno è il totale intero dei punti
fettucce, non i punti Palio. La Gestione mostra gli avvisi già sui risultati in
bozza; le viste pubbliche desktop e mobile li mostrano sui risultati registrati
e classificati. “Record battuto!” indica un miglioramento stretto;
“Record eguagliato” indica lo stesso valore al centesimo. Squalifiche, contrade
senza giocatori e tempi non validi non concorrono al confronto.

Prima di pubblicare il frontend, applicare sul progetto Supabase Fanta la nuova
migrazione [`sql/palio-record.sql`](sql/palio-record.sql): crea la tabella
`palio_game_records`, la lettura pubblica, le scritture protette da
`can_manage_palio_games()` e gli aggiornamenti Realtime. Non modifica i
risultati o il calcolo dei punteggi. Se la tabella manca, la Gestione mostra
l’errore accanto ai pulsanti del record e le viste pubbliche continuano a
mostrare i risultati senza record.

I test del confronto si eseguono con Node che supporta lo stripping TypeScript:
`node --experimental-strip-types --test tests/palio-records.test.mjs`.

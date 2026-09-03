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
- [ ] `/risultati` — inserimento risultati ufficiali (estratto da `Admin.tsx` di fantapalio, senza il ricalcolo punteggi Fanta)

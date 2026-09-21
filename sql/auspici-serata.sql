-- Schema per la Serata (Cena) degli Auspici — competizione autonoma e non
-- ufficiale legata alla cena propiziatoria, separata dai Punti Palio.
-- Va eseguito sullo STESSO progetto Supabase "Fanta" già usato dalle tabelle
-- palio_* (fa riferimento a public.contrade e riusa can_manage_palio_games()
-- per la scrittura, così i permessi restano coerenti con l'Admin esistente).
--
-- Non applicato automaticamente: eseguirlo a mano (SQL editor Supabase o
-- migrazione del repo fantapalio) dopo revisione.

create table if not exists public.auspici_editions (
  id uuid primary key default gen_random_uuid(),
  year integer not null unique,
  title text not null default 'Cena degli Auspici',
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Una sola edizione attiva (pubblicata) alla volta.
create unique index if not exists auspici_editions_single_active
  on public.auspici_editions (is_active)
  where is_active;

create type public.auspici_prova as enum (
  'mercante',      -- Mercante di Vigevano (5 stime, somma piazzamenti, vince il più basso)
  'memoria',       -- Memoria Sforzesca (lettere corrette su 20, vince il più alto)
  'investitura',   -- Investitura (somma piazzamenti su 3 microabilità, vince il più basso)
  'tiro',          -- Tiro dell'Auspicio (punteggio bersagli su 15, vince il più alto)
  'giuramento'     -- Giuramento delle Contrade (punteggio giudici su 60, vince il più alto)
);

create table if not exists public.auspici_results (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.auspici_editions(id) on delete cascade,
  prova public.auspici_prova not null,
  contrada_id uuid not null references public.contrade(id),
  raw_score numeric,               -- metrica grezza della prova (scarto/lettere/punti/ecc.)
  position integer check (position between 1 and 12),
  is_position_overridden boolean not null default false,
  notes text,
  unique (edition_id, prova, contrada_id)
);

-- Punti Auspicio, Carta «Fornaio – Ritorno in vita» (+3) e penalità di condotta
-- (fino a -3), sempre riferiti alla singola Contrada nell'edizione.
create table if not exists public.auspici_adjustments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.auspici_editions(id) on delete cascade,
  contrada_id uuid not null references public.contrade(id),
  points integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create type public.auspici_carta as enum (
  'duca',               -- Duca – Vederci chiaro
  'duchessa',           -- Duchessa – Voce segreta
  'armato',             -- Armato – Protezione
  'fornaio',            -- Fornaio – Ritorno in vita
  'mastro_falconiere'   -- Mastro Falconiere – Comando
);

create table if not exists public.auspici_carte (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.auspici_editions(id) on delete cascade,
  contrada_id uuid not null references public.contrade(id),
  carta public.auspici_carta not null,
  used boolean not null default false,
  unique (edition_id, contrada_id)
);

alter table public.auspici_editions enable row level security;
alter table public.auspici_results enable row level security;
alter table public.auspici_adjustments enable row level security;
alter table public.auspici_carte enable row level security;

-- Lettura pubblica (come palio_edition_results/palio_live_controls): la
-- classifica pubblica mostra solo l'edizione con is_active = true, ma il
-- filtro resta lato applicazione, non lato RLS, per coerenza con le tabelle
-- palio_* esistenti.
create policy "auspici_editions_public_read" on public.auspici_editions
  for select using (true);
create policy "auspici_results_public_read" on public.auspici_results
  for select using (true);
create policy "auspici_adjustments_public_read" on public.auspici_adjustments
  for select using (true);
create policy "auspici_carte_public_read" on public.auspici_carte
  for select using (true);

-- Scrittura riservata a chi già gestisce i giochi ufficiali del Palio
-- (stessa funzione RPC usata dalle RLS di palio_editions/palio_edition_results).
create policy "auspici_editions_manage_write" on public.auspici_editions
  for all using (public.can_manage_palio_games()) with check (public.can_manage_palio_games());
create policy "auspici_results_manage_write" on public.auspici_results
  for all using (public.can_manage_palio_games()) with check (public.can_manage_palio_games());
create policy "auspici_adjustments_manage_write" on public.auspici_adjustments
  for all using (public.can_manage_palio_games()) with check (public.can_manage_palio_games());
create policy "auspici_carte_manage_write" on public.auspici_carte
  for all using (public.can_manage_palio_games()) with check (public.can_manage_palio_games());

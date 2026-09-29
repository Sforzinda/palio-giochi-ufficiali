-- Giudici e cronometristi del Palio (tab "Giudici" della Gestione).
-- Va eseguito sullo STESSO progetto Supabase "Fanta" delle tabelle palio_*:
-- riusa can_manage_palio_games() per lettura e scrittura, così i permessi
-- restano coerenti con il resto della Gestione. Nessuna lettura pubblica:
-- l'elenco serve solo a chi gestisce i giochi.
--
-- `palio_judges` è l'anagrafica (riusata di edizione in edizione).
-- `palio_judge_assignments` abbina un giudice a un ruolo per edizione/gioco:
--   * titolare: is_extra = false, sempre legato a una batteria (heat_number),
--     al massimo uno per ruolo e per batteria;
--   * extra: is_extra = true, legato a una batteria (heat_number) oppure
--     all'intero gioco (heat_number null), in numero libero.
-- Le prove senza batterie (melocotogno, finale) usano heat_number = 1.

create table if not exists public.palio_judges (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now()
);

create unique index if not exists palio_judges_name_unique
  on public.palio_judges (lower(btrim(name)));

do $$ begin
  create type public.palio_judge_role as enum (
    'cronometrista',  -- rileva il tempo della batteria
    'giudice'         -- giudice delle penalità
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.palio_judge_assignments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.palio_editions(id) on delete cascade,
  game text not null,
  heat_number integer check (heat_number is null or heat_number >= 1),
  judge_id uuid not null references public.palio_judges(id) on delete cascade,
  role public.palio_judge_role not null,
  is_extra boolean not null default false,
  created_at timestamptz not null default now(),
  -- I titolari sono sempre legati a una batteria; solo gli extra possono
  -- valere per l'intero gioco.
  check (is_extra or heat_number is not null)
);

-- Un solo titolare per ruolo in ogni batteria.
create unique index if not exists palio_judge_assignments_titolare_unique
  on public.palio_judge_assignments (edition_id, game, heat_number, role)
  where not is_extra;

-- Lo stesso giudice non compare due volte nello stesso ruolo e ambito.
create unique index if not exists palio_judge_assignments_extra_unique
  on public.palio_judge_assignments (edition_id, game, coalesce(heat_number, 0), role, judge_id)
  where is_extra;

create index if not exists palio_judge_assignments_edition_idx
  on public.palio_judge_assignments (edition_id, game);

alter table public.palio_judges enable row level security;
alter table public.palio_judge_assignments enable row level security;

create policy "palio_judges_manage" on public.palio_judges
  for all using (public.can_manage_palio_games()) with check (public.can_manage_palio_games());
create policy "palio_judge_assignments_manage" on public.palio_judge_assignments
  for all using (public.can_manage_palio_games()) with check (public.can_manage_palio_games());

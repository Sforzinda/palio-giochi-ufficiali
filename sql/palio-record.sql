-- Record precedente per gioco ed edizione: il riferimento resta stabile
-- anche quando un risultato dell'edizione lo supera. Progetto Supabase Fanta.
begin;
create table public.palio_game_records (
  edition_id uuid not null references public.palio_editions(id) on delete cascade,
  game text not null check (game in ('corsa', 'melocotogno', 'carriola', 'cerchio', 'torre', 'finale')),
  contrada_id uuid not null references public.contrade(id),
  year integer not null check (year between 1 and 9999),
  value numeric(10, 2) not null check (
    value > 0 and value < 999 and
    (game <> 'melocotogno' or (value = trunc(value) and value <= 240))
  ),
  primary key (edition_id, game)
);
alter table public.palio_game_records enable row level security;
create policy "palio_game_records_read" on public.palio_game_records
  for select to anon, authenticated using (true);
create policy "palio_game_records_manage" on public.palio_game_records
  for all to authenticated using (public.can_manage_palio_games())
  with check (public.can_manage_palio_games());
grant select on public.palio_game_records to anon;
grant select, insert, update, delete on public.palio_game_records to authenticated;
alter publication supabase_realtime add table public.palio_game_records;
commit;

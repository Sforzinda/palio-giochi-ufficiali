-- Archivio edizioni precedenti (pagina pubblica /archivio).
-- Ogni edizione può essere mostrata o nascosta dalla Gestione; di default è nascosta.
-- La RLS esistente su palio_editions (lettura pubblica, scrittura con can_manage_palio_games())
-- copre già la nuova colonna: nessuna policy da aggiungere.

alter table public.palio_editions
  add column if not exists archive_visible boolean not null default false;

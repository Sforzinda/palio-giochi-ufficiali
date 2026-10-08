import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../config';
import type { PalioGameRecord } from '../lib/palio-records';

export function usePalioRecords(editionId: string | undefined) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [state, setState] = useState<{ editionId: string; records: PalioGameRecord[]; error: string; loading: boolean }>({ editionId: '', records: [], error: '', loading: false });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!editionId) return;
    let cancelled = false;
    setState((current) => ({ editionId, records: current.editionId === editionId ? current.records : [], error: '', loading: true }));
    void Promise.resolve(supabase.from('palio_game_records').select('edition_id, game, contrada_id, year, value').eq('edition_id', editionId)).then(({ data, error }) => {
      if (!cancelled) setState({ editionId, records: error ? [] : (data ?? []) as PalioGameRecord[], error: error ? `Impossibile caricare i record: ${error.message}` : '', loading: false });
    }).catch(() => {
      if (!cancelled) setState({ editionId, records: [], error: 'Impossibile caricare i record: connessione non disponibile. Riprova.', loading: false });
    });
    return () => { cancelled = true; };
  }, [editionId, revision, supabase]);

  useEffect(() => {
    if (!editionId) return;
    const channel = supabase.channel(`palio-records-${editionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'palio_game_records', filter: `edition_id=eq.${editionId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [editionId, refresh, supabase]);

  const matches = !!editionId && state.editionId === editionId;
  return { records: matches ? state.records : [], error: matches ? state.error : '', loading: !!editionId && (!matches || state.loading), refresh };
}

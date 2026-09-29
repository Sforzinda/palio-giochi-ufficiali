import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../config';
import {
  buildRanking,
  getPalioGamesForMonth,
  type Contrada,
  type PalioEdition,
  type PalioEditionResult,
  type PalioGame,
  type RankingItem,
} from './usePalioLiveData';

export interface PalioArchiveEdition {
  edition: PalioEdition;
  games: { game: PalioGame; results: PalioEditionResult[] }[];
  ranking: RankingItem[];
}

interface ArchiveResultRow extends PalioEditionResult {
  edition_id: string;
}

const gameOrder: PalioGame[] = ['melocotogno', 'corsa', 'carriola', 'cerchio', 'torre', 'finale'];

/**
 * Edizioni precedenti con `archive_visible = true`, dalla più recente, con i
 * risultati dei singoli giochi e la classifica finale di ciascuna.
 */
export function usePalioArchiveData() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [editions, setEditions] = useState<PalioEdition[]>([]);
  const [results, setResults] = useState<ArchiveResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: editionsData, error: editionsError } = await supabase
        .from('palio_editions')
        .select('id, year, month, archive_visible')
        .eq('archive_visible', true);

      if (cancelled) return;
      if (editionsError) {
        console.error('Error fetching palio archive editions:', editionsError);
        setError(true);
        setLoading(false);
        return;
      }

      const visible = (editionsData as PalioEdition[]) ?? [];
      setEditions(visible);

      if (visible.length === 0) {
        setLoading(false);
        return;
      }

      const [{ data: contradeData }, { data: resultsData, error: resultsError }] = await Promise.all([
        supabase.from('contrade').select('id, name').order('name'),
        supabase
          .from('palio_edition_results')
          .select('edition_id, contrada_id, game, position, points, melocotogno_2_count, melocotogno_5_count, melocotogno_10_count, time_seconds, penalty_count, adjusted_time_seconds, final_bonus_points, is_disqualified')
          .in('edition_id', visible.map((edition) => edition.id)),
      ]);

      if (cancelled) return;
      if (resultsError) {
        console.error('Error fetching palio archive results:', resultsError);
        setError(true);
      }
      setContrade((contradeData as Contrada[]) ?? []);
      setResults((resultsData as ArchiveResultRow[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const archive = useMemo<PalioArchiveEdition[]>(
    () => [...editions]
      .sort((a, b) => b.year * 2 + (b.month === 'ottobre' ? 1 : 0) - (a.year * 2 + (a.month === 'ottobre' ? 1 : 0)))
      .map((edition) => {
        const editionResults = results.filter((result) => result.edition_id === edition.id);
        const games = Array.from(new Set<PalioGame>([
          ...getPalioGamesForMonth(edition.month),
          ...editionResults.map((result) => result.game),
        ]))
          .sort((a, b) => gameOrder.indexOf(a) - gameOrder.indexOf(b))
          .map((game) => ({
            game,
            results: editionResults
              .filter((result) => result.game === game && (result.points !== null || result.position !== null))
              .sort((a, b) => {
                if (a.position !== b.position) {
                  if (a.position === null) return 1;
                  if (b.position === null) return -1;
                  return a.position - b.position;
                }
                const nameA = contrade.find((item) => item.id === a.contrada_id)?.name ?? '';
                const nameB = contrade.find((item) => item.id === b.contrada_id)?.name ?? '';
                return nameA.localeCompare(nameB, 'it');
              }),
          }))
          .filter((group) => group.results.length > 0);

        return { edition, games, ranking: buildRanking(contrade, editionResults) };
      }),
    [contrade, editions, results]
  );

  return { archive, contrade, error, loading };
}

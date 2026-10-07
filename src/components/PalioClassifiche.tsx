import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getSupabaseClient } from '../config';
import {
  type Contrada,
  type PalioEdition,
  type PalioGame,
  formatNumber,
  getPalioGamesForMonth,
  palioGameLabels
} from '../hooks/usePalioLiveData';

// Riepilogo delle classifiche di un'edizione: singoli giochi, classifiche
// parziali cumulative (dopo 1, 2, 3 giochi) e classifica finale. La finale
// (tenzone) non assegna punti: è mostrata a parte come classifica di gioco.

interface PalioClassificheProps {
  contrade: Contrada[];
  edition: PalioEdition | null;
}

interface ResultRow {
  adjusted_time_seconds: number | string | null;
  contrada_id: string;
  game: PalioGame;
  is_disqualified: boolean | null;
  points: number | string | null;
  position: number | null;
}

interface RankedItem {
  contradaId: string;
  detail: string;
  name: string;
  points: number | null;
  rank: number | null;
}

const toPoints = (value: number | string | null | undefined): number | null =>
  value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? null : Number(value);

function RankingTable({ items, pointsLabel }: { items: RankedItem[]; pointsLabel: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-stone-800 text-left text-xs uppercase tracking-wide text-stone-500">
          <th className="w-10 py-1.5 pr-2">Pos.</th>
          <th className="py-1.5 pr-2">Contrada</th>
          <th className="py-1.5 pr-2 text-right">{pointsLabel}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.contradaId} className="border-b border-stone-800/60 last:border-0">
            <td className="py-1.5 pr-2 font-semibold text-palio-300">{item.rank === null ? '-' : `${item.rank}°`}</td>
            <td className="py-1.5 pr-2 text-stone-100">
              {item.name}
              {item.detail && <span className="ml-2 text-xs text-stone-500">{item.detail}</span>}
            </td>
            <td className="py-1.5 text-right font-semibold tabular-nums text-stone-100">{formatNumber(item.points)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PalioClassifiche({ contrade, edition }: PalioClassificheProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const editionId = edition?.id ?? '';

  const fetchResults = useCallback(async () => {
    if (!editionId) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('palio_edition_results')
      .select('contrada_id, game, points, position, adjusted_time_seconds, is_disqualified')
      .eq('edition_id', editionId);
    if (error) console.error('Error fetching palio classifiche:', error);
    setResults(error ? [] : ((data as ResultRow[]) ?? []));
    setLoading(false);
  }, [editionId, supabase]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const baseGames = useMemo(() => (edition ? getPalioGamesForMonth(edition.month) : []), [edition]);

  const gameRankings = useMemo(() => {
    const games: PalioGame[] = edition?.month === 'ottobre' ? [...baseGames, 'finale'] : baseGames;
    return games.map((game) => {
      const resultByContrada = new Map(
        results.filter((result) => result.game === game).map((result) => [result.contrada_id, result])
      );
      const items: RankedItem[] = contrade.map((contrada) => {
        const result = resultByContrada.get(contrada.id);
        return {
          contradaId: contrada.id,
          detail: result?.is_disqualified
            ? 'N.A.'
            : game !== 'finale' && result?.adjusted_time_seconds !== null && result?.adjusted_time_seconds !== undefined && result.adjusted_time_seconds !== ''
              ? `${formatNumber(result.adjusted_time_seconds)} s`
              : '',
          name: contrada.name,
          points: toPoints(game === 'finale' ? result?.adjusted_time_seconds : result?.points),
          rank: result?.position ?? null
        };
      });
      items.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name, 'it'));
      return { game, items };
    });
  }, [baseGames, contrade, edition?.month, results]);

  // Classifica cumulativa dopo i primi `count` giochi, con pari merito.
  const cumulativeRankings = useMemo(() => baseGames.map((_, index) => {
    const games = baseGames.slice(0, index + 1);
    const hasData = games.every((game) => results.some((result) => result.game === game && toPoints(result.points) !== null));
    const totals = contrade.map((contrada) => ({
      contradaId: contrada.id,
      name: contrada.name,
      total: games.reduce((sum, game) => {
        const points = results.find((result) => result.game === game && result.contrada_id === contrada.id)?.points;
        return sum + (toPoints(points) ?? 0);
      }, 0)
    })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'it'));

    let previousTotal: number | null = null;
    let previousRank = 0;
    const items: RankedItem[] = totals.map((item, position) => {
      const rank = previousTotal === item.total ? previousRank : position + 1;
      previousTotal = item.total;
      previousRank = rank;
      return { contradaId: item.contradaId, detail: '', name: item.name, points: item.total, rank };
    });
    return { count: index + 1, hasData, items };
  }), [baseGames, contrade, results]);

  if (!edition) {
    return <p className="text-sm text-stone-400">Seleziona un'edizione per vedere le classifiche.</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone-400">
          Classifiche del Palio di {edition.month} {edition.year}.
        </p>
        <button
          type="button"
          onClick={fetchResults}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-700 px-3 py-1.5 text-sm font-semibold text-stone-200 hover:bg-stone-800 disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Aggiorna
        </button>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-palio-300">Classifiche dei singoli giochi</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {gameRankings.map(({ game, items }) => (
            <div key={game} className="rounded-lg border border-stone-800 bg-stone-900/50 p-4">
              <h4 className="mb-2 font-semibold text-stone-100">{palioGameLabels[game]}</h4>
              <RankingTable items={items} pointsLabel={game === 'finale' ? 'Tempo' : 'Punti'} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-palio-300">Classifiche parziali e finale</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {cumulativeRankings.map(({ count, hasData, items }) => {
            const isFinal = count === baseGames.length;
            return (
              <div
                key={count}
                className={`rounded-lg border p-4 ${isFinal ? 'border-palio-500/60 bg-palio-500/5' : 'border-stone-800 bg-stone-900/50'}`}
              >
                <h4 className="mb-0.5 font-semibold text-stone-100">
                  {isFinal ? `Classifica finale dopo ${count} ${count === 1 ? 'gioco' : 'giochi'}` : `Classifica parziale dopo ${count} ${count === 1 ? 'gioco' : 'giochi'}`}
                </h4>
                <p className="mb-2 text-xs text-stone-500">{baseGames.slice(0, count).map((game) => palioGameLabels[game]).join(' + ')}</p>
                {hasData
                  ? <RankingTable items={items} pointsLabel="Punti" />
                  : <p className="text-sm text-stone-500">Risultati non ancora completi.</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

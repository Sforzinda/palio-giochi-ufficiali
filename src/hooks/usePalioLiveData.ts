import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../config';

export type PalioMonth = 'maggio' | 'ottobre';
export type PalioGame = 'corsa' | 'melocotogno' | 'carriola' | 'cerchio' | 'torre' | 'finale';

export interface Contrada {
  id: string;
  name: string;
}

export interface PalioEdition {
  id: string;
  month: PalioMonth;
  year: number;
}

export interface PalioLiveControl {
  draw_revealed_count: number;
  edition_id: string;
  id: string;
  is_active: boolean;
  live_title: string | null;
  show_heats: boolean;
  show_games: boolean;
  show_partial_ranking: boolean;
  show_total_ranking: boolean;
  triplice_winner_contrada_id: string | null;
  edition?: PalioEdition | null;
}

export interface PalioEditionResult {
  adjusted_time_seconds: number | string | null;
  contrada_id: string;
  final_bonus_points: number | string | null;
  game: PalioGame;
  is_disqualified: boolean | null;
  melocotogno_2_count: number | null;
  melocotogno_5_count: number | null;
  melocotogno_10_count: number | null;
  penalty_count: number | null;
  position: number | null;
  points: number | string | null;
  time_seconds: number | string | null;
}

export interface PalioEditionHeat {
  contrada_id: string;
  display_order: number;
  game: PalioGame;
  heat_number: number;
  no_players: boolean;
}

export interface RankingItem {
  completedGames: number;
  gameResults: Partial<Record<PalioGame, PalioEditionResult>>;
  id: string;
  name: string;
  rank: number;
  totalPoints: number;
}

export interface HeatGroup {
  heatNumber: number;
  items: PalioEditionHeat[];
}

export interface GameResultsGroup {
  game: PalioGame;
  results: PalioEditionResult[];
}

export const palioGameLabels: Record<PalioGame, string> = {
  carriola: 'Carriole',
  cerchio: 'Cerchio',
  corsa: 'Corsa',
  finale: 'Finale',
  melocotogno: 'Melocotogno',
  torre: 'Torre'
};

export const getPalioGamesForMonth = (month: PalioMonth): PalioGame[] =>
  month === 'maggio'
    ? ['melocotogno', 'corsa']
    : ['melocotogno', 'carriola', 'cerchio', 'torre'];

export const formatEditionLabel = (edition: PalioEdition): string =>
  `${edition.month.charAt(0).toUpperCase()}${edition.month.slice(1)} ${edition.year}`;

export const formatNumber = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '-';
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return '-';
  return parsed.toLocaleString('it-IT', { maximumFractionDigits: 2 });
};

export const getResultValue = (result: PalioEditionResult): string => {
  if (result.game === 'melocotogno') {
    const total =
      (result.melocotogno_2_count ?? 0) * 2 +
      (result.melocotogno_5_count ?? 0) * 5 +
      (result.melocotogno_10_count ?? 0) * 10;
    return total > 0 ? `${total.toLocaleString('it-IT')} raccolti` : '-';
  }

  if (result.is_disqualified) return 'N.A.';
  return result.adjusted_time_seconds ? `${formatNumber(result.adjusted_time_seconds)}s` : '-';
};

export const getResultPositionLabel = (result: PalioEditionResult): string =>
  result.position ? `${result.position}° posto` : 'Da classificare';

function buildRanking(
  contrade: Contrada[],
  results: PalioEditionResult[],
  excludeGame?: PalioGame
): RankingItem[] {
  const rankingByContrada = new Map<string, Omit<RankingItem, 'rank'>>();

  contrade.forEach((contrada) => {
    rankingByContrada.set(contrada.id, {
      completedGames: 0,
      gameResults: {},
      id: contrada.id,
      name: contrada.name,
      totalPoints: 0
    });
  });

  results.forEach((result) => {
    if (excludeGame && result.game === excludeGame) return;
    const item = rankingByContrada.get(result.contrada_id);
    if (!item) return;
    const points = result.points === null ? null : Number(result.points);
    item.gameResults[result.game] = result;

    if (points !== null && !Number.isNaN(points)) {
      item.completedGames += 1;
      item.totalPoints += points;
    }
  });

  let previousPoints: number | null = null;
  let previousRank = 0;

  return Array.from(rankingByContrada.values())
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.completedGames !== a.completedGames) return b.completedGames - a.completedGames;
      return a.name.localeCompare(b.name, 'it');
    })
    .map((item, index) => {
      const rank = previousPoints === item.totalPoints ? previousRank : index + 1;
      previousPoints = item.totalPoints;
      previousRank = rank;
      return { ...item, rank };
    });
}

export interface PalioLiveData {
  baseGamesAreComplete: boolean;
  contrade: Contrada[];
  control: PalioLiveControl | null;
  displayGames: PalioGame[];
  edition: PalioEdition | null;
  expectedGames: PalioGame[];
  gameResultsGroups: GameResultsGroup[];
  gameResultsPages: GameResultsGroup[][];
  hasTripliceTenzone: boolean;
  heatGames: PalioGame[];
  heatGroupsByGame: Map<PalioGame, HeatGroup[]>;
  heats: PalioEditionHeat[];
  liveTitle: string;
  loading: boolean;
  preFinaleRanking: RankingItem[];
  ranking: RankingItem[];
  results: PalioEditionResult[];
  showPartialRanking: boolean;
  showTotalRanking: boolean;
  tripliceTenzone: RankingItem[];
  tripliceWinner: RankingItem | null;
  tripliceWinnerResult: PalioEditionResult | null;
}

export function usePalioLiveData(channelName: string): PalioLiveData {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [control, setControl] = useState<PalioLiveControl | null>(null);
  const [heats, setHeats] = useState<PalioEditionHeat[]>([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<PalioEditionResult[]>([]);

  const fetchLiveData = useCallback(async () => {
    const { data: controlData, error: controlError } = await supabase
      .from('palio_live_controls')
      .select('id, edition_id, is_active, live_title, show_heats, show_games, show_partial_ranking, show_total_ranking, triplice_winner_contrada_id, draw_revealed_count, edition:palio_editions(id, year, month)')
      .eq('is_active', true)
      .maybeSingle();

    if (controlError) {
      console.error('Error fetching palio live controls:', controlError);
      setControl(null);
      setLoading(false);
      return;
    }

    const activeControl = controlData as PalioLiveControl | null;
    setControl(activeControl);

    if (!activeControl?.edition_id) {
      setResults([]);
      setHeats([]);
      setLoading(false);
      return;
    }

    const [
      { data: contradeData, error: contradeError },
      { data: resultsData, error: resultsError },
      { data: heatsData, error: heatsError }
    ] = await Promise.all([
      supabase.from('contrade').select('id, name').order('name'),
      supabase
        .from('palio_edition_results')
        .select('contrada_id, game, position, points, melocotogno_2_count, melocotogno_5_count, melocotogno_10_count, time_seconds, penalty_count, adjusted_time_seconds, final_bonus_points, is_disqualified')
        .eq('edition_id', activeControl.edition_id),
      supabase
        .from('palio_edition_heats')
        .select('contrada_id, game, heat_number, display_order, no_players')
        .eq('edition_id', activeControl.edition_id)
        .order('game')
        .order('heat_number')
        .order('display_order')
    ]);

    if (contradeError) {
      console.error('Error fetching contrade:', contradeError);
    } else {
      setContrade((contradeData as Contrada[]) ?? []);
    }

    if (resultsError) {
      console.error('Error fetching palio live results:', resultsError);
      setResults([]);
    } else {
      setResults((resultsData as PalioEditionResult[]) ?? []);
    }

    if (heatsError) {
      console.error('Error fetching palio heats:', heatsError);
      setHeats([]);
    } else {
      setHeats((heatsData as PalioEditionHeat[]) ?? []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'palio_live_controls' }, () => {
        fetchLiveData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'palio_edition_results' }, () => {
        fetchLiveData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'palio_edition_heats' }, () => {
        fetchLiveData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, fetchLiveData, supabase]);

  const edition = control?.edition ?? null;
  const expectedGames = useMemo(() => edition ? getPalioGamesForMonth(edition.month) : [], [edition]);
  const hasTripliceTenzone = edition?.month === 'ottobre';
  const hasBaseGameResults = useMemo(
    () => results.some((result) => result.game !== 'finale' && (result.points !== null || result.position !== null)),
    [results]
  );
  const displayGames = useMemo(
    () => hasTripliceTenzone && hasBaseGameResults ? [...expectedGames, 'finale' as PalioGame] : expectedGames,
    [expectedGames, hasBaseGameResults, hasTripliceTenzone]
  );

  const preFinaleRanking = useMemo(
    () => buildRanking(contrade, results, 'finale'),
    [contrade, results]
  );

  const ranking = useMemo(
    () => buildRanking(contrade, results),
    [contrade, results]
  );

  const completedGames = useMemo(() => {
    const games = new Set<PalioGame>();
    const gamesToCheck = Array.from(new Set([
      ...expectedGames,
      ...heats.map((heat) => heat.game),
      ...results.map((result) => result.game)
    ]));

    gamesToCheck.forEach((game) => {
      const expectedCount = game === 'finale'
        ? (heats.filter((heat) => heat.game === 'finale').length || Math.min(preFinaleRanking.length, 3))
        : contrade.length;

      if (expectedCount === 0) return;

      const completedResults = results.filter((result) => {
        if (result.game !== game) return false;
        if (game === 'finale') return result.position !== null;
        return result.points !== null && !Number.isNaN(Number(result.points));
      });

      if (completedResults.length >= expectedCount) {
        games.add(game);
      }
    });

    return games;
  }, [contrade.length, expectedGames, heats, preFinaleRanking.length, results]);

  const heatGames = useMemo(() => {
    const gamesWithHeats = new Set(
      heats
        .filter((heat) => heat.game !== 'melocotogno' && heat.game !== 'finale')
        .map((heat) => heat.game)
    );
    const orderedGames = expectedGames.filter((game) => gamesWithHeats.has(game) && !completedGames.has(game));
    const extraGames = Array.from(gamesWithHeats)
      .filter((game) => !orderedGames.includes(game) && !completedGames.has(game))
      .sort((a, b) => palioGameLabels[a].localeCompare(palioGameLabels[b], 'it'));

    return [...orderedGames, ...extraGames];
  }, [completedGames, expectedGames, heats]);

  const heatGroupsByGame = useMemo(
    () => new Map(heatGames.map((game) => [
      game,
      Array.from(new Set(heats.filter((heat) => heat.game === game).map((heat) => heat.heat_number)))
        .map((heatNumber) => ({
          heatNumber,
          items: heats
            .filter((heat) => heat.game === game && heat.heat_number === heatNumber)
            .sort((a, b) => {
              if (a.no_players !== b.no_players) return a.no_players ? 1 : -1;
              return a.display_order - b.display_order;
            })
        }))
    ])),
    [heatGames, heats]
  );

  const gameResultsGroups = useMemo(
    () => displayGames
      .map((game) => ({
        game,
        results: results
          .filter((result) => result.game === game && (result.points !== null || result.position !== null))
          .sort((a, b) => {
            if (a.position !== b.position) {
              if (a.position === null) return 1;
              if (b.position === null) return -1;
              return a.position - b.position;
            }

            const firstPoints = a.points === null ? Number.NEGATIVE_INFINITY : Number(a.points);
            const secondPoints = b.points === null ? Number.NEGATIVE_INFINITY : Number(b.points);
            if (firstPoints !== secondPoints) return secondPoints - firstPoints;

            const firstContrada = contrade.find((item) => item.id === a.contrada_id)?.name ?? '';
            const secondContrada = contrade.find((item) => item.id === b.contrada_id)?.name ?? '';
            return firstContrada.localeCompare(secondContrada, 'it');
          })
      }))
      .filter((group) => group.results.length > 0),
    [contrade, displayGames, results]
  );

  const gameResultsPages = useMemo(() => {
    const pages: GameResultsGroup[][] = [];
    for (let index = 0; index < gameResultsGroups.length; index += 2) {
      pages.push(gameResultsGroups.slice(index, index + 2));
    }
    return pages;
  }, [gameResultsGroups]);

  const baseGamesAreComplete = useMemo(() => {
    if (expectedGames.length === 0 || contrade.length === 0) return false;

    return expectedGames.every((game) => {
      const completedResults = results.filter((result) => {
        if (result.game !== game) return false;
        if (result.points === null) return false;
        return !Number.isNaN(Number(result.points));
      });

      return completedResults.length >= contrade.length;
    });
  }, [contrade.length, expectedGames, results]);

  const showPartialRanking = !!(
    control?.show_partial_ranking || (control?.show_total_ranking && !baseGamesAreComplete)
  );
  const showTotalRanking = !!(control?.show_total_ranking && baseGamesAreComplete);
  const tripliceTenzone = hasTripliceTenzone && hasBaseGameResults ? preFinaleRanking.slice(0, 3) : [];
  const tripliceWinner = control?.triplice_winner_contrada_id
    ? ranking.find((item) => item.id === control.triplice_winner_contrada_id) ?? null
    : null;
  const tripliceWinnerResult = control?.triplice_winner_contrada_id
    ? results.find((result) => result.game === 'finale' && result.contrada_id === control.triplice_winner_contrada_id) ?? null
    : null;
  const liveTitle = control?.live_title?.trim() || (edition ? formatEditionLabel(edition) : 'Palio di Vigevano');

  return {
    baseGamesAreComplete,
    contrade,
    control,
    displayGames,
    edition,
    expectedGames,
    gameResultsGroups,
    gameResultsPages,
    hasTripliceTenzone,
    heatGames,
    heatGroupsByGame,
    heats,
    liveTitle,
    loading,
    preFinaleRanking,
    ranking,
    results,
    showPartialRanking,
    showTotalRanking,
    tripliceTenzone,
    tripliceWinner,
    tripliceWinnerResult
  };
}

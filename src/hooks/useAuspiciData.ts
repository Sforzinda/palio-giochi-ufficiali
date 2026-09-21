import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../config';
import type { Contrada } from './usePalioLiveData';

// La Cena degli Auspici è una competizione autonoma e non ufficiale: punti,
// tabelle e RLS sono completamente separati dai Punti Palio (palio_* nel
// resto del package). Vedi Regolamento Cena degli Auspici, punto 1.

export type AuspiciProva = 'mercante' | 'memoria' | 'investitura' | 'tiro' | 'giuramento';
export type AuspiciCartaType = 'duca' | 'duchessa' | 'armato' | 'fornaio' | 'mastro_falconiere';

export interface AuspiciEdition {
  id: string;
  year: number;
  title: string;
  is_active: boolean;
}

export interface AuspiciResult {
  contrada_id: string;
  prova: AuspiciProva;
  raw_score: number | string | null;
  position: number | null;
  is_position_overridden: boolean;
  notes: string | null;
}

export interface AuspiciAdjustment {
  id: string;
  contrada_id: string;
  points: number;
  reason: string;
}

export interface AuspiciCarta {
  contrada_id: string;
  carta: AuspiciCartaType;
  used: boolean;
}

export interface AuspiciRankingItem {
  giuramentoPosition: number | null;
  id: string;
  name: string;
  provaResults: Partial<Record<AuspiciProva, AuspiciResult>>;
  rank: number;
  totalPoints: number;
  wins: number;
}

function buildAuspiciRanking(
  contrade: Contrada[],
  results: AuspiciResult[],
  adjustments: AuspiciAdjustment[]
): AuspiciRankingItem[] {
  const byContrada = new Map<string, Omit<AuspiciRankingItem, 'rank'>>();

  contrade.forEach((contrada) => {
    byContrada.set(contrada.id, {
      giuramentoPosition: null,
      id: contrada.id,
      name: contrada.name,
      provaResults: {},
      totalPoints: 0,
      wins: 0,
    });
  });

  results.forEach((result) => {
    const item = byContrada.get(result.contrada_id);
    if (!item) return;
    item.provaResults[result.prova] = result;

    if (result.position !== null) {
      item.totalPoints += 13 - result.position;
      if (result.position === 1) item.wins += 1;
      if (result.prova === 'giuramento') item.giuramentoPosition = result.position;
    }
  });

  adjustments.forEach((adjustment) => {
    const item = byContrada.get(adjustment.contrada_id);
    if (!item) return;
    item.totalPoints += adjustment.points;
  });

  // Criteri di parità nella classifica finale (Regolamento, punto 4): a
  // parità di punti prevalgono maggior numero di vittorie e miglior
  // piazzamento nel Giuramento delle Contrade; persistendo la parità, le
  // Contrade sono ex aequo.
  const sorted = Array.from(byContrada.values()).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aGiuramento = a.giuramentoPosition ?? Number.POSITIVE_INFINITY;
    const bGiuramento = b.giuramentoPosition ?? Number.POSITIVE_INFINITY;
    if (aGiuramento !== bGiuramento) return aGiuramento - bGiuramento;
    return a.name.localeCompare(b.name, 'it');
  });

  let previousKey = '';
  let previousRank = 0;

  return sorted.map((item, index) => {
    const key = `${item.totalPoints}|${item.wins}|${item.giuramentoPosition ?? 'x'}`;
    const rank = key === previousKey ? previousRank : index + 1;
    previousKey = key;
    previousRank = rank;
    return { ...item, rank };
  });
}

export interface AuspiciData {
  adjustments: AuspiciAdjustment[];
  carte: AuspiciCarta[];
  contrade: Contrada[];
  edition: AuspiciEdition | null;
  loading: boolean;
  ranking: AuspiciRankingItem[];
  results: AuspiciResult[];
}

export function useAuspiciData(channelName: string): AuspiciData {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [edition, setEdition] = useState<AuspiciEdition | null>(null);
  const [results, setResults] = useState<AuspiciResult[]>([]);
  const [adjustments, setAdjustments] = useState<AuspiciAdjustment[]>([]);
  const [carte, setCarte] = useState<AuspiciCarta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: editionData, error: editionError } = await supabase
      .from('auspici_editions')
      .select('id, year, title, is_active')
      .eq('is_active', true)
      .maybeSingle();

    if (editionError) {
      console.error('Error fetching auspici edition:', editionError);
      setEdition(null);
      setLoading(false);
      return;
    }

    const activeEdition = editionData as AuspiciEdition | null;
    setEdition(activeEdition);

    if (!activeEdition) {
      setResults([]);
      setAdjustments([]);
      setCarte([]);
      setLoading(false);
      return;
    }

    const [
      { data: contradeData, error: contradeError },
      { data: resultsData, error: resultsError },
      { data: adjustmentsData, error: adjustmentsError },
      { data: carteData, error: carteError },
    ] = await Promise.all([
      supabase.from('contrade').select('id, name').order('name'),
      supabase
        .from('auspici_results')
        .select('contrada_id, prova, raw_score, position, is_position_overridden, notes')
        .eq('edition_id', activeEdition.id),
      supabase
        .from('auspici_adjustments')
        .select('id, contrada_id, points, reason')
        .eq('edition_id', activeEdition.id),
      supabase
        .from('auspici_carte')
        .select('contrada_id, carta, used')
        .eq('edition_id', activeEdition.id),
    ]);

    if (contradeError) {
      console.error('Error fetching contrade:', contradeError);
    } else {
      setContrade((contradeData as Contrada[]) ?? []);
    }

    if (resultsError) {
      console.error('Error fetching auspici results:', resultsError);
      setResults([]);
    } else {
      setResults((resultsData as AuspiciResult[]) ?? []);
    }

    if (adjustmentsError) {
      console.error('Error fetching auspici adjustments:', adjustmentsError);
      setAdjustments([]);
    } else {
      setAdjustments((adjustmentsData as AuspiciAdjustment[]) ?? []);
    }

    if (carteError) {
      console.error('Error fetching auspici carte:', carteError);
      setCarte([]);
    } else {
      setCarte((carteData as AuspiciCarta[]) ?? []);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_editions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_results' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_adjustments' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_carte' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, fetchData, supabase]);

  const ranking = useMemo(
    () => buildAuspiciRanking(contrade, results, adjustments),
    [adjustments, contrade, results]
  );

  return { adjustments, carte, contrade, edition, loading, ranking, results };
}

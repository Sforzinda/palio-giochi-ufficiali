import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../config';

// La Cena degli Auspici è una competizione autonoma e non ufficiale: punti,
// tabelle e RLS sono completamente separati dai Punti Palio (palio_* nel
// resto del package). Vedi Regolamento Cena degli Auspici, punto 1.
//
// I partecipanti NON coincidono necessariamente con le 12 Contrade
// ufficiali: l'edizione può includere squadre extra valide solo per questo
// evento (es. Corte Ducale, Sforzinda, Musici e Alfieri dell'Onda Sforzesca,
// Aurora Noctis, Il Biancofiore, Armati del Duca, Arcieri del Duca). Per
// questo il roster è `auspici_participants`, scoped per edizione, non un
// riferimento diretto a `contrade`.

export type AuspiciProva = 'mercante' | 'memoria' | 'investitura' | 'tiro' | 'giuramento';
export type AuspiciCartaType = 'duca' | 'duchessa' | 'armato' | 'fornaio' | 'mastro_falconiere';

export interface AuspiciEdition {
  id: string;
  year: number;
  title: string;
  is_active: boolean;
}

export interface AuspiciParticipant {
  contrada_id: string | null;
  id: string;
  name: string;
  sort_order: number;
}

export interface AuspiciResult {
  is_position_overridden: boolean;
  notes: string | null;
  participant_id: string;
  position: number | null;
  prova: AuspiciProva;
  raw_score: number | string | null;
}

export interface AuspiciAdjustment {
  id: string;
  participant_id: string;
  points: number;
  reason: string;
}

export interface AuspiciCarta {
  carta: AuspiciCartaType;
  participant_id: string;
  used: boolean;
}

// Pagina "fissata" dalla regia sullo schermo pubblico (vedi
// auspici_live_controls.pinned_page): null = rotazione automatica.
export type AuspiciPinnedPage = 'ranking' | 'carte' | AuspiciProva;

export interface AuspiciRankingItem {
  giuramentoPosition: number | null;
  id: string;
  name: string;
  provaResults: Partial<Record<AuspiciProva, AuspiciResult>>;
  rank: number;
  totalPoints: number;
  wins: number;
}

// Punti Auspicio: generalizza la scala N, N-1, ..., 1 del regolamento
// (scritto per 12 Contrade) al numero effettivo di partecipanti
// dell'edizione, così da valere anche con le squadre extra dell'evento.
function buildAuspiciRanking(
  participants: AuspiciParticipant[],
  results: AuspiciResult[],
  adjustments: AuspiciAdjustment[]
): AuspiciRankingItem[] {
  const totalParticipants = participants.length;
  const byParticipant = new Map<string, Omit<AuspiciRankingItem, 'rank'>>();

  participants.forEach((participant) => {
    byParticipant.set(participant.id, {
      giuramentoPosition: null,
      id: participant.id,
      name: participant.name,
      provaResults: {},
      totalPoints: 0,
      wins: 0,
    });
  });

  results.forEach((result) => {
    const item = byParticipant.get(result.participant_id);
    if (!item) return;
    item.provaResults[result.prova] = result;

    if (result.position !== null) {
      item.totalPoints += totalParticipants + 1 - result.position;
      if (result.position === 1) item.wins += 1;
      if (result.prova === 'giuramento') item.giuramentoPosition = result.position;
    }
  });

  adjustments.forEach((adjustment) => {
    const item = byParticipant.get(adjustment.participant_id);
    if (!item) return;
    item.totalPoints += adjustment.points;
  });

  // Criteri di parità nella classifica finale (Regolamento, punto 4): a
  // parità di punti prevalgono maggior numero di vittorie e miglior
  // piazzamento nel Giuramento delle Contrade; persistendo la parità, le
  // squadre sono ex aequo.
  const sorted = Array.from(byParticipant.values()).sort((a, b) => {
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
  edition: AuspiciEdition | null;
  loading: boolean;
  participants: AuspiciParticipant[];
  pinnedPage: AuspiciPinnedPage | null;
  ranking: AuspiciRankingItem[];
  results: AuspiciResult[];
}

export function useAuspiciData(channelName: string): AuspiciData {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [edition, setEdition] = useState<AuspiciEdition | null>(null);
  const [participants, setParticipants] = useState<AuspiciParticipant[]>([]);
  const [results, setResults] = useState<AuspiciResult[]>([]);
  const [adjustments, setAdjustments] = useState<AuspiciAdjustment[]>([]);
  const [carte, setCarte] = useState<AuspiciCarta[]>([]);
  const [pinnedPage, setPinnedPage] = useState<AuspiciPinnedPage | null>(null);
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
      setParticipants([]);
      setResults([]);
      setAdjustments([]);
      setCarte([]);
      setPinnedPage(null);
      setLoading(false);
      return;
    }

    const [
      { data: participantsData, error: participantsError },
      { data: resultsData, error: resultsError },
      { data: adjustmentsData, error: adjustmentsError },
      { data: carteData, error: carteError },
      { data: liveControlData, error: liveControlError },
    ] = await Promise.all([
      supabase
        .from('auspici_participants')
        .select('id, name, contrada_id, sort_order')
        .eq('edition_id', activeEdition.id)
        .order('sort_order')
        .order('name'),
      supabase
        .from('auspici_results')
        .select('participant_id, prova, raw_score, position, is_position_overridden, notes')
        .eq('edition_id', activeEdition.id),
      supabase
        .from('auspici_adjustments')
        .select('id, participant_id, points, reason')
        .eq('edition_id', activeEdition.id),
      supabase
        .from('auspici_carte')
        .select('participant_id, carta, used')
        .eq('edition_id', activeEdition.id),
      supabase
        .from('auspici_live_controls')
        .select('pinned_page')
        .eq('edition_id', activeEdition.id)
        .maybeSingle(),
    ]);

    if (participantsError) {
      console.error('Error fetching auspici participants:', participantsError);
      setParticipants([]);
    } else {
      setParticipants((participantsData as AuspiciParticipant[]) ?? []);
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

    if (liveControlError) {
      console.error('Error fetching auspici live controls:', liveControlError);
      setPinnedPage(null);
    } else {
      setPinnedPage((liveControlData?.pinned_page as AuspiciPinnedPage | null) ?? null);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_participants' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_results' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_adjustments' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_carte' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auspici_live_controls' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, fetchData, supabase]);

  const ranking = useMemo(
    () => buildAuspiciRanking(participants, results, adjustments),
    [adjustments, participants, results]
  );

  return { adjustments, carte, edition, loading, participants, pinnedPage, ranking, results };
}

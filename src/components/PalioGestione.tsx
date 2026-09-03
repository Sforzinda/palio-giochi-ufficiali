import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, Eye, EyeOff, Flag, Minus, Plus, PlusCircle, Repeat, RotateCcw, Save, Send, Trophy } from 'lucide-react';
import { getSupabaseClient } from '../config';
import { PalioAuthGate } from './PalioAuthGate';
import {
  type Contrada,
  type PalioEdition,
  type PalioEditionHeat,
  type PalioGame,
  type PalioLiveControl,
  palioGameLabels as liveGameLabels,
} from '../hooks/usePalioLiveData';
import {
  type PalioEditionResultInput,
  calculatePalioRows,
  formatPalioEditionLabel,
  formatPalioNumberInput,
  getAvailablePalioGamesForMonth,
  getNextPalioEdition,
  getPalioEditionOrder,
  getStablePalioRandomOrder,
  palioGameDescriptions,
  parsePalioInteger,
  parsePalioNumber,
  validatePalioRows,
} from '../lib/palio-results';

// Porting di handleSavePalioResults / handleSavePalioHeats / handleGeneratePalioHeats
// (Admin.tsx di fantapalio): stesse tabelle (palio_edition_results, palio_edition_heats),
// stessa RLS (can_manage_palio_games()). Non chiama mai il ricalcolo dei punteggi
// Fanta: quello resta esclusivo dell'Admin del Fanta.

const emptyResultRow = (contradaId: string): PalioEditionResultInput => ({
  adjusted_time_seconds: '',
  contrada_id: contradaId,
  final_bonus_points: '',
  is_calculation_overridden: false,
  is_disqualified: false,
  melocotogno_2_count: '',
  melocotogno_5_count: '',
  melocotogno_10_count: '',
  notes: '',
  penalty_count: '',
  position: '',
  points: '',
  time_seconds: '',
});

interface RankingEntry {
  contradaId: string;
  totalPoints: number;
}

interface FettucciaStepperProps {
  contradaName: string;
  disabled: boolean;
  label: string;
  onChange: (delta: number) => void;
  onInputChange: (value: string) => void;
  value: string;
}

// Stepper +/- accessibile per i conteggi fettucce del melocotogno: evita di
// dover digitare a mano su mobile e permette di correggere un valore inserito
// per errore in eccesso senza mai poter scendere sotto zero.
function FettucciaStepper({ contradaName, disabled, label, onChange, onInputChange, value }: FettucciaStepperProps) {
  const numericValue = parsePalioInteger(value) ?? 0;
  const canDecrement = !disabled && numericValue > 0;

  return (
    <div className="text-xs font-semibold text-stone-400">
      <span id={`fettuccia-${label}-${contradaName}`.replace(/\s+/g, '-')} className="block">
        {label}
      </span>
      <div
        aria-labelledby={`fettuccia-${label}-${contradaName}`.replace(/\s+/g, '-')}
        className="mt-1 flex items-stretch overflow-hidden rounded-md border border-stone-700 bg-stone-800"
        role="group"
      >
        <button
          aria-label={`Togli una fettuccia da ${label.replace('Fettucce da ', '')} a ${contradaName}`}
          className="flex w-11 shrink-0 items-center justify-center border-r border-stone-700 text-stone-300 transition hover:bg-stone-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={!canDecrement}
          onClick={() => onChange(-1)}
          type="button"
        >
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>
        <input
          aria-label={`Numero di ${label.toLowerCase()} per ${contradaName}`}
          className="w-full min-w-0 flex-1 bg-transparent px-2 py-1.5 text-center text-sm text-stone-100 disabled:opacity-50"
          disabled={disabled}
          inputMode="numeric"
          min={0}
          onChange={(e) => onInputChange(e.target.value)}
          step={1}
          type="number"
          value={value}
        />
        <button
          aria-label={`Aggiungi una fettuccia da ${label.replace('Fettucce da ', '')} a ${contradaName}`}
          className="flex w-11 shrink-0 items-center justify-center border-l border-stone-700 text-stone-300 transition hover:bg-stone-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          disabled={disabled}
          onClick={() => onChange(1)}
          type="button"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PalioResultsInputContent() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [editions, setEditions] = useState<PalioEdition[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState('');
  const [game, setGame] = useState<PalioGame>('melocotogno');
  const [results, setResults] = useState<PalioEditionResultInput[]>([]);
  const [editionResults, setEditionResults] = useState<{ contrada_id: string; game: PalioGame; points: number | string | null }[]>([]);
  const [heats, setHeats] = useState<PalioEditionHeat[]>([]);
  const [heatGame, setHeatGame] = useState<PalioGame>('corsa');
  const [heatSize, setHeatSize] = useState('3');
  const [liveControls, setLiveControls] = useState<PalioLiveControl[]>([]);
  const [liveTitleInput, setLiveTitleInput] = useState('');
  const [tripliceWinnerId, setTripliceWinnerId] = useState('');
  const [savingLiveField, setSavingLiveField] = useState<string | null>(null);
  const [regiaStatusMessage, setRegiaStatusMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHeats, setSavingHeats] = useState(false);
  const [creatingEdition, setCreatingEdition] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [heatsStatusMessage, setHeatsStatusMessage] = useState('');
  const [activeSection, setActiveSection] = useState<'estrazioni' | 'giochi'>('estrazioni');

  const fetchEditions = useCallback(async () => {
    const { data, error } = await supabase
      .from('palio_editions')
      .select('id, year, month')
      .order('year', { ascending: false });
    if (error) {
      console.error('Error fetching palio editions:', error);
      return;
    }
    setEditions([...((data as PalioEdition[]) ?? [])].sort((a, b) => getPalioEditionOrder(b) - getPalioEditionOrder(a)));
  }, [supabase]);

  const fetchHeats = useCallback(async (editionId: string) => {
    if (!editionId) {
      setHeats([]);
      return;
    }
    const { data, error } = await supabase
      .from('palio_edition_heats')
      .select('contrada_id, game, heat_number, display_order, no_players')
      .eq('edition_id', editionId)
      .order('game')
      .order('heat_number')
      .order('display_order');
    if (error) {
      console.error('Error fetching palio heats:', error);
      setHeats([]);
      return;
    }
    setHeats((data as PalioEditionHeat[]) ?? []);
  }, [supabase]);

  const fetchLiveControls = useCallback(async () => {
    const { data, error } = await supabase
      .from('palio_live_controls')
      .select('id, edition_id, is_active, live_title, show_heats, show_games, show_partial_ranking, show_total_ranking, triplice_winner_contrada_id, draw_revealed_count');
    if (error) {
      console.error('Error fetching palio live controls:', error);
      setLiveControls([]);
      return;
    }
    setLiveControls((data as PalioLiveControl[]) ?? []);
  }, [supabase]);

  const fetchEditionResults = useCallback(async (editionId: string) => {
    if (!editionId) {
      setEditionResults([]);
      return;
    }
    const { data, error } = await supabase
      .from('palio_edition_results')
      .select('contrada_id, game, points')
      .eq('edition_id', editionId);
    if (error) {
      console.error('Error fetching palio edition results:', error);
      setEditionResults([]);
      return;
    }
    setEditionResults(data ?? []);
  }, [supabase]);

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      const { data: contradeData, error: contradeError } = await supabase.from('contrade').select('id, name').order('name');
      if (contradeError) console.error('Error fetching contrade:', contradeError);
      setContrade((contradeData as Contrada[]) ?? []);
      await Promise.all([fetchEditions(), fetchLiveControls()]);
      setLoading(false);
    }
    loadInitialData();
  }, [fetchEditions, fetchLiveControls, supabase]);

  useEffect(() => {
    fetchEditionResults(selectedEditionId);
    fetchHeats(selectedEditionId);
  }, [fetchEditionResults, fetchHeats, selectedEditionId]);

  const selectedEdition = useMemo(
    () => editions.find((edition) => edition.id === selectedEditionId) ?? null,
    [editions, selectedEditionId]
  );
  const latestEdition = useMemo(
    () => [...editions].sort((a, b) => getPalioEditionOrder(b) - getPalioEditionOrder(a))[0] ?? null,
    [editions]
  );
  const nextEdition = useMemo(
    () => latestEdition ? getNextPalioEdition(latestEdition) : { year: new Date().getFullYear(), month: 'maggio' as const },
    [latestEdition]
  );
  const currentMonth = selectedEdition?.month ?? nextEdition.month;
  const availableGames = getAvailablePalioGamesForMonth(currentMonth);
  // Le batterie riguardano solo le prove a tempo: melocotogno non ha
  // batterie (si segna "senza giocatori" direttamente sui risultati) e la
  // finale usa sempre le prime 3 classificate, senza estrazione.
  const availableHeatGames: PalioGame[] = availableGames.filter((g) => g !== 'melocotogno' && g !== 'finale');

  const selectedLiveControl = useMemo(
    () => liveControls.find((control) => control.edition_id === selectedEditionId) ?? null,
    [liveControls, selectedEditionId]
  );
  const activeLiveControl = useMemo(
    () => liveControls.find((control) => control.is_active) ?? null,
    [liveControls]
  );
  const drawableHeatCount = useMemo(
    () => heats.filter((heat) => heat.game !== 'melocotogno' && heat.game !== 'finale').length,
    [heats]
  );
  const revealedDrawCount = Math.min(Math.max(selectedLiveControl?.draw_revealed_count ?? 0, 0), drawableHeatCount);

  // Se non è ancora selezionata un'edizione, precompila con quella
  // attualmente in diretta (se c'è).
  useEffect(() => {
    if (selectedEditionId || !activeLiveControl) return;
    setSelectedEditionId(activeLiveControl.edition_id);
  }, [activeLiveControl, selectedEditionId]);

  useEffect(() => {
    setLiveTitleInput(selectedLiveControl?.live_title ?? '');
    setTripliceWinnerId(selectedLiveControl?.triplice_winner_contrada_id ?? '');
  }, [selectedLiveControl]);

  useEffect(() => {
    if (!availableGames.includes(game)) {
      setGame(availableGames[0]);
    }
    if (!availableHeatGames.includes(heatGame)) {
      setHeatGame(availableHeatGames[0] ?? 'corsa');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  useEffect(() => {
    async function fetchResultsForGame() {
      const empty = contrade.map((c) => emptyResultRow(c.id));
      if (!selectedEditionId) {
        setResults(empty);
        return;
      }

      const { data, error } = await supabase
        .from('palio_edition_results')
        .select('contrada_id, position, points, notes, melocotogno_2_count, melocotogno_5_count, melocotogno_10_count, time_seconds, penalty_count, adjusted_time_seconds, final_bonus_points, is_calculation_overridden, is_disqualified')
        .eq('edition_id', selectedEditionId)
        .eq('game', game);

      if (error) {
        console.error('Error fetching palio results:', error);
        setResults(empty);
        return;
      }

      const existingByContrada = new Map((data ?? []).map((row) => [row.contrada_id as string, row]));
      setResults(empty.map((row) => {
        const existing = existingByContrada.get(row.contrada_id);
        if (!existing) return row;
        return {
          adjusted_time_seconds: formatPalioNumberInput(existing.adjusted_time_seconds),
          contrada_id: row.contrada_id,
          final_bonus_points: formatPalioNumberInput(existing.final_bonus_points),
          is_calculation_overridden: Boolean(existing.is_calculation_overridden),
          is_disqualified: Boolean(existing.is_disqualified),
          melocotogno_2_count: formatPalioNumberInput(existing.melocotogno_2_count),
          melocotogno_5_count: formatPalioNumberInput(existing.melocotogno_5_count),
          melocotogno_10_count: formatPalioNumberInput(existing.melocotogno_10_count),
          notes: existing.notes ?? '',
          penalty_count: formatPalioNumberInput(existing.penalty_count),
          position: existing.position === null ? '' : String(existing.position),
          points: existing.points === null ? '' : String(existing.points),
          time_seconds: formatPalioNumberInput(existing.time_seconds),
        };
      }));
    }
    fetchResultsForGame();
  }, [contrade, game, selectedEditionId, supabase]);

  const noPlayerContradaIds = useMemo(
    () => new Set(heats.filter((heat) => heat.game === game && heat.no_players).map((heat) => heat.contrada_id)),
    [game, heats]
  );

  const preFinaleRanking = useMemo<RankingEntry[]>(() => {
    const totals = new Map<string, number>();
    contrade.forEach((c) => totals.set(c.id, 0));
    editionResults
      .filter((result) => result.game !== 'finale')
      .forEach((result) => {
        const points = result.points === null ? 0 : Number(result.points);
        if (!Number.isNaN(points)) {
          totals.set(result.contrada_id, (totals.get(result.contrada_id) ?? 0) + points);
        }
      });
    return Array.from(totals.entries())
      .map(([contradaId, totalPoints]) => ({ contradaId, totalPoints }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [contrade, editionResults]);
  const finalists = useMemo(() => preFinaleRanking.slice(0, 3), [preFinaleRanking]);

  const calculatedRows = useMemo(
    () => calculatePalioRows(results, game, noPlayerContradaIds),
    [game, noPlayerContradaIds, results]
  );
  const displayRows = useMemo(() => {
    const finalistIds = new Set(finalists.map((item) => item.contradaId));
    const rows = game === 'finale' ? calculatedRows.filter((row) => finalistIds.has(row.contrada_id)) : calculatedRows;

    return [...rows].sort((a, b) => {
      if (game === 'finale') {
        const firstOrder = getStablePalioRandomOrder(`${selectedEditionId}-${a.contrada_id}`);
        const secondOrder = getStablePalioRandomOrder(`${selectedEditionId}-${b.contrada_id}`);
        if (firstOrder !== secondOrder) return firstOrder - secondOrder;
      }
      const firstName = contrade.find((c) => c.id === a.contrada_id)?.name ?? '';
      const secondName = contrade.find((c) => c.id === b.contrada_id)?.name ?? '';
      return firstName.localeCompare(secondName, 'it');
    });
  }, [calculatedRows, contrade, finalists, game, selectedEditionId]);

  const validation = useMemo(
    () => validatePalioRows(displayRows, game, noPlayerContradaIds),
    [displayRows, game, noPlayerContradaIds]
  );

  const isFinaleReady = useMemo(() => {
    if (currentMonth !== 'ottobre') return true;
    const expectedGames: PalioGame[] = getAvailablePalioGamesForMonth(currentMonth).filter((g) => g !== 'finale');
    const expectedCount = contrade.length * expectedGames.length;
    const completedCount = editionResults.filter((result) =>
      expectedGames.includes(result.game) && result.points !== null && !Number.isNaN(Number(result.points))
    ).length;
    return expectedCount > 0 && completedCount >= expectedCount;
  }, [contrade.length, currentMonth, editionResults]);

  function updateField(contradaId: string, field: keyof PalioEditionResultInput, value: string | boolean) {
    setResults((prev) => prev.map((row) => (row.contrada_id === contradaId ? { ...row, [field]: value } : row)));
  }

  // Incrementa/decrementa un conteggio fettucce senza mai scendere sotto zero,
  // per correggere comodamente un valore inserito per errore in eccesso.
  function stepMelocotognoField(
    contradaId: string,
    field: 'melocotogno_2_count' | 'melocotogno_5_count' | 'melocotogno_10_count',
    delta: number
  ) {
    setResults((prev) => prev.map((row) => {
      if (row.contrada_id !== contradaId) return row;
      const current = parsePalioInteger(row[field]) ?? 0;
      const next = Math.max(0, current + delta);
      return { ...row, [field]: String(next) };
    }));
  }

  function updateCalculationOverride(contradaId: string, enabled: boolean) {
    setResults((prev) => {
      const calculatedRow = calculatePalioRows(prev, game, noPlayerContradaIds).find((r) => r.contrada_id === contradaId);
      return prev.map((row) => {
        if (row.contrada_id !== contradaId) return row;
        if (!enabled || !calculatedRow) {
          return { ...row, is_calculation_overridden: false };
        }
        return {
          ...row,
          adjusted_time_seconds: calculatedRow.adjusted_time_seconds,
          is_calculation_overridden: true,
          points: calculatedRow.points,
          position: calculatedRow.position,
        };
      });
    });
  }

  // "Senza giocatori" per il melocotogno: non ha batterie, quindi si marca
  // direttamente dalla riga risultati. Per le altre prove si marca dalla
  // tabella batterie qui sotto. In entrambi i casi il dato vive in
  // palio_edition_heats (come nell'Admin del Fanta).
  function updateNoPlayerField(contradaId: string, targetGame: PalioGame, checked: boolean) {
    setHeats((prev) => {
      const existing = prev.find((heat) => heat.game === targetGame && heat.contrada_id === contradaId);
      if (!existing) {
        const nextDisplayOrder = Math.max(0, ...prev.filter((heat) => heat.game === targetGame).map((heat) => heat.display_order)) + 1;
        return [...prev, { contrada_id: contradaId, display_order: nextDisplayOrder, game: targetGame, heat_number: 1, no_players: checked }];
      }
      return prev.map((heat) => (heat.game === targetGame && heat.contrada_id === contradaId ? { ...heat, no_players: checked } : heat));
    });
  }

  async function resolveEdition(): Promise<PalioEdition | null> {
    if (selectedEdition) return selectedEdition;

    const { data, error } = await supabase
      .from('palio_editions')
      .upsert(nextEdition, { onConflict: 'year,month' })
      .select('id, year, month')
      .single();

    if (error) {
      setStatusMessage(`Errore creazione edizione: ${error.message}`);
      return null;
    }

    const edition = data as PalioEdition;
    setSelectedEditionId(edition.id);
    await fetchEditions();
    return edition;
  }

  async function handleCreateEdition() {
    if (creatingEdition) return;
    setCreatingEdition(true);
    try {
      const { data, error } = await supabase
        .from('palio_editions')
        .upsert(nextEdition, { onConflict: 'year,month' })
        .select('id')
        .single();
      if (error) {
        setStatusMessage(`Errore creazione edizione: ${error.message}`);
        return;
      }
      if (data?.id) setSelectedEditionId(data.id);
      await fetchEditions();
      setStatusMessage(`Edizione ${formatPalioEditionLabel(nextEdition)} creata`);
    } finally {
      setCreatingEdition(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (validation.invalidCount > 0) {
      setStatusMessage('Correggi i valori evidenziati prima di salvare');
      return;
    }
    if (game === 'finale' && !isFinaleReady) {
      setStatusMessage('Completa e salva tutte le prove precedenti prima di inserire la Triplice Tenzone');
      return;
    }

    setSaving(true);
    try {
      const edition = await resolveEdition();
      if (!edition) return;

      const finalistIds = new Set(finalists.map((item) => item.contradaId));
      const rowsToSave = game === 'finale' ? calculatedRows.filter((row) => finalistIds.has(row.contrada_id)) : calculatedRows;
      const payload = rowsToSave.map((r) => ({
        adjusted_time_seconds: parsePalioNumber(r.adjusted_time_seconds),
        edition_id: edition.id,
        final_bonus_points: parsePalioNumber(r.final_bonus_points),
        game,
        is_calculation_overridden: r.is_calculation_overridden,
        is_disqualified: r.is_disqualified,
        melocotogno_2_count: parsePalioInteger(r.melocotogno_2_count),
        melocotogno_5_count: parsePalioInteger(r.melocotogno_5_count),
        melocotogno_10_count: parsePalioInteger(r.melocotogno_10_count),
        contrada_id: r.contrada_id,
        penalty_count: parsePalioInteger(r.penalty_count),
        position: r.position ? Number.parseInt(r.position, 10) : null,
        points: r.points ? Number.parseFloat(r.points) : null,
        notes: r.notes || null,
        time_seconds: parsePalioNumber(r.time_seconds),
      }));

      const { error: upsertError } = await supabase
        .from('palio_edition_results')
        .upsert(payload, { onConflict: 'edition_id,game,contrada_id' });
      if (upsertError) {
        setStatusMessage(`Errore salvataggio risultati: ${upsertError.message}`);
        return;
      }

      // Marcature "senza giocatori" per questa prova (melocotogno incluso,
      // dato che non ha una tabella batterie propria).
      const noPlayerMarkerPayload = heats
        .filter((heat) => heat.game === game)
        .map((heat) => ({
          contrada_id: heat.contrada_id,
          display_order: heat.display_order,
          edition_id: edition.id,
          game,
          heat_number: heat.heat_number,
          no_players: heat.no_players,
        }));
      if (noPlayerMarkerPayload.length > 0) {
        const { error: markerError } = await supabase
          .from('palio_edition_heats')
          .upsert(noPlayerMarkerPayload, { onConflict: 'edition_id,game,contrada_id' });
        if (markerError) {
          setStatusMessage(`Risultati salvati, ma marcatori senza giocatori non aggiornati: ${markerError.message}`);
          return;
        }
        await fetchHeats(edition.id);
      }

      if (game === 'finale' && finalistIds.size > 0) {
        const finalistIdsForSql = Array.from(finalistIds).join(',');
        const { error: cleanupError } = await supabase
          .from('palio_edition_results')
          .delete()
          .eq('edition_id', edition.id)
          .eq('game', 'finale')
          .not('contrada_id', 'in', `(${finalistIdsForSql})`);
        if (cleanupError) {
          setStatusMessage(`Risultati salvati, ma pulizia finale non completata: ${cleanupError.message}`);
          return;
        }
      }

      await fetchEditionResults(edition.id);
      setStatusMessage(`Risultati ${formatPalioEditionLabel(edition)} salvati. Il ricalcolo dei punteggi Fanta si fa dal pannello Admin del Fanta.`);
    } finally {
      setSaving(false);
    }
  }

  // ---- Regia diretta pubblica (palio_live_controls) ----

  async function handleToggleLiveActive() {
    if (!selectedEditionId) {
      setRegiaStatusMessage("Seleziona prima un'edizione");
      return;
    }

    setSavingLiveField('is_active');
    try {
      if (selectedLiveControl?.is_active) {
        const { error } = await supabase
          .from('palio_live_controls')
          .update({ is_active: false })
          .eq('id', selectedLiveControl.id);
        if (error) {
          setRegiaStatusMessage(`Errore disattivazione diretta: ${error.message}`);
          return;
        }
        await fetchLiveControls();
        setRegiaStatusMessage('Diretta disattivata');
        return;
      }

      const { error: disableError } = await supabase
        .from('palio_live_controls')
        .update({ is_active: false })
        .eq('is_active', true);
      if (disableError) {
        setRegiaStatusMessage(`Errore aggiornamento diretta: ${disableError.message}`);
        return;
      }

      const { error } = await supabase
        .from('palio_live_controls')
        .upsert({
          edition_id: selectedEditionId,
          is_active: true,
          live_title: selectedLiveControl?.live_title ?? null,
          show_heats: selectedLiveControl?.show_heats ?? false,
          show_games: selectedLiveControl?.show_games ?? true,
          show_partial_ranking: selectedLiveControl?.show_partial_ranking ?? true,
          show_total_ranking: selectedLiveControl?.show_total_ranking ?? true,
          triplice_winner_contrada_id: selectedLiveControl?.triplice_winner_contrada_id ?? null,
          draw_revealed_count: selectedLiveControl?.draw_revealed_count ?? 0,
        }, { onConflict: 'edition_id' });
      if (error) {
        setRegiaStatusMessage(`Errore attivazione diretta: ${error.message}`);
        return;
      }
      await fetchLiveControls();
      setRegiaStatusMessage('Diretta aggiornata');
    } finally {
      setSavingLiveField(null);
    }
  }

  async function handleToggleLiveSection(
    field: keyof Pick<PalioLiveControl, 'show_heats' | 'show_games' | 'show_partial_ranking' | 'show_total_ranking'>
  ) {
    if (!selectedEditionId) {
      setRegiaStatusMessage("Seleziona prima un'edizione");
      return;
    }

    const nextValue = !(selectedLiveControl?.[field] ?? true);
    setSavingLiveField(field);
    try {
      const { error } = await supabase
        .from('palio_live_controls')
        .upsert({
          edition_id: selectedEditionId,
          is_active: selectedLiveControl?.is_active ?? false,
          live_title: selectedLiveControl?.live_title ?? null,
          show_heats: field === 'show_heats' ? nextValue : selectedLiveControl?.show_heats ?? false,
          show_games: field === 'show_games' ? nextValue : selectedLiveControl?.show_games ?? true,
          show_partial_ranking: field === 'show_partial_ranking' ? nextValue : selectedLiveControl?.show_partial_ranking ?? true,
          show_total_ranking: field === 'show_total_ranking' ? nextValue : selectedLiveControl?.show_total_ranking ?? true,
          triplice_winner_contrada_id: selectedLiveControl?.triplice_winner_contrada_id ?? null,
          draw_revealed_count: selectedLiveControl?.draw_revealed_count ?? 0,
        }, { onConflict: 'edition_id' });
      if (error) {
        setRegiaStatusMessage(`Errore aggiornamento sezione: ${error.message}`);
        return;
      }
      await fetchLiveControls();
    } finally {
      setSavingLiveField(null);
    }
  }

  async function handleSaveLiveTitle() {
    if (!selectedEditionId) {
      setRegiaStatusMessage("Seleziona prima un'edizione");
      return;
    }

    setSavingLiveField('live_title');
    try {
      const normalizedTitle = liveTitleInput.trim();
      const { error } = await supabase
        .from('palio_live_controls')
        .upsert({
          edition_id: selectedEditionId,
          is_active: selectedLiveControl?.is_active ?? false,
          live_title: normalizedTitle || null,
          show_heats: selectedLiveControl?.show_heats ?? false,
          show_games: selectedLiveControl?.show_games ?? true,
          show_partial_ranking: selectedLiveControl?.show_partial_ranking ?? true,
          show_total_ranking: selectedLiveControl?.show_total_ranking ?? true,
          triplice_winner_contrada_id: selectedLiveControl?.triplice_winner_contrada_id ?? null,
          draw_revealed_count: selectedLiveControl?.draw_revealed_count ?? 0,
        }, { onConflict: 'edition_id' });
      if (error) {
        setRegiaStatusMessage(`Errore salvataggio titolo diretta: ${error.message}`);
        return;
      }
      await fetchLiveControls();
      setRegiaStatusMessage('Titolo diretta aggiornato');
    } finally {
      setSavingLiveField(null);
    }
  }

  async function handleSaveTripliceWinner() {
    if (!selectedEditionId) {
      setRegiaStatusMessage("Seleziona prima un'edizione");
      return;
    }

    const normalizedWinnerId = tripliceWinnerId || null;
    setSavingLiveField('triplice_winner');
    try {
      const { error } = await supabase
        .from('palio_live_controls')
        .upsert({
          edition_id: selectedEditionId,
          is_active: selectedLiveControl?.is_active ?? false,
          live_title: selectedLiveControl?.live_title ?? null,
          show_heats: selectedLiveControl?.show_heats ?? false,
          show_games: selectedLiveControl?.show_games ?? true,
          show_partial_ranking: selectedLiveControl?.show_partial_ranking ?? true,
          show_total_ranking: selectedLiveControl?.show_total_ranking ?? true,
          triplice_winner_contrada_id: normalizedWinnerId,
          draw_revealed_count: selectedLiveControl?.draw_revealed_count ?? 0,
        }, { onConflict: 'edition_id' });
      if (error) {
        setRegiaStatusMessage(`Errore salvataggio vincitore Triplice Tenzone: ${error.message}`);
        return;
      }
      await fetchLiveControls();
      setRegiaStatusMessage(normalizedWinnerId ? 'Vincitore Triplice Tenzone confermato' : 'Vincitore Triplice Tenzone rimosso');
    } finally {
      setSavingLiveField(null);
    }
  }

  async function handleSetDrawRevealedCount(nextCount: number) {
    if (!selectedEditionId) {
      setRegiaStatusMessage("Seleziona prima un'edizione");
      return;
    }

    const normalizedCount = Math.min(Math.max(nextCount, 0), drawableHeatCount);
    setSavingLiveField('draw_revealed_count');
    try {
      const { error } = await supabase
        .from('palio_live_controls')
        .upsert({
          edition_id: selectedEditionId,
          is_active: selectedLiveControl?.is_active ?? false,
          live_title: selectedLiveControl?.live_title ?? null,
          show_heats: selectedLiveControl?.show_heats ?? false,
          show_games: selectedLiveControl?.show_games ?? true,
          show_partial_ranking: selectedLiveControl?.show_partial_ranking ?? true,
          show_total_ranking: selectedLiveControl?.show_total_ranking ?? true,
          triplice_winner_contrada_id: selectedLiveControl?.triplice_winner_contrada_id ?? null,
          draw_revealed_count: normalizedCount,
        }, { onConflict: 'edition_id' });
      if (error) {
        setRegiaStatusMessage(`Errore aggiornamento estrazioni: ${error.message}`);
        return;
      }
      await fetchLiveControls();
      setRegiaStatusMessage(
        normalizedCount === 0
          ? 'Estrazioni resettate'
          : normalizedCount >= drawableHeatCount
            ? 'Tutte le estrazioni inviate'
            : `Estrazione ${normalizedCount}/${drawableHeatCount} inviata`
      );
    } finally {
      setSavingLiveField(null);
    }
  }

  // ---- Gestione batterie (corsa/carriola/cerchio/torre) ----

  const heatEligibleContrade = contrade;
  const selectedHeatGameHeats = useMemo(
    () => heats
      .filter((heat) => heat.game === heatGame)
      .sort((a, b) => {
        if (a.no_players !== b.no_players) return a.no_players ? 1 : -1;
        if (a.heat_number !== b.heat_number) return a.heat_number - b.heat_number;
        return a.display_order - b.display_order;
      }),
    [heatGame, heats]
  );
  const selectedHeatGameHeatByContradaId = useMemo(() => {
    const map = new Map<string, PalioEditionHeat>();
    selectedHeatGameHeats.forEach((heat) => map.set(heat.contrada_id, heat));
    return map;
  }, [selectedHeatGameHeats]);
  const heatRows = useMemo(() => {
    const parsedHeatSize = Number.parseInt(heatSize, 10);
    const fallbackHeatSize = Number.isNaN(parsedHeatSize) || parsedHeatSize < 2 ? 3 : parsedHeatSize;

    return [...heatEligibleContrade]
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      .map((contrada, index) => {
        const existingHeat = selectedHeatGameHeatByContradaId.get(contrada.id);
        if (existingHeat) return existingHeat;
        return {
          contrada_id: contrada.id,
          display_order: (index % fallbackHeatSize) + 1,
          game: heatGame,
          heat_number: Math.floor(index / fallbackHeatSize) + 1,
          no_players: false,
        };
      });
  }, [heatEligibleContrade, heatGame, heatSize, selectedHeatGameHeatByContradaId]);

  function updateHeatField(contradaId: string, field: 'display_order' | 'heat_number' | 'no_players', value: string | boolean) {
    const nextValue = typeof value === 'boolean' ? value : (() => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
    })();

    setHeats((prev) => {
      const existing = prev.find((heat) => heat.game === heatGame && heat.contrada_id === contradaId);
      if (!existing) {
        return [...prev, {
          contrada_id: contradaId,
          display_order: field === 'display_order' && typeof nextValue === 'number' ? nextValue : 1,
          game: heatGame,
          heat_number: field === 'heat_number' && typeof nextValue === 'number' ? nextValue : 1,
          no_players: field === 'no_players' && typeof nextValue === 'boolean' ? nextValue : false,
        }];
      }
      return prev.map((heat) => (heat.game === heatGame && heat.contrada_id === contradaId ? { ...heat, [field]: nextValue } : heat));
    });
  }

  async function upsertNoPlayerResultMarkers(editionId: string, payload: PalioEditionHeat[]) {
    const noPlayerPayload = payload
      .filter((heat) => heat.no_players)
      .map((heat) => ({
        adjusted_time_seconds: null,
        contrada_id: heat.contrada_id,
        edition_id: editionId,
        final_bonus_points: null,
        game: heatGame,
        is_disqualified: true,
        melocotogno_2_count: null,
        melocotogno_5_count: null,
        melocotogno_10_count: null,
        notes: 'Senza giocatori',
        penalty_count: 999,
        points: 1,
        position: 12,
        time_seconds: null,
      }));
    if (noPlayerPayload.length === 0) return null;

    const { error } = await supabase.from('palio_edition_results').upsert(noPlayerPayload, { onConflict: 'edition_id,game,contrada_id' });
    return error;
  }

  async function handleSaveHeats() {
    if (!selectedEditionId) {
      setHeatsStatusMessage("Seleziona prima un'edizione");
      return;
    }
    if (heatRows.length === 0) {
      setHeatsStatusMessage('Non ci sono contrade disponibili per questo gioco');
      return;
    }

    setSavingHeats(true);
    try {
      const parsedHeatSize = Number.parseInt(heatSize, 10);
      const normalizedHeatSize = Number.isNaN(parsedHeatSize) || parsedHeatSize < 2 ? 3 : parsedHeatSize;
      const getContradaName = (contradaId: string) => contrade.find((c) => c.id === contradaId)?.name ?? '';
      const orderedRows = [
        ...heatRows.filter((heat) => !heat.no_players).sort((a, b) => {
          if (a.heat_number !== b.heat_number) return a.heat_number - b.heat_number;
          if (a.display_order !== b.display_order) return a.display_order - b.display_order;
          return getContradaName(a.contrada_id).localeCompare(getContradaName(b.contrada_id), 'it');
        }),
        ...heatRows.filter((heat) => heat.no_players).sort((a, b) => getContradaName(a.contrada_id).localeCompare(getContradaName(b.contrada_id), 'it')),
      ];
      const payload = orderedRows.map((heat, index) => ({
        contrada_id: heat.contrada_id,
        display_order: (index % normalizedHeatSize) + 1,
        edition_id: selectedEditionId,
        game: heatGame,
        heat_number: Math.floor(index / normalizedHeatSize) + 1,
        no_players: heat.no_players,
      }));

      const { error: upsertError } = await supabase.from('palio_edition_heats').upsert(payload, { onConflict: 'edition_id,game,contrada_id' });
      if (upsertError) {
        setHeatsStatusMessage(`Errore salvataggio batterie: ${upsertError.message}`);
        return;
      }

      const ids = Array.from(new Set(payload.map((h) => h.contrada_id))).join(',');
      if (ids) {
        const { error: cleanupError } = await supabase
          .from('palio_edition_heats')
          .delete()
          .eq('edition_id', selectedEditionId)
          .eq('game', heatGame)
          .not('contrada_id', 'in', `(${ids})`);
        if (cleanupError) {
          setHeatsStatusMessage(`Batterie salvate, ma pulizia non completata: ${cleanupError.message}`);
          return;
        }
      }

      const markerError = await upsertNoPlayerResultMarkers(selectedEditionId, payload);
      if (markerError) {
        setHeatsStatusMessage(`Batterie salvate, ma risultati N.A. non aggiornati: ${markerError.message}`);
        return;
      }

      await fetchHeats(selectedEditionId);
      await fetchEditionResults(selectedEditionId);
      setHeatsStatusMessage(`Batterie ${liveGameLabels[heatGame]} salvate`);
    } finally {
      setSavingHeats(false);
    }
  }

  async function handleGenerateHeats() {
    if (!selectedEditionId) {
      setHeatsStatusMessage("Seleziona prima un'edizione");
      return;
    }
    const parsedHeatSize = Number.parseInt(heatSize, 10);
    if (Number.isNaN(parsedHeatSize) || parsedHeatSize < 2) {
      setHeatsStatusMessage('Inserisci almeno 2 contrade per batteria');
      return;
    }
    if (heatEligibleContrade.length === 0) {
      setHeatsStatusMessage('Non ci sono contrade disponibili per questo gioco');
      return;
    }

    setSavingHeats(true);
    try {
      const noPlayerIds = new Set(selectedHeatGameHeats.filter((h) => h.no_players).map((h) => h.contrada_id));
      const sorted = [...heatEligibleContrade].sort((a, b) => a.name.localeCompare(b.name, 'it'));
      const shuffled = sorted
        .filter((c) => !noPlayerIds.has(c.id))
        .map((c) => ({ contrada: c, random: Math.random() }))
        .sort((a, b) => a.random - b.random)
        .map((item) => item.contrada);
      const noPlayerContrade = sorted.filter((c) => noPlayerIds.has(c.id));
      const ordered = [...shuffled, ...noPlayerContrade];

      const payload = ordered.map((contrada, index) => ({
        contrada_id: contrada.id,
        display_order: (index % parsedHeatSize) + 1,
        edition_id: selectedEditionId,
        game: heatGame,
        heat_number: Math.floor(index / parsedHeatSize) + 1,
        no_players: noPlayerIds.has(contrada.id),
      }));

      const { error: deleteError } = await supabase.from('palio_edition_heats').delete().eq('edition_id', selectedEditionId).eq('game', heatGame);
      if (deleteError) {
        setHeatsStatusMessage(`Errore pulizia batterie: ${deleteError.message}`);
        return;
      }

      const { error: insertError } = await supabase.from('palio_edition_heats').insert(payload);
      if (insertError) {
        setHeatsStatusMessage(`Errore estrazione batterie: ${insertError.message}`);
        return;
      }

      const markerError = await upsertNoPlayerResultMarkers(selectedEditionId, payload);
      if (markerError) {
        setHeatsStatusMessage(`Batterie estratte, ma risultati N.A. non aggiornati: ${markerError.message}`);
        return;
      }

      await fetchHeats(selectedEditionId);
      await fetchEditionResults(selectedEditionId);
      setHeatsStatusMessage(`Batterie ${liveGameLabels[heatGame]} estratte`);
    } finally {
      setSavingHeats(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-stone-400">Caricamento...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-medieval text-2xl font-bold text-stone-100">Gestione Palio</h1>
      <p className="mt-1 text-sm text-stone-400">
        Scrive su <code>palio_edition_results</code>, <code>palio_edition_heats</code> e <code>palio_live_controls</code>,
        le stesse tabelle del pannello Admin del Fanta. Il ricalcolo dei punteggi Fanta resta riservato a quel pannello.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-stone-800 bg-stone-900 p-4">
        <label className="text-sm font-semibold text-stone-300">
          Edizione
          <select
            value={selectedEditionId}
            onChange={(e) => setSelectedEditionId(e.target.value)}
            className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
          >
            <option value="">Prossima: {formatPalioEditionLabel(nextEdition)}</option>
            {editions.map((edition) => (
              <option key={edition.id} value={edition.id}>{formatPalioEditionLabel(edition)}</option>
            ))}
          </select>
        </label>
        {!selectedEditionId && (
          <button
            type="button"
            onClick={handleCreateEdition}
            disabled={creatingEdition}
            className="inline-flex items-center gap-1.5 rounded-md border border-palio-500/50 px-3 py-1.5 text-sm font-semibold text-palio-300 hover:border-palio-400 disabled:opacity-50"
          >
            <PlusCircle className="h-4 w-4" />
            Crea edizione
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className={`rounded-md px-3 py-2 text-sm font-semibold ${activeLiveControl ? 'bg-emerald-950/40 text-emerald-300' : 'bg-stone-800 text-stone-400'}`}>
            {activeLiveControl
              ? `Diretta attiva: ${formatPalioEditionLabel(editions.find((edition) => edition.id === activeLiveControl.edition_id) ?? nextEdition)}`
              : 'Diretta non attiva'}
          </div>
          <button
            type="button"
            disabled={!selectedEditionId || savingLiveField === 'is_active'}
            onClick={handleToggleLiveActive}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
              selectedLiveControl?.is_active ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {selectedLiveControl?.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {selectedLiveControl?.is_active ? 'Disattiva diretta' : 'Attiva questa edizione'}
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSaveLiveTitle(); }}
          className="flex w-full flex-wrap items-end gap-3"
        >
          <label className="text-sm font-semibold text-stone-300">
            Nome mostrato nella diretta
            <input
              type="text"
              value={liveTitleInput}
              onChange={(e) => setLiveTitleInput(e.target.value)}
              placeholder={selectedEdition ? formatPalioEditionLabel(selectedEdition) : 'Es. Palio di Ottobre 2026'}
              className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
            />
          </label>
          <button
            type="submit"
            disabled={!selectedEditionId || savingLiveField === 'live_title'}
            className="inline-flex items-center gap-1.5 rounded-md bg-palio-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-palio-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Salva nome
          </button>
        </form>
        {regiaStatusMessage && <p className="text-sm font-semibold text-amber-300">{regiaStatusMessage}</p>}
      </div>

      {/* ---- Estrazioni / Giochi ---- */}
      <div className="mt-6 flex gap-2 border-b border-stone-800">
        <button
          type="button"
          onClick={() => setActiveSection('estrazioni')}
          className={`flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-semibold transition ${
            activeSection === 'estrazioni' ? 'border-b-2 border-palio-500 text-palio-300' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Repeat className="h-4 w-4" />
          Estrazioni
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('giochi')}
          className={`flex items-center gap-2 rounded-t-md px-4 py-2 text-sm font-semibold transition ${
            activeSection === 'giochi' ? 'border-b-2 border-palio-500 text-palio-300' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          <Trophy className="h-4 w-4" />
          Giochi
        </button>
      </div>

      {activeSection === 'estrazioni' && (
        <div className="mt-4 space-y-6">
          <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-300">
                  <Send className="h-4 w-4" />
                  Regia estrazioni
                </h3>
                <p className="mt-1 text-sm text-blue-100/80">Controlla la pagina /estrazioni: resetta, invia una batteria alla volta o mostra tutto.</p>
                <p className="mt-1 text-sm font-semibold text-blue-100">Inviate {revealedDrawCount}/{drawableHeatCount} estrazioni</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!selectedEditionId || savingLiveField === 'draw_revealed_count' || drawableHeatCount === 0}
                  onClick={() => handleSetDrawRevealedCount(0)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-700 px-3 py-1.5 text-sm font-semibold text-blue-200 hover:border-blue-400 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
                <button
                  type="button"
                  disabled={!selectedEditionId || savingLiveField === 'draw_revealed_count' || drawableHeatCount === 0 || revealedDrawCount >= drawableHeatCount}
                  onClick={() => handleSetDrawRevealedCount(revealedDrawCount + 1)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Invia prossima
                </button>
                <button
                  type="button"
                  disabled={!selectedEditionId || savingLiveField === 'draw_revealed_count' || drawableHeatCount === 0}
                  onClick={() => handleSetDrawRevealedCount(drawableHeatCount)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Flag className="h-4 w-4" />
                  Invia tutte
                </button>
              </div>
            </div>
            {drawableHeatCount === 0 && (
              <p className="mt-3 text-sm text-blue-100/70">
                Nessuna batteria estratta per Corsa/Carriole/Cerchio/Torre. Melocotogno e Triplice Tenzone non vengono inviate qui.
              </p>
            )}
          </div>

          {availableHeatGames.length > 0 && (
            <div className="rounded-lg border border-stone-800 bg-stone-900 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">Batterie di partenza</h2>
              <p className="mt-1 text-sm text-stone-500">Estrai o modifica le batterie per ogni prova. La pagina /estrazioni le mostra separate.</p>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm font-semibold text-stone-300">
                  Gioco
                  <select
                    value={heatGame}
                    onChange={(e) => setHeatGame(e.target.value as PalioGame)}
                    className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  >
                    {availableHeatGames.map((g) => (
                      <option key={g} value={g}>{liveGameLabels[g]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-stone-300">
                  Contrade per batteria
                  <input
                    type="number" min={2} max={heatEligibleContrade.length || 12}
                    value={heatSize}
                    onChange={(e) => setHeatSize(e.target.value)}
                    className="ml-2 w-20 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  />
                </label>
                <button
                  type="button"
                  disabled={!selectedEditionId || savingHeats}
                  onClick={handleGenerateHeats}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Repeat className="h-4 w-4" />
                  Estrai
                </button>
                <button
                  type="button"
                  disabled={!selectedEditionId || savingHeats}
                  onClick={handleSaveHeats}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Salva
                </button>
              </div>

              {heatsStatusMessage && <p className="mt-3 text-sm font-semibold text-palio-300">{heatsStatusMessage}</p>}

              {heatRows.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-md border border-stone-700">
                  <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_140px] gap-2 border-b border-stone-700 bg-stone-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    <span>Contrada</span>
                    <span>Batteria</span>
                    <span>Ordine</span>
                    <span>Assenza giocatori</span>
                  </div>
                  <div className="max-h-80 divide-y divide-stone-800 overflow-y-auto">
                    {[...heatRows]
                      .sort((a, b) => {
                        if (a.no_players !== b.no_players) return a.no_players ? 1 : -1;
                        if (a.heat_number !== b.heat_number) return a.heat_number - b.heat_number;
                        if (a.display_order !== b.display_order) return a.display_order - b.display_order;
                        const firstName = contrade.find((c) => c.id === a.contrada_id)?.name ?? '';
                        const secondName = contrade.find((c) => c.id === b.contrada_id)?.name ?? '';
                        return firstName.localeCompare(secondName, 'it');
                      })
                      .map((heat) => {
                        const contrada = contrade.find((c) => c.id === heat.contrada_id);
                        return (
                          <div key={heat.contrada_id} className="grid grid-cols-[minmax(0,1fr)_90px_90px_140px] items-center gap-2 px-3 py-2">
                            <div className="truncate text-sm font-medium text-stone-100">{contrada?.name ?? 'Contrada'}</div>
                            <input
                              type="number" min={1}
                              value={heat.heat_number}
                              onChange={(e) => updateHeatField(heat.contrada_id, 'heat_number', e.target.value)}
                              className="w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-sm text-stone-100"
                            />
                            <input
                              type="number" min={1}
                              value={heat.display_order}
                              onChange={(e) => updateHeatField(heat.contrada_id, 'display_order', e.target.value)}
                              className="w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-sm text-stone-100"
                            />
                            <label className="inline-flex items-center gap-2 text-sm font-medium text-stone-300">
                              <input
                                type="checkbox"
                                checked={heat.no_players}
                                onChange={(e) => updateHeatField(heat.contrada_id, 'no_players', e.target.checked)}
                                className="rounded border-stone-600"
                              />
                              Sì
                            </label>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeSection === 'giochi' && (
        <div className="mt-4 space-y-6">
          <div className="rounded-lg border border-stone-800 bg-stone-900 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">Cosa mostrare su /risultati</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { field: 'show_heats' as const, label: 'Batterie' },
                { field: 'show_games' as const, label: 'Risultati prove' },
                { field: 'show_partial_ranking' as const, label: 'Classifica parziale' },
                { field: 'show_total_ranking' as const, label: 'Classifica finale' },
              ]).map(({ field, label }) => {
                const isVisible = selectedLiveControl?.[field] ?? (field === 'show_heats' ? false : true);
                return (
                  <button
                    key={field}
                    type="button"
                    disabled={!selectedEditionId || savingLiveField === field}
                    onClick={() => handleToggleLiveSection(field)}
                    className="flex items-center justify-between rounded-md border border-stone-700 bg-stone-950 px-3 py-2 text-sm font-medium text-stone-200 transition hover:border-amber-500 disabled:opacity-50"
                  >
                    {label}
                    {isVisible ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-stone-500" />}
                  </button>
                );
              })}
            </div>

            {currentMonth === 'ottobre' && (
              <form
                onSubmit={(e) => { e.preventDefault(); handleSaveTripliceWinner(); }}
                className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-yellow-800/50 bg-yellow-950/20 p-4"
              >
                <label className="text-sm font-semibold text-stone-300">
                  Vincitore Triplice Tenzone
                  <select
                    value={tripliceWinnerId}
                    onChange={(e) => setTripliceWinnerId(e.target.value)}
                    className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  >
                    <option value="">Non decretato</option>
                    {finalists.map((item) => (
                      <option key={item.contradaId} value={item.contradaId}>
                        {contrade.find((c) => c.id === item.contradaId)?.name ?? item.contradaId}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={!selectedEditionId || savingLiveField === 'triplice_winner'}
                  className="inline-flex items-center gap-1.5 rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-yellow-700 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Conferma
                </button>
              </form>
            )}
          </div>

          <div>
            <div className="flex flex-wrap gap-2">
              {availableGames.map((g) => {
                const isActive = g === game;
                const isLocked = g === 'finale' && !isFinaleReady;
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={isLocked}
                    onClick={() => setGame(g)}
                    title={isLocked ? 'Completa prima tutte le prove precedenti' : undefined}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActive ? 'border-palio-500 bg-palio-500 text-white' : 'border-stone-700 bg-stone-900 text-stone-300 hover:border-palio-400'
                    }`}
                  >
                    {liveGameLabels[g]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-stone-400">{palioGameDescriptions[game]}</p>

            <div
              className={`mt-4 grid gap-3 rounded-lg border p-4 sm:grid-cols-3 ${
                validation.invalidCount > 0
                  ? 'border-red-900/60 bg-red-950/20'
                  : validation.missingCount > 0
                    ? 'border-amber-900/60 bg-amber-950/20'
                    : 'border-emerald-900/60 bg-emerald-950/20'
              }`}
            >
              <div className="flex items-center gap-2">
                {validation.invalidCount > 0 ? (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                ) : validation.missingCount > 0 ? (
                  <Clock className="h-5 w-5 text-amber-400" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                )}
                <span className="text-sm font-bold text-stone-100">
                  {validation.invalidCount > 0 ? 'Correzione richiesta' : validation.missingCount > 0 ? 'Bozza in corso' : 'Pronto per la conferma'}
                </span>
              </div>
              <div className="text-sm text-stone-300">{validation.completeCount} di {displayRows.length} contrade verificate</div>
              <div className="text-sm text-stone-300">
                {validation.invalidCount > 0
                  ? `${validation.invalidCount} valori da correggere`
                  : validation.missingCount > 0
                    ? `${validation.missingCount} risultati da inserire`
                    : 'Classifica e calcoli aggiornati automaticamente'}
              </div>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-3">
              {displayRows.map((row) => {
                const contrada = contrade.find((c) => c.id === row.contrada_id);
                const isMelocotogno = game === 'melocotogno';
                const isNoPlayer = noPlayerContradaIds.has(row.contrada_id);
                const rowStatus = validation.statusByContradaId.get(row.contrada_id) ?? 'missing';
                const isRowInvalid = rowStatus === 'invalid';
                const scoreLabel = rowStatus === 'missing'
                  ? 'In attesa'
                  : game === 'finale'
                    ? (row.adjusted_time_seconds ? `${row.adjusted_time_seconds}s` : 'N.A.')
                    : `${row.points || '0'} pt`;
                const heat = heats.find((h) => h.game === game && h.contrada_id === row.contrada_id);

                return (
                  <div
                    key={row.contrada_id}
                    className={`rounded-lg border bg-stone-900 p-4 ${
                      isRowInvalid ? 'border-red-700' : rowStatus === 'complete' || rowStatus === 'notApplicable' ? 'border-emerald-800' : 'border-stone-700'
                    }`}
                  >
                    <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_180px]">
                      <div>
                        <div className="font-semibold text-stone-100">{contrada?.name ?? 'Contrada'}</div>
                        {!isMelocotogno && heat && (
                          <div className="mt-1 inline-flex rounded-full bg-blue-950/40 px-2 py-0.5 text-xs font-semibold text-blue-300">
                            Batteria {heat.heat_number} · ordine {heat.display_order}
                          </div>
                        )}
                        {isNoPlayer && (
                          <div className="mt-1 inline-flex rounded-full bg-red-950/40 px-2 py-0.5 text-xs font-semibold text-red-300">
                            Senza giocatori · N.A.
                          </div>
                        )}
                      </div>

                      <div className={`grid gap-2 ${isMelocotogno ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
                        {isMelocotogno ? (
                          <>
                            <FettucciaStepper
                              contradaName={contrada?.name ?? 'contrada'}
                              disabled={isNoPlayer}
                              label="Fettucce da 2"
                              onChange={(delta) => stepMelocotognoField(row.contrada_id, 'melocotogno_2_count', delta)}
                              onInputChange={(value) => updateField(row.contrada_id, 'melocotogno_2_count', value)}
                              value={row.melocotogno_2_count}
                            />
                            <FettucciaStepper
                              contradaName={contrada?.name ?? 'contrada'}
                              disabled={isNoPlayer}
                              label="Fettucce da 5"
                              onChange={(delta) => stepMelocotognoField(row.contrada_id, 'melocotogno_5_count', delta)}
                              onInputChange={(value) => updateField(row.contrada_id, 'melocotogno_5_count', value)}
                              value={row.melocotogno_5_count}
                            />
                            <FettucciaStepper
                              contradaName={contrada?.name ?? 'contrada'}
                              disabled={isNoPlayer}
                              label="Fettucce da 10"
                              onChange={(delta) => stepMelocotognoField(row.contrada_id, 'melocotogno_10_count', delta)}
                              onInputChange={(value) => updateField(row.contrada_id, 'melocotogno_10_count', value)}
                              value={row.melocotogno_10_count}
                            />
                            <label className="flex items-center gap-2 text-xs font-semibold text-stone-400">
                              <input
                                type="checkbox"
                                checked={isNoPlayer}
                                onChange={(e) => updateNoPlayerField(row.contrada_id, game, e.target.checked)}
                                className="rounded border-stone-600"
                              />
                              Senza giocatori
                            </label>
                          </>
                        ) : (
                          <>
                            <label className="text-xs font-semibold text-stone-400">
                              Tempo (s)
                              <input
                                type="number" min={0} step="0.01" disabled={isNoPlayer}
                                value={row.time_seconds}
                                onChange={(e) => updateField(row.contrada_id, 'time_seconds', e.target.value)}
                                className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 disabled:opacity-50"
                              />
                            </label>
                            <label className="text-xs font-semibold text-stone-400">
                              Penalità
                              <input
                                type="number" min={0} step={1} disabled={isNoPlayer}
                                value={row.penalty_count}
                                onChange={(e) => updateField(row.contrada_id, 'penalty_count', e.target.value)}
                                className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 disabled:opacity-50"
                              />
                            </label>
                            <label className="col-span-2 inline-flex items-center gap-2 text-xs font-semibold text-stone-400">
                              <input
                                type="checkbox" disabled={isNoPlayer}
                                checked={row.is_disqualified}
                                onChange={(e) => updateField(row.contrada_id, 'is_disqualified', e.target.checked)}
                                className="rounded border-stone-600"
                              />
                              Non classificata (N.A.)
                            </label>
                          </>
                        )}
                        <label className={`text-xs font-semibold text-stone-400 ${isMelocotogno ? 'sm:col-span-4' : 'sm:col-span-2'}`}>
                          Note
                          <input
                            value={row.notes}
                            onChange={(e) => updateField(row.contrada_id, 'notes', e.target.value)}
                            className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100"
                          />
                        </label>
                      </div>

                      <div className="rounded-md border border-stone-700 bg-stone-800/60 p-3">
                        <div className="text-center">
                          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                            {row.is_calculation_overridden ? 'Calcolo corretto' : 'Calcolo automatico'}
                          </div>
                          <div className="mt-1 text-lg font-bold text-stone-100">{scoreLabel}</div>
                          <div className="mt-1 text-xs text-stone-400">{row.position ? `${row.position}° posizione` : 'Non calcolata'}</div>
                        </div>

                        <label className="mt-3 flex items-center gap-2 rounded-md border border-blue-900/60 bg-blue-950/30 px-2 py-1.5 text-xs font-semibold text-blue-200">
                          <input
                            type="checkbox"
                            checked={row.is_calculation_overridden}
                            disabled={isNoPlayer}
                            onChange={(e) => updateCalculationOverride(row.contrada_id, e.target.checked)}
                            className="rounded border-blue-700"
                          />
                          Correggi calcolo
                        </label>

                        {row.is_calculation_overridden && (
                          <div className="mt-3 space-y-2 border-t border-blue-900/60 pt-3">
                            {!isMelocotogno && !row.is_disqualified && (
                              <label className="block text-xs font-semibold text-stone-400">
                                Tempo corretto
                                <input
                                  type="number" min={0} step="0.01"
                                  value={row.adjusted_time_seconds}
                                  onChange={(e) => updateField(row.contrada_id, 'adjusted_time_seconds', e.target.value)}
                                  className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100"
                                />
                              </label>
                            )}
                            <label className="block text-xs font-semibold text-stone-400">
                              Posizione corretta
                              <input
                                type="number" min={1} step={1}
                                value={row.position}
                                onChange={(e) => updateField(row.contrada_id, 'position', e.target.value)}
                                className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100"
                              />
                            </label>
                            {game !== 'finale' && (
                              <label className="block text-xs font-semibold text-stone-400">
                                Punti corretti
                                <input
                                  type="number" min={0} step="0.01"
                                  value={row.points}
                                  onChange={(e) => updateField(row.contrada_id, 'points', e.target.value)}
                                  className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100"
                                />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {statusMessage && <p className="text-sm font-semibold text-palio-300">{statusMessage}</p>}

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Salvataggio...' : 'Salva risultati'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function PalioGestione() {
  return (
    <PalioAuthGate>
      <PalioResultsInputContent />
    </PalioAuthGate>
  );
}

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, PlusCircle, Save } from 'lucide-react';
import { getSupabaseClient } from '../config';
import { PalioAuthGate } from './PalioAuthGate';
import {
  type Contrada,
  type PalioEdition,
  type PalioGame,
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

// Porting semplificato di handleSavePalioResults (Admin.tsx di fantapalio):
// stesse tabelle (palio_edition_results), stessa RLS (can_manage_palio_games()),
// ma SENZA gestione batterie/no-players (resta nell'Admin del Fanta) e SENZA
// la correzione manuale del calcolo (riservata all'Admin pieno). Non chiama
// mai il ricalcolo dei punteggi Fanta: quello resta esclusivo dell'Admin.

const emptyResultRow = (contradaId: string): PalioEditionResultInput => ({
  adjusted_time_seconds: '',
  contrada_id: contradaId,
  final_bonus_points: '',
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

function PalioResultsInputContent() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [editions, setEditions] = useState<PalioEdition[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState('');
  const [game, setGame] = useState<PalioGame>('melocotogno');
  const [results, setResults] = useState<PalioEditionResultInput[]>([]);
  const [editionResults, setEditionResults] = useState<{ contrada_id: string; game: PalioGame; points: number | string | null }[]>([]);
  const [noPlayerContradaIds, setNoPlayerContradaIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingEdition, setCreatingEdition] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

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

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      const [{ data: contradeData, error: contradeError }] = await Promise.all([
        supabase.from('contrade').select('id, name').order('name'),
      ]);
      if (contradeError) console.error('Error fetching contrade:', contradeError);
      setContrade((contradeData as Contrada[]) ?? []);
      await fetchEditions();
      setLoading(false);
    }
    loadInitialData();
  }, [fetchEditions, supabase]);

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

  useEffect(() => {
    if (!availableGames.includes(game)) {
      setGame(availableGames[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  // Risultati completi dell'edizione (tutti i giochi) — servono per calcolare
  // i finalisti della Triplice Tenzone.
  useEffect(() => {
    async function fetchEditionResults() {
      if (!selectedEditionId) {
        setEditionResults([]);
        return;
      }
      const { data, error } = await supabase
        .from('palio_edition_results')
        .select('contrada_id, game, points')
        .eq('edition_id', selectedEditionId);
      if (error) {
        console.error('Error fetching palio edition results:', error);
        setEditionResults([]);
        return;
      }
      setEditionResults(data ?? []);
    }
    fetchEditionResults();
  }, [selectedEditionId, supabase]);

  // Marcature "senza giocatori" delle batterie — sola lettura: la gestione
  // batterie resta nell'Admin del Fanta, qui rispettiamo solo il dato.
  useEffect(() => {
    async function fetchNoPlayers() {
      if (!selectedEditionId) {
        setNoPlayerContradaIds(new Set());
        return;
      }
      const { data, error } = await supabase
        .from('palio_edition_heats')
        .select('contrada_id, game, no_players')
        .eq('edition_id', selectedEditionId)
        .eq('game', game)
        .eq('no_players', true);
      if (error) {
        console.error('Error fetching palio heats:', error);
        setNoPlayerContradaIds(new Set());
        return;
      }
      setNoPlayerContradaIds(new Set((data ?? []).map((row) => row.contrada_id as string)));
    }
    fetchNoPlayers();
  }, [game, selectedEditionId, supabase]);

  useEffect(() => {
    async function fetchResultsForGame() {
      const empty = contrade.map((c) => emptyResultRow(c.id));
      if (!selectedEditionId) {
        setResults(empty);
        return;
      }

      const { data, error } = await supabase
        .from('palio_edition_results')
        .select('contrada_id, position, points, notes, melocotogno_2_count, melocotogno_5_count, melocotogno_10_count, time_seconds, penalty_count, adjusted_time_seconds, final_bonus_points, is_disqualified')
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
    const expectedGames = getAvailablePalioGamesForMonth(currentMonth).filter((g) => g !== 'finale');
    const expectedCount = contrade.length * expectedGames.length;
    const completedCount = editionResults.filter((result) =>
      expectedGames.includes(result.game) && result.points !== null && !Number.isNaN(Number(result.points))
    ).length;
    return expectedCount > 0 && completedCount >= expectedCount;
  }, [contrade.length, currentMonth, editionResults]);

  function updateField(contradaId: string, field: keyof PalioEditionResultInput, value: string | boolean) {
    setResults((prev) => prev.map((row) => (row.contrada_id === contradaId ? { ...row, [field]: value } : row)));
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

      setStatusMessage(`Risultati ${formatPalioEditionLabel(edition)} salvati. Il ricalcolo dei punteggi Fanta si fa dal pannello Admin del Fanta.`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-stone-400">Caricamento...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-medieval text-2xl font-bold text-stone-100">Inserimento risultati ufficiali</h1>
      <p className="mt-1 text-sm text-stone-400">
        Scrive su <code>palio_edition_results</code>, la stessa tabella del pannello Admin del Fanta. Il ricalcolo dei
        punteggi Fanta resta riservato a quel pannello.
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
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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

          return (
            <div
              key={row.contrada_id}
              className={`rounded-lg border bg-stone-900 p-4 ${
                isRowInvalid ? 'border-red-700' : rowStatus === 'complete' || rowStatus === 'notApplicable' ? 'border-emerald-800' : 'border-stone-700'
              }`}
            >
              <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_140px]">
                <div>
                  <div className="font-semibold text-stone-100">{contrada?.name ?? 'Contrada'}</div>
                  {isNoPlayer && (
                    <div className="mt-1 inline-flex rounded-full bg-red-950/40 px-2 py-0.5 text-xs font-semibold text-red-300">
                      Senza giocatori · N.A.
                    </div>
                  )}
                </div>

                <div className={`grid gap-2 ${isMelocotogno ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                  {isMelocotogno ? (
                    <>
                      <label className="text-xs font-semibold text-stone-400">
                        Fettucce da 2
                        <input
                          type="number" min={0} step={1} disabled={isNoPlayer}
                          value={row.melocotogno_2_count}
                          onChange={(e) => updateField(row.contrada_id, 'melocotogno_2_count', e.target.value)}
                          className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 disabled:opacity-50"
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-400">
                        Fettucce da 5
                        <input
                          type="number" min={0} step={1} disabled={isNoPlayer}
                          value={row.melocotogno_5_count}
                          onChange={(e) => updateField(row.contrada_id, 'melocotogno_5_count', e.target.value)}
                          className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 disabled:opacity-50"
                        />
                      </label>
                      <label className="text-xs font-semibold text-stone-400">
                        Fettucce da 10
                        <input
                          type="number" min={0} step={1} disabled={isNoPlayer}
                          value={row.melocotogno_10_count}
                          onChange={(e) => updateField(row.contrada_id, 'melocotogno_10_count', e.target.value)}
                          className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100 disabled:opacity-50"
                        />
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
                  <label className={`text-xs font-semibold text-stone-400 ${isMelocotogno ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                    Note
                    <input
                      value={row.notes}
                      onChange={(e) => updateField(row.contrada_id, 'notes', e.target.value)}
                      className="mt-1 w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm text-stone-100"
                    />
                  </label>
                </div>

                <div className="rounded-md border border-stone-700 bg-stone-800/60 p-3 text-center">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Calcolo</div>
                  <div className="mt-1 text-lg font-bold text-stone-100">{scoreLabel}</div>
                  <div className="mt-1 text-xs text-stone-400">{row.position ? `${row.position}° posizione` : 'Non calcolata'}</div>
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
  );
}

export function PalioResultsInput() {
  return (
    <PalioAuthGate>
      <PalioResultsInputContent />
    </PalioAuthGate>
  );
}

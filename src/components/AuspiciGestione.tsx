import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, PlusCircle, Save, Trash2, UserPlus, Users } from 'lucide-react';
import { getSupabaseClient } from '../config';
import { PalioAuthGate } from './PalioAuthGate';
import type { Contrada } from '../hooks/usePalioLiveData';
import type {
  AuspiciAdjustment,
  AuspiciCarta,
  AuspiciCartaType,
  AuspiciEdition,
  AuspiciParticipant,
  AuspiciProva,
} from '../hooks/useAuspiciData';
import {
  AUSPICI_GIURAMENTO_PENALTY_KEY,
  type AuspiciResultInput,
  auspiciCartaLabels,
  auspiciProvaFields,
  auspiciProvaLabels,
  auspiciProvaOrder,
  auspiciProvaRawScoreLabels,
  calculateAuspiciRows,
  validateAuspiciRows,
} from '../lib/auspici-results';
import { parsePalioNumber } from '../lib/palio-results';

// Pannello di gestione della Cena degli Auspici: stessa gate di
// autenticazione (can_manage_palio_games()) del pannello Giochi del Palio,
// ma su tabelle auspici_* completamente separate. Non tocca mai palio_* né
// il ricalcolo dei punteggi Fanta.
//
// Il roster partecipanti (auspici_participants) è scoped per edizione e non
// coincide necessariamente con le 12 Contrade ufficiali: l'evento può
// includere squadre extra valide solo per questa serata (es. Corte Ducale,
// Sforzinda, Musici e Alfieri dell'Onda Sforzesca, Aurora Noctis, Il
// Biancofiore, Armati del Duca, Arcieri del Duca). Le 12 ufficiali si
// aggiungono con un pulsante di seeding da public.contrade; le squadre extra
// si aggiungono digitando il nome.

const emptyResultRow = (participantId: string): AuspiciResultInput => ({
  detail: {},
  is_position_overridden: false,
  notes: '',
  participant_id: participantId,
  position: '',
  raw_score: '',
});

const allAuspiciCarteTypes: AuspiciCartaType[] = ['duca', 'duchessa', 'armato', 'fornaio', 'mastro_falconiere'];

export function AuspiciGestioneContent() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [contrade, setContrade] = useState<Contrada[]>([]);
  const [editions, setEditions] = useState<AuspiciEdition[]>([]);
  const [selectedEditionId, setSelectedEditionId] = useState('');
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [participants, setParticipants] = useState<AuspiciParticipant[]>([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [prova, setProva] = useState<AuspiciProva>('mercante');
  const [results, setResults] = useState<AuspiciResultInput[]>([]);
  const [adjustments, setAdjustments] = useState<AuspiciAdjustment[]>([]);
  const [carte, setCarte] = useState<AuspiciCarta[]>([]);
  const [newAdjustment, setNewAdjustment] = useState({ participantId: '', points: '', reason: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingParticipants, setSavingParticipants] = useState(false);
  const [savingCarte, setSavingCarte] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const fetchEditions = useCallback(async () => {
    const { data, error } = await supabase
      .from('auspici_editions')
      .select('id, year, title, is_active')
      .order('year', { ascending: false });
    if (error) {
      console.error('Error fetching auspici editions:', error);
      return;
    }
    setEditions((data as AuspiciEdition[]) ?? []);
  }, [supabase]);

  const fetchParticipants = useCallback(async (editionId: string) => {
    if (!editionId) {
      setParticipants([]);
      return;
    }
    const { data, error } = await supabase
      .from('auspici_participants')
      .select('id, name, contrada_id, sort_order')
      .eq('edition_id', editionId)
      .order('sort_order')
      .order('name');
    if (error) {
      console.error('Error fetching auspici participants:', error);
      setParticipants([]);
      return;
    }
    setParticipants((data as AuspiciParticipant[]) ?? []);
  }, [supabase]);

  const fetchAdjustments = useCallback(async (editionId: string) => {
    if (!editionId) {
      setAdjustments([]);
      return;
    }
    const { data, error } = await supabase
      .from('auspici_adjustments')
      .select('id, participant_id, points, reason')
      .eq('edition_id', editionId);
    if (error) {
      console.error('Error fetching auspici adjustments:', error);
      setAdjustments([]);
      return;
    }
    setAdjustments((data as AuspiciAdjustment[]) ?? []);
  }, [supabase]);

  const fetchCarte = useCallback(async (editionId: string) => {
    if (!editionId) {
      setCarte([]);
      return;
    }
    const { data, error } = await supabase
      .from('auspici_carte')
      .select('participant_id, carta, used')
      .eq('edition_id', editionId);
    if (error) {
      console.error('Error fetching auspici carte:', error);
      setCarte([]);
      return;
    }
    setCarte((data as AuspiciCarta[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      const { data: contradeData, error: contradeError } = await supabase.from('contrade').select('id, name').order('name');
      if (contradeError) console.error('Error fetching contrade:', contradeError);
      setContrade((contradeData as Contrada[]) ?? []);
      await fetchEditions();
      setLoading(false);
    }
    loadInitialData();
  }, [fetchEditions, supabase]);

  useEffect(() => {
    fetchParticipants(selectedEditionId);
    fetchAdjustments(selectedEditionId);
    fetchCarte(selectedEditionId);
  }, [fetchAdjustments, fetchCarte, fetchParticipants, selectedEditionId]);

  const selectedEdition = useMemo(
    () => editions.find((edition) => edition.id === selectedEditionId) ?? null,
    [editions, selectedEditionId]
  );

  const missingOfficialContrade = useMemo(() => {
    const participantNames = new Set(participants.map((p) => p.name));
    return contrade.filter((c) => !participantNames.has(c.name));
  }, [contrade, participants]);

  useEffect(() => {
    async function fetchResultsForProva() {
      const empty = participants.map((p) => emptyResultRow(p.id));
      if (!selectedEditionId || participants.length === 0) {
        setResults(empty);
        return;
      }

      const { data, error } = await supabase
        .from('auspici_results')
        .select('participant_id, raw_score, position, is_position_overridden, notes, detail')
        .eq('edition_id', selectedEditionId)
        .eq('prova', prova);

      if (error) {
        console.error('Error fetching auspici results:', error);
        setResults(empty);
        return;
      }

      const existingByParticipant = new Map((data ?? []).map((row) => [row.participant_id as string, row]));
      setResults(empty.map((row) => {
        const existing = existingByParticipant.get(row.participant_id);
        if (!existing) return row;
        const existingDetail = (existing.detail ?? {}) as Record<string, unknown>;
        const detail: Record<string, string> = {};
        Object.entries(existingDetail).forEach(([key, value]) => {
          detail[key] = typeof value === 'boolean'
            ? (value ? 'true' : '')
            : value === null || value === undefined ? '' : String(value);
        });
        return {
          detail,
          is_position_overridden: Boolean(existing.is_position_overridden),
          notes: existing.notes ?? '',
          participant_id: row.participant_id,
          position: existing.position === null ? '' : String(existing.position),
          raw_score: existing.raw_score === null ? '' : String(existing.raw_score),
        };
      }));
    }
    fetchResultsForProva();
  }, [participants, prova, selectedEditionId, supabase]);

  const provaFields = auspiciProvaFields[prova];
  const calculatedRows = useMemo(() => calculateAuspiciRows(results, prova), [prova, results]);
  const displayRows = useMemo(
    () => [...calculatedRows].sort((a, b) => {
      const nameA = participants.find((p) => p.id === a.participant_id)?.name ?? '';
      const nameB = participants.find((p) => p.id === b.participant_id)?.name ?? '';
      return nameA.localeCompare(nameB, 'it');
    }),
    [calculatedRows, participants]
  );
  const validation = useMemo(() => validateAuspiciRows(displayRows), [displayRows]);

  function updateField(participantId: string, field: keyof AuspiciResultInput, value: string | boolean) {
    setResults((prev) => prev.map((row) => (row.participant_id === participantId ? { ...row, [field]: value } : row)));
  }

  function updateDetailField(participantId: string, fieldKey: string, value: string) {
    setResults((prev) => prev.map((row) => (
      row.participant_id === participantId
        ? { ...row, detail: { ...row.detail, [fieldKey]: value } }
        : row
    )));
  }

  async function handleCreateEdition(e: FormEvent) {
    e.preventDefault();
    const year = Number.parseInt(newYear, 10);
    if (Number.isNaN(year)) {
      setStatusMessage('Anno non valido');
      return;
    }
    const { data, error } = await supabase
      .from('auspici_editions')
      .upsert({ year }, { onConflict: 'year' })
      .select('id')
      .single();
    if (error) {
      setStatusMessage(`Errore creazione edizione: ${error.message}`);
      return;
    }
    if (data?.id) setSelectedEditionId(data.id);
    await fetchEditions();
    setStatusMessage(`Edizione ${year} creata`);
  }

  async function handleToggleActive() {
    if (!selectedEditionId) {
      setStatusMessage("Seleziona prima un'edizione");
      return;
    }
    setTogglingActive(true);
    try {
      if (selectedEdition?.is_active) {
        const { error } = await supabase.from('auspici_editions').update({ is_active: false }).eq('id', selectedEditionId);
        if (error) {
          setStatusMessage(`Errore disattivazione: ${error.message}`);
          return;
        }
      } else {
        const { error: disableError } = await supabase.from('auspici_editions').update({ is_active: false }).eq('is_active', true);
        if (disableError) {
          setStatusMessage(`Errore aggiornamento pubblicazione: ${disableError.message}`);
          return;
        }
        const { error } = await supabase.from('auspici_editions').update({ is_active: true }).eq('id', selectedEditionId);
        if (error) {
          setStatusMessage(`Errore pubblicazione: ${error.message}`);
          return;
        }
      }
      await fetchEditions();
      setStatusMessage(selectedEdition?.is_active ? 'Classifica pubblica disattivata' : 'Classifica pubblica attivata');
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleSeedOfficialContrade() {
    if (!selectedEditionId || missingOfficialContrade.length === 0) return;
    setSavingParticipants(true);
    try {
      const payload = missingOfficialContrade.map((c, index) => ({
        contrada_id: c.id,
        edition_id: selectedEditionId,
        name: c.name,
        sort_order: participants.length + index,
      }));
      const { error } = await supabase.from('auspici_participants').insert(payload);
      if (error) {
        setStatusMessage(`Errore aggiunta Contrade ufficiali: ${error.message}`);
        return;
      }
      await fetchParticipants(selectedEditionId);
      setStatusMessage('Contrade ufficiali aggiunte al roster');
    } finally {
      setSavingParticipants(false);
    }
  }

  async function handleAddParticipant(e: FormEvent) {
    e.preventDefault();
    if (!selectedEditionId) {
      setStatusMessage("Seleziona prima un'edizione");
      return;
    }
    const name = newParticipantName.trim();
    if (!name) return;

    setSavingParticipants(true);
    try {
      const { error } = await supabase.from('auspici_participants').insert({
        contrada_id: null,
        edition_id: selectedEditionId,
        name,
        sort_order: participants.length,
      });
      if (error) {
        setStatusMessage(`Errore aggiunta partecipante: ${error.message}`);
        return;
      }
      setNewParticipantName('');
      await fetchParticipants(selectedEditionId);
      setStatusMessage(`«${name}» aggiunta al roster`);
    } finally {
      setSavingParticipants(false);
    }
  }

  async function handleRemoveParticipant(participantId: string) {
    setSavingParticipants(true);
    try {
      const { error } = await supabase.from('auspici_participants').delete().eq('id', participantId);
      if (error) {
        setStatusMessage(`Errore rimozione partecipante: ${error.message}`);
        return;
      }
      await fetchParticipants(selectedEditionId);
    } finally {
      setSavingParticipants(false);
    }
  }

  async function handleSaveResults(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!selectedEditionId) {
      setStatusMessage("Seleziona prima un'edizione");
      return;
    }
    if (validation.invalidCount > 0) {
      setStatusMessage('Correggi i valori evidenziati prima di salvare');
      return;
    }

    setSaving(true);
    try {
      const payload = displayRows.map((row) => {
        let detailJson: Record<string, boolean | number> | null = null;
        if (provaFields) {
          detailJson = {};
          provaFields.forEach((field) => {
            const raw = row.detail[field.key] ?? '';
            if (field.kind === 'hit') {
              detailJson![field.key] = raw === 'true';
              return;
            }
            if (raw.trim() === '') return;
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isNaN(parsed)) detailJson![field.key] = parsed;
          });
          if (prova === 'giuramento' && row.detail[AUSPICI_GIURAMENTO_PENALTY_KEY] === 'true') {
            detailJson[AUSPICI_GIURAMENTO_PENALTY_KEY] = true;
          }
        }

        return {
          detail: detailJson,
          edition_id: selectedEditionId,
          is_position_overridden: row.is_position_overridden,
          notes: row.notes || null,
          participant_id: row.participant_id,
          position: row.position ? Number.parseInt(row.position, 10) : null,
          prova,
          raw_score: parsePalioNumber(row.raw_score),
        };
      });

      const { error } = await supabase.from('auspici_results').upsert(payload, { onConflict: 'edition_id,prova,participant_id' });
      if (error) {
        setStatusMessage(`Errore salvataggio risultati: ${error.message}`);
        return;
      }
      setStatusMessage(`Risultati ${auspiciProvaLabels[prova]} salvati`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAdjustment(e: FormEvent) {
    e.preventDefault();
    if (savingAdjustment) return;
    if (!selectedEditionId) {
      setStatusMessage("Seleziona prima un'edizione");
      return;
    }
    if (!newAdjustment.participantId || !newAdjustment.reason.trim()) {
      setStatusMessage('Seleziona un partecipante e indica un motivo');
      return;
    }
    const points = Number.parseInt(newAdjustment.points, 10);
    if (Number.isNaN(points)) {
      setStatusMessage('Punti non validi');
      return;
    }

    setSavingAdjustment(true);
    try {
      const { error } = await supabase.from('auspici_adjustments').insert({
        edition_id: selectedEditionId,
        participant_id: newAdjustment.participantId,
        points,
        reason: newAdjustment.reason.trim(),
      });
      if (error) {
        setStatusMessage(`Errore salvataggio bonus/penalità: ${error.message}`);
        return;
      }
      setNewAdjustment({ participantId: '', points: '', reason: '' });
      await fetchAdjustments(selectedEditionId);
      setStatusMessage('Bonus/penalità registrata');
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function handleDeleteAdjustment(id: string) {
    const { error } = await supabase.from('auspici_adjustments').delete().eq('id', id);
    if (error) {
      setStatusMessage(`Errore rimozione: ${error.message}`);
      return;
    }
    await fetchAdjustments(selectedEditionId);
  }

  async function handleAssignCarta(participantId: string, carta: AuspiciCartaType | '') {
    if (!selectedEditionId) {
      setStatusMessage("Seleziona prima un'edizione");
      return;
    }
    setSavingCarte(true);
    try {
      if (!carta) {
        const { error } = await supabase.from('auspici_carte').delete().eq('edition_id', selectedEditionId).eq('participant_id', participantId);
        if (error) {
          setStatusMessage(`Errore rimozione carta: ${error.message}`);
          return;
        }
      } else {
        const { error } = await supabase
          .from('auspici_carte')
          .upsert({ carta, edition_id: selectedEditionId, participant_id: participantId, used: false }, { onConflict: 'edition_id,participant_id' });
        if (error) {
          setStatusMessage(`Errore assegnazione carta: ${error.message}`);
          return;
        }
      }
      await fetchCarte(selectedEditionId);
    } finally {
      setSavingCarte(false);
    }
  }

  async function handleToggleCartaUsed(participantId: string, used: boolean) {
    if (!selectedEditionId) return;
    setSavingCarte(true);
    try {
      const { error } = await supabase
        .from('auspici_carte')
        .update({ used })
        .eq('edition_id', selectedEditionId)
        .eq('participant_id', participantId);
      if (error) {
        setStatusMessage(`Errore aggiornamento carta: ${error.message}`);
        return;
      }
      await fetchCarte(selectedEditionId);
    } finally {
      setSavingCarte(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-stone-400">Caricamento...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-medieval text-2xl font-bold text-stone-100">Gestione Cena degli Auspici</h1>
      <p className="mt-1 text-sm text-stone-400">
        Scrive su <code>auspici_editions</code>, <code>auspici_participants</code>, <code>auspici_results</code>,{' '}
        <code>auspici_adjustments</code> e <code>auspici_carte</code> — tabelle separate dai Giochi del Palio. Nessun
        effetto sui Punti Palio o sul Fanta.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-stone-800 bg-stone-900 p-4">
        <label className="text-sm font-semibold text-stone-300">
          Edizione
          <select
            className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
            onChange={(e) => setSelectedEditionId(e.target.value)}
            value={selectedEditionId}
          >
            <option value="">Seleziona edizione</option>
            {editions.map((edition) => (
              <option key={edition.id} value={edition.id}>{edition.title} {edition.year}{edition.is_active ? ' (pubblicata)' : ''}</option>
            ))}
          </select>
        </label>

        <form className="flex items-end gap-2" onSubmit={handleCreateEdition}>
          <label className="text-sm font-semibold text-stone-300">
            Nuovo anno
            <input
              className="ml-2 w-24 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
              onChange={(e) => setNewYear(e.target.value)}
              type="number"
              value={newYear}
            />
          </label>
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-palio-500/50 px-3 py-1.5 text-sm font-semibold text-palio-300 hover:border-palio-400"
            type="submit"
          >
            <PlusCircle className="h-4 w-4" />
            Crea
          </button>
        </form>

        <button
          className={`ml-auto inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
            selectedEdition?.is_active ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
          disabled={!selectedEditionId || togglingActive}
          onClick={handleToggleActive}
          type="button"
        >
          {selectedEdition?.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {selectedEdition?.is_active ? 'Nascondi classifica pubblica' : 'Pubblica classifica'}
        </button>

        {statusMessage && <p className="w-full text-sm font-semibold text-amber-300">{statusMessage}</p>}
      </div>

      {selectedEditionId && (
        <>
          <section className="mt-6 rounded-lg border border-stone-800 bg-stone-900 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-300">
              <Users className="h-4 w-4" />
              Squadre partecipanti ({participants.length})
            </h2>
            <p className="mt-1 text-xs text-stone-400">
              Oltre alle 12 Contrade ufficiali, questa edizione può includere squadre extra valide solo per questo
              evento (es. Corte Ducale, Sforzinda, Musici e Alfieri dell&rsquo;Onda Sforzesca, Aurora Noctis, Il
              Biancofiore, Armati del Duca, Arcieri del Duca).
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {missingOfficialContrade.length > 0 && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-palio-500/50 px-3 py-1.5 text-sm font-semibold text-palio-300 hover:border-palio-400 disabled:opacity-50"
                  disabled={savingParticipants}
                  onClick={handleSeedOfficialContrade}
                  type="button"
                >
                  <Users className="h-4 w-4" />
                  Aggiungi le {missingOfficialContrade.length} Contrade ufficiali mancanti
                </button>
              )}
            </div>

            <form className="mt-3 flex items-end gap-2" onSubmit={handleAddParticipant}>
              <label className="min-w-[220px] flex-1 text-sm font-semibold text-stone-300">
                Nome squadra extra
                <input
                  className="ml-2 w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  placeholder="Es. Corte Ducale"
                  value={newParticipantName}
                />
              </label>
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-palio-500/50 px-3 py-1.5 text-sm font-semibold text-palio-300 hover:border-palio-400 disabled:opacity-50"
                disabled={savingParticipants || !newParticipantName.trim()}
                type="submit"
              >
                <UserPlus className="h-4 w-4" />
                Aggiungi
              </button>
            </form>

            <ul className="mt-3 flex flex-wrap gap-2">
              {participants.map((participant) => (
                <li
                  className="flex items-center gap-2 rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-sm text-stone-200"
                  key={participant.id}
                >
                  {participant.name}
                  {!participant.contrada_id && <span className="text-[10px] uppercase text-amber-400">extra</span>}
                  <button onClick={() => handleRemoveParticipant(participant.id)} type="button">
                    <Trash2 className="h-3.5 w-3.5 text-stone-500 hover:text-red-400" />
                  </button>
                </li>
              ))}
              {participants.length === 0 && <li className="text-sm text-stone-500">Nessuna squadra ancora aggiunta</li>}
            </ul>
          </section>

          <section className="mt-6 rounded-lg border border-stone-800 bg-stone-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-semibold text-stone-300">
                Prova
                <select
                  className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  onChange={(e) => setProva(e.target.value as AuspiciProva)}
                  value={prova}
                >
                  {auspiciProvaOrder.map((p) => (
                    <option key={p} value={p}>{auspiciProvaLabels[p]}</option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-stone-400">{auspiciProvaRawScoreLabels[prova]}</p>
            </div>

            {participants.length === 0 ? (
              <p className="mt-4 text-sm text-stone-500">Aggiungi prima le squadre partecipanti qui sopra.</p>
            ) : (
              <form className="mt-4 space-y-2" onSubmit={handleSaveResults}>
                <div className="overflow-x-auto">
                  <table className={`w-full text-sm ${provaFields ? 'min-w-[960px]' : 'min-w-[640px]'}`}>
                    <thead>
                      <tr className="border-b border-stone-800 text-left text-xs uppercase tracking-wide text-stone-400">
                        <th className="py-2 pr-3">Squadra</th>
                        {provaFields ? (
                          <>
                            {provaFields.map((field) => (
                              <th className="py-2 pr-3" key={field.key}>{field.label}</th>
                            ))}
                            {prova === 'giuramento' && <th className="py-2 pr-3">Penalità tempo (-3)</th>}
                            <th className="py-2 pr-3">Totale</th>
                          </>
                        ) : (
                          <th className="py-2 pr-3">Valore grezzo</th>
                        )}
                        <th className="py-2 pr-3">Posizione</th>
                        <th className="py-2 pr-3">Punti</th>
                        <th className="py-2 pr-3">Override manuale</th>
                        <th className="py-2 pr-3">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => {
                        const status = validation.statusByParticipantId.get(row.participant_id);
                        const name = participants.find((p) => p.id === row.participant_id)?.name ?? '';
                        return (
                          <tr className="border-b border-stone-800/60" key={row.participant_id}>
                            <td className="py-1.5 pr-3 font-semibold text-stone-200">{name}</td>
                            {provaFields ? (
                              <>
                                {provaFields.map((field) => (
                                  <td className="py-1.5 pr-3" key={field.key}>
                                    {field.kind === 'hit' ? (
                                      <input
                                        checked={row.detail[field.key] === 'true'}
                                        disabled={row.is_position_overridden}
                                        onChange={(e) => updateDetailField(row.participant_id, field.key, e.target.checked ? 'true' : '')}
                                        type="checkbox"
                                      />
                                    ) : (
                                      <input
                                        className="w-16 rounded border border-stone-700 bg-stone-800 px-2 py-1 text-stone-100"
                                        disabled={row.is_position_overridden}
                                        max={field.max}
                                        min={field.kind === 'score' ? 0 : 1}
                                        onChange={(e) => updateDetailField(row.participant_id, field.key, e.target.value)}
                                        type="number"
                                        value={row.detail[field.key] ?? ''}
                                      />
                                    )}
                                  </td>
                                ))}
                                {prova === 'giuramento' && (
                                  <td className="py-1.5 pr-3">
                                    <input
                                      checked={row.detail[AUSPICI_GIURAMENTO_PENALTY_KEY] === 'true'}
                                      disabled={row.is_position_overridden}
                                      onChange={(e) => updateDetailField(row.participant_id, AUSPICI_GIURAMENTO_PENALTY_KEY, e.target.checked ? 'true' : '')}
                                      type="checkbox"
                                    />
                                  </td>
                                )}
                                <td className="py-1.5 pr-3 font-semibold text-stone-300">{row.raw_score || '-'}</td>
                              </>
                            ) : (
                              <td className="py-1.5 pr-3">
                                <input
                                  className="w-24 rounded border border-stone-700 bg-stone-800 px-2 py-1 text-stone-100"
                                  disabled={row.is_position_overridden}
                                  onChange={(e) => updateField(row.participant_id, 'raw_score', e.target.value)}
                                  value={row.raw_score}
                                />
                              </td>
                            )}
                            <td className="py-1.5 pr-3">
                              <input
                                className={`w-16 rounded border px-2 py-1 text-stone-100 ${status === 'invalid' ? 'border-red-500 bg-red-950/40' : 'border-stone-700 bg-stone-800'}`}
                                disabled={!row.is_position_overridden}
                                onChange={(e) => updateField(row.participant_id, 'position', e.target.value)}
                                value={row.position}
                              />
                            </td>
                            <td className="py-1.5 pr-3 font-semibold text-palio-300">
                              {row.points ?? '-'}
                            </td>
                            <td className="py-1.5 pr-3">
                              <input
                                checked={row.is_position_overridden}
                                onChange={(e) => updateField(row.participant_id, 'is_position_overridden', e.target.checked)}
                                type="checkbox"
                              />
                            </td>
                            <td className="py-1.5 pr-3">
                              <input
                                className="w-full min-w-[140px] rounded border border-stone-700 bg-stone-800 px-2 py-1 text-stone-100"
                                onChange={(e) => updateField(row.participant_id, 'notes', e.target.value)}
                                value={row.notes}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md bg-palio-500 px-4 py-2 text-sm font-semibold text-white hover:bg-palio-600 disabled:opacity-50"
                    disabled={saving || validation.invalidCount > 0}
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    Salva {auspiciProvaLabels[prova]}
                  </button>
                  <p className="text-xs text-stone-400">
                    {validation.completeCount}/{displayRows.length} complete
                    {validation.invalidCount > 0 && ` · ${validation.invalidCount} da correggere`}
                  </p>
                </div>
              </form>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-stone-800 bg-stone-900 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">
              Bonus e penalità (Carta Fornaio, condotta)
            </h2>
            <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={handleAddAdjustment}>
              <label className="text-sm font-semibold text-stone-300">
                Squadra
                <select
                  className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  onChange={(e) => setNewAdjustment((prev) => ({ ...prev, participantId: e.target.value }))}
                  value={newAdjustment.participantId}
                >
                  <option value="">Seleziona</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-stone-300">
                Punti (+/-)
                <input
                  className="ml-2 w-20 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  onChange={(e) => setNewAdjustment((prev) => ({ ...prev, points: e.target.value }))}
                  type="number"
                  value={newAdjustment.points}
                />
              </label>
              <label className="min-w-[200px] flex-1 text-sm font-semibold text-stone-300">
                Motivo
                <input
                  className="ml-2 w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
                  onChange={(e) => setNewAdjustment((prev) => ({ ...prev, reason: e.target.value }))}
                  value={newAdjustment.reason}
                />
              </label>
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-palio-500/50 px-3 py-1.5 text-sm font-semibold text-palio-300 hover:border-palio-400 disabled:opacity-50"
                disabled={savingAdjustment}
                type="submit"
              >
                <PlusCircle className="h-4 w-4" />
                Aggiungi
              </button>
            </form>

            <ul className="mt-3 space-y-1.5">
              {adjustments.map((adjustment) => (
                <li className="flex items-center justify-between gap-2 rounded border border-stone-800 px-3 py-1.5 text-sm" key={adjustment.id}>
                  <span>
                    <span className="font-semibold text-stone-200">
                      {participants.find((p) => p.id === adjustment.participant_id)?.name ?? '—'}
                    </span>{' '}
                    <span className={adjustment.points >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {adjustment.points >= 0 ? `+${adjustment.points}` : adjustment.points}
                    </span>{' '}
                    <span className="text-stone-400">— {adjustment.reason}</span>
                  </span>
                  <button onClick={() => handleDeleteAdjustment(adjustment.id)} type="button">
                    <Trash2 className="h-4 w-4 text-stone-500 hover:text-red-400" />
                  </button>
                </li>
              ))}
              {adjustments.length === 0 && <li className="text-sm text-stone-500">Nessun bonus/penalità registrata</li>}
            </ul>
          </section>

          <section className="mt-6 rounded-lg border border-stone-800 bg-stone-900 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">
              Carte Auspicio — Ombre sul Ducato
            </h2>
            <div className="mt-3 space-y-1.5">
              {participants.map((participant) => {
                const assigned = carte.find((c) => c.participant_id === participant.id);
                return (
                  <div className="flex flex-wrap items-center gap-2 rounded border border-stone-800 px-3 py-1.5 text-sm" key={participant.id}>
                    <span className="w-40 shrink-0 font-semibold text-stone-200">{participant.name}</span>
                    <select
                      className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-sm text-stone-100"
                      disabled={savingCarte}
                      onChange={(e) => handleAssignCarta(participant.id, e.target.value as AuspiciCartaType | '')}
                      value={assigned?.carta ?? ''}
                    >
                      <option value="">Nessuna carta</option>
                      {allAuspiciCarteTypes.map((carta) => (
                        <option key={carta} value={carta}>{auspiciCartaLabels[carta]}</option>
                      ))}
                    </select>
                    {assigned && (
                      <label className="flex items-center gap-1.5 text-stone-400">
                        <input
                          checked={assigned.used}
                          disabled={savingCarte}
                          onChange={(e) => handleToggleCartaUsed(participant.id, e.target.checked)}
                          type="checkbox"
                        />
                        Usata
                      </label>
                    )}
                  </div>
                );
              })}
              {participants.length === 0 && <p className="text-sm text-stone-500">Nessuna squadra ancora aggiunta</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function AuspiciGestione() {
  return (
    <PalioAuthGate>
      <AuspiciGestioneContent />
    </PalioAuthGate>
  );
}

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Gavel, Plus, Timer, Trash2, X } from 'lucide-react';
import { getSupabaseClient } from '../config';
import { type PalioEdition, type PalioEditionHeat, type PalioGame, palioGameLabels } from '../hooks/usePalioLiveData';

type JudgeRole = 'cronometrista' | 'giudice';

interface Judge {
  id: string;
  name: string;
}

interface JudgeAssignment {
  game: PalioGame;
  heat_number: number | null;
  id: string;
  is_extra: boolean;
  judge_id: string;
  role: JudgeRole;
}

const judgeRoles: JudgeRole[] = ['cronometrista', 'giudice'];

const roleLabels: Record<JudgeRole, string> = {
  cronometrista: 'Cronometrista',
  giudice: 'Giudice penalità',
};

const extraRoleLabels: Record<JudgeRole, string> = {
  cronometrista: 'Cronometrista extra',
  giudice: 'Giudice extra',
};

interface PalioGiudiciProps {
  availableGames: PalioGame[];
  edition: PalioEdition | null;
  heats: PalioEditionHeat[];
}

interface ExtraAdderProps {
  disabled: boolean;
  judgeOptions: Judge[];
  onAdd: (role: JudgeRole, judgeId: string) => void;
}

// Aggiunta di un extra: la scelta del giudice nella select lo aggiunge subito
// con il ruolo corrispondente, senza un passaggio di conferma.
function ExtraAdder({ disabled, judgeOptions, onAdd }: ExtraAdderProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {judgeRoles.map((role) => (
        <select
          key={role}
          aria-label={`Aggiungi ${extraRoleLabels[role].toLowerCase()}`}
          className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-200 disabled:opacity-50"
          disabled={disabled || judgeOptions.length === 0}
          onChange={(e) => {
            if (e.target.value) onAdd(role, e.target.value);
          }}
          value=""
        >
          <option value="">+ {extraRoleLabels[role]}</option>
          {judgeOptions.map((judge) => (
            <option key={judge.id} value={judge.id}>{judge.name}</option>
          ))}
        </select>
      ))}
    </div>
  );
}

/**
 * Tab "Giudici" della Gestione: anagrafica dei giudici e abbinamento, per ogni
 * batteria di ogni gioco, di un cronometrista e di un giudice delle penalità
 * (titolari), più eventuali extra validi per una batteria o per l'intero gioco.
 */
export function PalioGiudici({ availableGames, edition, heats }: PalioGiudiciProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [assignments, setAssignments] = useState<JudgeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newJudgeName, setNewJudgeName] = useState('');
  const [selectedGame, setSelectedGame] = useState<PalioGame>(availableGames[0]);
  const [message, setMessage] = useState('');

  const editionId = edition?.id ?? '';
  const game = availableGames.includes(selectedGame) ? selectedGame : availableGames[0];

  const fetchJudges = useCallback(async () => {
    const { data, error } = await supabase.from('palio_judges').select('id, name').order('name');
    if (error) {
      setMessage(`Errore caricamento giudici: ${error.message}`);
      return;
    }
    setJudges((data as Judge[]) ?? []);
  }, [supabase]);

  const fetchAssignments = useCallback(async () => {
    if (!editionId) {
      setAssignments([]);
      return;
    }
    const { data, error } = await supabase
      .from('palio_judge_assignments')
      .select('id, game, heat_number, judge_id, role, is_extra')
      .eq('edition_id', editionId);
    if (error) {
      setMessage(`Errore caricamento abbinamenti: ${error.message}`);
      return;
    }
    setAssignments((data as JudgeAssignment[]) ?? []);
  }, [editionId, supabase]);

  useEffect(() => {
    fetchJudges().finally(() => setLoading(false));
  }, [fetchJudges]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const judgeNames = useMemo(() => new Map(judges.map((judge) => [judge.id, judge.name])), [judges]);

  // Prove senza batterie (melocotogno, finale): un'unica "batteria" 1.
  const heatNumbers = useMemo(() => {
    if (game === 'melocotogno' || game === 'finale') return [1];
    return Array.from(new Set(heats.filter((heat) => heat.game === game).map((heat) => heat.heat_number)))
      .sort((a, b) => a - b);
  }, [game, heats]);

  const gameAssignments = useMemo(() => assignments.filter((a) => a.game === game), [assignments, game]);
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    assignments.forEach((a) => counts.set(a.judge_id, (counts.get(a.judge_id) ?? 0) + 1));
    return counts;
  }, [assignments]);

  // Un giudice non può stare due volte nello stesso ambito (batteria o intero
  // gioco), in qualunque ruolo: le opzioni escludono chi c'è già.
  function getJudgeOptions(heatNumber: number | null, keepJudgeId?: string): Judge[] {
    const taken = new Set(
      gameAssignments
        .filter((a) => a.heat_number === heatNumber && a.judge_id !== keepJudgeId)
        .map((a) => a.judge_id)
    );
    return judges.filter((judge) => !taken.has(judge.id));
  }

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>, errorLabel: string) {
    setBusy(true);
    setMessage('');
    const { error } = await action();
    if (error) setMessage(`${errorLabel}: ${error.message}`);
    setBusy(false);
    return !error;
  }

  async function handleAddJudge(e: FormEvent) {
    e.preventDefault();
    const name = newJudgeName.trim();
    if (!name) return;
    if (await run(() => supabase.from('palio_judges').insert({ name }), 'Errore inserimento giudice')) {
      setNewJudgeName('');
      await fetchJudges();
    }
  }

  async function handleDeleteJudge(judge: Judge) {
    const count = assignmentCounts.get(judge.id) ?? 0;
    const warning = count > 0
      ? `Eliminare ${judge.name}? Verrà tolto anche dai ${count} incarichi di questa edizione (e delle altre).`
      : `Eliminare ${judge.name}?`;
    if (!window.confirm(warning)) return;
    if (await run(() => supabase.from('palio_judges').delete().eq('id', judge.id), 'Errore eliminazione giudice')) {
      await Promise.all([fetchJudges(), fetchAssignments()]);
    }
  }

  async function handleSetTitolare(heatNumber: number, role: JudgeRole, judgeId: string) {
    if (!editionId) return;
    const current = gameAssignments.find((a) => !a.is_extra && a.heat_number === heatNumber && a.role === role);
    const ok = await run(() => {
      if (!judgeId && current) return supabase.from('palio_judge_assignments').delete().eq('id', current.id);
      if (!judgeId) return Promise.resolve({ error: null });
      if (current) return supabase.from('palio_judge_assignments').update({ judge_id: judgeId }).eq('id', current.id);
      return supabase.from('palio_judge_assignments').insert({
        edition_id: editionId, game, heat_number: heatNumber, is_extra: false, judge_id: judgeId, role,
      });
    }, 'Errore salvataggio abbinamento');
    if (ok) await fetchAssignments();
  }

  async function handleAddExtra(heatNumber: number | null, role: JudgeRole, judgeId: string) {
    if (!editionId) return;
    const ok = await run(() => supabase.from('palio_judge_assignments').insert({
      edition_id: editionId, game, heat_number: heatNumber, is_extra: true, judge_id: judgeId, role,
    }), 'Errore aggiunta extra');
    if (ok) await fetchAssignments();
  }

  async function handleRemoveAssignment(id: string) {
    if (await run(() => supabase.from('palio_judge_assignments').delete().eq('id', id), 'Errore rimozione')) {
      await fetchAssignments();
    }
  }

  function renderExtras(heatNumber: number | null) {
    const extras = gameAssignments.filter((a) => a.is_extra && a.heat_number === heatNumber);
    return (
      <div className="space-y-2">
        {extras.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {extras.map((extra) => (
              <li
                key={extra.id}
                className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-950 py-1 pl-3 pr-1 text-xs text-stone-200"
              >
                <span className="text-stone-500">{extraRoleLabels[extra.role]}:</span>
                {judgeNames.get(extra.judge_id) ?? 'Giudice'}
                <button
                  aria-label={`Rimuovi ${judgeNames.get(extra.judge_id) ?? 'giudice'} come ${extraRoleLabels[extra.role].toLowerCase()}`}
                  className="rounded-full p-1 text-stone-400 hover:bg-stone-800 hover:text-red-400 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => handleRemoveAssignment(extra.id)}
                  type="button"
                >
                  <X aria-hidden="true" className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ExtraAdder
          disabled={busy || !editionId}
          judgeOptions={getJudgeOptions(heatNumber)}
          onAdd={(role, judgeId) => handleAddExtra(heatNumber, role, judgeId)}
        />
      </div>
    );
  }

  if (loading) {
    return <div className="py-8 text-center text-stone-400">Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-stone-800 bg-stone-900 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">Elenco giudici</h2>
        <p className="mt-1 text-xs text-stone-500">
          L&apos;elenco è valido per tutte le edizioni. Puoi inserirne più del necessario: quelli non abbinati restano a disposizione.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={handleAddJudge}>
          <label className="text-sm font-semibold text-stone-300">
            Nome e cognome
            <input
              className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
              onChange={(e) => setNewJudgeName(e.target.value)}
              placeholder="Es. Mario Rossi"
              type="text"
              value={newJudgeName}
            />
          </label>
          <button
            className="inline-flex items-center gap-1.5 rounded-md bg-palio-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-palio-600 disabled:opacity-50"
            disabled={busy || !newJudgeName.trim()}
            type="submit"
          >
            <Plus className="h-4 w-4" />
            Aggiungi giudice
          </button>
        </form>
        {message && <p className="mt-3 text-sm font-semibold text-amber-300">{message}</p>}
        {judges.length === 0 ? (
          <p className="mt-4 text-sm text-stone-400">Nessun giudice inserito.</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {judges.map((judge) => (
              <li
                key={judge.id}
                className="flex items-center justify-between gap-2 rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-200"
              >
                <span className="min-w-0 truncate">
                  {judge.name}
                  {editionId && (
                    <span className="ml-2 text-xs text-stone-500">{assignmentCounts.get(judge.id) ?? 0} incarichi</span>
                  )}
                </span>
                <button
                  aria-label={`Elimina ${judge.name}`}
                  className="shrink-0 rounded p-1 text-stone-400 hover:bg-stone-800 hover:text-red-400 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => handleDeleteJudge(judge)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-stone-800 bg-stone-900 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">Abbinamenti per batteria</h2>
        {!edition ? (
          <p className="mt-2 text-sm text-stone-400">
            Seleziona (o crea) un&apos;edizione in alto per abbinare i giudici alle batterie.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist">
              {availableGames.map((g) => (
                <button
                  key={g}
                  aria-selected={g === game}
                  className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                    g === game
                      ? 'border-palio-500 bg-palio-500/10 text-palio-300'
                      : 'border-stone-700 text-stone-300 hover:border-stone-500'
                  }`}
                  onClick={() => setSelectedGame(g)}
                  role="tab"
                  type="button"
                >
                  {palioGameLabels[g]}
                </button>
              ))}
            </div>

            {heatNumbers.length === 0 ? (
              <p className="mt-4 text-sm text-stone-400">
                Nessuna batteria per {palioGameLabels[game]}: estraile prima dalla tab Estrazioni.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {heatNumbers.map((heatNumber) => (
                  <div key={heatNumber} className="space-y-3 rounded-md border border-stone-800 bg-stone-950 p-3">
                    <h3 className="text-sm font-semibold text-stone-100">
                      {game === 'melocotogno' || game === 'finale' ? `${palioGameLabels[game]} (prova unica)` : `Batteria ${heatNumber}`}
                    </h3>
                    {judgeRoles.map((role) => {
                      const current = gameAssignments.find((a) => !a.is_extra && a.heat_number === heatNumber && a.role === role);
                      return (
                        <label key={role} className="flex flex-col gap-1 text-xs font-semibold text-stone-400">
                          <span className="flex items-center gap-1.5">
                            {role === 'cronometrista' ? <Timer aria-hidden="true" className="h-3.5 w-3.5" /> : <Gavel aria-hidden="true" className="h-3.5 w-3.5" />}
                            {roleLabels[role]}
                          </span>
                          <select
                            className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm font-normal text-stone-100 disabled:opacity-50"
                            disabled={busy}
                            onChange={(e) => handleSetTitolare(heatNumber, role, e.target.value)}
                            value={current?.judge_id ?? ''}
                          >
                            <option value="">Non assegnato</option>
                            {getJudgeOptions(heatNumber, current?.judge_id).map((judge) => (
                              <option key={judge.id} value={judge.id}>{judge.name}</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                    <div>
                      <p className="mb-1 text-xs font-semibold text-stone-400">Extra per questa batteria</p>
                      {renderExtras(heatNumber)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-md border border-stone-800 bg-stone-950 p-3">
              <h3 className="text-sm font-semibold text-stone-100">Extra per tutto il gioco: {palioGameLabels[game]}</h3>
              <p className="mb-2 text-xs text-stone-500">Disponibili per ogni batteria di questo gioco.</p>
              {renderExtras(null)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

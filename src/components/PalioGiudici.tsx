import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Gavel, Plus, Timer, Trash2, Wand2, X } from 'lucide-react';
import { getSupabaseClient } from '../config';
import { type Contrada, type PalioEdition, type PalioEditionHeat, type PalioGame, palioGameLabels } from '../hooks/usePalioLiveData';

type JudgeRole = 'cronometrista' | 'giudice' | 'giudice_campo' | 'giudice_gonna' | 'giudice_fantapalio';

type FixedRole = 'fantapalio' | 'banco';

interface FixedAssignment {
  id: string;
  judge_id: string;
  role: FixedRole;
}

const fixedRoles: FixedRole[] = ['fantapalio', 'banco'];

const fixedRoleLabels: Record<FixedRole, string> = {
  fantapalio: 'Giudice FantaPalio',
  banco: 'Giudice del banco',
};

type JudgePreference = 'cronometrista' | 'giudice';

interface Judge {
  contrada_ids: string[];
  id: string;
  name: string;
  preferred_role: JudgePreference | null;
}

interface JudgeAssignment {
  game: PalioGame;
  heat_number: number | null;
  id: string;
  is_extra: boolean;
  judge_id: string;
  lane: number | null;
  role: JudgeRole;
}

const preferenceLabels: Record<JudgePreference, string> = {
  cronometrista: 'Preferisce fare il cronometrista',
  giudice: 'Preferisce fare il giudice',
};

// Prove senza batterie (melocotogno, finale): un'unica "batteria" 1.
function getHeatNumbers(heats: PalioEditionHeat[], game: PalioGame): number[] {
  if (game === 'melocotogno' || game === 'finale') return [1];
  return Array.from(new Set(heats.filter((heat) => heat.game === game).map((heat) => heat.heat_number)))
    .sort((a, b) => a - b);
}

// Corsie di una batteria (display_order delle estrazioni). La finale ha 3
// corsie fisse, il melocotogno un'unica corsia.
function getLaneNumbers(heats: PalioEditionHeat[], game: PalioGame, heatNumber: number): number[] {
  if (game === 'melocotogno') return [1];
  if (game === 'finale') return [1, 2, 3];
  return Array.from(new Set(
    heats.filter((heat) => heat.game === game && heat.heat_number === heatNumber).map((heat) => heat.display_order)
  )).sort((a, b) => a - b);
}

const baseJudgeRoles: JudgeRole[] = ['cronometrista', 'giudice'];

// Giudice di campo e giudice della gonna esistono solo nel cerchio.
const getJudgeRoles = (game: PalioGame): JudgeRole[] =>
  game === 'cerchio' ? [...baseJudgeRoles, 'giudice_campo', 'giudice_gonna'] : baseJudgeRoles;

const roleLabels: Record<JudgeRole, string> = {
  cronometrista: 'Cronometrista',
  giudice: 'Giudice penalità',
  giudice_campo: 'Giudice di campo',
  giudice_gonna: 'Giudice della gonna',
  giudice_fantapalio: 'Giudice FantaPalio',
};

const extraRoleLabels: Record<JudgeRole, string> = {
  cronometrista: 'Cronometrista extra',
  giudice: 'Giudice extra',
  giudice_campo: 'Giudice di campo extra',
  giudice_gonna: 'Giudice della gonna extra',
  giudice_fantapalio: 'Giudice FantaPalio extra',
};

interface PalioGiudiciProps {
  availableGames: PalioGame[];
  contrade: Contrada[];
  edition: PalioEdition | null;
  heats: PalioEditionHeat[];
}

interface ContradaPickerProps {
  contrade: Contrada[];
  disabled: boolean;
  label: string;
  onToggle: (contradaId: string, checked: boolean) => void;
  selectedIds: string[];
}

// Selezione multipla compatta delle Contrade abbinate a un giudice.
function ContradaPicker({ contrade, disabled, label, onToggle, selectedIds }: ContradaPickerProps) {
  const names = contrade.filter((c) => selectedIds.includes(c.id)).map((c) => c.name);
  return (
    <details className="rounded-md border border-stone-700 bg-stone-800 text-xs text-stone-200">
      <summary aria-label={label} className="cursor-pointer px-2 py-1">
        {names.length > 0 ? names.join(', ') : 'Nessuna Contrada'}
      </summary>
      <div className="grid gap-1 border-t border-stone-700 p-2">
        {contrade.map((contrada) => (
          <label key={contrada.id} className="flex items-center gap-2">
            <input
              checked={selectedIds.includes(contrada.id)}
              disabled={disabled}
              onChange={(e) => onToggle(contrada.id, e.target.checked)}
              type="checkbox"
            />
            {contrada.name}
          </label>
        ))}
      </div>
    </details>
  );
}

interface ExtraAdderProps {
  disabled: boolean;
  roles: JudgeRole[];
  judgeOptions: Judge[];
  onAdd: (role: JudgeRole, judgeId: string) => void;
}

// Aggiunta di un extra: la scelta del giudice nella select lo aggiunge subito
// con il ruolo corrispondente, senza un passaggio di conferma.
function ExtraAdder({ disabled, judgeOptions, onAdd, roles }: ExtraAdderProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((role) => (
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
 * Un giudice abbinato a una Contrada non può mai avere incarichi nelle batterie
 * in cui gareggia una di quelle Contrade.
 */
export function PalioGiudici({ availableGames, contrade, edition, heats }: PalioGiudiciProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [judges, setJudges] = useState<Judge[]>([]);
  const [assignments, setAssignments] = useState<JudgeAssignment[]>([]);
  const [fixedAssignments, setFixedAssignments] = useState<FixedAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newJudgeName, setNewJudgeName] = useState('');
  const [newJudgeContradaIds, setNewJudgeContradaIds] = useState<string[]>([]);
  const [newJudgePreference, setNewJudgePreference] = useState('');
  const [selectedGame, setSelectedGame] = useState<PalioGame>(availableGames[0]);
  const [message, setMessage] = useState('');

  const editionId = edition?.id ?? '';
  const game = availableGames.includes(selectedGame) ? selectedGame : availableGames[0];

  const fetchJudges = useCallback(async () => {
    const { data, error } = await supabase
      .from('palio_judges')
      .select('id, name, preferred_role, palio_judge_contrade(contrada_id)')
      .order('name');
    if (error) {
      setMessage(`Errore caricamento giudici: ${error.message}`);
      return;
    }
    setJudges(((data ?? []) as unknown as (Omit<Judge, 'contrada_ids'> & { palio_judge_contrade: { contrada_id: string }[] })[]).map(
      ({ palio_judge_contrade: links, ...judge }) => ({ ...judge, contrada_ids: links.map((link) => link.contrada_id) })
    ));
  }, [supabase]);

  const fetchAssignments = useCallback(async () => {
    if (!editionId) {
      setAssignments([]);
      return;
    }
    const { data, error } = await supabase
      .from('palio_judge_assignments')
      .select('id, game, heat_number, judge_id, role, is_extra, lane')
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

  const fetchFixed = useCallback(async () => {
    if (!editionId) {
      setFixedAssignments([]);
      return;
    }
    const { data, error } = await supabase
      .from('palio_judge_fixed')
      .select('id, judge_id, role')
      .eq('edition_id', editionId);
    if (error) {
      setMessage(`Errore caricamento figure fisse: ${error.message}`);
      return;
    }
    setFixedAssignments((data as FixedAssignment[]) ?? []);
  }, [editionId, supabase]);

  useEffect(() => {
    fetchAssignments();
    fetchFixed();
  }, [fetchAssignments, fetchFixed]);

  const judgeNames = useMemo(() => new Map(judges.map((judge) => [judge.id, judge.name])), [judges]);

  const heatNumbers = useMemo(() => getHeatNumbers(heats, game), [game, heats]);

  const judgeRoles = getJudgeRoles(game);
  const gameAssignments = useMemo(() => assignments.filter((a) => a.game === game), [assignments, game]);
  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    [...assignments, ...fixedAssignments].forEach((a) => counts.set(a.judge_id, (counts.get(a.judge_id) ?? 0) + 1));
    return counts;
  }, [assignments, fixedAssignments]);
  // Le figure fisse sono sempre al loro posto: non hanno incarichi di corsia.
  const fixedJudgeIds = useMemo(() => new Set(fixedAssignments.map((a) => a.judge_id)), [fixedAssignments]);

  // Corsie in cui ogni giudice ha già un incarico titolare nell'edizione.
  const judgeLanes = useMemo(() => {
    const lanes = new Map<string, Set<number>>();
    assignments.forEach((a) => {
      if (a.is_extra || a.lane === null) return;
      lanes.set(a.judge_id, (lanes.get(a.judge_id) ?? new Set<number>()).add(a.lane));
    });
    return lanes;
  }, [assignments]);

  // Contrade che gareggiano in una batteria (o in tutto il gioco se heatNumber
  // è null). Melocotogno e finale non hanno batterie note: le finaliste si
  // conoscono solo a risultati calcolati, quindi per prudenza contano tutte.
  function getParticipantContradaIds(targetGame: PalioGame, heatNumber: number | null): Set<string> {
    if (targetGame === 'melocotogno' || targetGame === 'finale') return new Set(contrade.map((c) => c.id));
    return new Set(
      heats
        .filter((heat) => heat.game === targetGame && (heatNumber === null || heat.heat_number === heatNumber))
        .map((heat) => heat.contrada_id)
    );
  }

  // Un giudice non può stare due volte nello stesso ambito (batteria o intero
  // gioco), in qualunque ruolo, né lavorare dove gareggia la sua Contrada: le
  // opzioni escludono chi è già presente o è in conflitto.
  function getJudgeOptions(heatNumber: number | null, keepJudgeId?: string): Judge[] {
    const participants = getParticipantContradaIds(game, heatNumber);
    const taken = new Set(
      gameAssignments
        .filter((a) => a.heat_number === heatNumber && a.judge_id !== keepJudgeId)
        .map((a) => a.judge_id)
    );
    return judges.filter((judge) => !taken.has(judge.id) && !fixedJudgeIds.has(judge.id) && !judge.contrada_ids.some((id) => participants.has(id)));
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
    const inserted = await supabase
      .from('palio_judges')
      .insert({ name, preferred_role: newJudgePreference || null })
      .select('id')
      .single();
    if (inserted.error) {
      setMessage(`Errore inserimento giudice: ${inserted.error.message}`);
      return;
    }
    const linked = newJudgeContradaIds.length === 0 || await run(
      () => supabase.from('palio_judge_contrade').insert(
        newJudgeContradaIds.map((contradaId) => ({ contrada_id: contradaId, judge_id: inserted.data.id }))
      ),
      'Giudice inserito, ma Contrade non salvate'
    );
    if (linked) {
      setNewJudgeName('');
      setNewJudgeContradaIds([]);
      setNewJudgePreference('');
    }
    await fetchJudges();
  }

  async function handleToggleJudgeContrada(judge: Judge, contradaId: string, checked: boolean) {
    const conflicts = checked
      ? assignments.filter((a) => a.judge_id === judge.id && getParticipantContradaIds(a.game, a.heat_number).has(contradaId))
      : [];
    if (conflicts.length > 0) {
      const contradaName = contrade.find((c) => c.id === contradaId)?.name ?? 'questa Contrada';
      const warning = `${judge.name} ha ${conflicts.length} incarichi in prove dove gareggia ${contradaName}: verranno rimossi. Continuare?`;
      if (!window.confirm(warning)) return;
    }
    const ok = await run(async () => {
      const link = checked
        ? await supabase.from('palio_judge_contrade').insert({ contrada_id: contradaId, judge_id: judge.id })
        : await supabase.from('palio_judge_contrade').delete().eq('judge_id', judge.id).eq('contrada_id', contradaId);
      if (link.error || conflicts.length === 0) return link;
      return supabase.from('palio_judge_assignments').delete().in('id', conflicts.map((a) => a.id));
    }, 'Errore salvataggio Contrada');
    if (ok) await Promise.all([fetchJudges(), fetchAssignments()]);
  }

  async function handleSetJudgePreference(judge: Judge, preference: string) {
    if (await run(
      () => supabase.from('palio_judges').update({ preferred_role: preference || null }).eq('id', judge.id),
      'Errore salvataggio preferenza'
    )) {
      await fetchJudges();
    }
  }

  // Riempie solo i posti titolari ancora vuoti (non tocca gli abbinamenti già
  // fatti), corsia per corsia. Per ogni posto sceglie tra i giudici liberi in
  // quella batteria e senza conflitto di Contrada. Ordine: prima chi è già
  // stato assegnato a quella corsia (un giudice non cambia corsia, se
  // possibile), poi chi non ha ancora una corsia, infine chi dovrebbe
  // cambiarla; poi la preferenza (giusta, indifferente, opposta) e, a parità,
  // chi ha meno incarichi nell'edizione.
  async function handleAutoAssign() {
    if (!editionId) return;
    const load = new Map(assignmentCounts);
    const lockedLane = new Map<string, number>();
    assignments.forEach((a) => {
      if (!a.is_extra && a.lane !== null && !lockedLane.has(a.judge_id)) lockedLane.set(a.judge_id, a.lane);
    });
    const planned: { edition_id: string; game: PalioGame; heat_number: number; is_extra: false; judge_id: string; lane: number; role: JudgeRole }[] = [];
    let unfilled = 0;
    let againstPreference = 0;
    let laneChanges = 0;

    for (const g of availableGames) {
      for (const heatNumber of getHeatNumbers(heats, g)) {
        const taken = new Set(
          assignments.filter((a) => a.game === g && (a.heat_number === heatNumber || a.heat_number === null)).map((a) => a.judge_id)
        );
        const participants = getParticipantContradaIds(g, heatNumber);
        for (const lane of getLaneNumbers(heats, g, heatNumber)) {
          for (const role of getJudgeRoles(g)) {
            if (assignments.some((a) => a.game === g && !a.is_extra && a.heat_number === heatNumber && a.lane === lane && a.role === role)) continue;
            const category: JudgePreference = role === 'cronometrista' ? 'cronometrista' : 'giudice';
            const preferenceRank = (judge: Judge) => (judge.preferred_role === category ? 0 : judge.preferred_role === null ? 1 : 2);
            const laneRank = (judge: Judge) => {
              const locked = lockedLane.get(judge.id);
              return locked === undefined ? 1 : locked === lane ? 0 : 2;
            };
            const [best] = judges
              .filter((judge) => !taken.has(judge.id) && !fixedJudgeIds.has(judge.id) && !judge.contrada_ids.some((id) => participants.has(id)))
              .sort((a, b) =>
                laneRank(a) - laneRank(b)
                || preferenceRank(a) - preferenceRank(b)
                || (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0)
                || a.name.localeCompare(b.name, 'it'));
            if (!best) {
              unfilled += 1;
              continue;
            }
            if (laneRank(best) === 2) laneChanges += 1;
            if (preferenceRank(best) === 2) againstPreference += 1;
            if (!lockedLane.has(best.id)) lockedLane.set(best.id, lane);
            taken.add(best.id);
            load.set(best.id, (load.get(best.id) ?? 0) + 1);
            planned.push({ edition_id: editionId, game: g, heat_number: heatNumber, is_extra: false, judge_id: best.id, lane, role });
          }
        }
      }
    }

    if (planned.length === 0) {
      setMessage(unfilled > 0
        ? `Nessun abbinamento possibile: ${unfilled} posti vuoti senza giudici disponibili.`
        : 'Nessun posto vuoto da riempire.');
      return;
    }
    if (await run(() => supabase.from('palio_judge_assignments').insert(planned), 'Errore abbinamento automatico')) {
      const notes = [
        unfilled > 0 ? `${unfilled} posti rimasti vuoti (giudici insufficienti o in conflitto)` : '',
        laneChanges > 0 ? `${laneChanges} giudici hanno dovuto cambiare corsia` : '',
        againstPreference > 0 ? `${againstPreference} contro la preferenza` : '',
      ].filter(Boolean);
      setMessage(`Abbinati ${planned.length} incarichi${notes.length ? `; ${notes.join('; ')}` : ''}.`);
      await fetchAssignments();
    }
  }

  async function handleDeleteJudge(judge: Judge) {
    const count = assignmentCounts.get(judge.id) ?? 0;
    const warning = count > 0
      ? `Eliminare ${judge.name}? Verrà tolto anche dai ${count} incarichi di questa edizione (e delle altre).`
      : `Eliminare ${judge.name}?`;
    if (!window.confirm(warning)) return;
    if (await run(() => supabase.from('palio_judges').delete().eq('id', judge.id), 'Errore eliminazione giudice')) {
      await Promise.all([fetchJudges(), fetchAssignments(), fetchFixed()]);
    }
  }

  async function handleSetTitolare(heatNumber: number, lane: number, role: JudgeRole, judgeId: string) {
    if (!editionId) return;
    const current = gameAssignments.find((a) => !a.is_extra && a.heat_number === heatNumber && a.lane === lane && a.role === role);
    const ok = await run(() => {
      if (!judgeId && current) return supabase.from('palio_judge_assignments').delete().eq('id', current.id);
      if (!judgeId) return Promise.resolve({ error: null });
      if (current) return supabase.from('palio_judge_assignments').update({ judge_id: judgeId }).eq('id', current.id);
      return supabase.from('palio_judge_assignments').insert({
        edition_id: editionId, game, heat_number: heatNumber, is_extra: false, judge_id: judgeId, lane, role,
      });
    }, 'Errore salvataggio abbinamento');
    if (ok) await fetchAssignments();
  }

  // Vecchi abbinamenti titolari fatti per batteria, senza corsia.
  const legacyAssignments = useMemo(() => assignments.filter((a) => !a.is_extra && a.lane === null), [assignments]);

  async function handleRemoveLegacy() {
    if (!editionId || legacyAssignments.length === 0) return;
    if (!window.confirm(`Rimuovere i ${legacyAssignments.length} abbinamenti titolari senza corsia di questa edizione?`)) return;
    if (await run(
      () => supabase.from('palio_judge_assignments').delete().in('id', legacyAssignments.map((a) => a.id)),
      'Errore rimozione abbinamenti'
    )) {
      await fetchAssignments();
    }
  }

  // Figure fisse: chi è abbinato a una Contrada o ha già incarichi (di corsia
  // o di altra figura fissa) nell'edizione non può ricoprirle.
  function getFixedOptions(): Judge[] {
    const busyJudgeIds = new Set([...assignments, ...fixedAssignments].map((a) => a.judge_id));
    return judges.filter((judge) => judge.contrada_ids.length === 0 && !busyJudgeIds.has(judge.id));
  }

  async function handleAddFixed(role: FixedRole, judgeId: string) {
    if (!editionId) return;
    if (await run(
      () => supabase.from('palio_judge_fixed').insert({ edition_id: editionId, judge_id: judgeId, role }),
      'Errore aggiunta figura fissa'
    )) {
      await fetchFixed();
    }
  }

  async function handleRemoveFixed(id: string) {
    if (await run(() => supabase.from('palio_judge_fixed').delete().eq('id', id), 'Errore rimozione figura fissa')) {
      await fetchFixed();
    }
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
          roles={judgeRoles}
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
          L&apos;elenco è valido per tutte le edizioni. Puoi inserirne più del necessario: quelli non abbinati restano a disposizione. Se abbini un giudice a una o più Contrade, non potrà mai avere incarichi nelle prove in cui gareggia una di quelle Contrade.
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
          <div className="text-sm font-semibold text-stone-300">
            <span className="mb-1 block">Contrade</span>
            <ContradaPicker
              contrade={contrade}
              disabled={busy}
              label="Contrade del nuovo giudice"
              onToggle={(contradaId, checked) =>
                setNewJudgeContradaIds((ids) => checked ? [...ids, contradaId] : ids.filter((id) => id !== contradaId))}
              selectedIds={newJudgeContradaIds}
            />
          </div>
          <label className="text-sm font-semibold text-stone-300">
            Preferenza
            <select
              className="ml-2 rounded-md border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-100"
              onChange={(e) => setNewJudgePreference(e.target.value)}
              value={newJudgePreference}
            >
              <option value="">Indifferente</option>
              {(Object.keys(preferenceLabels) as JudgePreference[]).map((key) => (
                <option key={key} value={key}>{preferenceLabels[key]}</option>
              ))}
            </select>
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
                <div className="min-w-0 space-y-1">
                  <p className="truncate">
                    {judge.name}
                    {editionId && (
                      <span className="ml-2 text-xs text-stone-500">{assignmentCounts.get(judge.id) ?? 0} incarichi</span>
                    )}
                  </p>
                  <ContradaPicker
                    contrade={contrade}
                    disabled={busy}
                    label={`Contrade di ${judge.name}`}
                    onToggle={(contradaId, checked) => handleToggleJudgeContrada(judge, contradaId, checked)}
                    selectedIds={judge.contrada_ids}
                  />
                  <select
                    aria-label={`Preferenza di ${judge.name}`}
                    className="w-full rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-200 disabled:opacity-50"
                    disabled={busy}
                    onChange={(e) => handleSetJudgePreference(judge, e.target.value)}
                    value={judge.preferred_role ?? ''}
                  >
                    <option value="">Indifferente</option>
                    {(Object.keys(preferenceLabels) as JudgePreference[]).map((key) => (
                      <option key={key} value={key}>{preferenceLabels[key]}</option>
                    ))}
                  </select>
                </div>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-300">Figure fisse</h2>
        <p className="mt-1 text-xs text-stone-500">
          Valgono per tutto il Palio, non per batteria o corsia, e possono essere più di una. Non possono esserlo i giudici abbinati a una Contrada.
        </p>
        {!edition ? (
          <p className="mt-2 text-sm text-stone-400">Seleziona (o crea) un&apos;edizione in alto per assegnare le figure fisse.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {fixedRoles.map((role) => (
              <div key={role} className="space-y-2 rounded-md border border-stone-800 bg-stone-950 p-3">
                <h3 className="text-sm font-semibold text-stone-100">{fixedRoleLabels[role]}</h3>
                <ul className="flex flex-wrap gap-2">
                  {fixedAssignments.filter((a) => a.role === role).map((fixed) => (
                    <li
                      key={fixed.id}
                      className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900 py-1 pl-3 pr-1 text-xs text-stone-200"
                    >
                      {judgeNames.get(fixed.judge_id) ?? 'Giudice'}
                      <button
                        aria-label={`Rimuovi ${judgeNames.get(fixed.judge_id) ?? 'giudice'} come ${fixedRoleLabels[role].toLowerCase()}`}
                        className="rounded-full p-1 text-stone-400 hover:bg-stone-800 hover:text-red-400 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => handleRemoveFixed(fixed.id)}
                        type="button"
                      >
                        <X aria-hidden="true" className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
                <select
                  aria-label={`Aggiungi ${fixedRoleLabels[role].toLowerCase()}`}
                  className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-200 disabled:opacity-50"
                  disabled={busy || getFixedOptions().length === 0}
                  onChange={(e) => {
                    if (e.target.value) handleAddFixed(role, e.target.value);
                  }}
                  value=""
                >
                  <option value="">+ Aggiungi</option>
                  {getFixedOptions().map((judge) => (
                    <option key={judge.id} value={judge.id}>{judge.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
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
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 rounded-md bg-palio-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-palio-600 disabled:opacity-50"
                disabled={busy || judges.length === 0}
                onClick={handleAutoAssign}
                type="button"
              >
                <Wand2 className="h-4 w-4" />
                Abbina automaticamente
              </button>
              {legacyAssignments.length > 0 && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:border-amber-400 disabled:opacity-50"
                  disabled={busy}
                  onClick={handleRemoveLegacy}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Rimuovi {legacyAssignments.length} abbinamenti senza corsia
                </button>
              )}
              <p className="text-xs text-stone-500">
                Riempie solo i posti titolari vuoti (per corsia) di tutti i giochi, rispettando preferenze e Contrade e tenendo, se possibile, ogni giudice sulla stessa corsia; gli abbinamenti già fatti restano.
              </p>
            </div>
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
                    {getLaneNumbers(heats, game, heatNumber).map((lane) => (
                      <div key={lane} className="space-y-2 rounded-md border border-stone-800 bg-stone-900/60 p-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-palio-300">Corsia {lane}</p>
                        {judgeRoles.map((role) => {
                          const current = gameAssignments.find((a) => !a.is_extra && a.heat_number === heatNumber && a.lane === lane && a.role === role);
                          const otherLanes = current
                            ? Array.from(judgeLanes.get(current.judge_id) ?? []).filter((l) => l !== lane).sort((a, b) => a - b)
                            : [];
                          return (
                            <label key={role} className="flex flex-col gap-1 text-xs font-semibold text-stone-400">
                              <span className="flex items-center gap-1.5">
                                {role === 'cronometrista' ? <Timer aria-hidden="true" className="h-3.5 w-3.5" /> : <Gavel aria-hidden="true" className="h-3.5 w-3.5" />}
                                {roleLabels[role]}
                              </span>
                              <select
                                className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1.5 text-sm font-normal text-stone-100 disabled:opacity-50"
                                disabled={busy}
                                onChange={(e) => handleSetTitolare(heatNumber, lane, role, e.target.value)}
                                value={current?.judge_id ?? ''}
                              >
                                <option value="">Non assegnato</option>
                                {getJudgeOptions(heatNumber, current?.judge_id).map((judge) => (
                                  <option key={judge.id} value={judge.id}>{judge.name}</option>
                                ))}
                              </select>
                              {otherLanes.length > 0 && (
                                <span className="font-normal text-amber-300">
                                  Cambia corsia: è anche in corsia {otherLanes.join(', ')}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                    {gameAssignments.some((a) => !a.is_extra && a.heat_number === heatNumber && a.lane === null) && (
                      <div className="rounded-md border border-amber-900/60 bg-amber-950/20 p-2 text-xs text-amber-200">
                        <p className="mb-1 font-semibold">Abbinamenti senza corsia (vecchi)</p>
                        <ul className="space-y-1">
                          {gameAssignments
                            .filter((a) => !a.is_extra && a.heat_number === heatNumber && a.lane === null)
                            .map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2">
                                <span>{roleLabels[a.role]}: {judgeNames.get(a.judge_id) ?? 'Giudice'}</span>
                                <button
                                  aria-label={`Rimuovi ${judgeNames.get(a.judge_id) ?? 'giudice'} come ${roleLabels[a.role].toLowerCase()} senza corsia`}
                                  className="rounded p-1 hover:bg-stone-800 hover:text-red-400 disabled:opacity-50"
                                  disabled={busy}
                                  onClick={() => handleRemoveAssignment(a.id)}
                                  type="button"
                                >
                                  <X aria-hidden="true" className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
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

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Gavel, Plus, Timer, Trash2, Wand2, X } from 'lucide-react';
import { getSupabaseClient } from '../config';
import { type Contrada, type PalioEdition, type PalioEditionHeat, type PalioGame, palioGameLabels } from '../hooks/usePalioLiveData';
import {
  type JudgePreference,
  type JudgeRole,
  type LaneRecord,
  type MissingSlot,
  type ProposalRow,
  computeExtras,
  computeTitolari,
  getHeatNumbers,
  getJudgeRoles,
  getLaneContradaId as getLaneContradaIdFrom,
  getLaneNumbers,
  getParticipantContradaIds as getParticipantContradaIdsFrom,
  getUsualLane as getUsualLaneFrom,
  hasLaneConflict as hasLaneConflictFrom,
  preferenceRank,
} from '../lib/palio-judge-assignment';

type FixedRole = 'fantapalio' | 'banco' | 'gonna';

interface FixedAssignment {
  id: string;
  judge_id: string;
  role: FixedRole;
}

const fixedRoles: FixedRole[] = ['fantapalio', 'banco', 'gonna'];

const fixedRoleLabels: Record<FixedRole, string> = {
  fantapalio: 'Giudice FantaPalio',
  banco: 'Giudice del banco',
  gonna: 'Giudice della gonna (Cerchio)',
};

// Il giudice della gonna è uno solo per tutte le batterie del Cerchio.
const singleFixedRoles: FixedRole[] = ['gonna'];

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
 * Un giudice abbinato a una Contrada non può mai stare nella corsia in cui
 * gareggia una di esse, in quella batteria; nelle altre corsie sì.
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
  const [proposal, setProposal] = useState<{ missing: MissingSlot[]; rows: ProposalRow[] } | null>(null);

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

  const contradaNames = useMemo(() => new Map(contrade.map((contrada) => [contrada.id, contrada.name])), [contrade]);
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

  // Corsia abituale di un giudice in un gioco: quella in cui ha più incarichi
  // titolari nelle altre batterie (a parità, la più bassa). Cambiare corsia da
  // un gioco all'altro va bene, per questo il calcolo è per gioco.
  function getUsualLane(judgeId: string, targetGame: PalioGame, excludeHeat: number | null): number | null {
    const counts = new Map<number, number>();
    assignments.forEach((a) => {
      if (a.is_extra || a.lane === null || a.judge_id !== judgeId || a.game !== targetGame || a.heat_number === excludeHeat) return;
      counts.set(a.lane, (counts.get(a.lane) ?? 0) + 1);
    });
    const [best] = Array.from(counts.entries()).sort((x, y) => y[1] - x[1] || x[0] - y[0]);
    return best ? best[0] : null;
  }

  // Motivo per cui un titolare non è sulla sua corsia abituale in questa
  // batteria; null se non si è spostato.
  function getMoveReason(assignment: JudgeAssignment): string | null {
    if (assignment.is_extra || assignment.lane === null || assignment.heat_number === null || assignment.game === 'finale') return null;
    const { game: g, heat_number: heatNumber, lane } = assignment;
    const usual = getUsualLane(assignment.judge_id, g, heatNumber);
    const judge = judges.find((j) => j.id === assignment.judge_id);
    if (usual === null || usual === lane || !judge) return null;
    if (hasLaneConflict(judge, g, heatNumber, usual)) {
      const contradaId = getLaneContradaId(g, heatNumber, usual);
      const contradaName = contradaId ? contradaNames.get(contradaId) ?? 'una sua Contrada' : 'una sua Contrada';
      return `Spostato dalla corsia ${usual}: in questa batteria vi gareggia ${contradaName}, sua Contrada.`;
    }
    const replaced = judges.find((other) =>
      other.id !== judge.id && getUsualLane(other.id, g, heatNumber) === lane && hasLaneConflict(other, g, heatNumber, lane)
    );
    if (replaced) {
      return `Di solito è in corsia ${usual}: qui copre ${replaced.name}, che non può stare in corsia ${lane} per conflitto di Contrada.`;
    }
    return `Di solito è in corsia ${usual}.`;
  }

  function getLaneContradaId(targetGame: PalioGame, heatNumber: number, lane: number): string | null {
    return getLaneContradaIdFrom(heats, targetGame, heatNumber, lane);
  }

  // Un giudice non può stare nella corsia (di quella batteria) dove gareggia una
  // delle sue Contrade; nelle altre corsie sì. Nel melocotogno ogni giudice può
  // fare il cronometrista e la finale non ha controlli di Contrada.
  function hasLaneConflict(judge: Judge, targetGame: PalioGame, heatNumber: number, lane: number): boolean {
    return hasLaneConflictFrom(heats, judge, targetGame, heatNumber, lane);
  }

  // Contrada (e se è senza giocatori) in una corsia di una batteria; per
  // melocotogno e finale le corsie non hanno Contrade note.
  function getLaneContrada(heatNumber: number, lane: number): { name: string; noPlayers: boolean } | null {
    if (game === 'melocotogno' || game === 'finale') return null;
    const heat = heats.find((h) => h.game === game && h.heat_number === heatNumber && h.display_order === lane);
    return heat ? { name: contradaNames.get(heat.contrada_id) ?? 'Contrada', noPlayers: heat.no_players } : null;
  }

  // Contrade che gareggiano in una batteria (o in tutto il gioco se heatNumber
  // è null). Melocotogno e finale non hanno batterie note e non hanno controlli
  // di Contrada.
  function getParticipantContradaIds(targetGame: PalioGame, heatNumber: number | null): Set<string> {
    return getParticipantContradaIdsFrom(heats, targetGame, heatNumber);
  }

  // Un giudice non può stare due volte nello stesso ambito (batteria o intero
  // gioco), in qualunque ruolo, né lavorare nella corsia dove gareggia la sua
  // Contrada. Gli extra non hanno corsia (lane assente): per loro conta l'intera
  // batteria (o l'intero gioco). Le opzioni escludono chi è già presente o è
  // in conflitto.
  function getJudgeOptions(heatNumber: number | null, keepJudgeId?: string, lane?: number): Judge[] {
    const participants = getParticipantContradaIds(game, heatNumber);
    const taken = new Set(
      gameAssignments
        .filter((a) => a.heat_number === heatNumber && a.judge_id !== keepJudgeId)
        .map((a) => a.judge_id)
    );
    return judges.filter((judge) => {
      if (taken.has(judge.id) || fixedJudgeIds.has(judge.id)) return false;
      return lane !== undefined && heatNumber !== null
        ? !hasLaneConflict(judge, game, heatNumber, lane)
        : !judge.contrada_ids.some((id) => participants.has(id));
    });
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
      ? assignments.filter((a) => a.judge_id === judge.id && (
        !a.is_extra && a.lane !== null && a.heat_number !== null
          ? hasLaneConflict({ ...judge, contrada_ids: [contradaId] }, a.game, a.heat_number, a.lane)
          : getParticipantContradaIds(a.game, a.heat_number).has(contradaId)
      ))
      : [];
    if (conflicts.length > 0) {
      const contradaName = contrade.find((c) => c.id === contradaId)?.name ?? 'questa Contrada';
      const warning = `${judge.name} ha ${conflicts.length} incarichi nelle corsie/prove dove gareggia ${contradaName}: verranno rimossi. Continuare?`;
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

  // Dati per la logica di abbinamento (modulo puro palio-judge-assignment).
  const engineInput = useMemo(() => ({
    assignments,
    fixedJudgeIds,
    games: availableGames,
    gonnaAlreadySet: fixedAssignments.some((a) => a.role === 'gonna'),
    heats,
    judges,
  }), [assignments, availableGames, fixedAssignments, fixedJudgeIds, heats, judges]);
  const judgeById = useMemo(() => new Map(judges.map((judge) => [judge.id, judge])), [judges]);

  // Extra e giudice della gonna della proposta: ricalcolati ad ogni modifica
  // dei titolari, così restano coerenti con l'anteprima.
  const proposalExtras = useMemo(
    () => (proposal ? computeExtras(engineInput, proposal.rows) : null),
    [engineInput, proposal]
  );

  const proposalRowKey = (row: Pick<ProposalRow, 'game' | 'heatNumber' | 'lane' | 'role'>) =>
    `${row.game}|${row.heatNumber}|${row.lane}|${row.role}`;

  // Segnalazioni sulle righe della proposta: contro la preferenza e cambio di corsia.
  const proposalFlags = useMemo(() => {
    const flags = new Map<string, { against: string | null; laneChange: string | null }>();
    if (!proposal) return flags;
    const records: LaneRecord[] = [
      ...assignments
        .filter((a) => !a.is_extra && a.lane !== null && a.heat_number !== null)
        .map((a) => ({ game: a.game, heatNumber: a.heat_number as number, judgeId: a.judge_id, lane: a.lane as number })),
      ...proposal.rows.map((r) => ({ game: r.game, heatNumber: r.heatNumber, judgeId: r.judgeId, lane: r.lane })),
    ];
    proposal.rows.forEach((row) => {
      const judge = judgeById.get(row.judgeId);
      if (!judge) return;
      const against = row.game !== 'melocotogno' && preferenceRank(judge, row.role) === 2
        ? `preferisce fare ${judge.preferred_role === 'giudice' ? 'il giudice' : 'il cronometrista'}`
        : null;
      const usual = getUsualLaneFrom(records, judge.id, row.game, row.heatNumber);
      let laneChange: string | null = null;
      if (usual !== null && usual !== row.lane) {
        const contradaId = hasLaneConflictFrom(heats, judge, row.game, row.heatNumber, usual)
          ? getLaneContradaIdFrom(heats, row.game, row.heatNumber, usual)
          : null;
        laneChange = contradaId
          ? `di solito corsia ${usual}, ma lì gareggia ${contradaNames.get(contradaId) ?? 'una sua Contrada'}, sua Contrada`
          : `di solito corsia ${usual}, spostato per coprire tutti i posti`;
      }
      if (against || laneChange) flags.set(proposalRowKey(row), { against, laneChange });
    });
    return flags;
  }, [assignments, contradaNames, heats, judgeById, proposal]);

  const proposalLabel = (row: Pick<ProposalRow, 'game' | 'heatNumber' | 'lane'>) =>
    `${palioGameLabels[row.game]} · batt. ${row.heatNumber} · corsia ${row.lane}`;

  // Calcola la proposta senza salvare: l'utente la controlla nell'anteprima.
  function handleAutoAssign() {
    if (!editionId) return;
    const { missing, rows } = computeTitolari(engineInput);
    const { extras, gonnaJudgeId } = computeExtras(engineInput, rows);
    if (rows.length === 0 && extras.length === 0 && !gonnaJudgeId) {
      setMessage(missing.length > 0
        ? `Nessun abbinamento possibile: ${missing.length} posti vuoti senza giudici disponibili.`
        : 'Nessun posto vuoto da riempire.');
      return;
    }
    setMessage('');
    setProposal({ missing, rows });
  }

  function handleProposalJudgeChange(row: ProposalRow, judgeId: string) {
    setProposal((current) => current && {
      ...current,
      rows: current.rows.map((r) => (proposalRowKey(r) === proposalRowKey(row) ? { ...r, judgeId } : r)),
    });
  }

  // Giudici scegliibili per una riga della proposta: liberi in quella batteria
  // (tra abbinamenti esistenti e altre righe), non figure fisse e senza
  // conflitto di Contrada in quella corsia.
  function getProposalOptions(row: ProposalRow): Judge[] {
    const taken = new Set([
      ...assignments.filter((a) => a.game === row.game && (a.heat_number === row.heatNumber || a.heat_number === null)).map((a) => a.judge_id),
      ...(proposal?.rows ?? [])
        .filter((r) => r.game === row.game && r.heatNumber === row.heatNumber && proposalRowKey(r) !== proposalRowKey(row))
        .map((r) => r.judgeId),
    ]);
    return judges.filter((judge) =>
      judge.id === row.judgeId
      || (!taken.has(judge.id) && !fixedJudgeIds.has(judge.id) && !hasLaneConflict(judge, row.game, row.heatNumber, row.lane)));
  }

  async function handleConfirmProposal() {
    if (!proposal || !editionId || !proposalExtras) return;
    const titolari = proposal.rows.map((r) => ({
      edition_id: editionId, game: r.game, heat_number: r.heatNumber, is_extra: false, judge_id: r.judgeId, lane: r.lane, role: r.role,
    }));
    const extras = proposalExtras.extras.map((e) => ({
      edition_id: editionId, game: e.game, heat_number: e.heatNumber, is_extra: true, judge_id: e.judgeId, lane: null, role: e.role,
    }));
    const gonnaJudgeId = proposalExtras.gonnaJudgeId;
    if (await run(async () => {
      if (titolari.length + extras.length > 0) {
        const inserted = await supabase.from('palio_judge_assignments').insert([...titolari, ...extras]);
        if (inserted.error) return inserted;
      }
      if (!gonnaJudgeId) return { error: null };
      return supabase.from('palio_judge_fixed').insert({ edition_id: editionId, judge_id: gonnaJudgeId, role: 'gonna' });
    }, 'Errore abbinamento automatico')) {
      setMessage(
        `Salvati ${titolari.length} incarichi titolari e ${extras.length} extra${gonnaJudgeId ? `; ${judgeNames.get(gonnaJudgeId) ?? 'un giudice'} designato giudice della gonna` : ''}.`
      );
      setProposal(null);
      await Promise.all([fetchAssignments(), fetchFixed()]);
    }
  }

  // Anteprima dell'abbinamento automatico: nulla è salvato finché non si conferma.
  // Le righe con segnalazioni (contro la preferenza, cambio di corsia) si
  // possono correggere subito con il menu del giudice.
  function renderProposal() {
    if (!proposal || !proposalExtras) return null;
    const gameOrder = new Map(availableGames.map((g, index) => [g, index]));
    const sortedRows = [...proposal.rows].sort((a, b) =>
      (gameOrder.get(a.game) ?? 0) - (gameOrder.get(b.game) ?? 0) || a.heatNumber - b.heatNumber || a.lane - b.lane || a.role.localeCompare(b.role));
    const flaggedRows = sortedRows.filter((row) => proposalFlags.has(proposalRowKey(row)));
    const extraCountByJudge = new Map<string, number>();
    proposalExtras.extras.forEach((e) => extraCountByJudge.set(e.judgeId, (extraCountByJudge.get(e.judgeId) ?? 0) + 1));
    const extraSummary = Array.from(extraCountByJudge.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([judgeId, count]) => `${judgeNames.get(judgeId) ?? 'Giudice'} (${count})`)
      .join(', ');
    const renderSelect = (row: ProposalRow) => (
      <select
        aria-label={`Giudice per ${proposalLabel(row)}, ${roleLabels[row.role]}`}
        className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-sm font-normal text-stone-100 disabled:opacity-50"
        disabled={busy}
        onChange={(e) => handleProposalJudgeChange(row, e.target.value)}
        value={row.judgeId}
      >
        {getProposalOptions(row).map((judge) => (
          <option key={judge.id} value={judge.id}>{judge.name}</option>
        ))}
      </select>
    );

    return (
      <div className="mt-4 space-y-3 rounded-md border border-amber-600/60 bg-amber-950/20 p-3 text-sm text-amber-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-amber-200">Anteprima abbinamento automatico (non ancora salvato)</h3>
          <div className="flex gap-2">
            <button
              className="rounded-md bg-palio-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-palio-600 disabled:opacity-50"
              disabled={busy}
              onClick={handleConfirmProposal}
              type="button"
            >
              Conferma e salva
            </button>
            <button
              className="rounded-md border border-stone-600 px-3 py-1.5 text-sm font-semibold text-stone-200 hover:border-stone-400 disabled:opacity-50"
              disabled={busy}
              onClick={() => setProposal(null)}
              type="button"
            >
              Annulla
            </button>
          </div>
        </div>
        <p>
          {proposal.rows.length} incarichi titolari, {proposalExtras.extras.length} extra, {flaggedRows.length} segnalazioni
          {proposal.missing.length > 0 ? `, ${proposal.missing.length} posti che restano vuoti` : ''}.
        </p>
        {flaggedRows.length > 0 && (
          <div>
            <p className="mb-1 font-semibold">Segnalazioni: puoi cambiare il giudice prima di confermare</p>
            <ul className="space-y-2">
              {flaggedRows.map((row) => {
                const flag = proposalFlags.get(proposalRowKey(row));
                return (
                  <li key={proposalRowKey(row)} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-stone-950/60 p-2">
                    <span className="text-stone-200">{proposalLabel(row)} · {roleLabels[row.role]}</span>
                    {renderSelect(row)}
                    <span className="text-xs text-amber-300">
                      {[flag?.against ? `Contro la preferenza: ${flag.against}` : '', flag?.laneChange ? `Cambia corsia: ${flag.laneChange}` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {proposal.missing.length > 0 && (
          <div>
            <p className="mb-1 font-semibold">Posti che restano vuoti (mancano giudici disponibili o senza conflitto di Contrada)</p>
            <ul className="list-inside list-disc text-xs">
              {proposal.missing.map((slot) => (
                <li key={proposalRowKey(slot)}>{proposalLabel(slot)} · {roleLabels[slot.role]}</li>
              ))}
            </ul>
          </div>
        )}
        {(proposalExtras.extras.length > 0 || proposalExtras.gonnaJudgeId) && (
          <p className="text-xs">
            {proposalExtras.extras.length > 0 ? `Extra (tra parentesi, in quante batterie): ${extraSummary}. ` : ''}
            {proposalExtras.gonnaJudgeId
              ? `${judgeNames.get(proposalExtras.gonnaJudgeId) ?? 'Un giudice'} sarà designato giudice della gonna (giudici in abbondanza).`
              : ''}
          </p>
        )}
        <details>
          <summary className="cursor-pointer font-semibold">Tutti gli abbinamenti proposti ({sortedRows.length})</summary>
          <ul className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {sortedRows.map((row) => (
              <li key={proposalRowKey(row)} className={proposalFlags.has(proposalRowKey(row)) ? 'text-amber-300' : 'text-stone-300'}>
                {proposalLabel(row)} · {roleLabels[row.role]}: {judgeNames.get(row.judgeId) ?? 'Giudice'}
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
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

  // Elimina gli abbinamenti di una batteria, di un gioco o (senza scope)
  // dell'intera edizione. Le figure fisse (FantaPalio, banco, gonna) non si
  // toccano mai. Gli extra valgono nello stesso ambito: quelli "per tutto il
  // gioco" saltano solo da gioco in su.
  async function handleClear(label: string, scope: { game?: PalioGame; heatNumber?: number } = {}) {
    if (!editionId) return;
    const inScope = assignments.filter(
      (a) => (!scope.game || a.game === scope.game) && (scope.heatNumber === undefined || a.heat_number === scope.heatNumber)
    );
    const total = inScope.length;
    if (total === 0) {
      setMessage('Nessun abbinamento da eliminare.');
      return;
    }
    if (!window.confirm(`Eliminare ${total} abbinamenti: ${label}? L'operazione non si può annullare.`)) return;
    const ok = await run(async () => {
      let query = supabase.from('palio_judge_assignments').delete().eq('edition_id', editionId);
      if (scope.game) query = query.eq('game', scope.game);
      if (scope.heatNumber !== undefined) query = query.eq('heat_number', scope.heatNumber);
      return query;
    }, 'Errore eliminazione abbinamenti');
    if (ok) {
      await fetchAssignments();
      setMessage(`Eliminati ${total} abbinamenti.`);
    }
  }

  // Abbinamenti titolari vecchi: senza corsia, oppure con un ruolo che nel gioco
  // non è più previsto (es. giudice della gonna per corsia, ora figura fissa).
  // Sono vecchi anche gli extra del melocotogno, che non li prevede.
  const isLegacyAssignment = (a: JudgeAssignment) =>
    a.is_extra ? a.game === 'melocotogno' : a.lane === null || !getJudgeRoles(a.game).includes(a.role);
  const legacyAssignments = useMemo(() => assignments.filter(isLegacyAssignment), [assignments]);

  async function handleRemoveLegacy() {
    if (!editionId || legacyAssignments.length === 0) return;
    if (!window.confirm(`Rimuovere i ${legacyAssignments.length} abbinamenti vecchi (senza corsia o con ruoli non più previsti) di questa edizione?`)) return;
    if (await run(
      () => supabase.from('palio_judge_assignments').delete().in('id', legacyAssignments.map((a) => a.id)),
      'Errore rimozione abbinamenti'
    )) {
      await fetchAssignments();
    }
  }

  // Figure fisse: valgono per qualsiasi Contrada. Non può ricoprirle chi ha già
  // incarichi (di corsia o di altra figura fissa) nell'edizione.
  function getFixedOptions(): Judge[] {
    const busyJudgeIds = new Set([...assignments, ...fixedAssignments].map((a) => a.judge_id));
    return judges.filter((judge) => !busyJudgeIds.has(judge.id));
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
          L&apos;elenco è valido per tutte le edizioni. Puoi inserirne più del necessario: quelli non abbinati restano a disposizione. Se abbini un giudice a una o più Contrade, non potrà mai stare nella corsia in cui gareggia una di quelle Contrade (nelle altre corsie sì); l'abbinamento automatico lo sostituisce con un altro giudice.
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
        {message && <p className="mt-3 whitespace-pre-line text-sm font-semibold text-amber-300">{message}</p>}
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
          Valgono per tutto il Palio, non per batteria o corsia, e possono essere più di una. Possono essere di qualsiasi Contrada. Il giudice della gonna è uno solo per tutte le batterie del Cerchio.
        </p>
        {!edition ? (
          <p className="mt-2 text-sm text-stone-400">Seleziona (o crea) un&apos;edizione in alto per assegnare le figure fisse.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {fixedRoles.filter((role) => role !== 'gonna' || availableGames.includes('cerchio')).map((role) => (
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
                  disabled={
                    busy
                    || getFixedOptions().length === 0
                    || (singleFixedRoles.includes(role) && fixedAssignments.some((a) => a.role === role))
                  }
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
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-600 px-3 py-1.5 text-sm font-semibold text-stone-200 hover:border-red-500 hover:text-red-300 disabled:opacity-50"
                disabled={busy || gameAssignments.length === 0}
                onClick={() => handleClear(`tutti quelli di ${palioGameLabels[game]}`, { game })}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Elimina abbinamenti {palioGameLabels[game]}
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-md border border-red-800 px-3 py-1.5 text-sm font-semibold text-red-300 hover:border-red-500 disabled:opacity-50"
                disabled={busy || assignments.length === 0}
                onClick={() => handleClear('tutti quelli dell\'edizione (le figure fisse restano)')}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Elimina tutti gli abbinamenti
              </button>
              {legacyAssignments.length > 0 && (
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-700 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:border-amber-400 disabled:opacity-50"
                  disabled={busy}
                  onClick={handleRemoveLegacy}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Rimuovi {legacyAssignments.length} abbinamenti vecchi
                </button>
              )}
              <p className="text-xs text-stone-500">
                Prepara un&apos;anteprima dei posti titolari vuoti (per corsia) di tutti i giochi, rispettando preferenze e Contrade e tenendo, se possibile, ogni giudice sulla stessa corsia; salva solo dopo la tua conferma e gli abbinamenti già fatti restano.
              </p>
            </div>
            {renderProposal()}
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0" role="tablist">
              {availableGames.map((g) => (
                <button
                  key={g}
                  aria-selected={g === game}
                  className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
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
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-stone-100">
                          {game === 'melocotogno' || game === 'finale' ? `${palioGameLabels[game]} (prova unica)` : `Batteria ${heatNumber}`}
                        </h3>
                        {game !== 'melocotogno' && game !== 'finale' && (
                          <p className="text-xs text-stone-400">
                            {heats
                              .filter((h) => h.game === game && h.heat_number === heatNumber)
                              .sort((a, b) => a.display_order - b.display_order)
                              .map((h) => contradaNames.get(h.contrada_id) ?? 'Contrada')
                              .join(' · ')}
                          </p>
                        )}
                      </div>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-stone-700 px-2 py-1 text-xs font-semibold text-stone-300 hover:border-red-500 hover:text-red-300 disabled:opacity-50"
                        disabled={busy || !gameAssignments.some((a) => a.heat_number === heatNumber)}
                        onClick={() => handleClear(`${palioGameLabels[game]}, batteria ${heatNumber}`, { game, heatNumber })}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-3 w-3" />
                        Svuota
                      </button>
                    </div>
                    {getLaneNumbers(heats, game, heatNumber).map((lane) => (
                      <div key={lane} className="space-y-2 rounded-md border border-stone-800 bg-stone-900/60 p-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-palio-300">
                          Corsia {lane}
                          {(() => {
                            const laneContrada = getLaneContrada(heatNumber, lane);
                            return laneContrada ? (
                              <span className="ml-2 normal-case tracking-normal text-stone-200">
                                {laneContrada.name}{laneContrada.noPlayers ? ' (senza giocatori)' : ''}
                              </span>
                            ) : null;
                          })()}
                        </p>
                        {judgeRoles.map((role) => {
                          const current = gameAssignments.find((a) => !a.is_extra && a.heat_number === heatNumber && a.lane === lane && a.role === role);
                          const moveReason = current ? getMoveReason(current) : null;
                          const currentJudge = current ? judgeById.get(current.judge_id) : undefined;
                          const againstPreference = currentJudge && game !== 'melocotogno' && preferenceRank(currentJudge, role) === 2
                            ? `preferisce fare ${currentJudge.preferred_role === 'giudice' ? 'il giudice' : 'il cronometrista'}`
                            : null;
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
                                {getJudgeOptions(heatNumber, current?.judge_id, lane).map((judge) => (
                                  <option key={judge.id} value={judge.id}>{judge.name}</option>
                                ))}
                              </select>
                              {againstPreference && (
                                <span className="font-normal text-amber-300">Contro la preferenza: {againstPreference}.</span>
                              )}
                              {moveReason && (
                                <span className="font-normal text-amber-300">Cambia corsia. {moveReason}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    ))}
                    {gameAssignments.some((a) => a.heat_number === heatNumber && isLegacyAssignment(a)) && (
                      <div className="rounded-md border border-amber-900/60 bg-amber-950/20 p-2 text-xs text-amber-200">
                        <p className="mb-1 font-semibold">Abbinamenti vecchi (senza corsia o ruolo non più previsto)</p>
                        <ul className="space-y-1">
                          {gameAssignments
                            .filter((a) => a.heat_number === heatNumber && isLegacyAssignment(a))
                            .map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2">
                                <span>{(a.is_extra ? extraRoleLabels : roleLabels)[a.role]}: {judgeNames.get(a.judge_id) ?? 'Giudice'}</span>
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
                    {game !== 'melocotogno' && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-stone-400">Extra per questa batteria</p>
                        {renderExtras(heatNumber)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {game !== 'melocotogno' && (
              <div className="mt-4 rounded-md border border-stone-800 bg-stone-950 p-3">
                <h3 className="text-sm font-semibold text-stone-100">Extra per tutto il gioco: {palioGameLabels[game]}</h3>
                <p className="mb-2 text-xs text-stone-500">Disponibili per ogni batteria di questo gioco.</p>
                {renderExtras(null)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

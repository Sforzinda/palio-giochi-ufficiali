import type { Contrada, PalioEdition, PalioEditionHeat, PalioGame } from '../hooks/usePalioLiveData';

// Generazione PDF delle schede giudice (tempi/penalità per corsia), della
// scheda riepilogativa e delle schede della finale. jsPDF è caricato in modo
// dinamico: pesa solo quando si scarica il PDF.

/**
 * Giudice abbinato (cronometrista o giudice delle penalità): titolare di una
 * corsia di una batteria oppure extra (di una batteria, o di tutto il gioco se
 * heatNumber è null; gli extra non hanno corsia).
 */
export interface JudgeSheetAssignment {
  game: PalioGame;
  heatNumber: number | null;
  isExtra: boolean;
  judgeId?: string;
  judgeName: string;
  lane: number | null;
  preferredRole?: 'cronometrista' | 'giudice' | null;
  role: string;
}

/** Figura fissa dell'edizione (gonna, FantaPalio, banco): vale per tutto il Palio. */
export interface JudgeSheetFixedRole {
  judgeId?: string;
  judgeName: string;
  preferredRole?: 'cronometrista' | 'giudice' | null;
  role: string;
}

interface JudgeSheetsInput {
  contrade: Contrada[];
  edition: PalioEdition;
  fixedRoles?: JudgeSheetFixedRole[];
  heats: PalioEditionHeat[];
  judgeAssignments?: JudgeSheetAssignment[];
  liveTitle: string;
}

interface Lane {
  laneNumber: number;
  rows: { contradaName: string; heatNumber: number; noPlayers: boolean }[];
}

type SheetKind = 'tempi' | 'penalita';

const gameTitles: Record<PalioGame, string> = {
  carriola: 'Corsa con le Carriole',
  cerchio: 'Corsa col Cerchio',
  corsa: 'Corsa',
  finale: 'Finale',
  melocotogno: 'Melocotogno',
  torre: 'Costruzione della Torre',
};

// Titolo breve in maiuscolo sulla scheda (come nelle schede cartacee storiche).
const gameSheetTitles: Record<PalioGame, string> = {
  carriola: 'CARRIOLE',
  cerchio: 'CERCHIO',
  corsa: 'CORSA',
  finale: 'FINALE',
  melocotogno: 'MELOCOTOGNO',
  torre: 'TORRE',
};

const sheetKindLabels: Record<SheetKind, string> = {
  penalita: 'TABELLA PENALITÀ',
  tempi: 'TABELLA TEMPI',
};

const FINALE_LANES = 3;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const TABLE_X = 30;
const TABLE_WIDTH = PAGE_WIDTH - TABLE_X * 2;
const NAME_COLUMN_WIDTH = 46;
const JUDGE_NAME_FONT_SIZE = 10.5;
const JUDGE_LINE_HEIGHT = 4.6;

export type PdfDoc = InstanceType<typeof import('jspdf').jsPDF>;

export function getEditionHeader(input: JudgeSheetsInput): [string, string] {
  const monthYear = `${input.edition.month} ${input.edition.year}`.toUpperCase();
  return [`VIGEVANO ${monthYear}`, input.liveTitle.trim().toUpperCase()];
}

function buildLanes(heats: PalioEditionHeat[], contrade: Contrada[], game: PalioGame): Lane[] {
  const contradaNames = new Map(contrade.map((contrada) => [contrada.id, contrada.name]));
  const byLane = new Map<number, Lane>();

  heats
    .filter((heat) => heat.game === game)
    .sort((a, b) => a.heat_number - b.heat_number || a.display_order - b.display_order)
    .forEach((heat) => {
      const lane = byLane.get(heat.display_order) ?? { laneNumber: heat.display_order, rows: [] };
      lane.rows.push({
        contradaName: contradaNames.get(heat.contrada_id) ?? 'Contrada',
        heatNumber: heat.heat_number,
        noPlayers: heat.no_players,
      });
      byLane.set(heat.display_order, lane);
    });

  return Array.from(byLane.values()).sort((a, b) => a.laneNumber - b.laneNumber);
}

// Nome del giudice titolare per la scheda: il cronometrista sulla scheda tempi,
// il giudice delle penalità su quella penalità.
function getJudgeName(
  input: Pick<JudgeSheetsInput, 'judgeAssignments'>,
  game: PalioGame,
  heatNumber: number,
  lane: number,
  kind: SheetKind
): string | undefined {
  const role = kind === 'tempi' ? 'cronometrista' : 'giudice';
  return input.judgeAssignments?.find(
    (a) => !a.isExtra && a.game === game && a.heatNumber === heatNumber && a.lane === lane && a.role === role
  )?.judgeName;
}

// Extra dello stesso ruolo validi per la batteria o per tutto il gioco.
function getExtraJudgeNames(
  input: Pick<JudgeSheetsInput, 'judgeAssignments'>,
  game: PalioGame,
  heatNumber: number,
  kind: SheetKind
): string[] {
  const role = kind === 'tempi' ? 'cronometrista' : 'giudice';
  return Array.from(new Set(
    (input.judgeAssignments ?? [])
      .filter((a) => a.isExtra && a.game === game && a.role === role && (a.heatNumber === null || a.heatNumber === heatNumber))
      .map((a) => a.judgeName)
  ));
}

export function drawPageHeader(doc: PdfDoc, headerLines: [string, string]) {
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(197, 40, 15);
  doc.text(headerLines[0], PAGE_WIDTH / 2, 22, { align: 'center' });
  doc.text(headerLines[1], PAGE_WIDTH / 2, 31, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}

function drawJudgeSheet(
  doc: PdfDoc,
  headerLines: [string, string],
  title: string,
  kind: SheetKind,
  rows: { extraJudgeNames?: string[]; judgeName?: string; label: string; noPlayers?: boolean }[]
) {
  drawPageHeader(doc, headerLines);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(title, PAGE_WIDTH / 2, 62, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(15);
  doc.text('Scheda giudice', PAGE_WIDTH / 2, 72, { align: 'center' });

  const tableTop = 82;
  const headerHeight = 12;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.25);
  doc.setFillColor(190, 192, 191);
  doc.rect(TABLE_X, tableTop, TABLE_WIDTH, headerHeight, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(sheetKindLabels[kind], PAGE_WIDTH / 2, tableTop + 8, { align: 'center' });

  const rowHeight = Math.min(36, (PAGE_HEIGHT - 15 - tableTop - headerHeight) / Math.max(rows.length, 1));
  rows.forEach((row, index) => {
    const y = tableTop + headerHeight + index * rowHeight;
    doc.setFillColor(221, 221, 221);
    doc.rect(TABLE_X, y, NAME_COLUMN_WIDTH, rowHeight, 'FD');
    doc.setFillColor(index % 2 === 0 ? 255 : 244, index % 2 === 0 ? 255 : 244, index % 2 === 0 ? 255 : 244);
    doc.rect(TABLE_X + NAME_COLUMN_WIDTH, y, TABLE_WIDTH - NAME_COLUMN_WIDTH, rowHeight, 'FD');

    // Sotto la contrada: eventuale "senza giocatori" e il nome del giudice.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(JUDGE_NAME_FONT_SIZE);
    const judgeLines: string[] = row.judgeName ? doc.splitTextToSize(row.judgeName, NAME_COLUMN_WIDTH - 6).slice(0, 2) : [];
    const bottomReserve = (row.noPlayers ? 4 : 0) + judgeLines.length * JUDGE_LINE_HEIGHT + (judgeLines.length > 0 ? 1 : 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const nameLines: string[] = doc.splitTextToSize(row.label, NAME_COLUMN_WIDTH - 6);
    const nameHeight = nameLines.length * 5.5;
    doc.text(nameLines, TABLE_X + NAME_COLUMN_WIDTH / 2, y + (rowHeight - bottomReserve - nameHeight) / 2 + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    const judgeTop = y + rowHeight - 3 - (judgeLines.length - 1) * JUDGE_LINE_HEIGHT;
    if (row.noPlayers) {
      doc.setFontSize(9);
      doc.text('(senza giocatori)', TABLE_X + NAME_COLUMN_WIDTH / 2, judgeTop - JUDGE_LINE_HEIGHT - 1 + (judgeLines.length === 0 ? JUDGE_LINE_HEIGHT + 1 : 0), { align: 'center' });
    }
    doc.setFontSize(JUDGE_NAME_FONT_SIZE);
    judgeLines.forEach((line, lineIndex) => {
      doc.text(line, TABLE_X + NAME_COLUMN_WIDTH / 2, judgeTop + lineIndex * JUDGE_LINE_HEIGHT, { align: 'center' });
    });

    if (row.extraJudgeNames && row.extraJudgeNames.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const extraLines: string[] = doc.splitTextToSize(
        `${kind === 'tempi' ? 'Cronometristi extra' : 'Giudici extra'}: ${row.extraJudgeNames.join(', ')}`,
        TABLE_WIDTH - NAME_COLUMN_WIDTH - 6
      );
      doc.text(extraLines.slice(0, 3), TABLE_X + NAME_COLUMN_WIDTH + 3, y + 6);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('Giocatori:', TABLE_X + NAME_COLUMN_WIDTH + 3, y + rowHeight - 3);
  });
}

function drawSummaryTable(
  doc: PdfDoc,
  top: number,
  title: string,
  columnHeaders: string[] | null,
  rows: { cells: string[]; label?: string }[]
): number {
  const rowHeight = 6.6;
  const labelWidth = columnHeaders ? 22 : 0;
  const cellWidth = (170 - labelWidth) / Math.max(columnHeaders?.length ?? rows[0]?.cells.length ?? 1, 1);
  const x = (PAGE_WIDTH - 170) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, PAGE_WIDTH / 2, top, { align: 'center' });

  let y = top + 3;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);

  if (columnHeaders) {
    doc.setFillColor(190, 192, 191);
    doc.rect(x, y, labelWidth, rowHeight, 'FD');
    doc.setFontSize(9);
    doc.text('Batteria', x + labelWidth / 2, y + 4.5, { align: 'center' });
    columnHeaders.forEach((header, index) => {
      doc.setFillColor(190, 192, 191);
      doc.rect(x + labelWidth + index * cellWidth, y, cellWidth, rowHeight, 'FD');
      doc.text(header, x + labelWidth + index * cellWidth + cellWidth / 2, y + 4.5, { align: 'center' });
    });
    y += rowHeight;
  }

  rows.forEach((row, rowIndex) => {
    const shade = rowIndex % 2 === 0 ? 255 : 244;
    if (columnHeaders) {
      doc.setFillColor(221, 221, 221);
      doc.rect(x, y, labelWidth, rowHeight, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(row.label ?? '', x + labelWidth / 2, y + 4.5, { align: 'center' });
    }
    row.cells.forEach((cell, cellIndex) => {
      doc.setFillColor(shade, shade, shade);
      doc.rect(x + labelWidth + cellIndex * cellWidth, y, cellWidth, rowHeight, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      const [fitted] = doc.splitTextToSize(cell, cellWidth - 3) as string[];
      doc.text(fitted ?? '', x + labelWidth + cellIndex * cellWidth + 2, y + 4.5);
    });
    y += rowHeight;
  });

  return y;
}

function drawSummaryPage(doc: PdfDoc, input: JudgeSheetsInput, games: PalioGame[]) {
  drawPageHeader(doc, getEditionHeader(input));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Riepilogo corsie', PAGE_WIDTH / 2, 48, { align: 'center' });

  let y = 60;
  games.forEach((game) => {
    if (game === 'melocotogno') {
      const names = [...input.contrade].map((contrada) => contrada.name).sort((a, b) => a.localeCompare(b, 'it'));
      const columns = 4;
      const rows = Array.from({ length: Math.ceil(names.length / columns) }, (_, rowIndex) => ({
        cells: names.slice(rowIndex * columns, rowIndex * columns + columns),
      }));
      y = drawSummaryTable(doc, y, gameTitles.melocotogno, null, rows) + 9;
      return;
    }

    const lanes = buildLanes(input.heats, input.contrade, game);
    if (lanes.length === 0) return;
    const heatNumbers = Array.from(new Set(lanes.flatMap((lane) => lane.rows.map((row) => row.heatNumber)))).sort((a, b) => a - b);
    const rows = heatNumbers.map((heatNumber) => ({
      cells: lanes.map((lane) => {
        const row = lane.rows.find((laneRow) => laneRow.heatNumber === heatNumber);
        if (!row) return '';
        return row.noPlayers ? `${row.contradaName} (senza giocatori)` : row.contradaName;
      }),
      label: String(heatNumber),
    }));
    y = drawSummaryTable(doc, y, gameTitles[game], lanes.map((lane) => `Corsia ${lane.laneNumber}`), rows) + 9;
  });
}

const fixedRoleLabels: Record<string, string> = { banco: 'Banco', fantapalio: 'FantaPalio', gonna: 'Gonna' };
const preferenceLabels = { cronometrista: 'Cronometrista', giudice: 'Giudice' };
const SUMMARY_MARGIN = 8;
const SUMMARY_TABLE_WIDTH = PAGE_WIDTH - SUMMARY_MARGIN * 2;
const SUMMARY_NAME_WIDTH = 36;
const SUMMARY_PREF_WIDTH = 22;
const SUMMARY_FIRST_TOP = 60;
const SUMMARY_NEXT_TOP = 18;
const SUMMARY_BOTTOM = PAGE_HEIGHT - 10;
const SUMMARY_FONT_SIZES = [9, 8.5, 8, 7.5, 7, 6.5, 6];

interface SummaryEntry {
  against: boolean;
  text: string;
}

interface SummaryJudge {
  cells: Map<string, SummaryEntry[]>;
  against: number;
  name: string;
  preferredRole: 'cronometrista' | 'giudice' | null;
}

// Un incarico è "contro" la preferenza se il giudice preferisce l'altro ruolo
// (il melocotogno non conta, come nell'abbinamento automatico).
function isAgainstPreference(preferredRole: SummaryJudge['preferredRole'], role: string, game: PalioGame): boolean {
  if (!preferredRole || game === 'melocotogno') return false;
  return preferredRole !== (role === 'cronometrista' ? 'cronometrista' : 'giudice');
}

function buildJudgeSummary(input: JudgeSheetsInput, games: PalioGame[]): { columns: { key: string; title: string }[]; judges: SummaryJudge[] } {
  const judges = new Map<string, SummaryJudge>();
  const getJudge = (id: string | undefined, name: string, preferredRole: SummaryJudge['preferredRole']) => {
    const key = id ?? name;
    let judge = judges.get(key);
    if (!judge) {
      judge = { against: 0, cells: new Map(), name, preferredRole };
      judges.set(key, judge);
    }
    return judge;
  };
  const addEntry = (judge: SummaryJudge, column: string, entry: SummaryEntry) => {
    judge.cells.set(column, [...(judge.cells.get(column) ?? []), entry]);
    if (entry.against) judge.against += 1;
  };

  const gameOrder = [...games, 'finale' as PalioGame];
  const sortKey = (a: JudgeSheetAssignment) => gameOrder.indexOf(a.game) * 1000 + (a.heatNumber ?? 0) * 10 + (a.isExtra ? 5 : 0) + (a.lane ?? 0) / 10;
  const usedColumns = new Set<string>();

  [...(input.judgeAssignments ?? [])]
    .filter((a) => gameOrder.includes(a.game) && (a.role === 'cronometrista' || a.role === 'giudice'))
    .sort((a, b) => sortKey(a) - sortKey(b))
    .forEach((a) => {
      const judge = getJudge(a.judgeId, a.judgeName, a.preferredRole ?? null);
      const parts: string[] = [];
      if (a.game !== 'melocotogno' && a.game !== 'finale') parts.push(a.heatNumber === null ? 'tutte le batt.' : `B${a.heatNumber}`);
      if (a.isExtra) parts.push('extra');
      else if (a.lane !== null && a.game !== 'melocotogno') parts.push(`C${a.lane}`);
      parts.push(a.role === 'cronometrista' ? 'Tempi' : 'Penal.');
      const against = isAgainstPreference(judge.preferredRole, a.role, a.game);
      addEntry(judge, a.game, { against, text: parts.join(' ') + (against ? ' !' : '') });
      usedColumns.add(a.game);
    });

  (input.fixedRoles ?? []).forEach((f) => {
    const judge = getJudge(f.judgeId, f.judgeName, f.preferredRole ?? null);
    addEntry(judge, 'fissi', { against: false, text: fixedRoleLabels[f.role] ?? f.role });
    usedColumns.add('fissi');
  });

  const columns = [...gameOrder, 'fissi' as const]
    .filter((key) => usedColumns.has(key))
    .map((key) => ({ key, title: key === 'fissi' ? 'Figura fissa' : gameSheetTitles[key as PalioGame] }));
  return { columns, judges: Array.from(judges.values()).sort((a, b) => a.name.localeCompare(b.name, 'it')) };
}

// Pagine riepilogative per giudice: cosa giudica (gioco, batteria, corsia, ruolo)
// e quando (ordine dei giochi e delle batterie). In rosso gli incarichi contro la
// preferenza. Il corpo tabella si rimpicciolisce per restare in 1 pagina (max 2).
function drawJudgeSummaryPages(doc: PdfDoc, input: JudgeSheetsInput, games: PalioGame[]) {
  const { columns, judges } = buildJudgeSummary(input, games);
  if (judges.length === 0) return;
  const headerLines = getEditionHeader(input);
  const cellWidth = (SUMMARY_TABLE_WIDTH - SUMMARY_NAME_WIDTH - SUMMARY_PREF_WIDTH) / Math.max(columns.length, 1);

  const metrics = (fontSize: number) => {
    const lineHeight = fontSize * 0.42;
    const rowPadding = fontSize * 0.3;
    const rowHeights = judges.map((judge) => {
      const lines = Math.max(1, ...Array.from(judge.cells.values()).map((entries) => entries.length), judge.against > 0 ? 2 : 1);
      return lines * lineHeight + rowPadding;
    });
    return { lineHeight, rowHeights, rowPadding };
  };
  const pagesNeeded = (rowHeights: number[], headerHeight: number) => {
    let pages = 1;
    let y = SUMMARY_FIRST_TOP + headerHeight;
    rowHeights.forEach((height) => {
      if (y + height > SUMMARY_BOTTOM) {
        pages += 1;
        y = SUMMARY_NEXT_TOP + headerHeight;
      }
      y += height;
    });
    return pages;
  };
  const headerHeight = 9;
  const fontSize = SUMMARY_FONT_SIZES.find((size) => pagesNeeded(metrics(size).rowHeights, headerHeight) === 1)
    ?? SUMMARY_FONT_SIZES.find((size) => pagesNeeded(metrics(size).rowHeights, headerHeight) <= 2)
    ?? SUMMARY_FONT_SIZES[SUMMARY_FONT_SIZES.length - 1];
  const { lineHeight, rowHeights, rowPadding } = metrics(fontSize);

  const drawTableHeader = (top: number) => {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const heads = [
      { title: 'Giudice', width: SUMMARY_NAME_WIDTH },
      { title: 'Preferenza', width: SUMMARY_PREF_WIDTH },
      ...columns.map((column) => ({ title: column.title, width: cellWidth })),
    ];
    let x = SUMMARY_MARGIN;
    heads.forEach((head) => {
      // Il testo condivide il colore di riempimento: va reimpostato a ogni cella.
      doc.setFillColor(190, 192, 191);
      doc.rect(x, top, head.width, headerHeight, 'FD');
      doc.text(head.title, x + head.width / 2, top + 5.8, { align: 'center' });
      x += head.width;
    });
  };

  doc.addPage();
  drawPageHeader(doc, headerLines);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Riepilogo giudici', PAGE_WIDTH / 2, 44, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('B = batteria · C = corsia · Tempi = cronometrista · Penal. = giudice penalità · extra = di riserva', PAGE_WIDTH / 2, 50.5, { align: 'center' });
  doc.setTextColor(197, 40, 15);
  doc.setFont('helvetica', 'bold');
  doc.text('In rosso con ! : incarico contro la preferenza del giudice', PAGE_WIDTH / 2, 55.5, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  let y = SUMMARY_FIRST_TOP;
  drawTableHeader(y);
  y += headerHeight;

  judges.forEach((judge, index) => {
    const height = rowHeights[index];
    if (y + height > SUMMARY_BOTTOM) {
      doc.addPage();
      y = SUMMARY_NEXT_TOP;
      drawTableHeader(y);
      y += headerHeight;
    }
    const shade = index % 2 === 0 ? 255 : 244;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.15);
    doc.setFillColor(221, 221, 221);
    doc.rect(SUMMARY_MARGIN, y, SUMMARY_NAME_WIDTH, height, 'FD');
    doc.setFillColor(shade, shade, shade);
    doc.rect(SUMMARY_MARGIN + SUMMARY_NAME_WIDTH, y, SUMMARY_PREF_WIDTH, height, 'FD');
    columns.forEach((_, columnIndex) => {
      doc.rect(SUMMARY_MARGIN + SUMMARY_NAME_WIDTH + SUMMARY_PREF_WIDTH + columnIndex * cellWidth, y, cellWidth, height, 'FD');
    });

    const baseline = y + rowPadding / 2 + lineHeight * 0.8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    const [name] = doc.splitTextToSize(judge.name, SUMMARY_NAME_WIDTH - 3) as string[];
    doc.text(name ?? '', SUMMARY_MARGIN + 1.5, baseline);

    const prefX = SUMMARY_MARGIN + SUMMARY_NAME_WIDTH + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.text(judge.preferredRole ? preferenceLabels[judge.preferredRole] : 'Indifferente', prefX, baseline);
    if (judge.against > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(197, 40, 15);
      doc.text(`${judge.against} contro`, prefX, baseline + lineHeight);
      doc.setTextColor(0, 0, 0);
    }

    columns.forEach((column, columnIndex) => {
      const cellX = SUMMARY_MARGIN + SUMMARY_NAME_WIDTH + SUMMARY_PREF_WIDTH + columnIndex * cellWidth + 1.5;
      (judge.cells.get(column.key) ?? []).forEach((entry, entryIndex) => {
        doc.setFont('helvetica', entry.against ? 'bold' : 'normal');
        doc.setTextColor(entry.against ? 197 : 0, entry.against ? 40 : 0, entry.against ? 15 : 0);
        const [fitted] = doc.splitTextToSize(entry.text, cellWidth - 2) as string[];
        doc.text(fitted ?? '', cellX, baseline + entryIndex * lineHeight);
      });
    });
    doc.setTextColor(0, 0, 0);
    y += height;
  });
}

/** Errore del caricamento di jsPDF: di solito la pagina è aperta da prima di un nuovo deploy. */
export const OUTDATED_APP_MESSAGE = 'Versione della pagina non aggiornata: ricarica (Cmd/Ctrl + Maiusc + R) e riprova';

export async function createDoc(): Promise<PdfDoc> {
  let jsPDFModule: typeof import('jspdf');
  try {
    jsPDFModule = await import('jspdf');
  } catch (error) {
    // Dopo un deploy i file con hash vecchio non esistono più: il server risponde
    // con l'index.html e l'import dinamico fallisce.
    console.error('Error loading jspdf chunk:', error);
    throw new Error(OUTDATED_APP_MESSAGE);
  }
  return new jsPDFModule.jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
}

export const fileSlug = (edition: PalioEdition) => `${edition.year}-${edition.month}`;

/**
 * PDF con: riepilogo di tutti i giochi/corsie (prima pagina), riepilogo per
 * giudice (1-2 pagine) e, per ogni gioco
 * estratto, le schede giudice tempi e penalità di ciascuna corsia con le
 * contrade già inserite.
 */
export async function downloadJudgeSheetsPdf(input: JudgeSheetsInput, games: PalioGame[]): Promise<void> {
  const doc = await createDoc();
  const headerLines = getEditionHeader(input);
  const drawnGames = games.filter((game) => game !== 'melocotogno' && game !== 'finale');

  drawSummaryPage(doc, input, games);
  drawJudgeSummaryPages(doc, input, games);

  drawnGames.forEach((game) => {
    const lanes = buildLanes(input.heats, input.contrade, game);
    (['tempi', 'penalita'] as SheetKind[]).forEach((kind) => {
      lanes.forEach((lane) => {
        doc.addPage();
        drawJudgeSheet(
          doc,
          headerLines,
          `${gameSheetTitles[game]} - CORSIA ${lane.laneNumber}`,
          kind,
          lane.rows.map((row) => ({
            extraJudgeNames: getExtraJudgeNames(input, game, row.heatNumber, kind),
            judgeName: getJudgeName(input, game, row.heatNumber, lane.laneNumber, kind),
            label: row.contradaName,
            noPlayers: row.noPlayers,
          }))
        );
      });
    });
  });

  doc.save(`schede-giudici-${fileSlug(input.edition)}.pdf`);
}

/** Schede della finale (tempi e penalità per corsia) con la riga contrada vuota da compilare a mano. */
export async function downloadFinaleSheetsPdf(input: Omit<JudgeSheetsInput, 'contrade' | 'heats'>): Promise<void> {
  const doc = await createDoc();
  const headerLines = getEditionHeader({ ...input, contrade: [], heats: [] });

  (['tempi', 'penalita'] as SheetKind[]).forEach((kind, kindIndex) => {
    for (let lane = 1; lane <= FINALE_LANES; lane += 1) {
      if (kindIndex > 0 || lane > 1) doc.addPage();
      drawJudgeSheet(doc, headerLines, `FINALE - CORSIA ${lane}`, kind, [
        { extraJudgeNames: getExtraJudgeNames(input, 'finale', 1, kind), judgeName: getJudgeName(input, 'finale', 1, lane, kind), label: '' },
      ]);
    }
  });

  doc.save(`scheda-finale-${fileSlug(input.edition)}.pdf`);
}

import type { Contrada, PalioEdition, PalioEditionHeat, PalioGame } from '../hooks/usePalioLiveData';

// Generazione PDF delle schede giudice (tempi/penalità per corsia), della
// scheda riepilogativa e delle schede della finale. jsPDF è caricato in modo
// dinamico: pesa solo quando si scarica il PDF.

interface JudgeSheetsInput {
  contrade: Contrada[];
  edition: PalioEdition;
  heats: PalioEditionHeat[];
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
  rows: { label: string; noPlayers?: boolean }[]
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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const nameLines: string[] = doc.splitTextToSize(row.label, NAME_COLUMN_WIDTH - 6);
    const nameHeight = nameLines.length * 5.5;
    doc.text(nameLines, TABLE_X + NAME_COLUMN_WIDTH / 2, y + (rowHeight - nameHeight) / 2 + 4, { align: 'center' });
    if (row.noPlayers) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('(senza giocatori)', TABLE_X + NAME_COLUMN_WIDTH / 2, y + rowHeight - 3, { align: 'center' });
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

export async function createDoc(): Promise<PdfDoc> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm' });
}

export const fileSlug = (edition: PalioEdition) => `${edition.year}-${edition.month}`;

/**
 * PDF con: riepilogo di tutti i giochi/corsie (prima pagina) e, per ogni gioco
 * estratto, le schede giudice tempi e penalità di ciascuna corsia con le
 * contrade già inserite.
 */
export async function downloadJudgeSheetsPdf(input: JudgeSheetsInput, games: PalioGame[]): Promise<void> {
  const doc = await createDoc();
  const headerLines = getEditionHeader(input);
  const drawnGames = games.filter((game) => game !== 'melocotogno' && game !== 'finale');

  drawSummaryPage(doc, input, games);

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
          lane.rows.map((row) => ({ label: row.contradaName, noPlayers: row.noPlayers }))
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
      drawJudgeSheet(doc, headerLines, `FINALE - CORSIA ${lane}`, kind, [{ label: '' }]);
    }
  });

  doc.save(`scheda-finale-${fileSlug(input.edition)}.pdf`);
}

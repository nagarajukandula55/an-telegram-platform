import { BadRequestException, Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import PDFDocument = require("pdfkit");
import { uploadAttachment } from "@an-tg/storage";
import { PrismaService } from "../common/prisma.service";

const ROW_HEIGHT = 24;
const COL_WIDTH = 90;
const MARGIN = 36;

@Injectable()
export class ExcelService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Excel range -> PDF renderer (spec §70/Phase 7). Reads a cell range out
   * of an uploaded workbook and draws it as a simple grid-table PDF —
   * meant for "send this week's numbers as an attachment" style use
   * cases, not a full spreadsheet-fidelity export (no cell styling,
   * formulas are read at their last-computed value like any xlsx reader).
   * The generated PDF is stored as a normal Attachment, usable from
   * Compose/Campaigns exactly like a manually-uploaded file.
   */
  async renderRangeToPdf(
    organizationId: string,
    file: { buffer: Buffer },
    params: { sheetName?: string; range: string; title?: string },
  ) {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = params.sheetName ?? workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new BadRequestException(`Sheet "${sheetName}" not found — available sheets: ${workbook.SheetNames.join(", ")}`);
    }

    let decodedRange: XLSX.Range;
    try {
      decodedRange = XLSX.utils.decode_range(params.range);
    } catch {
      throw new BadRequestException(`Invalid range "${params.range}" — expected something like "A1:D10"`);
    }

    const rows: string[][] = [];
    for (let r = decodedRange.s.r; r <= decodedRange.e.r; r++) {
      const row: string[] = [];
      for (let c = decodedRange.s.c; c <= decodedRange.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        row.push(cell ? String(cell.w ?? cell.v ?? "") : "");
      }
      rows.push(row);
    }
    if (rows.length === 0) {
      throw new BadRequestException("The given range is empty");
    }

    const pdfBuffer = await renderTableToPdf(rows, params.title);

    const uploaded = await uploadAttachment({
      buffer: pdfBuffer,
      originalName: `${(params.title ?? sheetName).replace(/[^\w-]+/g, "_")}.pdf`,
      mimeType: "application/pdf",
      organizationId,
    });

    return this.prisma.client.attachment.create({
      data: {
        organizationId,
        originalName: uploaded.storedName.split("/").pop() ?? "range.pdf",
        storedName: uploaded.storedName,
        mimeType: "application/pdf",
        sizeBytes: uploaded.sizeBytes,
        hash: uploaded.hash,
        storageLocation: uploaded.storedName,
        sourceType: "excel_render",
      },
    });
  }
}

function renderTableToPdf(rows: string[][], title?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const colCount = Math.max(...rows.map((r) => r.length));
    const doc = new PDFDocument({
      size: [MARGIN * 2 + colCount * COL_WIDTH, MARGIN * 2 + (rows.length + (title ? 1 : 0)) * ROW_HEIGHT],
      margin: MARGIN,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;
    if (title) {
      doc.fontSize(14).font("Helvetica-Bold").text(title, MARGIN, y);
      y += ROW_HEIGHT;
    }

    doc.fontSize(9).font("Helvetica");
    rows.forEach((row, rowIndex) => {
      let x = MARGIN;
      const isHeader = rowIndex === 0;
      row.forEach((cellText) => {
        doc.rect(x, y, COL_WIDTH, ROW_HEIGHT).stroke("#cccccc");
        doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").text(cellText, x + 4, y + 6, { width: COL_WIDTH - 8, height: ROW_HEIGHT - 8, ellipsis: true });
        x += COL_WIDTH;
      });
      y += ROW_HEIGHT;
    });

    doc.end();
  });
}

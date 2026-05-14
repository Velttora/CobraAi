import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@renova/db";

@Injectable()
export class ImportErrorReportService {
  async buildCsv(importBatchId: string): Promise<string> {
    const importBatch = await prisma.importBatch.findUnique({
      where: {
        id: importBatchId
      },
      include: {
        errors: {
          orderBy: {
            rowNumber: "asc"
          }
        }
      }
    });

    if (!importBatch) {
      throw new NotFoundException("Import batch not found.");
    }

    const rows = [
      ["rowNumber", "reason", "rawData"],
      ...importBatch.errors.map((error) => [
        String(error.rowNumber),
        error.reason,
        JSON.stringify(error.rawData)
      ])
    ];

    return rows.map((row) => row.map(this.escapeCsvCell).join(",")).join("\n");
  }

  private escapeCsvCell(value: string): string {
    if (!/[",\n]/.test(value)) {
      return value;
    }

    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
}

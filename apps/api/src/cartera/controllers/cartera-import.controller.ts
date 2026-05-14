import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { CarteraImportService } from "../services/cartera-import.service";
import { ImportErrorReportService } from "../services/import-error-report.service";
import { ImportTemplateService } from "../services/import-template.service";

const excelMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream"
]);

@Controller("cartera")
export class CarteraImportController {
  constructor(
    private readonly carteraImportService: CarteraImportService,
    private readonly importErrorReportService: ImportErrorReportService,
    private readonly importTemplateService: ImportTemplateService
  ) {}

  @Post("import")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024
      },
      fileFilter: (_request, file, callback) => {
        const hasExcelExtension = /\.(xlsx|xls)$/i.test(file.originalname);
        if (!hasExcelExtension && !excelMimeTypes.has(file.mimetype)) {
          callback(new BadRequestException("Solo se aceptan archivos Excel .xlsx/.xls."), false);
          return;
        }

        callback(null, true);
      }
    })
  )
  async importExcel(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Headers("x-renova-org-id") clerkOrgId?: string,
    @Headers("x-renova-org-name") organizationName?: string
  ) {
    return this.carteraImportService.importExcel({
      file,
      clerkOrgId,
      organizationName
    });
  }

  @Get("imports/:importBatchId/errors.csv")
  async downloadErrorReport(
    @Param("importBatchId") importBatchId: string,
    @Res() response: Response
  ) {
    const csv = await this.importErrorReportService.buildCsv(importBatchId);

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="import-errors-${importBatchId}.csv"`
    );
    response.send(csv);
  }

  @Get("imports/:importBatchId")
  getImportStatus(@Param("importBatchId") importBatchId: string) {
    return this.carteraImportService.getImportStatus(importBatchId);
  }

  @Get("template.xlsx")
  downloadTemplate(@Res() response: Response) {
    const template = this.importTemplateService.buildTemplate();

    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader("Content-Disposition", "attachment; filename=\"cartera-template.xlsx\"");
    response.send(template);
  }
}

import { Module } from "@nestjs/common";
import { ExcelSource } from "./adapters/excel-source.adapter";
import { FileSystemObjectStorage } from "./adapters/file-system-object-storage.adapter";
import { CarteraImportController } from "./controllers/cartera-import.controller";
import { CARTERA_SOURCE } from "./ports/cartera-source.port";
import { OBJECT_STORAGE } from "./ports/object-storage.port";
import { CarteraImportService } from "./services/cartera-import.service";
import { ImportErrorReportService } from "./services/import-error-report.service";
import { ImportTemplateService } from "./services/import-template.service";

@Module({
  controllers: [CarteraImportController],
  providers: [
    CarteraImportService,
    ImportErrorReportService,
    ImportTemplateService,
    {
      provide: CARTERA_SOURCE,
      useClass: ExcelSource
    },
    {
      provide: OBJECT_STORAGE,
      useClass: FileSystemObjectStorage
    }
  ]
})
export class CarteraModule {}

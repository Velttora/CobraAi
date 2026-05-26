import { Module } from "@nestjs/common";
import { DebtsModule } from "../debts/debts.module";
import { PortfoliosModule } from "../portfolios/portfolios.module";
import { CsvParserService } from "./csv-parser.service";
import { ImportController } from "./import.controller";
import { ImportService } from "./import.service";
import { PdfParserService } from "./pdf-parser.service";
import { XlsxParserService } from "./xlsx-parser.service";

@Module({
  imports: [DebtsModule, PortfoliosModule],
  controllers: [ImportController],
  providers: [ImportService, CsvParserService, XlsxParserService, PdfParserService]
})
export class ImportModule {}

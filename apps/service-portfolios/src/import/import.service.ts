import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job } from "bullmq";
import { randomUUID } from "node:crypto";
import { DebtsService } from "../debts/debts.service";
import { KafkaService } from "../kafka/kafka.service";
import { PortfoliosService } from "../portfolios/portfolios.service";
import { CsvParserService, type ImportRow } from "./csv-parser.service";
import { PdfParserService } from "./pdf-parser.service";
import { XlsxParserService } from "./xlsx-parser.service";

export type ImportJobState = {
  job_id: string;
  portfolio_id: string;
  tenant_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  estimated_rows: number;
  processed_rows: number;
  success_rows: number;
  error_rows: number;
  errors: string[];
};

const QUEUE_NAME = "portfolio-import";

@Injectable()
export class ImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly jobs = new Map<string, ImportJobState>();

  constructor(
    private readonly config: ConfigService,
    private readonly csvParser: CsvParserService,
    private readonly xlsxParser: XlsxParserService,
    private readonly pdfParser: PdfParserService,
    private readonly debtsService: DebtsService,
    private readonly portfoliosService: PortfoliosService,
    private readonly kafka: KafkaService
  ) {}

  onModuleInit(): void {
    const redisUrl = this.config.get<string>("REDIS_URL");
    if (!redisUrl) {
      this.logger.warn("Import queue deshabilitada (REDIS_URL no configurado)");
      return;
    }

    const connection = { url: redisUrl };
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => this.processJob(job),
      { connection, concurrency: 2 }
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueueImport(input: {
    tenantId: string;
    portfolioId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<ImportJobState> {
    await this.portfoliosService.findOne(input.tenantId, input.portfolioId);

    const rows = await this.parseFile(input.buffer, input.filename);
    const jobId = randomUUID();
    const state: ImportJobState = {
      job_id: jobId,
      portfolio_id: input.portfolioId,
      tenant_id: input.tenantId,
      status: "queued",
      estimated_rows: rows.length,
      processed_rows: 0,
      success_rows: 0,
      error_rows: 0,
      errors: []
    };
    this.jobs.set(jobId, state);

    if (this.queue) {
      await this.queue.add("import", {
        jobId,
        tenantId: input.tenantId,
        portfolioId: input.portfolioId,
        rows
      });
    } else {
      void this.runInline(state, input.tenantId, input.portfolioId, rows);
    }

    return state;
  }

  getJob(jobId: string): ImportJobState | undefined {
    return this.jobs.get(jobId);
  }

  private async parseFile(buffer: Buffer, filename: string): Promise<ImportRow[]> {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".csv")) {
      try {
        return this.csvParser.parseCsv(buffer, "utf-8");
      } catch {
        return this.csvParser.parseCsv(buffer, "latin1");
      }
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      return this.xlsxParser.parse(buffer, {
        email: this.config.get<string>("IMPORT_DEFAULT_EMAIL"),
        phone: this.config.get<string>("IMPORT_DEFAULT_PHONE"),
        name: this.config.get<string>("IMPORT_DEFAULT_DEBTOR_NAME"),
      });
    }
    if (lower.endsWith(".pdf")) {
      return this.pdfParser.parse(buffer, {
        email: this.config.get<string>("IMPORT_DEFAULT_EMAIL"),
        phone: this.config.get<string>("IMPORT_DEFAULT_PHONE"),
        name: this.config.get<string>("IMPORT_DEFAULT_DEBTOR_NAME"),
      });
    }
    throw new Error("Formato no soportado. Use CSV, XLSX o PDF.");
  }

  private async processJob(
    job: Job<{ jobId: string; tenantId: string; portfolioId: string; rows: ImportRow[] }>
  ): Promise<void> {
    const { jobId, tenantId, portfolioId, rows } = job.data;
    const state = this.jobs.get(jobId);
    if (!state) return;
    await this.runInline(state, tenantId, portfolioId, rows);
  }

  private async runInline(
    state: ImportJobState,
    tenantId: string,
    portfolioId: string,
    rows: ImportRow[]
  ): Promise<void> {
    state.status = "processing";
    for (const row of rows) {
      state.processed_rows += 1;
      try {
        await this.debtsService.create(tenantId, {
          portfolio_id: portfolioId,
          external_ref: row.external_ref,
          amount: row.amount,
          currency: row.currency,
          due_date: row.due_date,
          scheduled_collection_date: row.scheduled_collection_date,
          payment_terms_days: row.payment_terms_days,
          invoice_date: row.invoice_date,
          metadata: row.metadata,
          debtor: {
            name: row.debtor_name,
            external_ref: row.external_ref,
            debtor_type:
              row.debtor_type === "company" ? "company" : "person",
            debtor_tax_id: row.debtor_tax_id,
            phones: row.debtor_phone ? [row.debtor_phone] : [],
            debtor_email: row.debtor_email,
            whatsapp_opt_in: false
          }
        });
        state.success_rows += 1;
      } catch (error) {
        state.error_rows += 1;
        state.errors.push(
          error instanceof Error ? error.message : "Error desconocido"
        );
      }
    }

    state.status = state.error_rows > 0 ? "completed" : "completed";
    await this.kafka.publish("cobrai.portfolio.imported", tenantId, {
      portfolio_id: portfolioId,
      job_id: state.job_id,
      success_rows: state.success_rows,
      error_rows: state.error_rows
    });
  }
}

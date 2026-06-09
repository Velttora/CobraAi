import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job } from "bullmq";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { DebtsService } from "../debts/debts.service";
import { KafkaService } from "../kafka/kafka.service";
import { PortfoliosService } from "../portfolios/portfolios.service";
import {
  CsvParserService,
  type ImportRow,
  type ParseResult
} from "./csv-parser.service";
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
  failure_message?: string | null;
};

type ImportQueuePayload = {
  jobId: string;
  tenantId: string;
  portfolioId: string;
  rows: ImportRow[];
};

const QUEUE_NAME = "portfolio-import";
const JOB_KEY_PREFIX = "cobrai:import-job:";
const JOB_TTL_SEC = 86_400;
const MAX_CONSECUTIVE_ROW_ERRORS = 15;

@Injectable()
export class ImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private redis: Redis | null = null;
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
    const redisUrl = this.config.get<string>("REDIS_URL")?.trim();
    if (!redisUrl) {
      this.logger.warn(
        "REDIS_URL no configurado: el progreso de importación solo vive en memoria del proceso."
      );
      return;
    }

    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const connection = { url: redisUrl };

    try {
      this.queue = new Queue(QUEUE_NAME, { connection });
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => this.processJob(job),
        { connection, concurrency: 2 }
      );
      this.worker.on("failed", (job, error) => {
        if (!job?.data?.jobId) return;
        void this.markWorkerFailure(job.data.jobId as string, error);
      });
    } catch (error) {
      this.logger.error(
        `Cola BullMQ no disponible (${String(error)}). Importación en línea con Redis.`
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.redis?.quit();
  }

  async enqueueImport(input: {
    tenantId: string;
    portfolioId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<ImportJobState> {
    await this.portfoliosService.findOne(input.tenantId, input.portfolioId);

    const { rows, warnings } = await this.parseFile(
      input.buffer,
      input.filename
    );
    const jobId = randomUUID();
    const state = this.createInitialState({
      jobId,
      tenantId: input.tenantId,
      portfolioId: input.portfolioId,
      rowCount: rows.length
    });
    // Avisos no fatales (p. ej. columnas no reconocidas) visibles en el job.
    if (warnings.length > 0) {
      state.errors = warnings.map((w) => `[Aviso] ${w}`);
    }
    await this.persistJob(state);

    const payload: ImportQueuePayload = {
      jobId,
      tenantId: input.tenantId,
      portfolioId: input.portfolioId,
      rows
    };

    if (this.queue) {
      await this.queue.add("import", payload, {
        jobId,
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false
      });
    } else {
      void this.runInline(state, input.tenantId, input.portfolioId, rows).catch(
        (error) => {
          this.logger.error(`Import inline falló (${jobId}): ${String(error)}`);
        }
      );
    }

    return state;
  }

  async getJob(jobId: string): Promise<ImportJobState | undefined> {
    const memory = this.jobs.get(jobId);
    if (memory) return memory;

    if (!this.redis) return undefined;

    try {
      const raw = await this.redis.get(this.jobKey(jobId));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as ImportJobState;
      this.jobs.set(jobId, parsed);
      return parsed;
    } catch (error) {
      this.logger.warn(`No se pudo leer job ${jobId} desde Redis: ${String(error)}`);
      return undefined;
    }
  }

  async getActiveJobForPortfolio(
    portfolioId: string
  ): Promise<ImportJobState | undefined> {
    if (this.redis) {
      try {
        const jobId = await this.redis.get(this.portfolioIndexKey(portfolioId));
        if (jobId) {
          const job = await this.getJob(jobId);
          if (job) return job;
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo leer índice de importación para ${portfolioId}: ${String(error)}`
        );
      }
    }

    for (const state of this.jobs.values()) {
      if (state.portfolio_id === portfolioId) {
        return state;
      }
    }

    return undefined;
  }

  async resolveJob(
    portfolioId: string,
    jobId: string
  ): Promise<ImportJobState | undefined> {
    const byId = await this.getJob(jobId);
    if (byId?.portfolio_id === portfolioId) {
      return byId;
    }

    const active = await this.getActiveJobForPortfolio(portfolioId);
    if (active?.job_id === jobId) {
      return active;
    }

    return active ?? byId;
  }

  private createInitialState(input: {
    jobId: string;
    tenantId: string;
    portfolioId: string;
    rowCount: number;
  }): ImportJobState {
    return {
      job_id: input.jobId,
      portfolio_id: input.portfolioId,
      tenant_id: input.tenantId,
      status: "queued",
      estimated_rows: input.rowCount,
      processed_rows: 0,
      success_rows: 0,
      error_rows: 0,
      errors: [],
      failure_message: null
    };
  }

  private jobKey(jobId: string): string {
    return `${JOB_KEY_PREFIX}${jobId}`;
  }

  private portfolioIndexKey(portfolioId: string): string {
    return `${JOB_KEY_PREFIX}portfolio:${portfolioId}`;
  }

  private async persistJob(state: ImportJobState): Promise<void> {
    this.jobs.set(state.job_id, state);
    if (!this.redis) return;

    try {
      await this.redis
        .multi()
        .set(this.jobKey(state.job_id), JSON.stringify(state), "EX", JOB_TTL_SEC)
        .set(
          this.portfolioIndexKey(state.portfolio_id),
          state.job_id,
          "EX",
          JOB_TTL_SEC
        )
        .exec();
    } catch (error) {
      this.logger.error(`No se pudo persistir job ${state.job_id}: ${String(error)}`);
    }
  }

  private isFatalImportError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    if (/Unique constraint failed|P2002/i.test(msg)) {
      return false;
    }
    return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connect E|database|prisma|Redis|UNAVAILABLE|timeout|too many connections/i.test(
      msg
    );
  }

  private async failJob(state: ImportJobState, message: string): Promise<void> {
    state.status = "failed";
    state.failure_message = message;
    const banner = `[Importación detenida] ${message}`;
    if (!state.errors.some((e) => e.startsWith("[Importación detenida]"))) {
      state.errors = [banner, ...state.errors].slice(0, 50);
    }
    await this.persistJob(state);
    this.logger.warn(`Job ${state.job_id} fallido: ${message}`);
  }

  private async markWorkerFailure(jobId: string, error: Error): Promise<void> {
    const state = (await this.getJob(jobId)) ?? this.jobs.get(jobId);
    if (!state || state.status === "completed" || state.status === "failed") {
      return;
    }
    await this.failJob(
      state,
      error.message || "El procesador de importación falló inesperadamente"
    );
  }

  private async parseFile(
    buffer: Buffer,
    filename: string
  ): Promise<ParseResult> {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".csv")) {
      try {
        return this.csvParser.parseCsv(buffer, "utf-8");
      } catch (error) {
        // Reintenta con latin1 solo si parece un problema de codificación.
        const msg = error instanceof Error ? error.message : String(error);
        if (/No se reconocieron columnas|no tiene filas/.test(msg)) {
          throw error;
        }
        return this.csvParser.parseCsv(buffer, "latin1");
      }
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      return this.xlsxParser.parse(buffer, {
        email: this.config.get<string>("IMPORT_DEFAULT_EMAIL"),
        phone: this.config.get<string>("IMPORT_DEFAULT_PHONE"),
        name: this.config.get<string>("IMPORT_DEFAULT_DEBTOR_NAME")
      });
    }
    if (lower.endsWith(".pdf")) {
      const rows = await this.pdfParser.parse(buffer, {
        email: this.config.get<string>("IMPORT_DEFAULT_EMAIL"),
        phone: this.config.get<string>("IMPORT_DEFAULT_PHONE"),
        name: this.config.get<string>("IMPORT_DEFAULT_DEBTOR_NAME")
      });
      return { rows, warnings: [] };
    }
    throw new Error("Formato no soportado. Use CSV, XLSX o PDF.");
  }

  private async processJob(job: Job<ImportQueuePayload>): Promise<void> {
    const { jobId, tenantId, portfolioId, rows } = job.data;
    let state = await this.getJob(jobId);

    if (!state) {
      state = this.createInitialState({
        jobId,
        tenantId,
        portfolioId,
        rowCount: rows.length
      });
      await this.persistJob(state);
      this.logger.warn(`Job ${jobId} rehidratado desde la cola BullMQ`);
    }

    if (state.status === "completed" || state.status === "failed") {
      this.logger.warn(`Job ${jobId} ya finalizado; se omite reproceso`);
      return;
    }

    try {
      await this.runInline(state, tenantId, portfolioId, rows);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Error desconocido en importación";
      const latest = (await this.getJob(jobId)) ?? state;
      if (latest.status !== "completed" && latest.status !== "failed") {
        await this.failJob(latest, detail);
      }
    }
  }

  private async runInline(
    state: ImportJobState,
    tenantId: string,
    portfolioId: string,
    rows: ImportRow[]
  ): Promise<void> {
    state.status = "processing";
    state.failure_message = null;
    await this.persistJob(state);

    let consecutiveRowErrors = 0;
    let stopped = false;

    for (const row of rows) {
      if (stopped) {
        break;
      }

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
            external_ref: row.debtor_tax_id?.trim() || undefined,
            debtor_type:
              row.debtor_type === "company" ? "company" : "person",
            debtor_tax_id: row.debtor_tax_id,
            phones: row.debtor_phone ? [row.debtor_phone] : [],
            debtor_email: row.debtor_email,
            whatsapp_opt_in: false
          }
        });
        state.success_rows += 1;
        consecutiveRowErrors = 0;
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Error desconocido";
        state.error_rows += 1;
        state.errors.push(`Fila ${state.processed_rows}: ${detail}`);
        consecutiveRowErrors += 1;

        if (this.isFatalImportError(error)) {
          await this.failJob(
            state,
            `Error del servicio al procesar la fila ${state.processed_rows}: ${detail}`
          );
          stopped = true;
          break;
        }

        if (
          consecutiveRowErrors >= MAX_CONSECUTIVE_ROW_ERRORS &&
          state.success_rows === 0
        ) {
          await this.failJob(
            state,
            `Se detuvo tras ${MAX_CONSECUTIVE_ROW_ERRORS} errores seguidos sin filas válidas. Revisa el formato del archivo e intenta de nuevo.`
          );
          stopped = true;
          break;
        }
      }

      if (
        state.processed_rows === 1 ||
        state.processed_rows === rows.length ||
        state.processed_rows % 3 === 0
      ) {
        await this.persistJob(state);
      }
    }

    if (stopped) {
      return;
    }

    state.status = "completed";
    state.failure_message = null;
    await this.persistJob(state);

    await this.kafka.publish("cobrai.portfolio.imported", tenantId, {
      portfolio_id: portfolioId,
      job_id: state.job_id,
      success_rows: state.success_rows,
      error_rows: state.error_rows
    });
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { isWithinHours } from "@cobrai/compliance";
import { COUNTRY_RULES } from "@cobrai/compliance";
import { WorkflowsService } from "../workflows/workflows.service";

// Widest contact window across all active countries (CO 8-18, MX 7-22, BR 7-22).
// Run every 2 h; the guard below skips cycles that fall outside every country's window.
const ACTIVE_COUNTRY_RULES = [
  COUNTRY_RULES["CO"]!,
  COUNTRY_RULES["MX"]!,
  COUNTRY_RULES["BR"]!
];

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly workflows: WorkflowsService) {}

  // Runs every 2 hours. Only proceeds when at least one active country is within
  // its contact window, preventing audit noise from blocked-outside-hours entries.
  @Cron("0 */2 * * *")
  async runScheduledCycle(): Promise<void> {
    const now = new Date();
    const anyOpen = ACTIVE_COUNTRY_RULES.some((r) =>
      isWithinHours(now, r.hours, r.timezone)
    );

    if (!anyOpen) {
      this.logger.debug("Scheduler skipped — outside contact hours for all active countries");
      return;
    }

    this.logger.log("Iniciando ciclo programado de workflows");
    const result = await this.workflows.runSchedulerCycle();
    this.logger.log(
      `Ciclo completado: processed=${result.processed} contacts=${result.contacts}`
    );
  }
}

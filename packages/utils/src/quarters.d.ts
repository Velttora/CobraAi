export type DebtStatus = "future" | "upcoming" | "new" | "analyzing" | "active" | "contacted" | "promised" | "plan" | "disputed" | "legal_risk" | "legal" | "paid_partial" | "paid_full" | "written_off";
export type AgingBucket = "future" | "upcoming" | "d0_30" | "d31_60" | "d61_90" | "d91_180" | "d180_plus";
/** Quarter de cobro en formato Q1-2026 */
export declare function getCollectionQuarter(date: Date): string;
/** Etiqueta legible: "Jul – Sep 2026" */
export declare function getQuarterLabel(quarter: string): string;
export declare function getQuarterDateRange(quarter: string): {
    start: Date;
    end: Date;
};
/** Aging bucket para deudas vencidas (daysUntil <= 0). */
export declare function getAgingBucket(dueDate: Date, today?: Date): AgingBucket;
export declare function getInitialDebtStatus(dueDate: Date, scheduledDate?: Date, today?: Date): {
    status: DebtStatus;
    agingBucket: AgingBucket;
};
export declare function isActiveDebt(status: DebtStatus): boolean;
export declare function getDaysUntilCollection(dueDate: Date, scheduledDate?: Date, today?: Date): number;
export declare function getQuarterPipelineStatus(statuses: DebtStatus[]): "active" | "upcoming" | "future";
//# sourceMappingURL=quarters.d.ts.map
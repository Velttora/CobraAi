"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCollectionQuarter = getCollectionQuarter;
exports.getQuarterLabel = getQuarterLabel;
exports.getQuarterDateRange = getQuarterDateRange;
exports.getAgingBucket = getAgingBucket;
exports.getInitialDebtStatus = getInitialDebtStatus;
exports.isActiveDebt = isActiveDebt;
exports.getDaysUntilCollection = getDaysUntilCollection;
exports.getQuarterPipelineStatus = getQuarterPipelineStatus;
function startOfDayUtc(date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}
function differenceInDays(later, earlier) {
    const ms = startOfDayUtc(later).getTime() - startOfDayUtc(earlier).getTime();
    return Math.round(ms / 86_400_000);
}
/** Quarter de cobro en formato Q1-2026 */
function getCollectionQuarter(date) {
    const month = date.getUTCMonth();
    const year = date.getUTCFullYear();
    const quarter = Math.floor(month / 3) + 1;
    return `Q${quarter}-${year}`;
}
/** Etiqueta legible: "Jul – Sep 2026" */
function getQuarterLabel(quarter) {
    const match = /^Q(\d)-(\d{4})$/.exec(quarter);
    if (!match?.[1] || !match[2])
        return quarter;
    const labels = ["Ene – Mar", "Abr – Jun", "Jul – Sep", "Oct – Dic"];
    const idx = Number(match[1]) - 1;
    return `${labels[idx] ?? quarter} ${match[2]}`;
}
function getQuarterDateRange(quarter) {
    const match = /^Q(\d)-(\d{4})$/.exec(quarter);
    if (!match?.[1] || !match[2]) {
        throw new Error(`Quarter inválido: ${quarter}`);
    }
    const q = Number(match[1]);
    const year = Number(match[2]);
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    return { start, end };
}
/** Aging bucket para deudas vencidas (daysUntil <= 0). */
function getAgingBucket(dueDate, today = new Date()) {
    const overdueDays = differenceInDays(startOfDayUtc(today), startOfDayUtc(dueDate));
    if (overdueDays <= 0)
        return "d0_30";
    if (overdueDays <= 30)
        return "d0_30";
    if (overdueDays <= 60)
        return "d31_60";
    if (overdueDays <= 90)
        return "d61_90";
    if (overdueDays <= 180)
        return "d91_180";
    return "d180_plus";
}
function getInitialDebtStatus(dueDate, scheduledDate, today = new Date()) {
    const collectionDate = startOfDayUtc(scheduledDate ?? dueDate);
    const daysUntil = differenceInDays(collectionDate, startOfDayUtc(today));
    if (daysUntil > 30) {
        return { status: "future", agingBucket: "future" };
    }
    if (daysUntil > 0) {
        return { status: "upcoming", agingBucket: "upcoming" };
    }
    if (daysUntil === 0) {
        return { status: "new", agingBucket: "d0_30" };
    }
    const agingBucket = getAgingBucket(dueDate, today);
    const overdueFromDue = differenceInDays(startOfDayUtc(today), startOfDayUtc(dueDate));
    const status = overdueFromDue <= 30 ? "new" : "active";
    return { status, agingBucket };
}
function isActiveDebt(status) {
    return !(status === "future" ||
        status === "upcoming" ||
        status === "paid_full" ||
        status === "paid_partial" ||
        status === "written_off");
}
function getDaysUntilCollection(dueDate, scheduledDate, today = new Date()) {
    const collectionDate = startOfDayUtc(scheduledDate ?? dueDate);
    return differenceInDays(collectionDate, startOfDayUtc(today));
}
function getQuarterPipelineStatus(statuses) {
    const hasCollectable = statuses.some((s) => s !== "future" &&
        s !== "upcoming" &&
        s !== "paid_full" &&
        s !== "paid_partial" &&
        s !== "written_off");
    if (hasCollectable)
        return "active";
    if (statuses.some((s) => s === "upcoming"))
        return "upcoming";
    return "future";
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCurrency = formatCurrency;
const DEFAULT_LOCALE = "es-CO";
/**
 * Formatea montos en moneda LATAM (por defecto COP).
 */
function formatCurrency(amount, currency = "COP", locale = DEFAULT_LOCALE) {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "COP" ? 0 : 2
    }).format(amount);
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhoneE164 = normalizePhoneE164;
/**
 * Normaliza teléfono LATAM a E.164 básico (Colombia +57 por defecto).
 */
function normalizePhoneE164(phone, defaultCountryCode = "57") {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
        return null;
    }
    if (digits.startsWith(defaultCountryCode)) {
        return `+${digits}`;
    }
    if (digits.length === 10) {
        return `+${defaultCountryCode}${digits}`;
    }
    return digits.startsWith("+") ? phone : `+${digits}`;
}

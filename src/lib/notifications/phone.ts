/** Converts common Indonesian WhatsApp number formats to the international form providers expect. */
export function toIndonesianWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
  return /^62\d{8,13}$/.test(normalized) ? normalized : null;
}

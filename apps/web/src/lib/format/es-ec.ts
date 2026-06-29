export const ecCurrency = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export const ecDate = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

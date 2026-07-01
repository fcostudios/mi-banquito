import type {
  BorrowerKind,
  EligibilityResult,
} from "./types";

function money4(value: number): string {
  return value.toFixed(4);
}

function parseDecimal4Number(value: string): number {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error("decimal value must be a non-negative decimal with up to 4 places");
  }
  return Number(value);
}

function parseMoney4(value: string): bigint {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) {
    throw new Error("money value must be a non-negative decimal with up to 4 places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
}

function formatMoney2(value: bigint): string {
  const cents = (value + BigInt(50)) / BigInt(100);
  const whole = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}

function parseRatio2(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error("ratio value must be a non-negative decimal with up to 2 places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function resolveOriginationRate(
  config: { memberLoanRateValue: string; nonMemberLoanRateValue: string },
  borrowerKind: BorrowerKind,
): string {
  return borrowerKind === "member"
    ? money4(parseDecimal4Number(config.memberLoanRateValue))
    : money4(parseDecimal4Number(config.nonMemberLoanRateValue));
}

export function evaluateLoanEligibility(input: {
  requestedPrincipal: string;
  availableCapital: string;
  borrowerSavingsBalance: string;
  loanToSavingsCapRatio: string;
  borrowerKind: BorrowerKind;
  guarantorSavingsBalance?: string;
}): EligibilityResult {
  const requestedPrincipal = parseMoney4(input.requestedPrincipal);
  const availableCapital = parseMoney4(input.availableCapital);
  const capRatio = parseRatio2(input.loanToSavingsCapRatio);
  const savingsBasis = input.borrowerKind === "member"
    ? parseMoney4(input.borrowerSavingsBalance)
    : parseMoney4(input.guarantorSavingsBalance ?? "0.0000");

  if (requestedPrincipal > availableCapital) {
    const reason = availableCapital === BigInt(0)
      ? "Todavía no hay aportes registrados en el fondo del grupo. Registra un aporte antes de crear un préstamo."
      : `El fondo del grupo tiene $${formatMoney2(availableCapital)} disponible. Baja el monto o registra más aportes antes de crear este préstamo.`;

    return {
      ok: false,
      reason,
    };
  }

  if (input.borrowerKind === "non_member" && !input.guarantorSavingsBalance) {
    return {
      ok: false,
      reason: "Selecciona una socia garante activa antes de registrar este préstamo.",
    };
  }

  if (requestedPrincipal > (savingsBasis * capRatio) / BigInt(100)) {
    return {
      ok: false,
      reason: "El monto es mayor al límite permitido según los ahorros de la socia o garante.",
    };
  }

  return { ok: true };
}

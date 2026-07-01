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
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
}

function parseRatio2(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error("ratio value must be a non-negative decimal with up to 2 places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
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
    return {
      ok: false,
      reason: "No hay suficiente capital disponible sin tocar la cuota base protegida.",
    };
  }

  if (input.borrowerKind === "non_member" && !input.guarantorSavingsBalance) {
    return {
      ok: false,
      reason: "Selecciona una socia garante activa antes de originar este préstamo.",
    };
  }

  if (requestedPrincipal > (savingsBasis * capRatio) / 100n) {
    return {
      ok: false,
      reason: "El monto supera el límite de préstamo permitido por los ahorros disponibles.",
    };
  }

  return { ok: true };
}

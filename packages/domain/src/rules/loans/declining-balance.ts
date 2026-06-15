export interface DecliningBalanceInput {
  principal: number;
  ratePerPeriod: number;
  termPeriods: number;
  adminFeeRate?: number;
}

export interface DecliningBalanceInstallment {
  periodIndex: number;
  principalDue: string;
  interestDue: string;
  feeDue: string;
  installmentTotal: string;
}

export interface DecliningBalanceSchedule {
  installments: DecliningBalanceInstallment[];
  totals: {
    principalDue: string;
    interestDue: string;
    feeDue: string;
    installmentTotal: string;
  };
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function splitPrincipal(principalCents: number, termPeriods: number): number[] {
  const base = Math.floor(principalCents / termPeriods);
  const remainder = principalCents - base * termPeriods;

  return Array.from({ length: termPeriods }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

export function generateDecliningBalanceSchedule(
  input: DecliningBalanceInput,
): DecliningBalanceSchedule {
  if (input.principal <= 0) {
    throw new Error("principal must be greater than zero");
  }
  if (!Number.isInteger(input.termPeriods) || input.termPeriods <= 0) {
    throw new Error("termPeriods must be a positive integer");
  }
  if (input.ratePerPeriod < 0) {
    throw new Error("ratePerPeriod must be zero or greater");
  }
  if ((input.adminFeeRate ?? 0) < 0) {
    throw new Error("adminFeeRate must be zero or greater");
  }

  const principalCents = toCents(input.principal);
  const principalParts = splitPrincipal(principalCents, input.termPeriods);
  const adminFeeCents = toCents(input.principal * (input.adminFeeRate ?? 0));
  let remainingPrincipalCents = principalCents;

  const installments = principalParts.map((principalDueCents, index) => {
    const interestDueCents = Math.round(
      remainingPrincipalCents * input.ratePerPeriod,
    );
    const feeDueCents = index === 0 ? adminFeeCents : 0;
    remainingPrincipalCents -= principalDueCents;

    return {
      periodIndex: index + 1,
      principalDue: money(principalDueCents),
      interestDue: money(interestDueCents),
      feeDue: money(feeDueCents),
      installmentTotal: money(principalDueCents + interestDueCents + feeDueCents),
    };
  });

  const totalCents = installments.reduce(
    (acc, row) => ({
      principalDue: acc.principalDue + toCents(Number(row.principalDue)),
      interestDue: acc.interestDue + toCents(Number(row.interestDue)),
      feeDue: acc.feeDue + toCents(Number(row.feeDue)),
      installmentTotal: acc.installmentTotal + toCents(Number(row.installmentTotal)),
    }),
    { principalDue: 0, interestDue: 0, feeDue: 0, installmentTotal: 0 },
  );

  return {
    installments,
    totals: {
      principalDue: money(totalCents.principalDue),
      interestDue: money(totalCents.interestDue),
      feeDue: money(totalCents.feeDue),
      installmentTotal: money(totalCents.installmentTotal),
    },
  };
}

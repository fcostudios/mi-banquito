import React from "react";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { MonthlyCloseArtifactInput, MonthlyCloseArtifactResult } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";
import { writePrivateStatementArtifact } from "./statement-artifact";

const copy = messages.monthlyClose;

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#111827",
  },
  title: {
    fontSize: 20,
    marginBottom: 8,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 11,
    color: "#374151",
    marginBottom: 20,
  },
  section: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  label: {
    width: 150,
    color: "#4B5563",
  },
  value: {
    flex: 1,
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#6B7280",
  },
});

function valueText(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function payloadRows(payload: MonthlyCloseArtifactInput["payload"]) {
  return Object.entries(payload)
    .filter(([key]) => key !== "orgId" && key !== "movementSummary")
    .map(([key, value]) => ({ key, value: valueText(value) }));
}

type MonthlyCloseMovementSummary = {
  bankFees: string;
  supplies: string;
  sharedExpenses: string;
  operatingExpenses: string;
  transfers: string;
  netFundBalance: string;
  pendingRegularizations: number;
  pendingAssertion: string;
};

function usd(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) throw new Error("amount_must_be_numeric");
  const units = BigInt(match[2] ?? "0") * BigInt(10_000) + BigInt((match[3] ?? "").padEnd(4, "0") || "0");
  const roundedCents = (units + BigInt(50)) / BigInt(100);
  const whole = (roundedCents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `USD ${match[1] === "-" ? "-" : ""}${whole}.${String(roundedCents % BigInt(100)).padStart(2, "0")}`;
}

export function monthlyCloseMovementRows(summary: MonthlyCloseMovementSummary) {
  return [
    { label: copy.pdfBankFees, value: usd(summary.bankFees) },
    { label: copy.pdfSupplies, value: usd(summary.supplies) },
    { label: copy.pdfSharedExpenses, value: usd(summary.sharedExpenses) },
    { label: copy.pdfOperatingExpenses, value: usd(summary.operatingExpenses) },
    { label: copy.pdfTransfers, value: usd(summary.transfers) },
    { label: copy.pdfNetFundBalance, value: usd(summary.netFundBalance) },
    { label: copy.pdfRegularization, value: summary.pendingAssertion },
  ];
}

function MonthlyCloseDocument({ input }: { input: MonthlyCloseArtifactInput }) {
  const rows = payloadRows(input.payload);
  const movementRows = monthlyCloseMovementRows(input.payload.movementSummary as MonthlyCloseMovementSummary);

  return (
    <Document title={`Cierre ${input.periodLabel}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{copy.pdfTitle}</Text>
        <Text style={styles.subtitle}>Mi Banquito · {input.periodLabel}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.pdfSummary}</Text>
          {rows.map((row) => (
            <View key={row.key} style={styles.row}>
              <Text style={styles.label}>{row.key}</Text>
              <Text style={styles.value}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.pdfMovements}</Text>
          {movementRows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{copy.pdfEvidence}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{copy.pdfCanonicalHash}</Text>
            <Text style={styles.value}>{input.canonicalPayloadHash}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{copy.pdfOrganization}</Text>
            <Text style={styles.value}>{input.orgId}</Text>
          </View>
        </View>

        <Text style={styles.footer}>{copy.pdfFooter}</Text>
      </Page>
    </Document>
  );
}

export async function uploadMonthlyCloseArtifact(input: MonthlyCloseArtifactInput): Promise<MonthlyCloseArtifactResult> {
  const blob = await pdf(<MonthlyCloseDocument input={input} />).toBlob();
  const artifact = await writePrivateStatementArtifact({
    folder: "monthly-close",
    orgId: input.orgId,
    canonicalPayloadHash: input.canonicalPayloadHash,
    pdfBytes: blob,
  });

  return {
    pdfUri: artifact.pdfUri,
    byteSize: artifact.byteSize,
  };
}

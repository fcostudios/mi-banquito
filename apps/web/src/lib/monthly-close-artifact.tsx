import React from "react";
import { put } from "@vercel/blob";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { MonthlyCloseArtifactInput, MonthlyCloseArtifactResult } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";

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
    .filter(([key]) => key !== "orgId")
    .map(([key, value]) => ({ key, value: valueText(value) }));
}

function MonthlyCloseDocument({ input }: { input: MonthlyCloseArtifactInput }) {
  const rows = payloadRows(input.payload);

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
  const pathname = `monthly-close/${input.orgId}/${input.canonicalPayloadHash}.pdf`;
  await put(pathname, blob, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/pdf",
  });

  return {
    pdfUri: `/statement-archive/monthly-close/${input.canonicalPayloadHash}.pdf`,
    byteSize: blob.size,
  };
}

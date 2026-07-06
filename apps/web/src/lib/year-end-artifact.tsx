import React from "react";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { ShareOutArtifactInput, ShareOutArtifactResult } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";
import { writePrivateStatementArtifact } from "./statement-artifact";

const copy = messages.statementPdf;

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
    marginBottom: 18,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 5,
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

const titleByKind = {
  year_end_member: copy.yearEndMemberTitle,
  year_end_share_out: copy.yearEndShareOutTitle,
  year_end_snapshot: copy.yearEndSnapshotTitle,
};

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function YearEndDocument({ input }: { input: ShareOutArtifactInput }) {
  return (
    <Document title={`${titleByKind[input.kind]} ${input.periodLabel}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{titleByKind[input.kind]}</Text>
        <Text style={styles.subtitle}>{copy.appName} · {input.periodLabel}</Text>
        {Object.entries(input.payload).map(([key, value]) => (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{key}</Text>
            <Text style={styles.value}>{valueText(value)}</Text>
          </View>
        ))}
        <Text style={styles.footer}>{copy.hash}: {input.canonicalPayloadHash}</Text>
      </Page>
    </Document>
  );
}

export async function uploadYearEndArtifact(input: ShareOutArtifactInput): Promise<ShareOutArtifactResult> {
  const blob = await pdf(<YearEndDocument input={input} />).toBlob();
  const artifact = await writePrivateStatementArtifact({
    folder: "year-end",
    orgId: input.orgId,
    canonicalPayloadHash: input.canonicalPayloadHash,
    pdfBytes: blob,
  });

  return {
    pdfUri: artifact.pdfUri,
    byteSize: artifact.byteSize,
  };
}

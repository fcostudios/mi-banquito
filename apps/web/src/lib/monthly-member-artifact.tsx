import React from "react";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { MonthlyMemberStatementArtifactInput, MonthlyMemberStatementArtifactResult } from "@mi-banquito/domain";

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
    marginBottom: 5,
  },
  label: {
    width: 170,
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

function MonthlyMemberDocument({ input }: { input: MonthlyMemberStatementArtifactInput }) {
  return (
    <Document title={`Estado ${input.periodLabel} ${input.memberName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{copy.monthlyMemberTitle}</Text>
        <Text style={styles.subtitle}>{input.payload.orgName} · {input.periodLabel} · {input.memberName}</Text>

        {input.payload.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.map((row) => (
              <View key={`${row.label}-${row.value}`} style={styles.row}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>{copy.hash}: {input.canonicalPayloadHash}</Text>
      </Page>
    </Document>
  );
}

export async function uploadMonthlyMemberArtifact(input: MonthlyMemberStatementArtifactInput): Promise<MonthlyMemberStatementArtifactResult> {
  const blob = await pdf(<MonthlyMemberDocument input={input} />).toBlob();
  const artifact = await writePrivateStatementArtifact({
    folder: "monthly-member",
    orgId: input.orgId,
    canonicalPayloadHash: input.canonicalPayloadHash,
    pdfBytes: blob,
  });

  return {
    pdfUri: artifact.pdfUri,
    byteSize: artifact.byteSize,
  };
}

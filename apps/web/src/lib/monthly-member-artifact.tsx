import React from "react";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { money, type MonthlyMemberStatementArtifactInput, type MonthlyMemberStatementArtifactResult } from "@mi-banquito/domain";

import messages from "@/lib/i18n/en-US.json";
import { writePrivateStatementArtifact } from "./statement-artifact";
import { deletePrivateBlob } from "./vercel-blob-adapter";

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
  detail: {
    flex: 1,
    color: "#4B5563",
    marginTop: 2,
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

export type MonthlyMemberPdfRow = {
  sectionId: string;
  sectionTitle: string;
  sourceId?: string;
  label: string;
  value: string;
  details: string[];
};

export function monthlyMemberPdfRows(input: MonthlyMemberStatementArtifactInput): MonthlyMemberPdfRow[] {
  const statementRows = input.payload.sections
    .filter((section) => section.id !== "fund-movements")
    .flatMap((section) => section.rows.map((row) => ({
    sectionId: section.id,
    sectionTitle: section.title,
    label: row.label,
    value: "value" in row ? row.value : row.amount,
    details: "details" in row ? row.details : [],
  })));
  const movementSection = input.payload.sections.find((section) => section.id === "fund-movements");
  return [
    ...statementRows,
    ...input.payload.verificationMovements.map((movement) => ({
      sectionId: "fund-movements",
      sectionTitle: movementSection?.title ?? copy.monthlyMember.fundMovementsTitle,
      sourceId: movement.sourceId,
      label: movement.reversesId ? `Reverso · ${movement.label}` : movement.label,
      value: money(movement.signedAmount),
      details: [
        `${messages.statementArchive.movementDate}: ${movement.datedOn}`,
        `${messages.statementArchive.movementSource}: ${movement.sourceKind} · ${movement.sourceId}`,
        `${messages.statementArchive.movementCategory}: ${movement.category}`,
        `${messages.statementArchive.movementAccount}: ${movement.accountName ?? messages.statementArchive.noAccount}`,
        `${messages.statementArchive.movementStatus}: ${movement.reconciliationStatus ?? messages.statementArchive.reconciled}`,
        ...(movement.reversesId
          ? [`${messages.statementArchive.movementReversal}: ${movement.reversesId}`]
          : []),
      ],
    })),
  ];
}

export function MonthlyMemberDocument({ input }: { input: MonthlyMemberStatementArtifactInput }) {
  const rows = monthlyMemberPdfRows(input);
  return (
    <Document title={`Estado ${input.periodLabel} ${input.memberName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{copy.monthlyMemberTitle}</Text>
        <Text style={styles.subtitle}>{input.payload.orgName} · {input.periodLabel} · {input.memberName}</Text>

        {input.payload.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {rows.filter((row) => row.sectionId === section.id).map((row) => (
              <View key={`${row.sourceId ?? row.label}-${row.value}`} style={styles.row}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.value}>
                  {row.value}
                  {row.details.map((detail) => (
                    <Text key={detail} style={styles.detail}>{"\n"}{detail}</Text>
                  ))}
                </Text>
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
    storageUri: artifact.blobUrl,
  };
}

export async function deleteMonthlyMemberArtifact(artifact: MonthlyMemberStatementArtifactResult): Promise<void> {
  if (!artifact.storageUri) throw new Error("statement_artifact_storage_uri_missing");
  await deletePrivateBlob(artifact.storageUri);
}

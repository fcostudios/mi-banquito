import { NextResponse } from "next/server";

export function redirectToTenantExportDownload(input: {
  requestUrl: string;
  orgId: string;
  exportId: string;
}) {
  const downloadUrl = new URL(
    `/admin/orgs/${input.orgId}/export/${input.exportId}`,
    input.requestUrl,
  );
  return NextResponse.redirect(downloadUrl, 303);
}

export async function redirectToGeneratedExportDownload(input: {
  requestUrl: string;
  orgId: string;
  exportId: string;
  stream: ReadableStream<Uint8Array>;
  completion: Promise<unknown>;
}) {
  await input.stream.cancel("handoff_to_durable_blob_download");
  await input.completion;
  return redirectToTenantExportDownload(input);
}

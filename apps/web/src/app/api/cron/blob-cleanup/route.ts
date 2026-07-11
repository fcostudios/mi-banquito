import { createBlobCleanupService } from "@mi-banquito/domain";
import { deletePrivateBlob, listPrivateBlobs } from "@/lib/vercel-blob-adapter";
import { createBlobCleanupHandler } from "./handler";

export const runtime = "nodejs";

export const GET = createBlobCleanupHandler({
  runCleanup: () => createBlobCleanupService({
    deleteBlob: deletePrivateBlob,
    listBlobs: listPrivateBlobs,
  }).run(),
});

import { repairPendingMonthlyCloseArtifacts } from "@mi-banquito/domain";

import { uploadMonthlyCloseArtifact } from "@/lib/monthly-close-artifact";
import { createCloseArtifactRepairHandler } from "./handler";

export const runtime = "nodejs";

export const GET = createCloseArtifactRepairHandler({
  runRepair: () => repairPendingMonthlyCloseArtifacts({ writer: uploadMonthlyCloseArtifact }),
});

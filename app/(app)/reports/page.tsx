import { ChartColumnIcon } from "lucide-react";

import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { ComingSoon } from "@/app/(app)/coming-soon";

export default async function ReportsPage() {
  // Owner only, and strict — staff are redirected to the dashboard. The nav
  // hides this item from them as well, but that is convenience, not the guard:
  // this call is what makes the route owner-only.
  await requireRole(Role.OWNER);

  return (
    <ComingSoon
      title="Reports"
      icon={<ChartColumnIcon />}
      description="Movement history and sales summaries land here. Owner only."
    />
  );
}

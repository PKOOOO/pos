import { ArrowDownUpIcon } from "lucide-react";

import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { ComingSoon } from "@/app/(app)/coming-soon";

export default async function StockPage() {
  await requireRole(Role.STAFF);

  return (
    <ComingSoon
      title="Stock"
      icon={<ArrowDownUpIcon />}
      description="Logging stock in and out — with who logged it and when — lands here next. Until then, a product's opening count is set when it's added."
    />
  );
}

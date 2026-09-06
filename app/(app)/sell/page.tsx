import { ShoppingCartIcon } from "lucide-react";

import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";
import { ComingSoon } from "@/app/(app)/coming-soon";

export default async function SellPage() {
  await requireRole(Role.STAFF);

  return (
    <ComingSoon
      title="Sell"
      icon={<ShoppingCartIcon />}
      description="Building a cart, taking the customer's phone number, and the M-Pesa prompt all land here later."
    />
  );
}

import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

import { Badge } from "@/components/ui/badge";
import { Role } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { BottomNav, SidebarNav } from "@/app/(app)/app-nav";

/**
 * Shell for every signed-in page. `(app)` is a route group, so it adds no path
 * segment — /dashboard and /products keep their URLs.
 *
 * This layout's `getCurrentUser()` is not the authorization boundary for the
 * pages inside it: layouts don't re-run on every navigation between their own
 * routes, and a Server Function POSTs to its own route regardless. Each page and
 * action still calls requireRole() itself.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const isOwner = user.role === Role.OWNER;

  return (
    <div className="flex min-h-full flex-1">
      <SidebarNav isOwner={isOwner} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background px-4">
          <span className="text-lg font-semibold tracking-tight md:hidden">
            Salon Stock
          </span>

          <div className="flex items-center gap-3 md:ml-auto">
            <div className="flex flex-col items-end gap-0.5">
              <span className="max-w-40 truncate text-sm font-medium sm:max-w-none">
                {user.name}
              </span>
              <Badge variant={isOwner ? "default" : "secondary"}>
                {isOwner ? "Owner" : "Staff"}
              </Badge>
            </div>
            <UserButton appearance={clerkAppearance} />
          </div>
        </header>

        {/* Bottom padding clears the fixed tab bar on phones. */}
        <div className="flex flex-1 flex-col pb-20 md:pb-0">{children}</div>
      </div>

      <BottomNav isOwner={isOwner} />
    </div>
  );
}

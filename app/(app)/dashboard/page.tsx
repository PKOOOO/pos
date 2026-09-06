import { Role } from "@/generated/prisma/client";
import { requireRole } from "@/lib/auth";

export default async function DashboardPage() {
  // The proxy already bounced signed-out visitors and the shell looked the user
  // up, but neither is the guard for this route — this call is.
  const user = await requireRole(Role.STAFF);

  const firstName = user.name.split(" ")[0];

  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Hi {firstName}
      </h1>

      <p className="text-sm text-muted-foreground">
        Products are ready to use. Stock logging, checkout
        {user.role === Role.OWNER ? ", and reports" : ""} come next — use the
        menu to move around.
      </p>
    </main>
  );
}

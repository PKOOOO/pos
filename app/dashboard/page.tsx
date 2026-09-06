import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

import { getCurrentUser } from "@/lib/auth";

// Placeholder shell. Staff work this on a phone at the counter, so it is
// single-column and touch-sized by default.
export default async function DashboardPage() {
  // The proxy already bounced signed-out visitors; this is the real check.
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Signed in as</p>
          <h1 className="text-xl font-semibold tracking-tight">{user.name}</h1>
        </div>
        <UserButton />
      </header>

      <dl className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
        <dt className="text-sm text-zinc-500 dark:text-zinc-400">Role</dt>
        <dd className="text-lg font-medium">{user.role}</dd>
      </dl>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Products, stock logging, and checkout land here next.
      </p>
    </main>
  );
}

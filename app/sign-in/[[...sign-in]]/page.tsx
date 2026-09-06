import { SignIn } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/clerk-appearance";

// Optional catch-all so Clerk can mount its own sub-routes (factor-one,
// sso-callback, …) under /sign-in. Clerk's component does the work — the
// `appearance` prop is the only thing we own here.
export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-sidebar p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Salon Stock</h1>
        <p className="text-sm text-muted-foreground">
          Inventory and checkout for the shop floor
        </p>
      </div>

      <SignIn appearance={clerkAppearance} />
    </main>
  );
}

import { SignUp } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-sidebar p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Salon Stock</h1>
        <p className="text-sm text-muted-foreground">
          Inventory and checkout for the shop floor
        </p>
      </div>

      <SignUp appearance={clerkAppearance} />
    </main>
  );
}

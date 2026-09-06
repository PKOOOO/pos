import { SignIn } from "@clerk/nextjs";

// Optional catch-all so Clerk can mount its own sub-routes (factor-one,
// sso-callback, …) under /sign-in.
export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <SignIn />
    </main>
  );
}

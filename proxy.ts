import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 renamed the `middleware` file convention to `proxy` — `middleware.ts`
// still runs but warns at build time. Proxy always runs on the Node.js runtime.

// Paths that must stay reachable while signed out. Clerk mounts its own
// sub-routes (factor-one, sso-callback, …) beneath these, so match by prefix.
const PUBLIC_PREFIXES = ["/sign-in", "/sign-up"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// This is an *optimistic* gate: it reads the session cookie to bounce signed-out
// visitors early, and nothing more. It is not the authorization boundary —
// Server Functions are dispatched as POSTs to the route that declares them, so a
// matcher change can silently drop proxy coverage. Every page and route handler
// that touches real data re-checks via getCurrentUser()/requireRole() in lib/auth.ts.
export default clerkMiddleware(async (auth, request) => {
  if (isPublic(request.nextUrl.pathname)) return;

  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
});

export const config = {
  // Runs on everything except Next internals, static assets, and webhooks.
  //
  // `/api/webhooks/*` MUST stay excluded. Clerk delivers those requests with a
  // Svix signature and no session cookie, so the gate above would redirect or
  // 401 them before verifyWebhook() ever runs — and Clerk retries every non-2xx,
  // so the failure repeats indefinitely.
  matcher: [
    "/((?!_next/static|_next/image|api/webhooks|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|map)$).*)",
  ],
};

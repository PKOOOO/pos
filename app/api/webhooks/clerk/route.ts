import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { UserJSON } from "@clerk/nextjs/server";

import { resolveName, syncUser } from "@/lib/auth";

// Excluded from the proxy matcher (see proxy.ts) — Clerk signs these requests
// with Svix and sends no session cookie, so an auth gate here would 401 every
// delivery. Authenticity comes from verifyWebhook(), not from the session.

function nameFromWebhook(data: UserJSON): string {
  const primaryEmail =
    data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
      ?.email_address ?? data.email_addresses?.[0]?.email_address;

  return resolveName({
    firstName: data.first_name,
    lastName: data.last_name,
    username: data.username,
    email: primaryEmail,
  });
}

export async function POST(request: NextRequest) {
  let event;

  try {
    // Reads CLERK_WEBHOOK_SIGNING_SECRET from the environment.
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("[clerk-webhook] signature verification failed:", error);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 },
    );
  }

  // Clerk retries on any non-2xx, so every branch below must be safe to run
  // twice: the upsert is idempotent and the delete branch does nothing.
  try {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        await syncUser(event.data.id, nameFromWebhook(event.data));
        break;
      }

      case "user.deleted": {
        // Deliberately a no-op. StockMovement.staffId and Sale.staffId are
        // `onDelete: Restrict`, so deleting the row would either fail or orphan
        // stock and sales history. Revisit with a deactivation flag if the
        // client needs departed staff hidden from the UI.
        console.warn(
          `[clerk-webhook] user.deleted for clerkId=${event.data.id} — ignored; ` +
            "User rows are retained to preserve stock and sales history.",
        );
        break;
      }

      default:
        // Ack unhandled event types so Clerk stops retrying them.
        break;
    }
  } catch (error) {
    // 500 on purpose: the signature was valid, so this is our side failing
    // (a Neon cold start, say). Clerk's retry is what we want, and replaying
    // the event is harmless.
    console.error(`[clerk-webhook] failed to handle ${event.type}:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

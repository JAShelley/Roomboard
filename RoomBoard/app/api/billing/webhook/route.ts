import type Stripe from "stripe";
import { getStripe, getWebhookSecret, syncSubscriptionToPractice } from "../_stripe";

// Webhooks need the raw request body for signature verification, so force the
// Node runtime and disable any caching/static optimization.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, getWebhookSecret());
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid signature";
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  try {
    const stripe = getStripe();
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscriptionToPractice(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        await syncSubscriptionToPractice(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        // Ignore other event types — we only care about subscription lifecycle.
        break;
    }
  } catch (error) {
    // Log and return 500 so Stripe retries, but never leak details.
    console.error("billing webhook handler error:", error);
    return new Response("Webhook handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

import Stripe from "stripe";
import {
  getPracticeBilling,
  getServiceClient,
  planForPriceId,
  requireEnv,
} from "./_lib";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!stripeClient) {
    // apiVersion intentionally omitted so the SDK's pinned default is used.
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  }
  return stripeClient;
}

export function getWebhookSecret() {
  return requireEnv("STRIPE_WEBHOOK_SECRET");
}

// Ensure the practice has a Stripe customer; create + persist if missing.
export async function ensureStripeCustomer(practiceId: string, email: string): Promise<string> {
  const billing = await getPracticeBilling(practiceId);
  if (billing.stripeCustomerId) return billing.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { practice_id: practiceId },
  });

  const service = getServiceClient();
  // Cast to bypass untyped-client `never` inference on new billing columns.
  const tbl = service.from("practices") as ReturnType<typeof service.from>;
  const res = await (tbl.update as (v: Record<string, unknown>) => typeof tbl)(
    { stripe_customer_id: customer.id },
  ).eq("id", practiceId);
  if (res.error) throw new Error(res.error.message);
  return customer.id;
}

// Write the latest subscription state from Stripe back onto the practice.
export async function syncSubscriptionToPractice(subscription: Stripe.Subscription) {
  const service = getServiceClient();
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const periodEndUnix = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const update: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    plan: planForPriceId(priceId),
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
  };

  // Prefer matching by customer id; fall back to the practice_id we stamp
  // into customer/subscription metadata at checkout time.
  const fallbackPracticeId = String(subscription.metadata?.practice_id || "").trim();

  const patch = (tbl: ReturnType<typeof service.from>, payload: Record<string, unknown>) =>
    (tbl.update as (v: Record<string, unknown>) => typeof tbl)(payload);

  if (customerId) {
    const byCustomer = await patch(service.from("practices"), update)
      .eq("stripe_customer_id", customerId)
      .select("id");
    if (byCustomer.error) throw new Error(byCustomer.error.message);
    if (Array.isArray(byCustomer.data) && byCustomer.data.length > 0) return;
  }
  if (fallbackPracticeId) {
    const byId = await patch(service.from("practices"), {
      ...update,
      stripe_customer_id: customerId || undefined,
    }).eq("id", fallbackPracticeId);
    if (byId.error) throw new Error(byId.error.message);
  }
}

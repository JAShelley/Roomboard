import {
  priceIdForPlan,
  resolveSessionContext,
  getPracticeBilling,
} from "../_lib";
import { ensureStripeCustomer, getStripe } from "../_stripe";
import { optionsResponse, pulseJson, pulseError } from "../../pulse/_lib";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await resolveSessionContext({
      accessToken: body?.accessToken,
      refreshToken: body?.refreshToken,
    });

    const priceId = priceIdForPlan(String(body?.plan || "monthly"));
    const customerId = await ensureStripeCustomer(ctx.practiceId, ctx.email);
    const billing = await getPracticeBilling(ctx.practiceId);

    // If they still have free-trial days left, carry them into Stripe so an
    // early upgrade doesn't charge before the trial would have ended.
    const trialEndMs = billing.trialEndsAt ? Date.parse(billing.trialEndsAt) : 0;
    const trialEndUnix = Math.floor(trialEndMs / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);
    const hasRemainingTrial =
      billing.subscriptionStatus === "trialing" && trialEndUnix > nowUnix + 60;

    const origin = originFromRequest(request, body?.returnUrl);

    const stripe = getStripe();
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { practice_id: ctx.practiceId },
        ...(hasRemainingTrial ? { trial_end: trialEndUnix } : {}),
      },
      success_url: `${origin}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}?billing=cancel`,
    });

    return pulseJson({ url: checkout.url });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || "Could not start checkout.");
    const status = /login required|expired|sign in/i.test(message) ? 401 : 400;
    return pulseError(message, status);
  }
}

function originFromRequest(request: Request, returnUrl?: string): string {
  const candidate = String(returnUrl || "").trim();
  if (candidate) return candidate.replace(/\/+$/, "");
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://app.roomboard.local";
  }
}

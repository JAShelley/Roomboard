import { resolveSessionContext, getPracticeBilling, computeAccess } from "../_lib";
import { optionsResponse, pulseJson, pulseError } from "../../pulse/_lib";

export async function OPTIONS() {
  return optionsResponse();
}

// Lightweight endpoint the client calls after login to decide whether to show
// the board or the subscribe wall.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ctx = await resolveSessionContext({
      accessToken: body?.accessToken,
      refreshToken: body?.refreshToken,
    });

    const billing = await getPracticeBilling(ctx.practiceId);
    const access = computeAccess(billing);

    return pulseJson({
      practiceId: billing.practiceId,
      status: billing.subscriptionStatus,
      plan: billing.plan,
      hasAccess: access.hasAccess,
      trialing: access.trialing,
      subscribed: access.subscribed,
      trialDaysLeft: access.trialDaysLeft,
      trialEndsAt: billing.trialEndsAt,
      currentPeriodEnd: billing.currentPeriodEnd,
      hasCustomer: !!billing.stripeCustomerId,
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || "Could not load billing status.");
    const status = /login required|expired|sign in/i.test(message) ? 401 : 400;
    return pulseError(message, status);
  }
}

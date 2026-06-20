import { createClient } from "@supabase/supabase-js";
import { resolvePulseSession, getPracticeIdForUser } from "../pulse/_lib";

export const TRIAL_DAYS = 14;

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// plan name <-> Stripe price id ------------------------------------------
// Plans: "base-monthly" | "base-annual" | "advanced-monthly" | "advanced-annual"
export function priceIdForPlan(plan: string): string {
  const p = String(plan || "").toLowerCase().replace(/\s+/g, "-");
  if (p === "advanced-annual"  || p === "advanced-yearly") return requireEnv("STRIPE_PRICE_ADVANCED_ANNUAL");
  if (p === "advanced-monthly" || p === "advanced")        return requireEnv("STRIPE_PRICE_ADVANCED_MONTHLY");
  if (p === "base-annual"      || p === "annual" || p === "yearly") return requireEnv("STRIPE_PRICE_BASE_ANNUAL");
  return requireEnv("STRIPE_PRICE_BASE_MONTHLY");
}

export function planForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  const e = process.env;
  if (priceId === e.STRIPE_PRICE_ADVANCED_ANNUAL)  return "advanced-annual";
  if (priceId === e.STRIPE_PRICE_ADVANCED_MONTHLY) return "advanced-monthly";
  if (priceId === e.STRIPE_PRICE_BASE_ANNUAL)      return "base-annual";
  if (priceId === e.STRIPE_PRICE_BASE_MONTHLY)     return "base-monthly";
  return null;
}

// Service-role Supabase client (server-only) ------------------------------
let serviceClient: ReturnType<typeof createClient> | null = null;
export function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return serviceClient;
}

export type PracticeBilling = {
  practiceId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  plan: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

export type SessionContext = {
  practiceId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
};

// Authenticate a request the same way the Pulse routes do: the client
// passes its Supabase access/refresh tokens in the JSON body.
export async function resolveSessionContext(input: {
  accessToken?: string;
  refreshToken?: string;
}): Promise<SessionContext> {
  const { session, user } = await resolvePulseSession(input);
  const practiceId = await getPracticeIdForUser(String(user.id || session.userId || "").trim());
  return {
    practiceId,
    email: String(user.email || session.email || "").trim(),
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

export async function getPracticeBilling(practiceId: string): Promise<PracticeBilling> {
  const service = getServiceClient();
  const res = await service
    .from("practices")
    .select("id,stripe_customer_id,stripe_subscription_id,subscription_status,plan,trial_ends_at,current_period_end")
    .eq("id", practiceId)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  const row = (res.data || {}) as Record<string, unknown>;
  return {
    practiceId,
    stripeCustomerId: (row.stripe_customer_id as string) || null,
    stripeSubscriptionId: (row.stripe_subscription_id as string) || null,
    subscriptionStatus: String(row.subscription_status || "trialing"),
    plan: (row.plan as string) || null,
    trialEndsAt: row.trial_ends_at ? new Date(String(row.trial_ends_at)).toISOString() : null,
    currentPeriodEnd: row.current_period_end ? new Date(String(row.current_period_end)).toISOString() : null,
  };
}

// Mirror the SQL practice_has_access() logic on the server.
export function computeAccess(billing: PracticeBilling) {
  const status = billing.subscriptionStatus;
  const now = Date.now();
  const trialMs = billing.trialEndsAt ? Date.parse(billing.trialEndsAt) : 0;
  const trialing = status === "trialing" && Number.isFinite(trialMs) && trialMs > now;
  const subscribed = status === "active" || status === "past_due";
  const hasAccess = subscribed || trialing;
  const trialDaysLeft = trialing ? Math.max(0, Math.ceil((trialMs - now) / 86_400_000)) : 0;
  return { hasAccess, trialing, subscribed, trialDaysLeft };
}

export async function findPracticeIdByCustomer(customerId: string): Promise<string | null> {
  const service = getServiceClient();
  const res = await service.from("practices").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  if (res.error) return null;
  return res.data ? String((res.data as Record<string, unknown>).id) : null;
}

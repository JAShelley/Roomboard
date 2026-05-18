import { loginPulseUser, optionsResponse, pulseError, pulseJson } from "../../../pulse/_lib";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const apiBase = String(body?.apiBase || "").trim();
    if (!email || !password) return pulseError("Email and password are required.");

    const session = await loginPulseUser(email, password);
    if (apiBase) session.apiBase = apiBase;
    return pulseJson({ auth: session });
  } catch (error) {
    return pulseError(String(error instanceof Error ? error.message : error || "Login failed."), 401);
  }
}

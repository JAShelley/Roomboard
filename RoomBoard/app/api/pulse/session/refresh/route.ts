import { optionsResponse, pulseError, pulseJson, resolvePulseSession } from "../../../pulse/_lib";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const apiBase = String(body?.apiBase || "").trim();
    const { session } = await resolvePulseSession({
      accessToken: body?.accessToken,
      refreshToken: body?.refreshToken,
    });
    if (apiBase) session.apiBase = apiBase;
    return pulseJson({ auth: session });
  } catch (error) {
    return pulseError(
      String(error instanceof Error ? error.message : error || "Your RoomBoard session expired. Please sign in again."),
      401,
    );
  }
}

import { loadPulseBoard, optionsResponse, pulseError, pulseJson } from "../_lib";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const apiBase = String(body?.apiBase || "").trim();
    const result = await loadPulseBoard({
      accessToken: body?.accessToken,
      refreshToken: body?.refreshToken,
    });
    if (apiBase) result.session.apiBase = apiBase;
    return pulseJson({
      auth: result.session,
      practiceId: result.practiceId,
      boardData: result.boardData,
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || "Could not load the shared board.");
    const status = /login required|expired|sign in/i.test(message) ? 401 : 400;
    return pulseError(message, status);
  }
}

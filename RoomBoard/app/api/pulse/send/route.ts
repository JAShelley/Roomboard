import { optionsResponse, pulseError, pulseJson, sendPulseAppointment } from "../_lib";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const payload = body?.payload || {};
    const apiBase = String(body?.apiBase || "").trim();
    const result = await sendPulseAppointment(
      {
        accessToken: body?.accessToken,
        refreshToken: body?.refreshToken,
      },
      {
        roomId: String(payload?.roomId || "").trim(),
        patientName: String(payload?.patientName || "").trim(),
        colorLabelId: String(payload?.colorLabelId || "").trim(),
        doctor: String(payload?.doctor || "").trim(),
        tech: String(payload?.tech || "").trim(),
        quickNote: String(payload?.quickNote || "").trim(),
        notes: String(payload?.notes || "").trim(),
        roomReady: !!payload?.roomReady,
        doctorReady: !!payload?.doctorReady,
      },
    );
    if (apiBase) result.session.apiBase = apiBase;
    return pulseJson({
      auth: result.session,
      practiceId: result.practiceId,
      boardData: result.boardData,
      message: result.message,
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || "Could not send the appointment.");
    const status = /login required|expired|sign in/i.test(message) ? 401 : 400;
    return pulseError(message, status);
  }
}

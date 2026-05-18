(function () {
  const api = window.roomboardCapture;
  const state = {
    auth: readJson("roomboardCapture.auth"),
    boardData: null,
    captured: null
  };

  const els = {
    apiBase: document.getElementById("apiBaseInput"),
    email: document.getElementById("emailInput"),
    password: document.getElementById("passwordInput"),
    login: document.getElementById("loginBtn"),
    loadBoard: document.getElementById("loadBoardBtn"),
    refreshStatus: document.getElementById("refreshStatusBtn"),
    arm: document.getElementById("armCaptureBtn"),
    stop: document.getElementById("stopCaptureBtn"),
    connectionStatus: document.getElementById("connectionStatus"),
    captureStatus: document.getElementById("captureStatus"),
    hoverPreview: document.getElementById("hoverPreview"),
    capturePreview: document.getElementById("capturePreview"),
    capturePreviewImage: document.getElementById("capturePreviewImage"),
    patientName: document.getElementById("patientNameInput"),
    reason: document.getElementById("reasonInput"),
    time: document.getElementById("timeInput"),
    doctor: document.getElementById("doctorSelect"),
    room: document.getElementById("roomSelect"),
    colorLabel: document.getElementById("colorLabelSelect"),
    tech: document.getElementById("techInput"),
    quickNote: document.getElementById("quickNoteSelect"),
    notes: document.getElementById("notesInput"),
    roomReady: document.getElementById("roomReadyInput"),
    doctorReady: document.getElementById("doctorReadyInput"),
    send: document.getElementById("sendBtn"),
    clear: document.getElementById("clearBtn"),
    sendStatus: document.getElementById("sendStatus")
  };

  const TIME_RANGE_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
  const SINGLE_TIME_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
  const DOCTOR_RE = /\b(?:dr\.?|doctor|dvm|d\.v\.m\.|provider|vet)\b/i;

  boot();

  function boot() {
    els.apiBase.value = localStorage.getItem("roomboardCapture.apiBase") || "";
    if (state.auth?.email) els.email.value = state.auth.email;
    populateSelect(els.room, [], "Load board first");
    populateSelect(els.colorLabel, [], "Load board first");
    populateSelect(els.doctor, [""], "No doctor");
    populateSelect(els.quickNote, [""], "No quick note");

    els.login.addEventListener("click", login);
    els.loadBoard.addEventListener("click", loadBoard);
    els.refreshStatus.addEventListener("click", refreshStatus);
    els.arm.addEventListener("click", armCapture);
    els.stop.addEventListener("click", stopCapture);
    els.send.addEventListener("click", sendAppointment);
    els.clear.addEventListener("click", clearCapture);

    api?.onStatus((payload) => {
      if (payload?.message) setStatus(els.captureStatus, payload.message, payload.armed ? "ok" : "");
      els.arm.disabled = !!payload?.armed;
      els.stop.disabled = !payload?.armed;
    });

    api?.onHover((payload) => {
      const text = summarizeCapturePayload(payload);
      els.hoverPreview.textContent = text || "No appointment under cursor.";
    });

    api?.onCaptured((payload) => {
      applyCapturedAppointment(payload);
    });

    refreshStatus();
    if (state.auth?.accessToken && state.auth?.refreshToken && els.apiBase.value) {
      loadBoard().catch(() => {});
    }
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function normalizeApiBase() {
    const value = String(els.apiBase.value || "").trim().replace(/\/+$/, "");
    if (!value) throw new Error("Enter your RoomBoard website URL.");
    if (!/^https?:\/\//i.test(value)) throw new Error("RoomBoard website URL must start with http:// or https://.");
    localStorage.setItem("roomboardCapture.apiBase", value);
    return value;
  }

  async function postRoomBoard(route, payload) {
    const apiBase = normalizeApiBase();
    const response = await fetch(`${apiBase}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, apiBase })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
    return data;
  }

  async function login() {
    try {
      setStatus(els.connectionStatus, "Signing in...");
      const email = String(els.email.value || "").trim();
      const password = String(els.password.value || "");
      const data = await postRoomBoard("/api/pulse/session/login", { email, password });
      state.auth = data.auth;
      writeJson("roomboardCapture.auth", state.auth);
      els.password.value = "";
      setStatus(els.connectionStatus, `Signed in as ${state.auth.email || email}.`, "ok");
      await loadBoard();
    } catch (error) {
      setStatus(els.connectionStatus, getErrorMessage(error), "error");
    }
  }

  async function loadBoard() {
    if (!state.auth?.accessToken && !state.auth?.refreshToken) {
      throw new Error("Login before loading the board.");
    }

    setStatus(els.connectionStatus, "Loading board...");
    const data = await postRoomBoard("/api/pulse/board", {
      accessToken: state.auth.accessToken,
      refreshToken: state.auth.refreshToken
    });

    state.auth = data.auth || state.auth;
    state.boardData = data.boardData || null;
    writeJson("roomboardCapture.auth", state.auth);
    populateBoardControls();
    setStatus(els.connectionStatus, "Board loaded.", "ok");
  }

  async function refreshStatus() {
    const status = await api?.getStatus?.();
    const hotkey = status?.hotkey ? ` Hotkey: ${status.hotkey}.` : "";
    const platform = status?.helperPlatform ? `${status.helperPlatform} ` : "";
    const helper = status?.helperAvailable ? `${platform}helper ready.` : `${platform}helper not built or not available on this platform.`;
    setStatus(els.captureStatus, `${helper}${hotkey}`, status?.helperAvailable ? "ok" : "");
    els.arm.disabled = !!status?.armed;
    els.stop.disabled = !status?.armed;
  }

  async function armCapture() {
    const result = await api?.start?.();
    setStatus(els.captureStatus, result?.message || "Capture armed.", result?.ok ? "ok" : "error");
  }

  async function stopCapture() {
    const result = await api?.stop?.();
    setStatus(els.captureStatus, result?.message || "Capture cancelled.");
  }

  function populateBoardControls() {
    const rooms = state.boardData?.rooms || [];
    const labels = state.boardData?.colorLabels || [];
    const doctors = state.boardData?.doctors || [""];
    const quickNotes = state.boardData?.quickNotes || [""];

    populateSelect(els.room, rooms.map((room) => ({ value: room.id, label: room.name })), "Choose room");
    populateSelect(els.colorLabel, labels.map((label) => ({ value: label.id, label: label.title })), "Choose type");
    populateSelect(els.doctor, doctors.map((doctor) => ({ value: doctor, label: doctor || "No doctor" })));
    populateSelect(els.quickNote, quickNotes.map((note) => ({ value: note, label: note || "No quick note" })));
  }

  function populateSelect(select, values, placeholder) {
    select.innerHTML = "";
    if (placeholder) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.appendChild(option);
    }

    values.forEach((entry) => {
      const option = document.createElement("option");
      if (typeof entry === "string") {
        option.value = entry;
        option.textContent = entry || placeholder || "None";
      } else {
        option.value = entry.value;
        option.textContent = entry.label;
      }
      select.appendChild(option);
    });
  }

  function applyCapturedAppointment(payload) {
    const parsed = parseCapturedText(payload);
    state.captured = { ...payload, parsed };
    if (payload?.imageDataUrl) {
      els.capturePreviewImage.src = payload.imageDataUrl;
      els.capturePreview.hidden = false;
    } else {
      els.capturePreviewImage.removeAttribute("src");
      els.capturePreview.hidden = true;
    }
    els.patientName.value = parsed.patientName;
    els.reason.value = parsed.reason;
    els.time.value = parsed.appointmentTime;
    setSelectByText(els.doctor, parsed.doctor);
    setSelectByText(els.colorLabel, parsed.reason);
    els.notes.value = buildNotes(parsed, payload);
    const method = payload?.captureMethod === "visual-block" ? " Visual block detected." : "";
    setStatus(els.sendStatus, `Review the appointment, choose a room, then send.${method}`, "ok");
  }

  function parseCapturedText(payload) {
    const rawText = String(payload?.text || payload?.name || "").trim();
    const lines = rawText
      .split(/\r?\n|\s+\|\s+/)
      .map((line) => normalizeSpaces(line))
      .filter(Boolean)
      .filter((line, index, all) => all.indexOf(line) === index);

    const appointmentTime = lines.find((line) => TIME_RANGE_RE.test(line))?.match(TIME_RANGE_RE)?.[0]
      || lines.find((line) => SINGLE_TIME_RE.test(line))?.match(SINGLE_TIME_RE)?.[0]
      || "";

    const doctor = lines.find((line) => DOCTOR_RE.test(line)) || "";
    const patientName = lines.find((line) => {
      if (!line) return false;
      if (line === appointmentTime || TIME_RANGE_RE.test(line) || SINGLE_TIME_RE.test(line)) return false;
      if (DOCTOR_RE.test(line)) return false;
      if (line.length > 48 && line.split(/\s+/).length > 5) return false;
      return true;
    }) || "";

    const reason = lines.filter((line) => {
      if (!line) return false;
      if (line === patientName || line === doctor || line === appointmentTime) return false;
      if (TIME_RANGE_RE.test(line) || SINGLE_TIME_RE.test(line)) return false;
      return true;
    }).slice(0, 3).join(", ");

    return {
      patientName,
      reason,
      doctor,
      appointmentTime,
      rawText
    };
  }

  function buildNotes(parsed, payload) {
    const parts = [];
    if (parsed.appointmentTime) parts.push(`Time: ${parsed.appointmentTime}`);
    if (parsed.reason) parts.push(`Reason: ${parsed.reason}`);
    if (payload?.windowTitle) parts.push(`Source: ${payload.windowTitle}`);
    if (parsed.rawText) parts.push(`Captured text:\n${parsed.rawText}`);
    return parts.join("\n\n");
  }

  function setSelectByText(select, text) {
    const looseText = normalizeLoose(text);
    if (!looseText) return;

    const options = Array.from(select.options || []);
    const exact = options.find((option) => normalizeLoose(option.textContent) === looseText);
    const partial = exact || options.find((option) => {
      const value = normalizeLoose(option.textContent);
      return value && (looseText.includes(value) || value.includes(looseText));
    });
    if (partial) select.value = partial.value;
  }

  async function sendAppointment() {
    try {
      if (!state.auth?.accessToken && !state.auth?.refreshToken) throw new Error("Login before sending.");
      if (!state.boardData) await loadBoard();
      if (!String(els.room.value || "").trim()) throw new Error("Choose a room.");
      if (!String(els.patientName.value || "").trim()) throw new Error("Patient name is required.");

      setStatus(els.sendStatus, "Sending...");
      const data = await postRoomBoard("/api/pulse/send", {
        accessToken: state.auth.accessToken,
        refreshToken: state.auth.refreshToken,
        payload: {
          roomId: els.room.value,
          patientName: els.patientName.value,
          colorLabelId: els.colorLabel.value,
          doctor: els.doctor.value,
          tech: els.tech.value,
          quickNote: els.quickNote.value,
          notes: els.notes.value,
          roomReady: els.roomReady.checked,
          doctorReady: els.doctorReady.checked
        }
      });

      state.auth = data.auth || state.auth;
      state.boardData = data.boardData || state.boardData;
      writeJson("roomboardCapture.auth", state.auth);
      populateBoardControls();
      setStatus(els.sendStatus, data.message || "Sent to RoomBoard.", "ok");
    } catch (error) {
      setStatus(els.sendStatus, getErrorMessage(error), "error");
    }
  }

  function clearCapture() {
    state.captured = null;
    els.patientName.value = "";
    els.reason.value = "";
    els.time.value = "";
    els.tech.value = "";
    els.notes.value = "";
    els.roomReady.checked = false;
    els.doctorReady.checked = false;
    els.capturePreviewImage.removeAttribute("src");
    els.capturePreview.hidden = true;
    setStatus(els.sendStatus, "Capture an appointment to start.");
  }

  function summarizeCapturePayload(payload) {
    const text = normalizeSpaces(payload?.text || payload?.name || "");
    if (!text) return "";
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  function setStatus(element, message, kind) {
    element.textContent = String(message || "");
    element.classList.toggle("isError", kind === "error");
    element.classList.toggle("isOk", kind === "ok");
  }

  function normalizeSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeLoose(value) {
    return normalizeSpaces(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function getErrorMessage(error) {
    return String(error?.message || error || "Something went wrong.");
  }
})();

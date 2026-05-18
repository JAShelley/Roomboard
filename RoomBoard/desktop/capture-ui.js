(function () {
  const api = window.roomboardCapture;
  const SUPABASE_URL = "https://bqqjtgbfvtscwhbhscps.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcWp0Z2JmdnRzY3doYmhzY3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NTIxNDEsImV4cCI6MjA5MDMyODE0MX0.hi_ruvxOBNbUIdQ-BYhjhuy6KM5oigqib-zIWL8dsts";
  const AUTH_STORAGE_KEY = "roomboardCapture.auth";

  const state = {
    auth: readJson(AUTH_STORAGE_KEY),
    boardData: null,
    captured: null
  };

  const els = {
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
    if (state.auth?.accessToken || state.auth?.refreshToken) {
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

  async function login() {
    try {
      setStatus(els.connectionStatus, "Signing in...");
      const email = String(els.email.value || "").trim();
      const password = String(els.password.value || "");
      state.auth = await loginToSupabase(email, password);
      writeJson(AUTH_STORAGE_KEY, state.auth);
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
    await ensureValidAuthSession();
    const practiceId = await fetchPracticeId(false);
    state.boardData = await fetchPracticeBoardData(practiceId);
    writeJson(AUTH_STORAGE_KEY, state.auth);
    populateBoardControls();
    setStatus(els.connectionStatus, "Board loaded for your clinic.", "ok");
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

  async function loginToSupabase(email, password) {
    if (!email || !password) throw new Error("Email and password are required.");
    const data = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });
    if (!data?.access_token) throw new Error("RoomBoard login did not return a session.");
    return mapAuthPayload(data, email);
  }

  function mapAuthPayload(data, fallbackEmail) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 3600)) * 1000,
      email: data.user?.email || fallbackEmail || "",
      userId: data.user?.id || ""
    };
  }

  async function ensureValidAuthSession() {
    if (!state.auth?.accessToken && !state.auth?.refreshToken) throw new Error("Login required.");

    const expiresAt = Number(state.auth.expiresAt || 0);
    if (state.auth.accessToken && expiresAt > Date.now() + 60 * 1000) return state.auth;
    if (!state.auth.refreshToken) throw new Error("Your RoomBoard session expired. Please sign in again.");

    const data = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: state.auth.refreshToken })
    });
    if (!data?.access_token) throw new Error("RoomBoard refresh did not return a session.");
    state.auth = { ...state.auth, ...mapAuthPayload(data, state.auth.email || "") };
    writeJson(AUTH_STORAGE_KEY, state.auth);
    return state.auth;
  }

  async function fetchPracticeId(forceRefresh) {
    if (state.practiceId && !forceRefresh) return state.practiceId;
    await ensureValidAuthSession();

    const headers = authHeaders({ "Content-Type": "application/json" });
    try {
      const practiceId = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_my_practice_id`, {
        method: "POST",
        headers,
        body: "{}"
      });
      if (typeof practiceId === "string" && practiceId) {
        state.practiceId = practiceId;
        return state.practiceId;
      }
    } catch (_error) {}

    if (!state.auth?.userId) throw new Error("Could not determine your RoomBoard clinic.");
    const rows = await fetchJson(
      `${SUPABASE_URL}/rest/v1/profiles?select=practice_id&user_id=eq.${encodeURIComponent(state.auth.userId)}&limit=1`,
      {
        method: "GET",
        headers: authHeaders({ Accept: "application/json" })
      }
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.practice_id) throw new Error("Could not determine your RoomBoard clinic.");
    state.practiceId = row.practice_id;
    return state.practiceId;
  }

  async function fetchPracticeBoardData(practiceId) {
    const headers = authHeaders({ Accept: "application/json" });
    const encodedPracticeId = encodeURIComponent(practiceId);
    const [roomRows, doctorRows, colorRows, quickNoteRows, settingsRows, boardStateRows] = await Promise.all([
      fetchJson(`${SUPABASE_URL}/rest/v1/rooms?select=id,name,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,name.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/doctors?select=id,name,initials,active&practice_id=eq.${encodedPracticeId}&order=name.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/appointment_types?select=id,title,color_hex,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,title.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/quick_notes?select=id,label,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,label.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/practice_settings?select=board_columns,show_only_active,board_view,highlight_doctor_id,default_appointment_type_id&practice_id=eq.${encodedPracticeId}&limit=1`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/practice_board_state?select=practice_id,board_state,updated_at&practice_id=eq.${encodedPracticeId}&limit=1`, { method: "GET", headers })
    ]);

    const activeDoctors = asArray(doctorRows).filter((row) => row && row.active !== false && normalizeSpaces(row.name));
    const activeColorRows = asArray(colorRows).filter((row) => row && row.active !== false && normalizeSpaces(row.title));
    const activeQuickNotes = asArray(quickNoteRows).filter((row) => row && row.active !== false && normalizeSpaces(row.label));
    const settingsRow = asArray(settingsRows)[0] || null;
    const boardStateRow = asArray(boardStateRows)[0] || null;
    const boardState = boardStateRow?.board_state && typeof boardStateRow.board_state === "object" ? boardStateRow.board_state : {};
    const boardRooms = Array.isArray(boardState.rooms) ? boardState.rooms : [];
    const colorLabels = activeColorRows.map((row) => ({
      id: row.id,
      title: row.title,
      color: row.color_hex || "#6ea8fe"
    }));

    const boardRoomMap = Object.create(null);
    boardRooms.forEach((room) => {
      if (room?.id) boardRoomMap[room.id] = room;
    });

    const defaultColorId = settingsRow?.default_appointment_type_id || colorLabels[0]?.id || "";
    const doctorInitials = {};
    activeDoctors.forEach((row) => {
      doctorInitials[row.name] = row.initials || "";
    });

    const rooms = asArray(roomRows)
      .filter((row) => row && row.active !== false)
      .sort((a, b) => {
        const sortDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (sortDiff !== 0) return sortDiff;
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });
      })
      .map((row, index) => mergeRoomEntryWithDefaults(row, boardRoomMap[row.id], index, defaultColorId, colorLabels));

    const highlightedDoctor = activeDoctors.find((row) => row.id === settingsRow?.highlight_doctor_id);
    return {
      rooms,
      doctors: ["", ...activeDoctors.map((row) => row.name)],
      quickNotes: ["", ...activeQuickNotes.map((row) => row.label)],
      colorLabels,
      settings: {
        displayCols: Math.max(1, Number(settingsRow?.board_columns || 4)),
        displayOnlyActive: !!settingsRow?.show_only_active,
        displayLayout: settingsRow?.board_view === "list" ? "list" : "grid",
        highlightDoctor: highlightedDoctor?.name || "",
        defaultColorLabelId: defaultColorId,
        doctorInitials
      }
    };
  }

  function mergeRoomEntryWithDefaults(roomRow, entryData, index, defaultColorId, colorLabels) {
    const colorId = entryData?.colorLabelId || defaultColorId || colorLabels[0]?.id || "";
    const merged = {
      id: roomRow.id,
      name: roomRow.name || `Room ${index + 1}`,
      patientName: "",
      colorLabelId: colorId,
      colorHex: "",
      doctor: "",
      tech: "",
      quickNote: "",
      notes: "",
      roomReady: false,
      doctorReady: false,
      needsCleaning: false,
      reason: "",
      timer: normalizeTimer(entryData?.timer),
      cleaningTimer: normalizeTimer(entryData?.cleaningTimer),
      activeRoomSessionId: entryData?.activeRoomSessionId || null,
      dischargeReady: entryData?.dischargeReady == null ? null : !!entryData.dischargeReady
    };

    if (entryData && typeof entryData === "object") {
      Object.assign(merged, entryData);
      merged.id = roomRow.id;
      merged.name = roomRow.name || merged.name;
      merged.timer = normalizeTimer(entryData.timer);
      merged.cleaningTimer = normalizeTimer(entryData.cleaningTimer);
    }

    if (!merged.reason) {
      const color = colorLabels.find((item) => item.id === merged.colorLabelId);
      if (color?.title) merged.reason = color.title;
    }

    return merged;
  }

  async function sendToRoomBoard(payload) {
    await ensureValidAuthSession();
    const practiceId = await fetchPracticeId(false);
    const boardData = await fetchPracticeBoardData(practiceId);
    const room = boardData.rooms.find((entry) => entry.id === String(payload.roomId || "").trim());
    if (!room) throw new Error("That room could not be found in the shared board.");

    const wasEmpty = !String(room.patientName || "").trim();
    room.patientName = String(payload.patientName || "").trim();
    room.colorLabelId = String(payload.colorLabelId || "").trim() || room.colorLabelId;
    room.colorHex = "";
    room.doctor = String(payload.doctor || "").trim();
    room.tech = String(payload.tech || "").trim();
    room.quickNote = String(payload.quickNote || "").trim();
    room.notes = String(payload.notes || "").trim();
    room.roomReady = !!payload.roomReady;
    room.doctorReady = !!payload.doctorReady;
    room.needsCleaning = false;
    room.cleaningTimer = normalizeTimer(room.cleaningTimer);
    room.cleaningTimer.running = false;
    room.cleaningTimer.startedAt = null;
    room.cleaningTimer.startedAtIso = null;

    const selectedColor = boardData.colorLabels.find((label) => label.id === room.colorLabelId);
    if (selectedColor?.title) room.reason = selectedColor.title;

    room.timer = normalizeTimer(room.timer);
    if (room.patientName && !room.timer.running && computeElapsed(room.timer) === 0) {
      const serverNowIso = await fetchServerNowIso();
      room.timer.elapsedMs = Math.max(0, Number(room.timer.elapsedMs || 0));
      room.timer.baseElapsedMs = Math.max(0, Number(room.timer.baseElapsedMs || room.timer.elapsedMs || 0));
      room.timer.running = true;
      room.timer.startedAt = null;
      room.timer.startedAtIso = serverNowIso;
    }

    if (wasEmpty && !room.activeRoomSessionId) {
      room.activeRoomSessionId = await createRoomSession(room);
    }

    await upsertBoardState(practiceId, boardData);
    return {
      boardData,
      message: `${room.patientName} sent to ${room.name || "room"}.`
    };
  }

  async function createRoomSession(room) {
    const practiceId = await fetchPracticeId(false);
    const serverNowIso = await fetchServerNowIso();
    const payload = {
      practice_id: practiceId,
      room_name: room.name || room.id,
      doctor_name: room.doctor || null,
      started_at: serverNowIso,
      ended_at: null,
      duration_ms: null
    };

    try {
      const data = await fetchJson(`${SUPABASE_URL}/rest/v1/room_sessions`, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }),
        body: JSON.stringify(payload)
      });
      return Array.isArray(data) ? data[0]?.id || null : data?.id || null;
    } catch (error) {
      if (!shouldRetryRoomSessionWithoutPracticeId(error) || !practiceId) throw error;
      const fallbackPayload = {
        room_name: payload.room_name,
        doctor_name: payload.doctor_name,
        started_at: payload.started_at,
        ended_at: payload.ended_at,
        duration_ms: payload.duration_ms
      };
      const data = await fetchJson(`${SUPABASE_URL}/rest/v1/room_sessions`, {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }),
        body: JSON.stringify(fallbackPayload)
      });
      return Array.isArray(data) ? data[0]?.id || null : data?.id || null;
    }
  }

  async function upsertBoardState(practiceId, boardData) {
    await fetchJson(`${SUPABASE_URL}/rest/v1/practice_board_state?on_conflict=practice_id`, {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      }),
      body: JSON.stringify({
        practice_id: practiceId,
        board_state: {
          rooms: deepClone(Array.isArray(boardData?.rooms) ? boardData.rooms : [])
        }
      })
    });
  }

  async function fetchServerNowIso() {
    try {
      const data = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_server_now_iso`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: "{}"
      });
      return normalizeServerNowIso(data) || new Date().toISOString();
    } catch (_error) {
      return new Date().toISOString();
    }
  }

  async function fetchJson(url, options) {
    options = options || {};
    const response = await fetch(url, options);
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_error) {
      parsed = text;
    }

    if (!response.ok) {
      const message = getErrorMessage(parsed) || `Request failed (${response.status})`;
      const canRetryAuth = hasAuthHeader(options) && !options.__skipAuthRetry && !/\/auth\/v1\/token\b/i.test(String(url || ""));
      if (canRetryAuth && shouldTreatAsAuthFailure(response, parsed) && state.auth?.refreshToken) {
        state.auth.expiresAt = 0;
        await ensureValidAuthSession();
        const retryOptions = cloneRequestOptions(options);
        retryOptions.__skipAuthRetry = true;
        retryOptions.headers.Authorization = `Bearer ${state.auth.accessToken}`;
        return fetchJson(url, retryOptions);
      }
      throw new Error(message);
    }

    return parsed;
  }

  async function sendAppointment() {
    try {
      if (!state.auth?.accessToken && !state.auth?.refreshToken) throw new Error("Login before sending.");
      if (!state.boardData) await loadBoard();
      if (!String(els.room.value || "").trim()) throw new Error("Choose a room.");
      if (!String(els.patientName.value || "").trim()) throw new Error("Patient name is required.");

      setStatus(els.sendStatus, "Sending...");
      const result = await sendToRoomBoard({
        roomId: els.room.value,
        patientName: els.patientName.value,
        colorLabelId: els.colorLabel.value,
        doctor: els.doctor.value,
        tech: els.tech.value,
        quickNote: els.quickNote.value,
        notes: els.notes.value,
        roomReady: els.roomReady.checked,
        doctorReady: els.doctorReady.checked
      });

      state.boardData = result.boardData || state.boardData;
      writeJson(AUTH_STORAGE_KEY, state.auth);
      populateBoardControls();
      setStatus(els.sendStatus, result.message || "Sent to RoomBoard.", "ok");
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

  function authHeaders(extra) {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${state.auth?.accessToken || ""}`,
      ...(extra || {})
    };
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeTimer(timer) {
    const base = timer && typeof timer === "object" ? timer : {};
    const elapsedMs = Math.max(0, Number(base.elapsedMs || 0));
    const baseElapsedMs = Math.max(0, Number(base.baseElapsedMs != null ? base.baseElapsedMs : elapsedMs));
    return {
      elapsedMs,
      baseElapsedMs,
      running: !!base.running,
      startedAt: base.startedAt || null,
      startedAtIso: base.startedAtIso || null
    };
  }

  function computeElapsed(timer) {
    if (!timer) return 0;
    const elapsedMs = Math.max(0, Number(timer.elapsedMs || 0));
    if (timer.running && timer.startedAtIso) {
      const startedAtMs = Date.parse(timer.startedAtIso);
      if (Number.isFinite(startedAtMs)) return elapsedMs + Math.max(0, Date.now() - startedAtMs);
    }
    if (timer.running && timer.startedAt) {
      return elapsedMs + Math.max(0, Date.now() - Number(timer.startedAt));
    }
    return elapsedMs;
  }

  function normalizeServerNowIso(value) {
    if (!value) return null;
    if (typeof value === "string") {
      const parsed = Date.parse(value.trim());
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    }
    if (typeof value === "object") {
      const keys = ["server_now", "serverNow", "now", "ts", "timestamp", "get_server_now_iso"];
      for (const key of keys) {
        if (value[key]) {
          const nested = normalizeServerNowIso(value[key]);
          if (nested) return nested;
        }
      }
    }
    return null;
  }

  function shouldRetryRoomSessionWithoutPracticeId(error) {
    const message = normalizeSpaces(getErrorMessage(error)).toLowerCase();
    return (
      message.includes("column") && message.includes("practice_id") && message.includes("does not exist")
    ) || (
      message.includes("schema cache") && message.includes("practice_id")
    ) || (
      message.includes("could not find the 'practice_id' column")
    );
  }

  function hasAuthHeader(options) {
    const headers = options?.headers || {};
    return !!(headers.Authorization || headers.authorization);
  }

  function isLikelyAuthErrorMessage(message) {
    const text = normalizeSpaces(message).toLowerCase();
    if (!text) return false;
    return text.includes("invalid token")
      || text.includes("jwt")
      || text.includes("token is expired")
      || text.includes("session expired")
      || text.includes("refresh token")
      || text.includes("invalid grant")
      || text.includes("login required")
      || text.includes("user from sub claim in jwt does not exist")
      || text.includes("unauthorized");
  }

  function shouldTreatAsAuthFailure(response, parsed) {
    const status = Number(response?.status || 0);
    if (status === 401 || status === 403) return true;
    return isLikelyAuthErrorMessage(getErrorMessage(parsed));
  }

  function cloneRequestOptions(options) {
    const next = { ...(options || {}) };
    if (options?.headers instanceof Headers) {
      next.headers = Object.fromEntries(options.headers.entries());
    } else {
      next.headers = { ...(options?.headers || {}) };
    }
    return next;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getErrorMessage(error) {
    if (!error) return "Something went wrong.";
    if (typeof error === "string") return error;
    if (error.message) return String(error.message);
    if (Array.isArray(error) && error[0]?.message) return String(error[0].message);
    if (error.msg) return String(error.msg);
    if (error.error_description) return String(error.error_description);
    if (error.error) return String(error.error);
    try {
      return JSON.stringify(error);
    } catch (_error) {
      return String(error);
    }
  }
})();

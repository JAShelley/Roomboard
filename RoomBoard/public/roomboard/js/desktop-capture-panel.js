(function () {
  const api = window.roomboardCapture;
  if (!api || window.__roomboardDesktopCapturePanelLoaded) return;
  window.__roomboardDesktopCapturePanelLoaded = true;

  const PANEL_ID = "desktopCapturePanel";
  const TOAST_ID = "desktopCaptureToast";
  const PREVIEW_ID = "desktopCapturePreview";
  const TIME_RANGE_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-\u2013]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
  const SINGLE_TIME_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
  const DOCTOR_RE = /\b(?:dr\.?|doctor|dvm|d\.v\.m\.|provider|vet)\b/i;
  const PATIENT_NAME_RE = /^[^\w(]*(?:\([A-Z?]\s*,?\s*\d{0,3}\)\s*)?([A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+)*(?:\s+\([^)]+\))?)/;
  const PHONE_RE = /\b(?:\(?\d{3}\)?[-.\s]*)?\d{3}[-.\s]\d{4}\b|\(\d{3}\)/;
  const CONTACT_LINE_RE = /^(?:[HWC]\.?\s*)?(?:\(?\d{3}\)?[-.\s]*)?\d{3}[-.\s]\d{4}\b/i;

  const state = {
    boardData: null,
    captured: null,
    form: null,
    loadingBoard: false,
    toastTimer: null
  };

  let els = null;

  boot();

  function boot() {
    injectStyles();
    injectPanel();
    bindCaptureEvents();
  }

  function injectPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "RoomBoard capture quick send");
    panel.innerHTML = `
      <div class="desktopCaptureCard">
        <div class="desktopCaptureHeader">
          <div>
            <div class="desktopCaptureEyebrow">RoomBoard Capture</div>
            <h2>Quick Send</h2>
          </div>
          <button class="desktopCaptureIconBtn" data-action="close" type="button" aria-label="Close capture panel">x</button>
        </div>
        <div class="desktopCaptureStatus" id="desktopCaptureStatus">Capture an appointment from the menu bar.</div>
        <div class="desktopCapturePreview" id="${PREVIEW_ID}" hidden>
          <img alt="Captured appointment preview" id="desktopCapturePreviewImage">
        </div>
        <div class="desktopCaptureGrid">
          <label class="desktopCaptureField desktopCaptureFull">
            <span>Room</span>
            <select id="desktopCaptureRoom"></select>
          </label>
          <label class="desktopCaptureField desktopCaptureFull">
            <span>Patient</span>
            <input id="desktopCapturePatient" type="text">
          </label>
          <label class="desktopCaptureField">
            <span>Type</span>
            <select id="desktopCaptureType"></select>
          </label>
          <label class="desktopCaptureField">
            <span>Doctor</span>
            <select id="desktopCaptureDoctor"></select>
          </label>
          <label class="desktopCaptureField">
            <span>Tech</span>
            <input id="desktopCaptureTech" type="text">
          </label>
          <label class="desktopCaptureField">
            <span>Quick note</span>
            <select id="desktopCaptureQuickNote"></select>
          </label>
          <label class="desktopCaptureField desktopCaptureFull">
            <span>Notes</span>
            <textarea id="desktopCaptureNotes" rows="4"></textarea>
          </label>
        </div>
        <div class="desktopCaptureChecks">
          <label><input id="desktopCaptureRoomReady" type="checkbox"> Room ready</label>
          <label><input id="desktopCaptureDoctorReady" type="checkbox"> Doctor ready</label>
        </div>
        <div class="desktopCaptureFooter">
          <button data-action="capture" type="button">Capture</button>
          <button class="desktopCapturePrimary" data-action="send" type="button">Send</button>
        </div>
      </div>
    `;

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.setAttribute("role", "status");

    document.body.appendChild(panel);
    document.body.appendChild(toast);

    els = {
      panel,
      status: document.getElementById("desktopCaptureStatus"),
      preview: document.getElementById(PREVIEW_ID),
      previewImage: document.getElementById("desktopCapturePreviewImage"),
      room: document.getElementById("desktopCaptureRoom"),
      patient: document.getElementById("desktopCapturePatient"),
      type: document.getElementById("desktopCaptureType"),
      doctor: document.getElementById("desktopCaptureDoctor"),
      tech: document.getElementById("desktopCaptureTech"),
      quickNote: document.getElementById("desktopCaptureQuickNote"),
      notes: document.getElementById("desktopCaptureNotes"),
      roomReady: document.getElementById("desktopCaptureRoomReady"),
      doctorReady: document.getElementById("desktopCaptureDoctorReady"),
      toast
    };

    panel.addEventListener("click", onPanelClick);
    [els.room, els.patient, els.type, els.doctor, els.tech, els.quickNote, els.notes, els.roomReady, els.doctorReady].forEach((field) => {
      field.addEventListener("input", syncFormFromFields);
      field.addEventListener("change", syncFormFromFields);
    });
    els.room.addEventListener("change", handleRoomChange);
  }

  function bindCaptureEvents() {
    api.onCaptured((payload) => {
      applyCapturedAppointment(payload);
    });

    api.onStatus((payload) => {
      const message = normalizeSpaces(payload?.message || "");
      if (message) showToast(message);
    });
  }

  async function onPanelClick(event) {
    const button = event.target?.closest?.("[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    if (action === "close") {
      closePanel();
      return;
    }
    if (action === "capture") {
      const result = await api.start();
      if (result?.message) showStatus(result.message, result.ok ? "ok" : "error");
      return;
    }
    if (action === "send") {
      await sendAppointment();
    }
  }

  async function applyCapturedAppointment(payload) {
    const parsed = parseCapturedText(payload);
    state.captured = { ...payload, parsed };
    state.form = null;
    openPanel();
    showStatus("Appointment captured. Loading rooms...", "ok");
    renderPreview(payload);

    try {
      await ensureBoardData();
      state.form = buildInitialFormState(state.boardData, state.captured);
      renderForm();
      showStatus("Review the fields, then send.", "ok");
    } catch (error) {
      state.form = buildFallbackFormState(state.captured);
      renderForm();
      showStatus(getErrorMessage(error), "error");
    }
  }

  function openPanel() {
    if (!els) injectPanel();
    els.panel.classList.add("isOpen");
  }

  function closePanel() {
    els.panel.classList.remove("isOpen");
  }

  function renderPreview(payload) {
    if (payload?.imageDataUrl) {
      els.previewImage.src = payload.imageDataUrl;
      els.preview.hidden = false;
    } else {
      els.previewImage.removeAttribute("src");
      els.preview.hidden = true;
    }
  }

  async function ensureBoardData(forceRefresh) {
    const activeBoardData = getActiveBoardData();
    if (activeBoardData && !forceRefresh) {
      state.boardData = activeBoardData;
      return state.boardData;
    }
    if (state.boardData && !forceRefresh) return state.boardData;
    if (state.loadingBoard) return state.boardData;
    state.loadingBoard = true;
    try {
      state.boardData = await fetchBoardData();
      return state.boardData;
    } finally {
      state.loadingBoard = false;
    }
  }

  function getActiveBoardData() {
    const appState = getActiveAppState();
    if (!appState) return null;
    return buildBoardDataFromAppState(appState);
  }

  function getActiveAppState() {
    if (typeof window.getAppState !== "function") return null;
    const appState = window.getAppState();
    if (!appState || !Array.isArray(appState.rooms) || !appState.rooms.length) return null;
    return appState;
  }

  function buildBoardDataFromAppState(appState) {
    const colorLabels = Array.isArray(appState.colorLabels) ? appState.colorLabels : [];
    const doctors = normalizeChoiceList(appState.doctors);
    const quickNotes = normalizeChoiceList(appState.quickNotes);
    return {
      practiceId: normalizeSpaces(window.currentPracticeId || window.__roomboardPracticeId || ""),
      rooms: Array.isArray(appState.rooms) ? appState.rooms : [],
      doctors,
      quickNotes,
      colorLabels,
      settings: {
        displayCols: Math.max(1, Number(appState.settings?.displayCols || 4)),
        displayOnlyActive: !!appState.settings?.displayOnlyActive,
        displayLayout: appState.settings?.displayLayout === "list" ? "list" : "grid",
        highlightDoctor: appState.settings?.highlightDoctor || "",
        defaultColorLabelId: appState.settings?.defaultColorLabelId || getDefaultColorLabelId(colorLabels)
      }
    };
  }

  function normalizeChoiceList(values) {
    const out = [""];
    asArray(values).forEach((value) => {
      const label = normalizeSpaces(value);
      if (label && !out.includes(label)) out.push(label);
    });
    return out;
  }

  async function fetchBoardData() {
    const client = await waitForSupabaseClient();
    const practiceId = await resolvePracticeId(client);
    const [roomRows, doctorRows, colorRows, quickNoteRows, settingsRows, boardRows] = await Promise.all([
      queryOrThrow(client.from("rooms").select("id,name,sort_order,active").eq("practice_id", practiceId).order("sort_order", { ascending: true }).order("name", { ascending: true })),
      queryOrThrow(client.from("doctors").select("id,name,initials,active").eq("practice_id", practiceId).order("name", { ascending: true })),
      queryOrThrow(client.from("appointment_types").select("id,title,color_hex,sort_order,active").eq("practice_id", practiceId).order("sort_order", { ascending: true }).order("title", { ascending: true })),
      queryOrThrow(client.from("quick_notes").select("id,label,sort_order,active").eq("practice_id", practiceId).order("sort_order", { ascending: true }).order("label", { ascending: true })),
      queryOrThrow(client.from("practice_settings").select("board_columns,show_only_active,board_view,highlight_doctor_id,default_appointment_type_id").eq("practice_id", practiceId).limit(1)),
      queryOrThrow(client.from("practice_board_state").select("board_state,updated_at").eq("practice_id", practiceId).limit(1))
    ]);

    const activeDoctors = asArray(doctorRows).filter((row) => row && row.active !== false && normalizeSpaces(row.name));
    const activeColors = asArray(colorRows).filter((row) => row && row.active !== false && normalizeSpaces(row.title));
    const activeQuickNotes = asArray(quickNoteRows).filter((row) => row && row.active !== false && normalizeSpaces(row.label));
    const settings = asArray(settingsRows)[0] || {};
    const boardState = asArray(boardRows)[0]?.board_state || {};
    const boardRooms = Array.isArray(boardState.rooms) ? boardState.rooms : [];
    const boardRoomMap = Object.create(null);
    boardRooms.forEach((room) => {
      if (room?.id) boardRoomMap[room.id] = room;
    });

    const colorLabels = activeColors.map((row) => ({
      id: row.id,
      title: row.title,
      color: row.color_hex || "#6ea8fe"
    }));
    const defaultColorId = settings.default_appointment_type_id || colorLabels[0]?.id || "";
    const rooms = asArray(roomRows)
      .filter((row) => row && row.active !== false)
      .map((row, index) => mergeRoomEntry(row, boardRoomMap[row.id], index, defaultColorId, colorLabels));

    const highlightedDoctor = activeDoctors.find((row) => row.id === settings.highlight_doctor_id);
    return {
      practiceId,
      rooms,
      doctors: ["", ...activeDoctors.map((row) => row.name)],
      quickNotes: ["", ...activeQuickNotes.map((row) => row.label)],
      colorLabels,
      settings: {
        displayCols: Math.max(1, Number(settings.board_columns || 4)),
        displayOnlyActive: !!settings.show_only_active,
        displayLayout: settings.board_view === "list" ? "list" : "grid",
        highlightDoctor: highlightedDoctor?.name || "",
        defaultColorLabelId: defaultColorId
      }
    };
  }

  function mergeRoomEntry(row, entryData, index, defaultColorId, colorLabels) {
    const colorId = entryData?.colorLabelId || defaultColorId || colorLabels[0]?.id || "";
    const merged = {
      id: row.id,
      name: row.name || `Room ${index + 1}`,
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
      merged.id = row.id;
      merged.name = row.name || merged.name;
      merged.timer = normalizeTimer(entryData.timer);
      merged.cleaningTimer = normalizeTimer(entryData.cleaningTimer);
    }

    if (!merged.reason) {
      const color = colorLabels.find((item) => item.id === merged.colorLabelId);
      if (color?.title) merged.reason = color.title;
    }

    return merged;
  }

  async function waitForSupabaseClient() {
    for (let i = 0; i < 40; i += 1) {
      const client = window.supabase;
      if (client && typeof client.from === "function" && client.auth?.getSession) {
        const sessionResult = await client.auth.getSession();
        if (sessionResult?.data?.session?.access_token) return client;
        throw new Error("Sign in to RoomBoard before sending captured appointments.");
      }
      await delay(150);
    }
    throw new Error("RoomBoard sync is still starting. Try again in a moment.");
  }

  async function resolvePracticeId(client) {
    const current = normalizeSpaces(window.currentPracticeId || window.__roomboardPracticeId || "");
    if (current) return current;

    const rpc = await client.rpc("get_my_practice_id");
    if (!rpc.error && normalizeSpaces(rpc.data)) return normalizeSpaces(rpc.data);

    const userResult = await client.auth.getUser();
    const userId = userResult?.data?.user?.id || "";
    if (!userId) throw new Error("Could not determine your RoomBoard clinic.");

    const profile = await queryOrThrow(client.from("profiles").select("practice_id").eq("user_id", userId).limit(1));
    const practiceId = normalizeSpaces(asArray(profile)[0]?.practice_id || "");
    if (!practiceId) throw new Error("Could not determine your RoomBoard clinic.");
    return practiceId;
  }

  async function queryOrThrow(query) {
    const result = await query;
    if (result.error) throw result.error;
    return result.data;
  }

  function buildInitialFormState(boardData, captured) {
    const parsed = captured?.parsed || {};
    const rooms = Array.isArray(boardData.rooms) ? boardData.rooms : [];
    const preferredRoom = rooms.find((room) => !room.patientName && !room.needsCleaning) || rooms.find((room) => !room.needsCleaning) || rooms[0];
    return {
      roomId: preferredRoom?.id || "",
      patientName: parsed.patientName || "",
      colorLabelId: findBestColorLabelId(boardData, parsed),
      doctor: findBestDoctor(boardData, parsed),
      tech: "",
      quickNote: "",
      notes: buildNotes(parsed, captured),
      roomReady: false,
      doctorReady: false
    };
  }

  function buildFallbackFormState(captured) {
    const parsed = captured?.parsed || {};
    return {
      roomId: "",
      patientName: parsed.patientName || "",
      colorLabelId: "",
      doctor: parsed.doctor || "",
      tech: "",
      quickNote: "",
      notes: buildNotes(parsed, captured),
      roomReady: false,
      doctorReady: false
    };
  }

  function renderForm() {
    const data = state.boardData || { rooms: [], colorLabels: [], doctors: [""], quickNotes: [""] };
    const form = state.form || buildFallbackFormState(state.captured);

    fillSelect(els.room, data.rooms.map((room) => ({
      value: room.id,
      label: formatRoomOption(room)
    })), "Choose room");
    fillSelect(els.type, data.colorLabels.map((label) => ({
      value: label.id,
      label: label.title
    })), "Choose type");
    fillSelect(els.doctor, (data.doctors || [""]).map((doctor) => ({
      value: doctor,
      label: doctor || "No doctor"
    })));
    fillSelect(els.quickNote, (data.quickNotes || [""]).map((note) => ({
      value: note,
      label: note || "No quick note"
    })));

    els.room.value = form.roomId || "";
    els.patient.value = form.patientName || "";
    els.type.value = form.colorLabelId || "";
    els.doctor.value = form.doctor || "";
    els.tech.value = form.tech || "";
    els.quickNote.value = form.quickNote || "";
    els.notes.value = form.notes || "";
    els.roomReady.checked = !!form.roomReady;
    els.doctorReady.checked = !!form.doctorReady;
  }

  function fillSelect(select, values, placeholder) {
    select.innerHTML = "";
    if (placeholder) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.appendChild(option);
    }
    values.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      select.appendChild(option);
    });
  }

  function syncFormFromFields() {
    if (!state.form) state.form = buildFallbackFormState(state.captured);
    state.form.roomId = els.room.value;
    state.form.patientName = els.patient.value;
    state.form.colorLabelId = els.type.value;
    state.form.doctor = els.doctor.value;
    state.form.tech = els.tech.value;
    state.form.quickNote = els.quickNote.value;
    state.form.notes = els.notes.value;
    state.form.roomReady = !!els.roomReady.checked;
    state.form.doctorReady = !!els.doctorReady.checked;
  }

  function handleRoomChange() {
    syncFormFromFields();
    const room = (state.boardData?.rooms || []).find((entry) => entry.id === state.form.roomId);
    if (!room || !state.captured) return;
    state.form = {
      ...state.form,
      colorLabelId: state.form.colorLabelId || room.colorLabelId || state.boardData?.settings?.defaultColorLabelId || "",
      doctor: state.form.doctor || room.doctor || "",
      tech: state.form.tech || room.tech || "",
      quickNote: state.form.quickNote || room.quickNote || ""
    };
    renderForm();
  }

  async function sendAppointment() {
    syncFormFromFields();
    if (!state.form?.roomId) {
      showStatus("Choose a room first.", "error");
      return;
    }
    if (!normalizeSpaces(state.form.patientName)) {
      showStatus("Patient name is required.", "error");
      return;
    }
    if (!normalizeSpaces(state.form.colorLabelId)) {
      showStatus("Choose an appointment type.", "error");
      return;
    }

    try {
      showStatus("Sending to RoomBoard...");
      const result = await sendViaRoomBoardSync();
      const room = result.room;
      showToast(`${room.patientName} sent to ${room.name || "room"}.`);
      closePanel();
      state.boardData = getActiveBoardData();
      if (!state.boardData) refreshMainBoard();
    } catch (error) {
      showStatus(getErrorMessage(error), "error");
    }
  }

  async function sendViaRoomBoardSync() {
    const appState = getActiveAppState();
    if (!appState) {
      throw new Error("RoomBoard sync is still starting. Try again in a moment.");
    }
    if (typeof window.commitBoardNow !== "function") {
      throw new Error("RoomBoard sync is not ready yet. Try again in a moment.");
    }

    const room = appState.rooms.find((entry) => entry && entry.id === state.form.roomId);
    if (!room) throw new Error("That room could not be found.");

    const hadPatientBefore = hasAssignedPatient(room);
    if (typeof window.holdRemoteUpdates === "function") window.holdRemoteUpdates(2500);

    applyFormToRoom(room, appState);

    if (typeof window.syncRoomSessionAfterOccupancyChange === "function") {
      await window.syncRoomSessionAfterOccupancyChange(room, hadPatientBefore, {
        autoStartTimer: true,
        clearReadyWhenEmpty: false,
        stopTimerWhenEmpty: false
      });
    } else {
      await ensureRoomTimerStarted(room);
    }

    await window.commitBoardNow({ skipLocalSave: false });
    if (typeof window.requestBoardRoomRefresh === "function") {
      window.requestBoardRoomRefresh([room.id], { includeIntake: true });
    } else {
      refreshMainBoard();
    }
    return { room };
  }

  function applyFormToRoom(room, appState) {
    const colorLabels = Array.isArray(appState.colorLabels) ? appState.colorLabels : [];
    room.patientName = normalizeSpaces(state.form.patientName);
    room.colorLabelId = state.form.colorLabelId || room.colorLabelId || getDefaultColorLabelId(colorLabels);
    room.colorHex = "";
    room.doctor = state.form.doctor || "";
    room.tech = normalizeSpaces(state.form.tech || "");
    setRoomQuickNote(room, state.form.quickNote || "");
    room.notes = normalizeSpaces(state.form.notes || "");
    room.roomReady = !!state.form.roomReady;
    room.doctorReady = !!state.form.doctorReady;
    room.timer = normalizeTimer(room.timer);
    room.cleaningTimer = normalizeTimer(room.cleaningTimer);

    const selectedColor = colorLabels.find((label) => label.id === room.colorLabelId);
    if (selectedColor?.title) room.reason = selectedColor.title;
  }

  function setRoomQuickNote(room, value) {
    const note = normalizeSpaces(value);
    if (typeof window.setRoomQuickNotes === "function") {
      window.setRoomQuickNotes(room, note ? [note] : []);
      return;
    }
    room.quickNote = note;
    room.quickNotes = note ? [note] : [];
  }

  async function ensureRoomTimerStarted(room) {
    room.needsCleaning = false;
    room.activeCleaningSessionId = null;
    room.cleaningTimer = normalizeTimer(room.cleaningTimer);
    room.cleaningTimer.running = false;
    room.cleaningTimer.startedAt = null;
    room.cleaningTimer.startedAtIso = null;
    room.timer = normalizeTimer(room.timer);
    if (!room.timer.running && computeElapsed(room.timer) === 0) {
      const serverNowIso = await getServerNowIso();
      if (typeof window.applyTimerStartAt === "function") {
        window.applyTimerStartAt(room.timer, serverNowIso);
      } else {
        room.timer.elapsedMs = Math.max(0, Number(room.timer.elapsedMs || 0));
        room.timer.baseElapsedMs = Math.max(0, Number(room.timer.baseElapsedMs != null ? room.timer.baseElapsedMs : room.timer.elapsedMs));
        room.timer.running = true;
        room.timer.startedAt = null;
        room.timer.startedAtIso = serverNowIso;
      }
    }
  }

  async function getServerNowIso() {
    if (typeof window.getServerNowIso === "function") {
      return await window.getServerNowIso();
    }
    const client = await waitForSupabaseClient();
    return await fetchServerNowIso(client);
  }

  function hasAssignedPatient(room) {
    if (typeof window.roomHasAssignedPatient === "function") return window.roomHasAssignedPatient(room);
    return !!normalizeSpaces(room?.patientName || "");
  }

  function refreshMainBoard() {
    if (typeof window.refreshPracticeDataNow === "function") {
      window.refreshPracticeDataNow("Refreshing").catch(() => {});
      return;
    }
    if (typeof window.loadPracticeData === "function") {
      window.loadPracticeData().catch(() => {});
    }
  }

  async function fetchServerNowIso(client) {
    try {
      const result = await client.rpc("get_server_now_iso");
      if (!result.error) return normalizeServerNowIso(result.data) || new Date().toISOString();
    } catch (_error) {}
    return new Date().toISOString();
  }

  function parseCapturedText(payload) {
    const rawText = String(payload?.text || payload?.name || "").trim();
    const lines = rawText
      .split(/\r?\n|\s+\|\s+/)
      .map((line) => normalizeCalendarLine(line))
      .filter(Boolean)
      .filter((line, index, all) => all.indexOf(line) === index);

    const appointmentTime = lines.find((line) => TIME_RANGE_RE.test(line))?.match(TIME_RANGE_RE)?.[0]
      || lines.find((line) => SINGLE_TIME_RE.test(line))?.match(SINGLE_TIME_RE)?.[0]
      || "";

    const doctor = lines.find((line) => DOCTOR_RE.test(line)) || "";
    const patientLineIndex = findPatientLineIndex(lines, appointmentTime);
    const patientName = patientLineIndex >= 0 ? extractCalendarPatientName(lines[patientLineIndex]) : "";
    const reasonLines = lines.filter((line, index) => {
      if (!line) return false;
      if (index === patientLineIndex || line === patientName || line === doctor || line === appointmentTime) return false;
      if (TIME_RANGE_RE.test(line) || SINGLE_TIME_RE.test(line)) return false;
      return isLikelyAppointmentReasonLine(line);
    });

    return {
      patientName,
      reason: reasonLines.slice(0, 3).join(", "),
      doctor,
      appointmentTime,
      rawText
    };
  }

  function normalizeCalendarLine(line) {
    return normalizeSpaces(line)
      .replace(/^[|.*-]+/, "")
      .replace(/\s+[xX]\s*$/, "")
      .trim();
  }

  function findPatientLineIndex(lines, appointmentTime) {
    const demographicIndex = lines.findIndex((line) => {
      if (!isLikelyPatientLine(line, appointmentTime)) return false;
      return /^\W*\([A-Z?]\s*,?\s*\d{0,3}\)/i.test(line);
    });
    if (demographicIndex >= 0) return demographicIndex;
    return lines.findIndex((line) => isLikelyPatientLine(line, appointmentTime));
  }

  function isLikelyPatientLine(line, appointmentTime) {
    if (!line) return false;
    if (line === appointmentTime || TIME_RANGE_RE.test(line) || SINGLE_TIME_RE.test(line)) return false;
    if (DOCTOR_RE.test(line)) return false;
    if (PHONE_RE.test(line) || CONTACT_LINE_RE.test(line)) return false;
    if (/^lunch$/i.test(line)) return false;
    if (/^(?:pro|bw|bwx|exam|pexam|tx|srp|oh|fmxl?|pfm|comp)\b/i.test(line)) return false;
    const name = extractCalendarPatientName(line);
    if (!name || name.length > 60) return false;
    const words = name.replace(/\([^)]+\)/g, "").trim().split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 5) return false;
    return words.every((word) => /^[A-Za-z'`.-]+$/.test(word));
  }

  function extractCalendarPatientName(line) {
    const cleaned = normalizeSpaces(line)
      .replace(/^[?!*+\-\u2013\u2014\s]+/, "")
      .replace(/^\([A-Z?]\s*,?\s*\d{0,3}\)\s*/i, "")
      .replace(/^\[[^\]]+\]\s*/, "")
      .replace(/\s+[xX]\s*$/, "")
      .trim();
    const match = cleaned.match(PATIENT_NAME_RE);
    return normalizeSpaces(match?.[1] || cleaned).replace(/[,:;]+$/, "").trim();
  }

  function isLikelyAppointmentReasonLine(line) {
    const text = normalizeSpaces(line);
    if (!text || /^lunch$/i.test(text)) return false;
    if (PHONE_RE.test(text) || CONTACT_LINE_RE.test(text)) return false;
    if (/^\(?\d+\)?$/.test(text)) return false;
    const letters = text.replace(/[^A-Za-z]/g, "");
    const upperRatio = letters.split("").filter((ch) => ch === ch.toUpperCase()).length / Math.max(1, letters.length);
    const hasProcedureShape = /(?:\b[A-Z]{2,}\b|\b[A-Z]+\([^)]{1,12}\)|,)/.test(text);
    const digitRatio = text.replace(/\D/g, "").length / Math.max(1, text.length);
    return /[A-Za-z]/.test(text) && digitRatio < 0.35 && (hasProcedureShape || upperRatio > 0.6 || text.length <= 42);
  }

  function buildNotes(parsed, payload) {
    const parts = [];
    if (parsed.appointmentTime) parts.push(`Time: ${parsed.appointmentTime}`);
    if (parsed.reason) parts.push(`Reason: ${parsed.reason}`);
    if (payload?.windowTitle) parts.push(`Source: ${payload.windowTitle}`);
    if (parsed.rawText) parts.push(`Captured text:\n${parsed.rawText}`);
    return parts.join("\n\n");
  }

  function findBestColorLabelId(boardData, parsed) {
    const labels = boardData?.colorLabels || [];
    const haystack = normalizeLoose(`${parsed.reason || ""} ${parsed.rawText || ""}`);
    if (!haystack) return boardData?.settings?.defaultColorLabelId || labels[0]?.id || "";
    const exact = labels.find((label) => haystack.includes(normalizeLoose(label.title)));
    return exact?.id || boardData?.settings?.defaultColorLabelId || labels[0]?.id || "";
  }

  function findBestDoctor(boardData, parsed) {
    const doctors = boardData?.doctors || [];
    const doctorText = normalizeLoose(parsed.doctor || parsed.rawText || "");
    const match = doctors.find((doctor) => doctor && doctorText.includes(normalizeLoose(doctor)));
    return match || "";
  }

  function formatRoomOption(room) {
    const patient = normalizeSpaces(room.patientName || "");
    const cleaning = room.needsCleaning ? " - cleaning" : "";
    return `${room.name || room.id}${patient ? " - " + patient : cleaning}`;
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

  function showStatus(message, kind) {
    els.status.textContent = String(message || "");
    els.status.classList.toggle("isError", kind === "error");
    els.status.classList.toggle("isOk", kind === "ok");
  }

  function showToast(message) {
    const text = normalizeSpaces(message);
    if (!text || !els?.toast) return;
    els.toast.textContent = text;
    els.toast.classList.add("isVisible");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      els.toast.classList.remove("isVisible");
    }, 3000);
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown error.";
    if (typeof error === "string") return error;
    const parts = [];
    if (error.code) parts.push(`code ${error.code}`);
    if (error.message) parts.push(error.message);
    if (error.details) parts.push(error.details);
    if (error.hint) parts.push(`Hint: ${error.hint}`);
    if (parts.length) return parts.join(" | ");
    try {
      return JSON.stringify(error);
    } catch (_error) {
      return String(error);
    }
  }

  function normalizeSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeLoose(value) {
    return normalizeSpaces(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function injectStyles() {
    if (document.getElementById("desktopCapturePanelStyles")) return;
    const style = document.createElement("style");
    style.id = "desktopCapturePanelStyles";
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        top: 14px;
        right: 14px;
        bottom: 14px;
        z-index: 2147483000;
        display: none;
        width: min(420px, calc(100vw - 28px));
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID}.isOpen {
        display: block;
      }
      .desktopCaptureCard {
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.36);
        border-radius: 8px;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
        color: #0f172a;
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 100%;
        overflow: auto;
        padding: 14px;
      }
      .desktopCaptureHeader,
      .desktopCaptureFooter,
      .desktopCaptureChecks {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: space-between;
      }
      .desktopCaptureEyebrow {
        color: #0f766e;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .desktopCaptureHeader h2 {
        font-size: 22px;
        line-height: 1.1;
        margin: 0;
      }
      .desktopCaptureStatus {
        background: #eef3f7;
        border: 1px solid transparent;
        border-radius: 8px;
        color: #526173;
        font-size: 12px;
        line-height: 1.4;
        min-height: 34px;
        padding: 8px 10px;
      }
      .desktopCaptureStatus.isOk {
        background: #d9f7ef;
        border-color: #99f6e4;
        color: #115e59;
      }
      .desktopCaptureStatus.isError {
        background: #fee2e2;
        border-color: #fecaca;
        color: #b91c1c;
      }
      .desktopCaptureGrid {
        display: grid;
        gap: 10px;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
      .desktopCaptureFull {
        grid-column: 1 / -1;
      }
      .desktopCaptureField {
        color: #526173;
        display: flex;
        flex-direction: column;
        font-size: 12px;
        font-weight: 800;
        gap: 6px;
      }
      .desktopCaptureField input,
      .desktopCaptureField select,
      .desktopCaptureField textarea {
        background: #fff;
        border: 1px solid #d6dee8;
        border-radius: 8px;
        color: #0f172a;
        font: inherit;
        min-height: 38px;
        padding: 8px 10px;
        width: 100%;
      }
      .desktopCaptureField textarea {
        line-height: 1.35;
        min-height: 92px;
        resize: vertical;
      }
      .desktopCapturePreview {
        background: #fff;
        border: 1px solid #d6dee8;
        border-radius: 8px;
        overflow: hidden;
        padding: 6px;
      }
      .desktopCapturePreview img {
        display: block;
        max-height: 170px;
        max-width: 100%;
        object-fit: contain;
      }
      .desktopCaptureChecks {
        justify-content: flex-start;
      }
      .desktopCaptureChecks label {
        align-items: center;
        display: inline-flex;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
      }
      #${PANEL_ID} button {
        align-items: center;
        background: #fff;
        border: 1px solid #b8c4d2;
        border-radius: 8px;
        color: #0f172a;
        cursor: pointer;
        display: inline-flex;
        font: inherit;
        font-size: 13px;
        font-weight: 800;
        justify-content: center;
        min-height: 36px;
        padding: 8px 12px;
      }
      #${PANEL_ID} .desktopCapturePrimary {
        background: #0f766e;
        border-color: #0f766e;
        color: #ecfeff;
      }
      #${PANEL_ID} .desktopCaptureIconBtn {
        background: #eef3f7;
        border-color: transparent;
        height: 34px;
        padding: 0;
        width: 34px;
      }
      #${TOAST_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483001;
        transform: translateY(12px);
        opacity: 0;
        transition: opacity 140ms ease, transform 140ms ease;
        padding: 10px 14px;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.96);
        color: #f8fafc;
        font: 700 13px/1.35 Inter, ui-sans-serif, system-ui, sans-serif;
        max-width: min(420px, calc(100vw - 36px));
        pointer-events: none;
      }
      #${TOAST_ID}.isVisible {
        opacity: 1;
        transform: translateY(0);
      }
      @media (max-width: 640px) {
        #${PANEL_ID} {
          inset: 8px;
          width: auto;
        }
        .desktopCaptureGrid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }
})();

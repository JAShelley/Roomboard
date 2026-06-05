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
  const DOCTOR_NAME_RE = /\b(?:dr\.?|doctor|d\.?\s*v\.?\s*m\.?|dvm)\b/i;
  const PATIENT_NAME_RE = /^[^\w(]*(?:\([A-Z?]\s*,?\s*\d{0,3}\)\s*)?([A-Z][A-Za-z'`.-]+(?:\s+[A-Z][A-Za-z'`.-]+)*(?:\s+\([^)]+\))?)/;
  const PHONE_RE = /\b(?:\(?\d{3}\)?[-.\s]*)?\d{3}[-.\s]\d{4}\b|\(\d{3}\)/;
  const CONTACT_LINE_RE = /^(?:[HWC]\.?\s*)?(?:\(?\d{3}\)?[-.\s]*)?\d{3}[-.\s]\d{4}\b/i;
  const ROOM_HINT_RE = /\b(?:exam\s+room|room|rm|treatment|tx|surgery|sx|tech|triage|isolation|drop\s*off|boarding|kennel|exam)\s*#?\s*([A-Za-z0-9-]+)?\b/i;
  const SURGERY_COLUMN_RE = /\b(?:surgery|sx)\b/i;
  const TECH_COLUMN_RE = /\b(?:tech|walk back|walkback)\b/i;
  const DROP_OFF_COLUMN_RE = /\b(?:drop ?off|dropoff)\b/i;
  const TYPE_ALIAS_GROUPS = [
    { aliases: ["euth", "euthanasia", "pts", "put to sleep", "quality of life", "qol"], labels: ["euthanasia consult", "euthanasia"] },
    { aliases: ["sx", "surgery", "surgical", "spay", "neuter", "dental", "mass", "fracture", "procedure"], labels: ["sx consult", "surgery consult", "surgery", "consult"] },
    { aliases: ["drop off", "dropoff", "sedated", "day admit", "admit"], labels: ["drop-off", "drop off"] },
    { aliases: ["tech", "walk back", "walkback", "nail", "laser", "blood draw", "bw", "anal glands"], labels: ["tech appt", "tech"] },
    { aliases: ["recheck", "follow up", "followup", "re chk", "rechk"], labels: ["exam", "recheck", "wellness"] },
    { aliases: ["new puppy", "new kitten", "new pt", "new patient", "exam", "annual", "wellness", "consult"], labels: ["exam", "wellness"] },
    { aliases: ["vaccine", "vacc", "vaccs", "booster", "rabies", "dhpp", "bordetella", "bord", "lepto", "lyme", "flu"], labels: ["vaccine", "vacc", "wellness"] },
    { aliases: ["illness injury", "illness/injury", "injury illness", "illness", "injury", "sick", "vomit", "diarrhea", "limp", "pain", "cough", "itch", "ear"], labels: ["illness/injury", "illness injury", "sick", "exam"] },
    { aliases: ["outside contagious", "outside contageous", "outside constagious", "outside", "contagious", "car", "isolation"], labels: ["outside contagious", "car isolation", "car - isolation"] }
  ];
  const PULSE_TYPE_LABEL_MAP = [
    { pulse: ["surgery consult"], vetboard: ["sx consult"] },
    { pulse: ["surgical"], vetboard: ["sx consult"] },
    { pulse: ["dental"], vetboard: ["sx consult"] },
    { pulse: ["emergency"], vetboard: ["emergency"] },
    { pulse: ["euthanasia", "euthanasia consult", "quality of life", "qol", "pts"], vetboard: ["euthanasia consult", "euthanasia"] },
    { pulse: ["illness/injury", "illness / injury", "illness injury", "injury illness"], vetboard: ["illness/injury", "illness injury"] },
    { pulse: ["exam"], vetboard: ["exam"] },
    { pulse: ["recheck"], vetboard: ["exam", "recheck"] },
    { pulse: ["new puppy/kitten", "new puppy kitten", "new puppy", "new kitten"], vetboard: ["exam", "wellness"] },
    { pulse: ["ultrasound", "ultra sound", "u/s", "abd ultrasound", "abdominal ultrasound"], vetboard: ["ultrasound", "u/s"] },
    { pulse: ["tech/walk back", "tech/walkback", "tech walk back", "tech walkback"], vetboard: ["tech/walkback", "tech/walk back", "tech appt", "tech"] },
    { pulse: ["outside**contagious", "outside contagious", "outside contageous", "outside constagious"], vetboard: ["outside**contagious", "outside contagious", "car isolation", "car - isolation"] },
    { pulse: ["work-in", "work in"], vetboard: ["work-in", "work in"] },
    { pulse: ["drop off", "drop-off", "sample drop off"], vetboard: ["work-in", "work in", "drop-off", "drop off"] },
    { pulse: ["bandage change"], vetboard: ["tech/walkback", "tech/walk back", "tech appt", "tech"] },
    { pulse: ["surgical referral"], vetboard: ["sx consult"] }
  ];

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
    bindQuickSendHostEvents();
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

  function bindQuickSendHostEvents() {
    if (typeof api.onQuickSendRequest !== "function" || typeof api.sendQuickSendResponse !== "function") return;
    api.onQuickSendRequest(async (request) => {
      const requestId = request?.requestId || "";
      try {
        const response = await handleQuickSendRequest(request);
        api.sendQuickSendResponse({
          requestId,
          ok: true,
          ...response
        });
      } catch (error) {
        api.sendQuickSendResponse({
          requestId,
          ok: false,
          error: getErrorMessage(error),
          snapshot: buildQuickSendSnapshot({ statusMessage: getErrorMessage(error), statusKind: "error" })
        });
      }
    });
  }

  async function handleQuickSendRequest(request) {
    const action = String(request?.action || "").trim();
    const payload = request?.payload || {};

    if (action === "open") {
      openPanel();
      await ensureBoardData();
      return { snapshot: buildQuickSendSnapshot({ statusMessage: "Ready." }) };
    }

    if (action === "snapshot" || action === "refresh") {
      await ensureBoardData();
      return { snapshot: buildQuickSendSnapshot({ statusMessage: state.captured ? "Review the fields, then send." : "Capture an appointment from the menu bar." }) };
    }

    if (action === "set-form") {
      state.form = normalizeExternalForm(payload.form || {});
      renderForm();
      return { snapshot: buildQuickSendSnapshot({ statusMessage: "Ready." }) };
    }

    if (action === "send") {
      await ensureBoardData();
      state.form = normalizeExternalForm(payload.form || {});
      renderForm();
      const result = await sendAppointment({ closePanel: false, throwOnError: true });
      return {
        room: result?.room || null,
        snapshot: buildQuickSendSnapshot({
          statusMessage: result?.room?.patientName ? `${result.room.patientName} sent to ${result.room.name || "room"}.` : "Sent to RoomBoard.",
          statusKind: "ok"
        })
      };
    }

    return { snapshot: buildQuickSendSnapshot({ statusMessage: "Ready." }) };
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
      const result = typeof api.startHover === "function" ? await api.startHover() : await api.start();
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
    if (!payload?.quickSendPopoutOpen) openPanel();
    showStatus("Appointment captured. Loading rooms...", "ok");
    renderPreview(payload);

    try {
      await ensureBoardData();
      state.form = buildInitialFormState(state.boardData, state.captured);
      renderForm();
      showStatus("Review the fields, then send.", "ok");
      publishQuickSendSnapshot("Review the fields, then send.", "ok");
    } catch (error) {
      state.form = buildFallbackFormState(state.captured);
      renderForm();
      showStatus(getErrorMessage(error), "error");
      publishQuickSendSnapshot(getErrorMessage(error), "error");
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

  function publishQuickSendSnapshot(statusMessage, statusKind) {
    if (typeof api.publishQuickSendSnapshot !== "function") return;
    api.publishQuickSendSnapshot(buildQuickSendSnapshot({ statusMessage, statusKind }));
  }

  function buildQuickSendSnapshot(options = {}) {
    const data = state.boardData || getActiveBoardData() || { rooms: [], colorLabels: [], doctors: [""], quickNotes: [""] };
    const form = state.form || buildFallbackFormState(state.captured);
    const diagnostics = buildCaptureDiagnostics(data, form);
    return {
      statusMessage: options.statusMessage || (state.captured ? "Review the fields, then send." : "Capture an appointment from the menu bar."),
      statusKind: options.statusKind || "",
      preview: {
        imageDataUrl: state.captured?.imageDataUrl || ""
      },
      form: { ...form },
      rooms: (data.rooms || []).map((room) => ({
        value: room.id,
        label: formatRoomOption(room)
      })),
      colorLabels: (data.colorLabels || []).map((label) => ({
        value: label.id,
        label: label.title
      })),
      doctors: (data.doctors || [""]).map((doctor) => ({
        value: doctor,
        label: doctor || "No doctor"
      })),
      quickNotes: (data.quickNotes || [""]).map((note) => ({
        value: note,
        label: note || "No quick note"
      })),
      confidence: buildCaptureConfidence(data, form),
      warnings: buildCaptureWarnings(data, form),
      diagnostics,
      captured: state.captured ? {
        method: state.captured.captureMethod || "",
        hasImage: !!state.captured.imageDataUrl,
        patientName: state.captured.parsed?.patientName || "",
        roomHint: state.captured.parsed?.roomHint || "",
        appointmentTime: state.captured.parsed?.appointmentTime || ""
      } : null
    };
  }

  function buildCaptureConfidence(boardData, form) {
    const parsed = state.captured?.parsed || {};
    const room = findRoomById(boardData, form.roomId);
    const label = findColorLabelById(boardData, form.colorLabelId);
    return {
      patient: parsed.patientName ? "Detected from capture text" : "Not found in capture",
      room: parsed.roomHint && room ? `Matched ${room.name || "room"} from scheduler` : (room ? "First open room fallback" : "No room selected"),
      type: parsed.reason && label ? `Matched ${label.title || "type"} from appointment` : (label ? "Default type fallback" : "No type selected"),
      doctor: form.doctor ? "Matched from doctor/provider text" : "No doctor detected"
    };
  }

  function buildCaptureWarnings(boardData, form) {
    const warnings = [];
    const room = findRoomById(boardData, form.roomId);
    if (!normalizeSpaces(form.patientName)) warnings.push("Patient was not detected. Review before sending.");
    if (!normalizeSpaces(form.colorLabelId)) warnings.push("Appointment type is missing.");
    if (room?.patientName) warnings.push(`${room.name || "Selected room"} already has ${normalizeSpaces(room.patientName)}.`);
    if (room?.needsCleaning) warnings.push(`${room.name || "Selected room"} is marked cleaning.`);
    if (state.captured?.imageDataUrl && !normalizeSpaces(state.captured?.parsed?.rawText || "")) {
      warnings.push("This capture came from an image preview. Review text carefully.");
    }
    return warnings;
  }

  function buildCaptureDiagnostics(boardData, form) {
    const captured = state.captured || null;
    if (!captured) return null;
    const parsed = captured?.parsed || {};
    const room = findRoomById(boardData, form.roomId);
    const label = findColorLabelById(boardData, form.colorLabelId);
    return {
      generatedAt: new Date().toISOString(),
      source: captured ? {
        method: captured.captureMethod || "",
        windowTitle: captured.windowTitle || "",
        processName: captured.processName || "",
        controlType: captured.controlType || "",
        hasImage: !!captured.imageDataUrl,
        bounds: captured.bounds || null,
        visualBounds: captured.visualBounds || null,
        textLength: String(captured.text || captured.name || "").length,
        textPreview: redactPreview(captured.text || captured.name || "")
      } : null,
      parsed: {
        patientName: parsed.patientName || "",
        appointmentTime: parsed.appointmentTime || "",
        reason: parsed.reason || "",
        doctor: parsed.doctor || "",
        roomHint: parsed.roomHint || "",
        columnHeader: parsed.columnHeader || ""
      },
      selected: {
        roomId: form.roomId || "",
        roomName: room?.name || "",
        roomOccupied: !!normalizeSpaces(room?.patientName || ""),
        roomNeedsCleaning: !!room?.needsCleaning,
        typeId: form.colorLabelId || "",
        typeTitle: label?.title || "",
        doctor: form.doctor || "",
        hasPatientName: !!normalizeSpaces(form.patientName || "")
      },
      confidence: buildCaptureConfidence(boardData, form),
      warnings: buildCaptureWarnings(boardData, form)
    };
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
    const preferredRoom = findBestRoom(boardData, parsed)
      || rooms.find((room) => !room.patientName && !room.needsCleaning)
      || rooms.find((room) => !room.needsCleaning)
      || rooms[0];
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

  function normalizeExternalForm(form) {
    const fallback = state.form || buildFallbackFormState(state.captured);
    const next = {
      roomId: normalizeSpaces(form.roomId || fallback.roomId || ""),
      patientName: normalizeSpaces(form.patientName || fallback.patientName || ""),
      colorLabelId: normalizeSpaces(form.colorLabelId || fallback.colorLabelId || ""),
      doctor: normalizeSpaces(form.doctor || fallback.doctor || ""),
      tech: normalizeSpaces(form.tech || fallback.tech || ""),
      quickNote: normalizeSpaces(form.quickNote || fallback.quickNote || ""),
      notes: String(form.notes != null ? form.notes : (fallback.notes || "")).trim(),
      roomReady: form.roomReady != null ? !!form.roomReady : !!fallback.roomReady,
      doctorReady: form.doctorReady != null ? !!form.doctorReady : !!fallback.doctorReady
    };

    if (!next.colorLabelId && state.boardData) {
      next.colorLabelId = state.boardData.settings?.defaultColorLabelId || state.boardData.colorLabels?.[0]?.id || "";
    }
    return next;
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

  async function sendAppointment(options = {}) {
    syncFormFromFields();
    if (!state.form?.roomId) {
      showStatus("Choose a room first.", "error");
      if (options.throwOnError) throw new Error("Choose a room first.");
      return;
    }
    if (!normalizeSpaces(state.form.patientName)) {
      showStatus("Patient name is required.", "error");
      if (options.throwOnError) throw new Error("Patient name is required.");
      return;
    }
    if (!normalizeSpaces(state.form.colorLabelId)) {
      showStatus("Choose an appointment type.", "error");
      if (options.throwOnError) throw new Error("Choose an appointment type.");
      return;
    }

    try {
      showStatus("Sending to RoomBoard...");
      const result = await sendViaRoomBoardSync();
      const room = result.room;
      showToast(`${room.patientName} sent to ${room.name || "room"}.`);
      if (options.closePanel !== false) closePanel();
      state.boardData = getActiveBoardData();
      if (!state.boardData) refreshMainBoard();
      publishQuickSendSnapshot(`${room.patientName} sent to ${room.name || "room"}.`, "ok");
      return result;
    } catch (error) {
      showStatus(getErrorMessage(error), "error");
      publishQuickSendSnapshot(getErrorMessage(error), "error");
      if (options.throwOnError) throw error;
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
    const sourceText = normalizeSpaces([
      payload?.windowTitle,
      payload?.processName,
      payload?.controlType,
      payload?.automationId,
      payload?.className
    ].filter(Boolean).join(" "));
    const lines = rawText
      .split(/\r?\n|\s+\|\s+/)
      .map((line) => normalizeCalendarLine(line))
      .flatMap((line) => expandCapturedLine(line))
      .filter(Boolean)
      .filter((line, index, all) => all.indexOf(line) === index);

    const pulseDetails = parsePulseDetails(lines);
    const appointmentTime = lines.find((line) => TIME_RANGE_RE.test(line))?.match(TIME_RANGE_RE)?.[0]
      || lines.find((line) => SINGLE_TIME_RE.test(line))?.match(SINGLE_TIME_RE)?.[0]
      || "";

    const doctorLine = lines.find((line) => DOCTOR_RE.test(line)) || "";
    const doctor = extractDoctorName(pulseDetails.provider)
      || extractDoctorName(doctorLine)
      || extractDoctorName(rawText);
    const patientLineIndex = findPatientLineIndex(lines, appointmentTime);
    const patientName = cleanPulsePatientName(pulseDetails.patient)
      || (patientLineIndex >= 0 ? extractCalendarPatientName(lines[patientLineIndex]) : "");
    const reasonLines = lines.filter((line, index) => {
      if (!line) return false;
      if (index === patientLineIndex || line === patientName || line === doctorLine || line === doctor || line === appointmentTime) return false;
      if (isPulseDetailLabelOrValue(line, pulseDetails)) return false;
      if (TIME_RANGE_RE.test(line) || SINGLE_TIME_RE.test(line)) return false;
      return isLikelyAppointmentReasonLine(line);
    });
    const reason = [
      pulseDetails.type,
      pulseDetails.description,
      pulseDetails.status,
      ...reasonLines
    ].filter(Boolean).filter((line, index, all) => all.indexOf(line) === index).slice(0, 5).join(", ");
    const inferredColumnHeader = inferWorkflowColumnFromText([
      pulseDetails.type,
      pulseDetails.description,
      pulseDetails.status,
      rawText,
      sourceText
    ].filter(Boolean).join(" | "));
    const roomHint = extractRoomHint([...lines, inferredColumnHeader, sourceText]);
    const columnHeader = chooseBestColumnHeader(
      extractColumnHeader([...lines, sourceText], roomHint),
      inferredColumnHeader
    );

    return {
      patientName,
      reason,
      doctor,
      appointmentTime,
      typeText: pulseDetails.type || reasonLines[0] || "",
      descriptionText: pulseDetails.description || reasonLines.slice(1).join(", "),
      roomHint,
      columnHeader,
      rawText
    };
  }

  function normalizeCalendarLine(line) {
    return normalizeSpaces(line)
      .replace(/^[|.*-]+/, "")
      .replace(/\s+[xX]\s*$/, "")
      .trim();
  }

  function expandCapturedLine(line) {
    const text = normalizeCalendarLine(line);
    if (!text) return [];
    const expanded = [text];
    const rangeMatch = text.match(TIME_RANGE_RE);
    if (rangeMatch?.[0]) {
      const rest = normalizeSpaces(text.replace(rangeMatch[0], " "));
      if (rest) expanded.push(rest);
      return expanded;
    }

    const leadingTime = text.match(/^\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.+)$/i);
    if (leadingTime?.[1] && leadingTime?.[2]) {
      expanded.push(normalizeSpaces(leadingTime[1]));
      expanded.push(normalizeCalendarLine(leadingTime[2]));
    }

    return expanded.filter((value, index, all) => value && all.indexOf(value) === index);
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

  function extractDoctorName(line) {
    let text = normalizeSpaces(line)
      .replace(/^(?:appointment\s+provider|appointment\s+doctor|provider|doctor|dr\.?|dvm|d\.v\.m\.|vet)\s*:?\s*/i, "")
      .replace(/\b(?:appointment\s+provider|appointment\s+doctor|provider|doctor)\b\s*:?\s*/ig, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    const matches = text.match(/\b(?:dr\.?\s+[a-z][a-z' -]+|[a-z][a-z' -]+,\s*d\.?\s*v\.?\s*m\.?|[a-z][a-z' -]+\s+dvm)\b/ig);
    if (matches && matches.length) return normalizeSpaces(matches[0]);
    if (DOCTOR_NAME_RE.test(text) && text.length <= 80) return text;
    return "";
  }

  function parsePulseDetails(lines) {
    const labelMap = {
      "type": "type",
      "appointment type": "type",
      "visit type": "type",
      "description": "description",
      "reason": "description",
      "appointment reason": "description",
      "status": "status",
      "appointment provider": "provider",
      "provider": "provider",
      "doctor": "provider",
      "appointment doctor": "provider",
      "patient": "patient"
    };
    const details = {};
    let currentKey = "";

    asArray(lines).forEach((line) => {
      const text = normalizeSpaces(line);
      const normalized = normalizeLoose(text);
      if (!text || normalized === "visit highlights") return;

      const labelKey = labelMap[normalized];
      if (labelKey) {
        currentKey = labelKey;
        if (!details[currentKey]) details[currentKey] = [];
        return;
      }

      const inline = parseInlinePulseDetail(text, labelMap);
      if (inline) {
        currentKey = inline.key;
        if (!details[currentKey]) details[currentKey] = [];
        details[currentKey].push(inline.value);
        return;
      }

      if (!currentKey) return;
      details[currentKey].push(text);
    });

    return {
      type: normalizeSpaces((details.type || []).join(" ")),
      description: normalizeSpaces((details.description || []).join(" ")),
      status: normalizeSpaces((details.status || []).join(" ")),
      provider: extractDoctorName((details.provider || []).join(" ")) || normalizeSpaces((details.provider || []).join(" ")),
      patient: normalizeSpaces((details.patient || []).join(" "))
    };
  }

  function parseInlinePulseDetail(line, labelMap) {
    const text = normalizeSpaces(line);
    if (!text) return null;
    const colonMatch = text.match(/^([^:]{2,40}):\s*(.+)$/);
    if (colonMatch) {
      const key = labelMap[normalizeLoose(colonMatch[1])];
      const value = normalizeSpaces(colonMatch[2]);
      if (key && value) return { key, value };
    }
    const normalized = normalizeLoose(text);
    for (const rawLabel of Object.keys(labelMap)) {
      if (!normalized.startsWith(rawLabel + " ")) continue;
      const value = normalizeSpaces(text.slice(rawLabel.length));
      if (value) return { key: labelMap[rawLabel], value };
    }
    return null;
  }

  function cleanPulsePatientName(value) {
    return normalizeSpaces(value).split("(")[0].trim();
  }

  function isPulseDetailLabelOrValue(line, details) {
    const normalized = normalizeLoose(line);
    if (["visit highlights", "type", "appointment type", "visit type", "description", "reason", "appointment reason", "status", "appointment provider", "provider", "doctor", "appointment doctor", "patient"].includes(normalized)) {
      return true;
    }
    return [details.type, details.description, details.status, details.provider, details.patient]
      .some((value) => value && normalizeLoose(value) === normalized);
  }

  function extractRoomHint(values) {
    const lines = asArray(values).map((value) => normalizeSpaces(value)).filter(Boolean);
    for (const line of lines) {
      const match = line.match(ROOM_HINT_RE);
      if (!match) continue;
      return normalizeSpaces(String(match[0] || "").replace(/[:#]+$/g, ""));
    }
    return "";
  }

  function extractColumnHeader(lines, roomHint) {
    if (roomHint) return roomHint;
    const candidates = asArray(lines)
      .map((line) => normalizeSpaces(line))
      .filter(Boolean)
      .filter((line) => line.length <= 42)
      .filter((line) => /^(?:tech|surgery|sx|drop\s*off|treatment|triage|isolation|boarding|kennel|exam(?:\s+room)?\s*\d*)$/i.test(line));
    return candidates[0] || "";
  }

  function inferWorkflowColumnFromText(text) {
    const normalized = normalizeLoose(text);
    if (!normalized) return "";
    if (SURGERY_COLUMN_RE.test(normalized) || /\bsx consult\b|\bsurgery consult\b|\bsurgical\b|\bspay\b|\bneuter\b|\bdental\b/.test(normalized)) return "Surgery";
    if (TECH_COLUMN_RE.test(normalized) || /\btech appt\b|\bwalk back\b|\bbandage change\b|\bblood draw\b/.test(normalized)) return "Tech";
    if (DROP_OFF_COLUMN_RE.test(normalized) || /\bday admit\b|\bsample drop off\b/.test(normalized)) return "Drop Off";
    return "";
  }

  function chooseBestColumnHeader(primaryHeader, fallbackHeader) {
    const primary = normalizeSpaces(primaryHeader);
    const fallback = normalizeSpaces(fallbackHeader);
    if (looksLikeWorkflowColumnHeader(primary)) return primary;
    if (looksLikeWorkflowColumnHeader(fallback)) return fallback;
    return primary || fallback || "";
  }

  function looksLikeWorkflowColumnHeader(text) {
    const normalized = normalizeLoose(text);
    return normalized === "surgery" || normalized === "sx" || normalized === "tech" || normalized === "walk back" || normalized === "walkback" || normalized === "drop off" || normalized === "dropoff";
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
    if (parsed.roomHint) parts.push(`Schedule room: ${parsed.roomHint}`);
    if (payload?.windowTitle) parts.push(`Source: ${payload.windowTitle}`);
    if (parsed.rawText) parts.push(`Captured text:\n${parsed.rawText}`);
    return parts.join("\n\n");
  }

  function findBestRoom(boardData, parsed) {
    const rooms = Array.isArray(boardData?.rooms) ? boardData.rooms : [];
    if (!rooms.length) return null;

    const hintText = normalizeSpaces([
      parsed?.roomHint,
      parsed?.columnHeader,
      parsed?.rawText
    ].filter(Boolean).join(" "));
    const hints = buildRoomHintCandidates(hintText);
    if (!hints.length) return null;

    let bestRoom = null;
    let bestScore = 0;
    for (const room of rooms) {
      const score = scoreRoomMatch(room, hints);
      if (score > bestScore) {
        bestScore = score;
        bestRoom = room;
      }
    }

    return bestScore >= 58 ? bestRoom : null;
  }

  function buildRoomHintCandidates(text) {
    const normalized = normalizeSpaces(text);
    if (!normalized) return [];
    const candidates = new Set();
    const hint = extractRoomHint([normalized]);
    if (hint) candidates.add(hint);

    normalized.split(/\r?\n|[,|/]+/).forEach((part) => {
      const value = normalizeSpaces(part);
      if (!value || value.length > 80) return;
      if (ROOM_HINT_RE.test(value) || /^(?:tech|surgery|sx|treatment|triage|isolation|boarding|kennel)$/i.test(value)) {
        candidates.add(value);
      }
    });

    return Array.from(candidates);
  }

  function scoreRoomMatch(room, hints) {
    const roomName = normalizeSpaces(room?.name || room?.id || "");
    const roomKey = normalizeRoomForMatch(roomName);
    if (!roomKey) return 0;

    const roomNumber = extractFirstNumber(roomName);
    let score = 0;
    for (const hint of hints) {
      const hintKey = normalizeRoomForMatch(hint);
      if (!hintKey) continue;
      if (roomKey === hintKey) score = Math.max(score, 100);
      else if (roomKey.includes(hintKey) || hintKey.includes(roomKey)) score = Math.max(score, 84);

      const hintNumber = extractFirstNumber(hint);
      if (roomNumber && hintNumber && roomNumber === hintNumber) score = Math.max(score, 78);

      const overlap = countTokenOverlap(roomKey.split(" "), hintKey.split(" "));
      if (overlap) score = Math.max(score, 42 + overlap * 16);
    }

    if (!room?.patientName && !room?.needsCleaning) score += 10;
    if (room?.patientName) score -= 18;
    if (room?.needsCleaning) score -= 80;
    return score;
  }

  function findBestColorLabelId(boardData, parsed) {
    const labels = boardData?.colorLabels || [];
    const haystack = normalizeLoose(`${parsed.typeText || ""} ${parsed.reason || ""} ${parsed.descriptionText || ""} ${parsed.columnHeader || ""} ${parsed.rawText || ""}`);
    if (!haystack) return boardData?.settings?.defaultColorLabelId || labels[0]?.id || "";

    const alias = findAliasColorLabel(labels, haystack);
    if (alias) return alias.id;

    const exact = labels.find((label) => haystack.includes(normalizeLoose(label.title)));
    if (exact) return exact.id;

    const scored = findBestScoredColorLabel(labels, haystack);
    return scored?.id || boardData?.settings?.defaultColorLabelId || labels[0]?.id || "";
  }

  function findBestDoctor(boardData, parsed) {
    const doctors = boardData?.doctors || [];
    const guesses = [
      parsed?.doctor,
      extractDoctorName(parsed?.rawText || ""),
      parsed?.columnHeader
    ].map((value) => normalizeSpaces(value)).filter(Boolean);
    let bestDoctor = "";
    let bestScore = 0;

    for (const guess of guesses) {
      const guessKey = normalizeDoctorForMatch(guess);
      const guessLast = getDoctorLastToken(guessKey);
      if (!guessKey) continue;

      doctors.forEach((doctor) => {
        const doctorName = normalizeSpaces(doctor);
        const doctorKey = normalizeDoctorForMatch(doctorName);
        if (!doctorKey) return;
        let score = 0;
        if (doctorKey === guessKey) score = 100;
        else if (doctorKey.includes(guessKey) || guessKey.includes(doctorKey)) score = 90;
        else if (guessLast && doctorKey.split(" ").includes(guessLast)) score = 74;
        if (score > bestScore) {
          bestScore = score;
          bestDoctor = doctorName;
        }
      });
    }

    return bestDoctor;
  }

  function findAliasColorLabel(labels, haystack) {
    for (const mapping of PULSE_TYPE_LABEL_MAP) {
      if (!mapping.pulse.some((alias) => haystack.includes(normalizeLoose(alias)))) continue;
      const match = findColorLabelByTerms(labels, mapping.vetboard);
      if (match) return match;
    }

    for (const group of TYPE_ALIAS_GROUPS) {
      if (!group.aliases.some((alias) => haystack.includes(normalizeLoose(alias)))) continue;
      const match = findColorLabelByTerms(labels, group.labels);
      if (match) return match;
    }
    return null;
  }

  function findColorLabelByTerms(labels, terms) {
    for (const term of terms) {
      const termKey = normalizeLoose(term);
      const match = labels.find((label) => normalizeLoose(label.title).includes(termKey));
      if (match) return match;
    }
    return null;
  }

  function findBestScoredColorLabel(labels, searchText) {
    const searchTokens = getSignificantTokens(searchText);
    if (!searchTokens.length) return null;
    let best = null;
    let bestScore = 0;
    labels.forEach((label) => {
      const labelText = normalizeLoose(label.title);
      const labelTokens = getSignificantTokens(labelText);
      if (!labelTokens.length) return;
      let score = 0;
      if (labelText === searchText) score += 500;
      if (searchText.includes(labelText)) score += 260;
      score += countTokenOverlap(labelTokens, searchTokens) * 90;
      if (score > bestScore) {
        bestScore = score;
        best = label;
      }
    });
    return bestScore >= 160 ? best : null;
  }

  function getSignificantTokens(value) {
    return normalizeLoose(value)
      .split(" ")
      .filter((token) => token.length > 1 && !["the", "and", "for", "with", "appt", "appointment", "visit", "patient"].includes(token));
  }

  function countTokenOverlap(values, candidates) {
    if (!Array.isArray(values) || !Array.isArray(candidates)) return 0;
    const set = new Set(candidates);
    return values.reduce((count, value) => count + (set.has(value) ? 1 : 0), 0);
  }

  function normalizeRoomForMatch(value) {
    return normalizeLoose(value)
      .replace(/\bexam room\b/g, "room")
      .replace(/\brm\b/g, "room")
      .replace(/\btx\b/g, "treatment")
      .replace(/\bsx\b/g, "surgery")
      .trim();
  }

  function normalizeDoctorForMatch(value) {
    return normalizeLoose(value)
      .replace(/\bdr\b/g, "")
      .replace(/\bdoctor\b/g, "")
      .replace(/\bdvm\b/g, "")
      .replace(/\bprovider\b/g, "")
      .replace(/\bvet\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getDoctorLastToken(value) {
    const tokens = normalizeDoctorForMatch(value).split(" ").filter(Boolean);
    return tokens.length ? tokens[tokens.length - 1] : "";
  }

  function extractFirstNumber(value) {
    return normalizeSpaces(value).match(/\d+/)?.[0] || "";
  }

  function findRoomById(boardData, roomId) {
    const rooms = Array.isArray(boardData?.rooms) ? boardData.rooms : [];
    return rooms.find((room) => room?.id === roomId) || null;
  }

  function findColorLabelById(boardData, colorLabelId) {
    const labels = Array.isArray(boardData?.colorLabels) ? boardData.colorLabels : [];
    return labels.find((label) => label?.id === colorLabelId) || null;
  }

  function redactPreview(value) {
    return normalizeSpaces(value)
      .replace(/\b(?:\(?\d{3}\)?[-.\s]*)?\d{3}[-.\s]\d{4}\b/g, "[phone]")
      .replace(/\(\d{3}\)/g, "[area]")
      .slice(0, 240);
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

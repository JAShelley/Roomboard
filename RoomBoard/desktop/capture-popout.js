(function () {
  const api = window.roomboardCapture;
  const state = {
    form: {},
    lastSnapshot: null
  };

  const els = {
    status: document.getElementById("statusLine"),
    preview: document.getElementById("preview"),
    previewImage: document.getElementById("previewImage"),
    room: document.getElementById("roomSelect"),
    patient: document.getElementById("patientInput"),
    type: document.getElementById("typeSelect"),
    doctor: document.getElementById("doctorSelect"),
    tech: document.getElementById("techInput"),
    quickNote: document.getElementById("quickNoteSelect"),
    notes: document.getElementById("notesInput"),
    roomReady: document.getElementById("roomReadyInput"),
    doctorReady: document.getElementById("doctorReadyInput"),
    refresh: document.getElementById("refreshBtn"),
    capture: document.getElementById("captureBtn"),
    send: document.getElementById("sendBtn"),
    openRoomBoard: document.getElementById("openRoomBoardBtn")
  };

  boot();

  function boot() {
    if (!api) {
      setStatus("RoomBoard capture bridge is unavailable.", "error");
      return;
    }

    [els.room, els.patient, els.type, els.doctor, els.tech, els.quickNote, els.notes, els.roomReady, els.doctorReady].forEach((field) => {
      field.addEventListener("input", syncFormFromFields);
      field.addEventListener("change", syncFormFromFields);
    });

    els.refresh.addEventListener("click", refresh);
    els.capture.addEventListener("click", capture);
    els.send.addEventListener("click", send);
    els.openRoomBoard.addEventListener("click", () => request("open-main", {}));

    api.onStatus((payload) => {
      const message = normalizeSpaces(payload?.message || "");
      if (message) setStatus(message, payload?.armed ? "ok" : "");
    });
    api.onCaptured(() => {
      setStatus("Appointment captured. Loading fields...", "ok");
      setTimeout(refresh, 250);
    });
    api.onQuickSendSnapshot((snapshot) => {
      applySnapshot(snapshot);
    });

    api.quickSendReady().then(applySnapshot).catch((error) => {
      setStatus(getErrorMessage(error), "error");
    });
  }

  async function refresh() {
    try {
      setStatus("Refreshing...");
      const snapshot = await request("refresh", {});
      applySnapshot(snapshot?.snapshot || snapshot);
    } catch (error) {
      setStatus(getErrorMessage(error), "error");
    }
  }

  async function capture() {
    try {
      setStatus("Capture armed. Hover an appointment box, then click it.", "ok");
      els.capture.disabled = true;
      const result = await request("capture", {});
      if (result?.message) setStatus(result.message, result.ok ? "ok" : "error");
    } catch (error) {
      setStatus(getErrorMessage(error), "error");
    } finally {
      els.capture.disabled = false;
    }
  }

  async function send() {
    try {
      syncFormFromFields();
      setStatus("Sending to RoomBoard...");
      els.send.disabled = true;
      const response = await request("send", { form: state.form });
      applySnapshot(response?.snapshot || response);
    } catch (error) {
      setStatus(getErrorMessage(error), "error");
    } finally {
      els.send.disabled = false;
    }
  }

  async function request(action, payload) {
    return await api.quickSendRequest(action, payload);
  }

  function applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    state.lastSnapshot = snapshot;
    state.form = { ...(snapshot.form || {}) };

    fillSelect(els.room, snapshot.rooms || [], "Choose room");
    fillSelect(els.type, snapshot.colorLabels || [], "Choose type");
    fillSelect(els.doctor, snapshot.doctors || [{ value: "", label: "No doctor" }]);
    fillSelect(els.quickNote, snapshot.quickNotes || [{ value: "", label: "No quick note" }]);

    renderForm();
    renderPreview(snapshot);
    setStatus(snapshot.statusMessage || "Ready.", snapshot.statusKind || "");
  }

  function renderPreview(snapshot) {
    const imageDataUrl = snapshot?.preview?.imageDataUrl || "";
    if (imageDataUrl) {
      els.previewImage.src = imageDataUrl;
      els.preview.hidden = false;
      return;
    }
    els.previewImage.removeAttribute("src");
    els.preview.hidden = true;
  }

  function renderForm() {
    const form = state.form || {};
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

  function syncFormFromFields() {
    state.form = {
      roomId: els.room.value,
      patientName: els.patient.value,
      colorLabelId: els.type.value,
      doctor: els.doctor.value,
      tech: els.tech.value,
      quickNote: els.quickNote.value,
      notes: els.notes.value,
      roomReady: !!els.roomReady.checked,
      doctorReady: !!els.doctorReady.checked
    };
  }

  function fillSelect(select, values, placeholder) {
    const currentValue = select.value;
    select.innerHTML = "";
    if (placeholder) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.appendChild(option);
    }

    values.forEach((entry) => {
      const option = document.createElement("option");
      option.value = entry.value == null ? "" : String(entry.value);
      option.textContent = entry.label == null ? option.value : String(entry.label);
      select.appendChild(option);
    });

    if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
      select.value = currentValue;
    }
  }

  function setStatus(message, kind) {
    els.status.textContent = String(message || "");
    els.status.classList.toggle("isOk", kind === "ok");
    els.status.classList.toggle("isError", kind === "error");
  }

  function normalizeSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown error.";
    if (typeof error === "string") return error;
    if (error.message) return String(error.message);
    try {
      return JSON.stringify(error);
    } catch (_error) {
      return String(error);
    }
  }
})();

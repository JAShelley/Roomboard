(function initVetBoardMiniOverlayBridge() {
  if (window.__vetboardMiniOverlayBridgeInstalled) {
    return;
  }

  window.__vetboardMiniOverlayBridgeInstalled = true;

  function computeElapsed(timer) {
    if (!timer) return 0;
    if (timer.running && timer.startedAt) {
      return (timer.elapsedMs || 0) + (Date.now() - timer.startedAt);
    }
    return timer.elapsedMs || 0;
  }

  function buildSnapshot() {
    const appState = typeof window.getAppState === "function" ? window.getAppState() : window.state;
    if (!appState || !Array.isArray(appState.rooms)) {
      return null;
    }

    const supabaseUrl = window.__SUPABASE_URL__ || "";
    const authCandidates = getAuthStorageCandidates(supabaseUrl);
    let authStorageKey = authCandidates[0] || "vetboard.supabase.auth.v1";
    let rawAuthSession = null;
    for (const candidate of authCandidates) {
      try {
        const stored = window.localStorage.getItem(candidate);
        if (!stored) continue;
        rawAuthSession = JSON.parse(stored);
        authStorageKey = candidate;
        break;
      } catch (_error) {}
    }

    const settings = appState.settings || {};
    const colors = Array.isArray(appState.colorLabels) ? appState.colorLabels : [];
    const colorMap = Object.create(null);
    colors.forEach((entry) => {
      if (entry && entry.id) {
        colorMap[entry.id] = entry;
      }
    });

    const rooms = appState.rooms.map((room, index) => {
      const activeTimer = room && room.needsCleaning ? room.cleaningTimer : room.timer;
      const elapsedMs = computeElapsed(activeTimer);
      const color = room && room.colorLabelId ? colorMap[room.colorLabelId] : null;

      return {
        id: room && room.id ? room.id : "room-" + index,
        roomName: room && (room.name || room.label) ? String(room.name || room.label) : "Room",
        patientName: room && room.patientName ? String(room.patientName) : "",
        signalment: room && (room.signalment || room.patientSignalment) ? String(room.signalment || room.patientSignalment) : "",
        reasonForVisit: room && room.reason ? String(room.reason) : "",
        assignedDoctor: room && room.doctor ? String(room.doctor) : "",
        assignedTechnician: room && room.tech ? String(room.tech) : "",
        doctorReady: !!(room && room.doctorReady),
        dischargeReady: room && Object.prototype.hasOwnProperty.call(room, "dischargeReady")
          ? !!room.dischargeReady
          : null,
        roomReady: !!(room && room.roomReady),
        notesPreview: room ? String(room.notes || room.quickNote || "") : "",
        needsCleaning: !!(room && room.needsCleaning),
        colorLabel: color && color.title ? String(color.title) : "",
        colorHex: room && room.colorHex ? String(room.colorHex) : (color && color.color ? String(color.color) : ""),
        enteredAt: new Date(Date.now() - elapsedMs).toISOString(),
        elapsedMs
      };
    });

    return {
      sourceLabel: "Live VetBoard",
      sourceUrl: location.href,
      updatedAt: new Date().toISOString(),
      auth: {
        supabaseUrl,
        supabaseAnonKey: window.__SUPABASE_ANON_KEY__ || "",
        authStorageKey,
        rawAuthSession
      },
      thresholds: {
        warningMinutes: Math.max(0, Math.floor(Number(settings.timerAlert1AtSec || 0) / 60)),
        criticalMinutes: Math.max(0, Math.floor(Number(settings.timerAlert2AtSec || 0) / 60))
      },
      rooms
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "vetboard-mini-overlay/request-live-state") {
      return;
    }

    window.postMessage(
      {
        type: "vetboard-mini-overlay/response-live-state",
        requestId: event.data.requestId,
        snapshot: buildSnapshot()
      },
      "*"
    );
  });

  document.documentElement.dataset.vbmoBridgeInstalled = "1";

  function getAuthStorageCandidates(supabaseUrl) {
    const candidates = ["vetboard.supabase.auth.v1"];
    try {
      if (supabaseUrl) {
        const ref = new URL(supabaseUrl).hostname.split(".")[0];
        if (ref) {
          candidates.unshift(`sb-${ref}-auth-token`);
        }
      }
    } catch (_error) {}
    return candidates;
  }
})();

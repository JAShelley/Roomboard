(function initVetBoardMiniOverlayBridge() {
  if (window.__vetboardMiniOverlayBridgeInstalled) {
    return;
  }

  window.__vetboardMiniOverlayBridgeInstalled = true;

  function computeElapsed(timer) {
    if (!timer) return 0;
    if (timer.running && timer.startedAtIso) {
      const startedAtMs = Date.parse(timer.startedAtIso);
      if (Number.isFinite(startedAtMs)) {
        return (timer.elapsedMs || 0) + Math.max(0, Date.now() - startedAtMs);
      }
    }
    if (timer.running && timer.startedAt) {
      return (timer.elapsedMs || 0) + (Date.now() - timer.startedAt);
    }
    return timer.elapsedMs || 0;
  }

  function buildDoctorBadgeUi(settings) {
    const source = settings && typeof settings === "object" ? settings : {};
    return {
      scale: Math.max(0.7, Math.min(2, Number(source.doctorInitialBadgeScale || 1))),
      fontSize: Math.max(10, Math.min(28, Number(source.doctorInitialBadgeFontSize || 16))),
      color: String(source.doctorInitialBadgeColor || "#0b1220"),
      textColor: String(source.doctorInitialBadgeTextColor || source.displayFontColor || "#e8eefc"),
      styles:
        source.doctorBadgeStyles && typeof source.doctorBadgeStyles === "object"
          ? JSON.parse(JSON.stringify(source.doctorBadgeStyles))
          : {}
    };
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
        notes: room ? String(room.notes || "") : "",
        quickNote: room ? String(room.quickNote || "") : "",
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
      doctorBadgeUi: buildDoctorBadgeUi(settings),
      doctorInitials:
        settings.doctorInitials && typeof settings.doctorInitials === "object"
          ? JSON.parse(JSON.stringify(settings.doctorInitials))
          : {},
      rooms
    };
  }

  async function performRoomAction(roomId, action) {
    const appState = typeof window.getAppState === "function" ? window.getAppState() : window.state;
    if (!appState || !Array.isArray(appState.rooms)) {
      throw new Error("No live board was available.");
    }

    const room = appState.rooms.find((entry) => String(entry && entry.id || "") === String(roomId || ""));
    if (!room) {
      throw new Error("Room not found.");
    }

    const actionNowIso = await getActionNowIso();
    if (action === "toggle-room-discharge") {
      if (room.needsCleaning) {
        if (typeof window.clearRoomCleaning !== "function") {
          throw new Error("Mark clean is not available on this page.");
        }
        window.clearRoomCleaning(room, false, actionNowIso);
      } else {
        if (typeof window.dischargeRoom !== "function") {
          throw new Error("Discharge is not available on this page.");
        }
        window.dischargeRoom(room, actionNowIso);
      }
    } else {
      throw new Error("Unsupported room action.");
    }

    if (typeof window.commitBoardNow === "function") {
      await window.commitBoardNow();
    } else {
      if (typeof window.saveLocal === "function") {
        window.saveLocal();
      }
      if (typeof window.scheduleRemoteSave === "function") {
        window.scheduleRemoteSave("board", { immediate: true });
      }
    }

    return buildSnapshot();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) {
      return;
    }

    if (event.data.type === "vetboard-mini-overlay/request-live-state") {
      window.postMessage(
        {
          type: "vetboard-mini-overlay/response-live-state",
          requestId: event.data.requestId,
          snapshot: buildSnapshot()
        },
        "*"
      );
      return;
    }

    if (event.data.type === "vetboard-mini-overlay/request-room-action") {
      Promise.resolve()
        .then(function(){
          return performRoomAction(event.data.roomId, event.data.action);
        })
        .then(function(snapshot){
          window.postMessage(
            {
              type: "vetboard-mini-overlay/response-room-action",
              requestId: event.data.requestId,
              ok: true,
              snapshot: snapshot
            },
            "*"
          );
        })
        .catch(function(error){
          window.postMessage(
            {
              type: "vetboard-mini-overlay/response-room-action",
              requestId: event.data.requestId,
              ok: false,
              error: error && error.message ? String(error.message) : "Room action failed."
            },
            "*"
          );
        });
    }
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

  async function getActionNowIso() {
    try {
      if (typeof window.getServerNowIso === "function") {
        const serverNowIso = await window.getServerNowIso();
        if (serverNowIso) return String(serverNowIso);
      }
    } catch (_error) {}

    try {
      if (typeof window.getEstimatedServerNowIso === "function") {
        const estimatedNowIso = window.getEstimatedServerNowIso();
        if (estimatedNowIso) return String(estimatedNowIso);
      }
    } catch (_error) {}

    return new Date().toISOString();
  }
})();

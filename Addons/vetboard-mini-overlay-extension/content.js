(function initVetBoardMiniOverlay() {
  if (window !== window.top) {
    return;
  }

  if (globalThis.__vetboardMiniOverlayInjected) {
    return;
  }

  globalThis.__vetboardMiniOverlayInjected = true;

  const api = globalThis.chrome || globalThis.browser;
  const ROOT_ID = "vetboard-mini-overlay-root";
  const PANEL_Z_INDEX = 2147483646;
  const DEFAULT_SUPABASE_URL = "https://bqqjtgbfvtscwhbhscps.supabase.co";
  const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcWp0Z2JmdnRzY3doYmhzY3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NTIxNDEsImV4cCI6MjA5MDMyODE0MX0.hi_ruvxOBNbUIdQ-BYhjhuy6KM5oigqib-zIWL8dsts";
  const DEFAULT_AUTH_STORAGE_KEY = `sb-${new URL(DEFAULT_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const LIVE_SYNC_MS = 15000;
  const MINUTE_TICK_MS = 60000;
  const DETAIL_HIDE_DELAY_MS = 140;
  const PANEL_OPEN_SETTLE_MS = 700;
  const DEFAULT_AUTO_REFRESH_MS = 15000;
  const MIN_AUTO_REFRESH_MS = 15000;
  const MAX_AUTO_REFRESH_MS = 60000;
  const LIVE_SNAPSHOT_MAX_AGE_MS = 20000;
  const SUPABASE_SNAPSHOT_CACHE_MS = 15000;
  const SUPABASE_PRACTICE_CACHE_MS = 12 * 60 * 60 * 1000;
  const BRIDGE_REQUEST_TYPE = "vetboard-mini-overlay/request-live-state";
  const BRIDGE_RESPONSE_TYPE = "vetboard-mini-overlay/response-live-state";
  const BRIDGE_ACTION_REQUEST_TYPE = "vetboard-mini-overlay/request-room-action";
  const BRIDGE_ACTION_RESPONSE_TYPE = "vetboard-mini-overlay/response-room-action";
  const STORAGE_KEYS = {
    settings: "vetboardMiniOverlaySettings",
    rooms: "vetboardMiniOverlayMockRooms",
    panelOpen: "vetboardMiniOverlayPanelOpen",
    liveSnapshot: "vetboardMiniOverlayLiveSnapshot",
    supabaseAuth: "vetboardMiniOverlaySupabaseAuth",
    supabaseCache: "vetboardMiniOverlaySupabaseCache"
  };

  const state = {
    panelOpen: false,
    rooms: [],
    thresholds: {
      warningMinutes: 20,
      criticalMinutes: 35
    },
    doctorInitials: {},
    doctorBadgeUi: createDefaultDoctorBadgeUi(),
    sourceLabel: "Mock data",
    sourceDetail: "",
    authPanelOpen: false,
    authState: null,
    authMessage: "",
    authBusy: false,
    authForm: {
      email: "",
      password: ""
    },
    showOnlyActiveList: false,
    detailRoomId: null,
    detailPinned: false,
    activeDetailAnchor: null,
    refreshTimerId: null,
    liveSyncTimerId: null,
    minuteTickerId: null,
    detailHideTimerId: null,
    panelOpenTimerId: null,
    autoRefreshMs: DEFAULT_AUTO_REFRESH_MS,
    liveEventHandlersBound: false,
    lastRoomsSignature: "",
    lastRenderAt: null,
    pendingRoomActionId: "",
    roomActionError: ""
  };

  const defaultRoomSeed = [
    {
      id: "room-1",
      roomName: "Exam 1",
      patientName: "Milo",
      signalment: "MN DSH, 4y",
      reasonForVisit: "Vomiting / lethargy",
      assignedDoctor: "Dr. Harper",
      assignedTechnician: "Tess",
      doctorReady: true,
      dischargeReady: false,
      notesPreview: "CBC pending. Monitor hydration while owner completes estimate.",
      enteredAt: minutesAgo(6)
    },
    {
      id: "room-2",
      roomName: "Exam 2",
      patientName: "Bella",
      signalment: "FS Labrador, 9y",
      reasonForVisit: "Recheck ear infection",
      assignedDoctor: "Dr. Singh",
      assignedTechnician: "Marco",
      doctorReady: false,
      dischargeReady: false,
      notesPreview: "Owner requested refill discussion if cytology is improved.",
      enteredAt: minutesAgo(18)
    },
    {
      id: "room-3",
      roomName: "Exam 3",
      patientName: "Pepper",
      signalment: "FS Mix, 2y",
      reasonForVisit: "Limping LF",
      assignedDoctor: "Dr. Chen",
      assignedTechnician: "Ava",
      doctorReady: true,
      dischargeReady: false,
      notesPreview: "Radiographs queued. Pain score entered in patient note.",
      enteredAt: minutesAgo(24)
    },
    {
      id: "room-4",
      roomName: "Exam 4",
      patientName: "Oliver",
      signalment: "MN Corgi, 7y",
      reasonForVisit: "Annual wellness",
      assignedDoctor: "Dr. James",
      assignedTechnician: "Nina",
      doctorReady: false,
      dischargeReady: false,
      notesPreview: "Vaccines reviewed. Waiting on heartworm consent.",
      enteredAt: minutesAgo(12)
    },
    {
      id: "room-5",
      roomName: "Exam 5",
      patientName: "Luna",
      signalment: "FS Siamese, 11y",
      reasonForVisit: "Weight loss workup",
      assignedDoctor: "Dr. Harper",
      assignedTechnician: "Jules",
      doctorReady: true,
      dischargeReady: false,
      notesPreview: "Chem panel drawn. BP repeated twice, both elevated.",
      enteredAt: minutesAgo(31)
    },
    {
      id: "room-6",
      roomName: "Exam 6",
      patientName: "Rex",
      signalment: "MN GSD, 5y",
      reasonForVisit: "Skin recheck",
      assignedDoctor: "Dr. Singh",
      assignedTechnician: "Noah",
      doctorReady: true,
      dischargeReady: true,
      notesPreview: "Cytology improved. Medication instructions ready to review.",
      enteredAt: minutesAgo(42)
    }
  ];

  const ui = buildUi();
  const pageBridge = createPageBridge();
  const dataSource = createDataSource();

  initialize().catch((error) => {
    console.error("VetBoard Mini Overlay failed to initialize", error);
  });

  async function initialize() {
    const settings = await dataSource.getSettings();
    state.authState = await dataSource.readSupabaseAuth();

    state.thresholds = {
      warningMinutes: sanitizeMinutes(settings.warningMinutes, 20),
      criticalMinutes: sanitizeMinutes(settings.criticalMinutes, 35)
    };
    state.autoRefreshMs = settings.autoRefreshMs;
    state.showOnlyActiveList = Boolean(settings.showOnlyActiveList);
    state.panelOpen = false;

    mountUi(ui);
    bindUiEvents(ui);

    if (pageBridge.isVetBoardPage()) {
      await syncLiveSnapshot({ force: true });
    }

    await refreshAndRender({ allowRemote: state.panelOpen });
    setPanelOpen(state.panelOpen, { persist: false });
    api.storage.local.remove(STORAGE_KEYS.panelOpen).catch(() => {});
    startMinuteTicker();
  }

  function createDataSource() {
    return {
      async getSettings() {
        const result = await api.storage.local.get(STORAGE_KEYS.settings);
        const storedSettings = result[STORAGE_KEYS.settings] || {};
        return {
          warningMinutes: 20,
          criticalMinutes: 35,
          showOnlyActiveList: false,
          panelOpenByDefault: false,
          ...storedSettings,
          autoRefreshMs: clampNumber(
            storedSettings.autoRefreshMs,
            DEFAULT_AUTO_REFRESH_MS,
            MIN_AUTO_REFRESH_MS,
            MAX_AUTO_REFRESH_MS
          )
        };
      },

      async ensureMockRooms() {
        const stored = await api.storage.local.get(STORAGE_KEYS.rooms);
        if (Array.isArray(stored[STORAGE_KEYS.rooms]) && stored[STORAGE_KEYS.rooms].length > 0) {
          return stored[STORAGE_KEYS.rooms];
        }

        await api.storage.local.set({
          [STORAGE_KEYS.rooms]: defaultRoomSeed
        });
        return defaultRoomSeed;
      },

      async readLiveSnapshot() {
        const stored = await api.storage.local.get(STORAGE_KEYS.liveSnapshot);
        return stored[STORAGE_KEYS.liveSnapshot] || null;
      },

      async writeLiveSnapshot(snapshot) {
        await api.storage.local.set({
          [STORAGE_KEYS.liveSnapshot]: snapshot
        });
      },

      async readSupabaseAuth() {
        const stored = await api.storage.local.get(STORAGE_KEYS.supabaseAuth);
        return stored[STORAGE_KEYS.supabaseAuth] || null;
      },

      async writeSupabaseAuth(authState) {
        await api.storage.local.set({
          [STORAGE_KEYS.supabaseAuth]: authState
        });
      },

      async readSupabaseCache() {
        const stored = await api.storage.local.get(STORAGE_KEYS.supabaseCache);
        return stored[STORAGE_KEYS.supabaseCache] || null;
      },

      async writeSupabaseCache(cacheState) {
        await api.storage.local.set({
          [STORAGE_KEYS.supabaseCache]: cacheState
        });
      },

      async fetchRooms(options = {}) {
        const allowRemote = options.allowRemote !== false;
        const forceRemote = Boolean(options.forceRemote);
        const liveSnapshot = await this.readLiveSnapshot();
        const authState = await this.readSupabaseAuth();
        const cachedRemoteSnapshot = await readCachedSupabaseSnapshot(authState);
        let remoteSnapshot = cachedRemoteSnapshot;

        if (isSnapshotFresh(liveSnapshot, LIVE_SNAPSHOT_MAX_AGE_MS) && !forceRemote) {
          return createSnapshotPayload(liveSnapshot);
        }

        if (allowRemote && (!remoteSnapshot || forceRemote || !isSnapshotFresh(remoteSnapshot, SUPABASE_SNAPSHOT_CACHE_MS))) {
          remoteSnapshot = await fetchSupabaseSnapshot({ force: forceRemote });
        }
        const freshestSnapshot = pickFreshestSnapshot(liveSnapshot, remoteSnapshot);

        if (freshestSnapshot?.rooms?.length) {
          return createSnapshotPayload(freshestSnapshot);
        }

        const mockRooms = await this.ensureMockRooms();
        return {
          rooms: hydrateRooms(mockRooms),
          thresholds: { ...state.thresholds },
          doctorBadgeUi: createDefaultDoctorBadgeUi(),
          sourceLabel: "Mock data",
          sourceDetail: "Open VetBoard once to seed live data."
        };
      },

      async refreshRooms(options = {}) {
        return this.fetchRooms(options);
      },

      startOverlayRefresh(callback, intervalMs) {
        this.stopOverlayRefresh();
        state.refreshTimerId = window.setInterval(() => {
          callback().catch((error) => {
            console.debug("VetBoard Mini Overlay refresh failed", error);
          });
        }, intervalMs);
      },

      stopOverlayRefresh() {
        if (state.refreshTimerId) {
          window.clearInterval(state.refreshTimerId);
          state.refreshTimerId = null;
        }
      }
    };
  }

  function createPageBridge() {
    let requestCounter = 0;
    let messageListenerBound = false;
    const pendingRequests = new Map();

    function isVetBoardPage() {
      return Boolean(document.getElementById("displayGrid") && document.getElementById("intakeGrid"));
    }

    function ensureInjected() {
      if (!isVetBoardPage() || document.documentElement.dataset.vbmoBridgeInstalled === "1") {
        return;
      }

      const script = document.createElement("script");
      script.src = api.runtime.getURL("page-bridge.js");
      script.async = false;

      (document.documentElement || document.head || document.body).appendChild(script);
      script.remove();
    }

    function ensureListener() {
      if (messageListenerBound) {
        return;
      }

      window.addEventListener("message", (event) => {
        if (
          event.source !== window ||
          !event.data ||
          (
            event.data.type !== BRIDGE_RESPONSE_TYPE &&
            event.data.type !== BRIDGE_ACTION_RESPONSE_TYPE
          )
        ) {
          return;
        }

        const pendingRequest = pendingRequests.get(event.data.requestId);
        if (!pendingRequest) {
          return;
        }

        pendingRequests.delete(event.data.requestId);
        pendingRequest.resolve(event.data);
      });

      messageListenerBound = true;
    }

    async function sendBridgeRequest(message, timeoutMs) {
      if (!isVetBoardPage()) {
        return null;
      }

      ensureInjected();
      ensureListener();

      return new Promise((resolve) => {
        const requestId = `req-${Date.now()}-${++requestCounter}`;
        const timeoutId = window.setTimeout(() => {
          const pendingRequest = pendingRequests.get(requestId);
          if (pendingRequest) {
            pendingRequests.delete(requestId);
            pendingRequest.resolve(null);
          }
        }, timeoutMs);

        pendingRequests.set(requestId, {
          resolve(snapshot) {
            window.clearTimeout(timeoutId);
            resolve(snapshot);
          }
        });

        window.postMessage(
          {
            ...message,
            requestId
          },
          "*"
        );
      });
    }

    async function requestSnapshot() {
      const response = await sendBridgeRequest(
        {
          type: BRIDGE_REQUEST_TYPE
        },
        1200
      );
      return response?.snapshot || null;
    }

    async function requestRoomAction(roomId, action) {
      const response = await sendBridgeRequest(
        {
          type: BRIDGE_ACTION_REQUEST_TYPE,
          roomId,
          action
        },
        6000
      );
      if (!response) {
        throw new Error("Room action timed out.");
      }
      if (response.ok === false) {
        throw new Error(response.error || "Room action failed.");
      }
      return response.snapshot || null;
    }

    return {
      isVetBoardPage,
      requestSnapshot,
      requestRoomAction
    };
  }

  async function syncLiveSnapshot(options = {}) {
    const snapshot = await pageBridge.requestSnapshot();
    if (!snapshot?.rooms?.length) {
      return false;
    }

    const nextSnapshot = {
      ...snapshot,
      sourceLabel: snapshot.sourceLabel || "Live VetBoard"
    };

    if (!options.force) {
      const currentSnapshot = await dataSource.readLiveSnapshot();
      if (JSON.stringify(currentSnapshot) === JSON.stringify(nextSnapshot)) {
        if (snapshot.auth) {
          await syncSupabaseAuth(snapshot.auth);
        }
        return false;
      }
    }

    await dataSource.writeLiveSnapshot(nextSnapshot);
    if (snapshot.auth) {
      await syncSupabaseAuth(snapshot.auth);
    }
    return true;
  }

  async function refreshAndRender(options = {}) {
    const payload = await dataSource.refreshRooms(options);
    const nextDoctorInitialsSignature = JSON.stringify(payload.doctorInitials || {});
    const currentDoctorInitialsSignature = JSON.stringify(state.doctorInitials || {});
    const nextDoctorBadgeUiSignature = JSON.stringify(payload.doctorBadgeUi || {});
    const currentDoctorBadgeUiSignature = JSON.stringify(state.doctorBadgeUi || {});

    state.rooms = payload.rooms;
    state.thresholds = payload.thresholds;
    state.doctorInitials = payload.doctorInitials || {};
    state.doctorBadgeUi = normalizeDoctorBadgeUi(payload.doctorBadgeUi);
    state.sourceLabel = payload.sourceLabel;
    state.sourceDetail = payload.sourceDetail || "";
    state.lastRenderAt = new Date();

    const visibleRooms = getVisibleRooms();
    const nextRoomsSignature = getRoomsSignature(visibleRooms, state.showOnlyActiveList);
    const roomsChanged =
      nextRoomsSignature !== state.lastRoomsSignature ||
      nextDoctorInitialsSignature !== currentDoctorInitialsSignature ||
      nextDoctorBadgeUiSignature !== currentDoctorBadgeUiSignature;

    if (roomsChanged) {
      state.lastRoomsSignature = nextRoomsSignature;
      renderRooms(ui);
    }
    renderStatus(ui);
    renderAuthPanel(ui);
    syncDetailCard(ui);
  }

  async function runImmediateSync(options = {}) {
    if (pageBridge.isVetBoardPage()) {
      await syncLiveSnapshot({ force: true });
    }

    await refreshAndRender({
      allowRemote: options.allowRemote !== false,
      forceRemote: Boolean(options.forceRemote)
    });
  }

  async function runScheduledSync() {
    await refreshAndRender({
      allowRemote: state.panelOpen,
      forceRemote: false
    });
  }

  function startLiveBoardSync() {
    stopLiveBoardSync();
    bindLiveBoardEvents();

    state.liveSyncTimerId = window.setInterval(() => {
      if (!state.panelOpen || !pageBridge.isVetBoardPage()) {
        return;
      }
      syncLiveSnapshot().catch((error) => {
        console.debug("VetBoard Mini Overlay live sync failed", error);
      });
    }, LIVE_SYNC_MS);
  }

  function stopLiveBoardSync() {
    if (state.liveSyncTimerId) {
      window.clearInterval(state.liveSyncTimerId);
      state.liveSyncTimerId = null;
    }
  }

  function handleWindowFocus() {
    if (!state.panelOpen || !pageBridge.isVetBoardPage()) {
      return;
    }
    syncLiveSnapshot().catch(() => {});
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible" && state.panelOpen && pageBridge.isVetBoardPage()) {
      syncLiveSnapshot().catch(() => {});
    }
  }

  function bindLiveBoardEvents() {
    if (state.liveEventHandlersBound) {
      return;
    }

    window.addEventListener("focus", handleWindowFocus, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange, { passive: true });
    state.liveEventHandlersBound = true;
  }

  function startMinuteTicker() {
    if (state.minuteTickerId) {
      window.clearInterval(state.minuteTickerId);
    }

    state.minuteTickerId = window.setInterval(() => {
      if (!state.rooms.length) {
        return;
      }

      state.rooms = hydrateRooms(state.rooms);
      renderRooms(ui);
      syncDetailCard(ui);
    }, MINUTE_TICK_MS);
  }

  function hydrateRooms(rooms) {
    const now = Date.now();
    return rooms.map((room) => {
      const enteredAtMs = new Date(room.enteredAt).getTime();
      const minutesInRoom = Number.isFinite(enteredAtMs)
        ? Math.max(0, Math.floor((now - enteredAtMs) / 60000))
        : 0;

      return {
        ...room,
        signalment: room.signalment || "",
        reasonForVisit: room.reasonForVisit || "",
        assignedDoctor: room.assignedDoctor || "",
        assignedTechnician: room.assignedTechnician || "",
        notes: room.notes || "",
        quickNote: room.quickNote || "",
        notesPreview: room.notesPreview || room.quickNote || room.notes || "",
        roomReady: Boolean(room.roomReady),
        minutesInRoom
      };
    });
  }

  function createDefaultDoctorBadgeUi() {
    return {
      scale: 1,
      fontSize: 16,
      color: "#0b1220",
      textColor: "#e8eefc",
      styles: {}
    };
  }

  function normalizeDoctorBadgeShape(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      normalized === "circle" ||
      normalized === "triangle" ||
      normalized === "hexagon" ||
      normalized === "star" ||
      normalized === "crab" ||
      normalized === "bulldog" ||
      normalized === "flower" ||
      normalized === "flower2" ||
      normalized === "turtle" ||
      normalized === "golfball"
    ) {
      return normalized;
    }
    return "square";
  }

  function normalizeDoctorTextBadgeShape(value) {
    const normalized = normalizeDoctorBadgeShape(value);
    if (
      normalized === "circle" ||
      normalized === "triangle" ||
      normalized === "hexagon" ||
      normalized === "star"
    ) {
      return normalized;
    }
    return "square";
  }

  function normalizeDoctorBadgeStylesMap(rawMap) {
    const input = rawMap && typeof rawMap === "object" ? rawMap : {};
    const nextMap = Object.create(null);
    Object.keys(input).forEach((doctorName) => {
      const key = String(doctorName || "").trim();
      if (!key) {
        return;
      }
      const entry = input[doctorName] && typeof input[doctorName] === "object" ? input[doctorName] : {};
      nextMap[key] = {
        color: String(entry.color || "").trim(),
        textColor: String(entry.textColor || "").trim(),
        shape: normalizeDoctorBadgeShape(entry.shape)
      };
    });
    return nextMap;
  }

  function normalizeDoctorBadgeUi(rawUi) {
    const input = rawUi && typeof rawUi === "object" ? rawUi : {};
    const defaults = createDefaultDoctorBadgeUi();
    return {
      scale: clampNumber(input.scale, defaults.scale, 0.7, 2),
      fontSize: clampNumber(input.fontSize, defaults.fontSize, 10, 28),
      color: String(input.color || defaults.color).trim() || defaults.color,
      textColor: String(input.textColor || defaults.textColor).trim() || defaults.textColor,
      styles: normalizeDoctorBadgeStylesMap(input.styles)
    };
  }

  function normalizeDoctorNameKey(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/^(dr|doctor)\.?\s+/i, "")
      .replace(/[.,]/g, "")
      .toLowerCase()
      .trim();
  }

  function addDoctorNameCandidate(candidates, value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    if (!normalized) {
      return;
    }
    candidates.add(normalized);
  }

  function getDoctorNameCandidates(doctorName) {
    const raw = String(doctorName || "").trim().replace(/\s+/g, " ");
    if (!raw) {
      return [];
    }

    const candidates = new Set();
    addDoctorNameCandidate(candidates, raw);
    addDoctorNameCandidate(candidates, raw.replace(/\./g, ""));

    const withoutHonorific = raw.replace(/^(dr|doctor)\.?\s+/i, "").trim();
    if (withoutHonorific && withoutHonorific !== raw) {
      addDoctorNameCandidate(candidates, withoutHonorific);
      addDoctorNameCandidate(candidates, withoutHonorific.replace(/\./g, ""));
    } else {
      addDoctorNameCandidate(candidates, `Dr. ${raw}`);
      addDoctorNameCandidate(candidates, `Dr ${raw}`);
    }

    return Array.from(candidates);
  }

  function findDoctorMapMatch(sourceMap, doctorName) {
    if (!sourceMap || typeof sourceMap !== "object") {
      return null;
    }

    const doctorCandidates = getDoctorNameCandidates(doctorName);
    for (const candidate of doctorCandidates) {
      if (Object.prototype.hasOwnProperty.call(sourceMap, candidate)) {
        return {
          key: candidate,
          value: sourceMap[candidate]
        };
      }
    }

    const normalizedCandidates = doctorCandidates
      .map((candidate) => normalizeDoctorNameKey(candidate))
      .filter(Boolean);
    if (!normalizedCandidates.length) {
      return null;
    }

    const normalizedCandidateSet = new Set(normalizedCandidates);
    const sourceKeys = Object.keys(sourceMap);
    for (const key of sourceKeys) {
      if (normalizedCandidateSet.has(normalizeDoctorNameKey(key))) {
        return {
          key,
          value: sourceMap[key]
        };
      }
    }

    return null;
  }

  function lookupDoctorInitials(doctorName) {
    const doctorInitialsMap = state.doctorInitials && typeof state.doctorInitials === "object"
      ? state.doctorInitials
      : {};
    const matchedDoctor = findDoctorMapMatch(doctorInitialsMap, doctorName);
    if (matchedDoctor) {
      return {
        found: true,
        value: String(matchedDoctor.value || "").trim()
      };
    }
    return {
      found: false,
      value: ""
    };
  }

  function getDoctorBadgeStyle(doctorName) {
    const badgeUi = normalizeDoctorBadgeUi(state.doctorBadgeUi);
    const matchedDoctor = findDoctorMapMatch(badgeUi.styles, doctorName);
    const customStyle = matchedDoctor?.value && typeof matchedDoctor.value === "object"
      ? matchedDoctor.value
      : null;
    return {
      color: String(customStyle?.color || badgeUi.color || "#0b1220").trim() || "#0b1220",
      textColor: String(customStyle?.textColor || badgeUi.textColor || "#e8eefc").trim() || "#e8eefc",
      shape: normalizeDoctorBadgeShape(customStyle?.shape)
    };
  }

  function getDoctorBadgeText(room) {
    if (!room || !isFilledRoom(room)) {
      return "";
    }

    const doctorName = String(room.assignedDoctor || "").trim();
    if (!doctorName) {
      return "";
    }

    const configuredInitials = lookupDoctorInitials(doctorName);
    if (configuredInitials.found) {
      return configuredInitials.value.slice(0, 4).toUpperCase();
    }

    if (state.doctorInitials && Object.keys(state.doctorInitials).length) {
      return "";
    }

    const parts = doctorName.split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return "";
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
  }

  function buildDoctorBadgeHtml(room) {
    const badgeText = getDoctorBadgeText(room);
    if (!badgeText) {
      return "";
    }

    const badgeStyle = getDoctorBadgeStyle(room?.assignedDoctor || "");
    const styleParts = [];
    if (badgeStyle.color) {
      styleParts.push(`--vbmo-doc-badge-bg:${badgeStyle.color}`);
      styleParts.push(`--vbmo-doc-badge-border:${colorWithAlpha(badgeStyle.color, 0.92) || badgeStyle.color}`);
    }
    if (badgeStyle.textColor) {
      styleParts.push(`--vbmo-doc-badge-text:${badgeStyle.textColor}`);
    }

    return `<span class="vbmo-room-tile__doctor-badge" data-shape="${escapeHtml(normalizeDoctorTextBadgeShape(badgeStyle.shape))}"${styleParts.length ? ` style="${escapeHtml(styleParts.join(";"))}"` : ""} aria-label="Doctor ${escapeHtml(room?.assignedDoctor || "")}">${escapeHtml(badgeText)}</span>`;
  }

  function buildDoctorMarkerHtml(room) {
    const doctorName = String(room?.assignedDoctor || "").trim();
    if (!doctorName) {
      return "";
    }

    const badgeStyle = getDoctorBadgeStyle(doctorName);
    const styleParts = [];
    if (badgeStyle.color) {
      styleParts.push(`--vbmo-doc-badge-bg:${badgeStyle.color}`);
      styleParts.push(`--vbmo-doc-badge-border:${colorWithAlpha(badgeStyle.color, 0.92) || badgeStyle.color}`);
    }
    if (badgeStyle.textColor) {
      styleParts.push(`--vbmo-doc-badge-text:${badgeStyle.textColor}`);
    }

    return `<span class="vbmo-room-tile__doctor-marker" data-shape="${escapeHtml(badgeStyle.shape)}"${styleParts.length ? ` style="${escapeHtml(styleParts.join(";"))}"` : ""} aria-hidden="true"></span>`;
  }

  function isFilledRoom(room) {
    if (!room) {
      return false;
    }

    return Boolean(
      String(room.patientName || "").trim() ||
      String(room.reasonForVisit || "").trim() ||
      String(room.notesPreview || "").trim() ||
      room.needsCleaning
    );
  }

  function buildUi() {
    const host = document.createElement("div");
    host.id = ROOT_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.pointerEvents = "none";
    host.style.zIndex = String(PANEL_Z_INDEX);

    const shadowRoot = host.attachShadow({ mode: "open" });

    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    styleLink.href = api.runtime.getURL("styles.css");

    const shell = document.createElement("div");
    shell.className = "vbmo-shell";
    shell.innerHTML = `
      <button
        type="button"
        class="vbmo-launcher"
        aria-label="Toggle VetBoard mini overlay"
        aria-expanded="false"
        title="Left-click: toggle mini roomboard. Right-click: login."
      >
        <span class="vbmo-launcher__grid" aria-hidden="true">
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
          <span class="vbmo-launcher__cell"></span>
        </span>
      </button>
      <aside class="vbmo-auth-panel" aria-hidden="true"></aside>
      <aside class="vbmo-panel" aria-hidden="true">
        <div class="vbmo-empty-state" hidden>
          <div class="vbmo-empty-state__title">Log into VetBoard first</div>
          <div class="vbmo-empty-state__body">
            Open the real VetBoard page in a normal browser tab and sign in there. This mini overlay will then reuse that live board or your synced Supabase session.
          </div>
        </div>
        <div class="vbmo-room-list" role="list"></div>
      </aside>
      <div class="vbmo-detail-layer"></div>
    `;

    shadowRoot.append(styleLink, shell);

    return {
      host,
      launcher: shell.querySelector(".vbmo-launcher"),
      authPanel: shell.querySelector(".vbmo-auth-panel"),
      panel: shell.querySelector(".vbmo-panel"),
      roomList: shell.querySelector(".vbmo-room-list"),
      detailLayer: shell.querySelector(".vbmo-detail-layer"),
      emptyState: shell.querySelector(".vbmo-empty-state")
    };
  }

  function mountUi(builtUi) {
    if (document.getElementById(ROOT_ID)) {
      return;
    }

    document.documentElement.appendChild(builtUi.host);
  }

  function bindUiEvents(builtUi) {
    builtUi.launcher.addEventListener("click", async () => {
      const nextOpen = !state.panelOpen;
      setAuthPanelOpen(false);
      setPanelOpen(nextOpen);
      if (nextOpen) {
        await runImmediateSync({
          allowRemote: true,
          forceRemote: !pageBridge.isVetBoardPage()
        });
      }
    });

    builtUi.launcher.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPanelOpen(false);
      setAuthPanelOpen(!state.authPanelOpen);
    });

    builtUi.detailLayer.addEventListener("mouseenter", () => {
      if (!state.detailPinned) {
        clearPendingDetailHide();
      }
    });

    builtUi.detailLayer.addEventListener("mouseleave", () => {
      if (!state.detailPinned) {
        scheduleDetailHide();
      }
    });

    builtUi.detailLayer.addEventListener("click", (event) => {
      const actionButton = event.target?.closest?.("[data-detail-action]");
      const action = actionButton?.getAttribute?.("data-detail-action");
      if (action === "close") {
        event.stopPropagation();
        closeDetailCard();
        return;
      }

      if (action === "toggle-room-discharge") {
        event.preventDefault();
        event.stopPropagation();
        handleDetailRoomAction(
          actionButton?.getAttribute?.("data-room-id") || state.detailRoomId,
          action
        ).catch((error) => {
          state.roomActionError = getErrorMessage(error);
          syncDetailCard(ui);
        });
        return;
      }

      const detailCard = event.target?.closest?.(".vbmo-detail-card");
      if (!detailCard) {
        event.stopPropagation();
        closeDetailCard();
      }
    });

    document.addEventListener(
      "pointerdown",
      (event) => {
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        const clickedInsideExtension =
          path.includes(builtUi.host) ||
          path.includes(builtUi.panel) ||
          path.includes(builtUi.launcher) ||
          path.includes(builtUi.authPanel) ||
          path.includes(builtUi.detailLayer);

        if (state.panelOpen) {
          const clickedInsidePanel = clickedInsideExtension;
          if (!clickedInsidePanel) {
            setPanelOpen(false);
            setAuthPanelOpen(false);
            closeDetailCard();
            return;
          }
        }

        if (state.authPanelOpen) {
          const clickedInsideAuth = clickedInsideExtension;
          if (!clickedInsideAuth) {
            setAuthPanelOpen(false);
            closeDetailCard();
            if (state.panelOpen) {
              setPanelOpen(false);
            }
            return;
          }
        }

        if (!state.detailRoomId) {
          return;
        }

        const clickedInsideDetailCard = path.some(
          (node) => node && node.classList && node.classList.contains("vbmo-detail-card")
        );
        if (!clickedInsideDetailCard && !path.includes(builtUi.detailLayer)) {
          closeDetailCard();
        }
      },
      true
    );

    api.runtime.onMessage.addListener((message) => {
      if (message?.type !== "vetboard-mini-overlay/toggle-panel") {
        return undefined;
      }

      const nextOpen = !state.panelOpen;
      setPanelOpen(nextOpen);
      if (nextOpen) {
        runImmediateSync({
          allowRemote: true,
          forceRemote: !pageBridge.isVetBoardPage()
        }).catch(() => {});
      }
      return false;
    });

    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (
        changes[STORAGE_KEYS.liveSnapshot] ||
        changes[STORAGE_KEYS.supabaseCache] ||
        changes[STORAGE_KEYS.supabaseAuth] ||
        changes[STORAGE_KEYS.rooms] ||
        changes[STORAGE_KEYS.settings]
      ) {
        state.authState = changes[STORAGE_KEYS.supabaseAuth]?.newValue || state.authState;
        if (changes[STORAGE_KEYS.settings]?.newValue) {
          state.showOnlyActiveList = Boolean(changes[STORAGE_KEYS.settings].newValue.showOnlyActiveList);
          state.autoRefreshMs = clampNumber(
            changes[STORAGE_KEYS.settings].newValue.autoRefreshMs,
            DEFAULT_AUTO_REFRESH_MS,
            MIN_AUTO_REFRESH_MS,
            MAX_AUTO_REFRESH_MS
          );
          syncPollingState();
        }
        refreshAndRender({ allowRemote: state.panelOpen }).catch(() => {});
        renderAuthPanel(ui);
      }
    });

    window.addEventListener("resize", () => {
      syncDetailCard(builtUi);
      fitRoomLabels(builtUi);
    });

    window.addEventListener(
      "scroll",
      () => {
        syncDetailCard(builtUi);
      },
      true
    );

    builtUi.authPanel.addEventListener("click", async (event) => {
      const action = event.target?.getAttribute?.("data-auth-action");
      if (!action) {
        return;
      }

      if (action === "close") {
        setAuthPanelOpen(false);
        return;
      }

      if (action === "login") {
        await handleAuthLogin();
        return;
      }

      if (action === "logout") {
        await handleAuthLogout();
        return;
      }

      if (action === "toggle-active-list") {
        await handleToggleActiveList();
      }
    });

    builtUi.authPanel.addEventListener("input", (event) => {
      const field = event.target?.getAttribute?.("data-auth-field");
      if (!field) {
        return;
      }

      state.authForm[field] = event.target.value;
    });
  }

  function renderRooms(builtUi) {
    const visibleRooms = getVisibleRooms();
    builtUi.roomList.textContent = "";
    builtUi.roomList.classList.toggle("is-list-mode", state.showOnlyActiveList);
    builtUi.roomList.classList.add("is-fitting");
    builtUi.emptyState.hidden = visibleRooms.length > 0;
    renderEmptyStateCopy(builtUi);

    if (!visibleRooms.length) {
      builtUi.roomList.classList.remove("is-fitting");
      return;
    }

    const fragment = document.createDocumentFragment();

    visibleRooms.forEach((room) => {
      const doctorBadge = buildDoctorBadgeHtml(room);
      const gridPrimary = buildRoomGridPrimary(room);
      const gridMeta = buildRoomGridMeta(room);
      const tile = document.createElement("button");
      const isListMode = state.showOnlyActiveList;
      const isEmptyGridCard = !isListMode && !room.needsCleaning && !String(room.patientName || "").trim();
      const doctorMarker =
        isListMode || shouldRenderDoctorMarker(room, Boolean(doctorBadge))
          ? buildDoctorMarkerHtml(room)
          : "";
      tile.type = "button";
      tile.className = `vbmo-room-tile ${getUrgencyClass(room)}${room.needsCleaning ? " is-cleaning" : ""}${isListMode ? " is-list-item" : ""}${isEmptyGridCard ? " is-empty-card" : ""}`;
      tile.dataset.roomId = room.id;
      tile.setAttribute("role", "listitem");
      applyRoomColorStyles(tile, room);
      tile.innerHTML = isListMode
        ? `
          ${room.needsCleaning ? '<span class="vbmo-room-tile__cleaning" aria-hidden="true">Clean</span>' : ""}
          ${doctorMarker}
          <span class="vbmo-room-tile__list-main">
            <span class="vbmo-room-tile__list-head">
              <span class="vbmo-room-tile__list-room"><span class="vbmo-room-tile__list-room-text">${escapeHtml(room.roomName)}</span></span>
              <span class="vbmo-room-tile__time">${room.minutesInRoom}m</span>
            </span>
            <span class="vbmo-room-tile__list-patient">${escapeHtml(room.patientName || "No patient")}</span>
            <span class="vbmo-room-tile__list-meta">
              ${escapeHtml(buildRoomListMeta(room))}
            </span>
          </span>
          ${doctorBadge}
        `
        : `
          ${doctorMarker}
          <span class="vbmo-room-tile__frame">
            <span class="vbmo-room-tile__top">
              <span class="vbmo-room-tile__name-wrap">
                <span class="vbmo-room-tile__name"><span class="vbmo-room-tile__name-text">${escapeHtml(room.roomName)}</span></span>
              </span>
              ${doctorBadge ? `<span class="vbmo-room-tile__doctor-badge-slot">${doctorBadge}</span>` : ""}
            </span>
            <span class="vbmo-room-tile__patient">${escapeHtml(gridPrimary)}</span>
            <span class="vbmo-room-tile__time-box">
              <span class="vbmo-room-tile__time">${room.minutesInRoom}m</span>
            </span>
            <span class="vbmo-room-tile__mini-bottom">
              <span class="vbmo-room-tile__meta">${escapeHtml(gridMeta)}</span>
            </span>
          </span>
        `;

      tile.addEventListener("click", (event) => {
        event.stopPropagation();

        state.detailPinned = true;
        openDetailCard(room.id, tile);
      });

      fragment.appendChild(tile);
    });

    builtUi.roomList.appendChild(fragment);
    window.requestAnimationFrame(() => {
      fitRoomLabels(builtUi);
      builtUi.roomList.classList.remove("is-fitting");
    });
  }

  function renderStatus(builtUi) {
    return builtUi;
  }

  function renderEmptyStateCopy(builtUi) {
    const title = builtUi.emptyState.querySelector(".vbmo-empty-state__title");
    const body = builtUi.emptyState.querySelector(".vbmo-empty-state__body");
    if (!title || !body) {
      return;
    }

    if (state.showOnlyActiveList) {
      title.textContent = "No active rooms";
      body.textContent = "Right now there are no occupied or cleaning rooms to show in active list view.";
      return;
    }

    title.textContent = "Log into VetBoard first";
    body.textContent =
      "Open the real VetBoard page in a normal browser tab and sign in there. This mini overlay will then reuse that live board or your synced Supabase session.";
  }

  function syncPollingState() {
    dataSource.stopOverlayRefresh();
    stopLiveBoardSync();

    if (!state.panelOpen) {
      return;
    }

    dataSource.startOverlayRefresh(runScheduledSync, state.autoRefreshMs);
    if (pageBridge.isVetBoardPage()) {
      startLiveBoardSync();
    }
  }

  function setAuthPanelOpen(nextOpen) {
    state.authPanelOpen = Boolean(nextOpen);
    ui.authPanel.classList.toggle("is-open", state.authPanelOpen);
    ui.authPanel.setAttribute("aria-hidden", String(!state.authPanelOpen));
    renderAuthPanel(ui);
  }

  function renderAuthPanel(builtUi) {
    const panel = builtUi.authPanel;
    if (!panel) {
      return;
    }

    panel.classList.toggle("is-open", state.authPanelOpen);
    panel.setAttribute("aria-hidden", String(!state.authPanelOpen));
    if (!state.authPanelOpen) {
      panel.innerHTML = "";
      return;
    }

    const signedInEmail = state.authState?.session?.user?.email || state.authState?.session?.email || "";
    const settingsMarkup = buildQuickSettingsMarkup();
    panel.innerHTML = state.authState?.session?.access_token
      ? `
        <div class="vbmo-auth-card">
          <div class="vbmo-auth-card__header">
            <div>
              <div class="vbmo-auth-card__eyebrow">VetBoard Login</div>
              <div class="vbmo-auth-card__title">Connected</div>
            </div>
            <button class="vbmo-auth-card__button" data-auth-action="close" type="button">Close</button>
          </div>
          <div class="vbmo-auth-card__status">Signed in as ${escapeHtml(signedInEmail || "VetBoard user")}.</div>
          ${settingsMarkup}
          ${state.authMessage ? `<div class="vbmo-auth-card__message">${escapeHtml(state.authMessage)}</div>` : ""}
          <div class="vbmo-auth-card__actions">
            <button class="vbmo-auth-card__button vbmo-auth-card__button--primary" data-auth-action="logout" type="button">
              Logout
            </button>
          </div>
        </div>
      `
      : `
        <div class="vbmo-auth-card">
          <div class="vbmo-auth-card__header">
            <div>
              <div class="vbmo-auth-card__eyebrow">VetBoard Login</div>
              <div class="vbmo-auth-card__title">Supabase</div>
            </div>
            <button class="vbmo-auth-card__button" data-auth-action="close" type="button">Close</button>
          </div>
          <label class="vbmo-auth-card__field">
            <span>Email</span>
            <input data-auth-field="email" autocomplete="username" placeholder="name@clinic.com" type="text" value="${escapeHtml(state.authForm.email)}" />
          </label>
          <label class="vbmo-auth-card__field">
            <span>Password</span>
            <input data-auth-field="password" autocomplete="current-password" placeholder="Password" type="password" value="${escapeHtml(state.authForm.password)}" />
          </label>
          ${settingsMarkup}
          ${state.authMessage ? `<div class="vbmo-auth-card__message">${escapeHtml(state.authMessage)}</div>` : ""}
          <div class="vbmo-auth-card__actions">
            <button class="vbmo-auth-card__button vbmo-auth-card__button--primary" data-auth-action="login" type="button" ${state.authBusy ? "disabled" : ""}>
              ${state.authBusy ? "Logging in..." : "Login to Supabase"}
            </button>
          </div>
        </div>
      `;
  }

  function buildQuickSettingsMarkup() {
    return `
      <div class="vbmo-auth-card__section">
        <div class="vbmo-auth-card__section-label">Quick View</div>
        <button
          class="vbmo-auth-card__toggle${state.showOnlyActiveList ? " is-on" : ""}"
          data-auth-action="toggle-active-list"
          type="button"
          aria-pressed="${state.showOnlyActiveList ? "true" : "false"}"
        >
          <span class="vbmo-auth-card__toggle-copy">
            <span class="vbmo-auth-card__toggle-title">Only active list</span>
            <span class="vbmo-auth-card__toggle-caption">Show occupied or cleaning rooms in list view.</span>
          </span>
          <span class="vbmo-auth-card__toggle-knob" aria-hidden="true"></span>
        </button>
      </div>
    `;
  }

  function setPanelOpen(nextOpen, options = { persist: false }) {
    state.panelOpen = nextOpen;
    ui.panel.classList.toggle("is-open", nextOpen);
    ui.panel.setAttribute("aria-hidden", String(!nextOpen));
    ui.launcher.setAttribute("aria-expanded", String(nextOpen));
    ui.launcher.classList.toggle("is-active", nextOpen);

    if (state.panelOpenTimerId) {
      window.clearTimeout(state.panelOpenTimerId);
      state.panelOpenTimerId = null;
    }

    if (nextOpen) {
      ui.panel.classList.add("is-opening");
      state.panelOpenTimerId = window.setTimeout(() => {
        ui.panel.classList.remove("is-opening");
        state.panelOpenTimerId = null;
      }, PANEL_OPEN_SETTLE_MS);
    } else {
      ui.panel.classList.remove("is-opening");
    }

    if (!nextOpen) {
      closeDetailCard();
    }

    syncPollingState();
  }

  function openDetailCard(roomId, anchor) {
    clearPendingDetailHide();
    state.detailRoomId = roomId;
    state.activeDetailAnchor = anchor;
    state.roomActionError = "";
    syncDetailCard(ui);
  }

  function closeDetailCard() {
    clearPendingDetailHide();
    state.detailRoomId = null;
    state.detailPinned = false;
    state.activeDetailAnchor = null;
    state.roomActionError = "";
    ui.detailLayer.innerHTML = "";
    ui.detailLayer.classList.remove("is-visible");
  }

  function syncDetailCard(builtUi) {
    if (!state.detailRoomId || !state.panelOpen) {
      closeDetailCard();
      return;
    }

    if (!state.activeDetailAnchor || !state.activeDetailAnchor.isConnected) {
      const escapedRoomId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(String(state.detailRoomId))
        : String(state.detailRoomId).replace(/["\\]/g, "\\$&");
      const replacementAnchor = builtUi.roomList.querySelector(`.vbmo-room-tile[data-room-id="${escapedRoomId}"]`);
      state.activeDetailAnchor = replacementAnchor || null;
    }

    if (!state.activeDetailAnchor) {
      closeDetailCard();
      return;
    }

    const room = getVisibleRooms().find((entry) => entry.id === state.detailRoomId);
    if (!room) {
      closeDetailCard();
      return;
    }

    const rect = state.activeDetailAnchor.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      closeDetailCard();
      return;
    }

    const detailCard = renderDetailCard(room);
    builtUi.detailLayer.innerHTML = "";
    builtUi.detailLayer.appendChild(detailCard);
    builtUi.detailLayer.classList.add("is-visible");
    positionDetailCard(detailCard, rect);
  }

  async function handleDetailRoomAction(roomId, action) {
    const nextRoomId = String(roomId || state.detailRoomId || "").trim();
    if (!nextRoomId || state.pendingRoomActionId) {
      return;
    }

    state.pendingRoomActionId = nextRoomId;
    state.roomActionError = "";
    syncDetailCard(ui);

    try {
      let snapshot = null;
      if (pageBridge.isVetBoardPage()) {
        snapshot = await pageBridge.requestRoomAction(nextRoomId, action);
        if (snapshot?.rooms?.length) {
          await dataSource.writeLiveSnapshot({
            ...snapshot,
            sourceLabel: snapshot.sourceLabel || "Live VetBoard"
          });
          if (snapshot.auth) {
            await syncSupabaseAuth(snapshot.auth);
          }
        }
      } else {
        snapshot = await performSupabaseRoomAction(nextRoomId, action);
      }

      if (!snapshot?.rooms?.length) {
        throw new Error("Room update failed.");
      }

      await refreshAndRender({
        allowRemote: true,
        forceRemote: false
      });
    } catch (error) {
      state.roomActionError = getErrorMessage(error);
      syncDetailCard(ui);
    } finally {
      state.pendingRoomActionId = "";
      syncDetailCard(ui);
    }
  }

  function renderDetailCard(room) {
    const detail = document.createElement("section");
    detail.className = "vbmo-detail-card";
    detail.setAttribute("role", "dialog");
    detail.setAttribute("aria-label", `${room.roomName} details`);
    const canToggleRoomDischarge = Boolean(room?.needsCleaning || hasAssignedPatient(room));
    const roomActionLabel = room.needsCleaning ? "Mark clean" : "Discharge patient";
    const isActionPending = state.pendingRoomActionId === room.id;
    detail.innerHTML = `
      <div class="vbmo-detail-card__header">
        <div>
          <div class="vbmo-detail-card__room">${escapeHtml(room.roomName)}</div>
          <div class="vbmo-detail-card__patient">${escapeHtml(room.patientName || (room.needsCleaning ? "Cleaning in progress" : "No patient"))}</div>
        </div>
        <div class="vbmo-detail-card__header-actions">
          <div class="vbmo-detail-card__timer ${getUrgencyClass(room)}">${room.minutesInRoom}m</div>
          <button type="button" class="vbmo-detail-card__close" data-detail-action="close" aria-label="Close details">×</button>
        </div>
      </div>
      <div class="vbmo-detail-card__grid">
        ${detailRow("Type", room.reasonForVisit || room.colorLabel || "Unavailable")}
        ${detailRow("Doctor", room.assignedDoctor || "Unassigned")}
        ${detailRow("Technician", room.assignedTechnician || "Unassigned")}
        ${detailRow("Cleaning", room.needsCleaning ? "Needs cleaning" : "No")}
        ${detailRow("Room Ready", room.roomReady ? "Yes" : "No")}
        ${detailRow("Doctor Ready", room.doctorReady ? "Yes" : "No")}
      </div>
      <div class="vbmo-detail-card__notes">
        <div class="vbmo-detail-card__notes-head">
          <div class="vbmo-detail-card__label">Quick Notes</div>
          ${room.quickNote ? '<span class="vbmo-detail-card__status-pill">Flag</span>' : ""}
        </div>
        <div class="vbmo-detail-card__notes-stack">
          ${renderDetailNotesBlock("Flag", room.quickNote || "No quick note")}
          ${renderDetailNotesBlock("Notes", room.notes || "No notes")}
        </div>
        ${canToggleRoomDischarge ? `
          <div class="vbmo-detail-card__actions">
            <button type="button" class="vbmo-detail-card__action${room.needsCleaning ? "" : " is-danger"}" data-detail-action="toggle-room-discharge" data-room-id="${escapeHtml(room.id)}" ${isActionPending ? "disabled" : ""}>
              ${isActionPending ? "Updating..." : roomActionLabel}
            </button>
          </div>
        ` : ""}
        ${state.roomActionError ? `<div class="vbmo-detail-card__error">${escapeHtml(state.roomActionError)}</div>` : ""}
      </div>
    `;
    applyDetailCardColorStyles(detail, room);
    return detail;
  }

  function renderDetailNotesBlock(label, value) {
    return `
      <div class="vbmo-detail-card__notes-block">
        <div class="vbmo-detail-card__notes-block-label">${escapeHtml(label)}</div>
        <div class="vbmo-detail-card__notes-block-value">${escapeHtml(String(value || ""))}</div>
      </div>
    `;
  }

  function detailRow(label, value) {
    return `
      <div class="vbmo-detail-card__row">
        <div class="vbmo-detail-card__label">${escapeHtml(label)}</div>
        <div class="vbmo-detail-card__value">${escapeHtml(String(value))}</div>
      </div>
    `;
  }

  function positionDetailCard(detailCard, anchorRect) {
    const margin = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const estimatedWidth = Math.min(280, viewportWidth - 24);
    let left = usesTouchPrimaryInput() ? anchorRect.left : anchorRect.right + margin;
    let top = anchorRect.top;

    if (left + estimatedWidth > viewportWidth - 12) {
      left = Math.max(12, anchorRect.left - estimatedWidth - margin);
    }

    detailCard.style.left = `${Math.max(12, Math.round(left))}px`;
    detailCard.style.top = `${Math.max(12, Math.round(top))}px`;

    const measured = detailCard.getBoundingClientRect();
    if (measured.bottom > viewportHeight - 12) {
      detailCard.style.top = `${Math.max(12, Math.round(viewportHeight - measured.height - 12))}px`;
    }
  }

  function scheduleDetailHide() {
    clearPendingDetailHide();
    state.detailHideTimerId = window.setTimeout(() => {
      if (!state.detailPinned) {
        closeDetailCard();
      }
    }, DETAIL_HIDE_DELAY_MS);
  }

  function clearPendingDetailHide() {
    if (state.detailHideTimerId) {
      window.clearTimeout(state.detailHideTimerId);
      state.detailHideTimerId = null;
    }
  }

  function getUrgencyClass(room) {
    const warningMinutes = sanitizeMinutes(state.thresholds.warningMinutes, 20);
    const criticalMinutes = sanitizeMinutes(state.thresholds.criticalMinutes, 35);

    if (criticalMinutes > 0 && room.minutesInRoom >= criticalMinutes) {
      return "is-critical";
    }

    if (warningMinutes > 0 && room.minutesInRoom >= warningMinutes) {
      return "is-warning";
    }

    return "is-normal";
  }

  function sanitizeMinutes(value, fallback) {
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback;
  }

  async function handleAuthLogin() {
    const email = String(state.authForm.email || "").trim();
    const password = String(state.authForm.password || "");
    if (!email || !password) {
      state.authMessage = "Enter your VetBoard email and password.";
      renderAuthPanel(ui);
      return;
    }

    state.authBusy = true;
    state.authMessage = "";
    renderAuthPanel(ui);

    try {
      const payload = await loginToSupabase(email, password);
      const nextAuthState = {
        supabaseUrl: DEFAULT_SUPABASE_URL,
        supabaseAnonKey: DEFAULT_SUPABASE_ANON_KEY,
        authStorageKey: DEFAULT_AUTH_STORAGE_KEY,
        session: normalizeSupabaseSession(payload),
        updatedAt: new Date().toISOString()
      };

      state.authState = nextAuthState;
      state.authMessage = `Signed in as ${email}.`;
      await dataSource.writeSupabaseAuth(nextAuthState);
      setPanelOpen(true);
      await runImmediateSync({ allowRemote: true, forceRemote: true });
      setAuthPanelOpen(false);
    } catch (error) {
      state.authMessage = getErrorMessage(error);
      renderAuthPanel(ui);
    } finally {
      state.authBusy = false;
      renderAuthPanel(ui);
    }
  }

  async function handleAuthLogout() {
    state.authState = null;
    state.authMessage = "Logged out.";
    await dataSource.writeSupabaseAuth(null);
    await dataSource.writeSupabaseCache(null);
    renderAuthPanel(ui);
    await refreshAndRender({ allowRemote: false });
  }

  async function handleToggleActiveList() {
    state.showOnlyActiveList = !state.showOnlyActiveList;
    await persistSettings({
      showOnlyActiveList: state.showOnlyActiveList
    });
    renderAuthPanel(ui);
    await refreshAndRender({ allowRemote: state.panelOpen });
  }

  async function loginToSupabase(email, password) {
    const response = await fetch(`${DEFAULT_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: DEFAULT_SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.msg || payload?.error_description || payload?.message || `Login failed (${response.status})`);
    }

    if (!payload?.access_token) {
      throw new Error("Supabase login did not return a session.");
    }

    return payload;
  }

  function getErrorMessage(error) {
    if (!error) {
      return "Unknown error";
    }

    if (typeof error === "string") {
      return error;
    }

    return error.message || "Unknown error";
  }

  async function syncSupabaseAuth(authPayload) {
    const normalizedSession = normalizeSupabaseSession(authPayload?.rawAuthSession);
    if (!normalizedSession?.access_token || !authPayload?.supabaseUrl || !authPayload?.supabaseAnonKey) {
      return false;
    }

    const nextAuthState = {
      supabaseUrl: authPayload.supabaseUrl,
      supabaseAnonKey: authPayload.supabaseAnonKey,
      authStorageKey: authPayload.authStorageKey || DEFAULT_AUTH_STORAGE_KEY,
      session: normalizedSession,
      updatedAt: new Date().toISOString()
    };
    const currentAuthState = await dataSource.readSupabaseAuth();
    if (JSON.stringify(currentAuthState) === JSON.stringify(nextAuthState)) {
      state.authState = currentAuthState;
      return false;
    }

    await dataSource.writeSupabaseAuth(nextAuthState);
    state.authState = nextAuthState;
    return true;
  }

  function normalizeSupabaseSession(rawSession) {
    const candidate = rawSession?.currentSession || rawSession?.session || rawSession?.data?.session || rawSession;
    if (!candidate || typeof candidate !== "object") {
      return null;
    }

    if (!candidate.access_token || !candidate.refresh_token) {
      return null;
    }

    return {
      access_token: candidate.access_token,
      refresh_token: candidate.refresh_token,
      expires_at: candidate.expires_at || null,
      expires_in: candidate.expires_in || null,
      token_type: candidate.token_type || "bearer",
      user: candidate.user || null
    };
  }

  async function fetchSupabaseSnapshot(options = {}) {
    const authState = await dataSource.readSupabaseAuth();
    if (!authState?.supabaseUrl || !authState?.supabaseAnonKey || !authState?.session?.access_token) {
      return null;
    }

    const cachedSnapshot = await readCachedSupabaseSnapshot(authState);
    if (cachedSnapshot && !options.force && isSnapshotFresh(cachedSnapshot, SUPABASE_SNAPSHOT_CACHE_MS)) {
      return cachedSnapshot;
    }

    let session = authState.session;
    if (isSupabaseSessionNearExpiry(session)) {
      session = await refreshSupabaseSession(authState);
      if (!session?.access_token) {
        return null;
      }
    }

    return requestBoardStateFromSupabase(authState, session);
  }

  function isSupabaseSessionNearExpiry(session) {
    if (!session?.expires_at) {
      return false;
    }

    const expiresAtMs = Number(session.expires_at) * 1000;
    if (!Number.isFinite(expiresAtMs)) {
      return false;
    }

    return expiresAtMs - Date.now() <= 5 * 60 * 1000;
  }

  async function refreshSupabaseSession(authState) {
    try {
      const response = await fetch(
        `${authState.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: authState.supabaseAnonKey
          },
          body: JSON.stringify({
            refresh_token: authState.session.refresh_token
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Supabase refresh failed (${response.status})`);
      }

      const payload = await response.json();
      const normalizedSession = normalizeSupabaseSession(payload);
      if (!normalizedSession?.access_token) {
        throw new Error("Supabase refresh returned no session");
      }

      await dataSource.writeSupabaseAuth({
        ...authState,
        session: normalizedSession,
        updatedAt: new Date().toISOString()
      });
      state.authState = {
        ...authState,
        session: normalizedSession,
        updatedAt: new Date().toISOString()
      };

      return normalizedSession;
    } catch (error) {
      console.debug("VetBoard Mini Overlay auth refresh failed", error);
      return null;
    }
  }

  async function requestBoardStateFromSupabase(authState, session) {
    try {
      const practiceId = await requestPracticeIdFromSupabase(authState, session);
      if (!practiceId) {
        return null;
      }
      const doctorInitials = await requestDoctorInitialsFromSupabase(authState, session, practiceId);
      const appointmentTypeColors = await requestAppointmentTypesFromSupabase(authState, session, practiceId);

      const practiceBoardRows = await fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/practice_board_state?select=board_state,updated_at&practice_id=eq.${encodeURIComponent(practiceId)}&limit=1`,
        {
          headers: {
            apikey: authState.supabaseAnonKey,
            Authorization: `Bearer ${session.access_token}`,
            Accept: "application/json"
          }
        }
      );
      const practiceBoardRow = Array.isArray(practiceBoardRows) ? practiceBoardRows[0] || null : practiceBoardRows;
      const boardState =
        practiceBoardRow?.board_state && typeof practiceBoardRow.board_state === "object"
          ? practiceBoardRow.board_state
          : null;

      if (!boardState) {
        return null;
      }

      const snapshot = normalizeBoardStateSnapshot(boardState, {
        sourceLabel: "Supabase sync",
        sourceDetail: session?.user?.email || "Logged-in session",
        sourceUrl: authState.supabaseUrl,
        updatedAt: practiceBoardRow?.updated_at || new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        thresholds: {
          warningMinutes: 20,
          criticalMinutes: 35
        },
        doctorInitials,
        colorLabels: appointmentTypeColors
      });
      if (snapshot) {
        await storeSupabaseSnapshotCache(authState, session, practiceId, snapshot);
      }
      return snapshot;
    } catch (error) {
      console.debug("VetBoard Mini Overlay Supabase pull failed", error);
      return null;
    }
  }

  async function requestPracticeIdFromSupabase(authState, session) {
    const cachedPracticeId = await readCachedPracticeId(authState, session);
    if (cachedPracticeId) {
      return cachedPracticeId;
    }

    const userId = getSupabaseSessionUserId(session);
    if (userId) {
      const profileRows = await fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/profiles?select=practice_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        {
          headers: {
            apikey: authState.supabaseAnonKey,
            Authorization: `Bearer ${session.access_token}`,
            Accept: "application/json"
          }
        }
      );
      const profileRow = Array.isArray(profileRows) ? profileRows[0] || null : profileRows;
      const practiceId = String(profileRow?.practice_id || "").trim();
      if (practiceId) {
        await storeSupabasePracticeIdCache(authState, session, practiceId);
        return practiceId;
      }
    }

    const response = await fetch(`${authState.supabaseUrl}/rest/v1/rpc/get_my_practice_id`, {
      method: "POST",
      headers: {
        apikey: authState.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    if (!response.ok) {
      throw new Error(`Supabase practice lookup failed (${response.status})`);
    }

    const payload = await response.json().catch(() => null);
    const practiceId = typeof payload === "string" ? payload.trim() : "";
    if (practiceId) {
      await storeSupabasePracticeIdCache(authState, session, practiceId);
    }
    return practiceId || null;
  }

  async function fetchSupabaseJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Supabase request failed (${response.status})`);
    }
    return response.json().catch(() => null);
  }

  async function requestAppointmentTypesFromSupabase(authState, session, practiceId) {
    const appointmentTypeRows = await fetchSupabaseJson(
      `${authState.supabaseUrl}/rest/v1/appointment_types?select=id,title,color_hex,active,sort_order&practice_id=eq.${encodeURIComponent(practiceId)}&order=sort_order.asc`,
      {
        headers: {
          apikey: authState.supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
          Accept: "application/json"
        }
      }
    );

    return Array.isArray(appointmentTypeRows)
      ? appointmentTypeRows
        .filter((row) => row?.active !== false)
        .map((row, index) => ({
          id: String(row?.id || `appt-type-${index}`),
          title: String(row?.title || ""),
          color: String(row?.color_hex || "").trim()
        }))
      : [];
  }

  async function requestDoctorInitialsFromSupabase(authState, session, practiceId) {
    const cachedDoctorInitials = await readCachedDoctorInitials(authState, session);
    if (cachedDoctorInitials) {
      return cachedDoctorInitials;
    }

    const configuredDoctorInitials = await requestDoctorInitialSettingsFromSupabase(authState, session, practiceId);

    const doctorRows = await fetchSupabaseJson(
      `${authState.supabaseUrl}/rest/v1/doctors?select=name,initials,active&practice_id=eq.${encodeURIComponent(practiceId)}&order=name.asc`,
      {
        headers: {
          apikey: authState.supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
          Accept: "application/json"
        }
      }
    );

    const doctorInitials = Object.create(null);
    if (configuredDoctorInitials && typeof configuredDoctorInitials === "object") {
      Object.keys(configuredDoctorInitials).forEach((doctorName) => {
        const normalizedDoctorName = String(doctorName || "").trim();
        if (!normalizedDoctorName) {
          return;
        }
        doctorInitials[normalizedDoctorName] = String(configuredDoctorInitials[doctorName] || "").trim();
      });
    }

    if (Array.isArray(doctorRows)) {
      doctorRows.forEach((row) => {
        const doctorName = String(row?.name || "").trim();
        if (!doctorName || row?.active === false) {
          return;
        }

        if (!Object.prototype.hasOwnProperty.call(doctorInitials, doctorName)) {
          doctorInitials[doctorName] = String(row?.initials || "").trim();
        }
      });
    }

    await storeSupabasePracticeIdCache(authState, session, practiceId, doctorInitials);
    return doctorInitials;
  }

  async function requestDoctorInitialSettingsFromSupabase(authState, session, practiceId) {
    const headers = {
      apikey: authState.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json"
    };
    const sessionUserId = getSupabaseSessionUserId(session);
    const requests = [];

    if (sessionUserId) {
      requests.push(
        fetchSupabaseJson(
          `${authState.supabaseUrl}/rest/v1/user_settings?select=settings&practice_id=eq.${encodeURIComponent(practiceId)}&user_id=eq.${encodeURIComponent(sessionUserId)}&limit=1`,
          { headers }
        ).catch(() => null)
      );
    } else {
      requests.push(Promise.resolve(null));
    }

    requests.push(
      fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/practice_default_settings?select=settings&practice_id=eq.${encodeURIComponent(practiceId)}&limit=1`,
        { headers }
      ).catch(() => null)
    );

    const [userSettingsRows, practiceDefaultRows] = await Promise.all(requests);
    const userSettingsRow = Array.isArray(userSettingsRows) ? userSettingsRows[0] || null : userSettingsRows;
    const practiceDefaultRow = Array.isArray(practiceDefaultRows) ? practiceDefaultRows[0] || null : practiceDefaultRows;
    const effectiveSettings =
      userSettingsRow?.settings && typeof userSettingsRow.settings === "object"
        ? userSettingsRow.settings
        : practiceDefaultRow?.settings && typeof practiceDefaultRow.settings === "object"
          ? practiceDefaultRow.settings
          : null;

    return effectiveSettings?.doctorInitials && typeof effectiveSettings.doctorInitials === "object"
      ? effectiveSettings.doctorInitials
      : null;
  }

  async function performSupabaseRoomAction(roomId, action) {
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedRoomId) {
      throw new Error("Room not found.");
    }

    const authState = await dataSource.readSupabaseAuth();
    if (!authState?.supabaseUrl || !authState?.supabaseAnonKey || !authState?.session?.access_token) {
      throw new Error("Open VetBoard and log in first.");
    }

    let session = authState.session;
    if (isSupabaseSessionNearExpiry(session)) {
      session = await refreshSupabaseSession(authState);
      if (!session?.access_token) {
        throw new Error("Session expired. Open VetBoard and sign in again.");
      }
    }

    const practiceId = await requestPracticeIdFromSupabase(authState, session);
    if (!practiceId) {
      throw new Error("Could not locate your practice.");
    }

    const doctorInitials = await requestDoctorInitialsFromSupabase(authState, session, practiceId);
    const appointmentTypeColors = await requestAppointmentTypesFromSupabase(authState, session, practiceId);
    const boardRow = await requestPracticeBoardStateRow(authState, session, practiceId);
    const boardState =
      boardRow?.board_state && typeof boardRow.board_state === "object"
        ? boardRow.board_state
        : null;
    if (!boardState || !Array.isArray(boardState.rooms)) {
      throw new Error("No live board data was available.");
    }

    const nextBoardState = await applySupabaseRoomAction(boardState, normalizedRoomId, action, {
      authState,
      session,
      practiceId,
      serverNowIso: new Date().toISOString()
    });
    const savedBoardRow = await savePracticeBoardStateRow(authState, session, practiceId, nextBoardState);
    const snapshot = normalizeBoardStateSnapshot(nextBoardState, {
      sourceLabel: "Supabase sync",
      sourceDetail: session?.user?.email || "Logged-in session",
      sourceUrl: authState.supabaseUrl,
      updatedAt: savedBoardRow?.updated_at || new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      thresholds: {
        warningMinutes: 20,
        criticalMinutes: 35
      },
      doctorInitials,
      colorLabels: appointmentTypeColors
    });

    if (snapshot) {
      await storeSupabaseSnapshotCache(authState, session, practiceId, snapshot);
    }
    return snapshot;
  }

  async function requestPracticeBoardStateRow(authState, session, practiceId) {
    const boardRows = await fetchSupabaseJson(
      `${authState.supabaseUrl}/rest/v1/practice_board_state?select=board_state,updated_at&practice_id=eq.${encodeURIComponent(practiceId)}&limit=1`,
      {
        headers: {
          apikey: authState.supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
          Accept: "application/json"
        }
      }
    );
    return Array.isArray(boardRows) ? boardRows[0] || null : boardRows;
  }

  async function savePracticeBoardStateRow(authState, session, practiceId, boardState) {
    const response = await fetch(
      `${authState.supabaseUrl}/rest/v1/practice_board_state?on_conflict=practice_id`,
      {
        method: "POST",
        headers: {
          apikey: authState.supabaseAnonKey,
          Authorization: `Bearer ${session.access_token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify({
          practice_id: practiceId,
          board_state: boardState
        })
      }
    );
    if (!response.ok) {
      throw new Error(`Supabase save failed (${response.status})`);
    }

    const payload = await response.json().catch(() => null);
    return Array.isArray(payload) ? payload[0] || null : payload;
  }

  async function applySupabaseRoomAction(boardState, roomId, action, context) {
    const nextBoardState = JSON.parse(JSON.stringify(boardState || {}));
    if (!Array.isArray(nextBoardState.rooms)) {
      nextBoardState.rooms = [];
    }

    const room = nextBoardState.rooms.find((entry) => String(entry?.id || "") === roomId);
    if (!room) {
      throw new Error("Room not found.");
    }

    if (action !== "toggle-room-discharge") {
      throw new Error("That room action is not supported yet.");
    }

    if (room.needsCleaning) {
      clearSupabaseRoomCleaning(room, context.serverNowIso, false);
      return nextBoardState;
    }

    const defaultResetState = await requestDefaultRoomResetState(context, room);
    dischargeSupabaseRoom(room, context.serverNowIso, defaultResetState);
    return nextBoardState;
  }

  async function requestDefaultRoomResetState(context, room) {
    const fallbackId = String(room?.colorLabelId || "").trim();
    const fallbackTitle = String(room?.reason || "").trim() || "Wellness";
    try {
      const [settingsRows, appointmentTypeRows] = await Promise.all([
        fetchSupabaseJson(
          `${context.authState.supabaseUrl}/rest/v1/practice_settings?select=default_appointment_type_id&practice_id=eq.${encodeURIComponent(context.practiceId)}&limit=1`,
          {
            headers: {
              apikey: context.authState.supabaseAnonKey,
              Authorization: `Bearer ${context.session.access_token}`,
              Accept: "application/json"
            }
          }
        ),
        fetchSupabaseJson(
          `${context.authState.supabaseUrl}/rest/v1/appointment_types?select=id,title,active,sort_order&practice_id=eq.${encodeURIComponent(context.practiceId)}&order=sort_order.asc`,
          {
            headers: {
              apikey: context.authState.supabaseAnonKey,
              Authorization: `Bearer ${context.session.access_token}`,
              Accept: "application/json"
            }
          }
        )
      ]);

      const settingsRow = Array.isArray(settingsRows) ? settingsRows[0] || null : settingsRows;
      const targetId = String(settingsRow?.default_appointment_type_id || fallbackId || "").trim();
      const appointmentTypes = Array.isArray(appointmentTypeRows)
        ? appointmentTypeRows.filter((entry) => entry?.active !== false)
        : [];
      const matchedType = appointmentTypes.find((entry) => String(entry?.id || "") === targetId)
        || appointmentTypes[0]
        || null;

      return {
        id: String(matchedType?.id || targetId || fallbackId || "").trim(),
        title: String(matchedType?.title || fallbackTitle || "Wellness").trim() || "Wellness"
      };
    } catch (_error) {
      return {
        id: fallbackId,
        title: fallbackTitle
      };
    }
  }

  function dischargeSupabaseRoom(room, serverNowIso, defaultResetState) {
    const nextNowIso = String(serverNowIso || new Date().toISOString()).trim();
    room.lastDischargeSnapshot = canCaptureSupabaseDischargeSnapshot(room)
      ? buildSupabaseDischargeSnapshot(room)
      : null;
    room.patientName = "";
    room.reason = String(defaultResetState?.title || "Wellness").trim() || "Wellness";
    room.colorLabelId = String(defaultResetState?.id || room.colorLabelId || "").trim();
    room.colorHex = "";
    room.doctor = "";
    room.tech = "";
    room.notes = "";
    room.quickNote = "";
    room.roomReady = false;
    room.doctorReady = false;
    room.timer = {
      elapsedMs: 0,
      running: false,
      startedAt: null,
      startedAtIso: null,
      updatedAtIso: nextNowIso
    };
    room.needsCleaning = true;
    room.cleaningTimer = {
      elapsedMs: 0,
      running: true,
      startedAt: null,
      startedAtIso: nextNowIso,
      updatedAtIso: nextNowIso
    };
    room.activeRoomSessionId = null;
    room.activeCleaningSessionId = null;
  }

  function clearSupabaseRoomCleaning(room, stoppedAtIso, preserveRedo) {
    const nextNowIso = String(stoppedAtIso || new Date().toISOString()).trim();
    const elapsedMs = computeSupabaseTimerElapsed(room.cleaningTimer, nextNowIso);
    room.needsCleaning = false;
    room.cleaningTimer = {
      elapsedMs,
      running: false,
      startedAt: null,
      startedAtIso: null,
      updatedAtIso: nextNowIso
    };
    room.activeCleaningSessionId = null;
    if (!preserveRedo) {
      room.lastDischargeSnapshot = null;
    }
  }

  function canCaptureSupabaseDischargeSnapshot(room) {
    if (!room) {
      return false;
    }
    return Boolean(
      room.patientName ||
      room.doctor ||
      room.tech ||
      room.notes ||
      room.quickNote ||
      room.roomReady ||
      room.doctorReady ||
      computeSupabaseTimerElapsed(room.timer) > 0
    );
  }

  function buildSupabaseDischargeSnapshot(room) {
    return {
      patientName: room.patientName || "",
      reason: room.reason || "Wellness",
      colorLabelId: room.colorLabelId || "",
      colorHex: room.colorHex || "",
      doctor: room.doctor || "",
      tech: room.tech || "",
      notes: room.notes || "",
      quickNote: room.quickNote || "",
      roomReady: !!room.roomReady,
      doctorReady: !!room.doctorReady,
      timer: cloneSupabaseTimer(room.timer)
    };
  }

  function cloneSupabaseTimer(timer) {
    const base = timer && typeof timer === "object" ? timer : {};
    return {
      elapsedMs: Math.max(0, Number(base.elapsedMs || 0)),
      running: !!base.running,
      startedAt: base.startedAt || null,
      startedAtIso: base.startedAtIso || null,
      updatedAtIso: base.updatedAtIso || null
    };
  }

  function computeSupabaseTimerElapsed(timer, referenceIso) {
    const base = cloneSupabaseTimer(timer);
    let elapsedMs = Math.max(0, Number(base.elapsedMs || 0));
    if (!base.running) {
      return elapsedMs;
    }

    const referenceMs = Date.parse(referenceIso || new Date().toISOString());
    if (base.startedAtIso) {
      const startedAtMs = Date.parse(base.startedAtIso);
      if (Number.isFinite(startedAtMs) && Number.isFinite(referenceMs)) {
        elapsedMs += Math.max(0, referenceMs - startedAtMs);
        return elapsedMs;
      }
    }

    if (base.startedAt) {
      const startedAtMs = Number(base.startedAt);
      if (Number.isFinite(startedAtMs) && Number.isFinite(referenceMs)) {
        elapsedMs += Math.max(0, referenceMs - startedAtMs);
      }
    }

    return elapsedMs;
  }

  function normalizeRoomTimer(timer) {
    const base = timer && typeof timer === "object" ? timer : {};
    return {
      elapsedMs: Math.max(0, Number(base.elapsedMs || 0)),
      running: !!base.running,
      startedAt: base.startedAt || null,
      startedAtIso: base.startedAtIso || null
    };
  }

  function normalizeBoardStateSnapshot(boardState, meta) {
    if (!boardState || !Array.isArray(boardState.rooms)) {
      return null;
    }

    const settings = boardState.settings || {};
    const fallbackThresholds = meta.thresholds || {};
    const colors = Array.isArray(boardState.colorLabels)
      ? boardState.colorLabels
      : Array.isArray(meta.colorLabels)
        ? meta.colorLabels
        : [];
    const colorMap = Object.create(null);
    colors.forEach((entry) => {
      if (entry?.id) {
        colorMap[entry.id] = entry;
      }
    });

    const doctorBadgeUi = normalizeDoctorBadgeUi(boardState.sharedUi || meta.doctorBadgeUi);
    const rooms = boardState.rooms.map((room, index) => {
      const activeTimer = room && room.needsCleaning ? room.cleaningTimer : room.timer;
      const elapsedMs = computeTimerElapsed(activeTimer);
      const color = room && room.colorLabelId ? colorMap[room.colorLabelId] : null;

      return {
        id: room?.id || `room-${index}`,
        roomName: room?.name || room?.label || "Room",
        colorLabelId: room?.colorLabelId || "",
        patientName: room?.patientName || "",
        signalment: room?.signalment || room?.patientSignalment || "",
        reasonForVisit: room?.reason || "",
        assignedDoctor: room?.doctor || "",
        assignedTechnician: room?.tech || "",
        doctorReady: Boolean(room?.doctorReady),
        dischargeReady: Object.prototype.hasOwnProperty.call(room || {}, "dischargeReady")
          ? Boolean(room.dischargeReady)
          : null,
        roomReady: Boolean(room?.roomReady),
        notes: String(room?.notes || ""),
        quickNote: String(room?.quickNote || ""),
        notesPreview: String(room?.notes || room?.quickNote || ""),
        needsCleaning: Boolean(room?.needsCleaning),
        colorLabel: color?.title || "",
        colorHex: room?.colorHex || color?.color || "",
        enteredAt: new Date(Date.now() - elapsedMs).toISOString(),
        elapsedMs
      };
    });

    return {
      sourceLabel: meta.sourceLabel || "Supabase sync",
      sourceDetail: meta.sourceDetail || "",
      sourceUrl: meta.sourceUrl || "",
      updatedAt: meta.updatedAt || new Date().toISOString(),
      fetchedAt: meta.fetchedAt || new Date().toISOString(),
      doctorInitials: meta.doctorInitials || {},
      doctorBadgeUi,
      thresholds: {
        warningMinutes: sanitizeMinutes(
          Math.floor(Number(settings.timerAlert1AtSec || 0) / 60),
          sanitizeMinutes(fallbackThresholds.warningMinutes, 20)
        ),
        criticalMinutes: sanitizeMinutes(
          Math.floor(Number(settings.timerAlert2AtSec || 0) / 60),
          sanitizeMinutes(fallbackThresholds.criticalMinutes, 35)
        )
      },
      rooms
    };
  }

  function computeTimerElapsed(timer) {
    if (!timer) {
      return 0;
    }

    if (timer.running && timer.startedAtIso) {
      const startedAtMs = Date.parse(timer.startedAtIso);
      if (Number.isFinite(startedAtMs)) {
        return Number(timer.elapsedMs || 0) + Math.max(0, Date.now() - startedAtMs);
      }
    }

    if (timer.running && timer.startedAt) {
      return Number(timer.elapsedMs || 0) + (Date.now() - Number(timer.startedAt));
    }

    return Number(timer.elapsedMs || 0);
  }

  function pickFreshestSnapshot(liveSnapshot, remoteSnapshot) {
    if (!liveSnapshot?.rooms?.length) {
      return remoteSnapshot || null;
    }

    if (!remoteSnapshot?.rooms?.length) {
      return liveSnapshot || null;
    }

    const liveUpdatedAt = new Date(liveSnapshot.updatedAt || 0).getTime();
    const remoteUpdatedAt = new Date(remoteSnapshot.updatedAt || 0).getTime();

    if (!Number.isFinite(liveUpdatedAt)) {
      return remoteSnapshot;
    }

    if (!Number.isFinite(remoteUpdatedAt)) {
      return liveSnapshot;
    }

    return remoteUpdatedAt > liveUpdatedAt ? remoteSnapshot : liveSnapshot;
  }

  function createSnapshotPayload(snapshot) {
    return {
      rooms: hydrateRooms(snapshot.rooms),
      thresholds: {
        warningMinutes: sanitizeMinutes(snapshot.thresholds?.warningMinutes, state.thresholds.warningMinutes),
        criticalMinutes: sanitizeMinutes(snapshot.thresholds?.criticalMinutes, state.thresholds.criticalMinutes)
      },
      doctorInitials: snapshot.doctorInitials || {},
      doctorBadgeUi: snapshot.doctorBadgeUi || createDefaultDoctorBadgeUi(),
      sourceLabel: snapshot.sourceLabel || "Live VetBoard",
      sourceDetail: snapshot.sourceDetail || ""
    };
  }

  function getVisibleRooms() {
    return state.showOnlyActiveList ? state.rooms.filter(isActiveRoom) : state.rooms;
  }

  function isActiveRoom(room) {
    if (!room) {
      return false;
    }

    return room.needsCleaning || hasAssignedPatient(room);
  }

  function hasAssignedPatient(room) {
    return Boolean(String(room?.patientName || "").replace(/\s/g, ""));
  }

  function buildRoomListMeta(room) {
    const parts = [];
    if (room.reasonForVisit) {
      parts.push(room.reasonForVisit);
    }
    if (room.assignedDoctor) {
      parts.push(room.assignedDoctor);
    }
    if (room.assignedTechnician) {
      parts.push(`Tech ${room.assignedTechnician}`);
    }
    if (room.needsCleaning) {
      parts.push("Needs cleaning");
    }
    return parts.join(" | ") || "Active room";
  }

  function buildRoomGridPrimary(room) {
    if (room.needsCleaning) {
      return "Cleaning";
    }
    if (room.patientName) {
      return room.patientName;
    }
    return "Empty";
  }

  function buildRoomGridMeta(room) {
    const parts = [];
    if (room.needsCleaning) {
      parts.push("Needs cleaning");
    } else if (room.colorLabel) {
      parts.push(room.colorLabel);
    } else if (room.reasonForVisit) {
      parts.push(room.reasonForVisit);
    }

    if (room.assignedDoctor) {
      parts.push(room.assignedDoctor);
    }
    if (room.assignedTechnician) {
      parts.push(room.assignedTechnician);
    }
    if (room.quickNote) {
      parts.push(room.quickNote);
    }

    return parts.join(" ・ ") || "Open room";
  }

  async function persistSettings(patch) {
    const currentSettings = await dataSource.getSettings();
    await api.storage.local.set({
      [STORAGE_KEYS.settings]: {
        ...currentSettings,
        ...patch
      }
    });
  }

  function clampNumber(value, fallback, min, max) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }

    return Math.max(min, Math.min(max, numericValue));
  }

  function isSnapshotFresh(snapshot, maxAgeMs) {
    if (!snapshot) {
      return false;
    }

    const timestamps = [snapshot.fetchedAt, snapshot.updatedAt];
    for (const timestamp of timestamps) {
      const timestampMs = Date.parse(timestamp || "");
      if (Number.isFinite(timestampMs) && Date.now() - timestampMs <= maxAgeMs) {
        return true;
      }
    }

    return false;
  }

  function getSupabaseSessionUserId(session) {
    return String(session?.user?.id || "").trim();
  }

  function getSupabaseSessionEmail(session) {
    return String(session?.user?.email || "").trim().toLowerCase();
  }

  function isSupabaseCacheMatch(cache, authState, session) {
    if (!cache || cache.supabaseUrl !== authState?.supabaseUrl) {
      return false;
    }

    const sessionUserId = getSupabaseSessionUserId(session);
    const cacheUserId = String(cache.userId || "").trim();
    if (sessionUserId && cacheUserId && sessionUserId !== cacheUserId) {
      return false;
    }

    const sessionEmail = getSupabaseSessionEmail(session);
    const cacheEmail = String(cache.userEmail || "").trim().toLowerCase();
    if (!sessionUserId && sessionEmail && cacheEmail && sessionEmail !== cacheEmail) {
      return false;
    }

    return true;
  }

  async function readCachedSupabaseSnapshot(authState) {
    const cache = await dataSource.readSupabaseCache();
    if (!cache?.snapshot) {
      return null;
    }

    if (authState && !isSupabaseCacheMatch(cache, authState, authState.session)) {
      return null;
    }

    return cache.snapshot;
  }

  async function readCachedPracticeId(authState, session) {
    const cache = await dataSource.readSupabaseCache();
    if (!isSupabaseCacheMatch(cache, authState, session)) {
      return null;
    }

    if (!cache.practiceId || !isSnapshotFresh({ fetchedAt: cache.practiceIdFetchedAt }, SUPABASE_PRACTICE_CACHE_MS)) {
      return null;
    }

    return cache.practiceId;
  }

  async function readCachedDoctorInitials(authState, session) {
    const cache = await dataSource.readSupabaseCache();
    if (!isSupabaseCacheMatch(cache, authState, session)) {
      return null;
    }

    if (
      !cache.doctorInitials ||
      typeof cache.doctorInitials !== "object" ||
      !isSnapshotFresh({ fetchedAt: cache.practiceIdFetchedAt }, SUPABASE_PRACTICE_CACHE_MS)
    ) {
      return null;
    }

    return cache.doctorInitials;
  }

  async function storeSupabasePracticeIdCache(authState, session, practiceId, doctorInitials) {
    const existingCache = await dataSource.readSupabaseCache();
    const nextCache = {
      ...(existingCache && typeof existingCache === "object" ? existingCache : {}),
      supabaseUrl: authState.supabaseUrl,
      userId: getSupabaseSessionUserId(session),
      userEmail: getSupabaseSessionEmail(session),
      practiceId,
      practiceIdFetchedAt: new Date().toISOString(),
      doctorInitials:
        doctorInitials && typeof doctorInitials === "object"
          ? doctorInitials
          : existingCache?.doctorInitials && typeof existingCache.doctorInitials === "object"
            ? existingCache.doctorInitials
            : {}
    };

    await dataSource.writeSupabaseCache(nextCache);
  }

  async function storeSupabaseSnapshotCache(authState, session, practiceId, snapshot) {
    const existingCache = await dataSource.readSupabaseCache();
    const nextCache = {
      ...(existingCache && typeof existingCache === "object" ? existingCache : {}),
      supabaseUrl: authState.supabaseUrl,
      userId: getSupabaseSessionUserId(session),
      userEmail: getSupabaseSessionEmail(session),
      practiceId,
      practiceIdFetchedAt: new Date().toISOString(),
      doctorInitials:
        snapshot?.doctorInitials && typeof snapshot.doctorInitials === "object"
          ? snapshot.doctorInitials
          : existingCache?.doctorInitials && typeof existingCache.doctorInitials === "object"
            ? existingCache.doctorInitials
            : {},
      snapshot: {
        ...snapshot,
        fetchedAt: snapshot.fetchedAt || new Date().toISOString()
      }
    };

    await dataSource.writeSupabaseCache(nextCache);
  }

  function fitRoomLabels(builtUi) {
    const labels = builtUi.roomList.querySelectorAll(".vbmo-room-tile__name, .vbmo-room-tile__list-room");
    labels.forEach((label) => {
      fitRoomLabel(label);
    });
  }

  function fitRoomLabel(label) {
    const tile = label.closest(".vbmo-room-tile");
    if (!tile) {
      return;
    }

    const labelText = label.querySelector(".vbmo-room-tile__name-text, .vbmo-room-tile__list-room-text");
    if (!labelText) {
      return;
    }

    const isListRoomName = label.classList.contains("vbmo-room-tile__list-room");
    const maxFontSize = isListRoomName ? 13 : 14;
    const minFontSize = isListRoomName ? 8 : 7;
    const availableHeight = isListRoomName
      ? Math.max(14, (label.parentElement?.clientHeight || label.clientHeight || 18) + 2)
      : Math.max(14, (label.parentElement?.clientHeight || label.clientHeight || 18) + 4);
    let low = minFontSize;
    let high = maxFontSize;
    let best = minFontSize;

    label.classList.remove("is-marquee");
    label.style.removeProperty("--vbmo-marquee-distance");
    label.style.removeProperty("--vbmo-marquee-duration");
    labelText.style.removeProperty("min-width");

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      label.style.fontSize = `${mid}px`;

      const fitsWidth = label.scrollWidth <= label.clientWidth + 1;
      const fitsHeight = label.scrollHeight <= availableHeight;

      if (fitsWidth && fitsHeight) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    label.style.fontSize = `${best}px`;

    const overflowWidth = Math.ceil(labelText.scrollWidth - label.clientWidth);
    if (overflowWidth > 8) {
      const travel = overflowWidth + 28;
      const durationSeconds = Math.max(18, Math.min(42, Math.round(travel / 4.5)));
      label.classList.add("is-marquee");
      label.style.setProperty("--vbmo-marquee-distance", `-${travel}px`);
      label.style.setProperty("--vbmo-marquee-duration", `${durationSeconds}s`);
      labelText.style.minWidth = `${labelText.scrollWidth}px`;
    }
  }

  function shouldRenderDoctorMarker(room, hasDoctorBadge) {
    const doctorName = String(room?.assignedDoctor || "").trim();
    if (!doctorName) {
      return false;
    }

    const shape = getDoctorBadgeStyle(doctorName).shape;
    if (!hasDoctorBadge) {
      return true;
    }

    return (
      shape === "crab" ||
      shape === "bulldog" ||
      shape === "flower" ||
      shape === "flower2" ||
      shape === "turtle" ||
      shape === "golfball"
    );
  }

  function getRoomsSignature(rooms, showOnlyActiveList = false) {
    return JSON.stringify(
      {
        showOnlyActiveList,
        rooms: (rooms || []).map((room) => ({
        id: room.id,
        roomName: room.roomName,
        patientName: room.patientName,
        reasonForVisit: room.reasonForVisit,
        assignedDoctor: room.assignedDoctor,
        assignedTechnician: room.assignedTechnician,
        notesPreview: room.notesPreview,
        colorLabel: room.colorLabel,
        colorHex: room.colorHex,
        needsCleaning: room.needsCleaning,
        minutesInRoom: room.minutesInRoom
        }))
      }
    );
  }

  function applyRoomColorStyles(tile, room) {
    const roomColor = normalizeHexColor(room?.needsCleaning ? "#fbbf24" : room?.colorHex);
    if (!roomColor) {
      tile.style.removeProperty("--vbmo-room-bg");
      tile.style.removeProperty("--vbmo-room-bg-hover");
      tile.style.removeProperty("--vbmo-room-border");
      tile.style.removeProperty("--vbmo-room-text");
      tile.style.removeProperty("--vbmo-room-text-strong");
      tile.style.removeProperty("--vbmo-room-muted");
      tile.style.removeProperty("--vbmo-room-timer-bg");
      tile.style.removeProperty("--vbmo-room-timer-text");
      tile.style.removeProperty("--vbmo-room-inner");
      tile.style.removeProperty("--vbmo-room-inner-hover");
      tile.style.removeProperty("--vbmo-room-shadow");
      tile.style.removeProperty("--vbmo-room-shadow-hover");
      return;
    }

    const textColor = room?.needsCleaning ? "#241600" : pickReadableTextColor(roomColor);
    const textPalette = buildRoomTextPalette(textColor);
    const darkOverlayTop = room?.needsCleaning ? "rgba(17, 24, 39, 0.56)" : "rgba(15, 25, 46, 0.6)";
    const darkOverlayBottom = room?.needsCleaning ? "rgba(9, 16, 30, 0.74)" : "rgba(9, 16, 30, 0.72)";
    const hoverOverlayTop = room?.needsCleaning ? "rgba(17, 24, 39, 0.48)" : "rgba(15, 25, 46, 0.54)";
    const hoverOverlayBottom = room?.needsCleaning ? "rgba(9, 16, 30, 0.68)" : "rgba(9, 16, 30, 0.66)";
    tile.style.setProperty(
      "--vbmo-room-bg",
      `linear-gradient(180deg, ${darkOverlayTop}, ${darkOverlayBottom}), linear-gradient(180deg, ${colorWithAlpha(roomColor, room?.needsCleaning ? 0.94 : 0.86)}, ${colorWithAlpha(roomColor, room?.needsCleaning ? 0.72 : 0.62)})`
    );
    tile.style.setProperty(
      "--vbmo-room-bg-hover",
      `linear-gradient(180deg, ${hoverOverlayTop}, ${hoverOverlayBottom}), linear-gradient(180deg, ${colorWithAlpha(roomColor, room?.needsCleaning ? 0.98 : 0.92)}, ${colorWithAlpha(roomColor, room?.needsCleaning ? 0.78 : 0.68)})`
    );
    tile.style.setProperty("--vbmo-room-border", colorWithAlpha(roomColor, room?.needsCleaning ? 0.85 : 0.72));
    tile.style.setProperty("--vbmo-room-text", textColor);
    tile.style.setProperty("--vbmo-room-text-strong", textPalette.strong);
    tile.style.setProperty("--vbmo-room-muted", textPalette.muted);
    tile.style.setProperty(
      "--vbmo-room-timer-bg",
      textColor === "#0b1220" || textColor === "#241600"
        ? "rgba(255,255,255,0.82)"
        : "rgba(11, 18, 32, 0.46)"
    );
    tile.style.setProperty("--vbmo-room-timer-text", textPalette.strong);
    tile.style.setProperty("--vbmo-room-inner", colorWithAlpha(roomColor, room?.needsCleaning ? 0.18 : 0.16));
    tile.style.setProperty("--vbmo-room-inner-hover", colorWithAlpha(roomColor, room?.needsCleaning ? 0.24 : 0.2));
    tile.style.setProperty(
      "--vbmo-room-shadow",
      `0 6px 14px ${colorWithAlpha(roomColor, room?.needsCleaning ? 0.18 : 0.14) || "rgba(0,0,0,0.14)"}`
    );
    tile.style.setProperty(
      "--vbmo-room-shadow-hover",
      `0 10px 22px ${colorWithAlpha(roomColor, room?.needsCleaning ? 0.24 : 0.18) || "rgba(0,0,0,0.18)"}`
    );
  }

  function buildRoomTextPalette(textColor) {
    const base = normalizeHexColor(textColor) || "#e8eefc";
    return {
      strong: base,
      muted: colorWithAlpha(base, base === "#0b1220" || base === "#241600" ? 0.76 : 0.82) || base
    };
  }

  function applyDetailCardColorStyles(detailCard, room) {
    const roomColor = normalizeHexColor(room?.needsCleaning ? "#fbbf24" : room?.colorHex);
    if (!roomColor) {
      return;
    }

    detailCard.style.setProperty(
      "--vbmo-detail-bg",
      `linear-gradient(180deg, ${colorWithAlpha(roomColor, room?.needsCleaning ? 0.22 : 0.14)}, rgba(8, 14, 27, 0.99) 74%), linear-gradient(180deg, rgba(17, 29, 52, 0.99), rgba(8, 14, 27, 0.99))`
    );
    detailCard.style.setProperty("--vbmo-detail-border", colorWithAlpha(roomColor, room?.needsCleaning ? 0.56 : 0.34));
    detailCard.style.setProperty("--vbmo-detail-chip-bg", colorWithAlpha(roomColor, room?.needsCleaning ? 0.24 : 0.16));
    detailCard.style.setProperty("--vbmo-detail-chip-border", colorWithAlpha(roomColor, room?.needsCleaning ? 0.46 : 0.28));
  }

  function pickReadableTextColor(hexColor) {
    const normalized = normalizeHexColor(hexColor);
    if (!normalized) {
      return "#e8eefc";
    }

    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance > 0.63 ? "#0b1220" : "#f4f7ff";
  }

  function normalizeHexColor(value) {
    const hex = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return hex;
    }

    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }

    return "";
  }

  function colorWithAlpha(hexColor, alpha) {
    const normalized = normalizeHexColor(hexColor);
    if (!normalized) {
      return "";
    }

    const red = parseInt(normalized.slice(1, 3), 16);
    const green = parseInt(normalized.slice(3, 5), 16);
    const blue = parseInt(normalized.slice(5, 7), 16);
    const opacity = Math.max(0, Math.min(1, Number(alpha)));
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }

  function usesTouchPrimaryInput() {
    return window.matchMedia("(hover: none), (pointer: coarse)").matches;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function minutesAgo(minutes) {
    return new Date(Date.now() - minutes * 60000).toISOString();
  }
})();

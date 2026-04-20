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
  const LIVE_SYNC_MS = 5000;
  const MINUTE_TICK_MS = 60000;
  const DETAIL_HIDE_DELAY_MS = 140;
  const PANEL_OPEN_SETTLE_MS = 700;
  const BRIDGE_REQUEST_TYPE = "vetboard-mini-overlay/request-live-state";
  const BRIDGE_RESPONSE_TYPE = "vetboard-mini-overlay/response-live-state";
  const STORAGE_KEYS = {
    settings: "vetboardMiniOverlaySettings",
    rooms: "vetboardMiniOverlayMockRooms",
    panelOpen: "vetboardMiniOverlayPanelOpen",
    liveSnapshot: "vetboardMiniOverlayLiveSnapshot",
    supabaseAuth: "vetboardMiniOverlaySupabaseAuth"
  };

  const state = {
    panelOpen: false,
    rooms: [],
    thresholds: {
      warningMinutes: 20,
      criticalMinutes: 35
    },
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
    detailRoomId: null,
    detailPinned: false,
    activeDetailAnchor: null,
    refreshTimerId: null,
    liveSyncTimerId: null,
    minuteTickerId: null,
    detailHideTimerId: null,
    panelOpenTimerId: null,
    lastRoomsSignature: "",
    lastRenderAt: null
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
    const storedPanelState = await api.storage.local.get(STORAGE_KEYS.panelOpen);
    state.authState = await dataSource.readSupabaseAuth();

    state.thresholds = {
      warningMinutes: sanitizeMinutes(settings.warningMinutes, 20),
      criticalMinutes: sanitizeMinutes(settings.criticalMinutes, 35)
    };
    state.panelOpen = Boolean(
      typeof storedPanelState[STORAGE_KEYS.panelOpen] === "boolean"
        ? storedPanelState[STORAGE_KEYS.panelOpen]
        : settings.panelOpenByDefault
    );

    mountUi(ui);
    bindUiEvents(ui);

    if (pageBridge.isVetBoardPage()) {
      await syncLiveSnapshot({ force: true });
      startLiveBoardSync();
    }

    await refreshAndRender();
    setPanelOpen(state.panelOpen, { persist: false });
    dataSource.startOverlayRefresh(runImmediateSync, settings.autoRefreshMs);
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
          panelOpenByDefault: false,
          ...storedSettings,
          autoRefreshMs: Math.min(Number(storedSettings.autoRefreshMs || 3000), 3000)
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

      async fetchRooms() {
        const liveSnapshot = await this.readLiveSnapshot();
        const remoteSnapshot = await fetchSupabaseSnapshot();
        const freshestSnapshot = pickFreshestSnapshot(liveSnapshot, remoteSnapshot);

        if (freshestSnapshot?.rooms?.length) {
          return {
            rooms: hydrateRooms(freshestSnapshot.rooms),
            thresholds: {
              warningMinutes: sanitizeMinutes(freshestSnapshot.thresholds?.warningMinutes, state.thresholds.warningMinutes),
              criticalMinutes: sanitizeMinutes(freshestSnapshot.thresholds?.criticalMinutes, state.thresholds.criticalMinutes)
            },
            sourceLabel: freshestSnapshot.sourceLabel || "Live VetBoard",
            sourceDetail: freshestSnapshot.sourceDetail || ""
          };
        }

        const mockRooms = await this.ensureMockRooms();
        return {
          rooms: hydrateRooms(mockRooms),
          thresholds: { ...state.thresholds },
          sourceLabel: "Mock data",
          sourceDetail: "Open VetBoard once to seed live data."
        };
      },

      async refreshRooms() {
        return this.fetchRooms();
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
    let pendingRequest = null;
    let requestCounter = 0;
    let messageListenerBound = false;

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
        if (event.source !== window || !event.data || event.data.type !== BRIDGE_RESPONSE_TYPE) {
          return;
        }

        if (!pendingRequest || pendingRequest.requestId !== event.data.requestId) {
          return;
        }

        pendingRequest.resolve(event.data.snapshot || null);
        pendingRequest = null;
      });

      messageListenerBound = true;
    }

    async function requestSnapshot() {
      if (!isVetBoardPage()) {
        return null;
      }

      ensureInjected();
      ensureListener();

      if (pendingRequest) {
        return null;
      }

      return new Promise((resolve) => {
        const requestId = `req-${Date.now()}-${++requestCounter}`;
        const timeoutId = window.setTimeout(() => {
          if (pendingRequest?.requestId === requestId) {
            pendingRequest.resolve(null);
            pendingRequest = null;
          }
        }, 1200);

        pendingRequest = {
          requestId,
          resolve(snapshot) {
            window.clearTimeout(timeoutId);
            resolve(snapshot);
          }
        };

        window.postMessage(
          {
            type: BRIDGE_REQUEST_TYPE,
            requestId
          },
          "*"
        );
      });
    }

    return {
      isVetBoardPage,
      requestSnapshot
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

  async function refreshAndRender() {
    const payload = await dataSource.refreshRooms();
    const nextRooms = payload.rooms;
    const nextRoomsSignature = getRoomsSignature(nextRooms);
    const roomsChanged = nextRoomsSignature !== state.lastRoomsSignature;

    state.rooms = payload.rooms;
    state.thresholds = payload.thresholds;
    state.sourceLabel = payload.sourceLabel;
    state.sourceDetail = payload.sourceDetail || "";
    state.lastRenderAt = new Date();

    if (roomsChanged) {
      state.lastRoomsSignature = nextRoomsSignature;
      renderRooms(ui);
    }
    renderStatus(ui);
    renderAuthPanel(ui);
    syncDetailCard(ui);
  }

  async function runImmediateSync() {
    if (pageBridge.isVetBoardPage()) {
      await syncLiveSnapshot({ force: true });
    }

    await refreshAndRender();
  }

  function startLiveBoardSync() {
    stopLiveBoardSync();

    state.liveSyncTimerId = window.setInterval(() => {
      syncLiveSnapshot().catch((error) => {
        console.debug("VetBoard Mini Overlay live sync failed", error);
      });
    }, LIVE_SYNC_MS);

    window.addEventListener("focus", handleWindowFocus, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange, { passive: true });
  }

  function stopLiveBoardSync() {
    if (state.liveSyncTimerId) {
      window.clearInterval(state.liveSyncTimerId);
      state.liveSyncTimerId = null;
    }
  }

  function handleWindowFocus() {
    syncLiveSnapshot().catch(() => {});
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      syncLiveSnapshot().catch(() => {});
    }
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
        notesPreview: room.notesPreview || "",
        minutesInRoom
      };
    });
  }

  function getDoctorBadgeText(room) {
    if (!room || !isFilledRoom(room)) {
      return "";
    }

    const doctorName = String(room.assignedDoctor || "").trim();
    if (!doctorName) {
      return "";
    }

    const cleaned = doctorName
      .replace(/\bdr\.?\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) {
      return "";
    }

    const parts = cleaned.split(" ").filter(Boolean);
    if (!parts.length) {
      return "";
    }

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
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
      setAuthPanelOpen(false);
      setPanelOpen(!state.panelOpen);
      if (!state.panelOpen) {
        await runImmediateSync();
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
      const action = event.target?.getAttribute?.("data-detail-action");
      if (action === "close") {
        event.stopPropagation();
        closeDetailCard();
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

      setPanelOpen(!state.panelOpen);
      return false;
    });

    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (
        changes[STORAGE_KEYS.liveSnapshot] ||
        changes[STORAGE_KEYS.supabaseAuth] ||
        changes[STORAGE_KEYS.rooms] ||
        changes[STORAGE_KEYS.settings]
      ) {
        state.authState = changes[STORAGE_KEYS.supabaseAuth]?.newValue || state.authState;
        refreshAndRender().catch(() => {});
        renderAuthPanel(ui);
      }
    });

    window.addEventListener("resize", () => {
      syncDetailCard(builtUi);
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
    builtUi.roomList.textContent = "";
    builtUi.roomList.classList.add("is-fitting");
    builtUi.emptyState.hidden = state.rooms.length > 0;

    if (!state.rooms.length) {
      builtUi.roomList.classList.remove("is-fitting");
      return;
    }

    const fragment = document.createDocumentFragment();

    state.rooms.forEach((room) => {
      const doctorBadge = getDoctorBadgeText(room);
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = `vbmo-room-tile ${getUrgencyClass(room)}${room.needsCleaning ? " is-cleaning" : ""}`;
      tile.dataset.roomId = room.id;
      tile.setAttribute("role", "listitem");
      applyRoomColorStyles(tile, room);
      tile.innerHTML = `
        ${room.needsCleaning ? '<span class="vbmo-room-tile__cleaning" aria-hidden="true">Clean</span>' : ""}
        ${doctorBadge ? `<span class="vbmo-room-tile__doctor-badge" aria-label="Doctor ${escapeHtml(room.assignedDoctor || "")}">${escapeHtml(doctorBadge)}</span>` : ""}
        <span class="vbmo-room-tile__name">${escapeHtml(room.roomName)}</span>
        <span class="vbmo-room-tile__time">${room.minutesInRoom}m</span>
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
          ${state.authMessage ? `<div class="vbmo-auth-card__message">${escapeHtml(state.authMessage)}</div>` : ""}
          <div class="vbmo-auth-card__actions">
            <button class="vbmo-auth-card__button vbmo-auth-card__button--primary" data-auth-action="login" type="button" ${state.authBusy ? "disabled" : ""}>
              ${state.authBusy ? "Logging in..." : "Login to Supabase"}
            </button>
          </div>
        </div>
      `;
  }

  function setPanelOpen(nextOpen, options = { persist: true }) {
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

    if (options.persist) {
      api.storage.local
        .set({
          [STORAGE_KEYS.panelOpen]: nextOpen
        })
        .catch(() => {});
    }
  }

  function openDetailCard(roomId, anchor) {
    clearPendingDetailHide();
    state.detailRoomId = roomId;
    state.activeDetailAnchor = anchor;
    syncDetailCard(ui);
  }

  function closeDetailCard() {
    clearPendingDetailHide();
    state.detailRoomId = null;
    state.detailPinned = false;
    state.activeDetailAnchor = null;
    ui.detailLayer.innerHTML = "";
    ui.detailLayer.classList.remove("is-visible");
  }

  function syncDetailCard(builtUi) {
    if (!state.detailRoomId || !state.activeDetailAnchor || !state.panelOpen) {
      closeDetailCard();
      return;
    }

    const room = state.rooms.find((entry) => entry.id === state.detailRoomId);
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

  function renderDetailCard(room) {
    const detail = document.createElement("section");
    detail.className = "vbmo-detail-card";
    detail.setAttribute("role", "dialog");
    detail.setAttribute("aria-label", `${room.roomName} details`);
    detail.innerHTML = `
      <div class="vbmo-detail-card__header">
        <div>
          <div class="vbmo-detail-card__room">${escapeHtml(room.roomName)}</div>
          <div class="vbmo-detail-card__patient">${escapeHtml(room.patientName || "No patient")}</div>
        </div>
        <div class="vbmo-detail-card__header-actions">
          <div class="vbmo-detail-card__timer ${getUrgencyClass(room)}">${room.minutesInRoom}m</div>
          <button type="button" class="vbmo-detail-card__close" data-detail-action="close" aria-label="Close details">×</button>
        </div>
      </div>
      <div class="vbmo-detail-card__grid">
        ${detailRow("Name", room.patientName || "No patient")}
        ${detailRow("Type", room.reasonForVisit || room.colorLabel || "Unavailable")}
        ${detailRow("Doctor", room.assignedDoctor || "Unassigned")}
        ${detailRow("Technician", room.assignedTechnician || "Unassigned")}
        ${detailRow("Cleaning", room.needsCleaning ? "Needs cleaning" : "No")}
        ${detailRow("Notes", room.notesPreview || "No notes")}
      </div>
    `;
    return detail;
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
      await runImmediateSync();
      setAuthPanelOpen(false);
      setPanelOpen(true);
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
    renderAuthPanel(ui);
    await refreshAndRender();
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

  async function fetchSupabaseSnapshot() {
    const authState = await dataSource.readSupabaseAuth();
    if (!authState?.supabaseUrl || !authState?.supabaseAnonKey || !authState?.session?.access_token) {
      return null;
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

      const boardState = await requestRoomBoardStateFromSupabase(authState, session, practiceId);
      if (!boardState) {
        return null;
      }

      return normalizeBoardStateSnapshot(boardState, {
        sourceLabel: "Supabase sync",
        sourceDetail: session?.user?.email || "Logged-in session",
        sourceUrl: authState.supabaseUrl,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.debug("VetBoard Mini Overlay Supabase pull failed", error);
      return null;
    }
  }

  async function requestPracticeIdFromSupabase(authState, session) {
    const response = await fetch(`${authState.supabaseUrl}/rest/v1/rpc/get_my_practice_id`, {
      method: "POST",
      headers: {
        apikey: authState.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });

    if (response.status === 401 && authState.session?.refresh_token) {
      const freshSession = await refreshSupabaseSession(authState);
      if (!freshSession?.access_token) {
        return null;
      }
      return requestPracticeIdFromSupabase({ ...authState, session: freshSession }, freshSession);
    }

    if (!response.ok) {
      const userId = session?.user?.id || "";
      if (!userId) {
        throw new Error(`Supabase practice lookup failed (${response.status})`);
      }
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
      const profileRow = Array.isArray(profileRows) ? profileRows[0] : profileRows;
      return profileRow?.practice_id || null;
    }

    const payload = await response.json().catch(() => null);
    return typeof payload === "string" && payload ? payload : null;
  }

  async function requestRoomBoardStateFromSupabase(authState, session, practiceId) {
    const headers = {
      apikey: authState.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json"
    };
    const encodedPracticeId = encodeURIComponent(practiceId);

    const [roomRows, doctorRows, colorRows, quickNoteRows, settingsRows, practiceBoardRows] = await Promise.all([
      fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/rooms?select=id,name,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,name.asc`,
        { headers }
      ),
      fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/doctors?select=id,name,initials,active&practice_id=eq.${encodedPracticeId}&order=name.asc`,
        { headers }
      ),
      fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/appointment_types?select=id,title,color_hex,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,title.asc`,
        { headers }
      ),
      fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/quick_notes?select=id,label,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,label.asc`,
        { headers }
      ),
      fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/practice_settings?select=board_columns,show_only_active,board_view,highlight_doctor_id,default_appointment_type_id&practice_id=eq.${encodedPracticeId}&limit=1`,
        { headers }
      ),
      fetchSupabaseJson(
        `${authState.supabaseUrl}/rest/v1/practice_board_state?select=board_state,updated_at&practice_id=eq.${encodedPracticeId}&limit=1`,
        { headers }
      )
    ]);

    return buildBoardStateFromPracticeRows({
      roomRows,
      doctorRows,
      colorRows,
      quickNoteRows,
      settingsRows,
      practiceBoardRows
    });
  }

  async function fetchSupabaseJson(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Supabase request failed (${response.status})`);
    }
    return response.json().catch(() => null);
  }

  function buildBoardStateFromPracticeRows(payload) {
    const roomRows = Array.isArray(payload.roomRows) ? payload.roomRows : [];
    const doctorRows = Array.isArray(payload.doctorRows) ? payload.doctorRows : [];
    const colorRows = Array.isArray(payload.colorRows) ? payload.colorRows : [];
    const quickNoteRows = Array.isArray(payload.quickNoteRows) ? payload.quickNoteRows : [];
    const settingsRow = Array.isArray(payload.settingsRows) ? payload.settingsRows[0] : (payload.settingsRows || null);
    const practiceBoardRow = Array.isArray(payload.practiceBoardRows) ? (payload.practiceBoardRows[0] || null) : (payload.practiceBoardRows || null);

    const colorMap = Object.create(null);
    colorRows.forEach((row) => {
      if (row?.id && row.active !== false) {
        colorMap[row.id] = {
          id: row.id,
          title: row.title || "",
          color: row.color_hex || ""
        };
      }
    });

    const doctorMap = Object.create(null);
    const doctors = [""];
    doctorRows.forEach((row) => {
      const name = String(row?.name || "").trim();
      if (!name || row.active === false) return;
      doctors.push(name);
      doctorMap[row.id] = name;
    });

    const practiceBoardRooms = Array.isArray(practiceBoardRow?.board_state?.rooms) ? practiceBoardRow.board_state.rooms : [];
    const roomEntryMap = Object.create(null);
    practiceBoardRooms.forEach((room) => {
      if (room?.id) roomEntryMap[room.id] = room;
    });

    const defaultColorId = settingsRow?.default_appointment_type_id || Object.keys(colorMap)[0] || "";
    const rooms = roomRows
      .filter((row) => row && row.active !== false)
      .map((row, index) => {
        const entry = roomEntryMap[row.id] || {};
        const room = {
          id: row.id,
          name: row.name || `Room ${index + 1}`,
          patientName: "",
          signalment: "",
          reason: "",
          doctor: "",
          tech: "",
          roomReady: false,
          doctorReady: false,
          notes: "",
          quickNote: "",
          needsCleaning: false,
          colorLabelId: defaultColorId,
          colorHex: "",
          timer: normalizeRoomTimer(entry.timer),
          cleaningTimer: normalizeRoomTimer(entry.cleaningTimer)
        };
        Object.assign(room, entry || {});
        room.id = row.id;
        room.name = row.name || room.name;
        room.timer = normalizeRoomTimer(entry.timer);
        room.cleaningTimer = normalizeRoomTimer(entry.cleaningTimer);
        if (!room.reason && colorMap[room.colorLabelId]?.title) {
          room.reason = colorMap[room.colorLabelId].title;
        }
        return room;
      });

    return {
      rooms,
      doctors,
      quickNotes: ["", ...quickNoteRows.filter((row) => row && row.active !== false).map((row) => row.label || "")],
      colorLabels: Object.values(colorMap),
      settings: {
        timerAlert1AtSec: 20 * 60,
        timerAlert2AtSec: 35 * 60,
        displayCols: Math.max(1, Number(settingsRow?.board_columns || 4)),
        displayLayout: settingsRow?.board_view === "list" ? "list" : "grid",
        highlightDoctor: doctorMap[settingsRow?.highlight_doctor_id] || ""
      }
    };
  }

  function normalizeRoomTimer(timer) {
    const base = timer && typeof timer === "object" ? timer : {};
    return {
      elapsedMs: Math.max(0, Number(base.elapsedMs || 0)),
      running: !!base.running,
      startedAt: base.startedAt || null
    };
  }

  function normalizeBoardStateSnapshot(boardState, meta) {
    if (!boardState || !Array.isArray(boardState.rooms)) {
      return null;
    }

    const settings = boardState.settings || {};
    const colors = Array.isArray(boardState.colorLabels) ? boardState.colorLabels : [];
    const colorMap = Object.create(null);
    colors.forEach((entry) => {
      if (entry?.id) {
        colorMap[entry.id] = entry;
      }
    });

    const rooms = boardState.rooms.map((room, index) => {
      const activeTimer = room && room.needsCleaning ? room.cleaningTimer : room.timer;
      const elapsedMs = computeTimerElapsed(activeTimer);
      const color = room && room.colorLabelId ? colorMap[room.colorLabelId] : null;

      return {
        id: room?.id || `room-${index}`,
        roomName: room?.name || room?.label || "Room",
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
      thresholds: {
        warningMinutes: Math.max(0, Math.floor(Number(settings.timerAlert1AtSec || 0) / 60)),
        criticalMinutes: Math.max(0, Math.floor(Number(settings.timerAlert2AtSec || 0) / 60))
      },
      rooms
    };
  }

  function computeTimerElapsed(timer) {
    if (!timer) {
      return 0;
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

  function fitRoomLabels(builtUi) {
    const labels = builtUi.roomList.querySelectorAll(".vbmo-room-tile__name");
    labels.forEach((label) => {
      fitRoomLabel(label);
    });
  }

  function fitRoomLabel(label) {
    const tile = label.closest(".vbmo-room-tile");
    if (!tile) {
      return;
    }

    const maxFontSize = 18;
    const minFontSize = 6;
    const availableHeight = Math.max(18, tile.clientHeight - 20);
    let low = minFontSize;
    let high = maxFontSize;
    let best = minFontSize;

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
  }

  function getRoomsSignature(rooms) {
    return JSON.stringify(
      (rooms || []).map((room) => ({
        id: room.id,
        roomName: room.roomName,
        patientName: room.patientName,
        reasonForVisit: room.reasonForVisit,
        assignedDoctor: room.assignedDoctor,
        assignedTechnician: room.assignedTechnician,
        notesPreview: room.notesPreview,
        colorHex: room.colorHex,
        needsCleaning: room.needsCleaning,
        minutesInRoom: room.minutesInRoom
      }))
    );
  }

  function applyRoomColorStyles(tile, room) {
    const roomColor = String(room?.colorHex || "").trim();
    if (!roomColor) {
      tile.style.removeProperty("--vbmo-room-bg");
      tile.style.removeProperty("--vbmo-room-border");
      tile.style.removeProperty("--vbmo-room-text");
      tile.style.removeProperty("--vbmo-room-timer-bg");
      return;
    }

    const textColor = pickReadableTextColor(roomColor);
    tile.style.setProperty("--vbmo-room-bg", roomColor);
    tile.style.setProperty("--vbmo-room-border", `${roomColor}cc`);
    tile.style.setProperty("--vbmo-room-text", textColor);
    tile.style.setProperty(
      "--vbmo-room-timer-bg",
      textColor === "#0b1220" ? "rgba(255,255,255,0.58)" : "rgba(5, 10, 20, 0.62)"
    );
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

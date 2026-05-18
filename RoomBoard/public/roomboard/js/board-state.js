    // ===== Supabase: config =====
    var SUPABASE_URL = window.__SUPABASE_URL__ || "";
    var SUPABASE_PUBLISHABLE_KEY = window.__SUPABASE_PUBLISHABLE_KEY__ || "";
    var SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || "";
    var SUPABASE_PUBLIC_KEY = SUPABASE_PUBLISHABLE_KEY || SUPABASE_ANON_KEY || "";
    var currentPracticeId = null;
    var currentPracticeName = "";
    var logoutInProgress = false;
    var lastAppliedBoardStateSignature = "";
    var quickAddDraftState = null;
    var quickAddTimerAdjustOpen = false;
    window.__roomboardPracticeId = null;
    var REMEMBER_ME_STORAGE_KEY = "roomboard.website.rememberMe.v1";
    var AUTH_STORAGE_KEY = "roomboard.website.auth.v1";
    var STORAGE_KEY_PREFIX = "roomboard.website.state.v1";
    var LAST_PRACTICE_ID_STORAGE_KEY = "roomboard.website.lastPracticeId.v1";
    var SESSION_TECH_VIEW_KEY_PREFIX = "roomboard.website.session.techView.v1";
    var SERVER_TIME_OFFSET_STORAGE_KEY = "roomboard.website.serverTimeOffsetMs.v1";
    var serverTimeOffsetMs = 0;
    var hasServerTimeOffset = false;

    // ===== Defaults =====
    var DEFAULT_REASONS = ["Wellness","Sick","Recheck","Sx consult","Vaccine","Tech appt","Drop-off","Euthanasia consult","Other"];
    loadStoredServerTimeOffset();

    function defaultColors(){
      return [
        { id: uuid(), title: "Waiting", color: "#6ea8fe" },
        { id: uuid(), title: "In Treatment", color: "#2dd4bf" },
        { id: uuid(), title: "Needs Doctor", color: "#fbbf24" },
        { id: uuid(), title: "Discharge", color: "#a78bfa" }
      ];
    }

    function defaultDoctors(){
      return ["", "Dr. Smith", "Dr. Jones"];
    }

    function normalizeColorLabelTitle(title, fallback){
      var value = String(title == null ? "" : title).trim();
      if(value) return value;
      var fb = String(fallback == null ? "" : fallback).trim();
      return fb || "Untitled label";
    }

    function compareColorLabels(a, b){
      var at = normalizeColorLabelTitle(a && a.title, "");
      var bt = normalizeColorLabelTitle(b && b.title, "");
      var cmp = at.localeCompare(bt, undefined, { sensitivity: "base", numeric: true });
      if(cmp !== 0) return cmp;
      var aid = a && a.id ? String(a.id) : "";
      var bid = b && b.id ? String(b.id) : "";
      return aid.localeCompare(bid, undefined, { sensitivity: "base", numeric: true });
    }

    function getSortedColorLabels(list){
      return (list || []).slice().sort(compareColorLabels);
    }

    function getDefaultColorLabelIdFromList(list){
      if(!list || !list.length) return null;
      for(var i=0;i<list.length;i++){
        var title = normalizeColorLabelTitle(list[i] && list[i].title, "").toLowerCase();
        if(title === "waiting") return list[i].id;
      }
      var sorted = getSortedColorLabels(list);
      return sorted.length ? sorted[0].id : list[0].id;
    }

    function getConfiguredDefaultColorLabelId(list, preferredId){
      if(!list || !list.length) return null;
      if(preferredId){
        for(var i=0;i<list.length;i++){
          if(list[i].id === preferredId) return preferredId;
        }
      }
      return getDefaultColorLabelIdFromList(list);
    }

    function createRoomRecord(name, colorId){
      var roomName = String(name == null ? "" : name).trim();
      var defaultColorId = colorId || getConfiguredDefaultColorLabelId(state && state.colorLabels, state && state.settings ? state.settings.defaultColorLabelId : null);
      var defaultColor = null;
      if(state && state.colorLabels && state.colorLabels.length){
        for(var i=0;i<state.colorLabels.length;i++){
          if(state.colorLabels[i].id === defaultColorId){
            defaultColor = state.colorLabels[i];
            break;
          }
        }
      }
      return {
        dbId: null,
        id: uuid(),
        name: roomName || "Room",
        patientName: "",
        reason: defaultColor ? defaultColor.title : DEFAULT_REASONS[0],
        colorLabelId: defaultColorId,
        colorHex: "",
	        doctor: "",
	        tech: "",
	        notes: "",
	        quickNote: "",
	        quickNotes: [],
	        roomReady: false,
        doctorReady: false,
        needsCleaning: false,
        timer: { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null },
        cleaningTimer: { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null },
        activeRoomSessionId: null,
        activeCleaningSessionId: null,
        lastDischargeSnapshot: null
      };
    }

    function defaultRooms(colorId){
      var rooms = [];
      for(var i=1;i<=9;i++){
        rooms.push(createRoomRecord("Room " + i, colorId));
      }
      return rooms;
    }

    var DEFAULT_SETTINGS = {
      doctorInitials: {},
      displayCols: 4,
      displayRows: 0,
      intakeCols: 2,
      fontBase: 14,
      fontCard: 14,
      fontTimer: 18,
      fontInput: 14,
      fontDisplay: 14,
      timerAlert1AtSec: 0,
      timerAlert2AtSec: 0,
      timerAlert1Color: "#fbbf24",
      timerAlert2Color: "#fb7185",
      dischargeIconStyle: "paw",
      bgColor: "#0b1220",
      displayCardScale: 1,
      roomCardLineHeight: 1.35,
      intakeCardScale: 1,
      displayFontColor: "#e8eefc",
      displayMutedColor: "#a9b6d3",
	      practiceNameColor: "#fecdd3",
	      showPracticeNameBadge: true,
	      practiceLogoScale: 1,
	      practiceLogoInvert: false,
	      doctorInitialBadgeScale: 1,
	      doctorInitialBadgeFontSize: 16,
	      doctorInitialBadgeColor: "#0b1220",
	      doctorInitialBadgeTextColor: "#e8eefc",
	      doctorBadgeStyles: {},
	      practiceLogoPath: "",
      practiceLogoUrl: "",
      practiceLogoUpdatedAt: "",
      displayLayout: "grid",
      displayOnlyActive: false,
      displaySortMode: "room",
      stopwatchStyle: "classic",
      highlightDoctor: "",
      cardTextMode: "auto",
      showRoomCardPatient: true,
      showRoomCardType: true,
      showRoomCardDoctor: true,
      showRoomCardDoctorName: true,
      showRoomCardDoctorBadge: true,
      showRoomCardTech: true,
      showRoomCardReady: true,
      showRoomCardQuickNote: true,
      showRoomCardStatusNotes: true,
      defaultColorLabelId: null,
      themePreset: "dark",
      themeDefaultPreset: "dark",
      techViewIntake: false
    };

    // ===== State =====
    var state = null;
	    var supabase = null;
		    var saving = false;
		    var autoPullTimer = null;
	    var remotePracticeChannel = null;
    var staleDisplayWatchdogTimer = null;
    var lastBoardActivityAt = Date.now();
    var lastRealtimeEventAt = Date.now();
    var lastRealtimeChannelStatus = "idle";
    var realtimeChannelHealthy = false;
    var watchdogRecoveryInFlight = null;
    var STALE_DISPLAY_THRESHOLD_MS = 25 * 1000;
    var STALE_DISPLAY_WATCHDOG_INTERVAL_MS = 8 * 1000;
	    var remoteRefreshInFlight = null;
    var remoteConfigRefreshInFlight = null;
	    var lastRemoteRefreshAt = 0;
    var lastRemoteConfigRefreshAt = 0;
	    var saveDebounce = null;
      var remoteSaveRetryTimer = null;
      var remoteSaveRetryCount = 0;
		    var sessionKeepAliveTimer = null;
		    var sessionRefreshInFlight = null;
        var authRecoveryInFlight = null;
	        var authFlowInProgress = false;
	        var lastPracticeConfigSignature = "";
	        var lastAppointmentTypesSignature = "";
	        var lastRoomBoardSignature = "";
	        var localBoardDirty = false;
	        var doctorBadgeSettingsDirty = false;
	        var lastLocalPersistenceKey = "";
	        var lastLocalPersistenceSnapshot = "";
	        var currentUserId = null;
        var currentUserEmail = "";
        var currentUserFullName = "";
	        var pendingConfigSave = false;
	        var pendingAppointmentTypesSave = false;
	        var pendingBoardSave = false;
	        var pendingUserSettingsSave = false;
        var remoteRateLimitUntil = 0;
	    var timerBindings = [];
	    var roomLookup = Object.create(null);
	    var knownRoomIds = Object.create(null);
      var pendingRoomSessionInsertByRoomId = Object.create(null);
      var pendingRoomSessionEndSnapshotByToken = Object.create(null);
      var pendingCleaningSessionInsertByRoomId = Object.create(null);
      var pendingCleaningSessionEndSnapshotByToken = Object.create(null);
      var pendingSessionTokenCounter = 0;
      var renderFlushFrameHandle = null;
      var pendingUiRefresh = null;
      var displayRoomNodeMap = Object.create(null);
      var intakeRoomNodeMap = Object.create(null);
      var cachedTimerAlertThresholds = { t1: 0, t2: 0, signature: "" };
      var realtimeReconnectTimer = null;
      var settingsSaveStateResetTimer = null;
      var settingsAutosaveJobs = Object.create(null);
      var settingsRemoteSaveQueued = false;
      var renderPerf = createRenderPerfTracker();
    var REMOTE_BOARD_SAVE_DELAY_MS = 40;
    var REMOTE_CONFIG_SAVE_DELAY_MS = 450;
    var REMOTE_REFRESH_THROTTLE_MS = 120;

    function normalizeStoredPracticeId(value){
      var normalized = String(value == null ? "" : value).trim();
      if(!normalized || normalized === "guest") return "";
      return normalized;
    }

    function hasStoredAuthSessionSnapshot(){
      try{
        var localRaw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if(localRaw && localRaw !== "null") return true;
      }catch(e){}
      try{
        var sessionRaw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
        if(sessionRaw && sessionRaw !== "null") return true;
      }catch(e){}
      return false;
    }

    function getLastKnownPracticeId(){
      try{
        var localValue = normalizeStoredPracticeId(window.localStorage.getItem(LAST_PRACTICE_ID_STORAGE_KEY));
        if(localValue) return localValue;
      }catch(e){}
      try{
        var sessionValue = normalizeStoredPracticeId(window.sessionStorage.getItem(LAST_PRACTICE_ID_STORAGE_KEY));
        if(sessionValue) return sessionValue;
      }catch(e){}
      return "";
    }

    function setLastKnownPracticeId(practiceId){
      var normalized = normalizeStoredPracticeId(practiceId);
      try{
        if(normalized) window.localStorage.setItem(LAST_PRACTICE_ID_STORAGE_KEY, normalized);
        else window.localStorage.removeItem(LAST_PRACTICE_ID_STORAGE_KEY);
      }catch(e){}
      try{
        if(normalized) window.sessionStorage.setItem(LAST_PRACTICE_ID_STORAGE_KEY, normalized);
        else window.sessionStorage.removeItem(LAST_PRACTICE_ID_STORAGE_KEY);
      }catch(e){}
      window.__roomboardBootPracticeScope = normalized || null;
      return normalized;
    }

    function getBootPersistenceScope(){
      if(currentPracticeId) return currentPracticeId;
      if(window.__roomboardBootPracticeScope) return window.__roomboardBootPracticeScope;
      if(!hasStoredAuthSessionSnapshot()) return "guest";
      var lastPracticeId = getLastKnownPracticeId();
      if(lastPracticeId){
        window.__roomboardBootPracticeScope = lastPracticeId;
        return lastPracticeId;
      }
      return "guest";
    }

    window.setLastKnownPracticeId = setLastKnownPracticeId;
    window.getLastKnownPracticeId = getLastKnownPracticeId;
    window.getBootPersistenceScope = getBootPersistenceScope;
      var REMOTE_CONFIG_REFRESH_THROTTLE_MS = 280;
      var AUTO_PULL_INTERVAL_MS = 2500;
      var REALTIME_ACTIVE_GRACE_MS = 3000;
      var SHORT_INTERACTION_HOLD_MS = 450;
      var CHANGE_INTERACTION_HOLD_MS = 700;
      var TEXT_INPUT_HOLD_MS = 1200;

    window.__roomboardPerf = renderPerf;

    const ACCOUNT_SETTINGS_STORAGE_PREFIX = "roomboard.website.accountSettings.v1";
    const WINDOW_SETTINGS_STORAGE_PREFIX = "roomboard.website.windowSettings.v1";
    var ACCOUNT_LOCAL_SETTING_KEYS = [
      "displayCols",
      "displayRows",
      "intakeCols",
      "dischargeIconStyle",
      "fontBase",
      "fontCard",
      "fontTimer",
      "fontInput",
      "fontDisplay",
      "displayCardScale",
      "intakeCardScale",
      "displayFontColor",
	      "displayMutedColor",
	      "displayLayout",
	      "mobileQuickView",
	      "mobileQuickViewColumns",
	      "mobileQuickViewGap",
	      "mobileQuickViewFontSize",
	      "mobileQuickViewTimerSize",
	      "displayOnlyActive",
	      "displaySortMode",
			      "stopwatchStyle",
			      "highlightDoctor",
			      "cardTextMode"
	    ];
    var WINDOW_APPEARANCE_SETTING_KEYS = [
      "displayCols",
      "displayRows",
      "intakeCols",
      "fontBase",
      "fontCard",
      "fontTimer",
      "fontInput",
      "fontDisplay",
      "displayCardScale",
      "intakeCardScale",
      "displayFontColor",
      "displayMutedColor",
	      "displayLayout",
	      "mobileQuickView",
	      "mobileQuickViewColumns",
	      "mobileQuickViewGap",
	      "mobileQuickViewFontSize",
	      "mobileQuickViewTimerSize",
	      "displayOnlyActive",
	      "displaySortMode",
	      "stopwatchStyle",
	      "highlightDoctor",
	      "cardTextMode"
	    ];
    var ACCOUNT_LOCAL_SETTING_DEFAULTS = {
      displayCols: 4,
      displayRows: 0,
      intakeCols: 2,
      dischargeIconStyle: "paw",
      fontBase: 14,
      fontCard: 14,
      fontTimer: 18,
      fontInput: 14,
      fontDisplay: 14,
      displayCardScale: 1,
      intakeCardScale: 1,
      displayFontColor: "#e8eefc",
	      displayMutedColor: "#a9b6d3",
			      displayLayout: "grid",
			      mobileQuickView: false,
			      mobileQuickViewColumns: 4,
			      mobileQuickViewGap: 8,
			      mobileQuickViewFontSize: 22,
			      mobileQuickViewTimerSize: 13,
			      displayOnlyActive: false,
			      displaySortMode: "room",
			      stopwatchStyle: "classic",
			      highlightDoctor: "",
			      cardTextMode: "auto"
	    };
    var activeAccountSettingsScope = "guest";
    var accountSettingsState = null;

    function createRenderPerfTracker(){
      var tracker = {
        fullRenders: 0,
        globalChromeApplies: 0,
        displayChromeSyncs: 0,
        displayRenders: 0,
        displayRoomPatches: 0,
        intakeRenders: 0,
        intakeRoomPatches: 0,
        settingsRenders: 0,
        timerBindingRebuilds: 0,
        boardApplyPatches: 0,
        boardApplyFullRenders: 0
      };
      tracker.reset = function(){
        for(var key in tracker){
          if(Object.prototype.hasOwnProperty.call(tracker, key) && typeof tracker[key] === "number"){
            tracker[key] = 0;
          }
        }
      };
      return tracker;
    }

    function bumpRenderPerf(key, amount){
      if(!renderPerf || typeof renderPerf[key] !== "number") return;
      renderPerf[key] += Number(amount || 1);
    }

    function createPendingUiRefreshState(){
      return {
        fullApp: false,
        applyTheme: false,
        globalChrome: false,
        displayChrome: false,
        displayFull: false,
        displayRoomIds: Object.create(null),
        intakeFull: false,
        intakeRoomIds: Object.create(null),
        settingsLists: false,
        timerBindings: false
      };
    }

    function normalizeRoomIdList(roomIds){
      if(roomIds == null) return [];
      if(Array.isArray(roomIds)) return roomIds;
      return [roomIds];
    }

    function addPendingRoomIds(target, roomIds){
      var list = normalizeRoomIdList(roomIds);
      for(var i=0;i<list.length;i++){
        if(list[i] == null || list[i] === "") continue;
        target[String(list[i])] = true;
      }
    }

    function hasPendingRoomIds(target){
      for(var key in target){
        if(Object.prototype.hasOwnProperty.call(target, key)) return true;
      }
      return false;
    }

    function getPendingRoomIds(target){
      var out = [];
      for(var key in target){
        if(Object.prototype.hasOwnProperty.call(target, key)) out.push(key);
      }
      return out;
    }

    function getSurfaceRoomNodeMap(surface){
      return surface === "intake" ? intakeRoomNodeMap : displayRoomNodeMap;
    }

    function clearSurfaceRoomNodeMap(surface){
      if(surface === "intake") intakeRoomNodeMap = Object.create(null);
      else displayRoomNodeMap = Object.create(null);
    }

    function rememberSurfaceRoomNode(surface, roomId, node){
      if(!roomId || !node) return;
      getSurfaceRoomNodeMap(surface)[String(roomId)] = node;
    }

    function getSurfaceRoomNode(surface, roomId){
      if(!roomId) return null;
      return getSurfaceRoomNodeMap(surface)[String(roomId)] || null;
    }

    function scheduleUiRefresh(options){
      options = options || {};
      if(!pendingUiRefresh) pendingUiRefresh = createPendingUiRefreshState();
      if(options.fullApp){
        pendingUiRefresh.fullApp = true;
        pendingUiRefresh.displayFull = true;
        pendingUiRefresh.intakeFull = true;
      }
      if(options.applyTheme) pendingUiRefresh.applyTheme = true;
      if(options.globalChrome) pendingUiRefresh.globalChrome = true;
      if(options.displayChrome) pendingUiRefresh.displayChrome = true;
      if(options.settingsLists) pendingUiRefresh.settingsLists = true;
      if(options.timerBindings) pendingUiRefresh.timerBindings = true;
      if(options.display){
        if(options.displayFull || !options.displayRoomIds || !normalizeRoomIdList(options.displayRoomIds).length){
          pendingUiRefresh.displayFull = true;
          pendingUiRefresh.displayRoomIds = Object.create(null);
        } else if(!pendingUiRefresh.displayFull){
          addPendingRoomIds(pendingUiRefresh.displayRoomIds, options.displayRoomIds);
        }
      }
      if(options.intake){
        if(options.intakeFull || !options.intakeRoomIds || !normalizeRoomIdList(options.intakeRoomIds).length){
          pendingUiRefresh.intakeFull = true;
          pendingUiRefresh.intakeRoomIds = Object.create(null);
        } else if(!pendingUiRefresh.intakeFull){
          addPendingRoomIds(pendingUiRefresh.intakeRoomIds, options.intakeRoomIds);
        }
      }
      if(renderFlushFrameHandle != null) return;
      renderFlushFrameHandle = requestAnimationFrame(flushUiRefresh);
    }

    function requestRenderAll(){
      scheduleUiRefresh({ fullApp: true });
    }

    function requestRenderDisplay(roomIds){
      scheduleUiRefresh({
        display: true,
        displayFull: !roomIds || !normalizeRoomIdList(roomIds).length,
        displayRoomIds: roomIds
      });
    }

    function requestRenderIntake(roomIds){
      scheduleUiRefresh({
        intake: true,
        intakeFull: !roomIds || !normalizeRoomIdList(roomIds).length,
        intakeRoomIds: roomIds
      });
    }

    function requestRenderSettingsLists(){
      scheduleUiRefresh({ settingsLists: true });
    }

    function flushUiRefresh(){
      var batch = pendingUiRefresh || createPendingUiRefreshState();
      pendingUiRefresh = null;
      renderFlushFrameHandle = null;

      if(batch.applyTheme && typeof window.applyCurrentTheme === "function") window.applyCurrentTheme();

      if(batch.fullApp){
        renderAll();
        if(batch.settingsLists) renderSettingsLists();
        return;
      }

      if(batch.globalChrome) applyGlobalChrome();
      if(batch.displayChrome) syncDisplayChrome();

      if(batch.displayFull){
        renderDisplay(true);
      } else if(hasPendingRoomIds(batch.displayRoomIds) && !patchDisplayRooms(getPendingRoomIds(batch.displayRoomIds))){
        renderDisplay(true);
      }

      if(batch.settingsLists) renderSettingsLists();
      if(batch.timerBindings) rebuildTimerBindings();
    }

	    function cloneAccountSettingValue(key, value){
	      if(key === "doctorInitials" || key === "doctorBadgeStyles"){
	        if(!value || typeof value !== "object") return {};
	        return JSON.parse(JSON.stringify(value));
	      }
	      return value;
	    }

	    function normalizeDoctorBadgeShape(shape){
	      var value = String(shape || "").trim().toLowerCase();
	      if(value === "triangle" || value === "star" || value === "hexagon" || value === "circle" || value === "crab" || value === "bulldog" || value === "flower" || value === "flower2" || value === "turtle" || value === "golfball" || value === "strawberry") return value;
	      return "square";
	    }

	    function normalizeDoctorBadgeStylesMap(raw){
	      var input = (raw && typeof raw === "object") ? raw : {};
	      var out = {};
	      for(var key in input){
	        if(!Object.prototype.hasOwnProperty.call(input, key)) continue;
	        var doctorName = String(key || "").trim();
	        if(!doctorName) continue;
	        var entry = input[key] && typeof input[key] === "object" ? input[key] : {};
	        out[doctorName] = {
	          color: String(entry.color || "").trim(),
	          textColor: String(entry.textColor || "").trim(),
	          shape: normalizeDoctorBadgeShape(entry.shape)
	        };
	      }
	      return out;
	    }

	    function getDoctorBadgeStyle(doctorName){
	      var settings = state && state.settings ? state.settings : {};
	      var customMap = normalizeDoctorBadgeStylesMap(settings.doctorBadgeStyles);
	      var custom = doctorName ? customMap[String(doctorName || "").trim()] : null;
	      return {
	        color: String(custom && custom.color || settings.doctorInitialBadgeColor || "#0b1220").trim(),
	        textColor: String(custom && custom.textColor || settings.doctorInitialBadgeTextColor || settings.displayFontColor || "#e8eefc").trim(),
	        shape: normalizeDoctorBadgeShape(custom && custom.shape)
	      };
	    }
    function normalizeAccountSettings(raw){
      var input = (raw && typeof raw === "object") ? raw : {};
      var out = {};
      for(var i=0;i<ACCOUNT_LOCAL_SETTING_KEYS.length;i++){
        var key = ACCOUNT_LOCAL_SETTING_KEYS[i];
        if(input[key] == null) out[key] = cloneAccountSettingValue(key, ACCOUNT_LOCAL_SETTING_DEFAULTS[key]);
        else out[key] = cloneAccountSettingValue(key, input[key]);
      }
      if(input.showRoomCardDoctorName == null && input.showRoomCardDoctor != null){
        out.showRoomCardDoctorName = input.showRoomCardDoctor !== false;
      }
      if(input.showRoomCardDoctorBadge == null && input.showRoomCardDoctor != null){
        out.showRoomCardDoctorBadge = input.showRoomCardDoctor !== false;
      }
      return out;
    }
    function getBuiltInPersistentSettingsDefaults(){
      var out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS || {}));
      var accountDefaults = normalizeAccountSettings(null);
      for(var i=0;i<ACCOUNT_LOCAL_SETTING_KEYS.length;i++){
        var key = ACCOUNT_LOCAL_SETTING_KEYS[i];
        out[key] = cloneAccountSettingValue(key, accountDefaults[key]);
      }
      var themeDefaults = normalizeThemePrefs(null);
      out.themePreset = themeDefaults.themePreset;
      out.themeDefaultPreset = themeDefaults.themeDefaultPreset;
      out.bgColor = themeDefaults.bgColor;
      return out;
    }
    function normalizePersistentSettings(raw){
      var base = getBuiltInPersistentSettingsDefaults();
      var input = (raw && typeof raw === "object") ? raw : {};
      for(var key in input){
        if(!Object.prototype.hasOwnProperty.call(input, key)) continue;
        if(key === "techViewIntake" || input[key] === undefined) continue;
	        if(key === "doctorInitials" || key === "doctorBadgeStyles") base[key] = cloneAccountSettingValue(key, input[key]);
	        else base[key] = input[key];
	      }
      if(input.showRoomCardDoctorName == null && input.showRoomCardDoctor != null){
        base.showRoomCardDoctorName = input.showRoomCardDoctor !== false;
      }
      if(input.showRoomCardDoctorBadge == null && input.showRoomCardDoctor != null){
        base.showRoomCardDoctorBadge = input.showRoomCardDoctor !== false;
      }
      var accountOnly = normalizeAccountSettings(base);
      for(var i=0;i<ACCOUNT_LOCAL_SETTING_KEYS.length;i++){
        var accountKey = ACCOUNT_LOCAL_SETTING_KEYS[i];
        base[accountKey] = cloneAccountSettingValue(accountKey, accountOnly[accountKey]);
      }
      var themeOnly = normalizeThemePrefs(base);
      base.themePreset = themeOnly.themePreset;
      base.themeDefaultPreset = themeOnly.themeDefaultPreset;
      base.bgColor = themeOnly.bgColor;
      return base;
    }
    function capturePersistentSettingsSnapshot(includeWindowSettings){
      var snapshot = normalizePersistentSettings(state && state.settings ? state.settings : null);
      if(includeWindowSettings){
        var windowPrefs = readStoredWindowAppearanceSettings(activeAccountSettingsScope);
        if(windowPrefs){
          for(var i=0;i<WINDOW_APPEARANCE_SETTING_KEYS.length;i++){
            var key = WINDOW_APPEARANCE_SETTING_KEYS[i];
            snapshot[key] = cloneAccountSettingValue(key, windowPrefs[key]);
          }
        }
      }
      var themeSettings = normalizeThemePrefs(state && state.settings ? state.settings : getThemeSettings());
      snapshot.themePreset = themeSettings.themePreset;
      snapshot.themeDefaultPreset = themeSettings.themeDefaultPreset;
      snapshot.bgColor = themeSettings.bgColor;
      delete snapshot.techViewIntake;
      return normalizePersistentSettings(snapshot);
    }
    function syncPersistentSettingsCaches(snapshot, options){
      var normalized = normalizePersistentSettings(snapshot);
      options = options || {};
      accountSettingsState = normalizeAccountSettings(normalized);
      writeStoredAccountSettings(activeAccountSettingsScope, accountSettingsState);
      themePrefsState = normalizeThemePrefs(normalized);
      writeStoredThemePrefs(activeThemePrefsScope, themePrefsState);
      if(options.syncWindow){
        var windowSnapshot = {};
        for(var i=0;i<WINDOW_APPEARANCE_SETTING_KEYS.length;i++){
          var key = WINDOW_APPEARANCE_SETTING_KEYS[i];
          windowSnapshot[key] = cloneAccountSettingValue(key, normalized[key]);
        }
        writeStoredWindowAppearanceSettings(activeAccountSettingsScope, windowSnapshot);
      }
      return normalized;
    }
    function applyPersistentSettingsSnapshotToState(targetState, snapshot, options){
      if(!targetState) return targetState;
      if(!targetState.settings) targetState.settings = {};
      var normalized = syncPersistentSettingsCaches(snapshot, options);
      for(var key in normalized){
        if(!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
        if(key === "techViewIntake") continue;
        targetState.settings[key] = cloneAccountSettingValue(key, normalized[key]);
      }
      return targetState;
    }
    function getAccountSettingsScopeFromSession(sessionLike){
      if(currentPracticeId) return currentPracticeId;
      if(window.__roomboardPracticeId) return window.__roomboardPracticeId;
      return "guest";
    }
    function getAccountSettingsStorageKey(scope){
      return ACCOUNT_SETTINGS_STORAGE_PREFIX + "." + (scope || "guest");
    }
    function getWindowSettingsStorageKey(scope){
      return WINDOW_SETTINGS_STORAGE_PREFIX + "." + (scope || "guest");
    }
    function readStoredAccountSettings(scope){
      try{
        var raw = localStorage.getItem(getAccountSettingsStorageKey(scope));
        if(!raw) return null;
        return normalizeAccountSettings(JSON.parse(raw));
      }catch(e){
        return null;
      }
    }
    function writeStoredAccountSettings(scope, prefs){
      try{
        localStorage.setItem(getAccountSettingsStorageKey(scope), JSON.stringify(normalizeAccountSettings(prefs)));
      }catch(e){}
    }
    function normalizeWindowAppearanceSettings(raw){
      var input = (raw && typeof raw === "object") ? raw : {};
      var out = {};
      for(var i=0;i<WINDOW_APPEARANCE_SETTING_KEYS.length;i++){
        var key = WINDOW_APPEARANCE_SETTING_KEYS[i];
        if(input[key] == null) out[key] = cloneAccountSettingValue(key, ACCOUNT_LOCAL_SETTING_DEFAULTS[key]);
        else out[key] = cloneAccountSettingValue(key, input[key]);
      }
      if(input.showRoomCardDoctorName == null && input.showRoomCardDoctor != null){
        out.showRoomCardDoctorName = input.showRoomCardDoctor !== false;
      }
      if(input.showRoomCardDoctorBadge == null && input.showRoomCardDoctor != null){
        out.showRoomCardDoctorBadge = input.showRoomCardDoctor !== false;
      }
      return out;
    }
    function readStoredWindowAppearanceSettings(scope){
      try{
        var raw = sessionStorage.getItem(getWindowSettingsStorageKey(scope));
        if(!raw) return null;
        return normalizeWindowAppearanceSettings(JSON.parse(raw));
      }catch(e){
        return null;
      }
    }
    function writeStoredWindowAppearanceSettings(scope, prefs){
      try{
        sessionStorage.setItem(getWindowSettingsStorageKey(scope), JSON.stringify(normalizeWindowAppearanceSettings(prefs)));
      }catch(e){}
    }
    function clearStoredWindowAppearanceSettings(scope){
      try{
        sessionStorage.removeItem(getWindowSettingsStorageKey(scope));
      }catch(e){}
    }
    function applyWindowAppearanceSettingsToState(targetState){
      if(!targetState || !targetState.settings) return targetState;
      var prefs = readStoredWindowAppearanceSettings(activeAccountSettingsScope);
      if(!prefs) return targetState;
      for(var i=0;i<WINDOW_APPEARANCE_SETTING_KEYS.length;i++){
        var key = WINDOW_APPEARANCE_SETTING_KEYS[i];
        targetState.settings[key] = cloneAccountSettingValue(key, prefs[key]);
      }
      return targetState;
    }
    function applyTimerAlertSettings(){
      if(!state || !state.settings) return;
      document.documentElement.style.setProperty("--timerAlert1Color", state.settings.timerAlert1Color || "#fbbf24");
      document.documentElement.style.setProperty("--timerAlert2Color", state.settings.timerAlert2Color || "#fb7185");
    }
    function ensureAccountSettingsLoaded(scope){
      var nextScope = scope || activeAccountSettingsScope || "guest";
      if(accountSettingsState && activeAccountSettingsScope === nextScope) return accountSettingsState;

      var prefs = readStoredAccountSettings(nextScope);
      if(prefs) writeStoredAccountSettings(nextScope, prefs);

      activeAccountSettingsScope = nextScope;
      accountSettingsState = normalizeAccountSettings(prefs);
      return accountSettingsState;
    }
    function applyAccountSettingsToState(targetState){
      if(!targetState) return targetState;
      if(!targetState.settings) targetState.settings = {};
      var prefs = ensureAccountSettingsLoaded(activeAccountSettingsScope);
      for(var i=0;i<ACCOUNT_LOCAL_SETTING_KEYS.length;i++){
        var key = ACCOUNT_LOCAL_SETTING_KEYS[i];
        targetState.settings[key] = cloneAccountSettingValue(key, prefs[key]);
      }
      applyWindowAppearanceSettingsToState(targetState);
      return targetState;
    }
	    function persistAccountUiSettings(){
	      if(!state || !state.settings) return;
	      accountSettingsState = normalizeAccountSettings(state.settings);
	      writeStoredAccountSettings(activeAccountSettingsScope, accountSettingsState);
	      saveLocal();
	      if(!supabase || !currentPracticeId){
	        noteSettingsLocalSaved("Saved locally");
	        return;
	      }
	      noteSettingsRemoteQueued("Saving changes…");
	      scheduleRemoteSave("userSettings");
	    }
	    function persistWindowUiSettings(){
	      if(!state || !state.settings) return;
	      var snapshot = {};
	      for(var i=0;i<WINDOW_APPEARANCE_SETTING_KEYS.length;i++){
	        var key = WINDOW_APPEARANCE_SETTING_KEYS[i];
	        snapshot[key] = cloneAccountSettingValue(key, state.settings[key]);
	      }
	      writeStoredWindowAppearanceSettings(activeAccountSettingsScope, snapshot);
	      saveLocal();
	      noteSettingsLocalSaved("Saved in this window");
	    }
	    function normalizeSimpleName(value){
	      return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
	    }
	    function normalizeRoomQuickNotesValue(value){
	      var source = Array.isArray(value) ? value : (value == null ? [] : [value]);
	      var seen = Object.create(null);
	      var out = [];
	      for(var i=0;i<source.length;i++){
	        var label = normalizeSimpleName(source[i]);
	        if(!label) continue;
	        var key = label.toLowerCase();
	        if(seen[key]) continue;
	        seen[key] = true;
	        out.push(label);
	      }
	      return out;
	    }
	    function getRoomQuickNotes(room){
	      if(!room) return [];
	      var notes = normalizeRoomQuickNotesValue(room.quickNotes);
	      if(!notes.length) notes = normalizeRoomQuickNotesValue(room.quickNote);
	      return notes;
	    }
	    function setRoomQuickNotes(room, value){
	      if(!room) return [];
	      var notes = normalizeRoomQuickNotesValue(value);
	      room.quickNotes = notes;
	      room.quickNote = notes.length ? notes[0] : "";
	      return notes;
	    }
	    function getConfiguredQuickNoteLabels(){
	      var source = state && Array.isArray(state.quickNotes) ? state.quickNotes : [];
	      return normalizeRoomQuickNotesValue(source);
	    }
	    function buildQuickNoteChoiceListHtml(selectedNotes, options){
	      options = options || {};
	      var labels = getConfiguredQuickNoteLabels();
	      if(!labels.length){
	        return '<div class="muted quickNotePickerEmpty">No quick notes configured.</div>';
	      }
	      var selected = normalizeRoomQuickNotesValue(selectedNotes);
	      var selectedMap = Object.create(null);
	      for(var s=0;s<selected.length;s++) selectedMap[selected[s].toLowerCase()] = true;
	      var inputName = options.inputName || "quickNotes";
	      var dataField = options.dataField === false ? "" : ' data-field="quickNotes"';
	      var html = "";
	      for(var i=0;i<labels.length;i++){
	        var label = labels[i];
	        var checked = selectedMap[label.toLowerCase()] ? " checked" : "";
	        html += '<label class="quickNoteChoice">'
	          + '<input type="checkbox" name="' + escapeHtml(inputName) + '" value="' + escapeHtml(label) + '"' + checked + dataField + ' data-quick-note-choice="1">'
	          + '<span>' + escapeHtml(label) + '</span>'
	        + '</label>';
	      }
	      return html;
	    }
	    function getQuickNoteSelectionSummary(notes){
	      notes = normalizeRoomQuickNotesValue(notes);
	      if(!notes.length) return "Select quick notes";
	      if(notes.length <= 2) return notes.join(", ");
	      return notes.length + " selected";
	    }
	    function buildQuickNoteDropdownHtml(selectedNotes, options){
	      options = options || {};
	      var id = options.id ? ' id="' + escapeHtml(options.id) + '"' : "";
	      var selected = normalizeRoomQuickNotesValue(selectedNotes);
	      var choiceHtml = buildQuickNoteChoiceListHtml(selected, {
	        inputName: options.inputName || "quickNotes",
	        dataField: options.dataField
	      });
	      return '<details class="quickNoteDropdown"' + id + '>'
	        + '<summary class="quickNoteDropdownSummary">'
	          + '<span class="quickNoteDropdownText" data-quick-note-summary="1">' + escapeHtml(getQuickNoteSelectionSummary(selected)) + '</span>'
	          + '<span class="quickNoteDropdownChevron" aria-hidden="true">v</span>'
	        + '</summary>'
	        + '<div class="quickNoteDropdownMenu">'
	          + '<div class="quickNotePicker quickNotePickerDropdown">' + choiceHtml + '</div>'
	        + '</div>'
	      + '</details>';
	    }
	    function refreshQuickNoteDropdownSummary(root){
	      if(typeof root === "string") root = $(root);
	      if(!root || !root.querySelector) return;
	      var summary = root.querySelector('[data-quick-note-summary="1"]');
	      if(summary) summary.textContent = getQuickNoteSelectionSummary(readQuickNoteChoiceValues(root));
	    }
	    function readQuickNoteChoiceValues(root){
	      if(typeof root === "string") root = $(root);
	      if(!root || !root.querySelectorAll) return [];
	      var checked = root.querySelectorAll('input[data-quick-note-choice="1"]:checked');
	      var values = [];
	      for(var i=0;i<checked.length;i++) values.push(checked[i].value);
	      return normalizeRoomQuickNotesValue(values);
	    }
	    function collectDuplicateKeys(list, mapper){
      var seen = Object.create(null);
      var dupes = Object.create(null);
      for(var i=0;i<list.length;i++){
        var key = mapper(list[i], i);
        if(!key) continue;
        if(seen[key]) dupes[key] = true;
        else seen[key] = true;
      }
      return Object.keys(dupes);
    }
    function normalizeSettingsForSave(targetState){
      if(!targetState) return targetState;
      targetState = ensureStateShape(targetState);
      if(!targetState.settings) targetState.settings = {};

      if(!Array.isArray(targetState.colorLabels) || !targetState.colorLabels.length){
        targetState.colorLabels = defaultColors();
      }
      for(var i=0;i<targetState.colorLabels.length;i++){
        var label = targetState.colorLabels[i] || {};
        if(!label.id) label.id = uuid();
        label.title = normalizeColorLabelTitle(label.title, "Label " + (i + 1));
        label.color = String(label.color || "#6ea8fe");
        targetState.colorLabels[i] = label;
      }
      targetState.settings.defaultColorLabelId = getConfiguredDefaultColorLabelId(targetState.colorLabels, targetState.settings.defaultColorLabelId);

      if(!Array.isArray(targetState.rooms) || !targetState.rooms.length){
        targetState.rooms = defaultRooms(targetState.settings.defaultColorLabelId);
      }
      for(var r=0;r<targetState.rooms.length;r++){
        var room = targetState.rooms[r] || {};
        if(!room.id) room.id = uuid();
        room.name = normalizeSimpleName(room.name) || ("Room " + (r + 1));
        var hasRoomColor = false;
        for(var rc=0;rc<targetState.colorLabels.length;rc++){
          if(targetState.colorLabels[rc] && targetState.colorLabels[rc].id === room.colorLabelId){
            hasRoomColor = true;
            break;
          }
        }
	        if(!room.colorLabelId || !hasRoomColor){
	          room.colorLabelId = targetState.settings.defaultColorLabelId;
	        }
	        setRoomQuickNotes(room, getRoomQuickNotes(room));
	        targetState.rooms[r] = room;
	      }

      if(!Array.isArray(targetState.doctors)) targetState.doctors = [];
      for(var d=0;d<targetState.doctors.length;d++){
        targetState.doctors[d] = normalizeSimpleName(targetState.doctors[d]);
      }

      if(!Array.isArray(targetState.quickNotes)) targetState.quickNotes = [];
      for(var q=0;q<targetState.quickNotes.length;q++){
        targetState.quickNotes[q] = normalizeSimpleName(targetState.quickNotes[q]);
      }

      targetState.settings.displayCols = Math.max(1, Number(targetState.settings.displayCols || 4));
      targetState.settings.displayRows = Math.max(0, Number(targetState.settings.displayRows || 0));
      targetState.settings.displayCardScale = Math.max(0.8, Math.min(1.6, Number(targetState.settings.displayCardScale || 1)));
      targetState.settings.roomCardLineHeight = Math.max(1, Math.min(1.8, Number(targetState.settings.roomCardLineHeight || 1.35)));
      targetState.settings.fontBase = Math.max(10, Number(targetState.settings.fontBase || 14));
      targetState.settings.fontCard = Math.max(10, Number(targetState.settings.fontCard || 14));
      targetState.settings.fontTimer = Math.max(12, Number(targetState.settings.fontTimer || 18));
      targetState.settings.fontInput = Math.max(10, Number(targetState.settings.fontInput || 14));
      targetState.settings.fontDisplay = Math.max(10, Number(targetState.settings.fontDisplay || 14));
      targetState.settings.timerAlert1AtSec = Math.max(0, Number(targetState.settings.timerAlert1AtSec || 0));
	      targetState.settings.timerAlert2AtSec = Math.max(targetState.settings.timerAlert1AtSec, Number(targetState.settings.timerAlert2AtSec || 0));
	      targetState.settings.practiceNameColor = String(targetState.settings.practiceNameColor || "#fecdd3");
	      targetState.settings.showPracticeNameBadge = targetState.settings.showPracticeNameBadge !== false;
	      targetState.settings.practiceLogoScale = Math.max(0.6, Math.min(5, Number(targetState.settings.practiceLogoScale || 1)));
	      targetState.settings.practiceLogoInvert = targetState.settings.practiceLogoInvert === true;
	      targetState.settings.doctorInitialBadgeScale = Math.max(0.7, Math.min(2, Number(targetState.settings.doctorInitialBadgeScale || 1)));
	      targetState.settings.doctorInitialBadgeFontSize = Math.max(10, Math.min(28, Number(targetState.settings.doctorInitialBadgeFontSize || 16)));
	      targetState.settings.doctorInitialBadgeColor = String(targetState.settings.doctorInitialBadgeColor || "#0b1220");
	      targetState.settings.doctorInitialBadgeTextColor = String(targetState.settings.doctorInitialBadgeTextColor || (targetState.settings.displayFontColor || "#e8eefc"));
	      targetState.settings.doctorBadgeStyles = normalizeDoctorBadgeStylesMap(targetState.settings.doctorBadgeStyles);
	      targetState.settings.practiceLogoPath = String(targetState.settings.practiceLogoPath || "").trim();
      targetState.settings.practiceLogoUrl = String(targetState.settings.practiceLogoUrl || "").trim();
      targetState.settings.practiceLogoUpdatedAt = String(targetState.settings.practiceLogoUpdatedAt || "").trim();
      return targetState;
    }
    function collectSettingsValidationIssues(targetState){
      var source = normalizeSettingsForSave(targetState || state);
      var issues = [];
      var duplicateRooms = collectDuplicateKeys(source.rooms || [], function(room){
        return normalizeSimpleName(room && room.name).toLowerCase();
      });
      if(duplicateRooms.length){
        issues.push({
          code: "duplicateRooms",
          severity: "error",
          blocking: true,
          text: "Two rooms have the same name. Give each room its own name so saves do not get mixed up."
        });
      }
      var duplicateDoctors = collectDuplicateKeys(source.doctors || [], function(name){
        var normalized = normalizeSimpleName(name).toLowerCase();
        return normalized || "";
      });
      if(duplicateDoctors.length){
        issues.push({
          code: "duplicateDoctors",
          severity: "warn",
          blocking: false,
          text: "Some doctors are listed more than once. RoomBoard can still work, but the list will be confusing."
        });
      }
      var duplicateLabels = collectDuplicateKeys(source.colorLabels || [], function(label){
        return normalizeColorLabelTitle(label && label.title, "").toLowerCase();
      });
      if(duplicateLabels.length){
        issues.push({
          code: "duplicateColorLabels",
          severity: "error",
          blocking: true,
          text: "Two color labels have the same name. Give each label its own name before saving."
        });
      }
      if(Number(source.settings.timerAlert2AtSec || 0) < Number(source.settings.timerAlert1AtSec || 0)){
        issues.push({
          code: "timerAlertOrder",
          severity: "warn",
          blocking: false,
          text: "The second timer alert was lower than the first one, so RoomBoard moved it up automatically."
        });
      }
      if(!source.colorLabels || !source.colorLabels.length){
        issues.push({
          code: "missingColorLabels",
          severity: "error",
          blocking: true,
          text: "You need at least one color label so new rooms know which label to use."
        });
      }
      return issues;
    }
    function getBlockingSettingsIssues(targetState){
      var issues = collectSettingsValidationIssues(targetState);
      var out = [];
      for(var i=0;i<issues.length;i++){
        if(issues[i] && issues[i].blocking) out.push(issues[i]);
      }
      return out;
    }
    function getBlockingAppointmentTypeSettingsIssues(targetState){
      var issues = collectSettingsValidationIssues(targetState);
      var out = [];
      for(var i=0;i<issues.length;i++){
        if(!issues[i] || !issues[i].blocking) continue;
        if(issues[i].code === "duplicateColorLabels" || issues[i].code === "missingColorLabels") out.push(issues[i]);
      }
      return out;
    }
    function describeSettingsIssuesForStatus(issues){
      if(!issues || !issues.length) return "";
      if(issues.length === 1) return issues[0].text;
      return issues[0].text + " Fix the other " + (issues.length - 1) + " thing" + (issues.length === 2 ? "" : "s") + " too.";
    }
    function describeSettingsIssuesForSaveState(issues, fallback){
      if(!issues || !issues.length) return fallback || "Fix settings first";
      var text = String(issues[0] && issues[0].text || "").toLowerCase();
      if(text.indexOf("room") >= 0) return "Rename duplicate rooms";
      if(text.indexOf("label") >= 0) return "Rename duplicate labels";
      return fallback || "Fix settings first";
    }
		    function resetWindowAppearanceToDefault(){
		      clearStoredWindowAppearanceSettings(activeAccountSettingsScope);
		      applyAccountSettingsToState(state);
		      applySessionUiPrefs(state);
		      saveLocal();
		      refreshUiFromState({ renderSettingsLists: true });
		    }
	    function syncAccountSettingsFromStorage(){
	      var prefs = readStoredAccountSettings(activeAccountSettingsScope);
	      if(!prefs || !state || !state.settings) return false;
	      accountSettingsState = normalizeAccountSettings(prefs);
	      applyAccountSettingsToState(state);
	      applySessionUiPrefs(state);
	      syncDisplayToolbarControls();
	      renderDoctorHighlightSelect();
	      syncOptionalUi();
	      return true;
	    }
	    window.refreshAccountSettingsForSession = function(sessionLike){
		      ensureAccountSettingsLoaded(getAccountSettingsScopeFromSession(sessionLike));
		      if(!state) return accountSettingsState;
	      applyAccountSettingsToState(state);
	      applySessionUiPrefs(state);
	      saveLocal();
	      refreshUiFromState();
	      return accountSettingsState;
	    };

    function setSettingsSaveState(stateName, text){
      var el = $("settingsSaveState");
      var textEl = $("settingsSaveText");
      if(!el || !textEl) return;
      el.setAttribute("data-state", stateName || "idle");
      if(text){
        textEl.textContent = text;
        return;
      }
      if(stateName === "saving") textEl.textContent = "Saving changes…";
      else if(stateName === "saved") textEl.textContent = "Saved automatically";
      else if(stateName === "error") textEl.textContent = "Save failed";
      else textEl.textContent = "Autosave on";
    }

    function scheduleSettingsSaveStateReset(ms){
      if(settingsSaveStateResetTimer) clearTimeout(settingsSaveStateResetTimer);
      settingsSaveStateResetTimer = null;
      if(!ms) return;
      settingsSaveStateResetTimer = setTimeout(function(){
        settingsSaveStateResetTimer = null;
        if(saving || settingsRemoteSaveQueued) return;
        if(Object.keys(settingsAutosaveJobs).length) return;
        setSettingsSaveState("idle", "Autosave on");
      }, ms);
    }

    function noteSettingsLocalSaved(text){
      setSettingsSaveState("saved", text || "Saved in this window");
      scheduleSettingsSaveStateReset(1800);
    }

    function noteSettingsRemoteQueued(text){
      settingsRemoteSaveQueued = true;
      setSettingsSaveState("saving", text || "Saving changes…");
      scheduleSettingsSaveStateReset(0);
    }

    function noteSettingsRemoteFinished(ok, text){
      settingsRemoteSaveQueued = false;
      if(ok){
        setSettingsSaveState("saved", text || "Saved automatically");
        scheduleSettingsSaveStateReset(2200);
        return;
      }
      setSettingsSaveState("error", text || "Save failed");
      scheduleSettingsSaveStateReset(3600);
    }

    function runSettingsAutosaveJob(key){
      var job = settingsAutosaveJobs[key];
      if(!job) return false;
      if(job.timer) clearTimeout(job.timer);
      delete settingsAutosaveJobs[key];
      var didSave = false;
      if(typeof job.callback === "function") didSave = job.callback() !== false;
      if(!didSave && !saving && !settingsRemoteSaveQueued && !Object.keys(settingsAutosaveJobs).length){
        setSettingsSaveState("idle", "Autosave on");
      }
      return didSave;
    }

    function scheduleSettingsAutosave(key, callback, delayMs){
      var delay = Math.max(0, Number(delayMs || 0));
      if(settingsAutosaveJobs[key] && settingsAutosaveJobs[key].timer){
        clearTimeout(settingsAutosaveJobs[key].timer);
      }
      holdRemoteUpdates(Math.max(TEXT_INPUT_HOLD_MS, delay + 250));
      setSettingsSaveState("saving", "Saving changes…");
      settingsAutosaveJobs[key] = {
        callback: callback,
        timer: setTimeout(function(){
          runSettingsAutosaveJob(key);
        }, delay)
      };
    }

    function flushSettingsAutosaveJobs(){
      var keys = Object.keys(settingsAutosaveJobs);
      for(var i=0;i<keys.length;i++){
        runSettingsAutosaveJob(keys[i]);
      }
    }

    function flushPendingSettingsSaves(){
      flushSettingsAutosaveJobs();
      saveLocal();
      if(saveDebounce) clearTimeout(saveDebounce);
      if(pendingConfigSave || pendingAppointmentTypesSave || pendingBoardSave || pendingUserSettingsSave){
        flushRemoteSave();
      } else if(!saving && !settingsRemoteSaveQueued){
        setSettingsSaveState("idle", "Autosave on");
      }
    }

    function loadLocal(scope){
      try{
        var raw = localStorage.getItem(getStateStorageKey(scope || getBootPersistenceScope()));
        if(!raw) return null;
        return JSON.parse(raw);
      }catch(e){ return null; }
    }
    function getSessionTechViewIntake(){
      try{
        return sessionStorage.getItem(getSessionTechViewStorageKey(getPracticeScope())) === "1";
      }catch(e){
        return false;
      }
    }
    function setSessionTechViewIntake(enabled){
      try{
        sessionStorage.setItem(getSessionTechViewStorageKey(getPracticeScope()), enabled ? "1" : "0");
      }catch(e){}
    }
    function applySessionUiPrefs(s){
      if(!s || !s.settings) return s;
      s.settings.techViewIntake = getSessionTechViewIntake();
      return s;
    }
	    function serializeStateForPersistence(){
	      var snapshot = JSON.parse(JSON.stringify(state || {}));
	      if(snapshot && snapshot.settings){
	        for(var i=0;i<ACCOUNT_LOCAL_SETTING_KEYS.length;i++) delete snapshot.settings[ACCOUNT_LOCAL_SETTING_KEYS[i]];
	        delete snapshot.settings.techViewIntake;
        delete snapshot.settings.bgColor;
        delete snapshot.settings.themePreset;
        delete snapshot.settings.themeDefaultPreset;
	      }
	      return snapshot;
	    }

	    function serializeStateForPersistenceLike(sourceState){
	      var snapshot = JSON.parse(JSON.stringify(sourceState || {}));
	      if(snapshot && snapshot.settings){
	        for(var i=0;i<ACCOUNT_LOCAL_SETTING_KEYS.length;i++) delete snapshot.settings[ACCOUNT_LOCAL_SETTING_KEYS[i]];
	        delete snapshot.settings.techViewIntake;
	        delete snapshot.settings.bgColor;
	        delete snapshot.settings.themePreset;
	        delete snapshot.settings.themeDefaultPreset;
	      }
	      return snapshot;
	    }

	    function getPersistenceStateSignature(sourceState){
	      try{
	        return JSON.stringify(serializeStateForPersistenceLike(sourceState || {}));
	      }catch(e){
	        return "";
	      }
	    }
	    function saveLocal(){
	      try{
	        var storageKey = getStateStorageKey(getPracticeScope());
	        var serialized = JSON.stringify(serializeStateForPersistence());
	        if(storageKey === lastLocalPersistenceKey && serialized === lastLocalPersistenceSnapshot) return;
	        localStorage.setItem(storageKey, serialized);
	        lastLocalPersistenceKey = storageKey;
	        lastLocalPersistenceSnapshot = serialized;
	      }catch(e){}
	    }
	    function syncBoardStateFromStorage(){
	      if(!state) return false;
	      var incoming = ensureStateShape(loadLocal() || null);
	      if(!incoming) return false;
	      if(getPersistenceStateSignature(incoming) === getPersistenceStateSignature(state)) return false;
	      state = incoming;
	      try{
	        lastLocalPersistenceKey = getStateStorageKey(getPracticeScope());
	        lastLocalPersistenceSnapshot = JSON.stringify(serializeStateForPersistence());
	      }catch(e){
	        lastLocalPersistenceKey = "";
	        lastLocalPersistenceSnapshot = "";
	      }
	      applyAccountSettingsToState(state);
	      applySessionUiPrefs(state);
	      if(typeof window.applyCurrentTheme === "function") window.applyCurrentTheme();
	      refreshUiFromState();
	      refreshKnownRoomIds(state.rooms);
	      lastPracticeConfigSignature = getPracticeConfigSignature();
	      lastRoomBoardSignature = getRoomBoardSignature();
	      return true;
	    }
    window.getAppState = function(){
      return state;
    };
	    window.patchAppSettings = function(patch){
	      if(!patch) return;
	      if(!state) state = {};
	      if(!state.settings) state.settings = {};
      for(var key in patch){
        if(Object.prototype.hasOwnProperty.call(patch, key)){
	          state.settings[key] = patch[key];
	        }
	      }
	      persistAccountUiSettings();
	      refreshUiFromState();
	    };

    function ensureStateShape(s){
      if(!s) s = {};
      if(!s.colorLabels || !s.colorLabels.length) s.colorLabels = defaultColors();
      for(var c=0;c<s.colorLabels.length;c++){
        if(!s.colorLabels[c].id) s.colorLabels[c].id = uuid();
        s.colorLabels[c].title = normalizeColorLabelTitle(s.colorLabels[c].title, "Label " + (c + 1));
        if(!s.colorLabels[c].color) s.colorLabels[c].color = "#6ea8fe";
      }
      if(!s.doctors || !s.doctors.length) s.doctors = defaultDoctors();
      if(!s.quickNotes || !s.quickNotes.length) s.quickNotes = ["", "Aggressive", "Vaccine reactor", "Fearful", "Needs muzzle", "Diabetic", "Seizure history"];
      if(!s.settings) s.settings = {};
      var legacyCardScale = s.settings.cardScale;
      var hadDisplayCardScale = s.settings.displayCardScale != null;
      var hadIntakeCardScale = s.settings.intakeCardScale != null;
      var hadLegacyRoomCardDoctor = s.settings.showRoomCardDoctor != null;
      var hadRoomCardDoctorName = s.settings.showRoomCardDoctorName != null;
      var hadRoomCardDoctorBadge = s.settings.showRoomCardDoctorBadge != null;
      for(var k in DEFAULT_SETTINGS){
        if(s.settings[k] == null) s.settings[k] = DEFAULT_SETTINGS[k];
      }
      if(hadLegacyRoomCardDoctor && !hadRoomCardDoctorName) s.settings.showRoomCardDoctorName = s.settings.showRoomCardDoctor !== false;
      if(hadLegacyRoomCardDoctor && !hadRoomCardDoctorBadge) s.settings.showRoomCardDoctorBadge = s.settings.showRoomCardDoctor !== false;
      var defaultColorId = getConfiguredDefaultColorLabelId(s.colorLabels, s.settings.defaultColorLabelId) || (s.colorLabels[0] && s.colorLabels[0].id);
      s.settings.defaultColorLabelId = defaultColorId;
      if(!hadDisplayCardScale && legacyCardScale != null) s.settings.displayCardScale = legacyCardScale;
      if(!hadIntakeCardScale && legacyCardScale != null) s.settings.intakeCardScale = legacyCardScale;
      if(s.settings.cardScale != null) delete s.settings.cardScale;
      if(!s.rooms || !s.rooms.length) s.rooms = defaultRooms(defaultColorId);

      // room fields
      for(var i=0;i<s.rooms.length;i++){
        var r = s.rooms[i];
        if(!r.id) r.id = uuid();
        if(r.dbId == null) r.dbId = null;
        if(r.name == null || String(r.name).trim() === "") r.name = "Room " + (i + 1);
        if(r.patientName == null) r.patientName = "";
        if(r.reason == null) r.reason = DEFAULT_REASONS[0];
        // keep reason aligned to selected Type title
        var _c = null; for(var _i=0; _i<s.colorLabels.length; _i++){ if(s.colorLabels[_i].id === r.colorLabelId){ _c = s.colorLabels[_i]; break; } }
        if(r.colorLabelId == null) r.colorLabelId = defaultColorId;
        if(!_c && r.colorLabelId != null){
          for(var _j=0; _j<s.colorLabels.length; _j++){
            if(s.colorLabels[_j].id === r.colorLabelId){ _c = s.colorLabels[_j]; break; }
          }
        }
        if(_c && r.reason !== _c.title) r.reason = _c.title;
        if(r.colorHex == null) r.colorHex = "";
        if(r.doctor == null) r.doctor = "";
	        if(r.tech == null) r.tech = "";
	        if(r.notes == null) r.notes = "";
	        if(r.quickNote == null) r.quickNote = "";
	        setRoomQuickNotes(r, getRoomQuickNotes(r));
	        if(r.roomReady == null) r.roomReady = false;
        if(r.doctorReady == null) r.doctorReady = false;
        if(r.needsCleaning == null) r.needsCleaning = false;
        if(!r.timer) r.timer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };
        if(r.timer.elapsedMs == null) r.timer.elapsedMs = 0;
        if(r.timer.running == null) r.timer.running = false;
        if(r.timer.startedAt == null) r.timer.startedAt = null;
        if(r.timer.startedAtIso == null) r.timer.startedAtIso = null;
        if(r.timer.updatedAtIso == null) r.timer.updatedAtIso = null;
        if(!r.cleaningTimer) r.cleaningTimer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };
        if(r.activeRoomSessionId == null) r.activeRoomSessionId = null;
        if(r.activeCleaningSessionId == null) r.activeCleaningSessionId = null;
        if(r.lastDischargeSnapshot == null) r.lastDischargeSnapshot = null;
        if(r.cleaningTimer.elapsedMs == null) r.cleaningTimer.elapsedMs = 0;
        if(r.cleaningTimer.running == null) r.cleaningTimer.running = false;
        if(r.cleaningTimer.startedAt == null) r.cleaningTimer.startedAt = null;
        if(r.cleaningTimer.startedAtIso == null) r.cleaningTimer.startedAtIso = null;
        if(r.cleaningTimer.updatedAtIso == null) r.cleaningTimer.updatedAtIso = null;
      }
      return s;
    }

    function getColorById(id){
      if(id != null && id !== ""){
        for(var i=0;i<state.colorLabels.length;i++){
          if(state.colorLabels[i].id === id) return state.colorLabels[i];
        }
      }
      if(id == null || id === ""){
        var fallbackId = getConfiguredDefaultColorLabelId(state.colorLabels, state.settings && state.settings.defaultColorLabelId);
        for(var j=0;j<state.colorLabels.length;j++){
          if(state.colorLabels[j].id === fallbackId) return state.colorLabels[j];
        }
      }
      return state.colorLabels[0] || null;
    }

    function syncRoomReasonsToColorLabel(labelId){
      var label = getColorById(labelId);
      if(!label) return;
      for(var i=0;i<state.rooms.length;i++){
        if(state.rooms[i].colorLabelId === labelId) state.rooms[i].reason = label.title;
      }
    }

    function applyLayout(){
      var cols = Number(state.settings.displayCols || 4);
      var rows = Number(state.settings.displayRows || 0);
      var intakeCols = Number(state.settings.intakeCols || 2);
      var displayCardScale = Number(state.settings.displayCardScale || 1);
      var roomCardLineHeight = Math.max(1, Math.min(1.8, Number(state.settings.roomCardLineHeight || 1.35)));
      var intakeCardScale = Number(state.settings.intakeCardScale || 1);

      document.documentElement.style.setProperty("--cols", String(cols));
      document.documentElement.style.setProperty("--rows", String(rows));
      document.documentElement.style.setProperty("--intakeCols", String(intakeCols));
      document.documentElement.style.setProperty("--displayCardScale", String(displayCardScale));
      document.documentElement.style.setProperty("--roomCardLineHeight", String(roomCardLineHeight));
      document.documentElement.style.setProperty("--intakeCardScale", String(intakeCardScale));
      updateViewportFit();

      var wrap = $("displayWrap");
      if(wrap){
        if(rows && rows > 0) wrap.className = "gridWrap";
        else wrap.className = "gridWrap unlimited";
      }

      // Display layout: grid (cards) vs list (whiteboard)
      var grid = $("displayGrid");
      if(grid){
        var layout = (state.settings.displayLayout === "list") ? "list" : "grid";
        if(layout === "list"){
          grid.classList.remove("boxView");
          grid.classList.add("listView");
        }else{
          grid.classList.remove("listView");
          grid.classList.add("boxView");
        }
      }
      var tbtn = $("viewToggleBtn");
      if(tbtn){
        var isList = (state.settings.displayLayout === "list");
        tbtn.textContent = isList ? "≡" : "▦";
        tbtn.title = isList ? "Switch to grid view" : "Switch to list view";
        tbtn.setAttribute("aria-label", tbtn.title);
      }
    }



    function applyWbRoomNameMarquee(){
      var grid = $("displayGrid");
      if(!grid || !grid.classList.contains("listView")) return;
      var wraps = grid.querySelectorAll(".wbRoomNameWrap");
      wraps.forEach(function(wrap){
        wrap.classList.remove("isOverflow");
        wrap.style.removeProperty("--wbMarqueeDist");
        wrap.style.removeProperty("--wbMarqueeDur");
        var name = wrap.querySelector(".wbRoomName");
        if(!name) return;
        // measure overflow
        var dist = name.scrollWidth - wrap.clientWidth;
        if(dist > 8){
          wrap.classList.add("isOverflow");
          // distance + small buffer so it fully clears
          var travel = dist + 24;
          wrap.style.setProperty("--wbMarqueeDist", travel + "px");
          // duration proportional to distance (px / speed)
          var speed = 35; // px per second
          var dur = Math.max(6, Math.min(18, travel / speed));
          wrap.style.setProperty("--wbMarqueeDur", dur + "s");
        }
      });
    }

    function findRoomById(id){
      for(var i=0;i<state.rooms.length;i++){
        if(state.rooms[i].id === id) return state.rooms[i];
      }
      return null;
    }

    function getPreferredQuickAddRoomId(){
      if(!state || !state.rooms || !state.rooms.length) return "";
      for(var i=0;i<state.rooms.length;i++){
        if(!state.rooms[i].patientName && !state.rooms[i].needsCleaning) return state.rooms[i].id;
      }
      for(var j=0;j<state.rooms.length;j++){
        if(!state.rooms[j].needsCleaning) return state.rooms[j].id;
      }
      return state.rooms[0].id;
    }

    function setQuickAddSwitchState(id, on){
      var el = $(id);
      if(el) el.classList.toggle("on", !!on);
    }

    function getQuickAddSwitchState(id){
      var el = $(id);
      return !!(el && el.classList.contains("on"));
    }

    function flashRoom(roomId){
      var card = document.querySelector('#displayGrid [data-room-id="'+ roomId +'"]');
      if(card && card.scrollIntoView){
        card.scrollIntoView({behavior:"smooth", block:"nearest"});
      }
      if(card){
        card.classList.add("flash");
        setTimeout(function(){ card.classList.remove("flash"); }, 900);
      }
    }

	    function getQuickAddDraftFromRoom(room){
	      room = room || {};
	      var activeTimer = room.needsCleaning ? room.cleaningTimer : room.timer;
	      var quickNotes = getRoomQuickNotes(room);
	      return {
	        patientName: String(room.patientName || ""),
	        colorLabelId: room.colorLabelId || "",
	        doctor: String(room.doctor || ""),
	        tech: String(room.tech || ""),
	        quickNote: quickNotes[0] || "",
	        quickNotes: quickNotes,
	        notes: String(room.notes || ""),
        roomReady: !!room.roomReady,
        doctorReady: !!room.doctorReady,
        timerElapsedMs: Math.max(0, Number(computeElapsed(activeTimer) || 0)),
        timerDirty: false,
        timerInputValue: ""
      };
    }

	    function readQuickAddFormDraft(){
	      var roomSelect = $("quickAddRoomSelect");
	      if(!roomSelect) return null;
	      var fallbackRoomReady = !!(quickAddDraftState && quickAddDraftState.roomReady);
	      var quickNotes = readQuickNoteChoiceValues("quickAddQuickNotes");
	      return {
        roomId: String(roomSelect.value || ""),
        patientName: String(($("quickAddPatientName") && $("quickAddPatientName").value) || ""),
        colorLabelId: String(($("quickAddColorLabelId") && $("quickAddColorLabelId").value) || ""),
	        doctor: String(($("quickAddDoctor") && $("quickAddDoctor").value) || ""),
	        tech: String(($("quickAddTech") && $("quickAddTech").value) || ""),
	        quickNote: quickNotes[0] || "",
	        quickNotes: quickNotes,
	        notes: String(($("quickAddNotes") && $("quickAddNotes").value) || ""),
        roomReady: $("quickAddRoomReadySwitch") ? getQuickAddSwitchState("quickAddRoomReadySwitch") : fallbackRoomReady,
        doctorReady: getQuickAddSwitchState("quickAddDoctorReadySwitch"),
        timerElapsedMs: Math.max(0, Number(quickAddDraftState && quickAddDraftState.timerElapsedMs || 0)),
        timerDirty: !!(quickAddDraftState && quickAddDraftState.timerDirty),
        timerInputValue: String(($("quickAddTimerInput") && $("quickAddTimerInput").value) || (quickAddDraftState && quickAddDraftState.timerInputValue) || "")
      };
    }

	    function storeQuickAddDraft(draft){
	      var quickNotes = normalizeRoomQuickNotesValue((draft && draft.quickNotes && draft.quickNotes.length) ? draft.quickNotes : (draft && draft.quickNote));
	      quickAddDraftState = {
        roomId: String(draft && draft.roomId || ""),
        patientName: String(draft && draft.patientName || ""),
        colorLabelId: String(draft && draft.colorLabelId || ""),
	        doctor: String(draft && draft.doctor || ""),
	        tech: String(draft && draft.tech || ""),
	        quickNote: quickNotes[0] || "",
	        quickNotes: quickNotes,
	        notes: String(draft && draft.notes || ""),
        roomReady: !!(draft && draft.roomReady),
        doctorReady: !!(draft && draft.doctorReady),
        timerElapsedMs: Math.max(0, Number(draft && draft.timerElapsedMs || 0)),
        timerDirty: !!(draft && draft.timerDirty),
        timerInputValue: String(draft && draft.timerInputValue || "")
      };
    }

    function captureQuickAddDraft(){
      var draft = readQuickAddFormDraft();
      if(!draft) return null;
      storeQuickAddDraft(draft);
      return draft;
    }

    function clearQuickAddDraft(){
      quickAddDraftState = null;
    }

    function resetQuickAddDrafts(){
      quickAddDraftState = null;
      quickAddTimerAdjustOpen = false;
    }

    function getQuickAddTimerDisplayMs(room, draft){
      if(draft && draft.timerDirty) return Math.max(0, Number(draft.timerElapsedMs || 0));
      var activeTimer = room && room.needsCleaning ? room.cleaningTimer : room && room.timer;
      return Math.max(0, Number(computeElapsed(activeTimer) || 0));
    }

    function parseQuickAddTimerInputToMs(value){
      var raw = String(value || "").trim();
      if(!raw) return null;
      if(/^\d+(?:\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 60 * 1000);
      var parts = raw.split(":");
      if(parts.length === 2 || parts.length === 3){
        for(var i=0;i<parts.length;i++){
          if(!/^\d+$/.test(parts[i])) return null;
        }
        var hours = 0;
        var minutes = 0;
        var seconds = 0;
        if(parts.length === 2){
          minutes = Number(parts[0] || 0);
          seconds = Number(parts[1] || 0);
        } else {
          hours = Number(parts[0] || 0);
          minutes = Number(parts[1] || 0);
          seconds = Number(parts[2] || 0);
        }
        if(seconds >= 60 || minutes >= 60 && parts.length === 3) return null;
        return Math.max(0, ((hours * 60 + minutes) * 60 + seconds) * 1000);
      }
      return null;
    }

    function setQuickAddTimerDraft(roomId, elapsedMs, options){
      options = options || {};
      var draft = readQuickAddFormDraft() || quickAddDraftState || getQuickAddDraftFromRoom(findRoomById(roomId));
      draft.roomId = String(roomId || draft.roomId || "");
      draft.timerElapsedMs = Math.max(0, Number(elapsedMs || 0));
      draft.timerDirty = options.timerDirty !== false;
      if(options.timerInputValue != null) draft.timerInputValue = String(options.timerInputValue);
      storeQuickAddDraft(draft);
    }

    function applyDraftTimerToRoom(room, elapsedMs, referenceNowIso){
      if(!room) return;
      var timer = room.needsCleaning ? room.cleaningTimer : room.timer;
      if(!timer) timer = room.needsCleaning ? (room.cleaningTimer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null }) : (room.timer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null });
      var normalizedElapsed = Math.max(0, Number(elapsedMs || 0));
      var normalizedNowIso = normalizeServerNowIso(referenceNowIso) || getEstimatedServerNowIso();
      var startedAtMs = Date.parse(normalizedNowIso);
      var shouldRun = !!timer.running;
      if(!shouldRun && normalizedElapsed > 0 && (room.needsCleaning || roomHasAssignedPatient(room))) shouldRun = true;
      timer.elapsedMs = normalizedElapsed;
      timer.running = shouldRun;
      timer.startedAt = shouldRun && isFinite(startedAtMs) ? startedAtMs : null;
      timer.startedAtIso = shouldRun ? normalizedNowIso : null;
      timer.updatedAtIso = normalizedNowIso;
      if(typeof normalizeRoomTimerModes === "function") normalizeRoomTimerModes(room);
      if(shouldRun){
        if(room.needsCleaning) logCleaningSessionStart(room);
        else if(roomHasAssignedPatient(room)) logRoomSessionStart(room);
      }
    }

    function renderQuickAddForm(roomId, shouldFocusPatient){
      var body = $("quickAddBody");
      if(!body) return;
      if(!state || !state.rooms || !state.rooms.length){
        body.innerHTML = '<div class="card"><div class="muted">No rooms available.</div></div>';
        return;
      }

      var selectedRoomId = roomId || ($("quickAddRoomSelect") ? $("quickAddRoomSelect").value : "") || getPreferredQuickAddRoomId();
      var room = findRoomById(selectedRoomId) || state.rooms[0];
      if(!room) return;
      selectedRoomId = room.id;
      var draft = quickAddDraftState || getQuickAddDraftFromRoom(room);
      var timerDisplayMs = getQuickAddTimerDisplayMs(room, draft);
      var timerLabel = room.needsCleaning ? "Cleaning timer" : "Room timer";
      var timerAdjustControls = quickAddTimerAdjustOpen
        ? (
          '<div class="quickAddTimerControls">'
            + '<div class="quickAddTimerButtons">'
              + '<button class="btn sm" data-action="quickAddTimerDelta" data-delta-minutes="-5" type="button">-5m</button>'
              + '<button class="btn sm" data-action="quickAddTimerDelta" data-delta-minutes="-1" type="button">-1m</button>'
              + '<button class="btn sm" data-action="quickAddTimerDelta" data-delta-minutes="1" type="button">+1m</button>'
              + '<button class="btn sm" data-action="quickAddTimerDelta" data-delta-minutes="5" type="button">+5m</button>'
            + '</div>'
            + '<div class="quickAddTimerManual">'
              + '<input id="quickAddTimerInput" type="text" value="' + escapeHtml(String(draft.timerInputValue || "")) + '" placeholder="Minutes or mm:ss" />'
              + '<button class="btn sm" data-action="applyQuickAddTimer" type="button">Set</button>'
              + '<button class="btn sm" data-action="resetQuickAddTimer" type="button">Reset</button>'
            + '</div>'
            + '<div class="muted quickAddTimerHelp">Current time: ' + escapeHtml(formatTime(timerDisplayMs)) + '. Enter minutes like 12 or use mm:ss like 12:30.</div>'
          + '</div>'
        )
        : "";

      var roomOptions = "";
      for(var i=0;i<state.rooms.length;i++){
        var r = state.rooms[i];
        var roomLabel = r.name;
        if(r.patientName) roomLabel += " - " + r.patientName;
        if(r.needsCleaning) roomLabel += " (Needs cleaning)";
        roomOptions += '<option ' + (r.id === selectedRoomId ? 'selected ' : '') + 'value="' + escapeHtml(r.id) + '">' + escapeHtml(roomLabel) + '</option>';
      }

      var doctorOptions = '<option ' + (!room.doctor ? 'selected ' : '') + 'value="">None</option>';
      for(var d=0; d<state.doctors.length; d++){
        var name = String(state.doctors[d] == null ? "" : state.doctors[d]).trim();
        if(!name) continue;
        var sel = (name === room.doctor) ? "selected " : "";
        var di = (state.settings && state.settings.doctorInitials) ? (state.settings.doctorInitials[name] || "") : "";
        var doctorLabel = name;
        if(di && name) doctorLabel = name + " (" + di + ")";
        doctorOptions += '<option ' + sel + 'value="' + escapeHtml(name) + '">' + escapeHtml(doctorLabel) + '</option>';
      }

      var colorOptions = "";
      var quickAddColorLabels = getSortedColorLabels(state.colorLabels);
      for(var c=0;c<quickAddColorLabels.length;c++){
        var cl = quickAddColorLabels[c];
        var sel2 = (cl.id === draft.colorLabelId) ? "selected " : "";
        colorOptions += '<option ' + sel2 + 'value="' + escapeHtml(cl.id) + '">' + escapeHtml(cl.title) + '</option>';
      }

	      var quickNoteDropdown = buildQuickNoteDropdownHtml(draft.quickNotes || draft.quickNote, {
	        id: "quickAddQuickNotes",
	        inputName: "quickAddQuickNotes",
	        dataField: false
	      });

      doctorOptions = '<option ' + (!draft.doctor ? 'selected ' : '') + 'value="">None</option>';
      for(var d2=0; d2<state.doctors.length; d2++){
        var doctorName = String(state.doctors[d2] == null ? "" : state.doctors[d2]).trim();
        if(!doctorName) continue;
        var doctorSelected = (doctorName === draft.doctor) ? "selected " : "";
        var doctorInitials = (state.settings && state.settings.doctorInitials) ? (state.settings.doctorInitials[doctorName] || "") : "";
        var doctorOptionLabel = doctorName;
        if(doctorInitials && doctorName) doctorOptionLabel = doctorName + " (" + doctorInitials + ")";
        doctorOptions += '<option ' + doctorSelected + 'value="' + escapeHtml(doctorName) + '">' + escapeHtml(doctorOptionLabel) + '</option>';
      }

	      body.innerHTML =
	        '<div class="card">'
	          + '<div class="quickAddCurrentRoom">'
	            + '<h3 id="quickAddCurrentRoom">'+escapeHtml(room.name)+'</h3>'
	          + '</div>'
          + '<div class="quickAddGrid">'
            + '<div class="field full"><label>Room</label><select id="quickAddRoomSelect">'+roomOptions+'</select></div>'
            + '<div class="field full"><label>Patient name</label><input id="quickAddPatientName" type="text" value="'+escapeHtml(draft.patientName)+'" placeholder="e.g., Bella" /></div>'
            + '<div class="field"><label>Type</label><select id="quickAddColorLabelId">'+colorOptions+'</select></div>'
            + '<div class="field"><label>Doctor</label><select id="quickAddDoctor">'+doctorOptions+'</select></div>'
            + '<div class="field"><label>Tech</label><input id="quickAddTech" type="text" value="'+escapeHtml(draft.tech)+'" placeholder="e.g., Alex" /></div>'
            + '<div class="field"><label>Doctor ready</label><div class="toggle"><div><div style="font-weight:700;">Doctor ready</div><div class="muted">Doctor ready to go in</div></div><div class="switch '+(draft.doctorReady ? 'on' : '')+'" data-action="toggleQuickAddDoctorReady" id="quickAddDoctorReadySwitch"><div class="knob"></div></div></div></div>'
	            + '<div class="field"><label>Quick notes</label>'+quickNoteDropdown+'</div>'
	            + '<div class="field quickAddTimerField"><label>' + escapeHtml(timerLabel) + '</label><div class="quickAddTimerSummary"><div class="quickAddTimerCurrent"><strong>' + escapeHtml(formatTime(timerDisplayMs)) + '</strong><span class="muted">' + (draft.timerDirty ? 'Will update on save' : ('Current ' + timerLabel.toLowerCase())) + '</span></div><button class="btn sm" data-action="toggleQuickAddTimerAdjust" type="button">' + (quickAddTimerAdjustOpen ? 'Hide' : 'Adjust') + '</button></div>' + timerAdjustControls + '</div>'
	            + '<div class="field full"><label>Status notes</label><textarea id="quickAddNotes" placeholder="Status notes...">'+escapeHtml(draft.notes)+'</textarea></div>'
          + '</div>'
          + '<div class="actions">'
            + '<button class="btn sm" data-action="cancelQuickAdd" type="button">Cancel</button>'
            + '<button class="btn sm primary" data-action="saveQuickAdd" type="button">Save to room</button>'
          + '</div>'
        + '</div>';
      setQuickAddSwitchState("quickAddDoctorReadySwitch", !!draft.doctorReady);

      if(shouldFocusPatient){
        var patientInput = $("quickAddPatientName");
        if(patientInput){
          setTimeout(function(){
            patientInput.focus();
            patientInput.select();
          }, 0);
        }
      }
    }

    function openQuickAdd(roomId){
      closeDrawer();
      setTab("display");
      resetQuickAddDrafts();
      document.body.className = (document.body.className + " quickAddOpen").replace(/\s+/g," ").trim();
      holdRemoteUpdates(SHORT_INTERACTION_HOLD_MS);
      renderQuickAddForm(roomId || getPreferredQuickAddRoomId(), true);
    }

    function closeQuickAdd(){
      document.body.className = document.body.className.replace(/\bquickAddOpen\b/g,"").replace(/\s+/g," ").trim();
      resetQuickAddDrafts();
      flushPendingRemoteRefresh();
    }

    async function saveQuickAdd(){
      var draft = readQuickAddFormDraft();
      if(!draft) return;
      var room = findRoomById(draft.roomId);
      if(!room) return;
      var hadPatientBefore = roomHasAssignedPatient(room);

      room.patientName = String(draft.patientName || "").trim();
      room.colorLabelId = draft.colorLabelId || room.colorLabelId;
	      room.colorHex = "";
	      room.doctor = draft.doctor || "";
	      room.tech = String(draft.tech || "").trim();
	      setRoomQuickNotes(room, draft.quickNotes || draft.quickNote || []);
	      room.notes = String(draft.notes || "").trim();
      room.doctorReady = !!draft.doctorReady;
      room.lastDischargeSnapshot = null;

      var selectedColor = getColorById(room.colorLabelId);
      if(selectedColor) room.reason = selectedColor.title;

      var serverNowIso = getEstimatedServerNowIso();
      if(draft.timerDirty) applyDraftTimerToRoom(room, draft.timerElapsedMs, serverNowIso);
      Promise.resolve(syncRoomSessionAfterOccupancyChange(room, hadPatientBefore, {
        autoStartTimer: true,
        stopTimerWhenEmpty: true,
        clearReadyWhenEmpty: true,
        serverNowIso: serverNowIso
      })).catch(function(err){
        console.warn("Quick add room-session sync fell back:", err);
      });

      saveLocal();
      clearQuickAddDraft();
      closeQuickAdd();
      requestBoardRoomRefresh([room.id], { includeIntake: false });
      setTab("display");
      flashRoom(room.id);
      setStatus(room.name + " updated");
      commitBoardInBackground({ immediate: true });
    }

    
	    function closestRoomCard(node){
	      while(node && node !== document && node !== document.body){
	        if(node.getAttribute && (node.getAttribute("data-room-id") || node.getAttribute("data-roomid") || node.dataset && node.dataset.roomId)) return node;
	        if(node.classList && node.classList.contains("room")) return node;
	        node = node.parentNode;
	      }
	      return null;
	    }
	    function setDraggedRoomId(roomId, dataTransfer){
	      window.__dragFromRoomId = roomId || null;
	      if(!roomId || !dataTransfer) return;
	      try{ dataTransfer.setData("text/plain", roomId); }catch(_){}
	      try{ dataTransfer.effectAllowed = "move"; }catch(_){}
	    }
	    function getDraggedRoomId(dataTransfer){
	      var fromId = null;
	      if(dataTransfer){
	        try{ fromId = dataTransfer.getData("text/plain"); }catch(_){}
	      }
	      return fromId || window.__dragFromRoomId || null;
	    }
	    function clearDraggedRoomId(){
	      window.__dragFromRoomId = null;
	    }
	    var recentRoomSwapKey = "";
	    var recentRoomSwapAt = 0;
	    function swapRoomsById(fromId, toId, options){
	      options = options || {};
	      if(!fromId || !toId || fromId === toId) return false;
	      var swapKey = [String(fromId), String(toId)].sort().join("::");
	      var now = Date.now();
	      if(recentRoomSwapKey === swapKey && (now - recentRoomSwapAt) < 350){
	        return false;
	      }
	      var fromRoom = findRoomById(fromId);
	      var toRoom = findRoomById(toId);
	      if(!fromRoom || !toRoom) return false;
	      recentRoomSwapKey = swapKey;
	      recentRoomSwapAt = now;
	      holdRemoteUpdates(Math.max(1200, CHANGE_INTERACTION_HOLD_MS || 0));
	      swapRoomContents(fromRoom, toRoom);
	      requestBoardRoomRefresh([fromId, toId], { includeIntake: false });
	      commitBoardInBackground({ immediate: !!options.immediate });
	      return true;
	    }
	function swapRoomContents(a,b){
	      // Swap room state while keeping the physical room ids/names in place.
	      // This keeps flags, notes, timers, and cleaning/session state attached to the moved patient.
	      var fields = [
		        "patientName","reason","colorLabelId","colorHex","doctor","tech","notes","quickNote","quickNotes",
        "roomReady","doctorReady","needsCleaning","timer","cleaningTimer",
        "activeRoomSessionId","activeCleaningSessionId","lastDischargeSnapshot"
      ];
      for(var i=0;i<fields.length;i++){
        var f = fields[i];
        var tmp = a[f];
        a[f] = b[f];
        b[f] = tmp;
      }
      swapPendingSessionTokens(pendingRoomSessionInsertByRoomId, a.id, b.id);
      swapPendingSessionTokens(pendingCleaningSessionInsertByRoomId, a.id, b.id);
    }

    
    function applyBackground(){
      // Preserve whichever theme background is currently active instead of forcing a reset.
      try{
        var currentBg = getComputedStyle(document.documentElement).getPropertyValue("--bg");
        currentBg = String(currentBg || "").trim();
        if(currentBg) state.settings.bgColor = currentBg;
      }catch(e){}
    }
function applyFonts(){
	      document.documentElement.style.setProperty("--fontBase", String(state.settings.fontBase || 14) + "px");
	      document.documentElement.style.setProperty("--fontCard", String(state.settings.fontCard || 14) + "px");
	      document.documentElement.style.setProperty("--fontTimer", String(state.settings.fontTimer || 18) + "px");
	      document.documentElement.style.setProperty("--fontInput", String(state.settings.fontInput || 14) + "px");
	      document.documentElement.style.setProperty("--fontDisplay", String(state.settings.fontDisplay || 14) + "px");
	    }

    function rgbaFromHex(hex, alpha){
      var rgb = hexToRgb(hex);
      if(!rgb) return "";
      return "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + "," + String(alpha) + ")";
    }

    function applyPracticeNameBadgeColors(){
      var root = document.documentElement;
      var fallback = "#fecdd3";
      var color = String(state && state.settings ? (state.settings.practiceNameColor || fallback) : fallback).trim();
      if(!hexToRgb(color)) color = fallback;
      root.style.setProperty("--practiceBadgeText", color);
      root.style.setProperty("--practiceBadgeBorder", rgbaFromHex(color, 0.42) || "rgba(251,113,133,.42)");
      root.style.setProperty("--practiceBadgeBg", rgbaFromHex(color, 0.16) || "rgba(127,29,29,.34)");
    }

    function applyPracticeNameBadgeVisibility(){
      var authBanner = $("authBanner");
      if(!authBanner) return;
      var badgeEnabled = !(state && state.settings && state.settings.showPracticeNameBadge === false);
      var loggedIn = !!currentUserId;
      authBanner.hidden = loggedIn ? (!currentPracticeName || !badgeEnabled) : false;
    }

    function buildPracticeLogoSrc(rawUrl, updatedAt){
      var url = String(rawUrl || "").trim();
      var stamp = String(updatedAt || "").trim();
      if(!url) return "";
      if(!stamp) return url;
      try{
        var parsed = new URL(url, window.location.href);
        parsed.searchParams.set("v", stamp);
        return parsed.toString();
      }catch(e){
        return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(stamp);
      }
    }

    function applyPracticeLogo(){
      var wordmark = $("brandWordmark");
      var logo = $("brandLogoImage");
      if(!wordmark || !logo) return;
      var logoUrl = String(state && state.settings ? (state.settings.practiceLogoUrl || "") : "").trim();
      var updatedAt = String(state && state.settings ? (state.settings.practiceLogoUpdatedAt || "") : "").trim();
      if(!logoUrl){
        wordmark.hidden = false;
        logo.hidden = true;
        logo.removeAttribute("src");
        delete logo.dataset.currentSrc;
        return;
      }
      var nextSrc = buildPracticeLogoSrc(logoUrl, updatedAt);
      if(logo.dataset.currentSrc !== nextSrc){
        logo.dataset.currentSrc = nextSrc;
        logo.src = nextSrc;
      }
      logo.alt = (currentPracticeName ? currentPracticeName + " logo" : "Clinic logo");
      logo.onerror = function(){
        this.hidden = true;
        wordmark.hidden = false;
      };
      logo.hidden = false;
      wordmark.hidden = true;
    }

	    function applyPracticeBranding(){
	      document.documentElement.style.setProperty("--practiceLogoScale", String(Math.max(0.6, Math.min(5, Number(state && state.settings ? (state.settings.practiceLogoScale || 1) : 1)))));
	      document.documentElement.style.setProperty("--practiceLogoColorFilter", state && state.settings && state.settings.practiceLogoInvert === true ? "invert(1)" : "invert(0)");
	      applyPracticeNameBadgeColors();
	      applyPracticeNameBadgeVisibility();
	      applyPracticeLogo();
	    }

	    function applyDoctorInitialBadgeStyle(){
	      var root = document.documentElement;
	      var scale = Math.max(0.7, Math.min(2, Number(state && state.settings ? (state.settings.doctorInitialBadgeScale || 1) : 1)));
	      var fontSize = Math.max(10, Math.min(28, Number(state && state.settings ? (state.settings.doctorInitialBadgeFontSize || 16) : 16)));
	      var bgFallback = "#0b1220";
	      var textFallback = String(state && state.settings ? (state.settings.displayFontColor || "#e8eefc") : "#e8eefc");
	      var bgColor = String(state && state.settings ? (state.settings.doctorInitialBadgeColor || bgFallback) : bgFallback).trim();
	      var textColor = String(state && state.settings ? (state.settings.doctorInitialBadgeTextColor || textFallback) : textFallback).trim();
	      if(!hexToRgb(bgColor)) bgColor = bgFallback;
	      if(!hexToRgb(textColor)) textColor = textFallback;
	      root.style.setProperty("--doctorInitBadgeScale", String(scale));
	      root.style.setProperty("--doctorInitBadgeFontSize", String(fontSize) + "px");
	      root.style.setProperty("--doctorInitBadgeBg", rgbaFromHex(bgColor, 0.82) || "rgba(11,18,32,.82)");
	      root.style.setProperty("--doctorInitBadgeText", textColor);
	      root.style.setProperty("--doctorInitBadgeBorder", rgbaFromHex(bgColor, 0.94) || "rgba(11,18,32,.94)");
	    }

	    function applyStopwatchStyle(){
	      var style = String(state && state.settings && state.settings.stopwatchStyle || "classic").trim();
	      if(!style) style = "classic";
	      document.documentElement.setAttribute("data-stopwatch-style", style);
	    }


    
    function hexToRgb(hex){
      if(!hex) return null;
      hex = (""+hex).trim();
      if(hex[0] === "#") hex = hex.slice(1);
      if(hex.length === 3) hex = hex.split("").map(function(c){ return c+c; }).join("");
      if(hex.length !== 6) return null;
      var r = parseInt(hex.slice(0,2), 16);
      var g = parseInt(hex.slice(2,4), 16);
      var b = parseInt(hex.slice(4,6), 16);
      if(isNaN(r)||isNaN(g)||isNaN(b)) return null;
      return {r:r,g:g,b:b};
    }
    function srgbToLinear(c){
      c = c/255;
      return (c <= 0.04045) ? (c/12.92) : Math.pow((c+0.055)/1.055, 2.4);
    }
    function relativeLuminance(rgb){
      if(!rgb) return 0;
      var R = srgbToLinear(rgb.r);
      var G = srgbToLinear(rgb.g);
      var B = srgbToLinear(rgb.b);
      return 0.2126*R + 0.7152*G + 0.0722*B;
    }
    function pickReadableTextColor(bgHex){
      // Returns a high-contrast text color for the given background color.
      // Threshold tuned for TV readability.
      var rgb = hexToRgb(bgHex);
      if(!rgb) return (state.settings.displayFontColor || "#e8eefc");
      var L = relativeLuminance(rgb);
      // L close to 1 = bright background -> use dark text
      return (L > 0.55) ? "#0b1220" : "#ffffff";
    }
    function contrastRatio(hexA, hexB){
      var rgbA = hexToRgb(hexA);
      var rgbB = hexToRgb(hexB);
      if(!rgbA || !rgbB) return 0;
      var lumA = relativeLuminance(rgbA);
      var lumB = relativeLuminance(rgbB);
      var lighter = Math.max(lumA, lumB);
      var darker = Math.min(lumA, lumB);
      return (lighter + 0.05) / (darker + 0.05);
    }
    function resolveAccessibleThemeColor(preferredHex, backgroundHex, fallbackHex, minRatio){
      var preferred = hexToRgb(preferredHex) ? preferredHex : fallbackHex;
      var fallback = hexToRgb(fallbackHex) ? fallbackHex : pickReadableTextColor(backgroundHex);
      if(preferred && contrastRatio(preferred, backgroundHex) >= minRatio) return preferred;
      if(fallback && contrastRatio(fallback, backgroundHex) >= minRatio) return fallback;
      return pickReadableTextColor(backgroundHex);
    }

	    function applyRoomCardContrastVars(el, textColor){
	      var useDarkText = (textColor === "#0b1220");
	      el.style.color = textColor;
	      el.style.setProperty("--cardText", textColor);
	      el.style.setProperty("--cardMuted", useDarkText ? "rgba(11,18,32,.72)" : "rgba(255,255,255,.78)");
      el.style.setProperty("--timerBoxBg", useDarkText ? "rgba(255,255,255,.78)" : "rgba(8,16,32,.40)");
      el.style.setProperty("--timerBoxBorder", useDarkText ? "rgba(11,18,32,.16)" : "rgba(255,255,255,.22)");
      el.style.setProperty("--roomInputBg", useDarkText ? "rgba(255,255,255,.92)" : "rgba(8,16,32,.42)");
      el.style.setProperty("--roomInputText", useDarkText ? "#0b1220" : "#ffffff");
      el.style.setProperty("--roomInputPlaceholder", useDarkText ? "rgba(11,18,32,.46)" : "rgba(255,255,255,.62)");
      el.style.setProperty("--roomInputBorder", useDarkText ? "rgba(11,18,32,.18)" : "rgba(255,255,255,.24)");
      el.style.setProperty("--roomControlBg", useDarkText ? "rgba(255,255,255,.66)" : "rgba(8,16,32,.34)");
	      el.style.setProperty("--roomControlBorder", useDarkText ? "rgba(11,18,32,.16)" : "rgba(255,255,255,.20)");
	      el.style.setProperty("--roomSwitchBg", useDarkText ? "rgba(11,18,32,.16)" : "rgba(255,255,255,.10)");
	      el.style.setProperty("--roomKnobBg", useDarkText ? "#ffffff" : "rgba(255,255,255,.96)");
	      el.style.setProperty("--roomViewBg", useDarkText ? "rgba(255,255,255,.82)" : "rgba(8,16,32,.32)");
	      el.style.setProperty("--roomOptionText", useDarkText ? "#0b1220" : "#ffffff");
	      el.style.setProperty("--roomOptionBg", useDarkText ? "#ffffff" : "#0f172a");
	    }

function applyDisplayColors(){
      // Only affects Display tab text colors (not type/appointment colors)
      var root = document.documentElement;
      var styles = getComputedStyle(root);
      var bgColor = String(styles.getPropertyValue("--bg") || "").trim() || "#0b1220";
      var themeText = String(styles.getPropertyValue("--text") || "").trim() || "#e8eefc";
      var themeMuted = String(styles.getPropertyValue("--muted") || "").trim() || "#a9b6d3";
      var resolvedText = resolveAccessibleThemeColor(state.settings.displayFontColor || themeText, bgColor, themeText, 4.5);
      var resolvedMuted = resolveAccessibleThemeColor(state.settings.displayMutedColor || themeMuted, bgColor, themeMuted, 3.5);
      var isDarkThemeSurface = pickReadableTextColor(bgColor) === "#ffffff";

      root.style.setProperty("--displayText", resolvedText);
      root.style.setProperty("--displayMuted", resolvedMuted);
      root.style.setProperty("--displayFontColor", resolvedText);
      root.style.setProperty("--displayMutedColor", resolvedMuted);
      root.style.setProperty("--listChromeBorder", isDarkThemeSurface ? "rgba(255,255,255,.18)" : "rgba(15,23,42,.18)");
      root.style.setProperty("--listChromeBg", isDarkThemeSurface ? "rgba(255,255,255,.08)" : "rgba(15,23,42,.06)");
      root.style.setProperty("--listChromeBgHover", isDarkThemeSurface ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.10)");
      root.style.setProperty("--listBadgeBg", isDarkThemeSurface ? "rgba(8,16,32,.42)" : "rgba(255,255,255,.88)");
      root.style.setProperty("--listBadgeBorder", isDarkThemeSurface ? "rgba(255,255,255,.24)" : "rgba(15,23,42,.14)");
      root.style.setProperty("--listBadgeText", resolvedText);
      root.style.setProperty("--listRowFade", isDarkThemeSurface ? "rgba(255,255,255,.03)" : "rgba(15,23,42,.02)");
    }
    window.reapplyDisplayColorsFromState = function(){
      if(!state || !state.settings) return;
      applyDisplayColors();
    };

    function maybeAutoStartTimer(room, startedAtIso){
      if(room.timer.running) return;
      if(computeElapsed(room.timer) > 0) return;
      applyTimerStartAt(room.timer, startedAtIso || isoNow());
    }

    function getDischargeButtonIcon(isCleaning){
      if(isCleaning) return "🧹";
      var style = String(state && state.settings ? (state.settings.dischargeIconStyle || "paw") : "paw").trim();
      if(style === "tooth") return "🦷 ➡️ 🚪";
      if(style === "door") return "🚪";
      return "🐾 ➡️ 🚪";
    }

    function roomHasAssignedPatient(room){
      return !!(room && String(room.patientName || "").replace(/\s/g, "").length > 0);
    }

    function stopRoomTimer(room, resetElapsed, stoppedAtIso){
      if(!room) return;
      room.timer = room.timer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };
      applyTimerStopAt(room.timer, stoppedAtIso || isoNow(), resetElapsed);
    }

    function getRoomIdForSessionTracking(room){
      return String(room && room.id || "");
    }

    function createPendingSessionToken(prefix){
      pendingSessionTokenCounter += 1;
      return String(prefix || "session") + ":" + Date.now() + ":" + pendingSessionTokenCounter;
    }

    function findRoomIdByPendingSessionToken(tokenMap, token){
      if(!token) return "";
      for(var key in tokenMap){
        if(!Object.prototype.hasOwnProperty.call(tokenMap, key)) continue;
        if(tokenMap[key] === token) return String(key);
      }
      return "";
    }

    function clearPendingSessionToken(tokenMap, token, fallbackRoomId){
      var cleared = false;
      if(token){
        for(var key in tokenMap){
          if(!Object.prototype.hasOwnProperty.call(tokenMap, key)) continue;
          if(tokenMap[key] !== token) continue;
          delete tokenMap[key];
          cleared = true;
        }
      }
      if(!cleared && fallbackRoomId && Object.prototype.hasOwnProperty.call(tokenMap, fallbackRoomId)){
        delete tokenMap[fallbackRoomId];
      }
    }

    function swapPendingSessionTokens(tokenMap, firstRoomId, secondRoomId){
      firstRoomId = String(firstRoomId || "");
      secondRoomId = String(secondRoomId || "");
      if(!firstRoomId || !secondRoomId || firstRoomId === secondRoomId) return;
      var firstHasValue = Object.prototype.hasOwnProperty.call(tokenMap, firstRoomId);
      var secondHasValue = Object.prototype.hasOwnProperty.call(tokenMap, secondRoomId);
      var firstValue = firstHasValue ? tokenMap[firstRoomId] : null;
      var secondValue = secondHasValue ? tokenMap[secondRoomId] : null;
      if(secondHasValue) tokenMap[firstRoomId] = secondValue;
      else delete tokenMap[firstRoomId];
      if(firstHasValue) tokenMap[secondRoomId] = firstValue;
      else delete tokenMap[secondRoomId];
    }

    function getLiveRoomForSessionTracking(room){
      var roomId = getRoomIdForSessionTracking(room);
      if(roomId){
        var liveRoom = findRoomById(roomId);
        if(liveRoom) return liveRoom;
      }
      return room || null;
    }

    function captureRoomSessionEndSnapshot(room, options){
      options = options || {};
      if(!room) return null;
      return {
        sessionId: room.activeRoomSessionId || null,
        endedAtIso: normalizeServerNowIso(options.endedAtIso) || getEstimatedServerNowIso(),
        durationMs: Math.max(0, Number(options.durationMs != null ? options.durationMs : computeElapsed(room.timer))),
        doctorName: options.doctorName != null ? options.doctorName : (room.doctor || null)
      };
    }

    function captureCleaningSessionEndSnapshot(room, options){
      options = options || {};
      if(!room) return null;
      return {
        sessionId: room.activeCleaningSessionId || null,
        endedAtIso: normalizeServerNowIso(options.endedAtIso) || getEstimatedServerNowIso(),
        durationMs: Math.max(0, Number(options.durationMs != null ? options.durationMs : computeElapsed(room.cleaningTimer)))
      };
    }

	    async function syncRoomSessionAfterOccupancyChange(room, hadPatientBefore, options){
	      if(!room) return;
	      options = options || {};
	      var hasPatientNow = roomHasAssignedPatient(room);

	      if(hasPatientNow){
	        var startIso = options.serverNowIso || await getServerNowIso();
	        if(room.needsCleaning || room.activeCleaningSessionId || timerHasProgress(room.cleaningTimer)){
	          clearRoomCleaning(room, false, startIso);
	        }
	        if(options.autoStartTimer){
	          maybeAutoStartTimer(room, startIso);
	        }
	        logRoomSessionStart(room);
	        return;
	      }

      if(hadPatientBefore || room.activeRoomSessionId){
        logRoomSessionEnd(room, captureRoomSessionEndSnapshot(room, { endedAtIso: options.serverNowIso }));
      }
      if(options.stopTimerWhenEmpty){
        var stopIso = options.serverNowIso || await getServerNowIso();
        stopRoomTimer(room, !!options.resetTimerWhenEmpty, stopIso);
      }
      if(options.clearReadyWhenEmpty){
        room.roomReady = false;
        room.doctorReady = false;
      }
    }

    function restartRoomSessionForCurrentOccupant(room, options){
      if(!room || !roomHasAssignedPatient(room)) return;
      options = options || {};
      (async function(){
        await logRoomSessionEnd(room, options.endSnapshot || captureRoomSessionEndSnapshot(room, { endedAtIso: options.endedAtIso }));
        await logRoomSessionStart(room);
      })();
    }

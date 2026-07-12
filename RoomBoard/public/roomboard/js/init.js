(function(){
  function reportStartupError(err){
    var message = (typeof getErrorMessage === "function") ? getErrorMessage(err) : String(err && err.message || err || "Unknown startup error");
    try{ console.error("RoomBoard startup failed:", err); }catch(_){}
    try{ setStatus("Startup failed: " + message); }catch(_){}
    try{ setSyncUI("err", "Startup failed"); }catch(_){}
  }

  function buildStartupRecoveryState(){
    var recovered = ensureStateShape(null);
    normalizeSettingsForSave(recovered);
    applyAccountSettingsToState(recovered);
    applySessionUiPrefs(recovered);
    return recovered;
  }

  function boot(recoveryAttempted){
    var bootScope = "guest";
    try{
      var isInteractiveDemo = !!window.__roomboardInteractiveDemo;
      bootScope = isInteractiveDemo
        ? "demo"
        : ((typeof getBootPersistenceScope === "function") ? getBootPersistenceScope() : "guest");
      var restoringClinicSnapshot = !isInteractiveDemo && !!(bootScope && bootScope !== "guest");
      var initialState = isInteractiveDemo && typeof window.createRoomBoardDemoState === "function"
        ? window.createRoomBoardDemoState()
        : loadLocal(bootScope);
      state = ensureStateShape(initialState || null);
      normalizeSettingsForSave(state);
      applyAccountSettingsToState(state);
      applySessionUiPrefs(state);
      if(typeof getPracticeConfigSignature === "function") lastPracticeConfigSignature = getPracticeConfigSignature();
      if(typeof getAppointmentTypesConfigSignature === "function") lastAppointmentTypesSignature = getAppointmentTypesConfigSignature();
      if(typeof getRoomBoardSignature === "function") lastRoomBoardSignature = getRoomBoardSignature();
      initSettingsTabs();
      refreshUiFromState({ applyTheme: true, renderSettingsLists: true });
      refreshKnownRoomIds(state.rooms);
      setStatus(isInteractiveDemo
        ? "Explore the sample board — nothing is saved."
        : (restoringClinicSnapshot ? "Restoring clinic snapshot..." : "Ready"));
      setSyncUI(isInteractiveDemo ? "idle" : (restoringClinicSnapshot ? "syncing" : "idle"), isInteractiveDemo ? "Demo" : (restoringClinicSnapshot ? "Restoring clinic" : "Guest"));
      startAutoPull();
      if(isInteractiveDemo) return;
      initSupabase();
    }catch(err){
      if(!recoveryAttempted){
        try{
          var recoveryBootScope = bootScope || ((typeof getBootPersistenceScope === "function") ? getBootPersistenceScope() : "guest");
          var recoveringClinicSnapshot = !!(recoveryBootScope && recoveryBootScope !== "guest");
          state = buildStartupRecoveryState();
          if(typeof getPracticeConfigSignature === "function") lastPracticeConfigSignature = getPracticeConfigSignature();
          if(typeof getAppointmentTypesConfigSignature === "function") lastAppointmentTypesSignature = getAppointmentTypesConfigSignature();
          if(typeof getRoomBoardSignature === "function") lastRoomBoardSignature = getRoomBoardSignature();
          initSettingsTabs();
          refreshUiFromState({ applyTheme: true, renderSettingsLists: true });
          refreshKnownRoomIds(state.rooms);
          setStatus(recoveringClinicSnapshot ? "Recovering clinic view..." : "Ready");
          setSyncUI(recoveringClinicSnapshot ? "syncing" : "idle", recoveringClinicSnapshot ? "Recovering clinic" : "Guest");
          startAutoPull();
          initSupabase();
          return;
        }catch(recoveryErr){
          reportStartupError(recoveryErr);
          return;
        }
      }
      reportStartupError(err);
    }
  }

  window.addEventListener("error", function(event){
    if(event && event.error) reportStartupError(event.error);
  });
  window.addEventListener("unhandledrejection", function(event){
    if(event && event.reason) reportStartupError(event.reason);
  });

  boot(false);
})();

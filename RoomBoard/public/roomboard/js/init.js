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
      bootScope = (typeof getBootPersistenceScope === "function") ? getBootPersistenceScope() : "guest";
      var restoringClinicSnapshot = !!(bootScope && bootScope !== "guest");
      state = ensureStateShape(loadLocal(bootScope) || null);
      normalizeSettingsForSave(state);
      applyAccountSettingsToState(state);
      applySessionUiPrefs(state);
      if(typeof getPracticeConfigSignature === "function") lastPracticeConfigSignature = getPracticeConfigSignature();
      if(typeof getAppointmentTypesConfigSignature === "function") lastAppointmentTypesSignature = getAppointmentTypesConfigSignature();
      if(typeof getRoomBoardSignature === "function") lastRoomBoardSignature = getRoomBoardSignature();
      initSettingsTabs();
      refreshUiFromState({ applyTheme: true, renderSettingsLists: true });
      refreshKnownRoomIds(state.rooms);
      setStatus(restoringClinicSnapshot ? "Restoring clinic snapshot..." : "Ready");
      setSyncUI(restoringClinicSnapshot ? "syncing" : "idle", restoringClinicSnapshot ? "Restoring clinic" : "Guest");
      startAutoPull();
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

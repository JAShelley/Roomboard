(function(){
  function reportStartupError(err){
    var message = (typeof getErrorMessage === "function") ? getErrorMessage(err) : String(err && err.message || err || "Unknown startup error");
    try{ console.error("RoomBoard startup failed:", err); }catch(_){}
    try{ setStatus("Startup failed: " + message); }catch(_){}
    try{ setSyncUI("err", "Startup failed"); }catch(_){}
  }

  function clearStartupStateCaches(){
    var keys = [
      "roomboard.website.state.v1.guest",
      "roomboard.website.accountSettings.v1.guest",
      "roomboard.website.windowSettings.v1.guest",
      "roomboard.website.themePrefs.v1.guest"
    ];
    for(var i=0;i<keys.length;i++){
      try{ localStorage.removeItem(keys[i]); }catch(_){}
      try{ sessionStorage.removeItem(keys[i]); }catch(_){}
    }
  }

  function boot(recoveryAttempted){
    try{
      state = ensureStateShape(loadLocal() || null);
      normalizeSettingsForSave(state);
      applyAccountSettingsToState(state);
      applySessionUiPrefs(state);
      initSettingsTabs();
      refreshUiFromState({ applyTheme: true, renderSettingsLists: true });
      refreshKnownRoomIds(state.rooms);
      setStatus("Ready");
      setSyncUI("idle", "Guest");
      startAutoPull();
      initSupabase();
    }catch(err){
      if(!recoveryAttempted){
        clearStartupStateCaches();
        try{
          state = ensureStateShape(null);
          normalizeSettingsForSave(state);
          applyAccountSettingsToState(state);
          applySessionUiPrefs(state);
          initSettingsTabs();
          refreshUiFromState({ applyTheme: true, renderSettingsLists: true });
          refreshKnownRoomIds(state.rooms);
          setStatus("Ready");
          setSyncUI("idle", "Guest");
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

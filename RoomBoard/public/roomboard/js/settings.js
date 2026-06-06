    // ===== Drawer controls =====
	    function openDrawer(){
	      closeQuickAdd();
	      document.body.className = (document.body.className + " drawerOpen").replace(/\s+/g," ").trim();
      if(saving || pendingConfigSave || pendingAppointmentTypesSave || pendingBoardSave || pendingUserSettingsSave || Object.keys(settingsAutosaveJobs).length){
        setSettingsSaveState("saving", "Saving changes…");
      } else {
        setSettingsSaveState("idle", "Autosave on");
      }
	      holdRemoteUpdates(SHORT_INTERACTION_HOLD_MS);
	      renderSettingsLists();
	      loadFeedbackChecklist(true);
	      if(typeof window.syncStopwatchDiagnosticsUi === "function") window.syncStopwatchDiagnosticsUi();
	      if($("stopwatchDiagnosticsPanel") && $("stopwatchDiagnosticsPanel").open && typeof window.runStopwatchDiagnostics === "function"){
	        window.runStopwatchDiagnostics();
	      }
	    }
    function closeDrawer(){
      document.body.className = document.body.className.replace(/\bdrawerOpen\b/g,"").replace(/\s+/g," ").trim();
      flushPendingSettingsSaves();
      flushPendingRemoteRefresh();
    }
    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState === "hidden") flushPendingSettingsSaves();
    });
    window.addEventListener("pagehide", flushPendingSettingsSaves);

    var FEEDBACK_NOTES_STORAGE_KEY = "roomboard.feedbackChecklist";
    var feedbackItemsCache = [];
    var feedbackLoadedScope = "";
    var feedbackLoadInFlight = null;
    var feedbackRemoteAvailable = false;

    function getFeedbackNotesStorageKey(){
      var scope = "guest";
      try{
        scope = currentPracticeId || currentPracticeName || "guest";
      }catch(e){}
      return FEEDBACK_NOTES_STORAGE_KEY + "." + String(scope || "guest");
    }

    function updateFeedbackStatus(text){
      var line = $("feedbackStatusLine");
      if(line) line.textContent = text;
    }

    function loadFeedbackItems(){
      try{
        var raw = localStorage.getItem(getFeedbackNotesStorageKey());
        var parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      }catch(e){
        return [];
      }
    }

    function saveFeedbackItems(items){
      try{
        localStorage.setItem(getFeedbackNotesStorageKey(), JSON.stringify(Array.isArray(items) ? items : []));
      }catch(e){}
      return true;
    }

    function feedbackCanUseRemote(){
      return !!(supabase && currentPracticeId);
    }

    function isMissingFeedbackTableError(err){
      if(!err) return false;
      return String(err.code || "") === "42P01"
        || String(err.message || "").toLowerCase().indexOf("practice_feedback_items") >= 0 && String(err.message || "").toLowerCase().indexOf("does not exist") >= 0;
    }

    function normalizeFeedbackItem(item){
      return {
        id: item && item.id ? String(item.id) : uuid(),
        text: String(item && item.text || "").trim(),
        done: !!(item && item.done),
        createdAt: String(item && item.createdAt || item && item.created_at || ""),
        createdAtLabel: String(item && item.createdAtLabel || item && item.created_at_label || "")
      };
    }

    function setFeedbackItemsCache(items){
      feedbackItemsCache = (Array.isArray(items) ? items : []).map(normalizeFeedbackItem).filter(function(item){
        return !!item.text;
      });
      saveFeedbackItems(feedbackItemsCache);
      feedbackLoadedScope = String(currentPracticeId || currentPracticeName || "guest");
    }

    function mapFeedbackRow(row){
      return normalizeFeedbackItem({
        id: row && row.id,
        text: row && row.text,
        done: !!(row && row.is_done),
        createdAt: row && row.created_at,
        createdAtLabel: row && row.created_at ? new Date(row.created_at).toLocaleString() : ""
      });
    }

    async function loadFeedbackChecklist(force){
      var scope = String(currentPracticeId || currentPracticeName || "guest");
      if(!force && feedbackLoadedScope === scope && feedbackItemsCache.length){
        renderFeedbackChecklist();
        return feedbackItemsCache;
      }
      if(feedbackLoadInFlight) return await feedbackLoadInFlight;

      feedbackLoadInFlight = (async function(){
        if(!feedbackCanUseRemote()){
          feedbackRemoteAvailable = false;
          setFeedbackItemsCache(loadFeedbackItems());
          renderFeedbackChecklist();
          updateFeedbackStatus(feedbackItemsCache.length ? "Checklist loaded from this computer." : "Checklist items are saved on this computer so the team can check them off and remove them later.");
          return feedbackItemsCache;
        }
        try{
          var res = await supabase
            .from("practice_feedback_items")
            .select("id, text, is_done, created_at")
            .eq("practice_id", currentPracticeId)
            .order("created_at", { ascending: false });
          if(res.error) throw res.error;
          feedbackRemoteAvailable = true;
          setFeedbackItemsCache((res.data || []).map(mapFeedbackRow));
          renderFeedbackChecklist();
          updateFeedbackStatus("Checklist loaded for " + (currentPracticeName || "this clinic") + ".");
          return feedbackItemsCache;
        }catch(err){
          feedbackRemoteAvailable = false;
          setFeedbackItemsCache(loadFeedbackItems());
          renderFeedbackChecklist();
          updateFeedbackStatus(isMissingFeedbackTableError(err)
            ? "Run the Supabase checklist SQL to sync these items across devices. Using local checklist for now."
            : "Could not load the shared checklist. Using local checklist for now.");
          return feedbackItemsCache;
        } finally {
          feedbackLoadInFlight = null;
        }
      })();

      return await feedbackLoadInFlight;
    }

    function renderFeedbackChecklist(){
      var wrap = $("feedbackChecklist");
      if(!wrap) return;
      var items = feedbackItemsCache.length ? feedbackItemsCache : loadFeedbackItems();
      if(!items.length){
        wrap.innerHTML = '<div class="feedbackChecklistEmpty">No checklist items yet. Add requests, pain points, bugs, or things people appreciate and want more of.</div>';
        return;
      }
      wrap.innerHTML = items.map(function(item, idx){
        var done = !!item.done;
        var text = escapeHtml(String(item.text || ""));
        var stamp = escapeHtml(String(item.createdAtLabel || ""));
        return ''
          + '<div class="feedbackItem' + (done ? ' isDone' : '') + '" data-feedback-index="' + idx + '">'
          +   '<input class="feedbackCheck" data-feedback-action="toggle" data-feedback-index="' + idx + '" type="checkbox" ' + (done ? 'checked' : '') + ' aria-label="Mark feedback item done" />'
          +   '<div class="feedbackBody">'
          +     '<div class="feedbackText">' + text + '</div>'
          +     '<div class="feedbackMeta">' + (done ? 'Checked off' : 'Open item') + (stamp ? ' • Added ' + stamp : '') + '</div>'
          +   '</div>'
          +   '<button class="trash" data-feedback-action="remove" data-feedback-index="' + idx + '" title="Remove" type="button">✕</button>'
          + '</div>';
      }).join("");
    }

    async function addFeedbackItem(){
      var field = $("feedbackInput");
      if(!field) return false;
      var value = String(field.value || "").trim();
      if(!value){
        updateFeedbackStatus("Write one checklist item first.");
        return false;
      }
      if(feedbackLoadInFlight) await feedbackLoadInFlight;
      var newItem = {
        id: uuid(),
        text: value,
        done: false,
        createdAt: new Date().toISOString(),
        createdAtLabel: new Date().toLocaleString()
      };
      if(feedbackCanUseRemote()){
        try{
          var insertRes = await supabase
            .from("practice_feedback_items")
            .insert({
              id: newItem.id,
              practice_id: currentPracticeId,
              text: newItem.text,
              is_done: false,
              created_by_user_id: currentUserId || null,
              created_by_name: String($("fullName") && $("fullName").value || "").trim() || null
            })
            .select("id, text, is_done, created_at")
            .single();
          if(insertRes.error) throw insertRes.error;
          feedbackRemoteAvailable = true;
          feedbackItemsCache.unshift(mapFeedbackRow(insertRes.data));
          saveFeedbackItems(feedbackItemsCache);
        }catch(err){
          if(isMissingFeedbackTableError(err)){
            feedbackRemoteAvailable = false;
            updateFeedbackStatus("Run the Supabase checklist SQL to sync these items across devices. Saved locally for now.");
          } else {
            updateFeedbackStatus("Could not save the shared checklist item. Saved locally instead.");
          }
          var fallbackItems = loadFeedbackItems();
          fallbackItems.unshift(newItem);
          setFeedbackItemsCache(fallbackItems);
        }
      } else {
        var items = loadFeedbackItems();
        items.unshift(newItem);
        setFeedbackItemsCache(items);
      }
      field.value = "";
      renderFeedbackChecklist();
      updateFeedbackStatus(feedbackCanUseRemote() && feedbackRemoteAvailable ? "Checklist item saved for the clinic." : "Checklist item saved on this computer.");
      return true;
    }

    async function toggleFeedbackItem(index){
      var items = feedbackItemsCache.length ? feedbackItemsCache.slice() : loadFeedbackItems();
      if(index < 0 || index >= items.length) return false;
      var nextDone = !items[index].done;
      if(feedbackCanUseRemote()){
        try{
          var updateRes = await supabase
            .from("practice_feedback_items")
            .update({ is_done: nextDone, updated_at: isoNow() })
            .eq("id", items[index].id)
            .eq("practice_id", currentPracticeId)
            .select("id, text, is_done, created_at")
            .single();
          if(updateRes.error) throw updateRes.error;
          feedbackRemoteAvailable = true;
          items[index] = mapFeedbackRow(updateRes.data);
        }catch(err){
          if(isMissingFeedbackTableError(err)){
            feedbackRemoteAvailable = false;
          }
          items[index].done = nextDone;
        }
      } else {
        items[index].done = nextDone;
      }
      setFeedbackItemsCache(items);
      renderFeedbackChecklist();
      updateFeedbackStatus(items[index].done ? "Item checked off." : "Item marked open again.");
      return true;
    }

    async function removeFeedbackItem(index){
      var items = feedbackItemsCache.length ? feedbackItemsCache.slice() : loadFeedbackItems();
      if(index < 0 || index >= items.length) return false;
      var target = items[index];
      if(feedbackCanUseRemote()){
        try{
          var deleteRes = await supabase
            .from("practice_feedback_items")
            .delete()
            .eq("id", target.id)
            .eq("practice_id", currentPracticeId);
          if(deleteRes.error) throw deleteRes.error;
          feedbackRemoteAvailable = true;
        }catch(err){
          if(isMissingFeedbackTableError(err)){
            feedbackRemoteAvailable = false;
          }
        }
      }
      items.splice(index, 1);
      setFeedbackItemsCache(items);
      renderFeedbackChecklist();
      updateFeedbackStatus("Checklist item removed.");
      return true;
    }

    window.refreshFeedbackChecklistForSession = function(){
      feedbackLoadedScope = "";
      if($("feedbackInput")) loadFeedbackChecklist(true);
    };

  // Settings tabs
  function initSettingsTabs(){
    var tabs = document.getElementById("settingsTabs");
    var select = document.getElementById("settingsTabSelect");
    if(!tabs) return;
    function activateSettingsTab(tabId){
      if(!tabId) return;
      Array.prototype.forEach.call(tabs.querySelectorAll(".tabBtn"), function(b){
        b.classList.toggle("active", b.getAttribute("data-tab") === tabId);
      });
      Array.prototype.forEach.call(document.querySelectorAll(".tabPanel"), function(p){
        p.classList.toggle("active", p.id === tabId);
      });
      if(select) select.value = tabId;
    }
    tabs.addEventListener("click", function(e){
      var btn = e.target && e.target.closest ? e.target.closest(".tabBtn") : null;
      if(!btn) return;
      var tabId = btn.getAttribute("data-tab");
      if(!tabId) return;
      activateSettingsTab(tabId);
    });
    if(select){
      select.addEventListener("change", function(){
        activateSettingsTab(this.value);
      });
    }
    var activeBtn = tabs.querySelector(".tabBtn.active");
    activateSettingsTab(activeBtn ? activeBtn.getAttribute("data-tab") : "tabAccount");
  }



    $("openSettingsBtn").addEventListener("click", openDrawer);
    $("closeSettingsBtn").addEventListener("click", closeDrawer);
    $("drawerBackdrop").addEventListener("click", closeDrawer);
    if($("addFeedbackBtn")){
      $("addFeedbackBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("feedback.add", function(){
          return addFeedbackItem();
        }, { el: btn, busyLabel: "Saving…", cooldownMs: 200 });
      });
    }
    if($("feedbackInput")){
      renderFeedbackChecklist();
      loadFeedbackChecklist(false);
      $("feedbackInput").addEventListener("input", function(){
        updateFeedbackStatus(String(this.value || "").trim() ? "Ready to add this checklist item." : (feedbackCanUseRemote() && feedbackRemoteAvailable ? "Checklist items are shared with this clinic." : "Checklist items are saved on this computer so the team can check them off and remove them later."));
      });
      $("feedbackInput").addEventListener("keydown", function(e){
        if((e.metaKey || e.ctrlKey) && e.key === "Enter"){
          e.preventDefault();
          addFeedbackItem();
        }
      });
    }
	    if($("feedbackChecklist")){
      $("feedbackChecklist").addEventListener("click", function(e){
        var node = e.target;
        if(!node || !node.getAttribute) return;
        var action = node.getAttribute("data-feedback-action");
        var index = Number(node.getAttribute("data-feedback-index"));
        if(!isFinite(index)) return;
        if(action === "remove"){
          removeFeedbackItem(index);
        }
      });
      $("feedbackChecklist").addEventListener("change", function(e){
        var node = e.target;
        if(!node || !node.getAttribute) return;
        if(node.getAttribute("data-feedback-action") !== "toggle") return;
        var index = Number(node.getAttribute("data-feedback-index"));
        if(!isFinite(index)) return;
        toggleFeedbackItem(index);
	      });
	    }
	    if($("stopwatchDiagnosticsPanel")){
	      $("stopwatchDiagnosticsPanel").addEventListener("toggle", function(){
	        if(this.open && typeof window.runStopwatchDiagnostics === "function") window.runStopwatchDiagnostics();
	      });
	    }
	    if($("runStopwatchDiagnosticsBtn")){
	      $("runStopwatchDiagnosticsBtn").addEventListener("click", function(){
	        if(typeof window.runStopwatchDiagnostics === "function") window.runStopwatchDiagnostics();
	      });
	    }
	    if($("repairStopwatchCoverageBtn")){
	      $("repairStopwatchCoverageBtn").addEventListener("click", function(){
	        if(typeof window.repairStopwatchCoverageDiagnostics === "function") window.repairStopwatchCoverageDiagnostics();
	      });
	    }
	    function toggleDisplayOnlyActive(){
      if(typeof isMobileQuickViewEnabled === "function" && isMobileQuickViewEnabled()) return;
      state.settings.displayOnlyActive = !state.settings.displayOnlyActive;
      persistWindowUiSettings();
      scheduleUiRefresh({
        displayChrome: true,
        display: true,
        displayFull: true,
        timerBindings: true
      });
      setStatus(state.settings.displayOnlyActive ? "Showing only active rooms" : "Showing all rooms");
    }
    $("openQuickAddBtn").addEventListener("click", function(){ openQuickAdd(); });
    $("displayOnlyActiveSwitch").addEventListener("click", function(e){
      if(e) e.stopPropagation();
      toggleDisplayOnlyActive();
    });
    $("displayOnlyActiveWrap").addEventListener("click", function(e){
      if(!window.matchMedia || !window.matchMedia("(max-width: 820px)").matches) return;
      var target = e && e.target;
      if(target && target.closest && target.closest("select")) return;
      toggleDisplayOnlyActive();
    });
	    $("displaySortSelect").addEventListener("change", function(){
	      state.settings.displaySortMode = (this.value === "time") ? "time" : "room";
	      persistWindowUiSettings();
	      scheduleUiRefresh({
	        displayChrome: true,
	        display: true,
	        displayFull: true,
	        timerBindings: true
	      });
	      setStatus(state.settings.displaySortMode === "time" ? "Sorting by time" : "Sorting by room");
	    });
	    $("doctorHighlightSelect").addEventListener("change", function(){
	      state.settings.highlightDoctor = String(this.value || "").trim();
	      persistWindowUiSettings();
	      scheduleUiRefresh({
	        displayChrome: true,
	        display: true,
	        displayFull: true,
	        intake: isIntakeVisible(),
	        intakeFull: true
	      });
	      setStatus(state.settings.highlightDoctor ? ("Highlighting " + state.settings.highlightDoctor) : "Doctor highlight cleared");
	    });
	    // Cross-tab localStorage sync is intentionally disabled here.
	    // This board should update from Supabase only, not from another tab's local writes.
	    $("closeQuickAddBtn").addEventListener("click", closeQuickAdd);
    $("quickAddBackdrop").addEventListener("click", closeQuickAdd);
	    $("quickAddBody").addEventListener("change", function(e){
	      var t = e.target;
	      if(t && t.getAttribute && t.getAttribute("data-quick-note-choice") === "1"){
	        var dropdown = t.closest ? t.closest("#quickAddQuickNotes") : $("quickAddQuickNotes");
	        if(typeof refreshQuickNoteDropdownSummary === "function") refreshQuickNoteDropdownSummary(dropdown);
	        return;
	      }
	      if(!t || !t.id) return;
	      if(t.id === "quickAddRoomSelect"){
	        captureQuickAddDraft();
        renderQuickAddForm(t.value, false);
      }
    });
    $("quickAddBody").addEventListener("click", function(e){
      var node = e.target;
      while(node && node !== this && !(node.getAttribute && node.getAttribute("data-action"))) node = node.parentNode;
      if(!node || node === this) return;
      var action = node.getAttribute("data-action");
      if(action === "toggleQuickAddRoomReady" || action === "toggleQuickAddDoctorReady"){
        node.classList.toggle("on");
      } else if(action === "toggleQuickAddTimerAdjust"){
        var roomSelect = $("quickAddRoomSelect");
        var roomId = roomSelect ? roomSelect.value : "";
        captureQuickAddDraft();
        quickAddTimerAdjustOpen = !quickAddTimerAdjustOpen;
        renderQuickAddForm(roomId, false);
      } else if(action === "quickAddTimerDelta"){
        var selectedRoom = $("quickAddRoomSelect");
        var selectedRoomId = selectedRoom ? selectedRoom.value : "";
        var currentRoom = findRoomById(selectedRoomId);
        if(!currentRoom) return;
        var currentDraft = readQuickAddFormDraft() || quickAddDraftState || getQuickAddDraftFromRoom(currentRoom);
        var deltaMinutes = Number(node.getAttribute("data-delta-minutes") || 0);
        setQuickAddTimerDraft(selectedRoomId, getQuickAddTimerDisplayMs(currentRoom, currentDraft) + (deltaMinutes * 60 * 1000), {
          timerDirty: true,
          timerInputValue: ""
        });
        quickAddTimerAdjustOpen = true;
        renderQuickAddForm(selectedRoomId, false);
      } else if(action === "applyQuickAddTimer"){
        var activeRoomSelect = $("quickAddRoomSelect");
        var activeRoomId = activeRoomSelect ? activeRoomSelect.value : "";
        var activeRoom = findRoomById(activeRoomId);
        if(!activeRoom) return;
        var input = $("quickAddTimerInput");
        var rawValue = String(input && input.value || "").trim();
        var parsedMs = parseQuickAddTimerInputToMs(rawValue);
        if(parsedMs == null){
          setStatus("Use minutes like 12 or mm:ss like 12:30");
          if(input){
            input.focus();
            input.select();
          }
          return;
        }
        setQuickAddTimerDraft(activeRoomId, parsedMs, {
          timerDirty: true,
          timerInputValue: rawValue
        });
        quickAddTimerAdjustOpen = true;
        renderQuickAddForm(activeRoomId, false);
      } else if(action === "resetQuickAddTimer"){
        var resetRoomSelect = $("quickAddRoomSelect");
        var resetRoomId = resetRoomSelect ? resetRoomSelect.value : "";
        if(!findRoomById(resetRoomId)) return;
        setQuickAddTimerDraft(resetRoomId, 0, {
          timerDirty: true,
          timerInputValue: ""
        });
        quickAddTimerAdjustOpen = true;
        renderQuickAddForm(resetRoomId, false);
      } else if(action === "cancelQuickAdd"){
        closeQuickAdd();
      } else if(action === "saveQuickAdd"){
        runLockedAction("quick-add.save", function(){
          return saveQuickAdd();
        }, { el: node, busyLabel: "Saving…", cooldownMs: 300 });
      }
    });
    $("quickAddBody").addEventListener("keydown", function(e){
      var target = e.target;
      if(!target || target.id !== "quickAddTimerInput") return;
      if(e.key !== "Enter") return;
      e.preventDefault();
      var applyBtn = this.querySelector('[data-action="applyQuickAddTimer"]');
      if(applyBtn) applyBtn.click();
    });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && /\bquickAddOpen\b/.test(document.body.className)){
        closeQuickAdd();
      }
    });

    // ===== Tabs =====
    function setTab(which){
      var d = $("displayView");
      var quickAddBtn = $("openQuickAddBtn");
      var onlyActiveWrap = $("displayOnlyActiveWrap");
      var sortWrap = $("displaySortWrap");
      document.body.classList.add("displayTabActive");
      if(d) d.style.display = "";
      if(quickAddBtn) quickAddBtn.style.display = "inline-flex";
      if(onlyActiveWrap) onlyActiveWrap.style.display = "flex";
      if(sortWrap) sortWrap.style.display = (state && state.settings && state.settings.displayOnlyActive) ? "flex" : "none";
      updateViewportFit();
    }

    // ===== Fullscreen =====
    function updateViewportFit(){
      var root = document.documentElement;
      var doc = document;
      var isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      root.classList.toggle("boardFullscreen", isFs);

      var displayScale = Number(state && state.settings ? (state.settings.displayCardScale || 1) : 1);
      var intakeScale = Number(state && state.settings ? (state.settings.intakeCardScale || 1) : 1);
	      if(isFs){
	        displayScale = Math.min(displayScale, 1);
	        intakeScale = Math.min(intakeScale, 1);
	      }
	      root.style.setProperty("--displayCardScaleApplied", String(displayScale));
	      root.style.setProperty("--intakeCardScaleApplied", String(intakeScale));
	      applyMobileQuickViewPreviewSettings(false);

	      var header = document.querySelector("header");
      var main = document.querySelector("main");
      var headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      var mainStyles = main ? window.getComputedStyle(main) : null;
      var padTop = mainStyles ? (parseFloat(mainStyles.paddingTop) || 0) : 0;
      var padBottom = mainStyles ? (parseFloat(mainStyles.paddingBottom) || 0) : 0;
      var viewportHeight = (window.visualViewport && window.visualViewport.height)
        ? window.visualViewport.height
        : (window.innerHeight || root.clientHeight || 0);
      var availableHeight = Math.max(240, viewportHeight - headerHeight - padTop - padBottom - 8);
	      root.style.setProperty("--appHeaderHeight", headerHeight + "px");
	      root.style.setProperty("--fullscreenDisplayHeight", availableHeight + "px");
	    }

	    function applyMobileQuickViewPreviewSettings(preferInputs){
	      var root = document.documentElement;
	      var settingsState = state && state.settings ? state.settings : {};
	      var fontSize = preferInputs && $("mobileQuickViewFontSize") && isFinite(Number($("mobileQuickViewFontSize").value))
	        ? Number($("mobileQuickViewFontSize").value)
	        : Number(settingsState.mobileQuickViewFontSize || 22);
	      var timerSize = preferInputs && $("mobileQuickViewTimerSize") && isFinite(Number($("mobileQuickViewTimerSize").value))
	        ? Number($("mobileQuickViewTimerSize").value)
	        : Number(settingsState.mobileQuickViewTimerSize || 13);
	      var gapSize = preferInputs && $("mobileQuickViewGap") && isFinite(Number($("mobileQuickViewGap").value))
	        ? Number($("mobileQuickViewGap").value)
	        : Number(settingsState.mobileQuickViewGap || 8);
	      root.style.setProperty("--mobileQuickViewFontSize", String(Math.max(12, Math.min(32, fontSize))) + "px");
	      root.style.setProperty("--mobileQuickViewTimerSize", String(Math.max(10, Math.min(20, timerSize))) + "px");
	      root.style.setProperty("--mobileQuickViewGap", String(Math.max(4, Math.min(16, gapSize))) + "px");
	    }

    function toggleFullscreen(){
      var doc = document;
      var el = document.documentElement;
      var isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
      if(!isFs){
        var req = el.requestFullscreen || el.webkitRequestFullscreen;
        if(req) req.call(el);
      } else {
        var ex = doc.exitFullscreen || doc.webkitExitFullscreen;
        if(ex) ex.call(doc);
      }
      setTimeout(function(){ updateFullscreenBtn(); updateViewportFit(); }, 250);
    }
    function updateFullscreenBtn(){
      var doc = document;
      var isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
      var btn = $("fullscreenBtn");
      if(!btn) return;
      btn.textContent = isFs ? "⤡" : "⤢";
      btn.title = isFs ? "Exit full screen" : "Enter full screen";
      btn.setAttribute("aria-label", btn.title);
    }
    $("fullscreenBtn").addEventListener("click", toggleFullscreen);

    $("viewToggleBtn").addEventListener("click", function(){
      if(state.settings.mobileQuickView && window.matchMedia && window.matchMedia("(max-width: 820px)").matches){
        state.settings.mobileQuickView = false;
        persistWindowUiSettings();
        scheduleUiRefresh({
          globalChrome: true,
          displayChrome: true,
          display: true,
          displayFull: true,
          settingsLists: true,
          timerBindings: true
        });
        setStatus("Mobile quick view disabled");
        return;
      }
      state.settings.displayLayout = (state.settings.displayLayout === "list") ? "grid" : "list";
      persistWindowUiSettings();
      scheduleUiRefresh({
        globalChrome: true,
        displayChrome: true,
        display: true,
        displayFull: true,
        timerBindings: true
      });
      setStatus("Display view updated");
    });
    if($("toggleMobileQuickViewBtn")){
      $("toggleMobileQuickViewBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.toggle-mobile-quick-view", function(){
          if(!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches)){
            setStatus("Quick view only changes the mobile display.");
            return false;
          }
          state.settings.mobileQuickView = !state.settings.mobileQuickView;
          persistWindowUiSettings();
          scheduleUiRefresh({
            globalChrome: true,
            displayChrome: true,
            display: true,
            displayFull: true,
            settingsLists: true,
            timerBindings: true
          });
          setStatus(state.settings.mobileQuickView ? "Mobile quick view enabled" : "Mobile quick view disabled");
          return true;
        }, { el: btn, cooldownMs: 180 });
      });
    }
    document.addEventListener("fullscreenchange", function(){ updateFullscreenBtn(); updateViewportFit(); });
    document.addEventListener("webkitfullscreenchange", function(){ updateFullscreenBtn(); updateViewportFit(); });
    window.addEventListener("resize", updateViewportFit);
    if(window.visualViewport && window.visualViewport.addEventListener){
      window.visualViewport.addEventListener("resize", updateViewportFit);
    }
    var lastMobileQuickViewViewport = !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
    window.addEventListener("resize", function(){
      var nextMobileQuickViewViewport = !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
      if(nextMobileQuickViewViewport === lastMobileQuickViewViewport) return;
      lastMobileQuickViewViewport = nextMobileQuickViewViewport;
      scheduleUiRefresh({
        globalChrome: true,
        displayChrome: true,
        display: true,
        displayFull: true,
        settingsLists: true,
        timerBindings: true
      });
    });

    // ===== Settings actions =====
    function queueSettingsConfigSave(options){
      options = options || {};
      normalizeSettingsForSave(state);
      saveLocal();
      if(options.renderSettingsLists !== false) scheduleUiRefresh({ settingsLists: true });
      var shouldValidateClinicConfig = true;
      if(typeof getPracticeConfigSignature === "function" && lastPracticeConfigSignature){
        shouldValidateClinicConfig = getPracticeConfigSignature() !== lastPracticeConfigSignature;
      }
      var blockingIssues = shouldValidateClinicConfig ? getBlockingSettingsIssues(state) : [];
      if(blockingIssues.length){
        noteSettingsRemoteFinished(false, describeSettingsIssuesForSaveState(blockingIssues, "Fix settings first"));
        setStatus(describeSettingsIssuesForStatus(blockingIssues));
        return;
      }
      if(!supabase || !currentPracticeId){
        noteSettingsLocalSaved("Saved locally");
        return;
      }
      noteSettingsRemoteQueued("Saving changes…");
      scheduleRemoteSave(shouldValidateClinicConfig ? "config" : "userSettings", { immediate: !!options.immediate });
    }

    function queueAppointmentTypesSave(options){
      options = options || {};
      normalizeSettingsForSave(state);
      saveLocal();
      scheduleUiRefresh({ settingsLists: true });
      var blockingIssues = getBlockingAppointmentTypeSettingsIssues(state);
      if(blockingIssues.length){
        noteSettingsRemoteFinished(false, describeSettingsIssuesForSaveState(blockingIssues, "Fix label settings first"));
        setStatus(describeSettingsIssuesForStatus(blockingIssues));
        return;
      }
      if(!supabase || !currentPracticeId){
        noteSettingsLocalSaved("Saved locally");
        return;
      }
      noteSettingsRemoteQueued("Saving changes…");
      scheduleRemoteSave("appointmentTypes", { immediate: !!options.immediate });
    }

    function getManagedQuickNotes(){
      var notes = [];
      var seen = Object.create(null);
      var source = Array.isArray(state.quickNotes) ? state.quickNotes : [];
      for(var i=0;i<source.length;i++){
        var label = String(source[i] == null ? "" : source[i]).trim();
        if(!label) continue;
        var key = label.toLowerCase();
        if(seen[key]) continue;
        seen[key] = true;
        notes.push(label);
      }
      return notes;
    }

    function setManagedQuickNotes(notes){
      var next = [""];
      var seen = Object.create(null);
      var source = Array.isArray(notes) ? notes : [];
      for(var i=0;i<source.length;i++){
        var label = String(source[i] == null ? "" : source[i]).trim();
        if(!label) continue;
        var key = label.toLowerCase();
        if(seen[key]) continue;
        seen[key] = true;
        next.push(label);
      }
      state.quickNotes = next;
      saveLocal();
      return next;
    }

	    function getRoomIdsUsingQuickNote(label){
	      var target = String(label == null ? "" : label).trim().toLowerCase();
	      if(!target) return [];
	      return getRoomIdsMatching(function(room){
	        var notes = getRoomQuickNotes(room);
	        for(var i=0;i<notes.length;i++){
	          if(String(notes[i] || "").trim().toLowerCase() === target) return true;
	        }
	        return false;
	      });
	    }

    function renameQuickNoteAcrossRooms(previousLabel, nextLabel){
      var target = String(previousLabel == null ? "" : previousLabel).trim().toLowerCase();
      var replacement = String(nextLabel == null ? "" : nextLabel).trim();
	      var affected = [];
	      if(!target) return affected;
	      for(var i=0;i<state.rooms.length;i++){
	        var notes = getRoomQuickNotes(state.rooms[i]);
	        var nextNotes = [];
	        var changed = false;
	        for(var n=0;n<notes.length;n++){
	          if(String(notes[n] || "").trim().toLowerCase() === target){
	            changed = true;
	            if(replacement) nextNotes.push(replacement);
	          } else {
	            nextNotes.push(notes[n]);
	          }
	        }
	        if(!changed) continue;
	        setRoomQuickNotes(state.rooms[i], nextNotes);
	        affected.push(state.rooms[i].id);
	      }
	      return affected;
	    }

	    $("addRoomBtn").addEventListener("click", function(){
	      var btn = this;
        runLockedAction("settings.add-room", function(){
	      var name = $("newRoomName").value;
	      name = (name || "").trim();
	      if(!name) return false;
	      var defaultColorId = getDefaultColorLabelIdFromList(state.colorLabels);
	      state.rooms.push(createRoomRecord(name, defaultColorId));
	      refreshKnownRoomIds(state.rooms);
	      $("newRoomName").value = "";
	      queueSettingsConfigSave({ immediate: true });
	      scheduleUiRefresh({
	        display: true,
	        displayFull: true,
	        intake: true,
	        intakeFull: true,
	        settingsLists: true,
	        timerBindings: true
	      });
          return true;
        }, { el: btn, busyLabel: "Adding…", cooldownMs: 250 });
	    });

    $("addDoctorBtn").addEventListener("click", function(){
      var btn = this;
      runLockedAction("settings.add-doctor", function(){
        var name = $("newDoctorName").value;
        name = (name || "").trim();
        if(!name) return false;
        state.doctors.push(name);
        $("newDoctorName").value = "";
        queueSettingsConfigSave({ immediate: true });
        scheduleUiRefresh({
          settingsLists: true,
          displayChrome: true,
          display: true,
          displayFull: true,
          intake: true,
          intakeFull: true,
          timerBindings: true
        });
        return true;
      }, { el: btn, busyLabel: "Adding…", cooldownMs: 250 });
    });

    $("addColorBtn").addEventListener("click", function(){
      var btn = this;
      runLockedAction("settings.add-label", function(){
        var title = normalizeColorLabelTitle($("newColorTitle").value || "", "Untitled label");
        var color = $("newColorValue").value || "#6ea8fe";
        state.colorLabels.push({ id: uuid(), title: title, color: color });
        if(!state.settings.defaultColorLabelId) state.settings.defaultColorLabelId = getDefaultColorLabelIdFromList(state.colorLabels);
        $("newColorTitle").value = "";
        queueAppointmentTypesSave({ immediate: true });
        scheduleUiRefresh({
          settingsLists: true,
          display: true,
          displayFull: true,
          intake: true,
          intakeFull: true,
          timerBindings: true
        });
        return true;
      }, { el: btn, busyLabel: "Adding…", cooldownMs: 250 });
    });

    function addQuickNoteFromSettings(){
      var field = $("newQuickNoteLabel");
      var nextLabel = String(field && field.value || "").trim();
      if(!nextLabel){
        setStatus("Enter a quick note first.");
        return false;
      }
      var existing = getManagedQuickNotes();
      for(var i=0;i<existing.length;i++){
        if(existing[i].toLowerCase() === nextLabel.toLowerCase()){
          setStatus("That quick note already exists.");
          return false;
        }
      }
      existing.push(nextLabel);
      setManagedQuickNotes(existing);
      if(field) field.value = "";
      queueSettingsConfigSave({ immediate: true });
      scheduleUiRefresh({ settingsLists: true });
      setStatus("Quick note saved.");
      return true;
    }

    if($("addQuickNoteBtn")){
      $("addQuickNoteBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.add-quick-note", function(){
          return addQuickNoteFromSettings();
        }, { el: btn, busyLabel: "Adding…", cooldownMs: 250 });
      });
    }
    if($("newQuickNoteLabel")){
      $("newQuickNoteLabel").addEventListener("keydown", function(e){
        if(e.key !== "Enter") return;
        e.preventDefault();
        addQuickNoteFromSettings();
      });
    }

    if($("defaultColorLabelSelect")){
      $("defaultColorLabelSelect").addEventListener("change", function(){
        state.settings.defaultColorLabelId = getConfiguredDefaultColorLabelId(state.colorLabels, this.value);
        queueAppointmentTypesSave({ immediate: true });
      });
    }

    function bindScaleInputs(rangeId, valueId, minValue, maxValue){
      var range = $(rangeId);
      var value = $(valueId);
      if(!range || !value) return;
      var min = isFinite(Number(minValue)) ? Number(minValue) : Number(range.min || 0);
      var max = isFinite(Number(maxValue)) ? Number(maxValue) : Number(range.max || 100);
      range.addEventListener("input", function(){
        value.value = String(range.value);
      });
      value.addEventListener("input", function(){
        var v = Number(value.value);
        if(!isFinite(v)) return;
        v = Math.max(min, Math.min(max, v));
        range.value = String(v);
      });
    }
	    bindScaleInputs("displayCardScale", "displayCardScaleValue", 0.8, 1.6);
	    bindScaleInputs("roomCardLineHeight", "roomCardLineHeightValue", 1, 1.8);
	    bindScaleInputs("practiceLogoScale", "practiceLogoScaleValue", 0.6, 5);
	    bindScaleInputs("doctorInitialBadgeScale", "doctorInitialBadgeScaleValue", 0.7, 2);
	    bindScaleInputs("doctorInitialBadgeFontSize", "doctorInitialBadgeFontSizeValue", 10, 28);
	    bindScaleInputs("mobileQuickViewFontSize", "mobileQuickViewFontSizeValue", 12, 32);
	    bindScaleInputs("mobileQuickViewTimerSize", "mobileQuickViewTimerSizeValue", 10, 20);

	    function layoutInputsReady(){
	      return String(($("displayCols") && $("displayCols").value) || "").trim() !== ""
	        && String(($("displayRows") && $("displayRows").value) || "").trim() !== ""
	        && isFinite(Number(($("displayCardScale") && $("displayCardScale").value) || 1));
	    }

	    function mobileQuickViewInputsReady(){
	      return String(($("mobileQuickViewColumns") && $("mobileQuickViewColumns").value) || "").trim() !== ""
	        && String(($("mobileQuickViewGap") && $("mobileQuickViewGap").value) || "").trim() !== ""
	        && isFinite(Number(($("mobileQuickViewFontSize") && $("mobileQuickViewFontSize").value) || 22))
	        && isFinite(Number(($("mobileQuickViewTimerSize") && $("mobileQuickViewTimerSize").value) || 13));
	    }

    function timerAlertInputsReady(){
      return String(($("timerAlert1AtSec") && $("timerAlert1AtSec").value) || "").trim() !== ""
        && String(($("timerAlert2AtSec") && $("timerAlert2AtSec").value) || "").trim() !== "";
    }

    function fontInputsReady(){
      return String(($("fontBase") && $("fontBase").value) || "").trim() !== ""
        && String(($("fontCard") && $("fontCard").value) || "").trim() !== ""
        && String(($("fontTimer") && $("fontTimer").value) || "").trim() !== ""
        && String(($("fontInput") && $("fontInput").value) || "").trim() !== ""
        && String(($("fontDisplay") && $("fontDisplay").value) || "").trim() !== "";
    }

    var ROOM_CARD_FIELD_SETTING_IDS = [
      "showRoomCardPatient",
      "showRoomCardType",
      "showRoomCardDoctorName",
      "showRoomCardDoctorBadge",
      "showRoomCardTech",
      "showRoomCardReady",
      "showRoomCardQuickNote",
      "showRoomCardStatusNotes"
    ];

	    function commitLayoutSettings(options){
	      options = options || {};
	      if(!options.force && !layoutInputsReady()) return false;
      state.settings.displayCols = Math.max(1, Number($("displayCols").value || 4));
      state.settings.displayRows = Math.max(0, Number($("displayRows").value || 0));
      state.settings.displayCardScale = Math.max(0.8, Math.min(1.6, Number($("displayCardScale").value || 1)));
      persistWindowUiSettings();
      scheduleUiRefresh({
        globalChrome: true,
        displayChrome: true,
        display: true,
        displayFull: true,
        timerBindings: true
      });
      if(options.flush) flushPendingSettingsSaves();
	      if(options.announce) setStatus("Layout saved");
	      return true;
	    }

	    function commitMobileQuickViewSettings(options){
	      options = options || {};
	      if(!options.force && !mobileQuickViewInputsReady()) return false;
	      state.settings.mobileQuickViewColumns = Math.max(2, Math.min(5, Number($("mobileQuickViewColumns").value || 4)));
	      state.settings.mobileQuickViewGap = Math.max(4, Math.min(16, Number($("mobileQuickViewGap").value || 8)));
	      state.settings.mobileQuickViewFontSize = Math.max(12, Math.min(32, Number($("mobileQuickViewFontSize").value || 22)));
	      state.settings.mobileQuickViewTimerSize = Math.max(10, Math.min(20, Number($("mobileQuickViewTimerSize").value || 13)));
	      persistWindowUiSettings();
	      applyMobileQuickViewPreviewSettings(false);
	      updateViewportFit();
	      scheduleUiRefresh({
	        globalChrome: true,
	        displayChrome: true,
	        display: true,
	        displayFull: true,
	        settingsLists: true,
	        timerBindings: true
	      });
	      if(options.flush) flushPendingSettingsSaves();
	      if(options.announce) setStatus("Mobile quick view saved");
	      return true;
	    }

    function commitTimerAlertSettings(options){
      options = options || {};
      if(!options.force && !timerAlertInputsReady()) return false;
	      state.settings.timerAlert1AtSec = Math.max(0, Number($("timerAlert1AtSec").value || 0));
	      state.settings.timerAlert2AtSec = Math.max(0, Number($("timerAlert2AtSec").value || 0));
	      state.settings.timerAlert1Color = String($("timerAlert1Color").value || "#fbbf24");
	      state.settings.timerAlert2Color = String($("timerAlert2Color").value || "#fb7185");
	      normalizeSettingsForSave(state);
	      queueSettingsConfigSave({ immediate: !!options.flush });
	      scheduleUiRefresh({
	        globalChrome: true,
	        timerBindings: true
	      });
	      if(options.flush) flushPendingSettingsSaves();
	      if(options.announce) setStatus("Timer alerts saved");
	      return true;
	    }


	    function commitFontSettings(options){
	      options = options || {};
	      if(!options.force && !fontInputsReady()) return false;
	      state.settings.fontBase = Math.max(10, Number($("fontBase").value || 14));
	      state.settings.fontCard = Math.max(10, Number($("fontCard").value || 14));
	      state.settings.fontTimer = Math.max(12, Number($("fontTimer").value || 18));
	      state.settings.fontInput = Math.max(10, Number($("fontInput").value || 14));
	      state.settings.fontDisplay = Math.max(10, Number($("fontDisplay").value || 14));
	      if($("stopwatchStyle")) state.settings.stopwatchStyle = $("stopwatchStyle").value || "classic";
      if($("dischargeIconStyle")) state.settings.dischargeIconStyle = $("dischargeIconStyle").value || "paw";
	      persistWindowUiSettings();
      persistAccountUiSettings();
      scheduleUiRefresh({
        globalChrome: true,
        display: true,
        displayFull: true,
        intake: isIntakeVisible(),
        intakeFull: true,
        timerBindings: true
      });
	      if(options.flush) flushPendingSettingsSaves();
	      if(options.announce) setStatus("Fonts saved");
	      return true;
	    }


    function commitDisplayColorSettings(options){
      options = options || {};
      state.settings.displayFontColor = $("displayFontColor").value || "#e8eefc";
      state.settings.displayMutedColor = $("displayMutedColor").value || "#a9b6d3";
      if($("cardTextMode")) state.settings.cardTextMode = $("cardTextMode").value || "auto";
      persistWindowUiSettings();
      scheduleUiRefresh({
        globalChrome: true,
        display: true,
        displayFull: true,
        intake: isIntakeVisible(),
        intakeFull: true,
        timerBindings: true
      });
      if(options.flush) flushPendingSettingsSaves();
      if(options.announce) setStatus("Display colors saved");
      return true;
    }

    function commitRoomCardFieldSettings(options){
      options = options || {};
	      for(var i=0;i<ROOM_CARD_FIELD_SETTING_IDS.length;i++){
	        var id = ROOM_CARD_FIELD_SETTING_IDS[i];
	        var input = $(id);
	        if(input) state.settings[id] = !!input.checked;
	      }
	      if($("roomCardLineHeight")) state.settings.roomCardLineHeight = Math.max(1, Math.min(1.8, Number($("roomCardLineHeight").value || 1.35)));
	      normalizeSettingsForSave(state);
	      saveLocal();
	      if(!supabase || !currentPracticeId){
	        noteSettingsLocalSaved("Saved locally");
	      } else {
	        noteSettingsRemoteQueued("Saving room card fields…");
	        scheduleRemoteSave("board", { immediate: !!options.flush });
	      }
	      scheduleUiRefresh({
	        globalChrome: true,
	        display: true,
	        displayFull: true,
        timerBindings: true
      });
      if(options.flush) flushPendingSettingsSaves();
      if(options.announce) setStatus("Room card fields saved");
      return true;
    }

	    function commitPracticeBrandingSettings(options){
	      options = options || {};
      if($("practiceNameColor")) state.settings.practiceNameColor = $("practiceNameColor").value || "#fecdd3";
      if($("showPracticeNameBadge")) state.settings.showPracticeNameBadge = !!$("showPracticeNameBadge").checked;
      if($("practiceLogoInvert")) state.settings.practiceLogoInvert = !!$("practiceLogoInvert").checked;
      if($("practiceLogoScale")) state.settings.practiceLogoScale = Math.max(0.6, Math.min(5, Number($("practiceLogoScale").value || 1)));
      normalizeSettingsForSave(state);
      queueSettingsConfigSave({ immediate: !!options.flush });
      scheduleUiRefresh({
        globalChrome: true
      });
      if(options.flush) flushPendingSettingsSaves();
	      if(options.announce) setStatus("Header branding saved");
	      return true;
	    }

	    function commitDoctorInitialBadgeSettings(options){
	      options = options || {};
	      if($("doctorInitialBadgeScale")) state.settings.doctorInitialBadgeScale = Math.max(0.7, Math.min(2, Number($("doctorInitialBadgeScale").value || 1)));
	      if($("doctorInitialBadgeFontSize")) state.settings.doctorInitialBadgeFontSize = Math.max(10, Math.min(28, Number($("doctorInitialBadgeFontSize").value || 16)));
	      normalizeSettingsForSave(state);
	      saveLocal();
	      if(!supabase || !currentPracticeId){
	        noteSettingsLocalSaved("Saved locally");
	      } else {
	        doctorBadgeSettingsDirty = true;
	        noteSettingsRemoteQueued("Saving doctor badges…");
	        scheduleRemoteSave("board", { immediate: !!options.flush });
	      }
	      scheduleUiRefresh({
	        globalChrome: true,
	        display: true,
	        displayFull: true,
	        settingsLists: true
	      });
	      if(options.flush) flushPendingSettingsSaves();
	      if(options.announce) setStatus("Doctor badge style saved");
	      return true;
	    }

    var PRACTICE_LOGO_BUCKET = "practice-logos";

    function inferPracticeLogoExtension(file){
      var type = String(file && file.type || "").toLowerCase();
      if(type === "image/svg+xml") return "svg";
      if(type === "image/png") return "png";
      if(type === "image/webp") return "webp";
      if(type === "image/jpeg") return "jpg";
      var name = String(file && file.name || "").toLowerCase();
      if(/\.svg$/i.test(name)) return "svg";
      if(/\.webp$/i.test(name)) return "webp";
      if(/\.jpe?g$/i.test(name)) return "jpg";
      return "png";
    }

    async function uploadPracticeLogoSelection(){
      var input = $("practiceLogoFile");
      var file = input && input.files ? input.files[0] : null;
      if(!supabase || !currentPracticeId) throw new Error("Log into a clinic before uploading a logo.");
      if(!file) throw new Error("Choose a logo image first.");
      if(String(file.type || "").toLowerCase().indexOf("image/") !== 0) throw new Error("Choose an image file for the clinic logo.");
      if(Number(file.size || 0) > 2 * 1024 * 1024) throw new Error("Clinic logo must be 2 MB or smaller.");
      var ext = inferPracticeLogoExtension(file);
      var previousPath = String(state && state.settings ? (state.settings.practiceLogoPath || "") : "").trim();
      var objectPath = String(currentPracticeId) + "/logo-" + Date.now() + "." + ext;
      var uploadRes = await supabase.storage.from(PRACTICE_LOGO_BUCKET).upload(objectPath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined
      });
      if(uploadRes.error) throw uploadRes.error;
      var publicUrlData = supabase.storage.from(PRACTICE_LOGO_BUCKET).getPublicUrl(objectPath);
      var publicUrl = publicUrlData && publicUrlData.data ? String(publicUrlData.data.publicUrl || "").trim() : "";
      if(!publicUrl) throw new Error("Logo uploaded, but no public URL was returned.");

      state.settings.practiceLogoPath = objectPath;
      state.settings.practiceLogoUrl = publicUrl;
      state.settings.practiceLogoUpdatedAt = new Date().toISOString();
      normalizeSettingsForSave(state);
      queueSettingsConfigSave({ immediate: true });
      scheduleUiRefresh({
        globalChrome: true,
        settingsLists: true
      });
      flushPendingSettingsSaves();
      if(input) input.value = "";

      if(previousPath && previousPath !== objectPath){
        try{
          await supabase.storage.from(PRACTICE_LOGO_BUCKET).remove([previousPath]);
        }catch(e){}
      }
      return true;
    }

    async function removePracticeLogoSelection(){
      var input = $("practiceLogoFile");
      var previousPath = String(state && state.settings ? (state.settings.practiceLogoPath || "") : "").trim();
      state.settings.practiceLogoPath = "";
      state.settings.practiceLogoUrl = "";
      state.settings.practiceLogoUpdatedAt = "";
      normalizeSettingsForSave(state);
      queueSettingsConfigSave({ immediate: true });
      scheduleUiRefresh({
        globalChrome: true,
        settingsLists: true
      });
      flushPendingSettingsSaves();
      if(input) input.value = "";
      if(supabase && previousPath){
        try{
          await supabase.storage.from(PRACTICE_LOGO_BUCKET).remove([previousPath]);
        }catch(e){}
      }
      return true;
    }

    function scheduleLayoutAutosave(force, delayMs){
      scheduleSettingsAutosave("layout", function(){
        return commitLayoutSettings({ force: force });
      }, delayMs);
    }

    function scheduleTimerAlertAutosave(force, delayMs){
      scheduleSettingsAutosave("alerts", function(){
        return commitTimerAlertSettings({ force: force });
      }, delayMs);
    }

    function scheduleFontAutosave(force, delayMs){
      scheduleSettingsAutosave("fonts", function(){
        return commitFontSettings({ force: force });
      }, delayMs);
    }

	    function scheduleDisplayColorAutosave(delayMs){
	      scheduleSettingsAutosave("display-colors", function(){
	        return commitDisplayColorSettings();
	      }, delayMs);
	    }

	    function scheduleRoomCardFieldAutosave(delayMs){
	      scheduleSettingsAutosave("room-card-fields", function(){
	        return commitRoomCardFieldSettings();
	      }, delayMs);
	    }

	    function scheduleMobileQuickViewAutosave(force, delayMs){
	      scheduleSettingsAutosave("mobile-quick-view", function(){
	        return commitMobileQuickViewSettings({ force: force });
	      }, delayMs);
	    }

	    function schedulePracticeBrandingAutosave(delayMs){
	      scheduleSettingsAutosave("practice-branding", function(){
	        return commitPracticeBrandingSettings();
	      }, delayMs);
	    }

	    function scheduleDoctorInitialBadgeAutosave(delayMs){
	      scheduleSettingsAutosave("doctor-initial-badge", function(){
	        return commitDoctorInitialBadgeSettings();
	      }, delayMs);
	    }

	    ["displayCols", "displayRows", "displayCardScale"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("input", function(){
        if(String(this.value || "").trim() === "") return;
        scheduleLayoutAutosave(false, 260);
      });
      el.addEventListener("change", function(){
        scheduleLayoutAutosave(true, 0);
      });
    });
	    if($("displayCardScaleValue")){
      $("displayCardScaleValue").addEventListener("input", function(){
        if(!isFinite(Number(this.value))) return;
        scheduleLayoutAutosave(false, 260);
      });
      $("displayCardScaleValue").addEventListener("change", function(){
        scheduleLayoutAutosave(true, 0);
      });
    }

    ["timerAlert1AtSec", "timerAlert2AtSec"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("input", function(){
        if(String(this.value || "").trim() === "") return;
        scheduleTimerAlertAutosave(false, 280);
      });
      el.addEventListener("change", function(){
        scheduleTimerAlertAutosave(true, 0);
      });
    });
    ["timerAlert1Color", "timerAlert2Color"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("input", function(){
        scheduleTimerAlertAutosave(false, 160);
      });
      el.addEventListener("change", function(){
        scheduleTimerAlertAutosave(true, 0);
      });
    });

    ["fontBase", "fontCard", "fontTimer", "fontInput", "fontDisplay"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("input", function(){
        if(String(this.value || "").trim() === "") return;
        scheduleFontAutosave(false, 280);
      });
      el.addEventListener("change", function(){
        scheduleFontAutosave(true, 0);
      });
    });
    ["stopwatchStyle", "dischargeIconStyle"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("change", function(){
        scheduleFontAutosave(true, 0);
      });
    });

    ["displayFontColor", "displayMutedColor"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("input", function(){
        scheduleDisplayColorAutosave(160);
      });
      el.addEventListener("change", function(){
        scheduleDisplayColorAutosave(0);
      });
    });
    if($("cardTextMode")){
      $("cardTextMode").addEventListener("change", function(){
        scheduleDisplayColorAutosave(0);
      });
    }
    ROOM_CARD_FIELD_SETTING_IDS.forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("change", function(){
        scheduleRoomCardFieldAutosave(0);
      });
    });
    ["roomCardLineHeight", "roomCardLineHeightValue"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("input", function(){
        if(String(this.value || "").trim() === "") return;
        scheduleRoomCardFieldAutosave(160);
      });
      el.addEventListener("change", function(){
        scheduleRoomCardFieldAutosave(0);
      });
    });
    if($("practiceNameColor")){
      $("practiceNameColor").addEventListener("input", function(){
        schedulePracticeBrandingAutosave(160);
      });
      $("practiceNameColor").addEventListener("change", function(){
        schedulePracticeBrandingAutosave(0);
      });
    }
    ["practiceLogoScale", "practiceLogoScaleValue"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.addEventListener("input", function(){
        if(String(this.value || "").trim() === "") return;
        schedulePracticeBrandingAutosave(160);
      });
      el.addEventListener("change", function(){
        schedulePracticeBrandingAutosave(0);
      });
    });
	    if($("showPracticeNameBadge")){
	      $("showPracticeNameBadge").addEventListener("change", function(){
	        schedulePracticeBrandingAutosave(0);
	      });
	    }
	    if($("practiceLogoInvert")){
	      $("practiceLogoInvert").addEventListener("change", function(){
	        schedulePracticeBrandingAutosave(0);
	      });
	    }
	    ["mobileQuickViewColumns", "mobileQuickViewGap", "mobileQuickViewFontSize", "mobileQuickViewTimerSize"].forEach(function(id){
	      var el = $(id);
	      if(!el) return;
	      el.addEventListener("input", function(){
	        if(String(this.value || "").trim() === "") return;
	        applyMobileQuickViewPreviewSettings(true);
	        scheduleMobileQuickViewAutosave(false, 220);
	      });
	      el.addEventListener("change", function(){
	        applyMobileQuickViewPreviewSettings(true);
	        scheduleMobileQuickViewAutosave(true, 0);
	      });
	    });
	    ["mobileQuickViewFontSizeValue", "mobileQuickViewTimerSizeValue"].forEach(function(id){
	      var el = $(id);
	      if(!el) return;
	      el.addEventListener("input", function(){
	        if(!isFinite(Number(this.value))) return;
	        applyMobileQuickViewPreviewSettings(true);
	        scheduleMobileQuickViewAutosave(false, 220);
	      });
	      el.addEventListener("change", function(){
	        applyMobileQuickViewPreviewSettings(true);
	        scheduleMobileQuickViewAutosave(true, 0);
	      });
	    });
	    ["doctorInitialBadgeScale", "doctorInitialBadgeScaleValue"].forEach(function(id){
	      var el = $(id);
	      if(!el) return;
	      el.addEventListener("input", function(){
	        if(String(this.value || "").trim() === "") return;
	        scheduleDoctorInitialBadgeAutosave(160);
	      });
	      el.addEventListener("change", function(){
	        scheduleDoctorInitialBadgeAutosave(0);
	      });
	    });
	    ["doctorInitialBadgeFontSize", "doctorInitialBadgeFontSizeValue"].forEach(function(id){
	      var el = $(id);
	      if(!el) return;
	      el.addEventListener("input", function(){
	        if(String(this.value || "").trim() === "") return;
	        scheduleDoctorInitialBadgeAutosave(160);
	      });
	      el.addEventListener("change", function(){
	        scheduleDoctorInitialBadgeAutosave(0);
	      });
	    });
	    if($("practiceLogoFile") && $("practiceLogoHelp")){
      $("practiceLogoFile").addEventListener("change", function(){
        var file = this.files && this.files[0];
        $("practiceLogoHelp").textContent = file
          ? ("Ready to upload: " + file.name)
          : "Uploads replace the RoomBoard wordmark with your clinic logo for the whole clinic.";
      });
    }

	    $("applyLayoutBtn").addEventListener("click", function(){
      var btn = this;
      runLockedAction("settings.apply-layout", function(){
        return commitLayoutSettings({ force: true, flush: true, announce: true });
      }, { el: btn, busyLabel: "Saving…", cooldownMs: 250 });
    });
    
	    $("applyTimerAlertBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.apply-alerts", function(){
	        return commitTimerAlertSettings({ force: true, flush: true, announce: true });
        }, { el: btn, busyLabel: "Saving…", cooldownMs: 250 });
	    });
	    if($("applyMobileQuickViewBtn")){
	      $("applyMobileQuickViewBtn").addEventListener("click", function(){
	        var btn = this;
	        runLockedAction("settings.apply-mobile-quick-view", function(){
	          return commitMobileQuickViewSettings({ force: true, flush: true, announce: true });
	        }, { el: btn, busyLabel: "Saving…", cooldownMs: 250 });
	      });
	    }

	    $("applyFontsBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.apply-fonts", function(){
	        return commitFontSettings({ force: true, flush: true, announce: true });
        }, { el: btn, busyLabel: "Saving…", cooldownMs: 250 });
	    });

    $("applyDisplayColorsBtn").addEventListener("click", function(){
      var btn = this;
      runLockedAction("settings.apply-display-colors", function(){
        return commitDisplayColorSettings({ flush: true, announce: true });
      }, { el: btn, busyLabel: "Saving…", cooldownMs: 250 });
    });
    if($("applyPracticeNameColorBtn")){
      $("applyPracticeNameColorBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.apply-practice-name-color", function(){
          return commitPracticeBrandingSettings({ flush: true, announce: true });
        }, { el: btn, busyLabel: "Saving…", cooldownMs: 250 });
      });
    }
    if($("uploadPracticeLogoBtn")){
      $("uploadPracticeLogoBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.upload-practice-logo", async function(){
          try{
            await uploadPracticeLogoSelection();
            setStatus("Clinic logo uploaded.");
            return true;
          }catch(e){
            setStatus("Logo upload failed: " + getErrorMessage(e));
            return false;
          }
        }, { el: btn, busyLabel: "Uploading…", cooldownMs: 250 });
      });
    }
    if($("removePracticeLogoBtn")){
      $("removePracticeLogoBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.remove-practice-logo", async function(){
          try{
            await removePracticeLogoSelection();
            setStatus("Clinic logo removed.");
            return true;
          }catch(e){
            setStatus("Removing logo failed: " + getErrorMessage(e));
            return false;
          }
        }, { el: btn, busyLabel: "Removing…", cooldownMs: 250 });
      });
    }

    if($("savePracticeDefaultsBtn")){
      $("savePracticeDefaultsBtn").addEventListener("click", async function(){
        var btn = this;
        return runLockedAction("settings.save-defaults", async function(){
        try{
          if(!supabase || !currentPracticeId){
            setStatus("Log into a practice before saving defaults.");
            return false;
          }
          flushSettingsAutosaveJobs();
          normalizeSettingsForSave(state);
          saveLocal();
          scheduleUiRefresh({ settingsLists: true });
          noteSettingsRemoteQueued("Saving defaults…");
          await savePracticeDefaultSettingsRecord(capturePersistentSettingsSnapshot(true));
          noteSettingsRemoteFinished(true, "Defaults saved");
          setStatus("Saved this practice's defaults.");
          return true;
        }catch(e){
          noteSettingsRemoteFinished(false, "Default save failed");
          setStatus("Saving practice defaults failed: " + getErrorMessage(e));
          return false;
        }
        }, { el: btn, busyLabel: "Saving…", cooldownMs: 350 });
      });
    }
    if($("resetWindowAppearanceBtn")){
      $("resetWindowAppearanceBtn").addEventListener("click", function(){
        resetWindowAppearanceToDefault();
        setStatus("This window is using the saved default appearance.");
      });
    }

    function buildClinicConfigExport(){
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        practiceId: currentPracticeId || null,
        practiceName: currentPracticeName || "",
        rooms: JSON.parse(JSON.stringify(state.rooms || [])),
        doctors: JSON.parse(JSON.stringify(state.doctors || [])),
        colorLabels: JSON.parse(JSON.stringify(state.colorLabels || [])),
        quickNotes: JSON.parse(JSON.stringify(state.quickNotes || [])),
        settings: capturePersistentSettingsSnapshot(true)
      };
    }

    function downloadTextFile(filename, contents, mimeType){
      var blob = new Blob([contents], { type: mimeType || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 800);
    }

    function importClinicConfig(payload){
      if(!payload || typeof payload !== "object") throw new Error("Invalid RoomBoard config file.");
      var importedState = ensureStateShape(JSON.parse(JSON.stringify(state || {})));

      if(Array.isArray(payload.rooms) && payload.rooms.length){
        importedState.rooms = JSON.parse(JSON.stringify(payload.rooms));
      }
      if(Array.isArray(payload.doctors) && payload.doctors.length){
        importedState.doctors = JSON.parse(JSON.stringify(payload.doctors));
      }
      if(Array.isArray(payload.colorLabels) && payload.colorLabels.length){
        importedState.colorLabels = JSON.parse(JSON.stringify(payload.colorLabels));
      }
      if(Array.isArray(payload.quickNotes)){
        importedState.quickNotes = JSON.parse(JSON.stringify(payload.quickNotes));
      }
      if(payload.settings){
        applyPersistentSettingsSnapshotToState(importedState, payload.settings, { syncWindow: true });
      }

      state = ensureStateShape(importedState);
      normalizeSettingsForSave(state);
      refreshKnownRoomIds(state.rooms);
      saveLocal();
      refreshUiFromState({ applyTheme: true, renderSettingsLists: true });
      noteSettingsLocalSaved("Imported locally");

      if(supabase && currentPracticeId){
        noteSettingsRemoteQueued("Importing clinic config…");
        scheduleRemoteSave("config", { immediate: true });
        scheduleRemoteSave("board", { immediate: true });
      }
    }

    if($("exportClinicConfigBtn")){
      $("exportClinicConfigBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.export-config", function(){
        try{
          flushSettingsAutosaveJobs();
          var payload = buildClinicConfigExport();
          var practiceSlug = String((currentPracticeName || "roomboard-clinic")).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "roomboard-clinic";
          downloadTextFile(practiceSlug + "-config.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
          if(typeof toast === "function") toast("Clinic config exported.");
          setStatus("Clinic config exported.");
          return true;
        }catch(e){
          setStatus("Export failed: " + getErrorMessage(e));
          return false;
        }
        }, { el: btn, busyLabel: "Exporting…", cooldownMs: 250 });
      });
    }

    if($("importClinicConfigBtn") && $("importClinicConfigFile")){
      $("importClinicConfigBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("settings.open-import", function(){
          $("importClinicConfigFile").click();
          return true;
        }, { el: btn, busyLabel: "Choose file…", cooldownMs: 150 });
      });
      $("importClinicConfigFile").addEventListener("change", function(){
        var file = this.files && this.files[0];
        if(!file) return;
        noteSettingsRemoteQueued("Importing clinic config…");
        var reader = new FileReader();
        reader.onload = function(){
          try{
            var payload = JSON.parse(String(reader.result || "{}"));
            importClinicConfig(payload);
            if(typeof toast === "function") toast("Clinic config imported.");
            setStatus("Clinic config imported.");
          }catch(e){
            noteSettingsRemoteFinished(false, "Import failed");
            setStatus("Import failed: " + getErrorMessage(e));
          } finally {
            $("importClinicConfigFile").value = "";
          }
        };
        reader.onerror = function(){
          noteSettingsRemoteFinished(false, "Import failed");
          setStatus("Import failed: Could not read file.");
          $("importClinicConfigFile").value = "";
        };
        reader.readAsText(file);
      });
    }

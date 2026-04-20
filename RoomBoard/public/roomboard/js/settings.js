    // ===== Drawer controls =====
    function openDrawer(){
      closeQuickAdd();
      document.body.className = (document.body.className + " drawerOpen").replace(/\s+/g," ").trim();
      if(saving || pendingConfigSave || pendingAppointmentTypesSave || pendingBoardSave || Object.keys(settingsAutosaveJobs).length){
        setSettingsSaveState("saving", "Saving changes…");
      } else {
        setSettingsSaveState("idle", "Autosave on");
      }
      holdRemoteUpdates(SHORT_INTERACTION_HOLD_MS);
      renderSettingsLists();
      loadFeedbackChecklist(true);
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
    if(!tabs) return;
    tabs.addEventListener("click", function(e){
      var btn = e.target && e.target.closest ? e.target.closest(".tabBtn") : null;
      if(!btn) return;
      var tabId = btn.getAttribute("data-tab");
      if(!tabId) return;
      Array.prototype.forEach.call(tabs.querySelectorAll(".tabBtn"), function(b){
        b.classList.toggle("active", b === btn);
      });
      Array.prototype.forEach.call(document.querySelectorAll(".tabPanel"), function(p){
        p.classList.toggle("active", p.id === tabId);
      });
    });
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
    $("openQuickAddBtn").addEventListener("click", function(){ openQuickAdd(); });
    $("displayOnlyActiveSwitch").addEventListener("click", function(){
      state.settings.displayOnlyActive = !state.settings.displayOnlyActive;
      persistWindowUiSettings();
      scheduleUiRefresh({
        displayChrome: true,
        display: true,
        displayFull: true,
        timerBindings: true
      });
      setStatus(state.settings.displayOnlyActive ? "Showing only active rooms" : "Showing all rooms");
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
      } else if(action === "cancelQuickAdd"){
        closeQuickAdd();
      } else if(action === "saveQuickAdd"){
        runLockedAction("quick-add.save", function(){
          return saveQuickAdd();
        }, { el: node, busyLabel: "Saving…", cooldownMs: 300 });
      }
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

      var header = document.querySelector("header");
      var main = document.querySelector("main");
      var headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      var mainStyles = main ? window.getComputedStyle(main) : null;
      var padTop = mainStyles ? (parseFloat(mainStyles.paddingTop) || 0) : 0;
      var padBottom = mainStyles ? (parseFloat(mainStyles.paddingBottom) || 0) : 0;
      var viewportHeight = window.innerHeight || root.clientHeight || 0;
      var availableHeight = Math.max(240, viewportHeight - headerHeight - padTop - padBottom - 8);
      root.style.setProperty("--appHeaderHeight", headerHeight + "px");
      root.style.setProperty("--fullscreenDisplayHeight", availableHeight + "px");
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
    document.addEventListener("fullscreenchange", function(){ updateFullscreenBtn(); updateViewportFit(); });
    document.addEventListener("webkitfullscreenchange", function(){ updateFullscreenBtn(); updateViewportFit(); });
    window.addEventListener("resize", updateViewportFit);

    // ===== Settings actions =====
    function queueSettingsConfigSave(options){
      options = options || {};
      normalizeSettingsForSave(state);
      saveLocal();
      scheduleUiRefresh({ settingsLists: true });
      var blockingIssues = getBlockingSettingsIssues(state);
      if(blockingIssues.length){
        noteSettingsRemoteFinished(false, "Fix settings first");
        setStatus(describeSettingsIssuesForStatus(blockingIssues));
        return;
      }
      if(!supabase || !currentPracticeId){
        noteSettingsLocalSaved("Saved locally");
        return;
      }
      noteSettingsRemoteQueued("Saving changes…");
      scheduleRemoteSave("config", { immediate: !!options.immediate });
    }

    function queueAppointmentTypesSave(options){
      options = options || {};
      normalizeSettingsForSave(state);
      saveLocal();
      scheduleUiRefresh({ settingsLists: true });
      var blockingIssues = getBlockingSettingsIssues(state);
      if(blockingIssues.length){
        noteSettingsRemoteFinished(false, "Fix label settings first");
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

    if($("defaultColorLabelSelect")){
      $("defaultColorLabelSelect").addEventListener("change", function(){
        state.settings.defaultColorLabelId = getConfiguredDefaultColorLabelId(state.colorLabels, this.value);
        queueAppointmentTypesSave({ immediate: true });
      });
    }

    function bindScaleInputs(rangeId, valueId){
      var range = $(rangeId);
      var value = $(valueId);
      if(!range || !value) return;
      range.addEventListener("input", function(){
        value.value = String(range.value);
      });
      value.addEventListener("input", function(){
        var v = Number(value.value);
        if(!isFinite(v)) return;
        v = Math.max(0.8, Math.min(1.6, v));
        range.value = String(v);
      });
    }
    bindScaleInputs("displayCardScale", "displayCardScaleValue");

    function layoutInputsReady(){
      return String(($("displayCols") && $("displayCols").value) || "").trim() !== ""
        && String(($("displayRows") && $("displayRows").value) || "").trim() !== ""
        && isFinite(Number(($("displayCardScale") && $("displayCardScale").value) || 1));
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
          var blockingIssues = getBlockingSettingsIssues(state);
          if(blockingIssues.length){
            noteSettingsRemoteFinished(false, "Fix settings first");
            setStatus(describeSettingsIssuesForStatus(blockingIssues));
            return false;
          }
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

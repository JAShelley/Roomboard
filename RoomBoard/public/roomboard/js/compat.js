// ===== Compatibility helpers (TV browsers) =====
function uuid(){
  // Prefer crypto.randomUUID if available; fallback otherwise.
  try{
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  }catch(e){}
  var s = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return s.replace(/[xy]/g, function(c){
    var r = Math.random()*16|0, v = (c === "x") ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

    function $(id){ return document.getElementById(id); }

    function setStatus(t){ $("statusLine").textContent = t; }

    var actionLocks = Object.create(null);
    var roomActionQueue = Promise.resolve();

    function waitMs(ms){
      return new Promise(function(resolve){
        setTimeout(resolve, Math.max(0, Number(ms || 0)));
      });
    }

    function setElementBusy(el, busy, busyLabel){
      if(!el) return;
      el.classList.toggle("isBusy", !!busy);
      el.setAttribute("aria-busy", busy ? "true" : "false");
      if("disabled" in el) el.disabled = !!busy;
      if(el.tagName === "A"){
        el.setAttribute("aria-disabled", busy ? "true" : "false");
        el.style.pointerEvents = busy ? "none" : "";
      }
      if(busy){
        if(!el.dataset.originalLabel) el.dataset.originalLabel = el.textContent;
        if(busyLabel) el.textContent = busyLabel;
        return;
      }
      if(el.dataset.originalLabel){
        el.textContent = el.dataset.originalLabel;
        delete el.dataset.originalLabel;
      }
    }

    function runLockedAction(key, fn, options){
      options = options || {};
      if(key && actionLocks[key]) return actionLocks[key];
      var el = options.el || null;
      var busyLabel = options.busyLabel || "";
      var cooldownMs = Math.max(0, Number(options.cooldownMs || 0));
      var task = Promise.resolve().then(fn).catch(function(err){
        try{ console.error("RoomBoard action failed:", err); }catch(_){}
        try{
          var message = (typeof getErrorMessage === "function") ? getErrorMessage(err) : String(err && err.message || err || "Unknown error");
          setStatus("Action failed: " + message);
          setSyncUI("err", "Action failed");
        }catch(_){}
        return false;
      });
      if(key) actionLocks[key] = task;
      setElementBusy(el, true, busyLabel);
      return task.then(function(result){
        return cooldownMs ? waitMs(cooldownMs).then(function(){ return result; }) : result;
      }).finally(function(){
        setElementBusy(el, false);
        if(key) delete actionLocks[key];
      });
    }

    function enqueueRoomBoardMutation(fn){
      roomActionQueue = roomActionQueue.catch(function(){ return null; }).then(function(){
        return Promise.resolve().then(fn);
      });
      return roomActionQueue;
    }

    function setSyncUI(stateName, msg){
      var pill = $("syncPill"), icon = $("syncIcon"), text = $("syncText"), time = $("syncTime");
      if(!pill || !icon || !text || !time) return;
      var now = new Date();
      var timeText = now.toLocaleTimeString();
      time.textContent = timeText;
      if(stateName === "syncing"){
        icon.textContent = "⟳";
        text.textContent = msg || "Syncing…";
      } else if(stateName === "ok"){
        icon.textContent = "✓";
        text.textContent = msg || "Synced";
      } else if(stateName === "err"){
        icon.textContent = "!";
        text.textContent = msg || "Sync error";
      } else {
        icon.textContent = "•";
        text.textContent = msg || "Idle";
      }
      pill.setAttribute("data-state", stateName || "idle");
      pill.title = text.textContent + (timeText ? (" • " + timeText) : "");
      pill.setAttribute("aria-label", pill.title);
    }

    function escapeHtml(str){
      str = String(str == null ? "" : str);
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
    function escapeHtmlWithLineBreaks(str){
      return escapeHtml(str).replace(/\r\n|\r|\n/g, "<br>");
    }

    
    function getDoctorInitials(name){
      name = String(name == null ? "" : name).trim();
      if(!name) return "";
      var map = (state.settings && state.settings.doctorInitials) ? state.settings.doctorInitials : null;
      if(map && map[name]) return String(map[name] || "").trim();
      return "";
    }

    function getSelectedDoctorHighlight(){
      return String(state && state.settings ? (state.settings.highlightDoctor || "") : "").trim();
    }

    function roomMatchesSelectedDoctor(room){
      var selected = getSelectedDoctorHighlight();
      if(!selected || !room) return false;
      return String(room.doctor || "").trim() === selected;
    }

    function isMobileQuickViewViewport(){
      return !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
    }

    function isMobileQuickViewEnabled(){
      return !!(state && state.settings && state.settings.mobileQuickView && isMobileQuickViewViewport());
    }

	    function isRoomActiveForDisplay(room){
	      if(!room) return false;
	      if(room.needsCleaning) return false;
	      return !!String(room.patientName || "").trim();
	    }

    function compareRoomNamesNatural(a, b){
      var nameA = String(a && a.name || "");
      var nameB = String(b && b.name || "");
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    }

    function getActiveDisplaySortMode(){
      return (state && state.settings && state.settings.displaySortMode === "time") ? "time" : "room";
    }

    function compareActiveDisplayRooms(a, b){
      if(getActiveDisplaySortMode() === "time"){
        var diff = computeElapsed(b && (b.needsCleaning ? b.cleaningTimer : b.timer)) - computeElapsed(a && (a.needsCleaning ? a.cleaningTimer : a.timer));
        if(diff !== 0) return diff;
      }
      return compareRoomNamesNatural(a, b);
    }

    function getActiveDisplayDoctorName(room){
      return String(room && room.doctor || "").trim() || "Unassigned";
    }

    function compareActiveDisplayDoctorNames(a, b){
      var nameA = String(a || "");
      var nameB = String(b || "");
      var unassignedA = nameA === "Unassigned";
      var unassignedB = nameB === "Unassigned";
      if(unassignedA !== unassignedB) return unassignedA ? 1 : -1;
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    }

    function getActiveDisplayDoctorGroups(rooms){
      var source = Array.isArray(rooms) ? rooms : [];
      var groupsByDoctor = Object.create(null);
      var doctorNames = [];

      for(var i=0;i<source.length;i++){
        var room = source[i];
        var doctorName = getActiveDisplayDoctorName(room);
        if(!groupsByDoctor[doctorName]){
          groupsByDoctor[doctorName] = [];
          doctorNames.push(doctorName);
        }
        groupsByDoctor[doctorName].push(room);
      }

      doctorNames.sort(compareActiveDisplayDoctorNames);
      var groups = [];
      for(var j=0;j<doctorNames.length;j++){
        groups.push({
          doctorName: doctorNames[j],
          rooms: groupsByDoctor[doctorNames[j]]
        });
      }
      return groups;
    }

    function getDisplayRooms(){
      if(!state || !state.rooms) return [];
      var rooms = state.rooms.slice();
      var quickView = isMobileQuickViewEnabled();
      var onlyActive = !!(state.settings && state.settings.displayOnlyActive);
      if(onlyActive){
        rooms = rooms.filter(isRoomActiveForDisplay);
        rooms.sort(compareActiveDisplayRooms);
      }
      return rooms;
    }

	    function renderDoctorHighlightSelect(){
	      var sel = $("doctorHighlightSelect");
	      var wrap = $("doctorHighlightWrap");
      if(!sel || !state) return;

      var current = getSelectedDoctorHighlight();
      var options = ['<option value="">None</option>'];
      var hasCurrent = !current;

      for(var i=0;i<state.doctors.length;i++){
        var name = String(state.doctors[i] == null ? "" : state.doctors[i]).trim();
        if(!name) continue;
        if(name === current) hasCurrent = true;
        var di = getDoctorInitials(name);
        var label = di ? (name + " (" + di + ")") : name;
        options.push('<option value="' + escapeHtml(name) + '">' + escapeHtml(label) + '</option>');
      }

      if(!hasCurrent && current){
        state.settings.highlightDoctor = "";
        current = "";
        persistWindowUiSettings();
      }

      sel.innerHTML = options.join("");
      sel.value = current;
      if(wrap) wrap.classList.toggle("isActive", !!current);
    }

    function syncDisplayToolbarControls(){
      var toolbar = document.querySelector(".right");
      var activeWrap = $("displayOnlyActiveWrap");
      var activeSwitch = $("displayOnlyActiveSwitch");
      var sortWrap = $("displaySortWrap");
      var sortSelect = $("displaySortSelect");
      var viewToggleBtn = $("viewToggleBtn");
      var onlyActive = !!(state && state.settings && state.settings.displayOnlyActive);
      var isMobileToolbar = !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
      var quickViewOn = isMobileQuickViewEnabled();
      if(activeSwitch) activeSwitch.classList.toggle("on", onlyActive);
      if(activeWrap) activeWrap.classList.toggle("isActive", onlyActive);
      if(sortSelect) sortSelect.value = (state && state.settings && state.settings.displaySortMode === "time") ? "time" : "room";
      if(toolbar) toolbar.classList.toggle("activeSortBeforeToggle", !quickViewOn && onlyActive);
      if(toolbar) toolbar.classList.toggle("mobileSortExpanded", isMobileToolbar && !quickViewOn && onlyActive);
	      if(sortWrap){
	        sortWrap.classList.remove("isActive");
	        sortWrap.style.display = (!quickViewOn && onlyActive) ? "flex" : "none";
	      }
      if(activeWrap) activeWrap.style.display = "";
      if(viewToggleBtn){
        viewToggleBtn.classList.toggle("isActive", quickViewOn);
        viewToggleBtn.title = quickViewOn ? "Quick view is active on mobile" : "Toggle grid/list";
        viewToggleBtn.setAttribute("aria-label", viewToggleBtn.title);
      }
	    }

	    function rebuildRoomLookup(){
	      roomLookup = Object.create(null);
	      if(!state || !state.rooms) return;
	      for(var i=0;i<state.rooms.length;i++){
	        var room = state.rooms[i];
	        if(room && room.id) roomLookup[room.id] = room;
	      }
	    }

	    function findTimerRoomElement(node){
	      while(node && node !== document.body){
	        if(node.dataset && node.dataset.roomId) return node;
	        node = node.parentNode;
	      }
	      return null;
	    }

	    function updateTimerBindings(force){
	      if(!state || !state.settings || !timerBindings.length) return;
	      var now = toReferenceNowMs();
	      var thresholdSignature = String(state.settings.timerAlert1AtSec || 0) + "|" + String(state.settings.timerAlert2AtSec || 0);
	      if(cachedTimerAlertThresholds.signature !== thresholdSignature){
	        cachedTimerAlertThresholds.signature = thresholdSignature;
	        cachedTimerAlertThresholds.t1 = Number(state.settings.timerAlert1AtSec || 0) * 1000;
	        cachedTimerAlertThresholds.t2 = Number(state.settings.timerAlert2AtSec || 0) * 1000;
	      }
	      var t1 = cachedTimerAlertThresholds.t1;
	      var t2 = cachedTimerAlertThresholds.t2;
	      for(var i=0;i<timerBindings.length;i++){
	        var binding = timerBindings[i];
	        if(!binding || !binding.node || !binding.roomEl) continue;
	        var room = roomLookup[binding.roomId];
	        if(!room) continue;
	        var activeTimer = room.needsCleaning ? room.cleaningTimer : room.timer;
	        var elapsedMs = computeElapsed(activeTimer, now);
	        var elapsedSec = Math.floor(elapsedMs / 1000);
	        var alertLevel = 0;
	        if(t2 > 0 && elapsedMs >= t2) alertLevel = 2;
	        else if(t1 > 0 && elapsedMs >= t1) alertLevel = 1;

	        if(force || binding.lastSecond !== elapsedSec){
	          binding.node.textContent = formatTime(elapsedMs);
	          binding.lastSecond = elapsedSec;
	        }

	        if(force || binding.lastAlertLevel !== alertLevel){
	          binding.node.classList.toggle("timerAlert1", alertLevel === 1);
	          binding.node.classList.toggle("timerAlert2", alertLevel === 2);
	          if(binding.boxEl){
	            binding.boxEl.classList.toggle("timerAlert1", alertLevel === 1);
	            binding.boxEl.classList.toggle("timerAlert2", alertLevel === 2);
	          }
	          binding.lastAlertLevel = alertLevel;
	        }

	        var isCleaning = !!room.needsCleaning;
	        var isRunning = !!(activeTimer && activeTimer.running && !isCleaning);
	        if(force || binding.lastCleaning !== isCleaning){
	          binding.node.classList.toggle("timerCleaning", isCleaning);
	          if(binding.boxEl) binding.boxEl.classList.toggle("timerCleaning", isCleaning);
	          if(binding.labelNode) binding.labelNode.textContent = isCleaning ? "Cleaning" : "Time";
	          binding.lastCleaning = isCleaning;
	        }
	        if(force || binding.lastRunning !== isRunning){
	          binding.node.classList.toggle("timerRunning", isRunning);
	          if(binding.boxEl) binding.boxEl.classList.toggle("timerRunning", isRunning);
	          binding.lastRunning = isRunning;
	        }

	        if(force || binding.lastBorder !== (alertLevel === 2)){
	          binding.roomEl.classList.toggle("timerAlertBorder", alertLevel === 2);
	          binding.lastBorder = (alertLevel === 2);
	        }
	      }
	    }

	    function rebuildTimerBindings(){
	      bumpRenderPerf("timerBindingRebuilds");
	      timerBindings = [];
	      rebuildRoomLookup();
		      var nodes = document.querySelectorAll("[data-timerText]");
		      for(var i=0;i<nodes.length;i++){
		        var node = nodes[i];
		        var roomId = node.getAttribute("data-room-id");
		        if(!roomId) continue;
		        var roomEl = null;
		        if(node.closest){
		          roomEl = node.closest(".room[data-room-id], .mobileQuickViewItem[data-room-id], .mobileQuickViewEmptyTile[data-room-id], .mobileQuickViewPopupCard[data-room-id]");
		        }
		        if(!roomEl) roomEl = findTimerRoomElement(node);
		        if(!roomEl) continue;
		        var boxEl = null;
		        if(node.closest){
		          boxEl = node.closest(".timerBox, .mobileQuickViewTimerBox, .mobileQuickViewPopupTimer");
		        }
		        timerBindings.push({
		          node: node,
		          roomEl: roomEl,
		          boxEl: boxEl,
		          labelNode: roomEl.querySelector('[data-timer-label][data-room-id="'+roomId+'"]'),
		          roomId: roomId,
	          lastSecond: null,
	          lastAlertLevel: null,
	          lastCleaning: null,
	          lastRunning: null,
	          lastBorder: null
	        });
	      }
	      updateTimerBindings(true);
	    }

	    function getRoomIdSet(rooms){
	      var out = Object.create(null);
	      var list = rooms || [];
	      for(var i=0;i<list.length;i++){
	        if(list[i] && list[i].id) out[list[i].id] = true;
	      }
	      return out;
	    }

	    function syncOptionalUi(){ return; }

	    function refreshKnownRoomIds(nextRooms){
	      knownRoomIds = getRoomIdSet(nextRooms);
	    }

	    function formatTime(ms){
	      var total = Math.floor(ms / 1000);
	      var h = Math.floor(total / 3600);
	      var m = Math.floor((total % 3600) / 60);
	      var s = total % 60;
	      function pad(n){ n = String(n); return n.length < 2 ? ("0"+n) : n; }
	      return pad(h)+":"+pad(m)+":"+pad(s);
	    }

    function loadStoredServerTimeOffset(){
      try{
        var raw = localStorage.getItem(SERVER_TIME_OFFSET_STORAGE_KEY);
        var parsed = Number(raw);
        if(isFinite(parsed)){
          serverTimeOffsetMs = parsed;
          hasServerTimeOffset = true;
        }
      }catch(e){}
    }

    function persistServerTimeOffset(){
      try{
        localStorage.setItem(SERVER_TIME_OFFSET_STORAGE_KEY, String(serverTimeOffsetMs || 0));
      }catch(e){}
    }

    function updateServerTimeOffset(serverNowIso){
      var parsed = Date.parse(serverNowIso);
      if(!isFinite(parsed)) return;
      serverTimeOffsetMs = parsed - Date.now();
      hasServerTimeOffset = true;
      persistServerTimeOffset();
    }

    function toReferenceNowMs(referenceNow){
      if(referenceNow == null) return Date.now() + (hasServerTimeOffset ? serverTimeOffsetMs : 0);
      if(typeof referenceNow === "number") return referenceNow;
      var parsed = Date.parse(referenceNow);
      return isFinite(parsed) ? parsed : Date.now();
    }

    function getEstimatedServerNowIso(){
      return new Date(toReferenceNowMs()).toISOString();
    }

    function computeElapsed(timer, referenceNow){
      if(timer && timer.running){
        var startedAtMs = null;
        if(timer.startedAtIso){
          startedAtMs = Date.parse(timer.startedAtIso);
        } else if(timer.startedAt){
          startedAtMs = Number(timer.startedAt);
        }
        if(isFinite(startedAtMs) && startedAtMs){
          return Number(timer.elapsedMs || 0) + Math.max(0, toReferenceNowMs(referenceNow) - startedAtMs);
        }
      }
      return Number(timer && timer.elapsedMs || 0);
    }

    function timerHasProgress(timer){
      timer = timer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null };
      return !!timer.running || computeElapsed(timer) > 0;
    }

    function applyTimerStartAt(timer, startedAtIso){
      if(!timer) return;
      var normalizedStartIso = normalizeServerNowIso(startedAtIso) || isoNow();
      var startedAtMs = Date.parse(normalizedStartIso);
      timer.elapsedMs = Number(timer.elapsedMs || 0);
      if(!isFinite(timer.elapsedMs) || timer.elapsedMs < 0) timer.elapsedMs = 0;
      timer.running = true;
      timer.startedAt = isFinite(startedAtMs) ? startedAtMs : null;
      timer.startedAtIso = normalizedStartIso;
      timer.updatedAtIso = normalizedStartIso;
    }

    function applyTimerStopAt(timer, stoppedAtIso, resetElapsed){
      if(!timer) return;
      var normalizedStopIso = normalizeServerNowIso(stoppedAtIso) || isoNow();
      timer.elapsedMs = resetElapsed ? 0 : computeElapsed(timer, normalizedStopIso);
      timer.running = false;
      timer.startedAt = null;
      timer.startedAtIso = null;
      timer.updatedAtIso = normalizedStopIso;
    }

	    function hasTimerAlert2(room, elapsedMs){
	      if(!room) return false;
	      var activeTimer = room.needsCleaning ? room.cleaningTimer : room.timer;
	      if(elapsedMs == null) elapsedMs = computeElapsed(activeTimer);
	      var t2 = Number(state && state.settings ? (state.settings.timerAlert2AtSec || 0) : 0) * 1000;
	      return !!(t2 > 0 && elapsedMs >= t2);
	    }

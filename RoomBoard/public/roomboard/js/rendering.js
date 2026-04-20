    // ===== Rendering =====
    function buildRoomNotesDockHtml(room){
      if(room.needsCleaning || (!room.quickNote && !room.notes)) return "";
      return '<details class="roomNotesDock">'
        + '<summary class="roomNotesBtn" title="View flag and notes">📝</summary>'
        + '<div class="roomNotesPanel">'
          + (room.quickNote ? '<div class="roomNotesItem"><div class="roomNotesLabel">Flag</div><div class="roomNotesValue">' + escapeHtmlWithLineBreaks(room.quickNote) + '</div></div>' : '')
          + (room.notes ? '<div class="roomNotesItem"><div class="roomNotesLabel">Notes</div><div class="roomNotesValue">' + escapeHtmlWithLineBreaks(room.notes) + '</div></div>' : '')
        + '</div>'
      + '</details>';
    }

    function createDisplayRoomElement(room, isList){
      var color = getColorById(room.colorLabelId);
      var effectiveColor = room.colorHex ? room.colorHex : color.color;
      var notesDock = buildRoomNotesDockHtml(room);
      var timer = room.needsCleaning ? room.cleaningTimer : room.timer;
      var isTimerRunning = !!(timer && timer.running && !room.needsCleaning);
      var el = document.createElement("section");
      el.dataset.roomId = room.id;
      el.setAttribute("draggable", "true");

      if(isList){
        el.className = "room" + (room.needsCleaning ? " cleaning" : "") + (roomMatchesSelectedDoctor(room) ? " doctorSelected" : "");
        el.style.borderLeft = "6px solid " + (room.needsCleaning ? "rgba(251,191,36,.65)" : (effectiveColor + "AA"));
        el.style.setProperty("--roomTint", room.needsCleaning ? "rgba(251,191,36,.20)" : (effectiveColor + "22"));
        el.style.background = "linear-gradient(90deg, var(--roomTint), var(--listRowFade, rgba(255,255,255,.03)))";
        el.style.borderColor = room.needsCleaning ? "rgba(251,191,36,.55)" : "var(--listChromeBorder, rgba(255,255,255,.10))";
        el.innerHTML =
          '<div class="wbRow">'
            + '<div class="wbCell wbRoom"><span class="tagDot" style="background:'+effectiveColor+'; box-shadow:0 0 0 4px '+effectiveColor+'22;"></span><span class="wbRoomInline"><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></span></div>'
            + '<div class="wbCell wbPatientCell" data-label="Patient">' + (function(){ var di = getDoctorInitials(room.doctor); return di ? '<span class="docInitBadge">'+escapeHtml(di)+'</span>' : '<span class="docInitBadge isEmpty"></span>'; })() + (room.patientName ? '<span class="wbPatientName">'+escapeHtml(room.patientName)+'</span>' : '<span class="muted">—</span>') + '</div>'
            + '<div class="wbCell wbReasonCell" data-label="Reason">'+escapeHtml(color.title)+'</div>'
            + '<div class="wbCell wbDoctorCell" data-label="Doctor">'+(room.doctor ? escapeHtml(room.doctor) : '<span class="muted">—</span>')+'</div>'
            + '<div class="wbCell wbTechCell" data-label="Tech">'+(room.tech ? escapeHtml(room.tech) : '<span class="muted">—</span>')+'</div>'
            + '<div class="wbCell wbNotes" data-label="Notes"><span class="wbNotesIconSlot">'+(notesDock || '<span class="muted">—</span>')+'</span><span class="wbReady"><span class="r '+(room.roomReady ? '' : 'off')+'">room ✅</span><span class="r '+(room.doctorReady ? '' : 'off')+'">doctor ✅</span></span></div>'
            + '<div class="wbCell wbTimer"><div class="wbTimerWrap">'
              + '<button class="wbIconBtn" data-action="displayDischarge" data-room-id="'+room.id+'" title="'+(room.needsCleaning ? 'Mark clean' : 'Discharge')+'">'+getDischargeButtonIcon(room.needsCleaning)+'</button>'
              + (hasRedoDischarge(room) ? '<button class="wbIconBtn" data-action="displayRedo" data-room-id="'+room.id+'" title="Redo discharge">↺</button>' : '')
              + '<span class="wbTimerText'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'" data-timerText data-room-id="'+room.id+'">'+formatTime(computeElapsed(timer))+'</span>'
            + '</div></div>'
          + '</div>';
        return el;
      }

      var isEmpty = !room.patientName && !room.needsCleaning;
      var hasNotesDock = !!notesDock;
      var cls = "room" + (room.needsCleaning ? " cleaning" : "") + (hasRedoDischarge(room) ? " hasRedo" : "") + (hasNotesDock ? " hasNotesDock" : "") + (hasTimerAlert2(room) ? " timerAlertBorder" : "") + (roomMatchesSelectedDoctor(room) ? " doctorSelected" : "");
      var dotStyle = "background:" + effectiveColor + "; box-shadow:0 0 0 4px " + effectiveColor + "22;";
      var summary = "";
      if(room.needsCleaning){
        summary = '<div class="summary"><span class="pill" style="border-color: rgba(251,191,36,.55); background: rgba(251,191,36,.12);"><strong>NEEDS TO BE CLEANED</strong></span></div>';
      } else if(!isEmpty){
        summary = '<div class="summary">'
          + (room.patientName ? '<span class="pill">' + escapeHtml(room.patientName) + '</span>' : '')
          + '<span class="pill">' + escapeHtml(color.title) + '</span>'
          + (room.doctor ? '<span class="pill">' + escapeHtml(room.doctor) + '</span>' : '')
          + (room.tech ? '<span class="pill">' + escapeHtml(room.tech) + '</span>' : '')
          + (room.roomReady ? '<span class="pill" style="border-color: rgba(45,212,191,.35);">ROOM READY</span>' : '')
          + (room.doctorReady ? '<span class="pill" style="border-color: rgba(110,168,254,.35);">DOCTOR READY</span>' : '')
          + '</div>';
      } else {
        summary = '<div class="muted">Empty</div>';
      }

      el.className = cls;
      if(room.needsCleaning){
        el.style.borderColor = "";
        el.style.background = "";
      } else {
        el.style.borderColor = effectiveColor + "55";
        el.style.background = "linear-gradient(180deg, " + effectiveColor + "E6, " + effectiveColor + "CC)";
        applyRoomCardContrastVars(el, (state.settings.cardTextMode === "light") ? "#ffffff" : (state.settings.cardTextMode === "dark") ? "#0b1220" : pickReadableTextColor(effectiveColor));
      }
      el.innerHTML =
        '<div class="roomTop">'
          + '<div class="roomName"><span class="tagDot" style="'+dotStyle+'"></span><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></div>'
          + '<button class="iconBtn" data-action="displayDischarge" data-room-id="'+room.id+'" title="'+(room.needsCleaning ? 'Mark clean' : 'Discharge')+'">'+getDischargeButtonIcon(room.needsCleaning)+'</button>'
        + '</div>'
        + '<div class="roomBody">'
          + summary
          + '<div class="timerRow">'
            + '<div class="timerBox'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'">'
              + '<div><div class="muted" data-timer-label data-room-id="'+room.id+'">'+(room.needsCleaning ? 'Cleaning' : 'Time')+'</div><div class="time'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'" data-timerText data-room-id="'+room.id+'">'+formatTime(computeElapsed(timer))+'</div></div>'
              + '<div class="muted" style="text-align:right;">&nbsp;</div>'
            + '</div>'
          + '</div>'
        + '</div>'
        + notesDock
        + (hasRedoDischarge(room) ? '<button class="roomRedoBtn" data-action="displayRedo" data-room-id="'+room.id+'" title="Redo discharge">↺</button>' : '')
        + (function(){ var di = getDoctorInitials(room.doctor); return di ? '<div class="docInitCorner"><span class="docInitBadge">'+escapeHtml(di)+'</span></div>' : ''; })();
      return el;
    }

    function canPatchDisplayRooms(roomIds){
      var grid = $("displayGrid");
      if(!grid || !roomIds || !roomIds.length) return false;
      if(!!(state && state.settings && state.settings.displayOnlyActive)) return false;
      if(String(grid.dataset.layout || "") !== (state.settings.displayLayout === "list" ? "list" : "grid")) return false;
      if(String(grid.dataset.roomCount || "") !== String(getDisplayRooms().length)) return false;
      for(var i=0;i<roomIds.length;i++){
        if(!getSurfaceRoomNode("display", roomIds[i])) return false;
      }
      return true;
    }

    function patchDisplayRooms(roomIds){
      if(!canPatchDisplayRooms(roomIds)) return false;
      var grid = $("displayGrid");
      var displayRooms = getDisplayRooms();
      var displayRoomsById = Object.create(null);
      var isList = (state.settings.displayLayout === "list");
      for(var i=0;i<displayRooms.length;i++){
        displayRoomsById[String(displayRooms[i].id)] = displayRooms[i];
      }
      for(var j=0;j<roomIds.length;j++){
        var roomId = String(roomIds[j]);
        var existing = getSurfaceRoomNode("display", roomId);
        var nextRoom = displayRoomsById[roomId];
        if(!existing || !nextRoom) return false;
        var replacement = createDisplayRoomElement(nextRoom, isList);
        grid.replaceChild(replacement, existing);
        rememberSurfaceRoomNode("display", roomId, replacement);
      }
      bumpRenderPerf("displayRoomPatches", roomIds.length);
      if(isList) requestAnimationFrame(applyWbRoomNameMarquee);
      syncRoomNotesLayers();
      return true;
    }

    function renderDisplay(skipTimerBindingRefresh){
      var grid = $("displayGrid");
      if(!grid) return;
      bumpRenderPerf("displayRenders");
      clearSurfaceRoomNodeMap("display");
      grid.innerHTML = "";
      var displayRooms = getDisplayRooms();
      var isList = (state.settings.displayLayout === "list");
      grid.dataset.layout = isList ? "list" : "grid";
      grid.dataset.roomCount = String(displayRooms.length);

      if(isList){
        var lines = 16;
        for(var i=0;i<Math.min(lines, displayRooms.length);i++){
          var listNode = createDisplayRoomElement(displayRooms[i], true);
          grid.appendChild(listNode);
          rememberSurfaceRoomNode("display", displayRooms[i].id, listNode);
        }
        requestAnimationFrame(applyWbRoomNameMarquee);
        syncRoomNotesLayers();
        if(!skipTimerBindingRefresh) rebuildTimerBindings();
        return;
      }

      for(var j=0;j<displayRooms.length;j++){
        var node = createDisplayRoomElement(displayRooms[j], false);
        grid.appendChild(node);
        rememberSurfaceRoomNode("display", displayRooms[j].id, node);
      }
      syncRoomNotesLayers();
      if(!skipTimerBindingRefresh) rebuildTimerBindings();
    }

    function syncRoomNotesLayers(){
      var docks = document.querySelectorAll('.roomNotesDock');
      for(var i=0;i<docks.length;i++){
        var card = docks[i].closest('.room');
        if(!card) continue;
        if(docks[i].hasAttribute('open')) card.classList.add('hasOpenNotes');
        else card.classList.remove('hasOpenNotes');
      }
    }

    
    function closeOpenRoomNotes(exceptDock){
      var docks = document.querySelectorAll('.roomNotesDock[open]');
      for(var i=0;i<docks.length;i++){
        if(exceptDock && docks[i] === exceptDock) continue;
        docks[i].removeAttribute('open');
      }
      syncRoomNotesLayers();
    }

    function bindDisplayActions(){
      var grid = $("displayGrid");
      if(!grid || grid.__bound) return;
      grid.__bound = true;

	      grid.addEventListener("click", function(e){
	        var node = e.target;
	        // walk up to a node with data-action
	        while(node && node !== grid && !(node.getAttribute && node.getAttribute("data-action"))) node = node.parentNode;
        if(!node || node === grid) return;

        var action = node.getAttribute("data-action");
        if(action !== "displayDischarge" && action !== "displayRedo") return;

        var roomId = node.getAttribute("data-room-id");
        var room = findRoomById(roomId);
        if(!room) return;
        runLockedAction("display-room-action." + room.id, function(){
          return enqueueRoomBoardMutation(function(){
            var actionNowIso = getEstimatedServerNowIso();

            if(action === "displayRedo"){
              if(!restoreDischargedRoom(room, actionNowIso)) return false;
              requestBoardRoomRefresh([room.id], { includeIntake: false });
              commitBoardInBackground({ immediate: true });
              return true;
            }

            if(room.needsCleaning){
              clearRoomCleaning(room, false, actionNowIso);
              document.documentElement.style.setProperty("--timerAlert1Color", state.settings.timerAlert1Color || "#fbbf24");
              document.documentElement.style.setProperty("--timerAlert2Color", state.settings.timerAlert2Color || "#fb7185");
              requestBoardRoomRefresh([room.id], { includeIntake: false });
              commitBoardInBackground({ immediate: true });
              return true;
            }
	          dischargeRoom(room, actionNowIso);
	          requestBoardRoomRefresh([room.id], { includeIntake: false });
	          commitBoardInBackground({ immediate: true });
            return true;
          });
        }, { el: node, cooldownMs: 450 });
	      });

	      grid.addEventListener("dblclick", function(e){
	        var target = e.target;
	        if(!target || !target.closest) return;
	        if(target.closest('button, .btn, .iconBtn, .roomRedoBtn, .roomNotesDock, summary, input, textarea, select, a')) return;
	        var card = closestRoomCard(target);
	        if(!card) return;
	        var roomId = card.getAttribute("data-room-id") || card.dataset.roomId;
	        if(!roomId) return;
	        holdRemoteUpdates(1200);
	        openQuickAdd(roomId);
	      });

	      document.addEventListener("click", function(e){
	        var summary = e.target && e.target.closest ? e.target.closest('.roomNotesDock > summary') : null;
	        if(summary){
	          var dockFromSummary = summary.parentNode;
	          if(dockFromSummary && dockFromSummary.hasAttribute('open')){
	            e.preventDefault();
	            syncRoomNotesLayers();
	            return;
	          }
	        }
	        var dock = e.target && e.target.closest ? e.target.closest('.roomNotesDock') : null;
	        if(dock) return;
        closeOpenRoomNotes(null);
	      });

      document.addEventListener("toggle", function(e){
        var dock = e.target && e.target.closest ? e.target.closest('.roomNotesDock') : null;
        if(!dock) return;
        if(dock.hasAttribute('open')) closeOpenRoomNotes(dock);
        syncRoomNotesLayers();
      }, true);

      document.addEventListener("keydown", function(e){
        if(e.key === "Escape") closeOpenRoomNotes(null);
      });

	      // Drag & drop on display (swap room contents)
	      grid.addEventListener("dragstart", function(e){
	        var card = closestRoomCard(e.target);
	        if(!card) return;
	        setDraggedRoomId(card.getAttribute("data-room-id") || card.dataset.roomId, e.dataTransfer);
	      });
	      grid.addEventListener("dragend", function(){
	        clearDraggedRoomId();
	      });

	      grid.addEventListener("dragover", function(e){
	        var card = closestRoomCard(e.target);
	        if(!card) return;
	        e.preventDefault();
        try{ e.dataTransfer.dropEffect = "move"; }catch(_){}
      });

	      grid.addEventListener("drop", function(e){
	        var toCard = closestRoomCard(e.target);
	        if(!toCard) return;
	        e.preventDefault();
	        var toId = toCard.getAttribute("data-room-id") || toCard.dataset.roomId;
	        var fromId = getDraggedRoomId(e.dataTransfer);
	        enqueueRoomBoardMutation(function(){
	          swapRoomsById(fromId, toId, { immediate: true });
	        });
	        clearDraggedRoomId();
	      });
	    }
    function isIntakeVisible(){
      return false;
    }

    function createDoctorOptionsHtml(selectedDoctor){
      var doctorOptions = '<option ' + (!selectedDoctor ? 'selected' : '') + ' value="">None</option>';
      for(var d=0; d<state.doctors.length; d++){
        var name = String(state.doctors[d] == null ? "" : state.doctors[d]).trim();
        if(!name) continue;
        var sel = (name === selectedDoctor) ? "selected" : "";
        var di = (state.settings && state.settings.doctorInitials) ? (state.settings.doctorInitials[name] || "") : "";
        var label = di && name ? (name + " (" + di + ")") : name;
        doctorOptions += '<option '+sel+' value="'+escapeHtml(name)+'">'+escapeHtml(label)+'</option>';
      }
      return doctorOptions;
    }

    function createColorOptionsHtml(selectedColorLabelId){
      var colorOptions = "";
      var intakeColorLabels = getSortedColorLabels(state.colorLabels);
      for(var c=0;c<intakeColorLabels.length;c++){
        var cl = intakeColorLabels[c];
        var sel = (cl.id === selectedColorLabelId) ? "selected" : "";
        colorOptions += '<option '+sel+' value="'+escapeHtml(cl.id)+'">'+escapeHtml(cl.title)+'</option>';
      }
      return colorOptions;
    }

    function createQuickNoteOptionsHtml(selectedQuickNote){
      var quickNoteOptions = "";
      for(var q=0; q<state.quickNotes.length; q++){
        var qn = state.quickNotes[q];
        var qsel = (qn === selectedQuickNote) ? "selected" : "";
        quickNoteOptions += '<option '+qsel+' value="'+escapeHtml(qn)+'">'+escapeHtml(qn ? qn : "(none)")+'</option>';
      }
      return quickNoteOptions;
    }

    function createIntakeRoomElement(room){
      var color = getColorById(room.colorLabelId);
      var effectiveColor = room.colorHex ? room.colorHex : color.color;
      var timer = room.needsCleaning ? room.cleaningTimer : room.timer;
      var isTimerRunning = !!(timer && timer.running && !room.needsCleaning);
      var el = document.createElement("section");
      el.className = "room" + (state.settings.techViewIntake ? " techViewCard" : "") + (room.needsCleaning ? " cleaning" : "") + (hasRedoDischarge(room) ? " hasRedo" : "") + (hasTimerAlert2(room) ? " timerAlertBorder" : "") + (roomMatchesSelectedDoctor(room) ? " doctorSelected" : "");
      el.setAttribute("draggable","true");
      el.dataset.roomId = room.id;

      if(room.needsCleaning){
        el.style.borderColor = "";
        el.style.background = "";
      } else {
        el.style.borderColor = effectiveColor + "55";
        el.style.background = "linear-gradient(180deg, " + effectiveColor + "22, rgba(255,255,255,.03))";
        applyRoomCardContrastVars(el, (state.settings.cardTextMode === "light") ? "#ffffff" : (state.settings.cardTextMode === "dark") ? "#0b1220" : pickReadableTextColor(effectiveColor));
      }

      el.innerHTML =
        (state.settings.techViewIntake
          ? (
            '<div class="roomTop">'
              + '<div class="roomName"><span class="tagDot" style="background:'+effectiveColor+'; box-shadow:0 0 0 4px '+effectiveColor+'22;"></span><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></div>'
              + (room.needsCleaning ? '<span class="pill" style="border-color: rgba(251,191,36,.55); background: rgba(251,191,36,.12);"><strong>NEEDS CLEANING</strong></span>' : '<span class="muted">'+escapeHtml(color.title)+'</span>')
            + '</div>'
            + '<div class="roomBody">'
              + '<div class="row2">'
                + '<div class="field"><label>Patient</label><div class="viewBox">'+escapeHtml(room.patientName || '')+'</div></div>'
                + '<div class="field"><label>Doctor</label><div class="viewBox">'+escapeHtml(room.doctor || '')+'</div></div>'
              + '</div>'
              + '<div class="row2 techRowCompact">'
                + '<div class="field"><label>Initials</label><input data-field="tech" type="text" value="'+escapeHtml(room.tech)+'" placeholder="e.g., AJ" /></div>'
                + '<div class="drReadyCompact" title="Doctor ready"><span class="drReadyIcon">🩺</span><div class="switch '+(room.doctorReady ? "on" : "")+'" data-action="toggleDoctorReady"><div class="knob"></div></div></div>'
              + '</div>'
            + '</div>'
          )
          : (
            '<div class="roomTop">'
              + '<div class="roomName"><span class="tagDot" style="background:'+effectiveColor+'; box-shadow:0 0 0 4px '+effectiveColor+'22;"></span><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></div>'
              + (room.needsCleaning ? '<span class="pill" style="border-color: rgba(251,191,36,.55); background: rgba(251,191,36,.12);"><strong>NEEDS CLEANING</strong></span>' : '<span class="muted">'+escapeHtml(color.title)+'</span>')
            + '</div>'
            + '<div class="roomBody">'
              + '<div class="field"><label>Patient name</label><input data-field="patientName" type="text" value="'+escapeHtml(room.patientName)+'" placeholder="e.g., Bella" /></div>'
              + '<div class="row2"><div class="field"><label>Type</label><select data-field="colorLabelId">'+createColorOptionsHtml(room.colorLabelId)+'</select></div></div>'
              + '<div class="row2">'
                + '<div class="field"><label>Doctor</label><select data-field="doctor">'+createDoctorOptionsHtml(room.doctor)+'</select></div>'
                + '<div class="field"><label>Tech</label><input data-field="tech" type="text" value="'+escapeHtml(room.tech)+'" placeholder="e.g., Alex" /></div>'
              + '</div>'
              + '<div class="field"><label>Quick note</label><select data-field="quickNote">'+createQuickNoteOptionsHtml(room.quickNote)+'</select></div>'
              + '<div class="field"><label>Status notes</label><textarea data-field="notes" placeholder="Quick notes…">'+escapeHtml(room.notes)+'</textarea></div>'
              + '<div class="row2">'
                + '<div class="toggle"><div><div style="font-weight:700;">Room ready</div><div class="muted">Patient ready in room</div></div><div class="switch '+(room.roomReady ? "on" : "")+'" data-action="toggleRoomReady"><div class="knob"></div></div></div>'
                + '<div class="toggle"><div><div style="font-weight:700;">Doctor ready</div><div class="muted">Doctor ready to go in</div></div><div class="switch '+(room.doctorReady ? "on" : "")+'" data-action="toggleDoctorReady"><div class="knob"></div></div></div>'
              + '</div>'
              + '<div class="timerRow">'
                + '<div class="timerBox'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'">'
                  + '<div><div class="muted" data-timer-label data-room-id="'+room.id+'">'+(room.needsCleaning ? 'Cleaning' : 'Time')+'</div><div class="time'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'" data-timerText data-room-id="'+room.id+'">'+formatTime(computeElapsed(timer))+'</div></div>'
                  + '<div class="actions">'
                    + '<button class="btn sm" data-action="resetTimer">Reset</button>'
                    + (room.needsCleaning ? '<button class="btn sm warn" data-action="markClean">Mark clean</button>' : '<button class="btn sm danger" data-action="discharge">'+escapeHtml(getDischargeButtonIcon(false))+' Discharge</button>')
                  + '</div>'
                + '</div>'
              + '</div>'
            + '</div>'
            + (hasRedoDischarge(room) ? '<button class="roomRedoBtn" data-action="redoDischarge" title="Redo discharge">↺</button>' : '')
          )
        );
      return el;
    }

    function canPatchIntakeRooms(roomIds){
      var grid = $("intakeGrid");
      if(!grid || !roomIds || !roomIds.length) return false;
      if(String(grid.dataset.techView || "") !== (state.settings.techViewIntake ? "1" : "0")) return false;
      if(String(grid.dataset.roomCount || "") !== String((state.rooms || []).length)) return false;
      for(var i=0;i<roomIds.length;i++){
        if(!getSurfaceRoomNode("intake", roomIds[i])) return false;
      }
      return true;
    }

    function patchIntakeRooms(roomIds){
      if(!canPatchIntakeRooms(roomIds)) return false;
      var grid = $("intakeGrid");
      for(var i=0;i<roomIds.length;i++){
        var roomId = String(roomIds[i]);
        var existing = getSurfaceRoomNode("intake", roomId);
        var room = findRoomById(roomId);
        if(!existing || !room) return false;
        var replacement = createIntakeRoomElement(room);
        grid.replaceChild(replacement, existing);
        rememberSurfaceRoomNode("intake", roomId, replacement);
      }
      bumpRenderPerf("intakeRoomPatches", roomIds.length);
      return true;
    }

    function renderIntake(skipTimerBindingRefresh){
      var grid = $("intakeGrid");
      if(!grid) return;
      bumpRenderPerf("intakeRenders");
      clearSurfaceRoomNodeMap("intake");
      grid.className = "intakeGrid" + (state.settings.techViewIntake ? " techViewGrid" : "");
      grid.dataset.techView = state.settings.techViewIntake ? "1" : "0";
      grid.dataset.roomCount = String((state.rooms || []).length);
      grid.innerHTML = "";

      for(var i=0;i<state.rooms.length;i++){
        var node = createIntakeRoomElement(state.rooms[i]);
        grid.appendChild(node);
        rememberSurfaceRoomNode("intake", state.rooms[i].id, node);
      }
      if(!skipTimerBindingRefresh) rebuildTimerBindings();
    }

    function requestBoardRoomRefresh(roomIds, options){
      options = options || {};
      var ids = normalizeRoomIdList(roomIds);
      if(!ids.length && !options.displayFull) return;
      scheduleUiRefresh({
        display: options.display !== false,
        displayFull: !!options.displayFull || !ids.length,
        displayRoomIds: ids,
        timerBindings: options.timerBindings !== false
      });
    }

    function getRoomIdsMatching(predicate){
      var ids = [];
      for(var i=0;i<(state && state.rooms ? state.rooms.length : 0);i++){
        if(predicate(state.rooms[i])) ids.push(state.rooms[i].id);
      }
      return ids;
    }

    async function handleIntakeFieldInput(room, field, value){
      if(!room || !field) return;
      if(!room.needsCleaning) room.lastDischargeSnapshot = null;
      var shouldRefreshDisplay = false;

      if(field === "patientName"){
        var hadPatientBefore = roomHasAssignedPatient(room);
        room.patientName = value;
        shouldRefreshDisplay = true;
        if(hadPatientBefore !== roomHasAssignedPatient(room)){
          await syncRoomSessionAfterOccupancyChange(room, hadPatientBefore, {
            autoStartTimer: true,
            stopTimerWhenEmpty: true,
            clearReadyWhenEmpty: true,
            serverNowIso: await getServerNowIso()
          });
        }
      } else if(field === "tech"){
        room.tech = value;
        shouldRefreshDisplay = true;
      } else if(field === "notes"){
        room.notes = value;
        shouldRefreshDisplay = true;
      }

      saveLocal();
      scheduleRemoteSave("board");
      if(shouldRefreshDisplay){
        scheduleUiRefresh({
          display: true,
          displayRoomIds: [room.id],
          timerBindings: field === "patientName"
        });
      }
    }

    async function handleIntakeFieldChange(room, field, value){
      if(!room || !field) return;
      if(!room.needsCleaning) room.lastDischargeSnapshot = null;

      if(field === "reason") room.reason = value;
      if(field === "colorHex") room.colorHex = value;
      if(field === "colorLabelId"){
        room.colorLabelId = value;
        room.colorHex = "";
        var label = getColorById(room.colorLabelId);
        room.reason = label ? label.title : room.reason;
      }
      if(field === "doctor") room.doctor = value;
      if(field === "quickNote") room.quickNote = value;

      await commitBoardNow();
      requestBoardRoomRefresh([room.id], { includeIntake: true });
    }

    async function handleIntakeRoomAction(room, action){
      if(!room || !action) return;
      if(action === "toggleRoomReady"){
        room.roomReady = !room.roomReady;
      } else if(action === "toggleDoctorReady"){
        room.doctorReady = !room.doctorReady;
      } else if(action === "toggleTimer"){
        var serverNowIso = await getServerNowIso();
        if(room.timer.running) applyTimerStopAt(room.timer, serverNowIso, false);
        else {
          applyTimerStartAt(room.timer, serverNowIso);
          logRoomSessionStart(room);
        }
      } else if(action === "resetTimer"){
        var resetIso = await getServerNowIso();
        var resetSnapshot = captureRoomSessionEndSnapshot(room, { endedAtIso: resetIso });
        stopRoomTimer(room, true, resetIso);
        if(roomHasAssignedPatient(room)) restartRoomSessionForCurrentOccupant(room, { endSnapshot: resetSnapshot, endedAtIso: resetIso });
      } else if(action === "discharge"){
        await dischargeRoom(room);
      } else if(action === "markClean"){
        clearRoomCleaning(room, false, await getServerNowIso());
      } else if(action === "redoDischarge"){
        if(!await restoreDischargedRoom(room)) return;
      } else {
        return;
      }

      await commitBoardNow();
      requestBoardRoomRefresh([room.id], { includeIntake: true });
    }

    function bindIntakeActions(){
      var grid = $("intakeGrid");
      if(!grid || grid.__bound) return;
      grid.__bound = true;

      grid.addEventListener("input", async function(e){
        var fieldEl = e.target;
        if(!fieldEl || !fieldEl.getAttribute) return;
        var field = fieldEl.getAttribute("data-field");
        if(!field) return;
        var card = closestRoomCard(fieldEl);
        var room = card ? findRoomById(card.getAttribute("data-room-id") || card.dataset.roomId) : null;
        if(!room) return;
        await handleIntakeFieldInput(room, field, fieldEl.value);
      });

      grid.addEventListener("change", async function(e){
        var fieldEl = e.target;
        if(!fieldEl || !fieldEl.getAttribute) return;
        var field = fieldEl.getAttribute("data-field");
        if(!field) return;
        var card = closestRoomCard(fieldEl);
        var room = card ? findRoomById(card.getAttribute("data-room-id") || card.dataset.roomId) : null;
        if(!room) return;
        await handleIntakeFieldChange(room, field, fieldEl.value);
      });

      grid.addEventListener("click", async function(e){
        var node = e.target;
        while(node && node !== grid && !(node.getAttribute && node.getAttribute("data-action"))) node = node.parentNode;
        if(!node || node === grid) return;
        var card = closestRoomCard(node);
        var room = card ? findRoomById(card.getAttribute("data-room-id") || card.dataset.roomId) : null;
        if(!room) return;
        await handleIntakeRoomAction(room, node.getAttribute("data-action"));
      });

      grid.addEventListener("dragstart", function(e){
        var card = closestRoomCard(e.target);
        if(!card) return;
        setDraggedRoomId(card.getAttribute("data-room-id") || card.dataset.roomId, e.dataTransfer);
      });

      grid.addEventListener("dragend", function(){
        clearDraggedRoomId();
      });

      grid.addEventListener("dragover", function(e){
        var card = closestRoomCard(e.target);
        if(!card) return;
        e.preventDefault();
        try{ e.dataTransfer.dropEffect = "move"; }catch(_){}
      });

      grid.addEventListener("drop", async function(e){
        var toCard = closestRoomCard(e.target);
        if(!toCard) return;
        e.preventDefault();
        var toId = toCard.getAttribute("data-room-id") || toCard.dataset.roomId;
        var fromId = getDraggedRoomId(e.dataTransfer);
        await swapRoomsById(fromId, toId, { immediate: true });
        clearDraggedRoomId();
      });
    }

    function canCaptureDischargeSnapshot(room){
      if(!room) return false;
      return !!(
        room.patientName || room.doctor || room.tech || room.notes || room.quickNote
        || room.roomReady || room.doctorReady || computeElapsed(room.timer) > 0
      );
    }

    function buildDischargeSnapshot(room){
      return {
        patientName: room.patientName || "",
        reason: room.reason || DEFAULT_REASONS[0],
        colorLabelId: room.colorLabelId || getDefaultColorLabelIdFromList(state.colorLabels),
        colorHex: room.colorHex || "",
        doctor: room.doctor || "",
        tech: room.tech || "",
        notes: room.notes || "",
        quickNote: room.quickNote || "",
        roomReady: !!room.roomReady,
        doctorReady: !!room.doctorReady,
        timer: serializeTimerForRoomState(room.timer)
      };
    }

    function hasRedoDischarge(room){
      return !!(room && room.needsCleaning && room.lastDischargeSnapshot);
    }

    function clearRoomCleaning(room, preserveRedo, stoppedAtIso){
      var cleaningEndSnapshot = captureCleaningSessionEndSnapshot(room, { endedAtIso: stoppedAtIso });
      logCleaningSessionEnd(room, cleaningEndSnapshot);
      room.needsCleaning = false;
      room.cleaningTimer = room.cleaningTimer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null };
      applyTimerStopAt(room.cleaningTimer, stoppedAtIso || isoNow(), true);
      room.activeCleaningSessionId = null;
      normalizeRoomTimerModes(room);
      if(!preserveRedo) room.lastDischargeSnapshot = null;
    }

    function restoreDischargedRoom(room, serverNowIso){
      if(!room || !room.lastDischargeSnapshot) return false;
      var snapshot = JSON.parse(JSON.stringify(room.lastDischargeSnapshot));
      serverNowIso = normalizeServerNowIso(serverNowIso) || getEstimatedServerNowIso();
      if(room.needsCleaning) clearRoomCleaning(room, true, serverNowIso);
      var restoredColor = getColorById(snapshot.colorLabelId);
      room.patientName = snapshot.patientName || "";
      room.reason = snapshot.reason || (restoredColor ? restoredColor.title : DEFAULT_REASONS[0]);
      room.colorLabelId = restoredColor ? restoredColor.id : getDefaultColorLabelIdFromList(state.colorLabels);
      room.colorHex = snapshot.colorHex || "";
      room.doctor = snapshot.doctor || "";
      room.tech = snapshot.tech || "";
      room.notes = snapshot.notes || "";
      room.quickNote = snapshot.quickNote || "";
      room.roomReady = !!snapshot.roomReady;
      room.doctorReady = !!snapshot.doctorReady;
      room.timer = hydrateTimerFromRoomState(snapshot.timer);
      room.cleaningTimer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null };
      room.needsCleaning = false;
      room.activeCleaningSessionId = null;
      room.activeRoomSessionId = null;
      room.lastDischargeSnapshot = null;
      normalizeRoomTimerModes(room);
      if(room.patientName && room.patientName.replace(/\s/g,"").length > 0){
        logRoomSessionStart(room);
      }
      return true;
    }

    function dischargeRoom(room, serverNowIso){
      serverNowIso = normalizeServerNowIso(serverNowIso) || getEstimatedServerNowIso();
      if(room.needsCleaning){
        clearRoomCleaning(room, true, serverNowIso);
      }
      var roomEndSnapshot = captureRoomSessionEndSnapshot(room, {
        endedAtIso: serverNowIso,
        doctorName: room.doctor || null
      });
      room.lastDischargeSnapshot = canCaptureDischargeSnapshot(room) ? buildDischargeSnapshot(room) : null;
      // End room session (if any) before clearing
      logRoomSessionEnd(room, roomEndSnapshot);
      // Clear everything and flag cleaning
      room.patientName = "";
      var defaultColorId = getConfiguredDefaultColorLabelId(state.colorLabels, state.settings.defaultColorLabelId);
      var defaultColor = getColorById(defaultColorId);
      room.reason = defaultColor ? defaultColor.title : DEFAULT_REASONS[0];
      room.colorLabelId = defaultColorId;
      room.colorHex = "";
      room.doctor = "";
      room.tech = "";
      room.notes = "";
      room.quickNote = "";
      room.roomReady = false;
      room.doctorReady = false;
      room.timer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null };
      room.needsCleaning = true;
      room.cleaningTimer = { elapsedMs: 0, running: true, startedAt: null, startedAtIso: serverNowIso };
      room.activeCleaningSessionId = null;
      normalizeRoomTimerModes(room);

      logCleaningSessionStart(room);
}

    function renderIntakeNav(){
          var sel = $("intakeJumpSelect");
          var btn = $("intakeJumpBtn");
          var bar = $("intakeNavBar");
          if(!sel || !btn || !bar) return;
    
          // Populate dropdown
          sel.innerHTML = "";
          for(var i=0;i<state.rooms.length;i++){
            var r = state.rooms[i];
            var opt = document.createElement("option");
            opt.value = r.id;
            opt.textContent = r.name;
            sel.appendChild(opt);
          }
    
          // Attach handlers once
          if(!sel.__wired){
            sel.__wired = true;
            btn.addEventListener("click", function(){
              jumpToSelectedRoom();
            });
            sel.addEventListener("keydown", function(e){
              if(e.key === "Enter"){ e.preventDefault(); jumpToSelectedRoom(); }
            });
          }
    
          function jumpToSelectedRoom(){
            // Ensure Intake tab is visible
            setTab("intake");
            // Scroll to the room card
            var roomId = sel.value;
            var card = document.querySelector('#intakeGrid [data-room-id="'+ roomId +'"]');
            if(card && card.scrollIntoView){
              card.scrollIntoView({behavior:"smooth", block:"start"});
              // brief highlight
              card.classList.add("flash");
              setTimeout(function(){ card.classList.remove("flash"); }, 900);
            }
          }
        }


    function renderSettingsLists(){
      bumpRenderPerf("settingsRenders");
      if($("displayFontColor")) $("displayFontColor").value = state.settings.displayFontColor || "#e8eefc";
      if($("displayMutedColor")) $("displayMutedColor").value = state.settings.displayMutedColor || "#a9b6d3";
      if($("cardTextMode")) $("cardTextMode").value = state.settings.cardTextMode || "auto";
      var settingsHealthSummary = $("settingsHealthSummary");
      var settingsHealthList = $("settingsHealthList");
      if(settingsHealthSummary && settingsHealthList){
        var healthIssues = collectSettingsValidationIssues(state);
        var hasBlockingIssues = false;
        var hasWarnings = false;
        for(var hi=0;hi<healthIssues.length;hi++){
          if(healthIssues[hi].blocking) hasBlockingIssues = true;
          else hasWarnings = true;
        }
        settingsHealthList.className = "settingsHealthList " + (hasBlockingIssues ? "isError" : (hasWarnings ? "isWarn" : "isOk"));
        if(!healthIssues.length){
          settingsHealthSummary.textContent = "RoomBoard checks your settings before it saves them, kind of like a spell-check for setup changes.";
          settingsHealthList.innerHTML = "<li>Everything looks good right now.</li><li>When you change something, RoomBoard saves the safe stuff automatically.</li>";
        } else {
          settingsHealthSummary.textContent = hasBlockingIssues
            ? "RoomBoard found something that could scramble shared settings, so it will wait until you fix it."
            : "RoomBoard found a few smaller things and cleaned up the safe parts for you.";
          settingsHealthList.innerHTML = healthIssues.map(function(issue){
            return "<li>" + escapeHtml(issue.text) + "</li>";
          }).join("");
        }
      }
// Rooms list
      var roomsList = $("roomsList");
      roomsList.innerHTML = "";
      var draggedRoomId = null;

      function moveRoomBefore(dragId, targetId){
        if(!dragId || !targetId || dragId === targetId) return false;
        var fromIndex = -1;
        var toIndex = -1;
        for(var idx=0; idx<state.rooms.length; idx++){
          if(state.rooms[idx].id === dragId) fromIndex = idx;
          if(state.rooms[idx].id === targetId) toIndex = idx;
        }
        if(fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return false;
        var moved = state.rooms.splice(fromIndex, 1)[0];
        if(fromIndex < toIndex) toIndex -= 1;
        state.rooms.splice(toIndex, 0, moved);
        return true;
      }

      function clearRoomDropTargets(){
        var targets = roomsList.querySelectorAll(".isDropTarget");
        for(var ct=0; ct<targets.length; ct++) targets[ct].classList.remove("isDropTarget");
      }

      for(var i=0;i<state.rooms.length;i++){
        (function(room){
          var row = document.createElement("div");
          row.className = "listRow";
          row.setAttribute("data-room-id", room.id);
          row.innerHTML =
            '<div class="dragHandle" draggable="true" title="Drag to reorder">⋮⋮</div>'
            + '<input type="text" value="'+escapeHtml(room.name)+'" />'
            + '<button class="trash" title="Delete">✕</button>';

          var handle = row.querySelector(".dragHandle");
          var input = row.querySelector("input");
          if(handle){
            handle.addEventListener("dragstart", function(e){
              draggedRoomId = room.id;
              row.classList.add("isDragging");
              try{
                e.dataTransfer.setData("text/plain", room.id);
                e.dataTransfer.effectAllowed = "move";
              }catch(_){}
            });
            handle.addEventListener("dragend", function(){
              draggedRoomId = null;
              row.classList.remove("isDragging");
              clearRoomDropTargets();
            });
          }

          row.addEventListener("dragover", function(e){
            if(!draggedRoomId || draggedRoomId === room.id) return;
            e.preventDefault();
            clearRoomDropTargets();
            row.classList.add("isDropTarget");
            try{ e.dataTransfer.dropEffect = "move"; }catch(_){}
          });

          row.addEventListener("dragleave", function(e){
            var next = e.relatedTarget;
            if(next && row.contains(next)) return;
            row.classList.remove("isDropTarget");
          });

          row.addEventListener("drop", function(e){
            if(!draggedRoomId || draggedRoomId === room.id) return;
            e.preventDefault();
            row.classList.remove("isDropTarget");
            var moved = moveRoomBefore(draggedRoomId, room.id);
            draggedRoomId = null;
            clearRoomDropTargets();
            if(!moved) return;
            queueSettingsConfigSave({ immediate: true });
            scheduleUiRefresh({
              display: true,
              displayFull: true,
              intake: true,
              intakeFull: true,
              settingsLists: true,
              timerBindings: true
            });
          });

          input.addEventListener("input", function(){
            room.name = input.value;
            queueSettingsConfigSave();
            requestBoardRoomRefresh([room.id], { includeIntake: true });
          });

          row.querySelector("button").addEventListener("click", function(){
            var btn = this;
            runLockedAction("settings.delete-room." + room.id, function(){
              if(state.rooms.length <= 1) return false;
              var next = [];
              for(var j=0;j<state.rooms.length;j++){
                if(state.rooms[j].id !== room.id) next.push(state.rooms[j]);
              }
              state.rooms = next;
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
            }, { el: btn, busyLabel: "", cooldownMs: 250 });
          });

          roomsList.appendChild(row);
        })(state.rooms[i]);
      }

      // Doctors list
      var doctorsList = $("doctorsList");
      doctorsList.innerHTML = "";
      for(var d=0; d<state.doctors.length; d++){
        (function(idx){
          var name = state.doctors[idx];
          var originalName = String(name == null ? "" : name);
          var row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML =
            '<input type="text" value="'+escapeHtml(name)+'" />'
            + '<div class="muted" style="text-align:right;">&nbsp;</div>'
            + '<button class="trash" title="Delete">✕</button>';

          var input = row.querySelector("input");
          input.addEventListener("input", function(){
            state.doctors[idx] = input.value;
            holdRemoteUpdates(TEXT_INPUT_HOLD_MS);
          });
          input.addEventListener("blur", function(){
            var nextName = String(input.value || "").trim();
            var previousName = originalName;
            var affectedRoomIds = [];
            state.doctors[idx] = nextName;
            if(previousName !== nextName){
              if(previousName && state.settings && state.settings.doctorInitials && Object.prototype.hasOwnProperty.call(state.settings.doctorInitials, previousName)){
                var previousInitials = state.settings.doctorInitials[previousName];
                delete state.settings.doctorInitials[previousName];
                if(nextName) state.settings.doctorInitials[nextName] = previousInitials;
              }
              for(var r=0; r<state.rooms.length; r++){
                if(state.rooms[r].doctor === previousName){
                  state.rooms[r].doctor = nextName;
                  affectedRoomIds.push(state.rooms[r].id);
                }
              }
            }
            queueSettingsConfigSave({ immediate: true });
            scheduleUiRefresh({
              display: affectedRoomIds.length > 0,
              displayRoomIds: affectedRoomIds,
              intake: affectedRoomIds.length > 0,
              intakeRoomIds: affectedRoomIds,
              settingsLists: true,
              displayChrome: true,
              timerBindings: affectedRoomIds.length > 0
            });
          });

          row.querySelector("button").addEventListener("click", function(){
            var btn = this;
            runLockedAction("settings.delete-doctor." + idx + "." + String(name || ""), function(){
              if(state.doctors.length <= 1) return false;
              var removed = state.doctors[idx];
              var affectedRoomIds = [];
              state.doctors.splice(idx, 1);
              for(var r=0;r<state.rooms.length;r++){
                if(state.rooms[r].doctor === removed){
                  state.rooms[r].doctor = "";
                  affectedRoomIds.push(state.rooms[r].id);
                }
              }
              queueSettingsConfigSave({ immediate: true });
              scheduleUiRefresh({
                display: affectedRoomIds.length > 0,
                displayRoomIds: affectedRoomIds,
                intake: affectedRoomIds.length > 0,
                intakeRoomIds: affectedRoomIds,
                settingsLists: true,
                displayChrome: true,
                timerBindings: affectedRoomIds.length > 0
              });
              return true;
            }, { el: btn, busyLabel: "", cooldownMs: 250 });
          });

          doctorsList.appendChild(row);
        })(d);
      }

      
      // Doctor initials list
      var diWrap = $("doctorInitialsList");
      if(diWrap){
        diWrap.innerHTML = "";
        if(!state.settings.doctorInitials) state.settings.doctorInitials = {};
        for(var d2=0; d2<state.doctors.length; d2++){
          (function(docName){
            var row = document.createElement("div");
            row.className = "listRow";
            var cur = state.settings.doctorInitials[docName] || "";
            row.innerHTML =
              '<div style="display:flex; flex-direction:column; gap:4px;">'
              +   '<div style="font-weight:600;">'+escapeHtml(docName || "(none)")+'</div>'
              +   '<div class="muted" style="font-size:12px;">Initials</div>'
              + '</div>'
              + '<input type="text" value="'+escapeHtml(cur)+'" placeholder="e.g., JS" style="max-width:120px;" />'
              + '<button class="trash" title="Clear">✕</button>';

            var input = row.querySelector("input");
            input.addEventListener("input", function(){
              state.settings.doctorInitials[docName] = input.value;
              holdRemoteUpdates(TEXT_INPUT_HOLD_MS);
            });
            input.addEventListener("blur", function(){
              state.settings.doctorInitials[docName] = input.value;
              persistAccountUiSettings();
              var affectedRoomIds = getRoomIdsMatching(function(room){
                return room && room.doctor === docName;
              });
              scheduleUiRefresh({
                display: affectedRoomIds.length > 0,
                displayRoomIds: affectedRoomIds,
                intake: affectedRoomIds.length > 0,
                intakeRoomIds: affectedRoomIds,
                displayChrome: true,
                timerBindings: affectedRoomIds.length > 0
              });
            });

            row.querySelector("button").addEventListener("click", function(){
              var btn = this;
              runLockedAction("settings.clear-doctor-initials." + String(docName || ""), function(){
                state.settings.doctorInitials[docName] = "";
                persistAccountUiSettings();
                var affectedRoomIds = getRoomIdsMatching(function(room){
                  return room && room.doctor === docName;
                });
                scheduleUiRefresh({
                  display: affectedRoomIds.length > 0,
                  displayRoomIds: affectedRoomIds,
                  intake: affectedRoomIds.length > 0,
                  intakeRoomIds: affectedRoomIds,
                  settingsLists: true,
                  displayChrome: true,
                  timerBindings: affectedRoomIds.length > 0
                });
                return true;
              }, { el: btn, busyLabel: "", cooldownMs: 200 });
            });

            diWrap.appendChild(row);
          })(state.doctors[d2]);
        }
      }

      var sortedColorLabels = getSortedColorLabels(state.colorLabels);
      var defaultColorSelect = $("defaultColorLabelSelect");
      if(defaultColorSelect){
        defaultColorSelect.innerHTML = "";
        var selectedDefaultColorId = getConfiguredDefaultColorLabelId(state.colorLabels, state.settings.defaultColorLabelId);
        for(var dc=0;dc<sortedColorLabels.length;dc++){
          var opt = document.createElement("option");
          opt.value = sortedColorLabels[dc].id;
          opt.textContent = sortedColorLabels[dc].title;
          opt.selected = (sortedColorLabels[dc].id === selectedDefaultColorId);
          defaultColorSelect.appendChild(opt);
        }
      }

// Colors list
      var colorsList = $("colorsList");
      colorsList.innerHTML = "";
      for(var c=0;c<sortedColorLabels.length;c++){
        (function(color){
          var row = document.createElement("div");
          row.className = "listRow";
          row.innerHTML =
            '<input type="text" value="'+escapeHtml(color.title)+'" />'
            + '<input type="color" value="'+escapeHtml(color.color)+'" style="height:36px; width:90px; border-radius:0px; border:1px solid var(--border); background:transparent; padding:4px;" />'
            + '<button class="trash" title="Delete">✕</button>';

          var titleInput = row.querySelectorAll("input")[0];
          var colorInput = row.querySelectorAll("input")[1];

          function commitColorLabelChanges(){
            color.title = normalizeColorLabelTitle(titleInput.value, color.title);
            titleInput.value = color.title;
            color.color = colorInput.value || color.color || "#6ea8fe";
            syncRoomReasonsToColorLabel(color.id);
            var affectedRoomIds = getRoomIdsMatching(function(room){
              return room && room.colorLabelId === color.id;
            });
            queueAppointmentTypesSave({ immediate: true });
            scheduleUiRefresh({
              display: affectedRoomIds.length > 0,
              displayRoomIds: affectedRoomIds,
              intake: affectedRoomIds.length > 0,
              intakeRoomIds: affectedRoomIds,
              settingsLists: true,
              timerBindings: affectedRoomIds.length > 0
            });
          }

          titleInput.addEventListener("input", function(){
            color.title = titleInput.value;
            syncRoomReasonsToColorLabel(color.id);
            saveLocal();
            requestBoardRoomRefresh(getRoomIdsMatching(function(room){
              return room && room.colorLabelId === color.id;
            }), { includeIntake: true });
          });
          titleInput.addEventListener("change", commitColorLabelChanges);
          titleInput.addEventListener("blur", function(){
            var normalized = normalizeColorLabelTitle(titleInput.value, color.title);
            if(titleInput.value !== normalized) commitColorLabelChanges();
          });
          colorInput.addEventListener("input", function(){
            color.color = colorInput.value || color.color || "#6ea8fe";
            saveLocal();
            requestBoardRoomRefresh(getRoomIdsMatching(function(room){
              return room && room.colorLabelId === color.id;
            }), { includeIntake: true });
          });
          colorInput.addEventListener("change", function(){
            color.color = colorInput.value || color.color || "#6ea8fe";
            queueAppointmentTypesSave({ immediate: true });
            requestBoardRoomRefresh(getRoomIdsMatching(function(room){
              return room && room.colorLabelId === color.id;
            }), { includeIntake: true });
          });

          row.querySelector("button").addEventListener("click", function(){
            var btn = this;
            runLockedAction("settings.delete-label." + color.id, function(){
              if(state.colorLabels.length <= 1) return false;
              var delId = color.id;
              var next = [];
              for(var j=0;j<state.colorLabels.length;j++){
                if(state.colorLabels[j].id !== delId) next.push(state.colorLabels[j]);
              }
              state.colorLabels = next;
              var fallbackId = getConfiguredDefaultColorLabelId(state.colorLabels, state.settings.defaultColorLabelId);
              if(state.settings.defaultColorLabelId === delId) state.settings.defaultColorLabelId = fallbackId;
              var fallbackColor = getColorById(fallbackId);
              for(var r=0;r<state.rooms.length;r++){
                if(state.rooms[r].colorLabelId === delId){
                  state.rooms[r].colorLabelId = fallbackId;
                  state.rooms[r].reason = fallbackColor ? fallbackColor.title : state.rooms[r].reason;
                }
              }
              queueAppointmentTypesSave({ immediate: true });
              scheduleUiRefresh({
                display: true,
                displayFull: true,
                intake: true,
                intakeFull: true,
                settingsLists: true,
                timerBindings: true
              });
              return true;
            }, { el: btn, busyLabel: "", cooldownMs: 250 });
          });

          colorsList.appendChild(row);
        })(sortedColorLabels[c]);
      }

      // Layout inputs
	      $("displayCols").value = state.settings.displayCols;
	      $("displayRows").value = state.settings.displayRows;
		      if($("displayCardScale")) $("displayCardScale").value = String(state.settings.displayCardScale || 1);
		      if($("displayCardScaleValue")) $("displayCardScaleValue").value = String(state.settings.displayCardScale || 1);
		      if($("stopwatchStyle")) $("stopwatchStyle").value = state.settings.stopwatchStyle || "classic";
	      if($("dischargeIconStyle")) $("dischargeIconStyle").value = state.settings.dischargeIconStyle || "paw";
		      syncOptionalUi();

	      // Font inputs
      $("fontBase").value = state.settings.fontBase;
      $("fontCard").value = state.settings.fontCard;
      $("fontTimer").value = state.settings.fontTimer;
      if($("fontInput")) $("fontInput").value = state.settings.fontInput || 14;
      if($("fontDisplay")) $("fontDisplay").value = state.settings.fontDisplay || 14;
      if($("timerAlert1AtSec")) $("timerAlert1AtSec").value = state.settings.timerAlert1AtSec || 0;
      if($("timerAlert2AtSec")) $("timerAlert2AtSec").value = state.settings.timerAlert2AtSec || 0;
      if($("timerAlert1Color")) $("timerAlert1Color").value = state.settings.timerAlert1Color || "#fbbf24";
      if($("timerAlert2Color")) $("timerAlert2Color").value = state.settings.timerAlert2Color || "#fb7185";
    }

    function applyGlobalChrome(){
      bumpRenderPerf("globalChromeApplies");
      applyLayout();
      applyFonts();
      applyStopwatchStyle();
      applyTimerAlertSettings();
      applyBackground();
      applyDisplayColors();
      updateViewportFit();
    }

    function syncDisplayChrome(){
      bumpRenderPerf("displayChromeSyncs");
      renderDoctorHighlightSelect();
      syncDisplayToolbarControls();
    }

    function renderAll(){
      bumpRenderPerf("fullRenders");
      applyGlobalChrome();
      syncDisplayChrome();
      renderDisplay(false);
      bindDisplayActions();
    }

	    function refreshUiFromState(options){
	      options = options || {};
	      scheduleUiRefresh({
	        fullApp: true,
	        applyTheme: !!options.applyTheme,
	        settingsLists: !!options.renderSettingsLists
	      });
	    }

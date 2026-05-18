    // ===== Rendering =====
      function isRoomCardFieldVisible(field){
        var settings = state && state.settings ? state.settings : {};
        var key = "showRoomCard" + field;
        if(settings[key] != null) return settings[key] !== false;
        if((field === "DoctorName" || field === "DoctorBadge") && settings.showRoomCardDoctor != null){
          return settings.showRoomCardDoctor !== false;
        }
        return true;
      }

	    function buildRoomNotesDockHtml(room){
	        var notes = isRoomCardFieldVisible("StatusNotes") ? String(room.notes || "") : "";
		      if(room.needsCleaning || !notes) return "";
	      return '<details class="roomNotesDock">'
	        + '<summary class="roomNotesBtn" title="View status notes">📝</summary>'
	        + '<div class="roomNotesPanel">'
	          + (notes ? '<div class="roomNotesItem"><div class="roomNotesLabel">Notes</div><div class="roomNotesValue">' + escapeHtmlWithLineBreaks(notes) + '</div></div>' : '')
	        + '</div>'
		      + '</details>';
		    }

	    function buildDoctorBadgeMarkup(doctorName, initials){
	      if(!initials) return '<span class="docInitBadge isEmpty"></span>';
	      var badgeStyle = typeof getDoctorBadgeStyle === "function" ? getDoctorBadgeStyle(doctorName) : null;
	      var styleParts = [];
	      var shape = badgeStyle && badgeStyle.shape ? badgeStyle.shape : "square";
	      if(badgeStyle && badgeStyle.color){
	        styleParts.push("--doctorBadgeBg:" + badgeStyle.color);
	        styleParts.push("--doctorBadgeBorder:" + (typeof rgbaFromHex === "function" ? (rgbaFromHex(badgeStyle.color, 0.94) || badgeStyle.color) : badgeStyle.color));
	      }
	      if(badgeStyle && badgeStyle.textColor){
	        styleParts.push("--doctorBadgeText:" + badgeStyle.textColor);
	      }
	      return '<span class="docInitBadge" data-shape="' + escapeHtml(shape) + '"' + (styleParts.length ? ' style="' + escapeHtml(styleParts.join(";")) + '"' : '') + '>' + escapeHtml(initials) + '</span>';
	    }

    function buildDoctorShapeBadgeMarkup(doctorName){
      var badgeStyle = typeof getDoctorBadgeStyle === "function" ? getDoctorBadgeStyle(doctorName) : null;
      var styleParts = [];
      var shape = badgeStyle && badgeStyle.shape ? badgeStyle.shape : "square";
      if(badgeStyle && badgeStyle.color){
        styleParts.push("--doctorBadgeBg:" + badgeStyle.color);
        styleParts.push("--doctorBadgeBorder:" + (typeof rgbaFromHex === "function" ? (rgbaFromHex(badgeStyle.color, 0.94) || badgeStyle.color) : badgeStyle.color));
      }
      if(badgeStyle && badgeStyle.textColor){
        styleParts.push("--doctorBadgeText:" + badgeStyle.textColor);
      }
      return '<span aria-hidden="true" class="docInitBadge docInitShapeOnly" data-shape="' + escapeHtml(shape) + '"' + (styleParts.length ? ' style="' + escapeHtml(styleParts.join(";")) + '"' : '') + '></span>';
    }

    var mobileQuickViewDetailRoomId = "";
    var mobileDisplayExpandedRoomId = "";
    var mobileTouchGestureState = {
      pointerId: null,
      captureEl: null,
      sourceId: "",
      sourceEl: null,
      targetId: "",
      targetEl: null,
      startX: 0,
      startY: 0,
      moved: false,
      dragging: false,
      holdTimer: 0,
      lastTapAt: 0,
      lastTapRoomId: ""
    };
    var mobileSuppressClickUntilMs = 0;
    var activeDisplayFitFrame = 0;

    function isMobileTouchGestureViewport(){
      return !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
    }

    function getMobileTouchGestureRoomCard(node){
      if(!node || !node.closest) return null;
      return node.closest(".mobileQuickViewItem[data-room-id], .mobileQuickViewEmptyTile[data-room-id]");
    }

    function clearMobileTouchHoldTimer(){
      if(!mobileTouchGestureState.holdTimer) return;
      clearTimeout(mobileTouchGestureState.holdTimer);
      mobileTouchGestureState.holdTimer = 0;
    }

    function setMobileTouchDragTarget(nextTarget){
      var stateRef = mobileTouchGestureState;
      if(stateRef.targetEl && stateRef.targetEl !== stateRef.sourceEl){
        stateRef.targetEl.classList.remove("is-mobile-drag-target");
      }
      stateRef.targetEl = nextTarget || null;
      stateRef.targetId = nextTarget ? String(nextTarget.getAttribute("data-room-id") || nextTarget.dataset.roomId || "") : "";
      if(stateRef.targetEl && stateRef.targetEl !== stateRef.sourceEl){
        stateRef.targetEl.classList.add("is-mobile-drag-target");
      }
    }

    function resetMobileTouchGestureState(){
      clearMobileTouchHoldTimer();
      var captureEl = mobileTouchGestureState.captureEl;
      var pointerId = mobileTouchGestureState.pointerId;
      if(captureEl && pointerId != null && captureEl.releasePointerCapture){
        try {
          captureEl.releasePointerCapture(pointerId);
        } catch(_err){}
      }
      if(mobileTouchGestureState.sourceEl){
        mobileTouchGestureState.sourceEl.classList.remove("is-mobile-drag-source");
      }
      setMobileTouchDragTarget(null);
      mobileTouchGestureState.pointerId = null;
      mobileTouchGestureState.captureEl = null;
      mobileTouchGestureState.sourceId = "";
      mobileTouchGestureState.sourceEl = null;
      mobileTouchGestureState.startX = 0;
      mobileTouchGestureState.startY = 0;
      mobileTouchGestureState.moved = false;
      mobileTouchGestureState.dragging = false;
    }

    function beginMobileTouchDrag(){
      if(!mobileTouchGestureState.sourceEl || !mobileTouchGestureState.sourceId) return;
      mobileTouchGestureState.dragging = true;
      mobileTouchGestureState.sourceEl.classList.add("is-mobile-drag-source");
      setDraggedRoomId(mobileTouchGestureState.sourceId, null);
    }

    function updateMobileTouchDragTargetFromPoint(clientX, clientY){
      var pointNode = document.elementFromPoint(clientX, clientY);
      var targetCard = getMobileTouchGestureRoomCard(pointNode);
      if(targetCard === mobileTouchGestureState.sourceEl) targetCard = null;
      setMobileTouchDragTarget(targetCard);
    }

    function getDisplayRenderMode(){
      if(typeof isMobileQuickViewEnabled === "function" && isMobileQuickViewEnabled()) return "quick";
      if(!state || !state.settings) return "grid";
      if(
        typeof isMobileQuickViewViewport === "function"
        && isMobileQuickViewViewport()
        && state.settings.displayLayout !== "list"
      ) return "mobilecards";
      return (state.settings.displayLayout === "list") ? "list" : "grid";
    }

    function buildMobileQuickViewMeta(room, color){
      var parts = [];
      if(room.needsCleaning) parts.push("Needs cleaning");
	      else if(isRoomCardFieldVisible("Type") && color && color.title) parts.push(color.title);
	      if(isRoomCardFieldVisible("DoctorName") && room.doctor) parts.push(room.doctor);
	      if(isRoomCardFieldVisible("Tech") && room.tech) parts.push(room.tech);
	      if(isRoomCardFieldVisible("QuickNote")){
	        var quickNotes = getRoomQuickNotes(room);
	        for(var i=0;i<quickNotes.length;i++) parts.push(quickNotes[i]);
	      }
	      return parts.join(" ・ ");
	    }

	    function buildMobileQuickViewPopupNotesMarkup(room){
	      var hasNotes = isRoomCardFieldVisible("StatusNotes") && !!String(room && room.notes || "").trim();
	      if(!hasNotes){
	        return "";
	      }
	      return ''
	        + (hasNotes ? '<div class="mobileQuickViewPopupNotesItem"><div class="mobileQuickViewPopupNotesLabel">Notes</div><div class="mobileQuickViewPopupNotesValue">' + escapeHtmlWithLineBreaks(room.notes) + '</div></div>' : '');
	    }

	    function buildMobileDisplayExpandedMarkup(room, color){
	      var noteMarkup = isRoomCardFieldVisible("StatusNotes") ? buildMobileQuickViewPopupNotesMarkup(room) : "";
	      var detailFields = "";
	      var expandedQuickNotes = isRoomCardFieldVisible("QuickNote") ? getRoomQuickNotes(room) : [];
	      if(isRoomCardFieldVisible("Type")){
	        detailFields += '<div class="mobileDisplayExpandField"><span class="mobileDisplayExpandLabel">Type</span><span class="mobileDisplayExpandValue">' + escapeHtml((color && color.title) || room.reason || "Unavailable") + '</span></div>';
	      }
      if(isRoomCardFieldVisible("DoctorName")){
        detailFields += '<div class="mobileDisplayExpandField"><span class="mobileDisplayExpandLabel">Doctor</span><span class="mobileDisplayExpandValue">' + escapeHtml(room.doctor || "Unassigned") + '</span></div>';
      }
	      if(isRoomCardFieldVisible("Tech")){
	        detailFields += '<div class="mobileDisplayExpandField"><span class="mobileDisplayExpandLabel">Tech</span><span class="mobileDisplayExpandValue">' + escapeHtml(room.tech || "Unassigned") + '</span></div>';
	      }
	      if(expandedQuickNotes.length){
	        detailFields += '<div class="mobileDisplayExpandField"><span class="mobileDisplayExpandLabel">Quick notes</span><span class="mobileDisplayExpandValue">' + escapeHtml(expandedQuickNotes.join(" ・ ")) + '</span></div>';
	      }
	      detailFields += '<div class="mobileDisplayExpandField"><span class="mobileDisplayExpandLabel">Status</span><span class="mobileDisplayExpandValue">' + escapeHtml(room.needsCleaning ? "Needs cleaning" : "In room") + '</span></div>';
      return ''
        + '<section class="mobileDisplayExpandCard">'
        +   '<div class="mobileDisplayExpandActions">'
        +     '<button class="btn sm mobileDisplayExpandActionBtn" data-action="displayDischarge" data-room-id="' + escapeHtml(room.id) + '" type="button">' + escapeHtml(getDischargeButtonIcon(room.needsCleaning)) + ' ' + escapeHtml(room.needsCleaning ? "Mark clean" : "Discharge") + '</button>'
        +     (hasRedoDischarge(room) ? '<button class="mobileDisplayExpandRedoBtn" data-action="displayRedo" data-room-id="' + escapeHtml(room.id) + '" type="button" title="Redo discharge">↺</button>' : '')
        +   '</div>'
        +   '<div class="mobileDisplayExpandGrid">' + detailFields + '</div>'
        +   (noteMarkup ? '<div class="mobileDisplayExpandNotes">'
        +     '<div class="mobileDisplayExpandLabel">Notes</div>'
        +     '<div class="mobileDisplayExpandNotesBody">' + noteMarkup + '</div>'
        +   '</div>' : '')
        + '</section>';
    }

    function renderMobileQuickViewPopup(){
      var backdrop = $("mobileQuickViewPopupBackdrop");
      var popup = $("mobileQuickViewPopup");
      if(!backdrop || !popup) return;

      var quickModeEnabled = !!(
        typeof isMobileQuickViewEnabled === "function"
        && isMobileQuickViewEnabled()
        && window.matchMedia
        && window.matchMedia("(max-width: 820px)").matches
      );
      var room = mobileQuickViewDetailRoomId ? findRoomById(mobileQuickViewDetailRoomId) : null;
      if(!quickModeEnabled || !room){
        mobileQuickViewDetailRoomId = "";
        backdrop.hidden = true;
        popup.hidden = true;
        backdrop.setAttribute("aria-hidden", "true");
        popup.setAttribute("aria-hidden", "true");
        popup.innerHTML = "";
        document.body.classList.remove("mobileQuickViewPopupOpen");
        return;
      }

      var color = getColorById(room.colorLabelId);
      var timer = room.needsCleaning ? room.cleaningTimer : room.timer;
      var timerClass = room.needsCleaning ? " timerCleaning" : ((timer && timer.running && !room.needsCleaning) ? " timerRunning" : "");
      var popupPatientMarkup = (isRoomCardFieldVisible("Patient") || room.needsCleaning)
        ? '<div class="mobileQuickViewPopupPatient">' + escapeHtml(room.patientName || (room.needsCleaning ? "Cleaning" : "No patient")) + '</div>'
        : '';
      var popupFields = "";
      if(isRoomCardFieldVisible("Type")){
        popupFields += '<div class="mobileQuickViewPopupField"><span class="mobileQuickViewPopupLabel">Type</span><span class="mobileQuickViewPopupValue">' + escapeHtml((color && color.title) || room.reason || "Unavailable") + '</span></div>';
      }
      if(isRoomCardFieldVisible("DoctorName")){
        popupFields += '<div class="mobileQuickViewPopupField"><span class="mobileQuickViewPopupLabel">Doctor</span><span class="mobileQuickViewPopupValue">' + escapeHtml(room.doctor || "Unassigned") + '</span></div>';
      }
      if(isRoomCardFieldVisible("Tech")){
        popupFields += '<div class="mobileQuickViewPopupField"><span class="mobileQuickViewPopupLabel">Tech</span><span class="mobileQuickViewPopupValue">' + escapeHtml(room.tech || "Unassigned") + '</span></div>';
      }
      popupFields += '<div class="mobileQuickViewPopupField"><span class="mobileQuickViewPopupLabel">Status</span><span class="mobileQuickViewPopupValue">' + escapeHtml(room.needsCleaning ? "Needs cleaning" : "In room") + '</span></div>';
	      var popupQuickNotes = isRoomCardFieldVisible("QuickNote") ? getRoomQuickNotes(room) : [];
	      if(popupQuickNotes.length){
	        popupFields += '<div class="mobileQuickViewPopupField"><span class="mobileQuickViewPopupLabel">Quick notes</span><span class="mobileQuickViewPopupValue">' + escapeHtml(popupQuickNotes.join(" ・ ")) + '</span></div>';
	      }
	      var popupNotesMarkup = isRoomCardFieldVisible("StatusNotes") ? buildMobileQuickViewPopupNotesMarkup(room) : "";
      popup.innerHTML = ''
        + '<div class="mobileQuickViewPopupCard" data-room-id="' + escapeHtml(room.id) + '">'
        +   '<div class="mobileQuickViewPopupHeader">'
        +     '<div class="mobileQuickViewPopupHeaderText">'
        +       '<div class="mobileQuickViewPopupRoom">' + escapeHtml(room.name || "Room") + '</div>'
        +       popupPatientMarkup
        +     '</div>'
        +     '<div class="mobileQuickViewPopupHeaderActions">'
        +       '<div class="mobileQuickViewPopupTimer' + timerClass + '" data-timerText data-room-id="' + escapeHtml(room.id) + '">' + formatTime(computeElapsed(timer)) + '</div>'
        +       '<button class="mobileQuickViewPopupClose" data-mobile-quick-popup-action="close" type="button" aria-label="Close details">×</button>'
        +     '</div>'
        +   '</div>'
        +   '<div class="mobileQuickViewPopupGrid">' + popupFields + '</div>'
	        +   (popupNotesMarkup ? '<div class="mobileQuickViewPopupNotesCard">'
	        +     '<div class="mobileQuickViewPopupLabel">Status notes</div>'
        +     '<div class="mobileQuickViewPopupNotesBody">' + popupNotesMarkup + '</div>'
        +   '</div>' : '')
        + '</div>';
      backdrop.hidden = false;
      popup.hidden = false;
      backdrop.setAttribute("aria-hidden", "false");
      popup.setAttribute("aria-hidden", "false");
      document.body.classList.add("mobileQuickViewPopupOpen");
    }

    function createMobileQuickViewEmptyTileElement(room){
      var color = getColorById(room.colorLabelId);
      var effectiveColor = room.colorHex ? room.colorHex : color.color;
      var timer = room.needsCleaning ? room.cleaningTimer : room.timer;
      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "mobileQuickViewEmptyTile";
      tile.dataset.roomId = room.id;
      tile.setAttribute("data-mobile-quick-room-id", room.id);
      tile.style.setProperty("--mobileQuickViewColor", effectiveColor || "#6ea8fe");
      tile.innerHTML =
        '<div class="mobileQuickViewEmptyTile__name">' + escapeHtml(room.name) + '</div>'
        + '<div class="mobileQuickViewEmptyTile__timer" data-timerText data-room-id="' + escapeHtml(room.id) + '">' + formatTime(computeElapsed(timer)) + '</div>';
      return tile;
    }

    function createMobileQuickViewElement(room){
      var color = getColorById(room.colorLabelId);
      var effectiveColor = room.colorHex ? room.colorHex : color.color;
      var timer = room.needsCleaning ? room.cleaningTimer : room.timer;
      var isTimerRunning = !!(timer && timer.running && !room.needsCleaning);
      var doctorInitials = isRoomCardFieldVisible("DoctorBadge") ? getDoctorInitials(room.doctor) : "";
      var doctorBadge = doctorInitials ? buildDoctorBadgeMarkup(room.doctor, doctorInitials) : "";
      var mobileMeta = buildMobileQuickViewMeta(room, color);
      var renderMode = getDisplayRenderMode();
      var isExpanded = (renderMode === "mobilecards" && mobileDisplayExpandedRoomId === room.id);
      var isQuickMiniBoard = renderMode === "quick";
      var patientText = room.needsCleaning
        ? "Cleaning"
        : (String(room.patientName || "").trim() || "Empty");
      var readyMarkup = "";
      if(isQuickMiniBoard && isRoomCardFieldVisible("Ready") && !room.needsCleaning){
        readyMarkup = '<span class="mobileQuickMiniReady">'
          + '<span class="mobileQuickMiniReadyBadge' + (room.roomReady ? ' is-on' : ' is-off') + '">R</span>'
          + '<span class="mobileQuickMiniReadyBadge' + (room.doctorReady ? ' is-on' : ' is-off') + '">D</span>'
        + '</span>';
      }
      var isEmptyCompact = (
        renderMode === "mobilecards"
        && !room.needsCleaning
        && !String(room.patientName || "").trim()
      );
      var isQuickEmpty = (
        isQuickMiniBoard
        && !room.needsCleaning
        && !String(room.patientName || "").trim()
      );
	      var card = document.createElement("article");
	      card.className = "mobileQuickViewItem" + (room.needsCleaning ? " is-cleaning" : "") + (roomMatchesSelectedDoctor(room) ? " doctorSelected" : "") + (isExpanded ? " is-expanded" : "") + ((isEmptyCompact || isQuickEmpty) ? " is-empty-card" : "");
	      card.dataset.roomId = room.id;
	      card.style.setProperty("--mobileQuickViewColor", effectiveColor || "#6ea8fe");
	      card.style.setProperty("--mobileDisplayCardColor", room.needsCleaning ? "#fbbf24" : (effectiveColor || "#6ea8fe"));
	      if(isQuickMiniBoard){
	        card.classList.add("is-mini-board");
	        card.innerHTML =
	          '<button class="mobileQuickViewRow mobileQuickMiniBoardRow" data-mobile-quick-room-id="' + escapeHtml(room.id) + '" type="button">'
	            + '<span class="mobileQuickMiniTop">'
	              + '<span class="mobileQuickViewRoomName">' + escapeHtml(room.name) + '</span>'
	              + (doctorBadge ? '<span class="mobileQuickViewDoctorBadge">' + doctorBadge + '</span>' : '')
	            + '</span>'
	            + '<span class="mobileQuickMiniPatient">' + escapeHtml(patientText) + '</span>'
	            + '<span class="mobileQuickViewTimerBox timerBox' + (room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : '')) + '"><span class="mobileQuickViewTimer' + (room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : '')) + '" data-timerText data-room-id="' + escapeHtml(room.id) + '">' + formatTime(computeElapsed(timer)) + '</span></span>'
	            + '<span class="mobileQuickMiniBottom">'
	              + '<span class="mobileQuickViewMeta">' + escapeHtml(mobileMeta || (room.needsCleaning ? "Needs cleaning" : ((color && color.title) || ""))) + '</span>'
	              + readyMarkup
	            + '</span>'
	          + '</button>';
	        return card;
	      }
	      card.innerHTML =
        '<button class="mobileQuickViewRow" data-mobile-quick-room-id="' + escapeHtml(room.id) + '" type="button">'
          + '<span class="mobileQuickViewRowTop">'
            + '<span class="mobileQuickViewRoomName">' + escapeHtml(room.name) + '</span>'
            + ((!isEmptyCompact && (isRoomCardFieldVisible("Patient") || room.needsCleaning)) ? '<span class="mobileQuickViewPatientTop">' + escapeHtml(room.patientName || (room.needsCleaning ? "Cleaning" : "No patient")) + '</span>' : '')
          + '</span>'
          + ((isEmptyCompact || (!doctorBadge && !mobileMeta)) ? '' : '<span class="mobileQuickViewRowMain">'
            + '<span class="mobileQuickViewDoctorBadge">' + doctorBadge + '</span>'
            + '<span class="mobileQuickViewPatientWrap">'
              + '<span class="mobileQuickViewMeta">' + escapeHtml(mobileMeta) + '</span>'
            + '</span>'
          + '</span>')
          + '<span class="mobileQuickViewTimerBox timerBox' + (room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : '')) + '"><span class="mobileQuickViewTimer' + (room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : '')) + '" data-timerText data-room-id="' + escapeHtml(room.id) + '">' + formatTime(computeElapsed(timer)) + '</span></span>'
        + '</button>'
        + (isExpanded ? buildMobileDisplayExpandedMarkup(room, color) : '');
      return card;
    }

	    function renderMobileQuickViewDisplay(skipTimerBindingRefresh){
	      var grid = $("displayGrid");
	      if(!grid) return;
	      var roomsToRender = (state && state.rooms) ? state.rooms.slice() : [];
	      var configuredQuickViewColumns = Math.max(2, Math.min(5, Number(state && state.settings ? (state.settings.mobileQuickViewColumns || 4) : 4)));
	      var maxQuickViewColumns = window.matchMedia && window.matchMedia("(max-width: 380px)").matches ? 4 : 5;
	      var quickViewColumns = Math.min(maxQuickViewColumns, configuredQuickViewColumns);
	      if(roomsToRender.length > quickViewColumns * 4){
	        quickViewColumns = Math.min(maxQuickViewColumns, Math.max(quickViewColumns, Math.ceil(roomsToRender.length / 4)));
	      }
	      var quickViewGap = Math.max(4, Math.min(16, Number(state && state.settings ? (state.settings.mobileQuickViewGap || 8) : 8)));
	      var quickViewRows = Math.max(1, Math.ceil(Math.max(roomsToRender.length, 1) / quickViewColumns));
	      if(mobileQuickViewDetailRoomId){
	        var hasSelected = false;
        for(var i=0;i<roomsToRender.length;i++){
          if(roomsToRender[i] && roomsToRender[i].id === mobileQuickViewDetailRoomId){
            hasSelected = true;
            break;
          }
        }
        if(!hasSelected) mobileQuickViewDetailRoomId = "";
      }
      clearSurfaceRoomNodeMap("display");
      grid.innerHTML = "";
	      grid.classList.add("mobileQuickViewGrid");
	      grid.classList.add("is-empty-board");
	      grid.dataset.layout = "quick";
	      grid.dataset.roomCount = String(roomsToRender.length);
	      grid.style.setProperty("--mobileQuickViewColumns", String(quickViewColumns));
	      grid.style.setProperty("--mobileQuickViewRows", String(quickViewRows));
	      grid.style.setProperty("--mobileQuickViewGap", quickViewGap + "px");
	      grid.style.aspectRatio = String(quickViewColumns) + " / " + String(quickViewRows);

	      if(!roomsToRender.length){
	        grid.innerHTML = '<div class="mobileQuickViewEmpty">No rooms to show right now.</div>';
        if(!skipTimerBindingRefresh) rebuildTimerBindings();
        return;
      }

      for(var j=0;j<roomsToRender.length;j++){
        var node = createMobileQuickViewElement(roomsToRender[j]);
        grid.appendChild(node);
        rememberSurfaceRoomNode("display", roomsToRender[j].id, node);
      }

      renderMobileQuickViewPopup();
      if(!skipTimerBindingRefresh) rebuildTimerBindings();
    }

    function renderMobileDisplayCards(skipTimerBindingRefresh){
      var grid = $("displayGrid");
      if(!grid) return;
      var displayRooms = getDisplayRooms();
      var groupByDoctor = shouldRenderActiveDisplayDoctorGroups("mobilecards");
      if(mobileDisplayExpandedRoomId){
        var hasExpanded = false;
        for(var e=0;e<displayRooms.length;e++){
          if(displayRooms[e] && displayRooms[e].id === mobileDisplayExpandedRoomId){
            hasExpanded = true;
            break;
          }
        }
        if(!hasExpanded) mobileDisplayExpandedRoomId = "";
      }
      clearSurfaceRoomNodeMap("display");
      grid.innerHTML = "";
	      grid.classList.add("mobileQuickViewGrid");
	      grid.classList.toggle("activeDoctorGrouped", groupByDoctor);
	      grid.classList.remove("is-empty-board");
	      grid.dataset.layout = "mobilecards";
	      grid.dataset.roomCount = String(displayRooms.length);
	      grid.style.removeProperty("--mobileQuickViewColumns");
	      grid.style.removeProperty("--mobileQuickViewRows");
	      grid.style.removeProperty("--mobileQuickViewGap");
	      grid.style.aspectRatio = "";

      renderMobileQuickViewPopup();

      if(!displayRooms.length){
        grid.innerHTML = '<div class="mobileQuickViewEmpty">No rooms to show right now.</div>';
        if(!skipTimerBindingRefresh) rebuildTimerBindings();
        return;
      }

      if(groupByDoctor){
        appendActiveDoctorDisplayGroups(grid, displayRooms, "mobilecards");
        if(!skipTimerBindingRefresh) rebuildTimerBindings();
        return;
      }

      for(var i=0;i<displayRooms.length;i++){
        var node = createMobileQuickViewElement(displayRooms[i]);
        grid.appendChild(node);
        rememberSurfaceRoomNode("display", displayRooms[i].id, node);
      }

      if(!skipTimerBindingRefresh) rebuildTimerBindings();
    }

    function createDisplayRoomElement(room, isList){
      var color = getColorById(room.colorLabelId);
      var effectiveColor = room.colorHex ? room.colorHex : color.color;
      var notesDock = buildRoomNotesDockHtml(room);
      var timer = room.needsCleaning ? room.cleaningTimer : room.timer;
      var isTimerRunning = !!(timer && timer.running && !room.needsCleaning);
      var showPatient = isRoomCardFieldVisible("Patient");
      var showType = isRoomCardFieldVisible("Type");
      var showDoctorName = isRoomCardFieldVisible("DoctorName");
	      var showDoctorBadge = isRoomCardFieldVisible("DoctorBadge");
	      var showTech = isRoomCardFieldVisible("Tech");
	      var showReady = isRoomCardFieldVisible("Ready");
	      var roomQuickNotes = isRoomCardFieldVisible("QuickNote") ? getRoomQuickNotes(room) : [];
	      var el = document.createElement("section");
      el.dataset.roomId = room.id;
      el.setAttribute("draggable", "true");

      if(isList){
        var patientCellHtml = "";
        var listDoctorInitials = showDoctorBadge ? getDoctorInitials(room.doctor) : "";
        if(listDoctorInitials) patientCellHtml += buildDoctorBadgeMarkup(room.doctor, listDoctorInitials);
        if(showPatient) patientCellHtml += room.patientName ? '<span class="wbPatientName">'+escapeHtml(room.patientName)+'</span>' : '<span class="muted">—</span>';
        if(!patientCellHtml) patientCellHtml = '<span class="muted">—</span>';
        var notesCellHtml = "";
	        if(roomQuickNotes.length) notesCellHtml += '<span class="wbQuickNotes">' + roomQuickNotes.map(escapeHtml).join('<span class="roomInfoSep" aria-hidden="true">&#12539;</span>') + '</span>';
	        if(notesDock) notesCellHtml += '<span class="wbNotesIconSlot">'+notesDock+'</span>';
	        if(showReady) notesCellHtml += '<span class="wbReady"><span class="r '+(room.roomReady ? '' : 'off')+'">room ✅</span><span class="r '+(room.doctorReady ? '' : 'off')+'">doctor ✅</span></span>';
        if(!notesCellHtml) notesCellHtml = '<span class="muted">—</span>';
        el.className = "room" + (room.needsCleaning ? " cleaning" : "") + (roomMatchesSelectedDoctor(room) ? " doctorSelected" : "");
        el.style.borderLeft = "6px solid " + (room.needsCleaning ? "rgba(251,191,36,.65)" : (effectiveColor + "AA"));
        el.style.setProperty("--roomTint", room.needsCleaning ? "rgba(251,191,36,.20)" : (effectiveColor + "22"));
        el.style.background = "linear-gradient(90deg, var(--roomTint), var(--listRowFade, rgba(255,255,255,.03)))";
        el.style.borderColor = room.needsCleaning ? "rgba(251,191,36,.55)" : "var(--listChromeBorder, rgba(255,255,255,.10))";
        el.innerHTML =
          '<div class="wbRow">'
            + '<div class="wbCell wbRoom"><span class="wbRoomInline"><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></span></div>'
	            + '<div class="wbCell wbPatientCell" data-label="Patient">' + patientCellHtml + '</div>'
            + '<div class="wbCell wbReasonCell" data-label="Reason">'+(showType ? escapeHtml(color.title) : '<span class="muted">—</span>')+'</div>'
            + '<div class="wbCell wbDoctorCell" data-label="Doctor">'+(showDoctorName && room.doctor ? escapeHtml(room.doctor) : '<span class="muted">—</span>')+'</div>'
            + '<div class="wbCell wbTechCell" data-label="Tech">'+(showTech && room.tech ? escapeHtml(room.tech) : '<span class="muted">—</span>')+'</div>'
            + '<div class="wbCell wbNotes" data-label="Notes">'+notesCellHtml+'</div>'
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
      var displayDoctorInitials = showDoctorBadge ? getDoctorInitials(room.doctor) : "";
      var cls = "room" + (room.needsCleaning ? " cleaning" : "") + (hasRedoDischarge(room) ? " hasRedo" : "") + (hasNotesDock ? " hasNotesDock" : "") + (displayDoctorInitials ? " hasDoctorBadge" : "") + (hasTimerAlert2(room) ? " timerAlertBorder" : "") + (roomMatchesSelectedDoctor(room) ? " doctorSelected" : "");
      var summary = "";
      if(room.needsCleaning){
        summary = '<div class="summary"><span class="pill" style="border-color: rgba(251,191,36,.55); background: rgba(251,191,36,.12);"><strong>NEEDS TO BE CLEANED</strong></span></div>';
      } else if(!isEmpty){
        var summaryParts = [];
        if(showPatient && room.patientName) summaryParts.push(escapeHtml(room.patientName));
        if(showType) summaryParts.push(escapeHtml(color.title));
	        if(showDoctorName && room.doctor) summaryParts.push(escapeHtml(room.doctor));
	        if(showTech && room.tech) summaryParts.push(escapeHtml(room.tech));
	        for(var qn=0;qn<roomQuickNotes.length;qn++) summaryParts.push(escapeHtml(roomQuickNotes[qn]));
	        if(showReady && room.roomReady) summaryParts.push("ROOM READY");
        if(showReady && room.doctorReady) summaryParts.push("DOCTOR READY");
        summary = summaryParts.length ? '<div class="summary roomInfoLine">' + summaryParts.join('<span class="roomInfoSep" aria-hidden="true">&#12539;</span>') + '</div>' : '';
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
          + '<div class="roomName"><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></div>'
          + '<button class="iconBtn" data-action="displayDischarge" data-room-id="'+room.id+'" title="'+(room.needsCleaning ? 'Mark clean' : 'Discharge')+'">'+getDischargeButtonIcon(room.needsCleaning)+'</button>'
        + '</div>'
        + '<div class="roomBody">'
          + summary
          + '<div class="timerRow">'
            + '<div class="timerBox'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'">'
              + '<div class="time'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'" data-timerText data-room-id="'+room.id+'">'+formatTime(computeElapsed(timer))+'</div>'
            + '</div>'
          + '</div>'
        + '</div>'
        + notesDock
        + (hasRedoDischarge(room) ? '<button class="roomRedoBtn" data-action="displayRedo" data-room-id="'+room.id+'" title="Redo discharge">↺</button>' : '')
	        + (displayDoctorInitials ? '<div class="docInitCorner">' + buildDoctorBadgeMarkup(room.doctor, displayDoctorInitials) + '</div>' : '');
	      return el;
	    }

    function clearActiveDisplayFit(){
      var grid = $("displayGrid");
      var wrap = $("displayWrap");
      activeDisplayFitFrame = 0;
      if(wrap) wrap.classList.remove("activeDisplayFitWrap");
      if(!grid) return;
      grid.classList.remove("activeDisplayFit");
      grid.classList.remove("activeDisplayFitSingle");
      grid.style.removeProperty("--activeFitCols");
      grid.style.removeProperty("--activeFitGap");
      grid.style.removeProperty("transform");
      grid.style.removeProperty("width");
    }

    function shouldRenderActiveDisplayDoctorGroups(renderMode){
      return renderMode !== "quick" && !!(state && state.settings && state.settings.displayOnlyActive);
    }

    function estimateActiveDisplayRows(groups, cols){
      var rows = 0;
      for(var i=0;i<groups.length;i++){
        rows += Math.ceil(((groups[i] && groups[i].rooms) ? groups[i].rooms.length : 0) / cols);
      }
      return rows;
    }

    function chooseActiveDisplayFitColumns(groups, roomCount, width, height){
      var configuredCols = Math.max(1, Math.min(8, Number(state && state.settings ? (state.settings.displayCols || 3) : 3)));
      var maxByWidth = Math.max(1, Math.floor((Math.max(0, width) + 14) / 280));
      var maxCols = Math.max(1, Math.min(8, maxByWidth));
      var targetCols = Math.max(1, Math.min(configuredCols, maxCols));
      var bestCols = targetCols;
      var bestScale = 0;
      var preferredCardHeight = 170;
      var dividerHeight = 32;
      var gap = 14;

      for(var cols=1; cols<=maxCols; cols++){
        var roomRows = estimateActiveDisplayRows(groups, cols);
        var gridRows = roomRows + groups.length;
        var estimatedHeight = (roomRows * preferredCardHeight) + (groups.length * dividerHeight) + (Math.max(0, gridRows - 1) * gap);
        var scale = estimatedHeight > 0 ? Math.min(1, height / estimatedHeight) : 1;
        if(scale >= 1 && cols >= targetCols){
          return cols;
        }
        if(scale > bestScale || (Math.abs(scale - bestScale) < 0.01 && cols > bestCols)){
          bestScale = scale;
          bestCols = cols;
        }
      }

      return bestCols;
    }

    function applyActiveDisplayFit(){
      activeDisplayFitFrame = 0;
      var grid = $("displayGrid");
      var wrap = $("displayWrap");
      if(!grid || !wrap) return;
      var renderMode = getDisplayRenderMode();
      if(renderMode !== "grid" || !shouldRenderActiveDisplayDoctorGroups(renderMode)){
        clearActiveDisplayFit();
        return;
      }

      var rooms = getDisplayRooms();
      var groups = (typeof getActiveDisplayDoctorGroups === "function") ? getActiveDisplayDoctorGroups(rooms) : [];
      if(!rooms.length || !groups.length){
        clearActiveDisplayFit();
        return;
      }

      var singleActiveRoom = rooms.length === 1;
      grid.classList.add("activeDisplayFit");
      grid.classList.toggle("activeDisplayFitSingle", singleActiveRoom);
      wrap.classList.add("activeDisplayFitWrap");
      grid.style.removeProperty("transform");
      grid.style.removeProperty("width");

      var availableWidth = Math.max(1, wrap.clientWidth || grid.clientWidth || 1);
      var availableHeight = Math.max(1, wrap.clientHeight || grid.clientHeight || 1);
      var cols = chooseActiveDisplayFitColumns(groups, rooms.length, availableWidth, availableHeight);
      var activeGap = availableHeight < 520 ? 10 : 14;
      var configuredCols = Math.max(1, Math.min(8, Number(state && state.settings ? (state.settings.displayCols || cols || 3) : (cols || 3))));
      var singleBasisCols = Math.max(1, Math.min(configuredCols, Math.max(1, Math.floor((availableWidth + activeGap) / 280))));
      var normalColumnWidth = (availableWidth - (singleBasisCols - 1) * activeGap) / singleBasisCols;
      var singleCardWidth = Math.max(280, Math.min(560, normalColumnWidth));
      grid.style.setProperty("--activeFitCols", String(cols));
      grid.style.setProperty("--activeFitGap", activeGap + "px");
      grid.style.setProperty("--activeFitSingleWidth", singleCardWidth.toFixed(4) + "px");

      var contentHeight = Math.max(1, grid.scrollHeight || grid.getBoundingClientRect().height || 1);
      var scale = Math.min(1, (availableHeight - 2) / contentHeight);
      scale = Math.max(0.28, scale);
      grid.style.transform = "scale(" + scale.toFixed(4) + ")";
      if(singleActiveRoom){
        grid.style.width = Math.min(singleCardWidth / scale, availableWidth / scale).toFixed(4) + "px";
      } else {
        grid.style.width = (100 / scale).toFixed(4) + "%";
      }
    }

    function scheduleActiveDisplayFit(){
      if(activeDisplayFitFrame) return;
      activeDisplayFitFrame = requestAnimationFrame(applyActiveDisplayFit);
    }

    function createActiveDoctorDividerElement(doctorName){
      var name = String(doctorName || "").trim() || "Unassigned";
      var badgeHtml = "";
      if(name !== "Unassigned"){
        badgeHtml = buildDoctorShapeBadgeMarkup(name);
      }
      var el = document.createElement("div");
      el.className = "activeDoctorDivider";
      el.innerHTML =
        '<div class="activeDoctorDividerLabel">'
          + badgeHtml
          + '<span class="activeDoctorDividerName">' + escapeHtml(name) + '</span>'
        + '</div>';
      return el;
    }

    function createActiveEmptyElement(){
      var el = document.createElement("div");
      el.className = "activeRoomsEmpty";
      el.innerHTML =
        '<div class="activeRoomsEmptyTitle">No active rooms</div>'
        + '<div class="activeRoomsEmptyText">All rooms are clear right now.</div>';
      return el;
    }

    function appendActiveDoctorDisplayGroups(grid, displayRooms, renderMode, options){
      options = options || {};
      var groups = (typeof getActiveDisplayDoctorGroups === "function") ? getActiveDisplayDoctorGroups(displayRooms) : [];
      var isList = renderMode === "list";
      var maxRooms = isFinite(Number(options.maxRooms)) ? Math.max(0, Number(options.maxRooms)) : Infinity;
      var renderedRooms = 0;

      for(var g=0;g<groups.length;g++){
        if(renderedRooms >= maxRooms) break;
        var rooms = groups[g] && groups[g].rooms ? groups[g].rooms : [];
        var remaining = maxRooms - renderedRooms;
        var roomLimit = Math.min(rooms.length, remaining);
        if(roomLimit <= 0) continue;

        grid.appendChild(createActiveDoctorDividerElement(groups[g].doctorName));

        for(var r=0;r<roomLimit;r++){
          var room = rooms[r];
          var node = (renderMode === "mobilecards")
            ? createMobileQuickViewElement(room)
            : createDisplayRoomElement(room, isList);
          grid.appendChild(node);
          rememberSurfaceRoomNode("display", room.id, node);
          renderedRooms += 1;
        }
      }

      return renderedRooms;
    }

    function canPatchDisplayRooms(roomIds){
      var grid = $("displayGrid");
      if(!grid || !roomIds || !roomIds.length) return false;
      if(getDisplayRenderMode() === "quick") return false;
      if(!!(state && state.settings && state.settings.displayOnlyActive)) return false;
      if(String(grid.dataset.layout || "") !== getDisplayRenderMode()) return false;
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
      var renderMode = getDisplayRenderMode();
      var isList = (renderMode === "list");
      for(var i=0;i<displayRooms.length;i++){
        displayRoomsById[String(displayRooms[i].id)] = displayRooms[i];
      }
      for(var j=0;j<roomIds.length;j++){
        var roomId = String(roomIds[j]);
        var existing = getSurfaceRoomNode("display", roomId);
        var nextRoom = displayRoomsById[roomId];
        if(!existing || !nextRoom) return false;
        var replacement = (renderMode === "mobilecards")
          ? createMobileQuickViewElement(nextRoom)
          : createDisplayRoomElement(nextRoom, isList);
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
      var renderMode = getDisplayRenderMode();
      clearSurfaceRoomNodeMap("display");
      grid.innerHTML = "";
      var displayRooms = getDisplayRooms();
      var isList = (renderMode === "list");
      var groupByDoctor = shouldRenderActiveDisplayDoctorGroups(renderMode);
      clearActiveDisplayFit();
      grid.classList.toggle("activeDisplayFitSingle", renderMode === "grid" && groupByDoctor && displayRooms.length === 1);
      grid.classList.toggle("mobileQuickViewGrid", renderMode === "quick" || renderMode === "mobilecards");
      grid.classList.toggle("activeDoctorGrouped", groupByDoctor);
      grid.dataset.layout = renderMode;
      grid.dataset.roomCount = String(displayRooms.length);

      if(renderMode === "quick"){
        renderMobileQuickViewDisplay(skipTimerBindingRefresh);
        return;
      }

      if(renderMode === "mobilecards"){
        renderMobileDisplayCards(skipTimerBindingRefresh);
        return;
      }

      renderMobileQuickViewPopup();

      if(isList){
        var lines = 16;
        if(groupByDoctor){
          appendActiveDoctorDisplayGroups(grid, displayRooms, renderMode, { maxRooms: lines });
          requestAnimationFrame(applyWbRoomNameMarquee);
          syncRoomNotesLayers();
          if(!skipTimerBindingRefresh) rebuildTimerBindings();
          return;
        }
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

      if(groupByDoctor){
        if(!displayRooms.length){
          grid.appendChild(createActiveEmptyElement());
          syncRoomNotesLayers();
          if(!skipTimerBindingRefresh) rebuildTimerBindings();
          return;
        }
        appendActiveDoctorDisplayGroups(grid, displayRooms, renderMode);
        scheduleActiveDisplayFit();
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

    window.addEventListener("resize", scheduleActiveDisplayFit);
    window.addEventListener("focus", scheduleActiveDisplayFit);
    window.addEventListener("pageshow", scheduleActiveDisplayFit);
    document.addEventListener("visibilitychange", function(){
      if(!document.hidden) scheduleActiveDisplayFit();
    });

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
			        if(Date.now() < mobileSuppressClickUntilMs){
			          e.preventDefault();
			          return;
			        }
			        var quickViewRow = e.target && e.target.closest ? e.target.closest(".mobileQuickViewRow") : null;
			        var quickViewTile = e.target && e.target.closest ? e.target.closest(".mobileQuickViewEmptyTile") : null;
			        var quickViewTarget = quickViewRow || quickViewTile;
		        if(quickViewTarget && getDisplayRenderMode() === "quick"){
	          e.preventDefault();
	          mobileQuickViewDetailRoomId = quickViewTarget.getAttribute("data-mobile-quick-room-id") || "";
	          renderMobileQuickViewPopup();
		          rebuildTimerBindings();
		          return;
		        }
		        if(quickViewRow && getDisplayRenderMode() === "mobilecards"){
		          e.preventDefault();
		          var expandRoomId = quickViewRow.getAttribute("data-mobile-quick-room-id") || "";
		          mobileDisplayExpandedRoomId = (mobileDisplayExpandedRoomId === expandRoomId) ? "" : expandRoomId;
		          requestRenderDisplay();
		          return;
		        }
		        var node = e.target;
	        // walk up to a node with data-action
	        while(node && node !== grid && !(node.getAttribute && node.getAttribute("data-action"))) node = node.parentNode;
        if(!node || node === grid) return;

        var action = node.getAttribute("data-action");
        if(action !== "displayDischarge" && action !== "displayRedo") return;

        var roomId = node.getAttribute("data-room-id");
        var room = findRoomById(roomId);
        if(!room) return;
        holdRemoteUpdates(Math.max(1200, CHANGE_INTERACTION_HOLD_MS || 0));
        var actionLockKey = "display-room-action." + action + "." + room.id;
        var cooldownMs = action === "displayRedo" ? 120 : 220;
        runLockedAction(actionLockKey, function(){
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
        }, { el: node, cooldownMs: cooldownMs });
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

		      grid.addEventListener("pointerdown", function(e){
		        if(!isMobileTouchGestureViewport()) return;
		        if(!e || (e.pointerType !== "touch" && e.pointerType !== "pen")) return;
		        var target = e.target;
		        if(!target || !target.closest) return;
		        if(target.closest("[data-action], .roomNotesDock, summary, input, textarea, select, a")) return;
		        var card = getMobileTouchGestureRoomCard(target);
		        if(!card) return;
		        resetMobileTouchGestureState();
		        mobileTouchGestureState.pointerId = e.pointerId;
		        mobileTouchGestureState.sourceEl = card;
		        mobileTouchGestureState.sourceId = String(card.getAttribute("data-room-id") || card.dataset.roomId || "");
		        mobileTouchGestureState.startX = e.clientX;
		        mobileTouchGestureState.startY = e.clientY;
		        mobileTouchGestureState.moved = false;
		        if(grid.setPointerCapture){
		          try {
		            grid.setPointerCapture(e.pointerId);
		            mobileTouchGestureState.captureEl = grid;
		          } catch(_err){
		            mobileTouchGestureState.captureEl = null;
		          }
		        }
		        mobileTouchGestureState.holdTimer = setTimeout(function(){
		          beginMobileTouchDrag();
		        }, 260);
		      }, { passive: true });

		      grid.addEventListener("pointermove", function(e){
		        if(mobileTouchGestureState.pointerId == null || e.pointerId !== mobileTouchGestureState.pointerId) return;
		        var dx = Math.abs(e.clientX - mobileTouchGestureState.startX);
		        var dy = Math.abs(e.clientY - mobileTouchGestureState.startY);
		        if(!mobileTouchGestureState.dragging){
		          if(dx > 10 || dy > 10){
		            mobileTouchGestureState.moved = true;
		            clearMobileTouchHoldTimer();
		          }
		          return;
		        }
		        e.preventDefault();
		        updateMobileTouchDragTargetFromPoint(e.clientX, e.clientY);
		      }, { passive: false });

		      function finishMobileTouchGesture(e){
		        if(mobileTouchGestureState.pointerId == null || !e || e.pointerId !== mobileTouchGestureState.pointerId) return;
		        var sourceId = mobileTouchGestureState.sourceId;
		        var targetId = mobileTouchGestureState.targetId;
		        var wasDragging = mobileTouchGestureState.dragging;
		        var moved = mobileTouchGestureState.moved;
		        clearMobileTouchHoldTimer();
		        if(wasDragging){
		          if(targetId && sourceId && targetId !== sourceId){
		            enqueueRoomBoardMutation(function(){
		              swapRoomsById(sourceId, targetId, { immediate: true });
		            });
		          }
		          clearDraggedRoomId();
		          mobileSuppressClickUntilMs = Date.now() + 400;
		          resetMobileTouchGestureState();
		          return;
		        }
		        resetMobileTouchGestureState();
		        if(moved || !sourceId) return;
		        var now = Date.now();
		        if(mobileTouchGestureState.lastTapRoomId === sourceId && (now - mobileTouchGestureState.lastTapAt) <= 320){
		          mobileTouchGestureState.lastTapAt = 0;
		          mobileTouchGestureState.lastTapRoomId = "";
		          mobileSuppressClickUntilMs = now + 400;
		          holdRemoteUpdates(1200);
		          openQuickAdd(sourceId);
		          return;
		        }
		        mobileTouchGestureState.lastTapAt = now;
		        mobileTouchGestureState.lastTapRoomId = sourceId;
		      }

		      grid.addEventListener("pointerup", finishMobileTouchGesture, { passive: true });
		      grid.addEventListener("pointercancel", function(e){
		        if(mobileTouchGestureState.pointerId == null || !e || e.pointerId !== mobileTouchGestureState.pointerId) return;
		        clearDraggedRoomId();
		        resetMobileTouchGestureState();
		      }, { passive: true });
		      grid.addEventListener("lostpointercapture", function(e){
		        if(mobileTouchGestureState.pointerId == null || !e || e.pointerId !== mobileTouchGestureState.pointerId) return;
		        clearDraggedRoomId();
		        resetMobileTouchGestureState();
		      }, { passive: true });

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
	        if(e.key === "Escape" && mobileQuickViewDetailRoomId){
	          mobileQuickViewDetailRoomId = "";
	          renderMobileQuickViewPopup();
	        }
	        if(e.key === "Escape") closeOpenRoomNotes(null);
	      });

	      var mobileQuickPopupBackdrop = $("mobileQuickViewPopupBackdrop");
	      if(mobileQuickPopupBackdrop && !mobileQuickPopupBackdrop.__bound){
	        mobileQuickPopupBackdrop.__bound = true;
	        mobileQuickPopupBackdrop.addEventListener("click", function(){
	          mobileQuickViewDetailRoomId = "";
	          renderMobileQuickViewPopup();
	        });
	      }
	      var mobileQuickPopup = $("mobileQuickViewPopup");
	      if(mobileQuickPopup && !mobileQuickPopup.__bound){
	        mobileQuickPopup.__bound = true;
	        mobileQuickPopup.addEventListener("click", function(e){
	          var closeBtn = e.target && e.target.closest ? e.target.closest("[data-mobile-quick-popup-action='close']") : null;
	          if(!closeBtn) return;
	          mobileQuickViewDetailRoomId = "";
	          renderMobileQuickViewPopup();
	        });
	      }

	      // Drag & drop on display (swap room contents)
	      grid.addEventListener("dragstart", function(e){
	        var card = closestRoomCard(e.target);
	        if(!card) return;
	        holdRemoteUpdates(Math.max(1200, CHANGE_INTERACTION_HOLD_MS || 0));
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

	    function createQuickNotePickerHtml(room){
	      return '<div class="quickNotePicker" data-quick-note-picker="1">'
	        + buildQuickNoteChoiceListHtml(getRoomQuickNotes(room), { inputName: "roomQuickNotes", dataField: true })
	      + '</div>';
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
              + '<div class="roomName"><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></div>'
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
              + '<div class="roomName"><span class="wbRoomNameWrap"><span class="wbRoomName">'+escapeHtml(room.name)+'</span></span></div>'
              + (room.needsCleaning ? '<span class="pill" style="border-color: rgba(251,191,36,.55); background: rgba(251,191,36,.12);"><strong>NEEDS CLEANING</strong></span>' : '<span class="muted">'+escapeHtml(color.title)+'</span>')
            + '</div>'
            + '<div class="roomBody">'
              + '<div class="field"><label>Patient name</label><input data-field="patientName" type="text" value="'+escapeHtml(room.patientName)+'" placeholder="e.g., Bella" /></div>'
              + '<div class="row2"><div class="field"><label>Type</label><select data-field="colorLabelId">'+createColorOptionsHtml(room.colorLabelId)+'</select></div></div>'
              + '<div class="row2">'
                + '<div class="field"><label>Doctor</label><select data-field="doctor">'+createDoctorOptionsHtml(room.doctor)+'</select></div>'
                + '<div class="field"><label>Tech</label><input data-field="tech" type="text" value="'+escapeHtml(room.tech)+'" placeholder="e.g., Alex" /></div>'
              + '</div>'
	              + '<div class="field full"><label>Quick notes</label>'+createQuickNotePickerHtml(room)+'</div>'
	              + '<div class="field"><label>Status notes</label><textarea data-field="notes" placeholder="Status notes...">'+escapeHtml(room.notes)+'</textarea></div>'
              + '<div class="row2">'
                + '<div class="toggle"><div><div style="font-weight:700;">Room ready</div><div class="muted">Patient ready in room</div></div><div class="switch '+(room.roomReady ? "on" : "")+'" data-action="toggleRoomReady"><div class="knob"></div></div></div>'
                + '<div class="toggle"><div><div style="font-weight:700;">Doctor ready</div><div class="muted">Doctor ready to go in</div></div><div class="switch '+(room.doctorReady ? "on" : "")+'" data-action="toggleDoctorReady"><div class="knob"></div></div></div>'
              + '</div>'
              + '<div class="timerRow">'
                + '<div class="timerBox'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'">'
                  + '<div><div class="time'+(room.needsCleaning ? ' timerCleaning' : (isTimerRunning ? ' timerRunning' : ''))+'" data-timerText data-room-id="'+room.id+'">'+formatTime(computeElapsed(timer))+'</div></div>'
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
	      if(field === "quickNotes") setRoomQuickNotes(room, value);

      await commitBoardNow();
      requestBoardRoomRefresh([room.id], { includeIntake: true });
    }

    async function handleIntakeRoomAction(room, action){
      if(!room || !action) return;
      holdRemoteUpdates(Math.max(1200, CHANGE_INTERACTION_HOLD_MS || 0));
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
	        if(field === "quickNotes") return;
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
	        var value = field === "quickNotes" ? readQuickNoteChoiceValues(card) : fieldEl.value;
	        await handleIntakeFieldChange(room, field, value);
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
        holdRemoteUpdates(Math.max(1200, CHANGE_INTERACTION_HOLD_MS || 0));
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
	        room.patientName || room.doctor || room.tech || room.notes || getRoomQuickNotes(room).length
	        || room.roomReady || room.doctorReady || computeElapsed(room.timer) > 0
	      );
	    }

	    function buildDischargeSnapshot(room){
	      var quickNotes = getRoomQuickNotes(room);
	      return {
        patientName: room.patientName || "",
        reason: room.reason || DEFAULT_REASONS[0],
        colorLabelId: room.colorLabelId || getDefaultColorLabelIdFromList(state.colorLabels),
        colorHex: room.colorHex || "",
        doctor: room.doctor || "",
	        tech: room.tech || "",
	        notes: room.notes || "",
	        quickNote: quickNotes[0] || "",
	        quickNotes: quickNotes,
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
      room.cleaningTimer = room.cleaningTimer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };
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
	      setRoomQuickNotes(room, Array.isArray(snapshot.quickNotes) ? snapshot.quickNotes : (snapshot.quickNote || ""));
	      room.roomReady = !!snapshot.roomReady;
      room.doctorReady = !!snapshot.doctorReady;
      room.timer = hydrateTimerFromRoomState(snapshot.timer);
      room.cleaningTimer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: serverNowIso || isoNow() };
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
	      setRoomQuickNotes(room, []);
	      room.roomReady = false;
      room.doctorReady = false;
      room.timer = { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: serverNowIso };
      room.needsCleaning = true;
      room.cleaningTimer = { elapsedMs: 0, running: true, startedAt: null, startedAtIso: serverNowIso, updatedAtIso: serverNowIso };
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
      [
        "showRoomCardPatient",
        "showRoomCardType",
        "showRoomCardDoctorName",
        "showRoomCardDoctorBadge",
        "showRoomCardTech",
        "showRoomCardReady",
        "showRoomCardQuickNote",
        "showRoomCardStatusNotes"
      ].forEach(function(id){
        if($(id)) $(id).checked = state.settings[id] !== false;
      });
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
            queueSettingsConfigSave({ renderSettingsLists: false });
            requestBoardRoomRefresh([room.id], { includeIntake: true });
          });
          input.addEventListener("blur", function(){
            room.name = input.value;
            queueSettingsConfigSave({ immediate: true });
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
	              if(previousName && state.settings && state.settings.doctorBadgeStyles && Object.prototype.hasOwnProperty.call(state.settings.doctorBadgeStyles, previousName)){
	                var previousBadgeStyle = JSON.parse(JSON.stringify(state.settings.doctorBadgeStyles[previousName]));
	                delete state.settings.doctorBadgeStyles[previousName];
	                if(nextName) state.settings.doctorBadgeStyles[nextName] = previousBadgeStyle;
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
	              if(state.settings && state.settings.doctorBadgeStyles && Object.prototype.hasOwnProperty.call(state.settings.doctorBadgeStyles, removed)){
	                delete state.settings.doctorBadgeStyles[removed];
	              }
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
	      var doctorBadgeStylesWrap = $("doctorBadgeStylesList");
	      if(doctorBadgeStylesWrap){
	        doctorBadgeStylesWrap.innerHTML = "";
	        if(!state.settings.doctorBadgeStyles || typeof state.settings.doctorBadgeStyles !== "object") state.settings.doctorBadgeStyles = {};
	        for(var d3=0; d3<state.doctors.length; d3++){
	          (function(docName){
	            var row = document.createElement("div");
	            row.className = "listRow doctorBadgeStyleRow";
	            var badgeStyle = typeof getDoctorBadgeStyle === "function" ? getDoctorBadgeStyle(docName) : {
	              color: "#0b1220",
	              textColor: "#e8eefc",
	              shape: "square"
	            };
	            var previewInitials = (state.settings.doctorInitials && state.settings.doctorInitials[docName]) || getDoctorInitialsFallback(docName) || "DR";
	            row.innerHTML =
	              '<div class="doctorBadgeDoctorCell">'
	              +   '<div class="doctorBadgeDoctorName">' + escapeHtml(docName || "(none)") + '</div>'
	              + '</div>'
	              + buildDoctorBadgeMarkup(docName, previewInitials)
	              + '<input type="color" value="' + escapeHtml(badgeStyle.color || "#0b1220") + '" title="Badge color" />'
	              + '<input type="color" value="' + escapeHtml(badgeStyle.textColor || "#e8eefc") + '" title="Text color" />'
	              + '<select title="Badge shape">'
	              +   '<option value="square"' + (badgeStyle.shape === "square" ? ' selected' : '') + '>Square</option>'
	              +   '<option value="triangle"' + (badgeStyle.shape === "triangle" ? ' selected' : '') + '>Triangle</option>'
		              +   '<option value="star"' + (badgeStyle.shape === "star" ? ' selected' : '') + '>Star</option>'
	              +   '<option value="hexagon"' + (badgeStyle.shape === "hexagon" ? ' selected' : '') + '>Hexagon</option>'
	              +   '<option value="circle"' + (badgeStyle.shape === "circle" ? ' selected' : '') + '>Circle</option>'
	              +   '<option value="crab"' + (badgeStyle.shape === "crab" ? ' selected' : '') + '>Crab</option>'
	              +   '<option value="bulldog"' + (badgeStyle.shape === "bulldog" ? ' selected' : '') + '>Bulldog</option>'
	              +   '<option value="flower"' + (badgeStyle.shape === "flower" ? ' selected' : '') + '>Flower</option>'
	              +   '<option value="flower2"' + (badgeStyle.shape === "flower2" ? ' selected' : '') + '>Flower 2</option>'
	              +   '<option value="golfball"' + (badgeStyle.shape === "golfball" ? ' selected' : '') + '>Golf Ball</option>'
	              +   '<option value="strawberry"' + (badgeStyle.shape === "strawberry" ? ' selected' : '') + '>Strawberry</option>'
	              +   '<option value="turtle"' + (badgeStyle.shape === "turtle" ? ' selected' : '') + '>Turtle</option>'
	              + '</select>'
	              + '<button class="btn sm" type="button" title="Reset badge style">Reset</button>';
	            var controls = row.querySelectorAll("input, select");
	            function updateDoctorBadgeStyleFromRow(){
	              state.settings.doctorBadgeStyles[docName] = {
	                color: controls[0].value || "#0b1220",
	                textColor: controls[1].value || "#e8eefc",
	                shape: controls[2].value || "square"
	              };
	            }
	            controls[0].addEventListener("input", function(){
	              updateDoctorBadgeStyleFromRow();
	              scheduleDoctorInitialBadgeAutosave(160);
	            });
	            controls[1].addEventListener("input", function(){
	              updateDoctorBadgeStyleFromRow();
	              scheduleDoctorInitialBadgeAutosave(160);
	            });
	            controls[0].addEventListener("change", function(){
	              updateDoctorBadgeStyleFromRow();
	              scheduleDoctorInitialBadgeAutosave(0);
	            });
	            controls[1].addEventListener("change", function(){
	              updateDoctorBadgeStyleFromRow();
	              scheduleDoctorInitialBadgeAutosave(0);
	            });
	            controls[2].addEventListener("change", function(){
	              updateDoctorBadgeStyleFromRow();
	              scheduleDoctorInitialBadgeAutosave(0);
	            });
	            row.querySelector("button").addEventListener("click", function(){
	              var btn = this;
	              runLockedAction("settings.reset-doctor-badge-style." + String(docName || ""), function(){
	                if(state.settings && state.settings.doctorBadgeStyles && Object.prototype.hasOwnProperty.call(state.settings.doctorBadgeStyles, docName)){
	                  delete state.settings.doctorBadgeStyles[docName];
	                }
	                scheduleDoctorInitialBadgeAutosave(0);
	                scheduleUiRefresh({
	                  settingsLists: true,
	                  display: true,
	                  displayFull: true,
	                  displayChrome: true,
	                  timerBindings: true
	                });
	                return true;
	              }, { el: btn, busyLabel: "", cooldownMs: 200 });
	            });
	            doctorBadgeStylesWrap.appendChild(row);
	          })(state.doctors[d3]);
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

      // Quick notes list
      var quickNotesList = $("quickNotesList");
      if(quickNotesList){
        quickNotesList.innerHTML = "";
        var managedQuickNotes = (typeof getManagedQuickNotes === "function") ? getManagedQuickNotes() : [];
        if(!managedQuickNotes.length){
	          quickNotesList.innerHTML = '<div class="muted">No quick notes yet. Add one above to make it available clinic-wide.</div>';
        } else {
          for(var q=0;q<managedQuickNotes.length;q++){
            (function(idx){
              var noteLabel = managedQuickNotes[idx];
              var row = document.createElement("div");
              row.className = "listRow";
              row.innerHTML =
                '<input type="text" value="'+escapeHtml(noteLabel)+'" />'
                + '<div class="muted" style="text-align:right;">' + escapeHtml(String(getRoomIdsUsingQuickNote(noteLabel).length || 0)) + ' rooms</div>'
                + '<button class="trash" title="Delete">✕</button>';

              var input = row.querySelector("input");
              input.addEventListener("input", function(){
                holdRemoteUpdates(TEXT_INPUT_HOLD_MS);
              });

              function commitQuickNoteChange(removeInstead){
                var notes = getManagedQuickNotes();
                var previousLabel = String(noteLabel || "");
                var nextLabel = removeInstead ? "" : String(input.value || "").trim();
                if(!removeInstead && !nextLabel){
                  nextLabel = "";
                }
                for(var i=0;i<notes.length;i++){
                  if(i === idx) continue;
                  if(String(notes[i] || "").trim().toLowerCase() === nextLabel.toLowerCase() && nextLabel){
                    input.value = previousLabel;
                    setStatus("Quick note labels must be unique.");
                    return false;
                  }
                }
                if(nextLabel) notes[idx] = nextLabel;
                else notes.splice(idx, 1);
                setManagedQuickNotes(notes);
                var affectedRoomIds = renameQuickNoteAcrossRooms(previousLabel, nextLabel);
                queueSettingsConfigSave({ immediate: true });
                scheduleUiRefresh({
                  settingsLists: true,
                  display: affectedRoomIds.length > 0,
                  displayRoomIds: affectedRoomIds,
                  intake: affectedRoomIds.length > 0,
                  intakeRoomIds: affectedRoomIds,
                  timerBindings: false
                });
                setStatus(nextLabel ? "Quick note updated." : "Quick note removed.");
                return true;
              }

              input.addEventListener("change", function(){
                commitQuickNoteChange(false);
              });
              input.addEventListener("blur", function(){
                if(String(input.value || "").trim() === String(noteLabel || "").trim()) return;
                commitQuickNoteChange(false);
              });

              row.querySelector("button").addEventListener("click", function(){
                var btn = this;
                runLockedAction("settings.delete-quick-note." + idx + "." + String(noteLabel || ""), function(){
                  return commitQuickNoteChange(true);
                }, { el: btn, busyLabel: "", cooldownMs: 250 });
              });

              quickNotesList.appendChild(row);
            })(q);
          }
        }
      }

      // Layout inputs
	      $("displayCols").value = state.settings.displayCols;
	      $("displayRows").value = state.settings.displayRows;
		      if($("displayCardScale")) $("displayCardScale").value = String(state.settings.displayCardScale || 1);
		      if($("displayCardScaleValue")) $("displayCardScaleValue").value = String(state.settings.displayCardScale || 1);
		      if($("roomCardLineHeight")) $("roomCardLineHeight").value = String(state.settings.roomCardLineHeight || 1.35);
		      if($("roomCardLineHeightValue")) $("roomCardLineHeightValue").value = String(state.settings.roomCardLineHeight || 1.35);
		      if($("mobileQuickViewColumns")) $("mobileQuickViewColumns").value = String(state.settings.mobileQuickViewColumns || 4);
		      if($("mobileQuickViewGap")) $("mobileQuickViewGap").value = String(state.settings.mobileQuickViewGap || 8);
		      if($("mobileQuickViewFontSize")) $("mobileQuickViewFontSize").value = String(state.settings.mobileQuickViewFontSize || 22);
		      if($("mobileQuickViewFontSizeValue")) $("mobileQuickViewFontSizeValue").value = String(state.settings.mobileQuickViewFontSize || 22);
		      if($("mobileQuickViewTimerSize")) $("mobileQuickViewTimerSize").value = String(state.settings.mobileQuickViewTimerSize || 13);
		      if($("mobileQuickViewTimerSizeValue")) $("mobileQuickViewTimerSizeValue").value = String(state.settings.mobileQuickViewTimerSize || 13);
	      if($("practiceLogoScale")) $("practiceLogoScale").value = String(state.settings.practiceLogoScale || 1);
	      if($("practiceLogoScaleValue")) $("practiceLogoScaleValue").value = String(state.settings.practiceLogoScale || 1);
	      if($("doctorInitialBadgeScale")) $("doctorInitialBadgeScale").value = String(state.settings.doctorInitialBadgeScale || 1);
	      if($("doctorInitialBadgeScaleValue")) $("doctorInitialBadgeScaleValue").value = String(state.settings.doctorInitialBadgeScale || 1);
	      if($("doctorInitialBadgeFontSize")) $("doctorInitialBadgeFontSize").value = String(state.settings.doctorInitialBadgeFontSize || 16);
	      if($("doctorInitialBadgeFontSizeValue")) $("doctorInitialBadgeFontSizeValue").value = String(state.settings.doctorInitialBadgeFontSize || 16);
	      if($("showPracticeNameBadge")) $("showPracticeNameBadge").checked = state.settings.showPracticeNameBadge !== false;
	      if($("practiceLogoInvert")) $("practiceLogoInvert").checked = state.settings.practiceLogoInvert === true;
	      var mobileQuickViewBtn = $("toggleMobileQuickViewBtn");
	      if(mobileQuickViewBtn){
	        var isMobileHeaderViewport = !!(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
	        var quickViewOn = !!(state.settings && state.settings.mobileQuickView);
	        mobileQuickViewBtn.hidden = !isMobileHeaderViewport;
	        mobileQuickViewBtn.setAttribute("aria-hidden", isMobileHeaderViewport ? "false" : "true");
	        mobileQuickViewBtn.classList.toggle("primary", quickViewOn);
	        mobileQuickViewBtn.setAttribute("aria-pressed", quickViewOn ? "true" : "false");
	        mobileQuickViewBtn.setAttribute("aria-label", quickViewOn ? "Mobile quick view on" : "Mobile quick view off");
	        mobileQuickViewBtn.title = quickViewOn ? "Mobile quick view on" : "Mobile quick view off";
	      }
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
      if($("practiceNameColor")) $("practiceNameColor").value = state.settings.practiceNameColor || "#fecdd3";
      var logoPreview = $("practiceLogoPreviewImage");
      var logoPreviewEmpty = $("practiceLogoPreviewEmpty");
      var removeLogoBtn = $("removePracticeLogoBtn");
      var practiceLogoHelp = $("practiceLogoHelp");
      var practiceLogoUrl = String(state && state.settings ? (state.settings.practiceLogoUrl || "") : "").trim();
      var practiceLogoUpdatedAt = String(state && state.settings ? (state.settings.practiceLogoUpdatedAt || "") : "").trim();
      if(logoPreview){
        var previewSrc = buildPracticeLogoSrc(practiceLogoUrl, practiceLogoUpdatedAt);
        if(previewSrc){
          logoPreview.src = previewSrc;
          logoPreview.hidden = false;
        } else {
          logoPreview.hidden = true;
          logoPreview.removeAttribute("src");
        }
      }
      if(logoPreviewEmpty) logoPreviewEmpty.hidden = !!practiceLogoUrl;
      if(removeLogoBtn) removeLogoBtn.disabled = !practiceLogoUrl;
	      if(practiceLogoHelp) practiceLogoHelp.textContent = practiceLogoUrl
	        ? "Current clinic logo is active on the board. Uploading a new file replaces it for the whole clinic."
	        : "Uploads replace the RoomBoard wordmark with your clinic logo for the whole clinic.";
	    }

    function applyGlobalChrome(){
      bumpRenderPerf("globalChromeApplies");
      applyLayout();
      applyFonts();
	      applyStopwatchStyle();
	      applyTimerAlertSettings();
	      applyBackground();
	      applyDisplayColors();
	      applyPracticeBranding();
	      applyDoctorInitialBadgeStyle();
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

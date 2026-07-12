(function(){
  function hasInteractiveDemoRoute(){
    try{
      return String(new URLSearchParams(window.location.search || "").get("mode") || "").toLowerCase() === "demo";
    }catch(e){
      return false;
    }
  }

  window.__roomboardInteractiveDemo = hasInteractiveDemoRoute();
  if(!window.__roomboardInteractiveDemo) return;

  document.body.classList.add("roomboardDemoMode");
  document.title = "RoomBoard Interactive Demo";

  var demoBanner = document.getElementById("demoModeBanner");
  if(demoBanner) demoBanner.hidden = false;

  var authBanner = document.getElementById("authBanner");
  if(authBanner) authBanner.textContent = "DEMO BOARD";

  var resetButton = document.getElementById("resetDemoBtn");
  if(resetButton){
    resetButton.addEventListener("click", function(){
      window.location.reload();
    });
  }

  function isoMinutesAgo(minutes){
    return new Date(Date.now() - (minutes * 60 * 1000)).toISOString();
  }

  function activeTimer(minutes){
    return {
      elapsedMs: 0,
      baseElapsedMs: 0,
      running: true,
      startedAt: null,
      startedAtIso: isoMinutesAgo(minutes),
      updatedAtIso: isoMinutesAgo(minutes)
    };
  }

  function stoppedTimer(){
    return {
      elapsedMs: 0,
      baseElapsedMs: 0,
      running: false,
      startedAt: null,
      startedAtIso: null,
      updatedAtIso: null
    };
  }

  function demoRoom(id, name, values){
    values = values || {};
    return {
      dbId: null,
      id: id,
      name: name,
      patientName: values.patientName || "",
      reason: values.reason || "Waiting",
      colorLabelId: values.colorLabelId || "demo-waiting",
      colorHex: "",
      doctor: values.doctor || "",
      tech: values.tech || "",
      notes: values.notes || "",
      quickNote: values.quickNote || "",
      quickNotes: values.quickNotes || [],
      roomReady: !!values.roomReady,
      doctorReady: !!values.doctorReady,
      needsCleaning: !!values.needsCleaning,
      timer: values.timer || stoppedTimer(),
      cleaningTimer: values.cleaningTimer || stoppedTimer(),
      activeRoomSessionId: null,
      activeCleaningSessionId: null,
      lastDischargeSnapshot: null
    };
  }

  window.createRoomBoardDemoState = function(){
    return {
      colorLabels: [
        { id: "demo-waiting", title: "Waiting", color: "#6ea8fe" },
        { id: "demo-treatment", title: "In Treatment", color: "#2dd4bf" },
        { id: "demo-doctor", title: "Needs Doctor", color: "#fbbf24" },
        { id: "demo-discharge", title: "Discharge", color: "#a78bfa" }
      ],
      doctors: ["", "Dr. Patel", "Dr. Reyes", "Dr. Morgan"],
      quickNotes: ["", "Interpreter requested", "Needs follow-up", "Family waiting"],
      settings: {
        displayCols: 4,
        displayAutoCols: false,
        displayOnlyActive: false,
        displaySortMode: "room",
        defaultColorLabelId: "demo-waiting",
        themePreset: "dark",
        themeDefaultPreset: "dark",
        timerAlert1AtSec: 20 * 60,
        timerAlert2AtSec: 45 * 60,
        timerAlert1Color: "#fbbf24",
        timerAlert2Color: "#fb7185"
      },
      rooms: [
        demoRoom("demo-room-1", "Room 1", {
          patientName: "R. Patel", reason: "Waiting", colorLabelId: "demo-waiting", doctor: "Dr. Patel", tech: "JM",
          notes: "Lab results ready at the front desk.", timer: activeTimer(47)
        }),
        demoRoom("demo-room-2", "Room 2", {
          patientName: "J. Nguyen", reason: "In Treatment", colorLabelId: "demo-treatment", doctor: "Dr. Reyes", tech: "AR",
          doctorReady: true, timer: activeTimer(24)
        }),
        demoRoom("demo-room-3", "Room 3", {
          patientName: "M. Ortiz", reason: "Needs Doctor", colorLabelId: "demo-doctor", doctor: "Dr. Reyes", tech: "AR",
          notes: "Consent signed. Pre-procedure vitals complete.", timer: activeTimer(12)
        }),
        demoRoom("demo-room-4", "Room 4", {
          reason: "Discharge", colorLabelId: "demo-discharge", needsCleaning: true, cleaningTimer: activeTimer(9)
        }),
        demoRoom("demo-room-5", "Room 5", {
          patientName: "C. Wells", reason: "Waiting", colorLabelId: "demo-waiting", doctor: "Dr. Morgan", tech: "SP",
          roomReady: true, timer: activeTimer(31)
        }),
        demoRoom("demo-room-6", "Room 6"),
        demoRoom("demo-room-7", "Room 7", {
          patientName: "D. Flynn", reason: "In Treatment", colorLabelId: "demo-treatment", doctor: "Dr. Morgan", tech: "SP",
          timer: activeTimer(7)
        }),
        demoRoom("demo-room-8", "Room 8"),
        demoRoom("demo-room-9", "Room 9")
      ]
    };
  };
})();

/* RoomBoard marketing site — interactions */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---------- Theme ---------- */
  var stored = null;
  try { stored = localStorage.getItem("rb-theme"); } catch (e) {}
  if (stored) {
    root.setAttribute("data-theme", stored);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    root.setAttribute("data-theme", "dark");
  }
  var themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("rb-theme", next); } catch (e) {}
    });
  }

  /* ---------- Nav shadow on scroll + back-to-top ---------- */
  var nav = document.getElementById("nav");
  var toTop = document.getElementById("toTop");
  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle("scrolled", y > 8);
    if (toTop) toTop.classList.toggle("show", y > 600);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* ---------- Mobile menu ---------- */
  var menuBtn = document.getElementById("menuBtn");
  var mobileMenu = document.getElementById("mobileMenu");
  function closeMenu() { if (mobileMenu) mobileMenu.classList.remove("open"); }
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", function () { mobileMenu.classList.toggle("open"); });
    mobileMenu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") closeMenu();
    });
  }

  /* ---------- Scroll reveal ---------- */
  var revealEls = [].slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- FAQ accordion ---------- */
  [].slice.call(document.querySelectorAll(".qa-q")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var qa = btn.closest(".qa");
      var ans = qa.querySelector(".qa-a");
      var isOpen = qa.classList.contains("open");
      // close siblings
      [].slice.call(document.querySelectorAll(".qa.open")).forEach(function (other) {
        if (other !== qa) {
          other.classList.remove("open");
          other.querySelector(".qa-a").style.maxHeight = null;
        }
      });
      if (isOpen) {
        qa.classList.remove("open");
        ans.style.maxHeight = null;
      } else {
        qa.classList.add("open");
        ans.style.maxHeight = ans.scrollHeight + "px";
      }
    });
  });

  /* ---------- Settings tabs demo ---------- */
  var tabbar = document.getElementById("tabbar");
  if (tabbar) {
    tabbar.addEventListener("click", function (e) {
      var t = e.target.closest(".t");
      if (!t) return;
      [].slice.call(tabbar.querySelectorAll(".t")).forEach(function (x) { x.classList.remove("active"); });
      t.classList.add("active");
      var panels = document.querySelectorAll("#tabsDemo .panel");
      [].slice.call(panels).forEach(function (p) { p.classList.add("hidden"); });
      var target = document.getElementById(t.getAttribute("data-p"));
      if (target) target.classList.remove("hidden");
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Live board demo ---------- */
  var grid = document.getElementById("bdGrid");
  if (grid) {
    // Visit types with soft color fills (the whole tile fills with this color).
    var TYPES = {
      exam:      { label: "Exam",      c: "#5fae7e" },
      followup:  { label: "Follow-up", c: "#4a9fd0" },
      procedure: { label: "Procedure", c: "#e7727f" },
      consult:   { label: "Consult",   c: "#9a86e0" },
      workin:    { label: "Work-In",   c: "#46b0b7" }
    };
    // Doctor -> animal badge + initials, like the real board (turtle "LS").
    var BASE = "../public/roomboard/";
    var DOCS = {
      "Dr. Maro":   { img: BASE + "seaturtle-badge.png", init: "JM" },
      "Dr. Reyes":  { img: BASE + "strawberry-badge.png", init: "AR" },
      "Dr. Okafor": { img: BASE + "crab-badge.png", init: "MO" },
      "Dr. Park":   { img: BASE + "french-bulldog-badge.png", init: "SP" },
      "Dr. Hahn":   { img: BASE + "flower-badge.png", init: "EH" }
    };
    var TIMER_WARN = 20 * 60;   // amber
    var TIMER_ALERT = 45 * 60;  // red border + red timer

    var rooms = [
      { name: "Room 1", patient: "R. Patel",  doc: "Dr. Maro",   type: "exam",      secs: 72 * 60 + 14, state: "active" },
      { name: "Room 2", patient: "J. Nguyen", doc: "Dr. Reyes",  type: "followup",  secs: 24 * 60 + 8,  state: "active" },
      { name: "Room 3", patient: "M. Ortiz",  doc: "Dr. Okafor", type: "procedure", secs: 8 * 60 + 33,  state: "active" },
      { name: "Room 4", patient: "",          doc: "",           type: "exam",      secs: 0,            state: "empty" }
    ];

    function fmt(secs) {
      var p = function (n) { return (n < 10 ? "0" : "") + n; };
      return p(Math.floor(secs / 3600)) + ":" + p(Math.floor((secs % 3600) / 60)) + ":" + p(secs % 60);
    }

    function esc(s) {
      return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
    }

    // Readable text color for a fill (mirrors the app's contrast pick).
    function readableText(hex) {
      var h = hex.replace("#", "");
      if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
      var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.58 ? "#12233b" : "#ffffff";
    }

    function render() {
      grid.innerHTML = "";
      rooms.forEach(function (r) {
        var ty = TYPES[r.type] || TYPES.exam;
        var el = document.createElement("article");
        var alert = r.state === "active" && r.secs > TIMER_ALERT;
        var warn = r.state === "active" && r.secs > TIMER_WARN && !alert;
        el.className = "room" + (r.state === "empty" ? " empty" : "") + (r.state === "cleaning" ? " cleaning" : "") + (alert ? " alert" : "");
        if (r.state === "active") {
          el.style.setProperty("--c", ty.c);
          el.style.color = readableText(ty.c);
        }

        var icons = '<span class="roomIcons">🐾 ↪ ▤</span>';
        var top = '<div class="roomTop"><span class="roomName">' + esc(r.name) + '</span>' + icons + '</div>';

        var body;
        if (r.state === "empty") {
          body = '<div class="roomBody"><span class="roomEmptyText">Empty</span>'
            + '<div class="roomFoot"><span class="timer">' + fmt(0) + '</span></div></div>';
        } else if (r.state === "cleaning") {
          body = '<div class="roomBody"><span class="roomCleanPill">NEEDS TO BE CLEANED</span>'
            + '<div class="roomFoot"><span class="timer">' + fmt(r.secs) + '</span></div></div>';
        } else {
          var d = DOCS[r.doc] || { img: BASE + "seaturtle-badge.png", init: "DR" };
          var info = esc(r.patient) + '<span class="sep">•</span>' + esc(ty.label) + '<span class="sep">•</span>' + esc(r.doc);
          var badge = '<span class="docBadge"><img alt="" src="' + d.img
            + '" onerror="this.parentNode.classList.add(\'fallback\');this.remove();">'
            + '<span class="docBadgeInit">' + d.init + '</span></span>';
          body = '<div class="roomBody">'
            + '<span class="noteDock">📝</span>'
            + '<div class="roomInfoLine">' + info + '</div>'
            + '<div class="roomFoot"><span class="timer' + (alert ? " alert" : (warn ? " warn" : "")) + '">' + fmt(r.secs) + '</span>'
            + badge + '</div>'
            + '</div>';
        }
        el.innerHTML = top + body;
        grid.appendChild(el);
      });
    }
    render();

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      // tick running timers (active + cleaning) every second
      setInterval(function () {
        rooms.forEach(function (r) { if (r.state !== "empty") r.secs += 1; });
        render();
      }, 1000);

      // occasional live-feeling state changes
      var names = ["S. Rivera", "K. Adams", "T. Brooks", "L. Hayes", "D. Flynn", "C. Wells", "P. Shah"];
      var docKeys = Object.keys(DOCS);
      var typeKeys = Object.keys(TYPES);
      var flips = 0;
      setInterval(function () {
        var r = rooms[flips % rooms.length];
        flips++;
        if (r.state === "empty") {
          // patient checks in
          r.state = "active";
          r.patient = names[Math.floor(Math.random() * names.length)];
          r.doc = docKeys[Math.floor(Math.random() * docKeys.length)];
          r.type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
          r.secs = Math.floor(Math.random() * 5 * 60) + 30;
        } else if (r.state === "cleaning") {
          r.state = "empty"; r.secs = 0;
        } else if (r.secs > TIMER_ALERT && Math.random() > 0.5) {
          // long visit -> discharge -> needs cleaning
          r.state = "cleaning"; r.secs = Math.floor(Math.random() * 60) + 5;
        }
        render();
      }, 2800);
    }
  }
})();

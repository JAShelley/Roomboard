(function(){
  var AUTH_STORAGE_KEY = "roomboard.website.auth.v1";
  var standaloneClickBound = false;

  function getParams(){
    try{ return new URLSearchParams(window.location.search || ""); }catch(e){ return new URLSearchParams(""); }
  }

  function normalizeAuthMode(value){
    var mode = String(value || "").toLowerCase();
    return mode === "create" || mode === "signup" || mode === "sign-up" ? "create" : "login";
  }

  // Opt-in: when a link carries ?next=board, skip the Setup step and go
  // straight to the live board once the user is authenticated.
  function wantsBoard(){
    return String(getParams().get("next") || "").toLowerCase() === "board";
  }

  function getRoute(){
    var params = getParams();
    var mode = String(params.get("mode") || "").toLowerCase();
    var auth = params.get("auth");
    var standalone = mode === "startup"
      || mode === "setup"
      || mode === "login"
      || mode === "signup"
      || auth != null;
    return {
      mode: mode,
      authMode: normalizeAuthMode(auth || mode),
      standalone: standalone
    };
  }

  function hasSessionInStorage(storage){
    if(!storage) return false;
    try{
      var raw = storage.getItem(AUTH_STORAGE_KEY);
      if(!raw) return false;
      if(raw.indexOf("access_token") >= 0 || raw.indexOf("refresh_token") >= 0) return true;
      var parsed = JSON.parse(raw);
      return !!(parsed && (parsed.access_token || parsed.refresh_token || parsed.currentSession));
    }catch(e){
      return false;
    }
  }

  function hasStoredAuthSession(){
    return hasSessionInStorage(window.localStorage) || hasSessionInStorage(window.sessionStorage);
  }

  // Extract Supabase tokens from any storage format the client might use.
  function getStoredTokens(){
    var storages = [window.localStorage, window.sessionStorage];
    for(var i = 0; i < storages.length; i++){
      try{
        var raw = storages[i] && storages[i].getItem(AUTH_STORAGE_KEY);
        if(!raw) continue;
        var parsed = JSON.parse(raw);
        if(!parsed) continue;
        var sess = parsed.currentSession || parsed;
        if(sess && sess.access_token){
          return { accessToken: sess.access_token, refreshToken: sess.refresh_token || "" };
        }
      }catch(e){}
    }
    return null;
  }

  function setVisualStage(stage){
    var route = getRoute();
    if(!document.body) return;
    document.body.classList.toggle("roomboardStandaloneMode", route.standalone);
    document.body.classList.toggle("standaloneAuthMode", route.standalone && stage === "auth");
    document.body.classList.toggle("standaloneSetupMode", route.standalone && stage === "setup");
  }

  function openSettingsSurface(){
    if(typeof window.openRoomBoardSettingsDrawer === "function"){
      window.openRoomBoardSettingsDrawer();
    } else if(document.body) {
      document.body.classList.add("drawerOpen");
    }
  }

  function closeSettingsSurface(){
    if(typeof window.closeRoomBoardSettingsDrawer === "function"){
      window.closeRoomBoardSettingsDrawer();
    } else if(document.body) {
      document.body.classList.remove("drawerOpen");
    }
  }

  function activateSettingsTab(tabId){
    if(typeof window.activateRoomBoardSettingsTab === "function"){
      window.activateRoomBoardSettingsTab(tabId);
      return;
    }
    window.setTimeout(function(){ activateSettingsTab(tabId); }, 25);
  }

  function applyAuthMode(mode){
    var authMode = normalizeAuthMode(mode);
    if(typeof window.setRoomBoardAuthAccessMode === "function"){
      window.setRoomBoardAuthAccessMode(authMode);
      return;
    }
    var selector = '.authModeBtn[data-auth-mode="' + authMode + '"]';
    var btn = document.querySelector(selector);
    if(btn) btn.click();
  }

  function replaceMode(mode){
    try{
      var url = new URL(window.location.href);
      url.searchParams.set("mode", mode);
      url.searchParams.delete("auth");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }catch(e){}
  }

  function enterAuth(){
    var route = getRoute();
    if(!route.standalone) return;
    setVisualStage("auth");
    activateSettingsTab("tabAccount");
    applyAuthMode(route.authMode);
    openSettingsSurface();
  }

  function enterSetup(options){
    var route = getRoute();
    if(!route.standalone) return;
    setVisualStage("setup");
    activateSettingsTab("tabRooms");
    openSettingsSurface();
    if(!options || !options.keepUrl) replaceMode("setup");
  }

  /* ── Billing gate ──────────────────────────────────────────────────── */

  function injectPaywallStyles(){
    if(document.getElementById("rbPaywallStyles")) return;
    var style = document.createElement("style");
    style.id = "rbPaywallStyles";
    style.textContent = [
      "#rbPaywall{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;",
        "background:rgba(7,13,24,.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);",
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;padding:20px;}",
      ".rbPaywallCard{background:#0f1a2a;border:1px solid rgba(255,255,255,.1);border-radius:20px;",
        "padding:36px 40px;max-width:620px;width:100%;text-align:center;",
        "box-shadow:0 32px 64px rgba(0,0,0,.6);}",
      ".rbPaywallLogo{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:20px;}",
      ".rbPaywallLogoMark{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#3b82f6,#06b6d4);display:inline-block;}",
      ".rbPaywallLogo strong{font-size:17px;font-weight:700;color:#f0f6ff;letter-spacing:-.3px;}",
      "#rbPaywall h1{font-size:21px;font-weight:700;color:#f0f6ff;margin:0 0 8px;line-height:1.25;}",
      "#rbPaywall p{font-size:14px;color:#8ba8c4;margin:0 0 22px;line-height:1.5;}",
      /* toggle */
      ".rbPaywallToggle{display:inline-flex;background:rgba(255,255,255,.06);border-radius:10px;padding:3px;margin-bottom:22px;gap:2px;}",
      ".rbPaywallToggleBtn{background:none;border:none;color:#8ba8c4;font-size:13px;font-weight:600;",
        "padding:7px 16px;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:background .15s,color .15s;}",
      ".rbPaywallToggleBtn.active{background:#1e3a5f;color:#e0f0ff;}",
      ".rbPaywallSaveBadge{font-size:10px;font-weight:700;background:#10b981;color:#fff;",
        "border-radius:99px;padding:2px 6px;letter-spacing:.02em;}",
      /* tiers */
      ".rbPaywallTiers{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;}",
      "@media(max-width:480px){.rbPaywallTiers{grid-template-columns:1fr;}}",
      ".rbPaywallTier{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);",
        "border-radius:14px;padding:20px;text-align:left;position:relative;}",
      ".rbPaywallTierFeatured{border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.08);}",
      ".rbPaywallTierBadge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);",
        "background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-size:11px;font-weight:700;",
        "padding:3px 12px;border-radius:99px;white-space:nowrap;}",
      ".rbPaywallTierName{font-size:13px;font-weight:700;color:#8ba8c4;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;}",
      ".rbPaywallTierPrice{display:flex;align-items:baseline;gap:4px;margin-bottom:14px;}",
      ".rbPaywallAmount{font-size:28px;font-weight:800;color:#f0f6ff;}",
      ".rbPaywallPer{font-size:13px;color:#8ba8c4;}",
      ".rbPaywallFeatures{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:6px;}",
      ".rbPaywallFeatures li{font-size:13px;color:#c8daf0;padding-left:18px;position:relative;}",
      ".rbPaywallFeatures li::before{content:'✓';position:absolute;left:0;color:#3b82f6;font-weight:700;}",
      /* buttons */
      ".rbPaywallBtn{width:100%;padding:11px 16px;border-radius:10px;font-size:14px;font-weight:600;",
        "border:none;cursor:pointer;transition:opacity .15s;}",
      ".rbPaywallBtn:disabled{opacity:.6;cursor:default;}",
      ".rbPaywallBtnPrimary{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;}",
      ".rbPaywallBtnPrimary:hover:not(:disabled){opacity:.9;}",
      ".rbPaywallBtnSecondary{background:rgba(255,255,255,.06);color:#c8daf0;border:1px solid rgba(255,255,255,.12);}",
      ".rbPaywallBtnSecondary:hover:not(:disabled){background:rgba(255,255,255,.1);}",
      ".rbPaywallFooter{display:flex;justify-content:center;gap:20px;}",
      ".rbPaywallLink{background:none;border:none;color:#8ba8c4;font-size:13px;cursor:pointer;padding:4px 0;",
        "text-decoration:underline;text-underline-offset:3px;}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
  }

  function showPaywall(info){
    injectPaywallStyles();
    var el = document.getElementById("rbPaywall");
    if(el) el.parentNode.removeChild(el);

    var overlay = document.createElement("div");
    overlay.id = "rbPaywall";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Subscription required");

    var heading, sub;
    if(info.trialing && info.trialDaysLeft > 0){
      heading = "Choose a plan to continue.";
      sub = info.trialDaysLeft + " day" + (info.trialDaysLeft === 1 ? "" : "s") + " left in your free trial.";
    } else {
      heading = "Your free trial has ended.";
      sub = "Subscribe to restore access to your clinic board.";
    }

    var manageHtml = info.hasCustomer
      ? '<button class="rbPaywallLink" data-action="portal">Manage billing</button>'
      : "";

    overlay.innerHTML = [
      '<div class="rbPaywallCard">',
      '  <div class="rbPaywallLogo"><span class="rbPaywallLogoMark"></span><strong>RoomBoard</strong></div>',
      '  <h1>' + heading + '</h1>',
      '  <p>' + sub + '</p>',
      '  <div class="rbPaywallToggle" role="group" aria-label="Billing period">',
      '    <button class="rbPaywallToggleBtn active" data-period="monthly">Monthly</button>',
      '    <button class="rbPaywallToggleBtn" data-period="annual">Annual <span class="rbPaywallSaveBadge">save 17%</span></button>',
      '  </div>',
      '  <div class="rbPaywallTiers">',
      '    <div class="rbPaywallTier">',
      '      <div class="rbPaywallTierName">Base</div>',
      '      <div class="rbPaywallTierPrice"><span class="rbPaywallAmount" data-monthly="$4.99" data-annual="$49.99">$4.99</span><span class="rbPaywallPer" data-monthly="/ mo" data-annual="/ yr">/ mo</span></div>',
      '      <ul class="rbPaywallFeatures">',
      '        <li>Live room board</li>',
      '        <li>Timers &amp; alerts</li>',
      '        <li>Doctor badges</li>',
      '        <li>Quick notes</li>',
      '      </ul>',
      '      <button class="rbPaywallBtn rbPaywallBtnSecondary" data-plan="base-monthly">Get Base</button>',
      '    </div>',
      '    <div class="rbPaywallTier rbPaywallTierFeatured">',
      '      <div class="rbPaywallTierBadge">Most popular</div>',
      '      <div class="rbPaywallTierName">Advanced</div>',
      '      <div class="rbPaywallTierPrice"><span class="rbPaywallAmount" data-monthly="$9.99" data-annual="$99.99">$9.99</span><span class="rbPaywallPer" data-monthly="/ mo" data-annual="/ yr">/ mo</span></div>',
      '      <ul class="rbPaywallFeatures">',
      '        <li>Everything in Base</li>',
      '        <li>Desktop capture app</li>',
      '        <li>Stats &amp; history</li>',
      '        <li>Priority support</li>',
      '      </ul>',
      '      <button class="rbPaywallBtn rbPaywallBtnPrimary" data-plan="advanced-monthly">Get Advanced</button>',
      '    </div>',
      '  </div>',
      '  <div class="rbPaywallFooter">',
      '    ' + manageHtml,
      '    <button class="rbPaywallLink" data-action="signout">Sign out</button>',
      '  </div>',
      '</div>'
    ].join("\n");

    // Period toggle wires up price display and button plan attributes
    overlay.addEventListener("click", function(e){
      var toggleBtn = e.target && e.target.closest ? e.target.closest(".rbPaywallToggleBtn") : null;
      if(toggleBtn){
        var period = toggleBtn.getAttribute("data-period");
        overlay.querySelectorAll(".rbPaywallToggleBtn").forEach(function(b){ b.classList.toggle("active", b === toggleBtn); });
        overlay.querySelectorAll(".rbPaywallAmount").forEach(function(el){ el.textContent = el.getAttribute("data-" + period) || el.textContent; });
        overlay.querySelectorAll(".rbPaywallPer").forEach(function(el){ el.textContent = el.getAttribute("data-" + period) || el.textContent; });
        var baseBtn = overlay.querySelector("[data-plan^='base']");
        var advBtn  = overlay.querySelector("[data-plan^='advanced']");
        if(baseBtn) baseBtn.setAttribute("data-plan", "base-" + period);
        if(advBtn)  advBtn.setAttribute("data-plan", "advanced-" + period);
        return;
      }
      var btn = e.target && e.target.closest ? e.target.closest("[data-plan],[data-action]") : null;
      if(!btn) return;
      var plan   = btn.getAttribute("data-plan");
      var action = btn.getAttribute("data-action");
      if(plan)                    startCheckout(plan, btn);
      if(action === "portal")     openBillingPortal();
      if(action === "signout")    billingSignOut();
    });

    document.body.appendChild(overlay);
  }

  function hidePaywall(){
    var el = document.getElementById("rbPaywall");
    if(el) el.parentNode.removeChild(el);
  }

  function startCheckout(plan, btn){
    var tokens = getStoredTokens();
    if(!tokens){ enterAuth(); return; }
    if(btn){ btn.disabled = true; btn.querySelector("span") && (btn.querySelector("span").textContent = "Loading…"); }
    var returnUrl = (window.location.origin || "") + "/roomboard/index.html?mode=startup&next=board";
    fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: plan, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, returnUrl: returnUrl })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){ if(data.url) window.location.href = data.url; })
    .catch(function(){ if(btn){ btn.disabled = false; } });
  }

  function openBillingPortal(){
    var tokens = getStoredTokens();
    if(!tokens) return;
    fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, returnUrl: window.location.href })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){ if(data.url) window.location.href = data.url; })
    .catch(function(){});
  }

  function billingSignOut(){
    try{ window.localStorage.removeItem(AUTH_STORAGE_KEY); }catch(e){}
    try{ window.sessionStorage.removeItem(AUTH_STORAGE_KEY); }catch(e){}
    window.location.href = "/roomboard/index.html?mode=startup&auth=login";
  }

  // Check /api/billing/status and call onAccess() if the practice has access;
  // show the paywall otherwise. On network error, allow access so legitimate
  // users are never blocked by a transient failure.
  function checkBillingThenOpen(onAccess){
    var tokens = getStoredTokens();
    if(!tokens){ onAccess(); return; }
    fetch("/api/billing/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(data.hasAccess){
        hidePaywall();
        onAccess();
      } else {
        showPaywall({
          trialing: !!data.trialing,
          trialDaysLeft: data.trialDaysLeft || 0,
          subscribed: !!data.subscribed,
          hasCustomer: !!data.hasCustomer
        });
      }
    })
    .catch(function(){ onAccess(); });
  }

  /* ── Board open ────────────────────────────────────────────────────── */

  function openBoard(){
    if(typeof window.roomboardCanOpenBoard === "function" && !window.roomboardCanOpenBoard()){
      return;
    }
    // Gate the board behind an active trial or subscription.
    checkBillingThenOpen(function(){
      if(document.body){
        document.body.classList.remove("roomboardStandaloneMode", "standaloneAuthMode", "standaloneSetupMode");
      }
      closeSettingsSurface();
      replaceMode("board");
      window.setTimeout(function(){
        if(typeof window.scheduleActiveDisplayFit === "function"){
          window.scheduleActiveDisplayFit("standalone-open-board");
        }
      }, 0);
    });
  }

  function bindOpenBoardButtons(){
    if(standaloneClickBound) return;
    standaloneClickBound = true;
    document.addEventListener("click", function(event){
      var target = event.target && event.target.closest ? event.target.closest(".standaloneOpenBoardBtn") : null;
      if(!target) return;
      event.preventDefault();
      openBoard();
    });
  }

  function syncInitialRoute(){
    var route = getRoute();
    if(!route.standalone) return;
    if((route.mode === "setup" || route.mode === "startup") && hasStoredAuthSession()){
      if(wantsBoard()){ openBoard(); return; }
      enterSetup({ keepUrl: route.mode === "setup" });
      return;
    }
    enterAuth();
  }

  window.roomboardStandaloneFlow = {
    enterAuth: enterAuth,
    enterSetup: enterSetup,
    openBoard: openBoard,
    onAuthState: function(state){
      var route = getRoute();
      if(!route.standalone) return;
      if(state && state.loggedIn && state.hasPractice){
        if(wantsBoard()) openBoard();
        else enterSetup();
      } else {
        enterAuth();
      }
    }
  };

  bindOpenBoardButtons();
  (function primeVisualStage(){
    var route = getRoute();
    if(!route.standalone) return;
    if((route.mode === "setup" || route.mode === "startup") && hasStoredAuthSession()){
      if(wantsBoard()) return; // avoid flashing Setup before openBoard runs
      setVisualStage("setup");
    } else {
      setVisualStage("auth");
    }
  })();
  window.setTimeout(syncInitialRoute, 0);
})();

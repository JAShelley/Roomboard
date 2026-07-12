    // ===== Supabase auth + sync =====
    function supabaseConfigured(){
      return SUPABASE_URL && SUPABASE_URL.indexOf("http") === 0 && SUPABASE_PUBLIC_KEY && SUPABASE_PUBLIC_KEY.length > 30;
    }


    function isoNow(){ return new Date().toISOString(); }

    function delay(ms){
      return new Promise(function(resolve){ setTimeout(resolve, ms); });
    }

    function getErrorMessage(err){
      if(!err) return "Unknown error";
      if(typeof err === "string") return err;
      var parts = [];
      if(err.code) parts.push("code " + err.code);
      if(err.message) parts.push(err.message);
      if(err.details) parts.push(err.details);
      if(err.hint) parts.push("Hint: " + err.hint);
      if(parts.length) return parts.join(" | ");
      try{ return JSON.stringify(err); }catch(e){}
      return String(err);
    }

    var PRACTICE_SETTINGS_BASE_SELECT = "practice_id, board_columns, show_only_active, board_view, highlight_doctor_id";
    var PRACTICE_SETTINGS_DEFAULT_APPOINTMENT_TYPE_COLUMN = "default_appointment_type_id";
    var practiceSettingsDefaultAppointmentTypeColumnAvailable = true;

    function getPracticeSettingsSelect(){
      return PRACTICE_SETTINGS_BASE_SELECT
        + (practiceSettingsDefaultAppointmentTypeColumnAvailable ? ", " + PRACTICE_SETTINGS_DEFAULT_APPOINTMENT_TYPE_COLUMN : "");
    }

    function getSupabaseErrorText(err){
      if(!err) return "";
      return String([
        err.code || "",
        err.message || "",
        err.details || "",
        err.hint || "",
        err.error_description || "",
        err.error || ""
      ].join(" ")).toLowerCase();
    }

    function isMissingPracticeSettingsDefaultAppointmentTypeColumnError(err){
      var text = getSupabaseErrorText(err);
      return text.indexOf(PRACTICE_SETTINGS_DEFAULT_APPOINTMENT_TYPE_COLUMN) >= 0
        && (text.indexOf("does not exist") >= 0
          || text.indexOf("could not find") >= 0
          || text.indexOf("schema cache") >= 0
          || String(err && err.code || "") === "PGRST204");
    }

    function getPracticeScope(){
      return currentPracticeId || "guest";
    }

    function getStateStorageKey(scope){
      return STORAGE_KEY_PREFIX + "." + (scope || "guest");
    }

    function getRememberMePreference(){
      try{
        var raw = localStorage.getItem(REMEMBER_ME_STORAGE_KEY);
        if(raw == null || raw === "") return true;
        return raw === "1";
      }catch(e){
        return true;
      }
    }

    function setRememberMePreference(enabled){
      try{
        localStorage.setItem(REMEMBER_ME_STORAGE_KEY, enabled ? "1" : "0");
      }catch(e){}
      var checkbox = $("rememberMe");
      if(checkbox) checkbox.checked = !!enabled;
    }

    function getPreferredAuthStorage(){
      try{
        return getRememberMePreference() ? window.localStorage : window.sessionStorage;
      }catch(e){
        return window.localStorage;
      }
    }

    function createAuthStorageAdapter(){
      return {
        getItem: function(key){
          try{
            return getPreferredAuthStorage().getItem(key);
          }catch(e){
            return null;
          }
        },
        setItem: function(key, value){
          try{
            getPreferredAuthStorage().setItem(key, value);
          }catch(e){}
        },
        removeItem: function(key){
          try{
            window.localStorage.removeItem(key);
          }catch(e){}
          try{
            window.sessionStorage.removeItem(key);
          }catch(e){}
        }
      };
    }

    function syncAuthStoragePreference(){
      var remember = getRememberMePreference();
      var source = remember ? window.sessionStorage : window.localStorage;
      var target = remember ? window.localStorage : window.sessionStorage;
      try{
        var raw = source.getItem(AUTH_STORAGE_KEY);
        if(raw){
          target.setItem(AUTH_STORAGE_KEY, raw);
          source.removeItem(AUTH_STORAGE_KEY);
        }
      }catch(e){}
    }

	    var statsCoverageTimer = null;
	    var statsLoggingAvailable = true;
	    var lastKnownBoardUpdatedAtIso = null;
	    var lastKnownBoardUpdatedAtMs = 0;

	    function getBoardUpdatedAtMs(updatedAt){
	      var normalized = normalizeServerNowIso(updatedAt);
	      if(!normalized) return 0;
	      var parsed = Date.parse(normalized);
	      return isFinite(parsed) ? parsed : 0;
	    }

	    function rememberBoardVersion(updatedAt, options){
	      options = options || {};
	      var normalized = normalizeServerNowIso(updatedAt);
	      if(!normalized) return 0;
	      var parsed = Date.parse(normalized);
	      if(!isFinite(parsed)) return 0;
	      if(parsed >= lastKnownBoardUpdatedAtMs){
	        lastKnownBoardUpdatedAtMs = parsed;
	        lastKnownBoardUpdatedAtIso = normalized;
	      }
	      return parsed;
	    }

	    function resetKnownBoardVersion(){
	      lastKnownBoardUpdatedAtIso = null;
	      lastKnownBoardUpdatedAtMs = 0;
	    }

    function getSessionTechViewStorageKey(scope){
      return SESSION_TECH_VIEW_KEY_PREFIX + "." + (scope || "guest");
    }

    function updateClinicContextUi(){
      var authBanner = $("authBanner");
      var clinicLine = $("clinicContextLine");
      var statusLine = $("statusLine");
      if(authBanner){
        authBanner.textContent = currentPracticeName ? currentPracticeName.toUpperCase() : "NOT LOGGED IN";
        if(typeof applyPracticeNameBadgeVisibility === "function") applyPracticeNameBadgeVisibility();
        else authBanner.hidden = !currentPracticeName;
      }
      if(clinicLine){
        clinicLine.textContent = currentPracticeName
          ? ("Connected to " + currentPracticeName + ".")
          : "Not connected to a clinic yet.";
      }
      if(statusLine && currentPracticeName && statusLine.textContent === "Loading…"){
        statusLine.textContent = currentPracticeName + " ready.";
      }
    }

    function normalizeInviteCode(value){
      return String(value == null ? "" : value).toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    }

	    var authAccessMode = "login";
	    var currentPracticeInviteAdmin = false;

    function syncLoggedInSummary(){
      var wrap = $("loggedInSummary");
      var practiceField = $("loggedInPracticeName");
      var fullNameField = $("loggedInFullName");
      var emailField = $("loggedInEmail");
      var loggedIn = !!currentUserId;
      if(wrap){
        wrap.hidden = !loggedIn;
        wrap.style.display = loggedIn ? "flex" : "none";
      }
      if(practiceField) practiceField.value = currentPracticeName || "Not joined yet";
      if(fullNameField) fullNameField.value = currentUserFullName || "";
      if(emailField) emailField.value = currentUserEmail || "";
    }

	    function syncAuthAccessUi(loggedIn, hasPracticeLink){
	      var modeSwitch = $("authModeSwitch");
      var createFields = $("authCreateFields");
      var creds = $("authCredentialsFields");
      var rememberWrap = $("rememberMe") ? $("rememberMe").parentNode : null;
      var loginBtn = $("loginBtn");
      var signupBtn = $("signupBtn");
      var joinPanel = $("joinPracticePanel");
      var joinFields = $("joinPracticeFields");
      var joinActions = $("joinPracticeActions");
      var inviteBox = $("practiceInviteBox");
      var inviteActions = $("practiceInviteActions");
      var inviteStatus = $("practiceInviteCodeStatus");

      if(modeSwitch) modeSwitch.style.display = loggedIn ? "none" : "grid";
      if(createFields){
        createFields.hidden = loggedIn || authAccessMode !== "create";
        createFields.style.display = (loggedIn || authAccessMode !== "create") ? "none" : "grid";
      }
      if(creds){
        creds.hidden = loggedIn;
        creds.style.display = loggedIn ? "none" : "grid";
      }
      if(rememberWrap){
        rememberWrap.hidden = loggedIn;
        rememberWrap.style.display = loggedIn ? "none" : "flex";
      }
      if(loginBtn) loginBtn.style.display = !loggedIn && authAccessMode === "login" ? "inline-block" : "none";
      if(signupBtn) signupBtn.style.display = !loggedIn && authAccessMode === "create" ? "inline-block" : "none";
      if($("logoutBtn")) $("logoutBtn").style.display = loggedIn ? "inline-block" : "none";
      syncLoggedInSummary();

      if(joinPanel && !loggedIn){
        joinPanel.style.display = authAccessMode === "login" ? "block" : "none";
        if(joinFields) joinFields.hidden = false;
        if(joinActions) joinActions.hidden = false;
        if(inviteBox) inviteBox.hidden = true;
        if(inviteActions) inviteActions.hidden = true;
        if(inviteStatus) inviteStatus.hidden = true;
	      } else if(joinPanel && !hasPracticeLink) {
	        joinPanel.style.display = "none";
	      }
	    }

	    function canViewStopwatchDiagnostics(){
	      return !!(currentUserId && currentPracticeId && currentPracticeInviteAdmin);
	    }

	    function syncStopwatchDiagnosticsUi(){
	      var panel = $("stopwatchDiagnosticsPanel");
	      var statusEl = $("stopwatchDiagnosticsStatus");
	      var summaryEl = $("stopwatchDiagnosticsSummary");
	      var listEl = $("stopwatchDiagnosticsList");
	      if(!panel) return;
	      var canView = canViewStopwatchDiagnostics();
	      panel.hidden = !canView;
	      panel.style.display = canView ? "block" : "none";
	      if(canView) return;
	      panel.open = false;
	      if(statusEl) statusEl.textContent = "Clinic admins can open this section to run a stopwatch and stats self-check.";
	      if(summaryEl) summaryEl.innerHTML = "";
	      if(listEl) listEl.innerHTML = "";
	    }

	    window.syncStopwatchDiagnosticsUi = syncStopwatchDiagnosticsUi;

    function setAuthAccessMode(mode){
      authAccessMode = (mode === "create") ? "create" : "login";
      var switchWrap = $("authModeSwitch");
      if(switchWrap){
        Array.prototype.forEach.call(switchWrap.querySelectorAll(".authModeBtn"), function(btn){
          btn.classList.toggle("active", btn.getAttribute("data-auth-mode") === authAccessMode);
        });
      }
      syncAuthAccessUi(!!currentUserId, !!currentPracticeId);
    }

	    function setPracticeInviteUi(details){
      var panel = $("joinPracticePanel");
      var panelLabel = $("joinPracticePanelLabel");
      var panelHelp = $("joinPracticePanelHelp");
      var joinActions = $("joinPracticeActions");
      var inviteBox = $("practiceInviteBox");
      var inviteActions = $("practiceInviteActions");
      var input = $("practiceInviteCodeDisplay");
      var status = $("practiceInviteCodeStatus");
	      var copyBtn = $("copyPracticeInviteCodeBtn");
	      var rotateBtn = $("rotatePracticeInviteCodeBtn");
	      var inviteCode = details && details.invite_code ? String(details.invite_code) : "";
	      currentPracticeInviteAdmin = !!inviteCode;
	      if(panel) panel.style.display = inviteCode ? "block" : (currentPracticeId ? "none" : "block");
      if(panelLabel) panelLabel.textContent = inviteCode ? "Clinic invite code" : "Join existing clinic";
      if(panelHelp) panelHelp.textContent = inviteCode
        ? "Share this code with staff so they can join the same RoomBoard practice."
        : "If your clinic already has RoomBoard, create your user here with the clinic invite code.";
      if(joinActions) joinActions.hidden = !!inviteCode;
      if(inviteBox) inviteBox.hidden = !inviteCode;
      if(inviteActions) inviteActions.hidden = !inviteCode;
      if(input) input.value = inviteCode;
      if(copyBtn) copyBtn.disabled = !inviteCode;
      if(rotateBtn) rotateBtn.disabled = !inviteCode;
      if(status){
        status.hidden = !inviteCode;
        status.textContent = inviteCode
          ? "Share this code with teammates so they can join " + (currentPracticeName || "your clinic") + "."
          : "Only clinic admins can see and rotate the invite code.";
	      }
	      if(!inviteCode) syncAuthAccessUi(!!currentUserId, !!currentPracticeId);
	      syncStopwatchDiagnosticsUi();
	    }

    async function refreshPracticeInviteUi(){
      if(!supabase || !currentPracticeId){
        setPracticeInviteUi(null);
        return null;
      }
      try{
        var res = await supabase.rpc("get_my_practice_invite_details");
        if(res.error) throw res.error;
        var row = Array.isArray(res.data) ? (res.data[0] || null) : res.data;
        setPracticeInviteUi(row);
        return row;
      }catch(e){
        setPracticeInviteUi(null);
        return null;
      }
    }

    async function copyTextToClipboard(text){
      var value = String(text || "");
      if(!value) return false;
      try{
        if(navigator && navigator.clipboard && navigator.clipboard.writeText){
          await navigator.clipboard.writeText(value);
          return true;
        }
      }catch(e){}
      var probe = document.createElement("input");
      probe.type = "text";
      probe.value = value;
      document.body.appendChild(probe);
      probe.select();
      probe.setSelectionRange(0, value.length);
      var copied = false;
      try{
        copied = document.execCommand("copy");
      }catch(e){}
      document.body.removeChild(probe);
      return copied;
    }

    function isRetryableJoinSigninError(err){
      var msg = String(err && (err.message || err.code) || "").toLowerCase();
      return msg.indexOf("invalid login credentials") >= 0
        || msg.indexOf("email not confirmed") >= 0
        || msg.indexOf("invalid_credentials") >= 0
        || msg.indexOf("user not found") >= 0;
    }

    async function ensureSessionForJoin(email, password, fullName){
      var sessionRes = await supabase.auth.getSession();
      if(sessionRes && sessionRes.data && sessionRes.data.session) return sessionRes.data.session;

      var signInRes = await signInWithPasswordRobust(email, password);
      if(!(signInRes && signInRes.error)) return signInRes && signInRes.data ? signInRes.data.session : null;
      if(!isRetryableJoinSigninError(signInRes.error)) throw signInRes.error;

      var signUpRes = await withTimeout(supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName
          }
        }
      }), 15000, "Signup");
      if(signUpRes.error) throw signUpRes.error;
      if(!(signUpRes.data && signUpRes.data.session && signUpRes.data.user)){
        throw new Error("Sign up succeeded, but there is no active session yet. Disable email confirmation in Supabase Auth for the immediate clinic join flow.");
      }
      return signUpRes.data.session;
    }

    async function fetchClinicContext(){
      if(!supabase) return null;
      var userRes = await supabase.auth.getUser();
      if(userRes.error) throw userRes.error;
      var user = userRes && userRes.data ? userRes.data.user : null;
      if(!user) return null;
      currentUserId = user.id || null;
      currentUserEmail = String(user.email || "").trim();
      currentUserFullName = String(user.user_metadata && user.user_metadata.full_name || "").trim();

      var practiceIdRes = await supabase.rpc("get_my_practice_id");
      if(practiceIdRes.error) throw practiceIdRes.error;

      var practiceId = normalizePracticeId(practiceIdRes.data);
      var profileRow = null;
      if(!practiceId){
        var profileRes = await supabase
          .from("profiles")
          .select("practice_id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if(profileRes.error) throw profileRes.error;
        profileRow = profileRes && profileRes.data ? profileRes.data : null;
        if(profileRow && profileRow.full_name) currentUserFullName = String(profileRow.full_name || "").trim() || currentUserFullName;
        practiceId = normalizePracticeId(profileRow ? profileRow.practice_id : null);
      } else {
        var linkedProfileRes = await supabase
          .from("profiles")
          .select("practice_id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        if(linkedProfileRes.error) throw linkedProfileRes.error;
        profileRow = linkedProfileRes && linkedProfileRes.data ? linkedProfileRes.data : null;
        if(profileRow && profileRow.full_name) currentUserFullName = String(profileRow.full_name || "").trim() || currentUserFullName;
      }

      if(!practiceId){
        currentPracticeId = null;
        currentPracticeName = "";
        currentUserId = user && user.id ? user.id : null;
        resetKnownBoardVersion();
        window.__roomboardPracticeId = null;
        if(typeof window.setLastKnownPracticeId === "function") window.setLastKnownPracticeId(null);
        updateAuthUI(true);
        updateClinicContextUi();
        setPracticeInviteUi(null);
        setStatus("Logged in, but no valid clinic practice ID was found for this account.");
        setSyncUI("err", "No clinic");
        return null;
      }

      var practiceRes = await supabase
        .from("practices")
        .select("id, name")
        .eq("id", practiceId)
        .single();
      if(practiceRes.error) throw practiceRes.error;

      currentPracticeId = practiceRes.data.id;
      currentPracticeName = practiceRes.data.name || "";
      resetKnownBoardVersion();
      window.__roomboardPracticeId = currentPracticeId;
      if(typeof window.setLastKnownPracticeId === "function") window.setLastKnownPracticeId(currentPracticeId);
      lastPracticeConfigSignature = "";
      updateAuthUI(true);
      updateClinicContextUi();
      if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession();
      if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession();
      if(typeof window.refreshFeedbackChecklistForSession === "function") window.refreshFeedbackChecklistForSession();
      refreshPracticeInviteUi();
      return {
        userId: currentUserId,
        practiceId: currentPracticeId,
        practiceName: currentPracticeName
      };
    }

    function isMissingSettingsStorageError(err){
      if(!err) return false;
      var code = String(err.code || "");
      var text = getSupabaseErrorText(err);
      return code === "42P01"
        || code === "PGRST205"
        || text.indexOf("does not exist") >= 0
        || text.indexOf("could not find the table") >= 0
        || (text.indexOf("schema cache") >= 0
          && (text.indexOf("practice_default_settings") >= 0 || text.indexOf("user_settings") >= 0));
    }

    async function queryPracticeSettingsRow(practiceId){
      var res = await supabase
        .from("practice_settings")
        .select(getPracticeSettingsSelect())
        .eq("practice_id", practiceId)
        .maybeSingle();
      if(res.error && practiceSettingsDefaultAppointmentTypeColumnAvailable && isMissingPracticeSettingsDefaultAppointmentTypeColumnError(res.error)){
        practiceSettingsDefaultAppointmentTypeColumnAvailable = false;
        res = await supabase
          .from("practice_settings")
          .select(getPracticeSettingsSelect())
          .eq("practice_id", practiceId)
          .maybeSingle();
      }
      return res;
    }

    async function upsertPracticeSettingsRow(payload){
      var nextPayload = payload || {};
      var res = await supabase.from("practice_settings").upsert(nextPayload, { onConflict: "practice_id" });
      if(res.error && practiceSettingsDefaultAppointmentTypeColumnAvailable && isMissingPracticeSettingsDefaultAppointmentTypeColumnError(res.error)){
        practiceSettingsDefaultAppointmentTypeColumnAvailable = false;
        nextPayload = Object.assign({}, nextPayload);
        delete nextPayload.default_appointment_type_id;
        res = await supabase.from("practice_settings").upsert(nextPayload, { onConflict: "practice_id" });
      }
      return res;
    }

    async function loadPracticeDefaultSettingsRecord(){
      if(!supabase || !currentPracticeId) return null;
      var res = await supabase
        .from("practice_default_settings")
        .select("practice_id, settings")
        .eq("practice_id", currentPracticeId)
        .maybeSingle();
      if(res.error) throw res.error;
      return res.data || null;
    }

    async function loadUserSettingsRecord(){
      if(!supabase || !currentPracticeId || !currentUserId) return null;
      var res = await supabase
        .from("user_settings")
        .select("practice_id, user_id, settings")
        .eq("practice_id", currentPracticeId)
        .eq("user_id", currentUserId)
        .maybeSingle();
      if(res.error) throw res.error;
      return res.data || null;
    }

    async function savePracticeDefaultSettingsRecord(settingsSnapshot){
      if(!supabase || !currentPracticeId) return false;
      var res = await supabase.from("practice_default_settings").upsert({
        practice_id: currentPracticeId,
        settings: normalizePersistentSettings(settingsSnapshot)
      }, { onConflict: "practice_id" });
      if(res.error) throw res.error;
      return true;
    }

    async function saveUserSettingsRecord(settingsSnapshot, targetUserId){
      if(!supabase || !currentPracticeId || !targetUserId) return false;
      var res = await supabase.from("user_settings").upsert({
        practice_id: currentPracticeId,
        user_id: targetUserId,
        settings: normalizePersistentSettings(settingsSnapshot)
      }, { onConflict: "practice_id,user_id" });
      if(res.error) throw res.error;
      return true;
    }

    function setAuthBusy(isBusy, statusText){
      var loginBtn = $("loginBtn");
      var signupBtn = $("signupBtn");
      var joinBtn = $("joinPracticeBtn");
      var modeSwitch = $("authModeSwitch");
      var logoutBtn = $("logoutBtn");
      if(loginBtn) loginBtn.disabled = !!isBusy;
      if(signupBtn) signupBtn.disabled = !!isBusy;
      if(joinBtn) joinBtn.disabled = !!isBusy;
      if(modeSwitch){
        Array.prototype.forEach.call(modeSwitch.querySelectorAll(".authModeBtn"), function(btn){
          btn.disabled = !!isBusy;
        });
      }
      if(logoutBtn) logoutBtn.disabled = !!isBusy;
      if(statusText) setStatus(statusText);
    }

    async function withTimeout(promise, ms, label){
      var timeoutMs = Math.max(1, Number(ms || 1));
      var timer = null;
      try{
        return await Promise.race([
          promise,
          new Promise(function(_, reject){
            timer = setTimeout(function(){
              reject(new Error((label || "Request") + " timed out after " + timeoutMs + "ms"));
            }, timeoutMs);
          })
        ]);
      } finally {
        if(timer) clearTimeout(timer);
      }
    }

    async function parseJsonSafe(response){
      try{
        return await response.json();
      }catch(e){
        return null;
      }
    }

    async function probeSupabaseProjectKey(){
      try{
        await withTimeout(fetch(
          SUPABASE_URL.replace(/\/+$/,"") + "/auth/v1/health",
          {
            method: "GET",
            headers: {
              "apikey": SUPABASE_PUBLIC_KEY
            }
          }
        ), 6000, "Supabase auth health");
        return true;
      }catch(e){
        return false;
      }
    }

    async function signInWithPasswordRobust(email, password){
      try{
        return await withTimeout(
          supabase.auth.signInWithPassword({ email: email, password: password }),
          8000,
          "Login"
        );
      }catch(primaryError){
        var primaryMessage = getErrorMessage(primaryError);
        if(primaryMessage.toLowerCase().indexOf("timed out") === -1) throw primaryError;

        if(!await probeSupabaseProjectKey()){
          throw new Error("Supabase is reachable, but this project key is not responding. Check the project's API key or project health in Supabase.");
        }

        setStatus("Primary login timed out. Trying direct auth…");

        var response = await withTimeout(fetch(
          SUPABASE_URL.replace(/\/+$/,"") + "/auth/v1/token?grant_type=password",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": SUPABASE_PUBLIC_KEY
            },
            body: JSON.stringify({
              email: email,
              password: password
            })
          }
        ), 12000, "Direct login");

        var payload = await parseJsonSafe(response);
        if(!response.ok){
          throw new Error(
            (payload && (payload.msg || payload.error_description || payload.error)) ||
            ("Direct login failed with status " + response.status)
          );
        }
        if(!payload || !payload.access_token || !payload.refresh_token){
          throw new Error("Direct login returned an incomplete session.");
        }

        var sessionRes = await withTimeout(
          supabase.auth.setSession({
            access_token: payload.access_token,
            refresh_token: payload.refresh_token
          }),
          10000,
          "Store login session"
        );
        if(sessionRes.error) throw sessionRes.error;
        return sessionRes;
      }
    }

    async function resolveClinicContextWithRetry(attempts, waitMs){
      var tries = Math.max(1, Number(attempts || 1));
      var pause = Math.max(0, Number(waitMs || 0));
      var lastError = null;
      for(var i=0;i<tries;i++){
        try{
          var context = await fetchClinicContext();
          if(context && context.practiceId) return context;
        }catch(e){
          lastError = e;
        }
        if(i < tries - 1) await delay(pause);
      }
      if(lastError) throw lastError;
      return null;
    }

    async function finishAuthenticatedFlow(options){
      options = options || {};
      var context = await resolveClinicContextWithRetry(options.attempts || 6, options.waitMs || 250);
      if(!context || !context.practiceId){
        setStatus("Logged in, but no clinic was linked to this account.");
        setSyncUI("err", "No clinic");
        return false;
      }
      if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession();
      if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession();
      await loadPracticeData();
      return true;
    }

    var authRecoveryCooldownUntil = 0;

    function hasRecoverableAuthSnapshot(){
      try{
        if(typeof hasStoredAuthSessionSnapshot === "function") return hasStoredAuthSessionSnapshot();
      }catch(e){}
      try{
        var localRaw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if(localRaw && localRaw !== "null") return true;
      }catch(e){}
      try{
        var sessionRaw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
        if(sessionRaw && sessionRaw !== "null") return true;
      }catch(e){}
      return false;
    }

    function clearStoredAuthSessionSnapshot(){
      try{ window.localStorage.removeItem(AUTH_STORAGE_KEY); }catch(e){}
      try{ window.sessionStorage.removeItem(AUTH_STORAGE_KEY); }catch(e){}
    }

    function isTerminalAuthRecoveryError(err){
      var msg = String(err && (err.message || err.error_description || err.details || err.name) || err || "").toLowerCase();
      return msg.indexOf("auth session missing") >= 0
        || msg.indexOf("refresh token not found") >= 0
        || msg.indexOf("invalid refresh token") >= 0
        || msg.indexOf("error finding refresh token") >= 0
        || msg.indexOf("missing refresh token") >= 0;
    }

	    async function hasAuthenticatedSession(){
	      if(!supabase) return false;
	      await refreshSupabaseSessionIfNeeded("session-check");
	      var sess = await supabase.auth.getSession();
	      if(sess && sess.data && sess.data.session) return true;
        return await recoverSupabaseSession("session-check");
	    }

    async function recoverSupabaseSession(reason){
      if(!supabase) return false;
      if(!hasRecoverableAuthSnapshot()) return false;
      if(Date.now() < authRecoveryCooldownUntil) return false;
      if(authRecoveryInFlight) return await authRecoveryInFlight;
      authRecoveryInFlight = (async function(){
        var lastError = null;
        try{
          var refreshed = await withTimeout(supabase.auth.refreshSession(), 8000, "Session recovery");
          if(refreshed && refreshed.error) throw refreshed.error;
          if(refreshed && refreshed.data && refreshed.data.session){
            authRecoveryCooldownUntil = 0;
            updateAuthUI(true);
            return true;
          }
        }catch(e){
          lastError = e;
        }
        try{
          var sess = await supabase.auth.getSession();
          if(sess && sess.data && sess.data.session){
            authRecoveryCooldownUntil = 0;
            updateAuthUI(true);
            return true;
          }
        }catch(e2){
          if(!lastError) lastError = e2;
        }
        if(lastError){
          console.warn("Session recovery failed (" + (reason || "unknown") + "):", lastError);
          if(isTerminalAuthRecoveryError(lastError)){
            clearStoredAuthSessionSnapshot();
            authRecoveryCooldownUntil = Date.now() + 5 * 60 * 1000;
          } else {
            authRecoveryCooldownUntil = Date.now() + 60 * 1000;
          }
        }
        return false;
      })();
      try{
        return await authRecoveryInFlight;
      } finally {
        authRecoveryInFlight = null;
      }
    }

    async function requireAuthenticatedSession(context){
      // The public interactive demo deliberately has no Supabase client or
      // clinic session. Demo edits stay in memory, so they should quietly
      // skip auth-only sync and statistics work rather than report an error.
      if(window.__roomboardInteractiveDemo) return false;
      if(!supabase){
        setStatus("Supabase not ready.");
        setSyncUI("err", "Init needed");
        return false;
      }
      try{
        if(await hasAuthenticatedSession()) return true;
        setStatus("Log in to load clinic data.");
        setSyncUI("idle", "Guest");
        return false;
      }catch(e){
        var msg = getErrorMessage(e);
        setStatus((context || "Clinic auth check") + " failed: " + msg);
        setSyncUI("err", "Auth error");
        return false;
      }
    }

    function isUuidLike(value){
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
    }

    function isMissingPracticeIdColumnError(err){
      if(!err) return false;
      var msg = String(err.message || err.details || err.hint || "").toLowerCase();
      return msg.indexOf("practice_id") >= 0
        && (msg.indexOf("column") >= 0 || msg.indexOf("schema cache") >= 0 || msg.indexOf("could not find") >= 0);
    }

    function isMissingStatsTableError(err){
      if(!err) return false;
      if(String(err.code || "") === "42P01") return true;
      var msg = String(err.message || err.details || err.hint || "").toLowerCase();
      if(msg.indexOf("does not exist") < 0) return false;
      return msg.indexOf("room_sessions") >= 0 || msg.indexOf("cleaning_sessions") >= 0;
    }

    function disableStatsLogging(err){
      statsLoggingAvailable = false;
      setStatus("Run the RoomBoard stats SQL so room and cleaning timers count in statistics.");
      setSyncUI("err", "Stats setup");
      console.warn("Stats logging disabled until stats tables are installed:", err);
    }

    async function insertStatsSession(tableName, payload){
      var insertRes = await supabase.from(tableName).insert(payload).select("id").single();
      if(!(insertRes && insertRes.error)) return insertRes;
      if(payload && Object.prototype.hasOwnProperty.call(payload, "practice_id") && isMissingPracticeIdColumnError(insertRes.error)){
        var fallbackPayload = {};
        for(var key in payload){
          if(!Object.prototype.hasOwnProperty.call(payload, key) || key === "practice_id") continue;
          fallbackPayload[key] = payload[key];
        }
        return await supabase.from(tableName).insert(fallbackPayload).select("id").single();
      }
      return insertRes;
    }

    async function ensurePracticeContextForStats(context){
      if(currentPracticeId) return currentPracticeId;
      try{
        var clinicContext = await fetchClinicContext();
        if(clinicContext && clinicContext.practiceId){
          return clinicContext.practiceId;
        }
      }catch(e){
        console.warn("Stats practice lookup failed (" + (context || "unknown") + "):", e);
      }
      setStatus("Stats logging needs a clinic-linked account.");
      setSyncUI("err", "No clinic");
      return null;
    }

	    function persistSessionTrackingState(){
	      saveLocal();
	      if(supabase && currentPracticeId) scheduleRemoteSave("board", { immediate: true });
	    }

	    function deriveTimerStartedAtIso(timer, fallbackNowIso){
	      var normalizedNowIso = normalizeServerNowIso(fallbackNowIso) || getEstimatedServerNowIso();
	      if(timer && timer.startedAtIso){
	        var normalizedStartedIso = normalizeServerNowIso(timer.startedAtIso);
	        if(normalizedStartedIso) return normalizedStartedIso;
	      }
	      var nowMs = Date.parse(normalizedNowIso);
	      if(!isFinite(nowMs)) return normalizedNowIso;
	      var elapsedMs = Math.max(0, Number(computeElapsed(timer, normalizedNowIso) || 0));
	      if(!elapsedMs) return normalizedNowIso;
	      return new Date(Math.max(0, nowMs - elapsedMs)).toISOString();
	    }

	    async function closeStatsSessionById(tableName, sessionId, payload){
	      if(!sessionId || !isUuidLike(sessionId)) return false;
	      var updateRes = await supabase.from(tableName).update(payload).eq("id", sessionId);
	      if(updateRes && updateRes.error) throw updateRes.error;
	      return true;
	    }

	    async function logRoomSessionStart(room, options){
	      var roomId = "";
	      var pendingToken = "";
	      try{
	        options = options || {};
	        if(!statsLoggingAvailable) return;
	        if(!room) return;
        roomId = getRoomIdForSessionTracking(room);
        var liveRoom = getLiveRoomForSessionTracking(room);
        if(pendingRoomSessionInsertByRoomId[roomId]) return;
        if(liveRoom && liveRoom.activeRoomSessionId && !isUuidLike(liveRoom.activeRoomSessionId)){
          liveRoom.activeRoomSessionId = null;
          room.activeRoomSessionId = null;
          persistSessionTrackingState();
        }
        if((liveRoom && liveRoom.activeRoomSessionId) || room.activeRoomSessionId) return;
        if(!await requireAuthenticatedSession("Room session start")) return;
        pendingToken = createPendingSessionToken("room");
        pendingRoomSessionInsertByRoomId[roomId] = pendingToken;
	        var practiceIdForStats = await ensurePracticeContextForStats("room-start");
	        if(!practiceIdForStats && currentPracticeId) practiceIdForStats = currentPracticeId;
	        var startedAtIso = normalizeServerNowIso(options.startedAtIso) || await getServerNowIso();
	        var payload = {
	          room_name: room.name || room.label || room.id,
	          doctor_name: room.doctor || null,
	          started_at: startedAtIso,
	          ended_at: null,
	          duration_ms: null
	        };
        if(practiceIdForStats) payload.practice_id = practiceIdForStats;
        var res = await insertStatsSession("room_sessions", payload);
        if(res && res.error) throw res.error;
        if(res && res.data && res.data.id){
          var currentRoomId = findRoomIdByPendingSessionToken(pendingRoomSessionInsertByRoomId, pendingToken) || roomId;
          var currentRoom = findRoomById(currentRoomId) || liveRoom || room;
          if(currentRoom) currentRoom.activeRoomSessionId = res.data.id;
          if(room && room !== currentRoom && room.activeRoomSessionId === res.data.id) room.activeRoomSessionId = null;
          persistSessionTrackingState();
          if(pendingRoomSessionEndSnapshotByToken[pendingToken]){
            var pendingEndSnapshot = pendingRoomSessionEndSnapshotByToken[pendingToken];
            delete pendingRoomSessionEndSnapshotByToken[pendingToken];
            pendingEndSnapshot.sessionId = pendingEndSnapshot.sessionId || res.data.id;
            await logRoomSessionEnd(currentRoom || room, pendingEndSnapshot);
          }
        }
      } catch(e){
        if(isMissingStatsTableError(e)){
          disableStatsLogging(e);
          return;
        }
        console.error("logRoomSessionStart failed", e);
        setStatus("Room session start failed: " + getErrorMessage(e));
        setSyncUI("err", "Stats write failed");
      } finally {
        clearPendingSessionToken(pendingRoomSessionInsertByRoomId, pendingToken, roomId);
      }
    }

    async function logRoomSessionEnd(room, options){
      try{
        if(!statsLoggingAvailable) return;
        if(!room) return;
        options = options || {};
        var roomId = getRoomIdForSessionTracking(room);
        var liveRoom = getLiveRoomForSessionTracking(room);
        var pendingToken = pendingRoomSessionInsertByRoomId[roomId] || "";
        var sessionId = options.sessionId || (liveRoom && liveRoom.activeRoomSessionId) || room.activeRoomSessionId;
        if(!sessionId){
          if(pendingToken){
            pendingRoomSessionEndSnapshotByToken[pendingToken] = {
              sessionId: null,
              endedAtIso: options.endedAtIso || null,
              durationMs: options.durationMs,
              doctorName: options.doctorName,
              roomName: options.roomName
            };
          }
          return;
        }
        if(!isUuidLike(sessionId)){
          if(liveRoom) liveRoom.activeRoomSessionId = null;
          room.activeRoomSessionId = null;
          if(pendingToken) delete pendingRoomSessionEndSnapshotByToken[pendingToken];
          persistSessionTrackingState();
          return;
        }
        if(!await requireAuthenticatedSession("Room session end")) return;
        var endedAtIso = normalizeServerNowIso(options.endedAtIso) || await getServerNowIso();
        var durationMs = Number(options.durationMs);
        if(!isFinite(durationMs) || durationMs < 0) durationMs = computeElapsed(room.timer);
        var doctorName = options.doctorName != null ? options.doctorName : (room.doctor || null);
        var roomName = options.roomName != null ? options.roomName : (room.name || room.label || room.id);
        var res = await supabase.from("room_sessions")
          .update({
            ended_at: endedAtIso,
            duration_ms: durationMs,
            doctor_name: doctorName,
            room_name: roomName
          })
          .eq("id", sessionId);
        if(res && res.error) throw res.error;
        if(liveRoom && liveRoom.activeRoomSessionId === sessionId) liveRoom.activeRoomSessionId = null;
        if(room.activeRoomSessionId === sessionId) room.activeRoomSessionId = null;
        if(pendingToken) delete pendingRoomSessionEndSnapshotByToken[pendingToken];
        persistSessionTrackingState();
      } catch(e){
        if(isMissingStatsTableError(e)){
          disableStatsLogging(e);
          return;
        }
        console.error("logRoomSessionEnd failed", e);
        setStatus("Room session end failed: " + getErrorMessage(e));
        setSyncUI("err", "Stats write failed");
      }
    }

	    async function logCleaningSessionStart(room, options){
	      var roomId = "";
	      var pendingToken = "";
	      try{
	        options = options || {};
	        if(!statsLoggingAvailable) return;
	        if(!room) return;
        roomId = getRoomIdForSessionTracking(room);
        var liveRoom = getLiveRoomForSessionTracking(room);
        if(pendingCleaningSessionInsertByRoomId[roomId]) return;
        if(liveRoom && liveRoom.activeCleaningSessionId && !isUuidLike(liveRoom.activeCleaningSessionId)){
          liveRoom.activeCleaningSessionId = null;
          room.activeCleaningSessionId = null;
          persistSessionTrackingState();
        }
        if((liveRoom && liveRoom.activeCleaningSessionId) || room.activeCleaningSessionId) return;
        if(!await requireAuthenticatedSession("Cleaning session start")) return;
        pendingToken = createPendingSessionToken("cleaning");
        pendingCleaningSessionInsertByRoomId[roomId] = pendingToken;
	        var practiceIdForStats = await ensurePracticeContextForStats("cleaning-start");
	        if(!practiceIdForStats && currentPracticeId) practiceIdForStats = currentPracticeId;
	        var startedAtIso = normalizeServerNowIso(options.startedAtIso) || await getServerNowIso();
	        var payload = {
	          room_name: room.name || room.label || room.id,
	          started_at: startedAtIso,
	          ended_at: null,
	          duration_ms: null
	        };
        if(practiceIdForStats) payload.practice_id = practiceIdForStats;
        var res = await insertStatsSession("cleaning_sessions", payload);
        if(res && res.error) throw res.error;
        if(res && res.data && res.data.id){
          var currentRoomId = findRoomIdByPendingSessionToken(pendingCleaningSessionInsertByRoomId, pendingToken) || roomId;
          var currentRoom = findRoomById(currentRoomId) || liveRoom || room;
          if(currentRoom) currentRoom.activeCleaningSessionId = res.data.id;
          if(room && room !== currentRoom && room.activeCleaningSessionId === res.data.id) room.activeCleaningSessionId = null;
          persistSessionTrackingState();
          if(pendingCleaningSessionEndSnapshotByToken[pendingToken]){
            var pendingCleaningEndSnapshot = pendingCleaningSessionEndSnapshotByToken[pendingToken];
            delete pendingCleaningSessionEndSnapshotByToken[pendingToken];
            pendingCleaningEndSnapshot.sessionId = pendingCleaningEndSnapshot.sessionId || res.data.id;
            await logCleaningSessionEnd(currentRoom || room, pendingCleaningEndSnapshot);
          }
        }
      } catch(e){
        if(isMissingStatsTableError(e)){
          disableStatsLogging(e);
          return;
        }
        console.error("logCleaningSessionStart failed", e);
        setStatus("Cleaning session start failed: " + getErrorMessage(e));
        setSyncUI("err", "Stats write failed");
      } finally {
        clearPendingSessionToken(pendingCleaningSessionInsertByRoomId, pendingToken, roomId);
      }
    }

    async function logCleaningSessionEnd(room, options){
      try{
        if(!statsLoggingAvailable) return;
        if(!room) return;
        options = options || {};
        var roomId = getRoomIdForSessionTracking(room);
        var liveRoom = getLiveRoomForSessionTracking(room);
        var pendingToken = pendingCleaningSessionInsertByRoomId[roomId] || "";
        var sessionId = options.sessionId || (liveRoom && liveRoom.activeCleaningSessionId) || room.activeCleaningSessionId;
        if(!sessionId){
          if(pendingToken){
            pendingCleaningSessionEndSnapshotByToken[pendingToken] = {
              sessionId: null,
              endedAtIso: options.endedAtIso || null,
              durationMs: options.durationMs,
              roomName: options.roomName
            };
          }
          return;
        }
        if(!isUuidLike(sessionId)){
          if(liveRoom) liveRoom.activeCleaningSessionId = null;
          room.activeCleaningSessionId = null;
          if(pendingToken) delete pendingCleaningSessionEndSnapshotByToken[pendingToken];
          persistSessionTrackingState();
          return;
        }
        if(!await requireAuthenticatedSession("Cleaning session end")) return;
        var endedAtIso = normalizeServerNowIso(options.endedAtIso) || await getServerNowIso();
        var durationMs = Number(options.durationMs);
        if(!isFinite(durationMs) || durationMs < 0) durationMs = computeElapsed(room.cleaningTimer);
        var roomName = options.roomName != null ? options.roomName : (room.name || room.label || room.id);
        var res = await supabase.from("cleaning_sessions")
          .update({
            ended_at: endedAtIso,
            duration_ms: durationMs,
            room_name: roomName
          })
          .eq("id", sessionId);
        if(res && res.error) throw res.error;
        if(liveRoom && liveRoom.activeCleaningSessionId === sessionId) liveRoom.activeCleaningSessionId = null;
        if(room.activeCleaningSessionId === sessionId) room.activeCleaningSessionId = null;
        if(pendingToken) delete pendingCleaningSessionEndSnapshotByToken[pendingToken];
        persistSessionTrackingState();
      } catch(e){
        if(isMissingStatsTableError(e)){
          disableStatsLogging(e);
          return;
        }
        console.error("logCleaningSessionEnd failed", e);
        setStatus("Cleaning session end failed: " + getErrorMessage(e));
        setSyncUI("err", "Stats write failed");
      }
    }

	    function hasCleaningCoverageEvidence(room){
	      if(!room || !room.needsCleaning) return false;
	      if(isUuidLike(room.activeCleaningSessionId)) return true;
	      if(timerHasProgress(room.cleaningTimer)) return true;
	      if(room.cleaningTimer && room.cleaningTimer.running) return true;
	      if(normalizeServerNowIso(room.cleaningTimer && room.cleaningTimer.startedAtIso)) return true;
	      if(room.lastDischargeSnapshot) return true;
	      return false;
	    }

	    async function reconcileStatsCoverage(reason){
	      if(!statsLoggingAvailable || !supabase || !currentPracticeId || !state || !Array.isArray(state.rooms) || !state.rooms.length) return false;
	      if(!await requireAuthenticatedSession("Stats coverage")) return false;
	      var coverageNowIso = await getServerNowIso();
      var changedRoomIds = [];
      for(var i=0;i<state.rooms.length;i++){
        var room = state.rooms[i];
        if(!room) continue;
	        if(room.needsCleaning){
	          if(!hasCleaningCoverageEvidence(room)) continue;
	          if(!timerHasProgress(room.cleaningTimer)){
	            applyTimerStartAt(room.cleaningTimer, coverageNowIso);
	            changedRoomIds.push(room.id);
	          }
	          if(!room.activeCleaningSessionId) await logCleaningSessionStart(room, {
	            startedAtIso: deriveTimerStartedAtIso(room.cleaningTimer, coverageNowIso)
	          });
	          continue;
	        }
	        if(!roomHasAssignedPatient(room)) continue;
	        if(!timerHasProgress(room.timer)){
	          applyTimerStartAt(room.timer, coverageNowIso);
	          changedRoomIds.push(room.id);
	        }
	        if(!room.activeRoomSessionId) await logRoomSessionStart(room, {
	          startedAtIso: deriveTimerStartedAtIso(room.timer, coverageNowIso)
	        });
	      }
      if(changedRoomIds.length){
        saveLocal();
        requestBoardRoomRefresh(changedRoomIds, { includeIntake: true, timerBindings: true });
        scheduleRemoteSave("board", { immediate: true });
        setStatus((reason || "Timer recovery") + " restored " + changedRoomIds.length + " room timer" + (changedRoomIds.length === 1 ? "" : "s") + ".");
      }
      return !!changedRoomIds.length;
    }

	    function scheduleStatsCoverageCheck(reason){
	      if(statsCoverageTimer) clearTimeout(statsCoverageTimer);
	      statsCoverageTimer = setTimeout(function(){
	        statsCoverageTimer = null;
	        reconcileStatsCoverage(reason).catch(function(err){
	          console.warn("Stats coverage check failed:", err);
	        });
	      }, 180);
	    }

	    function normalizeRoomNameKey(name){
	      return String(name || "").trim().toLowerCase();
	    }

	    function getStopwatchDiagnosticsSeverity(issue){
	      if(!issue || !issue.code) return "info";
	      if(
	        issue.code === "missing-room-session"
	        || issue.code === "missing-cleaning-session"
	        || issue.code === "remote-room-session-missing"
	        || issue.code === "remote-cleaning-session-missing"
	        || issue.code === "invalid-room-session-id"
	        || issue.code === "invalid-cleaning-session-id"
	      ) return "error";
	      if(
	        issue.code === "occupied-no-timer"
	        || issue.code === "cleaning-no-timer"
	        || issue.code === "idle-room-session-linked"
	        || issue.code === "idle-cleaning-session-linked"
	        || issue.code === "idle-room-timer-progress"
	        || issue.code === "idle-cleaning-timer-progress"
	        || issue.code === "orphan-open-room-session"
	        || issue.code === "orphan-open-cleaning-session"
	      ) return "warn";
	      return "info";
	    }

	    function getStopwatchDiagnosticsIssueLabel(issue){
	      if(!issue || !issue.code) return "Info";
	      switch(issue.code){
	        case "missing-room-session": return "No room session";
	        case "missing-cleaning-session": return "No cleaning session";
	        case "remote-room-session-missing": return "Room stats missing";
	        case "remote-cleaning-session-missing": return "Cleaning stats missing";
	        case "invalid-room-session-id": return "Bad room session id";
	        case "invalid-cleaning-session-id": return "Bad cleaning session id";
	        case "occupied-no-timer": return "Occupied timer idle";
	        case "cleaning-no-timer": return "Cleaning timer idle";
	        case "idle-room-session-linked": return "Idle room session link";
	        case "idle-cleaning-session-linked": return "Idle cleaning session link";
	        case "idle-room-timer-progress": return "Idle timer progress";
	        case "idle-cleaning-timer-progress": return "Idle cleaning timer progress";
	        case "orphan-open-room-session": return "Open room stats orphan";
	        case "orphan-open-cleaning-session": return "Open cleaning stats orphan";
	        default: return String(issue.code || "Info");
	      }
	    }

	    function describeStopwatchRoomState(room){
	      if(!room) return "Idle";
	      if(room.needsCleaning) return "Cleaning";
	      if(roomHasAssignedPatient(room)) return "Occupied";
	      if(timerHasProgress(room.timer) || timerHasProgress(room.cleaningTimer)) return "Idle with timer";
	      return "Idle";
	    }

	    function formatSessionLinkShort(id){
	      if(!id) return "None";
	      var text = String(id);
	      return text.length > 8 ? text.slice(0, 8) : text;
	    }

	    async function fetchOpenStatsSessionsForDiagnostics(tableName){
	      var res = await supabase
	        .from(tableName)
	        .select("id, room_name, started_at, duration_ms")
	        .eq("practice_id", currentPracticeId)
	        .is("ended_at", null);
	      if(res.error) throw res.error;
	      return Array.isArray(res.data) ? res.data : [];
	    }

	    async function collectStopwatchDiagnosticsSnapshot(){
	      if(!canViewStopwatchDiagnostics()){
	        return {
	          ok: false,
	          statusText: "Clinic admins can open this section to run a stopwatch and stats self-check.",
	          summary: null,
	          rows: []
	        };
	      }
	      if(!statsLoggingAvailable){
	        return {
	          ok: false,
	          statusText: "Run the RoomBoard stats SQL so room and cleaning timers count in statistics.",
	          summary: null,
	          rows: []
	        };
	      }
	      if(!await requireAuthenticatedSession("Stopwatch diagnostics")){
	        return {
	          ok: false,
	          statusText: "Log in to run stopwatch diagnostics.",
	          summary: null,
	          rows: []
	        };
	      }
	      var openRoomSessions = [];
	      var openCleaningSessions = [];
	      try{
	        var results = await Promise.all([
	          fetchOpenStatsSessionsForDiagnostics("room_sessions"),
	          fetchOpenStatsSessionsForDiagnostics("cleaning_sessions")
	        ]);
	        openRoomSessions = results[0];
	        openCleaningSessions = results[1];
	      }catch(err){
	        if(isMissingStatsTableError(err)){
	          disableStatsLogging(err);
	          return {
	            ok: false,
	            statusText: "Run the RoomBoard stats SQL so room and cleaning timers count in statistics.",
	            summary: null,
	            rows: []
	          };
	        }
	        throw err;
	      }

	      var openRoomById = {};
	      var openCleaningById = {};
	      var linkedRoomSessionIds = {};
	      var linkedCleaningSessionIds = {};
	      openRoomSessions.forEach(function(row){ openRoomById[String(row.id)] = row; });
	      openCleaningSessions.forEach(function(row){ openCleaningById[String(row.id)] = row; });

	      var rows = [];
	      var problemRoomCount = 0;
	      var issueCount = 0;
	      var activeRoomCount = 0;
	      var activeCleaningCount = 0;

	      (state.rooms || []).forEach(function(room){
	        var occupied = roomHasAssignedPatient(room);
	        var cleaning = !!room.needsCleaning;
	        var roomTimerMs = computeElapsed(room.timer);
	        var cleaningTimerMs = computeElapsed(room.cleaningTimer);
	        var activeRoomSessionId = room.activeRoomSessionId ? String(room.activeRoomSessionId) : "";
	        var activeCleaningSessionId = room.activeCleaningSessionId ? String(room.activeCleaningSessionId) : "";
	        var issues = [];

	        if(occupied) activeRoomCount += 1;
	        if(cleaning) activeCleaningCount += 1;

	        if(activeRoomSessionId){
	          if(isUuidLike(activeRoomSessionId)){
	            linkedRoomSessionIds[activeRoomSessionId] = room.name || room.id || "room";
	            if(!openRoomById[activeRoomSessionId]) issues.push({ code: "remote-room-session-missing" });
	          } else {
	            issues.push({ code: "invalid-room-session-id" });
	          }
	        }
	        if(activeCleaningSessionId){
	          if(isUuidLike(activeCleaningSessionId)){
	            linkedCleaningSessionIds[activeCleaningSessionId] = room.name || room.id || "room";
	            if(!openCleaningById[activeCleaningSessionId]) issues.push({ code: "remote-cleaning-session-missing" });
	          } else {
	            issues.push({ code: "invalid-cleaning-session-id" });
	          }
	        }
	        if(occupied){
	          if(!timerHasProgress(room.timer)) issues.push({ code: "occupied-no-timer" });
	          if(!activeRoomSessionId) issues.push({ code: "missing-room-session" });
	        } else {
	          if(activeRoomSessionId) issues.push({ code: "idle-room-session-linked" });
	          if(roomTimerMs > 0 || (room.timer && room.timer.running)) issues.push({ code: "idle-room-timer-progress" });
	        }
	        if(cleaning){
	          if(!timerHasProgress(room.cleaningTimer)) issues.push({ code: "cleaning-no-timer" });
	          if(!activeCleaningSessionId) issues.push({ code: "missing-cleaning-session" });
	        } else {
	          if(activeCleaningSessionId) issues.push({ code: "idle-cleaning-session-linked" });
	          if(cleaningTimerMs > 0 || (room.cleaningTimer && room.cleaningTimer.running)) issues.push({ code: "idle-cleaning-timer-progress" });
	        }

	        var rowSeverity = "ok";
	        issues.forEach(function(issue){
	          var severity = getStopwatchDiagnosticsSeverity(issue);
	          if(severity === "error") rowSeverity = "error";
	          else if(severity === "warn" && rowSeverity !== "error") rowSeverity = "warn";
	        });
	        if(issues.length){
	          problemRoomCount += 1;
	          issueCount += issues.length;
	        }

	        rows.push({
	          kind: "room",
	          roomId: getRoomIdForSessionTracking(room),
	          roomName: room.name || room.label || room.id || "Room",
	          stateLabel: describeStopwatchRoomState(room),
	          timerLabel: cleaning ? formatTime(cleaningTimerMs) : formatTime(roomTimerMs),
	          sessionLabel: cleaning
	            ? ("Cleaning " + formatSessionLinkShort(activeCleaningSessionId))
	            : (occupied ? ("Room " + formatSessionLinkShort(activeRoomSessionId)) : "No live session"),
	          severity: rowSeverity,
	          issues: issues
	        });
	      });

	      openRoomSessions.forEach(function(row){
	        var id = String(row.id || "");
	        if(!id || linkedRoomSessionIds[id]) return;
	        issueCount += 1;
	        rows.push({
	          kind: "orphan-room-session",
	          roomId: "",
	          roomName: row.room_name || "Unknown room",
	          stateLabel: "Open room stats row",
	          timerLabel: row.started_at ? new Date(row.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Unknown start",
	          sessionLabel: "Room " + formatSessionLinkShort(id),
	          severity: "warn",
	          issues: [{ code: "orphan-open-room-session" }]
	        });
	      });
	      openCleaningSessions.forEach(function(row){
	        var id = String(row.id || "");
	        if(!id || linkedCleaningSessionIds[id]) return;
	        issueCount += 1;
	        rows.push({
	          kind: "orphan-cleaning-session",
	          roomId: "",
	          roomName: row.room_name || "Unknown room",
	          stateLabel: "Open cleaning stats row",
	          timerLabel: row.started_at ? new Date(row.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Unknown start",
	          sessionLabel: "Cleaning " + formatSessionLinkShort(id),
	          severity: "warn",
	          issues: [{ code: "orphan-open-cleaning-session" }]
	        });
	      });

	      return {
	        ok: true,
	        generatedAtIso: isoNow(),
	        statusText: issueCount
	          ? (issueCount + " stopwatch/stat issue" + (issueCount === 1 ? "" : "s") + " detected for " + (currentPracticeName || "this clinic") + ".")
	          : ("All active room and cleaning timers look covered for " + (currentPracticeName || "this clinic") + "."),
	        summary: {
	          activeRooms: activeRoomCount,
	          activeCleaning: activeCleaningCount,
	          openRoomSessions: openRoomSessions.length,
	          openCleaningSessions: openCleaningSessions.length,
	          problemRooms: problemRoomCount,
	          issueCount: issueCount
	        },
	        rows: rows
	      };
	    }

	    function renderStopwatchDiagnostics(snapshot){
	      var statusEl = $("stopwatchDiagnosticsStatus");
	      var summaryEl = $("stopwatchDiagnosticsSummary");
	      var listEl = $("stopwatchDiagnosticsList");
	      if(statusEl) statusEl.textContent = snapshot && snapshot.statusText ? snapshot.statusText : "Stopwatch self-check unavailable right now.";
	      if(summaryEl){
	        if(snapshot && snapshot.summary){
	          summaryEl.innerHTML = ''
	            + '<div class="stopwatchDiagnosticsStat"><strong>' + escapeHtml(String(snapshot.summary.activeRooms)) + '</strong><span>Active rooms</span></div>'
	            + '<div class="stopwatchDiagnosticsStat"><strong>' + escapeHtml(String(snapshot.summary.activeCleaning)) + '</strong><span>Cleaning rooms</span></div>'
	            + '<div class="stopwatchDiagnosticsStat"><strong>' + escapeHtml(String(snapshot.summary.openRoomSessions + snapshot.summary.openCleaningSessions)) + '</strong><span>Open stats rows</span></div>'
	            + '<div class="stopwatchDiagnosticsStat"><strong>' + escapeHtml(String(snapshot.summary.issueCount)) + '</strong><span>Issues found</span></div>';
	        } else {
	          summaryEl.innerHTML = "";
	        }
	      }
	      if(listEl){
	        var rows = snapshot && Array.isArray(snapshot.rows) ? snapshot.rows : [];
	        if(!rows.length){
	          listEl.innerHTML = '<div class="stopwatchDiagnosticsEmpty">No stopwatch diagnostics to show yet.</div>';
	        } else {
	          listEl.innerHTML = rows.map(function(row){
	            var rowClass = row.severity === "error" ? " isError" : (row.severity === "warn" ? " isWarn" : "");
	            var issues = Array.isArray(row.issues) ? row.issues : [];
	            var issueHtml = issues.length
	              ? issues.map(function(issue){
	                  var severity = getStopwatchDiagnosticsSeverity(issue);
	                  var severityClass = severity === "error" ? "isError" : (severity === "warn" ? "isWarn" : (severity === "info" ? "isInfo" : "isOk"));
	                  return '<span class="stopwatchDiagnosticsBadge ' + severityClass + '">' + escapeHtml(getStopwatchDiagnosticsIssueLabel(issue)) + '</span>';
	                }).join("")
	              : '<span class="stopwatchDiagnosticsBadge isOk">Healthy</span>';
	            return ''
	              + '<div class="stopwatchDiagnosticsRow' + rowClass + '">'
	              +   '<div class="stopwatchDiagnosticsPrimary">'
	              +     '<strong>' + escapeHtml(String(row.roomName || "Room")) + '</strong>'
	              +     '<div class="stopwatchDiagnosticsMeta">' + escapeHtml(String(row.stateLabel || "")) + '</div>'
	              +   '</div>'
	              +   '<div class="stopwatchDiagnosticsTimer">' + escapeHtml(String(row.timerLabel || "00:00:00")) + '</div>'
	              +   '<div class="stopwatchDiagnosticsSession">' + escapeHtml(String(row.sessionLabel || "")) + '</div>'
	              +   '<div class="stopwatchDiagnosticsIssues">' + issueHtml + '</div>'
	              + '</div>';
	          }).join("");
	        }
	      }
	    }

	    async function runStopwatchDiagnostics(){
	      try{
	        renderStopwatchDiagnostics({
	          ok: false,
	          statusText: "Running stopwatch self-check…",
	          summary: null,
	          rows: []
	        });
	        var snapshot = await collectStopwatchDiagnosticsSnapshot();
	        renderStopwatchDiagnostics(snapshot);
	        return snapshot;
	      }catch(err){
	        console.error("Stopwatch diagnostics failed", err);
	        renderStopwatchDiagnostics({
	          ok: false,
	          statusText: "Stopwatch self-check failed: " + getErrorMessage(err),
	          summary: null,
	          rows: []
	        });
	        return null;
	      }
	    }

	    async function repairStopwatchCoverageDiagnostics(){
	      renderStopwatchDiagnostics({
	        ok: false,
	        statusText: "Repairing stopwatch coverage…",
	        summary: null,
	        rows: []
	      });
	      try{
	        if(!canViewStopwatchDiagnostics()){
	          renderStopwatchDiagnostics({
	            ok: false,
	            statusText: "Clinic admins can run stopwatch repairs.",
	            summary: null,
	            rows: []
	          });
	          return null;
	        }
	        if(!statsLoggingAvailable){
	          renderStopwatchDiagnostics({
	            ok: false,
	            statusText: "Run the RoomBoard stats SQL so room and cleaning timers count in statistics.",
	            summary: null,
	            rows: []
	          });
	          return null;
	        }
	        if(!await requireAuthenticatedSession("Stopwatch repair")){
	          renderStopwatchDiagnostics({
	            ok: false,
	            statusText: "Log in to run stopwatch repairs.",
	            summary: null,
	            rows: []
	          });
	          return null;
	        }
	        var repairNowIso = await getServerNowIso();
	        var sessionRows = await Promise.all([
	          fetchOpenStatsSessionsForDiagnostics("room_sessions"),
	          fetchOpenStatsSessionsForDiagnostics("cleaning_sessions")
	        ]);
	        var openRoomById = {};
	        var openCleaningById = {};
	        (sessionRows[0] || []).forEach(function(row){ openRoomById[String(row.id)] = row; });
	        (sessionRows[1] || []).forEach(function(row){ openCleaningById[String(row.id)] = row; });
	        var changedRoomIds = [];
	        var linkedRoomSessionIds = {};
	        var linkedCleaningSessionIds = {};

	        function markRoomChanged(room){
	          if(!room || !room.id) return;
	          if(changedRoomIds.indexOf(room.id) < 0) changedRoomIds.push(room.id);
	        }

	        for(var i=0;i<(state.rooms || []).length;i++){
	          var room = state.rooms[i];
	          if(!room) continue;
	          var occupied = roomHasAssignedPatient(room);
	          var cleaning = !!room.needsCleaning;
	          var canRepairCleaningCoverage = cleaning && hasCleaningCoverageEvidence(room);
	          var roomSessionId = room.activeRoomSessionId ? String(room.activeRoomSessionId) : "";
	          var cleaningSessionId = room.activeCleaningSessionId ? String(room.activeCleaningSessionId) : "";

	          if(roomSessionId && !isUuidLike(roomSessionId)){
	            room.activeRoomSessionId = null;
	            roomSessionId = "";
	            markRoomChanged(room);
	          }
	          if(cleaningSessionId && !isUuidLike(cleaningSessionId)){
	            room.activeCleaningSessionId = null;
	            cleaningSessionId = "";
	            markRoomChanged(room);
	          }

	          if(occupied){
	            if(cleaningSessionId){
	              if(openCleaningById[cleaningSessionId]){
	                await closeStatsSessionById("cleaning_sessions", cleaningSessionId, {
	                  ended_at: repairNowIso,
	                  duration_ms: Math.max(0, Number(computeElapsed(room.cleaningTimer, repairNowIso) || 0)),
	                  room_name: room.name || room.label || room.id
	                });
	                delete openCleaningById[cleaningSessionId];
	              }
	              room.activeCleaningSessionId = null;
	              markRoomChanged(room);
	            }
	            if(timerHasProgress(room.cleaningTimer)){
	              applyTimerStopAt(room.cleaningTimer, repairNowIso, true);
	              markRoomChanged(room);
	            }
	            if(!timerHasProgress(room.timer)){
	              applyTimerStartAt(room.timer, repairNowIso);
	              markRoomChanged(room);
	            }
	            if(roomSessionId && openRoomById[roomSessionId]){
	              linkedRoomSessionIds[roomSessionId] = room.name || room.id || "room";
	            } else {
	              if(roomSessionId){
	                room.activeRoomSessionId = null;
	                markRoomChanged(room);
	              }
	              await logRoomSessionStart(room, {
	                startedAtIso: deriveTimerStartedAtIso(room.timer, repairNowIso)
	              });
	              if(room.activeRoomSessionId && isUuidLike(room.activeRoomSessionId)){
	                linkedRoomSessionIds[String(room.activeRoomSessionId)] = room.name || room.id || "room";
	              }
	            }
	            continue;
	          }

	          if(cleaning && !canRepairCleaningCoverage){
	            continue;
	          }

	          if(cleaning && canRepairCleaningCoverage){
	            if(roomSessionId){
	              if(openRoomById[roomSessionId]){
	                await closeStatsSessionById("room_sessions", roomSessionId, {
	                  ended_at: repairNowIso,
	                  duration_ms: Math.max(0, Number(computeElapsed(room.timer, repairNowIso) || 0)),
	                  doctor_name: room.doctor || null,
	                  room_name: room.name || room.label || room.id
	                });
	                delete openRoomById[roomSessionId];
	              }
	              room.activeRoomSessionId = null;
	              markRoomChanged(room);
	            }
	            if(timerHasProgress(room.timer)){
	              applyTimerStopAt(room.timer, repairNowIso, true);
	              markRoomChanged(room);
	            }
	            if(!timerHasProgress(room.cleaningTimer)){
	              applyTimerStartAt(room.cleaningTimer, repairNowIso);
	              markRoomChanged(room);
	            }
	            if(cleaningSessionId && openCleaningById[cleaningSessionId]){
	              linkedCleaningSessionIds[cleaningSessionId] = room.name || room.id || "room";
	            } else {
	              if(cleaningSessionId){
	                room.activeCleaningSessionId = null;
	                markRoomChanged(room);
	              }
	              await logCleaningSessionStart(room, {
	                startedAtIso: deriveTimerStartedAtIso(room.cleaningTimer, repairNowIso)
	              });
	              if(room.activeCleaningSessionId && isUuidLike(room.activeCleaningSessionId)){
	                linkedCleaningSessionIds[String(room.activeCleaningSessionId)] = room.name || room.id || "room";
	              }
	            }
	            continue;
	          }

	          if(roomSessionId){
	            if(openRoomById[roomSessionId]){
	              await closeStatsSessionById("room_sessions", roomSessionId, {
	                ended_at: repairNowIso,
	                duration_ms: Math.max(0, Number(computeElapsed(room.timer, repairNowIso) || 0)),
	                doctor_name: room.doctor || null,
	                room_name: room.name || room.label || room.id
	              });
	              delete openRoomById[roomSessionId];
	            }
	            room.activeRoomSessionId = null;
	            markRoomChanged(room);
	          }
	          if(cleaningSessionId){
	            if(openCleaningById[cleaningSessionId]){
	              await closeStatsSessionById("cleaning_sessions", cleaningSessionId, {
	                ended_at: repairNowIso,
	                duration_ms: Math.max(0, Number(computeElapsed(room.cleaningTimer, repairNowIso) || 0)),
	                room_name: room.name || room.label || room.id
	              });
	              delete openCleaningById[cleaningSessionId];
	            }
	            room.activeCleaningSessionId = null;
	            markRoomChanged(room);
	          }
	          if(timerHasProgress(room.timer)){
	            applyTimerStopAt(room.timer, repairNowIso, true);
	            markRoomChanged(room);
	          }
	          if(timerHasProgress(room.cleaningTimer)){
	            applyTimerStopAt(room.cleaningTimer, repairNowIso, true);
	            markRoomChanged(room);
	          }
	        }

	        var orphanRoomSessionIds = Object.keys(openRoomById).filter(function(id){
	          return !linkedRoomSessionIds[id];
	        });
	        for(var roomIndex=0; roomIndex<orphanRoomSessionIds.length; roomIndex++){
	          var orphanRoomId = orphanRoomSessionIds[roomIndex];
	          var orphanRoomRow = openRoomById[orphanRoomId];
	          var orphanRoomStartedMs = Date.parse(orphanRoomRow && orphanRoomRow.started_at);
	          var orphanRoomDuration = isFinite(orphanRoomStartedMs) ? Math.max(0, Date.parse(repairNowIso) - orphanRoomStartedMs) : 0;
	          await closeStatsSessionById("room_sessions", orphanRoomId, {
	            ended_at: repairNowIso,
	            duration_ms: orphanRoomDuration,
	            doctor_name: null,
	            room_name: orphanRoomRow && orphanRoomRow.room_name ? orphanRoomRow.room_name : null
	          });
	        }
	        var orphanCleaningSessionIds = Object.keys(openCleaningById).filter(function(id){
	          return !linkedCleaningSessionIds[id];
	        });
	        for(var cleaningIndex=0; cleaningIndex<orphanCleaningSessionIds.length; cleaningIndex++){
	          var orphanCleaningId = orphanCleaningSessionIds[cleaningIndex];
	          var orphanCleaningRow = openCleaningById[orphanCleaningId];
	          var orphanCleaningStartedMs = Date.parse(orphanCleaningRow && orphanCleaningRow.started_at);
	          var orphanCleaningDuration = isFinite(orphanCleaningStartedMs) ? Math.max(0, Date.parse(repairNowIso) - orphanCleaningStartedMs) : 0;
	          await closeStatsSessionById("cleaning_sessions", orphanCleaningId, {
	            ended_at: repairNowIso,
	            duration_ms: orphanCleaningDuration,
	            room_name: orphanCleaningRow && orphanCleaningRow.room_name ? orphanCleaningRow.room_name : null
	          });
	        }
	        if(changedRoomIds.length){
	          saveLocal();
	          requestBoardRoomRefresh(changedRoomIds, { includeIntake: true, timerBindings: true });
	          scheduleRemoteSave("board", { immediate: true });
	        }
	        await reconcileStatsCoverage("Stopwatch diagnostics");
	      }catch(err){
	        console.error("Stopwatch coverage repair failed", err);
	      }
	      return await runStopwatchDiagnostics();
	    }

	    window.runStopwatchDiagnostics = runStopwatchDiagnostics;
	    window.repairStopwatchCoverageDiagnostics = repairStopwatchCoverageDiagnostics;
	    window.renderStopwatchDiagnostics = renderStopwatchDiagnostics;

    function normalizeServerNowIso(value){
      if(!value) return null;
      if(typeof value === "string"){
        var text = value.trim();
        if(!text) return null;
        var parsed = Date.parse(text);
        if(isFinite(parsed)) return new Date(parsed).toISOString();
        return null;
      }
      if(typeof value === "object"){
        var keys = ["server_now","serverNow","now","ts","timestamp","get_server_now_iso"];
        for(var i=0;i<keys.length;i++){
          if(value[keys[i]]){
            var nested = normalizeServerNowIso(value[keys[i]]);
            if(nested) return nested;
          }
        }
      }
      return null;
    }

    function normalizePracticeId(value){
      if(value == null) return null;
      if(typeof value === "string" || typeof value === "number"){
        var text = String(value).trim();
        return text || null;
      }
      if(Array.isArray(value)){
        for(var i=0;i<value.length;i++){
          var nested = normalizePracticeId(value[i]);
          if(nested) return nested;
        }
        return null;
      }
      if(typeof value === "object"){
        var keys = ["practice_id", "practiceId", "id", "get_my_practice_id"];
        for(var j=0;j<keys.length;j++){
          if(value[keys[j]] != null){
            var nestedValue = normalizePracticeId(value[keys[j]]);
            if(nestedValue) return nestedValue;
          }
        }
      }
      return null;
    }

    async function getServerNowIso(){
      if(!supabase) return isoNow();
      try{
        var res = await supabase.rpc("get_server_now_iso");
        if(res && res.error) throw res.error;
        var normalized = normalizeServerNowIso(res ? res.data : null);
        if(normalized) updateServerTimeOffset(normalized);
        return normalized || isoNow();
      }catch(e){
        console.warn("Using local fallback time for timer anchor:", e);
        return isoNow();
      }
    }

		    function updateAuthUI(loggedIn){
          var hasPracticeLink = !!currentPracticeId;
		      $("logoutBtn").style.display = loggedIn ? "inline-block" : "none";
		      $("loginBtn").style.display = loggedIn ? "none" : "inline-block";
		      $("signupBtn").style.display = (!loggedIn || !hasPracticeLink) ? "inline-block" : "none";
          syncAuthAccessUi(loggedIn, hasPracticeLink);
		      var authBanner = $("authBanner");
		      if(!loggedIn){
		        currentPracticeId = null;
		        currentPracticeName = "";
	            currentUserEmail = "";
	            currentUserFullName = "";
	            currentPracticeInviteAdmin = false;
		        window.__roomboardPracticeId = null;
		        if(typeof window.setLastKnownPracticeId === "function") window.setLastKnownPracticeId(null);
		        activeAccountSettingsScope = "guest";
		        activeThemePrefsScope = "guest";
            lastPracticeConfigSignature = "";
            setPracticeInviteUi(null);
		      }
		      updateClinicContextUi();
	          syncStopwatchDiagnosticsUi();
	          if(typeof window.refreshFeedbackChecklistForSession === "function") window.refreshFeedbackChecklistForSession();
		    }

	    async function refreshSupabaseSessionIfNeeded(reason){
	      if(!supabase) return false;
	      if(sessionRefreshInFlight) return await sessionRefreshInFlight;
	      sessionRefreshInFlight = (async function(){
	        try{
	          var sess = await supabase.auth.getSession();
	          var session = sess && sess.data ? sess.data.session : null;
	          if(!session){
	            return false;
	          }
	          updateAuthUI(true);
	          var expiresAt = session.expires_at ? Number(session.expires_at) * 1000 : 0;
	          var shouldRefresh = !expiresAt || (expiresAt - Date.now()) <= (45 * 60 * 1000);
	          if(!shouldRefresh) return true;
	          var refreshed = await supabase.auth.refreshSession();
	          if(refreshed && refreshed.error) throw refreshed.error;
	          var freshSession = refreshed && refreshed.data ? refreshed.data.session : null;
	          if(freshSession){
	            updateAuthUI(true);
	            return true;
	          }
	          return false;
        } catch(e){
          if(isTerminalAuthRecoveryError(e)){
            clearStoredAuthSessionSnapshot();
            authRecoveryCooldownUntil = Date.now() + 5 * 60 * 1000;
          }
          console.warn("Supabase session refresh skipped (" + (reason || "unknown") + "):", e);
          return false;
        } finally {
	          sessionRefreshInFlight = null;
	        }
	      })();
	      return await sessionRefreshInFlight;
	    }

	    function startSessionKeepAlive(){
	      if(sessionKeepAliveTimer) clearInterval(sessionKeepAliveTimer);
	      sessionKeepAliveTimer = setInterval(function(){
	        refreshSupabaseSessionIfNeeded("interval");
	      }, 5 * 60 * 1000);
        if(typeof document !== "undefined" && document.addEventListener){
          document.addEventListener("visibilitychange", function(){
            if(document.visibilityState === "visible") refreshSupabaseSessionIfNeeded("visible");
          });
        }
        if(typeof window !== "undefined" && window.addEventListener){
          window.addEventListener("focus", function(){
            refreshSupabaseSessionIfNeeded("focus");
          });
          window.addEventListener("pageshow", function(){
            refreshSupabaseSessionIfNeeded("pageshow");
          });
          window.addEventListener("online", function(){
            refreshSupabaseSessionIfNeeded("online");
          });
        }
	    }

    function getDoctorInitialsFallback(name){
      var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
      if(!parts.length) return "";
      if(parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function serializeTimerForRoomState(timer){
      timer = timer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };
      var baseElapsedMs = Number(timer.elapsedMs || 0);
      if(!isFinite(baseElapsedMs) || baseElapsedMs < 0) baseElapsedMs = 0;
      var startedAtIso = null;
      var updatedAtIso = null;
      if(timer.running){
        if(timer.startedAtIso) startedAtIso = String(timer.startedAtIso);
        else if(timer.startedAt) startedAtIso = new Date(timer.startedAt).toISOString();
      }
      if(timer.updatedAtIso) updatedAtIso = String(timer.updatedAtIso);
      return {
        elapsedMs: computeElapsed(timer),
        baseElapsedMs: baseElapsedMs,
        running: !!timer.running,
        startedAtIso: startedAtIso,
        updatedAtIso: updatedAtIso
      };
    }

    function hydrateTimerFromRoomState(timerData){
      var parsed = timerData && typeof timerData === "object" ? timerData : {};
      var elapsedMs = Number(parsed.elapsedMs || 0);
      if(!isFinite(elapsedMs) || elapsedMs < 0) elapsedMs = 0;
      var baseElapsedMs = Number(parsed.baseElapsedMs);
      if(!isFinite(baseElapsedMs) || baseElapsedMs < 0) baseElapsedMs = null;
      var running = !!parsed.running;
      var startedAt = null;
      var startedAtIso = null;
      var updatedAtIso = parsed.updatedAtIso ? normalizeServerNowIso(parsed.updatedAtIso) : null;
      var referenceNowMs = toReferenceNowMs();
      if(running){
        if(parsed.startedAtIso){
          var startedAtMs = Date.parse(parsed.startedAtIso);
          if(isFinite(startedAtMs)){
            startedAt = Math.min(referenceNowMs, startedAtMs);
            startedAtIso = new Date(startedAt).toISOString();
            elapsedMs = baseElapsedMs != null ? baseElapsedMs : (elapsedMs + Math.max(0, referenceNowMs - startedAtMs));
          }
        }
        if(startedAt == null){
          startedAt = referenceNowMs;
          startedAtIso = new Date(referenceNowMs).toISOString();
          elapsedMs = baseElapsedMs != null ? baseElapsedMs : elapsedMs;
        }
      } else if(baseElapsedMs != null){
        elapsedMs = baseElapsedMs;
      }
      return {
        elapsedMs: elapsedMs,
        running: running,
        startedAt: startedAt,
        startedAtIso: startedAtIso,
        updatedAtIso: updatedAtIso
      };
    }

    function cloneTimerState(timer){
      timer = timer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };
      return {
        elapsedMs: Number(timer.elapsedMs || 0),
        running: !!timer.running,
        startedAt: timer.startedAt == null ? null : Number(timer.startedAt),
        startedAtIso: timer.startedAtIso == null ? null : String(timer.startedAtIso),
        updatedAtIso: timer.updatedAtIso == null ? null : String(timer.updatedAtIso)
      };
    }

    function getTimerUpdateMs(timer){
      var normalized = normalizeServerNowIso(timer && timer.updatedAtIso);
      if(!normalized) return 0;
      var parsed = Date.parse(normalized);
      return isFinite(parsed) ? parsed : 0;
    }

    function normalizeRoomTimerModes(room){
      if(!room) return;
      room.timer = room.timer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };
      room.cleaningTimer = room.cleaningTimer || { elapsedMs: 0, running: false, startedAt: null, startedAtIso: null, updatedAtIso: null };

      if(room.needsCleaning){
        room.timer.elapsedMs = computeElapsed(room.timer);
        room.timer.running = false;
        room.timer.startedAt = null;
        room.timer.startedAtIso = null;
        if(room.timer.updatedAtIso == null) room.timer.updatedAtIso = null;
        return;
      }

      room.cleaningTimer.elapsedMs = computeElapsed(room.cleaningTimer);
      room.cleaningTimer.running = false;
      room.cleaningTimer.startedAt = null;
      room.cleaningTimer.startedAtIso = null;
      if(room.cleaningTimer.updatedAtIso == null) room.cleaningTimer.updatedAtIso = null;
    }

	    function getRoomEncounterSignature(room){
	      room = room || {};
	      var quickNotes = getRoomQuickNotes(room);
	      return JSON.stringify({
        patientName: String(room.patientName || "").trim(),
        reason: String(room.reason || "").trim(),
	        doctor: String(room.doctor || "").trim(),
	        tech: String(room.tech || "").trim(),
	        notes: String(room.notes || "").trim(),
	        quickNote: quickNotes[0] || "",
	        quickNotes: quickNotes,
	        roomReady: !!room.roomReady,
        doctorReady: !!room.doctorReady,
        needsCleaning: !!room.needsCleaning
      });
    }

    function roomHasMeaningfulBoardState(room){
      room = room || {};
      return !!(
        String(room.patientName || "").trim()
        || String(room.doctor || "").trim()
	        || String(room.tech || "").trim()
	        || String(room.notes || "").trim()
	        || getRoomQuickNotes(room).length
	        || room.roomReady
        || room.doctorReady
        || room.needsCleaning
        || timerHasProgress(room.timer)
        || timerHasProgress(room.cleaningTimer)
        || room.lastDischargeSnapshot
      );
    }

    function preserveFresherLocalTimers(localRoom, mergedRoom){
      if(!localRoom || !mergedRoom) return;
      var localEncounterSignature = getRoomEncounterSignature(localRoom);
      var mergedEncounterSignature = getRoomEncounterSignature(mergedRoom);
      if(localEncounterSignature !== mergedEncounterSignature){
        return;
      }

      var localActiveKey = localRoom.needsCleaning ? "cleaningTimer" : "timer";
      var mergedActiveKey = mergedRoom.needsCleaning ? "cleaningTimer" : "timer";
      var localTimer = localRoom[localActiveKey] || { elapsedMs: 0, running: false, startedAt: null };
      var mergedTimer = mergedRoom[mergedActiveKey] || { elapsedMs: 0, running: false, startedAt: null };
      var localModeMatches = mergedRoom.needsCleaning ? !!localRoom.needsCleaning : !localRoom.needsCleaning;
      if(!localModeMatches) return;

      var localElapsed = computeElapsed(localTimer);
      var mergedElapsed = computeElapsed(mergedTimer);
      var localUpdatedAtMs = getTimerUpdateMs(localTimer);
      var mergedUpdatedAtMs = getTimerUpdateMs(mergedTimer);
      if(localUpdatedAtMs && localUpdatedAtMs > (mergedUpdatedAtMs + 500)){
        mergedRoom[mergedActiveKey] = cloneTimerState(localTimer);
      } else if(localTimer.running && (!mergedTimer.running || localElapsed > (mergedElapsed + 1000))){
        mergedRoom[mergedActiveKey] = cloneTimerState(localTimer);
      }
      normalizeRoomTimerModes(mergedRoom);
    }

	    function serializeRoomBoardState(room){
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
        needsCleaning: !!room.needsCleaning,
        timer: serializeTimerForRoomState(room.timer),
        cleaningTimer: serializeTimerForRoomState(room.cleaningTimer),
        activeRoomSessionId: isUuidLike(room.activeRoomSessionId) ? room.activeRoomSessionId : null,
        activeCleaningSessionId: isUuidLike(room.activeCleaningSessionId) ? room.activeCleaningSessionId : null,
        lastDischargeSnapshot: room.lastDischargeSnapshot ? JSON.parse(JSON.stringify(room.lastDischargeSnapshot)) : null
      };
    }

    function applyRoomBoardState(room, data){
      if(!room || !data || typeof data !== "object") return;
      room.patientName = String(data.patientName || "");
      room.reason = String(data.reason || room.reason || DEFAULT_REASONS[0]);
      room.colorLabelId = data.colorLabelId || room.colorLabelId || getDefaultColorLabelIdFromList(state.colorLabels);
      room.colorHex = String(data.colorHex || "");
	      room.doctor = String(data.doctor || "");
	      room.tech = String(data.tech || "");
	      room.notes = String(data.notes || "");
	      setRoomQuickNotes(room, Array.isArray(data.quickNotes) ? data.quickNotes : (data.quickNote || ""));
	      room.roomReady = !!data.roomReady;
      room.doctorReady = !!data.doctorReady;
      room.needsCleaning = !!data.needsCleaning;
      room.timer = hydrateTimerFromRoomState(data.timer);
      room.cleaningTimer = hydrateTimerFromRoomState(data.cleaningTimer);
      room.activeRoomSessionId = isUuidLike(data.activeRoomSessionId) ? String(data.activeRoomSessionId) : (isUuidLike(room.activeRoomSessionId) ? room.activeRoomSessionId : null);
      room.activeCleaningSessionId = isUuidLike(data.activeCleaningSessionId) ? String(data.activeCleaningSessionId) : (isUuidLike(room.activeCleaningSessionId) ? room.activeCleaningSessionId : null);
      room.lastDischargeSnapshot = data.lastDischargeSnapshot ? JSON.parse(JSON.stringify(data.lastDischargeSnapshot)) : null;
      normalizeRoomTimerModes(room);
    }

    function getPracticeConfigSignature(){
      var doctorInitials = state && state.settings ? (state.settings.doctorInitials || {}) : {};
      return JSON.stringify({
        appointment_types: (state.colorLabels || []).map(function(label, index){
          return {
            id: String(label && label.id || ""),
            title: normalizeColorLabelTitle(label && label.title, "Label " + (index + 1)),
            color_hex: String(label && label.color || "#6ea8fe"),
            sort_order: index + 1
          };
        }),
        quick_notes: (state.quickNotes || []).map(function(note, index){
          return {
            label: String(note == null ? "" : note),
            sort_order: index + 1
          };
        }),
        rooms: (state.rooms || []).map(function(room, index){
          return {
            dbId: String(room && room.dbId || ""),
            name: String(room && room.name || "").trim(),
            active: room && room.active !== false,
            sort_order: index + 1
          };
        }),
        doctors: (state.doctors || []).map(function(name){
          var doctorName = String(name || "").trim();
          return {
            name: doctorName,
            initials: String(doctorInitials[doctorName] || getDoctorInitialsFallback(doctorName)).trim()
          };
        }).filter(function(row){ return !!row.name; }),
        practice_settings: {
          defaultAppointmentTypeId: String(state && state.settings ? (state.settings.defaultColorLabelId || "") : "").trim()
        }
      });
    }

    function getAppointmentTypesConfigSignature(){
      return JSON.stringify({
        appointment_types: (state.colorLabels || []).map(function(label, index){
          return {
            id: String(label && label.id || ""),
            title: normalizeColorLabelTitle(label && label.title, "Label " + (index + 1)),
            color_hex: String(label && label.color || "#6ea8fe"),
            sort_order: index + 1
          };
        }),
        practice_settings: {
          defaultAppointmentTypeId: String(state && state.settings ? (state.settings.defaultColorLabelId || "") : "").trim()
        }
      });
    }

    function getRoomBoardSignature(){
      return getBoardStateSignature(buildBoardStatePayload());
    }

		    // ===== Supabase: board_state single source of truth =====
		    var SHARED_ROOM_CARD_FIELD_KEYS = [
		      "showRoomCardPatient",
		      "showRoomCardType",
		      "showRoomCardDoctorName",
		      "showRoomCardDoctorBadge",
		      "showRoomCardTech",
		      "showRoomCardReady",
		      "showRoomCardQuickNote",
		      "showRoomCardStatusNotes"
		    ];

		    function buildSharedRoomCardFieldsPayload(sourceSettings){
		      var out = {};
		      sourceSettings = sourceSettings || {};
		      for(var i=0;i<SHARED_ROOM_CARD_FIELD_KEYS.length;i++){
		        var key = SHARED_ROOM_CARD_FIELD_KEYS[i];
		        out[key] = sourceSettings[key] !== false;
		      }
		      return out;
		    }

		    function applySharedRoomCardFieldsPayload(targetSettings, payload){
		      if(!targetSettings || !payload || typeof payload !== "object") return;
		      for(var i=0;i<SHARED_ROOM_CARD_FIELD_KEYS.length;i++){
		        var key = SHARED_ROOM_CARD_FIELD_KEYS[i];
		        if(payload[key] != null) targetSettings[key] = payload[key] !== false;
		      }
		      if(payload.showRoomCardDoctor != null){
		        if(payload.showRoomCardDoctorName == null) targetSettings.showRoomCardDoctorName = payload.showRoomCardDoctor !== false;
		        if(payload.showRoomCardDoctorBadge == null) targetSettings.showRoomCardDoctorBadge = payload.showRoomCardDoctor !== false;
		      }
		    }

		    function buildSharedBoardUiPayload(sourceState){
		      var sourceSettings = sourceState && sourceState.settings ? sourceState.settings : {};
		      return {
		        roomCardLineHeight: Math.max(1, Math.min(1.8, Number(sourceSettings.roomCardLineHeight || 1.35))),
		        doctorInitialBadgeScale: Math.max(0.7, Math.min(2, Number(sourceSettings.doctorInitialBadgeScale || 1))),
		        doctorInitialBadgeFontSize: Math.max(10, Math.min(28, Number(sourceSettings.doctorInitialBadgeFontSize || 16))),
		        doctorInitialBadgeColor: String(sourceSettings.doctorInitialBadgeColor || "#0b1220"),
		        doctorInitialBadgeTextColor: String(sourceSettings.doctorInitialBadgeTextColor || (sourceSettings.displayFontColor || "#e8eefc")),
		        doctorBadgeStyles: typeof normalizeDoctorBadgeStylesMap === "function"
		          ? normalizeDoctorBadgeStylesMap(sourceSettings.doctorBadgeStyles)
		          : (sourceSettings.doctorBadgeStyles || {}),
		        roomCardFields: buildSharedRoomCardFieldsPayload(sourceSettings)
		      };
		    }

	    function applySharedBoardUiPayload(targetState, sharedUi){
	      if(!targetState || !targetState.settings || !sharedUi || typeof sharedUi !== "object") return;
	      if(sharedUi.roomCardLineHeight != null) targetState.settings.roomCardLineHeight = Math.max(1, Math.min(1.8, Number(sharedUi.roomCardLineHeight || 1.35)));
	      if(sharedUi.doctorInitialBadgeScale != null) targetState.settings.doctorInitialBadgeScale = Math.max(0.7, Math.min(2, Number(sharedUi.doctorInitialBadgeScale || 1)));
	      if(sharedUi.doctorInitialBadgeFontSize != null) targetState.settings.doctorInitialBadgeFontSize = Math.max(10, Math.min(28, Number(sharedUi.doctorInitialBadgeFontSize || 16)));
	      if(sharedUi.doctorInitialBadgeColor != null) targetState.settings.doctorInitialBadgeColor = String(sharedUi.doctorInitialBadgeColor || "#0b1220");
	      if(sharedUi.doctorInitialBadgeTextColor != null) targetState.settings.doctorInitialBadgeTextColor = String(sharedUi.doctorInitialBadgeTextColor || (targetState.settings.displayFontColor || "#e8eefc"));
		      if(sharedUi.doctorBadgeStyles != null) targetState.settings.doctorBadgeStyles = typeof normalizeDoctorBadgeStylesMap === "function"
		        ? normalizeDoctorBadgeStylesMap(sharedUi.doctorBadgeStyles)
		        : (sharedUi.doctorBadgeStyles || {});
		      if(sharedUi.roomCardFields != null) applySharedRoomCardFieldsPayload(targetState.settings, sharedUi.roomCardFields);
		      else applySharedRoomCardFieldsPayload(targetState.settings, sharedUi);
		    }

	    function buildBoardStatePayload(){
	      var sourceState = ensureStateShape(state || {});
	      return {
	        rooms: JSON.parse(JSON.stringify(sourceState.rooms || [])),
	        sharedUi: buildSharedBoardUiPayload(sourceState)
	      };
	    }

	    function getBoardStateSignature(boardState){
	      var normalized = boardState && typeof boardState === "object" ? boardState : {};
	      return JSON.stringify({
	        rooms: normalized.rooms || [],
	        sharedUi: normalized.sharedUi || {}
	      });
	    }

	    function getCurrentBoardSignatureWithSharedUi(sharedUi){
	      return getBoardStateSignature({
	        rooms: JSON.parse(JSON.stringify(state && state.rooms ? state.rooms : [])),
	        sharedUi: (sharedUi && typeof sharedUi === "object") ? sharedUi : {}
	      });
	    }

    function hasUnsavedLocalBoardChanges(){
      return !!(state && currentPracticeId && localBoardDirty);
    }

    function protectUnsavedLocalBoardChanges(statusText){
      if(!hasUnsavedLocalBoardChanges()) return false;
      noteBoardActivity("local-board-pending");
      if(statusText) setSyncUI("syncing", statusText);
      if(supabase && currentPracticeId && !pendingBoardSave && !saving && !remoteSaveRetryTimer){
        scheduleRemoteSave("board", { immediate: true });
      }
      return true;
    }

    function diffBoardRooms(prevRooms, nextRooms){
      var previous = Array.isArray(prevRooms) ? prevRooms : [];
      var next = Array.isArray(nextRooms) ? nextRooms : [];
      var changedRoomIds = [];
      var structureChanged = previous.length !== next.length;
      var previousById = Object.create(null);
      var nextById = Object.create(null);
      var previousSignatures = Object.create(null);
      var nextSignatures = Object.create(null);
      var i;

      for(i=0;i<previous.length;i++){
        var prevRoom = previous[i] || {};
        var prevId = String(prevRoom.id || "");
        previousById[prevId] = prevRoom;
        previousSignatures[prevId] = JSON.stringify(prevRoom);
        if(!structureChanged && prevId !== String((next[i] && next[i].id) || "")) structureChanged = true;
      }

      for(i=0;i<next.length;i++){
        var nextRoom = next[i] || {};
        var nextId = String(nextRoom.id || "");
        nextById[nextId] = nextRoom;
        nextSignatures[nextId] = JSON.stringify(nextRoom);
      }

      for(var key in previousById){
        if(!Object.prototype.hasOwnProperty.call(previousById, key)) continue;
        if(!Object.prototype.hasOwnProperty.call(nextById, key)){
          structureChanged = true;
          changedRoomIds.push(key);
          continue;
        }
        if(previousSignatures[key] !== nextSignatures[key]) changedRoomIds.push(key);
      }

      for(key in nextById){
        if(!Object.prototype.hasOwnProperty.call(nextById, key) || Object.prototype.hasOwnProperty.call(previousById, key)) continue;
        structureChanged = true;
        changedRoomIds.push(key);
      }

      return {
        structureChanged: structureChanged,
        changedRoomIds: changedRoomIds
      };
    }

    function noteBoardActivity(source){
      lastBoardActivityAt = Date.now();
      return source || "";
    }

    function noteRealtimeEvent(source){
      lastRealtimeEventAt = Date.now();
      if(source) lastRealtimeChannelStatus = source;
      return source || "";
    }

    function clearRealtimeReconnectTimer(){
      if(!realtimeReconnectTimer) return;
      clearTimeout(realtimeReconnectTimer);
      realtimeReconnectTimer = null;
    }

    function updateRealtimeChannelStatus(status){
      var nextStatus = String(status || "unknown");
      lastRealtimeChannelStatus = nextStatus;
      if(nextStatus === "SUBSCRIBED"){
        realtimeChannelHealthy = true;
        noteRealtimeEvent("realtime-subscribed");
        clearRealtimeReconnectTimer();
        if(__pendingRemoteState){
          setTimeout(function(){
            flushPendingRemoteRefresh();
          }, 40);
        }
        return;
      }
      if(nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT" || nextStatus === "CLOSED"){
        realtimeChannelHealthy = false;
      }
    }

    function scheduleRealtimeReconnect(statusText, mode){
      if(realtimeReconnectTimer) return;
      if(!saving) setSyncUI("syncing", statusText || "Reconnecting");
      realtimeReconnectTimer = setTimeout(function(){
        realtimeReconnectTimer = null;
        if(!supabase || !currentPracticeId) return;
        startPracticeRealtime();
        queuePendingRemoteRefresh(statusText || "Reconnecting", mode || "board");
        flushPendingRemoteRefresh();
      }, 1200);
    }

    function applyBoardState(boardState, options){
      options = options || {};
      var incomingUpdatedAt = options.updatedAt || options.updatedAtIso || null;
      var incomingUpdatedAtMs = getBoardUpdatedAtMs(incomingUpdatedAt);
      var incoming = boardState && typeof boardState === "object" ? boardState : {};
      var incomingSignature = getBoardStateSignature(incoming);
      if(!options.force && incomingSignature === lastAppliedBoardStateSignature){
        return false;
      }
	      var previousRooms = state && state.rooms ? state.rooms : [];
	      var nextState = ensureStateShape(JSON.parse(JSON.stringify(state || {})));
	      applySharedBoardUiPayload(nextState, incoming.sharedUi);
	      if(Array.isArray(incoming.rooms) && incoming.rooms.length){
	        nextState.rooms = JSON.parse(JSON.stringify(incoming.rooms));
	      }
      nextState = ensureStateShape(nextState);
      var previousRoomsById = Object.create(null);
      for(var i=0;i<previousRooms.length;i++){
        if(previousRooms[i] && previousRooms[i].id){
          previousRoomsById[String(previousRooms[i].id)] = previousRooms[i];
        }
      }
	      for(var j=0;j<(nextState.rooms || []).length;j++){
	        var nextRoom = nextState.rooms[j];
	        var roomId = String(nextRoom && nextRoom.id || "");
	        var previousRoom = previousRoomsById[roomId];
	        if(previousRoom){
	          var pendingRoomInsert = !!pendingRoomSessionInsertByRoomId[roomId];
	          var pendingCleaningInsert = !!pendingCleaningSessionInsertByRoomId[roomId];
	          if(pendingRoomInsert && !isUuidLike(nextRoom.activeRoomSessionId) && isUuidLike(previousRoom.activeRoomSessionId)){
	            nextRoom.activeRoomSessionId = previousRoom.activeRoomSessionId;
	          }
	          if(pendingCleaningInsert && !isUuidLike(nextRoom.activeCleaningSessionId) && isUuidLike(previousRoom.activeCleaningSessionId)){
	            nextRoom.activeCleaningSessionId = previousRoom.activeCleaningSessionId;
	          }
	          preserveFresherLocalTimers(previousRoom, nextRoom);
	        }
	      }
      var roomDiff = diffBoardRooms(previousRooms, nextState.rooms || []);
      applyAccountSettingsToState(nextState);
      applySessionUiPrefs(nextState);
      state = nextState;
      lastAppliedBoardStateSignature = incomingSignature;
      if(incomingUpdatedAtMs) rememberBoardVersion(incomingUpdatedAt);
      if(options.skipLocalSave !== true) saveLocal();
      refreshKnownRoomIds(state.rooms);
      lastRoomBoardSignature = getCurrentBoardSignatureWithSharedUi(incoming && incoming.sharedUi);
      if(options.skipUiRefresh !== true){
        if(roomDiff.structureChanged){
          bumpRenderPerf("boardApplyFullRenders");
          refreshUiFromState({ applyTheme: !!options.applyTheme });
        } else if(roomDiff.changedRoomIds.length){
          bumpRenderPerf("boardApplyPatches", roomDiff.changedRoomIds.length);
          scheduleUiRefresh({
            applyTheme: !!options.applyTheme,
            display: true,
            displayRoomIds: roomDiff.changedRoomIds,
            intake: isIntakeVisible(),
            intakeRoomIds: roomDiff.changedRoomIds,
            timerBindings: true
          });
        } else if(options.applyTheme && typeof window.applyCurrentTheme === "function"){
          window.applyCurrentTheme();
        }
      }
      return true;
    }

    async function loadBoard(practiceId){
      if(!supabase || !practiceId) return false;
      var boardRes = await supabase
        .from("practice_board_state")
        .select("board_state, updated_at")
        .eq("practice_id", practiceId)
        .maybeSingle();
      if(boardRes.error) throw boardRes.error;
      applyBoardState(boardRes.data && boardRes.data.board_state ? boardRes.data.board_state : {}, {
        applyTheme: false,
        updatedAt: boardRes.data && boardRes.data.updated_at ? boardRes.data.updated_at : null
      });
      noteBoardActivity("load-board");
      return true;
    }

    async function loadPracticeConfigSnapshot(practiceId){
      if(!supabase || !practiceId) return null;
      var roomsReq = supabase.from("rooms").select("id, name, sort_order, active").eq("practice_id", practiceId).order("sort_order", { ascending: true });
      var doctorsReq = supabase.from("doctors").select("id, name, initials, active").eq("practice_id", practiceId).order("name", { ascending: true });
      var settingsReq = queryPracticeSettingsRow(practiceId);
      var appointmentTypesReq = supabase.from("appointment_types").select("id, title, color_hex, sort_order, active").eq("practice_id", practiceId).order("sort_order", { ascending: true });
      var quickNotesReq = supabase.from("quick_notes").select("id, label, sort_order, active").eq("practice_id", practiceId).order("sort_order", { ascending: true });
      var results = await Promise.all([roomsReq, doctorsReq, settingsReq, appointmentTypesReq, quickNotesReq]);
      if(results[0].error) throw results[0].error;
      if(results[1].error) throw results[1].error;
      if(results[2].error) throw results[2].error;
      if(results[3].error) throw results[3].error;
      if(results[4].error) throw results[4].error;
      return {
        roomRows: results[0].data || [],
        doctorRows: results[1].data || [],
        settingsRow: results[2].data || null,
        appointmentTypeRows: results[3].data || [],
        quickNoteRows: results[4].data || []
      };
    }

    async function saveBoard(practiceId, boardState){
      if(!supabase || !practiceId) return false;
      var saveRes = await supabase
        .from("practice_board_state")
        .upsert({
          practice_id: practiceId,
          board_state: boardState
        }, { onConflict: "practice_id" })
        .select("updated_at")
        .maybeSingle();
      if(saveRes.error) throw saveRes.error;
      rememberBoardVersion(saveRes.data && saveRes.data.updated_at ? saveRes.data.updated_at : null);
      noteBoardActivity("save-board");
      return saveRes.data || null;
    }

    function subscribeToBoard(practiceId){
      if(!supabase || !practiceId) return;
      stopPracticeRealtime();
      var tables = [
        "practice_board_state",
        "rooms",
        "doctors",
        "practice_settings",
        "appointment_types",
        "quick_notes"
      ];
      var channel = supabase.channel("board-" + practiceId);
      for(var i=0;i<tables.length;i++){
        (function(tableName){
          channel = channel.on("postgres_changes", {
            event: "*",
            schema: "public",
            table: tableName,
            filter: "practice_id=eq." + practiceId
          }, function(payload){
            noteRealtimeEvent("realtime-" + tableName);
            handlePracticeRealtimeChange(tableName, payload);
          });
        })(tables[i]);
      }
      remotePracticeChannel = channel.subscribe(function(status){
        updateRealtimeChannelStatus(status);
        if(status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED"){
          queuePendingRemoteRefresh("Reconnect pending", "full");
          scheduleRealtimeReconnect("Reconnecting", "full");
        }
      });
    }

    function mergePracticeRowsIntoState(baseState, roomRows, doctorRows, settingsRow, appointmentTypeRows, quickNoteRows){
      var nextState = ensureStateShape(baseState || {});
      var localRoomsByDbId = Object.create(null);
      var localRoomsByName = Object.create(null);
      var localColorTitlesById = Object.create(null);
      var appointmentTypeByTitle = Object.create(null);
      var i;
      for(i=0;i<nextState.rooms.length;i++){
        if(nextState.rooms[i] && nextState.rooms[i].dbId){
          localRoomsByDbId[String(nextState.rooms[i].dbId)] = nextState.rooms[i];
        }
        localRoomsByName[String(nextState.rooms[i].name || "").trim().toLowerCase()] = nextState.rooms[i];
      }
      for(i=0;i<(nextState.colorLabels || []).length;i++){
        localColorTitlesById[nextState.colorLabels[i].id] = normalizeColorLabelTitle(nextState.colorLabels[i].title, "Label " + (i + 1));
      }

      if(appointmentTypeRows && appointmentTypeRows.length){
        appointmentTypeRows.sort(function(a, b){ return Number(a.sort_order || 0) - Number(b.sort_order || 0); });
        nextState.colorLabels = appointmentTypeRows.map(function(row, index){
          var title = normalizeColorLabelTitle(row.title, "Label " + (index + 1));
          appointmentTypeByTitle[String(title).toLowerCase()] = row.id;
          return {
            id: row.id || uuid(),
            title: title,
            color: row.color_hex || "#6ea8fe"
          };
        });
      }

      if(quickNoteRows && quickNoteRows.length){
        quickNoteRows.sort(function(a, b){ return Number(a.sort_order || 0) - Number(b.sort_order || 0); });
        nextState.quickNotes = [""].concat(quickNoteRows.filter(function(row){
          return row.active !== false;
        }).map(function(row){
          return String(row.label || "");
        }).filter(function(label){ return !!label; }));
      }

      if(roomRows && roomRows.length){
        roomRows.sort(function(a, b){ return Number(a.sort_order || 0) - Number(b.sort_order || 0); });
        nextState.rooms = roomRows.map(function(row){
          var dbKey = row && row.id ? String(row.id) : "";
          var key = String(row.name || "").trim().toLowerCase();
          var existing = (dbKey && localRoomsByDbId[dbKey]) || localRoomsByName[key];
          var room = existing ? JSON.parse(JSON.stringify(existing)) : createRoomRecord(row.name, getConfiguredDefaultColorLabelId(nextState.colorLabels, nextState.settings.defaultColorLabelId));
          var previousTitle = localColorTitlesById[room.colorLabelId] || room.reason || "";
          var mappedColorId = previousTitle ? appointmentTypeByTitle[String(previousTitle).toLowerCase()] : null;
          room.dbId = row.id || room.dbId || null;
          room.name = row.name || room.name;
          room.active = row.active !== false;
          if(mappedColorId) room.colorLabelId = mappedColorId;
          return room;
        });
      }

      if(doctorRows && doctorRows.length){
        nextState.doctors = doctorRows
          .filter(function(row){ return row.active !== false; })
          .map(function(row){ return row.name; });
        nextState.settings.doctorInitials = {};
        for(i=0;i<doctorRows.length;i++){
          if(doctorRows[i].name){
            nextState.settings.doctorInitials[doctorRows[i].name] = doctorRows[i].initials || getDoctorInitialsFallback(doctorRows[i].name);
          }
        }
      }

      if(settingsRow){
        nextState.settings.defaultColorLabelId = getConfiguredDefaultColorLabelId(nextState.colorLabels, settingsRow.default_appointment_type_id || nextState.settings.defaultColorLabelId);
      }

      return ensureStateShape(nextState);
    }

    function applyPracticeConfigSnapshot(snapshot, options){
      options = options || {};
      var nextBaseState = ensureStateShape(JSON.parse(JSON.stringify(state || {})));
      state = mergePracticeRowsIntoState(
        nextBaseState,
        snapshot && snapshot.roomRows ? snapshot.roomRows : [],
        snapshot && snapshot.doctorRows ? snapshot.doctorRows : [],
        snapshot ? snapshot.settingsRow : null,
        snapshot && snapshot.appointmentTypeRows ? snapshot.appointmentTypeRows : [],
        snapshot && snapshot.quickNoteRows ? snapshot.quickNoteRows : []
      );
      applyAccountSettingsToState(state);
      applySessionUiPrefs(state);
      saveLocal();
      refreshKnownRoomIds(state.rooms);
      lastPracticeConfigSignature = getPracticeConfigSignature();
      lastAppointmentTypesSignature = getAppointmentTypesConfigSignature();
      if(options.skipUiRefresh === true) return true;
      refreshUiFromState({ applyTheme: !!options.applyTheme, renderSettingsLists: true });
      return true;
    }

    async function loadPracticeData(){
      if(!supabase || !currentPracticeId){
        setStatus("No clinic is linked to this login yet.");
        setSyncUI("err", "No clinic");
        return false;
      }
      if(!await requireAuthenticatedSession("Clinic load")) return false;
      try{
        setSyncUI("syncing", "Loading clinic");
        var localState = ensureStateShape(loadLocal() || null);
        var persistedSettingsPromise = Promise.all([
          loadUserSettingsRecord(),
          loadPracticeDefaultSettingsRecord()
        ]).then(function(results){
          return {
            userSettingsRecord: results[0] || null,
            practiceDefaultSettingsRecord: results[1] || null
          };
        }).catch(function(settingsErr){
          if(!isMissingSettingsStorageError(settingsErr)) throw settingsErr;
          return {
            userSettingsRecord: null,
            practiceDefaultSettingsRecord: null
          };
        });
        var roomsReq = supabase.from("rooms").select("id, name, sort_order, active").eq("practice_id", currentPracticeId).order("sort_order", { ascending: true });
        var doctorsReq = supabase.from("doctors").select("id, name, initials, active").eq("practice_id", currentPracticeId).order("name", { ascending: true });
        var settingsReq = queryPracticeSettingsRow(currentPracticeId);
        var appointmentTypesReq = supabase.from("appointment_types").select("id, title, color_hex, sort_order, active").eq("practice_id", currentPracticeId).order("sort_order", { ascending: true });
        var quickNotesReq = supabase.from("quick_notes").select("id, label, sort_order, active").eq("practice_id", currentPracticeId).order("sort_order", { ascending: true });
        var roomBoardReq = supabase.from("practice_board_state").select("board_state, updated_at").eq("practice_id", currentPracticeId).maybeSingle();
        var results = await Promise.all([roomsReq, doctorsReq, settingsReq, appointmentTypesReq, quickNotesReq, roomBoardReq]);
        if(results[0].error) throw results[0].error;
        if(results[1].error) throw results[1].error;
        if(results[2].error) throw results[2].error;
        if(results[3].error) throw results[3].error;
        if(results[4].error) throw results[4].error;
        if(results[5].error) throw results[5].error;
        var persistedSettings = await persistedSettingsPromise;
        var userSettingsRecord = persistedSettings.userSettingsRecord;
        var practiceDefaultSettingsRecord = persistedSettings.practiceDefaultSettingsRecord;
        state = mergePracticeRowsIntoState(localState, results[0].data || [], results[1].data || [], results[2].data || null, results[3].data || [], results[4].data || []);
        var effectiveSettings = null;
        var shouldSeedUserSettings = false;
        if(userSettingsRecord && userSettingsRecord.settings){
          effectiveSettings = userSettingsRecord.settings;
        } else if(practiceDefaultSettingsRecord && practiceDefaultSettingsRecord.settings){
          effectiveSettings = practiceDefaultSettingsRecord.settings;
          shouldSeedUserSettings = !!currentUserId;
        } else {
          effectiveSettings = getBuiltInPersistentSettingsDefaults();
        }
        applyPersistentSettingsSnapshotToState(state, effectiveSettings, { syncWindow: false });
        if(shouldSeedUserSettings){
          try{
            await saveUserSettingsRecord(effectiveSettings, currentUserId);
          }catch(seedErr){
            if(!isMissingSettingsStorageError(seedErr)) throw seedErr;
          }
        }
	        applyAccountSettingsToState(state);
	        applySessionUiPrefs(state);
        if(results[5].data && results[5].data.board_state){
          applyBoardState(results[5].data.board_state, {
            applyTheme: false,
            skipLocalSave: true,
            skipUiRefresh: true,
            force: true,
            updatedAt: results[5].data.updated_at || null
          });
        } else {
          resetKnownBoardVersion();
          lastAppliedBoardStateSignature = getBoardStateSignature(buildBoardStatePayload());
        }
        saveLocal();
        refreshUiFromState({ applyTheme: true });
        refreshKnownRoomIds(state.rooms);
        lastPracticeConfigSignature = getPracticeConfigSignature();
        lastAppointmentTypesSignature = getAppointmentTypesConfigSignature();
        if(!(results[5].data && results[5].data.board_state)){
          lastRoomBoardSignature = getRoomBoardSignature();
        }
        setStatus((currentPracticeName || "Clinic") + " ready.");
        setSyncUI("ok", "Clinic loaded");
        return true;
      }catch(e){
        console.error("loadPracticeData failed:", e);
        if(isRateLimitError(e)) noteRateLimit();
        setStatus("Clinic load failed: " + getErrorMessage(e));
        setSyncUI("err", "Load failed");
        return false;
      }
    }

    async function saveRoomsToPractice(){
      normalizeSettingsForSave(state);
      var existingPayload = [];
      var newPayload = [];
      var newRoomRefs = [];
      var retainedRoomIds = [];
      for(var i=0;i<state.rooms.length;i++){
        var roomPayload = {
          practice_id: currentPracticeId,
          name: state.rooms[i].name || ("Room " + (i + 1)),
          sort_order: i + 1,
          active: state.rooms[i].active !== false
        };
        if(state.rooms[i].dbId){
          roomPayload.id = state.rooms[i].dbId;
          existingPayload.push(roomPayload);
          retainedRoomIds.push(roomPayload.id);
        } else {
          newPayload.push(roomPayload);
          newRoomRefs.push(state.rooms[i]);
        }
      }
      var existingRes = await supabase.from("rooms").select("id").eq("practice_id", currentPracticeId);
      if(existingRes.error) throw existingRes.error;
      var existingIds = (existingRes.data || []).map(function(row){ return row.id; });
      var idsToDelete = existingIds.filter(function(id){ return retainedRoomIds.indexOf(id) === -1; });
      if(idsToDelete.length){
        var delRes = await supabase.from("rooms").delete().in("id", idsToDelete);
        if(delRes.error) throw delRes.error;
      }
      var savedRooms = [];
      if(existingPayload.length){
        var upsertRes = await supabase.from("rooms").upsert(existingPayload, { onConflict: "id" }).select("id, name, sort_order, active");
        if(upsertRes.error) throw upsertRes.error;
        savedRooms = savedRooms.concat(upsertRes.data || []);
      }
      if(newPayload.length){
        var insertRes = await supabase.from("rooms").insert(newPayload).select("id, name, sort_order, active");
        if(insertRes.error) throw insertRes.error;
        savedRooms = savedRooms.concat(insertRes.data || []);
        var insertedRooms = (insertRes.data || []).slice().sort(function(a, b){
          return Number(a.sort_order || 0) - Number(b.sort_order || 0);
        });
        for(var ni=0;ni<newRoomRefs.length;ni++){
          if(insertedRooms[ni] && newRoomRefs[ni]) newRoomRefs[ni].dbId = insertedRooms[ni].id;
        }
      }
      if(!savedRooms.length) return [];
      for(var j=0;j<state.rooms.length;j++){
        if(state.rooms[j] && state.rooms[j].dbId) continue;
        var byOrder = null;
        for(var sr=0;sr<savedRooms.length;sr++){
          if(Number(savedRooms[sr].sort_order || 0) === (j + 1)){
            byOrder = savedRooms[sr];
            break;
          }
        }
        if(byOrder) state.rooms[j].dbId = byOrder.id;
      }
      return savedRooms;
    }

    async function saveDoctorsToPractice(){
      var doctorInitials = state && state.settings ? (state.settings.doctorInitials || {}) : {};
      var doctorsPayload = [];
      for(var i=0;i<state.doctors.length;i++){
        var doctorName = String(state.doctors[i] || "").trim();
        if(!doctorName) continue;
        doctorsPayload.push({
          practice_id: currentPracticeId,
          name: doctorName,
          initials: String(doctorInitials[doctorName] || getDoctorInitialsFallback(doctorName)).trim() || getDoctorInitialsFallback(doctorName),
          active: true
        });
      }
      var delRes = await supabase.from("doctors").delete().eq("practice_id", currentPracticeId);
      if(delRes.error) throw delRes.error;
      if(!doctorsPayload.length) return [];
      var insRes = await supabase.from("doctors").insert(doctorsPayload).select("id, name, initials, active");
      if(insRes.error) throw insRes.error;
      return insRes.data || [];
    }

    async function saveAppointmentTypesToPractice(){
      normalizeSettingsForSave(state);
      var payload = [];
      for(var i=0;i<state.colorLabels.length;i++){
        payload.push({
          id: state.colorLabels[i].id || uuid(),
          practice_id: currentPracticeId,
          title: normalizeColorLabelTitle(state.colorLabels[i].title, "Label " + (i + 1)),
          color_hex: state.colorLabels[i].color || "#6ea8fe",
          sort_order: i + 1,
          active: true
        });
      }
      var existingRes = await supabase.from("appointment_types").select("id").eq("practice_id", currentPracticeId);
      if(existingRes.error) throw existingRes.error;
      var existingIds = (existingRes.data || []).map(function(row){ return row.id; });
      var retainedIds = payload.map(function(row){ return row.id; });
      var idsToDelete = existingIds.filter(function(id){ return retainedIds.indexOf(id) === -1; });
      if(idsToDelete.length){
        var delRes = await supabase.from("appointment_types").delete().in("id", idsToDelete);
        if(delRes.error) throw delRes.error;
      }
      if(!payload.length) return [];
      var upsertRes = await supabase.from("appointment_types").upsert(payload, { onConflict: "id" }).select("id, title, color_hex, sort_order, active");
      if(upsertRes.error) throw upsertRes.error;
      return upsertRes.data || [];
    }

    async function saveQuickNotesToPractice(){
      var payload = [];
      for(var i=0;i<state.quickNotes.length;i++){
        var label = String(state.quickNotes[i] == null ? "" : state.quickNotes[i]).trim();
        if(!label) continue;
        payload.push({
          practice_id: currentPracticeId,
          label: label,
          sort_order: payload.length + 1,
          active: true
        });
      }
      var delRes = await supabase.from("quick_notes").delete().eq("practice_id", currentPracticeId);
      if(delRes.error) throw delRes.error;
      if(!payload.length) return [];
      var insRes = await supabase.from("quick_notes").insert(payload).select("id, label, sort_order, active");
      if(insRes.error) throw insRes.error;
      return insRes.data || [];
    }

    async function savePracticeBoardStateToPractice(){
      return await saveBoard(currentPracticeId, buildBoardStatePayload());
    }

    async function persistDoctorBadgeSettingsSnapshotIfNeeded(){
      if(!doctorBadgeSettingsDirty) return false;
      var snapshot = capturePersistentSettingsSnapshot(true);
      try{
        await savePracticeDefaultSettingsRecord(snapshot);
      }catch(err){
        if(!isMissingSettingsStorageError(err)) console.warn("Saving practice badge settings snapshot failed:", err);
      }
      if(currentUserId){
        try{
          await saveUserSettingsRecord(snapshot, currentUserId);
        }catch(err){
          if(!isMissingSettingsStorageError(err)) console.warn("Saving user badge settings snapshot failed:", err);
        }
      }
      doctorBadgeSettingsDirty = false;
      noteSettingsRemoteFinished(true, "Saved automatically");
      return true;
    }

    async function savePracticeSettingsToPractice(doctorRows, appointmentTypeRows){
      var defaultAppointmentTypeId = null;
      var i;
      if(appointmentTypeRows && appointmentTypeRows.length){
        for(var j=0;j<appointmentTypeRows.length;j++){
          if(appointmentTypeRows[j].id === state.settings.defaultColorLabelId){
            defaultAppointmentTypeId = appointmentTypeRows[j].id;
            break;
          }
        }
      }
      var payload = {
        practice_id: currentPracticeId,
        default_appointment_type_id: defaultAppointmentTypeId
      };
      var res = await upsertPracticeSettingsRow(payload);
      if(res.error) throw res.error;
    }

    function scheduleRemoteSave(kind, options){
      options = options || {};
      if(!supabase || !currentPracticeId) return;
      if(remoteSaveRetryTimer){
        clearTimeout(remoteSaveRetryTimer);
        remoteSaveRetryTimer = null;
      }
      remoteSaveRetryCount = 0;
      if(kind === "board"){
        pendingBoardSave = true;
        localBoardDirty = true;
        noteBoardActivity("queue-board-save");
      }
      else if(kind === "appointmentTypes") pendingAppointmentTypesSave = true;
      else if(kind === "userSettings") pendingUserSettingsSave = true;
      else pendingConfigSave = true;
      if(remoteRateLimitUntil > Date.now()){
        if(saveDebounce) clearTimeout(saveDebounce);
        saveDebounce = setTimeout(flushRemoteSave, Math.max(400, remoteRateLimitUntil - Date.now()));
        return;
      }
      if(saveDebounce) clearTimeout(saveDebounce);
      if(options.immediate){
        saveDebounce = setTimeout(flushRemoteSave, 0);
        return;
      }
      saveDebounce = setTimeout(flushRemoteSave, kind === "board" ? REMOTE_BOARD_SAVE_DELAY_MS : REMOTE_CONFIG_SAVE_DELAY_MS);
    }

    function createRetryableSaveError(message){
      var err = new Error(message || "Save deferred.");
      err.retryable = true;
      return err;
    }

    function clearRemoteSaveRetry(){
      if(remoteSaveRetryTimer){
        clearTimeout(remoteSaveRetryTimer);
        remoteSaveRetryTimer = null;
      }
      remoteSaveRetryCount = 0;
    }

    function isRetryableSaveError(err){
      if(!err) return false;
      if(err.retryable) return true;
      if(isRateLimitError(err)) return true;
      var status = Number(err.status || err.statusCode || 0);
      if(status >= 500 && status < 600) return true;
      var message = String(err.message || err.details || err.hint || err.error_description || "").toLowerCase();
      return message.indexOf("failed to fetch") >= 0
        || message.indexOf("fetch failed") >= 0
        || message.indexOf("network") >= 0
        || message.indexOf("connection") >= 0
        || message.indexOf("timed out") >= 0
        || message.indexOf("timeout") >= 0
        || message.indexOf("temporar") >= 0
        || message.indexOf("expired") >= 0
        || message.indexOf("login required") >= 0
        || message.indexOf("sign in") >= 0
        || message.indexOf("session") >= 0;
    }

    function scheduleRemoteSaveRetry(kinds, statusText, options){
      kinds = kinds || {};
      options = options || {};
      if(kinds.config) pendingConfigSave = true;
      if(kinds.appointmentTypes) pendingAppointmentTypesSave = true;
      if(kinds.userSettings) pendingUserSettingsSave = true;
      if(kinds.board){
        pendingBoardSave = true;
        localBoardDirty = true;
      }
      var delayMs = Number(options.delayMs);
      if(!isFinite(delayMs) || delayMs < 0){
        remoteSaveRetryCount = Math.min(6, remoteSaveRetryCount + 1);
        delayMs = Math.min(15000, 750 * Math.pow(2, remoteSaveRetryCount - 1));
      }
      if(remoteRateLimitUntil > Date.now()){
        delayMs = Math.max(delayMs, remoteRateLimitUntil - Date.now());
      }
      if(remoteSaveRetryTimer) return;
      if(statusText){
        setSyncUI("syncing", statusText);
      }
      remoteSaveRetryTimer = setTimeout(function(){
        remoteSaveRetryTimer = null;
        flushRemoteSave();
      }, Math.max(400, delayMs));
    }

    function isRateLimitError(err){
      if(!err) return false;
      var status = Number(err.status || err.statusCode || 0);
      var message = String(err.message || err.details || err.error_description || "").toLowerCase();
      return status === 429
        || message.indexOf("rate limit") >= 0
        || message.indexOf("too many requests") >= 0;
    }

    function noteRateLimit(delayMs){
      var cooldown = Math.max(5000, Number(delayMs || 15000));
      remoteRateLimitUntil = Date.now() + cooldown;
      setSyncUI("err", "Rate limited");
      setStatus("Supabase rate limit reached. Slowing sync briefly.");
    }

    async function saveClinicConfigData(){
      normalizeSettingsForSave(state);
      var nextSignature = getPracticeConfigSignature();
      var nextBoardSignature = getRoomBoardSignature();
      var shouldSaveBoardState = pendingBoardSave || nextBoardSignature !== lastRoomBoardSignature;
      if(nextSignature !== lastPracticeConfigSignature){
        var blockingIssues = getBlockingSettingsIssues(state);
        if(blockingIssues.length){
          noteSettingsRemoteFinished(false, describeSettingsIssuesForSaveState(blockingIssues, "Fix settings first"));
          setStatus(describeSettingsIssuesForStatus(blockingIssues));
          setSyncUI("err", "Fix settings");
          return false;
        }
      }
	      if(nextSignature === lastPracticeConfigSignature){
	        if(currentUserId){
	          try{
	            await saveUserSettingsRecord(capturePersistentSettingsSnapshot(true), currentUserId);
          }catch(settingsErr){
            if(!isMissingSettingsStorageError(settingsErr)) throw settingsErr;
          }
        }
	        if(shouldSaveBoardState){
	          await saveClinicBoardData();
	          noteSettingsRemoteFinished(true, "Saved automatically");
	          return true;
        }
        setSyncUI("ok", currentPracticeName ? "Clinic ready" : "Guest");
        noteSettingsRemoteFinished(true, "Saved automatically");
        return true;
      }
      if(!await requireAuthenticatedSession("Clinic save")){
        noteSettingsRemoteFinished(false, "Sign in to save");
        throw createRetryableSaveError("Clinic save deferred until sign in.");
      }
      setSyncUI("syncing", "Saving clinic");
      var appointmentTypeRows = await saveAppointmentTypesToPractice();
      await saveQuickNotesToPractice();
      var doctorRows = await saveDoctorsToPractice();
      await saveRoomsToPractice();
      if(shouldSaveBoardState){
        await saveClinicBoardData();
      }
      await savePracticeSettingsToPractice(doctorRows, appointmentTypeRows);
      if(currentUserId){
        try{
          await saveUserSettingsRecord(capturePersistentSettingsSnapshot(true), currentUserId);
        }catch(settingsErr){
          if(!isMissingSettingsStorageError(settingsErr)) throw settingsErr;
        }
      }
      lastPracticeConfigSignature = getPracticeConfigSignature();
      lastAppointmentTypesSignature = getAppointmentTypesConfigSignature();
      if(!shouldSaveBoardState) lastRoomBoardSignature = nextBoardSignature;
      setSyncUI("ok", "Clinic saved");
      noteSettingsRemoteFinished(true, "Saved automatically");
      return true;
    }

    async function saveAppointmentTypesConfigData(){
      normalizeSettingsForSave(state);
      var blockingIssues = getBlockingAppointmentTypeSettingsIssues(state);
      if(blockingIssues.length){
        noteSettingsRemoteFinished(false, describeSettingsIssuesForSaveState(blockingIssues, "Fix settings first"));
        setStatus(describeSettingsIssuesForStatus(blockingIssues));
        setSyncUI("err", "Fix settings");
        return;
      }
      var nextSignature = getAppointmentTypesConfigSignature();
      if(nextSignature === lastAppointmentTypesSignature){
        setSyncUI("ok", currentPracticeName ? "Clinic ready" : "Guest");
        noteSettingsRemoteFinished(true, "Saved automatically");
        return;
      }
      if(!await requireAuthenticatedSession("Appointment type save")){
        noteSettingsRemoteFinished(false, "Sign in to save");
        throw createRetryableSaveError("Appointment type save deferred until sign in.");
      }
      setSyncUI("syncing", "Saving labels");
      var appointmentTypeRows = await saveAppointmentTypesToPractice();
      await savePracticeSettingsToPractice(null, appointmentTypeRows);
      lastAppointmentTypesSignature = getAppointmentTypesConfigSignature();
      lastPracticeConfigSignature = getPracticeConfigSignature();
      setSyncUI("ok", "Labels saved");
      noteSettingsRemoteFinished(true, "Saved automatically");
    }

    async function saveClinicBoardData(){
      var nextSignature = getRoomBoardSignature();
	      if(nextSignature === lastRoomBoardSignature){
	        localBoardDirty = false;
	        await persistDoctorBadgeSettingsSnapshotIfNeeded();
	        clearRemoteSaveRetry();
	        setSyncUI("ok", currentPracticeName ? "Clinic ready" : "Guest");
	        if(settingsRemoteSaveQueued) noteSettingsRemoteFinished(true, "Saved automatically");
	        return;
	      }
      if(!await requireAuthenticatedSession("Board save")){
        throw createRetryableSaveError("Board save deferred until sign in.");
      }
      setSyncUI("syncing", "Saving board");
      await saveBoard(currentPracticeId, buildBoardStatePayload());
      lastRoomBoardSignature = nextSignature;
      localBoardDirty = false;
	      await persistDoctorBadgeSettingsSnapshotIfNeeded();
	      clearRemoteSaveRetry();
      setSyncUI("ok", "Board saved");
	      if(settingsRemoteSaveQueued) noteSettingsRemoteFinished(true, "Saved automatically");
	    }

    async function saveUserSettingsData(){
      normalizeSettingsForSave(state);
      if(!currentUserId){
        noteSettingsRemoteFinished(false, "Sign in to save");
        throw createRetryableSaveError("Settings save deferred until sign in.");
      }
      if(!await requireAuthenticatedSession("Settings save")){
        noteSettingsRemoteFinished(false, "Sign in to save");
        throw createRetryableSaveError("Settings save deferred until sign in.");
      }
      setSyncUI("syncing", "Saving settings");
      try{
        await saveUserSettingsRecord(capturePersistentSettingsSnapshot(true), currentUserId);
      }catch(settingsErr){
        if(!isMissingSettingsStorageError(settingsErr)) throw settingsErr;
      }
      setSyncUI("ok", currentPracticeName ? "Clinic ready" : "Guest");
      noteSettingsRemoteFinished(true, "Saved automatically");
    }

    async function flushRemoteSave(){
      if(!supabase || !currentPracticeId) return;
      if(remoteRateLimitUntil > Date.now()){
        if(saveDebounce) clearTimeout(saveDebounce);
        saveDebounce = setTimeout(flushRemoteSave, Math.max(400, remoteRateLimitUntil - Date.now()));
        return;
      }
      if(saving){
        if(saveDebounce) clearTimeout(saveDebounce);
        saveDebounce = setTimeout(flushRemoteSave, 250);
        return;
      }
      var shouldSaveConfig = pendingConfigSave;
      var shouldSaveAppointmentTypes = pendingAppointmentTypesSave;
      var shouldSaveBoard = pendingBoardSave;
      var shouldSaveUserSettings = pendingUserSettingsSave;
      pendingConfigSave = false;
      pendingAppointmentTypesSave = false;
      pendingBoardSave = false;
      pendingUserSettingsSave = false;
      if(!shouldSaveConfig && !shouldSaveAppointmentTypes && !shouldSaveBoard && !shouldSaveUserSettings) return;
      saving = true;
      var userSettingsSavedWithConfig = false;
      try{
        if(shouldSaveConfig){
          userSettingsSavedWithConfig = await saveClinicConfigData() !== false;
          shouldSaveConfig = false;
          shouldSaveAppointmentTypes = false;
          shouldSaveBoard = false;
        }
        else {
          if(shouldSaveAppointmentTypes){
            await saveAppointmentTypesConfigData();
            shouldSaveAppointmentTypes = false;
          }
          if(shouldSaveBoard){
            await saveClinicBoardData();
            shouldSaveBoard = false;
          }
        }
        if(shouldSaveUserSettings && !userSettingsSavedWithConfig){
          await saveUserSettingsData();
          shouldSaveUserSettings = false;
        }
        if(userSettingsSavedWithConfig) shouldSaveUserSettings = false;
        clearRemoteSaveRetry();
      } catch(e){
        console.error("savePracticeData failed:", e);
        var shouldRetry = isRetryableSaveError(e);
        if(shouldRetry){
          scheduleRemoteSaveRetry({
            config: !!shouldSaveConfig,
            appointmentTypes: !!shouldSaveAppointmentTypes,
            board: !!(shouldSaveBoard || localBoardDirty),
            userSettings: !!(shouldSaveUserSettings && !shouldSaveConfig)
          }, "Retrying save");
          setStatus((shouldSaveAppointmentTypes ? "Appointment type save failed. " : shouldSaveConfig ? "Clinic save failed. " : shouldSaveBoard ? "Board save failed. " : "Settings save failed. ") + "Retrying automatically. " + getErrorMessage(e));
	          if(shouldSaveConfig || shouldSaveAppointmentTypes || shouldSaveUserSettings || settingsRemoteSaveQueued) noteSettingsRemoteQueued("Retrying save…");
        }
        if(isRateLimitError(e)){
          noteRateLimit();
        }
        if(!shouldRetry){
          setSyncUI("err", "Save failed");
          setStatus((shouldSaveAppointmentTypes ? "Appointment type save failed: " : shouldSaveConfig ? "Clinic save failed: " : shouldSaveBoard ? "Board save failed: " : "Settings save failed: ") + getErrorMessage(e));
	          if(shouldSaveConfig || shouldSaveAppointmentTypes || shouldSaveUserSettings || settingsRemoteSaveQueued) noteSettingsRemoteFinished(false, "Save failed");
	        }
      } finally {
        saving = false;
        if(__pendingRemoteState){
          setTimeout(function(){
            flushPendingRemoteRefresh();
          }, 60);
        }
        if(pendingConfigSave || pendingAppointmentTypesSave || pendingBoardSave || pendingUserSettingsSave){
          if(saveDebounce) clearTimeout(saveDebounce);
          saveDebounce = setTimeout(flushRemoteSave, 250);
        }
      }
    }

    async function savePracticeData(kind){
      if(!supabase || !currentPracticeId) return;
      if(kind === "board"){
        pendingBoardSave = true;
        localBoardDirty = true;
      }
      else if(kind === "appointmentTypes") pendingAppointmentTypesSave = true;
      else if(kind === "userSettings") pendingUserSettingsSave = true;
      else pendingConfigSave = true;
      await flushRemoteSave();
    }

    function commitBoardInBackground(options){
      options = options || {};
      setTimeout(function(){
        if(options.skipLocalSave !== true) saveLocal();
        scheduleRemoteSave("board", { immediate: !!options.immediate });
      }, 0);
    }

    async function commitBoardNow(options){
      options = options || {};
      noteBoardActivity("commit-board-now");
      if(options.skipLocalSave !== true) saveLocal();
      await savePracticeData("board");
    }

    function normalizePendingRemoteMode(mode){
      return mode === "config" || mode === "full" ? mode : "board";
    }

    function mergePendingRemoteMode(currentMode, nextMode){
      var current = normalizePendingRemoteMode(currentMode);
      var next = normalizePendingRemoteMode(nextMode);
      if(current === next) return current;
      if(current === "full" || next === "full") return "full";
      return "full";
    }

    function queuePendingRemoteRefresh(statusText, mode){
      __pendingRemoteState = true;
      __pendingRemoteLabel = statusText || "";
      __pendingRemoteMode = mergePendingRemoteMode(__pendingRemoteMode, mode || "board");
      if(!saving) setSyncUI("syncing", __pendingRemoteLabel || (__pendingRemoteMode === "config" ? "Refreshing settings" : "Updating"));
    }

    async function flushPendingRemoteRefresh(){
      if(!__pendingRemoteState) return false;
      if(!supabase || !currentPracticeId) return false;
      if(saving || isUiInteractionLocked()){
        if(__interactionReleaseTimer) clearTimeout(__interactionReleaseTimer);
        __interactionReleaseTimer = setTimeout(function(){
          __interactionReleaseTimer = null;
          flushPendingRemoteRefresh();
        }, 500);
        return false;
      }
      var label = __pendingRemoteLabel || "Updating";
      var mode = normalizePendingRemoteMode(__pendingRemoteMode);
      __pendingRemoteState = false;
      __pendingRemoteLabel = "";
      __pendingRemoteMode = "board";
      if(mode === "config") return await refreshPracticeConfigNow(label);
      if(mode === "full"){
        var configOk = await refreshPracticeConfigNow(label);
        var boardOk = await refreshPracticeDataNow(label);
        return !!(configOk || boardOk);
      }
      return await refreshPracticeDataNow(label);
    }

    async function refreshPracticeDataNow(statusText){
      if(!supabase || !currentPracticeId) return false;
      if(remoteRefreshInFlight) return remoteRefreshInFlight;
      if(protectUnsavedLocalBoardChanges("Saving local changes")) return false;
      if(remoteRateLimitUntil > Date.now()){
        queuePendingRemoteRefresh(statusText || "Refresh queued", "board");
        if(__interactionReleaseTimer) clearTimeout(__interactionReleaseTimer);
        __interactionReleaseTimer = setTimeout(function(){
          __interactionReleaseTimer = null;
          flushPendingRemoteRefresh();
        }, Math.max(400, remoteRateLimitUntil - Date.now()));
        return false;
      }
      if(saving || isUiInteractionLocked()){
        queuePendingRemoteRefresh(statusText, "board");
        return false;
      }
      var now = Date.now();
      if(now - lastRemoteRefreshAt < REMOTE_REFRESH_THROTTLE_MS){
        queuePendingRemoteRefresh(statusText, "board");
        if(__interactionReleaseTimer) clearTimeout(__interactionReleaseTimer);
        __interactionReleaseTimer = setTimeout(function(){
          __interactionReleaseTimer = null;
          flushPendingRemoteRefresh();
        }, REMOTE_REFRESH_THROTTLE_MS - (now - lastRemoteRefreshAt) + 20);
        return false;
      }
      lastRemoteRefreshAt = now;
      if(statusText) setSyncUI("syncing", statusText);
      remoteRefreshInFlight = loadBoard(currentPracticeId).then(function(){
        noteBoardActivity("refresh-board");
        setSyncUI("ok", "Board loaded");
        return true;
      }).catch(function(e){
        console.warn("Board refresh failed:", e);
        if(isRateLimitError(e)) noteRateLimit();
        else setSyncUI("err", "Refresh failed");
        setStatus("Board refresh failed. Retrying automatically. " + getErrorMessage(e));
        return false;
      }).finally(function(){
        remoteRefreshInFlight = null;
      });
      return await remoteRefreshInFlight;
    }

    async function refreshPracticeConfigNow(statusText){
      if(!supabase || !currentPracticeId) return false;
      if(remoteConfigRefreshInFlight) return remoteConfigRefreshInFlight;
      if(remoteRateLimitUntil > Date.now()){
        queuePendingRemoteRefresh(statusText || "Refresh queued", "config");
        if(__interactionReleaseTimer) clearTimeout(__interactionReleaseTimer);
        __interactionReleaseTimer = setTimeout(function(){
          __interactionReleaseTimer = null;
          flushPendingRemoteRefresh();
        }, Math.max(400, remoteRateLimitUntil - Date.now()));
        return false;
      }
      if(saving || isUiInteractionLocked()){
        queuePendingRemoteRefresh(statusText, "config");
        return false;
      }
      var now = Date.now();
      if(now - lastRemoteConfigRefreshAt < REMOTE_CONFIG_REFRESH_THROTTLE_MS){
        queuePendingRemoteRefresh(statusText, "config");
        if(__interactionReleaseTimer) clearTimeout(__interactionReleaseTimer);
        __interactionReleaseTimer = setTimeout(function(){
          __interactionReleaseTimer = null;
          flushPendingRemoteRefresh();
        }, REMOTE_CONFIG_REFRESH_THROTTLE_MS - (now - lastRemoteConfigRefreshAt) + 20);
        return false;
      }
      lastRemoteConfigRefreshAt = now;
      if(statusText) setSyncUI("syncing", statusText);
      remoteConfigRefreshInFlight = loadPracticeConfigSnapshot(currentPracticeId).then(function(snapshot){
        applyPracticeConfigSnapshot(snapshot, { applyTheme: false });
        noteBoardActivity("refresh-config");
        setSyncUI("ok", "Settings updated");
        return true;
      }).catch(function(e){
        console.warn("Settings refresh failed:", e);
        if(isRateLimitError(e)) noteRateLimit();
        else setSyncUI("err", "Settings refresh failed");
        setStatus("Settings refresh failed. Retrying automatically. " + getErrorMessage(e));
        return false;
      }).finally(function(){
        remoteConfigRefreshInFlight = null;
      });
      return await remoteConfigRefreshInFlight;
    }

    function handlePracticeRealtimeChange(tableName, payload){
      if(tableName === "practice_board_state"){
        if(hasUnsavedLocalBoardChanges()){
          queuePendingRemoteRefresh("Remote board update", "board");
          protectUnsavedLocalBoardChanges("Saving local changes");
          return;
        }
        if(saving || isUiInteractionLocked()){
          queuePendingRemoteRefresh("Remote board update", "board");
          return;
        }
        var nextBoardState = payload && payload.new ? payload.new.board_state : null;
        applyBoardState(nextBoardState || {}, {
          applyTheme: false,
          updatedAt: payload && payload.new && payload.new.updated_at ? payload.new.updated_at : null
        });
        noteBoardActivity("realtime-board");
        setSyncUI("ok", "Updated");
        return;
      }
      if(tableName === "practice_feedback_items"){
        if(typeof window.refreshFeedbackChecklistForSession === "function") window.refreshFeedbackChecklistForSession();
        return;
      }
      if(saving || isUiInteractionLocked()){
        queuePendingRemoteRefresh("Remote update", "config");
        return;
      }
      refreshPracticeConfigNow("Remote update");
    }

    function stopPracticeRealtime(){
      clearRealtimeReconnectTimer();
      realtimeChannelHealthy = false;
      if(!supabase || !remotePracticeChannel) return;
      try{ supabase.removeChannel(remotePracticeChannel); }catch(e){}
      remotePracticeChannel = null;
    }

    function startPracticeRealtime(){
      noteBoardActivity("start-realtime");
      subscribeToBoard(currentPracticeId);
    }

    async function recoverStaleDisplay(){
      if(!supabase || !currentPracticeId) return false;
      if(watchdogRecoveryInFlight) return await watchdogRecoveryInFlight;
      if(protectUnsavedLocalBoardChanges("Saving local changes")) return false;
      watchdogRecoveryInFlight = (async function(){
        try{
          setSyncUI("syncing", "Recovering display");
          await refreshSupabaseSessionIfNeeded("stale-display");
          startPracticeRealtime();
          await loadBoard(currentPracticeId);
          noteBoardActivity("watchdog-recovery");
          setSyncUI("ok", "Display recovered");
          return true;
        }catch(e){
          console.warn("stale display recovery failed:", e);
          setSyncUI("err", "Display stale");
          return false;
        }finally{
          watchdogRecoveryInFlight = null;
        }
      })();
      return await watchdogRecoveryInFlight;
    }

    function startStaleDisplayWatchdog(){
      if(staleDisplayWatchdogTimer) clearInterval(staleDisplayWatchdogTimer);
      staleDisplayWatchdogTimer = setInterval(function(){
        if(!supabase || !currentPracticeId) return;
        if(saving || remoteRefreshInFlight || remoteConfigRefreshInFlight || watchdogRecoveryInFlight) return;
        var ageMs = Date.now() - Number(lastBoardActivityAt || 0);
        if(ageMs < STALE_DISPLAY_THRESHOLD_MS) return;
        recoverStaleDisplay();
      }, STALE_DISPLAY_WATCHDOG_INTERVAL_MS);
    }

		    async function initSupabase(){
	      if(typeof window !== "undefined" && window.location && window.location.protocol === "file:"){
	        setStatus("Open RoomBoard through http://localhost, not file://, for Supabase login.");
	        setSyncUI("err", "Use localhost");
	        return;
	      }
      if(!supabaseConfigured()){
        setStatus("Supabase not configured (check config.js)");
        setSyncUI("err", "No keys");
        return;
      }
      try{
        var supabaseBrowser = window.__SUPABASE_BROWSER__ || window.supabase;
        if(!supabaseBrowser || typeof supabaseBrowser.createClient !== "function"){
          throw new Error("Supabase browser SDK failed to load");
        }
        supabase = supabaseBrowser.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
	          auth: {
	            persistSession: true,
	            autoRefreshToken: true,
	            detectSessionInUrl: true,
	            storage: createAuthStorageAdapter(),
	            storageKey: AUTH_STORAGE_KEY
	          }
		        });
		        startSessionKeepAlive();
            startStaleDisplayWatchdog();
		        // React to login/logout in this tab so clinic-scoped data stays current
	        try{
	          supabase.auth.onAuthStateChange(function(event, session){
            var authEvent = String(event || "");
	            if(session){
	              updateAuthUI(true);
	              if(authFlowInProgress) return;
              if(authEvent === "INITIAL_SESSION") return;
              if(authEvent === "TOKEN_REFRESHED" || authEvent === "USER_UPDATED"){
                if(!currentPracticeId){
                  fetchClinicContext().catch(function(e){
                    setStatus("Clinic lookup failed: " + getErrorMessage(e));
                    setSyncUI("err", "Clinic error");
                  });
                }
                return;
              }
	              fetchClinicContext().then(function(){
	                if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession();
	                if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession();
	                startPracticeRealtime();
	                loadPracticeData();
              }).catch(function(e){
                setStatus("Clinic lookup failed: " + getErrorMessage(e));
                setSyncUI("err", "Clinic error");
	              });
	            } else {
              if(authEvent === "INITIAL_SESSION"){
                updateAuthUI(false);
                setSyncUI("idle", "Guest");
                return;
              }
	              if(logoutInProgress || authEvent === "SIGNED_OUT"){
	                updateAuthUI(false);
	                stopPracticeRealtime();
                currentPracticeId = null;
                currentPracticeName = "";
                currentUserId = null;
                currentUserEmail = "";
                currentUserFullName = "";
                resetKnownBoardVersion();
                window.__roomboardPracticeId = null;
                if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession(null);
                if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession(null);
	              state = ensureStateShape(loadLocal() || null);
	              applyAccountSettingsToState(state);
	              applySessionUiPrefs(state);
	              saveLocal();
	              refreshUiFromState({ applyTheme: true });
	              setStatus("Log in to load clinic data.");
	              setSyncUI("idle", "Guest");
	                return;
	              }
              if(!hasRecoverableAuthSnapshot()){
                updateAuthUI(false);
                setSyncUI("idle", "Guest");
                return;
              }
	              recoverSupabaseSession("auth-state-" + authEvent).then(function(recovered){
                if(recovered) return;
              updateAuthUI(false);
              stopPracticeRealtime();
              currentPracticeId = null;
              currentPracticeName = "";
              currentUserId = null;
              currentUserEmail = "";
              currentUserFullName = "";
              resetKnownBoardVersion();
              window.__roomboardPracticeId = null;
              if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession(null);
              if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession(null);
	              state = ensureStateShape(loadLocal() || null);
	              applyAccountSettingsToState(state);
	              applySessionUiPrefs(state);
	              saveLocal();
	              refreshUiFromState({ applyTheme: true });
	              setStatus("Log in to load clinic data.");
	              setSyncUI("idle", "Guest");
	              });
            }
          });
        }catch(e){}

	        setRememberMePreference(getRememberMePreference());
	        syncAuthStoragePreference();
	        var sess = await supabase.auth.getSession();
	        if(!(sess && sess.data && sess.data.session) && hasRecoverableAuthSnapshot() && await recoverSupabaseSession("init")){
	          sess = await supabase.auth.getSession();
	        }
        updateAuthUI(!!(sess && sess.data && sess.data.session));
        if(sess && sess.data && sess.data.session){
          var serverNowPromise = getServerNowIso().catch(function(){ return null; });
          await fetchClinicContext();
          if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession();
          if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession();
          startPracticeRealtime();
          await loadPracticeData();
          await serverNowPromise;
        } else {
          stopPracticeRealtime();
          currentPracticeId = null;
          currentPracticeName = "";
          currentUserId = null;
          currentUserEmail = "";
          currentUserFullName = "";
          resetKnownBoardVersion();
          window.__roomboardPracticeId = null;
          if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession(null);
          if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession(null);
          setStatus("Log in to load clinic data.");
          setSyncUI("idle", "Guest");
        }
      } catch(e){
        console.error(e);
        setStatus("Supabase init failed: " + (e.message || e));
        setSyncUI("err", "Init failed");
      }
    }

    async function signup(){
      try{
        authFlowInProgress = true;
        setAuthBusy(true, "Creating clinic…");
        var practiceName = ($("practiceName").value || "").trim();
        var fullName = ($("fullName").value || "").trim();
        var email = ($("email").value || "").trim();
        var password = ($("password").value || "").trim();
        setRememberMePreference(!!($("rememberMe") && $("rememberMe").checked));
        var existingSession = await supabase.auth.getSession();
        if(!practiceName || !fullName || (!(existingSession && existingSession.data && existingSession.data.session) && (!email || !password))){
          alert((existingSession && existingSession.data && existingSession.data.session)
            ? "Practice name and full name are required."
            : "Practice name, full name, email, and password are required.");
          return;
        }
        if(!(existingSession && existingSession.data && existingSession.data.session)){
          var res = await withTimeout(supabase.auth.signUp({
            email: email,
            password: password,
            options: {
              data: {
                full_name: fullName
              }
            }
          }), 15000, "Signup");
          if(res.error) throw res.error;
          if(!(res.data && res.data.session && res.data.user)){
            throw new Error("Sign up succeeded, but there is no active session yet. Disable email confirmation in Supabase Auth for the immediate clinic setup flow.");
          }
        }
        var rpcRes = null;
        var rpcError = null;
        for(var attempt=0; attempt<5; attempt++){
          rpcRes = await withTimeout(supabase.rpc("create_practice_with_admin", {
            practice_name: practiceName,
            admin_full_name: fullName
          }), 15000, "Create clinic");
          rpcError = rpcRes.error || null;
          if(!rpcError) break;
          await delay(250);
        }
        if(rpcError) throw rpcError;
        updateAuthUI(true);
        currentPracticeId = rpcRes.data || null;
        currentPracticeName = practiceName;
        window.__roomboardPracticeId = currentPracticeId;
        updateClinicContextUi();
        state = ensureStateShape(loadLocal() || null);
        applyAccountSettingsToState(state);
        applySessionUiPrefs(state);
        saveLocal();
        await withTimeout(savePracticeData(), 15000, "Initial clinic save");
        await withTimeout(finishAuthenticatedFlow({ attempts: 8, waitMs: 250 }), 15000, "Clinic setup");
      }catch(e){
        console.error("signup failed:", e);
        alert(getErrorMessage(e));
        setStatus("Clinic signup failed: " + getErrorMessage(e));
        setSyncUI("err", "Signup failed");
      } finally {
        authFlowInProgress = false;
        setAuthBusy(false);
      }
    }

    async function joinPractice(){
      try{
        authFlowInProgress = true;
        setAuthBusy(true, "Joining clinic…");
        var fullName = ($("joinFullName").value || "").trim();
        var email = ($("joinEmail").value || "").trim();
        var password = ($("joinPassword").value || "").trim();
        var inviteCode = normalizeInviteCode(($("practiceInviteCode").value || "").trim());
        setRememberMePreference(!!($("rememberMe") && $("rememberMe").checked));
        if(!fullName || !email || !password || !inviteCode){
          alert("Full name, email, password, and invite code are required to join a clinic.");
          return;
        }
        if(!currentPracticeId){
          await ensureSessionForJoin(email, password, fullName);
          updateAuthUI(true);
        }
        var joinRes = await withTimeout(supabase.rpc("join_practice_with_invite_code", {
          invite_code: inviteCode,
          member_full_name: fullName
        }), 15000, "Join clinic");
        if(joinRes.error) throw joinRes.error;
        var joined = Array.isArray(joinRes.data) ? (joinRes.data[0] || null) : joinRes.data;
        currentPracticeId = joined && joined.practice_id ? joined.practice_id : currentPracticeId;
        currentPracticeName = joined && joined.practice_name ? joined.practice_name : currentPracticeName;
        window.__roomboardPracticeId = currentPracticeId;
        if($("practiceInviteCode")) $("practiceInviteCode").value = inviteCode;
        updateAuthUI(true);
        updateClinicContextUi();
        await withTimeout(finishAuthenticatedFlow({ attempts: 8, waitMs: 250 }), 15000, "Clinic join");
      }catch(e){
        console.error("joinPractice failed:", e);
        alert(getErrorMessage(e));
        setStatus("Clinic join failed: " + getErrorMessage(e));
        setSyncUI("err", "Join failed");
      } finally {
        authFlowInProgress = false;
        setAuthBusy(false);
      }
    }

    async function login(){
      try{
        authFlowInProgress = true;
        setAuthBusy(true, "Logging in…");
        var email = ($("email").value || "").trim();
        var password = ($("password").value || "").trim();
        setRememberMePreference(!!($("rememberMe") && $("rememberMe").checked));
        if(!email || !password){
          setStatus("Email and password are required.");
          return;
        }
        var res = await signInWithPasswordRobust(email, password);
        if(res.error) throw res.error;
        updateAuthUI(true);
        var loaded = await withTimeout(finishAuthenticatedFlow({ attempts: 8, waitMs: 250 }), 15000, "Clinic login");
        if(!loaded){
          alert("This login worked, but no clinic is linked to the account yet.");
        }
      }catch(e){
        console.error("login failed:", e);
        alert(getErrorMessage(e));
        setStatus("Login failed: " + getErrorMessage(e));
        setSyncUI("err", "Login failed");
      } finally {
        authFlowInProgress = false;
        setAuthBusy(false);
      }
    }

    async function logout(){
      logoutInProgress = true;
      try{
        try{ await supabase.auth.signOut(); }catch(e){}
        stopPracticeRealtime();
        currentPracticeId = null;
        currentPracticeName = "";
        currentUserId = null;
        currentUserEmail = "";
        currentUserFullName = "";
        resetKnownBoardVersion();
        window.__roomboardPracticeId = null;
        if(typeof window.refreshAccountSettingsForSession === "function") window.refreshAccountSettingsForSession(null);
        if(typeof window.refreshThemePrefsForSession === "function") window.refreshThemePrefsForSession(null);
	        updateAuthUI(false);
	        state = ensureStateShape(loadLocal() || null);
	        applyAccountSettingsToState(state);
	        applySessionUiPrefs(state);
	        saveLocal();
	        refreshUiFromState({ applyTheme: true });
	        setStatus("Logged out.");
	        setSyncUI("idle", "Guest");
      } finally {
        logoutInProgress = false;
      }
	    }

    $("signupBtn").addEventListener("click", function(){ if(!supabase) return; signup(); });
    $("joinPracticeBtn").addEventListener("click", function(){ if(!supabase) return; joinPractice(); });
    $("loginBtn").addEventListener("click", function(){ if(!supabase) return; login(); });
    $("logoutBtn").addEventListener("click", function(){ if(!supabase) return; logout(); });
    if($("authModeSwitch")){
      $("authModeSwitch").addEventListener("click", function(e){
        var btn = e.target && e.target.closest ? e.target.closest(".authModeBtn") : null;
        if(!btn) return;
        setAuthAccessMode(btn.getAttribute("data-auth-mode"));
      });
      setAuthAccessMode("login");
    }
    if($("practiceInviteCode")){
      $("practiceInviteCode").addEventListener("input", function(){
        this.value = normalizeInviteCode(this.value);
      });
    }
    if($("copyPracticeInviteCodeBtn")){
      $("copyPracticeInviteCodeBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("auth.copy-practice-invite-code", async function(){
          var code = String($("practiceInviteCodeDisplay") && $("practiceInviteCodeDisplay").value || "").trim();
          if(!code){
            setStatus("No invite code is available yet.");
            return false;
          }
          var copied = await copyTextToClipboard(code);
          setStatus(copied ? "Invite code copied." : "Could not copy invite code.");
          return copied;
        }, { el: btn, busyLabel: "Copying…", cooldownMs: 150 });
      });
    }
    if($("rotatePracticeInviteCodeBtn")){
      $("rotatePracticeInviteCodeBtn").addEventListener("click", function(){
        var btn = this;
        runLockedAction("auth.rotate-practice-invite-code", async function(){
          try{
            var res = await withTimeout(supabase.rpc("rotate_my_practice_invite_code"), 15000, "Rotate invite code");
            if(res.error) throw res.error;
            await refreshPracticeInviteUi();
            setStatus("Clinic invite code rotated.");
            return true;
          }catch(e){
            setStatus("Invite code rotation failed: " + getErrorMessage(e));
            return false;
          }
        }, { el: btn, busyLabel: "Rotating…", cooldownMs: 250 });
      });
    }
    if($("rememberMe")){
      $("rememberMe").checked = getRememberMePreference();
      $("rememberMe").addEventListener("change", function(){
        setRememberMePreference(!!this.checked);
        syncAuthStoragePreference();
        noteSettingsLocalSaved(this.checked ? "Session will stay signed in" : "Session will stay in this tab");
      });
    }

	    // ===== Timers ticker (no rerender) =====
	    setInterval(function(){
	      updateTimerBindings(false);
	    }, 1000);

    // ===== Auto pull every 15s =====
    
    // ===== Interaction lock (prevents remote rerenders while typing or clicking) =====
    var __isEditing = false;
    var __pendingRemoteState = false;
    var __pendingRemoteLabel = "";
    var __pendingRemoteMode = "board";
    var __interactionHoldUntil = 0;
    var __interactionReleaseTimer = null;

    function isTextInputElement(el){
      if(!el) return false;
      var tag = (el.tagName || "").toUpperCase();
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function holdRemoteUpdates(ms){
      var holdMs = Number(ms || 0);
      if(!isFinite(holdMs) || holdMs < 0) holdMs = 0;
      var until = Date.now() + holdMs;
      if(until > __interactionHoldUntil) __interactionHoldUntil = until;
      if(__interactionReleaseTimer) clearTimeout(__interactionReleaseTimer);
      __interactionReleaseTimer = setTimeout(function(){
        __interactionReleaseTimer = null;
        flushPendingRemoteRefresh();
      }, holdMs + 20);
    }

    function isUiInteractionLocked(){
      var bodyClass = document && document.body ? String(document.body.className || "") : "";
      var settingsOpen = /\bdrawerOpen\b/.test(bodyClass);
      var quickAddOpen = /\bquickAddOpen\b/.test(bodyClass);
      return settingsOpen || quickAddOpen || __isEditing || Date.now() < __interactionHoldUntil;
    }

	    document.addEventListener("focusin", function(e){
	      if(!isTextInputElement(e.target)) return;
	      __isEditing = true;
	      holdRemoteUpdates(TEXT_INPUT_HOLD_MS);
	    });

    document.addEventListener("focusout", function(e){
      if(!isTextInputElement(e.target)) return;
      setTimeout(function(){
        __isEditing = isTextInputElement(document.activeElement);
        if(!__isEditing) flushPendingRemoteRefresh();
      }, 0);
    });

	    document.addEventListener("pointerdown", function(e){
	      var t = e.target;
	      if(!t || !t.closest) return;
	      if(t.closest('button, .btn, .iconBtn, .tab, [role="button"], a, input, textarea, select, label, summary')){
	        holdRemoteUpdates(SHORT_INTERACTION_HOLD_MS);
	      }
	    }, true);

	    document.addEventListener("click", function(e){
	      var t = e.target;
	      if(!t || !t.closest) return;
	      if(t.closest('button, .btn, .iconBtn, .tab, [role="button"], a, input, textarea, select, label, summary')){
	        holdRemoteUpdates(SHORT_INTERACTION_HOLD_MS);
	      }
	    }, true);

	    document.addEventListener("change", function(e){
	      var t = e.target;
	      if(!t || !t.closest) return;
	      if(t.closest('input, textarea, select')){
	        holdRemoteUpdates(CHANGE_INTERACTION_HOLD_MS);
	      }
	    }, true);

	    function startAutoPull(){
	      if(autoPullTimer) clearInterval(autoPullTimer);
	      autoPullTimer = setInterval(function(){
	        if(!supabase || !currentPracticeId) return;
	        if(remoteRateLimitUntil > Date.now()) return;
        if(realtimeChannelHealthy && (Date.now() - Math.max(lastRealtimeEventAt || 0, lastBoardActivityAt || 0)) < REALTIME_ACTIVE_GRACE_MS) return;
	        if(saving || isUiInteractionLocked()){
	          queuePendingRemoteRefresh("Refresh queued", "board");
	          return;
	        }
	        refreshPracticeDataNow("Refreshing");
      }, AUTO_PULL_INTERVAL_MS);
	    }

    function msToHMS(ms){
      ms = Number(ms || 0);
      if(!isFinite(ms) || ms < 0) ms = 0;
      var total = Math.floor(ms/1000);
      var h = Math.floor(total/3600);
      var m = Math.floor((total%3600)/60);
      var s = total%60;
      function pad(n){ n = String(n); return n.length<2 ? ("0"+n) : n; }
      return pad(h)+":"+pad(m)+":"+pad(s);
    }

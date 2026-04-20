  const THEME_PRESETS = {
    dark: {
      label: "Midnight",
      description: "Deep navy surfaces with bright lettering for TV screens, dim rooms, and glare-heavy walls.",
      previewBg: "#081120",
      previewPanel: "rgba(28, 52, 96, .96)",
      previewText: "#f6f9ff",
      previewMuted: "#c3d0e8",
      previewAccent: "#7dd3fc",
      bg: "#081120",
      text: "#f6f9ff",
      muted: "#c3d0e8",
      border: "rgba(214,227,255,.16)",
      panel: "rgba(16, 28, 52, .94)",
      panel2: "rgba(8, 16, 31, .82)",
      headerBg: "rgba(7,14,28,.84)",
      drawerOverlay: "rgba(0,0,0,.58)",
      btnBg: "rgba(255,255,255,.10)",
      btnBgHover: "rgba(255,255,255,.16)",
      inputBg: "rgba(255,255,255,.08)",
      inputPlaceholder: "rgba(233,238,252,.66)",
      focusRing: "rgba(125,170,255,.52)",
      toastBg: "rgba(12, 23, 43, .98)",
      danger: "#ff7a7a",
      displayFontColor: "#f6f9ff",
      displayMutedColor: "#c3d0e8",
      shadowColor: "rgba(0,0,0,.48)",
      cardTextMode: "auto",
    },
    slate: {
      label: "Graphite",
      description: "Cool charcoal contrast with crisp white type and restrained blue accents.",
      previewBg: "#121923",
      previewPanel: "rgba(32, 45, 63, .96)",
      previewText: "#f5f7fb",
      previewMuted: "#c8d2e3",
      previewAccent: "#8fb4ff",
      bg: "#121923",
      text: "#f5f7fb",
      muted: "#c8d2e3",
      border: "rgba(191,205,230,.17)",
      panel: "rgba(25, 36, 53, .95)",
      panel2: "rgba(18, 26, 40, .86)",
      headerBg: "rgba(15,22,34,.86)",
      drawerOverlay: "rgba(0,0,0,.54)",
      btnBg: "rgba(255,255,255,.09)",
      btnBgHover: "rgba(255,255,255,.15)",
      inputBg: "rgba(255,255,255,.07)",
      inputPlaceholder: "rgba(233,238,252,.62)",
      focusRing: "rgba(143,180,255,.46)",
      toastBg: "rgba(25, 36, 53, .98)",
      danger: "#ff7b78",
      displayFontColor: "#f5f7fb",
      displayMutedColor: "#c8d2e3",
      shadowColor: "rgba(0,0,0,.44)",
      cardTextMode: "auto",
    },
    cobalt: {
      label: "Cobalt",
      description: "High-contrast navy with cooler blue surfaces and bright white text.",
      previewBg: "#071a2f",
      previewPanel: "rgba(18, 58, 110, .96)",
      previewText: "#f5fbff",
      previewMuted: "#c7ddf6",
      previewAccent: "#60a5fa",
      bg: "#071a2f",
      text: "#f5fbff",
      muted: "#c7ddf6",
      border: "rgba(194,225,255,.18)",
      panel: "rgba(10, 36, 71, .95)",
      panel2: "rgba(7, 24, 47, .84)",
      headerBg: "rgba(6,20,38,.86)",
      drawerOverlay: "rgba(0,0,0,.56)",
      btnBg: "rgba(255,255,255,.10)",
      btnBgHover: "rgba(255,255,255,.16)",
      inputBg: "rgba(255,255,255,.07)",
      inputPlaceholder: "rgba(229,241,255,.66)",
      focusRing: "rgba(96,165,250,.46)",
      toastBg: "rgba(10, 36, 71, .98)",
      danger: "#ff7b78",
      displayFontColor: "#f5fbff",
      displayMutedColor: "#c7ddf6",
      shadowColor: "rgba(0,0,0,.46)",
      cardTextMode: "auto",
    },
    forest: {
      label: "Evergreen",
      description: "Dark pine surfaces with bright neutral text for long, readable sessions.",
      previewBg: "#081712",
      previewPanel: "rgba(13, 47, 34, .96)",
      previewText: "#f5fff9",
      previewMuted: "#c9e2d5",
      previewAccent: "#34d399",
      bg: "#081712",
      text: "#f5fff9",
      muted: "#c9e2d5",
      border: "rgba(201,226,213,.18)",
      panel: "rgba(13, 47, 34, .95)",
      panel2: "rgba(8, 28, 21, .84)",
      headerBg: "rgba(7,22,17,.86)",
      drawerOverlay: "rgba(0,0,0,.56)",
      btnBg: "rgba(255,255,255,.09)",
      btnBgHover: "rgba(255,255,255,.15)",
      inputBg: "rgba(255,255,255,.07)",
      inputPlaceholder: "rgba(229,245,236,.62)",
      focusRing: "rgba(52,211,153,.36)",
      toastBg: "rgba(13, 47, 34, .98)",
      danger: "#ff7b78",
      displayFontColor: "#f5fff9",
      displayMutedColor: "#c9e2d5",
      shadowColor: "rgba(0,0,0,.44)",
      cardTextMode: "auto",
    },
    ocean: {
      label: "Oceanic",
      description: "Teal-blue dark mode with crisp white text and calmer accent contrast.",
      previewBg: "#07161e",
      previewPanel: "rgba(15, 58, 73, .96)",
      previewText: "#f4fcff",
      previewMuted: "#c6dee7",
      previewAccent: "#22d3ee",
      bg: "#07161e",
      text: "#f4fcff",
      muted: "#c6dee7",
      border: "rgba(198,222,231,.18)",
      panel: "rgba(11, 44, 56, .95)",
      panel2: "rgba(7, 25, 33, .84)",
      headerBg: "rgba(7,19,26,.86)",
      drawerOverlay: "rgba(0,0,0,.56)",
      btnBg: "rgba(255,255,255,.09)",
      btnBgHover: "rgba(255,255,255,.15)",
      inputBg: "rgba(255,255,255,.07)",
      inputPlaceholder: "rgba(226,244,250,.62)",
      focusRing: "rgba(34,211,238,.34)",
      toastBg: "rgba(11, 44, 56, .98)",
      danger: "#ff7b78",
      displayFontColor: "#f4fcff",
      displayMutedColor: "#c6dee7",
      shadowColor: "rgba(0,0,0,.44)",
      cardTextMode: "auto",
    },
    ember: {
      label: "Ember",
      description: "Warm dark copper surfaces with creamy text for a softer but still bold contrast.",
      previewBg: "#1d120d",
      previewPanel: "rgba(66, 34, 20, .96)",
      previewText: "#fff8f3",
      previewMuted: "#ead5c7",
      previewAccent: "#fb923c",
      bg: "#1d120d",
      text: "#fff8f3",
      muted: "#ead5c7",
      border: "rgba(234,213,199,.18)",
      panel: "rgba(52, 28, 18, .95)",
      panel2: "rgba(30, 18, 12, .86)",
      headerBg: "rgba(28,17,12,.88)",
      drawerOverlay: "rgba(0,0,0,.56)",
      btnBg: "rgba(255,255,255,.08)",
      btnBgHover: "rgba(255,255,255,.14)",
      inputBg: "rgba(255,255,255,.07)",
      inputPlaceholder: "rgba(255,239,228,.62)",
      focusRing: "rgba(251,146,60,.34)",
      toastBg: "rgba(52, 28, 18, .98)",
      danger: "#ff8b7a",
      displayFontColor: "#fff8f3",
      displayMutedColor: "#ead5c7",
      shadowColor: "rgba(0,0,0,.44)",
      cardTextMode: "auto",
    },
    light: {
      label: "Daylight",
      description: "Bright clean workspace with charcoal text and stronger label contrast than the old light mode.",
      previewBg: "#f5f7fb",
      previewPanel: "#ffffff",
      previewText: "#111827",
      previewMuted: "#334155",
      previewAccent: "#2563eb",
      bg: "#f5f7fb",
      text: "#111827",
      muted: "#334155",
      border: "rgba(15,23,42,.18)",
      panel: "rgba(255,255,255,.96)",
      panel2: "rgba(241,245,249,.96)",
      headerBg: "rgba(248,250,252,.92)",
      drawerOverlay: "rgba(15,23,42,.24)",
      btnBg: "rgba(15,23,42,.07)",
      btnBgHover: "rgba(15,23,42,.13)",
      inputBg: "rgba(255,255,255,.96)",
      inputPlaceholder: "rgba(15,23,42,.46)",
      focusRing: "rgba(37,99,235,.38)",
      toastBg: "rgba(255,255,255,.98)",
      danger: "#b42318",
      displayFontColor: "#111827",
      displayMutedColor: "#334155",
      shadowColor: "rgba(15,23,42,.18)",
      cardTextMode: "auto",
    },
    ivory: {
      label: "Ivory",
      description: "Warm paper tones with dark ink text for a softer room feel without losing readability.",
      previewBg: "#faf5ea",
      previewPanel: "#fffaf2",
      previewText: "#1f2937",
      previewMuted: "#475569",
      previewAccent: "#b7791f",
      bg: "#faf5ea",
      text: "#1f2937",
      muted: "#475569",
      border: "rgba(55,65,81,.18)",
      panel: "rgba(255,250,242,.96)",
      panel2: "rgba(247,240,227,.94)",
      headerBg: "rgba(250,245,234,.92)",
      drawerOverlay: "rgba(55,65,81,.24)",
      btnBg: "rgba(55,65,81,.08)",
      btnBgHover: "rgba(55,65,81,.14)",
      inputBg: "rgba(255,255,255,.94)",
      inputPlaceholder: "rgba(31,41,55,.42)",
      focusRing: "rgba(180,83,9,.28)",
      toastBg: "rgba(255,250,242,.98)",
      danger: "#b42318",
      displayFontColor: "#1f2937",
      displayMutedColor: "#475569",
      shadowColor: "rgba(55,65,81,.16)",
      cardTextMode: "auto",
    },
    arctic: {
      label: "Arctic",
      description: "Cool bright surfaces with dark ink text and icy blue accents for sharp visibility.",
      previewBg: "#f2f8ff",
      previewPanel: "#ffffff",
      previewText: "#0f172a",
      previewMuted: "#334155",
      previewAccent: "#0ea5e9",
      bg: "#f2f8ff",
      text: "#0f172a",
      muted: "#334155",
      border: "rgba(30,64,175,.14)",
      panel: "rgba(255,255,255,.97)",
      panel2: "rgba(236,244,255,.96)",
      headerBg: "rgba(245,249,255,.94)",
      drawerOverlay: "rgba(15,23,42,.24)",
      btnBg: "rgba(37,99,235,.06)",
      btnBgHover: "rgba(37,99,235,.11)",
      inputBg: "rgba(255,255,255,.96)",
      inputPlaceholder: "rgba(15,23,42,.44)",
      focusRing: "rgba(14,165,233,.28)",
      toastBg: "rgba(255,255,255,.98)",
      danger: "#b42318",
      displayFontColor: "#0f172a",
      displayMutedColor: "#334155",
      shadowColor: "rgba(15,23,42,.16)",
      cardTextMode: "auto",
    },
    sand: {
      label: "Sandstone",
      description: "Warm beige surfaces with dark slate text for clinics that want a softer light mode.",
      previewBg: "#f7efe1",
      previewPanel: "#fffaf1",
      previewText: "#1f2937",
      previewMuted: "#4b5563",
      previewAccent: "#d97706",
      bg: "#f7efe1",
      text: "#1f2937",
      muted: "#4b5563",
      border: "rgba(120,53,15,.16)",
      panel: "rgba(255,250,241,.96)",
      panel2: "rgba(245,237,223,.95)",
      headerBg: "rgba(248,241,229,.93)",
      drawerOverlay: "rgba(55,65,81,.22)",
      btnBg: "rgba(120,53,15,.07)",
      btnBgHover: "rgba(120,53,15,.12)",
      inputBg: "rgba(255,255,255,.94)",
      inputPlaceholder: "rgba(31,41,55,.42)",
      focusRing: "rgba(217,119,6,.28)",
      toastBg: "rgba(255,250,241,.98)",
      danger: "#b42318",
      displayFontColor: "#1f2937",
      displayMutedColor: "#4b5563",
      shadowColor: "rgba(55,65,81,.16)",
      cardTextMode: "auto",
    },
    sage: {
      label: "Sage",
      description: "Gentle green-tinted light surfaces with dark text and preserved contrast.",
      previewBg: "#eef5ef",
      previewPanel: "#fbfefb",
      previewText: "#1f2937",
      previewMuted: "#475569",
      previewAccent: "#059669",
      bg: "#eef5ef",
      text: "#1f2937",
      muted: "#475569",
      border: "rgba(5,150,105,.14)",
      panel: "rgba(251,254,251,.96)",
      panel2: "rgba(238,247,240,.95)",
      headerBg: "rgba(242,248,243,.93)",
      drawerOverlay: "rgba(55,65,81,.22)",
      btnBg: "rgba(5,150,105,.06)",
      btnBgHover: "rgba(5,150,105,.11)",
      inputBg: "rgba(255,255,255,.95)",
      inputPlaceholder: "rgba(31,41,55,.42)",
      focusRing: "rgba(5,150,105,.24)",
      toastBg: "rgba(251,254,251,.98)",
      danger: "#b42318",
      displayFontColor: "#1f2937",
      displayMutedColor: "#475569",
      shadowColor: "rgba(55,65,81,.16)",
      cardTextMode: "auto",
    }
  };

  const THEME_DEFAULT_PRESET = "dark";

  function getThemePresetNames(){
    return Object.keys(THEME_PRESETS);
  }

  function isThemePresetName(name){
    return !!(name && THEME_PRESETS[name]);
  }

  const THEME_PREFS_STORAGE_PREFIX = "roomboard.website.themePrefs.v1";
  let activeThemePrefsScope = "guest";
  let themePrefsState = null;

  function getThemeScopeFromSession(sessionLike){
    const practiceId = window.__roomboardPracticeId || null;
    if(practiceId) return practiceId;
    return "guest";
  }

  function normalizeThemePrefs(raw){
    const prefs = raw && typeof raw === "object" ? raw : {};
    const current = isThemePresetName(prefs.themePreset)
      ? prefs.themePreset
      : (isThemePresetName(prefs.themeDefaultPreset) ? prefs.themeDefaultPreset : THEME_DEFAULT_PRESET);
    const defp = isThemePresetName(prefs.themeDefaultPreset) ? prefs.themeDefaultPreset : current;
    const theme = THEME_PRESETS[current] || THEME_PRESETS[THEME_DEFAULT_PRESET];
    return {
      themePreset: current,
      themeDefaultPreset: defp,
      bgColor: prefs.bgColor || theme.bg
    };
  }

  function getThemeStorageKey(scope){
    return THEME_PREFS_STORAGE_PREFIX + "." + (scope || "guest");
  }

  function readStoredThemePrefs(scope){
    try{
      const raw = localStorage.getItem(getThemeStorageKey(scope));
      if(!raw) return null;
      return normalizeThemePrefs(JSON.parse(raw));
    }catch(e){
      return null;
    }
  }

  function writeStoredThemePrefs(scope, prefs){
    try{
      localStorage.setItem(getThemeStorageKey(scope), JSON.stringify(normalizeThemePrefs(prefs)));
    }catch(e){}
  }

  function ensureThemePrefsLoaded(scope){
    const nextScope = scope || activeThemePrefsScope || "guest";
    if(themePrefsState && activeThemePrefsScope === nextScope) return themePrefsState;

    let prefs = readStoredThemePrefs(nextScope);
    if(prefs) writeStoredThemePrefs(nextScope, prefs);

    activeThemePrefsScope = nextScope;
    themePrefsState = normalizeThemePrefs(prefs);
    return themePrefsState;
  }

  function persistThemePrefs(){
    if(!themePrefsState) themePrefsState = normalizeThemePrefs(null);
    writeStoredThemePrefs(activeThemePrefsScope, themePrefsState);
    if(state && state.settings){
      state.settings.themePreset = themePrefsState.themePreset;
      state.settings.themeDefaultPreset = themePrefsState.themeDefaultPreset;
      state.settings.bgColor = themePrefsState.bgColor;
      saveLocal();
      if(!supabase || !currentPracticeId) noteSettingsLocalSaved("Saved locally");
      else noteSettingsRemoteQueued("Saving changes…");
      scheduleRemoteSave("config", { immediate: true });
    }
  }

  function getThemeSettings(){
    return ensureThemePrefsLoaded(activeThemePrefsScope);
  }

  function applyThemePreset(presetName){
    const name = isThemePresetName(presetName) ? presetName : THEME_DEFAULT_PRESET;
    const t = THEME_PRESETS[name];
    const root = document.documentElement;

    root.style.setProperty("--bg", t.bg);
    root.style.setProperty("--bgSolid", t.bg);
    root.style.setProperty("--text", t.text);
    root.style.setProperty("--muted", t.muted);

    root.style.setProperty("--border", t.border);
    root.style.setProperty("--headerBorder", t.border);
    root.style.setProperty("--panel", t.panel);
    root.style.setProperty("--panel2", t.panel2);
    root.style.setProperty("--cardBg", t.panel);
    root.style.setProperty("--cardBorder", t.border);
    root.style.setProperty("--drawerBg", t.panel);

    root.style.setProperty("--headerBg", t.headerBg);
    root.style.setProperty("--drawerOverlay", t.drawerOverlay);

    root.style.setProperty("--btnBg", t.btnBg);
    root.style.setProperty("--btnBgHover", t.btnBgHover);
    root.style.setProperty("--btnBorder", t.border);
    root.style.setProperty("--btnText", t.text);
    root.style.setProperty("--inputBg", t.inputBg);
    root.style.setProperty("--inputBorder", t.border);
    root.style.setProperty("--inputText", t.text);
    root.style.setProperty("--inputPlaceholder", t.inputPlaceholder);

    root.style.setProperty("--focusRing", t.focusRing);
    root.style.setProperty("--toastBg", t.toastBg);
    root.style.setProperty("--toastBorder", t.border);
    root.style.setProperty("--toastText", t.text);
    root.style.setProperty("--danger", t.danger);
    root.style.setProperty("--shadowColor", t.shadowColor || "rgba(0,0,0,.45)");

    root.style.setProperty("--displayFontColor", t.displayFontColor);
    root.style.setProperty("--displayMutedColor", t.displayMutedColor);
    root.dataset.themePreset = name;
    return name;
  }

  function reapplyDisplayStylingAfterTheme(){
    try{
      if(typeof window.reapplyDisplayColorsFromState === "function") window.reapplyDisplayColorsFromState();
    }catch(e){}
  }

  function applyCurrentTheme(){
    const settings = getThemeSettings();
    const current = isThemePresetName(settings.themePreset)
      ? settings.themePreset
      : (isThemePresetName(settings.themeDefaultPreset) ? settings.themeDefaultPreset : THEME_DEFAULT_PRESET);
    const applied = applyThemePreset(current);
    reapplyDisplayStylingAfterTheme();
    return applied;
  }

  function getSavedThemeDefaultPreset(){
    const settings = getThemeSettings();
    const defp = settings.themeDefaultPreset;
    return isThemePresetName(defp) ? defp : THEME_DEFAULT_PRESET;
  }

  function getSavedThemePreset(){
    // If a theme was explicitly chosen before, use it. Otherwise fall back to the user-selected default.
    const settings = getThemeSettings();
    const preset = settings.themePreset;
    if(isThemePresetName(preset)) return preset;
    return getSavedThemeDefaultPreset();
  }

  function saveThemePreset(preset){
    const p = isThemePresetName(preset) ? preset : THEME_DEFAULT_PRESET;
    const theme = THEME_PRESETS[p] || THEME_PRESETS[THEME_DEFAULT_PRESET];
    const settings = getThemeSettings();
    settings.themePreset = p;
    settings.bgColor = theme.bg;
    themePrefsState = normalizeThemePrefs(settings);
    persistThemePrefs();
  }

  function saveThemeDefaultPreset(preset){
    const p = isThemePresetName(preset) ? preset : THEME_DEFAULT_PRESET;
    const settings = getThemeSettings();
    settings.themeDefaultPreset = p;
    themePrefsState = normalizeThemePrefs(settings);
    persistThemePrefs();
  }

  function populateThemeSelect(sel){
    if(!sel) return;
    sel.innerHTML = getThemePresetNames().map((name)=>{
      return '<option value="' + name + '">' + THEME_PRESETS[name].label + '</option>';
    }).join("");
  }

  function renderThemePresetGrid(currentName, defaultName){
    const grid = document.getElementById("themePresetGrid");
    if(!grid) return;
    grid.innerHTML = getThemePresetNames().map((name)=>{
      const theme = THEME_PRESETS[name];
      let badges = "";
      if(name === currentName) badges += '<span class="themePresetBadge">Current</span>';
      if(name === defaultName) badges += '<span class="themePresetBadge">Default</span>';
      return '<button class="themePresetBtn' + (name === currentName ? ' active' : '') + '" data-theme="' + name + '" type="button"'
        + ' style="--themePreviewBg:' + theme.previewBg + '; --themePreviewPanel:' + theme.previewPanel + '; --themePreviewText:' + theme.previewText + '; --themePreviewMuted:' + theme.previewMuted + '; --themePreviewAccent:' + theme.previewAccent + ';">'
          + '<span class="themePresetSwatch">'
            + '<span class="themePreviewPanel"></span>'
            + '<span class="themePreviewRows">'
              + '<span class="themePreviewLines">'
                + '<span class="themePreviewLine themePreviewLineStrong"></span>'
                + '<span class="themePreviewLine themePreviewLineSoft"></span>'
              + '</span>'
              + '<span class="themePreviewChip"></span>'
            + '</span>'
          + '</span>'
          + '<span class="themePresetText">'
            + '<span class="themePresetHeader">'
              + '<span class="themePresetName">' + theme.label + '</span>'
              + badges
            + '</span>'
            + '<span class="themePresetDesc">' + theme.description + '</span>'
          + '</span>'
        + '</button>';
    }).join("");
  }

  function syncThemeUI(currentName, defaultName){
    const sel = document.getElementById("themePreset");
    const defSel = document.getElementById("themeDefaultPreset");
    const help = document.getElementById("themePresetHelp");
    const current = isThemePresetName(currentName) ? currentName : THEME_DEFAULT_PRESET;
    const defp = isThemePresetName(defaultName) ? defaultName : THEME_DEFAULT_PRESET;
    if(sel) sel.value = current;
    if(defSel) defSel.value = defp;
    renderThemePresetGrid(current, defp);
    if(help && THEME_PRESETS[current]){
      help.textContent = THEME_PRESETS[current].description + (current === defp ? " This preset is also your default." : "");
    }
  }


  function initThemeUI(){
    const sel = document.getElementById("themePreset");
    const defSel = document.getElementById("themeDefaultPreset");
    const resetBtn = document.getElementById("resetThemeBtn");
    const makeDefaultBtn = document.getElementById("makeDefaultThemeBtn");
    const presetGrid = document.getElementById("themePresetGrid");
    if(!sel) return;

    populateThemeSelect(sel);
    populateThemeSelect(defSel);

    // Initialize selects from saved settings
    const savedDefault = getSavedThemeDefaultPreset();
    const current = getSavedThemePreset();
    applyCurrentTheme();
    syncThemeUI(current, savedDefault);

    sel.addEventListener("change", ()=>{
      const p = sel.value;
      applyThemePreset(p);
      reapplyDisplayStylingAfterTheme();
      saveThemePreset(p);
      syncThemeUI(p, defSel ? defSel.value : savedDefault);
      if(typeof toast === "function") toast("Theme saved.");
    });

    if(defSel){
      defSel.addEventListener("change", ()=>{
        const p = defSel.value;
        saveThemeDefaultPreset(p);
        syncThemeUI(sel.value, p);
        if(typeof toast === "function") toast("Default theme saved.");
      });
    }

    if(presetGrid){
      presetGrid.addEventListener("click", (e)=>{
        const btn = e.target && e.target.closest ? e.target.closest(".themePresetBtn") : null;
        if(!btn) return;
        const p = btn.getAttribute("data-theme");
        if(!isThemePresetName(p)) return;
        sel.value = p;
        applyThemePreset(p);
        reapplyDisplayStylingAfterTheme();
        saveThemePreset(p);
        syncThemeUI(p, defSel ? defSel.value : savedDefault);
        if(typeof toast === "function") toast("Theme saved.");
      });
    }

    if(makeDefaultBtn && defSel){
      makeDefaultBtn.addEventListener("click", ()=>{
        defSel.value = sel.value;
        saveThemeDefaultPreset(sel.value);
        syncThemeUI(sel.value, sel.value);
        if(typeof toast === "function") toast("Default theme updated.");
      });
    }

    if(resetBtn){
      resetBtn.addEventListener("click", ()=>{
        // Reset only the current theme choice back to the default theme
        const d = getSavedThemeDefaultPreset();
        sel.value = d;
        applyThemePreset(d);
        reapplyDisplayStylingAfterTheme();
        saveThemePreset(d);
        syncThemeUI(d, d);
        if(typeof toast === "function") toast("Theme reset.");
      });
    }
  }
  window.refreshThemePrefsForSession = function(sessionLike){
    const settings = ensureThemePrefsLoaded(getThemeScopeFromSession(sessionLike));
    applyCurrentTheme();
    reapplyDisplayStylingAfterTheme();
    syncThemeUI(settings.themePreset, settings.themeDefaultPreset);
    return settings;
  };
  window.applyCurrentTheme = applyCurrentTheme;
  try{
    ensureThemePrefsLoaded("guest");
    applyCurrentTheme();
  }catch(e){}
// Initialize theme after settings load
  window.addEventListener("DOMContentLoaded", ()=>{
    try{ initThemeUI(); }catch(e){}
  });

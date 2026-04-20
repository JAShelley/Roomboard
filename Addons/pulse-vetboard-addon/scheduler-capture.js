(function () {
  const api = globalThis.chrome || globalThis.browser;
  if (!api?.storage?.local) return;
  if (window.__vetBoardSchedulerCaptureLoaded) return;
  window.__vetBoardSchedulerCaptureLoaded = true;

  const STORAGE_KEY = "pendingAppointment";
  const CAPTURE_ARMED_KEY = "vetboardCaptureArmed";
  const AUTH_KEY = "vetboardSupabaseAuth";
  const SUPABASE_URL = "https://bqqjtgbfvtscwhbhscps.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxcWp0Z2JmdnRzY3doYmhzY3BzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NTIxNDEsImV4cCI6MjA5MDMyODE0MX0.hi_ruvxOBNbUIdQ-BYhjhuy6KM5oigqib-zIWL8dsts";
  const OVERLAY_ID = "vetboard-scheduler-overlay";
  const TOAST_ID = "vetboard-scheduler-toast";
  const BADGE_ID = "vetboard-scheduler-badge";
  const AUTH_PANEL_ID = "vetboard-auth-panel";
  const MODAL_ID = "vetboard-send-modal";
  const BACKDROP_ID = "vetboard-send-backdrop";
  const HOVER_CLASS = "vetboard-capture-hover";
  const CARD_SELECTORS = [
    "[data-appointment-id]",
    "[data-event-id]",
    "[data-visit-id]",
    "[data-testid*='appointment']",
    "[data-testid*='event']",
    "[class*='appointment']",
    "[class*='Appointment']",
    "[class*='calendar-event']",
    "[class*='CalendarEvent']",
    "[class*='event-card']",
    "[class*='EventCard']",
    "[class*='visit-card']",
    "[class*='VisitCard']",
    "[class*='schedule-card']",
    "[class*='ScheduleCard']",
    "[class*='schedule-event']",
    "[class*='ScheduleEvent']",
    "[class*='time-slot']",
    "[class*='TimeSlot']"
  ];
  const TIME_RANGE_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
  const SINGLE_TIME_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
  const DOCTOR_RE = /\b(?:dr\.?|doctor|dvm|d\.v\.m\.|vet|tech)\b/i;
  const DOCTOR_NAME_RE = /\b(?:dr\.?|doctor|d\.?\s*v\.?\s*m\.?|dvm)\b/i;
  const NON_DOCTOR_COLUMN_RE = /\b(?:tech|walk back|surgery|drop ?off)\b/i;
  const SURGERY_COLUMN_RE = /\b(?:surgery|sx)\b/i;
  const TECH_COLUMN_RE = /\b(?:tech|walk back)\b/i;
  const DROP_OFF_COLUMN_RE = /\b(?:drop ?off)\b/i;
  const URL_HINT_RE = /(schedule|calendar|appointment|appt|booking|practice)/i;
  const TYPE_MATCH_STOPWORDS = {
    appt: true,
    appointment: true,
    consult: false,
    consultation: true,
    column: true,
    doctor: true,
    exam: false,
    follow: true,
    new: true,
    patient: true,
    provider: true,
    pt: true,
    recheck: false,
    room: true,
    schedule: true,
    slot: true,
    the: true,
    type: true,
    visit: true,
    with: true
  };
  const PULSE_TYPE_LABEL_MAP = [
    { pulse: ["surgery consult"], vetboard: ["sx consult"] },
    { pulse: ["surgical"], vetboard: ["sx consult"] },
    { pulse: ["dental"], vetboard: ["sx consult"] },
    { pulse: ["emergency"], vetboard: ["emergency"] },
    { pulse: ["euthanasia", "euthanasia consult", "quality of life", "qol", "pts"], vetboard: ["euthanasia consult", "euthanasia"] },
    { pulse: ["illness/injury", "illness / injury", "illness injury", "injury illness"], vetboard: ["illness/injury", "illness injury"] },
    { pulse: ["exam"], vetboard: ["exam"] },
    { pulse: ["recheck"], vetboard: ["exam"] },
    { pulse: ["new puppy/kitten", "new puppy kitten", "new puppy", "new kitten"], vetboard: ["exam"] },
    { pulse: ["ultrasound", "ultra sound", "u/s", "abd ultrasound", "abdominal ultrasound"], vetboard: ["ultrasound", "u/s"] },
    { pulse: ["tech/walk back", "tech/walkback", "tech walk back", "tech walkback"], vetboard: ["tech/walkback", "tech/walk back", "tech appt", "tech"] },
    { pulse: ["outside**contagious", "outside contagious", "outside contageous", "outside constagious"], vetboard: ["outside**contagious", "outside contagious", "car isolation", "car - isolation"] },
    { pulse: ["work-in", "work in"], vetboard: ["work-in", "work in"] },
    { pulse: ["drop off", "drop-off", "sample drop off"], vetboard: ["work-in", "work in"] },
    { pulse: ["euthanasia"], vetboard: ["euthanasia"] },
    { pulse: ["bandage change"], vetboard: ["tech/walkback", "tech/walk back", "tech appt", "tech"] },
    { pulse: ["surgical referral"], vetboard: ["sx consult"] }
  ];

  let hoveredCard = null;
  let rafId = 0;
  let lastMoveEvent = null;
  let enabled = false;
  let captureArmed = false;
  let pendingAppointment = null;
  let authState = null;
  let authFormState = { email: "", password: "" };
  let authPanelOpen = false;
  let boardStateCache = null;
  let currentPracticeId = null;
  let formState = null;
  let modalMessage = "";
  let roomStatusRefreshTimer = null;
  let validationState = { patientName: false, colorLabelId: false };

  bootstrap();

  async function bootstrap() {
    if (!looksLikeSchedulerPage()) return;

    enabled = true;
    injectStyles();
    ensureOverlay();
    ensureBadge();
    ensureAuthPanel();
    ensureModalShell();

    try {
      const stored = await storageGet([AUTH_KEY]);
      authState = stored[AUTH_KEY] || null;
    } catch (_) {}

    pendingAppointment = null;
    captureArmed = false;
    updateBadgeUi();

    try {
      await storageRemove(STORAGE_KEY);
      await storageSet({ [CAPTURE_ARMED_KEY]: false });
    } catch (_) {}

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("scroll", refreshOverlay, true);
    window.addEventListener("resize", refreshOverlay);
    document.addEventListener("click", onDocumentClick, true);
  }

  function onMouseMove(event) {
    if (!enabled || !captureArmed) return;
    lastMoveEvent = event;
    if (rafId) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      const candidate = findAppointmentCard(lastMoveEvent?.target);
      if (candidate === hoveredCard) {
        refreshOverlay();
        return;
      }
      setHoveredCard(candidate);
    });
  }

  async function onDocumentClick(event) {
    if (!enabled) return;
    if (isModalTarget(event.target) || isBadgeTarget(event.target) || isAuthPanelTarget(event.target)) return;
    if (authPanelOpen) closeAuthPanel();
    if (!captureArmed) return;

    const card = findAppointmentCard(event.target);
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

    const parsed = parseAppointment(card);
    if (!parsed.patientName) {
      showToast("Could not read that appointment.");
      return;
    }

    pendingAppointment = {
      patientName: parsed.patientName,
      reason: parsed.reason,
      doctor: parsed.doctor,
      appointmentTime: parsed.appointmentTime,
      columnHeader: parsed.columnHeader,
      rawText: parsed.rawText,
      sourceUrl: location.href,
      capturedAt: new Date().toISOString()
    };

    formState = null;
    validationState = { patientName: false, colorLabelId: false };
    modalMessage = "";
    await setCaptureArmed(false);
    await storageSet({ [STORAGE_KEY]: pendingAppointment });
    updateBadgeUi();
    showToast(`Captured ${pendingAppointment.patientName}${pendingAppointment.reason ? " - " + pendingAppointment.reason : ""}`);
    await openQuickSendModal();
  }

  function findAppointmentCard(startNode) {
    let node = getElementFromNode(startNode);
    while (node && node !== document.body) {
      if (matchesKnownCardSelector(node) && isLikelyAppointmentCard(node)) return node;
      node = node.parentElement;
    }

    node = getElementFromNode(startNode);
    while (node && node !== document.body) {
      if (isLikelyAppointmentCard(node)) return node;
      node = node.parentElement;
    }

    return null;
  }

  function looksLikeSchedulerPage() {
    const url = `${location.hostname} ${location.pathname} ${location.search}`;
    if (URL_HINT_RE.test(url)) return true;

    const bodyText = normalizeSpaces(document.body?.innerText || "");
    const timeMatches = bodyText.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi) || [];
    if (timeMatches.length >= 6) return true;

    const candidateCount = CARD_SELECTORS.reduce((count, selector) => {
      try {
        return count + document.querySelectorAll(selector).length;
      } catch (_) {
        return count;
      }
    }, 0);

    return candidateCount >= 3;
  }

  function getElementFromNode(node) {
    if (node instanceof Element) return node;
    if (node && node.parentElement) return node.parentElement;
    return null;
  }

  function matchesKnownCardSelector(node) {
    return CARD_SELECTORS.some((selector) => {
      try {
        return node.matches(selector);
      } catch (_) {
        return false;
      }
    });
  }

  function isLikelyAppointmentCard(node) {
    if (!(node instanceof HTMLElement)) return false;
    if ([OVERLAY_ID, TOAST_ID, BADGE_ID, AUTH_PANEL_ID, MODAL_ID, BACKDROP_ID].includes(node.id)) return false;
    if (node.closest?.(`#${MODAL_ID}`)) return false;
    if (node.closest?.(`#${AUTH_PANEL_ID}`)) return false;

    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;

    const knownSelector = matchesKnownCardSelector(node);
    const rect = node.getBoundingClientRect();
    if (rect.width < (knownSelector ? 28 : 40) || rect.height < (knownSelector ? 20 : 24)) return false;
    if (rect.width > window.innerWidth * 0.95 || rect.height > window.innerHeight * 0.95) return false;

    const lines = getMeaningfulLines(node.innerText || "");
    if (!lines.length) return false;
    if (lines.length < 2 && !knownSelector) return false;
    if (lines.join(" ").length > 300) return false;
    const nonTimeLines = lines.filter((line) => !TIME_RANGE_RE.test(line) && !/^all-day$/i.test(line));
    if (!nonTimeLines.length) return false;

    const hasTime = lines.some((line) => TIME_RANGE_RE.test(line) || /^all-day$/i.test(line));
    const looksCardLike = /^(absolute|relative|sticky)$/.test(style.position) || style.cursor === "pointer" || rect.height <= 260;
    return hasTime && looksCardLike;
  }

  function parseAppointment(card) {
    const lines = getAppointmentLines(card);
    const cleaned = [];
    for (const line of lines) {
      if (!cleaned.includes(line)) cleaned.push(line);
    }

    const hoverDetails = parseVisitHighlights(card);
    const attributeText = getAppointmentAttributeText(card);
    const rawTextParts = [
      cleaned.join(" | "),
      attributeText,
      hoverDetails.type,
      hoverDetails.description,
      hoverDetails.provider,
      hoverDetails.status
    ].filter(Boolean);
    const rawText = rawTextParts.join(" | ");
    const appointmentTime = guessAppointmentTime(cleaned);
    const nonTimeLines = cleaned.filter((line) => !TIME_RANGE_RE.test(line) && !/^all-day$/i.test(line));
    const guessedColumnHeader = guessColumnHeader(card);
    const inferredColumnHeader = inferWorkflowColumnFromText([
      cleaned.join(" | "),
      attributeText,
      hoverDetails.type,
      hoverDetails.description,
      hoverDetails.status
    ].filter(Boolean).join(" | "));
    const columnHeader = chooseBestColumnHeader(guessedColumnHeader, inferredColumnHeader);
    const patientName = resolveBestPatientName(hoverDetails.patient, nonTimeLines);
    const reasonLines = [
      hoverDetails.type,
      hoverDetails.description,
      hoverDetails.status,
      ...nonTimeLines
    ].filter(Boolean);
    const reason = guessReason(reasonLines, patientName);
    const doctor = extractProviderName(hoverDetails.provider)
      || extractProviderName(attributeText)
      || guessDoctorFromLines(nonTimeLines)
      || guessDoctorFromColumn(card);

    return {
      patientName,
      reason,
      doctor,
      appointmentTime,
      columnHeader,
      rawText,
      typeText: normalizeSpaces(hoverDetails.type),
      providerText: normalizeSpaces(hoverDetails.provider),
      descriptionText: normalizeSpaces(hoverDetails.description)
    };
  }

  function guessPatientName(lines) {
    for (const line of lines) {
      if (!line) continue;
      if (DOCTOR_RE.test(line)) continue;
      if (TIME_RANGE_RE.test(line) || SINGLE_TIME_RE.test(line)) continue;
      if (/^[=\-–•]+$/.test(line)) continue;
      if (line.length > 40 && line.split(/\s+/).length > 5) continue;
      return normalizeSpaces(line);
    }
    return normalizeSpaces(lines[0] || "");
  }

  function resolveBestPatientName(tooltipPatient, lines) {
    const cleanedTooltipPatient = cleanTooltipPatientName(tooltipPatient);
    const guessedPatient = guessPatientName(lines);
    if (!cleanedTooltipPatient) return guessedPatient;
    if (!guessedPatient) return cleanedTooltipPatient;

    const tooltipParts = cleanedTooltipPatient.split(/\s+/).filter(Boolean);
    const guessedParts = guessedPatient.split(/\s+/).filter(Boolean);
    if (tooltipParts.length === 1 && guessedParts.length >= 2) {
      if (normalizeLooseCompare(guessedParts[0]) === normalizeLooseCompare(tooltipParts[0])) {
        return guessedPatient;
      }
    }
    if (normalizeLooseCompare(guessedPatient).startsWith(normalizeLooseCompare(cleanedTooltipPatient)) && guessedPatient.length > cleanedTooltipPatient.length) {
      return guessedPatient;
    }
    return cleanedTooltipPatient;
  }

  function guessReason(lines, patientName) {
    const filtered = [];
    for (const line of lines) {
      if (!line) continue;
      if (normalizeForCompare(line) === normalizeForCompare(patientName)) continue;
      if (DOCTOR_RE.test(line)) continue;
      if (TIME_RANGE_RE.test(line) || SINGLE_TIME_RE.test(line)) continue;
      if (/^[=\-–•]+$/.test(line)) continue;
      filtered.push(normalizeSpaces(line));
    }
    return filtered.join(", ");
  }

  function guessAppointmentTime(lines) {
    for (const line of lines) {
      const normalized = normalizeSpaces(line);
      if (!normalized) continue;
      if (/^all-day$/i.test(normalized)) return "All-day";
      if (TIME_RANGE_RE.test(normalized)) return normalized.match(TIME_RANGE_RE)?.[0] || normalized;
    }
    return "";
  }

  function guessDoctorFromLines(lines) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = normalizeSpaces(lines[index]);
      if (!line) continue;
      const extracted = extractProviderName(line);
      if (extracted) return extracted;
      if (!DOCTOR_NAME_RE.test(line)) continue;
      return line;
    }
    return "";
  }

  function extractProviderName(value) {
    let text = normalizeSpaces(value);
    if (!text) return "";
    text = text
      .replace(/^(?:appointment\s+provider|appointment\s+doctor|provider|doctor)\s*:?\s*/i, "")
      .replace(/\b(?:appointment\s+provider|appointment\s+doctor)\b\s*:?\s*/ig, " ")
      .replace(/\b(?:provider|doctor)\b\s*:?\s*/ig, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return "";
    const matches = text.match(/\b(?:dr\.?\s+[a-z][a-z' -]+|[a-z][a-z' -]+,\s*d\.?\s*v\.?\s*m\.?|[a-z][a-z' -]+\s+dvm)\b/ig);
    if (matches && matches.length) return normalizeSpaces(matches[0]);
    if (DOCTOR_NAME_RE.test(text)) return normalizeSpaces(text);
    return "";
  }

  function guessDoctorFromColumn(card) {
    const directDoctorHeader = findBestDoctorColumnHeader(card);
    if (directDoctorHeader) return directDoctorHeader;

    const columnHeader = guessColumnHeader(card);
    if (looksLikeDoctorColumnHeader(columnHeader)) return columnHeader;

    return "";
  }

  function findBestDoctorColumnHeader(card) {
    const cardRect = card?.getBoundingClientRect?.();
    if (!cardRect) return "";

    const centerX = cardRect.left + (cardRect.width / 2);
    let bestLabel = "";
    let bestScore = -Infinity;
    const candidates = Array.from(document.querySelectorAll("body *"));

    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === card || card.contains(node)) continue;
      if (node.closest(`#${MODAL_ID}, #${BADGE_ID}, #${AUTH_PANEL_ID}, #${OVERLAY_ID}, #${TOAST_ID}`)) continue;

      const rect = node.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 20 || rect.height > 90) continue;
      if (rect.bottom > cardRect.top + 12) continue;
      if (rect.top < -10 || rect.left < -10) continue;

      const text = normalizeSpaces(node.innerText || "");
      if (!text || text.length > 80) continue;
      if (!looksLikeDoctorColumnHeader(text)) continue;

      const horizontalCenter = rect.left + (rect.width / 2);
      const horizontalDistance = Math.abs(horizontalCenter - centerX);
      const verticalDistance = Math.max(0, cardRect.top - rect.bottom);
      const overlapsCenter = centerX >= rect.left - 12 && centerX <= rect.right + 12;
      const score = (overlapsCenter ? 200 : 0) - (horizontalDistance * 2.5) - (verticalDistance * 0.35);

      if (score > bestScore) {
        bestScore = score;
        bestLabel = text;
      }
    }

    return normalizeSpaces(bestLabel);
  }

  function guessColumnHeader(card) {
    const doctorHeader = findBestDoctorColumnHeader(card);
    if (doctorHeader) return doctorHeader;

    const workflowHeader = findBestWorkflowColumnHeader(card);
    if (workflowHeader) return workflowHeader;

    const cardRect = card?.getBoundingClientRect?.();
    if (!cardRect) return "";

    const centerX = cardRect.left + (cardRect.width / 2);
    let bestLabel = "";
    let bestScore = -Infinity;
    const candidates = Array.from(document.querySelectorAll("body *"));

    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === card || card.contains(node)) continue;
      if (node.closest(`#${MODAL_ID}, #${BADGE_ID}, #${AUTH_PANEL_ID}, #${OVERLAY_ID}, #${TOAST_ID}`)) continue;

      const rect = node.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 20 || rect.height > 90) continue;
      if (rect.bottom > cardRect.top + 12) continue;
      if (rect.top < -10 || rect.left < -10) continue;

      const text = normalizeSpaces(node.innerText || "");
      if (!text || text.length > 80) continue;
      if (!looksLikeColumnHeaderLabel(text)) continue;

      const horizontalCenter = rect.left + (rect.width / 2);
      const horizontalDistance = Math.abs(horizontalCenter - centerX);
      const verticalDistance = Math.max(0, cardRect.top - rect.bottom);
      const overlapsCenter = centerX >= rect.left - 12 && centerX <= rect.right + 12;
      const score = (overlapsCenter ? 220 : 0) - (horizontalDistance * 2.2) - (verticalDistance * 0.35);

      if (score > bestScore) {
        bestScore = score;
        bestLabel = text;
      }
    }

    return normalizeSpaces(bestLabel);
  }

  function findBestWorkflowColumnHeader(card) {
    const cardRect = card?.getBoundingClientRect?.();
    if (!cardRect) return "";

    const centerX = cardRect.left + (cardRect.width / 2);
    let bestLabel = "";
    let bestScore = -Infinity;
    const candidates = Array.from(document.querySelectorAll("body *"));

    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === card || card.contains(node)) continue;
      if (node.closest(`#${MODAL_ID}, #${BADGE_ID}, #${AUTH_PANEL_ID}, #${OVERLAY_ID}, #${TOAST_ID}`)) continue;

      const rect = node.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 16 || rect.height > 90) continue;
      if (rect.bottom > cardRect.top + 16) continue;
      if (rect.top < -10 || rect.left < -10) continue;

      const text = normalizeSpaces(node.innerText || "");
      if (!looksLikeWorkflowColumnHeader(text)) continue;

      const horizontalCenter = rect.left + (rect.width / 2);
      const horizontalDistance = Math.abs(horizontalCenter - centerX);
      const verticalDistance = Math.max(0, cardRect.top - rect.bottom);
      const overlapsCenter = centerX >= rect.left - 24 && centerX <= rect.right + 24;
      const exactWorkflow = normalizeWorkflowHeader(text);
      let score = (overlapsCenter ? 260 : 0) - (horizontalDistance * 2.1) - (verticalDistance * 0.45);
      if (exactWorkflow === "surgery") score += 140;
      if (exactWorkflow === "tech") score += 110;
      if (exactWorkflow === "drop off") score += 90;

      if (score > bestScore) {
        bestScore = score;
        bestLabel = text;
      }
    }

    return normalizeSpaces(bestLabel);
  }

  function looksLikeDoctorColumnHeader(text) {
    const label = normalizeSpaces(text);
    if (!label) return false;
    if (NON_DOCTOR_COLUMN_RE.test(label)) return false;
    if (/\d/.test(label)) return false;
    return DOCTOR_NAME_RE.test(label);
  }

  function looksLikeWorkflowColumnHeader(text) {
    const normalized = normalizeWorkflowHeader(text);
    return normalized === "surgery" || normalized === "tech" || normalized === "drop off";
  }

  function normalizeWorkflowHeader(text) {
    const label = normalizeLooseCompare(text);
    if (!label) return "";
    if (SURGERY_COLUMN_RE.test(label) || /\bspay\b|\bneuter\b|\bdental\b/.test(label)) return "surgery";
    if (TECH_COLUMN_RE.test(label) || /\bwalk back\b/.test(label)) return "tech";
    if (DROP_OFF_COLUMN_RE.test(label) || /\bdropoff\b/.test(label)) return "drop off";
    return "";
  }

  function inferWorkflowColumnFromText(text) {
    const normalized = normalizeLooseCompare(text);
    if (!normalized) return "";
    if (SURGERY_COLUMN_RE.test(normalized) || /\bsx consult\b|\bsurgery consult\b|\bsurgical\b|\bspay\b|\bneuter\b|\bdental\b/.test(normalized)) return "Surgery";
    if (TECH_COLUMN_RE.test(normalized) || /\btech appt\b|\bwalk back\b/.test(normalized)) return "Tech";
    if (DROP_OFF_COLUMN_RE.test(normalized) || /\bdropoff\b|\bday admit\b/.test(normalized)) return "Drop Off";
    return "";
  }

  function chooseBestColumnHeader(primaryHeader, fallbackHeader) {
    const primary = normalizeSpaces(primaryHeader);
    const fallback = normalizeSpaces(fallbackHeader);
    if (looksLikeWorkflowColumnHeader(primary)) return primary;
    if (looksLikeWorkflowColumnHeader(fallback)) return fallback;
    return primary || fallback || "";
  }

  function parseVisitHighlights(card) {
    const panel = findVisitHighlightsPanel(card);
    if (!panel) return {};

    const lines = getMeaningfulLines(panel.innerText || panel.textContent || "");
    if (!lines.length) return {};

    const labelMap = {
      "type": "type",
      "appointment type": "type",
      "visit type": "type",
      "description": "description",
      "reason": "description",
      "appointment reason": "description",
      "status": "status",
      "appointment provider": "provider",
      "provider": "provider",
      "doctor": "provider",
      "appointment doctor": "provider",
      "patient": "patient"
    };

    const details = {};
    let currentKey = "";
    for (const line of lines) {
      const normalized = normalizeLooseCompare(line);
      const matchedKey = labelMap[normalized];
      if (matchedKey) {
        currentKey = matchedKey;
        if (!details[currentKey]) details[currentKey] = [];
        continue;
      }
      const inlineMatch = parseInlineLabeledLine(line, labelMap);
      if (inlineMatch) {
        if (!details[inlineMatch.key]) details[inlineMatch.key] = [];
        details[inlineMatch.key].push(inlineMatch.value);
        currentKey = inlineMatch.key;
        continue;
      }
      if (normalized === "visit highlights") continue;
      if (!currentKey) continue;
      details[currentKey].push(line);
    }

    return {
      type: normalizeSpaces((details.type || []).join(" ")),
      description: normalizeSpaces((details.description || []).join(" ")),
      status: normalizeSpaces((details.status || []).join(" ")),
      provider: extractProviderName((details.provider || []).join(" ")) || normalizeSpaces((details.provider || []).join(" ")),
      patient: normalizeSpaces((details.patient || []).join(" "))
    };
  }

  function parseInlineLabeledLine(line, labelMap) {
    const text = normalizeSpaces(line);
    if (!text) return null;
    const colonMatch = text.match(/^([^:]{2,40}):\s*(.+)$/);
    if (colonMatch) {
      const key = labelMap[normalizeLooseCompare(colonMatch[1])];
      const value = normalizeSpaces(colonMatch[2]);
      if (key && value) return { key, value };
    }
    const normalized = normalizeLooseCompare(text);
    for (const rawLabel of Object.keys(labelMap)) {
      if (!normalized.startsWith(rawLabel + " ")) continue;
      const value = normalizeSpaces(text.slice(rawLabel.length));
      if (value) return { key: labelMap[rawLabel], value };
    }
    return null;
  }

  function findVisitHighlightsPanel(card) {
    const cardRect = card?.getBoundingClientRect?.();
    if (!cardRect) return null;

    let bestNode = null;
    let bestScore = -Infinity;
    const candidates = Array.from(document.querySelectorAll("body *"));

    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue;
      if (node === card || card.contains(node)) continue;
      if (node.closest(`#${MODAL_ID}, #${BADGE_ID}, #${AUTH_PANEL_ID}, #${OVERLAY_ID}, #${TOAST_ID}`)) continue;

      const rect = node.getBoundingClientRect();
      if (rect.width < 220 || rect.height < 120) continue;
      if (rect.top < -10 || rect.left < -10) continue;

      const text = normalizeSpaces(node.innerText || "");
      if (!text) continue;
      const hasVisitHighlights = /visit highlights/i.test(text);
      const hasProvider = /appointment provider/i.test(text);
      const hasType = /\btype\b/i.test(text);
      if (!hasVisitHighlights && !(hasProvider && hasType)) continue;

      const distanceX = Math.abs(rect.left - cardRect.right);
      const distanceY = Math.abs(rect.top - cardRect.top);
      const score = (hasVisitHighlights ? 500 : 0) + (hasProvider ? 160 : 0) + (hasType ? 120 : 0) - distanceX - (distanceY * 0.5);
      if (score > bestScore) {
        bestScore = score;
        bestNode = node;
      }
    }

    return bestNode;
  }

  function cleanTooltipPatientName(value) {
    const text = normalizeSpaces(value);
    if (!text) return "";
    return normalizeSpaces(text.split("(")[0]);
  }

  function looksLikeColumnHeaderLabel(text) {
    const label = normalizeSpaces(text);
    if (!label) return false;
    if (label.length > 40) return false;
    if (/\d/.test(label)) return false;
    if (looksLikeDoctorColumnHeader(label)) return true;
    if (TECH_COLUMN_RE.test(label)) return true;
    if (SURGERY_COLUMN_RE.test(label)) return true;
    if (DROP_OFF_COLUMN_RE.test(label)) return true;
    return false;
  }

  function getAppointmentLines(node) {
    if (!(node instanceof HTMLElement)) return [];

    const visibleText = node.innerText || node.textContent || "";
    const visibleLines = getMeaningfulLines(visibleText);
    if (visibleLines.length) return visibleLines;

    return getMeaningfulLines(getAppointmentAttributeText(node));
  }

  function getAppointmentAttributeText(node) {
    if (!(node instanceof HTMLElement)) return "";

    const chunks = [];
    const pushChunk = (value) => {
      const normalized = normalizeSpaces(value);
      if (!normalized) return;
      if (!chunks.includes(normalized)) chunks.push(normalized);
    };

    const candidates = [node, ...Array.from(node.querySelectorAll("*")).slice(0, 60)];
    for (const element of candidates) {
      if (!(element instanceof HTMLElement)) continue;
      pushChunk(element.getAttribute("aria-label"));
      pushChunk(element.getAttribute("title"));

      for (const [key, value] of Object.entries(element.dataset || {})) {
        if (typeof value !== "string") continue;
        if (!value.trim()) continue;
        if (!/(appointment|appt|patient|reason|doctor|provider|time|start|visit|event|name)/i.test(key)) continue;
        pushChunk(value);
      }
    }

    return chunks.join("\n");
  }

  function getMeaningfulLines(text) {
    return String(text || "")
      .split(/\n+/)
      .map((line) => normalizeSpaces(line))
      .filter((line) => line && line.length > 1);
  }

  function normalizeSpaces(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeForCompare(value) {
    return normalizeSpaces(value).toLowerCase();
  }

  function normalizeLooseCompare(value) {
    return normalizeForCompare(value)
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function setHoveredCard(card) {
    if (hoveredCard) hoveredCard.classList.remove(HOVER_CLASS);
    hoveredCard = card;
    if (hoveredCard && captureArmed) hoveredCard.classList.add(HOVER_CLASS);
    refreshOverlay();
  }

  function ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = '<span>Click appointment</span>';
    document.documentElement.appendChild(overlay);
  }

  function ensureBadge() {
    if (document.getElementById(BADGE_ID)) return;
    const badge = document.createElement("button");
    badge.id = BADGE_ID;
    badge.type = "button";
    badge.textContent = "VB";
    badge.addEventListener("click", async function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      closeAuthPanel();
      await handleBadgeClick();
    });
    badge.addEventListener("contextmenu", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      toggleAuthPanel();
    });
    document.documentElement.appendChild(badge);
  }

  function ensureAuthPanel() {
    if (document.getElementById(AUTH_PANEL_ID)) return;
    const panel = document.createElement("section");
    panel.id = AUTH_PANEL_ID;
    panel.setAttribute("aria-label", "VetBoard login");
    document.documentElement.appendChild(panel);
    renderAuthPanel();
  }

  async function handleBadgeClick() {
    if (pendingAppointment?.patientName) {
      await discardPendingCapture("Capture canceled.");
      return;
    }

    await refreshRoomsFromBadge();
    const nextState = !captureArmed;
    await setCaptureArmed(nextState);
    showToast(nextState ? "Patient selection armed." : "Patient selection canceled.");
  }

  async function refreshRoomsFromBadge() {
    if (!authState) return;
    try {
      await ensureValidAuthSession();
      await loadBoardState(true);
      if (isModalOpen()) renderModal();
    } catch (error) {
      modalMessage = getErrorMessage(error);
      if (isModalOpen()) renderModal();
    }
  }

  async function setCaptureArmed(nextState) {
    captureArmed = !!nextState;
    if (!captureArmed) setHoveredCard(null);
    updateBadgeUi();
    await storageSet({ [CAPTURE_ARMED_KEY]: captureArmed });
  }

  function updateBadgeUi() {
    const badge = document.getElementById(BADGE_ID);
    if (!badge) return;

    badge.classList.toggle("is-armed", captureArmed);
    badge.classList.toggle("is-busy", !!pendingAppointment);

    let label = "VetBoard capture idle. Click to arm patient selection. Right-click for login.";
    if (captureArmed) {
      label = "VetBoard capture armed. Click an appointment or press VB again to cancel. Right-click for login.";
    } else if (pendingAppointment?.patientName) {
      label = "A patient is captured. Finish sending or press VB to cancel. Right-click for login.";
    }

    badge.setAttribute("aria-label", label);
    badge.title = label;
  }

  function refreshOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    if (!captureArmed || !hoveredCard || !document.contains(hoveredCard) || isModalOpen()) {
      overlay.style.display = "none";
      return;
    }

    const rect = hoveredCard.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${Math.max(6, rect.left - 3)}px`;
    overlay.style.top = `${Math.max(6, rect.top - 3)}px`;
    overlay.style.width = `${Math.max(40, rect.width + 6)}px`;
    overlay.style.height = `${Math.max(28, rect.height + 6)}px`;
  }

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 1900);
  }

  function toggleAuthPanel() {
    authPanelOpen = !authPanelOpen;
    renderAuthPanel();
  }

  function closeAuthPanel() {
    if (!authPanelOpen) return;
    authPanelOpen = false;
    renderAuthPanel();
  }

  function renderAuthPanel() {
    const panel = document.getElementById(AUTH_PANEL_ID);
    if (!panel) return;

    panel.classList.toggle("is-open", authPanelOpen);
    panel.style.display = authPanelOpen ? "block" : "none";
    if (!authPanelOpen) return;

    panel.innerHTML = authState
      ? `
        <div class="vbPanelCard">
          <div class="vbPanelHeader">
            <div>
              <div class="vbEyebrow">VetBoard Login</div>
              <h3>Connected</h3>
            </div>
            <button class="vbBtn" data-auth-action="close" type="button">Close</button>
          </div>
          <div class="vbAuthState">Signed in as ${escapeHtml(authState.email || "VetBoard user")}.</div>
          <div class="vbActions">
            <button class="vbBtn" data-auth-action="logout" type="button">Logout</button>
          </div>
        </div>
      `
      : `
        <div class="vbPanelCard">
          <div class="vbPanelHeader">
            <div>
              <div class="vbEyebrow">VetBoard Login</div>
              <h3>Supabase</h3>
            </div>
            <button class="vbBtn" data-auth-action="close" type="button">Close</button>
          </div>
          <div class="vbGrid vbAuthGrid">
            <label class="vbField">
              <span>Email</span>
              <input id="vbAuthEmail" autocomplete="username" placeholder="name@clinic.com" type="text" value="${escapeHtml(authFormState.email)}" />
            </label>
            <label class="vbField">
              <span>Password</span>
              <input id="vbAuthPassword" autocomplete="current-password" placeholder="password" type="password" value="${escapeHtml(authFormState.password)}" />
            </label>
          </div>
          <div class="vbActions">
            <button class="vbBtn vbPrimary" data-auth-action="login" type="button">Login to Supabase</button>
          </div>
        </div>
      `;

    panel.querySelectorAll("[data-auth-action]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const action = event.currentTarget.getAttribute("data-auth-action");
        if (action === "close") {
          closeAuthPanel();
          return;
        }
        if (action === "login") {
          await handleLogin();
          return;
        }
        if (action === "logout") {
          await handleLogout();
        }
      });
    });

    const authEmail = panel.querySelector("#vbAuthEmail");
    const authPassword = panel.querySelector("#vbAuthPassword");
    if (authEmail) {
      authEmail.addEventListener("input", () => {
        authFormState.email = authEmail.value;
      });
    }
    if (authPassword) {
      authPassword.addEventListener("input", () => {
        authFormState.password = authPassword.value;
      });
    }
  }

  function ensureModalShell() {
    if (document.getElementById(BACKDROP_ID) && document.getElementById(MODAL_ID)) return;

    const backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID;
    backdrop.addEventListener("click", function () {
      discardPendingCapture("Capture canceled.");
    });

    const modal = document.createElement("section");
    modal.id = MODAL_ID;
    modal.setAttribute("aria-label", "Send appointment to VetBoard");

    document.documentElement.appendChild(backdrop);
    document.documentElement.appendChild(modal);
  }

  async function openQuickSendModal() {
    if (!pendingAppointment?.patientName) return;

    document.documentElement.classList.add("vetboard-send-open");
    const backdrop = document.getElementById(BACKDROP_ID);
    const modal = document.getElementById(MODAL_ID);
    closeAuthPanel();
    if (backdrop) backdrop.style.display = "none";
    if (modal) modal.style.display = "block";

    renderModal();

    if (authState) {
      try {
        await ensureValidAuthSession();
        await loadBoardState(false);
      } catch (error) {
        modalMessage = getErrorMessage(error);
      }
      renderModal();
    }

    startRoomStatusRefresh();
    updateBadgeUi();
  }

  function closeQuickSendModal() {
    document.documentElement.classList.remove("vetboard-send-open");
    const backdrop = document.getElementById(BACKDROP_ID);
    const modal = document.getElementById(MODAL_ID);
    if (backdrop) backdrop.style.display = "none";
    if (modal) modal.style.display = "none";
    stopRoomStatusRefresh();
    refreshOverlay();
  }

  async function discardPendingCapture(message) {
    pendingAppointment = null;
    formState = null;
    validationState = { patientName: false, colorLabelId: false };
    modalMessage = "";
    closeQuickSendModal();
    updateBadgeUi();
    try {
      await storageRemove(STORAGE_KEY);
    } catch (_) {}
    await setCaptureArmed(false);
    if (message) showToast(message);
  }

  function renderModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal || !pendingAppointment) return;

    if (authState && boardStateCache?.data && !formState) {
      formState = buildInitialFormState(boardStateCache.data, pendingAppointment);
    }

    modal.innerHTML = `
      <div class="vbModalCard">
        <div class="vbModalHeader">
          <div>
            <div class="vbEyebrow">VetBoard Quick Send</div>
            <h2>Send appointment to the board</h2>
          </div>
          <button class="vbBtn" data-action="close-modal" type="button">Close</button>
        </div>
        <div class="vbCard">
          <div class="vbCardHeader">
            <div>
              <h3>Quick Add fields</h3>
            </div>
            <button class="vbBtn" data-action="refresh-board" type="button" ${authState ? "" : "disabled"}>Refresh rooms</button>
          </div>
          ${renderFormSection()}
        </div>
        <div class="vbFooter">
          <div class="vbFooterNote">${escapeHtml(modalMessage || "Click Send to VetBoard to push this appointment into the shared board.")}</div>
          <div class="vbActions">
            <button class="vbBtn" data-action="close-modal" type="button">Cancel</button>
            <button class="vbBtn vbPrimary" data-action="send-board" type="button" ${authState && boardStateCache?.data ? "" : "disabled"}>Send to VetBoard</button>
          </div>
        </div>
      </div>
    `;

    bindModalHandlers(modal);
  }

  function renderFormSection() {
    if (!authState) {
      return `<div class="vbEmpty">Right-click the VB badge to log in and load rooms from the shared VetBoard.</div>`;
    }

    if (!boardStateCache?.data) {
      return `<div class="vbEmpty">No board data loaded yet. Click Refresh rooms after login.</div>`;
    }

    const data = boardStateCache.data;
    const rooms = Array.isArray(data.rooms) ? data.rooms : [];
    const colorLabels = Array.isArray(data.colorLabels) ? data.colorLabels : [];
    const doctors = Array.isArray(data.doctors) ? data.doctors : [];
    const quickNotes = Array.isArray(data.quickNotes) ? data.quickNotes : [];

    if (!formState) formState = buildInitialFormState(data, pendingAppointment);
    validationState.patientName = !normalizeSpaces(formState?.patientName || "");
    validationState.colorLabelId = !normalizeSpaces(formState?.colorLabelId || "");
    const patientNameInvalid = !!validationState.patientName;
    const typeInvalid = !!validationState.colorLabelId;

    return `
      <div class="vbGrid">
        <label class="vbField vbFieldFull">
          <span>Room</span>
          <select id="vbRoomId">${rooms.map((room) => {
            const label = formatRoomOptionLabel(room);
            return `<option value="${escapeHtml(room.id)}" ${room.id === formState.roomId ? "selected" : ""}>${escapeHtml(label)}</option>`;
          }).join("")}</select>
        </label>
        <label class="vbField vbFieldFull ${patientNameInvalid ? "is-error" : ""}">
          <span>Patient name</span>
          <input id="vbPatientName" type="text" value="${escapeHtml(formState.patientName)}" aria-invalid="${patientNameInvalid ? "true" : "false"}" />
        </label>
        <label class="vbField ${typeInvalid ? "is-error" : ""}">
          <span>Type</span>
          <select id="vbColorLabelId" aria-invalid="${typeInvalid ? "true" : "false"}"><option value="" ${formState.colorLabelId ? "" : "selected"}>Select type</option>${colorLabels.map((label) => `<option value="${escapeHtml(label.id)}" ${label.id === formState.colorLabelId ? "selected" : ""}>${escapeHtml(label.title || "")}</option>`).join("")}</select>
        </label>
        <label class="vbField">
          <span>Doctor</span>
          <select id="vbDoctor">${doctors.map((doctor) => `<option value="${escapeHtml(doctor || "")}" ${doctor === formState.doctor ? "selected" : ""}>${escapeHtml(doctor || "(none)")}</option>`).join("")}</select>
        </label>
        <label class="vbField">
          <span>Tech</span>
          <input id="vbTech" type="text" value="${escapeHtml(formState.tech)}" placeholder="e.g., Alex" />
        </label>
        <label class="vbField">
          <span>Quick note</span>
          <select id="vbQuickNote">${quickNotes.map((note) => `<option value="${escapeHtml(note || "")}" ${note === formState.quickNote ? "selected" : ""}>${escapeHtml(note || "(none)")}</option>`).join("")}</select>
        </label>
        <label class="vbField vbFieldFull">
          <span>Status notes</span>
          <textarea id="vbNotes" placeholder="Quick notes…">${escapeHtml(formState.notes)}</textarea>
        </label>
      </div>
      <div class="vbToggleRow">
        <label class="vbCheckbox"><input id="vbRoomReady" type="checkbox" ${formState.roomReady ? "checked" : ""} /> Room ready</label>
        <label class="vbCheckbox"><input id="vbDoctorReady" type="checkbox" ${formState.doctorReady ? "checked" : ""} /> Doctor ready</label>
      </div>
    `;
  }

  function bindModalHandlers(modal) {
    modal.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const action = event.currentTarget.getAttribute("data-action");
        if (action === "close-modal") {
          await discardPendingCapture("Capture canceled.");
          return;
        }
        if (action === "refresh-board") {
          await handleRefreshBoard();
          return;
        }
        if (action === "send-board") {
          await handleSendToBoard();
        }
      });
    });

    const bindSync = (id, prop, type) => {
      const field = modal.querySelector(`#${id}`);
      if (!field) return;
      const eventName = type === "select" ? "change" : "input";
      field.addEventListener(eventName, () => {
        if (!formState) return;
        if (type === "checkbox") {
          formState[prop] = !!field.checked;
        } else {
          formState[prop] = field.value;
        }
        if (prop in validationState) {
          validationState[prop] = !normalizeSpaces(formState[prop] || "");
          const fieldWrap = field.closest(".vbField");
          if (fieldWrap) fieldWrap.classList.toggle("is-error", validationState[prop]);
          field.setAttribute("aria-invalid", validationState[prop] ? "true" : "false");
        }
      });
    };

    const roomSelect = modal.querySelector("#vbRoomId");
    if (roomSelect) {
      roomSelect.addEventListener("change", () => {
        if (!boardStateCache?.data || !pendingAppointment) return;
        const room = findRoomById(boardStateCache.data, roomSelect.value);
        if (!room) return;
        formState = mergeRoomDefaultsIntoForm(room, pendingAppointment, boardStateCache.data, formState);
        renderModal();
      });
    }

    bindSync("vbPatientName", "patientName", "text");
    bindSync("vbColorLabelId", "colorLabelId", "select");
    bindSync("vbDoctor", "doctor", "select");
    bindSync("vbTech", "tech", "text");
    bindSync("vbQuickNote", "quickNote", "select");
    bindSync("vbNotes", "notes", "text");
    bindSync("vbRoomReady", "roomReady", "checkbox");
    bindSync("vbDoctorReady", "doctorReady", "checkbox");
  }

  async function handleLogin() {
    const panel = document.getElementById(AUTH_PANEL_ID);
    const email = normalizeSpaces(panel?.querySelector("#vbAuthEmail")?.value || authFormState.email || "");
    const password = String(panel?.querySelector("#vbAuthPassword")?.value || authFormState.password || "");
    authFormState.email = email;
    authFormState.password = password;
    if (!email || !password) {
      showToast("Enter your Supabase email and password.");
      renderAuthPanel();
      return;
    }

    try {
      showToast("Logging in…");
      authState = await loginToSupabase(email, password);
      authFormState.password = "";
      await storageSet({ [AUTH_KEY]: authState });
      boardStateCache = null;
      currentPracticeId = null;
      await loadBoardState(true);
      modalMessage = "Logged in. Rooms loaded.";
      renderAuthPanel();
      if (isModalOpen()) renderModal();
      startRoomStatusRefresh();
      showToast("Logged in. Rooms loaded.");
    } catch (error) {
      modalMessage = getErrorMessage(error);
      authState = null;
      await storageRemove(AUTH_KEY);
      renderAuthPanel();
      if (isModalOpen()) renderModal();
      showToast(modalMessage);
    }
  }

  async function handleLogout() {
    authState = null;
    authFormState.password = "";
    boardStateCache = null;
    currentPracticeId = null;
    formState = null;
    modalMessage = "Logged out.";
    await storageRemove(AUTH_KEY);
    renderAuthPanel();
    if (isModalOpen()) renderModal();
    showToast("Logged out.");
  }

  async function handleRefreshBoard() {
    try {
      modalMessage = "Loading rooms…";
      renderModal();
      await loadBoardState(true);
      modalMessage = "Board refreshed.";
    } catch (error) {
      modalMessage = getErrorMessage(error);
    }
    renderModal();
  }

  function startRoomStatusRefresh() {
    if (roomStatusRefreshTimer) clearInterval(roomStatusRefreshTimer);
    roomStatusRefreshTimer = setInterval(async function () {
      if (!isModalOpen() || !authState) return;
      try {
        await loadBoardState(true);
        renderModal();
      } catch (_) {}
    }, 10000);
  }

  function stopRoomStatusRefresh() {
    if (!roomStatusRefreshTimer) return;
    clearInterval(roomStatusRefreshTimer);
    roomStatusRefreshTimer = null;
  }

  async function handleSendToBoard() {
    if (!pendingAppointment?.patientName) {
      modalMessage = "No appointment captured.";
      renderModal();
      return;
    }
    if (!authState) {
      modalMessage = "Login required before sending to VetBoard.";
      renderModal();
      return;
    }

    syncFormStateFromDom();
    validationState = {
      patientName: !normalizeSpaces(formState?.patientName || ""),
      colorLabelId: !normalizeSpaces(formState?.colorLabelId || "")
    };
    if (validationState.patientName || validationState.colorLabelId) {
      modalMessage = "Select both the appointment name and type before sending.";
      renderModal();
      return;
    }
    if (!formState?.roomId) {
      modalMessage = "Pick a room first.";
      renderModal();
      return;
    }

    try {
      modalMessage = "Sending to VetBoard…";
      renderModal();

      await ensureValidAuthSession();
      const boardData = await loadBoardState(true);
      const cloned = deepClone(boardData);
      const room = findRoomById(cloned, formState.roomId);
      if (!room) throw new Error("That room could not be found in the shared board.");

      const wasEmpty = !normalizeSpaces(room.patientName || "");
      room.patientName = normalizeSpaces(formState.patientName || pendingAppointment.patientName || "");
      room.colorLabelId = formState.colorLabelId || room.colorLabelId;
      room.colorHex = "";
      room.doctor = formState.doctor || "";
      room.tech = normalizeSpaces(formState.tech || "");
      room.quickNote = formState.quickNote || "";
      room.notes = normalizeSpaces(formState.notes || "");
      room.roomReady = !!formState.roomReady;
      room.doctorReady = !!formState.doctorReady;
      room.needsCleaning = false;
      if (room.cleaningTimer) {
        room.cleaningTimer.running = false;
        room.cleaningTimer.startedAt = null;
        room.cleaningTimer.startedAtIso = null;
      }

      const selectedColor = getColorById(cloned, room.colorLabelId);
      if (selectedColor?.title) room.reason = selectedColor.title;

      if (room.patientName && !room.timer?.running && computeElapsed(room.timer) === 0) {
        const serverNowIso = await fetchServerNowIso();
        room.timer = room.timer || { elapsedMs: 0, baseElapsedMs: 0, running: false, startedAt: null, startedAtIso: null };
        room.timer.elapsedMs = Math.max(0, Number(room.timer.elapsedMs || 0));
        room.timer.baseElapsedMs = Math.max(0, Number(room.timer.baseElapsedMs || room.timer.elapsedMs || 0));
        room.timer.running = true;
        room.timer.startedAt = null;
        room.timer.startedAtIso = serverNowIso;
      }

      if (wasEmpty && !room.activeRoomSessionId) {
        room.activeRoomSessionId = await createRoomSession(room);
      }

      await upsertBoardState(cloned);
      boardStateCache = { data: cloned };
      modalMessage = `${room.patientName} sent to ${room.name || "room"}.`;
      showToast(modalMessage);
      pendingAppointment = null;
      formState = null;
      validationState = { patientName: false, colorLabelId: false };
      await storageRemove(STORAGE_KEY);
      await setCaptureArmed(false);
      updateBadgeUi();
      closeQuickSendModal();
    } catch (error) {
      modalMessage = getErrorMessage(error);
      renderModal();
    }
  }

  function syncFormStateFromDom() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal || !formState) return;

    formState.roomId = modal.querySelector("#vbRoomId")?.value ?? formState.roomId;
    formState.patientName = modal.querySelector("#vbPatientName")?.value ?? "";
    formState.colorLabelId = modal.querySelector("#vbColorLabelId")?.value ?? "";
    formState.doctor = modal.querySelector("#vbDoctor")?.value ?? "";
    formState.tech = modal.querySelector("#vbTech")?.value ?? "";
    formState.quickNote = modal.querySelector("#vbQuickNote")?.value ?? "";
    formState.notes = modal.querySelector("#vbNotes")?.value ?? "";
    formState.roomReady = !!modal.querySelector("#vbRoomReady")?.checked;
    formState.doctorReady = !!modal.querySelector("#vbDoctorReady")?.checked;
  }

  function buildInitialFormState(boardData, appointment) {
    const rooms = Array.isArray(boardData.rooms) ? boardData.rooms : [];
    const preferredRoom = rooms.find((room) => !room.patientName && !room.needsCleaning) || rooms.find((room) => !room.needsCleaning) || rooms[0];
    const selectedRoomId = preferredRoom?.id || "";
    return mergeRoomDefaultsIntoForm(preferredRoom || {}, appointment, boardData, {
      roomId: selectedRoomId
    });
  }

  function mergeRoomDefaultsIntoForm(room, appointment, boardData, previousForm) {
    const reasonMatch = findBestColorLabelId(boardData, appointment);
    const doctorMatch = findBestDoctorMatch(boardData, appointment);
    const defaultColorId = normalizeSpaces(boardData?.settings?.defaultColorLabelId || "");
    const hasPreviousColor = !!previousForm && Object.prototype.hasOwnProperty.call(previousForm, "colorLabelId");
    const previousDoctorChosen = !!normalizeSpaces(previousForm?.doctor || "");
    const techAppointment = isTechAppointment(appointment);
    const surgeryAppointment = isSurgeryAppointment(appointment);
    const techTypeMatch = techAppointment ? findColorLabelByMatchTerms(Array.isArray(boardData.colorLabels) ? boardData.colorLabels : [], ["tech appt", "tech", "nurse"]) : null;
    const surgeryTypeMatch = surgeryAppointment ? findSurgeryConsultLabel(Array.isArray(boardData.colorLabels) ? boardData.colorLabels : []) : null;
    const techDoctorMatch = techAppointment ? findTechDoctorMatch(Array.isArray(boardData.doctors) ? boardData.doctors : []) : "";
    return {
      roomId: room.id || previousForm?.roomId || "",
      patientName: previousForm?.patientName || appointment.patientName || room.patientName || "",
      colorLabelId: techTypeMatch?.id || surgeryTypeMatch?.id || (hasPreviousColor ? (previousForm.colorLabelId || "") : (reasonMatch || defaultColorId || room.colorLabelId || "")),
      doctor: previousDoctorChosen ? previousForm.doctor : (techDoctorMatch || doctorMatch || room.doctor || ""),
      tech: room.tech || "",
      quickNote: room.quickNote || "",
      notes: previousForm?.notes || buildAppointmentNotes(appointment, room.notes || ""),
      roomReady: previousForm?.roomReady != null ? previousForm.roomReady : !!room.roomReady,
      doctorReady: previousForm?.doctorReady != null ? previousForm.doctorReady : !!room.doctorReady
    };
  }

  function buildAppointmentNotes(appointment, fallbackNotes) {
    const noteParts = [];
    const reason = normalizeSpaces(appointment?.reason || "");
    const appointmentTime = normalizeSpaces(appointment?.appointmentTime || "");

    if (reason) noteParts.push(reason);
    if (appointmentTime) noteParts.push(`Appt time: ${appointmentTime}`);

    if (noteParts.length) return noteParts.join("\n\n");
    return fallbackNotes || "";
  }

  function getSelectedRoom() {
    if (!boardStateCache?.data || !formState?.roomId) return null;
    return findRoomById(boardStateCache.data, formState.roomId);
  }

  function findRoomById(boardData, roomId) {
    const rooms = Array.isArray(boardData.rooms) ? boardData.rooms : [];
    return rooms.find((room) => room.id === roomId) || null;
  }

  function formatRoomOptionLabel(room) {
    const roomName = room?.name || "Room";
    if (room?.needsCleaning) {
      return `${roomName} - NEEDS CLEANING`;
    }
    if (normalizeSpaces(room?.patientName || "")) {
      return `${roomName} - FULL (${normalizeSpaces(room.patientName)})`;
    }
    return `${roomName} - OPEN`;
  }

  function getColorById(boardData, colorId) {
    const colors = Array.isArray(boardData.colorLabels) ? boardData.colorLabels : [];
    return colors.find((item) => item.id === colorId) || colors[0] || null;
  }

  function findBestColorLabelId(boardData, appointment) {
    const colors = Array.isArray(boardData.colorLabels) ? boardData.colorLabels : [];
    const reason = normalizeSpaces(appointment?.reason || "");
    const typeText = normalizeSpaces(appointment?.typeText || "");
    const columnHeader = normalizeSpaces(appointment?.columnHeader || "");
    const rawText = normalizeSpaces(appointment?.rawText || "");
    const looseType = normalizeLooseCompare(typeText);
    const searchText = normalizeForCompare([typeText, reason, rawText, columnHeader].filter(Boolean).join(" "));
    const looseReason = normalizeLooseCompare([typeText, reason].filter(Boolean).join(" "));
    const looseSearchText = normalizeLooseCompare([typeText, reason, rawText, columnHeader].filter(Boolean).join(" "));
    if (!searchText) return colors[0]?.id || "";

    const directTypeMatch = findDirectPulseTypeMatch(colors, appointment);
    if (directTypeMatch) return directTypeMatch.id;

    const mappedPulseType = findMappedPulseTypeLabel(colors, appointment, { typeOnly: true })
      || findMappedPulseTypeLabel(colors, appointment);
    if (mappedPulseType) return mappedPulseType.id;

    const forcedExactVisitType = findExactVisitTypeLabel(colors, normalizeLooseCompare(typeText || "")) || findExactVisitTypeLabel(colors, looseSearchText);
    if (forcedExactVisitType) return forcedExactVisitType.id;

    if (isSurgeryAppointment(appointment)) {
      const surgeryConsultMatch = findSurgeryConsultLabel(colors);
      if (surgeryConsultMatch) return surgeryConsultMatch.id;
    }

    if (looseType) {
      const exactTypeMatch = colors.find((label) => normalizeLooseCompare(label.title) === looseType);
      if (exactTypeMatch) return exactTypeMatch.id;

      const aliasTypeMatch = findAliasColorLabel(colors, looseType);
      if (aliasTypeMatch) return aliasTypeMatch.id;

      const scoredTypeMatch = findBestScoredColorLabel(colors, looseType);
      if (scoredTypeMatch) return scoredTypeMatch.id;
    }

    const forcedMatch = findForcedColorLabel(colors, appointment, looseReason, looseSearchText);
    if (forcedMatch) return forcedMatch.id;

    const exact = colors.find((label) => normalizeForCompare(label.title) === searchText);
    if (exact) return exact.id;

    const exactLooseReason = colors.find((label) => normalizeLooseCompare(label.title) === looseReason);
    if (exactLooseReason) return exactLooseReason.id;

    const exactLooseSearch = colors.find((label) => normalizeLooseCompare(label.title) === looseSearchText);
    if (exactLooseSearch) return exactLooseSearch.id;

    const aliasMatch = findAliasColorLabel(colors, looseSearchText);
    if (aliasMatch) return aliasMatch.id;

    const scoredReasonMatch = findBestScoredColorLabel(colors, looseReason);
    if (scoredReasonMatch) return scoredReasonMatch.id;

    const scoredSearchMatch = findBestScoredColorLabel(colors, looseSearchText);
    if (scoredSearchMatch) return scoredSearchMatch.id;

    const contains = colors.find((label) => {
      const labelText = normalizeForCompare(label.title);
      return searchText.includes(labelText) || labelText.includes(searchText);
    });
    if (contains) return contains.id;

    const containsLoose = colors.find((label) => {
      const labelText = normalizeLooseCompare(label.title);
      return looseSearchText.includes(labelText) || labelText.includes(looseSearchText) || (looseReason && (looseReason.includes(labelText) || labelText.includes(looseReason)));
    });
    if (containsLoose) return containsLoose.id;

    const keywordGroups = buildTypeKeywordGroups(columnHeader);
    for (const group of keywordGroups) {
      if (!group.keywords.some((keyword) => looseSearchText.includes(normalizeLooseCompare(keyword)))) continue;
      const match = colors.find((label) => {
        const labelText = normalizeLooseCompare(label.title);
        return group.matches.some((text) => labelText.includes(normalizeLooseCompare(text)));
      });
      if (match) return match.id;
    }

    return colors[0]?.id || "";
  }

  function findAliasColorLabel(colors, looseSearchText) {
    const aliasGroups = [
      {
        aliases: ["euth", "euthanasia", "pts", "put to sleep", "quality of life"],
        labels: ["euthanasia consult", "euthanasia"]
      },
      {
        aliases: ["sx", "surgery", "surgical", "spay", "neuter", "dental", "mass", "fracture", "procedure", "consult"],
        labels: ["sx consult", "surgery consult", "surgery", "consult"]
      },
      {
        aliases: ["drop off", "dropoff", "sedated", "day admit", "admit"],
        labels: ["drop-off", "drop off"]
      },
      {
        aliases: ["tech", "walk back", "walkback", "nail", "laser", "blood draw", "bw", "anal glands", "a/g"],
        labels: ["tech appt", "tech"]
      },
      {
        aliases: ["recheck", "follow up", "followup", "re chk", "rechk"],
        labels: ["exam", "recheck", "wellness"]
      },
      {
        aliases: ["new puppy", "new kitten", "new pt", "new patient", "exam", "annual", "wellness", "consult"],
        labels: ["exam", "wellness"]
      },
      {
        aliases: ["vaccine", "vacc", "vaccs", "booster", "rabies", "dhpp", "bordetella", "bord", "lepto", "lyme", "flu"],
        labels: ["vaccine", "vacc", "wellness"]
      },
      {
        aliases: ["illness injury", "illness/injury", "injury illness", "illness", "injury"],
        labels: ["illness/injury", "illness injury"]
      },
      {
        aliases: ["vomit", "vomiting", "diarrhea", "diarr", "limp", "pain", "cough", "itch", "ear", "sick", "ill"],
        labels: ["illness/injury", "illness injury", "sick", "exam"]
      },
      {
        aliases: ["outside contagious", "outside contageous", "outside constagious", "outside", "contagious", "constagious", "contageous", "car", "isolation"],
        labels: ["outside contagious", "car isolation", "car - isolation"]
      }
    ];

    for (const group of aliasGroups) {
      if (!group.aliases.some((alias) => looseSearchText.includes(normalizeLooseCompare(alias)))) continue;
      const match = findColorLabelByMatchTerms(colors, group.labels);
      if (match) return match;
    }

    return null;
  }

  function findForcedColorLabel(colors, appointment, looseReason, looseSearchText) {
    const columnHeader = normalizeForCompare(appointment?.columnHeader || "");

    const outsideContagiousMatch = findOutsideContagiousLabel(colors, looseSearchText);
    if (outsideContagiousMatch) return outsideContagiousMatch;

    const exactVisitTypeMatch = findExactVisitTypeLabel(colors, looseSearchText);
    if (exactVisitTypeMatch) return exactVisitTypeMatch;

    if (["illness injury", "illness/injury", "injury illness", "illness", "injury"].some((keyword) => looseSearchText.includes(normalizeLooseCompare(keyword)))) {
      const illnessInjuryMatch = findColorLabelByMatchTerms(colors, ["illness/injury", "illness injury"]);
      if (illnessInjuryMatch) return illnessInjuryMatch;
    }

    if (TECH_COLUMN_RE.test(columnHeader)) {
      const techMatch = findColorLabelByMatchTerms(colors, ["tech appt", "tech", "nurse"]);
      if (techMatch) return techMatch;
    }

    if (SURGERY_COLUMN_RE.test(columnHeader)) {
      const surgeryMatch = findSurgeryConsultLabel(colors) || findColorLabelByMatchTerms(colors, ["surgery consult", "surgery", "consult"]);
      if (surgeryMatch) return surgeryMatch;
    }

    if (DROP_OFF_COLUMN_RE.test(columnHeader)) {
      const dropOffMatch = findColorLabelByMatchTerms(colors, ["drop-off", "drop off"]);
      if (dropOffMatch) return dropOffMatch;
    }

    if (["recheck", "follow up", "follow-up", "followup", "re chk", "rechk", "new puppy", "new kitten", "new patient", "new pt", "exam"].some((keyword) => looseSearchText.includes(normalizeLooseCompare(keyword)))) {
      const examMatch = findColorLabelByMatchTerms(colors, ["exam", "wellness"]);
      if (examMatch) return examMatch;
    }

    if (["outside contagious", "outside contageous", "outside constagious"].some((keyword) => looseSearchText.includes(normalizeLooseCompare(keyword)))) {
      return findOutsideContagiousLabel(colors, looseSearchText);
    }

    return null;
  }

  function findColorLabelByMatchTerms(colors, matchTerms) {
    for (const term of matchTerms) {
      const normalizedTerm = normalizeLooseCompare(term);
      const match = colors.find((label) => normalizeLooseCompare(label.title).includes(normalizedTerm));
      if (match) return match;
    }
    return null;
  }

  function findMappedPulseTypeLabel(colors, appointment, options) {
    options = options || {};
    const workflowTargets = [
      "tech/walkback",
      "tech/walk back",
      "tech appt",
      "tech",
      "work-in",
      "work in"
    ].map((term) => normalizeLooseCompare(term));
    const sources = {
      type: normalizeLooseCompare(appointment?.typeText || ""),
      reason: normalizeLooseCompare(appointment?.reason || ""),
      description: normalizeLooseCompare(appointment?.descriptionText || ""),
      column: normalizeLooseCompare(appointment?.columnHeader || "")
    };
    const directSearch = options.typeOnly
      ? sources.type
      : [sources.type, sources.reason, sources.description].filter(Boolean).join(" ");
    const workflowSearch = [sources.column, sources.type, sources.reason].filter(Boolean).join(" ");
    if (!directSearch && !workflowSearch) return null;

    for (const mapping of PULSE_TYPE_LABEL_MAP) {
      const isWorkflowOnly = mapping.vetboard.some((term) => workflowTargets.includes(normalizeLooseCompare(term)));
      const haystack = isWorkflowOnly ? workflowSearch : directSearch;
      if (!haystack) continue;
      if (!mapping.pulse.some((term) => haystack.includes(normalizeLooseCompare(term)))) continue;
      const match = findColorLabelByMatchTerms(colors, mapping.vetboard);
      if (match) return match;
    }

    return null;
  }

  function findDirectPulseTypeMatch(colors, appointment) {
    const typeOnly = normalizeLooseCompare(appointment?.typeText || "");
    const directContext = normalizeLooseCompare([
      appointment?.typeText,
      appointment?.reason,
      appointment?.descriptionText,
      appointment?.rawText
    ].filter(Boolean).join(" "));
    if (!typeOnly && !directContext) return null;

    if (["euthanasia", "euthanasia consult", "quality of life", "qol", "pts", "put to sleep", "euth"].some((keyword) => directContext.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["euthanasia", "euthanasia consult"]);
    }

    if (["ultrasound", "ultra sound", "u/s", "u s", "abd ultrasound", "abdominal ultrasound"].some((keyword) => directContext.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["ultrasound", "ultra sound", "u/s", "u s"]);
    }

    if (["illness injury", "illness / injury", "illness/injury", "injury illness"].some((keyword) => typeOnly.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["illness/injury", "illness injury"]);
    }

    if (["ultrasound", "ultra sound", "u/s", "abd ultrasound", "abdominal ultrasound"].some((keyword) => typeOnly.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["ultrasound", "u/s"]);
    }

    if (["exam", "recheck", "follow up", "follow-up", "followup", "new puppy", "new kitten", "new puppy kitten", "new patient", "new pt"].some((keyword) => typeOnly.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["exam"]);
    }

    if (["tech/walk back", "tech/walkback", "tech walk back", "tech walkback"].some((keyword) => typeOnly.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["tech/walkback", "tech/walk back", "tech appt", "tech"]);
    }

    if (["surgery consult", "surgical referral", "surgical", "dental"].some((keyword) => typeOnly.includes(normalizeLooseCompare(keyword)))) {
      return findSurgeryConsultLabel(colors);
    }

    return null;
  }

  function findExactVisitTypeLabel(colors, looseSearchText) {
    if (!looseSearchText) return null;

    if (["illness injury", "illness/injury", "injury illness"].some((keyword) => looseSearchText.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["illness/injury", "illness injury"]);
    }

    if (["recheck", "follow up", "follow-up", "followup", "re chk", "rechk", "new puppy", "new kitten", "new patient", "new pt", "exam"].some((keyword) => looseSearchText.includes(normalizeLooseCompare(keyword)))) {
      return findColorLabelByMatchTerms(colors, ["exam"]);
    }

    return null;
  }

  function findSurgeryConsultLabel(colors) {
    const exactMatch = colors.find((label) => normalizeLooseCompare(label?.title || "") === "sx consult");
    if (exactMatch) return exactMatch;
    return findColorLabelByMatchTerms(colors, ["sx consult", "sxconsult", "surgery consult"]);
  }

  function findBestScoredColorLabel(colors, searchText) {
    const normalizedSearch = normalizeLooseCompare(searchText);
    const searchTokens = getSignificantLooseTokens(normalizedSearch);
    if (!normalizedSearch || !searchTokens.length) return null;

    let bestLabel = null;
    let bestScore = 0;

    for (const label of colors) {
      const labelText = normalizeLooseCompare(label?.title || "");
      const labelTokens = getSignificantLooseTokens(labelText);
      if (!labelText || !labelTokens.length) continue;

      let score = 0;
      if (labelText === normalizedSearch) score = 1000;
      else if (labelText.includes(normalizedSearch)) score = 900;
      else if (normalizedSearch.includes(labelText)) score = 850;

      const overlapCount = countTokenOverlap(labelTokens, searchTokens);
      if (overlapCount) {
        score += overlapCount * 120;
        if (overlapCount === labelTokens.length) score += 180;
        if (overlapCount === searchTokens.length) score += 140;
      }

      if (searchTokens.length > 1) {
        const searchBigrams = buildTokenPhrases(searchTokens, 2);
        const labelBigrams = buildTokenPhrases(labelTokens, 2);
        const bigramOverlap = countTokenOverlap(labelBigrams, searchBigrams);
        if (bigramOverlap) score += bigramOverlap * 180;
      }

      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }

    return bestScore >= 240 ? bestLabel : null;
  }

  function getSignificantLooseTokens(value) {
    return normalizeLooseCompare(value)
      .split(" ")
      .filter((token) => token && token.length > 1 && !TYPE_MATCH_STOPWORDS[token]);
  }

  function buildTokenPhrases(tokens, phraseSize) {
    const phrases = [];
    const size = Math.max(1, Number(phraseSize || 1));
    for (let index = 0; index <= tokens.length - size; index += 1) {
      phrases.push(tokens.slice(index, index + size).join(" "));
    }
    return phrases;
  }

  function countTokenOverlap(values, candidates) {
    if (!Array.isArray(values) || !Array.isArray(candidates) || !values.length || !candidates.length) return 0;
    const candidateSet = new Set(candidates);
    let matches = 0;
    for (const value of values) {
      if (candidateSet.has(value)) matches += 1;
    }
    return matches;
  }

  function findOutsideContagiousLabel(colors, searchText) {
    if (!hasOutsideContagiousSignal(searchText)) return null;

    const exactCategory = colors.find((label) => {
      const labelText = normalizeLooseCompare(label.title);
      return labelText.includes("outside") && hasContagiousSignal(labelText);
    });
    if (exactCategory) return exactCategory;

    return colors.find((label) => {
      const labelText = normalizeLooseCompare(label.title);
      return labelText.includes("car") && labelText.includes("isolation");
    }) || null;
  }

  function hasOutsideContagiousSignal(text) {
    const normalized = normalizeLooseCompare(text);
    return normalized.includes("outside") && hasContagiousSignal(normalized);
  }

  function hasContagiousSignal(text) {
    const normalized = normalizeLooseCompare(text);
    return ["contagious", "constagious", "contageous"].some((term) => normalized.includes(term));
  }

  function buildTypeKeywordGroups(columnHeader) {
    const groups = [];
    const normalizedColumn = normalizeForCompare(columnHeader);

    if (SURGERY_COLUMN_RE.test(normalizedColumn)) {
      groups.push({
        keywords: ["surgery", "sx", "spay", "neuter", "mass", "fracture", "procedure", "dental"],
        matches: ["sx consult", "surgery consult", "surgery", "consult"]
      });
    }

    if (TECH_COLUMN_RE.test(normalizedColumn)) {
      groups.push({
        keywords: ["tech", "walk back", "walkback", "nail", "blood draw", "bw", "vaccine booster", "tech appt"],
        matches: ["tech appt", "tech", "nurse"]
      });
    }

    if (DROP_OFF_COLUMN_RE.test(normalizedColumn)) {
      groups.push({
        keywords: ["drop off", "dropoff", "sedated", "work in"],
        matches: ["drop-off", "drop off"]
      });
    }

    groups.push(
      {
        keywords: ["outside contagious", "outside contageous", "outside constagious", "outside", "contagious", "constagious", "car", "isolation"],
        matches: ["car - isolation", "car", "isolation"]
      },
      {
        keywords: ["new puppy", "new kitten", "puppy", "kitten", "new pt", "new patient", "exam", "annual", "wellness"],
        matches: ["wellness", "exam", "vaccine", "vacc"]
      },
      {
        keywords: ["vacc", "vaccine", "booster", "rabies", "dhpp", "bordetella", "lepto"],
        matches: ["vaccine", "vacc", "wellness"]
      },
      {
        keywords: ["recheck", "follow up", "follow-up", "re chk", "rechk"],
        matches: ["exam", "wellness"]
      },
      {
        keywords: ["sick", "vomit", "vomited", "diarrhea", "diarr", "limp", "pain", "injury", "ear", "itch", "cough", "mass check"],
        matches: ["sick", "urgent", "ill", "exam"]
      },
      {
        keywords: ["surgery", "sx", "spay", "neuter", "mass", "fracture", "dental", "consult"],
        matches: ["sx consult", "surgery consult", "surgery", "consult"]
      },
      {
        keywords: ["drop off", "dropoff", "sedated", "day admit"],
        matches: ["drop-off", "drop off"]
      },
      {
        keywords: ["tech", "walk back", "walkback", "nail", "blood draw", "laser", "anal glands"],
        matches: ["tech appt", "tech"]
      },
      {
        keywords: ["euthanasia"],
        matches: ["euthanasia"]
      }
    );

    return groups;
  }

  function findBestDoctorMatch(boardData, appointment) {
    const doctors = Array.isArray(boardData.doctors) ? boardData.doctors : [];
    const techDoctorMatch = hasExplicitTechWalkbackType(appointment) || isTechAppointment(appointment) ? findTechDoctorMatch(doctors) : "";
    if (techDoctorMatch) return techDoctorMatch;

    const guesses = [
      appointment?.doctor,
      appointment?.providerText,
      extractProviderName(appointment?.rawText || ""),
      appointment?.columnHeader
    ].map((value) => normalizeSpaces(value)).filter(Boolean);
    if (!guesses.length) return "";

    let bestDoctor = "";
    let bestScore = 0;
    for (const guess of guesses) {
      const guessKey = normalizeDoctorForMatch(guess);
      const guessLast = getDoctorLastToken(guessKey);
      if (!guessKey) continue;

      for (const doctor of doctors) {
        const doctorName = normalizeSpaces(doctor);
        const doctorKey = normalizeDoctorForMatch(doctorName);
        if (!doctorKey) continue;

        let score = 0;
        if (doctorKey === guessKey) score = 100;
        else if (doctorKey.includes(guessKey) || guessKey.includes(doctorKey)) score = 90;
        else if (guessLast && doctorKey.split(" ").includes(guessLast)) score = 75;

        if (score > bestScore) {
          bestScore = score;
          bestDoctor = doctorName;
        }
      }
    }

    return bestDoctor;
  }

  function isTechAppointment(appointment) {
    const typeText = normalizeLooseCompare(appointment?.typeText || "");
    const columnHeader = normalizeLooseCompare(appointment?.columnHeader || "");
    const reasonText = normalizeLooseCompare(appointment?.reason || "");

    if (["exam", "recheck", "follow up", "followup", "follow-up", "new puppy", "new kitten", "new patient", "new pt", "illness injury", "illness/injury", "injury illness"].some((keyword) => {
      const normalizedKeyword = normalizeLooseCompare(keyword);
      return typeText.includes(normalizedKeyword) || reasonText.includes(normalizedKeyword);
    })) {
      return false;
    }

    if (columnHeader === "tech") return true;
    if (typeText.includes("tech appt")) return true;
    if (typeText.includes("walk back") || typeText.includes("walkback")) return true;
    if (typeText === "tech") return true;

    return false;
  }

  function hasExplicitTechWalkbackType(appointment) {
    const typeText = normalizeLooseCompare(appointment?.typeText || "");
    return ["tech/walk back", "tech/walkback", "tech walk back", "tech walkback"].some((keyword) => typeText.includes(normalizeLooseCompare(keyword)));
  }

  function isSurgeryAppointment(appointment) {
    const typeText = normalizeLooseCompare(appointment?.typeText || "");
    const columnHeader = normalizeLooseCompare(appointment?.columnHeader || "");
    if (["exam", "recheck", "follow up", "follow-up", "followup", "new puppy", "new kitten", "new patient", "new pt", "illness injury", "illness/injury", "injury illness", "tech/walk back", "tech/walkback"].some((keyword) => {
      const normalizedKeyword = normalizeLooseCompare(keyword);
      return typeText.includes(normalizedKeyword);
    })) {
      return false;
    }
    if (columnHeader === "surgery") return true;
    return ["surgery consult", "surgical referral", "surgical", "dental", "sx consult"].some((keyword) => typeText.includes(normalizeLooseCompare(keyword)));
  }

  function findTechDoctorMatch(doctors) {
    const exactTechDoctor = findExactLooseMatch(doctors, ["tech tc", "tech (tc)", "tech"]);
    if (exactTechDoctor) return exactTechDoctor;

    const rankedMatchers = [
      (doctor) => {
        const text = normalizeLooseCompare(doctor);
        return text.includes("tech") && text.includes("tc");
      },
      (doctor) => normalizeLooseCompare(doctor).includes("tech tc"),
      (doctor) => normalizeLooseCompare(doctor).includes("tech"),
      (doctor) => normalizeLooseCompare(doctor).split(" ").includes("tc")
    ];

    for (const matcher of rankedMatchers) {
      const match = doctors.find((doctor) => matcher(doctor || ""));
      if (match) return normalizeSpaces(match);
    }

    return "";
  }

  function findExactLooseMatch(values, candidates) {
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeLooseCompare(candidate);
      const match = values.find((value) => normalizeLooseCompare(value || "") === normalizedCandidate);
      if (match) return normalizeSpaces(match);
    }
    return "";
  }

  function normalizeDoctorForMatch(value) {
    return normalizeSpaces(value)
      .toLowerCase()
      .replace(/\b(?:dr\.?|doctor|d\.?\s*v\.?\s*m\.?|dvm)\b/g, " ")
      .replace(/[(),.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getDoctorLastToken(value) {
    const parts = normalizeSpaces(value).split(" ").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  async function loginToSupabase(email, password) {
    const data = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!data?.access_token) throw new Error("Supabase login did not return a session.");
    return mapAuthPayload(data, email);
  }

  async function ensureValidAuthSession() {
    if (!authState?.accessToken) throw new Error("Login required.");

    const expiresAt = Number(authState.expiresAt || 0);
    const freshEnough = expiresAt && expiresAt > Date.now() + 60 * 1000;
    if (freshEnough) return authState;

    if (!authState.refreshToken) throw new Error("Your Supabase session expired. Please log in again.");

    const data = await fetchJson(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: authState.refreshToken })
    });

    authState = mapAuthPayload(data, authState.email);
    await storageSet({ [AUTH_KEY]: authState });
    return authState;
  }

  function mapAuthPayload(data, fallbackEmail) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 3600)) * 1000,
      email: data.user?.email || fallbackEmail || "",
      userId: data.user?.id || ""
    };
  }

  async function loadBoardState(forceRefresh) {
    if (boardStateCache?.data && !forceRefresh) return boardStateCache.data;

    await ensureValidAuthSession();
    const practiceId = await fetchPracticeId(forceRefresh);
    const boardData = await fetchPracticeBoardData(practiceId);
    boardStateCache = {
      data: boardData,
      updated_at: new Date().toISOString()
    };
    if (!formState && pendingAppointment) formState = buildInitialFormState(boardData, pendingAppointment);
    return boardData;
  }

  async function upsertBoardState(boardData) {
    await ensureValidAuthSession();
    const practiceId = await fetchPracticeId(false);
    const payload = buildPracticeBoardStatePayload(boardData, practiceId);
    await fetchJson(`${SUPABASE_URL}/rest/v1/practice_board_state?on_conflict=practice_id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${authState.accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(payload)
    });
  }

  async function fetchPracticeId(forceRefresh) {
    if (currentPracticeId && !forceRefresh) return currentPracticeId;

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authState.accessToken}`,
      "Content-Type": "application/json"
    };

    try {
      const practiceId = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_my_practice_id`, {
        method: "POST",
        headers,
        body: "{}"
      });
      if (typeof practiceId === "string" && practiceId) {
        currentPracticeId = practiceId;
        return currentPracticeId;
      }
    } catch (_) {}

    if (!authState?.userId) {
      throw new Error("Could not determine your RoomBoard clinic.");
    }

    const rows = await fetchJson(
      `${SUPABASE_URL}/rest/v1/profiles?select=practice_id&user_id=eq.${encodeURIComponent(authState.userId)}&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${authState.accessToken}`,
          Accept: "application/json"
        }
      }
    );

    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.practice_id) {
      throw new Error("Could not determine your RoomBoard clinic.");
    }

    currentPracticeId = row.practice_id;
    return currentPracticeId;
  }

  async function fetchPracticeBoardData(practiceId) {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authState.accessToken}`,
      Accept: "application/json"
    };
    const encodedPracticeId = encodeURIComponent(practiceId);

    const [roomRows, doctorRows, colorRows, quickNoteRows, settingsRows, boardStateRows] = await Promise.all([
      fetchJson(`${SUPABASE_URL}/rest/v1/rooms?select=id,name,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,name.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/doctors?select=id,name,initials,active&practice_id=eq.${encodedPracticeId}&order=name.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/appointment_types?select=id,title,color_hex,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,title.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/quick_notes?select=id,label,sort_order,active&practice_id=eq.${encodedPracticeId}&order=sort_order.asc,label.asc`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/practice_settings?select=board_columns,show_only_active,board_view,highlight_doctor_id,default_appointment_type_id&practice_id=eq.${encodedPracticeId}&limit=1`, { method: "GET", headers }),
      fetchJson(`${SUPABASE_URL}/rest/v1/practice_board_state?select=practice_id,board_state,updated_at&practice_id=eq.${encodedPracticeId}&limit=1`, { method: "GET", headers })
    ]);

    return buildBoardStateFromPracticeRows({
      roomRows,
      doctorRows,
      colorRows,
      quickNoteRows,
      settingsRows,
      boardStateRows
    });
  }

  function buildBoardStateFromPracticeRows(payload) {
    const roomRows = Array.isArray(payload.roomRows) ? payload.roomRows : [];
    const doctorRows = Array.isArray(payload.doctorRows) ? payload.doctorRows : [];
    const colorRows = Array.isArray(payload.colorRows) ? payload.colorRows : [];
    const quickNoteRows = Array.isArray(payload.quickNoteRows) ? payload.quickNoteRows : [];
    const settingsRow = Array.isArray(payload.settingsRows) ? payload.settingsRows[0] : (payload.settingsRows || null);
    const boardStateRow = Array.isArray(payload.boardStateRows) ? payload.boardStateRows[0] : (payload.boardStateRows || null);
    const boardState = boardStateRow?.board_state && typeof boardStateRow.board_state === "object" ? boardStateRow.board_state : {};
    const boardRooms = Array.isArray(boardState.rooms) ? boardState.rooms : [];

    const activeDoctors = doctorRows.filter((row) => row && row.active !== false && normalizeSpaces(row.name));
    const activeColorRows = colorRows.filter((row) => row && row.active !== false && normalizeSpaces(row.title));
    const activeQuickNotes = quickNoteRows.filter((row) => row && row.active !== false && normalizeSpaces(row.label));

    const doctorInitials = {};
    activeDoctors.forEach((row) => {
      doctorInitials[row.name] = row.initials || "";
    });

    const colorLabels = activeColorRows.map((row) => ({
      id: row.id,
      title: row.title,
      color: row.color_hex || "#6ea8fe"
    }));

    const boardRoomMap = Object.create(null);
    boardRooms.forEach((room) => {
      if (room?.id) boardRoomMap[room.id] = room;
    });

    const defaultColorId = settingsRow?.default_appointment_type_id || colorLabels[0]?.id || "";
    const doctors = ["", ...activeDoctors.map((row) => row.name)];
    const quickNotes = ["", ...activeQuickNotes.map((row) => row.label)];

    const rooms = roomRows
      .filter((row) => row && row.active !== false)
      .sort((a, b) => {
        const sortDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (sortDiff !== 0) return sortDiff;
        return String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true, sensitivity: "base" });
      })
      .map((row, index) => mergeRoomEntryWithDefaults(row, boardRoomMap[row.id], index, defaultColorId, colorLabels));

    const highlightedDoctor = activeDoctors.find((row) => row.id === settingsRow?.highlight_doctor_id);

    return {
      rooms,
      doctors,
      quickNotes,
      colorLabels,
      settings: {
        displayCols: Math.max(1, Number(settingsRow?.board_columns || 4)),
        displayOnlyActive: !!settingsRow?.show_only_active,
        displayLayout: settingsRow?.board_view === "list" ? "list" : "grid",
        highlightDoctor: highlightedDoctor?.name || "",
        defaultColorLabelId: defaultColorId,
        doctorInitials
      }
    };
  }

  function mergeRoomEntryWithDefaults(roomRow, entryData, index, defaultColorId, colorLabels) {
    const colorId = entryData?.colorLabelId || defaultColorId || colorLabels[0]?.id || "";
    const merged = {
      id: roomRow.id,
      name: roomRow.name || `Room ${index + 1}`,
      patientName: "",
      colorLabelId: colorId,
      colorHex: "",
      doctor: "",
      tech: "",
      quickNote: "",
      notes: "",
      roomReady: false,
      doctorReady: false,
      needsCleaning: false,
      reason: "",
      timer: normalizeTimer(entryData?.timer),
      cleaningTimer: normalizeTimer(entryData?.cleaningTimer),
      activeRoomSessionId: entryData?.activeRoomSessionId || null,
      dischargeReady: entryData?.dischargeReady == null ? null : !!entryData.dischargeReady
    };

    if (entryData && typeof entryData === "object") {
      Object.assign(merged, entryData);
      merged.id = roomRow.id;
      merged.name = roomRow.name || merged.name;
      merged.timer = normalizeTimer(entryData.timer);
      merged.cleaningTimer = normalizeTimer(entryData.cleaningTimer);
    }

    if (!merged.reason) {
      const color = colorLabels.find((item) => item.id === merged.colorLabelId);
      if (color?.title) merged.reason = color.title;
    }

    return merged;
  }

  function normalizeTimer(timer) {
    const base = timer && typeof timer === "object" ? timer : {};
    const elapsedMs = Math.max(0, Number(base.elapsedMs || 0));
    const baseElapsedMs = Math.max(0, Number(base.baseElapsedMs != null ? base.baseElapsedMs : elapsedMs));
    return {
      elapsedMs,
      baseElapsedMs,
      running: !!base.running,
      startedAt: base.startedAt || null,
      startedAtIso: base.startedAtIso || null
    };
  }

  function buildPracticeBoardStatePayload(boardData, practiceId) {
    const rooms = Array.isArray(boardData?.rooms) ? boardData.rooms : [];
    return {
      practice_id: practiceId,
      board_state: {
        rooms: deepClone(rooms)
      }
    };
  }

  async function createRoomSession(room) {
    await ensureValidAuthSession();
    const practiceId = await fetchPracticeId(false);
    const serverNowIso = await fetchServerNowIso();
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${authState.accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
    const payload = {
      room_name: room.name || room.id,
      doctor_name: room.doctor || null,
      started_at: serverNowIso,
      ended_at: null,
      duration_ms: null
    };
    if (practiceId) payload.practice_id = practiceId;

    let data;
    try {
      data = await fetchJson(`${SUPABASE_URL}/rest/v1/room_sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (!shouldRetryRoomSessionWithoutPracticeId(error) || !practiceId) throw error;
      const fallbackPayload = {
        room_name: payload.room_name,
        doctor_name: payload.doctor_name,
        started_at: payload.started_at,
        ended_at: payload.ended_at,
        duration_ms: payload.duration_ms
      };
      data = await fetchJson(`${SUPABASE_URL}/rest/v1/room_sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify(fallbackPayload)
      });
    }

    return Array.isArray(data) ? data[0]?.id || null : data?.id || null;
  }

  function shouldRetryRoomSessionWithoutPracticeId(error) {
    const message = normalizeSpaces(getErrorMessage(error)).toLowerCase();
    return (
      message.includes("column") && message.includes("practice_id") && message.includes("does not exist")
    ) || (
      message.includes("schema cache") && message.includes("practice_id")
    ) || (
      message.includes("could not find the 'practice_id' column")
    );
  }

  function computeElapsed(timer) {
    if (!timer) return 0;
    const elapsedMs = Math.max(0, Number(timer.elapsedMs || 0));
    if (timer.running && timer.startedAtIso) {
      const startedAtMs = Date.parse(timer.startedAtIso);
      if (Number.isFinite(startedAtMs)) {
        return elapsedMs + Math.max(0, Date.now() - startedAtMs);
      }
    }
    if (timer.running && timer.startedAt) {
      return elapsedMs + Math.max(0, Date.now() - Number(timer.startedAt));
    }
    return elapsedMs;
  }

  function normalizeServerNowIso(value) {
    if (!value) return null;
    if (typeof value === "string") {
      const parsed = Date.parse(value.trim());
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    }
    if (typeof value === "object") {
      const keys = ["server_now", "serverNow", "now", "ts", "timestamp", "get_server_now_iso"];
      for (const key of keys) {
        if (value[key]) {
          const nested = normalizeServerNowIso(value[key]);
          if (nested) return nested;
        }
      }
    }
    return null;
  }

  async function fetchServerNowIso() {
    try {
      await ensureValidAuthSession();
      const data = await fetchJson(`${SUPABASE_URL}/rest/v1/rpc/get_server_now_iso`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${authState.accessToken}`,
          "Content-Type": "application/json"
        },
        body: "{}"
      });
      return normalizeServerNowIso(data) || new Date().toISOString();
    } catch (_) {
      return new Date().toISOString();
    }
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (_) {
      parsed = text;
    }

    if (!response.ok) {
      throw new Error(getErrorMessage(parsed) || `Request failed (${response.status})`);
    }

    return parsed;
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown error";
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    if (Array.isArray(error) && error[0]?.message) return error[0].message;
    if (error.msg) return error.msg;
    if (error.error_description) return error.error_description;
    try {
      return JSON.stringify(error);
    } catch (_) {
      return String(error);
    }
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isModalTarget(target) {
    return target instanceof Element && !!target.closest?.(`#${MODAL_ID}, #${BACKDROP_ID}`);
  }

  function isBadgeTarget(target) {
    return target instanceof Element && !!target.closest?.(`#${BADGE_ID}`);
  }

  function isAuthPanelTarget(target) {
    return target instanceof Element && !!target.closest?.(`#${AUTH_PANEL_ID}`);
  }

  function isModalOpen() {
    return document.documentElement.classList.contains("vetboard-send-open");
  }

  function storageGet(keys) {
    return callStorage("get", keys);
  }

  function storageSet(value) {
    return callStorage("set", value);
  }

  function storageRemove(key) {
    return callStorage("remove", key);
  }

  function callStorage(method, value) {
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        const maybePromise = api.storage.local[method](value, (result) => {
          if (settled) return;
          settled = true;
          const error = api.runtime?.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result);
        });

        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then((result) => {
            if (settled) return;
            settled = true;
            resolve(result);
          }).catch((error) => {
            if (settled) return;
            settled = true;
            reject(error);
          });
        }
      } catch (error) {
        if (settled) return;
        settled = true;
        reject(error);
      }
    });
  }

  function injectStyles() {
    if (document.getElementById("vetboard-scheduler-styles")) return;
    const style = document.createElement("style");
    style.id = "vetboard-scheduler-styles";
    style.textContent = `
      .${HOVER_CLASS} {
        outline: 2px solid rgba(16, 185, 129, 0.95) !important;
        outline-offset: 0 !important;
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18) !important;
      }
      #${OVERLAY_ID} {
        position: fixed;
        z-index: 2147483646;
        display: none;
        pointer-events: none;
        border: 2px solid rgba(16, 185, 129, 0.98);
        border-radius: 8px;
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.18);
      }
      #${OVERLAY_ID} > span {
        position: absolute;
        top: -30px;
        left: 0;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(6, 78, 59, 0.96);
        color: #ecfdf5;
        font: 600 12px/1.2 Arial, sans-serif;
        white-space: nowrap;
        letter-spacing: 0.01em;
      }
      #${TOAST_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        transform: translateY(12px);
        opacity: 0;
        transition: opacity 140ms ease, transform 140ms ease;
        padding: 10px 14px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.96);
        color: #f8fafc;
        font: 600 13px/1.35 Arial, sans-serif;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.35);
        pointer-events: none;
      }
      #${TOAST_ID}.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      #${BADGE_ID} {
        position: fixed;
        left: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 999px;
        background: linear-gradient(180deg, #0f766e, #065f46);
        color: #ecfdf5;
        font: 800 14px/1 Arial, sans-serif;
        letter-spacing: 0.04em;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
        cursor: pointer;
      }
      #${BADGE_ID}.is-armed {
        background: linear-gradient(180deg, #34d399, #059669);
        box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.20), 0 18px 40px rgba(15, 23, 42, 0.28);
      }
      #${BADGE_ID}.is-busy {
        background: linear-gradient(180deg, #10b981, #047857);
      }
      #${BADGE_ID}:focus-visible {
        outline: 3px solid rgba(167, 243, 208, 0.85);
        outline-offset: 3px;
      }
      #${AUTH_PANEL_ID} {
        position: fixed;
        left: 18px;
        bottom: 72px;
        z-index: 2147483647;
        width: min(320px, calc(100vw - 24px));
        display: none;
      }
      .vbPanelCard {
        background: #f8fafc;
        color: #0f172a;
        border-radius: 18px;
        box-shadow: 0 26px 70px rgba(15, 23, 42, 0.24);
        border: 1px solid rgba(148, 163, 184, 0.24);
        padding: 16px;
        display: grid;
        gap: 12px;
      }
      .vbPanelHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      #${BACKDROP_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: none;
        pointer-events: none;
      }
      #${MODAL_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        bottom: 16px;
        width: min(440px, calc(100vw - 24px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        z-index: 2147483646;
        display: none;
        font-family: Arial, sans-serif;
      }
      .vbModalCard {
        background: #f8fafc;
        color: #0f172a;
        border-radius: 22px;
        box-shadow: 0 30px 80px rgba(15, 23, 42, 0.28);
        height: 100%;
        box-sizing: border-box;
        padding: 20px;
        display: grid;
        gap: 16px;
        align-content: start;
      }
      .vbModalHeader,
      .vbCardHeader,
      .vbSummaryRow,
      .vbFooter,
      .vbAuthRow,
      .vbToggleRow,
      .vbActions {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
      }
      .vbEyebrow {
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #0f766e;
        font-weight: 700;
      }
      .vbModalHeader h2,
      .vbCardHeader h3 {
        margin: 4px 0 0;
      }
      .vbModalHeader p,
      .vbCardHeader p,
      .vbFooterNote,
      .vbAuthState,
      .vbEmpty,
      .vbLabel {
        color: #475569;
      }
      .vbSummaryRow {
        align-items: stretch;
      }
      .vbSummaryCard,
      .vbCard {
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: white;
        border-radius: 16px;
        padding: 16px;
      }
      .vbSummaryCard {
        flex: 1 1 170px;
      }
      .vbSummaryValue {
        margin-top: 6px;
        font-weight: 700;
        color: #0f172a;
      }
      .vbAuthPill {
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: #115e59;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
      }
      .vbMutedPill {
        background: rgba(148, 163, 184, 0.18);
        color: #334155;
      }
      .vbGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .vbField {
        display: grid;
        gap: 6px;
        font-size: 13px;
        color: #0f172a;
        font-weight: 600;
      }
      .vbFieldFull {
        grid-column: 1 / -1;
      }
      .vbField input,
      .vbField select,
      .vbField textarea {
        width: 100%;
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 12px;
        background: #fff;
        color: #0f172a;
        padding: 11px 12px;
        font: inherit;
        box-sizing: border-box;
      }
      .vbField.is-error input,
      .vbField.is-error select,
      .vbField.is-error textarea {
        border-color: #dc2626;
        box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.18);
        background: rgba(220, 38, 38, 0.04);
      }
      .vbField textarea {
        min-height: 102px;
        resize: vertical;
      }
      .vbBtn {
        border: 1px solid rgba(148, 163, 184, 0.4);
        background: #fff;
        color: #0f172a;
        border-radius: 999px;
        padding: 10px 14px;
        font: 600 13px/1 Arial, sans-serif;
        cursor: pointer;
      }
      .vbBtn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .vbPrimary {
        background: #0f766e;
        color: #ecfeff;
        border-color: #0f766e;
      }
      .vbCheckbox {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: #0f172a;
      }
      .vbEmpty {
        padding: 16px 0 4px;
      }
      .vbFooter {
        align-items: flex-end;
        margin-top: auto;
      }
      .vbFooterNote {
        flex: 1 1 280px;
      }
      @media (max-width: 640px) {
        #${MODAL_ID} {
          top: 8px;
          right: 8px;
          bottom: 8px;
          width: calc(100vw - 16px);
          max-height: calc(100vh - 16px);
        }
        .vbModalCard {
          padding: 16px;
        }
        .vbGrid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.documentElement.appendChild(style);
  }
})();

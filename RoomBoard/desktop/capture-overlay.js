(function () {
  const outline = document.getElementById("outline");
  const label = document.getElementById("label");
  const api = window.roomboardCapture;

  api?.onHover((payload) => {
    const bounds = payload?.overlayBounds;
    if (!bounds) {
      outline.style.display = "none";
      label.style.display = "none";
      return;
    }

    const left = clamp(Number(bounds.left), 0, window.innerWidth - 12);
    const top = clamp(Number(bounds.top), 0, window.innerHeight - 12);
    const width = clamp(Number(bounds.width), 18, window.innerWidth - left);
    const height = clamp(Number(bounds.height), 18, window.innerHeight - top);

    outline.style.display = "block";
    outline.style.left = `${left}px`;
    outline.style.top = `${top}px`;
    outline.style.width = `${width}px`;
    outline.style.height = `${height}px`;

    const labelText = summarize(payload?.text || payload?.name || "Click to capture");
    label.textContent = labelText;
    label.style.display = "block";
    label.style.left = `${left}px`;
    label.style.top = `${Math.max(0, top - 30)}px`;
  });

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  }

  function summarize(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "Click to capture";
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
  }
})();

(function () {
  const grid = document.getElementById("gridTD");
  if (!grid) return console.warn("[wrap+align] #gridTD not found");

  // --- CSS (wrapping) ---
  const styleId = "wrapGridCells_style_gridTD";
  document.getElementById(styleId)?.remove();

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #gridTD .aras-grid-row { height: auto !important; }
    #gridTD td.aras-grid-row-cell {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
      height: auto !important;
      overflow-wrap: anywhere;
      word-break: break-word;
      line-height: 1.2;
    }
    #gridTD td.aras-grid-row-cell span.aras-grid-link,
    #gridTD td.aras-grid-row-cell a,
    #gridTD td.aras-grid-row-cell a.aras-grid-link {
      white-space: normal !important;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
  `;
  document.head.appendChild(style);
  console.log("[wrap+align] wrap CSS injected");

  // --- Helpers ---
  function rect(el) { return el.getBoundingClientRect(); }
  function overlaps(r1, r2) {
    return !(r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top);
  }

  function pickActiveCellOverlay() {
    const gridRect = rect(grid);
    const candidates = Array.from(document.querySelectorAll(".aras-grid-active-cell"));
    if (!candidates.length) return null;

    // Prefer an active-cell element that overlaps the grid and has non-zero size
    let best = null;
    for (const el of candidates) {
      const r = rect(el);
      if (r.width <= 0 || r.height <= 0) continue;
      if (overlaps(gridRect, r)) { best = el; break; }
    }
    return best || candidates[0];
  }

  function alignActiveToTd(td) {
    const active = pickActiveCellOverlay();
    if (!active || !td) return;

    const parent = active.offsetParent || active.parentElement || document.body;

    const tdRect = rect(td);
    const pRect  = rect(parent);

    const left = tdRect.left - pRect.left;
    const top  = tdRect.top  - pRect.top;

    // Most robust: transform-based positioning
    active.style.top = "0px";
    active.style.left = "0px";
    active.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    active.style.width = tdRect.width + "px";
    active.style.height = tdRect.height + "px";
    active.style.pointerEvents = "none";
  }

  // Expose manual align (useful after scrolling while console has focus)
  window.__gridTD_lastTd = null;
  window.__gridTD_alignActive = function () {
    if (!window.__gridTD_lastTd) return console.warn("Click a cell first.");
    alignActiveToTd(window.__gridTD_lastTd);
  };

  // Click handler (scoped)
  if (!grid.__wrapAlignInstalled) {
    grid.__wrapAlignInstalled = true;

    grid.addEventListener("click", function (e) {
      const td = e.target.closest && e.target.closest("td.aras-grid-row-cell");
      if (!td) return;
      window.__gridTD_lastTd = td;

      // Let Aras do its thing first, then correct overlay
      setTimeout(() => alignActiveToTd(td), 0);
      setTimeout(() => alignActiveToTd(td), 50);
    }, true);

    // Re-align on scroll + resize
    grid.querySelectorAll(".aras-grid-scroller").forEach(sc => {
      sc.addEventListener("scroll", () => setTimeout(window.__gridTD_alignActive, 0), { passive: true });
    });
    window.addEventListener("resize", () => setTimeout(window.__gridTD_alignActive, 0));

    console.log("[wrap+align] handlers attached. Click a long-text cell.");
  } else {
    console.log("[wrap+align] already installed");
  }
})();

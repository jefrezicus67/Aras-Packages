function EnableWrappedSearchGrid() {
  // Find the window that actually contains #gridTD
  function findWindowWithGridTD(startWin) {
    try {
      if (startWin && startWin.document && startWin.document.getElementById("gridTD")) return startWin;
    } catch (e) {}

    // Try top Aras window
    try {
      if (window.aras && aras.getMostTopWindowWithAras) {
        var topWnd = aras.getMostTopWindowWithAras(window);
        if (topWnd && topWnd.document && topWnd.document.getElementById("gridTD")) return topWnd;
      }
    } catch (e) {}

    // Try walking frames from current window
    try {
      for (var i = 0; i < startWin.frames.length; i++) {
        var w = startWin.frames[i];
        try {
          if (w && w.document && w.document.getElementById("gridTD")) return w;
        } catch (e2) {}
      }
    } catch (e3) {}

    return null;
  }

  var ctx = findWindowWithGridTD(window);
  if (!ctx) {
    aras.AlertError("Could not find gridTD in this view. Open the Search grid first, then click again.");
    return;
  }

  var doc = ctx.document;
  var grid = doc.getElementById("gridTD");
  if (!grid) {
    aras.AlertError("gridTD not found.");
    return;
  }

  // Avoid double-install
  if (grid.__wrapAlignInstalled) {
    aras.AlertSuccess("Wrap + selection align is already enabled for this tab.");
    return;
  }

  // ---- Selection API shim (prevents Aras errors in some grids) ----
  // Keep this minimal + scoped to the current grid object
  try {
    if (typeof ctx.grid === "object" && ctx.grid === grid) {
      if (typeof ctx.grid.getSelectedId !== "function") ctx.grid.getSelectedId = function () { return null; };
      if (typeof ctx.grid.getSelectedIds !== "function") ctx.grid.getSelectedIds = function () { return []; };
      if (typeof ctx.grid.getSelectedItemIds !== "function") ctx.grid.getSelectedItemIds = function () { return []; };
      if (typeof ctx.grid.getSelectedItemId !== "function") ctx.grid.getSelectedItemId = function () { return null; };
    }
  } catch (eShim) {}

  // ---- Inject wrapping CSS ----
  var styleId = "wrapGridCells_style_gridTD";
  var existing = doc.getElementById(styleId);
  if (existing) existing.parentNode.removeChild(existing);

  var style = doc.createElement("style");
  style.id = styleId;
  style.type = "text/css";
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
  doc.head.appendChild(style);

  // ---- Overlay align helpers ----
  function rect(el) { return el.getBoundingClientRect(); }
  function overlaps(r1, r2) {
    return !(r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top);
  }

  function pickActiveCellOverlay() {
    var gridRect = rect(grid);
    var candidates = Array.prototype.slice.call(doc.querySelectorAll(".aras-grid-active-cell"));
    if (!candidates.length) return null;

    for (var i = 0; i < candidates.length; i++) {
      var r = rect(candidates[i]);
      if (r.width > 0 && r.height > 0 && overlaps(gridRect, r)) return candidates[i];
    }
    return candidates[0];
  }

  function alignActiveToTd(td) {
    var active = pickActiveCellOverlay();
    if (!active || !td) return;

    var parent = active.offsetParent || active.parentElement || doc.body;

    var tdRect = rect(td);
    var pRect = rect(parent);

    var left = tdRect.left - pRect.left;
    var top = tdRect.top - pRect.top;

    active.style.top = "0px";
    active.style.left = "0px";
    active.style.transform = "translate3d(" + left + "px, " + top + "px, 0)";
    active.style.width = tdRect.width + "px";
    active.style.height = tdRect.height + "px";
    active.style.pointerEvents = "none";
  }

  // Save on ctx so user can manually call if needed
  ctx.__gridTD_lastTd = null;
  ctx.__gridTD_alignActive = function () {
    if (!ctx.__gridTD_lastTd) return;
    alignActiveToTd(ctx.__gridTD_lastTd);
  };

  // ---- Wire events ----
  grid.addEventListener("click", function (e) {
    var td = e.target && e.target.closest ? e.target.closest("td.aras-grid-row-cell") : null;
    if (!td) return;

    ctx.__gridTD_lastTd = td;
    ctx.setTimeout(function () { alignActiveToTd(td); }, 0);
    ctx.setTimeout(function () { alignActiveToTd(td); }, 50);
  }, true);

  var scrollers = grid.querySelectorAll(".aras-grid-scroller");
  for (var s = 0; s < scrollers.length; s++) {
    scrollers[s].addEventListener("scroll", function () {
      ctx.setTimeout(ctx.__gridTD_alignActive, 0);
    }, { passive: true });
  }

  ctx.addEventListener("resize", function () {
    ctx.setTimeout(ctx.__gridTD_alignActive, 0);
  });

  grid.__wrapAlignInstalled = true;

  aras.AlertSuccess("Wrapped grid text + selection alignment enabled for this tab.");
}

function EnableWrappedSearchGrid_WithFrozenSync() {
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

    // Try direct child frames
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

  // Avoid double-install per tab
  if (grid.__wrapFrozenSyncInstalled) {
    aras.AlertSuccess("Wrap + selection align + frozen sync already enabled for this tab.");
    return;
  }

  // ---- Selection API shims (prevents Aras errors in some R25 search grids) ----
  try {
    if (ctx.grid === grid) {
      if (typeof ctx.grid.getSelectedId !== "function") ctx.grid.getSelectedId = function () { return null; };
      if (typeof ctx.grid.getSelectedIds !== "function") ctx.grid.getSelectedIds = function () { return []; };
      if (typeof ctx.grid.getSelectedItemIds !== "function") ctx.grid.getSelectedItemIds = function () { return []; };
      if (typeof ctx.grid.getSelectedItemId !== "function") ctx.grid.getSelectedItemId = function () { return null; };
    }
  } catch (eShim) {}

  // ---- Inject wrapping CSS (DO NOT force row height) ----
  var styleId = "wrapGridCells_style_gridTD";
  var existing = doc.getElementById(styleId);
  if (existing) existing.parentNode.removeChild(existing);

  var style = doc.createElement("style");
  style.id = styleId;
  style.type = "text/css";
  style.textContent = `
    /* Wrap long text in cell content (leave row height to Aras) */
    #gridTD td.aras-grid-row-cell {
      white-space: normal !important;
      text-overflow: clip !important;
      overflow: visible !important;

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
      text-overflow: clip !important;
    }
  `;
  doc.head.appendChild(style);

  // ---- Active-cell overlay alignment ----
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

  // ---- Frozen pane row height sync (copy from main to frozen) ----
  function syncFrozenRowHeights() {
    var frozenBoundary = grid.querySelector(".aras-grid-body-boundary.aras-grid-body-boundary_frozen");
    if (!frozenBoundary) return;

    var boundaries = Array.prototype.slice.call(grid.querySelectorAll(".aras-grid-body-boundary"));
    var mainBoundary = boundaries.find(function (b) {
      return !b.classList.contains("aras-grid-body-boundary_frozen");
    });
    if (!mainBoundary) return;

    var frozenRows = frozenBoundary.querySelectorAll(".aras-grid-row");
    var mainRows = mainBoundary.querySelectorAll(".aras-grid-row");
    var n = Math.min(frozenRows.length, mainRows.length);
    if (!n) return;

    for (var i = 0; i < n; i++) {
      var mr = mainRows[i];
      var fr = frozenRows[i];

      var mh = mr.getBoundingClientRect().height;
      var fh = fr.getBoundingClientRect().height;
      var h = Math.max(mh, fh);

      mr.style.height = h + "px";
      fr.style.height = h + "px";
    }
  }

  // Expose manual helpers (useful while testing)
  ctx.__gridTD_lastTd = null;
  ctx.__gridTD_alignActive = function () {
    if (ctx.__gridTD_lastTd) alignActiveToTd(ctx.__gridTD_lastTd);
  };
  ctx.__gridTD_syncFrozen = function () { syncFrozenRowHeights(); };

  function postLayout(tdOrNull) {
    if (tdOrNull) alignActiveToTd(tdOrNull);
    syncFrozenRowHeights();
  }

  // ---- Wire events ----
  grid.addEventListener("click", function (e) {
    var td = e.target && e.target.closest ? e.target.closest("td.aras-grid-row-cell") : null;
    if (!td) return;

    ctx.__gridTD_lastTd = td;

    // Let Aras update, then we correct
    ctx.setTimeout(function () { postLayout(td); }, 0);
    ctx.setTimeout(function () { postLayout(td); }, 50);
  }, true);

  var scrollers = grid.querySelectorAll(".aras-grid-scroller");
  for (var s = 0; s < scrollers.length; s++) {
    scrollers[s].addEventListener("scroll", function () {
      ctx.setTimeout(function () { postLayout(ctx.__gridTD_lastTd); }, 0);
    }, { passive: true });
  }

  ctx.addEventListener("resize", function () {
    ctx.setTimeout(function () { postLayout(ctx.__gridTD_lastTd); }, 0);
  });

  // Initial sync pass (in case grid already rendered rows)
  ctx.setTimeout(function () { postLayout(null); }, 0);
  ctx.setTimeout(function () { postLayout(null); }, 50);

  grid.__wrapFrozenSyncInstalled = true;

  aras.AlertSuccess("Enabled: wrap text + active-cell align + frozen row height sync (this tab).");
}

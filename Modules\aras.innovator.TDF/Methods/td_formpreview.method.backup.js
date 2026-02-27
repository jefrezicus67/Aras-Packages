// td_formpreview - CUI InitHandler for tp_Block SearchView separator
// Preview approach: reuse LinkEditorDialog view in read-only mode inside an iframe.

if (!options || options.itemTypeName !== "tp_Block") {
	return {};
}

setTimeout(function () {
	try {
		initPreviewPane();
	} catch (e) {
		console.error("td_formpreview: initialization error", e);
	}
}, 300);

var DEBUG = true;

function logDebug(message, data) {
	if (!DEBUG) {
		return;
	}
	try {
		if (typeof data !== "undefined") {
			console.log("td_formpreview:", message, data);
		} else {
			console.log("td_formpreview:", message);
		}
	} catch (e) {}
}

function initPreviewPane() {
	var gridTable = document.getElementById("grid_table");
	var gridContainer = document.getElementById("grid_container");
	if (!gridTable || !gridContainer) {
		console.warn("td_formpreview: grid nodes were not found");
		return;
	}

	if (document.getElementById("tdPreviewPane")) {
		return;
	}

	var hWrapper = document.createElement("div");
	hWrapper.id = "tdHorizontalWrapper";
	hWrapper.style.cssText =
		"display:flex;flex-direction:row;flex:1;min-height:0;overflow:hidden;";

	gridTable.insertBefore(hWrapper, gridContainer);
	hWrapper.appendChild(gridContainer);

	gridContainer.style.flex = "1";
	gridContainer.style.minWidth = "0";
	gridContainer.style.overflow = "hidden";

	var splitter = document.createElement("div");
	splitter.id = "tdPreviewSplitter";
	splitter.style.cssText =
		"width:6px;cursor:ew-resize;background-color:#eee;flex-shrink:0;display:flex;align-items:center;justify-content:center;";
	splitter.innerHTML =
		'<div style="width:3px;height:96px;border-radius:2px;background-color:#999;"></div>';
	splitter.onmouseenter = function () {
		this.style.backgroundColor = "#ddd";
	};
	splitter.onmouseleave = function () {
		this.style.backgroundColor = "#eee";
	};
	hWrapper.appendChild(splitter);

	var previewPane = document.createElement("div");
	previewPane.id = "tdPreviewPane";
	previewPane.style.cssText =
		"width:45%;min-width:320px;flex-shrink:0;overflow:hidden;border-left:1px solid #c0c0c0;display:flex;flex-direction:column;background:#fff;";
	hWrapper.appendChild(previewPane);

	setupSplitter(splitter, previewPane, hWrapper);

	var status = document.createElement("div");
	status.id = "tdPreviewStatus";
	status.style.cssText =
		"display:flex;align-items:center;justify-content:center;height:100%;color:#666;font:12px Tahoma, sans-serif;";
	status.textContent = "Select a document to preview";
	previewPane.appendChild(status);

	var previewIframe = document.createElement("iframe");
	previewIframe.id = "tdPreviewIframe";
	previewIframe.frameBorder = "0";
	previewIframe.style.cssText = "width:100%;height:100%;border:none;display:none;";
	previewPane.appendChild(previewIframe);

	hWrapper._tdPreviewIframe = previewIframe;
	hWrapper._tdPreviewStatus = status;
	hWrapper._tdPreviewState = {
		currentItemId: null,
		currentUrl: null,
		isLoading: false,
		lastProbeText: null,
		lastSelectionSignature: null
	};

	hookGridSelection(hWrapper, gridContainer);
}

function setupSplitter(splitter, previewPane, container) {
	var startX = 0;
	var startWidth = 0;
	var dragShield = null;

	splitter.addEventListener("mousedown", function (e) {
		startX = e.clientX;
		startWidth = previewPane.offsetWidth;
		e.preventDefault();
		var previewIframe = previewPane.querySelector("#tdPreviewIframe");

		// Prevent iframe from stealing pointer events while dragging.
		if (previewIframe) {
			previewIframe.style.pointerEvents = "none";
		}

		dragShield = document.createElement("div");
		dragShield.style.cssText =
			"position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;cursor:ew-resize;background:transparent;";
		document.body.appendChild(dragShield);

		var onMouseMove = function (evt) {
			var diff = startX - evt.clientX;
			var newWidth = Math.max(
				320,
				Math.min(startWidth + diff, container.offsetWidth - 360)
			);
			previewPane.style.width = newWidth + "px";
		};

		var onMouseUp = function () {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			window.removeEventListener("blur", onMouseUp);
			if (dragShield && dragShield.parentNode) {
				dragShield.parentNode.removeChild(dragShield);
			}
			dragShield = null;
			if (previewIframe) {
				previewIframe.style.pointerEvents = "";
			}
			splitter.querySelector("div").style.backgroundColor = "#999";
		};

		splitter.querySelector("div").style.backgroundColor = "#fff";
		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
		window.addEventListener("blur", onMouseUp);
	});
}

function hookGridSelection(hWrapper, gridContainer) {
	var state = hWrapper._tdPreviewState;
	var status = hWrapper._tdPreviewStatus;
	var iframe = hWrapper._tdPreviewIframe;

	function handleSelection(selection) {
		var ids = selection.ids;
		var sig = selection.source + "|" + ids.join(",");
		if (sig === state.lastSelectionSignature) {
			return;
		}
		state.lastSelectionSignature = sig;

		if (!ids.length) {
			showStatus(status, state, "Waiting for grid selection...", "#666");
			return;
		}

		if (ids.length > 1) {
			state.currentItemId = null;
			iframe.style.display = "none";
			showStatus(
				status,
				state,
				"Please select only one Technical Document to preview.",
				"#cc0000"
			);
			logDebug("multiple selection detected", selection);
			return;
		}

		var selectedId = ids[0];
		if (selectedId === state.currentItemId) {
			return;
		}

		logDebug("selection detected", selection);
		state.currentItemId = selectedId;
		loadPreview(hWrapper, selectedId);
	}

	function evaluateSelection() {
		try {
			handleSelection(getSelectionState(gridContainer));
		} catch (e) {
			console.warn("td_formpreview: selection hook failed", e);
		}
	}

	function scheduleSelectionRead(delay) {
		setTimeout(evaluateSelection, delay);
	}

	var interval = setInterval(function () {
		evaluateSelection();
	}, 500);

	["click", "mouseup", "keyup", "keydown", "change"].forEach(function (eventName) {
		gridContainer.addEventListener(
			eventName,
			function () {
				scheduleSelectionRead(30);
				scheduleSelectionRead(140);
			},
			true
		);
	});

	var observer = new MutationObserver(function () {
		if (!document.body.contains(hWrapper)) {
			clearInterval(interval);
			observer.disconnect();
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
}

function showStatus(statusNode, state, text, color) {
	if (!statusNode) {
		return;
	}
	var key = text + "|" + color;
	if (state.lastProbeText === key) {
		return;
	}
	state.lastProbeText = key;
	statusNode.style.display = "flex";
	statusNode.style.color = color || "#666";
	statusNode.textContent = text;
}

function getSelectionState(gridContainer) {
	// 1) Legacy SearchGrid API (same path used by VC_GetSelectedItems)
	var legacyIds = getSelectedIdsFromLegacyApis();
	if (legacyIds.length) {
		return { ids: legacyIds, source: "main.work.gridApplet.getSelectedItemIds" };
	}

	// 2) Web component APIs / DOM fallbacks
	var gridEl = gridContainer.querySelector("aras-grid");
	if (!gridEl) {
		return { ids: [], source: "no-grid-element" };
	}

	var primaryGrid = gridEl._grid || gridEl.grid || null;
	var modelIds = resolveIdsFromGrid(primaryGrid);
	if (modelIds.length) {
		return { ids: modelIds, source: "grid-model" };
	}

	var selectedRows = gridEl.querySelectorAll(
		".aras-grid-row_selected, .aras-grid-row--selected, tr.selected, [class*=selected]"
	);
	if (selectedRows && selectedRows.length) {
		var domIds = [];
		var i;
		for (i = 0; i < selectedRows.length; i++) {
			var row = selectedRows[i];
			var rowId =
				row.getAttribute("data-id") ||
				row.getAttribute("data-item-id") ||
				row.getAttribute("data-itemid") ||
				row.getAttribute("data-config-id") ||
				row.getAttribute("data-key") ||
				row.id ||
				null;
			var parsed = normalizeItemId(rowId);
			if (parsed) {
				domIds.push(parsed);
			}
		}
		domIds = uniqueIds(domIds);
		if (domIds.length) {
			return { ids: domIds, source: "dom-selected-rows" };
		}
	}

	return { ids: [], source: "none" };
}

function getSelectedIdsFromLegacyApis() {
	var ids = [];
	var wins = getCandidateWindows();
	var i;

	for (i = 0; i < wins.length; i++) {
		ids = ids.concat(extractSelectedIdsFromWindow(wins[i]));
	}

	ids = uniqueIds(ids);
	if (ids.length) {
		logDebug("legacy API selection", { ids: ids, checkedWindows: wins.length });
	}
	return ids;
}

function getCandidateWindows() {
	var wins = [];
	function add(win) {
		if (!win) {
			return;
		}
		var i;
		for (i = 0; i < wins.length; i++) {
			if (wins[i] === win) {
				return;
			}
		}
		wins.push(win);
	}

	try {
		add(window);
		add(window.parent);
		add(window.top);
	} catch (e) {}

	try {
		if (aras && typeof aras.getMainWindow === "function") {
			add(aras.getMainWindow());
		}
	} catch (e) {}

	try {
		if (aras && typeof aras.getMostTopWindowWithAras === "function") {
			add(aras.getMostTopWindowWithAras(window));
		}
	} catch (e) {}

	return wins;
}

function extractSelectedIdsFromWindow(win) {
	var ids = [];
	if (!win) {
		return ids;
	}

	var gridHosts = [];
	try {
		if (win.main && win.main.work && win.main.work.gridApplet) {
			gridHosts.push(win.main.work.gridApplet);
		}
	} catch (e) {}
	try {
		if (win.work && win.work.gridApplet) {
			gridHosts.push(win.work.gridApplet);
		}
	} catch (e) {}
	try {
		if (win.gridApplet) {
			gridHosts.push(win.gridApplet);
		}
	} catch (e) {}
	try {
		if (win.main && win.main.gridApplet) {
			gridHosts.push(win.main.gridApplet);
		}
	} catch (e) {}

	var i;
	for (i = 0; i < gridHosts.length; i++) {
		var host = gridHosts[i];
		try {
			if (host && typeof host.getSelectedItemIds === "function") {
				ids = ids.concat(parseIdsFlexible(host.getSelectedItemIds(",")));
				ids = ids.concat(parseIdsFlexible(host.getSelectedItemIds(";")));
			}
		} catch (e) {}
	}

	return uniqueIds(ids);
}

function resolveIdsFromGrid(grid) {
	var foundIds = [];
	if (!grid) {
		return foundIds;
	}

	try {
		if (typeof grid.getSelectedId === "function") {
			foundIds = foundIds.concat(normalizeIdArray([grid.getSelectedId()]));
		}
	} catch (e) {}

	try {
		if (typeof grid.getSelectedItemIds === "function") {
			var rawIds = grid.getSelectedItemIds();
			var arr = typeof rawIds === "string" ? rawIds.split(",") : rawIds;
			foundIds = foundIds.concat(normalizeIdArray(arr));
		}
	} catch (e) {}

	var rowTokens = null;
	try {
		if (grid.settings && grid.settings.selectedRows) {
			rowTokens = Array.from(grid.settings.selectedRows);
		}
	} catch (e) {}

	if (!rowTokens || !rowTokens.length) {
		return uniqueIds(foundIds);
	}

	var i;
	for (i = 0; i < rowTokens.length; i++) {
		var resolved = resolveTokenToItemId(grid, rowTokens[i]);
		if (resolved) {
			foundIds.push(resolved.id);
		}
	}

	return uniqueIds(foundIds);
}

function resolveTokenToItemId(grid, token) {
	var direct = normalizeItemId(token);
	if (direct) {
		return { id: direct, source: "selectedRows-token", raw: token };
	}

	var index =
		typeof token === "number"
			? token
			: typeof token === "string" && /^[0-9]+$/.test(token)
				? parseInt(token, 10)
				: NaN;
	if (isNaN(index)) {
		return null;
	}

	var candidates = [];
	try {
		if (typeof grid.getItemByIndex === "function") {
			candidates.push(grid.getItemByIndex(index));
		}
	} catch (e) {}
	try {
		if (typeof grid.getItem === "function") {
			candidates.push(grid.getItem(index));
		}
	} catch (e) {}
	try {
		if (grid.data && grid.data[index]) {
			candidates.push(grid.data[index]);
		}
	} catch (e) {}
	try {
		if (grid._data && grid._data[index]) {
			candidates.push(grid._data[index]);
		}
	} catch (e) {}

	var j;
	for (j = 0; j < candidates.length; j++) {
		var id = extractIdFromObject(candidates[j]);
		if (id) {
			return { id: id, source: "row-index-resolve", raw: token };
		}
	}

	return null;
}

function extractIdFromObject(obj) {
	if (!obj) {
		return null;
	}

	if (typeof obj.getAttribute === "function") {
		var attrId = normalizeItemId(obj.getAttribute("id"));
		if (attrId) {
			return attrId;
		}
		var attrCfg = normalizeItemId(obj.getAttribute("config_id"));
		if (attrCfg) {
			return attrCfg;
		}
	}

	var keys = ["id", "itemID", "itemId", "config_id", "configId", "_id"];
	var i;
	for (i = 0; i < keys.length; i++) {
		try {
			var val = normalizeItemId(obj[keys[i]]);
			if (val) {
				return val;
			}
		} catch (e) {}
	}

	return null;
}

function normalizeItemId(value) {
	if (!value) {
		return null;
	}
	var str = String(value).trim();
	var match = str.match(/[A-Fa-f0-9]{32}/);
	return match ? match[0].toUpperCase() : null;
}

function normalizeIdArray(arr) {
	var out = [];
	if (!arr || !arr.length) {
		return out;
	}
	var i;
	for (i = 0; i < arr.length; i++) {
		var id = normalizeItemId(arr[i]);
		if (id) {
			out.push(id);
		}
	}
	return uniqueIds(out);
}

function parseIdsFlexible(rawValue) {
	if (!rawValue) {
		return [];
	}

	var out = [];
	var texts = [];
	if (typeof rawValue === "string") {
		texts.push(rawValue);
	} else if (Array.isArray(rawValue)) {
		var i;
		for (i = 0; i < rawValue.length; i++) {
			texts.push(String(rawValue[i]));
		}
	} else {
		texts.push(String(rawValue));
	}

	var j;
	for (j = 0; j < texts.length; j++) {
		var matches = texts[j].match(/[A-Fa-f0-9]{32}/g) || [];
		var k;
		for (k = 0; k < matches.length; k++) {
			out.push(matches[k].toUpperCase());
		}
	}

	return uniqueIds(out);
}

function uniqueIds(ids) {
	var out = [];
	var map = {};
	var i;
	for (i = 0; i < ids.length; i++) {
		var id = ids[i];
		if (!id || map[id]) {
			continue;
		}
		map[id] = true;
		out.push(id);
	}
	return out;
}

function loadPreview(hWrapper, itemId) {
	var iframe = hWrapper._tdPreviewIframe;
	var status = hWrapper._tdPreviewStatus;
	var state = hWrapper._tdPreviewState;

	if (state.isLoading) {
		return;
	}

	var item = aras.getItemById("tp_Block", itemId, 0);
	if (!item) {
		status.style.display = "flex";
		status.style.color = "#cc0000";
		status.textContent = "Could not load selected document (id: " + itemId + ").";
		logDebug("aras.getItemById returned null", itemId);
		iframe.style.display = "none";
		return;
	}

	status.style.display = "flex";
	status.style.color = "#666";
	status.textContent = "Loading preview...";
	iframe.style.display = "none";
	state.isLoading = true;

	var baseUrl = aras.getBaseURL();
	var candidates = [
		baseUrl + "/Modules/aras.innovator.TDF/LinkEditorDialog?viewonly=1",
		baseUrl + "/Modules/aras.innovator.TDF/LinkEditorDialog.cshtml?viewonly=1"
	];

	var dialogArguments = buildDialogArguments(item, itemId);
	iframe.dialogArguments = dialogArguments;
	logDebug("loading preview for item", {
		itemId: itemId,
		name: safeGetItemProperty(item, "name"),
		candidates: candidates
	});

	tryLoadCandidate(0);

	function tryLoadCandidate(index) {
		if (index >= candidates.length) {
			state.isLoading = false;
			status.style.display = "flex";
			status.style.color = "#cc0000";
			status.textContent =
				"Preview view failed to load. Check LinkEditor route and view resources.";
			iframe.style.display = "none";
			return;
		}

		var url = candidates[index] + "&_ts=" + Date.now();
		state.currentUrl = url;
		iframe.dialogArguments = dialogArguments;

		iframe.onload = function () {
			try {
				var child = iframe.contentWindow;
				var ok = !!(child && child.viewController);
				if (!ok) {
					logDebug("iframe loaded but no viewController, trying next route", {
						index: index,
						url: url
					});
					tryLoadCandidate(index + 1);
					return;
				}

				state.isLoading = false;
				status.style.display = "none";
				iframe.style.display = "block";
				logDebug("preview loaded", {
					itemId: itemId,
					url: url
				});
			} catch (e) {
				logDebug("iframe onload exception, trying next route", e);
				tryLoadCandidate(index + 1);
			}
		};

		iframe.onerror = function () {
			logDebug("iframe route failed", url);
			tryLoadCandidate(index + 1);
		};

		iframe.src = url;
	}
}

function safeGetItemProperty(item, propertyName) {
	try {
		return aras.getItemProperty(item, propertyName) || "";
	} catch (e) {
		return "";
	}
}

function buildDialogArguments(item, itemId) {
	var lang = "en";
	try {
		lang = aras.getSessionContextLanguageCode() || "en";
	} catch (e) {}

	var mainWindow = aras.getMainWindow ? aras.getMainWindow() : window.top;
	var tdfSettings =
		(mainWindow && (mainWindow.tdfSettings || (mainWindow.TDF && mainWindow.TDF.settings))) ||
		{};

	var itemTypeSettings = null;
	try {
		if (
			mainWindow &&
			mainWindow.viewController &&
			mainWindow.viewController.container &&
			mainWindow.viewController.container.dlgArguments
		) {
			itemTypeSettings =
				mainWindow.viewController.container.dlgArguments.itemTypeSettings || null;
		}
	} catch (e) {}

	var fakeDialogNode = createPreviewDialogNode();

	return {
		aras: aras,
		title: "Preview",
		thisItem: item,
		tdfSettings: tdfSettings,
		itemTypeSettings: itemTypeSettings,
		linkData: {
			elementId: "",
			blockId: itemId,
			url: "",
			type: "preview"
		},
		lang: lang,
		dialog: {
			dialogNode: fakeDialogNode,
			close: function () {
				return function () {};
			}
		}
	};
}

function createPreviewDialogNode() {
	var wrapper = document.createElement("div");
	var titleBar = document.createElement("div");
	titleBar.className = "aras-dialog__title-bar";
	var title = document.createElement("div");
	title.className = "aras-dialog__title";
	title.textContent = "Preview";
	titleBar.appendChild(title);
	wrapper.appendChild(titleBar);
	return wrapper;
}

return {};

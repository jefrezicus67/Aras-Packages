// td_formpreview - CUI InitHandler for TDF-backed SearchView previews
// Preview approach: reuse LinkEditorDialog view in read-only mode inside an iframe.

var SUPPORTED_ITEM_TYPES = {
	tp_Block: true,
	re_Requirement: true,
	re_Requirement_Document: true
};

function resolveSupportedItemType(itemTypeName) {
	if (!itemTypeName) {
		return null;
	}
	if (SUPPORTED_ITEM_TYPES[itemTypeName]) {
		return itemTypeName;
	}

	var normalized = String(itemTypeName).toLowerCase();
	var keys = Object.keys(SUPPORTED_ITEM_TYPES);
	for (var i = 0; i < keys.length; i++) {
		if (keys[i].toLowerCase() === normalized) {
			return keys[i];
		}
	}
	return null;
}

var currentItemType = resolveCurrentItemType();

if (!currentItemType) {
	return {};
}

setTimeout(function () {
	try {
		initPreviewPane();
	} catch (e) {
		console.error("td_formpreview: initialization error", e);
	}
}, 300);

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
		itemTypeName: currentItemType,
		currentItemId: null,
		isLoading: false,
		lastProbeText: null,
		lastSelectionSignature: null
	};

	hookGridSelection(hWrapper, gridContainer);
}

function resolveCurrentItemType() {
	var i;
	var candidates = [];

	if (options) {
		candidates.push(options.itemTypeName);
		candidates.push(options.itemType);
	}

	var detectedFromWindow = detectItemTypeFromWindow();
	if (detectedFromWindow) {
		candidates.push(detectedFromWindow);
	}

	for (i = 0; i < candidates.length; i++) {
		var resolved = resolveSupportedItemType(candidates[i]);
		if (resolved) {
			return resolved;
		}
	}

	return null;
}

function detectItemTypeFromWindow() {
	var names = [];
	var wins = getCandidateWindows();
	var i;

	for (i = 0; i < wins.length; i++) {
		var win = wins[i];
		if (!win) {
			continue;
		}

		try {
			if (win.itemTypeName) {
				names.push(win.itemTypeName);
			}
		} catch (e) {}

		try {
			if (win.thisItem && typeof win.thisItem.getType === "function") {
				names.push(win.thisItem.getType());
			}
		} catch (e) {}

		try {
			if (win.location && win.location.search) {
				var fromQuery = getQueryParam(win.location.search, "itemtypeName");
				if (fromQuery) {
					names.push(fromQuery);
				}
			}
		} catch (e) {}
	}

	for (i = 0; i < names.length; i++) {
		if (names[i]) {
			return names[i];
		}
	}

	return null;
}

function getQueryParam(searchText, paramName) {
	if (!searchText || !paramName) {
		return null;
	}

	var normalized = searchText.charAt(0) === "?" ? searchText.substring(1) : searchText;
	if (!normalized) {
		return null;
	}

	var pairs = normalized.split("&");
	var i;
	for (i = 0; i < pairs.length; i++) {
		var token = pairs[i].split("=");
		if (decodeURIComponent(token[0] || "") !== paramName) {
			continue;
		}
		return decodeURIComponent((token[1] || "").replace(/\+/g, " "));
	}

	return null;
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
				"Please select only one item to preview.",
				"#cc0000"
			);
			return;
		}

		var selectedId = ids[0];
		if (selectedId === state.currentItemId) {
			return;
		}

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
	var itemTypeName = state.itemTypeName || (options && options.itemTypeName);

	if (state.isLoading) {
		return;
	}

	var selectedItem = aras.getItemById(itemTypeName, itemId, 0);
	if (!selectedItem) {
		status.style.display = "flex";
		status.style.color = "#cc0000";
		status.textContent =
			"Could not load selected item (" + itemTypeName + ", id: " + itemId + ").";
		iframe.style.display = "none";
		return;
	}

	var previewItem = selectedItem;
	if (itemTypeName === "re_Requirement") {
		var parentRequirementDoc = resolveRequirementDocumentItem(itemId);
		if (parentRequirementDoc) {
			previewItem = parentRequirementDoc;
		} else {
			previewItem = prepareStandaloneRequirementPreviewItem(selectedItem);
		}
	}

	status.style.display = "flex";
	status.style.color = "#666";
	status.textContent = "Loading preview...";
	iframe.style.display = "none";
	state.isLoading = true;

	var candidates = buildLinkEditorCandidates();

	var dialogArguments = buildDialogArguments(previewItem, itemId, itemTypeName);
	iframe.dialogArguments = dialogArguments;

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
		iframe.dialogArguments = dialogArguments;

		iframe.onload = function () {
			try {
				var child = iframe.contentWindow;
				var ok = !!(child && child.viewController);
				if (!ok) {
					tryLoadCandidate(index + 1);
					return;
				}

				state.isLoading = false;
				status.style.display = "none";
				iframe.style.display = "block";
			} catch (e) {
				tryLoadCandidate(index + 1);
			}
		};

		iframe.onerror = function () {
			tryLoadCandidate(index + 1);
		};

		iframe.src = url;
	}
}

function buildLinkEditorCandidates() {
	var baseUrl = "";
	try {
		baseUrl = aras.getBaseURL() || "";
	} catch (e) {}

	var origin = "";
	try {
		origin = window.location.origin || "";
	} catch (e) {}

	var roots = [];
	addRoot(baseUrl);
	addRoot(origin + baseUrl);
	addRoot(baseUrl.replace(/\/Server(?=\/|$)/i, "/Client"));
	addRoot((origin + baseUrl).replace(/\/Server(?=\/|$)/i, "/Client"));
	addRoot(origin + "/Client");
	addRoot(origin);

	var out = [];
	var i;
	for (i = 0; i < roots.length; i++) {
		var root = roots[i];
		if (!root) {
			continue;
		}
		// R25-first: route without query string.
		pushUnique(out, root + "/Modules/aras.innovator.TDF/LinkEditorDialog");
		// Then try same route in explicit view-only mode.
		pushUnique(out, root + "/Modules/aras.innovator.TDF/LinkEditorDialog?viewonly=1");
		// Legacy fallback (some environments resolve without /Client prefix)
		pushUnique(
			out,
			root.replace(/\/Client(?=\/|$)/i, "") +
				"/Modules/aras.innovator.TDF/LinkEditorDialog"
		);
		pushUnique(
			out,
			root.replace(/\/Client(?=\/|$)/i, "") +
				"/Modules/aras.innovator.TDF/LinkEditorDialog?viewonly=1"
		);
		// Last-resort fallback for environments exposing direct view files
		pushUnique(
			out,
			root + "/Modules/aras.innovator.TDF/LinkEditorDialog.cshtml?viewonly=1"
		);
	}

	return out;

	function addRoot(value) {
		if (!value) {
			return;
		}
		var normalized = String(value).replace(/\/+$/, "");
		if (!normalized) {
			return;
		}
		pushUnique(roots, normalized);
	}
}

function pushUnique(arr, value) {
	var normalized = String(value).replace(/([^:]\/)\/+/g, "$1");
	var i;
	for (i = 0; i < arr.length; i++) {
		if (arr[i] === normalized) {
			return;
		}
	}
	arr.push(normalized);
}

function resolveRequirementDocumentItem(requirementId) {
	var sourceId = null;

	// Prefer primary requirement-document content relation.
	sourceId = findSourceIdByRelationship(
		"re_Req_Doc_Content",
		requirementId
	);

	// Fallback used in some requirements deployments.
	if (!sourceId) {
		sourceId = findSourceIdByRelationship(
			"re_ReqDocBlockReference",
			requirementId
		);
	}

	if (!sourceId) {
		return null;
	}

	return aras.getItemById("re_Requirement_Document", sourceId, 0) || null;
}

function prepareStandaloneRequirementPreviewItem(requirementItem) {
	if (!requirementItem) {
		return requirementItem;
	}

	var schemaId = resolveRequirementSchemaId(requirementItem);
	if (!schemaId || typeof requirementItem.setProperty !== "function") {
		return requirementItem;
	}

	// re_Requirement uses req_document_type as schema reference (see tdf_ItemTypeSettings).
	// In SearchView preview this hidden property may be absent, so inject it at runtime.
	requirementItem.setProperty("req_document_type", schemaId);
	// Compatibility fallback: some TDF flows still read xml_schema directly.
	requirementItem.setProperty("xml_schema", schemaId);
	return requirementItem;
}

function resolveRequirementSchemaId(requirementItem) {
	var fromItem = null;
	try {
		if (requirementItem && typeof requirementItem.getProperty === "function") {
			fromItem = normalizeItemId(requirementItem.getProperty("req_document_type"));
			if (!fromItem) {
				fromItem = normalizeItemId(requirementItem.getProperty("xml_schema"));
			}
		}
	} catch (e) {}
	if (fromItem) {
		return fromItem;
	}

	var schemaId = null;
	var nameCandidates = ["RE-Standard", "RE Standard", "re_Standard"];
	var i;
	for (i = 0; i < nameCandidates.length; i++) {
		schemaId = findXmlSchemaIdByName(nameCandidates[i]);
		if (schemaId) {
			return schemaId;
		}
	}

	return null;
}

function findXmlSchemaIdByName(schemaName) {
	try {
		if (!aras || typeof aras.newIOMItem !== "function") {
			return null;
		}

		var schemaQuery = aras.newIOMItem("tp_XmlSchema", "get");
		schemaQuery.setAttribute("select", "id,name,is_current");
		schemaQuery.setProperty("name", schemaName);
		var schemaResult = schemaQuery.apply();

		if (!schemaResult || schemaResult.isError && schemaResult.isError()) {
			return null;
		}

		if (
			typeof schemaResult.getItemCount === "function" &&
			schemaResult.getItemCount() > 0
		) {
			var schemaItem = schemaResult.getItemByIndex(0);
			return normalizeItemId(schemaItem && schemaItem.getID && schemaItem.getID());
		}
	} catch (e) {}

	return null;
}

function findSourceIdByRelationship(relationshipTypeName, relatedId) {
	try {
		if (!aras || typeof aras.newIOMItem !== "function") {
			return null;
		}

		var relQuery = aras.newIOMItem(relationshipTypeName, "get");
		relQuery.setAttribute("select", "source_id");
		relQuery.setProperty("related_id", relatedId);
		var relResult = relQuery.apply();

		if (!relResult || relResult.isError && relResult.isError()) {
			return null;
		}

		if (typeof relResult.getItemCount === "function" && relResult.getItemCount() > 0) {
			var relItem = relResult.getItemByIndex(0);
			var sourceId = normalizeItemId(relItem && relItem.getProperty("source_id"));
			if (sourceId) {
				return sourceId;
			}
		}
	} catch (e) {}

	return null;
}

function buildDialogArguments(item, itemId, itemTypeName) {
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
		title: "Preview - " + itemTypeName,
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

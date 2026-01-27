//Convert selected text, lists, and tables into a Requirement from a Tech Doc
// Complete workflow: Copy elements, create Requirement, update content, refresh
// ES5 version: no async/await, no const/let, no template literals, no optional chaining, no includes, no forEach, no repeat
(function () {
  function log() {
    if (window.console && console.log) console.log.apply(console, arguments);
  }
  function warn() {
    if (window.console && console.warn) console.warn.apply(console, arguments);
  }
  function err() {
    if (window.console && console.error) console.error.apply(console, arguments);
  }

  // Minimal thenable adapter:
  // - if executeAction returns a Promise, we use it
  // - if it returns a value, we wrap it
  function asThenable(v) {
    if (v && typeof v.then === "function") return v;
    return {
      then: function (resolve) {
        resolve(v);
        return { then: function () {} };
      }
    };
  }

  function safeNodeText(node) {
    if (!node) return "";
    if (typeof node.text !== "undefined" && node.text !== null) return node.text;
    if (typeof node.textContent !== "undefined" && node.textContent !== null) return node.textContent;
    return "";
  }

  function repeatStr(s, n) {
    var out = "";
    for (var i = 0; i < n; i++) out += s;
    return out;
  }

  function generateGuid() {
    // Note: original removed dashes; keeping same behavior
    var g = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = (c === "x") ? r : ((r & 0x3) | 0x8);
      return v.toString(16).toUpperCase();
    });
    return g.replace(/-/g, "");
  }

  try {
    var viewmodel = window.viewController.viewContext.data.structuredDocument;
    var actionsHelper = viewmodel.ActionsHelper();
    var clipboard = viewmodel.Clipboard();
    var aras = window.aras || top.aras;

    log("=== Creating Requirement from Selected Elements ===\n");

    // Get selected elements
    var selectedItems = viewmodel.GetSelectedItems();

    if (!selectedItems || selectedItems.length === 0) {
      err("❌ No elements selected");
      return;
    }

    log("Selected " + selectedItems.length + " element(s):");
    for (var si = 0; si < selectedItems.length; si++) {
      log("  [" + (si + 1) + "] " + selectedItems[si].nodeName);
    }

    // STEP 1: Copy to clipboard
    log("\n[1/6] Copying to clipboard...");
    actionsHelper.executeAction("copyelement", {
      selectedItems: selectedItems,
      clipboard: clipboard
    });

    var clipboardData = clipboard.getData("StructureXml");
    var copiedCount = (clipboardData && clipboardData.content) ? clipboardData.content.length : 0;
    log("✅ Copied " + copiedCount + " elements");

    // STEP 2: Build content template
    log("\n[2/6] Building requirement content...");

    // Build content template (string concatenation instead of template literals)
    var requirementXmlTemplate =
      '<Requirement xmlns:aras="http://aras.com/ArasTechDoc" xmlns="http://www.aras.com/REStandard" aras:id="' +
      generateGuid() + '" reqId="{{REQ_ID}}">';

    requirementXmlTemplate += '<Requirement-Info aras:id="' + generateGuid() + '">';
    requirementXmlTemplate += '<Requirement-Chapter aras:id="' + generateGuid() + '"><aras:emph emphtype="text"></aras:emph></Requirement-Chapter>';
    requirementXmlTemplate += '<Requirement-Title aras:id="' + generateGuid() + '"><aras:emph emphtype="text">{{REQ_NUMBER}}</aras:emph></Requirement-Title>';
    requirementXmlTemplate += '<Requirement-Number aras:id="' + generateGuid() + '"><aras:emph emphtype="text">{{REQ_NUMBER}}</aras:emph></Requirement-Number>';
    requirementXmlTemplate += "</Requirement-Info>";

    // Add copied content
    var includedCount = 0;
    var skippedGraphics = 0;

    if (clipboardData && clipboardData.content) {
      for (var ci = 0; ci < clipboardData.content.length; ci++) {
        var contentItem = clipboardData.content[ci];
        var nodeName = contentItem.nodeName || contentItem.tagName;

        if (nodeName === "Graphic") {
          skippedGraphics++;
          continue;
        }

        // Prefer .xml if available (common in MSXML), else XMLSerializer (browser)
        var nodeXml = "";
        if (contentItem.xml) {
          nodeXml = contentItem.xml;
        } else {
          try {
            nodeXml = (new XMLSerializer()).serializeToString(contentItem);
          } catch (eSer) {
            nodeXml = "";
          }
        }

        requirementXmlTemplate += nodeXml;
        includedCount++;
      }
    }

    requirementXmlTemplate += "</Requirement>";

    log("✅ Template ready (" + includedCount + " elements)");

    // STEP 3: Create requirement
    log("\n[3/6] Creating requirement...");
    log("⏳ Please fill out the requirement form");

    var context = selectedItems[0];
    var createCall = actionsHelper.executeAction("appendnewitem", {
      context: context,
      elementName: "Requirement",
      direction: "append",
      skipElementCreation: false,
      initializerType: "formDialog",
      initializerParameters: {}
    });

    asThenable(createCall).then(function (createResult) {
      if (!createResult) {
        err("❌ Requirement creation cancelled");
        return;
      }

      var reqElement = createResult.schemaElement;
      var reqItemNode = createResult.itemNode;

      if (!reqElement || !reqItemNode) {
        err("❌ Requirement creation did not return schemaElement/itemNode");
        return;
      }

      var reqId = reqItemNode.getAttribute("id");

      // optional chaining replacement
      var reqNumber = "Unknown";
      try {
        var itemNumberNode = reqItemNode.selectSingleNode("item_number");
        var txt = safeNodeText(itemNumberNode);
        if (txt) reqNumber = txt;
      } catch (eNum) {
        // keep Unknown
      }

      log("✅ Created " + reqNumber + " (ID: " + reqId + ")");

      // STEP 4: Fill in template and save
      log("\n[4/6] Saving content to database...");

      // Replace placeholders
      var requirementXml = requirementXmlTemplate
        .replace(/\{\{REQ_ID\}\}/g, reqId)
        .replace(/\{\{REQ_NUMBER\}\}/g, reqNumber);

      // Wrap in aras:content
      var contentGuid = generateGuid();
      var fullContentXml =
        '<aras:content xmlns:aras="http://aras.com/ArasTechDoc" aras:id="' + contentGuid + '">' +
        requirementXml +
        "</aras:content>";

      var updateAml =
        '<Item type="re_Requirement" action="edit" id="' + reqId + '">' +
          "<content><![CDATA[" + fullContentXml + "]]></content>" +
        "</Item>";

      var updateResult = aras.soapSend("ApplyItem", updateAml);

      var hasError = false;

      if (typeof updateResult === "string") {
        // ES5: replace .includes with indexOf
        hasError = (updateResult.indexOf("SOAP-ENV:Fault") !== -1);
      } else if (updateResult && updateResult.node) {
        // Your source had updateResult.selectSingleNode - likely should be updateResult.node.selectSingleNode
        try {
          hasError = (updateResult.node.selectSingleNode("//faultstring") !== null);
        } catch (eSel) {
          // If we can't inspect, be conservative
          hasError = true;
        }
      }

      if (hasError) {
        err("❌ Failed to save content");
        return;
      }

      log("✅ Saved to database");

      // STEP 5: Refresh the requirement element using RefreshContentAction pattern
      log("\n[5/6] Refreshing requirement content...");

      try {
        var contentHelper = viewmodel.ContentGeneration();
        // This is what RefreshContentAction does - call refreshStaticContent
        contentHelper.refreshStaticContent(reqElement);
        log("✅ Content refreshed in document");
      } catch (error) {
        // ES5-safe message access
        var msg = (error && error.message) ? error.message : String(error);
        warn("⚠️ Could not refresh content:", msg);
        log("   You may need to manually refresh the element");
      }

      // STEP 6: Remove elements from source
      log("\n[6/6] Removing elements from source...");

      viewmodel.SuspendInvalidation();

      try {
        var removedCount = 0;

        for (var ri = 0; ri < selectedItems.length; ri++) {
          var item = selectedItems[ri];
          var nn = item.nodeName || item.tagName;

          if (nn === "Graphic") {
            continue;
          }

          var parent = item.Parent;
          if (parent) {
            var childList = parent.ChildItems();
            // childList.index(item) -> if index() is not standard array, it might still exist in Aras list type.
            var pos = -1;
            try {
              if (childList && typeof childList.index === "function") {
                pos = childList.index(item);
              } else if (childList && typeof childList.indexOf === "function") {
                pos = childList.indexOf(item);
              }
            } catch (eIdx) {
              pos = -1;
            }

            if (pos >= 0 && childList && typeof childList.splice === "function") {
              childList.splice(pos, 1);
              removedCount++;
            }
          }
        }

        log("✅ Removed " + removedCount + " element(s)");
      } finally {
        viewmodel.ResumeInvalidation();

        if (selectedItems[0] && selectedItems[0].Parent) {
          viewmodel.invalidateElement(selectedItems[0].Parent);
        }
      }

      viewmodel.SetSelectedItems([reqElement]);

      log("\n" + repeatStr("=", 50));
      log("✅ COMPLETE");
      log(repeatStr("=", 50));
      log("Requirement: " + reqNumber);
      log("Elements moved: " + includedCount);
      if (skippedGraphics > 0) {
        log("Graphics skipped: " + skippedGraphics);
      }

      return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement,
        movedElements: includedCount,
        skippedGraphics: skippedGraphics
      };
    });

  } catch (eTop) {
    err("❌ Workflow error:", eTop);
  }
})();

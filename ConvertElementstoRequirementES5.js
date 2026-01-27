// ES5 version of: "SIMPLIFIED: Just add children to the already-created Requirement"
// Changes: no async/await, no const/let, no template literals, no optional chaining, no forEach, no includes, no repeat
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

  // Promise/thenable adapter for executeAction results
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

  function hasSoapFaultString(updateResult) {
    // ES5-safe fault detection
    if (typeof updateResult === "string") {
      return updateResult.indexOf("SOAP-ENV:Fault") !== -1 || updateResult.indexOf("faultstring") !== -1;
    }
    if (updateResult && updateResult.node) {
      try {
        return (
          updateResult.node.selectSingleNode("//faultstring") !== null ||
          updateResult.node.selectSingleNode("//SOAP-ENV:Fault") !== null ||
          updateResult.node.getAttribute("isError") === "1"
        );
      } catch (e) {
        // If we can't inspect the response reliably, treat as error
        return true;
      }
    }
    return false;
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
    log("\n[1/5] Copying to clipboard...");
    actionsHelper.executeAction("copyelement", {
      selectedItems: selectedItems,
      clipboard: clipboard
    });

    var clipboardData = clipboard.getData("StructureXml");
    var copiedCount = (clipboardData && clipboardData.content) ? clipboardData.content.length : 0;
    log("✅ Copied " + copiedCount + " elements");

    // STEP 2: Create requirement
    log("\n[2/5] Creating requirement...");
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

      var childCountBefore = 0;
      try {
        childCountBefore = reqElement.ChildItems().List().length;
      } catch (eCnt1) {
        childCountBefore = 0;
      }

      log("✅ Created " + reqNumber + " (ID: " + reqId + ")");
      log("   Requirement element children: " + childCountBefore);

      // STEP 3: Add copied elements directly to the Requirement element
      log("\n[3/5] Adding content to requirement...");

      viewmodel.SuspendInvalidation();

      try {
        var addedCount = 0;
        var skippedGraphics = 0;

        var reqChildList = reqElement.ChildItems();

        var contentArr = (clipboardData && clipboardData.content) ? clipboardData.content : [];
        for (var i = 0; i < contentArr.length; i++) {
          var contentItem = contentArr[i];
          var nodeName = contentItem.nodeName || contentItem.tagName;

          if (nodeName === "Graphic") {
            skippedGraphics++;
            log("  ⚠️ Skipped: Graphic");
            continue;
          }

          // Clone the element
          var clonedNode = null;
          try {
            clonedNode = contentItem.cloneNode(true);
          } catch (eClone) {
            clonedNode = null;
          }

          if (!clonedNode) {
            log("  ⚠️ Failed to clone: " + nodeName);
            continue;
          }

          // Import into the requirement's document
          var importedNode = null;
          try {
            // NOTE: importNode may not exist in some MSXML contexts; if so, fallback to append clone directly.
            if (reqElement.origin &&
                reqElement.origin.ownerDocument &&
                typeof reqElement.origin.ownerDocument.importNode === "function") {
              importedNode = reqElement.origin.ownerDocument.importNode(clonedNode, true);
            } else {
              importedNode = clonedNode;
            }
          } catch (eImp) {
            importedNode = clonedNode;
          }

          // Append to the requirement's origin
          try {
            reqElement.origin.appendChild(importedNode);
          } catch (eApp) {
            log("  ⚠️ Failed to append to origin: " + nodeName);
            continue;
          }

          // Create XmlSchemaElement wrapper
          var childElement = null;
          try {
            childElement = viewmodel.CreateElement("element", {
              origin: importedNode
            });
          } catch (eCreate) {
            childElement = null;
          }

          if (childElement) {
            // Add to the child list
            try {
              reqChildList.insertAt(reqChildList.List().length, childElement);
              addedCount++;
              log("  ✅ Added: " + nodeName);
            } catch (eIns) {
              log("  ⚠️ Failed to insert into child list: " + nodeName);
            }
          } else {
            log("  ⚠️ Failed to create element: " + nodeName);
          }
        }

        log("✅ Added " + addedCount + " elements to requirement");
        if (skippedGraphics > 0) log("   Graphics skipped: " + skippedGraphics);

      } finally {
        viewmodel.ResumeInvalidation();
        viewmodel.invalidateElement(reqElement);
      }

      // STEP 4: Save the requirement with its new content
      log("\n[4/5] Saving requirement to database...");

      try {
        // Get the requirement's full XML
        var reqOriginXml = "";
        try {
          reqOriginXml = reqElement.origin.xml;
        } catch (eXml) {
          // Some DOMs don't expose .xml; attempt XMLSerializer
          try {
            reqOriginXml = (new XMLSerializer()).serializeToString(reqElement.origin);
          } catch (eXml2) {
            reqOriginXml = "";
          }
        }

        var childCountAfter = 0;
        try {
          childCountAfter = reqElement.ChildItems().List().length;
        } catch (eCnt2) {
          childCountAfter = 0;
        }

        log("Requirement XML length:", reqOriginXml ? reqOriginXml.length : 0);
        log("Requirement children count:", childCountAfter);

        // Save to database
        var updateAml =
          '<Item type="re_Requirement" action="edit" id="' + reqId + '">' +
            "<content><![CDATA[" + reqOriginXml + "]]></content>" +
          "</Item>";

        var updateResult = aras.soapSend("ApplyItem", updateAml);

        var hasError = hasSoapFaultString(updateResult);

        if (hasError) {
          err("❌ Failed to save content");
          err(updateResult);
          return;
        }

        log("✅ Saved to database");

      } catch (error) {
        err("❌ Error saving:", error);
        return;
      }

      // STEP 5: Remove elements from source
      log("\n[5/5] Removing elements from source...");

      viewmodel.SuspendInvalidation();

      try {
        var removedCount = 0;

        for (var r = 0; r < selectedItems.length; r++) {
          var item = selectedItems[r];
          var nn = item.nodeName || item.tagName;

          if (nn === "Graphic") continue;

          var parent = item.Parent;
          if (parent) {
            var childList = parent.ChildItems();

            // childList.index(item) is Aras list style; fallback to indexOf if needed
            var position = -1;
            try {
              if (childList && typeof childList.index === "function") {
                position = childList.index(item);
              } else if (childList && typeof childList.indexOf === "function") {
                position = childList.indexOf(item);
              }
            } catch (eIdx) {
              position = -1;
            }

            if (position >= 0 && childList && typeof childList.splice === "function") {
              childList.splice(position, 1);
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

      var finalChildCount = 0;
      try {
        finalChildCount = reqElement.ChildItems().List().length;
      } catch (eCnt3) {
        finalChildCount = 0;
      }
      log("Children in requirement: " + finalChildCount);

      return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement
      };
    });

  } catch (eTop) {
    err("❌ Workflow error:", eTop);
  }
})();

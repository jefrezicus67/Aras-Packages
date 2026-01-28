// ES5 version of:
// FINAL: Create Requirement from Selected Elements - with Nested Graphics Support
// R30+ version. Needs viewmodel and ES5 adjustment for earlier versions
//
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

  function hasSoapFault(updateResult) {
    if (typeof updateResult === "string") {
      return (
        updateResult.indexOf("SOAP-ENV:Fault") !== -1 ||
        updateResult.indexOf("faultstring") !== -1
      );
    }
    if (updateResult && updateResult.node) {
      try {
        return (
          updateResult.node.selectSingleNode("//faultstring") !== null ||
          updateResult.node.selectSingleNode("//SOAP-ENV:Fault") !== null ||
          updateResult.node.getAttribute("isError") === "1"
        );
      } catch (e) {
        return true; // conservative
      }
    }
    return false;
  }

  function generateGuid() {
    // Uppercase + remove dashes (matches your latest versions)
    var g = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = (c === "x") ? r : ((r & 0x3) | 0x8);
      return v.toString(16).toUpperCase();
    });
    return g.replace(/-/g, "");
  }

  // Serialize node (prefers MSXML .xml when available)
  function nodeToXml(node) {
    if (!node) return "";
    if (node.xml) return node.xml;
    try {
      return (new XMLSerializer()).serializeToString(node);
    } catch (e) {
      return "";
    }
  }

  // Import a node into a target ownerDocument where possible
  function importInto(doc, node) {
    if (!doc || !node) return node;
    try {
      if (typeof doc.importNode === "function") return doc.importNode(node, true);
    } catch (e) {}
    return node;
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

    // Track both ref-id and imageId for each graphic
    var graphicReferences = []; // Array of {refId, imageId}

    function convertGraphicToREStandard(node) {
      var guid = generateGuid();
      var imageId = (node.getAttribute && node.getAttribute("imageId")) ? node.getAttribute("imageId") : "";
      var style = (node.getAttribute && node.getAttribute("style")) ? node.getAttribute("style") : "";

      // Generate new ref-id for RE-Standard
      var newRefId = generateGuid();

      // Track BOTH ref-id and imageId for relationship creation
      graphicReferences.push({
        refId: newRefId,
        imageId: imageId
      });

      // Build RE-Standard compliant Graphic
      var graphicXml = '<Graphic xmlns:aras="http://aras.com/ArasTechDoc" aras:id="' + guid + '"';
      graphicXml += ' ref-id="' + newRefId + '"';
      graphicXml += ' imageId="' + imageId + '"';
      if (style) {
        graphicXml += ' style="' + style + '"';
      }
      graphicXml += " />";

      log("  ✅ Converted Graphic (imageId: " + imageId + ", ref-id: " + newRefId + ")");
      return graphicXml;
    }

    function isGraphicNode(node) {
      if (!node) return false;
      var n = node.nodeName || node.tagName;
      return n === "Graphic";
    }

    // Recursively replace nested <Graphic> with RE-Standard-compliant <Graphic> (new ref-id),
    // returning XML string for the processed node.
    //
    // Notes:
    // - In some environments, MSXML XmlDocument exists (Aras often provides it).
    // - importNode may not exist; we fall back conservatively.
    function processNodeForGraphics(node) {
      if (!node) return null;

      // If this is a Graphic, convert it
      if (isGraphicNode(node)) {
        return convertGraphicToREStandard(node);
      }

      // If this node has children, process them recursively
      if (node.childNodes && node.childNodes.length > 0) {
        var clonedNode = null;
        try {
          clonedNode = node.cloneNode(true);
        } catch (eClone) {
          clonedNode = null;
        }
        if (!clonedNode) return null;

        // Iterate children of the clone (note: live NodeList; replacing is ok but we guard carefully)
        var children = clonedNode.childNodes;

        for (var i = 0; i < children.length; i++) {
          var child = children[i];

          if (child && child.nodeType === 1) { // Element node
            if (isGraphicNode(child)) {
              // Convert the graphic to RE-Standard XML
              var graphicXml = convertGraphicToREStandard(child);

              // Parse new graphic XML into a node
              var newGraphicNode = null;
              try {
                var graphicDoc = new XmlDocument();
                graphicDoc.loadXML(graphicXml);
                newGraphicNode = graphicDoc.documentElement;
              } catch (eG) {
                newGraphicNode = null;
              }

              if (newGraphicNode) {
                var importedGraphic = importInto(clonedNode.ownerDocument, newGraphicNode);
                try {
                  clonedNode.replaceChild(importedGraphic, child);
                } catch (eRepG) {
                  // ignore if replace fails
                }
              }
            } else {
              // Recursively process this child; if it returns XML, replace child with new parsed node
              var processedChildXml = processNodeForGraphics(child);

              if (processedChildXml !== null) {
                var newChildNode = null;
                try {
                  var childDoc = new XmlDocument();
                  childDoc.loadXML(processedChildXml);
                  newChildNode = childDoc.documentElement;
                } catch (eC) {
                  newChildNode = null;
                }

                if (newChildNode) {
                  var importedChild = importInto(clonedNode.ownerDocument, newChildNode);
                  try {
                    clonedNode.replaceChild(importedChild, child);
                  } catch (eRepC) {
                    // ignore
                  }
                }
              }
            }
          }
        }

        // Return processed node XML
        return nodeToXml(clonedNode);
      }

      // No children / no graphics found to rewrite
      return null;
    }

    // Build content template
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

    var contentArr = (clipboardData && clipboardData.content) ? clipboardData.content : [];
    for (var ci = 0; ci < contentArr.length; ci++) {
      var contentItem = contentArr[ci];
      var nodeName = contentItem.nodeName || contentItem.tagName;

      if (nodeName === "Graphic") {
        // Top-level Graphic
        var topGraphicXml = convertGraphicToREStandard(contentItem);
        requirementXmlTemplate += topGraphicXml;
        includedCount++;
        log("  ✅ Added: " + nodeName);
      } else {
        // Process node for nested graphics
        var processedXml = processNodeForGraphics(contentItem);
        var nodeXml = processedXml || nodeToXml(contentItem);

        requirementXmlTemplate += nodeXml;
        includedCount++;
        log("  ✅ Added: " + nodeName);
      }
    }

    requirementXmlTemplate += "</Requirement>";

    log("✅ Template ready (" + includedCount + " elements)");
    if (graphicReferences.length > 0) {
      log("   Found " + graphicReferences.length + " graphic(s) to reference");
    }

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
      var reqId = reqItemNode.getAttribute("id");

      // optional chaining replacement
      var reqNumber = "Unknown";
      try {
        var itemNumberNode = reqItemNode.selectSingleNode("item_number");
        var txt = safeNodeText(itemNumberNode);
        if (txt) reqNumber = txt;
      } catch (eNum) {}

      log("✅ Created " + reqNumber + " (ID: " + reqId + ")");

      // STEP 4: Save content
      log("\n[4/6] Saving content to database...");

      var requirementXml = requirementXmlTemplate
        .replace(/\{\{REQ_ID\}\}/g, reqId)
        .replace(/\{\{REQ_NUMBER\}\}/g, reqNumber);

      var updateAml =
        '<Item type="re_Requirement" action="edit" id="' + reqId + '">' +
          "<content><![CDATA[" + requirementXml + "]]></content>" +
        "</Item>";

      var updateResult = aras.soapSend("ApplyItem", updateAml);

      if (hasSoapFault(updateResult)) {
        err("❌ Failed to save content");
        err(updateResult);
        return;
      }

      log("✅ Saved content to database");

      // Create image reference relationships
      if (graphicReferences.length > 0) {
        log("\nCreating image reference relationships...");

        for (var gi = 0; gi < graphicReferences.length; gi++) {
          var graphic = graphicReferences[gi];

          try {
            var refItem = aras.newIOMItem("re_ImageReference", "add");
            refItem.setProperty("source_id", reqId);
            refItem.setProperty("related_id", graphic.imageId);
            refItem.setProperty("reference_id", graphic.refId);

            var refResult = refItem.apply();

            if (refResult.isError()) {
              warn("⚠️ Failed to create reference for image: " + graphic.imageId);
              warn(refResult.getErrorString());
            } else {
              log("  ✅ Created reference (imageId: " + graphic.imageId + ", ref-id: " + graphic.refId + ")");
            }
          } catch (eRef) {
            warn("⚠️ Exception creating reference for image: " + graphic.imageId);
            warn(eRef);
          }
        }

        log("✅ Created " + graphicReferences.length + " image reference(s)");
      }

      // STEP 5: Refresh the requirement element
      log("\n[5/6] Refreshing requirement content...");

      try {
        var contentHelper = viewmodel.ContentGeneration();
        contentHelper.refreshStaticContent(reqElement);
        log("✅ Content refreshed in document");
      } catch (error) {
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
          var parent = item.Parent;

          if (parent) {
            var childList = parent.ChildItems();

            // Aras list usually has index(item); fallback to indexOf if it's an array
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
      log("Elements moved: " + includedCount);
      if (graphicReferences.length > 0) {
        log("Graphic references: " + graphicReferences.length);
      }

      return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement,
        movedElements: includedCount,
        imageReferences: graphicReferences.length
      };
    });

  } catch (eTop) {
    err("❌ Workflow error:", eTop);
  }
})();

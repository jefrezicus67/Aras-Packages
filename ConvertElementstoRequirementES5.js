// ES5-compliant version (no async/await, no template literals, no optional chaining, no defaults/rest/spread)
//
// Complete workflow: Copy elements, create Requirement, update content, refresh
(function () {
  // --- Small helpers ---
  function log() {
    if (window.console && console.log) console.log.apply(console, arguments);
  }
  function err() {
    if (window.console && console.error) console.error.apply(console, arguments);
  }

  // Simple "promise to callback" adapter for Aras/Innovator cases where executeAction may return:
  //  - a Promise/thenable
  //  - a direct value
  //  - nothing (rare)
  function asThenable(value) {
    if (value && typeof value.then === "function") return value;
    // Create a minimal thenable for immediate values
    return {
      then: function (resolve) {
        resolve(value);
        return { then: function () {} };
      }
    };
  }

  // --- Main workflow wrapped in try/catch so ES5 consoles show something useful ---
  try {
    var viewmodel = window.viewController.viewContext.data.structuredDocument;
    var actionsHelper = viewmodel.ActionsHelper();
    var clipboard = viewmodel.Clipboard();
    var aras = window.aras || top.aras;

    log("=== Starting Requirement Creation Workflow ===\n");

    // Get selected elements
    var selectedItems = viewmodel.GetSelectedItems();

    if (!selectedItems || selectedItems.length === 0) {
      err("❌ No elements selected");
      return;
    }

    log("Selected " + selectedItems.length + " element(s)");
    for (var si = 0; si < selectedItems.length; si++) {
      log("  [" + si + "] " + selectedItems[si].nodeName);
    }

    // STEP 1: Copy selected elements to clipboard
    log("\n--- STEP 1: Copy to Clipboard ---");
    actionsHelper.executeAction("copyelement", {
      selectedItems: selectedItems,
      clipboard: clipboard
    });

    var clipboardData = clipboard.getData("StructureXml");
    log("✅ Copied to clipboard");
    log("  Content elements:", clipboardData && clipboardData.content ? clipboardData.content.length : 0);

    var refCount = 0;
    if (clipboardData && clipboardData.references) {
      for (var k in clipboardData.references) {
        if (clipboardData.references.hasOwnProperty(k) && k !== "_rootNode") refCount++;
      }
    }
    log("  References:", refCount);

    // STEP 2: Create new Requirement (triggers dialog)
    log("\n--- STEP 2: Create Requirement ---");
    log("Opening Requirement creation dialog...");

    var context = selectedItems[0];

    // Note: In ES5 we replace await with then()
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
        err("❌ Requirement creation was cancelled or failed");
        return;
      }

      log("✅ Requirement created");

      var reqElement = createResult.schemaElement;
      var reqItemNode = createResult.itemNode;

      if (!reqElement || !reqItemNode) {
        err("❌ Failed to get requirement element or item");
        return;
      }

      var reqId = reqItemNode.getAttribute("id");

      // optional chaining replacement:
      var reqNumber = "Unknown";
      try {
        var n = reqItemNode.selectSingleNode("item_number");
        if (n) {
          // handle IE XML DOM (.text) and standard DOM (.textContent)
          reqNumber = (typeof n.text !== "undefined" && n.text !== null) ? n.text : (n.textContent || "Unknown");
          if (!reqNumber) reqNumber = "Unknown";
        }
      } catch (e1) {
        // keep default
      }

      log("  Requirement ID:", reqId);
      log("  Requirement Number:", reqNumber);

      try {
        log("  Element ref-id:", reqElement.origin.getAttribute("ref-id"));
      } catch (e2) {
        // ignore if origin/ref-id not present
      }

      // STEP 3: Build and update the requirement content
      log("\n--- STEP 3: Update Requirement Content ---");

      // Generate unique GUIDs for XML elements
      function generateGuid() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
          var r = Math.random() * 16 | 0;
          var v = (c === "x") ? r : ((r & 0x3) | 0x8);
          return v.toString(16).toUpperCase();
        });
      }

      // Helper to escape XML special characters
      function escapeXml(text) {
        if (!text) return "";
        return String(text)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&apos;");
      }

      // Helper: ES5 contains check (replace Array.prototype.includes)
      function contains(arr, value) {
        if (!arr) return false;
        for (var i = 0; i < arr.length; i++) {
          if (arr[i] === value) return true;
        }
        return false;
      }

      // Helper to clone node attributes
      function cloneAttributes(sourceNode, excludeAttrs) {
        excludeAttrs = excludeAttrs || [];
        var attrs = sourceNode && sourceNode.attributes;
        var attrString = "";

        if (attrs) {
          for (var i = 0; i < attrs.length; i++) {
            var attr = attrs[i];
            var attrName = attr.nodeName || attr.name;

            // Skip namespace declarations and excluded attributes
            if (
              attrName &&
              attrName.indexOf("xmlns") !== 0 &&
              attrName !== "aras:id" &&
              !contains(excludeAttrs, attrName)
            ) {
              var val = (typeof attr.value !== "undefined" && attr.value !== null) ? attr.value : attr.nodeValue;
              attrString += ' ' + attrName + '="' + escapeXml(val) + '"';
            }
          }
        }

        return attrString;
      }

      // Function to recursively convert clipboard content to RE-Standard XML
      function convertToREStandard(node, references) {
        if (!node) return "";

        var nodeName = node.nodeName || node.tagName;
        log("  Processing node: " + nodeName);

        // Handle different node types according to RE-Standard schema
        if (nodeName === "Text") {
          var guidText = generateGuid();
          var emphNodeText = null;

          try {
            emphNodeText = node.selectSingleNode(".//aras:emph") ||
              node.selectSingleNode('.//*[local-name()="emph"]');
          } catch (e) {
            emphNodeText = null;
          }

          var txt = "";
          if (emphNodeText) {
            txt = (typeof emphNodeText.text !== "undefined" && emphNodeText.text !== null)
              ? emphNodeText.text
              : (emphNodeText.textContent || "");
          }

          if (txt) {
            return '<Text aras:id="' + guidText + '"><aras:emph xmlns="" emphtype="text">' +
              escapeXml(txt) + "</aras:emph></Text>";
          }

        } else if (nodeName === "List") {
          var guidList = generateGuid();
          var listType = (node.getAttribute && node.getAttribute("type")) ? node.getAttribute("type") : "bullet";

          var listXml = '<List xmlns:aras="http://aras.com/ArasTechDoc" type="' + listType +
            '" aras:id="' + guidList + '">';

          var listItems = node.childNodes;
          var itemCount = 0;

          if (listItems) {
            for (var li = 0; li < listItems.length; li++) {
              var child = listItems[li];
              if (child && child.nodeType === 1 && ((child.nodeName === "List-Item") || (child.tagName === "List-Item"))) {
                itemCount++;
                var itemGuid = generateGuid();
                listXml += '<List-Item aras:id="' + itemGuid + '">';

                var itemChildren = child.childNodes;
                if (itemChildren) {
                  for (var lj = 0; lj < itemChildren.length; lj++) {
                    var itemChild = itemChildren[lj];
                    if (itemChild && itemChild.nodeType === 1) {
                      var childXml = convertToREStandard(itemChild, references);
                      if (childXml) listXml += childXml;
                    }
                  }
                }

                listXml += "</List-Item>";
              }
            }
          }

          listXml += "</List>";
          log("    Converted List with " + itemCount + " items");
          return listXml;

        } else if (nodeName === "Table") {
          var guidTable = generateGuid();
          var attrsTable = cloneAttributes(node, ["aras:id"]);
          var tableXml = '<Table xmlns:aras="http://aras.com/ArasTechDoc" aras:id="' + guidTable + '"' + attrsTable + ">";

          var rows = node.childNodes;
          var rowCount = 0;

          if (rows) {
            for (var ri = 0; ri < rows.length; ri++) {
              var row = rows[ri];
              if (row && row.nodeType === 1 && ((row.nodeName === "Row") || (row.tagName === "Row"))) {
                rowCount++;
                var rowGuid = generateGuid();
                var rowAttrs = cloneAttributes(row, ["aras:id"]);
                tableXml += '<Row aras:id="' + rowGuid + '"' + rowAttrs + ">";

                var entries = row.childNodes;
                if (entries) {
                  for (var ej = 0; ej < entries.length; ej++) {
                    var entry = entries[ej];
                    if (entry && entry.nodeType === 1 && ((entry.nodeName === "Entry") || (entry.tagName === "Entry"))) {
                      var entryGuid = generateGuid();
                      var entryAttrs = cloneAttributes(entry, ["aras:id"]);
                      tableXml += '<Entry aras:id="' + entryGuid + '"' + entryAttrs + ">";

                      // Process entry contents
                      var entryChildren = entry.childNodes;
                      if (entryChildren) {
                        for (var ek = 0; ek < entryChildren.length; ek++) {
                          var entryChild = entryChildren[ek];
                          if (entryChild && entryChild.nodeType === 1) {
                            var entryChildXml = convertToREStandard(entryChild, references);
                            if (entryChildXml) tableXml += entryChildXml;
                          }
                        }
                      }

                      tableXml += "</Entry>";
                    }
                  }
                }

                tableXml += "</Row>";
              }
            }
          }

          tableXml += "</Table>";
          log("    Converted Table with " + rowCount + " rows");
          return tableXml;

        } else if (nodeName === "Graphic") {
          var guidGraphic = generateGuid();

          // Get image reference information
          var itemId = node.getAttribute ? node.getAttribute("itemId") : null;
          var refId = node.getAttribute ? node.getAttribute("ref-id") : null;

          if (itemId && references && refId && references[refId]) {
            // Clone the Graphic with its references
            var attrsGraphic = cloneAttributes(node, ["aras:id"]);
            var graphicXml = '<Graphic xmlns:aras="http://aras.com/ArasTechDoc" aras:id="' + guidGraphic + '"' + attrsGraphic + " />";
            log("    Converted Graphic (itemId: " + itemId + ")");
            return graphicXml;
          } else {
            log("    ⚠️ Graphic missing references, skipping");
          }

        } else if (nodeName === "Title") {
          var guidTitle = generateGuid();
          var emphNodeTitle = null;

          try {
            emphNodeTitle = node.selectSingleNode(".//aras:emph") ||
              node.selectSingleNode('.//*[local-name()="emph"]');
          } catch (e3) {
            emphNodeTitle = null;
          }

          var titleText = "";
          if (emphNodeTitle) {
            titleText = (typeof emphNodeTitle.text !== "undefined" && emphNodeTitle.text !== null)
              ? emphNodeTitle.text
              : (emphNodeTitle.textContent || "");
          }

          if (titleText) {
            return '<Title aras:id="' + guidTitle + '"><aras:emph xmlns="" emphtype="text">' +
              escapeXml(titleText) + "</aras:emph></Title>";
          }

        } else if (nodeName === "Subtitle") {
          var guidSubtitle = generateGuid();
          var subText = (typeof node.text !== "undefined" && node.text !== null) ? node.text : (node.textContent || "");
          if (subText) {
            return '<Subtitle aras:id="' + guidSubtitle + '">' + escapeXml(subText) + "</Subtitle>";
          }

        } else if (nodeName === "Label") {
          var guidLabel = generateGuid();
          var emphNodeLabel = null;

          try {
            emphNodeLabel = node.selectSingleNode(".//aras:emph") ||
              node.selectSingleNode('.//*[local-name()="emph"]');
          } catch (e4) {
            emphNodeLabel = null;
          }

          var labelText = "";
          if (emphNodeLabel) {
            labelText = (typeof emphNodeLabel.text !== "undefined" && emphNodeLabel.text !== null)
              ? emphNodeLabel.text
              : (emphNodeLabel.textContent || "");
          }

          if (labelText) {
            return '<Label aras:id="' + guidLabel + '"><aras:emph xmlns="" emphtype="text">' +
              escapeXml(labelText) + "</aras:emph></Label>";
          }

        } else {
          log("    ⚠️ Unhandled node type: " + nodeName);
        }

        return "";
      }

      // Build the RE-Standard XML wrapper
      var reqTitleGuid = generateGuid();
      var reqNumberGuid = generateGuid();
      var reqChapterGuid = generateGuid();
      var reqInfoGuid = generateGuid();
      var reqRootGuid = generateGuid();

      var contentXml = '<Requirement xmlns:aras="http://aras.com/ArasTechDoc" xmlns="http://www.aras.com/REStandard" aras:id="' +
        reqRootGuid + '" reqId="' + reqId + '">';

      contentXml += '<Requirement-Info aras:id="' + reqInfoGuid + '">';
      contentXml += '<Requirement-Chapter aras:id="' + reqChapterGuid + '"><aras:emph emphtype="text"></aras:emph></Requirement-Chapter>';
      contentXml += '<Requirement-Title aras:id="' + reqTitleGuid + '"><aras:emph emphtype="text">' + escapeXml(reqNumber) + '</aras:emph></Requirement-Title>';
      contentXml += '<Requirement-Number aras:id="' + reqNumberGuid + '"><aras:emph emphtype="text">' + escapeXml(reqNumber) + '</aras:emph></Requirement-Number>';
      contentXml += "</Requirement-Info>";

      // Add the copied content
      log("\nProcessing copied content:");
      if (clipboardData && clipboardData.content) {
        for (var ci = 0; ci < clipboardData.content.length; ci++) {
          var contentNode = clipboardData.content[ci];
          var convertedXml = convertToREStandard(contentNode, clipboardData.references);
          if (convertedXml) contentXml += convertedXml;
        }
      }

      contentXml += "</Requirement>";

      log("\n✅ Built requirement content XML");
      log("Content length:", contentXml.length);

      // Update the requirement item with the content
      log("\nUpdating requirement item in database...");

      var updateAml =
        '<Item type="re_Requirement" action="edit" id="' + reqId + '">' +
          "<content><![CDATA[" + contentXml + "]]></content>" +
        "</Item>";

      // ES5 try/catch remains the same
      try {
        var updateResult = aras.soapSend("ApplyItem", updateAml);

        var hasError = false;

        if (typeof updateResult === "string") {
          hasError = (updateResult.indexOf("SOAP-ENV:Fault") !== -1) || (updateResult.indexOf("faultstring") !== -1);
        } else if (updateResult && updateResult.node) {
          var resultNode = updateResult.node;
          try {
            hasError =
              (resultNode.selectSingleNode("//faultstring") !== null) ||
              (resultNode.selectSingleNode("//SOAP-ENV:Fault") !== null) ||
              (resultNode.getAttribute("isError") === "1");
          } catch (e5) {
            // if we can't parse, treat as error-safe
            hasError = true;
          }
        }

        if (hasError) {
          err("❌ Failed to update requirement content");
          err("Result:", updateResult);
          return;
        }

        log("✅ Requirement content updated in database");

      } catch (error) {
        err("❌ Error updating requirement:", error);
        return;
      }

      // STEP 4: Refresh the requirement element in the document
      log("\n--- STEP 4: Refresh Element ---");

      var updatedReqItem = aras.getItemById("re_Requirement", reqId);

      if (updatedReqItem) {
        var contentNodeDb = null;
        try {
          contentNodeDb = updatedReqItem.selectSingleNode("content");
        } catch (e6) {
          contentNodeDb = null;
        }

        // ES5: check both .text and .textContent variants
        var dbContentText = null;
        if (contentNodeDb) {
          dbContentText = (typeof contentNodeDb.text !== "undefined" && contentNodeDb.text !== null)
            ? contentNodeDb.text
            : (contentNodeDb.textContent || null);
        }

        if (dbContentText) {
          log("Got updated content from database");

          var contentDoc = new XmlDocument();
          contentDoc.loadXML(dbContentText);
          var reqContentNode = contentDoc.documentElement;

          var externalProvider = viewmodel.OriginExternalProvider();
          externalProvider.Update(reqContentNode);

          log("✅ External content updated");
        }
      }

      viewmodel.invalidateElement(reqElement);
      log("✅ Element refreshed");

      viewmodel.SetSelectedItems([reqElement]);

      log("\n=== Workflow Complete ===");
      log("✅ Created requirement:", reqNumber);

      return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement,
        contentXml: contentXml
      };
    });

  } catch (eTop) {
    if (window.console && console.error) console.error("❌ Workflow error:", eTop);
  }
})();

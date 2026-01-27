// SIMPLIFIED: Just add children to the already-created Requirement
(async function() {
    const viewmodel = window.viewController.viewContext.data.structuredDocument;
    const actionsHelper = viewmodel.ActionsHelper();
    const clipboard = viewmodel.Clipboard();
    const aras = window.aras || top.aras;
    
    console.log("=== Creating Requirement from Selected Elements ===\n");
    
    // Get selected elements
    const selectedItems = viewmodel.GetSelectedItems();
    
    if (!selectedItems || selectedItems.length === 0) {
        console.error("❌ No elements selected");
        return;
    }
    
    console.log(`Selected ${selectedItems.length} element(s):`);
    selectedItems.forEach((item, i) => {
        console.log(`  [${i+1}] ${item.nodeName}`);
    });
    
    // STEP 1: Copy to clipboard
    console.log("\n[1/5] Copying to clipboard...");
    actionsHelper.executeAction('copyelement', {
        selectedItems: selectedItems,
        clipboard: clipboard
    });
    
    const clipboardData = clipboard.getData('StructureXml');
    console.log(`✅ Copied ${clipboardData.content.length} elements`);
    
    // STEP 2: Create requirement (this creates the Requirement wrapper + Requirement-Info)
    console.log("\n[2/5] Creating requirement...");
    console.log("⏳ Please fill out the requirement form");
    
    const context = selectedItems[0];
    const createResult = await actionsHelper.executeAction('appendnewitem', {
        context: context,
        elementName: 'Requirement',
        direction: 'append',
        skipElementCreation: false,
        initializerType: 'formDialog',
        initializerParameters: {}
    });
    
    if (!createResult) {
        console.error("❌ Requirement creation cancelled");
        return;
    }
    
    const reqElement = createResult.schemaElement;
    const reqItemNode = createResult.itemNode;
    const reqId = reqItemNode.getAttribute('id');
    const reqNumber = reqItemNode.selectSingleNode('item_number')?.text || 'Unknown';
    
    console.log(`✅ Created ${reqNumber} (ID: ${reqId})`);
    console.log(`   Requirement element children: ${reqElement.ChildItems().List().length}`);
    
    // STEP 3: Add copied elements directly to the Requirement element
    console.log("\n[3/5] Adding content to requirement...");
    
    viewmodel.SuspendInvalidation();
    
    try {
        let addedCount = 0;
        let skippedGraphics = 0;
        
        const reqChildList = reqElement.ChildItems();
        
        for (let i = 0; i < clipboardData.content.length; i++) {
            const contentItem = clipboardData.content[i];
            const nodeName = contentItem.nodeName || contentItem.tagName;
            
            if (nodeName === 'Graphic') {
                skippedGraphics++;
                console.log(`  ⚠️ Skipped: Graphic`);
                continue;
            }
            
            // Clone the element
            const clonedNode = contentItem.cloneNode(true);
            
            // Import into the requirement's document
            const importedNode = reqElement.origin.ownerDocument.importNode(clonedNode, true);
            
            // Append to the requirement's origin
            reqElement.origin.appendChild(importedNode);
            
            // Create XmlSchemaElement wrapper
            const childElement = viewmodel.CreateElement('element', {
                origin: importedNode
            });
            
            if (childElement) {
                // Add to the child list
                reqChildList.insertAt(reqChildList.List().length, childElement);
                addedCount++;
                console.log(`  ✅ Added: ${nodeName}`);
            } else {
                console.log(`  ⚠️ Failed to create element: ${nodeName}`);
            }
        }
        
        console.log(`✅ Added ${addedCount} elements to requirement`);
        
    } finally {
        viewmodel.ResumeInvalidation();
        viewmodel.invalidateElement(reqElement);
    }
    
    // STEP 4: Save the requirement with its new content
    console.log("\n[4/5] Saving requirement to database...");
    
    try {
        // Get the requirement's full XML
        const reqOriginXml = reqElement.origin.xml;
        
        console.log("Requirement XML length:", reqOriginXml.length);
        console.log("Requirement children count:", reqElement.ChildItems().List().length);
        
        // Save to database
        const updateAml = `<Item type="re_Requirement" action="edit" id="${reqId}">
            <content><![CDATA[${reqOriginXml}]]></content>
        </Item>`;
        
        const updateResult = aras.soapSend('ApplyItem', updateAml);
        
        let hasError = false;
        if (typeof updateResult === 'string') {
            hasError = updateResult.includes('SOAP-ENV:Fault');
        } else if (updateResult.node) {
            hasError = updateResult.selectSingleNode('//faultstring') !== null;
        }
        
        if (hasError) {
            console.error("❌ Failed to save content");
            console.error(updateResult);
            return;
        }
        
        console.log(`✅ Saved to database`);
        
    } catch (error) {
        console.error("❌ Error saving:", error);
        return;
    }
    
    // STEP 5: Remove elements from source
    console.log("\n[5/5] Removing elements from source...");
    
    viewmodel.SuspendInvalidation();
    
    try {
        let removedCount = 0;
        for (let i = 0; i < selectedItems.length; i++) {
            const item = selectedItems[i];
            const nodeName = item.nodeName || item.tagName;
            
            if (nodeName === 'Graphic') {
                continue;
            }
            
            const parent = item.Parent;
            if (parent) {
                const childList = parent.ChildItems();
                const position = childList.index(item);
                if (position >= 0) {
                    childList.splice(position, 1);
                    removedCount++;
                }
            }
        }
        
        console.log(`✅ Removed ${removedCount} element(s)`);
        
    } finally {
        viewmodel.ResumeInvalidation();
        
        if (selectedItems[0] && selectedItems[0].Parent) {
            viewmodel.invalidateElement(selectedItems[0].Parent);
        }
    }
    
    viewmodel.SetSelectedItems([reqElement]);
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ COMPLETE");
    console.log("=".repeat(50));
    console.log(`Requirement: ${reqNumber}`);
    console.log(`Children in requirement: ${reqElement.ChildItems().List().length}`);
    
    return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement
    };
})();

//Convert seleted text, lists, and tables into a Requirement from a Tech Doc
// Complete workflow: Copy elements, create Requirement, update content, refresh
// FINAL: Create Requirement from Selected Elements with Proper Refresh
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
    console.log("\n[1/6] Copying to clipboard...");
    actionsHelper.executeAction('copyelement', {
        selectedItems: selectedItems,
        clipboard: clipboard
    });
    
    const clipboardData = clipboard.getData('StructureXml');
    console.log(`✅ Copied ${clipboardData.content.length} elements`);
    
    // STEP 2: Build content template
    console.log("\n[2/6] Building requirement content...");
    
    function generateGuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16).toUpperCase();
        }).replace(/-/g, '');
    }
    
    // Build content template
    let requirementXmlTemplate = `<Requirement xmlns:aras="http://aras.com/ArasTechDoc" xmlns="http://www.aras.com/REStandard" aras:id="${generateGuid()}" reqId="{{REQ_ID}}">`;
    requirementXmlTemplate += `<Requirement-Info aras:id="${generateGuid()}">`;
    requirementXmlTemplate += `<Requirement-Chapter aras:id="${generateGuid()}"><aras:emph emphtype="text"></aras:emph></Requirement-Chapter>`;
    requirementXmlTemplate += `<Requirement-Title aras:id="${generateGuid()}"><aras:emph emphtype="text">{{REQ_NUMBER}}</aras:emph></Requirement-Title>`;
    requirementXmlTemplate += `<Requirement-Number aras:id="${generateGuid()}"><aras:emph emphtype="text">{{REQ_NUMBER}}</aras:emph></Requirement-Number>`;
    requirementXmlTemplate += `</Requirement-Info>`;
    
    // Add copied content
    let includedCount = 0;
    let skippedGraphics = 0;
    
    for (let i = 0; i < clipboardData.content.length; i++) {
        const contentItem = clipboardData.content[i];
        const nodeName = contentItem.nodeName || contentItem.tagName;
        
        if (nodeName === 'Graphic') {
            skippedGraphics++;
            continue;
        }
        
        const nodeXml = contentItem.xml || new XMLSerializer().serializeToString(contentItem);
        requirementXmlTemplate += nodeXml;
        includedCount++;
    }
    
    requirementXmlTemplate += `</Requirement>`;
    
    console.log(`✅ Template ready (${includedCount} elements)`);
    
    // STEP 3: Create requirement
    console.log("\n[3/6] Creating requirement...");
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
    
    // STEP 4: Fill in template and save
    console.log("\n[4/6] Saving content to database...");
    
    // Replace placeholders
    let requirementXml = requirementXmlTemplate
        .replace(/\{\{REQ_ID\}\}/g, reqId)
        .replace(/\{\{REQ_NUMBER\}\}/g, reqNumber);
    
    // Wrap in aras:content
    const contentGuid = generateGuid();
    let fullContentXml = `<aras:content xmlns:aras="http://aras.com/ArasTechDoc" aras:id="${contentGuid}">`;
    fullContentXml += requirementXml;
    fullContentXml += `</aras:content>`;
    
    const updateAml = `<Item type="re_Requirement" action="edit" id="${reqId}">
        <content><![CDATA[${fullContentXml}]]></content>
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
        return;
    }
    
    console.log(`✅ Saved to database`);
    
    // STEP 5: Refresh the requirement element using RefreshContentAction pattern
    console.log("\n[5/6] Refreshing requirement content...");
    
    try {
        const contentHelper = viewmodel.ContentGeneration();
        
        // This is what RefreshContentAction does - call refreshStaticContent
        contentHelper.refreshStaticContent(reqElement);
        
        console.log("✅ Content refreshed in document");
    } catch (error) {
        console.warn("⚠️ Could not refresh content:", error.message);
        console.log("   You may need to manually refresh the element");
    }
    
    // STEP 6: Remove elements from source
    console.log("\n[6/6] Removing elements from source...");
    
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
    console.log(`Elements moved: ${includedCount}`);
    if (skippedGraphics > 0) {
        console.log(`Graphics skipped: ${skippedGraphics}`);
    }
    
    return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement,
        movedElements: includedCount,
        skippedGraphics: skippedGraphics
    };
})();

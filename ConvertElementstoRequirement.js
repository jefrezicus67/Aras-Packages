// FINAL: Create Requirement from Selected Elements - Separate Apply Calls
// Working graphics on R30+.  !!!! Reference_id property isn't there in earlier versions, may need tweaking
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
    
    // Track image IDs for relationship creation
    const imageIds = [];
    
	// Track both ref-id and imageId for each graphic
	const graphicReferences = []; // Array of {refId, imageId}
	
	function convertGraphicToREStandard(node) {
		const guid = generateGuid();
		const imageId = node.getAttribute('imageId');
		const style = node.getAttribute('style') || '';
		
		// Generate new ref-id for RE-Standard
		const newRefId = generateGuid();
		
		// Track BOTH ref-id and imageId for relationship creation
		graphicReferences.push({
			refId: newRefId,
			imageId: imageId
		});
		
		// Build RE-Standard compliant Graphic
		let graphicXml = `<Graphic aras:id="${guid}"`;
		graphicXml += ` ref-id="${newRefId}"`;
		graphicXml += ` imageId="${imageId}"`;
		if (style) {
			graphicXml += ` style="${style}"`;
		}
		graphicXml += ` />`;
		
		console.log(`  ✅ Converted Graphic (imageId: ${imageId}, ref-id: ${newRefId})`);
		return graphicXml;
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
    
    for (let i = 0; i < clipboardData.content.length; i++) {
        const contentItem = clipboardData.content[i];
        const nodeName = contentItem.nodeName || contentItem.tagName;
        
        if (nodeName === 'Graphic') {
            const graphicXml = convertGraphicToREStandard(contentItem);
            requirementXmlTemplate += graphicXml;
            includedCount++;
        } else {
            const nodeXml = contentItem.xml || new XMLSerializer().serializeToString(contentItem);
            requirementXmlTemplate += nodeXml;
            includedCount++;
            console.log(`  ✅ Added: ${nodeName}`);
        }
    }
    
    requirementXmlTemplate += `</Requirement>`;
    
    console.log(`✅ Template ready (${includedCount} elements)`);
    if (imageIds.length > 0) {
        console.log(`   Found ${imageIds.length} image(s) to reference`);
    }
    
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
    
    // STEP 4: Save content
    console.log("\n[4/6] Saving content to database...");
    
    // Replace placeholders
    let requirementXml = requirementXmlTemplate
        .replace(/\{\{REQ_ID\}\}/g, reqId)
        .replace(/\{\{REQ_NUMBER\}\}/g, reqNumber);
    
    // Update content
    const updateAml = `<Item type="re_Requirement" action="edit" id="${reqId}">
        <content><![CDATA[${requirementXml}]]></content>
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
    
    console.log(`✅ Saved content to database`);
    
	// If graphics referenced
	if (graphicReferences.length > 0) {
		console.log(`\nCreating image reference relationships...`);
		
		for (let i = 0; i < graphicReferences.length; i++) {
			const graphic = graphicReferences[i];
			
			const refItem = aras.newIOMItem('re_ImageReference', 'add');
			refItem.setProperty('source_id', reqId);
			refItem.setProperty('related_id', graphic.imageId);  // tp_Image ID
			refItem.setProperty('reference_id', graphic.refId);  // ref-id from Graphic element
			
			const refResult = refItem.apply();
			
			if (refResult.isError()) {
				console.warn(`⚠️ Failed to create reference for image: ${graphic.imageId}`);
				console.warn(refResult.getErrorString());
			} else {
				console.log(`  ✅ Created reference (imageId: ${graphic.imageId}, ref-id: ${graphic.refId})`);
			}
		}
		
		console.log(`✅ Created ${graphicReferences.length} image reference(s)`);
	}
    
    // STEP 5: Refresh the requirement element
    console.log("\n[5/6] Refreshing requirement content...");
    
    try {
        const contentHelper = viewmodel.ContentGeneration();
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
    if (imageIds.length > 0) {
        console.log(`Image references: ${imageIds.length}`);
    }
    
    return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement,
        movedElements: includedCount,
        imageReferences: imageIds.length
    };
})();

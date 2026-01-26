//Convert seleted text, lists, and tables into a Requirement from a Tech Doc
// Complete workflow: Copy elements, create Requirement, update content, refresh
(async function() {
    const viewmodel = window.viewController.viewContext.data.structuredDocument;
    const actionsHelper = viewmodel.ActionsHelper();
    const clipboard = viewmodel.Clipboard();
    const aras = window.aras || top.aras;
    
    console.log("=== Starting Requirement Creation Workflow ===\n");
    
    // Get selected elements
    const selectedItems = viewmodel.GetSelectedItems();
    
    if (!selectedItems || selectedItems.length === 0) {
        console.error("❌ No elements selected");
        return;
    }
    
    console.log(`Selected ${selectedItems.length} element(s)`);
    selectedItems.forEach((item, i) => {
        console.log(`  [${i}] ${item.nodeName}`);
    });
    
    // STEP 1: Copy selected elements to clipboard
    console.log("\n--- STEP 1: Copy to Clipboard ---");
    actionsHelper.executeAction('copyelement', {
        selectedItems: selectedItems,
        clipboard: clipboard
    });
    
    const clipboardData = clipboard.getData('StructureXml');
    console.log("✅ Copied to clipboard");
    console.log("  Content elements:", clipboardData.content.length);
    console.log("  References:", Object.keys(clipboardData.references).filter(k => k !== '_rootNode').length);
    
    // STEP 2: Create new Requirement (triggers dialog)
    console.log("\n--- STEP 2: Create Requirement ---");
    console.log("Opening Requirement creation dialog...");
    
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
        console.error("❌ Requirement creation was cancelled or failed");
        return;
    }
    
    console.log("✅ Requirement created");
    
    const reqElement = createResult.schemaElement;
    const reqItemNode = createResult.itemNode;
    
    if (!reqElement || !reqItemNode) {
        console.error("❌ Failed to get requirement element or item");
        return;
    }
    
    const reqId = reqItemNode.getAttribute('id');
    const reqNumber = reqItemNode.selectSingleNode('item_number')?.text || 'Unknown';
    
    console.log("  Requirement ID:", reqId);
    console.log("  Requirement Number:", reqNumber);
    console.log("  Element ref-id:", reqElement.origin.getAttribute('ref-id'));
    
    // STEP 3: Build and update the requirement content
    console.log("\n--- STEP 3: Update Requirement Content ---");
    
    // Generate unique GUIDs for XML elements
    function generateGuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16).toUpperCase();
        });
    }
    
    // Helper to escape XML special characters
    function escapeXml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    // Helper to clone node attributes
    function cloneAttributes(sourceNode, targetXml, excludeAttrs = []) {
        const attrs = sourceNode.attributes;
        let attrString = '';
        
        if (attrs) {
            for (let i = 0; i < attrs.length; i++) {
                const attr = attrs[i];
                const attrName = attr.nodeName || attr.name;
                
                // Skip namespace declarations and excluded attributes
                if (!attrName.startsWith('xmlns') && 
                    attrName !== 'aras:id' && 
                    !excludeAttrs.includes(attrName)) {
                    attrString += ` ${attrName}="${escapeXml(attr.value || attr.nodeValue)}"`;
                }
            }
        }
        
        return attrString;
    }
    
    // Function to recursively convert clipboard content to RE-Standard XML
    function convertToREStandard(node, references) {
        const nodeName = node.nodeName || node.tagName;
        
        console.log(`  Processing node: ${nodeName}`);
        
        // Handle different node types according to RE-Standard schema
        if (nodeName === 'Text') {
            const guid = generateGuid();
            const emphNode = node.selectSingleNode('.//aras:emph') || 
                           node.selectSingleNode('.//*[local-name()="emph"]');
            const text = emphNode ? (emphNode.text || emphNode.textContent || '') : '';
            
            if (text) {
                return `<Text aras:id="${guid}"><aras:emph xmlns="" emphtype="text">${escapeXml(text)}</aras:emph></Text>`;
            }
            
        } else if (nodeName === 'List') {
            const guid = generateGuid();
            const listType = node.getAttribute('type') || 'bullet';
            let listXml = `<List xmlns:aras="http://aras.com/ArasTechDoc" type="${listType}" aras:id="${guid}">`;
            
            const listItems = node.childNodes;
            let itemCount = 0;
            
            for (let i = 0; i < listItems.length; i++) {
                const child = listItems[i];
                if (child.nodeType === 1 && (child.nodeName === 'List-Item' || child.tagName === 'List-Item')) {
                    itemCount++;
                    const itemGuid = generateGuid();
                    listXml += `<List-Item aras:id="${itemGuid}">`;
                    
                    const itemChildren = child.childNodes;
                    for (let j = 0; j < itemChildren.length; j++) {
                        const itemChild = itemChildren[j];
                        if (itemChild.nodeType === 1) {
                            const childXml = convertToREStandard(itemChild, references);
                            if (childXml) {
                                listXml += childXml;
                            }
                        }
                    }
                    
                    listXml += `</List-Item>`;
                }
            }
            
            listXml += `</List>`;
            console.log(`    Converted List with ${itemCount} items`);
            return listXml;
            
        } else if (nodeName === 'Table') {
            const guid = generateGuid();
            const attrs = cloneAttributes(node, '', ['aras:id']);
            let tableXml = `<Table xmlns:aras="http://aras.com/ArasTechDoc" aras:id="${guid}"${attrs}>`;
            
            const rows = node.childNodes;
            let rowCount = 0;
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (row.nodeType === 1 && (row.nodeName === 'Row' || row.tagName === 'Row')) {
                    rowCount++;
                    const rowGuid = generateGuid();
                    const rowAttrs = cloneAttributes(row, '', ['aras:id']);
                    tableXml += `<Row aras:id="${rowGuid}"${rowAttrs}>`;
                    
                    const entries = row.childNodes;
                    for (let j = 0; j < entries.length; j++) {
                        const entry = entries[j];
                        if (entry.nodeType === 1 && (entry.nodeName === 'Entry' || entry.tagName === 'Entry')) {
                            const entryGuid = generateGuid();
                            const entryAttrs = cloneAttributes(entry, '', ['aras:id']);
                            tableXml += `<Entry aras:id="${entryGuid}"${entryAttrs}>`;
                            
                            // Process entry contents
                            const entryChildren = entry.childNodes;
                            for (let k = 0; k < entryChildren.length; k++) {
                                const entryChild = entryChildren[k];
                                if (entryChild.nodeType === 1) {
                                    const childXml = convertToREStandard(entryChild, references);
                                    if (childXml) {
                                        tableXml += childXml;
                                    }
                                }
                            }
                            
                            tableXml += `</Entry>`;
                        }
                    }
                    
                    tableXml += `</Row>`;
                }
            }
            
            tableXml += `</Table>`;
            console.log(`    Converted Table with ${rowCount} rows`);
            return tableXml;
            
        } else if (nodeName === 'Graphic') {
            const guid = generateGuid();
            
            // Get image reference information
            const itemId = node.getAttribute('itemId');
            const refId = node.getAttribute('ref-id');
            
            if (itemId && references && references[refId]) {
                // Clone the Graphic with its references
                const attrs = cloneAttributes(node, '', ['aras:id']);
                const graphicXml = `<Graphic xmlns:aras="http://aras.com/ArasTechDoc" aras:id="${guid}"${attrs} />`;
                
                console.log(`    Converted Graphic (itemId: ${itemId})`);
                return graphicXml;
            } else {
                console.log(`    ⚠️ Graphic missing references, skipping`);
            }
            
        } else if (nodeName === 'Title') {
            const guid = generateGuid();
            const emphNode = node.selectSingleNode('.//aras:emph') || 
                           node.selectSingleNode('.//*[local-name()="emph"]');
            const text = emphNode ? (emphNode.text || emphNode.textContent || '') : '';
            
            if (text) {
                return `<Title aras:id="${guid}"><aras:emph xmlns="" emphtype="text">${escapeXml(text)}</aras:emph></Title>`;
            }
            
        } else if (nodeName === 'Subtitle') {
            const guid = generateGuid();
            const text = node.text || node.textContent || '';
            
            if (text) {
                return `<Subtitle aras:id="${guid}">${escapeXml(text)}</Subtitle>`;
            }
            
        } else if (nodeName === 'Label') {
            const guid = generateGuid();
            const emphNode = node.selectSingleNode('.//aras:emph') || 
                           node.selectSingleNode('.//*[local-name()="emph"]');
            const text = emphNode ? (emphNode.text || emphNode.textContent || '') : '';
            
            if (text) {
                return `<Label aras:id="${guid}"><aras:emph xmlns="" emphtype="text">${escapeXml(text)}</aras:emph></Label>`;
            }
            
        } else {
            console.log(`    ⚠️ Unhandled node type: ${nodeName}`);
        }
        
        return '';
    }
    
    // Build the RE-Standard XML wrapper
    const reqTitleGuid = generateGuid();
    const reqNumberGuid = generateGuid();
    const reqChapterGuid = generateGuid();
    const reqInfoGuid = generateGuid();
    const reqRootGuid = generateGuid();
    
    let contentXml = `<Requirement xmlns:aras="http://aras.com/ArasTechDoc" xmlns="http://www.aras.com/REStandard" aras:id="${reqRootGuid}" reqId="${reqId}">`;
    contentXml += `<Requirement-Info aras:id="${reqInfoGuid}">`;
    contentXml += `<Requirement-Chapter aras:id="${reqChapterGuid}"><aras:emph emphtype="text"></aras:emph></Requirement-Chapter>`;
    contentXml += `<Requirement-Title aras:id="${reqTitleGuid}"><aras:emph emphtype="text">${escapeXml(reqNumber)}</aras:emph></Requirement-Title>`;
    contentXml += `<Requirement-Number aras:id="${reqNumberGuid}"><aras:emph emphtype="text">${escapeXml(reqNumber)}</aras:emph></Requirement-Number>`;
    contentXml += `</Requirement-Info>`;
    
    // Add the copied content
    console.log("\nProcessing copied content:");
    for (let i = 0; i < clipboardData.content.length; i++) {
        const contentNode = clipboardData.content[i];
        const convertedXml = convertToREStandard(contentNode, clipboardData.references);
        if (convertedXml) {
            contentXml += convertedXml;
        }
    }
    
    contentXml += `</Requirement>`;
    
    console.log("\n✅ Built requirement content XML");
    console.log("Content length:", contentXml.length);
    
    // Update the requirement item with the content
    console.log("\nUpdating requirement item in database...");
    
    const updateAml = `<Item type="re_Requirement" action="edit" id="${reqId}">
        <content><![CDATA[${contentXml}]]></content>
    </Item>`;
    
    try {
        const updateResult = aras.soapSend('ApplyItem', updateAml);
        
        let hasError = false;
        
        if (typeof updateResult === 'string') {
            hasError = updateResult.includes('SOAP-ENV:Fault') || updateResult.includes('faultstring');
        } else if (updateResult.node) {
            const resultNode = updateResult.node;
            hasError = resultNode.selectSingleNode('//faultstring') !== null ||
                      resultNode.selectSingleNode('//SOAP-ENV:Fault') !== null ||
                      resultNode.getAttribute('isError') === '1';
        }
        
        if (hasError) {
            console.error("❌ Failed to update requirement content");
            console.error("Result:", updateResult);
            return;
        }
        
        console.log("✅ Requirement content updated in database");
        
    } catch (error) {
        console.error("❌ Error updating requirement:", error);
        return;
    }
    
    // STEP 4: Refresh the requirement element in the document
    console.log("\n--- STEP 4: Refresh Element ---");
    
    const updatedReqItem = aras.getItemById('re_Requirement', reqId);
    
    if (updatedReqItem) {
        const contentNode = updatedReqItem.selectSingleNode('content');
        
        if (contentNode && contentNode.text) {
            console.log("Got updated content from database");
            
            const contentDoc = new XmlDocument();
            contentDoc.loadXML(contentNode.text);
            const reqContentNode = contentDoc.documentElement;
            
            const externalProvider = viewmodel.OriginExternalProvider();
            externalProvider.Update(reqContentNode);
            
            console.log("✅ External content updated");
        }
    }
    
    viewmodel.invalidateElement(reqElement);
    console.log("✅ Element refreshed");
    
    viewmodel.SetSelectedItems([reqElement]);
    
    console.log("\n=== Workflow Complete ===");
    console.log("✅ Created requirement:", reqNumber);
    
    return {
        requirementId: reqId,
        requirementNumber: reqNumber,
        element: reqElement,
        contentXml: contentXml
    };
})();

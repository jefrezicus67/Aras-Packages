//was tested from DEVCONSOLE

const viewmodel = window.viewController.viewContext.data.structuredDocument;

function convertTextToChapter() {
    const selectedItems = viewmodel.GetSelectedItems();
    
    if (!selectedItems || selectedItems.length === 0) {
        console.error("❌ No element selected");
        return;
    }
    
    const selectedItem = selectedItems[0];
    console.log("Selected element:", selectedItem.nodeName, selectedItem);
    
    if (selectedItem.nodeName !== 'Text') {
        console.error(`❌ Selected element must be 'Text', but found: '${selectedItem.nodeName}'`);
        return;
    }
    
    const parent = selectedItem.Parent;
    if (!parent) {
        console.error("❌ Selected element has no parent");
        return;
    }
    
    const xmlSchemaHelper = viewmodel.Schema();
    const childList = parent.ChildItems();
    const insertPosition = childList.index(selectedItem);
    
    // Get text content from the Text element
    const originNode = selectedItem.origin;
    console.log("Original text origin XML:", originNode.xml || new XMLSerializer().serializeToString(originNode));
    
    const emphNode = originNode.selectSingleNode('.//aras:emph') || 
                     originNode.selectSingleNode('.//*[local-name()="emph"]');
    const textContent = emphNode ? (emphNode.text || emphNode.textContent) : "";
    
    console.log("Text content to convert:", textContent);
    
    // Create Chapter element
    const chapterElement = viewmodel.CreateElement('element', { type: 'Chapter' });
    console.log("Created Chapter element:", chapterElement);
    
    if (!chapterElement) {
        console.error("❌ Failed to create Chapter element");
        return;
    }
    
    // Create Title element
    const titleElement = viewmodel.CreateElement('element', { type: 'Title' });
    console.log("Created Title element:", titleElement);
    console.log("Title origin XML:", titleElement.origin.xml || new XMLSerializer().serializeToString(titleElement.origin));
    
    if (!titleElement) {
        console.error("❌ Failed to create Title element");
        return;
    }
    
    // Set text content in Title - try multiple approaches
    const titleOrigin = titleElement.origin;
    
    // Try to find emph node with different selectors
    let titleEmphNode = titleOrigin.selectSingleNode('.//aras:emph');
    if (!titleEmphNode) {
        titleEmphNode = titleOrigin.selectSingleNode('.//*[local-name()="emph"]');
    }
    
    console.log("Title emph node found:", titleEmphNode);
    
    if (titleEmphNode) {
        titleEmphNode.text = textContent;
        console.log("Set text via emph.text");
    } else {
        // If no emph node, try setting directly or use the Text element's method
        console.log("No emph node found, trying alternative methods");
        
        // Try using the element's method if it exists
        if (typeof titleElement.SetTextContent === 'function') {
            titleElement.SetTextContent(textContent);
            console.log("Set text via SetTextContent");
        } else if (typeof titleElement.InsertText === 'function') {
            titleElement.InsertText(0, textContent);
            console.log("Set text via InsertText");
        } else {
            console.error("❌ Could not find method to set text");
        }
    }
    
    console.log("Title after text set:", titleElement.origin.xml || new XMLSerializer().serializeToString(titleElement.origin));
    
    // Add Title to Chapter
    const chapterChildren = chapterElement.ChildItems();
    chapterChildren.insertAt(0, titleElement);
    
    // Validate Chapter can be inserted
    const chapterValidation = xmlSchemaHelper.TryCandidatesAt({
        context: selectedItem,
        values: [chapterElement],
        mode: 'before'
    });
    
    if (!chapterValidation.isValid) {
        console.error("❌ Chapter element cannot be inserted at this position");
        console.log("Validation result:", chapterValidation);
        return;
    }
    
    // Replace Text with Chapter
    childList.splice(insertPosition, 1);
    childList.insertAt(insertPosition, chapterElement);
    
    // Select the new Chapter element
    viewmodel.SetSelectedItems([chapterElement]);
    
    console.log("✅ Successfully converted Text to Chapter");
    return chapterElement;
}

// Run the conversion
convertTextToChapter();

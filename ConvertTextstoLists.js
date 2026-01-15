//RUN FROM DEV CONSOLE:
const viewmodel = window.viewController.viewContext.data.structuredDocument;

function convertTextsToList() {
    const selectedItems = viewmodel.GetSelectedItems();
    
    if (!selectedItems || selectedItems.length === 0) {
        console.error("❌ No elements selected");
        return false;
    }
    
    // Filter to only Text elements
    const textElements = selectedItems.filter(item => item.nodeName === 'Text');
    
    if (textElements.length === 0) {
        console.error("❌ No Text elements selected");
        return false;
    }
    
    console.log(`Converting ${textElements.length} Text element(s) to List`);
    
    const firstText = textElements[0];
    const parent = firstText.Parent;
    
    if (!parent) {
        console.error("❌ First text element has no parent");
        return false;
    }
    
    // Get insert position BEFORE removing elements
    const childList = parent.ChildItems();
    const insertPosition = childList.index(firstText);
    
    console.log("Parent:", parent.nodeName);
    console.log("Insert position:", insertPosition);
    
    // Create List element (comes with one default List-Item)
    const listElement = viewmodel.CreateElement('element', { type: 'List' });
    
    if (!listElement) {
        console.error("❌ Failed to create List element");
        return false;
    }
    
    // Get the default List-Item
    const defaultListItem = listElement.ChildItems().get(0);
    
    // Process each Text element and populate List-Items
    for (let i = 0; i < textElements.length; i++) {
        const textElement = textElements[i];
        const textContent = textElement.GetTextAsString();
        
        console.log(`Processing Text ${i}: "${textContent}"`);
        
        let listItem;
        
        if (i === 0) {
            // Use the default List-Item for the first text
            listItem = defaultListItem;
        } else {
            // Clone the default List-Item for additional items
            listItem = defaultListItem.Clone();
        }
        
        // Get or create the Text element inside the List-Item
        let listItemText = listItem.ChildItems().get(0);
        
        if (!listItemText || listItemText.nodeName !== 'Text') {
            listItemText = viewmodel.CreateElement('element', { type: 'Text' });
            listItem.ChildItems().insertAt(0, listItemText);
        }
        
        // Set text content
        if (textContent && listItemText) {
            const textOrigin = listItemText.origin;
            
            // Clear existing content
            while (textOrigin.firstChild) {
                textOrigin.removeChild(textOrigin.firstChild);
            }
            
            const ownerDoc = textOrigin.ownerDocument;
            const arasNS = 'http://aras.com/ArasTechDoc';
            const emph = ownerDoc.createElementNS(arasNS, 'aras:emph');
            emph.setAttribute('emphtype', 'text');
            emph.setAttribute('xmlns', '');
            emph.text = textContent;
            
            textOrigin.appendChild(emph);
            listItemText.parseOrigin();
            
            console.log(`  Set text: "${textContent}"`);
        }
        
        // Add List-Item to List (skip first one as it's already there)
        if (i > 0) {
            listElement.ChildItems().insertAt(i, listItem);
        }
    }
    
    // Remove the original Text elements AFTER we've processed them all
    for (const textElement of textElements) {
        const textParent = textElement.Parent;
        const textChildList = textParent.ChildItems();
        const textPosition = textChildList.index(textElement);
        textChildList.splice(textPosition, 1);
    }
    
    // Insert the List at the saved position
    childList.insertAt(insertPosition, listElement);
    
    // Select the new List element
    viewmodel.SetSelectedItems([listElement]);
    
    // Invalidate the element to update the UI
    viewmodel.invalidateElement(listElement);
    
    console.log("✅ Successfully converted Text elements to List");
    return true;
}

// Execute the conversion
convertTextsToList();

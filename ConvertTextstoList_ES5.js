// ES5-Compatible: Convert Text(s) to List - WITH UNDO TRACKING SUSPENSION
(function() {
    var viewmodel = window.viewContext.controls.editorControl.actionsHelper.viewmodel;
    
    function convertTextsToList() {
        var selectedItems = viewmodel.GetSelectedItems();
        
        if (!selectedItems || selectedItems.length === 0) {
            console.error("❌ No elements selected");
            return false;
        }
        
        // Filter to only Text elements
        var textElements = [];
        for (var i = 0; i < selectedItems.length; i++) {
            if (selectedItems[i].nodeName === 'Text') {
                textElements.push(selectedItems[i]);
            }
        }
        
        if (textElements.length === 0) {
            console.error("❌ No Text elements selected");
            return false;
        }
        
        console.log("Converting " + textElements.length + " Text element(s) to List");
        
        var firstText = textElements[0];
        var parent = firstText.Parent;
        
        if (!parent) {
            console.error("❌ First text element has no parent");
            return false;
        }
        
        // Get insert position BEFORE removing elements
        var childList = parent.ChildItems();
        var insertPosition = childList.index(firstText);
        
        console.log("Parent:", parent.nodeName);
        console.log("Insert position:", insertPosition);
        
        // CRITICAL: Suspend invalidation and change tracking during the operation
        console.log("Suspending change tracking...");
        viewmodel.SuspendInvalidation();
        
        try {
            // Create List element (comes with one default List-Item)
            var listElement = viewmodel.CreateElement('element', { type: 'List' });
            
            if (!listElement) {
                console.error("❌ Failed to create List element");
                return false;
            }
            
            // Get the default List-Item
            var defaultListItem = listElement.ChildItems().get(0);
            
            // Process each Text element and populate List-Items
            for (var i = 0; i < textElements.length; i++) {
                var textElement = textElements[i];
                var textContent = textElement.GetTextAsString();
                
                console.log("Processing Text " + i + ": \"" + textContent + "\"");
                
                var listItem;
                
                if (i === 0) {
                    // Use the default List-Item for the first text
                    listItem = defaultListItem;
                } else {
                    // Clone the default List-Item for additional items
                    listItem = defaultListItem.Clone();
                }
                
                // Get or create the Text element inside the List-Item
                var listItemText = listItem.ChildItems().get(0);
                
                if (!listItemText || listItemText.nodeName !== 'Text') {
                    listItemText = viewmodel.CreateElement('element', { type: 'Text' });
                    listItem.ChildItems().insertAt(0, listItemText);
                }
                
                // Set text content
                if (textContent && listItemText) {
                    var textOrigin = listItemText.origin;
                    
                    // Clear existing content
                    while (textOrigin.firstChild) {
                        textOrigin.removeChild(textOrigin.firstChild);
                    }
                    
                    var ownerDoc = textOrigin.ownerDocument;
                    var arasNS = 'http://aras.com/ArasTechDoc';
                    var emph = ownerDoc.createElementNS(arasNS, 'aras:emph');
                    emph.setAttribute('emphtype', 'text');
                    emph.setAttribute('xmlns', '');
                    emph.text = textContent;
                    
                    textOrigin.appendChild(emph);
                    listItemText.parseOrigin();
                    
                    console.log("  Set text: \"" + textContent + "\"");
                }
                
                // Add List-Item to List (skip first one as it's already there)
                if (i > 0) {
                    listElement.ChildItems().insertAt(i, listItem);
                }
            }
            
            // Remove the original Text elements AFTER we've processed them all
            for (var i = 0; i < textElements.length; i++) {
                var textElement = textElements[i];
                var textParent = textElement.Parent;
                var textChildList = textParent.ChildItems();
                var textPosition = textChildList.index(textElement);
                textChildList.splice(textPosition, 1);
            }
            
            // Insert the List at the saved position
            childList.insertAt(insertPosition, listElement);
            
            // Select the new List element
            viewmodel.SetSelectedItems([listElement]);
            
        } finally {
            // CRITICAL: Always resume invalidation, even if there's an error
            console.log("Resuming change tracking...");
            viewmodel.ResumeInvalidation();
            
            // Manually invalidate the parent to update the UI
            viewmodel.invalidateElement(parent);
        }
        
        console.log("✅ Successfully converted Text elements to List");
        return true;
    }
    
    // Execute the conversion
    return convertTextsToList();
})();

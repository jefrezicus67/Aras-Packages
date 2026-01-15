// ES5-Compatible: Convert Text to Chapter
(function() {
    var viewmodel = window.viewController.viewContext.data.structuredDocument;
    
    function convertTextToChapter() {
        var selectedItems = viewmodel.GetSelectedItems();
        
        if (!selectedItems || selectedItems.length === 0) {
            console.error("❌ No element selected");
            return false;
        }
        
        var selectedItem = selectedItems[0];
        console.log("Selected element:", selectedItem.nodeName, selectedItem);
        
        if (selectedItem.nodeName !== 'Text') {
            console.error("❌ Selected element must be 'Text', but found: '" + selectedItem.nodeName + "'");
            return false;
        }
        
        var parent = selectedItem.Parent;
        if (!parent) {
            console.error("❌ Selected element has no parent");
            return false;
        }
        
        var xmlSchemaHelper = viewmodel.Schema();
        var childList = parent.ChildItems();
        var insertPosition = childList.index(selectedItem);
        
        // Get text content from the Text element
        var textContent = selectedItem.GetTextAsString();
        console.log("Text content:", textContent);
        
        // Create Chapter element (comes with default Title)
        var chapterElement = viewmodel.CreateElement('element', { type: 'Chapter' });
        
        if (!chapterElement) {
            console.error("❌ Failed to create Chapter element");
            return false;
        }
        
        // Get the default Title that comes with Chapter
        var titleElement = chapterElement.ChildItems().get(0);
        
        if (!titleElement || titleElement.nodeName !== 'Title') {
            console.error("❌ Chapter doesn't have default Title");
            return false;
        }
        
        console.log("Using default Title from Chapter");
        
        // Set text content by directly manipulating the XML
        if (textContent) {
            var titleOrigin = titleElement.origin;
            var ownerDoc = titleOrigin.ownerDocument;
            
            // Create emph element with proper namespaces
            var arasNS = 'http://aras.com/ArasTechDoc';
            var emph = ownerDoc.createElementNS(arasNS, 'aras:emph');
            emph.setAttribute('emphtype', 'text');
            emph.setAttribute('xmlns', ''); // Remove default namespace on emph
            emph.text = textContent;
            
            // Add emph to Title
            titleOrigin.appendChild(emph);
            
            console.log("✅ Text set in Title:", textContent);
            
            // Parse the origin to update the element's internal state
            titleElement.parseOrigin();
            
            // Verify it worked
            console.log("Title GetTextAsString after parse:", titleElement.GetTextAsString());
        }
        
        // Validate Chapter can be inserted
        var chapterValidation = xmlSchemaHelper.TryCandidatesAt({
            context: selectedItem,
            values: [chapterElement],
            mode: 'before'
        });
        
        if (!chapterValidation.isValid) {
            console.error("❌ Chapter element cannot be inserted at this position");
            console.log("Validation result:", chapterValidation);
            return false;
        }
        
        // Replace Text with Chapter
        childList.splice(insertPosition, 1);
        childList.insertAt(insertPosition, chapterElement);
        
        // Select the new Chapter element
        viewmodel.SetSelectedItems([chapterElement]);
        
        // Invalidate the element to update the UI
        viewmodel.invalidateElement(chapterElement);
        
        console.log("✅ Successfully converted Text to Chapter");
        return true;
    }
    
    // Execute the conversion
    return convertTextToChapter();
})();

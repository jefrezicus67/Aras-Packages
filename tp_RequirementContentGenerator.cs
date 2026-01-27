//MethodTemplateName=CSharp:Aras.TDF.ContentGenerator(Strict);
//Inserts the content of a requirement from the <content> property into the technical document

ItemDocumentElement targetItem = targetElement as ItemDocumentElement;

if (targetItem != null)
{
    targetItem.ClearChilds();
    
    // If referenced item was set
    if (!targetItem.IsEmpty)
    {
        Innovator inn = this.Factory.InnovatorInstance;
        
        // Get the requirement content
        Item contentRequest = inn.newItem("re_Requirement", "get");
        contentRequest.setID(targetItem.GetItemProperty("id"));
        contentRequest.setAttribute("select", "content");
        contentRequest = contentRequest.apply();
        
        if (!contentRequest.isError())
        {
            string contentXml = contentRequest.getProperty("content");
            
            if (!string.IsNullOrEmpty(contentXml))
            {
                // Wrap the content in a proper aras:document structure
                string wrappedXml = WrapInDocument(contentXml);
                
                XmlDocument xmlDoc = new XmlDocument();
                xmlDoc.LoadXml(wrappedXml);
                
                // Now ParseDocument should work
                DocumentSchemaElement rootContent = this.Factory.ParseDocument(xmlDoc) as DocumentSchemaElement;
                
                if (rootContent != null)
                {
                    // Find the Requirement element in the content
                    DocumentSchemaElement requirementElement = FindRequirementElement(rootContent);
                    
                    if (requirementElement != null)
                    {
                        // Copy all child elements (except Requirement-Info) to the target
                        CopyRequirementChildren(requirementElement, targetItem);
                    }
                }
            }
        }
    }
}

// Wrap content in proper document structure for ParseDocument
string WrapInDocument(string contentXml)
{
    // Check if already wrapped in aras:document
    if (contentXml.Contains("<aras:document"))
    {
        return contentXml;
    }
    
    // Check if it starts with aras:content
    if (contentXml.TrimStart().StartsWith("<aras:content"))
    {
        // Wrap in aras:document
        return string.Format(
            "<aras:document xmlns:aras=\"http://aras.com/ArasTechDoc\">{0}</aras:document>",
            contentXml
        );
    }
    
    // Otherwise, wrap in both aras:document and aras:content
    return string.Format(
        "<aras:document xmlns:aras=\"http://aras.com/ArasTechDoc\"><aras:content>{0}</aras:content></aras:document>",
        contentXml
    );
}

// Find the Requirement element in the parsed content
DocumentSchemaElement FindRequirementElement(DocumentSchemaElement rootElement)
{
    // Check if root is the Requirement
    if (rootElement.NodeName == "Requirement")
    {
        return rootElement;
    }
    
    // Search children recursively
    foreach (DocumentSchemaNode child in rootElement.GetAllChildren())
    {
        DocumentSchemaElement childElement = child as DocumentSchemaElement;
        if (childElement != null && childElement.NodeName == "Requirement")
        {
            return childElement;
        }
    }
    
    return null;
}

// Copy child elements from requirement content to target element in TD
void CopyRequirementChildren(DocumentSchemaElement sourceRequirement, ItemDocumentElement targetItem)
{
    foreach (DocumentSchemaNode child in sourceRequirement.Childs)
    {
        DocumentSchemaElement childElement = child as DocumentSchemaElement;
        
        if (childElement == null)
            continue;
        
        // Skip Requirement-Info (metadata)
        if (childElement.NodeName == "Requirement-Info")
            continue;
        
        // Clone and add all other elements (Text, List, Table, Graphic, etc.)
        DocumentSchemaElement clonedElement = childElement.Clone() as DocumentSchemaElement;
        
        if (clonedElement != null)
        {
            targetItem.AddChild(clonedElement);
        }
    }
}

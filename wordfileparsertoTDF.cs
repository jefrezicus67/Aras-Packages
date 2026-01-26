// Add references at the top (no "using" keyword)
// System, System.IO, System.Text, System.Xml are already available
// DocumentFormat.OpenXml, DocumentFormat.OpenXml.Packaging, DocumentFormat.OpenXml.Wordprocessing
// Uses OpenXml to read a docx and write it to Technical Document
// Code is NOT tested.  Primarily a reference on how to use the OpenXml calls in a way which will compile in Aras

    Innovator inn = this.getInnovator();
    Item inItem = this;

    try
    {
        // Get the file item
        string fileId = inItem.getProperty("file_id", "");
        if (string.IsNullOrEmpty(fileId))
        {
            return inItem.getInnovator().newError("No file specified");
        }
        
        // Get the file content
        Item fileItem = inItem.getInnovator().newItem("File", "get");
        fileItem.setID(fileId);
        fileItem.setAttribute("select", "filename,checkedout_path");
        fileItem = fileItem.apply();
        
        if (fileItem.isError())
        {
            return fileItem;
        }
        
        // Get the physical file path
        string filePath = fileItem.getProperty("checkedout_path", "");
        
        // Try to get vault path - use the one that works for your Aras version
        /*
        string vaultPath = inn.getProperty("VaultServerURL", "");
        if (string.IsNullOrEmpty(vaultPath))
        {
            // Fallback: try to construct from database connection info
            vaultPath = this.getInnovator().getConnection().GetDatabaseProperty("VaultServerURL", "");
        }
        */

        string vaultPath = "";

        string fullPath = System.IO.Path.Combine(vaultPath, filePath);
        
        // Parse the Word document using reflection
        string tdfXml = ParseWordDocumentUsingReflection(fullPath, inItem);
        
        // Return the result
        inItem.setProperty("result", tdfXml);
        return inItem;
    }
    catch (System.Exception ex)
    {
        return inItem.getInnovator().newError("Error parsing Word document: " + ex.Message + "\n" + ex.StackTrace);
    }
}

private string ParseWordDocumentUsingReflection(string filePath, Item inItem)
{
    System.Text.StringBuilder tdfContent = new System.Text.StringBuilder();
    
    // Load the DocumentFormat.OpenXml assembly
    System.Reflection.Assembly openXmlAssembly = System.Reflection.Assembly.Load("DocumentFormat.OpenXml, Version=2.5.0.0, Culture=neutral, PublicKeyToken=8fb06cb64d019a17");
    
    // Get the WordprocessingDocument type
    System.Type wordDocType = openXmlAssembly.GetType("DocumentFormat.OpenXml.Packaging.WordprocessingDocument");
    
    // Call WordprocessingDocument.Open(filePath, false)
    System.Reflection.MethodInfo openMethod = wordDocType.GetMethod("Open", new System.Type[] { typeof(string), typeof(bool) });
    object wordDoc = openMethod.Invoke(null, new object[] { filePath, false });
    
    try
    {
        // Get MainDocumentPart property
        System.Reflection.PropertyInfo mainPartProp = wordDocType.GetProperty("MainDocumentPart");
        object mainPart = mainPartProp.GetValue(wordDoc, null);
        
        // Get Document property
        System.Reflection.PropertyInfo documentProp = mainPart.GetType().GetProperty("Document");
        object document = documentProp.GetValue(mainPart, null);
        
        // Get Body property
        System.Reflection.PropertyInfo bodyProp = document.GetType().GetProperty("Body");
        object body = bodyProp.GetValue(document, null);
        
        // Get Elements method
        System.Reflection.MethodInfo elementsMethod = body.GetType().GetMethod("Elements", System.Type.EmptyTypes);
        System.Collections.IEnumerable elements = (System.Collections.IEnumerable)elementsMethod.Invoke(body, null);
        
        // Track list state
        object currentList = null;
        string lastNumId = null;
        
        // Process each element
        foreach (object element in elements)
        {
            string typeName = element.GetType().Name;
            
            if (typeName == "Paragraph")
            {
                // Check if this paragraph is a list item
                string numId = GetNumberingId(element);
                
                if (!string.IsNullOrEmpty(numId))
                {
                    // This is a list item
                    if (numId != lastNumId)
                    {
                        // Close previous list if exists
                        if (currentList != null)
                        {
                            tdfContent.Append("</List>");
                            currentList = null;
                        }
                        
                        // Start new list
                        tdfContent.AppendFormat("<List xmlns:aras=\"http://aras.com/ArasTechDoc\" aras:id=\"{0}\">", GenerateGuid());
                        currentList = new object(); // marker
                        lastNumId = numId;
                    }
                    
                    // Add list item
                    ProcessListItem(element, tdfContent, mainPart, inItem);
                }
                else
                {
                    // Close list if we were in one
                    if (currentList != null)
                    {
                        tdfContent.Append("</List>");
                        currentList = null;
                        lastNumId = null;
                    }
                    
                    // Regular paragraph
                    ProcessParagraphReflection(element, tdfContent, mainPart, inItem);
                }
            }
            else if (typeName == "Table")
            {
                // Close list if we were in one
                if (currentList != null)
                {
                    tdfContent.Append("</List>");
                    currentList = null;
                    lastNumId = null;
                }
                
                ProcessTableReflection(element, tdfContent, mainPart, inItem);
            }
        }
        
        // Close list if still open
        if (currentList != null)
        {
            tdfContent.Append("</List>");
        }
    }
    finally
    {
        if (wordDoc != null)
        {
            System.IDisposable disposable = wordDoc as System.IDisposable;
            if (disposable != null)
            {
                disposable.Dispose();
            }
        }
    }
    
    return WrapInTDFStructure(tdfContent.ToString());
}

// Table-related classes for structured data
private class TableStructure
{
    public int RowCount { get; set; }
    public int ColumnCount { get; set; }
    public bool HasHeaderRow { get; set; }
    public System.Collections.Generic.List<System.Collections.Generic.List<CellData>> Rows { get; set; }
    
    public TableStructure()
    {
        Rows = new System.Collections.Generic.List<System.Collections.Generic.List<CellData>>();
    }
}

private class CellData
{
    public string Text { get; set; }
    public int RowSpan { get; set; }
    public int ColumnSpan { get; set; }
    public bool IsHeader { get; set; }
    public string VerticalAlignment { get; set; }
    public string HorizontalAlignment { get; set; }
    public System.Collections.Generic.List<string> ImageFileIds { get; set; }
    
    public CellData()
    {
        Text = "";
        RowSpan = 1;
        ColumnSpan = 1;
        IsHeader = false;
        ImageFileIds = new System.Collections.Generic.List<string>();
    }
}

private void ProcessTableReflection(object table, System.Text.StringBuilder tdfContent, object mainPart, Item inItem)
{
    // First, analyze the table structure
    TableStructure tableStructure = AnalyzeTableStructure(table, mainPart, inItem);
    
    // Determine if table has a title (caption before table)
    string tableTitle = ""; // Could be enhanced to look for a caption paragraph before the table
    
    // Start Table element with proper TDF structure
    tdfContent.AppendFormat("<Table xmlns:aras=\"http://aras.com/ArasTechDoc\" aras:id=\"{0}\"", GenerateGuid());
    
    // Add table attributes based on structure
    if (tableStructure.ColumnCount > 0)
    {
        tdfContent.AppendFormat(" cols=\"{0}\"", tableStructure.ColumnCount);
    }
    
    tdfContent.Append(">");
    
    // Add table title if present
    if (!string.IsNullOrEmpty(tableTitle))
    {
        tdfContent.AppendFormat("<Title aras:id=\"{0}\"><aras:emph emphtype=\"text\">{1}</aras:emph></Title>", 
            GenerateGuid(), EscapeXml(tableTitle));
    }
    
    // Add TGroup (table group) - required for complex tables
    tdfContent.AppendFormat("<TGroup aras:id=\"{0}\" cols=\"{1}\">", 
        GenerateGuid(), tableStructure.ColumnCount);
    
    // Add column specifications
    for (int i = 0; i < tableStructure.ColumnCount; i++)
    {
        tdfContent.AppendFormat("<ColSpec aras:id=\"{0}\" colnum=\"{1}\" colname=\"col{1}\" />", 
            GenerateGuid(), i + 1);
    }
    
    // Process header rows if present
    if (tableStructure.HasHeaderRow && tableStructure.Rows.Count > 0)
    {
        tdfContent.AppendFormat("<THead aras:id=\"{0}\">", GenerateGuid());
        ProcessTableRow(tableStructure.Rows[0], tdfContent, true);
        tdfContent.Append("</THead>");
        
        // Process body rows
        if (tableStructure.Rows.Count > 1)
        {
            tdfContent.AppendFormat("<TBody aras:id=\"{0}\">", GenerateGuid());
            for (int i = 1; i < tableStructure.Rows.Count; i++)
            {
                ProcessTableRow(tableStructure.Rows[i], tdfContent, false);
            }
            tdfContent.Append("</TBody>");
        }
    }
    else
    {
        // All rows are body rows
        tdfContent.AppendFormat("<TBody aras:id=\"{0}\">", GenerateGuid());
        foreach (System.Collections.Generic.List<CellData> row in tableStructure.Rows)
        {
            ProcessTableRow(row, tdfContent, false);
        }
        tdfContent.Append("</TBody>");
    }
    
    tdfContent.Append("</TGroup>");
    tdfContent.Append("</Table>");
}

private TableStructure AnalyzeTableStructure(object table, object mainPart, Item inItem)
{
    TableStructure structure = new TableStructure();
    
    // Get TableRow elements
    System.Type tableType = table.GetType();
    System.Reflection.MethodInfo elementsMethod = null;
    
    foreach (System.Reflection.MethodInfo method in tableType.GetMethods())
    {
        if (method.Name == "Elements" && method.IsGenericMethod)
        {
            elementsMethod = method;
            break;
        }
    }
    
    if (elementsMethod != null)
    {
        System.Type rowType = tableType.Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.TableRow");
        System.Reflection.MethodInfo genericElements = elementsMethod.MakeGenericMethod(rowType);
        System.Collections.IEnumerable rows = (System.Collections.IEnumerable)genericElements.Invoke(table, null);
        
        int maxColumns = 0;
        bool firstRow = true;
        
        foreach (object row in rows)
        {
            System.Collections.Generic.List<CellData> rowData = new System.Collections.Generic.List<CellData>();
            
            // Get cells in this row
            System.Type cellType = tableType.Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.TableCell");
            System.Reflection.MethodInfo cellElements = elementsMethod.MakeGenericMethod(cellType);
            System.Collections.IEnumerable cells = (System.Collections.IEnumerable)cellElements.Invoke(row, null);
            
            int columnCount = 0;
            foreach (object cell in cells)
            {
                CellData cellData = ExtractCellData(cell, mainPart, inItem);
                
                // Check if first row cells are headers
                if (firstRow)
                {
                    cellData.IsHeader = IsCellHeader(cell);
                    if (cellData.IsHeader)
                    {
                        structure.HasHeaderRow = true;
                    }
                }
                
                rowData.Add(cellData);
                columnCount += cellData.ColumnSpan;
            }
            
            if (columnCount > maxColumns)
            {
                maxColumns = columnCount;
            }
            
            structure.Rows.Add(rowData);
            firstRow = false;
        }
        
        structure.RowCount = structure.Rows.Count;
        structure.ColumnCount = maxColumns;
    }
    
    return structure;
}

private CellData ExtractCellData(object cell, object mainPart, Item inItem)
{
    CellData cellData = new CellData();
    
    // Get cell properties for spans and alignment
    try
    {
        System.Reflection.PropertyInfo propsProp = cell.GetType().GetProperty("TableCellProperties");
        object props = propsProp.GetValue(cell, null);
        
        if (props != null)
        {
            // Get GridSpan (column span)
            System.Reflection.PropertyInfo gridSpanProp = props.GetType().GetProperty("GridSpan");
            if (gridSpanProp != null)
            {
                object gridSpan = gridSpanProp.GetValue(props, null);
                if (gridSpan != null)
                {
                    System.Reflection.PropertyInfo valProp = gridSpan.GetType().GetProperty("Val");
                    if (valProp != null)
                    {
                        object val = valProp.GetValue(gridSpan, null);
                        if (val != null)
                        {
                            int spanValue;
                            if (int.TryParse(val.ToString(), out spanValue))
                            {
                                cellData.ColumnSpan = spanValue;
                            }
                        }
                    }
                }
            }
            
            // Get VerticalMerge (row span) - this is more complex
            System.Reflection.PropertyInfo vMergeProp = props.GetType().GetProperty("VerticalMerge");
            if (vMergeProp != null)
            {
                object vMerge = vMergeProp.GetValue(props, null);
                if (vMerge != null)
                {
                    // Note: Full row span calculation requires tracking across rows
                    // For now, we'll mark it but not calculate the exact span
                    cellData.RowSpan = 1; // Would need multi-pass to calculate properly
                }
            }
            
            // Get vertical alignment
            System.Reflection.PropertyInfo vAlignProp = props.GetType().GetProperty("TableCellVerticalAlignment");
            if (vAlignProp != null)
            {
                object vAlign = vAlignProp.GetValue(props, null);
                if (vAlign != null)
                {
                    System.Reflection.PropertyInfo valProp = vAlign.GetType().GetProperty("Val");
                    if (valProp != null)
                    {
                        object val = valProp.GetValue(vAlign, null);
                        if (val != null)
                        {
                            cellData.VerticalAlignment = val.ToString();
                        }
                    }
                }
            }
        }
    }
    catch
    {
        // Continue with defaults
    }
    
    // Extract text content from paragraphs
    System.Text.StringBuilder cellText = new System.Text.StringBuilder();
    
    System.Reflection.MethodInfo elementsMethod = null;
    foreach (System.Reflection.MethodInfo method in cell.GetType().GetMethods())
    {
        if (method.Name == "Elements" && method.IsGenericMethod)
        {
            elementsMethod = method;
            break;
        }
    }
    
    if (elementsMethod != null)
    {
        System.Type paraType = cell.GetType().Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.Paragraph");
        System.Reflection.MethodInfo genericElements = elementsMethod.MakeGenericMethod(paraType);
        System.Collections.IEnumerable paras = (System.Collections.IEnumerable)genericElements.Invoke(cell, null);
        
        bool firstPara = true;
        foreach (object para in paras)
        {
            if (!firstPara)
            {
                cellText.Append("\n"); // Preserve paragraph breaks within cell
            }
            
            // Get text
            string paraText = GetParagraphTextReflection(para);
            cellText.Append(paraText);
            
            // Check for images in paragraph
            string imageIds = ProcessImagesInParagraphForCell(para, mainPart, inItem);
            if (!string.IsNullOrEmpty(imageIds))
            {
                // Split multiple image IDs if present
                string[] ids = imageIds.Split(',');
                foreach (string id in ids)
                {
                    if (!string.IsNullOrEmpty(id.Trim()))
                    {
                        cellData.ImageFileIds.Add(id.Trim());
                    }
                }
            }
            
            firstPara = false;
        }
    }
    
    cellData.Text = cellText.ToString().Trim();
    
    return cellData;
}

private bool IsCellHeader(object cell)
{
    try
    {
        // Check if cell has specific styling that indicates header
        System.Reflection.MethodInfo elementsMethod = null;
        foreach (System.Reflection.MethodInfo method in cell.GetType().GetMethods())
        {
            if (method.Name == "Elements" && method.IsGenericMethod)
            {
                elementsMethod = method;
                break;
            }
        }
        
        if (elementsMethod != null)
        {
            System.Type paraType = cell.GetType().Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.Paragraph");
            System.Reflection.MethodInfo genericElements = elementsMethod.MakeGenericMethod(paraType);
            System.Collections.IEnumerable paras = (System.Collections.IEnumerable)genericElements.Invoke(cell, null);
            
            foreach (object para in paras)
            {
                // Check for bold formatting in runs
                System.Reflection.MethodInfo runElementsMethod = elementsMethod;
                System.Type runType = para.GetType().Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.Run");
                System.Reflection.MethodInfo genericRunElements = runElementsMethod.MakeGenericMethod(runType);
                System.Collections.IEnumerable runs = (System.Collections.IEnumerable)genericRunElements.Invoke(para, null);
                
                foreach (object run in runs)
                {
                    System.Reflection.PropertyInfo runPropsProp = run.GetType().GetProperty("RunProperties");
                    if (runPropsProp != null)
                    {
                        object runProps = runPropsProp.GetValue(run, null);
                        if (runProps != null)
                        {
                            // Check for Bold property
                            System.Reflection.PropertyInfo boldProp = runProps.GetType().GetProperty("Bold");
                            if (boldProp != null)
                            {
                                object bold = boldProp.GetValue(runProps, null);
                                if (bold != null)
                                {
                                    return true; // Has bold formatting, likely a header
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    catch
    {
        // Continue
    }
    
    return false;
}

private void ProcessTableRow(System.Collections.Generic.List<CellData> rowData, System.Text.StringBuilder tdfContent, bool isHeader)
{
    tdfContent.AppendFormat("<Row aras:id=\"{0}\">", GenerateGuid());
    
    foreach (CellData cellData in rowData)
    {
        // Start Entry element
        tdfContent.AppendFormat("<Entry aras:id=\"{0}\"", GenerateGuid());
        
        // Add column span if > 1
        if (cellData.ColumnSpan > 1)
        {
            tdfContent.AppendFormat(" namest=\"col1\" nameend=\"col{0}\"", cellData.ColumnSpan);
        }
        
        // Add row span if > 1 (morerows = rowspan - 1)
        if (cellData.RowSpan > 1)
        {
            tdfContent.AppendFormat(" morerows=\"{0}\"", cellData.RowSpan - 1);
        }
        
        // Add vertical alignment
        if (!string.IsNullOrEmpty(cellData.VerticalAlignment))
        {
            string valign = "middle"; // default
            if (cellData.VerticalAlignment.ToLower().Contains("top"))
                valign = "top";
            else if (cellData.VerticalAlignment.ToLower().Contains("bottom"))
                valign = "bottom";
            
            tdfContent.AppendFormat(" valign=\"{0}\"", valign);
        }
        
        tdfContent.Append(">");
        
        // Add text content
        if (!string.IsNullOrEmpty(cellData.Text))
        {
            // Check if text contains line breaks
            if (cellData.Text.Contains("\n"))
            {
                // Multiple paragraphs - wrap each in Para element
                string[] paragraphs = cellData.Text.Split('\n');
                foreach (string para in paragraphs)
                {
                    if (!string.IsNullOrWhiteSpace(para))
                    {
                        tdfContent.AppendFormat("<Para aras:id=\"{0}\"><aras:emph xmlns=\"\" emphtype=\"text\">{1}</aras:emph></Para>", 
                            GenerateGuid(), EscapeXml(para.Trim()));
                    }
                }
            }
            else
            {
                // Single paragraph
                tdfContent.AppendFormat("<aras:emph xmlns=\"\" emphtype=\"text\">{0}</aras:emph>", 
                    EscapeXml(cellData.Text));
            }
        }
        
        // Add images if present
        foreach (string imageFileId in cellData.ImageFileIds)
        {
            tdfContent.AppendFormat("<Figure xmlns:aras=\"http://aras.com/ArasTechDoc\" aras:id=\"{0}\" fileId=\"{1}\"><Caption aras:id=\"{2}\"><aras:emph emphtype=\"text\">Image</aras:emph></Caption></Figure>", 
                GenerateGuid(), imageFileId, GenerateGuid());
        }
        
        tdfContent.Append("</Entry>");
    }
    
    tdfContent.Append("</Row>");
}

private string ProcessImagesInParagraphForCell(object para, object mainPart, Item inItem)
{
    System.Collections.Generic.List<string> imageIds = new System.Collections.Generic.List<string>();
    
    try
    {
        // Get all descendants to find Drawing elements
        System.Reflection.MethodInfo descendantsMethod = null;
        foreach (System.Reflection.MethodInfo method in para.GetType().GetMethods())
        {
            if (method.Name == "Descendants" && method.IsGenericMethod)
            {
                descendantsMethod = method;
                break;
            }
        }
        
        if (descendantsMethod != null)
        {
            // Get Drawing type
            System.Type drawingType = para.GetType().Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.Drawing");
            System.Reflection.MethodInfo genericDescendants = descendantsMethod.MakeGenericMethod(drawingType);
            System.Collections.IEnumerable drawings = (System.Collections.IEnumerable)genericDescendants.Invoke(para, null);
            
            foreach (object drawing in drawings)
            {
                string imageFileId = ExtractAndUploadImage(drawing, mainPart, inItem);
                
                if (!string.IsNullOrEmpty(imageFileId))
                {
                    imageIds.Add(imageFileId);
                }
            }
        }
    }
    catch
    {
        // Continue processing
    }
    
    return string.Join(",", imageIds.ToArray());
}

private string GetNumberingId(object para)
{
    try
    {
        // Get ParagraphProperties
        System.Reflection.PropertyInfo propsProp = para.GetType().GetProperty("ParagraphProperties");
        object props = propsProp.GetValue(para, null);
        
        if (props != null)
        {
            // Get NumberingProperties
            System.Reflection.PropertyInfo numPropsProp = props.GetType().GetProperty("NumberingProperties");
            object numProps = numPropsProp.GetValue(props, null);
            
            if (numProps != null)
            {
                // Get NumberingId
                System.Reflection.PropertyInfo numIdProp = numProps.GetType().GetProperty("NumberingId");
                object numId = numIdProp.GetValue(numProps, null);
                
                if (numId != null)
                {
                    // Get Val property
                    System.Reflection.PropertyInfo valProp = numId.GetType().GetProperty("Val");
                    if (valProp != null)
                    {
                        object val = valProp.GetValue(numId, null);
                        if (val != null)
                        {
                            return val.ToString();
                        }
                    }
                }
            }
        }
    }
    catch
    {
        // Not a list item
    }
    
    return null;
}

private void ProcessListItem(object para, System.Text.StringBuilder tdfContent, object mainPart, Item inItem)
{
    string text = GetParagraphTextReflection(para);
    
    // Check for images in this paragraph
    string imageContent = ProcessImagesInParagraph(para, mainPart, inItem);
    
    if (!string.IsNullOrWhiteSpace(text) || !string.IsNullOrWhiteSpace(imageContent))
    {
        tdfContent.AppendFormat("<List-Item xmlns:aras=\"http://aras.com/ArasTechDoc\" aras:id=\"{0}\">", GenerateGuid());
        
        if (!string.IsNullOrWhiteSpace(text))
        {
            tdfContent.AppendFormat("<aras:emph xmlns=\"\" emphtype=\"text\">{0}</aras:emph>", EscapeXml(text));
        }
        
        if (!string.IsNullOrWhiteSpace(imageContent))
        {
            tdfContent.Append(imageContent);
        }
        
        tdfContent.Append("</List-Item>");
    }
}

private void ProcessParagraphReflection(object para, System.Text.StringBuilder tdfContent, object mainPart, Item inItem)
{
    string text = GetParagraphTextReflection(para);
    
    // Check for images in this paragraph
    string imageContent = ProcessImagesInParagraph(para, mainPart, inItem);
    
    if (string.IsNullOrWhiteSpace(text) && string.IsNullOrWhiteSpace(imageContent))
    {
        return;
    }
    
    // Check if this is a heading
    string styleName = GetParagraphStyle(para);
    
    if (styleName.StartsWith("Heading"))
    {
        int level = GetHeadingLevel(styleName);
        if (level == 1)
        {
            tdfContent.AppendFormat("<Chapter xmlns:aras=\"http://aras.com/ArasTechDoc\" aras:id=\"{0}\"><aras:emph emphtype=\"text\">{1}</aras:emph></Chapter>", 
                GenerateGuid(), EscapeXml(text));
        }
        else
        {
            tdfContent.AppendFormat("<Title xmlns:aras=\"http://aras.com/ArasTechDoc\" aras:id=\"{0}\"><aras:emph emphtype=\"text\">{1}</aras:emph></Title>", 
                GenerateGuid(), EscapeXml(text));
        }
    }
    else
    {
        // Regular paragraph becomes Text element
        tdfContent.AppendFormat("<Text xmlns:aras=\"http://aras.com/ArasTechDoc\" xmlns=\"http://www.aras.com/REStandard\" aras:id=\"{0}\">", GenerateGuid());
        
        if (!string.IsNullOrWhiteSpace(text))
        {
            tdfContent.AppendFormat("<aras:emph xmlns=\"\" emphtype=\"text\">{0}</aras:emph>", EscapeXml(text));
        }
        
        if (!string.IsNullOrWhiteSpace(imageContent))
        {
            tdfContent.Append(imageContent);
        }
        
        tdfContent.Append("</Text>");
    }
}

private string ProcessImagesInParagraph(object para, object mainPart, Item inItem)
{
    System.Text.StringBuilder imageXml = new System.Text.StringBuilder();
    
    try
    {
        // Get all descendants to find Drawing elements
        System.Reflection.MethodInfo descendantsMethod = null;
        foreach (System.Reflection.MethodInfo method in para.GetType().GetMethods())
        {
            if (method.Name == "Descendants" && method.IsGenericMethod)
            {
                descendantsMethod = method;
                break;
            }
        }
        
        if (descendantsMethod != null)
        {
            // Get Drawing type
            System.Type drawingType = para.GetType().Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.Drawing");
            System.Reflection.MethodInfo genericDescendants = descendantsMethod.MakeGenericMethod(drawingType);
            System.Collections.IEnumerable drawings = (System.Collections.IEnumerable)genericDescendants.Invoke(para, null);
            
            foreach (object drawing in drawings)
            {
                string imageFileId = ExtractAndUploadImage(drawing, mainPart, inItem);
                
                if (!string.IsNullOrEmpty(imageFileId))
                {
                    // Create TDF Figure element
                    imageXml.AppendFormat("<Figure xmlns:aras=\"http://aras.com/ArasTechDoc\" aras:id=\"{0}\" fileId=\"{1}\"><Caption aras:id=\"{2}\"><aras:emph emphtype=\"text\">Image</aras:emph></Caption></Figure>", 
                        GenerateGuid(), imageFileId, GenerateGuid());
                }
            }
        }
    }
    catch (System.Exception ex)
    {
        // Log error but continue processing
    }
    
    return imageXml.ToString();
}

private string ExtractAndUploadImage(object drawing, object mainPart, Item inItem)
{
    try
    {
        // Navigate through the drawing structure to find the image relationship ID
        System.Reflection.MethodInfo descendantsMethod = null;
        foreach (System.Reflection.MethodInfo method in drawing.GetType().GetMethods())
        {
            if (method.Name == "Descendants" && method.IsGenericMethod)
            {
                descendantsMethod = method;
                break;
            }
        }
        
        if (descendantsMethod == null) return null;
        
        // Get Blip type (contains the relationship ID)
        System.Type blipType = drawing.GetType().Assembly.GetType("DocumentFormat.OpenXml.Drawing.Blip");
        System.Reflection.MethodInfo genericDescendants = descendantsMethod.MakeGenericMethod(blipType);
        System.Collections.IEnumerable blips = (System.Collections.IEnumerable)genericDescendants.Invoke(drawing, null);
        
        foreach (object blip in blips)
        {
            // Get Embed property (this is the relationship ID)
            System.Reflection.PropertyInfo embedProp = blip.GetType().GetProperty("Embed");
            if (embedProp != null)
            {
                object embedObj = embedProp.GetValue(blip, null);
                if (embedObj != null)
                {
                    // Get the string value
                    System.Reflection.PropertyInfo valProp = embedObj.GetType().GetProperty("Value");
                    if (valProp != null)
                    {
                        string relationshipId = (string)valProp.GetValue(embedObj, null);
                        
                        if (!string.IsNullOrEmpty(relationshipId))
                        {
                            // Get the image part using the relationship ID
                            return ExtractImageFromPart(mainPart, relationshipId, inItem);
                        }
                    }
                }
            }
        }
    }
    catch (System.Exception ex)
    {
        // Log error but continue
    }
    
    return null;
}

private string ExtractImageFromPart(object mainPart, string relationshipId, Item inItem)
{
    try
    {
        // Get the image part from the relationship
        System.Reflection.MethodInfo getPartMethod = mainPart.GetType().GetMethod("GetPartById");
        if (getPartMethod != null)
        {
            object imagePart = getPartMethod.Invoke(mainPart, new object[] { relationshipId });
            
            if (imagePart != null)
            {
                // Get the stream from the image part
                System.Reflection.MethodInfo getStreamMethod = imagePart.GetType().GetMethod("GetStream", System.Type.EmptyTypes);
                if (getStreamMethod != null)
                {
                    System.IO.Stream imageStream = (System.IO.Stream)getStreamMethod.Invoke(imagePart, null);
                    
                    // Get content type
                    System.Reflection.PropertyInfo contentTypeProp = imagePart.GetType().GetProperty("ContentType");
                    string contentType = "";
                    if (contentTypeProp != null)
                    {
                        contentType = (string)contentTypeProp.GetValue(imagePart, null);
                    }
                    
                    // Determine file extension from content type
                    string extension = GetExtensionFromContentType(contentType);
                    
                    // Upload image to Aras vault
                    string fileId = UploadImageToVault(imageStream, extension, inItem);
                    
                    imageStream.Close();
                    
                    return fileId;
                }
            }
        }
    }
    catch (System.Exception ex)
    {
        // Log error but continue
    }
    
    return null;
}

private string GetExtensionFromContentType(string contentType)
{
    if (contentType.Contains("png"))
        return ".png";
    else if (contentType.Contains("jpeg") || contentType.Contains("jpg"))
        return ".jpg";
    else if (contentType.Contains("gif"))
        return ".gif";
    else if (contentType.Contains("bmp"))
        return ".bmp";
    else if (contentType.Contains("tiff"))
        return ".tif";
    else
        return ".png"; // default
}

private string UploadImageToVault(System.IO.Stream imageStream, string extension, Item inItem)
{
    try
    {
        // Read image bytes
        byte[] imageBytes = new byte[imageStream.Length];
        imageStream.Read(imageBytes, 0, imageBytes.Length);
        
        // Create a File item in Aras
        Item fileItem = inItem.getInnovator().newItem("File", "add");
        
        string filename = "image_" + GenerateGuid() + extension;
        fileItem.setProperty("filename", filename);
        
        // Attach the file content
        fileItem.attachPhysicalFile(System.Convert.ToBase64String(imageBytes), filename);
        
        // Apply the item
        Item result = fileItem.apply();
        
        if (!result.isError())
        {
            return result.getID();
        }
    }
    catch (System.Exception ex)
    {
        // Log error
    }
    
    return null;
}

private string GetParagraphStyle(object para)
{
    try
    {
        System.Reflection.PropertyInfo propsProp = para.GetType().GetProperty("ParagraphProperties");
        object props = propsProp.GetValue(para, null);
        
        if (props != null)
        {
            System.Reflection.PropertyInfo styleProp = props.GetType().GetProperty("ParagraphStyleId");
            object styleId = styleProp.GetValue(props, null);
            
            if (styleId != null)
            {
                System.Reflection.PropertyInfo valProp = styleId.GetType().GetProperty("Val");
                if (valProp != null)
                {
                    object val = valProp.GetValue(styleId, null);
                    if (val != null)
                    {
                        return val.ToString();
                    }
                }
            }
        }
    }
    catch
    {
        // Return default
    }
    
    return "Normal";
}

private int GetHeadingLevel(string styleName)
{
    // Extract number from "Heading1", "Heading2", etc.
    if (styleName.Length > 7)
    {
        string levelStr = styleName.Substring(7);
        int level;
        if (int.TryParse(levelStr, out level))
        {
            return level;
        }
    }
    return 1;
}

private string GetParagraphTextReflection(object para)
{
    System.Text.StringBuilder text = new System.Text.StringBuilder();
    
    // Get Elements<Run>() method
    System.Type paraType = para.GetType();
    System.Reflection.MethodInfo elementsMethod = null;
    
    foreach (System.Reflection.MethodInfo method in paraType.GetMethods())
    {
        if (method.Name == "Elements" && method.IsGenericMethod)
        {
            elementsMethod = method;
            break;
        }
    }
    
    if (elementsMethod != null)
    {
        // Get Run type
        System.Type runType = paraType.Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.Run");
        System.Reflection.MethodInfo genericElements = elementsMethod.MakeGenericMethod(runType);
        
        System.Collections.IEnumerable runs = (System.Collections.IEnumerable)genericElements.Invoke(para, null);
        
        foreach (object run in runs)
        {
            // Get Text type
            System.Type textType = paraType.Assembly.GetType("DocumentFormat.OpenXml.Wordprocessing.Text");
            System.Reflection.MethodInfo textElements = elementsMethod.MakeGenericMethod(textType);
            
            System.Collections.IEnumerable textEls = (System.Collections.IEnumerable)textElements.Invoke(run, null);
            
            foreach (object textEl in textEls)
            {
                // Get Text property
                System.Reflection.PropertyInfo textProp = textEl.GetType().GetProperty("Text");
                string textValue = (string)textProp.GetValue(textEl, null);
                text.Append(textValue);
            }
        }
    }
    
    return text.ToString();
}

private string WrapInTDFStructure(string content)
{
    System.Text.StringBuilder xml = new System.Text.StringBuilder();
    xml.Append("<Requirement xmlns:aras=\"http://aras.com/ArasTechDoc\" xmlns=\"http://www.aras.com/REStandard\" aras:id=\"");
    xml.Append(GenerateGuid());
    xml.Append("\">");
    xml.Append(content);
    xml.Append("</Requirement>");
    return xml.ToString();
}

private string GenerateGuid()
{
    return System.Guid.NewGuid().ToString("N").ToUpper();
}

private string EscapeXml(string text)
{
    return System.Security.SecurityElement.Escape(text);
}

private void endOfMethod() {

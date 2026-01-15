//placement Innovator/Client/Modules/aras.innovator.TDF/Scripts/Aras/Client/Controls/TechDoc/Actions/
import type { XmlSchemaElement } from '../ViewModel/XmlSchemaElement';
import { ActionBase } from './ActionBase';

export class ConvertTextToChapterAction extends ActionBase {
	override Execute(parameters: { selectedItems: XmlSchemaElement[] }) {
		const selectedItems = parameters.selectedItems;

		if (!selectedItems || selectedItems.length === 0) {
			return;
		}

		// Process each selected Text element
		for (const selectedItem of selectedItems) {
			if (selectedItem.nodeName !== 'Text') {
				continue;
			}

			const parent = selectedItem.Parent;
			if (!parent) {
				continue;
			}

			// Get text content from the Text element
			const textContent = selectedItem.GetTextAsString();

			// Create Chapter element (comes with default Title)
			const chapterElement = this._viewmodel.CreateElement('element', {
				type: 'Chapter'
			});

			if (!chapterElement) {
				continue;
			}

			// Get the default Title that comes with Chapter
			const titleElement = chapterElement.ChildItems().get(0);

			if (!titleElement || titleElement.nodeName !== 'Title') {
				continue;
			}

			// Set text content by directly manipulating the XML
			if (textContent) {
				const titleOrigin = titleElement.origin;
				const ownerDoc = titleOrigin.ownerDocument;

				// Create emph element with proper namespaces
				const arasNS = 'http://aras.com/ArasTechDoc';
				const emph = ownerDoc.createElementNS(arasNS, 'aras:emph');
				emph.setAttribute('emphtype', 'text');
				emph.setAttribute('xmlns', ''); // Remove default namespace on emph
				emph.text = textContent;

				// Add emph to Title
				titleOrigin.appendChild(emph);

				// Parse the origin to update the element's internal state
				titleElement.parseOrigin();
			}

			// Validate Chapter can be inserted
			const validation = this._viewmodel.Schema().TryCandidatesAt({
				context: selectedItem,
				values: [chapterElement],
				mode: 'before'
			});

			if (!validation.isValid) {
				continue;
			}

			// Replace Text with Chapter
			const childList = parent.ChildItems();
			const insertPosition = childList.index(selectedItem);
			childList.splice(insertPosition, 1);
			childList.insertAt(insertPosition, chapterElement);

			// Invalidate the element to update the UI
			this._viewmodel.invalidateElement(chapterElement);
		}

		this.OnExecuted(selectedItems);
	}

	override Validate(parameters: { selectedItems: XmlSchemaElement[] }) {
		const selectedItems = parameters.selectedItems;

		if (!selectedItems || selectedItems.length === 0) {
			return false;
		}

		// Only valid if all selected items are Text elements
		return selectedItems.every((item) => item.nodeName === 'Text');
	}
}

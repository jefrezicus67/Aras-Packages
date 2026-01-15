import type { XmlSchemaElement } from '../ViewModel/XmlSchemaElement';
import { ActionBase } from './ActionBase';

export class ConvertTextsToListAction extends ActionBase {
	override Execute(parameters: { selectedItems: XmlSchemaElement[] }) {
		const selectedItems = parameters.selectedItems;

		if (!selectedItems || selectedItems.length === 0) {
			return;
		}

		// Filter to only Text elements
		const textElements = selectedItems.filter(
			(item) => item.nodeName === 'Text'
		);

		if (textElements.length === 0) {
			return;
		}

		const firstText = textElements[0];
		const parent = firstText.Parent;

		if (!parent) {
			return;
		}

		// Get insert position BEFORE removing elements
		const childList = parent.ChildItems();
		const insertPosition = childList.index(firstText);

		// Create List element (comes with one default List-Item)
		const listElement = this._viewmodel.CreateElement('element', {
			type: 'List'
		});

		if (!listElement) {
			return;
		}

		// Get the default List-Item
		const defaultListItem = listElement.ChildItems().get(0);

		// Process each Text element and populate List-Items
		for (let i = 0; i < textElements.length; i++) {
			const textElement = textElements[i];
			const textContent = textElement.GetTextAsString();

			let listItem: XmlSchemaElement;

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
				listItemText = this._viewmodel.CreateElement('element', {
					type: 'Text'
				});
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
				emph.setAttribute('xmlns', ''); // Remove default namespace on emph
				emph.text = textContent;

				// Add emph to Text
				textOrigin.appendChild(emph);

				// Parse the origin to update the element's internal state
				listItemText.parseOrigin();
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

		// Invalidate the element to update the UI
		this._viewmodel.invalidateElement(listElement);

		// Select the new List element
		this._viewmodel.SetSelectedItems([listElement]);

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

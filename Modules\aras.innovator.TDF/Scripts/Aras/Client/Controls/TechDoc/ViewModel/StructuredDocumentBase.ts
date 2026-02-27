/// <reference path="../../../../../components/ViewModel/globals.d.ts" />

import type {
	ArasObject,
	DefaultHandler,
	IOMItem,
	XmlDocument,
	XmlNode
} from '../../../../../Types/core';
import {
	default as Eventable,
	type EventListenerDescriptor
} from '../../../../../components/common/Eventable';
import { ContentGenerationHelper } from '../Helper/ContentGenerationHelper';
import { ControlEventsExecutor } from '../ConfigurableControlEvents/DocumentControlEventsExecutor';
import type { ControlEventHandlerDescriptor } from '../ConfigurableControlEvents/EventsExecutor';
import { Constants, Enums } from './DocumentationEnums';
import { ViewModelSelection } from './ViewModelSelection';
import { XmlSchemaHelper } from '../Helper/XmlSchemaHelper';
import {
	ExternalContentHelper,
	type LinkInfo
} from '../Helper/ExternalContentHelper';
import { ViewModelCursor } from './ViewModelCursor';
import { XmlSchemaElement } from './XmlSchemaElement';
import type { ArrayWrapper } from './ArrayWrapper';
import { QueueChanges } from '../Helper/QueueChanges';
import { ExternalBlockHelper } from '../Helper/ExternalBlockHelper';
import { Clipboard } from '../Helper/Clipboard';
import { OptionalContentHelper } from '../Helper/OptionalContentHelper';
import type { XmlSchemaNode } from './XmlSchemaNode';
import {
	ElementsFactory,
	type ExtendedElementConstructorParameters
} from './ElementsFactory';
import { ActionsHelper } from '../Helper/ActionsHelper';
import type { XmlSchemaExternalElement } from './XmlSchemaExternalElement';
import type { ArasTextXmlSchemaElement } from './Aras/ArasTextXmlSchemaElement';
import { TableHelper } from '../Helper/TableHelper';
import type { ArasBlockXmlSchemaElement } from './Aras/ArasBlockXmlSchemaElement';
import MetadataProvider from '../../../../../components/common/MetadataProvider';
import { CUIEventableMixin } from '../../../../../components/common/CUIEventable';
import DocumentFacade from '../../../../../components/PublicFacades/DocumentStructure/Document';
import type { TDFGlobalSettings } from '../../../../../Types/tdf';
import ItemTypeSettingsProvider from '../../../../../components/common/ItemTypeSettingsProvider';
import CompatibleItemTypeSettingsProvider from '../../../../../components/common/CompatibleItemTypeSettingsProvider';

export interface StructuredDocumentCreationParameters {
	aras: ArasObject;
	item: XmlNode;
	currentLanguageCode?: string;
	defaultLanguageCode: string;
	asyncDataLoading?: boolean;
	metadataProvider?: MetadataProvider;
	itemTypeSettings?: ItemTypeSettingsProvider;
	optionFamilies?: Record<string, string[]>;
	additionalSettings: Record<string, unknown>;
}

type ValueOf<T> = T[keyof T];

interface DocumentTranslationRecord {
	domObject: XmlSchemaElement;
	xmlDomOrigin: XmlNode;
}

export class StructuredDocument extends CUIEventableMixin(Eventable) {
	declare _aras: ArasObject;
	declare aras: ArasObject;
	declare item: XmlNode;
	declare _item: XmlNode;
	declare origin: XmlNode;
	declare selection: ViewModelSelection;
	declare elementsFactory: ElementsFactory;
	declare _all: Record<string, XmlSchemaElement>;
	declare _allByIndex: XmlSchemaElement[];
	declare _allIndexHash: Record<string, number>;
	declare _invalidationList: XmlSchemaElement[];
	declare _invalidationSuspended: boolean[];
	declare _isInvalidating: boolean;
	declare _dom: XmlSchemaElement;
	declare _domInitializing: boolean;
	declare _cursor: ViewModelCursor;
	declare _currentLanguageCode: string;
	declare selectionChangeEventSuspended: boolean;
	declare _classification: string;
	declare _defaultLanguageCode: string;
	declare _multilangcache: Record<string, DocumentTranslationRecord>;
	declare _clipboardHelper: Clipboard;
	declare _xmlSchemaHelper: XmlSchemaHelper;
	declare _externalHelper: ExternalContentHelper;
	declare _externalBlockHelper: ExternalBlockHelper;
	declare _contentGenerationHelper: ContentGenerationHelper;
	declare _optionalContentHelper: OptionalContentHelper;
	declare _queueChanges: QueueChanges;
	declare _actionsHelper: ActionsHelper;
	declare _savedDocumentXml: Record<string, string>;
	declare _cursorEventHandler: EventListenerDescriptor | undefined;
	declare _externalLinks: Record<string, LinkInfo[]>;
	declare _registrationCounter: number;
	declare _statePromises: Record<string, Promise<unknown>>;
	declare _additionalSettings: Record<string, unknown>;
	declare cuiEventsExecutor: ControlEventsExecutor;
	declare data: unknown;
	declare ownerDocument: StructuredDocument;
	declare tableHelper: TableHelper;

	constructor(parameters: StructuredDocumentCreationParameters) {
		super();

		this._initialSetup(parameters);
		this.postCreate(parameters);
	}

	_initialSetup(parameters: StructuredDocumentCreationParameters) {
		this._aras = this.aras = parameters.aras;
		this._item = parameters.item;
		this._classification = this.getDocumentProperty('classification');
		this.ownerDocument = this;
		this._defaultLanguageCode = parameters.defaultLanguageCode || '';
		this._currentLanguageCode =
			parameters.currentLanguageCode || parameters.defaultLanguageCode || '';
		this._multilangcache = {};
		this._externalLinks = {};
		this._statePromises = {};
		this._invalidationSuspended = [];
		this.data = {};
		this._all = {};
		this._allByIndex = [];
		this._allIndexHash = {};
		this._savedDocumentXml = {};
		this._invalidationList = [];
		this._isInvalidating = false;
		this._registrationCounter = 0;
		this._additionalSettings = parameters.additionalSettings || {};
		this.private.itemTypeSettings =
			parameters.itemTypeSettings ||
			new CompatibleItemTypeSettingsProvider({
				aras: this.aras,
				item: this._item
			});
		this.private.metadataProvider =
			parameters.metadataProvider || new MetadataProvider({ aras: this.aras });
	}

	postCreate(inputArguments: StructuredDocumentCreationParameters) {
		const isAsyncMode = inputArguments.asyncDataLoading;
		const languageCode =
			inputArguments.currentLanguageCode || this._defaultLanguageCode;

		this._createHelpers(inputArguments);

		if (isAsyncMode) {
			const initCompletePromise = this._InitializeStructureDocumentAsync(
				languageCode
			).then(() => {
				if (this.IsEditable()) {
					this._queueChanges.startTrackingChanges();
					this._queueChanges.dropChangesQueue();
				}
			});

			this.setStatePromise('initComplete', initCompletePromise);
		} else {
			this._InitializeStructureDocument(languageCode);

			if (this.IsEditable()) {
				this._queueChanges.startTrackingChanges();
				this._queueChanges.dropChangesQueue();
			}
		}
	}

	_createHelpers(inputArguments: StructuredDocumentCreationParameters) {
		this._queueChanges = new QueueChanges({ viewmodel: this });
		this._externalBlockHelper = new ExternalBlockHelper({
			viewmodel: this
		});
		this.tableHelper = new TableHelper({ viewmodel: this });
		this.selection = new ViewModelSelection({ viewmodel: this });
		this.elementsFactory = new ElementsFactory({ viewmodel: this });
		this._externalHelper = new ExternalContentHelper({ viewmodel: this });
		// init optional content helper before element parsing, because helper should attach on OnRegistered and OnUnregistered events
		this._optionalContentHelper = new OptionalContentHelper({
			viewmodel: this,
			display: Enums.DisplayType.Inactive,
			optionFamilies: inputArguments.optionFamilies,
			optionFamiliesBuilderMethod: this.itemTypeSettings.get(
				Constants.ItemTypeSettings.Datamodel.FiltersGetter
			) as string
		});
		this._clipboardHelper = new Clipboard({ aras: this._aras });
		this._actionsHelper = new ActionsHelper({
			viewmodel: this,
			clipboard: this._clipboardHelper,
			aras: this._aras
		});
	}

	get metadataProvider() {
		return this.private.metadataProvider as MetadataProvider;
	}

	get itemTypeSettings() {
		return this.private.itemTypeSettings as ItemTypeSettingsProvider;
	}

	QueueChanges() {
		return this._queueChanges;
	}

	_InitializeStructureDocument(langCode: string) {
		this._currentLanguageCode = langCode;
		this._ResetSelectionAndCursor();

		this._SetOriginForStructureDocument();
		this._InitializeXmlSchema();
		this._SetDomForStructureDocument();
		this.setupEventsExecutor();

		if (!this._multilangcache[langCode]) {
			this._multilangcache[langCode] = {
				domObject: this.Dom() as XmlSchemaElement,
				xmlDomOrigin: this.origin
			};
		}
	}

	_InitializeStructureDocumentAsync(langCode: string) {
		this._currentLanguageCode = langCode;
		this._ResetSelectionAndCursor();

		return Promise.resolve(this._SetOriginForStructureDocumentAsync())
			.then(() => {
				return this._InitializeXmlSchemaAsync();
			})
			.then(() => {
				this._SetDomForStructureDocument();
				this.setupEventsExecutor();

				if (!this._multilangcache[langCode]) {
					this._multilangcache[langCode] = {
						domObject: this.Dom() as XmlSchemaElement,
						xmlDomOrigin: this.origin
					};
				}
			});
	}

	override setupEventsExecutor() {
		const eventsExecutor =
			this.cuiEventsExecutor ||
			(this.cuiEventsExecutor = new ControlEventsExecutor({
				control: new DocumentFacade(this),
				viewmodel: this
			}));
		const editorEventHandlers =
			this._xmlSchemaHelper.getControlEventsConfiguration('TDFDocument');

		editorEventHandlers.forEach(
			(eventHandler: ControlEventHandlerDescriptor) => {
				switch (eventHandler.eventType) {
					case 'TDFEventsExecutionContext':
						eventsExecutor.extendExecutionContext(
							eventHandler.handler() as unknown as Record<string, unknown>,
							eventHandler.apiversion
						);
						break;
					default:
						eventsExecutor.registerEventHandler(eventHandler);
						break;
				}
			}
		);
	}

	_SetOriginForStructureDocument() {
		const langCode = this._currentLanguageCode;
		const langDomData = this._multilangcache[langCode];

		if (langDomData && langDomData.xmlDomOrigin) {
			this.origin = langDomData.xmlDomOrigin;
		} else {
			this.origin = this._GetXmlDomByLanguage(langCode);
		}

		this._externalLinks = this._externalHelper.getDocumentExternalLinks(
			this.origin
		);
	}

	_SetOriginForStructureDocumentAsync() {
		const langCode = this._currentLanguageCode;
		const langDomData = this._multilangcache[langCode];

		return Promise.resolve(
			(langDomData && langDomData.xmlDomOrigin) ||
				this._GetXmlDomByLanguageAsync(langCode)
		).then((originXml: XmlNode) => {
			this.origin = originXml;
			this._externalLinks = this._externalHelper.getDocumentExternalLinks(
				this.origin
			);
		});
	}

	getElementExternalLinks(elementUid: string) {
		return this._externalLinks[elementUid] || [];
	}

	_SetDomForStructureDocument() {
		const langCode = this._currentLanguageCode;
		const langDomData = this._multilangcache[langCode];
		const rootElement = (
			langDomData?.domObject
				? langDomData.domObject
				: this._PrepareDomByOrigin(this.origin)
		) as XmlSchemaElement;
		const oldRootElement = this.Dom();

		if (oldRootElement) {
			rootElement.Id(oldRootElement.Id());
		}

		this.Dom(rootElement);
	}

	_PrepareDomByOrigin(newOrigin: XmlNode) {
		const rootBlockOriginNode = newOrigin.selectSingleNode(
			'aras:content/aras:block'
		);

		return this.CreateElement('element', { origin: rootBlockOriginNode });
	}

	_refreshIndexes() {
		if (this._registrationCounter) {
			this._allByIndex.length = 0;
			this._allByIndex = this._dom.getAllChilds(null, this._allByIndex);
			this._allIndexHash = {};

			for (let i = 0; i < this._allByIndex.length; i++) {
				const schemaElement = this._allByIndex[i];
				this._allIndexHash[schemaElement.Id()] = i;
			}

			this._registrationCounter = 0;
		}
	}

	_ResetSelectionAndCursor() {
		this.selection.Reset();
		this._initCursor();
		this._externalBlockHelper.Reset();
	}

	_initCursor() {
		if (this._cursorEventHandler) {
			this._cursorEventHandler.remove();
		}

		this._cursor = new ViewModelCursor();
		this._cursorEventHandler = this._cursor.addEventListener(
			'OnCursorChanged',
			this._OnCursorChanged.bind(this) as DefaultHandler,
			{ owner: this, after: true }
		);
	}

	_InitializeXmlSchema() {
		if (!this._xmlSchemaHelper) {
			const schemaId = this.getDocumentProperty(
				this.itemTypeSettings.get(
					Constants.ItemTypeSettings.Datamodel.SchemaProperty
				) as string
			);
			const schemaAml = this._getSchemaAmlRequest(schemaId);
			let xmlSchemaItem = this._aras.newIOMItem('', '');

			xmlSchemaItem.loadAML(schemaAml);
			xmlSchemaItem = xmlSchemaItem.apply();

			if (!xmlSchemaItem.isError()) {
				this._xmlSchemaHelper = new XmlSchemaHelper({
					aras: this._aras,
					viewmodel: this,
					dom: this.origin.ownerDocument,
					schemaItem: xmlSchemaItem
				});

				this._contentGenerationHelper = new ContentGenerationHelper({
					viewmodel: this,
					aras: this._aras
				});
				this._contentGenerationHelper.updateCacheFromOrigin(
					this._currentLanguageCode,
					this.origin
				);
			} else {
				this._aras.AlertError(xmlSchemaItem.getErrorString());
			}
		}
	}

	_InitializeXmlSchemaAsync() {
		if (!this._xmlSchemaHelper) {
			const schemaId = this.getDocumentProperty(
				this.itemTypeSettings.get(
					Constants.ItemTypeSettings.Datamodel.SchemaProperty
				) as string
			);
			const schemaAml = this._getSchemaAmlRequest(schemaId);
			const xmlSchemaItem = this._aras.newIOMItem('', '');

			xmlSchemaItem.loadAML(schemaAml);

			return xmlSchemaItem.applyAsync().then((responceItem: IOMItem) => {
				if (!responceItem.isError()) {
					this._xmlSchemaHelper = new XmlSchemaHelper({
						aras: this._aras,
						viewmodel: this,
						dom: this.origin.ownerDocument,
						schemaItem: responceItem
					});

					this._contentGenerationHelper = new ContentGenerationHelper({
						viewmodel: this,
						aras: this._aras
					});
					this._contentGenerationHelper.updateCacheFromOrigin(
						this._currentLanguageCode,
						this.origin
					);
				} else {
					this._aras.AlertError(responceItem.getErrorString());
				}
			});
		}
	}

	_getSchemaAmlRequest(schemaId: string) {
		const schemaAml =
			'<AML>' +
			'	<Item type="tp_XmlSchema" id="' +
			schemaId +
			'" select="name,content,target_namespace,editor_configuration" action="get">' +
			'		<Relationships>' +
			'			<Item type="tp_XmlSchemaElement" action="get" select="name,renderer(method_code),content_generator,' +
			'is_content_dynamic,default_classification,editor_parameters" />' +
			'			<Item type="tp_XmlSchemaOutputSetting" action="get" where="tp_XmlSchemaOutputSetting.classification=\'Editor\'" ' +
			'select="target_classification,stylesheet_id(name,style_content,parent_stylesheet)"/>' +
			'		</Relationships>' +
			'	</Item>' +
			'</AML>';

		return schemaAml;
	}

	Reload(
		newItem: XmlNode,
		optionalParameters: { languageCode?: string; forceReload?: boolean } = {}
	) {
		this.SuspendInvalidation();

		const wasDirty = this._item.getAttribute('isDirty');
		const isDirty = newItem.getAttribute('isDirty');
		const wasLocked = this._aras.isLockedByUser(this._item);
		const isLocked = this._aras.isLockedByUser(newItem);
		let langCode = this._currentLanguageCode;
		let isReplaceFromServerRequired = false;

		if (optionalParameters.languageCode) {
			this._currentLanguageCode = langCode = optionalParameters.languageCode;
		}

		this._item = newItem;

		const classification = this.getDocumentProperty('classification');
		if (classification !== this._classification) {
			this._classification = classification;
			this.OnClassificationChanged();
		}

		if (wasLocked) {
			if ((isLocked && !wasDirty) || (!isLocked && wasDirty)) {
				isReplaceFromServerRequired = true;
			}
		} else {
			isReplaceFromServerRequired = true;
		}

		if (isReplaceFromServerRequired || optionalParameters.forceReload) {
			// hard clear all changes
			this._ReplaceOriginFromServerIfNeed(langCode);
		} else {
			this._GetXmlDomByLanguage(langCode);
			this._invalidate(this._dom);
		}

		if (wasLocked && !isLocked) {
			this._queueChanges.stopTrackingChanges();
			this._queueChanges.dropChangesQueue();
		} else if (isLocked && (!wasLocked || !isDirty)) {
			this._queueChanges.startTrackingChanges();
			this._queueChanges.dropChangesQueue();
		}

		this.selection.Refresh();

		this.ResumeInvalidation();
	}

	GetDocumentBlockXml(
		blockId: string,
		langCode: string,
		byReferenceType: number,
		optional: { itemTypeName?: string } = {}
	) {
		let documentContent = this._aras.newIOMItem('', '');
		const builderMethodName = this.getItemTypeSetting(
			Constants.ItemTypeSettings.Datamodel.ContentGetter
		);
		const byReference =
			byReferenceType === Enums.ByReferenceType.External
				? 'external'
				: 'internal';
		const itemTypeName =
			optional.itemTypeName || this._item.getAttribute('type');

		documentContent.loadAML(
			'<AML><Item action="' +
				builderMethodName +
				'" type="' +
				itemTypeName +
				'" id="' +
				blockId +
				'" language="' +
				langCode +
				'" by-reference="' +
				byReference +
				'"/></AML>'
		);
		documentContent = documentContent.apply();

		if (documentContent.isError()) {
			this._aras.AlertError(documentContent.getErrorString());
		} else {
			return documentContent.getResult();
		}
	}

	GetDocumentBlockXmlAsync(
		blockId: string,
		langCode: string,
		byReferenceType?: number
	) {
		const documentContent = this._aras.newIOMItem('', '');
		const builderMethodName = this.getItemTypeSetting(
			Constants.ItemTypeSettings.Datamodel.ContentGetter
		);
		const byReference =
			byReferenceType === Enums.ByReferenceType.External
				? 'external'
				: 'internal';
		const itemTypeName = this._item.getAttribute('type');

		documentContent.loadAML(
			'<AML><Item action="' +
				builderMethodName +
				'" type="' +
				itemTypeName +
				'" id="' +
				blockId +
				'" language="' +
				langCode +
				'" by-reference="' +
				byReference +
				'"/></AML>'
		);

		return documentContent.applyAsync().then((responceItem: IOMItem) => {
			if (responceItem.isError()) {
				this._aras.AlertError(responceItem.getErrorString());
			} else {
				return responceItem.getResult();
			}
		});
	}

	_GetXmlDomByLanguage(langCode: string): XmlNode {
		const newXmlDom = this._GetDocumentXmlDomFromServer(
			langCode
		) as XmlDocument;
		const oldXmlDom = this._GetDocumentXmlDomFromClient(
			langCode
		) as XmlDocument;

		if (oldXmlDom) {
			this._externalHelper.UpdateProvider(langCode, oldXmlDom);
		}

		this._externalHelper.UpdateProvider(langCode, newXmlDom);

		if (this._contentGenerationHelper) {
			this._contentGenerationHelper.updateCacheFromOrigin(langCode, newXmlDom);
		}

		const resultXml = oldXmlDom
			? oldXmlDom.documentElement
			: newXmlDom.documentElement;
		this.saveDocumentXml(resultXml.xml, langCode, true);

		return resultXml;
	}

	_GetXmlDomByLanguageAsync(langCode: string): Promise<XmlNode> {
		const oldXmlDom = this._GetDocumentXmlDomFromClient(langCode);

		if (oldXmlDom) {
			this._externalHelper.UpdateProvider(langCode, oldXmlDom);
		}

		return Promise.resolve(
			this._GetDocumentXmlDomFromServerAsync(langCode)
		).then((serverXmlDom) => {
			this._externalHelper.UpdateProvider(
				langCode,
				serverXmlDom as XmlDocument
			);

			if (this._contentGenerationHelper) {
				this._contentGenerationHelper.updateCacheFromOrigin(
					langCode,
					serverXmlDom as XmlDocument
				);
			}

			const resultXml = (
				oldXmlDom ? oldXmlDom.documentElement : serverXmlDom?.documentElement
			) as XmlNode;
			this.saveDocumentXml(resultXml.xml, langCode, true);

			return resultXml;
		});
	}

	_ReplaceOriginFromServerIfNeed(langCode: string) {
		const newXmlDom = this._GetDocumentXmlDomFromServer(
			langCode
		) as XmlDocument;
		const newOrigin = newXmlDom.documentElement;

		if (!this.compareDocumentOrigins(newOrigin, this.origin)) {
			this.saveDocumentXml(newOrigin.xml, langCode, true);
			this._externalHelper.DropProvider(langCode);
			this._externalHelper.UpdateProvider(langCode, newXmlDom);

			this._contentGenerationHelper.clearCache();
			this._contentGenerationHelper.updateCacheFromOrigin(langCode, newXmlDom);

			const newDom = this._PrepareDomByOrigin(newOrigin);
			this._multilangcache[langCode] = {
				domObject: newDom as XmlSchemaElement,
				xmlDomOrigin: newOrigin
			};

			this._InitializeStructureDocument(langCode);
		} else {
			this._invalidate(this._dom);
		}
	}

	_GetDocumentXmlDomFromServer(langCode: string, blockId?: string) {
		const isStandalone = this.getAdditionalSetting('standaloneMode');
		const documentXml = isStandalone
			? this.aras.getItemProperty(this._item, 'document_xml')
			: this.GetDocumentBlockXml(
					blockId || this._item.getAttribute('id'),
					langCode,
					Enums.ByReferenceType.Internal
				);

		return this.createContentDocument(documentXml as string);
	}

	async _GetDocumentXmlDomFromServerAsync(langCode: string, blockId?: string) {
		const isStandalone = this.getAdditionalSetting('standaloneMode');
		const documentXml = await (isStandalone
			? this.aras.getItemProperty(this._item, 'document_xml')
			: this.GetDocumentBlockXmlAsync(
					blockId || this._item.getAttribute('id'),
					langCode,
					Enums.ByReferenceType.Internal
				));

		return this.createContentDocument(documentXml as string);
	}

	_GetDocumentXmlDomFromClient(language: string): XmlDocument | undefined {
		const content = this.getSavedDocumentXml(language);
		const editLevels = Enums.EditLevels;

		if (content && this.IsEqualEditableLevel(editLevels.IgnoreExternal)) {
			return this.createContentDocument(content);
		}
	}

	createContentDocument(content: string): XmlDocument | undefined {
		if (!content) {
			return;
		}

		const document = new window.XmlDocument() as XmlDocument;

		// preserve whitespace = true IR-029141
		document.preserveWhiteSpace = true;
		document.loadXML(content);

		document.documentElement.setAttribute(
			'xmlns:aras',
			'http://aras.com/ArasTechDoc'
		);

		return document;
	}

	OriginExternalHelper() {
		return this._externalHelper;
	}

	OriginExternalProvider() {
		return this._externalHelper.GetProvider(this.CurrentLanguageCode());
	}

	ItemClassification() {
		return this._classification;
	}

	SwitchLanguage(targetLangCode: string) {
		if (targetLangCode !== this._currentLanguageCode) {
			this._InitializeStructureDocument(targetLangCode);
		}
	}

	Dom(value?: XmlSchemaElement): XmlSchemaElement | undefined {
		if (value === undefined) {
			return this._dom;
		}

		this._domInitializing = true;
		this.SuspendInvalidation();

		this._dom?.unregisterDocumentElement();

		this._dom = value;
		this._dom.registerDocumentElement();
		this._invalidate(this._dom);

		this.ResumeInvalidation();
		this._domInitializing = false;
	}

	protected compareDocumentOrigins(first: XmlNode, second: XmlNode) {
		if (!first || !second) {
			return false;
		}

		if (first !== second) {
			let firstXml = first.xml;
			let secondXml = second.xml;

			if (firstXml.length !== secondXml.length || firstXml !== secondXml) {
				const firstCopy = first.cloneNode(true);
				const secondCopy = second.cloneNode(true);
				const rootBlockXPath = `aras:content/aras:block`;
				const referencesContentXPath = `aras:references/*[@content]`;

				[firstCopy, secondCopy].forEach((current) => {
					const referenceContentNode = current.selectNodes(
						referencesContentXPath
					);

					// remove content attribute from reference nodes
					referenceContentNode.forEach((node) => {
						node.removeAttribute('content');
					});

					// remove item aml attribute to check if document content differs
					current
						.selectSingleNode(rootBlockXPath)
						?.removeAttribute(Constants.ElementAttributes.ItemAML);
				});

				firstXml = firstCopy.xml;
				secondXml = secondCopy.xml;

				if (firstXml.length !== secondXml.length || firstXml !== secondXml) {
					return false;
				}
			}
		}

		return true;
	}

	isDomInitializing() {
		return this._domInitializing;
	}

	IsEqualEditableLevel(
		levelType: number,
		targetElements?: XmlSchemaElement | XmlSchemaElement[]
	): boolean {
		const isLocked = this._aras.isEditStateEx(this._item);
		const isDefaultLanguageSelected =
			this._defaultLanguageCode === this._currentLanguageCode;

		if (!isLocked || !isDefaultLanguageSelected) {
			return false;
		}

		const selectedItems = targetElements
			? Array.isArray(targetElements)
				? targetElements
				: [targetElements]
			: this.GetSelectedItems();
		const isExternalBelongs =
			this._externalBlockHelper.isExternalBlockContains(selectedItems);
		const isExternalEditable =
			this._externalHelper.isElementEditable(selectedItems);

		if (isExternalBelongs && !isExternalEditable) {
			return false;
		}

		const isDynamicBelongs =
			this._contentGenerationHelper &&
			this._contentGenerationHelper.isDynamicElementBelongs(selectedItems);

		switch (levelType) {
			case Enums.EditLevels.IgnoreExternal:
				return true;
			case Enums.EditLevels.FullAllow:
				return (!isExternalBelongs || isExternalEditable) && !isDynamicBelongs;
			case Enums.EditLevels.AllowExternal:
				return !isDynamicBelongs;
			case Enums.EditLevels.FullDeny:
				return isExternalBelongs && isDynamicBelongs;
		}

		return false;
	}

	IsEditable(): boolean {
		return this.IsEqualEditableLevel(Enums.EditLevels.AllowExternal);
	}

	isDocumentElement(targetElement: XmlSchemaElement) {
		return (
			targetElement &&
			typeof targetElement.Id === 'function' &&
			targetElement === this.GetElementById(targetElement.Id() as string)
		);
	}

	isAppendAllowed(targetElement: XmlSchemaElement) {
		const isElementBelongsDynamic = targetElement.hasDynamicParent();
		const isReadonlyExternal =
			targetElement.hasExternalParent() &&
			!this._externalHelper.isElementEditable(targetElement);

		if (!isElementBelongsDynamic && !isReadonlyExternal) {
			const isDocumentClassified = this.hasClassificationBindedElements();

			return (
				!isDocumentClassified ||
				!this.isRootElementContained([targetElement, targetElement.Parent])
			);
		}

		return false;
	}

	isInsertAllowed(targetElement: XmlSchemaElement) {
		const isElementDynamic =
			targetElement.isDynamic() || targetElement.hasDynamicParent();
		const isReadonlyExternal =
			(targetElement.isExternal() &&
				!this._externalHelper.isDocumentEditable(
					targetElement as ArasBlockXmlSchemaElement
				)) ||
			(targetElement.hasExternalParent() &&
				!this._externalHelper.isElementEditable(targetElement));

		if (!isElementDynamic && !isReadonlyExternal) {
			const isDocumentClassified = this.hasClassificationBindedElements();

			return (
				!isDocumentClassified || !this.isRootElementContained(targetElement)
			);
		}

		return false;
	}

	CurrentLanguageCode(): string {
		return this._currentLanguageCode;
	}

	DefaultLanguageCode(): string {
		return this._defaultLanguageCode;
	}

	Schema(): XmlSchemaHelper {
		return this._xmlSchemaHelper;
	}

	ContentGeneration(): ContentGenerationHelper {
		return this._contentGenerationHelper;
	}

	OptionalContent() {
		return this._optionalContentHelper;
	}

	ActionsHelper() {
		return this._actionsHelper;
	}

	Clipboard() {
		return this._clipboardHelper;
	}

	ExternalBlockHelper() {
		return this._externalBlockHelper;
	}

	_RegisterElement(element: XmlSchemaNode) {
		const elementId = element.Id() as string;

		this._all[elementId] = element as XmlSchemaElement;
		this._registrationCounter++;
		this.OnElementRegistered(this, { registeredObject: element });
	}

	_OnElementChanged(targetElement: XmlSchemaNode) {
		this._OnStructureChanged(targetElement as XmlSchemaElement);
	}

	_UnregisterElement(wrappedObject: XmlSchemaNode) {
		const elementId = wrappedObject.Id() as string;

		delete this._all[elementId];
		this._registrationCounter++;
		this.OnElementUnregistered(this, { unregisteredObject: wrappedObject });
	}

	OnElementUnregistered(sender: StructuredDocument, earg: unknown) {
		this.raiseEvent('OnElementUnregistered', this, earg);
	}

	OnElementRegistered(sender: StructuredDocument, earg: unknown) {
		this.raiseEvent('OnElementRegistered', this, earg);
	}

	Cursor() {
		return this._cursor;
	}

	_OnCursorChanged(sender: ViewModelCursor, earg: unknown) {
		const commonAncestor = sender?.commonAncestor;

		if (commonAncestor?.is('ArasTextXmlSchemaElement')) {
			(commonAncestor as ArasTextXmlSchemaElement).InvalidRange(sender);
		}

		this._fireInvalidationEvent();
	}

	SetSelectedItems(
		target?: XmlSchemaElement | XmlSchemaElement[],
		optionalParameters?: Record<string, unknown>
	) {
		this.selection.Set(target, optionalParameters);
	}

	GetSelectedItems() {
		return this.selection.GetCurrent();
	}

	focusElement(targetElement: XmlSchemaElement, lowerestChild?: boolean) {
		if (targetElement) {
			// searching for lowest targetElement child
			if (!targetElement.isDynamic() && lowerestChild) {
				let childItems = targetElement.ChildItems() as ArrayWrapper;

				while (childItems?.length() > 0) {
					targetElement = childItems.get(0) as XmlSchemaElement;
					childItems = (
						targetElement.ChildItems ? targetElement.ChildItems() : null
					) as ArrayWrapper;
				}
			}

			// changing selection and cursor position
			this.SetSelectedItems(targetElement);
			this._cursor.Set(targetElement, 0, targetElement, 0);
		}
	}

	GetElementById(id: string) {
		return this._all[id];
	}

	getElementByIndex(elementIndex: number) {
		if (elementIndex >= 0 && elementIndex < this._allByIndex.length) {
			return this._allByIndex[elementIndex];
		}
	}

	getElementIndex(targetElement: XmlSchemaElement) {
		const elementId =
			typeof targetElement == 'object' ? targetElement.Id() : targetElement;
		const elementIndex = elementId && this._allIndexHash[elementId];

		return (!isNaN(elementIndex as number) ? elementIndex : -1) as number;
	}

	getAllElements() {
		return this._allByIndex.slice();
	}

	getElementsCount() {
		return this._allByIndex.length;
	}

	getItemTypeSetting(settingName: string): ValueOf<TDFGlobalSettings> {
		return this.itemTypeSettings.get(settingName);
	}

	isRootElementContained(
		selectedItems: XmlSchemaElement | (XmlSchemaElement | undefined)[]
	) {
		if (Array.isArray(selectedItems)) {
			for (const selected of selectedItems) {
				if (!selected?.Parent) {
					return true;
				}
			}

			return false;
		}

		return selectedItems ? !selectedItems.Parent : false;
	}

	hasClassificationBindedElements(): boolean {
		if (this._classification) {
			const bindedXmlSchemaElements =
				this._xmlSchemaHelper.getXmlSchemaElements(this._classification);

			return bindedXmlSchemaElements.length > 0;
		}

		return false;
	}

	GetElementsByOrigin(origin: XmlNode) {
		const elements: XmlSchemaElement[] = [];

		for (const elementId in this._all) {
			const schemaElement = this._all[elementId];

			if (schemaElement.origin === origin) {
				elements.push(schemaElement);
			}
		}

		return elements;
	}

	GetElementsByUid(uid: string) {
		const elements: XmlSchemaElement[] = [];

		for (const elementId in this._all) {
			const schemaElement = this._all[elementId];

			if (schemaElement.is('XmlSchemaElement') && schemaElement.Uid() === uid) {
				elements.push(schemaElement);
			}
		}

		return elements;
	}

	getElementIdPath(elementId: string) {
		const targetElement =
			typeof elementId == 'object' ? elementId : this._all[elementId];
		let idPath: string[] = [];

		if (targetElement) {
			let parentElement = targetElement.Parent;

			idPath = [targetElement.Id()];

			while (parentElement) {
				idPath.push(parentElement.Id());
				parentElement = parentElement.Parent;
			}
			idPath.reverse();
		}

		return idPath;
	}

	getElementUidPath(elementId: string | XmlSchemaElement) {
		const targetElement =
			typeof elementId == 'object' ? elementId : this._all[elementId];
		let uidPath: string[] = [];

		if (targetElement) {
			let parentElement = targetElement.Parent;

			uidPath = [targetElement.Uid()];

			while (parentElement) {
				uidPath.push(parentElement.Uid());
				parentElement = parentElement.Parent;
			}
			uidPath.reverse();
		}

		return uidPath;
	}

	getChildElementsByType(
		targetElement: XmlSchemaElement,
		childType: string | number
	) {
		const resultInfo: { elements: XmlSchemaElement[]; count: number } = {
			elements: [],
			count: 0
		};

		if (targetElement && childType) {
			const childItems = targetElement.ChildItems() as ArrayWrapper;
			const childsCount = childItems.length();

			for (let i = 0; i < childsCount; i++) {
				const childElement = childItems.get(i);

				if (childElement.is('ArasBlockXmlSchemaElement')) {
					const blockChilds = this.getChildElementsByType(
						childElement as XmlSchemaElement,
						childType
					);

					if (blockChilds.count) {
						resultInfo.elements.push(...blockChilds.elements);
						resultInfo.count += blockChilds.count;
					}
				} else if (
					childElement instanceof XmlSchemaElement &&
					childElement.is(childType)
				) {
					resultInfo.elements.push(childElement);
					resultInfo.count += 1;
				}
			}
		}

		return resultInfo;
	}

	getAllChildElementsByType(
		targetElement: XmlSchemaElement,
		resultHash: Record<string, { elements: XmlSchemaElement[]; count: number }>
	) {
		if (targetElement) {
			const childItems = targetElement.ChildItems() as ArrayWrapper;
			const childsCount = childItems.length();

			for (let i = 0; i < childsCount; i++) {
				const childElement = childItems.get(i) as XmlSchemaElement;

				if (childElement.is('ArasBlockXmlSchemaElement')) {
					resultHash = this.getAllChildElementsByType(
						childElement as XmlSchemaElement,
						resultHash
					);
				} else {
					const elementName = childElement.nodeName;
					const typedChilds = resultHash[elementName] || {
						elements: [],
						count: 0
					};
					typedChilds.elements.push(childElement as XmlSchemaElement);
					typedChilds.count += 1;

					resultHash[elementName] = typedChilds;
				}
			}
		}

		return resultHash;
	}

	GetElementsByReferenceId(referenceId: string) {
		const foundElements: XmlSchemaElement[] = [];

		for (const elementId in this._all) {
			const schemaElement = this._all[elementId] as XmlSchemaExternalElement;

			if (
				schemaElement.ReferenceId &&
				schemaElement.ReferenceId() === referenceId
			) {
				foundElements.push(schemaElement);
			}
		}

		return foundElements;
	}

	GetAncestorOrSelfInteractiveElement(
		targetElement: XmlSchemaElement | undefined
	): XmlSchemaElement | undefined {
		if (targetElement?.is('XmlSchemaText')) {
			return this.GetAncestorOrSelfInteractiveElement(targetElement.Parent);
		} else if (targetElement?.is('XmlSchemaElement')) {
			const elementType = this.Schema().GetSchemaElementType(targetElement);

			if ((elementType & Enums.XmlSchemaElementType.InteractiveElement) !== 0) {
				return targetElement;
			}

			return this.GetAncestorOrSelfInteractiveElement(targetElement.Parent);
		}
	}

	GetAncestorOrSelfElement(
		targetElement: XmlSchemaElement | XmlSchemaNode | undefined
	): XmlSchemaElement | undefined {
		if (targetElement) {
			return targetElement.is('XmlSchemaElement')
				? (targetElement as XmlSchemaElement)
				: this.GetAncestorOrSelfElement(targetElement.Parent);
		}
	}

	CreateElement(type: string, constructorParameters?: unknown) {
		return this.elementsFactory.createElement(
			type,
			constructorParameters as ExtendedElementConstructorParameters
		);
	}

	appendElement(...elements: XmlSchemaElement[]) {
		const isDocumentClassified = this.hasClassificationBindedElements();
		const rootElement = this.Dom() as XmlSchemaElement;
		const containerElement = (
			isDocumentClassified ? rootElement.ChildItems()?.get(0) : rootElement
		) as XmlSchemaElement;
		const schemaHelper = this.Schema();
		const appendList: XmlSchemaElement[] = [];
		const appendResult: { elements?: XmlSchemaElement[]; failure?: string } =
			{};

		if (this.isInsertAllowed(containerElement)) {
			elements = elements.reduce((result, element) => {
				if (element.ownerDocument !== this) {
					result.push(this.importElement(element) as XmlSchemaElement);
				} else if (element !== rootElement || element !== containerElement) {
					result.push(element);
				}

				return result;
			}, appendList);

			const validationResult = schemaHelper.TryCandidatesAt({
				context: containerElement,
				values: elements,
				mode: 'into'
			});

			if (validationResult.isValid) {
				containerElement.ChildItems()?.add(elements);
				appendResult.elements = appendList;
			} else {
				appendResult.failure = this.aras.getResource(
					'../Modules/aras.innovator.TDF',
					'importcontent.merge.schemavalidationfailure'
				);
			}
		} else {
			appendResult.failure = this.aras.getResource(
				'../Modules/aras.innovator.TDF',
				'importcontent.merge.immutablecontainer'
			);
		}

		return appendResult;
	}

	importElement(element: XmlSchemaElement) {
		if (element) {
			if (element.ownerDocument !== this) {
				const findElementReferences = (
					element: XmlSchemaElement | XmlNode,
					document?: StructuredDocument,
					result: Record<string, XmlNode> = {}
				) => {
					document = (document || element.ownerDocument) as StructuredDocument;

					const elementOrigin = (element.origin || element) as XmlNode;
					const referenceNodes = elementOrigin.selectNodes(
						'descendant-or-self::*[@ref-id]'
					);
					const externalProvider = document.OriginExternalProvider();

					referenceNodes.forEach((node: XmlNode) => {
						const referenceId = node.getAttribute('ref-id');

						if (!result[referenceId]) {
							const referenceNode =
								externalProvider.GetExternalNodeByRefId(referenceId);

							result[referenceId] = referenceNode;

							findElementReferences(referenceNode, document, result);
						}
					});

					return result;
				};
				const referenceList = findElementReferences(element);
				const targetExternals = this.OriginExternalProvider();

				Object.values(referenceList).forEach(
					(reference: XmlNode, index: number) => {
						targetExternals.UpdateReferenceNode(reference.cloneNode(true));
					}
				);
			}

			const importedElement = this.CreateElement('element', {
				origin: element.origin.cloneNode(true)
			});
			importedElement?._OnCloned();

			return importedElement;
		}
	}

	_OnStructureChanged(sender: XmlSchemaElement) {
		const origin = sender.origin;
		const referencedElements = this.GetElementsByOrigin(origin);

		this.SuspendInvalidation();
		for (const referencedElement of referencedElements) {
			if (referencedElement !== sender) {
				referencedElement.parseOrigin();
			}

			this._invalidate(referencedElement);
		}
		this.ResumeInvalidation();
	}

	_invalidate(element: XmlSchemaElement) {
		if (this._invalidationList.indexOf(element) === -1) {
			this._invalidationList.push(element);
		}

		this._fireInvalidationEvent();
	}

	invalidateElement(targetElement: XmlSchemaElement) {
		this._invalidate(targetElement);
	}

	isInvalidating() {
		return this._isInvalidating;
	}

	_fireInvalidationEvent() {
		if (!this.isInvalidationSuspended() && !this._isInvalidating) {
			this._isInvalidating = true;

			const earg = {
				invalidationList: this._invalidationList.slice(),
				cursor: this.Cursor(),
				selection: this.selection
			};
			this.OnInvalidate(this, earg);
			this.raiseEvent('OnInvalidate', this, earg);

			this._refreshIndexes();
			this._invalidationList.length = 0;

			if (this.selectionChangeEventSuspended) {
				this.fireSelectionChangeEvent();
			}

			this._isInvalidating = false;
		}
	}

	fireSelectionChangeEvent() {
		if (!this.isInvalidationSuspended()) {
			this.onSelectionChanged(this, this.selection.GetCurrent());
			this.selectionChangeEventSuspended = false;
		} else {
			this.selectionChangeEventSuspended = true;
		}
	}

	isInvalidationSuspended() {
		return Boolean(this._invalidationSuspended.length);
	}

	SuspendInvalidation() {
		this._invalidationSuspended.push(true);
	}

	ResumeInvalidation() {
		this._invalidationSuspended.pop();
		this._fireInvalidationEvent();
	}

	OnInvalidate(sender: StructuredDocument, earg: unknown) {
		// do nothing
	}

	OnClassificationChanged() {
		// do nothing
	}

	onSelectionChanged(
		sender: StructuredDocument,
		selectedItems: XmlSchemaElement[]
	) {
		this.raiseEvent('onSelectionChanged', this, selectedItems);
	}

	findElementByUidPath(uidPath: string[]) {
		if (uidPath?.length) {
			const elementsUidHash: Record<
				string,
				{ index: number; element: XmlSchemaElement }[]
			> = {};

			for (const id in this._all) {
				const schemaElement = this._all[id];

				if (schemaElement.is('XmlSchemaElement')) {
					const elementUid = schemaElement.Uid();

					elementsUidHash[elementUid] = elementsUidHash[elementUid] || [];
					elementsUidHash[elementUid].push({
						index: elementsUidHash[elementUid].length,
						element: schemaElement
					});
				}
			}

			const returnCandidates = elementsUidHash[uidPath[uidPath.length - 1]];
			if (returnCandidates) {
				let currentAncestors = returnCandidates.slice();

				for (let i = uidPath.length - 2; i >= 0; i--) {
					const pathPart = uidPath[i];
					const nextAncestors: { index: number; element: XmlSchemaElement }[] =
						[];

					for (const currentElement of currentAncestors) {
						const parentElement = currentElement.element.Parent;

						if (parentElement && parentElement.Uid() == pathPart) {
							nextAncestors.push({
								index: currentElement.index,
								element: parentElement
							});
						}
					}

					currentAncestors = nextAncestors;
				}

				return currentAncestors.length == 1
					? returnCandidates[currentAncestors[0].index].element
					: undefined;
			}
		}
	}

	getSavedDocumentXml(languageCode: string): string {
		let foundDocumentXml = this._savedDocumentXml[languageCode];

		if (!foundDocumentXml) {
			foundDocumentXml = this._aras.getItemTranslation(
				this._item,
				'document_xml',
				languageCode
			);

			if (foundDocumentXml) {
				this.saveDocumentXml(foundDocumentXml, languageCode, true);
			}
		}

		return foundDocumentXml;
	}

	saveDocumentXml(
		documentXml: string,
		languageCode: string,
		skipPropertyUpdate?: boolean
	) {
		const prevDocumentXml = this._savedDocumentXml[languageCode];
		const isStandalone = this.getAdditionalSetting('standaloneMode');

		if (documentXml && prevDocumentXml && !isStandalone) {
			if (
				prevDocumentXml.length != documentXml.length ||
				prevDocumentXml !== documentXml
			) {
				if (!skipPropertyUpdate) {
					this._aras.setItemTranslation(
						this._item,
						'document_xml',
						documentXml,
						languageCode
					);
				}

				this._savedDocumentXml[languageCode] = documentXml;
			}
		} else {
			this._savedDocumentXml[languageCode] = documentXml;
		}
	}

	getDocumentItem(): XmlNode {
		return this._item;
	}

	getDocumentationEnums(category?: string) {
		return Object.assign(
			{},
			category ? (Enums as Record<string, unknown>)[category] : Enums
		);
	}

	getStatePromise(stateName: string): Promise<unknown> {
		return this._statePromises[stateName] || Promise.resolve();
	}

	setStatePromise(stateName: string, statePromise: Promise<unknown>) {
		if (stateName) {
			this._statePromises[stateName] = statePromise;
		}
	}

	getDocumentProperty(propertyName: string): string {
		return propertyName
			? this._aras.getItemProperty(this._item, propertyName)
			: '';
	}

	getAdditionalSetting(settingName: string): unknown {
		return this._additionalSettings[settingName];
	}

	setAdditionalSetting(settingName: string, settingValue: unknown) {
		if (settingName) {
			this._additionalSettings[settingName] = settingValue;

			this.raiseEvent('onAdditionalSettingChanged', settingName, settingValue);
		}
	}

	getContainerBlockElement(element: XmlSchemaElement, checkThis?: boolean) {
		const externalHelper = this.OriginExternalHelper();
		const blockContainer = (externalHelper.getExternalContainerElement(
			element,
			checkThis
		) || this.Dom()) as ArasBlockXmlSchemaElement;

		return blockContainer;
	}

	getOwnerDocumentItemTypeSettings(
		element: XmlSchemaElement,
		checkThis?: boolean
	) {
		const blockContainer = this.getContainerBlockElement(element, checkThis);

		return ItemTypeSettingsProvider.getProvider(
			this.aras,
			blockContainer.referencedItem as XmlNode
		);
	}

	removeGeneratedContentNode(documentXml: string) {
		const generatedContentNodeXPath = 'aras:document/aras:generatedContent';
		const referencesContentPath = 'aras:document/aras:references/*[@content]';
		const xmlDoc = this.createContentDocument(documentXml) as XmlDocument;
		const generatedContentNode = xmlDoc.selectSingleNode(
			generatedContentNodeXPath
		);

		if (generatedContentNode) {
			generatedContentNode.parentNode?.removeChild(generatedContentNode);
		}

		const referenceContentNode = xmlDoc.selectNodes(referencesContentPath);
		referenceContentNode.forEach((node) => {
			node.removeAttribute('content');
		});

		return xmlDoc.xml || '';
	}
}

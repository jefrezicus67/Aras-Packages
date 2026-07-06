import type {
	ArasObject,
	XmlNode,
	XmlDocument,
	CuiLayout,
	DefaultHandler
} from '../../Types/core';
import type { IDocumentFacade } from '../PublicFacades/DocumentStructure/Interfaces/Facades';
import type { IView } from '../PublicFacades/View/Interfaces/Controls';
import {
	default as BaseViewController,
	type BaseContainerWindow,
	type BaseViewContextData
} from './BaseViewController';
import type { ItemViewWindow } from './ItemViewController';
import type { EditorTabViewSettings } from './EditorTabViewController';
import {
	type TDFGlobalSettings,
	type SearchReplaceComponentCreationParameters,
	type ControlEventsExecutor,
	type CoreDragManager,
	type CoreDragModule,
	type DojoClass,
	type DojoControl,
	type DndTarget,
	type DndBidirect,
	type DndSource,
	type ArasBlockXmlSchemaElement,
	type ArasItemPropertyXmlSchemaElement,
	type SearchComponent,
	ControlEventAPIVersions,
	EditorViewPanelDndController as DndController,
	Enums,
	TDFExternalFileDndSource as ExternalFileDndSource,
	SearchReplaceComponent,
	TextSchemaElementsSearchEngine as TextSearchEngine,
	MetadataProvider,
	StructuredDocument,
	XmlSchemaElement,
	TreeGridAdapterBase
} from 'tdf/core';
import { method as metadataMethod } from 'metadata';
import type ItemTypeSettingsProvider from '../common/ItemTypeSettingsProvider';

interface PopupPanel extends HTMLElement {
	contentNode: HTMLElement;
	visible: boolean;
}

interface PopupPanelClass extends HTMLElement {
	new (parameters: Record<string, unknown>): PopupPanel;
}

interface DojoParseClass extends DojoClass {
	parse: () => Promise<void>;
}

interface PanelSettings {
	[index: string]: unknown;
	isPrimaryView: boolean;
	languageCode: string;
	displayType: 'html' | 'xml';
	documentItem: XmlNode;
	filterFamilies: Record<string, string[]>;
}

interface ViewPanel {
	[index: string]: unknown;
	getSharedData: (key: string) => unknown;
	hide: () => void;
	raiseEvent: (event: string, ...optional: unknown[]) => void;
	activate: () => void;
	viewController: {
		[index: string]: unknown;
		addEventListener: DefaultHandler;
	};
}

interface DojoWidget {
	domNode: HTMLElement;
	resize: () => void;
	_splitterWidget: DojoWidget;
}

interface ContainerFrameElement extends HTMLIFrameElement {
	ownerViewPanel: ViewPanel;
}

export interface EditorViewPanelContainerWindow extends BaseContainerWindow {
	isViewEditable: () => boolean;
	parent: EditorViewPanelContainerWindow;
	frameElement: ContainerFrameElement;
	DragAndDrop: unknown;
	dragManager: unknown;
	XmlDocument: typeof XmlDocument;
	PopupPanel: PopupPanelClass;
	CuiLayout: typeof CuiLayout;
	TDF: {
		[index: string]: unknown;
		publicFacades: {
			Document: new (document: StructuredDocument) => IDocumentFacade;
			View: new (parameters: ViewFacadeInitParameters) => IView;
		};
	};
	dijit: {
		byNode: (node: HTMLElement) => DojoWidget;
	};
}

interface EditorControl extends DojoControl {
	iframe: HTMLIFrameElement;
	set: (property: string, value: unknown) => void;
	getStatePromise: (state: string) => Promise<void>;
	activateDnD: DndSource['activateDnD'];
	setSearchControl: (control: SearchComponent) => void;
	eventsExecutor: ControlEventsExecutor;
	startup: () => void;
}

export type ElementsTreeControl = TreeGridAdapterBase;

type HeaderControlsData = Record<string, HTMLElement>;

interface DndInitParameters {
	dndComponents?: (DndTarget | DndSource)[];
}

interface ViewFacadeInitParameters {
	document: IDocumentFacade;
	controls: { editor: EditorControl; tree: ElementsTreeControl };
}

interface ViewContextData extends BaseViewContextData {
	[index: string]: unknown;
	data: {
		currentUser: string;
		isTreeExpanded: boolean;
		isPanelActive: boolean;
		isMatchReplacing: boolean;
		treeOriginWidth: number;
		structuredDocument: StructuredDocument;
		panelViewSettings: PanelSettings;
		copiedViewSettings: PanelSettings | undefined;
		metadataProvider: MetadataProvider;
	};
	controls: {
		[index: string]: unknown;
		htmlContainer: HTMLElement;
		xmlContainer: HTMLElement;
		xmlContentFrame: HTMLIFrameElement;
		headerControls: HeaderControlsData;
		dndController: DndController;
		toolbarContainer: HTMLElement;
		searchControl: SearchReplaceComponent;
		searchPopupPanel: PopupPanel;
		editorControl: EditorControl;
		treeContainer: HTMLElement;
		treeContainerWidget: DojoWidget;
		htmlContainerWidget: DojoWidget;
		treeGridAdapter: ElementsTreeControl;
		treeToggleButton: HTMLElement;
		ownerPanel: ViewPanel;
		cuiLayout: CuiLayout;
	};
	modules: {
		[index: string]: unknown;
		parser: DojoParseClass;
		TreeGridAdapter: DojoClass;
		Editor: DojoClass;
		ContextMenu: DojoClass;
	};
	eventHandlers: {
		window: Record<string, DefaultHandler>;
	};
	topWindow: ItemViewWindow;
}

interface CuiExecutionContextData {
	aras: ArasObject;
	viewmodel: StructuredDocument;
	documentationEnums: typeof Enums;
	documentViewSettings: EditorTabViewSettings;
	panelViewSettings: PanelSettings;
	viewController: EditorViewPanelController;
	controls: {
		ownerPanel: ViewPanel;
		searchPopupPanel: PopupPanel;
		searchControl: SearchComponent;
	};
	get isEditMode(): boolean;
	get selectedElement(): XmlSchemaElement;
}

export default class EditorViewPanelController extends BaseViewController {
	declare aras: ArasObject;
	declare container: EditorViewPanelContainerWindow;
	declare isUIControlsCreated: boolean;
	declare isViewSettingUp: boolean;
	declare viewContext: ViewContextData;

	override initialSetup(container: EditorViewPanelContainerWindow): void {
		this.isUIControlsCreated = false;
		this.isViewSettingUp = false;
		this.container = (container || window) as EditorViewPanelContainerWindow;

		this.setupContainer();
		this.initializeView();
	}

	override setupContainer() {
		const { container } = this;

		container.aras = container.aras || this.container.parent.aras;
	}

	override initializeView(parameters: Record<string, unknown> = {}): void {
		const ownerViewPanel = this.container.frameElement
			.ownerViewPanel as ViewPanel;

		this.aras =
			(parameters.aras as ArasObject) ||
			(this.container.aras = this.container.parent.aras);
		this.viewContext = {
			data: {
				structuredDocument: null as unknown as StructuredDocument,
				panelViewSettings: {} as PanelSettings,
				copiedViewSettings: undefined,
				isTreeExpanded: true,
				currentUser: '',
				isPanelActive: false,
				isMatchReplacing: false,
				treeOriginWidth: 0,
				metadataProvider: new MetadataProvider({ aras: this.aras })
			},
			controls: {
				ownerPanel: ownerViewPanel,
				searchControl: null as unknown as SearchReplaceComponent,
				searchPopupPanel: null as unknown as PopupPanel,
				dndController: null as unknown as DndController,
				editorControl: null as unknown as EditorControl,
				treeGridAdapter: null as unknown as ElementsTreeControl,
				headerControls: {
					headerContainer: document.querySelector(
						'.viewpanel-header'
					) as HTMLElement,
					statusMark: document.querySelector('.status-mark') as HTMLElement,
					documentInfo: document.querySelector('.document-info') as HTMLElement,
					editInfo: document.querySelector('.edit-info') as HTMLElement,
					filterInfo: document.querySelector('.filter-info') as HTMLElement,
					closeView: document.querySelector('.closeview-button') as HTMLElement
				},
				treeContainerWidget: null as unknown as DojoWidget,
				xmlContainer: document.querySelector('.xml-container') as HTMLElement,
				htmlContainer: document.querySelector('.html-container') as HTMLElement,
				xmlContentFrame: document.querySelector(
					'.xml-content'
				) as HTMLIFrameElement,
				treeContainer: document.querySelector('.tree-container') as HTMLElement,
				editorControlNode: document.querySelector('.editor-control'),
				treeControl: document.querySelector('.tree-control'),
				toolbarContainer: document.querySelector(
					'.toolbar-container'
				) as HTMLElement,
				htmlContainerWidget: null as unknown as DojoWidget,
				treeToggleButton: document.querySelector(
					'.toggletree-button'
				) as HTMLElement,
				cuiLayout: null as unknown as CuiLayout
			},
			modules: {
				parser: null as unknown as DojoParseClass,
				TreeGridAdapter: null as unknown as DojoClass,
				XmlToHTMLTransform: null,
				Editor: null as unknown as DojoClass,
				ContextMenu: null as unknown as DojoClass
			},
			eventHandlers: { window: {} },
			topWindow: this.aras.getMostTopWindowWithAras(window) as ItemViewWindow,
			editState: null,
			isRegisterBeforeSave: false
		};

		this.attachItemViewEventListeners();
	}

	attachItemViewEventListeners() {
		const itemViewController = this.viewContext.topWindow.viewController;

		itemViewController.addEventListener(
			'discardReferencedItemChanges',
			this.discardExternalChangesHandler as DefaultHandler,
			{ owner: this }
		);
	}

	protected discardExternalChangesHandler(
		itemNode: XmlNode,
		referenceIds: string[]
	) {
		const { panelViewSettings, structuredDocument } = this.viewContext.data;
		const { documentItem } = panelViewSettings;

		if (documentItem === itemNode && this.aras.isDirtyEx(documentItem)) {
			structuredDocument.SuspendInvalidation();
			structuredDocument.SwitchLanguage(
				structuredDocument.DefaultLanguageCode()
			);

			const allElements = structuredDocument.getAllElements();
			allElements.forEach((element) => {
				if (element.is('ArasBlockElement') && element.isExternal()) {
					const documentElement = element as ArasBlockXmlSchemaElement;

					if (referenceIds.includes(documentElement.ItemId() as string)) {
						documentElement.dropItemPropertiesChanges();
					}
				}
			});
			structuredDocument.ResumeInvalidation();
		}
	}

	setupView(
		viewSettings: PanelSettings,
		optionalParameters = {}
	): Promise<void> {
		this.isViewSettingUp = true;
		this.viewContext.data.panelViewSettings = viewSettings;
		this.updateViewDom();

		if (
			viewSettings &&
			viewSettings.isPrimaryView &&
			!this.viewContext.isRegisterBeforeSave
		) {
			this.viewContext.isRegisterBeforeSave = true;
			this.viewContext.topWindow.registerCommandEventHandler(
				window,
				() => {
					this.beforeSaveItem();
				},
				'before',
				'save'
			);
		}

		return Promise.resolve(
			this.isUIControlsCreated ? Promise.resolve() : this.createUIControls()
		).then(() => {
			this.setEditState(this.isViewEditable());
			this.applyViewSettings(viewSettings, optionalParameters);

			this.isViewSettingUp = false;
		});
	}

	updateViewBody() {
		// do nothing
	}

	updateViewHeader() {
		const panelViewSettings = this.viewContext.data.panelViewSettings;
		const documentItem = panelViewSettings.documentItem;
		const headerControls = this.viewContext.controls.headerControls;
		const systemLanguages = this.viewContext.controls.ownerPanel.getSharedData(
			'systemLanguages'
		) as Record<string, string>;
		const languageName = systemLanguages[panelViewSettings.languageCode];
		const isCurrent =
			this.aras.getItemProperty(documentItem, 'is_current') === '1';
		const resourceLocation = '../Modules/aras.innovator.TDF';
		const contentFilters = panelViewSettings.filterFamilies;
		const separator = '<span class="separator"> | </span>';
		let documentInfo = '';
		let filterInfo = '';
		const itemNumber = this.aras.getItemProperty(documentItem, 'item_number');

		for (const filterName in contentFilters) {
			filterInfo +=
				(filterInfo ? ', ' : '') + contentFilters[filterName].join(',');
		}

		filterInfo = filterInfo
			? `${this.aras.getResource(
					resourceLocation,
					'viewpaneltitle.filterprefix'
				)}: ${filterInfo}`
			: '';

		switch (panelViewSettings.role) {
			case 'import':
				documentInfo = this.aras.getResource(
					resourceLocation,
					'importcontent.viewpanel.documentinfotemplate',
					itemNumber
				);
				break;
			default:
				documentInfo = `${itemNumber} - ${languageName} - ${this.aras.getItemProperty(
					documentItem,
					'major_rev'
				)}.${this.aras.getItemProperty(documentItem, 'generation')}${
					isCurrent ? ' (Current)' : ''
				}`;
				break;
		}

		headerControls.documentInfo.textContent = documentInfo;
		headerControls.editInfo.innerHTML = this.isViewReadonly()
			? `${separator}${this.aras.getResource(
					resourceLocation,
					'viewpaneltitle.readonly'
				)}`
			: '';
		headerControls.filterInfo.innerHTML = filterInfo
			? `${separator}${filterInfo}`
			: '';

		headerControls.headerContainer.setAttribute(
			'title',
			documentInfo + filterInfo
		);

		headerControls.closeView.style.display = panelViewSettings.isPrimaryView
			? 'none'
			: '';
	}

	closeView(): void {
		const { ownerPanel } = this.viewContext.controls;

		ownerPanel.hide();
	}

	updateViewDom() {
		const bodyNode = this.container.document.body;
		const { panelViewSettings } = this.viewContext.data;
		const { closeView } = this.viewContext.controls.headerControls;
		const buttonTextNode = closeView.querySelector('.closeview-button__text');

		bodyNode.classList.toggle(`role-${panelViewSettings.role}`, true);

		if (buttonTextNode) {
			buttonTextNode.textContent = this.aras.getResource('', 'common.close');
		}

		this.updateViewHeader();
	}

	setupViewDisplayType(displayType: string) {
		const viewControls = this.viewContext.controls;
		const isHtmlType = displayType === 'html';

		viewControls.xmlContainer.classList.toggle('is-hidden', isHtmlType);
		viewControls.htmlContainer.classList.toggle('is-hidden', !isHtmlType);

		if (isHtmlType) {
			this.layoutHtmlContainer();
		}
	}

	layoutHtmlContainer() {
		if (this.isUIControlsCreated) {
			const viewControls = this.viewContext.controls;
			viewControls.htmlContainerWidget.resize();
		}
	}

	beforeSaveItem() {
		const viewData = this.viewContext.data;
		const documentItem = viewData.panelViewSettings.documentItem;
		if (!this.aras.isDirtyEx(documentItem)) {
			const structuredDocument = viewData.structuredDocument;
			const languageCode = structuredDocument.DefaultLanguageCode();

			this.aras.setItemTranslation(
				documentItem,
				'document_xml',
				structuredDocument.getSavedDocumentXml(languageCode),
				languageCode
			);
		}
	}

	applyViewSettings(
		viewSettings: PanelSettings,
		optionalParameters: Record<string, unknown>
	) {
		optionalParameters = optionalParameters || {};

		if (viewSettings) {
			const viewControls = this.viewContext.controls;
			const viewData = this.viewContext.data;
			const currentSettings =
				viewData.copiedViewSettings || viewData.panelViewSettings;
			const isItemChanged =
				currentSettings.documentItem !== viewSettings.documentItem;
			const isLanguageChanged =
				currentSettings.languageCode !== viewSettings.languageCode;
			const isDocumentReloadRequired =
				isItemChanged || optionalParameters.forceReload;

			this.setupViewDisplayType(viewSettings.displayType);
			if (currentSettings.displayType !== viewSettings.displayType) {
				this.onDisplayTypeChanged(viewSettings.displayType);
			}

			viewData.structuredDocument.SuspendInvalidation();

			if (isDocumentReloadRequired) {
				viewData.structuredDocument.Reload(viewSettings.documentItem, {
					languageCode: viewSettings.languageCode,
					forceReload: optionalParameters.forceReload as boolean
				});
			} else if (isLanguageChanged) {
				viewData.structuredDocument.SwitchLanguage(viewSettings.languageCode);
			}

			switch (viewSettings.displayType) {
				case 'html':
					const optionalContentHelper =
						viewData.structuredDocument.OptionalContent();
					const displayTypes = Enums.DisplayType;
					const isFiltrationHidden =
						viewSettings.filteredContentView === 'hidden';
					const isContentFiltered =
						currentSettings.filteredContentView !==
							viewSettings.filteredContentView ||
						(isFiltrationHidden &&
							JSON.stringify(currentSettings.filterFamilies) !==
								JSON.stringify(viewSettings.filterFamilies));

					optionalContentHelper.DocumentView(viewSettings.filterFamilies);
					optionalContentHelper.DisplayPreference(
						(isFiltrationHidden
							? displayTypes.Hidden
							: displayTypes.Inactive) as number
					);

					if (isItemChanged || isLanguageChanged || isContentFiltered) {
						viewControls.searchControl.cleanupResults();
					}
					break;
				case 'xml':
					const frameDocument = viewControls.xmlContentFrame
						.contentDocument as Document;
					const xmlContent = this.prepareXmlContent(
						viewData.structuredDocument.origin.ownerDocument?.xml
					);

					frameDocument.open();
					frameDocument.write(xmlContent);
					frameDocument.close();
					break;
			}

			// During Reload method call queue is dropped and start state is inited, but due to ResumeInvalidation is used for rendering
			// optimization and additional state can be appended during that, the initial state should be dropped
			if (isDocumentReloadRequired) {
				viewData.structuredDocument.QueueChanges().dropCurrentState();
			}

			viewData.structuredDocument.setAdditionalSetting(
				'isSpellcheckActive',
				viewSettings.spellcheck
			);

			viewData.structuredDocument.invalidateElement(
				viewData.structuredDocument.Dom() as XmlSchemaElement
			);

			viewData.structuredDocument.ResumeInvalidation();

			if (viewControls.searchControl.isSearchActive()) {
				const matchIndex = viewControls.searchControl.getActiveMatchIndex();

				viewControls.searchControl.runSearch();
				viewControls.searchControl.setActiveMatch(matchIndex);
			}

			viewData.copiedViewSettings = Object.assign({}, viewSettings);
		}
	}

	onDisplayTypeChanged(displayType: string) {
		const customEvent = new CustomEvent('onDisplayTypeChanged', {
			detail: {
				displayType: displayType
			}
		});

		window.dispatchEvent(customEvent);
	}

	prepareXmlContent(xmlData: string): string {
		let expressionContent = '';

		if (xmlData) {
			const xslDocument = this.viewContext.modules.XmlToHTMLTransform as string;
			const expressionDocument = new this.container.XmlDocument();

			expressionDocument.loadXML(xmlData);
			expressionContent = expressionDocument.transformNode(xslDocument);
		}

		return expressionContent;
	}

	getCurrentUser() {
		return (
			this.viewContext.data.currentUser ||
			(this.viewContext.data.currentUser = this.aras.getUserID())
		);
	}

	isViewEditable() {
		const panelViewSettings = this.viewContext.data.panelViewSettings;
		const documentItem = panelViewSettings.documentItem;
		const documentViewSettings =
			this.viewContext.controls.ownerPanel.getSharedData(
				'documentViewSettings'
			) as EditorTabViewSettings;

		return Boolean(
			documentItem &&
				(this.aras.isTempEx(documentItem) ||
					(this.aras.isEditStateEx(documentItem) &&
						panelViewSettings.languageCode ===
							documentViewSettings.defaultLanguageCode))
		);
	}

	isViewReadonly() {
		const panelViewSettings = this.viewContext.data.panelViewSettings;
		const documentItem = panelViewSettings.documentItem;
		const documentViewSettings =
			this.viewContext.controls.ownerPanel.getSharedData(
				'documentViewSettings'
			) as EditorTabViewSettings;

		return (
			!documentItem ||
			this.aras.getItemProperty(documentItem, 'is_current') !== '1' ||
			panelViewSettings.languageCode !==
				documentViewSettings.defaultLanguageCode
		);
	}

	setEditState(newEditState: boolean): void {
		if (this.viewContext.editState !== newEditState) {
			this.viewContext.editState = Boolean(newEditState);

			if (this.isUIControlsCreated) {
				const editorControl = this.viewContext.controls.editorControl;
				const treeControl = this.viewContext.controls.treeGridAdapter;

				treeControl.activateDnD(true, {
					mode: newEditState ? '' : 'source',
					dropAction: newEditState ? '' : 'copy',
					force: true
				});
				editorControl.activateDnD(true, {
					mode: newEditState ? '' : 'source',
					dropAction: newEditState ? '' : 'copy',
					force: true
				});

				editorControl.set('disabled', !newEditState);
			}
		}
	}

	toggleTreeControl() {
		const viewData = this.viewContext.data;
		const viewControls = this.viewContext.controls;
		const containerWidget = viewControls.treeContainerWidget;
		const containerDomNode = containerWidget.domNode;

		viewData.isTreeExpanded = !viewData.isTreeExpanded;

		if (viewData.isTreeExpanded) {
			containerDomNode.style.width = viewData.treeOriginWidth + 'px';
			containerDomNode.classList.remove('collapsed');
		} else {
			viewData.treeOriginWidth =
				viewControls.treeContainerWidget.domNode.offsetWidth;
			containerDomNode.classList.add('collapsed');
		}

		if (containerWidget._splitterWidget) {
			containerWidget._splitterWidget.domNode.style.display =
				viewData.isTreeExpanded ? '' : 'none';
		}

		this.layoutHtmlContainer();
	}

	getCuiContextData() {
		const viewContext = this.viewContext;
		const viewData = viewContext.data;
		const viewControls = viewContext.controls;
		const documentViewSettings = viewControls.ownerPanel.getSharedData(
			'documentViewSettings'
		) as EditorTabViewSettings;
		const publicFacades = viewData.structuredDocument.getAdditionalSetting(
			'publicFacades'
		) as Record<string, unknown>;

		return {
			...publicFacades,
			aras: this.aras,
			viewmodel: viewData.structuredDocument,
			documentationEnums: Enums,
			documentViewSettings: documentViewSettings,
			panelViewSettings: viewData.panelViewSettings,
			viewController: this,
			controls: {
				ownerPanel: viewControls.ownerPanel,
				searchPopupPanel: viewControls.searchPopupPanel,
				searchControl: viewControls.searchControl
			},
			get isEditMode(): boolean {
				return (
					this.viewController as EditorViewPanelController
				).isViewEditable();
			},
			get selectedElement() {
				const selectedElements = viewData.structuredDocument.GetSelectedItems();
				return selectedElements.length === 1 && selectedElements[0];
			}
		} as CuiExecutionContextData;
	}

	initCuiLayout(containerNode: HTMLElement) {
		const viewData = this.viewContext.data;
		const viewControls = this.viewContext.controls;
		const cuiLayout = new this.container.CuiLayout(
			containerNode,
			'TDF.EditorView',
			{
				itemTypeName:
					viewData.panelViewSettings.documentItem.getAttribute('type'),
				contextData: this.getCuiContextData()
			}
		);

		// @ts-expect-error Property 'updateBunching' does not exist on type 'CuiLayout'. Keep updateBunching "false" for TDF layout
		cuiLayout.updateBunching = false;

		return cuiLayout.init().then(() => {
			viewControls.cuiLayout = cuiLayout;
		});
	}

	pagehideEventHandler() {
		const { controls } = this.viewContext;
		const { dndController, editorControl, treeGridAdapter, fileDnDSource } =
			controls;
		const windowHandlers = this.viewContext.eventHandlers.window;

		// unregister all dnd component from global controller
		dndController.unregisterComponent(editorControl as unknown as DndBidirect);
		dndController.unregisterComponent(treeGridAdapter);
		dndController.unregisterComponent(fileDnDSource as DndSource);

		this.container.removeEventListener(
			'pagehide',
			windowHandlers.pagehide as EventListener
		);
	}

	attachWindowEventHandlers() {
		const windowHandlers = this.viewContext.eventHandlers.window;

		windowHandlers.pagehide = () => this.pagehideEventHandler();
		this.container.addEventListener(
			'pagehide',
			windowHandlers.pagehide as EventListener
		);
	}

	notifyCuiLayout(eventName?: string) {
		const viewControls = this.viewContext.controls;

		if (viewControls.cuiLayout) {
			eventName = eventName || 'UpdateState';
			viewControls.cuiLayout.observer.notify(eventName);
		}
	}

	createStructuredDocument(): StructuredDocument {
		const { ownerPanel } = this.viewContext.controls;
		const { panelViewSettings, metadataProvider } = this.viewContext.data;
		const { documentItem, languageCode } = panelViewSettings;
		const tdfSettings = ownerPanel.getSharedData(
			'tdfSettings'
		) as TDFGlobalSettings;
		const itemTypeSettings = ownerPanel.getSharedData(
			'itemTypeSettings'
		) as ItemTypeSettingsProvider;
		const documentViewSettings = ownerPanel.getSharedData(
			'documentViewSettings'
		) as EditorTabViewSettings;
		const { connect, popup, declare } = this.viewContext.modules;
		const structuredDocument = new StructuredDocument({
			aras: this.aras,
			item: documentItem,
			defaultLanguageCode: documentViewSettings.defaultLanguageCode,
			currentLanguageCode: languageCode,
			optionFamilies: tdfSettings.optionFamilies,
			metadataProvider: metadataProvider,
			asyncDataLoading: true,
			itemTypeSettings,
			additionalSettings: {
				standaloneMode: documentItem.hasAttribute('standalone'),
				dojoModules: { connect, popup, declare },
				coreModules: {
					metadata: {
						method: metadataMethod
					}
				},
				...tdfSettings.additionalSettings
			}
		});

		const initPromise = structuredDocument.getStatePromise('initComplete');
		structuredDocument.setStatePromise(
			'initComplete',
			initPromise.then(() => this.preloadDocumentMetadata())
		);

		return structuredDocument;
	}

	createElementsTree(viewmodel: StructuredDocument): ElementsTreeControl {
		const { TreeGridAdapter } = this.viewContext.modules;

		return new TreeGridAdapter({
			connectId: 'techDocTree',
			viewModel: viewmodel,
			aras: this.aras
		}) as ElementsTreeControl;
	}

	createEditor(viewmodel: StructuredDocument): EditorControl {
		const { Editor } = this.viewContext.modules;

		const control = new Editor({
			structuredDocument: viewmodel,
			region: 'center',
			splitter: true,
			srcNodeRef: this.viewContext.controls.editorControlNode,
			id: 'techDocHtmlEditor'
		}) as EditorControl;

		control.startup();
		return control;
	}

	async setupDndSupport(viewmodel: StructuredDocument): Promise<void> {
		const { controls } = this.viewContext;

		const externalSource = (controls.fileDnDSource = new ExternalFileDndSource({
			viewmodel,
			dragModule: this.container.DragAndDrop as CoreDragModule,
			dragManager: this.container.dragManager as CoreDragManager,
			managedWindows: [
				this.container,
				controls.editorControl.iframe.contentWindow as Window
			]
		})) as DndSource;

		await this.initDndController({
			dndComponents: [
				externalSource,
				controls.treeGridAdapter,
				controls.editorControl as unknown as DndBidirect
			]
		});
	}

	parseMarkupControls(parser: DojoParseClass): Promise<void> {
		return new Promise<void>((resolve) => {
			parser.parse().then(() => {
				const { controls, data } = this.viewContext;
				const { dijit } = this.container;

				controls.htmlContainerWidget = dijit.byNode(
					controls.htmlContainer
				) as DojoWidget;
				controls.treeContainerWidget = dijit.byNode(controls.treeContainer);

				controls.treeToggleButton?.addEventListener('click', (clickEvent) => {
					this.toggleTreeControl();
					clickEvent.stopPropagation();
				});
				controls.treeContainerWidget?.domNode.addEventListener('click', () => {
					if (!data.isTreeExpanded) {
						this.toggleTreeControl();
					}
				});

				resolve();
			});
		});
	}

	override async onBeforeCreateUIControls() {
		const { modules } = this.viewContext;
		const xslDocument = new this.container.XmlDocument();
		const [
			parser,
			connect,
			popup,
			declare,
			TreeGridAdapter,
			ContextMenu,
			TranformXSL,
			Editor
		] = await this.loadDojoModules(
			'dojo/parser',
			'dojo/_base/connect',
			'dijit/popup',
			'dojo/_base/declare',
			'TDF/Scripts/Aras/Client/Controls/TechDoc/UI/EditorViewTreeGrid/TreeGridAdapter',
			'Aras/Client/Controls/Experimental/ContextMenu',
			'dojo/text!TDF/Styles/XMLtoHTML.xsl',
			'TDF/Scripts/Aras/Client/Controls/TechDoc/Editor'
		);

		xslDocument.loadXML(TranformXSL as unknown as string);
		xslDocument.documentElement.setAttribute(
			'xmlns:xsl',
			'http://www.w3.org/1999/XSL/Transform'
		);

		Object.assign(modules, {
			parser,
			connect,
			popup,
			declare,
			XmlToHTMLTransform: xslDocument,
			TreeGridAdapter,
			ContextMenu,
			Editor
		});
	}

	override async onAfterCreateUIControls() {
		this.attachActivationEventHandlers();
		this.attachWindowEventHandlers();

		this.container.document.body.classList.add('is-loaded');
		this.isUIControlsCreated = true;
		this.layoutHtmlContainer();
	}

	async preloadDocumentMetadata(rootElemements?: XmlSchemaElement[]) {
		const { structuredDocument, metadataProvider } = this.viewContext.data;
		const elements = rootElemements
			? rootElemements.reduce((result, element) => {
					result.push(...element.getAllChilds());
					return result;
				}, [] as XmlSchemaElement[])
			: structuredDocument.getAllElements();

		const propertyElements = elements.filter((element) =>
			element.is(Enums.XmlSchemaElementType.ItemProperty)
		) as ArasItemPropertyXmlSchemaElement[];
		const listIds: string[] = [];
		const filterIds: string[] = [];

		propertyElements.forEach((element) => {
			const datatype = element.getPropertyInfo('data_type');

			if (datatype === 'list') {
				listIds.push(element.getPropertyInfo('data_source'));
			} else if (datatype === 'filter list') {
				filterIds.push(element.getPropertyInfo('data_source'));
			}
		});

		//await metadataProvider.loadListsAsync(listIds);
		//await metadataProvider.loadListsAsync(filterIds, { type: 'filter list' });
		await metadataProvider.loadListsAsync([...new Set(listIds)]);
		await metadataProvider.loadListsAsync([...new Set(filterIds)], {
			type: 'filter list'
		});
	}

	override async processCreateUIControls() {
		const { controls, data, modules } = this.viewContext;
		const { panelViewSettings } = data;

		// should be created before parsing because document instance is used for controls initialization during parsing
		const structuredDocument = (data.structuredDocument =
			this.createStructuredDocument());

		await this.parseMarkupControls(modules.parser as DojoParseClass);

		controls.editorControl = this.createEditor(structuredDocument);

		// should be inited before toolbar since in toolbar  subscription
		const searchControl = this.setupSearchPanel();
		controls.editorControl.setSearchControl(searchControl);

		// init elements tree control
		controls.treeGridAdapter = this.createElementsTree(structuredDocument);

		this.registerViewShortcuts();
		this.attachViewModelEventHandlers();
		this.attachSearchEventHandlers();
		this.attachContextMenuEventHanlers();
		this.attachViewControllerEventHandlers();
		this.setupViewDisplayType(panelViewSettings.displayType);

		await structuredDocument.getStatePromise('initComplete');
		await controls.editorControl.getStatePromise('controlInited');
		await this.setupDndSupport(structuredDocument);

		this.setupPublicAPI();
		await this.initCuiLayout(controls.toolbarContainer || document.body);
	}

	setupPublicAPI() {
		const viewmodel = this.viewContext.data.structuredDocument;
		const { editorControl, treeGridAdapter } = this.viewContext.controls;
		const { publicFacades } = this.container.TDF;
		const documentFacade = new publicFacades.Document(viewmodel);
		const viewFacade = new publicFacades.View({
			document: documentFacade,
			controls: { editor: editorControl, tree: treeGridAdapter }
		});
		const publicContext = {
			document: documentFacade,
			enums: Enums,
			aras: this.aras,
			view: viewFacade
		};
		const oldContext = {
			...publicContext,
			viewmodel
		};

		viewmodel.setAdditionalSetting('publicFacades', {
			document: documentFacade,
			view: viewFacade
		});

		[
			viewmodel.eventsExecutor,
			treeGridAdapter.eventsExecutor,
			editorControl.eventsExecutor
		].forEach((executor) => {
			executor.extendExecutionContext(publicContext);
			executor.extendExecutionContext(oldContext, ControlEventAPIVersions.Beta);
		});
	}

	onDisplayChangedHandler(_displayType: string) {
		if (!this.isViewSettingUp) {
			const viewSettings = this.viewContext.data.panelViewSettings;
			const isFiltrationHidden = viewSettings.filteredContentView === 'hidden';
			const searchControl = this.viewContext.controls.searchControl;

			if (isFiltrationHidden && searchControl.isSearchActive()) {
				searchControl.runSearch();
			}
		}
	}

	onInvalidateHandler(
		viewmodel: StructuredDocument,
		eventArguments: { invalidationList: XmlSchemaElement[] }
	) {
		const isItemChange = eventArguments.invalidationList.length > 0;

		if (isItemChange) {
			if (
				viewmodel.IsEqualEditableLevel(
					Enums.EditLevels.IgnoreExternal,
					eventArguments.invalidationList
				)
			) {
				const currentLanguage = viewmodel.CurrentLanguageCode();
				const currentDomXml = viewmodel.origin.ownerDocument.xml;
				const savedDomXml = viewmodel.getSavedDocumentXml(currentLanguage);
				const oldContent = viewmodel.removeGeneratedContentNode(savedDomXml);
				const newContent = viewmodel.removeGeneratedContentNode(currentDomXml);

				// comparing only old and new content nodes, this will prevent from setting "isDirty" attribute if
				// only refences were updated during reload event
				if (
					oldContent.length !== newContent.length ||
					oldContent !== newContent
				) {
					const viewData = this.viewContext.data;
					const searchControl = this.viewContext.controls.searchControl;
					const structureDocumentItem = viewmodel.getDocumentItem();

					viewmodel.saveDocumentXml(currentDomXml, currentLanguage);

					if (!viewData.isMatchReplacing) {
						searchControl.cleanupResults();
					}

					structureDocumentItem.setAttribute('action', 'update');
				}
			}

			const customEvent = document.createEvent('Event');
			customEvent.initEvent('change:item', true, true);
			window.dispatchEvent(customEvent);
		}

		this.notifyCuiLayout();
	}

	attachViewModelEventHandlers() {
		const viewmodel = this.viewContext.data.structuredDocument;
		const optionalContentHelper = viewmodel.OptionalContent();

		optionalContentHelper.addEventListener(
			'onDisplayChanged',
			this.onDisplayChangedHandler as DefaultHandler,
			{ owner: this }
		);

		viewmodel.addEventListener(
			'OnInvalidate',
			this.onInvalidateHandler as DefaultHandler,
			{
				owner: this,
				before: true
			}
		);

		viewmodel.addEventListener(
			'onSelectionChanged',
			() => {
				this.notifyCuiLayout();
			},
			{
				owner: this,
				after: true
			}
		);
	}

	setupSearchPanel() {
		const viewControls = this.viewContext.controls;
		const searchPopupPanel = new this.container.PopupPanel({
			// const searchPopupPanel = new PopupPanel({
			aras: this.aras,
			visible: false,
			closable: false,
			movable: true,
			boundingNode: viewControls.htmlContainer,
			stickDistance: 30,
			style: {
				right: '10px',
				top: '10px',
				minHeight: '40px'
			}
		});
		const searchControl = (viewControls.searchControl =
			this.createSearchControl({
				containerNode: searchPopupPanel.contentNode,
				searchSource: this.viewContext.data.structuredDocument
			}));

		viewControls.searchControl = searchControl;
		viewControls.searchPopupPanel = searchPopupPanel;
		viewControls.htmlContainer.appendChild(searchPopupPanel);

		this.attachSearchPanelEventHandlers();

		return searchControl;
	}

	attachSearchPanelEventHandlers() {
		const viewControls = this.viewContext.controls;
		const popupPanel = viewControls.searchPopupPanel;
		const searchControl = viewControls.searchControl;

		popupPanel.addEventListener('onVisibilityChanged', () => {
			if (!popupPanel.visible) {
				searchControl.cleanupResults();

				searchControl.setSearchValue('');
				searchControl.setReplaceValue('');
			}

			this.notifyCuiLayout();
		});
	}

	createSearchControl(initialParameters: Record<string, unknown> = {}) {
		const resourceLocation = '../Modules/aras.innovator.TDF';

		return new SearchReplaceComponent({
			aras: this.aras,
			containerNode: initialParameters.containerNode as HTMLElement,
			searchSource: initialParameters.searchSource as StructuredDocument,
			searchEngine: new TextSearchEngine({
				aras: this.aras
			}),
			collapseOnSpaceLack: true,
			svgManager: this.container.ArasModules.SvgManager,
			resourceStrings: {
				placeholderText: this.aras.getResource(
					resourceLocation,
					'searchreplace.placeholderText'
				),
				replacePlaceholder: this.aras.getResource(
					resourceLocation,
					'searchreplace.replacePlaceholder'
				),
				prevButtonTitle: this.aras.getResource(
					resourceLocation,
					'searchreplace.prevButtonTitle'
				),
				nextButtonTitle: this.aras.getResource(
					resourceLocation,
					'searchreplace.nextButtonTitle'
				),
				replaceButtonTitle: this.aras.getResource(
					resourceLocation,
					'searchreplace.replaceButtonTitle'
				),
				replaceAllButtonTitle: this.aras.getResource(
					resourceLocation,
					'searchreplace.replaceAllButtonTitle'
				),
				noMatchesLabel: this.aras.getResource(
					resourceLocation,
					'searchreplace.noMatchesLabel'
				),
				modeButtonShowTitle: this.aras.getResource(
					resourceLocation,
					'searchreplace.modeButtonShowTitle'
				),
				modeButtonHideTitle: this.aras.getResource(
					resourceLocation,
					'searchreplace.modeButtonHideTitle'
				)
			}
		} as SearchReplaceComponentCreationParameters);
	}

	registerViewShortcuts() {
		const searchControl = this.viewContext.controls.searchControl;
		const searchPopupPanel = this.viewContext.controls.searchPopupPanel;
		const viewSettings = (this.viewContext.data.panelViewSettings ||
			{}) as PanelSettings;

		// ctrl+f shortcut registration
		this.aras.shortcutsHelperFactory.getInstance(window).subscribe(
			{
				shortcut: 'ctrl+f',
				preventBlur: true,
				useCapture: true,
				handler: function () {
					if (viewSettings.displayType === 'html') {
						searchControl.setMode('search');
						searchPopupPanel.visible = true;
						searchControl.focus();
					}
				},
				context: window
			},
			true
		);
		// ctrl+h shortcut registration
		this.aras.shortcutsHelperFactory.getInstance(window).subscribe(
			{
				shortcut: 'ctrl+h',
				preventBlur: true,
				useCapture: true,
				handler: () => {
					if (viewSettings.displayType === 'html') {
						searchControl.setMode('replace');
						searchPopupPanel.visible = true;
						searchControl.focus();
					}
				},
				context: window
			},
			true
		);
		// F3 shortcut registration
		this.aras.shortcutsHelperFactory.getInstance(window).subscribe(
			{
				shortcut: 'f3',
				preventBlur: true,
				useCapture: true,
				handler: () => {
					if (viewSettings.displayType === 'html') {
						searchControl.activateNextMatch();
					}
				},
				context: window
			},
			true
		);
	}

	async initDndController(optionalParameters: DndInitParameters = {}) {
		const { controls } = this.viewContext;
		const mainAras = this.aras.getMainArasObject();
		const dataProvider = mainAras.evalMethod(
			'tdf_GetDndDataShareProvider',
			''
		) as Map<string, unknown> | undefined;
		const { ContextMenu } = this.viewContext.modules;
		const dndController = (controls.dndController = new DndController({
			aras: this.aras,
			shareProvider: dataProvider,
			dojoModules: {
				ContextMenu
			}
		}));

		optionalParameters.dndComponents?.forEach((component) => {
			dndController.registerComponent(component);
		});
	}

	activatePanel() {
		const ownerPanel = this.viewContext.controls.ownerPanel;
		return ownerPanel.activate();
	}

	attachActivationEventHandlers() {
		const editorControl = this.viewContext.controls.editorControl;
		const xmlFrameControl = this.viewContext.controls.xmlContentFrame;

		document.addEventListener('click', this.activatePanel.bind(this));
		document.addEventListener('focusin', this.activatePanel.bind(this));

		editorControl.iframe.contentDocument?.addEventListener(
			'focusin',
			this.activatePanel.bind(this)
		);

		xmlFrameControl.addEventListener('load', () => {
			xmlFrameControl.contentDocument?.addEventListener(
				'mousedown',
				this.activatePanel.bind(this)
			);
		});
	}

	attachViewControllerEventHandlers() {
		const ownerPanel = this.viewContext.controls.ownerPanel;
		const viewController = ownerPanel.viewController;

		viewController.addEventListener(
			window,
			null,
			'onPanelActivated',
			(targetPanel: ViewPanel) => {
				if (targetPanel === ownerPanel) {
					this.setViewActiveState(true);
				}
			}
		);

		viewController.addEventListener(
			window,
			null,
			'onPanelDeactivated',
			(targetPanel: ViewPanel) => {
				if (targetPanel === ownerPanel) {
					this.setViewActiveState(false);
				}
			}
		);

		viewController.addEventListener(
			this,
			null,
			'importContent',
			(sourcePanel: ViewPanel, elements: XmlSchemaElement[]) => {
				// if panel is hidden then event handling should be skipped
				if (!ownerPanel.isVisible || sourcePanel === ownerPanel) {
					return;
				}

				let failureReason = '';

				if (this.isViewEditable()) {
					const viewmodel = this.viewContext.data.structuredDocument;
					const result = viewmodel.appendElement(...elements);

					if (result.elements) {
						viewmodel.SetSelectedItems(result.elements);
					} else {
						failureReason = result.failure as string;
					}
				} else {
					failureReason = this.aras.getResource(
						'../Modules/aras.innovator.TDF',
						'searchreplace.immutablereason.noteditable'
					);
				}

				if (failureReason) {
					this.aras.AlertError(failureReason);
				}
			}
		);
	}

	attachContextMenuEventHanlers() {
		const xmlFrameControl = this.viewContext.controls.xmlContentFrame;

		document.addEventListener('contextmenu', (menuEvent) => {
			menuEvent.preventDefault();
			menuEvent.stopPropagation();
		});

		xmlFrameControl.addEventListener('load', () => {
			(xmlFrameControl.contentDocument as Document).addEventListener(
				'contextmenu',
				(menuEvent) => {
					menuEvent.preventDefault();
					menuEvent.stopPropagation();
				}
			);
		});
	}

	attachSearchEventHandlers() {
		const searchControl = this.viewContext.controls.searchControl;

		searchControl.addEventListener(
			'onBeforeReplace',
			((_matchIndex: number, _targetMatch: unknown) => {
				const viewData = this.viewContext.data;

				viewData.isMatchReplacing = true;
				viewData.structuredDocument.SuspendInvalidation();
			}) as DefaultHandler,
			{ owner: this }
		);

		searchControl.addEventListener(
			'onAfterReplace',
			((
				_matchIndex: number,
				_targetMatch: unknown,
				_replaceResult: unknown
			) => {
				const viewData = this.viewContext.data;

				viewData.structuredDocument.ResumeInvalidation();
				viewData.isMatchReplacing = false;
			}) as DefaultHandler,
			{ owner: this }
		);

		searchControl.addEventListener(
			'onBeforeReplaceAll',
			() => {
				const viewData = this.viewContext.data;

				viewData.isMatchReplacing = true;
				viewData.structuredDocument.SuspendInvalidation();
			},
			{ owner: this }
		);

		searchControl.addEventListener(
			'onAfterReplaceAll',
			() => {
				const viewData = this.viewContext.data;

				viewData.structuredDocument.ResumeInvalidation();
				viewData.isMatchReplacing = false;
			},
			{ owner: this }
		);
	}

	setViewActiveState(isFocused: boolean) {
		const headerControls = this.viewContext.controls.headerControls;
		const viewData = this.viewContext.data;

		if (viewData.isPanelActive !== isFocused) {
			viewData.isPanelActive = isFocused;

			if (isFocused) {
				const ownerPanel = this.viewContext.controls.ownerPanel;

				ownerPanel.raiseEvent(
					'onPanelActivated',
					ownerPanel,
					this.viewContext.data.panelViewSettings
				);
			}

			headerControls.headerContainer.classList.toggle('active', isFocused);
		}
	}
}

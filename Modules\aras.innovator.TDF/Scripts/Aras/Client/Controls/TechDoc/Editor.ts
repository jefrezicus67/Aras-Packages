/* eslint-disable tsdoc/syntax */
// eslint-disable-next-line
// @ts-nocheck
define([
	'dojo/_base/declare',
	'dijit/Editor',
	'dojo/keys',
	'dojo/aspect',
	'dijit/TooltipDialog',
	'dojo/dom-construct',
	'dojo/_base/sniff',
	'TechDoc/Aras/Client/Controls/TechDoc/UI/DOMRange',
	'TechDoc/Aras/Client/Controls/TechDoc/UI/DOM',
	'TechDoc/Aras/Client/Controls/TechDoc/UI/DOMRenderer',
	'TechDoc/Aras/Client/Controls/TechDoc/ViewModel/Aras/_ArasTableXmlSchemaElement/editor/plugins/ResizeTableColumn',
	'Aras/Client/Controls/Experimental/ContextMenu',
	'TDF/Scripts/Aras/Client/Controls/TechDoc/UI/InputFieldEditors/ItemPropertyEditor',
	'TDF/Scripts/Aras/Client/Controls/TechDoc/ConfigurableControlEvents/EditorControlEventsExecutor',
	'TDF/Scripts/components/common/CUIEventable',
	'TDF/Scripts/Aras/Client/Controls/TechDoc/UI/DnD/BaseClasses/DndBidirect',
	'TechDoc/Aras/Client/Controls/TechDoc/ViewModel/DocumentationEnums',
	'dijit/popup',
	'dojo/on'
], function (
	declare,
	DijitEditor,
	keys,
	aspect,
	TooltipDialog,
	domConstruct,
	has,
	DOMRange,
	DOMapi,
	DOMRenderer,
	ResizeTableColumn,
	ContextMenu,
	ItemPropertyEditor,
	ControlEventsExecutor,
	CUIEventable,
	Bidirect,
	Enums,
	popup,
	on
) {
	return declare([DijitEditor, Bidirect, CUIEventable], {
		viewmodel: null,
		actionsHelper: null,
		contentNode: null,
		_clipboard: null,
		_allowedKeydownKeys: {}, // the list of buttons to create child elements
		_specialKeypressCodes: { 13: true, 32: true },
		_environment: null,
		_passedKeyDownCheck: null,
		_contextMenu: null,
		_contextMenuKey: null,
		_isExplicitHeight: false,
		_currentSelection: null,
		_invalidateIteration: null,
		_isContentLoaded: null,
		_defferedMethodCalls: null,
		_classificationStyleNode: null,
		_searchControl: null,
		_textChangesObserver: null,
		_textObserverConfig: null,
		_searchData: null,
		_statePromises: null,
		_itemPropertyEditor: null,
		_dnd: null,
		_modules: null,
		data: null,

		constructor: function (args) {
			args.structuredDocument =
				args.structuredDocument || window.structuredDocument;
			const aras = args.structuredDocument
				? args.structuredDocument._aras
				: null;
			const keydownKeyIntervals = ['32', '48-57', '65-90', '96-111', '186-222']; // space, number, letters, num pad, (; = , - . / ~ [ \ ] ')
			let keyInterval;
			let lowerBound;
			let upperBound;

			this.aras = aras;
			this.viewmodel = args.structuredDocument;
			this.actionsHelper = this.viewmodel.ActionsHelper();
			this._clipboard = this.viewmodel.Clipboard();
			this.plugins = [
				{
					name: 'Aras.Client.Controls.TechDoc.ViewModel.Aras._ArasTableXmlSchemaElement.editor.plugins.ResizeTableColumn',
					command: 'ResizeTableColumn'
				}
			];
			this.data = {
				spellcheck: false,
				pluginsEnabled:
					args.pluginsEnabled !== undefined ? args.pluginsEnabled : true
			};
			this._modules = {
				enums: Enums,
				aspect: aspect,
				ControlEventsExecutor: ControlEventsExecutor
			};
			this._classificationStyleNode = null;
			this.styleSheets = args.styleSheet || 'Styles/EditorView/editor.css';
			this._currentSelection = [];
			this._invalidateIteration = 0;
			this._isContentLoaded = true;
			this._defferedMethodCalls = [];
			this._environment = {
				isMacOS: /mac/i.test(navigator.platform),
				isFirefox: aras ? aras.Browser.isFf() : has('ff'),
				isIE: false,
				isChrome: aras && aras.Browser.isCh(),
				isIE11: false
			};
			this._contextMenuKey = 0;
			this._textChangesObserver = new MutationObserver(
				this._onTextElementChange.bind(this)
			);
			this._statePromises = {
				controlInited: this.createPromise()
			};
			this._textObserverConfig = {
				subtree: true,
				childList: true,
				characterData: true,
				characterDataOldValue: true
			};

			this.actionsHelper.editor = this;
			this.setSearchControl(args.searchControl);

			for (i = 0; i < keydownKeyIntervals.length; i++) {
				keyInterval = keydownKeyIntervals[i].split('-');

				if (keyInterval.length == 1) {
					this._allowedKeydownKeys[keyInterval[0]] = true;
				} else {
					lowerBound = Math.min(
						parseInt(keyInterval[0]),
						parseInt(keyInterval[1])
					);
					upperBound = Math.max(
						parseInt(keyInterval[0]),
						parseInt(keyInterval[1])
					);

					for (j = lowerBound; j <= upperBound; j++) {
						this._allowedKeydownKeys[j] = true;
					}
				}
			}

			Object.defineProperty(this, 'scrollNode', {
				get: function () {
					return this.editNode;
				}
			});
			Object.defineProperty(this, 'eventsExecutor', {
				get: () => {
					return this.cuiEventsExecutor;
				}
			});

			// cltr + key handlers
			this.addKeyHandler(66, true, false, this.handleCtrlB); // Ctlr + B
			this.addKeyHandler(73, true, false, this.handleCtrlI); // Ctlr + I
			this.addKeyHandler(83, true, false, this.handleCtrlS); // Ctrl + S
			this.addKeyHandler(85, true, false, this.handleCtrlU); // Ctlr + U
			this.addKeyHandler(89, true, false, this.handleCtrlY); // Ctrl + Y
			this.addKeyHandler(90, true, false, this.handleCtrlZ); // Ctrl + Z
		},

		createPromise: function (handler) {
			const promiseDescriptor = {};

			return Object.assign(promiseDescriptor, {
				promise: new Promise((resolve, reject) => {
					promiseDescriptor.resolve = resolve;
					promiseDescriptor.reject = reject;

					if (handler) {
						handler(resolve, reject);
					}
				})
			});
		},

		getStatePromise: function (stateName, propertyName) {
			return this._statePromises[stateName]?.[propertyName || 'promise'];
		},

		syncModelWithHTML: function (element) {
			const elementDomNode = this.domapi.getNode(element);

			if (element && !element._domSynchronized) {
				element.updateFromDom(elementDomNode);
				element._domSynchronized = true;
			}
		},

		syncBeforeAction: function (e) {
			// save data from range
			this.domRange.refresh();
			const modelCursor = this.viewmodel.Cursor();
			const cursorData = {
				start: modelCursor.start,
				startOffset: modelCursor.startOffset,
				end: modelCursor.end,
				endOffset: modelCursor.endOffset
			};

			this.syncModelWithHTML(modelCursor.commonAncestor);

			// restore range
			this.domRange.setCursorTo(
				cursorData.start,
				cursorData.startOffset,
				cursorData.end,
				cursorData.endOffset
			);

			if (
				modelCursor.commonAncestor &&
				modelCursor.commonAncestor.is('ArasTextXmlSchemaElement')
			) {
				modelCursor.commonAncestor.InvalidRange(this.viewmodel.Cursor());
			}
		},

		blurTextNode: function (e) {
			const id = e.target.getAttribute('id');
			const element = this.viewmodel.GetElementById(id);

			// need to update model cursor before focus will be lost
			this.domRange.refresh();

			this.syncModelWithHTML(element);
		},

		handleCtrlZ: function (e) {
			this.syncBeforeAction(e);
			this.actionsHelper.executeAction('undoaction');

			return false;
		},

		handleCtrlY: function (e) {
			this.syncBeforeAction(e);
			this.actionsHelper.executeAction('redoaction');

			return false;
		},

		_getEventHandling: function (eventType) {
			const editorSection =
				(this.viewmodel.getAdditionalSetting('EventHandling') || {}).editor ||
				{};
			return eventType ? editorSection[eventType] : editorSection;
		},

		handleShortcuts: function (keyEvent) {
			const keyCode = keyEvent.which || keyEvent.keyCode;
			const keyHandlers = this._keyHandlers[keyCode];
			let isEventSuppressed = false;

			if (keyHandlers && !keyEvent.altKey) {
				const isCtrlPressed = this._environment.isMacOS
					? keyEvent.metaKey
					: keyEvent.ctrlKey;

				for (const eventHandler of keyHandlers) {
					if (
						eventHandler.shift === keyEvent.shiftKey &&
						eventHandler.ctrl === isCtrlPressed
					) {
						if (eventHandler.handler.apply(this, [keyEvent]) === false) {
							isEventSuppressed = true;
						}
					}
				}
			}

			return isEventSuppressed;
		},

		handleCtrlV: function (e) {
			// currently unused due to changes in Copy/Paste functionality
			this.syncBeforeAction(e);
			let text = this._clipboard.getData('Text') || '';
			// +++ IR-029149 +++
			text = text.replace(/\r/g, '');
			// --- IR-029149 ---
			this.domRange.refresh();

			this.viewmodel.SuspendInvalidation();

			const _cursor = this.viewmodel.Cursor();
			const isCollapsed = _cursor.collapsed;
			const startItem = _cursor.start;
			const ancesstorItem = _cursor.commonAncestor;

			if (ancesstorItem && ancesstorItem.is('ArasTextXmlSchemaElement')) {
				const content = this._clipboard.getData('ArasTextXmlSchemaElement');

				if (content && content.plainText == text) {
					ancesstorItem.InsertEmphs(content.formattedText);
				} else {
					ancesstorItem.InsertText(text);
				}
			} else if (ancesstorItem || startItem) {
				if (!isCollapsed) {
					_cursor.DeleteContents();
				}

				if (_cursor.collapsed) {
					const selectedItem = _cursor.commonAncestor;

					if (selectedItem && selectedItem.is('XmlSchemaText')) {
						const insertPosition = _cursor.startOffset;
						const stringBeforeEditing = selectedItem.Text();
						const stringAfterEditing = [
							stringBeforeEditing.slice(0, insertPosition),
							text,
							stringBeforeEditing.slice(insertPosition)
						].join('');

						selectedItem.Text(stringAfterEditing);
						_cursor.Set(
							selectedItem,
							insertPosition + text.length,
							selectedItem,
							insertPosition + text.length
						);
					}
				}
			}

			this.viewmodel.ResumeInvalidation();

			// we handle all dom modifications manually
			return false;
		},

		handleCtrlC: function (e) {
			// currently unused due to changes in Copy/Paste functionality
			this.syncBeforeAction(e);
			this._copyToClipboard();
			return false;
		},

		handleCtrlX: function (e) {
			// currently unused due to changes in Copy/Paste functionality
			this.syncBeforeAction(e);

			this.domRange.refresh();
			const plainText = this.domRange.plainText;

			if (plainText) {
				const viewCursor = this.viewmodel.Cursor();
				const ancesstorItem = viewCursor.commonAncestor;

				this._clipboard.setData('Text', plainText);
				this._copyToClipboard();

				// delete selection
				this.viewmodel.SuspendInvalidation();

				if (ancesstorItem && ancesstorItem.is('ArasTextXmlSchemaElement')) {
					if (!viewCursor.collapsed) {
						ancesstorItem.DeleteText();
					}
				} else {
					const startItem = viewCursor.start;
					const endItem = viewCursor.end;
					const startPosition = viewCursor.startOffset;
					const endPosition = viewCursor.endOffset;

					if (startItem && endItem && startPosition != -1) {
						if (startItem == endItem && startItem.is('XmlSchemaText')) {
							const stringBeforeEditing = startItem.Text();
							const stringAfterEditing = [
								stringBeforeEditing.slice(0, startPosition),
								stringBeforeEditing.slice(endPosition)
							].join('');

							startItem.Text(stringAfterEditing);
							viewCursor.Set(
								startItem,
								startPosition,
								startItem,
								startPosition
							);
						}
					}
				}

				this.viewmodel.ResumeInvalidation();
			}

			return false;
		},

		onBeforeDeactivate: function () {
			// error is triggered for some reasons in IE when perform text formating
		},

		onBeforeActivate: function () {
			// error is triggered for some reasons in IE when perform text formating
		},

		startup: function () {
			// eslint-disable-next-line prefer-rest-params
			this.inherited(arguments);

			if (this._tablePluginHandler) {
				this._tablePluginHandler.connectDraggable = function () {
					/* deactivate the old code to drag&drop in old IE*/
				};
			}
			// get rid of toolbar from editor
			domConstruct.destroy(this.toolbar.domNode.parentNode);
		},

		/**
		 * @param {String} html
		 */
		onLoad: function (html) {
			this.inherited(arguments); // eslint-disable-line prefer-rest-params

			this.domapi = new DOMapi({
				document: this.document,
				viewmodel: this.viewmodel
			});
			this.domRenderer = new DOMRenderer({
				domapi: this.domapi,
				viewmodel: this.viewmodel
			});
			this.domRange = new DOMRange({
				window: this.window,
				viewmodel: this.viewmodel,
				domapi: this.domapi
			});

			this._itemPropertyEditor = new ItemPropertyEditor({
				aras: this.aras,
				metadataProvider: this.viewmodel.metadataProvider,
				modules: {
					popup,
					TooltipDialog
				}
			});

			aspect.after(
				this.domRange,
				'onRefresh',
				this._onDOMRangeRefresh.bind(this),
				true
			);

			// init editor nodes with spellcheck
			// replace editor innerHTML content with root node, which will be used as storage for documentContent
			this.editNode.innerHTML = '<div class="editorContentNode" ></div>';
			this.contentNode = this.editNode.firstChild;

			// init shadow input
			this._initShadowInput();

			this.editNode.setAttribute('contentEditable', 'false');

			this.bodyNode = this.editNode.parentNode;
			this.bodyNode.spellcheck = false;
			this.bodyNode.setAttribute('contentEditable', 'true');
			this.bodyNode.setAttribute('tabindex', '-1');

			// prevent context menu on editable grid
			this.editNode.oncontextmenu = this.onContextMenuShow.bind(this);

			this.scrollNode.addEventListener(
				'scroll',
				this.dropExplicitContentHeight.bind(this)
			);

			this._contextMenu = new ContextMenu(this.editNode, true);
			aspect.after(
				this._contextMenu,
				'onItemClick',
				this._onMenuItemClick.bind(this),
				true
			);

			this.iframe.onfocus = function () {
				// it was pulled from RichText.js it breaks contextmenu on TOC
				// _this.editNode.setActive();
			};

			this.viewmodel.getStatePromise('initComplete').then(
				function () {
					this._onViewModelInitialized();
				}.bind(this)
			);

			on(
				this.editNode,
				'.ArasTextXmlSchemaElement:focusout',
				this.blurTextNode.bind(this)
			);
			on(
				this.editNode,
				'.XmlSchemaText:focusout',
				this.blurTextNode.bind(this)
			);
			on(this.editNode, 'dblclick', this.onDblClick.bind(this));
			on(this.editNode, 'paste', this.onPaste.bind(this));

			this.editNode.addEventListener(
				'mousemove',
				this.onMouseMoveHandler.bind(this)
			);

			this.activateDnD();
		},

		onMouseMoveHandler: function (mouseEvent) {
			const elementNode = mouseEvent.target.closest('.ArasElement');
			const previousHoverNode = this.data.hoveredElementNode;

			if (elementNode !== previousHoverNode) {
				previousHoverNode?.classList.toggle('element-hovered', false);
				elementNode?.classList.toggle('element-hovered', true);

				this.data.hoveredElementNode = elementNode;
			}
		},

		_onViewModelInitialized: function () {
			this.applySchemaSettings();
			this.setupEventsExecutor();

			this._setInitialValue();

			this.viewmodel.addEventListener(
				'OnInvalidate',
				this._onViewModelInvalidate,
				{ owner: this, after: true }
			);

			aspect.after(
				this.viewmodel,
				'onSelectionChanged',
				this.selectionChangeHandler.bind(this),
				true
			);
			aspect.after(
				this.viewmodel,
				'OnClassificationChanged',
				this._onClassificationChanged.bind(this),
				true
			);

			this.viewmodel.addEventListener(
				'onAdditionalSettingChanged',
				this._onAdditionalSettingChanged,
				{ owner: this }
			);

			this.actionsHelper.addEventListener(
				'ActionExecuted',
				this.onActionExecutedHandler,
				{ owner: this }
			);

			this._initPlugins();
		},

		_loadPlugins: function () {
			return new Promise((resolve) => {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				require([
					'Vendors/hyperhtml-element.min',
					'JSBundles/tdf.editorplugins'
				], () => {
					this._modules.plugins = {
						...(window.TDF?.components.editorPlugins || {})
					};

					resolve(this._modules.plugins);
				});
			});
		},

		_initPlugins: async function () {
			const pluginModules = await this._loadPlugins();
			const topWindow = this.aras.getMostTopWindowWithAras(window);

			for (const pluginType in pluginModules) {
				const pluginModule = pluginModules[pluginType];
				const plugin = new pluginModule({
					settings: {
						topWindow: topWindow,
						showSize: true
					},
					modules: {
						aspect: this._modules.aspect
					}
				});

				if (this.data.pluginsEnabled) {
					plugin.register(this);
				}
			}
		},

		initDndData: function () {
			const dndData = this.inherited(arguments); // eslint-disable-line prefer-rest-params

			return Object.assign(dndData, {
				eventListeners: {
					...dndData.eventListeners,
					sourcemousemove: this.dndSourceMouseMoveHandler.bind(this),
					sourcedocumentkeyup: this.dndSourceDocumentKeyUp.bind(this)
				},
				styling: {
					sourceNodeClass: 'dnd-sourcenode',
					sourceInvalidClass: 'dnd-sourceinvalid',
					dropboxClass: 'dnd-dropbox',
					dropAllowedClass: 'dnd-dropbox_allowed',
					dropDeniedClass: 'dnd-dropbox_denied'
				}
			});
		},

		activateDnD: function (doActive) {
			if (this.iframe?.contentDocument) {
				Object.assign(this.dnd, {
					controls: {},
					domNode: this.iframe.contentDocument
				});

				this.inherited(arguments); // eslint-disable-line prefer-rest-params
			}
		},

		cleanupDraggableElement: function () {
			const dndData = this.dnd;
			const activeElement = dndData.activeDraggableElement;

			if (activeElement) {
				const activeNode = dndData.activeDraggableNode;

				activeNode.removeAttribute('draggable');
				activeNode.classList.toggle('overlayed', false);

				dndData.activeDraggableElement = null;
				dndData.activeDraggableNode = null;
			}
		},

		setDraggableElement: function (targetElement) {
			if (
				targetElement?.Parent &&
				targetElement !== this.dnd.activeDraggableElement
			) {
				const elementNode = this.domapi.getNode(targetElement);
				const hasChildren = Boolean(
					elementNode.querySelector('.XmlSchemaElement')
				);

				this.cleanupDraggableElement();

				elementNode.classList.toggle('overlayed', !hasChildren);
				elementNode?.setAttribute('draggable', true);

				this.dnd.activeDraggableElement = targetElement;
				this.dnd.activeDraggableNode = elementNode;
			}
		},

		dndSourceMouseMoveHandler: function (event) {
			if (event.shiftKey || event.ctrlKey) {
				const targetElement =
					this.viewmodel.selection.normalizeSelectionElement(
						this.domapi.getObject(event.target)
					);

				this.setDraggableElement(targetElement);
			}
		},

		dndSourceDocumentKeyUp: function (event) {
			if (!event.shiftKey && !event.ctrlKey) {
				this.cleanupDraggableElement();
			}
		},

		attachDnDEventListeners: function (targetNode, addListeners) {
			this.inherited(arguments); // eslint-disable-line prefer-rest-params

			if (targetNode) {
				const documents = this.getContentDocuments(document);
				const actionMethod = `${addListeners ? 'add' : 'remove'}EventListener`;

				targetNode[actionMethod](
					'mousemove',
					this.dnd.eventListeners.sourcemousemove,
					true
				);

				documents.forEach((targetDocument) => {
					targetDocument[actionMethod](
						'keyup',
						this.dnd.eventListeners.sourcedocumentkeyup
					);
				});
			}
		},

		activateDropControls: function (doEnabled) {
			const dndControls = this.dnd.controls || (this.dnd.controls = {});
			const positionNode =
				dndControls.positionNode ||
				(dndControls.positionNode = HyperHTMLElement.wire()`
					<div class="${this.dnd.styling.dropboxClass}"></div>`);

			if (doEnabled) {
				this.contentNode.appendChild(positionNode);
			} else if (positionNode.parentNode) {
				positionNode.parentNode.removeChild(positionNode);
			}
		},

		isDragAllowed: function (dndEvent) {
			const dropAction = dndEvent.ctrlKey ? 'copy' : 'move';
			const activationAction = this.dnd.activationParameters.dropAction;

			return !activationAction || activationAction === dropAction;
		},

		prepareDragData: function (dndEvent) {
			const dragData = this.inherited(arguments); // eslint-disable-line prefer-rest-params

			const targetElement = this.viewmodel.selection.normalizeSelectionElement(
				this.domapi.getObject(dndEvent.target)
			);

			if (targetElement) {
				const viewModel = this.viewmodel;
				let selectedElements = viewModel.GetSelectedItems();
				const dragNodes = {};

				// if there are selected items in grid, then drag them, in other case drag row under cursor
				if (!selectedElements.includes(targetElement)) {
					selectedElements.push(targetElement);
					viewModel.SetSelectedItems(selectedElements);
				}

				selectedElements = selectedElements.filter((element) => {
					const elementId = element.Id();

					if (
						element.Parent === targetElement.Parent &&
						!dragNodes[elementId]
					) {
						dragNodes[elementId] = this.domapi.getNode(element);
						return true;
					}
					return false;
				});

				Object.assign(dragData, {
					sourceType: 'schemaelement',
					schemaElements: selectedElements,
					dropAction: dndEvent.ctrlKey ? 'copy' : 'move',
					dragNodes: dragNodes
				});
			}

			this.raiseEvent('onDragDataPrepared', this, dragData);
			this.stylizeDragNodes(true);

			return dragData;
		},

		dragStartHandler: function (dndEvent) {
			if (!dndEvent.shiftKey && !dndEvent.ctrlKey) {
				dndEvent.preventDefault();
				return;
			}

			// eslint-disable-next-line prefer-rest-params
			if (this.inherited(arguments)) {
				this.viewmodel.SuspendInvalidation();
				this.syncBeforeAction();

				// required in FF to start dragging
				dndEvent.dataTransfer.setData('text', '');

				setTimeout(() => {
					this.viewmodel.ResumeInvalidation();
				});
			}
		},

		dragEndHandler: function (dndEvent) {
			this.stylizeDragNodes(false);
			this.cleanupDraggableElement();
			this.hideDropbox();

			// eslint-disable-next-line prefer-rest-params
			this.inherited(arguments);
		},

		stylizeDragNodes: function (applyStyling) {
			const dragData = this.getDragData();

			if (dragData) {
				const { dragNodes, sourceValid } = dragData;

				for (const itemId in dragNodes) {
					const node = dragNodes[itemId];
					node.classList.toggle(this.dnd.styling.sourceNodeClass, applyStyling);

					if (!sourceValid) {
						node.classList.toggle(
							this.dnd.styling.sourceInvalidClass,
							applyStyling
						);
					}
				}
			}
		},

		dragOverHandler: function (dndEvent) {
			const dragData = this.dnd.controller.getDragData();

			if (dragData) {
				const dropData = this.prepareDropData(dndEvent);

				dndEvent.preventDefault();
				dndEvent.stopPropagation();
				dndEvent.dataTransfer.dropEffect = dropData.dropAllowed
					? dragData.dropAction
					: 'none';

				if (dropData.anchorElement) {
					this.showDropbox();
				} else {
					this.hideDropbox();
				}
			}
		},

		dropHandler: function (dndEvent) {
			// eslint-disable-next-line prefer-rest-params
			this.inherited(arguments);
			this.cleanupDraggableElement();
		},

		prepareDropData: function (dndEvent) {
			// eslint-disable-next-line prefer-rest-params
			const dropData = this.inherited(arguments);
			const availablePlacement =
				this.dnd.controller.getDocumentAvailablePlacements(this.viewmodel);

			dropData.dropAllowed = false;

			if (availablePlacement) {
				let targetElement = this.viewmodel.selection.normalizeSelectionElement(
					this.domapi.getObject(dndEvent.target)
				);
				let parentElement = targetElement?.Parent;

				if (!targetElement) {
					const rootElemement = this.viewmodel.Dom();
					const firstLevelElements = rootElemement.ChildItems().List();

					if (firstLevelElements.length) {
						const firstElement = firstLevelElements[0];
						const lastElement =
							firstLevelElements[firstLevelElements.length - 1];
						const firstElementNode = this.domapi.getNode(firstElement);
						const lastElementNode = this.domapi.getNode(lastElement);
						const firstNodeOffset =
							this._calcNodeOffsetCoordinates(firstElementNode);
						const lastNodeOffset =
							this._calcNodeOffsetCoordinates(lastElementNode);

						if (dndEvent.y < firstNodeOffset.y) {
							targetElement = firstElement;
						} else if (dndEvent.y > lastNodeOffset.y) {
							targetElement = lastElement;
						}

						parentElement = targetElement?.Parent;
					} else {
						targetElement = rootElemement;
					}
				}

				if (targetElement) {
					const elementId = targetElement.Id();
					const parentId = parentElement && parentElement.Id();
					const elementIndex =
						parentElement && parentElement.ChildItems().index(targetElement);
					const dropNode = this.domapi.getNode(targetElement);
					const nodeOffset = this._calcNodeOffsetCoordinates(dropNode);
					const mouseY = dndEvent.y + this.scrollNode.scrollTop;
					const placeBeforeAnchor = (dropData.placeBeforeAnchor =
						mouseY - nodeOffset.y < dropNode.offsetHeight / 2);
					let anchorElement = targetElement;
					const candidates = {};
					let dropPosition;

					for (const elementName in availablePlacement) {
						const placementInfo = availablePlacement[elementName];
						const parentPlacement = placementInfo[parentId];
						const childPlacement = placementInfo[elementId];

						// can be placed 'before' context element
						if (parentPlacement) {
							if (parentPlacement[elementIndex]) {
								(candidates.before || (candidates.before = [])).push(
									elementName
								);
							}

							if (parentPlacement[elementIndex + 1]) {
								(candidates.after || (candidates.after = [])).push(elementName);
							}
						}

						// can be placed 'into' context element
						if (childPlacement?.length && childPlacement[0]) {
							(candidates.into || (candidates.into = [])).push(elementName);
						}
					}

					if (Object.keys(candidates).length) {
						const isDropNear = candidates.before || candidates.after;

						if (isDropNear) {
							dropData.placementType = 'near';

							if (placeBeforeAnchor && candidates.before) {
								if (elementIndex) {
									anchorElement = targetElement.Parent.ChildItems().get(
										elementIndex - 1
									);
									dropPosition = 'append';
								} else {
									anchorElement = targetElement.Parent;
									dropPosition = 'insert';
								}

								dropData.candidateElementNames = candidates.before;
							} else if (!placeBeforeAnchor && candidates.after) {
								dropPosition = 'append';
								dropData.candidateElementNames = candidates.after;
							}
						} else {
							dropData.placementType = 'insert';
							dropPosition = 'insert';

							dropData.candidateElementNames = candidates.into;
						}
					}

					Object.assign(dropData, {
						originAnchorElement: targetElement,
						anchorElement: anchorElement,
						dropNode: dropNode,
						dropPosition: dropPosition,
						dropAllowed: Boolean(dropPosition),
						candidates: candidates
					});
				}
			}

			this.raiseEvent('onDropDataPrepared', this, dropData);
			return dropData;
		},

		showDropbox: function () {
			this.activateDropControls(true);

			const dropData = this.getDropData();
			const targetElement = dropData.originAnchorElement;
			const dndControls = this.dnd.controls;
			const positionNode = dndControls.positionNode;

			positionNode.classList.remove(
				this.dnd.styling.dropAllowedClass,
				this.dnd.styling.dropDeniedClass
			);

			if (targetElement) {
				const elementNode = this.domapi.getNode(targetElement);
				const nodeOffset = this._calcNodeOffsetCoordinates(elementNode);

				const cssProperties = {
					top: `${nodeOffset.y}px`,
					width: `${elementNode.offsetWidth}px`,
					transform: `translate(${nodeOffset.x}px)`
				};

				positionNode.classList.add(
					dropData.dropAllowed
						? this.dnd.styling.dropAllowedClass
						: this.dnd.styling.dropDeniedClass
				);

				switch (dropData.placementType) {
					case 'near':
						Object.assign(cssProperties, {
							top: `${
								nodeOffset.y +
								(dropData.placeBeforeAnchor ? 0 : elementNode.offsetHeight)
							}px`
						});
						break;
					case 'insert':
						Object.assign(cssProperties, {
							height: `${elementNode.offsetHeight}px`
						});
						break;
				}

				positionNode.style.cssText = Object.keys(cssProperties).reduce(
					(cssText, name) => {
						return cssText + `${name}:${cssProperties[name]};`;
					},
					''
				);
			}
		},

		onActionExecutedHandler: function (actionName, ...execArguments) {
			switch (actionName) {
				case 'appendelement':
					this.focus();
					break;
				case 'arastextactions':
					const targetElement = execArguments[2];
					const elementDomNode = this.domapi.getNode(targetElement);
					const modelCursor = this.viewmodel.Cursor();

					this._focusNode(elementDomNode);

					this.domRange.setCursorTo(
						modelCursor.start,
						modelCursor.startOffset,
						modelCursor.end,
						modelCursor.endOffset
					);
					break;
			}
		},

		_setInitialValue: function () {
			/*
			 * Create deferred execution RenderHtml method to call it in the end,
			 * because after the first editor appearance, method onload calls before
			 * startup and elements not paint in the editor.
			 */
			setTimeout(() => {
				const initResolve = this.getStatePromise('controlInited', 'resolve');

				this.set('value', this.domRenderer.RenderHtml(this.viewmodel.Dom()));
				this.editNode.classList.add('controlInited');

				this.trackContentLoading();
				this.callWhenContentLoaded(this, this.selectionChangeHandler, [
					this.viewmodel,
					this.viewmodel.GetSelectedItems()
				]);

				initResolve();
			});
		},

		setSearchControl: function (searchControl) {
			if (this._searchControl) {
				this._searchControl.removeEventListeners(this);
			}

			this._searchControl = searchControl;
			this._attachSearchEventListeners();
		},

		_onActiveMatchChangedHandler: function (matchIndex, activeMatch) {
			const searchData = this._searchData;
			const currentMatch = searchData.activeMatch;
			let textHighlightning;
			let textSchemaElement;
			let elementDomNode;
			let highlightNodes;
			let i;

			if (currentMatch) {
				textSchemaElement = currentMatch.matchInfo.schemaElement;
				textHighlightning = textSchemaElement.getTextHighlightning();
				elementDomNode = this.domapi.getNode(textSchemaElement);
				highlightNodes = elementDomNode.querySelectorAll('hlr[active]');

				for (i = 0; i < highlightNodes.length; i++) {
					highlightNodes[i].removeAttribute('active');
				}

				textHighlightning.setRangeActiveState(currentMatch.id, false);
			}

			searchData.activeMatch = activeMatch;

			textSchemaElement = activeMatch.matchInfo.schemaElement;
			textHighlightning = textSchemaElement.getTextHighlightning();
			elementDomNode = this.domapi.getNode(textSchemaElement);
			highlightNodes = elementDomNode.querySelectorAll(
				'hlr[rangeId="' + activeMatch.id + '"]'
			);

			for (i = 0; i < highlightNodes.length; i++) {
				highlightNodes[i].setAttribute('active', true);
			}

			textHighlightning.setRangeActiveState(activeMatch.id, true);
			this.scrollToSelection(Array.from(highlightNodes));
			this.viewmodel.SetSelectedItems(textSchemaElement);
		},

		_attachSearchEventListeners: function () {
			const searchControl = this._searchControl;

			if (this._searchControl) {
				searchControl.addEventListener(
					'onBeforeSearch',
					(searchValue, sourceNodes) => {
						this.viewmodel.SuspendInvalidation();
					},
					{ owner: this }
				);

				searchControl.addEventListener(
					'onAfterSearch',
					(searchValue, sourceNodes) => {
						this.viewmodel.ResumeInvalidation();
					},
					{ owner: this }
				);

				searchControl.addEventListener(
					'onSearchComplete',
					(searchValue, sourceNodes, foundMatches) => {
						this._highlightSearchMatches(foundMatches);
					},
					{ owner: this }
				);

				searchControl.addEventListener(
					'onSearchCleared',
					() => {
						this.viewmodel.SuspendInvalidation();
						this._cleanupSearchMatches();
						this.viewmodel.ResumeInvalidation();
					},
					{ owner: this }
				);

				searchControl.addEventListener(
					'onActiveMatchChanged',
					this._onActiveMatchChangedHandler.bind(this),
					{ owner: this }
				);

				searchControl.addEventListener(
					'onAfterReplace',
					(matchIndex, targetMatch, replaceResult) => {
						if (replaceResult) {
							const matchInfo = targetMatch.matchInfo;
							const schemaElement = matchInfo.schemaElement;
							const textHighlightning = schemaElement.getTextHighlightning();
							const positionShift =
								searchControl.getReplaceValue().length -
								searchControl.getSearchValue().length;

							if (positionShift) {
								const allRanges = textHighlightning.getAllRanges();

								for (const currentRange of allRanges) {
									if (currentRange.start > matchInfo.firstIndex) {
										currentRange.start += positionShift;
										currentRange.end += positionShift;
									}
								}
							}

							textHighlightning.removeRange(targetMatch.id.toString());
						}
					},
					{ owner: this }
				);

				searchControl.addEventListener(
					'onBeforeReplaceAll',
					() => {
						this.viewmodel.SuspendInvalidation();
					},
					{ owner: this }
				);

				searchControl.addEventListener(
					'onAfterReplaceAll',
					(replacedMatches) => {
						replacedMatches.forEach((match) => {
							const matchInfo = match.matchInfo;
							const schemaElement = matchInfo.schemaElement;
							const textHighlightning = schemaElement.getTextHighlightning();
							const positionShift =
								searchControl.getReplaceValue().length -
								searchControl.getSearchValue().length;

							if (positionShift) {
								const allRanges = textHighlightning.getAllRanges();

								for (const currentRange of allRanges) {
									if (currentRange.start > matchInfo.firstIndex) {
										currentRange.start += positionShift;
										currentRange.end += positionShift;
									}
								}
							}

							textHighlightning.removeRange(match.id.toString());
						});
						this.viewmodel.ResumeInvalidation();
					},
					{ owner: this }
				);
			}
		},

		_cleanupSearchMatches: function () {
			const searchData = this._searchData;

			if (searchData && searchData.normalizedMatches.length) {
				let textSchemaElement;
				let textHighlightning;
				let i;

				for (i = 0; i < searchData.normalizedMatches.length; i++) {
					textSchemaElement = searchData.normalizedMatches[i].schemaElement;

					textHighlightning = textSchemaElement.getTextHighlightning();
					textHighlightning.cleanupRanges();
				}
			}

			this._searchData = null;
		},

		_highlightSearchMatches: function (foundMatches) {
			if (foundMatches && foundMatches.length) {
				const normalizedMatches = this._normalizeMatches(foundMatches);
				const searchData = {
					matches: foundMatches,
					normalizedMatches: normalizedMatches,
					activeMatch: null
				};
				const searchEngine = this._searchControl.getSearchEngine();
				const immutableReasons = {};

				this._searchData = {
					matches: foundMatches,
					activeMatch: null
				};

				for (const elementMatchesInfo of normalizedMatches) {
					const textSchemaElement = elementMatchesInfo.schemaElement;
					const elementMatches = elementMatchesInfo.matches;
					const textHighlightning = textSchemaElement.getTextHighlightning();

					for (const currentMatch of elementMatches) {
						const matchInfo = currentMatch.matchInfo;
						const reason = matchInfo.immutableReason;
						const reasonText =
							immutableReasons[reason] ||
							(immutableReasons[reason] =
								searchEngine.getMatchImmutableReason(currentMatch));

						textHighlightning.addRange(
							matchInfo.firstIndex,
							matchInfo.lastIndex,
							{
								rangeId: currentMatch.id,
								suppressEvent: true,
								additionalProperties: {
									cssClass:
										matchInfo.isReplaceable === false ? 'immutable' : '',
									title: reasonText
								}
							}
						);
					}

					this.viewmodel.invalidateElement(textSchemaElement);
				}

				this._searchData = searchData;
			}
		},

		_normalizeMatches: function (foundMatches) {
			const uniqueTextElements = [];
			const normalizedMatches = [];

			for (const currentMatch of foundMatches) {
				const matchInfo = currentMatch.matchInfo;
				const elementIndex = uniqueTextElements.indexOf(
					matchInfo.schemaElement
				);

				if (elementIndex == -1) {
					uniqueTextElements.push(matchInfo.schemaElement);
					normalizedMatches.push({
						schemaElement: matchInfo.schemaElement,
						matches: [currentMatch]
					});
				} else {
					normalizedMatches[elementIndex].matches.push(currentMatch);
				}
			}

			return normalizedMatches;
		},

		applySchemaSettings: function () {
			const schemaHelper = this.viewmodel.Schema();
			const editorSettings = schemaHelper.getEditorSettings();
			let fullCssStyleStr = '';

			const classification = this.viewmodel.ItemClassification();
			const classificationSettings =
				editorSettings[classification] || editorSettings.global;

			if (classificationSettings) {
				for (const setting of classificationSettings) {
					if (setting.cssStyle) {
						fullCssStyleStr +=
							(fullCssStyleStr ? '\n\n' : '') +
							'/* ' +
							setting.name +
							' */\n' +
							setting.cssStyle;
					}
				}
			}

			if (fullCssStyleStr) {
				const ownerDocument = this.editNode.ownerDocument;
				const cssTextNode = ownerDocument.createTextNode(fullCssStyleStr);
				let styleNode = this._classificationStyleNode;

				if (styleNode) {
					styleNode.removeChild(styleNode.childNodes[0]);
				} else {
					this._classificationStyleNode = ownerDocument.head.appendChild(
						ownerDocument.createElement('style')
					);
					styleNode = this._classificationStyleNode;
				}

				styleNode.appendChild(cssTextNode);
			}
		},

		_getEventHandlers: function (eventType) {
			return this._editorEventHandlers.filter((handlerDescriptor) => {
				return handlerDescriptor.eventType === eventType;
			});
		},

		setupEventsExecutor: function () {
			const schemaHelper = this.viewmodel.Schema();
			const executorConstructor = this._modules.ControlEventsExecutor;
			const eventsExecutor = (this.cuiEventsExecutor = new executorConstructor({
				control: this,
				viewmodel: this.viewmodel
			}));
			const editorEventHandlers =
				schemaHelper.getControlEventsConfiguration('TDFEditor');

			editorEventHandlers.forEach((eventHandler) => {
				switch (eventHandler.eventType) {
					case 'TDFEventsExecutionContext':
						eventsExecutor.extendExecutionContext(
							eventHandler.handler(),
							eventHandler.apiversion
						);
						break;
					default:
						eventsExecutor.registerEventHandler(eventHandler);
						break;
				}
			});
		},

		_onMenuItemClick: function (cmdId, itemId) {
			this.actionsHelper.hideContextMenu(this._contextMenu);

			if (cmdId == 'add_parent_sibling') {
				const modelCursor = this.viewmodel.Cursor();
				const targetElement = this.viewmodel.GetElementById(itemId);
				const parentElement = targetElement.Parent;

				this.viewmodel.SetSelectedItems(parentElement);
				modelCursor.Set(parentElement, 0, parentElement, 0);

				setTimeout(
					function () {
						this.showSiblingCreateMenu(parentElement);
					}.bind(this),
					0
				);
			} else {
				this.actionsHelper.onMenuItemClick(cmdId, itemId);

				if (cmdId.split(':')[0] === 'pasteelement') {
					const selectedNode = this.domapi.getNodeById(itemId);
					selectedNode.focus();
				}
			}
		},

		_copyToClipboard: function () {
			this.domRange.refresh();
			// copy paste formatted text
			const content = this.domRange.cloneContents();

			if (content) {
				this._clipboard.setData(content.type, content.data);
			}
		},

		_onDOMRangeRefresh: function (sender, earg) {
			const cursor = this.viewmodel.Cursor();

			cursor.Reinitialize(sender);
		},

		/**
		 * @param {Integer} value
		 */
		setExplicitContentHeight: function (value) {
			const contentHeight = parseInt(value);

			if (!isNaN(contentHeight) && contentHeight > 0) {
				this.contentNode.style.height = contentHeight + 'px';
				this._isExplicitHeight = true;
			}
		},

		dropExplicitContentHeight: function () {
			if (this._isExplicitHeight && this._isContentLoaded) {
				this.contentNode.style.height = 'auto';
				this._isExplicitHeight = false;
			}
		},

		_onTextElementChange: function (mutationData) {
			let dataIndex = 0;
			let targetElement;

			do {
				targetElement = this.domapi.getObject(mutationData[dataIndex].target);
				dataIndex++;
			} while (!targetElement && dataIndex < mutationData.length);

			targetElement._domSynchronized = false;

			this.tryApplyTextStyleOnMutation(targetElement, mutationData);

			if (this._searchControl && this._searchControl.isSearchActive()) {
				const modelCursor = this.viewmodel.Cursor();

				this.domRange.refresh();

				this.viewmodel.SuspendInvalidation();
				this.syncModelWithHTML(targetElement);

				const cursorData = {
					start: modelCursor.start,
					startOffset: modelCursor.startOffset,
					end: modelCursor.end,
					endOffset: modelCursor.endOffset
				};

				this._searchControl.cleanupResults();
				this.viewmodel.ResumeInvalidation();

				// restore cursor position
				this.domRange.setCursorTo(
					cursorData.start,
					cursorData.startOffset,
					cursorData.end,
					cursorData.endOffset
				);
			}
		},

		tryApplyTextStyleOnMutation: function (targetElement, mutationData) {
			if (
				!targetElement ||
				!targetElement.is('ArasTextXmlSchemaElement') ||
				!mutationData
			) {
				return;
			}

			const textStyle = targetElement.getFreezyStyle();
			const charactedMutationRecord = mutationData.find(function (record) {
				return record.type === 'characterData';
			});

			if (textStyle && charactedMutationRecord) {
				const mutationTarget = charactedMutationRecord.target;
				const currentValue = mutationTarget.data;
				const oldValue = charactedMutationRecord.oldValue;

				// user typed one symbol
				if (oldValue.length + 1 === currentValue.length) {
					const modelCursor = this.viewmodel.Cursor();
					const cursorData = { ...modelCursor };
					const selectionFrom = targetElement.selection.From();
					let currentEmphText;
					let currentEmph;
					let newEmph;

					this.viewmodel.SuspendInvalidation();

					this.syncModelWithHTML(targetElement);

					if (selectionFrom) {
						currentEmph = targetElement.GetEmphObjectById(selectionFrom.id);
						currentEmphText = currentEmph.Text();
						newEmph = currentEmph.Break(selectionFrom.offset);

						if (currentEmphText.length - selectionFrom.offset > 1) {
							newEmph.Break(1);
						}
					} else {
						const emphsCount = targetElement.getEmphsCount();
						newEmph = targetElement.getEmphObjectByIndex(emphsCount - 1);
					}

					for (const styleName in textStyle) {
						newEmph.Style(styleName, textStyle[styleName]);
					}

					targetElement.InvalidRange();
					this.viewmodel.ResumeInvalidation();

					this.domRange.setCursorTo(
						cursorData.start,
						cursorData.startOffset + 1,
						cursorData.end,
						cursorData.endOffset + 1
					);

					return true;
				}
			}
		},

		getContentDocuments(currentDocuments, resultList = []) {
			currentDocuments = currentDocuments
				? Array.isArray(currentDocuments)
					? currentDocuments
					: [currentDocuments]
				: [];

			currentDocuments.forEach((targetDocument) => {
				if (resultList.includes(targetDocument)) {
					return;
				}

				const frameNodes = Array.from(
					targetDocument?.body?.querySelectorAll('iframe') || []
				);
				const frameDocuments = frameNodes.reduce((documents, node) => {
					const contentDocument = node.contentDocument;

					if (contentDocument && !documents.includes(contentDocument)) {
						documents.push(contentDocument);
					}

					return documents;
				}, []);

				resultList.push(targetDocument);

				this.getContentDocuments(frameDocuments, resultList);
			});

			return resultList;
		},

		_attachContentObservers: function () {
			const frameDocument = this.iframe.contentDocument;
			const textElementNodes = frameDocument.querySelectorAll(
				'.ArasTextXmlSchemaElement, .XmlSchemaText'
			);
			const observer = this._textChangesObserver;

			for (const currentNode of textElementNodes) {
				observer.observe(currentNode, this._textObserverConfig);
			}
		},

		trackContentLoading: function () {
			const imageNodes = this.editNode.querySelectorAll('img');
			const incompleteImages = [];

			for (const imageNode of imageNodes) {
				if (!imageNode.complete) {
					incompleteImages.push(imageNode);
				}
			}

			this._isContentLoaded = incompleteImages.length === 0;
			let waitingLoadCounter = incompleteImages.length;

			if (!this._isContentLoaded) {
				const iterationNumber = this._invalidateIteration;
				const imageLoadHandler = (e) => {
					if (this._invalidateIteration === iterationNumber) {
						waitingLoadCounter--;

						if (!waitingLoadCounter) {
							this.onContentLoaded();
							this._isContentLoaded = true;
						}

						const imageNode = e.target;
						imageNode.removeEventListener('load', imageLoadHandler);
					}
				};

				for (const image of incompleteImages) {
					image.addEventListener('load', imageLoadHandler);
				}
			}
		},

		/**
		 * @param {StructuredDocument} sender
		 * @param {Object} eventArguments
		 */
		_onViewModelInvalidate: function (sender, eventArguments) {
			const originContentHeight = this.contentNode.scrollHeight;
			const originScrollTop = this.scrollNode.scrollTop;
			const invalidationList = eventArguments.invalidationList || [];
			const modelCursor = eventArguments.cursor;

			for (const invalidObject of invalidationList) {
				this.domRenderer.invalidate(invalidObject);
			}

			this._savedScrollPosition = originScrollTop;
			this.setExplicitContentHeight(originContentHeight);
			this._textChangesObserver.disconnect();

			this.domRenderer.refresh();

			this._attachContentObservers();
			this.highlightItems(this._currentSelection, true);

			this._invalidateIteration += 1;

			this.trackContentLoading();
			this.callWhenContentLoaded(this, this.dropExplicitContentHeight);

			if (modelCursor.IsModified()) {
				this.domRange.setCursorTo(
					modelCursor.start,
					modelCursor.startOffset,
					modelCursor.end,
					modelCursor.endOffset
				);

				// during setCursorTo call content can be scrolled
				if (this.scrollNode.scrollTop !== originScrollTop) {
					this.scrollNode.scrollTop = originScrollTop;
				}
			}

			// Spellcheck: if turned on, then editNode should be focused for some time to start
			// spellchecking
			if (
				this.data.spellcheck &&
				invalidationList.length &&
				!modelCursor.IsModified()
			) {
				const frameWindow = this.iframe.contentWindow;

				if (!frameWindow.document.hasFocus()) {
					this.bodyNode.focus();

					setTimeout(() => {
						this.bodyNode.blur();
					});
				}
			}
		},

		enableSpellcheck: function (doEnabled) {
			this.data.spellcheck = doEnabled;

			this.bodyNode.spellcheck = doEnabled;
			this.bodyNode.focus();
			this.bodyNode.blur();
		},

		_onClassificationChanged: function () {
			this.applySchemaSettings();
		},

		_onAdditionalSettingChanged: function (settingName, settingValue) {
			if (settingName === 'isSpellcheckActive') {
				const { spellcheck } = this.data;
				if (spellcheck) {
					// to trigger check again in chrome we need to turn it off if it was active
					this.enableSpellcheck(false);
				}

				if (settingValue) {
					this.enableSpellcheck(settingValue);
				}
			}
		},

		/**
		 * @param {StructuredDocument} sender
		 * @param {ArrayOfWrappedObjects} selectedItems
		 */
		selectionChangeHandler: function (sender, selectedItems) {
			// turn off previous selection highlightning
			this.highlightItems(this._currentSelection, false);
			this._currentSelection = selectedItems.slice();

			// turn on current selection highlightning
			if (selectedItems.length) {
				this.highlightItems(selectedItems, true);

				this.callWhenContentLoaded(this, this.scrollToSelection, [
					this._currentSelection,
					this.viewmodel._isInvalidating
				]);

				if (selectedItems.length === 1) {
					const selectedElement = selectedItems[0];

					if (!this._tryAttachShadowInput(selectedElement)) {
						const viewCursor = this.viewmodel.Cursor();
						const { commonAncestor } = viewCursor;

						if (
							commonAncestor !== selectedElement &&
							!(
								commonAncestor?.Parent === selectedElement &&
								commonAncestor.is('XmlSchemaText')
							)
						) {
							this.placeCursorOnElement(selectedElement, 'end');
						}
					}
				}
			}
		},

		_focusNode: function (targetNode) {
			if (targetNode && targetNode.focus) {
				targetNode.focus();
				if (this._environment.isFirefox) {
					targetNode.focus();
				}
			}
		},

		_initShadowInput: function () {
			const contentDocument =
				this.contentNode && this.contentNode.ownerDocument;

			if (contentDocument) {
				const containerNode = contentDocument.createElement('div');
				containerNode.innerHTML = '<input class="shadowInput"/>';

				const shadowInputNode = containerNode.firstChild;
				this.contentNode.appendChild(shadowInputNode);

				shadowInputNode.addEventListener(
					'compositionstart',
					function () {
						this.insertSymbolAtCursor('');
					}.bind(this)
				);

				this._shadowInput = shadowInputNode;
			}
		},

		_tryAttachShadowInput: function (targetElement) {
			if (targetElement) {
				const elementNode = this.domapi.getNode(targetElement);
				const schemaHelper = this.viewmodel.Schema();

				// If element doesn't support direct text input then all input will be caught with shadow input element
				if (
					elementNode &&
					this.viewmodel.IsEditable() &&
					!this._isEditableNode(elementNode) &&
					!schemaHelper.IsContentMixed(targetElement)
				) {
					this._shadowInput.value = '';
					this._shadowInput.activated = true;
					this._shadowInput.sourceSchemaElement = targetElement;

					elementNode.appendChild(this._shadowInput);
					this._focusNode(this._shadowInput);

					return true;
				}
			}

			this._detachShadowInput();
		},

		_detachShadowInput: function (targetElement) {
			const shadowInput = this._shadowInput;

			if (shadowInput.activated) {
				shadowInput.activated = false;
				shadowInput.sourceSchemaElement = null;

				shadowInput.parentNode.removeChild(shadowInput);
			}
		},

		_isEditableNode: function (targetNode) {
			if (targetNode && targetNode !== this.contentNode) {
				if (
					targetNode.nodeName.toUpperCase() === 'INPUT' ||
					(targetNode.getAttribute &&
						targetNode.getAttribute('contenteditable') == 'true')
				) {
					return true;
				}

				return this._isEditableNode(targetNode.parentNode);
			}

			return false;
		},

		/**
		 * @param {ArrayOfWrappedObjects} itemsList
		 * @param {Boolean} highlight
		 */
		highlightItems: function (itemsList, highlight) {
			if (itemsList.length) {
				for (const targetItem of itemsList) {
					const referencedItems = this.viewmodel.GetElementsByOrigin(
						targetItem.origin
					);

					for (const refItem of referencedItems) {
						const referencedItem =
							this.viewmodel.GetAncestorOrSelfElement(refItem);

						const elementNode = this.domapi.getNode(referencedItem);
						elementNode?.classList.toggle('TechDocElementSelection', highlight);

						elementNode?.classList.toggle('element-selected', highlight);
					}
				}
			}
		},

		callWhenContentLoaded: function (contextItem, method, methodArguments) {
			if (method) {
				contextItem = contextItem || this;

				if (this._isContentLoaded) {
					method.apply(contextItem, methodArguments);
				} else {
					let isCallExists = false;
					let callInfo;
					let i;

					for (i = 0; i < this._defferedMethodCalls.length; i++) {
						callInfo = this._defferedMethodCalls[i];

						if (
							callInfo.context === contextItem &&
							callInfo.method === method
						) {
							callInfo.arguments = methodArguments;
							isCallExists = true;
							break;
						}
					}

					if (!isCallExists) {
						this._defferedMethodCalls.push({
							context: contextItem,
							method: method,
							arguments: methodArguments
						});
					}
				}
			}
		},

		onContentLoaded: function () {
			const defferedCalls = this._defferedMethodCalls;

			for (const callInfo of defferedCalls) {
				callInfo.method.apply(callInfo.context, callInfo.arguments);
			}
			defferedCalls.length = 0;

			this.raiseEvent('onContentLoaded', this);
		},

		/**
		 * @param {ArrayOfWrappedObjects} selectedItems
		 * @param {Boolean} useSavedPosition
		 */
		scrollToSelection: function (elements, useSavedPosition) {
			elements = Array.isArray(elements) ? elements : [elements];

			if (elements.length) {
				const frameDocument = this.iframe.contentDocument;
				const scrollNode = this.scrollNode;
				const editorScrollTop = useSavedPosition
					? this._savedScrollPosition
					: scrollNode.scrollTop;
				const offsetTopsOfElements = [];
				const elementsHash = {};
				const elementScrollMargin = 15;

				for (const selectedItem of elements) {
					const elementNode = this.viewmodel.isDocumentElement(selectedItem)
						? frameDocument.getElementById(selectedItem.Id())
						: selectedItem;

					if (elementNode) {
						let currentNode = elementNode;
						let topValue = 0;

						while (currentNode) {
							topValue += currentNode.offsetTop;
							currentNode = currentNode.offsetParent;
						}

						topValue =
							topValue - elementScrollMargin > 0
								? topValue - elementScrollMargin
								: 0;

						offsetTopsOfElements.push(topValue);
						elementsHash[topValue] =
							elementNode.offsetHeight + elementScrollMargin * 2;
					}
				}

				// check that we need to scroll editor content
				const minOffsetTop = Math.min.apply(null, offsetTopsOfElements);
				elementHeight = elementsHash[minOffsetTop];

				const frameScrollBottom = editorScrollTop + scrollNode.offsetHeight;
				const elementOffsetBottom = minOffsetTop + elementHeight;

				const isAbove = minOffsetTop <= editorScrollTop;
				const isUnder = elementOffsetBottom >= frameScrollBottom;
				const isHigher = elementHeight >= scrollNode.offsetHeight;
				const isVisible =
					(minOffsetTop > editorScrollTop &&
						minOffsetTop < frameScrollBottom) ||
					(elementOffsetBottom > editorScrollTop &&
						elementOffsetBottom < frameScrollBottom);

				if (!(isAbove && isUnder)) {
					if (isAbove && (!isVisible || !isHigher)) {
						scrollNode.scrollTop = minOffsetTop;
					} else if (isUnder && (!isVisible || !isHigher)) {
						scrollNode.scrollTop =
							elementOffsetBottom - scrollNode.offsetHeight;
					}
				}
			}
		},

		_stopEvent: function (targetEvent) {
			targetEvent.preventDefault();
			targetEvent.stopPropagation();
		},

		_calcContextMenuCoordinates: function (selectedItems, e, elementId) {
			const resultCoordinates = this._calcNodeOffsetCoordinates(this.domNode);

			if (this._contextMenuKey === 93) {
				const targetNode = this.domapi.getNodeById(elementId);
				const nodeOffset = this._calcNodeOffsetCoordinates(targetNode);

				resultCoordinates.x += nodeOffset.x + 10;
				resultCoordinates.y +=
					nodeOffset.y + targetNode.offsetHeight - this.scrollNode.scrollTop;
			} else {
				resultCoordinates.x += e.pageX;
				resultCoordinates.y += e.pageY;
			}

			return resultCoordinates;
		},

		_onMenuCloseHandler: function (elementId) {
			const element = this.viewmodel.GetElementById(elementId);

			if (element) {
				const cursor = this.viewmodel.Cursor();

				if (cursor.commonAncestor === element) {
					this.domRange.setCursorTo(
						element,
						cursor.startOffset,
						element,
						cursor.endOffset
					);
				} else {
					const elementNode = this.domapi.getNodeById(elementId);

					elementNode?.focus();
				}
			} else {
				this.iframe.contentWindow.focus();
			}
		},

		showContextMenu: function (parameters = {}) {
			this.actionsHelper.showContextMenu(
				this._contextMenu,
				this,
				parameters.menuItems,
				parameters.elementId,
				{
					x: 0,
					y: 0,
					onClose: this._onMenuCloseHandler.bind(this, parameters.elementId),
					...parameters.popupSettings
				}
			);
		},

		onContextMenuShow: function (e) {
			let selectedItems = this.viewmodel.GetSelectedItems();
			let targetObject = selectedItems.length && selectedItems[0];

			if (!targetObject) {
				// If no one element was selected, then try to calculate appropriate target element for context menu
				const rootSchemaElement = this.viewmodel.Dom();
				const firstLevelElements = rootSchemaElement.ChildItems();

				if (!firstLevelElements.length()) {
					// If document is empty
					targetObject = rootSchemaElement;
					selectedItems = [targetObject];

					this.viewmodel.SetSelectedItems(selectedItems);
				}
			}
			targetObject =
				targetObject && this.viewmodel.GetAncestorOrSelfElement(targetObject);

			if (targetObject) {
				const menuItems = this.actionsHelper.GetActionsMenuModel(selectedItems);
				const elementId = targetObject.Id();

				this.scrollToSelection([targetObject]);
				const coordinates = this._calcContextMenuCoordinates(
					selectedItems,
					e,
					elementId
				);

				this.showContextMenu({
					menuItems,
					elementId,
					popupSettings: {
						x: coordinates.x,
						y: coordinates.y
					}
				});
			}

			this._contextMenuKey = 0;
			this._stopEvent(e);
		},

		/**
		 * @param {DomNode} targetNode
		 */
		getSpecialActionByTargetNode: function (targetNode) {
			if (targetNode && targetNode.nodeType === 1) {
				if (targetNode.className.indexOf('ExpandoButton') > -1) {
					return 'expandNode';
				} else if (targetNode.className.indexOf('ConditionButton') > -1) {
					return 'showCondition';
				} else if (targetNode.className.indexOf('ElementPlaceholder') > -1) {
					const targetElement = this.domapi.getObject(targetNode);

					if (targetElement.is('ArasImageXmlSchemaElement')) {
						return 'selectImage';
					} else if (targetElement.is('ArasItemXmlSchemaElement')) {
						return 'selectItem';
					}
				} else if (targetNode.nodeName === 'HLR') {
					return 'activateMatch';
				}
			}
		},

		processNodeAction: function (targetNode, targetElement) {
			const specialAction = this.getSpecialActionByTargetNode(targetNode);

			if (specialAction && targetElement) {
				const actionResult = {};

				switch (specialAction) {
					case 'activateMatch':
						const rangeId = targetNode.getAttribute('rangeId');
						const matchIndex = this._searchControl.getMatchIndex(rangeId);

						this._searchControl.setActiveMatch(matchIndex);
						break;
					case 'expandNode':
						targetElement.collapseInactiveContent(
							!targetElement.isContentCollapsed()
						);
						actionResult.changeSelection = false;
						break;
					case 'showCondition':
						this.actionsHelper.executeAction('changecondition', {
							selectedElement: targetElement
						});
						actionResult.changeSelection = false;
						break;
					case 'selectImage':
						if (
							this.viewmodel.IsEditable() &&
							!this.viewmodel
								.ExternalBlockHelper()
								.isExternalBlockContains(targetElement)
						) {
							this.actionsHelper
								.getAction('appendelement')
								._SearchImage(function (result) {
									targetElement.Image(result.image);
								});
						}

						break;
					case 'selectItem':
						if (
							this.viewmodel.IsEditable() &&
							!this.viewmodel
								.ExternalBlockHelper()
								.isExternalBlockContains(targetElement)
						) {
							const schemaHelper = this.viewmodel.Schema();
							const typeIdAttribute = schemaHelper.getSchemaAttribute(
								targetElement,
								'typeId'
							);

							const itemReferenceRelatedTypeId =
								this.viewmodel.getItemTypeSetting(
									'datamodel.relationships.itemReferenceRelatedTypeId'
								);

							const typeId = typeIdAttribute
								? typeIdAttribute.Fixed
								: itemReferenceRelatedTypeId;

							this.actionsHelper.getAction('appendelement')._SearchItem(
								typeId,
								function (result) {
									let resultItem = result.item;

									// we have to get original item type because polymorphic Item doesn't have all required properties in order to perform custom rendering if it exists
									if (typeId == itemReferenceRelatedTypeId) {
										const itemQuery = this.aras.newIOMItem();
										const itemId = this.aras.getItemProperty(resultItem, 'id');

										itemQuery.setAttribute(
											'typeId',
											itemReferenceRelatedTypeId
										);
										itemQuery.setID(itemId);
										itemQuery.setAction('get');
										resultItem = itemQuery.apply().node;
									}

									targetElement.Item(resultItem);
								}.bind(this)
							);
						}

						break;
				}

				return actionResult;
			}
		},

		_normalizeFocus: function () {
			const sourceRange = this.domRange.sourceRange;

			if (sourceRange) {
				const { startContainer, endContainer } = this.domRange.sourceRange;
				const { activeElement } = this.editNode.ownerDocument;

				if (
					startContainer === endContainer &&
					activeElement !== startContainer
				) {
					const focusElement = this.domapi.getObject(activeElement);
					const caretElement = this.domapi.getObject(startContainer);

					if (
						focusElement &&
						focusElement !== caretElement &&
						caretElement.is('ArasTextElement')
					) {
						this.placeCursorOnElement(focusElement, 'end');
					}
				}
			}
		},

		onClick: function (e) {
			const targetNode = e.target;
			let targetElement = this.domapi.getObject(targetNode);
			const shadowInput = this._shadowInput;

			if (
				targetNode.nodeType === Node.DOCUMENT_NODE ||
				this.cuiEventsExecutor.handleEvent('Click', e, {
					element: targetElement
				})
			) {
				return;
			}

			let changeSelection = true;

			// eslint-disable-next-line prefer-rest-params
			this.inherited(arguments);
			this.viewmodel.SuspendInvalidation();

			if (!targetElement) {
				// If no one element was selected, then try to calculate appropriate target element
				const rootSchemaElement = this.viewmodel.Dom();
				const firstLevelElements = rootSchemaElement.ChildItems().List();

				// if current document is empty, then root element will be selected
				targetElement = !firstLevelElements.length && rootSchemaElement;
			}

			this.domRange.refresh();

			if (e.button === 0 || e.button === 2) {
				let processingResult;

				if (e.button === 0) {
					processingResult = this.processNodeAction(targetNode, targetElement);
				}

				if (processingResult) {
					changeSelection = processingResult.changeSelection ?? changeSelection;
					this._stopEvent(e);
				} else if (targetElement) {
					this._normalizeFocus();
				}
			}

			if (changeSelection) {
				this.viewmodel.SetSelectedItems(targetElement);
			}

			this.viewmodel.ResumeInvalidation();

			if (
				shadowInput.activated &&
				shadowInput.sourceSchemaElement === targetElement
			) {
				shadowInput.focus();
			}
		},

		validateItemPropertyValue: function (targetElement, newValue) {
			const propertyDescriptor = {
				data_type: targetElement.getPropertyInfo('data_type'),
				pattern: targetElement.getPropertyInfo('pattern'),
				is_required: targetElement.getPropertyInfo('is_required') === '1',
				stored_length: parseInt(targetElement.getPropertyInfo('stored_length'))
			};
			const validationResult = {
				isValid: true,
				errorMessage: ''
			};

			if (newValue) {
				validationResult.isValid = this.aras.isPropertyValueValid(
					propertyDescriptor,
					newValue
				);
				validationResult.errorMessage = this.aras.ValidationMsg;
			} else if (propertyDescriptor.is_required) {
				validationResult.isValid = propertyDescriptor.data_type === 'boolean';

				if (!validationResult.isValid) {
					validationResult.errorMessage = this.aras.getResource(
						'',
						'item_methods_ex.field_required_provide_value',
						targetElement.getPropertyInfo('label')
					);
				}
			}

			return validationResult;
		},

		showItemPropertyEditor: function (targetElement) {
			if (targetElement) {
				const readonlyReason = targetElement.getReadonlyReason();

				if (!readonlyReason) {
					const elementNode = this.domapi.getNode(targetElement);
					const editorOffset = this._calcNodeOffsetCoordinates(this.domNode);
					const nodeOffset = this._calcNodeOffsetCoordinates(elementNode);
					const propertyDataType = targetElement.getPropertyInfo('data_type');
					const propertyPattern = targetElement.getPropertyInfo('pattern');
					const value = targetElement.getPropertyDisplayValue();
					const neutralValue = targetElement.getPropertyValue();
					const dataSource = targetElement.getPropertyInfo('data_source');
					const sourceElement = targetElement.getSourceItem();
					const editorSettings = {
						titleLabel:
							targetElement.getPropertyInfo('label') ||
							targetElement.getPropertyName(),
						type: propertyDataType,
						dataSource: dataSource,
						pattern: propertyPattern,
						spellcheck: this.data.spellcheck,
						value,
						neutralValue,
						itemNode: sourceElement.referencedItem,
						valueValidator: function (propertyEditor, newValue) {
							return this.validateItemPropertyValue(targetElement, newValue);
						}.bind(this)
					};

					editorSettings.x = nodeOffset.x + editorOffset.x;
					editorSettings.y =
						nodeOffset.y +
						editorOffset.y +
						elementNode.offsetHeight -
						this.scrollNode.scrollTop;
					editorSettings.anchorNode = elementNode;

					return this._itemPropertyEditor.show(editorSettings).then(
						function (selectedValue) {
							if (selectedValue !== undefined) {
								const neutralValue = this.aras.convertToNeutral(
									selectedValue,
									propertyDataType,
									propertyPattern
								);

								targetElement.setPropertyValue(neutralValue);
							}
						}.bind(this)
					);
				}

				this.aras.AlertError(readonlyReason);
			}

			return Promise.resolve();
		},

		onDblClick: function (clickEvent) {
			const targetNode = clickEvent.target;
			const targetElement = this.domapi.getObject(targetNode);

			if (
				this.cuiEventsExecutor.handleEvent('Doubleclick', clickEvent, {
					element: targetElement
				})
			) {
				return;
			}

			// eslint-disable-next-line prefer-rest-params
			this.inherited(arguments);

			if (clickEvent.button === 0) {
				if (
					targetElement &&
					targetElement.is('ArasItemPropertyXmlSchemaElement') &&
					this.viewmodel.IsEditable()
				) {
					this.showItemPropertyEditor(targetElement);
					this._stopEvent(clickEvent);
				}
			}
		},

		onKeyDown: function (e) {
			const targetNode = e.target;
			const targetElement = this.domapi.getObject(targetNode);
			if (
				this.cuiEventsExecutor.handleEvent('Keydown', e, {
					element: targetElement
				})
			) {
				return;
			}

			const keyCode = (this._contextMenuKey = e.which || e.keyCode);

			// [FF.24 specific] _passedKeyDownCheck was introduced in order to fix problem in FF.24, where e.prevenetDefault()
			// in "keydown" event doesn't stop "keypress" event occurance
			// this workaround can be removed, when minimal supported version will be changed
			this._passedKeyDownCheck = true;

			switch (keyCode) {
				case keys.RIGHT_ARROW:
				case keys.LEFT_ARROW:
				case keys.DOWN_ARROW:
				case keys.UP_ARROW:
					setTimeout(() => {
						if (!e.pluginHandled) {
							this.handleArrowKey(keyCode);
						}
					}, 10);

					return false;
				case keys.TAB:
					this.handleTabKey(e);
					this._stopEvent(e);

					return false;
				case keys.ENTER:
					this.handleEnterKey(e);

					return false;
				case 65:
					if (this.viewmodel.IsEditable() && e.ctrlKey) {
						this._stopEvent(e);

						const target = e.target;
						const selection = this.window.getSelection();
						const range = this.document.createRange();

						range.selectNodeContents(target);
						selection.removeAllRanges();
						selection.addRange(range);
					}
					break;
				default:
					if (
						!this.viewmodel.IsEditable() &&
						!(keyCode == 67 && e.ctrlKey && !e.altKey)
					) {
						// only copy operation allowed
						e.preventDefault();
						this._passedKeyDownCheck = false;
						return false;
					}

					if (this.handleShortcuts(e)) {
						this._stopEvent(e);
						this._passedKeyDownCheck = false;
					}

					if (this._allowedKeydownKeys[keyCode]) {
						this.handleAllowedKey(e);
					}
					break;
			}
		},

		onPaste: function (e) {
			if (this._shadowInput.activated) {
				setTimeout(this._applyShadowInputContent.bind(this));
			}

			// If files are being pasted during event, then try to create appropriate elements using those data
			const clipboardData = e.clipboardData || window.clipboardData;
			const dataItems =
				clipboardData && (clipboardData.items || clipboardData.files);
			const selectedItems = this.viewmodel.GetSelectedItems();
			const isSingleSelection = selectedItems.length === 1;

			if (dataItems && isSingleSelection && this.viewmodel.IsEditable()) {
				for (const clipboardItem of dataItems) {
					// If there is an image file in clipboard, then try to create image element
					if (clipboardItem.type.startsWith('image')) {
						const contextSchemaElement = selectedItems[0];
						const schemaHelper = this.viewmodel.Schema();
						const expectedImageElements = schemaHelper.GetExpectedElements(
							contextSchemaElement,
							Enums.XmlSchemaElementType.Image
						);
						const isInsertAllowed =
							this.viewmodel.isInsertAllowed(contextSchemaElement);
						const isAppendAllowed =
							this.viewmodel.isAppendAllowed(contextSchemaElement);
						const addDirection =
							(isInsertAllowed &&
								expectedImageElements.insert.length &&
								'insert') ||
							(isAppendAllowed &&
								expectedImageElements.append.length &&
								'append');
						const imageElementName =
							addDirection && expectedImageElements[addDirection][0];

						if (imageElementName) {
							this.syncBeforeAction(e);

							this.actionsHelper.executeAction('appendnewitem', {
								context: selectedItems[0],
								elementName: imageElementName,
								direction: addDirection,
								initializerType: 'coreBrowserFileImage',
								initializerParameters: {
									// if clipboardItem is an instance of DataTransferItem, then it should be converted into file with getAsFile method
									sourceFile: clipboardItem.getAsFile
										? clipboardItem.getAsFile()
										: clipboardItem
								}
							});
						} else {
							const restrictionWarning = this.aras.getResource(
								'../Modules/aras.innovator.TDF',
								'action.schemarestriction.imagenotfit'
							);
							this.aras.AlertWarning(restrictionWarning);
						}

						this._stopEvent(e);
						return;
					}
				}
			}
		},

		onKeyPress: function (e) {
			// do nothing
		},

		onKeyUp: function (e) {
			// do nothing
		},

		/**
		 * get correct current item
		 *
		 * @param {cursor} cursorItem - viewCursor.commonAncestor
		 * @param {item} selectItem - viewmodel.GetSelectedItems()(last)
		 */
		getNormalizedItem: function (cursorItem, selectItem) {
			return cursorItem && cursorItem.Parent === selectItem
				? cursorItem
				: selectItem;
		},

		handleAllowedKey: function (e) {
			const isCtrlPressed = e.ctrlKey || e.metaKey;

			// if shadow input is active, then try to apply it's content to appropriate text element
			if (!isCtrlPressed && this._shadowInput.activated) {
				// setTimeout is required to not break keyboard event sequence with dom, selection and focus changes
				setTimeout(
					function () {
						this._applyShadowInputContent();
					}.bind(this),
					0
				);
			}
		},

		/**
		 * @param {Integer} keyCode
		 */
		handleArrowKey: function (keyCode) {
			const viewCursor = this.viewmodel.Cursor();
			const oldCursorState = viewCursor.CreateMemento().GetState();

			this.domRange.refresh();

			const newCursorState = viewCursor.CreateMemento().GetState();

			if (
				newCursorState.startOffset == newCursorState.endOffset &&
				oldCursorState.startOffset == newCursorState.startOffset &&
				oldCursorState.endOffset == newCursorState.endOffset
			) {
				let moveDirection;

				switch (keyCode) {
					case keys.UP_ARROW:
						moveDirection = Enums.Directions.Up;
						break;
					case keys.RIGHT_ARROW:
						moveDirection = Enums.Directions.Right;
						break;
					case keys.DOWN_ARROW:
						moveDirection = Enums.Directions.Down;
						break;
					case keys.LEFT_ARROW:
						moveDirection = Enums.Directions.Left;
						break;
				}

				this.shiftSelectedElement(
					moveDirection,
					moveDirection == Enums.Directions.Right ||
						moveDirection == Enums.Directions.Down
				);
			}
		},

		/**
		 * @param {String} newSymbol
		 */
		insertSymbolAtCursor: function (newSymbol) {
			const viewCursor = this.viewmodel.Cursor();
			const schemaHelper = this.viewmodel.Schema();
			const selectedItems = this.viewmodel.GetSelectedItems();
			let selectedItem = selectedItems.length
				? selectedItems[selectedItems.length - 1]
				: viewCursor.commonAncestor;
			let insertResult = { placement: 'direct', element: selectedItem };

			if (selectedItem !== viewCursor.commonAncestor) {
				selectedItem = this.getNormalizedItem(
					viewCursor.commonAncestor,
					selectedItem
				);
				insertResult.element = selectedItem;
			}

			this.domRange.refresh();
			this.viewmodel.SuspendInvalidation();

			if (selectedItem && selectedItem.is('ArasTextXmlSchemaElement')) {
				selectedItem.InsertText(newSymbol);
			} else if (selectedItem) {
				if (!viewCursor.collapsed) {
					viewCursor.DeleteContents();
				}

				if (viewCursor.collapsed) {
					if (selectedItem) {
						if (selectedItem.is('XmlSchemaText')) {
							const insertPosition = viewCursor.startOffset;
							const stringBeforeEditing = selectedItem.Text();
							const stringAfterEditing = [
								stringBeforeEditing.slice(0, insertPosition),
								newSymbol,
								stringBeforeEditing.slice(insertPosition)
							].join('');

							selectedItem.Text(stringAfterEditing);
							viewCursor.Set(
								selectedItem,
								insertPosition + 1,
								selectedItem,
								insertPosition + 1
							);
						} else {
							const childItems = selectedItem.ChildItems();
							let isPlacedIntoChild = false;
							let targetTextElement;

							// if selected element have childs and first child is textElement, then append newSymbol to this element
							if (childItems.length()) {
								const firstChild = childItems.get(0);

								if (
									firstChild.is('ArasTextXmlSchemaElement') ||
									schemaHelper.IsContentMixed(firstChild)
								) {
									targetTextElement = firstChild;
									insertResult = {
										placement: 'existingChild',
										element: firstChild
									};
									isPlacedIntoChild = true;
								}
							}

							if (!isPlacedIntoChild) {
								const expectedTextChilds = schemaHelper.GetExpectedElements(
									selectedItem,
									Enums.XmlSchemaElementType.Text |
										Enums.XmlSchemaElementType.Mixed
								).insert;

								if (expectedTextChilds.length) {
									if (expectedTextChilds.length == 1) {
										// if only one type of text element is expected, then imediately create it
										targetTextElement = this.viewmodel.CreateElement(
											'element',
											{ type: expectedTextChilds[0] }
										);
										childItems.insertAt(0, targetTextElement);
										insertResult = {
											placement: 'newChild',
											element: targetTextElement
										};
									} else {
										// if there are several possible elements exist, then ask user
										this.showTextElementCreateMenu(
											selectedItem,
											expectedTextChilds
										);
										insertResult = {
											placement: 'menu',
											element: null
										};
									}
								}
							}

							// if appropriate text container was found, then place newSymbol into it
							if (targetTextElement) {
								let textContent;

								if (targetTextElement.is('ArasTextXmlSchemaElement')) {
									textContent = targetTextElement.GetTextAsString();
									viewCursor.Set(
										targetTextElement,
										textContent.length,
										targetTextElement,
										textContent.length
									);
									this.viewmodel.SetSelectedItems(targetTextElement);

									if (newSymbol) {
										targetTextElement.InsertText(newSymbol);
									}
								} else if (schemaHelper.IsContentMixed(targetTextElement)) {
									const textElementChilds = targetTextElement.ChildItems();
									const textChild = textElementChilds.get(
										textElementChilds.length() - 1
									);

									if (textChild && textChild.is('XmlSchemaText')) {
										if (newSymbol) {
											textContent = textChild.Text() + newSymbol;
											textChild.Text(textContent);
										} else {
											textContent = textChild.Text();
										}

										this.viewmodel.SetSelectedItems(textChild);
										viewCursor.Set(
											textChild,
											textContent.length,
											textChild,
											textContent.length
										);
									}
								}
							}
						}
					}
				}
			}

			this.viewmodel.ResumeInvalidation();
			return insertResult;
		},

		_applyShadowInputContent: function () {
			const textContent = this._shadowInput.value;

			if (textContent) {
				const sourceElement = this._shadowInput.sourceSchemaElement;
				const isTextSourceElement =
					sourceElement.is('ArasTextXmlSchemaElement') ||
					sourceElement.is('XmlSchemaText');
				let targetTextElement = isTextSourceElement && sourceElement;

				// Searching for appropriate text element
				if (!isTextSourceElement) {
					const insertResult = this.insertSymbolAtCursor('');

					if (
						insertResult.placement === 'newChild' ||
						insertResult.placement === 'existingChild'
					) {
						targetTextElement = insertResult.element;
					}
				}

				if (targetTextElement) {
					const elementDomNode = this.domapi.getNode(targetTextElement);
					const newTextNode =
						elementDomNode.ownerDocument.createTextNode(textContent);

					elementDomNode.appendChild(newTextNode);

					if (targetTextElement !== sourceElement) {
						this.viewmodel.SetSelectedItems(targetTextElement);
					}

					this.domRange.setCursorTo(
						targetTextElement,
						'end',
						targetTextElement,
						'end'
					);
					this._detachShadowInput();
				}
			}
		},

		_calcSiblingMenuCoordinates: function (targetNode) {
			const nodeOffset = this._calcNodeOffsetCoordinates(targetNode, {
				outer: true
			});

			nodeOffset.x += 10;
			nodeOffset.y += targetNode.offsetHeight;

			return nodeOffset;
		},

		_calcNodeOffsetCoordinates: function (targetNode, optionalParameters = {}) {
			let xCoor = 0;
			let yCoor = 0;

			while (targetNode) {
				xCoor += targetNode.offsetLeft;
				yCoor += targetNode.offsetTop;

				targetNode = targetNode.offsetParent;
			}

			if (optionalParameters.outer) {
				const editorCoordinates = this._calcNodeOffsetCoordinates(this.iframe);

				xCoor += editorCoordinates.x;
				yCoor += editorCoordinates.y - this.scrollNode.scrollTop;
			}

			return { x: xCoor, y: yCoor };
		},

		/**
		 * @param {WrappedObject} targetElement
		 * @param {Boolean} isNextIteration
		 */
		showSiblingCreateMenu: function (
			targetElement,
			isNextIteration,
			optional = {}
		) {
			if (!targetElement) {
				return;
			}

			const selectedItems = this.viewmodel.GetSelectedItems();
			const immutable =
				this.viewmodel.hasClassificationBindedElements() &&
				selectedItems.some(
					function (item) {
						return this.viewmodel.isRootElementContained(item.Parent || item);
					}.bind(this)
				);

			if (immutable) {
				return;
			}

			const contextMenuItems =
				this.actionsHelper.getCreateSiblingMenu(targetElement);
			const parentElement = targetElement.Parent;
			const isTargetTableCell =
				!!parentElement &&
				parentElement.is('ArasRowXmlSchemaElement') &&
				targetElement.is('ArasCellXmlSchemaElement');

			if (contextMenuItems.length && !isTargetTableCell) {
				const elementId = targetElement.Id();
				const targetNode = this.domapi.getNodeById(elementId);
				const coordinates =
					optional.coordinates || this._calcSiblingMenuCoordinates(targetNode);

				if (parentElement) {
					contextMenuItems.unshift({
						id: 'add_parent_sibling',
						name: 'Go up',
						icon: '../../images/GoUp.svg'
					});
				}

				this.showContextMenu({
					menuItems: contextMenuItems,
					elementId: elementId,
					popupSettings: {
						x: coordinates.x,
						y: coordinates.y,
						maxHeight: 250
					}
				});

				const firstMenuItem = this._contextMenu.getItemById(
					contextMenuItems[0].id
				);
				firstMenuItem.item.focus();
			} else if (parentElement && !isNextIteration) {
				const modelCursor = this.viewmodel.Cursor();

				this.viewmodel.SetSelectedItems(parentElement);
				modelCursor.Set(parentElement, 0, parentElement, 0);

				setTimeout(
					function () {
						this.showSiblingCreateMenu(parentElement, true, optional);
					}.bind(this),
					0
				);
			}
		},

		/**
		 * @param {WrappedObject} targetElement
		 * @param {Array} elementsList
		 */
		showTextElementCreateMenu: function (targetElement, elementsList) {
			if (targetElement && elementsList.length) {
				const elementId = targetElement.Id();
				const targetNode = this.domapi.getNodeById(elementId);
				const schemaHelper = this.viewmodel.Schema();
				const editorOffset = this._calcNodeOffsetCoordinates(this.domNode);
				const nodeOffset = this._calcNodeOffsetCoordinates(targetNode);
				const contextMenuItems = [];

				for (const itemName of elementsList) {
					const itemType = schemaHelper.GetSchemaElementType(itemName);
					const actionNameSeparator = this.actionsHelper.menuItemNameSeparator;

					contextMenuItems.push({
						id: `insertelement${actionNameSeparator}` + itemName,
						name: itemName,
						icon: Enums.getImagefromType(itemType)
					});
				}

				// menu positioning
				nodeOffset.x += editorOffset.x + 10;
				nodeOffset.y +=
					editorOffset.y + targetNode.offsetHeight - this.scrollNode.scrollTop;

				this.actionsHelper.showContextMenu(
					this._contextMenu,
					this,
					contextMenuItems,
					elementId,
					{
						x: nodeOffset.x,
						y: nodeOffset.y,
						onClose: function () {
							const targetNode = this.domapi.getNodeById(elementId);

							if (targetNode && targetNode.focus) {
								targetNode.focus();
							} else {
								this.iframe.contentWindow.focus();
							}
						}.bind(this)
					}
				);

				const firstMenuItem = this._contextMenu.getItemById(
					contextMenuItems[0].id
				);
				firstMenuItem.item.focus();
			}
		},

		handleEnterKey: function (e) {
			if (this.viewmodel.IsEditable() && !e.altKey && !e.ctrlKey) {
				if (!e.shiftKey) {
					const selectedItems = this.viewmodel.GetSelectedItems();

					if (selectedItems.length === 1) {
						const targetElement = this.viewmodel.GetAncestorOrSelfElement(
							selectedItems[0]
						);

						if (targetElement) {
							this.scrollToSelection([targetElement]);
							this.showSiblingCreateMenu(targetElement);
						}
					}

					this._stopEvent(e);
				}
			} else {
				this._stopEvent(e);
			}
		},

		handleTabKey: function (e) {
			if (!e.ctrlKey) {
				this.shiftSelectedElement(
					!e.shiftKey ? Enums.Directions.Right : Enums.Directions.Left
				);
			} else if (this.viewmodel.IsEditable()) {
				this.syncBeforeAction(e);
				this.insertSymbolAtCursor('\t');
			}

			return false;
		},

		/**
		 * @param {Enums.Directions} moveDirection
		 * @param {Boolean} cursorAtStart
		 */
		shiftSelectedElement: function (moveDirection, cursorAtStart) {
			const selectedItems = this.viewmodel.GetSelectedItems();

			if (selectedItems.length) {
				const selectedElement = selectedItems[selectedItems.length - 1];

				let nextElement = this.getNextElementByDirection(
					selectedElement,
					moveDirection
				);
				let nextIndex = this.viewmodel.getElementIndex(nextElement);

				if (nextElement) {
					let cursorPosition = cursorAtStart ? 'start' : 'end';
					let isChildPosition = false;

					if (
						nextElement.is('ArasTextElement') &&
						selectedElement.hasParent(nextElement)
					) {
						const stash = nextElement.getTextStash();
						const embeddedElement = selectedElement.closestElement(
							'TextEmbeddedElement',
							this
						);
						const elementEmph = stash.getEmphByElement(embeddedElement);

						isChildPosition = true;
						cursorPosition =
							stash.getEmphIndex(elementEmph) +
							(moveDirection === Enums.Directions.Right ? 1 : 0);
					} else {
						let innacurateElement = nextElement;
						const schemaHelper = this.viewmodel.Schema();

						while (
							!innacurateElement?.is('ArasTextElement') &&
							innacurateElement?.ChildItems().length() > 0 &&
							!schemaHelper.IsContentMixed(innacurateElement)
						) {
							nextIndex += 1;
							innacurateElement = this.viewmodel.getElementByIndex(nextIndex);
						}

						nextElement = innacurateElement || nextElement;
					}

					if (selectedElement !== nextElement) {
						setTimeout(() => {
							this.placeCursorOnElement(
								nextElement,
								cursorPosition,
								isChildPosition
							);

							this.viewmodel.SetSelectedItems(nextElement);
						});
					}
				}
			}
		},

		/**
		 * @param {WrappedObject} targetElement
		 */
		getCellContainer: function (targetElement) {
			while (targetElement) {
				if (targetElement.is('ArasCellXmlSchemaElement')) {
					return targetElement;
				}

				targetElement = targetElement.Parent;
			}
		},

		/**
		 * @param {WrappedObject} targetElement
		 */
		getTableContainer: function (targetElement) {
			let rowContainer;

			while (targetElement) {
				if (targetElement.is('ArasTableXmlSchemaElement')) {
					return targetElement;
				} else if (
					targetElement.is('ArasRowXmlSchemaElement') &&
					!rowContainer
				) {
					rowContainer = targetElement;
				}

				targetElement = targetElement.Parent;
			}

			return rowContainer;
		},

		/**
		 * @param {WrappedObject} targetElement
		 * @param {Enums.Directions} moveDirection
		 */
		getNextElementByDirection: function (targetElement, moveDirection) {
			let mergeCells;
			let cellChilds;

			if (targetElement) {
				const positionIncrement =
					moveDirection == Enums.Directions.Right ||
					moveDirection == Enums.Directions.Down;
				const positionOffset = positionIncrement ? 1 : -1;
				const globalIndex = this.viewmodel.getElementIndex(targetElement);
				let nextElement;
				let targetTableContainer;
				let nextTableContainer;

				const parentCell = this.getCellContainer(targetElement);

				if (!positionIncrement) {
					while (
						targetElement !== parentCell &&
						!targetElement.Parent?.is('ArasTextElement') &&
						targetElement.Parent?.ChildItems().index(targetElement) === 0
					) {
						targetElement = targetElement.Parent;
					}
				}

				if (
					targetElement.is('TextEmbeddedElement') ||
					targetElement.hasParent('TextEmbeddedElement')
				) {
					const embeddedParent = targetElement.closestElement(
						'TextEmbeddedElement',
						true
					);
					const textParent = targetElement.closestElement('ArasTextElement');
					const stash = textParent.getTextStash();
					const elementEmph = stash.getEmphByElement(embeddedParent);
					const emphIndex = stash.getEmphIndex(elementEmph);

					if (
						!(
							(emphIndex === 0 && !positionIncrement) ||
							(emphIndex + 1 === stash.Count() && positionIncrement)
						)
					) {
						return textParent;
					}
				} else if (targetElement?.is('ArasTextElement')) {
					const siblingElements = targetElement.Parent?.ChildItems();
					const elementIndex = siblingElements.index(targetElement);
					const nextIndex =
						siblingElements.index(targetElement) + positionOffset;
					const allElements = this.viewmodel.getAllElements();

					if (nextIndex >= 0 && nextIndex < siblingElements.length()) {
						return siblingElements.get(elementIndex + positionOffset);
					}

					let nextElementIndex = globalIndex + positionOffset;
					nextElement = allElements[nextElementIndex];

					if (positionIncrement) {
						while (nextElement && targetElement.containsElement(nextElement)) {
							nextElementIndex += 1;
							nextElement = allElements[nextElementIndex];
						}

						nextElement = nextElement || targetElement;
					}
				}

				if (parentCell) {
					cellChilds = parentCell.getAllChilds();
					const isCellNavigation =
						targetElement.is('ArasCellXmlSchemaElement') ||
						((moveDirection == Enums.Directions.Left ||
							moveDirection == Enums.Directions.Up) &&
							targetElement == cellChilds[1]) ||
						((moveDirection == Enums.Directions.Right ||
							moveDirection == Enums.Directions.Down) &&
							targetElement == cellChilds[cellChilds.length - 1]);

					if (isCellNavigation) {
						mergeCells = parentCell.getMergeCells();
						let nextMergeCell;

						if (mergeCells.length == 1) {
							nextElement = parentCell.getNextCell(moveDirection);
						} else {
							const indexLimit = positionIncrement ? mergeCells.length : -1;
							let nextPosition =
								mergeCells.indexOf(parentCell) + positionOffset;
							let nextCell;

							while (nextPosition != indexLimit) {
								nextCell = mergeCells[nextPosition];

								if (nextCell.ChildItems().length() > 0) {
									nextMergeCell = nextCell;
									break;
								}

								nextPosition += positionOffset;
							}

							nextElement =
								nextMergeCell || parentCell.getNextCell(moveDirection);
						}

						// if next cell was found
						if (nextElement) {
							if (!positionIncrement) {
								if (mergeCells.indexOf(nextElement) != -1) {
									const allCellChilds = nextElement.getAllChilds();

									nextElement = allCellChilds[allCellChilds.length - 1];
								} else {
									let foundElement = nextElement;

									mergeCells = nextElement.getMergeCells();

									for (let i = mergeCells.length - 1; i >= 0; i--) {
										nextMergeCell = mergeCells[i];
										cellChilds = nextMergeCell.getAllChilds();

										if (cellChilds.length > 1) {
											foundElement = cellChilds[cellChilds.length - 1];
											break;
										}
									}

									nextElement = foundElement;
								}
							}

							return nextElement;
						}

						// if cell was not found, then selection moved out from the table
						const cellContainer = parentCell.GetTable() || parentCell.Parent;

						if (!positionIncrement) {
							const containerIndex =
								this.viewmodel.getElementIndex(cellContainer);

							nextElement =
								this.viewmodel.getElementByIndex(containerIndex - 1) ||
								cellContainer;
						} else {
							const tableSiblings = cellContainer.Parent.ChildItems();

							nextElement =
								tableSiblings.get(tableSiblings.index(cellContainer) + 1) ||
								targetElement;
						}
					}

					targetTableContainer = this.getTableContainer(parentCell);
				}

				if (!nextElement) {
					let nextIndex =
						this.viewmodel.getElementIndex(targetElement) +
						(positionIncrement ? 1 : -1);
					nextElement = this.viewmodel.getElementByIndex(nextIndex);

					// skip XmlSchemaText nodes
					while (nextElement && nextElement.is('XmlSchemaText')) {
						nextIndex += positionIncrement ? 1 : -1;
						nextElement = this.viewmodel.getElementByIndex(nextIndex);
					}
				}

				// trying to correct next element
				if (nextElement) {
					nextTableContainer = this.getTableContainer(nextElement);

					// if we switched into the table from other element
					if (
						nextTableContainer &&
						targetTableContainer != nextTableContainer
					) {
						// if switched from element, that placed under the table
						if (!positionIncrement) {
							nextElement = this.getCellContainer(nextElement);

							// if switched to last cell via upArrow, then move selection to the first cell of the last row
							if (moveDirection == Enums.Directions.Up) {
								if (nextElement == nextTableContainer.getLastCell()) {
									nextElement = nextTableContainer.is(
										'ArasTableXmlSchemaElement'
									)
										? nextTableContainer.getSelectableCell(
												nextTableContainer.RowCount() - 1,
												0
											)
										: nextTableContainer.ChildItems().get(0);
								}
							}

							mergeCells = nextElement.getMergeCells();

							for (let i = mergeCells.length - 1; i >= 0; i--) {
								cellChilds = mergeCells[i].getAllChilds();

								if (cellChilds.length > 1) {
									nextElement = cellChilds[cellChilds.length - 1];
									break;
								}
							}
						}
					}
				}

				return nextElement;
			}
		},

		/**
		 * @param {WrappedObject} targetElement
		 * @param {String} cursorPlace
		 */
		placeCursorOnElement: function (
			targetElement,
			cursorPlace,
			isChildPosition
		) {
			const viewCursor = this.viewmodel.Cursor();
			const schemaHelper = this.viewmodel.Schema();
			const isCursorAtTheEnd =
				cursorPlace === 'end' || cursorPlace === undefined;
			const elementNode = this.domapi.getNode(targetElement);

			if (targetElement.is('ArasTextElement')) {
				if (!isChildPosition) {
					if (typeof cursorPlace === 'string') {
						isChildPosition = true;
						cursorPlace =
							cursorPlace === 'start' ? 0 : targetElement.getEmphsCount();
					}
				}

				this.domRange.setCursorTo(
					targetElement,
					cursorPlace,
					targetElement,
					cursorPlace,
					isChildPosition
				);
			} else if (schemaHelper.IsContentMixed(targetElement)) {
				const textChilds = targetElement.ChildItems();
				const targetString = textChilds.get(textChilds.length() - 1);

				if (targetString && targetString.is('XmlSchemaText')) {
					const textContent = targetString.Text();
					const cursorPosition = isCursorAtTheEnd ? textContent.length : 0;

					viewCursor.Set(
						targetString,
						cursorPosition,
						targetString,
						cursorPosition
					);
				}
			} else {
				viewCursor.Set(targetElement, 0, targetElement, 0);
			}

			this._focusNode(elementNode);
		},

		handleCtrlB: function (e) {
			if (this.viewmodel.IsEditable()) {
				this.syncBeforeAction(e);
				this.actionsHelper.executeAction('arastextactions', {
					actionName: 'bold'
				});
			}

			return false;
		},

		handleCtrlI: function (e) {
			if (this.viewmodel.IsEditable()) {
				this.syncBeforeAction(e);
				this.actionsHelper.executeAction('arastextactions', {
					actionName: 'italic'
				});
			}

			return false;
		},

		handleCtrlS: function (e) {
			if (this.viewmodel.IsEditable()) {
				this.syncBeforeAction(e);
				// Calling onSaveCommand after document invalidation only
				setTimeout(function () {
					window.aras.getMostTopWindowWithAras(window).onSaveCommand();
				}, 0);
				return false;
			}

			return true; // let standard onSaveCommand() be executed and save Item
		},

		handleCtrlU: function (e) {
			if (this.viewmodel.IsEditable()) {
				this.syncBeforeAction(e);
				this.actionsHelper.executeAction('arastextactions', {
					actionName: 'under'
				});
			}

			return false;
		},

		setupDefaultShortcuts: function () {
			/*   Need to kill error of RichText's call shortcuts
			Override dijit._editor.RichText that use setupDefaultShortcuts to set
				b, i, u, a, s, m
			*/
		},

		/**
		 * @param {Boolean} value
		 */
		_setDisabledAttr: function (value) {
			// union of dijit.Editor._setDisabledAttr and dijit._editor.RichText._setDisabledAttr
			// but specific logic for "ff" was not included in order to fix problem with flashing caret
			// which is allways visible if document.designMode = "On", also seems that minimal supported by Aras
			// version of FF behaves normally with "contentEditable"

			// this code copied from dijit.Editor._setDisabledAttr
			this.setValueDeferred.then(
				function () {
					if (
						(!this.disabled && value) ||
						(!this._buttonEnabledPlugins && value)
					) {
						// Disable editor: disable all enabled buttons and remember that list
						this._plugins.forEach(function (p) {
							p.set('disabled', true);
						});
					} else if (this.disabled && !value) {
						// Restore plugins to being active.
						this._plugins.forEach(function (p) {
							p.set('disabled', false);
						});
					}
				}.bind(this)
			);

			// this code copied from dijit._editor.RichText
			value = !!value;
			this._set('disabled', value);
			if (!this.isLoaded) {
				return;
			} // this method requires init to be complete

			this.editNode.tabIndex = value ? '-1' : this.tabIndex;
			this.editNode.classList.toggle('editor-disabled', value);
			this.editNode.classList.toggle('editor-enabled', !value);

			this._disabledOK = true;
		},

		_onBlur: function () {
			// union of dijit.Editor._onBlur, dijit._editor.RichText._onBlur and dijit._FocusMixin._onBlur
			// partially removed code from RichText._onBlur with focus logic (IE specific)
			// summary:
			//		Called from focus manager when focus has moved away from this editor
			// tags:
			//		protected

			// dijit._FocusMixin code part
			this.onBlur();
			// end of dijit._FocusMixin code part

			// dijit._editor.RichText code part
			const newValue = this.getValue(true);
			if (newValue !== this.value) {
				this.onChange(newValue);
			}
			this._set('value', newValue);
			// end of dijit._editor.RichText code part

			// dijit.Editor code part
			this.endEditing(true);
		},

		/**
		 * @param {String} html
		 */
		setValue: function (html) {
			// copy of dijit.Editor.setValue
			// with changed domNode, where innerHTML setted

			if (!this.isLoaded) {
				// try again after the editor is finished loading
				this.onLoadDeferred.then(
					function () {
						this.setValue(html);
					}.bind(this)
				);
				return;
			}

			this._cursorToStart = true;
			if (this.textarea && (this.isClosed || !this.isLoaded)) {
				this.textarea.value = html;
			} else {
				const node = this.isClosed
					? this.domNode
					: this.contentNode || this.editNode;

				html = this._preFilterContent(html);
				if (
					html &&
					this._environment.isFirefox &&
					html.toLowerCase() === '<p></p>'
				) {
					html = '<p>&#160;</p>'; // &nbsp;
				}

				// Use &nbsp; to avoid webkit problems where editor is disabled until the user clicks it
				if (!html && has('webkit')) {
					html = '&#160;'; // &nbsp;
				}

				node.innerHTML = html;
				this._preDomFilterContent(node);
			}

			this.onDisplayChanged();
			this._set('value', this.getValue(true));

			this._attachContentObservers();
		}
	});
});

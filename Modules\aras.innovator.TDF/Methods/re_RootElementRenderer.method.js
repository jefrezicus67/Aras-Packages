return {
	GetTreeName: function (schemaElement, elementState) {
		const viewmodel = this.factory && this.factory._viewmodel;
		if (viewmodel && typeof viewmodel.GetRequirementTitle === 'function') {
			const requirementTitle = viewmodel.GetRequirementTitle(schemaElement);
			if (requirementTitle) {
				return requirementTitle;
			}
		}

		// Fallback for preview contexts where the viewmodel does not expose
		// GetRequirementTitle (e.g., standalone requirement preview).
		const thisBlock =
			viewmodel && typeof viewmodel.GetThisBlock === 'function'
				? viewmodel.GetThisBlock()
				: null;
		if (thisBlock && typeof thisBlock.getProperty === 'function') {
			const titleProps = ['req_title', 'name', 'item_number', 'keyed_name', 'title'];
			for (let i = 0; i < titleProps.length; i++) {
				const value = thisBlock.getProperty(titleProps[i]);
				if (value) {
					return value;
				}
			}
		}

		return schemaElement && typeof schemaElement.Name === 'function'
			? schemaElement.Name()
			: '';
	},
	GetTreeStyle: function (schemaElement, elementState) {
		return { backgroundImage: 'url("../../Solutions/RE/images/Requirement.svg?req=1")' };
	},
	RenderHtml: function (schemaElement, parentState) {
		let out = '';
		if (schemaElement.Display()) {
			const elementState = this.prepareElementState(schemaElement, parentState);

			out +=
				this.RenderStartHtmlElement(schemaElement, elementState) +
				(elementState.isBlocked
					? this.ResourceString('contentIsBlocked')
					: this.RenderInnerContent(schemaElement, elementState)) +
				this.RenderEndHtmlElement(schemaElement, elementState);
		}
		return out;
	},

	_renderModel: function (schemaElement, parentState) {
		const childItems = schemaElement.ChildItems();
		const elementState = this.prepareElementState(schemaElement, parentState);
		const out = this.RenderChildrens(schemaElement, elementState);
		const childrenIds = childItems.List().map((element) => element.Id());

		out.forEach((descriptor) => {
			if (childrenIds.includes(descriptor.id)) {
				descriptor.parent = schemaElement.Parent.Id();
			}
		});

		return out;
	},

	RenderModel: function (schemaElement, parentState) {
		if (schemaElement.Display()) {
			const isParentBlock = schemaElement.Parent?.is('ArasBlockXmlSchemaElement');
			const isParentExternal = schemaElement.Parent?.isExternal();

			if (isParentBlock && isParentExternal) {
				return this._renderModel(schemaElement, parentState);
			}
		}

		return this.inherited(arguments);
	}
};

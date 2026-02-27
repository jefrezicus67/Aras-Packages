// eslint-disable-next-line
// @ts-nocheck
define([
	'dojo/_base/declare',
	'dojo/_base/connect',
	'dijit/popup',
	'TDF/Scripts/Aras/Client/Controls/TechDoc/ViewModel/StructuredDocumentBase'
], (declare, connect, popup, StructuredDocumentBase) => {
	return declare([StructuredDocumentBase], {
		_initialSetup: function (parameters) {
			// eslint-disable-next-line prefer-rest-params
			this.inherited(arguments);

			this._additionalSettings.dojoModules = {
				...this._additionalSettings.dojoModules,
				connect,
				popup,
				declare
			};
		}
	});
});

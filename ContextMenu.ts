//THIS IS MODIFICATION OF EXISTING FILE:
{
    id: 'converttexttochapter',
    label: this.aras.getResource('../Modules/aras.innovator.TDF', 'action.converttexttochapter'),
    action: 'converttexttochapter',
    icon: 'icon-path', // Optional
    condition: (selectedItems) => {
        // Only show for Text elements
        return selectedItems.every(item => item.nodeName === 'Text');
    }
}

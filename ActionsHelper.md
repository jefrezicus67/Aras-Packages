//THIS IS MODIFICATION TO THE REFERENCED FILE, NOT DIRECT USE:

ConvertTextToChapterAction needs to be added in quote a few places inside ActionsHelper.ts

First:
under define:
then under function ( immediatelly following

then under "createActions" it needs to be added similar to action.
with handler new

then under onMenuItemClick needs to be added as a case

then if desired, add a separator and put the menu entry there

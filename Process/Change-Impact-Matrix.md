# Change Impact Matrix

## Purpose

This matrix tells a developer or agent which parts of the system to re-examine
when a given area changes. It removes guesswork: instead of inferring what a
change affects, consult the table.

Use it before starting a task and again before marking it done, to confirm all
affected areas were checked.

## Subsystem Impact

| When this changes | Also review |
|---|---|
| Storage | Backup, Workspace, Import, Export, Cross-tab sync, every data service |
| Serializer | Backup, Import, Export, Workspace (Snapshot format) |
| Backup | Cloud, Import, Export, Serializer |
| Workspace | Backup, Storage, Cloud, Snapshot lifecycle |
| Cloud | Backup |
| Platform UI Utilities | Every feature (showFlash, context menus, clipboard, icons) |
| showFlash | Every section that reports user feedback |
| STORAGE_KEYS | Reset All Data, Backup key enumeration, every reader of the key |

## Document Impact

| When this changes | Also review |
|---|---|
| A Contract | The matching Knowledge document, Foundation, affected ADRs |
| A Knowledge document | The matching Contract (for drift), the code it describes |
| An ADR | Contracts and Knowledge documents it affects |
| Foundation | All Contracts (they inherit its principles) |
| Master Plan | Task files it sequences |

## Feature Impact

| When this changes | Also review |
|---|---|
| Folder data layer | Barcode rendering, Import, Backup, Cross-tab sync |
| Barcode rendering | Folder data layer, QR cache, Print |
| Note data layer | Notebook UI, Search, Backup |
| Bookmark data layer | Bookmark UI, Import (browser bookmarks), Backup |
| Todo data layer | Todo UI, Reminders, Wellness, Backup |
| Print pipeline | Barcode rendering (print-all), Bridge availability |
| Import / Export | Serializer, every data layer, Workspace restore |

## Usage

1. Before starting a task, find the row for the area you are changing and note
   all listed dependencies.
2. Include those dependencies in your verification scope.
3. Before marking the task done, confirm each listed area still behaves correctly
   in the smoke test.

This matrix should be updated whenever a new subsystem or cross-cutting utility
is introduced.

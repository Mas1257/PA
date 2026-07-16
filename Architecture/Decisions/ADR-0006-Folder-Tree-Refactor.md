# Folder Tree Refactor

Document date: 2026-07-03

Project: PA — Process Assistant

Status: Proposed feature refactor. Not implemented in `PA.js` yet.

## Decision Summary

PA should move from a two-level folder model:

```text
Folder
└── Subfolder
    └── Barcode
```

to a recursive folder tree model:

```text
Folder
└── Folder
    └── Folder
        └── Barcode
```

In the target model, a subfolder is not a separate entity. It is a normal folder with a parent folder.

## Current Model

Barcode folders currently use two storage collections:

- `bm_folders`
- `bm_subfolders`

Conceptually this creates three domain concepts:

- Folder
- Subfolder
- Barcode

This limits the UI and storage model to a special two-level hierarchy and creates duplicate logic for create, rename, delete, move, render, import, export, and backup behavior.

## Target Model

Barcode folders should use one folder collection:

```js
folders = [
  {
    id: 'folder-1',
    name: 'Warehouse',
    parentId: null,
    pinned: false
  },
  {
    id: 'folder-2',
    name: 'Aisle A',
    parentId: 'folder-1',
    pinned: false
  },
  {
    id: 'folder-3',
    name: 'Shelf 1',
    parentId: 'folder-2',
    pinned: false
  }
];
```

Barcode records should point to exactly one folder node:

```js
barcode.folderId = 'folder-3';
```

The UI can still render the same visual hierarchy. The user experience does not need to change.

## Entity Naming Decision

For the current need, the entity should remain `Folder`, not `Node`.

A future generalized `Node` model could support:

- `folder`
- `smart-folder`
- `separator`
- `favorite`
- other future item types

But introducing `Node` now would be broader than the current requirement and would increase migration risk. The recommended current target is therefore:

```js
Folder = {
  id,
  name,
  parentId,
  pinned
}
```

## Design Goals

- Remove the conceptual difference between folder and subfolder.
- Support unlimited nesting through `parentId` chains.
- Preserve current UI behavior during migration.
- Preserve current import/export and Workspace data safety.
- Avoid deleting legacy data until migration is verified.
- Keep rollback possible.

## Non-Goals

This refactor should not initially:

- Redesign the visual UI.
- Add smart folders.
- Add separator/favorite nodes.
- Change barcode rendering, printing, or copy behavior.
- Change bookmark folder data at the same time.
- Change Workspace file format in the same first patch without a compatibility layer.

## Migration Strategy

This is not a normal no-storage-change refactor. It is a feature refactor with a required data migration.

A safe migration must be implemented as its own approved task and must be idempotent.

### Legacy Input

Existing barcode folder data:

```js
bm_folders = [
  { name: 'Warehouse', pinned: false }
]

bm_subfolders = [
  { parent: 'Warehouse', name: 'Aisle A', pinned: false }
]

bm_barcodes = [
  { folder: 'Warehouse', subfolder: 'Aisle A', ... }
]
```

### Target Output

```js
bm_folders_v2 = [
  { id: '...', name: 'Warehouse', parentId: null, pinned: false },
  { id: '...', name: 'Aisle A', parentId: '...', pinned: false }
]

bm_barcodes = [
  { folderId: '...', folder: 'Warehouse', subfolder: 'Aisle A', ... }
]
```

During the compatibility phase, barcode records may temporarily keep legacy `folder` and `subfolder` fields while also gaining `folderId`. This allows rollback and keeps old import/export paths readable until the migration is fully verified.

## Storage Key Recommendation

Do not immediately delete `bm_subfolders` or change the meaning of `bm_folders` in the first migration patch.

Recommended staged approach:

1. Add `bm_folders_v2` or a clearly versioned internal schema flag.
2. Generate tree folders from legacy `bm_folders` + `bm_subfolders`.
3. Add compatibility read adapters that can read both legacy and v2 data.
4. Add compatibility write adapters that keep legacy fields valid during transition.
5. Update barcode operations to use `folderId` internally.
6. Update renderers and forms to use the tree adapter.
7. Update backup/import to include both old and new data until cutover is approved.
8. Only after verification, retire `bm_subfolders` in a separate cleanup task.

This avoids destructive migration and preserves rollback.

## Compatibility Requirements

Until cleanup is explicitly approved, these existing functions should remain callable as wrappers:

- `getAllSubFolders`
- `getSubFolders`
- `saveSubFolder`
- `deleteSubFolder`
- `renameSubFolder`
- `updateSubFolder`
- `moveSubFolderTo`

They should delegate to the folder tree service instead of being removed immediately.

## Proposed New Folder Tree Service

Introduce a new internal service boundary before changing UI code:

```js
FolderTreeService = {
  getFolders,
  getChildren,
  getRootFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  getFolderPath,
  findFolderByLegacyPath,
  migrateLegacyFolders,
  toLegacySubfolders
}
```

The first implementation can live inside `PA.js` behind compatibility wrappers. File extraction can happen later.

## Data Rules

- Folder IDs must be stable.
- Folder IDs must not be derived only from display names if rename is supported.
- Parent cycles must be prevented.
- Moving a folder into itself or one of its descendants must be rejected.
- Sibling folder names should remain unique under the same parent.
- Root folder names should remain unique at root level.
- Deleting a folder must define cascade behavior for descendants and barcodes before implementation.

## Barcode Rules

Target barcode folder association:

```js
barcode.folderId
```

Compatibility phase fields:

```js
barcode.folder
barcode.subfolder
barcode.folderId
```

The UI can continue showing folder/subfolder paths while the data layer resolves paths from `folderId`.

## Backup and Workspace Rules

Because Workspace backups are user-data safety mechanisms, the first migration-compatible backup schema should include enough data to restore either legacy or v2 state.

Recommended transition payload:

```js
{
  folders: legacyFolders,
  subfolders: legacySubfolders,
  folderTree: v2Folders,
  barcodes: barcodesWithCompatibilityFields
}
```

The final cleanup phase can remove legacy backup fields only after an approved schema version change.

## Phased Implementation Plan

### Phase 0 — Characterization Baseline

- Export a full backup with folders, subfolders, and barcodes.
- Record manual behavior for:
  - create folder
  - create subfolder
  - rename folder
  - rename subfolder
  - move folder into folder
  - move subfolder to root
  - delete folder
  - delete subfolder
  - move barcode between folder/subfolder
  - import/export backup round trip

### Phase 1 — Read-Only Tree Adapter

- Add functions that build a tree view from existing `bm_folders` and `bm_subfolders`.
- Do not change storage writes yet.
- Do not change UI yet.
- Validate tree output against existing UI hierarchy.

### Phase 2 — Stable Folder IDs

- Add deterministic migration that assigns stable IDs to existing folders and subfolders.
- Persist v2 folder tree separately.
- Preserve all legacy data.
- Add idempotency checks.

### Phase 3 — Compatibility Wrappers

- Keep legacy function names.
- Reimplement legacy subfolder operations through folder tree operations.
- Keep legacy data synchronized during transition.

### Phase 4 — Barcode FolderId Adoption

- Add `folderId` to barcode records during migration.
- Update barcode data operations to prefer `folderId`.
- Preserve legacy `folder` and `subfolder` fields for rollback/import compatibility.

### Phase 5 — Renderer/Form Adapter

- Update folder destination selects and renderers to use tree paths.
- Keep UI visually unchanged at first.
- Support deeper nesting only after the two-level behavior is verified.

### Phase 6 — Backup/Import Compatibility

- Add `folderTree` to full backup payload.
- Import both legacy and v2 folder data.
- Keep existing backup fields until schema cleanup is explicitly approved.

### Phase 7 — Legacy Cleanup

Only after successful validation:

- Remove direct writes to `bm_subfolders`.
- Remove legacy subfolder code paths.
- Update docs and backup schema version.
- Consider renaming UI terminology if desired, but not required.

## Rollback Strategy

During Phases 1–6, rollback must be possible by ignoring v2 data and using legacy fields:

- `bm_folders`
- `bm_subfolders`
- barcode `folder`
- barcode `subfolder`

No phase should delete legacy data until Phase 7 is approved.

## Risk Level

Very High.

Reasons:

- Persistent data migration.
- Folder renderer dependency.
- Barcode move/delete cascade behavior.
- Backup/restore compatibility.
- Workspace snapshot correctness.
- Cross-tab synchronization.

## Definition of Done

The Folder Tree Refactor is complete only when:

- Current folder/subfolder UI behavior still works.
- Existing users' data migrates automatically and idempotently.
- Rollback remains possible until cleanup phase.
- Barcodes resolve to the same visible folders as before migration.
- Backup and restore round trip succeeds for legacy and v2 payloads.
- No print, bookmark, todo, Workspace, or page-send behavior regresses.
- `bm_subfolders` retirement happens only in an approved cleanup phase.

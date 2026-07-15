# Task: Fix Folder Data Operations Issues

## Context

This task was generated from a code review of `Source/Tampermonkey/PA.user.js`.

Section reviewed:

```
// SECTION: Folder Data Operations  (lines 2016–2570)
```

This section contains:
- `FolderDataService` IIFE — folder and subfolder CRUD
- Compatibility facades — thin wrappers for backward compatibility
- Folder UI helpers — `populateFolderSelect`, `populateFolderTreeSelect`,
  `createFolderDestinationSelect`, `showNewFolderModal`

---

## Issues

### Issue 1 — Data Service Calls UI Functions Directly (All Mutation Functions)

**Severity:** Medium — architectural coupling, not a runtime bug today.

**Location:** Every mutation function inside `FolderDataService`:
`saveFolder`, `updateFolder`, `deleteFolder`, `renameFolder`, `saveSubFolder`,
`deleteSubFolder`, `renameSubFolder`, `updateSubFolder`, `moveFolderTo`,
`moveSubFolderTo`.

**Problem:**

Every data mutation ends with a direct call to UI rendering functions:

```javascript
async function deleteFolder(folderName) {
    ...
    StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
    setBarcodesCache(barcodes);
    renderFolders();                              // ← UI call inside data service
    showFlash(`Folder deleted`, false, 'success'); // ← UI call inside data service
}
```

The section header acknowledges this: "Pure data operations for folders plus small
UI callbacks that refresh the current UI." This coupling means `FolderDataService`
cannot be tested or reused without a live UI context.

**Fix:**

Remove `renderFolders()` and `showFlash()` calls from inside `FolderDataService`.

Each mutation function should return a result object or emit a `CustomEvent` on
success. Callers (UI event handlers) are responsible for triggering re-renders
and flash messages after awaiting the data operation.

Example pattern:

```javascript
async function deleteFolder(folderName) {
    ...
    StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
    StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);
    setBarcodesCache(barcodes);
    return { success: true };  // caller renders and shows flash
}
```

---

### Issue 2 — Multi-Key Writes Without Transaction (Data Consistency Risk)

**Severity:** Medium — real data integrity risk on crash or storage failure.

**Location:** `renameFolder` (3 writes), `deleteFolder` (3 writes),
`deleteSubFolder` (2 writes), `moveFolderTo` (3 writes), `moveSubFolderTo` (3 writes).

**Problem:**

Operations that must update multiple storage keys do so with sequential independent writes:

```javascript
async function renameFolder(oldName, newName) {
    StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);      // write 1
    StorageService.gmSet(STORAGE_KEYS.SUBFOLDERS, subFolders); // write 2
    StorageService.gmSet(STORAGE_KEYS.BARCODES, barcodes);    // write 3
}
```

If the tab is closed, the browser crashes, or a storage failure occurs between
write 1 and write 2, data is left in an inconsistent state:
folders are renamed but barcodes still reference the old name.

**Fix:**

Two options depending on acceptable complexity:

**Option A (minimal change):** Wrap the full sequence in a try/catch and roll back
on failure by re-saving the original values.

**Option B (preferred):** Introduce a `StorageService.batchSet(entries)` method
that writes all entries before returning. This does not provide true atomicity
(GM_setValue has no transaction support) but reduces the window for partial failure
and centralizes the pattern.

At minimum, add try/catch around each multi-key operation so failures are caught
and logged rather than silently corrupting state.

---

### Issue 3 — No try/catch on I/O Operations

**Severity:** Medium — inconsistent with Section 1 (StorageService) defensive pattern.

**Location:** All functions inside `FolderDataService`.

**Problem:**

`StorageService` wraps every I/O call in try/catch. `FolderDataService` has none.
An unexpected exception in `gmSet` or `getBarcodes` propagates uncaught.

**Fix:**

Wrap each data function body in try/catch:

```javascript
async function saveFolder(name, options = {}) {
    try {
        let folders = await getFolders();
        ...
        StorageService.gmSet(STORAGE_KEYS.FOLDERS, folders);
        return true;
    } catch (err) {
        console.error('[FolderDataService] saveFolder failed:', err);
        return false;
    }
}
```

---

### Issue 4 — UI Code in a Data Section

**Severity:** Low — organizational, not a runtime bug.

**Location:**
- `showNewFolderModal()` — lines ~2430–2500
- `createFolderDestinationSelect()` — lines ~2345–2430

**Problem:**

Both functions create DOM elements, append to `UI.panel.element`, and call
`UI.wireModalIdleTracking()`. They are pure UI factory functions and do not
belong in a section named "Folder Data Operations".

**Fix:**

Move `showNewFolderModal()` and `createFolderDestinationSelect()` to the
UI Forms section (currently Section 10: UI Forms - Folder and Barcode Editing).
No logic changes needed, only relocation.

---

### Issue 5 — Implicit Auto-Create Side Effect in `populateFolderSelect()`

**Severity:** Low — hidden data mutation from a UI helper.

**Location:** `populateFolderSelect()`, inside the "if folders.length === 0" branch.

**Problem:**

```javascript
async function populateFolderSelect(select, preferred) {
    const folders = await getFolders();
    if (folders.length === 0) {
        await saveFolder('Default');  // ← silently creates a folder
        ...
    }
}
```

A UI population function performs a data mutation without the caller's knowledge.
Any caller using `populateFolderSelect` may unknowingly trigger folder creation.

**Fix:**

Remove the `saveFolder('Default')` call from `populateFolderSelect`.

Folder initialization should be an explicit step in the bootstrap sequence, not
a side effect of rendering a dropdown. If a "Default" folder must always exist,
create it during `initialize()` rather than on first UI render.

---

## Execution Order

1. Issue 3 — add try/catch (low risk, improves all other fixes)
2. Issue 5 — remove implicit auto-create (targeted, low risk)
3. Issue 4 — relocate UI functions (no logic change)
4. Issue 2 — add batch/rollback for multi-key writes (medium risk)
5. Issue 1 — decouple renderFolders from data service (highest impact, do last)

---

## Before Making Any Changes

1. Read the current version of `Source/Tampermonkey/PA.user.js`.
2. Read `Contracts/Storage.md` and `Knowledge/Platform.md`.
3. Use the current file SHA for all update operations.
4. Do not modify any other file unless the fix explicitly requires it.
5. After Issue 1, verify that folder CRUD operations still trigger UI re-renders
   from their call sites.

---

## Commit Message

```
Fix folder data operations issues from code review
```

Or one commit per issue with descriptive messages.

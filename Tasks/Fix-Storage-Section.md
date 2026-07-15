# Task: Fix Storage Section Issues

## Context

This task was generated from a code review of `Source/Tampermonkey/PA.user.js`.

The file is a single Tampermonkey userscript (~19,700 lines) organized into named sections.
The section reviewed is:

```
// SECTION: Storage, Shared Cache, and Cross-Tab Sync  (lines 363–2015)
```

This section contains:
- `StorageEngine` — raw I/O layer (GM_getValue + localStorage)
- `StorageService` — cache management and cross-tab sync
- `WorkspaceState`, `WorkspaceDiagnostics`, `LocalWorkspaceProvider`, `WorkspaceService`
- QR preview cache system
- Clipboard cache

---

## Issues

### Issue 1 — Bug: Nested GM_addValueChangeListener (Line 571)

**Severity:** High — this is a real bug.

**Location:** Inside `StorageService.registerRuntimeSync()`, line 571.

**Problem:**

```javascript
GM_addValueChangeListener(STORAGE_KEYS.NOTE_FOLDERS, function (...) {
    ...
    // BUG: This inner listener is registered on every NOTE_FOLDERS change.
    GM_addValueChangeListener(STORAGE_KEYS.NOTE_SUBFOLDERS, function (...) {
        if (!remote) return;
        if (typeof renderNotes === 'function') renderNotes({ backgroundSync: true });
    });
    ...
});
```

Every time `NOTE_FOLDERS` changes, a new listener for `NOTE_SUBFOLDERS` is added.
After N changes, N listeners fire simultaneously on every `NOTE_SUBFOLDERS` event.
This causes unbounded listener accumulation (memory leak) and duplicate renders.

**Fix:**

Move the `NOTE_SUBFOLDERS` listener outside the `NOTE_FOLDERS` listener, at the same
level as the other top-level `GM_addValueChangeListener` calls.

```javascript
GM_addValueChangeListener(STORAGE_KEYS.NOTE_SUBFOLDERS, function (_name, _oldValue, newValue, remote) {
    if (!remote) return;
    updateLocalCache(STORAGE_KEYS.NOTE_SUBFOLDERS, newValue);
    if (typeof renderNotes === 'function') renderNotes({ backgroundSync: true });
});
```

**Verify:** After fix, exactly one `NOTE_SUBFOLDERS` listener should exist regardless
of how many times `NOTE_FOLDERS` changes.

---

### Issue 2 — DRY Violation: `isSupported()` Defined Twice (Lines 801 and 1541)

**Severity:** Medium — will cause a silent divergence bug if one copy is updated.

**Location:**
- Line 801: inside `LocalWorkspaceProvider`
- Line 1541: inside `WorkspaceService`

**Problem:**

Both functions are character-for-character identical:

```javascript
function isSupported() {
    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    if (/Firefox|FxiOS/i.test(ua)) return false;
    return typeof window !== 'undefined'
        && typeof window.showDirectoryPicker === 'function'
        && typeof indexedDB !== 'undefined';
}
```

**Fix:**

Extract to a single shared function before both IIFEs:

```javascript
function isWorkspaceSupported() {
    const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
    if (/Firefox|FxiOS/i.test(ua)) return false;
    return typeof window !== 'undefined'
        && typeof window.showDirectoryPicker === 'function'
        && typeof indexedDB !== 'undefined';
}
```

Then replace both internal `isSupported()` definitions and their call sites with
`isWorkspaceSupported()`.

**Note:** The public API of `WorkspaceService` exposes `isSupported` — the public
name must remain `isSupported` in the returned object. Only the internal implementation
function is renamed.

---

### Issue 3 — Architectural Coupling: StorageService Knows UI Functions (Line 544)

**Severity:** Medium — violates the Storage contract boundary.

**Location:** `StorageService.registerRuntimeSync()`, line 544.

**Problem:**

```javascript
function registerRuntimeSync({ renderFolders, renderNotes, updateFooterCount, scheduleQrPreviewPrefetch }) {
```

`StorageService` receives and holds references to feature-specific UI rendering functions.
This couples the storage layer directly to UI concerns, which the architecture explicitly forbids.

**Fix:**

Replace the named-function parameters with a generic event-based approach.
`StorageService` should dispatch a `pa:storage-changed` event (which `StorageEngine`
already does) and let feature modules register their own listeners externally.

The bootstrap section (line 17631) should register the UI callbacks directly on
`window` storage events instead of passing them into `StorageService`.

This fix requires:
1. Removing the named parameters from `registerRuntimeSync`.
2. Moving the `GM_addValueChangeListener` and `window.addEventListener('storage', ...)`
   calls from `StorageService` to the bootstrap section or a dedicated sync coordinator.
3. Verifying cross-tab sync still works for folders, barcodes, and notes.

**Note:** This is the largest change in this task. If time is constrained, Issues 1
and 2 should be fixed first and this deferred to a separate task.

---

### Issue 4 — Ownership Gap: Cache Variables Declared Outside StorageService (Lines 1798–1799)

**Severity:** Low — does not cause a bug today but creates a maintenance trap.

**Location:** Lines 1798–1799, in the outer IIFE scope after `WorkspaceService`.

**Problem:**

```javascript
let barcodesCache = null;
let foldersCache = null;
let barcodesCacheDirty = true;
let foldersCacheDirty = true;
```

These variables are managed entirely by `StorageService` (`setBarcodesCache`,
`setFoldersCache`, `invalidateBarcodesCache`, `invalidateFoldersCache`) but are
declared in the outer scope, making them accessible to any function in the file.

**Fix:**

Move the four variables inside `StorageService`'s IIFE closure.
Remove the outer-scope declarations.
Update any direct references outside `StorageService` to go through the service methods.

---

### Issue 5 — Cohesion: QR Preview Cache Belongs in a Separate Section

**Severity:** Low — organizational, not a bug.

**Location:** Lines ~1792–2015, currently inside the Storage section.

**Problem:**

The QR preview cache system is a self-contained subsystem with its own queue,
background worker, debounce logic, and `localStorage` access that bypasses
`StorageEngine`. It has no dependency on `StorageService` or `WorkspaceService`
and is conceptually part of the Barcode feature, not the Storage infrastructure.

**Fix:**

Move the QR preview cache block to the Barcode Data Operations section
(currently starting at line 3511). No logic changes are needed, only relocation.

---

### Issue 6 — Documentation Gap: Two WorkspaceState Values Are Undocumented

**Severity:** Low — documentation only.

**Location:** `WorkspaceState` defined at line 632. `Knowledge/Workspace.md`.

**Problem:**

`WorkspaceState` in the code defines six states:

```javascript
const WorkspaceState = Object.freeze({
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    PERMISSION_REQUIRED: 'PERMISSION_REQUIRED',
    READY: 'READY',
    ERROR: 'ERROR'
});
```

`Knowledge/Workspace.md` documents only four:
`DISCONNECTED`, `CONNECTING`, `CONNECTED`, `ERROR`.

`PERMISSION_REQUIRED` and `READY` are missing from the documentation.

**Fix:**

Update `Knowledge/Workspace.md` in the Architectural Boundaries section to list
all six states with a one-line description of each:

- `DISCONNECTED` — no workspace connected
- `CONNECTING` — connection in progress
- `CONNECTED` — directory handle restored, permission not yet verified
- `PERMISSION_REQUIRED` — handle present but permission not granted
- `READY` — connected and permission granted
- `ERROR` — last operation failed

---

## Execution Order

Fix in this order to minimize risk:

1. Issue 6 — documentation only, no code change, zero risk
2. Issue 2 — extract shared `isWorkspaceSupported()`, low risk refactor
3. Issue 1 — move nested listener out, targeted fix, medium risk
4. Issue 4 — move cache variables into StorageService closure, medium risk
5. Issue 5 — relocate QR cache block, no logic change
6. Issue 3 — decouple StorageService from UI, highest complexity, separate review recommended

---

## Before Making Any Changes

1. Read the current version of `Source/Tampermonkey/PA.user.js`.
2. Read `Knowledge/Workspace.md` and `Contracts/Storage.md`.
3. Use the current file SHA for all update operations.
4. Do not modify any other file unless the fix explicitly requires it.
5. Verify each fix does not change observable behavior before committing.

---

## Commit Message

```
Fix storage section issues from code review
```

Or use one commit per issue with descriptive messages.

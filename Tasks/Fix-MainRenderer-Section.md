# Task: Fix Main Renderer Section Issues

## Context

Section reviewed:

```
// SECTION: Main Renderer - Folder Grid and Barcode Grid  (lines 15398-16443)
```

This section contains a single function: `renderFolders()` at approximately
1,046 lines. It is the central UI refresh function for the barcode feature.

The chunked rendering pattern with `requestAnimationFrame` is a genuine quality
feature and should be preserved during refactoring.

---

## Issues

### Issue 1 - `renderFolders()` Is ~1,000 Lines in a Single Function

**Severity:** High - the longest function in the codebase.

**Location:** `renderFolders()`, line 15404.

**Problem:**

The function handles three distinct views, each with their own context menus,
event handlers, and DOM construction:

- Root folder grid (folder cards with rename/delete/print/move/pin menus)
- Subfolder grid within an active folder
- Barcode list within a folder or subfolder (with batch bar, QR and linear
  barcode previews, send button, and per-barcode context menus)

**Fix:**

Split into focused functions:

```javascript
async function renderFolderGrid()      // root view: folder cards
async function renderSubfolderGrid()   // folder-level: subfolder cards
async function renderBarcodeGrid()     // barcode list view
function createFolderCard(folder)      // folder card factory (already close to this)
function createSubfolderCard(sf)       // subfolder card factory
// createBarcodeItem(barcode) is already extracted - keep it
```

`renderFolders()` becomes a thin coordinator:

```javascript
async function renderFolders(options = {}) {
    const renderId = ++renderSeq;
    const isStale = () => renderId !== renderSeq;

    if (Folders.barcode.active) {
        await renderBarcodeGrid(isStale);
    } else {
        await renderFolderGrid(isStale);
    }
}
```

Preserve the chunked rendering logic in `renderBarcodeGrid()`.

---

### Issue 2 - `estimatePreviewModules()` and `isLikelyURL()` Defined Again

**Severity:** Medium - already defined in Section 11, now duplicated here.

**Location:** Inside `createBarcodeItem()` in Section 13.

**Problem:**

Both functions were previously defined inside `showBarcodeForm()` in Section 11.
They are now redefined with identical logic inside `createBarcodeItem()`:

```javascript
// Section 11 (showBarcodeForm):
const estimatePreviewModules = (fmt, len) => { switch (fmt) ... }
const isLikelyURL = (val) => { return /^https?:\/\//i.test(val)... }

// Section 13 (createBarcodeItem) - identical:
const estimatePreviewModules = (fmt, len) => { switch (fmt) ... }
const isLikelyURL = (val) => { return /^https?:\/\//i.test(val)... }
```

**Fix:**

Hoist both functions to top-level scope (as described in Fix-UIForms-Section
Issue 2). Once extracted, both `showBarcodeForm()` and `createBarcodeItem()`
use the same top-level definitions without redeclaring them.

---

### Issue 3 - Folder SVG Icons Defined for the Fourth Time

**Severity:** Medium - four SVG icon variants duplicated across three sections.

**Location:** `renderFolders()`, subfolder icon strings and root folder icon strings.

**Problem:**

Four folder icon variants are defined as inline SVG template strings:
- `emptyFolderSVG` (yellow, empty) - root folders
- `fullFolderSVG` (yellow, full) - root folders
- `subFolderEmptySVG` (blue, empty) - subfolders
- `subFolderFullSVG` (blue, full) - subfolders

The blue subfolder icons also appear in Section 9 (`renderBarcodeSearchResults`).
This is at least the third location where these SVGs are duplicated.

**Fix:**

Extract to named factory functions in a shared UI utilities section:

```javascript
function createFolderIconSvg(hasContent, variant = 'root') {
    const colors = variant === 'sub'
        ? { body: '#5b8def', shelf: '#7ba7f5' }
        : { body: '#F6C358', shelf: '#FCD462' };

    const shelfPaths = hasContent ? `
        <rect x="55.383" y="133.12" style="fill:#EBF0F3;" .../>
        <rect x="55.383" y="150.17" style="fill:#FFFFFF;" .../>
    ` : '';

    return `<svg ...>${shelfPaths}...</svg>`;
}
```

All call sites use `createFolderIconSvg(hasContent, 'root')` or
`createFolderIconSvg(hasContent, 'sub')`.

---

### Issue 4 - Print All Logic Duplicated for Folder and Subfolder

**Severity:** Medium - same loop appears twice with different data sources.

**Location:** Folder context menu print handler and subfolder context menu print handler.

**Problem:**

Both handlers contain an identical async loop:

```javascript
for (const b of barcodes) {
    const value = b?.value;
    if (value == null || String(value).trim() === '') continue;
    attemptedCount++;
    const ok = await printBarcodeValue(value, b.format, 1, {
        silent: true, useRawText: true, label: b?.name || ''
    });
    if (ok) successCount++;
}
const isError = successCount < attemptedCount;
showFlash(isError ? `Print result: ${successCount}/${attemptedCount}`
                  : `Sent to printer: ${successCount}/${attemptedCount}`,
          isError, isError ? 'error' : 'success');
```

**Fix:**

Extract to a shared async function:

```javascript
async function printAllBarcodesInFolder(folderName, subfolderName = '') {
    const barcodes = await idbGetBarcodesByFolder(folderName, subfolderName);
    if (!barcodes || barcodes.length === 0) {
        showFlash('Folder is empty', true, 'error');
        return;
    }
    let successCount = 0, attemptedCount = 0;
    for (const b of barcodes) {
        if (!b?.value || !String(b.value).trim()) continue;
        attemptedCount++;
        const ok = await printBarcodeValue(b.value, b.format, 1, {
            silent: true, useRawText: true, label: b?.name || ''
        });
        if (ok) successCount++;
    }
    if (!attemptedCount) { showFlash('Nothing to print', true, 'error'); return; }
    const isError = successCount < attemptedCount;
    showFlash(isError ? `Print result: ${successCount}/${attemptedCount}`
                      : `Sent to printer: ${successCount}/${attemptedCount}`,
              isError, isError ? 'error' : 'success');
}
```

Both folder and subfolder context menu handlers call `printAllBarcodesInFolder`.

---

### Issue 5 - `barcodeMenu` Variable Shadowing

**Severity:** Low - confusing shadowing between outer and inner scope.

**Location:** `let barcodeMenu = null` at `renderFolders` scope and again inside
`createBarcodeItem()`.

**Problem:**

The inner `barcodeMenu` shadows the outer one. Behavior is correct since
each barcode item has its own closure, but the naming is misleading.

**Fix:**

Rename the outer variable to `folderBarcodeMenu` or remove it if it is not
actually used at the outer scope. Rename the inner one to `itemMenu` or
`itemContextMenu` to distinguish per-item menus from any section-level menu.

---

### Issue 6 - `window._barcodeFlashActive` Is a Global Flag on `window`

**Severity:** Low - rendering state pollutes the global window object.

**Location:** `if (!window._barcodeFlashActive)` in `renderFolders()`.

**Fix:**

Move to a named UI state object or a module-level variable:

```javascript
// In Section 1 or a shared state section:
const UIState = {
    barcodeFlashActive: false,
};

// In renderFolders:
if (!UIState.barcodeFlashActive) { ... }
```

---

### Issue 7 - `localStorage.setItem` Bypasses StorageEngine

**Severity:** Low - same issue as Section 7.

**Location:** Barcode preview click handler.

```javascript
localStorage.setItem(STORAGE_KEYS.BARCODE_MODAL, JSON.stringify({...}));
```

**Fix:** Use `gmSet(STORAGE_KEYS.BARCODE_MODAL, {...})` to route through
StorageEngine and maintain dual-write consistency.

---

### Issue 8 - State Attached to DOM Element via Custom Property

**Severity:** Low - anti-pattern.

**Location:** Inside `createBarcodeItem()`.

```javascript
menuColumn._bmSendBtn = sendBtn;
...
if (menuColumn._bmSendBtn) {
    menuColumn.appendChild(menuColumn._bmSendBtn);
    delete menuColumn._bmSendBtn;
}
```

**Fix:**

Use a local variable instead of attaching state to the DOM:

```javascript
const sendBtn = barcode.format !== 'TEXT' ? createSendButton(barcode.value) : null;
menuColumn.appendChild(menuIcon);
menuColumn.appendChild(batchCheckbox);
if (sendBtn) menuColumn.appendChild(sendBtn);
```

---

## Execution Order

1. Issue 5 - rename barcodeMenu variables (zero risk)
2. Issue 8 - remove DOM property, use local variable (zero risk)
3. Issue 6 - move _barcodeFlashActive to UIState (low risk)
4. Issue 7 - replace localStorage.setItem (coordinate with Section 7 fix)
5. Issue 4 - extract printAllBarcodesInFolder (low risk, test both print paths)
6. Issue 3 - extract folder SVG icons (coordinate with Section 9 fix)
7. Issue 2 - use hoisted functions from Section 11 fix (after Section 11 is done)
8. Issue 1 - split renderFolders() into sub-renderers (largest change, do last)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 1, preserve the `renderSeq`/`isStale` mechanism in the refactored
   coordinator and all sub-render functions.
3. For Issue 1, preserve the chunked rendering with `requestAnimationFrame` in
   `renderBarcodeGrid()`.
4. For Issue 2, complete Fix-UIForms-Section Issue 2 first.
5. For Issue 3, coordinate with Fix-InterfaceTabs-Section Issue 6.

---

## Commit Message

```
Fix main renderer section issues from code review
```

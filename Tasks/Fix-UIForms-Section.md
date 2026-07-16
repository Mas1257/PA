# Task: Fix UI Forms Section Issues

## Context

Section reviewed:

```
// SECTION: UI Forms - Folder and Barcode Editing  (lines 14092-14863)
```

This section contains folder creation, barcode creation/editing, move modals,
and format change modals. Overall quality is better than Sections 8-10.
The main concerns are duplicated cleanup logic and nested function complexity.

---

## Issues

### Issue 1 - `restoreDisplayAndLayout()` Defined Twice

**Severity:** Medium - DRY violation, divergence risk.

**Location:**
- Inside `showFolderForm()`, approximately line 14140.
- Inside `showBarcodeForm()`, approximately line 14807.

**Problem:**

Both functions are nearly identical:

```javascript
// In showFolderForm:
function restoreDisplayAndLayout() {
    UI.formWrapper.element.innerHTML = '';
    UI.formWrapper.element.style.display = 'none';
    folderDisplay.style.display = 'flex';
    footerLeft.style.visibility = '';
}

// In showBarcodeForm (same + height restore):
function restoreDisplayAndLayout() {
    UI.formWrapper.element.innerHTML = '';
    UI.formWrapper.element.style.display = 'none';
    UI.formWrapper.element.style.flex = '0 0 auto';
    UI.formWrapper.element.style.overflow = 'visible';
    folderDisplay.style.display = 'flex';
    UI.formWrapper.element.style.flexDirection = 'column';
    UI.panel.element.style.height = prevPanelHeight || '420px';
    footerLeft.style.visibility = '';
}
```

If one is updated (e.g. to add a new style reset), the other is silently missed.

**Fix:**

Extract a shared top-level function with an optional height parameter:

```javascript
function restoreFormLayout(options = {}) {
    UI.formWrapper.element.innerHTML = '';
    UI.formWrapper.element.style.display = 'none';
    UI.formWrapper.element.style.flex = '0 0 auto';
    UI.formWrapper.element.style.overflow = 'visible';
    UI.formWrapper.element.style.flexDirection = 'column';
    folderDisplay.style.display = 'flex';
    footerLeft.style.visibility = '';
    if (options.restoreHeight) {
        UI.panel.element.style.height = options.restoreHeight;
    }
}
```

Replace both inner `restoreDisplayAndLayout()` definitions with calls to
`restoreFormLayout()`. Pass `{ restoreHeight: prevPanelHeight || '420px' }` from
`showBarcodeForm()`.

---

### Issue 2 - Eight Nested Functions Inside `showBarcodeForm()`

**Severity:** Medium - reduces readability and prevents reuse.

**Location:** `showBarcodeForm()`, starting at line 14479.

**Problem:**

The following functions are defined inside `showBarcodeForm()` but do not
require closure access to any local variable that cannot be passed as a
parameter:

- `createBarcodeFormRow(...controls)` - generic layout helper
- `estimatePreviewModules(fmt, len)` - pure math function
- `computePreviewBarWidth(fmt, len, targetWidthPx)` - pure math function
- `getPreviewData(rawValue, rawFormat)` - pure data function
- `getPixelHeight(value)` - pure utility
- `isLikelyURL(val)` - pure utility
- `updateFormatOptionsForURL(val)` - depends on `formatSelect` (pass as param)
- `renderPreview()` - depends on several form elements (pass as params)

**Fix:**

Hoist all eight functions to top-level scope. Pass required DOM references
as parameters where needed:

```javascript
function estimatePreviewModules(fmt, len) { ... }  // pure, no changes
function computePreviewBarWidth(fmt, len, targetWidthPx) { ... }  // pure
function isLikelyURL(val) { ... }  // pure
function getPixelHeight(value) { ... }  // pure
function createBarcodeFormRow(...controls) { ... }  // generic utility

function updateFormatOptionsForURL(formatSelect, val) { ... }  // pass select
function renderPreview(valueInput, formatSelect, preview, qrPreview, previewWrapper) { ... }
function adjustBarcodeFormPanelHeight(formWrapper, form, prevHeight) { ... }
```

---

### Issue 3 - `validateBarcodeValue()` Missing Formats

**Severity:** Medium - incomplete validation for supported formats.

**Location:** `validateBarcodeValue()`, line 14175.

**Problem:**

The ZPL generation section (Section 6) handles formats `B00`, `LPN`, `X00`,
and `2D`. These formats are not listed in `validateBarcodeValue()`, so they
fall through to the `default` case which returns `true` for any non-empty value.

This is not wrong (the default accepts them), but it is inconsistent:
`validateBarcodeValue()` does not document that these formats exist and are
intentionally accepted by the default case.

**Fix:**

Add explicit cases for all supported formats with appropriate validation rules:

```javascript
case 'B00':
case 'LPN':
case 'X00':
    return /^[A-Z0-9]{8,20}$/i.test(value);
case '2D':
    return value.length > 0;
```

If the intent is that the default accepts all other formats, add a comment
documenting this:

```javascript
default:
    // Accepts CODE128 and any format not explicitly validated above.
    return value.length > 0;
```

---

### Issue 4 - Panel Height Mutation Conflicts With Resize Logic

**Severity:** Low - race condition between form and resize handler.

**Location:** Start and end of `showBarcodeForm()`.

**Problem:**

```javascript
const prevPanelHeight = UI.panel.element.style.height; // snapshot
UI.panel.element.style.height = 'auto';               // mutate to auto

// ... user resizes panel here (Section 8 saves new height) ...

cancelBtn.addEventListener('click', () => {
    restoreDisplayAndLayout(); // restores prevPanelHeight (the PRE-RESIZE value)
});
```

If the user resizes the panel while the barcode form is open, `prevPanelHeight`
holds the pre-resize height. When the form is cancelled, the panel snaps back
to the old size rather than the user's chosen size.

**Fix:**

Instead of snapshotting `style.height` at form open time, restore the panel
to a sensible default (e.g. `420px`) or re-read the saved panel size from
storage:

```javascript
function restoreFormLayout(options = {}) {
    ...
    const savedSize = StorageService.gmGet(STORAGE_KEYS.PANEL_SIZE, null);
    UI.panel.element.style.height = (savedSize?.height || 420) + 'px';
}
```

---

### Issue 5 - `setTimeout(0)` Should Be `requestAnimationFrame`

**Severity:** Low - layout timing.

**Location:** `adjustBarcodeFormPanelHeight()` inside `showBarcodeForm()`.

**Problem:**

```javascript
function adjustBarcodeFormPanelHeight() {
    setTimeout(() => {
        // DOM measurement
    }, 0);
}
```

`setTimeout(0)` defers to the next event loop tick but does not guarantee
the browser has completed layout. `requestAnimationFrame` is the correct
API for DOM measurements that depend on layout being complete.

**Fix:**

```javascript
function adjustBarcodeFormPanelHeight() {
    requestAnimationFrame(() => {
        // DOM measurement
    });
}
```

---

## Execution Order

1. Issue 5 - replace setTimeout(0) with requestAnimationFrame (zero risk)
2. Issue 3 - add missing format cases to validateBarcodeValue (zero risk)
3. Issue 1 - extract shared restoreFormLayout() (low risk, verify both forms)
4. Issue 4 - fix height restore to use saved storage value (medium risk)
5. Issue 2 - hoist nested functions to top level (medium risk, verify preview)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 2, verify that each hoisted function does not silently capture
   any closure variable before extracting it.
3. For Issue 1, test both folder creation and barcode creation/editing after
   the shared function is introduced.
4. For Issue 4, verify that restoring from STORAGE_KEYS.PANEL_SIZE produces
   the correct panel height after form close.

---

## Commit Message

```
Fix UI forms section issues from code review
```

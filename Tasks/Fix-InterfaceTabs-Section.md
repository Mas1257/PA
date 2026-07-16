# Task: Fix Interface Tabs Section Issues

## Context

Section reviewed:

```
// SECTION: Interface Tabs  (lines 9144-9830)
```

This section contains the continuation of `createSettingsPanel()` from Section 8,
the search system (four search UIs), and `refreshPanelAfterDataMutation()`.

---

## Issues

### Issue 1 - Section Boundary Falls Inside a Function Body

**Severity:** Medium - organizational problem that makes navigation misleading.

**Location:** Start of Section 9, line 9144.

**Problem:**

`createSettingsPanel()` begins in Section 8 and ends in Section 9. The section
marker is placed in the middle of a function body. Reading either section in
isolation gives an incomplete picture of the function.

**Fix:**

Move the section boundary so it falls between complete function definitions.
Either move `createSettingsPanel()` entirely into Section 8 (preferred, since
that is where its DOM construction begins), or split it into two named functions
(`createSettingsPanel_infrastructure()` and `createSettingsPanel_tabs()`).

---

### Issue 2 - Three Nearly Identical Search UI Functions

**Severity:** Medium - DRY violation, ~150 lines of duplicated logic.

**Location:** `openBarcodeSearchUI()` line 9638, `openBookmarkSearchUI()` line 9681,
`openNoteSearchUI()` line 9708.

**Problem:**

All three functions share the same structure:

```javascript
searchInput = document.createElement('input');
searchInput.type = 'text';
searchInput.placeholder = 'Search X...';
searchInput.className = 'bm-input';
searchInput.style.margin = '0';
searchInput.style.width = '100%';
searchInput.value = xSearchQuery;
showSearchHost(searchInput);
searchInput.addEventListener('input', () => { xQuery = ...; renderX(); });
searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSearchUI(); renderX(); }
});
```

Only the placeholder text, query variable, and render callback differ.

**Fix:**

Extract a shared factory:

```javascript
function openSearchUI({ placeholder, getQuery, setQuery, onRender, shouldFocus = true }) {
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = placeholder;
    searchInput.className = 'bm-input';
    searchInput.value = getQuery();
    showSearchHost(searchInput);
    if (shouldFocus) { searchInput.focus(); searchInput.select(); }
    searchInput.addEventListener('input', () => { setQuery(searchInput.value.trim()); onRender(); });
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeSearchUI(); onRender(); }
    });
}
```

Replace the three functions with calls to `openSearchUI(config)`.

---

### Issue 3 - Search Result Highlighting Uses Fragile Text Matching

**Severity:** Medium - can highlight wrong element when names collide.

**Location:** Inside `renderBarcodeSearchResults()`, the barcode click handler.

**Problem:**

```javascript
div.onclick = async (e) => {
    ...
    setTimeout(() => {
        const barcodeElems = UI.panel.element.querySelectorAll('.bm-barcode-item');
        for (const el of barcodeElems) {
            const nameElem = el.querySelector('span,div');
            if (nameElem && nameElem.textContent.trim() === (b.name || '').trim()) {
                el.style.background = '#ffe082'; // highlights first name match
```

If two barcodes share the same name, the first DOM element is always highlighted
regardless of which one was clicked.

**Fix:**

Add a `data-barcode-id` attribute to each rendered barcode element:

```javascript
div.dataset.barcodeId = b.id;
```

Then use the ID for precise targeting:

```javascript
const target = UI.panel.element.querySelector(`[data-barcode-id="${b.id}"]`);
if (target) {
    target.style.background = '#ffe082';
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { target.style.background = ''; }, 2000);
}
```

---

### Issue 4 - `refreshPanelAfterDataMutation()` Has Eight typeof Guards

**Severity:** Medium - indicates hidden ordering dependencies.

**Location:** `refreshPanelAfterDataMutation()` line 9747.

**Problem:**

```javascript
if (typeof selectedBarcodeIds !== 'undefined' && selectedBarcodeIds && ...)
if (typeof selectedBookmarkIds !== 'undefined' && selectedBookmarkIds && ...)
if (typeof UI.formWrapper.element !== 'undefined' && UI.formWrapper.element)
if (typeof folderDisplay !== 'undefined' && folderDisplay)
if (typeof bookmarkFormWrapper !== 'undefined' && bookmarkFormWrapper)
if (typeof bookmarkDisplay !== 'undefined' && bookmarkDisplay)
if (typeof noteFormWrapper !== 'undefined' && noteFormWrapper)
if (typeof noteDisplay !== 'undefined' && noteDisplay)
```

Eight guards suggest this function can be called before these variables are
initialized. This creates invisible ordering dependencies: the function is unsafe
to call during early initialization even though nothing prevents it.

**Fix:**

Document explicitly which initialization phase must complete before this function
is safe to call. Add a guard at the top:

```javascript
function refreshPanelAfterDataMutation() {
    if (!UI.initialized) {
        console.warn('[PA] refreshPanelAfterDataMutation called before UI init');
        return;
    }
    // safe to use all UI variables below
    selectedBarcodeIds.clear();
    ...
}
```

Then replace the eight individual guards with the single initialization check.

---

### Issue 5 - Element Existence Check via Inline Style Selector

**Severity:** Low - brittle, will break if inline styles are migrated to classes.

**Location:** End of Section 9, topControls insertion guard.

**Problem:**

```javascript
if (!UI.panel.element.querySelector(
    'div[style*="display: flex"][style*="flex-direction: row"]'
)) {
    UI.panel.element.insertBefore(topControls, UI.panel.element.firstChild);
}
```

This selector matches a specific inline style string. If Section 8 migrates to
CSS classes (Fix-UIShell-Section Issue 1), this selector will never match and
`topControls` will be inserted on every call.

**Fix:**

Assign a stable ID or class to `topControls` and check for that instead:

```javascript
topControls.id = 'pa-top-controls';
if (!UI.panel.element.querySelector('#pa-top-controls')) {
    UI.panel.element.insertBefore(topControls, UI.panel.element.firstChild);
}
```

---

### Issue 6 - Inline SVG in `renderBarcodeSearchResults()`

**Severity:** Low - maintainability concern.

**Location:** Inside `renderBarcodeSearchResults()`.

**Problem:**

Folder and barcode SVG icons are embedded as template literals inside the render
function. The same SVG icons are likely defined elsewhere in the codebase too.

**Fix:**

Extract to named icon factory functions:

```javascript
function createFolderIconSvg() { return `<svg ...folder svg...</svg>`; }
function createBarcodeIconSvg() { return `<svg ...barcode svg...</svg>`; }
```

Place them in a shared UI utilities section so they can be reused without
duplication.

---

## Execution Order

1. Issue 5 - assign stable ID to topControls (zero risk)
2. Issue 6 - extract SVG icon functions (zero risk)
3. Issue 3 - replace text match with data-barcode-id (low risk)
4. Issue 2 - consolidate three search UIs into one factory (medium risk)
5. Issue 4 - add UI.initialized guard to refreshPanelAfterDataMutation
6. Issue 1 - resolve section boundary / createSettingsPanel split (do last)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 3, verify that `b.id` is reliably set on all barcodes before
   using it as a data attribute.
3. For Issue 2, verify all three search UIs work correctly after consolidation
   by testing each tab's search feature.
4. For Issue 4, define what `UI.initialized` means and ensure it is set at
   the correct point in the bootstrap sequence.

---

## Commit Message

```
Fix interface tabs section issues from code review
```

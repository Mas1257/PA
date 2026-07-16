# Task: Fix UI Shell Issues

## Context

Section reviewed:

```
// SECTION: UI Shell - Floating Button, Panel, Header, Search  (lines 8351-9143)
```

This section builds the main visible overlay: floating button, panel, header,
resize handle, modal observer, and settings panel. Two high-severity issues
require priority attention before other fixes.

---

## Issues

### Issue 1 - Inline Styles on Every DOM Element

**Severity:** High - major maintainability and theming problem.

**Location:** Throughout the entire section, starting at line 8351.

**Problem:**

Every DOM element receives styles via `Object.assign(element.style, {...})`:

```javascript
Object.assign(floatingContainer.style, {
    position: 'fixed', top: '70px', right: '15px',
    zIndex: '9999', display: 'flex', flexDirection: 'column',
    alignItems: 'flex-start', gap: '6px', fontFamily: 'sans-serif'
});
Object.assign(floatingButton.style, {
    width: '34px', height: '34px', backgroundColor: '#81c784',
    borderRadius: '50%', ...
});
```

No CSS classes are used. All visual properties are hardcoded in JavaScript.
This makes theming, overriding, and maintaining visual consistency extremely
difficult. Changing a color or spacing requires finding every Object.assign call.

**Fix:**

Introduce a stylesheet injected into the page head. Move all visual properties
to CSS classes. Replace `Object.assign(element.style, {...})` calls with
`element.className = 'pa-floating-container'` etc.

The existing `bm-panel`, `bm-modal`, `bm-button` class names suggest this was
the intended approach. Extend it to cover all elements in this section.

This is the largest refactor in the section but enables all future UI changes
to be made in one place.

---

### Issue 2 - Reset Handler Performs Direct Storage Operations

**Severity:** High - worst data/UI coupling in the codebase.

**Location:** `resetBtn.onclick` inside `createSettingsPanel()`.

**Problem:**

```javascript
resetBtn.onclick = function () {
    bmConfirm('Are you sure?', async (result) => {
        if (result) {
            gmSet(STORAGE_KEYS.FOLDERS, []);
            gmSet(STORAGE_KEYS.BARCODES, []);
            gmSet(STORAGE_KEYS.SUBFOLDERS, []);
            setFoldersCache([]);
            setBarcodesCache([]);
            gmSet(BOOKMARKS_KEY, []);
            gmSet(BOOKMARK_FOLDERS_KEY, []);
            gmSet(BOOKMARK_SUBFOLDERS_KEY, []);
            NoteService.saveNotes([]);
            NoteService.saveNoteFolders([]);
            saveTasks([]);
            saveTodoProjects([]);
            gmSet(WELLNESS_SETTINGS_KEY, null);
            gmSet(PRINT_SERVER_OVERRIDE_KEY, '');
            gmSet(PRINT_LOG_KEY, []);
            ...
        }
    });
};
```

A UI event handler performs 12+ direct storage operations with no service layer,
no try/catch, and no rollback if any operation fails partway through.

**Fix:**

Extract a `resetAllData()` function in the appropriate data section or bootstrap:

```javascript
async function resetAllData() {
    try {
        gmSet(STORAGE_KEYS.FOLDERS, []);
        gmSet(STORAGE_KEYS.BARCODES, []);
        // ... all resets ...
        return { success: true };
    } catch (err) {
        console.error('[resetAllData] failed:', err);
        return { success: false, error: err };
    }
}
```

The UI handler calls only `resetAllData()` and handles the result.

---

### Issue 3 - exportBtn Self-Redefines Its Own onclick

**Severity:** Medium - confusing two-state button pattern.

**Location:** `originalExportClick` inside `createSettingsPanel()`.

**Problem:**

```javascript
exportBtn.onclick = originalExportClick;
// Inside originalExportClick:
exportBtn.onclick = function(ev) {       // first click changes behavior
    ...
    exportBtn.onclick = originalExportClick; // second click resets it
};
```

**Fix:**

Replace with a simple state variable:

```javascript
let exportReady = false;
let exportUrl = null;

exportBtn.onclick = async function() {
    if (!exportReady) {
        await generateExport(); // sets exportReady = true, exportUrl = url
    } else {
        triggerDownload(exportUrl);
        resetExportState();
    }
};
```

This makes the two states explicit and easier to follow.

---

### Issue 4 - `PA_GLOBAL_TIMER` Bypasses StorageEngine

**Severity:** Medium - direct localStorage access with hardcoded key.

**Location:** Lines 8430-8434.

**Problem:**

```javascript
const savedTimer = localStorage.getItem('PA_GLOBAL_TIMER');
...
localStorage.removeItem('PA_GLOBAL_TIMER');
```

Bypasses `StorageEngine` and uses a raw string key outside `STORAGE_KEYS`.

**Fix:**

Add to `STORAGE_KEYS`:

```javascript
GLOBAL_TIMER: 'PA_GLOBAL_TIMER',
```

Route through StorageEngine. Use `gmGet`/`gmSet` with the registered key.

---

### Issue 5 - `app:ui:hidden_tabs` Hardcoded Storage Key

**Severity:** Low - same cross-cutting pattern as Sections 5, 6, 7.

**Location:** `applyTabVisibility()` and `updateTabVisibility()`.

**Fix:** Add `UI_HIDDEN_TABS: 'app:ui:hidden_tabs'` to `STORAGE_KEYS`.

---

### Issue 6 - `UI.panel.show()` Called During Panel Construction

**Severity:** Low - confusing pattern that may cause a flash of visible panel.

**Location:** Line 8468.

**Problem:**

```javascript
UI.panel.element.style.display = 'none'; // set hidden
...
UI.panel.show(); // "ensure flex" - this makes it visible!
```

If `UI.panel.show()` sets `display: flex`, the panel becomes visible momentarily
during page load before being hidden again.

**Fix:**

Set the flex display directly without calling show():

```javascript
UI.panel.element.style.display = 'none'; // stays hidden
UI.panel.element.style.flexDirection = 'column'; // set flex layout without showing
```

---

### Issue 7 - Unnecessary try/catch in `formatWorkspaceDate()`

**Severity:** Low - misleading defensive code.

**Location:** `formatWorkspaceDate()`.

**Problem:**

```javascript
try {
    return new Date(value).toLocaleString();
} catch {
    return String(value);
}
```

`new Date()` never throws. The catch block is never reached.

**Fix:**

```javascript
function formatWorkspaceDate(value) {
    if (!value) return 'Never';
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}
```

---

### Issue 8 - MutationObserver on Entire `document.body`

**Severity:** Low - potential performance overhead on complex pages.

**Location:** `UI.modalObserver.observe(document.body, ...)`.

**Problem:**

Every DOM mutation anywhere on the page triggers the observer callback.
On content-heavy pages, this may fire hundreds of times per second.

**Fix:**

Scope the observer to `UI.panel.element` instead of `document.body`:

```javascript
UI.modalObserver.observe(UI.panel.element, { childList: true, subtree: true });
```

Verify that all modals (including barcode zoom modal) are appended inside
`UI.panel.element`. If any modal is appended to `document.body` directly,
move it inside the panel or handle it separately.

---

## Execution Order

1. Issue 5 - add hidden_tabs to STORAGE_KEYS (zero risk)
2. Issue 4 - add GLOBAL_TIMER to STORAGE_KEYS and route through StorageEngine
3. Issue 7 - fix formatWorkspaceDate (zero risk)
4. Issue 6 - fix panel construction show() call (low risk)
5. Issue 8 - scope MutationObserver to panel element (verify modal detection)
6. Issue 3 - replace self-redefining onclick with state variable
7. Issue 2 - extract resetAllData() function (medium risk)
8. Issue 1 - migrate inline styles to CSS classes (largest change, do last)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 8, verify all modal types are children of `UI.panel.element` before
   scoping the observer.
3. For Issue 1, inject styles via a `<style>` tag in `document.head` and verify
   the visual result matches the current appearance exactly before removing
   inline style assignments.
4. For Issue 2, test Reset All Data end-to-end after extracting `resetAllData()`.

---

## Commit Message

```
Fix UI shell issues from code review
```

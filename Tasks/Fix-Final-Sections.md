# Task: Fix Barcode Detail, Bootstrap, and Footer Sections

## Context

Sections reviewed:

```
// SECTION: Barcode Detail Modal and Print Preview  (lines 16444-17624, 1,181 lines)
// SECTION: Runtime Synchronization and Bootstrap   (lines 17625-17672, 48 lines)
// SECTION: Footer, Action Dropdown, and About Modal (lines 17673-19734, 2,062 lines)
```

Section 15 (Bootstrap) is the cleanest section in the codebase. Issues there
are already captured in Fix-Storage-Section (Issue 3) and are not repeated here.

---

## Section 14 Issues

### Issue 1 - Dead Code: `useModalAutoClose` Is Always False

**Severity:** Medium - two functions defined that never execute any logic.

**Location:** `showBigBarcodeModal()`, approximately line 16480.

**Problem:**

```javascript
const useModalAutoClose = false; // constant, never changed

const scheduleAutoClose = () => {
    if (!useModalAutoClose) return; // always returns immediately
    // ... dead code below
};

const resetAutoClose = () => {
    if (!useModalAutoClose) { // always true
        clearAutoClose();
        return;
    }
    // ... dead code below
};
```

`scheduleAutoClose()` and `resetAutoClose()` are called in several places but
never do anything. The modal auto-close feature was disabled by setting the
constant to `false` but the infrastructure was not removed.

**Fix:**

Remove `useModalAutoClose`, `scheduleAutoClose()`, and `resetAutoClose()`.
Replace all calls to `scheduleAutoClose()` and `resetAutoClose()` with
calls to `clearAutoClose()` directly, or remove them if they serve no purpose.

---

### Issue 2 - `closeModal._escHandler` Attaches State to a Function Object

**Severity:** Low - same anti-pattern as Section 13's DOM property attachment.

**Location:** `showBigBarcodeModal()`.

**Problem:**

```javascript
closeModal._escHandler = escHandler;
document.addEventListener('keydown', escHandler);

// Later in closeModal:
if (closeModal._escHandler) {
    document.removeEventListener('keydown', closeModal._escHandler);
    closeModal._escHandler = null;
}
```

State is stored as a property on the `closeModal` function object. This works
but is unconventional and creates an implicit dependency between two closures.

**Fix:**

Use a local variable in the outer closure scope:

```javascript
let activeEscHandler = null;

const closeModal = () => {
    clearAutoClose();
    modal.remove();
    localStorage.removeItem(STORAGE_KEYS.BARCODE_MODAL);
    if (activeEscHandler) {
        document.removeEventListener('keydown', activeEscHandler);
        activeEscHandler = null;
    }
};

activeEscHandler = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
};
document.addEventListener('keydown', activeEscHandler);
```

---

### Issue 3 - `localStorage.removeItem` Bypasses StorageEngine

**Severity:** Low - same issue as Sections 7 and 13.

**Location:** Inside `closeModal()` in `showBigBarcodeModal()`.

**Fix:** Use `gmSet(STORAGE_KEYS.BARCODE_MODAL, null)` to route through
StorageEngine and maintain dual-write consistency.

---

### Issue 4 - `showBigBarcodeModal()` Is 1,181 Lines

**Severity:** Medium - second largest single function in the codebase.

**Location:** Line 16450.

**Problem:**

The function handles: QR code preview rendering, linear barcode rendering,
text mode rendering, action buttons (copy, send, print, save as image),
auto-close infrastructure, keyboard navigation, and footer countdown display.

**Fix:**

Extract rendering to separate factory functions:

```javascript
function createQrPreviewElement(value, size) { ... }
function createLinearBarcodeElement(value, format) { ... }
function createTextPreviewElement(value) { ... }
function createBarcodeActionBar(value, format, options) { ... }
```

`showBigBarcodeModal()` becomes a coordinator that selects and assembles
these components rather than implementing all of them inline.

---

## Section 15 Issues

No new issues. The only concern (StorageService.registerRuntimeSync coupling)
is documented in Tasks/Fix-Storage-Section.md Issue 3.

The `localStorage.getItem` in DOMContentLoaded is a cross-cutting issue
covered by the global directive to route all storage through StorageEngine.

---

## Section 16 Issues

### Issue 5 - Folder SVG Icon Defined for the Fifth Time

**Severity:** Medium - the most repeated duplication in the entire codebase.

**Location:** Start of Section 16, `folderIconSvg` and `barcodeIconSvg` constants.

**Problem:**

`folderIconSvg` appears in Section 16 as the fifth definition of this icon.
`barcodeIconSvg` appears as the third definition.

Prior occurrences:
- Folder icon: Sections 9, 13 (x2 variants), 16
- Barcode icon: Section 9, Section 16

**Fix:**

This is the primary motivation for the shared icon factory described in
Fix-MainRenderer-Section Issue 3 and Fix-InterfaceTabs-Section Issue 6.

Once `createFolderIconSvg()` and `createBarcodeIconSvg()` exist as top-level
functions, replace all five/three occurrences with calls to those functions.

---

### Issue 6 - Dropdown Buttons Use `onclick` Instead of `addEventListener`

**Severity:** Low - inconsistency with the rest of the codebase.

**Location:** Action dropdown button handlers in Section 16.

**Problem:**

```javascript
addFolderBtn.onclick = function(e) { ... };
addBarcodeBtn.onclick = function(e) { ... };
printTextBtn.onclick = function(e) { ... };
addBookmarkBtn.onclick = function(e) { ... };
addNoteBtn.onclick = function(e) { ... };
```

The rest of the codebase uses `addEventListener('click', ...)`. Using `onclick`
assignment is not wrong but creates an inconsistency that can surprise developers.

**Fix:**

Replace all `element.onclick = function()` assignments with
`element.addEventListener('click', function())`.

---

### Issue 7 - Section 16 Contains Multiple Unrelated Subsystems

**Severity:** Medium - organizational, same pattern as Section 5.

**Location:** Lines 17673-19734.

**Problem:**

The 2,062-line "Footer, Action Dropdown, and About Modal" section contains:
- Action dropdown menu
- Footer construction (three-column layout)
- Footer badge management
- Tab badge system
- Tampermonkey GM_registerMenuCommand entries
- Global timer UI updates
- About modal
- Final `initialize()` call

**Fix:**

Split into focused sections:

```
// SECTION: Action Dropdown
// SECTION: Footer and Status Bar
// SECTION: Application Entry Point (contains only initialize() call)
```

The `initialize()` call should be the last thing in the file.

---

## Execution Order

**Section 14:**
1. Issue 1 - remove dead auto-close code (targeted, verify modal still closes)
2. Issue 2 - replace function property with closure variable (low risk)
3. Issue 3 - replace localStorage.removeItem (coordinate with Section 7 fix)
4. Issue 4 - extract rendering factories (medium refactor, do last)

**Section 16:**
5. Issue 6 - replace onclick with addEventListener (zero risk)
6. Issue 5 - replace inline SVGs with shared factory (after factory is created)
7. Issue 7 - section split (organizational only, no logic changes)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 1, verify the barcode modal still closes when Escape is pressed
   and when the close button is clicked after removing the dead code.
3. For Issue 4, verify all three preview types (QR, linear, text) render
   identically after extraction.
4. For Issues 5 and 6 in Section 16, these are straightforward; verify the
   dropdown buttons still open their respective forms after the changes.

---

## Commit Message

```
Fix barcode detail, bootstrap, and footer section issues from code review
```

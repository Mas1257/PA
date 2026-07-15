# Task: Fix UI State Section Issues

## Context

Section reviewed:

```
// SECTION: UI State, Modal Lifetime, and Panel Auto-Close  (lines 8170-8350)
```

This is the smallest and cleanest section in the codebase (181 lines).
Issues are minor but one carries a real storage consistency risk.

---

## Issues

### Issue 1 - `localStorage.removeItem()` Bypasses StorageEngine

**Severity:** Medium — breaks the storage abstraction contract.

**Location:** `UI.closeAllBmModals()`.

**Problem:**

```javascript
localStorage.removeItem(STORAGE_KEYS.BARCODE_MODAL);
```

`StorageEngine` performs dual-write to both GM storage and localStorage.
This direct `localStorage.removeItem()` call removes only the localStorage
copy, leaving the GM storage value intact. On the next read via `gmGet()`,
the GM value will be returned as if the key was never cleared.

**Fix:**

Replace with a proper storage clear through the existing abstraction:

```javascript
gmSet(STORAGE_KEYS.BARCODE_MODAL, null);
```

Or if StorageEngine exposes a remove method, use that instead.

---

### Issue 2 - Two Hardcoded Storage Keys

**Severity:** Low — same cross-cutting pattern as Sections 5 and 6.

**Location:** `getPanelAutoCloseMs()` and `setPanelAutoCloseMs()`.

**Problem:**

```javascript
gmGet('app:ui:panel_auto_close_ms', 15000);
gmSet('app:ui:panel_auto_close_ms', ms);
```

**Fix:** Add to `STORAGE_KEYS`:

```javascript
UI_PANEL_AUTO_CLOSE_MS: 'app:ui:panel_auto_close_ms',
```

Replace both raw string literals with `STORAGE_KEYS.UI_PANEL_AUTO_CLOSE_MS`.

---

### Issue 3 - Magic Number in `getModalAutoCloseMs()`

**Severity:** Low — unnamed constant reduces readability.

**Location:** `getModalAutoCloseMs()`.

**Problem:**

```javascript
function getModalAutoCloseMs() {
    return getPanelAutoCloseMs() + 10000;
}
```

**Fix:** Introduce a named constant:

```javascript
const MODAL_EXTRA_CLOSE_DELAY_MS = 10000;

function getModalAutoCloseMs() {
    return getPanelAutoCloseMs() + MODAL_EXTRA_CLOSE_DELAY_MS;
}
```

---

### Issue 4 - Hidden Forward References to External Variables

**Severity:** Low — implicit dependency on variables defined in later sections.

**Location:** `UI.schedulePanelAutoClose()` and `UI.isPanelListViewActive()`.

**Problem:**

```javascript
if (typeof noteFormWrapper !== 'undefined' && noteFormWrapper &&
    noteFormWrapper.dataset.maximized === 'true') { ... }

if (!UI.formWrapper.element || !folderDisplay) return true;
```

`noteFormWrapper` and `folderDisplay` are defined in later sections. The
`typeof` guard prevents a runtime error but hides the dependency. If these
variables are renamed or removed in a refactor, this code silently changes
behavior rather than throwing an error.

**Fix:** Document the dependency explicitly in a comment above each reference,
or resolve it by passing the required state as a parameter or through a shared
state accessor.

---

## Execution Order

1. Issue 1 - replace localStorage.removeItem (targeted, low risk)
2. Issue 2 - add keys to STORAGE_KEYS (zero risk)
3. Issue 3 - extract named constant (zero risk)
4. Issue 4 - document or resolve forward references (documentation change)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 1, verify that after the fix the barcode zoom modal is correctly
   cleared on both GM storage and localStorage.

---

## Commit Message

```
Fix UI state section issues from code review
```

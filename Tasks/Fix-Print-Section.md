# Task: Fix Print Pipeline Issues

## Context

Section reviewed:

```
// SECTION: Print Pipeline - Configuration, Logs, ZPL, Bridge  (lines 5981-8169)
```

Print logic is well-structured with a clear two-path architecture (bridge + browser
with fallback). Issues are primarily misplaced utilities and targeted code problems.

---

## Issues

### Issue 1 - Context Menu Functions Do Not Belong Here

**Severity:** Medium — cohesion violation, creates implicit load-order dependency.

**Location:** `closeAllContextMenus()` line 7167, `buildContextMenu()` line 7173,
`openContextMenuAtEvent()` line 7184.

**Problem:** Generic UI utilities used throughout the application placed inside
the print section. Any section calling these must load after Section 6.

**Fix:** Move to UI Shell section or a Platform UI Utilities section loaded before
all feature sections.

---

### Issue 2 - Clipboard and Keyboard Utilities Do Not Belong Here

**Severity:** Medium — general-purpose utilities with no relation to print.

**Location:** `copyToClipboard()` line 7219, `sendClipboardToPage()` line 7308,
`sendValueToPage()` line 7286, `getTargetElement()` line 7260,
`getSelectedTextFromDocument()` line 7268, `sendKeyToTarget()` line 7252,
`isInsideTightHitbox()` line 7295.

**Fix:** Move to UI Shell or Platform UI Utilities. No logic changes required.

---

### Issue 3 - `printViaBrowser()` Uses `document.write()` and Inline CSS

**Severity:** Medium — deprecated API and maintainability concern.

**Location:** `printViaBrowser()` line 6626, approximately 210 lines.

**Problem:** Uses deprecated `doc.write()` to inject an entire HTML document
with multi-line conditional CSS in a template string. Difficult to maintain.

**Fix:** Replace `doc.write()` with programmatic document construction. Extract
a `buildPrintStyles(compact)` pure function that returns the CSS string separately.

---

### Issue 4 - `getCookie()` Defined Inside `sendPrintRequest()`

**Severity:** Low — nested utility function with no closure dependency.

**Location:** Inside `sendPrintRequest()` at line 6845.

**Fix:** Hoist `getCookie()` to top-level scope before `sendPrintRequest()`.

---

### Issue 5 - `isQrBridgeAvailable()` Has No Timeout

**Severity:** Medium — can block print action for 30+ seconds on unreachable host.

**Location:** `isQrBridgeAvailable()` line 6455.

**Problem:** The fetch call has no AbortController. If the bridge server silently
drops packets, the promise hangs for the browser TCP timeout.

**Fix:**

```javascript
const controller = new AbortController();
const timer = setTimeout(() => { controller.abort(); resolve(false); }, 2000);
fetch(url, { method: 'GET', signal: controller.signal })
    .then(r => { clearTimeout(timer); resolve(r.ok); })
    .catch(() => { clearTimeout(timer); resolve(false); });
```

---

### Issue 6 - Print Modals Are UI Code in a Logic Section

**Severity:** Low — organizational.

**Location:** `showTextPrintModal()` line 7884, `showTextEditModal()` line 8053,
`printBarcodeModal()` line 7506.

**Fix:** Move to UI Forms section. No logic changes required.

---

### Issue 7 - `PRINT_LOG_KEY` Is a Hardcoded Storage Key

**Severity:** Low — bypasses STORAGE_KEYS registry.

**Location:** Line 5995: `const PRINT_LOG_KEY = 'bm_print_log';`

**Fix:** Add `PRINT_LOG: 'bm_print_log'` to `STORAGE_KEYS`. Replace local
constant with `STORAGE_KEYS.PRINT_LOG`.

---

## Execution Order

1. Issue 7 - add PRINT_LOG to STORAGE_KEYS (zero risk)
2. Issue 4 - hoist getCookie (zero risk)
3. Issue 5 - add timeout to isQrBridgeAvailable (low risk)
4. Issue 3 - extract buildPrintStyles from printViaBrowser (verify print output)
5. Issue 6 - relocate print modals (no logic change)
6. Issue 1 - relocate context menu functions (verify call sites)
7. Issue 2 - relocate clipboard utilities (verify call sites)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. Read `Knowledge/Platform.md` and `Contracts/Storage.md`.
3. Use current file SHA for all updates.
4. For Issues 1 and 2, search all call sites before moving.
5. For Issue 3, verify print output unchanged after CSS extraction.
6. For Issue 5, test with reachable and unreachable bridge server.

---

## Commit Message

```
Fix print pipeline issues from code review
```

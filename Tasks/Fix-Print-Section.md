# Task: Fix Print Pipeline Issues

## Context

This task was generated from a code review of `Source/Tampermonkey/PA.user.js`.

Section reviewed:

```
// SECTION: Print Pipeline - Configuration, Logs, ZPL, Bridge  (lines 5981–8169)
```

The print pipeline itself is well-architected: two distinct paths (Bridge and
Browser) with proper fallback logic, clean ZPL generators, and a good print log
module. Issues are primarily misplaced utilities and a few implementation gaps.

---

## Issues

### Issue 1 — Context Menu Functions in the Wrong Section

**Severity:** Medium — cohesion violation, these are platform-wide UI utilities.

**Location:** Lines 7167–7252: `closeAllContextMenus`, `buildContextMenu`,
`openContextMenuAtEvent`.

**Problem:**

These three functions are generic UI utilities used across multiple features,
not print-specific functionality. They create and manage context menus for
folders, barcodes, and other items throughout the application.

**Fix:**

Move all three functions to Section 7 (UI State, Modal Lifetime, and Panel
Auto-Close) or to a new "Platform UI Utilities" block at the start of the UI
sections. No logic changes required.

---

### Issue 2 — Clipboard and Keyboard Utilities in the Wrong Section

**Severity:** Medium — cohesion violation, these are platform-wide utilities.

**Location:** Lines 7219–7378: `copyToClipboard`, `sendKeyToTarget`,
`getTargetElement`, `getSelectedTextFromDocument`, `sendValueToPage`,
`isInsideTightHitbox`, `sendClipboardToPage`.

**Problem:**

These functions handle clipboard access, keyboard simulation, and target element
detection. They are used across the application (barcode sending, bookmark
copying, text input) and are not specific to the print pipeline.

`copyToClipboard` calls `showFlash()` directly — same data/UI coupling pattern
found in earlier sections.

**Fix:**

Move to a "Platform UI Utilities" section that loads before all feature sections.
`copyToClipboard` should emit a `CustomEvent` or return a result instead of
calling `showFlash()` directly, consistent with the data/UI decoupling fixes
planned for Sections 2–4.

---

### Issue 3 — `printViaBrowser()` Uses Inline CSS and `document.write()`

**Severity:** Medium — maintainability and compatibility risk.

**Location:** `printViaBrowser()`, lines 6626–6836.

**Problem:**

The function injects a full HTML document into an iframe using `doc.write()`,
which is deprecated and can cause issues in some browser environments.
The print CSS is embedded as a template string inside the function body,
making it difficult to modify without risking logic errors:

```javascript
doc.write(`
    <!DOCTYPE html><html><head>
    <style>
        body { margin: 0; padding: 10px; font-family: Arial, sans-serif; ... }
        .label-page {
            ${compact ? `display: flex; flex-wrap: wrap; ...` : `page-break-after: always; ...`}
        }
        @media print { .label-page { border: none !important; ... } }
    </style>
    ...
`);
```

**Fix:**

Replace `doc.write()` with programmatic DOM construction:

```javascript
const html = iframe.contentDocument || iframe.contentWindow.document;
const style = html.createElement('style');
style.textContent = buildPrintStyles(compact); // extracted pure function
html.head.appendChild(style);
```

Extract `buildPrintStyles(compact)` as a separate pure function that returns
the CSS string. This separates style definition from DOM construction and
makes both independently testable.

---

### Issue 4 — `isQrBridgeAvailable()` Has No Timeout

**Severity:** Medium — potential long hang if the bridge address is misconfigured.

**Location:** `isQrBridgeAvailable()`, lines 6455–6494.

**Problem:**

```javascript
function isQrBridgeAvailable() {
    return new Promise((resolve) => {
        fetch(url, { method: 'GET' })
            .then(r => r.ok ? resolve(true) : resolve(false))
            .catch(() => resolve(false));
        // No timeout — browser default can be 30+ seconds
    });
}
```

If the configured bridge address is unreachable but not immediately refused
(e.g., a valid IP with no service), the fetch will hang for up to 30 seconds
before the browser times out. During this time the print action appears frozen.

**Fix:**

Add an explicit timeout using `AbortController`:

```javascript
function isQrBridgeAvailable() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    return fetch(url, { method: 'GET', signal: controller.signal })
        .then(r => { clearTimeout(timeoutId); return r.ok; })
        .catch(() => { clearTimeout(timeoutId); return false; });
}
```

---

### Issue 5 — `getCookie()` Defined Inside `sendPrintRequest()`

**Severity:** Low — nested function definition reduces clarity.

**Location:** Inside `sendPrintRequest()`, around line 7010.

**Problem:**

```javascript
function sendPrintRequest(params) {
    ...
    function getCookie(c) {  // ← utility function defined inside another function
        const cookies = document.cookie.split(';');
        ...
    }
    ...
}
```

**Fix:**

Move `getCookie()` to the top level of the print section or to the platform
utilities block. It requires no closure over `sendPrintRequest`'s variables.

---

### Issue 6 — Print Modals Are UI Code in a Logic Section

**Severity:** Low — organizational, not a runtime issue.

**Location:**
- `showTextPrintModal()` — ~170 lines, lines 7884–8052
- `showTextEditModal()` — ~170 lines, lines 8053–8169

**Problem:**

Both functions build complex DOM trees with event listeners and append them to
`UI.panel.element`. They are UI code and belong in a UI section, not in the
print pipeline logic section.

**Fix:**

Move both modal functions to the UI section that handles modals and forms
(Section 10: UI Forms). No logic changes required.

---

### Issue 7 — `PRINT_LOG_KEY` Is a Hardcoded String Outside `STORAGE_KEYS`

**Severity:** Low — same pattern as `app:todo:default_project` in Section 5.

**Location:** Near the top of Section 6, `PRINT_LOG_KEY` constant definition.

**Problem:**

```javascript
const PRINT_LOG_KEY = 'bm_print_log'; // ← not in STORAGE_KEYS registry
```

**Fix:**

Add to `STORAGE_KEYS`:

```javascript
PRINT_LOG: 'bm_print_log',
```

Then replace the local constant with `STORAGE_KEYS.PRINT_LOG`.

---

## Execution Order

1. Issue 7 — add `PRINT_LOG` to `STORAGE_KEYS` (isolated, zero risk)
2. Issue 5 — move `getCookie()` to top level (isolated, low risk)
3. Issue 4 — add timeout to `isQrBridgeAvailable()` (targeted, low risk)
4. Issue 1 — relocate context menu functions (no logic change)
5. Issue 2 — relocate clipboard/keyboard utilities (no logic change)
6. Issue 6 — relocate print modals to UI section (no logic change)
7. Issue 3 — replace `doc.write()` with programmatic DOM (medium risk — verify
   print output is identical before and after in both compact and non-compact modes)

---

## Before Making Any Changes

1. Read the current version of `Source/Tampermonkey/PA.user.js`.
2. Read `Knowledge/Platform.md` and `Contracts/Storage.md`.
3. Use the current file SHA for all update operations.
4. For Issue 3, test browser print with QR codes, linear barcodes, and text
   labels in both compact and standard modes before committing.
5. For Issue 4, verify that a correctly configured bridge still connects within
   the 3-second timeout window.

---

## Commit Message

```
Fix print pipeline issues from code review
```

Or one commit per issue with descriptive messages.

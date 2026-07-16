# Task: Fix Import/Export Modals Section Issues

## Context

Section reviewed:

```
// SECTION: Import, Export, Confirmation, and Rename Modals  (lines 14864-15397)
```

This section contains `showImportModal()`, `bmConfirm()`, and `showRenameModal()`.
Overall quality is good. One high-severity bug requires immediate attention.

---

## Issues

### Issue 1 - Bug: `showRenameModal()` Appends Header to Wrong Element

**Severity:** High - causes a visible glitch where header appears directly in
the panel before being moved into the modal.

**Location:** `showRenameModal()`, approximately line 15314.

**Problem:**

```javascript
function showRenameModal(oldName, callback) {
    const modal = document.createElement('div'); // not yet in DOM

    const header = document.createElement('div');
    header.textContent = 'PA';
    ...
    UI.panel.element.appendChild(header); // BUG: appended to panel, not modal
    ...
    modal.appendChild(header);            // moves header from panel into modal
    ...
    UI.panel.element.appendChild(modal);  // modal (now containing header) added
}
```

`appendChild` on an already-attached node moves it. This means for one
rendering frame, `header` is a direct child of `UI.panel.element` before
being moved into `modal`. On slow devices or during forced reflows, this
produces a visible flash of misplaced content.

**Fix:**

Change the first append to target `modal` instead of `UI.panel.element`:

```javascript
modal.appendChild(header); // correct — modal not yet in DOM, no visible glitch
modal.appendChild(input);
modal.appendChild(buttonContainer);
UI.panel.element.appendChild(modal); // only one append to live DOM
```

---

### Issue 2 - `pickFile` and `pickFileAsArrayBuffer` Are Duplicates

**Severity:** Medium - DRY violation, ~30 lines duplicated.

**Location:** Both defined inside `showImportModal()`.

**Problem:**

The two functions are identical except for one line:

```javascript
reader.readAsText(file);         // pickFile
reader.readAsArrayBuffer(file);  // pickFileAsArrayBuffer
```

**Fix:**

Extract a single shared function with a `mode` parameter:

```javascript
function pickFileWithMode(accept, mode, onLoad) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = accept;
    fileInput.style.display = 'none';
    fileInput.onchange = function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (evt) { onLoad(evt.target.result, file); };
        if (mode === 'arraybuffer') reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    };
    document.body.appendChild(fileInput);
    fileInput.click();
    setTimeout(() => fileInput.remove(), 1000);
}
```

Replace the two local closures with calls to `pickFileWithMode`.

---

### Issue 3 - `bmConfirm` Uses Callback Instead of Promise

**Severity:** Medium - all callers use `async` callbacks, Promise would be cleaner.

**Location:** `bmConfirm()`, approximately line 15270.

**Problem:**

```javascript
// Current usage:
bmConfirm('Are you sure?', async (result) => {
    if (result) {
        await doSomething();
    }
});
```

The callback-based API forces an extra closure level. Every caller wraps its
logic in an `async` callback rather than awaiting the result directly.

**Fix:**

Return a Promise from `bmConfirm`:

```javascript
function bmConfirm(message) {
    return new Promise((resolve) => {
        // ... same modal construction ...
        yesButton.addEventListener('click', () => { modal.remove(); resolve(true); });
        noButton.addEventListener('click', () => { modal.remove(); resolve(false); });
        // keyboard: Enter → resolve(true), Escape → resolve(false)
    });
}
```

Update all callers:

```javascript
// After fix:
const ok = await bmConfirm('Are you sure?');
if (ok) {
    await doSomething();
}
```

Note: Search all call sites before changing the signature. Any caller that does
not `await` `bmConfirm` will break silently after this change.

---

### Issue 4 - `showRenameModal` Header Text Is the App Name

**Severity:** Low - misleading UX.

**Location:** `showRenameModal()`, header element.

**Problem:**

```javascript
header.textContent = 'PA'; // app name as modal title
```

The rename modal header says "PA" (the app name) instead of something
descriptive like "Rename".

**Fix:**

```javascript
header.textContent = 'Rename';
```

---

### Issue 5 - Cross-Section Dependencies Not Documented

**Severity:** Low - maintainability.

**Location:** Inside `showImportModal()`.

**Problem:**

`parseTxtText()` and `normalizeBackupPayload()` are called inside this section
but defined in Section 5. No comment indicates where they come from.

**Fix:**

Add inline comments at the call sites:

```javascript
// parseTxtText defined in Section 5: Barcode Data Operations
const values = parseTxtText(raw);

// normalizeBackupPayload defined in Section 5: Barcode Data Operations
const payload = normalizeBackupPayload(jsonData);
```

---

### Issue 6 - Temporary Architecture Comment Left in Code

**Severity:** Low - technical debt marker.

**Location:** Inside `jsonBtn` click handler in `showImportModal()`.

**Problem:**

```javascript
// (Optional fallback for the temporary double-zip architecture)
```

This comment indicates temporary code that was never removed. It is unclear
whether the double-zip fallback is still needed.

**Fix:**

Determine whether the double-zip fallback path is still exercised by any
existing backup files. If not, remove the fallback code and the comment.
If still needed, convert the comment to an explicit TODO with a resolution
condition:

```javascript
// TODO: Remove double-zip fallback once all PA files use single-zip format.
// This handles PA files exported before version X.Y.
```

---

## Execution Order

1. Issue 1 - fix header append bug (targeted, low risk, test rename modal)
2. Issue 4 - fix header text to 'Rename' (zero risk)
3. Issue 5 - add cross-section comments (zero risk)
4. Issue 6 - resolve or document temporary code (requires verification)
5. Issue 2 - extract pickFileWithMode (low risk, test all import paths)
6. Issue 3 - convert bmConfirm to Promise (medium risk, update all callers)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 1, test rename modal visually on a slow device or with forced
   layout to verify the glitch is eliminated.
3. For Issue 3, search all `bmConfirm` call sites before changing the signature.
   Any caller not using `await` will silently break.
4. For Issue 6, check git history or test with old `.pa` files to determine
   if the double-zip fallback is still needed.

---

## Commit Message

```
Fix import/export modals section issues from code review
```

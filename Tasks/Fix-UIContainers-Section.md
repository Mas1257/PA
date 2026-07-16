# Task: Fix UI Containers Section Issues

## Context

Section reviewed:

```
// SECTION: UI Containers and Runtime State  (lines 9831-14091, 4,261 lines)
```

This is the largest section in the codebase. It contains the complete UI
implementation for four features: Bookmarks, Notebook, Todo, and the tab system.

Two issues carry high severity due to security and compatibility risk.

---

## Issues

### Issue 1 - `document.execCommand()` Is Deprecated

**Severity:** High - compatibility risk, may break in future browser versions.

**Location:** `exec()` function inside `showNoteEditor()`, approximately line 10998.

**Problem:**

```javascript
function exec(cmd, value = null) {
    document.execCommand(cmd, false, value);
}
```

This function is called for all rich text formatting operations: bold, italic,
underline, ordered list, unordered list, indent, heading styles, and font size.

`document.execCommand()` has been officially deprecated by the W3C and all major
browsers. It still works in current versions but removal is possible in future
releases.

**Fix:**

Replace `execCommand`-based formatting with direct `Selection` and `Range` API
calls, or introduce a lightweight rich text editing library (e.g. Quill, TipTap,
or ProseMirror) to replace the custom editor implementation.

If a library is not acceptable, use `window.getSelection()` and
`document.createRange()` to apply formatting by wrapping selected content in
appropriate elements rather than relying on `execCommand`.

Note: This is a significant refactor. The note editor toolbar, image insertion,
paste handling, and save logic all depend on the current `execCommand` approach.
Full regression testing of the note editor is required after this change.

---

### Issue 2 - Custom HTML Sanitizer Is a Security Risk

**Severity:** High - custom sanitizers reliably miss edge cases.

**Location:** `sanitizeNoteHtml()`, approximately line 10877.

**Problem:**

```javascript
function sanitizeNoteHtml(html) {
    const allowed = ['b','strong','i','em','u','br','p','ul','ol','li',
                     'h1','h2','h3','blockquote','span','div','img','a'];
    // manual DOM traversal with attribute filtering
}
```

Handwritten HTML sanitizers consistently miss browser-specific attack vectors:
`javascript:` URLs in `href`/`src`, event handler attributes like `onload` and
`onerror` on `img` elements, CSS `expression()` in style attributes, and
namespace-based bypasses.

Notes can contain user-provided content and pasted HTML from external sites.
If any note content is ever rendered without re-sanitizing (e.g. in search
results or print previews), XSS becomes possible.

**Fix:**

Replace `sanitizeNoteHtml()` with DOMPurify:

```javascript
// In the userscript header:
// @require https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js

function sanitizeNoteHtml(html) {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['b','strong','i','em','u','br','p','ul','ol','li',
                       'h1','h2','h3','blockquote','span','div','img','a'],
        ALLOWED_ATTR: ['href','src','alt','class','style','target']
    });
}
```

DOMPurify is the industry standard for client-side HTML sanitization and handles
all known bypass vectors.

---

### Issue 3 - `showTaskDetailsModal()` Is ~600 Lines in a Single Function

**Severity:** Medium - complexity and maintainability.

**Location:** `showTaskDetailsModal()`, line 13367.

**Problem:**

The function contains: title/description inputs, project/priority selectors,
a full custom time picker widget (~150 lines), recurrence selector, reminder
selector, tag input, subtask manager with inline edit/delete/add, and action
buttons with snooze logic.

The custom time picker alone is a self-contained widget with its own state,
columns, scroll behavior, and positioning logic embedded inside the modal.

**Fix:**

Extract the time picker into a standalone `createTimePickerWidget(config)`
factory function that returns a DOM element. Extract subtask management into
`createSubtaskManager(subtasks, onChange)`. These components can then be
composed in `showTaskDetailsModal()` at a higher level of abstraction.

---

### Issue 4 - `showNoteEditor()` Uses `document.write()` in `printNote()`

**Severity:** Medium - deprecated API, same issue as Section 6.

**Location:** `printNote()` function defined inside `showNoteEditor()`.

**Problem:**

```javascript
function printNote(title, contentHtml) {
    const iframe = document.createElement('iframe');
    ...
    iframe.contentWindow.document.write(`<!DOCTYPE html>...`);
```

Same `document.write()` issue documented in Fix-Print-Section Issue 3.

**Fix:**

Same fix as Section 6 Issue 3: replace `doc.write()` with programmatic document
construction using `createElement` and `appendChild`.

Extract the print stylesheet to a `buildNotePrintStyles()` pure function.

---

### Issue 5 - Duplicate `const headerRow` Declaration in `renderBookmarks()`

**Severity:** Medium - potential SyntaxError if both declarations are in same scope.

**Location:** `renderBookmarks()`, approximately lines 10494 and 10498.

**Problem:**

```javascript
const headerRow = document.createElement('div'); // first declaration
...
const headerRow = document.createElement('div'); // second declaration
```

If both declarations are in the same block scope, this is a `SyntaxError`.
If they are in separate `if/else` branches, it is valid but confusing.

**Fix:**

Verify the scope of each declaration. If they are in the same scope, rename
one (e.g. `subHeaderRow`). If they are in separate branches, add a comment
clarifying why both are named identically.

---

### Issue 6 - `updateReminderCountdownDisplays` Placeholder Pattern

**Severity:** Low - silent no-op if called before reassignment.

**Location:** Line 12794.

**Problem:**

```javascript
let updateReminderCountdownDisplays = () => { }; // no-op placeholder
// ... later reassigned to actual implementation
updateReminderCountdownDisplays = function() { ... };
```

If any code calls `updateReminderCountdownDisplays()` before the reassignment
executes, it silently does nothing. There is no guard or warning.

**Fix:**

Replace the placeholder with a function that warns if called before readiness:

```javascript
let updateReminderCountdownDisplays = () => {
    console.warn('[PA] updateReminderCountdownDisplays called before init');
};
```

Or use a late-binding pattern: define a wrapper that delegates to the real
implementation once it is available, rather than reassigning the variable.

---

### Issue 7 - `showManageProjectsModal()` Has Deeply Nested Inline Flows

**Severity:** Low - readability and maintainability.

**Location:** `showManageProjectsModal()`, line 12125, approximately 250 lines.

**Problem:**

The rename flow (inline edit, save, cancel) and delete flow (inline confirm,
yes, no) are implemented as nested closures 4-5 levels deep within the modal
constructor. Each user interaction adds another layer of callback nesting.

**Fix:**

Extract inline rename handling to `startInlineRename(row, project, onSave)`
and inline delete confirmation to `startInlineDelete(row, project, onConfirm)`.
This flattens the nesting and makes each interaction independently readable.

---

### Issue 8 - Inline Styles Throughout the Section

**Severity:** Low - continuation of Section 8 issue.

**Location:** Throughout all 4,261 lines.

**Fix:** Same as Fix-UIShell-Section Issue 1. This section should be addressed
as part of the same global CSS migration, not independently.

---

## Execution Order

1. Issue 5 - verify/fix duplicate headerRow (zero risk, do first)
2. Issue 6 - add warning to placeholder (zero risk)
3. Issue 4 - replace doc.write in printNote (coordinate with Section 6 fix)
4. Issue 7 - extract inline rename/delete flows (medium refactor)
5. Issue 3 - extract time picker and subtask manager (medium refactor)
6. Issue 2 - replace sanitizeNoteHtml with DOMPurify (requires @require header)
7. Issue 1 - replace execCommand (largest change, do last, full regression test)
8. Issue 8 - CSS migration (coordinate with Section 8 fix)

---

## Before Making Any Changes

1. Read current `Source/Tampermonkey/PA.user.js`.
2. For Issue 1, write a test plan covering all note formatting operations before
   starting the execCommand migration.
3. For Issue 2, add DOMPurify to the userscript @require header before replacing
   the sanitizer. Verify DOMPurify loads before sanitizeNoteHtml is called.
4. For Issue 5, check whether both `headerRow` declarations are in the same
   block scope before deciding on the fix.
5. For Issue 3, verify the extracted time picker widget produces identical
   DOM output to the current inline implementation.

---

## Commit Message

```
Fix UI containers section issues from code review
```

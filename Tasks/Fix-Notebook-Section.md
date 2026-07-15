# Task: Fix Notebook Data Operations Issues

## Context

This task was generated from a code review of `Source/Tampermonkey/PA.user.js`.

Section reviewed:

```
// SECTION: Notebook Data Operations  (lines 2571–3108)
```

This section contains a single `NoteService` IIFE — the complete Notes data layer
including folder management, note CRUD, search, sort, and merge operations.

Overall quality is the highest of all sections reviewed so far. Issues are subtler
than previous sections but some carry real data safety risk.

---

## Issues

### Issue 1 — Inconsistent Data/UI Coupling Within the Same Service

**Severity:** Medium — same root cause as Section 2 but worse because it is
inconsistent within a single service.

**Location:** `NoteService` functions that call `showFlash()` or `renderNotes()`.

**Problem:**

Some functions in `NoteService` are pure:

```javascript
// These are pure — no UI calls ✅
searchNotes(), sortNotes(), getNotes(), deleteNote(), updateNote(), mergeNotes()
```

Others call UI functions directly:

```javascript
// These call UI ❌
moveNoteFolderTo()   → showFlash() + renderNotes()
moveNoteSubFolderTo()→ showFlash() + renderNotes()
createNoteFolder()   → showFlash()
renameNoteFolder()   → showFlash()
deleteNoteFolder()   → showFlash()
saveNoteSubFolder()  → showFlash()
deleteNoteSubFolder()→ showFlash()
createNote()         → showFlash()
```

The inconsistency is harder to maintain than uniform coupling: a developer adding
a new function has no clear signal whether it should be pure or UI-coupled.

**Fix:**

Remove all `showFlash()` and `renderNotes()` calls from `NoteService`.

All mutation functions should return a result value indicating success or failure.
Callers are responsible for showing flash messages and triggering re-renders.

This aligns `NoteService` with the already-pure functions in the same service.

---

### Issue 2 — `deleteNoteFolder()` Silently Deletes All Notes in the Folder

**Severity:** Medium — data safety risk with no user warning.

**Location:** `deleteNoteFolder()` function inside `NoteService`.

**Problem:**

```javascript
function deleteNoteFolder(name) {
    ...
    const remainingNotes = notes.filter(n => n.folderId !== targetName);
    if (remainingNotes.length !== notes.length) {
        saveNotes(remainingNotes); // ← all notes in this folder are permanently deleted
    }
    showFlash('Notebook folder deleted', false, 'success'); // ← no mention of deleted notes
    return true;
}
```

The flash message says only "Notebook folder deleted". It does not inform the user
that all notes inside the folder were also permanently deleted.

**Fix:**

Count the number of notes that will be deleted before deleting them:

```javascript
const deletedNoteCount = notes.filter(n => n.folderId === targetName).length;
```

Return the count so the caller can show an appropriate confirmation or flash message:

```javascript
showFlash(`Folder deleted. ${deletedNoteCount} note(s) also removed.`, false, 'success');
```

Ideally, folder deletion with notes inside should require explicit confirmation
from the UI layer before `deleteNoteFolder()` is called. The data function should
not make this decision unilaterally.

---

### Issue 3 — Direct Object Mutation in Move Operations

**Severity:** Low — not a current bug but a fragile pattern.

**Location:** `moveNoteFolderTo()` and `moveNoteSubFolderTo()`.

**Problem:**

```javascript
const notes = getNotes();
notes.forEach(note => {
    if (note.folderId === parentName && note.subfolderId === subName) {
        note.folderId = destFolder; // ← direct mutation of array element
        modified = true;
    }
});
if (modified) saveNotes(notes);
```

`getNotes()` currently returns new objects via `sanitizeNoteList()`, so mutation
is safe today. If `getNotes()` is ever changed to return cached references,
this pattern will produce silent bugs where the cache is modified before the
save is confirmed.

**Fix:**

Use immutable update pattern instead of direct mutation:

```javascript
const notes = getNotes();
let modified = false;
const updatedNotes = notes.map(note => {
    if (note.folderId === parentName && note.subfolderId === subName) {
        modified = true;
        return { ...note, folderId: destFolder };
    }
    return note;
});
if (modified) saveNotes(updatedNotes);
```

Apply this pattern to both `moveNoteFolderTo()` and `moveNoteSubFolderTo()`.

---

### Issue 4 — Double Storage Read in `getNoteFolders()` and Move Operations

**Severity:** Low — performance, not a correctness issue.

**Location:** `getNoteFolders()` and any function that calls it alongside `getNotes()`.

**Problem:**

`getNoteFolders()` internally calls `getNotes()` to infer folders from note data.
This means every call to `getNoteFolders()` performs two `gmGet` reads.

`moveNoteFolderTo()` calls `getNoteFolders()`, then `getNoteSubFolders()` (which
calls `getAllNoteSubFolders()` which calls `getNotes()`), then `getNotes()` again.
This results in 4+ sequential storage reads for one operation.

**Fix:**

Read notes and folders once at the start of each multi-step operation and pass
the arrays as parameters to helper functions rather than re-reading storage:

```javascript
async function moveNoteFolderTo(folderName, destFolder) {
    const notes = getNotes();         // single read
    const folders = getNoteFolders(); // single read (uses already-loaded notes)
    ...
}
```

For a longer-term fix, `getNoteFolders()` could accept an optional pre-loaded
notes array to avoid the internal re-read when the caller already has one.

---

### Issue 5 — Separator Collision in `mergeNotes()` Key Function

**Severity:** Low — edge case, unlikely in practice.

**Location:** `keyFor()` function inside `mergeNotes()`.

**Problem:**

```javascript
const keyFor = (note) => [
    normalize(note.title),
    normalize(note.content),
    normalize(note.folderId),
    String(note.createdAt || '')
].join('|');
```

The `|` separator is not escaped. A note titled `"a|b"` with content `"c"` produces
the same key as a note titled `"a"` with content `"b|c"` in the same folder.
This would cause a valid incoming note to be incorrectly treated as a duplicate.

**Fix:**

Use a separator sequence that cannot appear in user content, or use a structured
format instead of string joining:

```javascript
const keyFor = (note) => JSON.stringify([
    normalize(note.title),
    normalize(note.content),
    normalize(note.folderId),
    String(note.createdAt || '')
]);
```

`JSON.stringify` handles escaping automatically and produces unambiguous keys.

---

### Issue 6 — Timestamp Fallback Using `||` Operator

**Severity:** Low — subtle data integrity risk with corrupted data.

**Location:** `sanitizeNote()`, `sanitizeNoteFolder()`, `sanitizeNoteSubFolder()`.

**Problem:**

```javascript
const createdAt = Number(raw.createdAt) || now;
```

If `raw.createdAt` is `0` (which can occur with corrupted or migrated data),
`Number(0)` evaluates to `false` in a boolean context, causing the fallback `now`
to be used instead. This silently overwrites a stored timestamp of 0 with the
current time.

**Fix:**

Use an explicit null check instead of the `||` operator:

```javascript
const createdAt = (raw.createdAt != null && Number.isFinite(Number(raw.createdAt)))
    ? Number(raw.createdAt)
    : now;
```

Apply this fix to all timestamp fields in all three sanitize functions:
`sanitizeNote()`, `sanitizeNoteFolder()`, `sanitizeNoteSubFolder()`.

---

## Execution Order

1. Issue 6 — timestamp fallback fix (isolated, zero risk)
2. Issue 5 — keyFor separator fix in mergeNotes (isolated, zero risk)
3. Issue 3 — immutable update pattern in move operations (low risk)
4. Issue 4 — reduce double storage reads (medium refactor)
5. Issue 2 — return note count from deleteNoteFolder (requires caller update)
6. Issue 1 — remove UI calls from NoteService (highest impact, do last)

---

## Before Making Any Changes

1. Read the current version of `Source/Tampermonkey/PA.user.js`.
2. Read `Knowledge/Notebook.md` and `Contracts/Storage.md`.
3. Use the current file SHA for all update operations.
4. Do not modify any other file unless the fix explicitly requires it.
5. After Issue 1, verify that notebook folder operations still show flash messages
   and trigger re-renders from their call sites in the UI sections.

---

## Commit Message

```
Fix notebook data operations issues from code review
```

Or one commit per issue with descriptive messages.

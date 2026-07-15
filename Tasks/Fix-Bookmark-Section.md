# Task: Fix Bookmark Data Operations Issues

## Context

This task was generated from a code review of `Source/Tampermonkey/PA.user.js`.

Section reviewed:

```
// SECTION: Bookmark Data Operations  (lines 3109–3510)
```

This section contains bookmark and bookmark-folder CRUD operations, URL utility
functions, and batch operations for multi-select workflows.

Unlike every other data section, Bookmark functions are not wrapped in an IIFE
service module. This is the most significant architectural gap in this section.

---

## Issues

### Issue 1 — No IIFE Service Wrapper (Breaks Architectural Pattern)

**Severity:** Medium — structural inconsistency with all other data sections.

**Location:** Lines 3109–3510, all Bookmark functions.

**Problem:**

Every other data section uses an IIFE module pattern:

```javascript
const FolderDataService = (() => { ... return Object.freeze({...}); })();
const NoteService       = (() => { ... return Object.freeze({...}); })();
```

Bookmark functions are standalone in the outer scope:

```javascript
let bookmarkSearchQuery = '';          // ← global mutable state
let selectedBookmarkIds = new Set();   // ← global mutable state

function getBookmarks() { ... }
function saveBookmarks() { ... }
function deleteBookmarkFolder() { ... }
// ... 20+ more standalone functions
```

This means Bookmark state and functions are accessible to any code in the file,
there is no encapsulation boundary, and the pattern is inconsistent with the rest
of the codebase.

**Fix:**

Wrap all Bookmark data functions and state in a `BookmarkService` IIFE:

```javascript
const BookmarkService = (() => {
    let bookmarkSearchQuery = '';
    let selectedBookmarkIds = new Set();

    function getBookmarks() { ... }
    function saveBookmarks() { ... }
    // ... all other functions

    return Object.freeze({
        getBookmarks,
        saveBookmarks,
        addOrUpdateBookmark,
        updateBookmark,
        updateBookmarksByIds,
        deleteBookmark,
        deleteBookmarksByIds,
        getBookmarkFolders,
        saveBookmarkFolder,
        renameBookmarkFolder,
        deleteBookmarkFolder,
        getAllBookmarkSubFolders,
        getBookmarkSubFolders,
        saveBookmarkSubFolder,
        renameBookmarkSubFolder,
        deleteBookmarkSubFolder,
        updateBookmarkFolder,
        updateBookmarkSubFolder,
        moveBookmarkFolderTo,
        moveBookmarkSubFolderTo,
        ensureBookmarkDefaults,
        normalizeBookmarkUrl,
        getBookmarkDomain,
        getBookmarkOrigin,
        getBookmarkFaviconUrl,
        getBookmarkFallbackFaviconUrl,
        sanitizeBookmarkList,
        getSearchQuery: () => bookmarkSearchQuery,
        setSearchQuery: (q) => { bookmarkSearchQuery = String(q || ''); },
        getSelectedIds: () => selectedBookmarkIds,
    });
})();
```

Add compatibility facades below the IIFE (same pattern as `FolderDataService`)
to preserve existing call sites during the transition.

---

### Issue 2 — Data Service Calls UI Functions Directly

**Severity:** Medium — same root cause as Sections 2 and 3.

**Location:** All mutation functions in the Bookmark section.

**Problem:**

Every mutation function calls `showFlash()` and/or `renderBookmarks()` directly.
This couples the data layer to the UI layer.

**Fix:**

Same fix as Sections 2 and 3: remove `showFlash()` and `renderBookmarks()` from
data functions. Return a result value. Let callers handle rendering and feedback.

This fix should be coordinated with Issue 1 (wrapping in `BookmarkService`) and
with the equivalent fixes in `FolderDataService` and `NoteService` to maintain
a consistent pattern across all data services.

---

### Issue 3 — `deleteBookmarkFolder()` Silently Deletes All Bookmarks

**Severity:** Medium — data safety risk, same issue as `deleteNoteFolder()`.

**Location:** `deleteBookmarkFolder()`.

**Problem:**

```javascript
function deleteBookmarkFolder(folderName) {
    saveBookmarkFolders(getBookmarkFolders().filter(f => f.name !== folderName));
    saveBookmarkSubFolders(getAllBookmarkSubFolders().filter(sf => sf.parent !== folderName));
    saveBookmarks(getBookmarks().filter(b => b.folder !== folderName)); // ← silent delete
    renderBookmarks();
    showFlash('Bookmark folder deleted', false, 'success'); // ← no mention of deleted bookmarks
}
```

The flash message does not inform the user how many bookmarks were deleted.

**Fix:**

Count deleted bookmarks before deletion and include the count in the flash message:

```javascript
const deletedCount = getBookmarks().filter(b => b.folder === folderName).length;
// ... perform deletions ...
// Return deletedCount so caller can show: "Folder deleted. X bookmark(s) also removed."
```

Ideally, the UI layer should show a confirmation dialog before calling this
function when the folder contains bookmarks.

---

### Issue 4 — Redundant `if` Condition in `moveBookmarkFolderTo()`

**Severity:** Low — dead logic, not a bug.

**Location:** `moveBookmarkFolderTo()`.

**Problem:**

```javascript
// If subfolder already exists → error and return early
if (subs.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === folderName.toLowerCase())) {
    showFlash('Destination already has a folder with this name', true, 'error');
    return;
}

// This condition is ALWAYS true when reached (we already returned if it was false above)
if (!subs.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === folderName.toLowerCase())) {
    subs.push({ parent: destFolder, name: folderName, pinned: false });
}
```

The second `if` wrapper is unnecessary. After the early return above, the condition
is guaranteed to be true.

**Fix:**

Remove the redundant `if` wrapper:

```javascript
if (subs.some(sf => sf.parent === destFolder && sf.name.toLowerCase() === folderName.toLowerCase())) {
    showFlash('Destination already has a folder with this name', true, 'error');
    return;
}
subs.push({ parent: destFolder, name: folderName, pinned: false }); // always executes here
```

---

### Issue 5 — Separator Collision in `sanitizeBookmarkList()`

**Severity:** Low — same edge case as `mergeNotes()` in Section 3.

**Location:** `sanitizeBookmarkList()` deduplication key.

**Problem:**

```javascript
const key = [
    normalize(candidate.name),
    normalize(candidate.url),
    normalize(candidate.folder),
    normalize(candidate.subfolder)
].join('|');
```

**Fix:**

```javascript
const key = JSON.stringify([
    normalize(candidate.name),
    normalize(candidate.url),
    normalize(candidate.folder),
    normalize(candidate.subfolder)
]);
```

---

### Issue 6 — Timestamp Fallback Using `||` Operator

**Severity:** Low — same issue as Section 3 `sanitizeNote()`.

**Location:** `sanitizeBookmarkList()` timestamp fields.

**Problem:**

```javascript
const createdAt = Number(raw.createdAt) || Date.now();
const updatedAt = Number(raw.updatedAt) || createdAt;
```

**Fix:**

```javascript
const createdAt = (raw.createdAt != null && Number.isFinite(Number(raw.createdAt)))
    ? Number(raw.createdAt) : Date.now();
const updatedAt = (raw.updatedAt != null && Number.isFinite(Number(raw.updatedAt)))
    ? Number(raw.updatedAt) : createdAt;
```

---

### Issue 7 — No try/catch on I/O Operations

**Severity:** Low — same gap as Sections 2 and 3.

**Fix:** Same as previous sections — wrap each data function in try/catch.

---

## Cross-Cutting Note

Issues 5, 6, and 7 are identical to findings in Sections 2 and 3.
These three issues should be fixed as a single cross-cutting task across all
data sections rather than three separate fixes per section.
See: `Tasks/Fix-Cross-Cutting-Data-Issues.md` (to be created).

---

## Execution Order

1. Issue 4 — remove redundant if (isolated, zero risk)
2. Issue 5 — separator fix (isolated, zero risk)
3. Issue 6 — timestamp fallback fix (isolated, low risk)
4. Issue 7 — add try/catch (low risk)
5. Issue 3 — return deleted count from deleteBookmarkFolder (requires caller update)
6. Issue 1 — wrap in BookmarkService IIFE (medium risk, do before Issue 2)
7. Issue 2 — remove UI calls from data functions (highest impact, do last)

---

## Before Making Any Changes

1. Read the current version of `Source/Tampermonkey/PA.user.js`.
2. Read `Knowledge/Bookmark.md` and `Contracts/Storage.md`.
3. Use the current file SHA for all update operations.
4. Do not modify any other file unless the fix explicitly requires it.
5. After Issue 1, verify all existing call sites work through compatibility facades.
6. After Issue 2, verify bookmark operations still trigger re-renders from call sites.

---

## Commit Message

```
Fix bookmark data operations issues from code review
```

Or one commit per issue with descriptive messages.

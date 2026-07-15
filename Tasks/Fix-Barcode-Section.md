# Task: Fix Barcode Section Issues

## Context

This task was generated from a code review of `Source/Tampermonkey/PA.user.js`.

Section reviewed:

```
// SECTION: Barcode Data Operations  (lines 3511–5980)
```

Despite its name, this section contains five distinct feature systems bundled
together. Actual Barcode functions begin at line 4801 — 1,290 lines into a
section labeled "Barcode Data Operations".

True contents:

| Content | Lines |
|---|---|
| Todo / Task system | ~350 |
| NLP natural language parser | ~215 |
| Wellness + Reminder + Notification system | ~650 |
| Footer quote system | ~90 |
| Barcode CRUD + Import / Export + Backup | ~1,165 |

---

## Issues

### Issue 1 — `showFlash()` Defined Here, Called by All Previous Sections

**Severity:** High — implicit ordering dependency across the entire file.

**Location:** Line 4901, inside "Barcode Data Operations".

**Problem:**

`showFlash()` is the platform-wide UI feedback function used in Sections 1–4:

```javascript
// Called in Section 1 (StorageService), Section 2 (FolderDataService),
// Section 3 (NoteService), Section 4 (Bookmark functions) ...
// But defined here in Section 5:

function showFlash(message, isError = false, type = 'info') {
    ...
}
```

This creates a hard ordering dependency: `showFlash` must be defined before it
is called, so Section 5 must always come after Sections 1–4.

If any future refactor moves Section 5 or splits it, all earlier `showFlash()`
calls will throw `ReferenceError` at runtime.

**Fix:**

Move `showFlash()` and `safeAppend()` (line 4895) to Section 1 (Storage and
Platform Utilities) or to a new dedicated "Platform UI Utilities" section that
loads before all feature sections.

This eliminates the ordering dependency and makes the function's scope explicit.

---

### Issue 2 — Five Independent Systems in One Mislabeled Section

**Severity:** Medium — severe cohesion violation, major maintainability risk.

**Location:** Lines 3511–5980.

**Problem:**

The section contains five unrelated systems under the label "Barcode Data
Operations":

1. **Todo / Task system** — `getTasks`, `saveTasks`, `addTask`, `updateTask`,
   `deleteTask`, `toggleTask`, `snoozeTaskReminder`, `clearCompletedTasks`
2. **NLP parser** — `parseTaskTextWithNLP` (215 lines)
3. **Wellness + Reminder + Notification** — `getWellnessSettings`,
   `sendWellnessNotification`, `scheduleReminderCheck`, `runReminderCheck`,
   `showInAppAlarmPopup`, `sendNativeNotification`, `showWellnessSettingsModal`
   (178 lines of DOM), `showTimerSettingsModal` (120 lines of DOM)
4. **Footer quote system** — `fetchFooterQuote`, `applyFooterQuoteNow`,
   `scheduleFooterQuoteRefresh`, `renderFooterQuoteIfAllowed`
5. **Barcode CRUD + Import / Export + Backup** — `getBarcodes`, `idbAddBarcode`,
   `buildFullBackupData`, `importBackupData`, `mergeImportData`,
   `parseBrowserBookmarksHtml`, `parseCsvText`

**Fix:**

Split into five separate named sections:

```
// SECTION: Todo and Task Operations
// SECTION: Wellness, Reminders, and Notifications
// SECTION: Barcode Data Operations
// SECTION: Import, Export, and Backup
// SECTION: Footer and Quote System
```

Move `buildFullBackupData()` and `importBackupData()` to the Import/Export/Backup
section. Move the two modals (`showWellnessSettingsModal`,`showTimerSettingsModal`)
to a UI section.

This is a reorganization task with no logic changes required.

---

### Issue 3 — `getTodoProjects()` Silently Creates Default Data on Read

**Severity:** Medium — hidden side effect in a read function.

**Location:** `getTodoProjects()`, line 3610.

**Problem:**

```javascript
function getTodoProjects() {
    let projects = gmGet(STORAGE_KEYS.TODO_PROJECTS, null);
    if (!Array.isArray(projects) || projects.length === 0) {
        projects = ['Personal', 'Work', 'Shopping', 'Programming'];
        gmSet(STORAGE_KEYS.TODO_PROJECTS, projects); // ← silent write on read
    }
    return projects;
}
```

A function named `get*` performs a storage write without the caller's knowledge.
Any caller using `getTodoProjects()` may unknowingly trigger data creation.

This is the same pattern as `populateFolderSelect()` in Section 2.

**Fix:**

Remove the `gmSet` call from `getTodoProjects()`. Initialize default projects
explicitly during `initialize()` in the bootstrap section, or in a dedicated
`ensureTodoDefaults()` function called once at startup — the same pattern as
`ensureBookmarkDefaults()` in Section 4.

---

### Issue 4 — Hardcoded Storage Key Bypasses STORAGE_KEYS Registry

**Severity:** Medium — untracked storage key outside the centralized registry.

**Location:** `getDefaultTodoProject()`, line 3597.

**Problem:**

```javascript
function getDefaultTodoProject() {
    const stored = gmGet('app:todo:default_project', ''); // ← hardcoded string
    ...
}

function setDefaultTodoProject(name) {
    gmSet('app:todo:default_project', name); // ← hardcoded string
}
```

All other storage keys are registered in the `STORAGE_KEYS` object. This key
is a raw string literal in two places. It cannot be found by searching
`STORAGE_KEYS`, is not included in backup/restore logic discovery, and cannot
be renamed safely.

**Fix:**

Add to `STORAGE_KEYS`:

```javascript
TODO_DEFAULT_PROJECT: 'app:todo:default_project',
```

Then replace both raw string literals with `STORAGE_KEYS.TODO_DEFAULT_PROJECT`.

---

### Issue 5 — UI Modals in a Data Section

**Severity:** Medium — 300+ lines of DOM creation code in "Barcode Data Operations".

**Location:**
- `showWellnessSettingsModal()` — ~178 lines starting around line 4504
- `showTimerSettingsModal()` — ~120 lines starting around line 4682

**Problem:**

Both functions create full modal dialogs with DOM elements, event listeners,
and `UI.panel.element.appendChild()` calls. They are UI code, not data code.

**Fix:**

Move both modal functions to the UI section that handles settings and modal
dialogs. No logic changes required, only relocation.

---

### Issue 6 — Todo and Wellness Have No IIFE Service Wrapper

**Severity:** Low — same architectural gap as Bookmark section (Section 4).

**Location:** All Todo functions (lines 3517–4044) and Wellness functions
(lines 4045–4800).

**Problem:**

`tasksCache`, `tasksCacheDirty` are declared as module-level mutable variables.
All Todo and Wellness functions are standalone in the outer scope with no
encapsulation boundary.

**Fix:**

Wrap in service modules after the section split (Issue 2):

```javascript
const TaskService = (() => {
    let tasksCache = null;
    let tasksCacheDirty = true;
    ...
    return Object.freeze({ getTasks, saveTasks, addTask, ... });
})();

const WellnessService = (() => {
    ...
    return Object.freeze({ getWellnessSettings, saveWellnessSettings, ... });
})();
```

---

### Issue 7 — `buildFullBackupData()` and `importBackupData()` in Wrong Section

**Severity:** Low — organizational.

**Location:** Lines 5794 and 5964.

**Problem:**

The core backup functions are buried inside "Barcode Data Operations". They
depend on all feature modules (Folders, Barcodes, Notes, Bookmarks, Todos) and
produce the platform-wide backup artifact. They belong in a dedicated Import /
Export / Backup section.

**Fix:**

Move to a new "Import, Export, and Backup" section (part of Issue 2 split).

---

## Execution Order

1. Issue 4 — add `TODO_DEFAULT_PROJECT` to `STORAGE_KEYS` (isolated, zero risk)
2. Issue 3 — remove silent write from `getTodoProjects` (low risk)
3. Issue 1 — move `showFlash()` and `safeAppend()` to platform utilities (medium risk — verify all callers still work after move)
4. Issue 5 — relocate modal functions to UI section (no logic change)
5. Issue 7 — relocate backup functions (no logic change)
6. Issue 2 — full section split (largest change, do last, no logic changes required)
7. Issue 6 — wrap Todo and Wellness in service IIFEs (after split)

---

## Before Making Any Changes

1. Read the current version of `Source/Tampermonkey/PA.user.js`.
2. Read `Knowledge/Workspace.md`, `Contracts/Backup.md`, `Contracts/Storage.md`.
3. Use the current file SHA for all update operations.
4. Issue 1 is the highest risk change — after moving `showFlash()`, search all
   call sites in Sections 1–4 and verify they are not affected by load order.
5. For Issues 2, 5, and 7 (relocations), verify no function references are broken
   after the move.

---

## Commit Message

```
Fix barcode section structure and issues from code review
```

Or one commit per issue with descriptive messages.

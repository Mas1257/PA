# Refactoring Master Plan

## Purpose

This document is the execution roadmap for all refactoring work identified in the
code review. It defines the order, dependencies, and completion criteria for every
task so that work proceeds mechanically without re-introducing disorder.

The plan is dependency-driven, not severity-driven. A bug fix that must be redone
after a later refactor is scheduled after that refactor, even if its severity is
high. Order follows dependencies first, severity second.

Do not begin any task until Phase 0 is complete.

---

## Governing Principle

Each phase has an entry condition and an exit condition. A phase may not begin
until the previous phase's exit condition is met. The exit condition for every
phase includes: the full smoke test in `Verification-And-Smoke-Test.md` passes
with no regressions.

---

## Phase 0 — Baseline and Verification

**Goal:** Establish the safety net before any code changes.

**Tasks:**

1. Complete the Baseline Snapshot (Section A of Verification-And-Smoke-Test.md).
2. Run the full Smoke Test Checklist and confirm the current build passes it
   (Section B).
3. Record the Performance Baseline (Section C).

**Exit condition:** All three sections recorded. This is the reference state.

**Blocker for:** All other phases.

---

## Phase 1 — Platform Foundation

**Goal:** Create the shared infrastructure that later phases depend on.

This phase must come first because many Tier 1 bug fixes and Tier 4 cleanups
move code into these shared locations. Doing the fixes first would mean moving
the same code twice.

**Tasks:**

1. Create a "Platform UI Utilities" section that loads before all feature sections.
2. Move `showFlash()` and `safeAppend()` into it (from Fix-Barcode-Section Issue 1).
3. Move context menu utilities into it (from Fix-Print-Section Issue 1).
4. Move clipboard and keyboard utilities into it (from Fix-Print-Section Issue 2).
5. Create shared icon factory functions: `createFolderIconSvg(hasContent, variant)`
   and `createBarcodeIconSvg()` (from Fix-MainRenderer Issue 3, Fix-InterfaceTabs
   Issue 6, Fix-Final-Sections Issue 5).

**Exit condition:** All shared utilities exist in one place. Smoke test passes.
No feature section defines its own copy of these utilities yet — that removal
happens in later phases.

**Depends on:** Phase 0.

---

## Phase 1.5 — Cross-Cutting Standardization

**Goal:** Fix the rules that repeat across every section in one coordinated pass.

Almost every section review found the same recurring issues. These are not
feature-specific bugs; they are violations of a rule. Fixing them per-section
would mean touching the same patterns fourteen times. Fixing them as rules here
removes a large portion of the individual section tasks.

**Tasks:**

1. **Hardcoded storage keys:** Add every hardcoded key to `STORAGE_KEYS`:
   - `app:todo:default_project` (Fix-Barcode Issue 4)
   - `bm_print_log` (Fix-Print Issue 7)
   - `app:ui:panel_auto_close_ms` (Fix-UIState Issue 2)
   - `PA_GLOBAL_TIMER` (Fix-UIShell Issue 4)
   - `app:ui:hidden_tabs` (Fix-UIShell Issue 5)

2. **localStorage bypass:** Replace every direct `localStorage.getItem/setItem/
   removeItem` on a STORAGE_KEYS value with the StorageEngine equivalent
   (Fix-UIState Issue 1, Fix-MainRenderer Issue 7, Fix-Final-Sections Issue 3,
   Fix-UIShell Issue 4).

3. **Timestamp fallback:** Replace `Number(x) || fallback` with an explicit null
   check in all sanitize functions (Fix-Notebook Issue 6, Fix-Bookmark Issue 6).

4. **Separator collision:** Replace `[...].join('|')` dedup keys with
   `JSON.stringify([...])` (Fix-Notebook Issue 5, Fix-Bookmark Issue 5).

5. **Missing try/catch:** Add try/catch to all data-layer I/O functions
   (Fix-Folder Issue 3, Fix-Notebook, Fix-Bookmark Issue 7).

**Exit condition:** Each rule holds everywhere. Smoke test passes. After this
phase, mark the corresponding issues in the per-section task files as resolved.

**Depends on:** Phase 1 (needs Platform Utilities for showFlash routing).

---

## Phase 2 — Critical Bug Fixes

**Goal:** Fix genuine bugs and risks that remain after standardization.

**Tasks:**

1. Nested `GM_addValueChangeListener` memory leak (Fix-Storage Issue 1).
2. `showRenameModal` header append bug (Fix-ImportExport Issue 1).
3. Bridge availability without timeout (Fix-Print Issue 5).
4. Multi-key writes without rollback (Fix-Folder Issue 2).
5. Custom HTML sanitizer replaced with DOMPurify (Fix-UIContainers Issue 2).
6. `document.execCommand` replacement (Fix-UIContainers Issue 1) — highest risk,
   full note editor regression test required.
7. Silent folder deletion warnings for notes and bookmarks (Fix-Notebook Issue 2,
   Fix-Bookmark Issue 3).

**Exit condition:** All listed bugs fixed and verified individually, then full
smoke test passes.

**Depends on:** Phase 1.5.

---

## Phase 3 — Architectural Refactoring

**Goal:** Convert the codebase from a good script into a structured platform.

**Tasks:**

1. Wrap Bookmark functions in `BookmarkService` (Fix-Bookmark Issue 1).
2. Wrap Todo functions in `TaskService` (Fix-Barcode Issue 6).
3. Wrap Wellness functions in `WellnessService` (Fix-Barcode Issue 6).
4. Split the "Barcode Data Operations" section into five real sections
   (Fix-Barcode Issue 2).
5. Move backup functions to a dedicated Import/Export/Backup section
   (Fix-Barcode Issue 7).
6. Decouple data services from UI: remove `showFlash`/`render*` calls from all
   data functions, return results instead (Fix-Folder Issue 1, Fix-Notebook
   Issue 1, Fix-Bookmark Issue 2).
7. Decouple StorageService from UI functions (Fix-Storage Issue 3).
8. Extract `resetAllData()` from the UI handler (Fix-UIShell Issue 2).

**Exit condition:** Each service is self-contained. Data layer has no UI calls.
Smoke test passes.

**Depends on:** Phase 2.

---

## Phase 4 — Platform Cleanup

**Goal:** Remove duplication and inconsistency now that structure is stable.

**Tasks:**

1. Remove now-duplicate helper definitions that Phase 1 centralized (SVGs,
   `estimatePreviewModules`, `isLikelyURL`, clipboard, context menus).
2. Consolidate the three search UI functions into one factory
   (Fix-InterfaceTabs Issue 2).
3. Extract shared `restoreFormLayout()` (Fix-UIForms Issue 1).
4. Extract `printAllBarcodesInFolder()` (Fix-MainRenderer Issue 4).
5. Extract `pickFileWithMode()` (Fix-ImportExport Issue 2).
6. Convert `bmConfirm` to a Promise (Fix-ImportExport Issue 3).
7. Migrate inline styles to CSS classes (Fix-UIShell Issue 1, Fix-UIContainers
   Issue 8) — large but low-risk if done incrementally with visual verification.
8. Replace `onclick` with `addEventListener` (Fix-Final Issue 6).
9. Remove dead code, magic numbers, variable shadowing, DOM-property state
   (Fix-Final Issue 1, Fix-UIState Issue 3, Fix-MainRenderer Issues 5/8,
   Fix-UIContainers Issue 6).

**Exit condition:** No duplicated helpers remain. Smoke test passes. Performance
baseline unchanged.

**Depends on:** Phase 3.

---

## Phase 5 — Large Complexity Reduction

**Goal:** Break up the giant functions. Highest behavioral risk, so it is last.

These functions are large but currently work. Splitting them risks subtle
behavior changes, so they are deferred until the architecture around them is
stable and the smoke test is trusted.

**Tasks:**

1. Split `renderFolders()` into sub-renderers (Fix-MainRenderer Issue 1) —
   preserve chunked rendering and stale-check.
2. Extract time picker and subtask manager from `showTaskDetailsModal()`
   (Fix-UIContainers Issue 3).
3. Extract preview factories from `showBigBarcodeModal()` (Fix-Final Issue 4).
4. Extract components from `showNoteEditor()` (Fix-UIContainers, related).
5. Split the Footer section into Action Dropdown, Footer, and Entry Point
   (Fix-Final Issue 7).
6. Resolve section boundary inside `createSettingsPanel()` (Fix-InterfaceTabs
   Issue 1).

**Exit condition:** No single function exceeds a reasonable size threshold.
Full smoke test and performance baseline pass. This is the final phase.

**Depends on:** Phase 4.

---

## Task-to-Phase Map

| Task File | Phases it feeds |
|---|---|
| Fix-Storage-Section | 2, 3 |
| Fix-Folder-Section | 1.5, 2, 3 |
| Fix-Notebook-Section | 1.5, 2, 3 |
| Fix-Bookmark-Section | 1.5, 2, 3 |
| Fix-Barcode-Section | 1, 1.5, 3 |
| Fix-Print-Section | 1, 1.5, 2 |
| Fix-UIState-Section | 1.5, 4 |
| Fix-UIShell-Section | 1.5, 3, 4 |
| Fix-InterfaceTabs-Section | 1, 4, 5 |
| Fix-UIContainers-Section | 2, 4, 5 |
| Fix-UIForms-Section | 4 |
| Fix-ImportExport-Section | 2, 4 |
| Fix-MainRenderer-Section | 1, 1.5, 4, 5 |
| Fix-Final-Sections | 1, 2, 4, 5 |

---

## Rules for Execution

1. Never skip a phase's exit condition.
2. Never start a task whose dependencies are in a later phase.
3. When a Phase 1.5 rule resolves an issue in a per-section task, mark that
   issue resolved in the task file so it is not done twice.
4. Commit at the end of each task with a descriptive message, not one giant
   commit per phase.
5. If a smoke test fails after a task, fix it before moving on. Do not accumulate
   regressions.
6. The core logic of every feature is sound. This plan changes structure, not
   behavior. Any behavior change is a bug, not an improvement.

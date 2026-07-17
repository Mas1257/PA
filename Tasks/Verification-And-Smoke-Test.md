# Verification and Smoke Test

## Purpose

This document defines the baseline behavior and verification procedure for the PA
platform. It exists to make refactoring safe.

PA has no automated tests. Every refactoring task instructs the developer to
"verify behavior unchanged" but provides no procedure for doing so. This document
is that procedure.

Run the full smoke test before starting a refactoring phase and again after
completing it. If any scenario behaves differently after a change, the change
introduced a regression.

---

## Freeze Record

Before the first refactor, tag the current commit as `pre-refactor-baseline` and
record the exact environment here. All later comparisons diff against this point.

```
Baseline tag        pre-refactor-baseline
Commit SHA          17e7f83fd7b268dc2ccd58d98c767d9e09dc1b54
Browser             Chrome 150.0.7871.129 (Official Build) (64-bit)
Tampermonkey        5.50
Operating system    Windows 10 Enterprise 22H2 64-bit
Screen resolution   1920x1080
Date recorded       2026-07-16
```

## Result States

For each smoke test scenario, record one of three states, not just pass/fail:

- **Pass** — works as expected.
- **Pass with known issue** — works, but with a noted imperfection. Record the note.
- **Fail** — does not work. Record why.

A known issue or failure recorded at baseline is not a regression if it persists.
A new issue appearing after a refactor is a regression. The notes are what make
this distinction possible.

## Test Tiers

Not every scenario runs on every change. Tiers keep development fast:

**Core tier** (run after every task or commit within a phase):
- Create barcode
- Edit barcode
- Delete barcode
- Print via browser
- Import
- Export
- Create note
- Create bookmark
- Todo reminder
- Workspace connect

**Extended tier** (run at the end of each phase): the full checklist in Section B.

**Full regression** (run before any release): the full checklist plus the
performance baseline in Section C.

## Baseline Results — Recorded 2026-07-16

Results from the first full baseline run on the freeze environment
(Chrome 150, Tampermonkey 5.50, Windows 10, tag `pre-refactor-baseline`).

### Workspace — all Pass

- Connect: Pass. Folder selected, state indicator turns green.
- Disconnect: Pass. State indicator turns red.
- Permission after full Chrome restart: Pass with note. On restart, PA
  reconnected automatically from stored settings and showed active green
  state without any user action. After a manual disconnect and reconnect,
  re-selecting the previous backup folder required granting permissions
  again, then connected successfully.
- Auto snapshot: Pass. Snapshot files created after data changes.
- Restore: Pass. Verified today — snapshot data restored successfully
  after reconnect.
- Rotation: Pass. Backups folder contains exactly 10 files.

### Backup — Pass (partial coverage)

- Export: Pass. Manual export produced a .pa file without errors.
- Import: Pass. Manual import restored data without errors.
- Import on fresh browser profile: Not yet tested (deferred).
- Legacy JSON import: Not yet tested (deferred).

### Remaining categories

Barcode, Notebook, Todo, Bookmark, Folder, Settings, Search scenarios:
reported working correctly in general use on the baseline build; detailed
per-scenario evidence to be captured incrementally during Phase 1+ core-tier
runs. Any deviation found later against this build is not a refactor
regression if it reproduces on the `pre-refactor-baseline` tag.

## A. Baseline Snapshot

Before the first refactor, record the current behavior of each subsystem. This
is the reference against which all future behavior is compared.

For each subsystem below, perform the listed action once and record the observed
result (success, error message, timing, or visual state). This captured behavior
is the baseline.

Subsystems to baseline:

- Workspace: connect, disconnect, permission flow, auto snapshot, restore
- Backup: export file, import file, import on a fresh browser profile, legacy import
- Import: PA file, ZIP file, CSV, TXT
- Export: full workspace export and re-import
- Print: browser print path, bridge print path
- QR: preview generation, cache hit, cache miss
- Cross-tab sync: change data in one tab, observe update in another
- Todo: create, NLP parse, reminder, snooze, recurring, wellness
- Notebook: create, rich text, image paste, search, folder move
- Bookmark: create, import, folder, subfolder, batch edit
- Folder: create, rename, delete, move, pin
- Search: barcode search, note search, bookmark search, todo search

---

## B. Smoke Test Checklist

Run every scenario below before and after each refactoring phase. Mark each
pass or fail. Any fail is a regression that must be resolved before the phase
is considered complete.

### Workspace

- Connect workspace (choose a local folder)
- Disconnect workspace
- Handle permission denied gracefully
- Auto snapshot fires after data change
- Restore from snapshot
- Snapshot rotation keeps maximum of 10

### Backup

- Export produces a downloadable .pa file
- Import a .pa file restores data
- Import on a new browser profile works
- Legacy JSON import still works

### Barcode

- Create a barcode
- Edit a barcode
- Delete a barcode
- Move a barcode between folders
- Duplicate a barcode
- Print via browser
- Print via bridge
- Send to page (scanner emulation)
- Batch select and print
- Batch select and delete

### Notebook

- Create a note
- Apply rich text formatting (bold, italic, list, heading)
- Paste an image into a note
- Search notes
- Move a note between folders
- Archive and unarchive a note

### Todo

- Create a task with NLP text parsing
- Set and receive a reminder
- Snooze a reminder
- Create a recurring task
- Wellness reminders (water, stretch)
- Manage projects (create, rename, delete)
- Subtask add, complete, delete

### Bookmark

- Create a bookmark
- Import browser bookmarks (HTML)
- Create folder and subfolder
- Batch edit bookmarks
- Pin and unpin

### Folder

- Create a folder
- Rename a folder
- Delete a folder (with content warning)
- Move a folder
- Create and navigate subfolders

### Settings

- Change theme
- Hide and show tabs
- Reset all data (with confirmation)
- Export from settings

### Search

- Barcode search returns folders and barcodes
- Clicking a search result highlights the correct item
- Note, bookmark, and todo search each work

---

## C. Performance Baseline

Some refactors risk degrading performance. Record these timings before starting
and re-check after each phase. A significant regression (e.g. more than 20 percent
slower) should be investigated before proceeding.

Metrics to record:

- Panel open time (click floating button to fully rendered)
- Render time for a folder containing 100+ barcodes
- Render time for a folder containing 500+ barcodes
- Import time for a large backup file
- Export time for a large workspace
- Restore time from a snapshot
- QR preview generation time (cache miss)

Record the device and browser used for the baseline so future comparisons are
meaningful.

---

## Usage

1. Before a refactoring phase begins, run Section B in full and confirm all pass.
2. Record Section C timings if this is the first run or if the phase touches
   rendering, storage, or import/export.
3. Perform the refactoring work for the phase.
4. Run Section B again in full.
5. Compare Section C timings if relevant.
6. Any regression blocks phase completion until resolved.

This document should be updated whenever a new feature is added, so the baseline
always reflects the current intended behavior.

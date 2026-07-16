# Purpose

This document is the permanent engineering standard for refactoring PA — Process Assistant.

PA is currently a production userscript centered around `PA.js`. It runs on live browser pages, stores user data locally through GM storage and `localStorage`, injects a floating UI, manages barcode/bookmark/todo workflows, sends notifications, integrates with page targets, and supports Amazon/Printmon/ZPL printing behavior.

These rules exist because a refactor of PA can break production behavior even when the code still loads. In this project, behavior includes all visible UI behavior, all storage keys and stored object shapes, all print behavior, all notification timing, all cross-tab sync behavior, all keyboard/page-send behavior, all import/export compatibility, and all startup ordering.

A PA refactor is only successful when the user cannot tell that the internal structure changed.

These rules apply to every future change whose purpose is modularization, extraction, cleanup, file splitting, dependency isolation, or architectural reorganization.

They are specific to the current PA codebase and must be read together with:

- `analysis/PA_Code_Discovery.md`
- `architecture/Refactor_Plan.md`
- `PA.js`

# Core Principles

## 1. Preserve Behavior Exactly

Every existing PA behavior must remain identical unless a separate behavior-change task explicitly approves a change.

Behavior includes:

- Userscript startup behavior.
- Floating button behavior.
- Default hidden panel state.
- Panel resize behavior.
- Panel/modal auto-close timing.
- Tab switching behavior.
- Folder/subfolder navigation.
- Barcode creation, editing, previewing, printing, copying, moving, deleting, and sending to page.
- Bookmark creation, editing, moving, deleting, rendering, favicon fallback, and search.
- Todo creation, editing, completion, recurrence, archive, subtasks, reminders, snooze, wellness reminders, and Pomodoro state.
- Import/export/backup schema and merge behavior.
- Printmon/ZPL/local bridge behavior.
- Footer quote/status behavior.
- Notification behavior.
- Cross-tab synchronization behavior.
- All current storage keys and data shapes.

## 2. Preserve Storage Compatibility

No refactor may change storage key names, stored object shapes, default values, fallback behavior, cache behavior, or import/export behavior.

The following keys are production contracts:

- `PA`
- `bm_last_copied`
- `bm_qr_preview_cache`
- `bm_qr_preview_prefetch_last_run`
- `bm_folders`
- `bm_subfolders`
- `bm_barcodes`
- `bm_bookmarks`
- `bm_bookmark_folders`
- `bm_bookmark_subfolders`
- `bm_bookmark_no_defaults_migrated`
- `bm_tasks`
- `bm_todo_projects`
- `bm_wellness_settings`
- `bm_print_server_override`
- `bm_print_log`
- `bm_panel_size`
- `bm_barcode_modal`

## 3. Preserve Backward Compatibility

During refactor, current function names remain compatibility contracts until explicitly retired in a separate approved compatibility-cleanup task.

Examples of compatibility-sensitive names:

- `gmGet`
- `gmSet`
- `renderFolders`
- `renderBookmarks`
- `renderTasksList`
- `showBigBarcodeModal`
- `showImportModal`
- `showBarcodeForm`
- `showBookmarkForm`
- `showFolderForm`
- `showTextPrintModal`
- `showFlash`
- `copyToClipboard`
- `sendValueToPage`
- `sendClipboardToPage`
- `printBarcodeValue`
- `printTextLabel`
- `buildFullBackupData`
- `importBackupData`
- `initialize`
- `togglePanel`
- `updateFooterCount`
- `window.bmSwitchTab`

## 4. Refactor One Logical Module at a Time

A refactor commit must affect only one logical PA module.

Examples of one logical module:

- Storage key registry only.
- Barcode data only.
- Bookmark data only.
- Todo data only.
- QR cache only.
- Flash/status service only.
- Print config/log only.
- Page integration only.
- Bookmark UI only.

Invalid mixed-module commits:

- Moving barcode data and Todo UI in the same commit.
- Extracting storage and changing print behavior in the same commit.
- Moving CSS while extracting render functions.
- Renaming functions while moving files.
- Cleaning unrelated formatting while extracting a module.

## 5. Every Refactor Must Be Reversible

A refactor must be revertible without data migration and without manual user repair.

A valid PA refactor has a rollback plan before the patch is accepted.

A rollback plan must say:

- Which files revert.
- Which compatibility wrapper remains or is restored.
- Why storage data remains valid after rollback.
- Which test checklist proves rollback safety.

## 6. Observable Behavior Must Match

Observable behavior includes more than UI appearance.

For PA, observable behavior includes:

- Storage reads/writes.
- Order of startup side effects.
- Notification permission requests.
- Reminder scheduling.
- Print URL/ZPL generation.
- Keyboard events sent to host pages.
- DOM event capture behavior through `unsafeWindow`.
- Footer quote fetch and click behavior.
- Import merge counts and dedupe behavior.
- QR preview cache timing.
- Cross-tab update behavior.

## 7. Production Beats Architecture

If the clean modular boundary conflicts with current production behavior, preserve production behavior.

The target architecture must adapt to PA. PA must not be forced to fit a generic architecture.

# Core Modules

The following are PA's current logical modules. All refactor work must map to exactly one of these modules or explicitly create a new approved module boundary.

| Module | Current responsibility | Risk |
|---|---|---|
| Userscript runtime contract | Metadata, grants, version, update-check | Medium |
| Storage layer | `gmGet`, `gmSet`, localStorage mirroring | High |
| Runtime cache layer | Barcode/folder/task cache, QR cache, clipboard cache | Medium |
| Folder data | Barcode folders and subfolders | High |
| Barcode data | Barcode CRUD and batch operations | High |
| Bookmark data | Bookmark folders, subfolders, records | Medium |
| Todo data | Tasks, projects, NLP, recurrence | High |
| Wellness data | Wellness settings and timing | Medium |
| Reminder/notification service | Notifications, audio, reminder scheduler | High |
| Import/export/backup service | CSV/TXT parsing, backup payloads, merge import | High |
| Print service | Print config, logs, ZPL, bridge, Printmon | Very High |
| Page integration service | Clipboard, selected text, keyboard dispatch | High |
| UI lifecycle | Modal/panel timers and close behavior | High |
| UI shell | Floating button, panel, settings, search | Very High |
| Tab system | Tab registration and switching | High |
| Bookmark UI | Bookmark forms and renderer | Medium |
| Todo UI | Todo tab, filters, modals, time picker | Very High |
| Barcode forms | Folder/barcode forms, validation, preview | High |
| Barcode renderer | Folder grid, subfolder cards, barcode cards | Very High |
| Barcode detail modal | Big modal, print preview, restore state | High |
| Event layer | Cross-tab sync, DOMContentLoaded, runtime listeners | Medium |
| Bootstrap | `initialize`, final startup ordering | Very High |
| CSS injection | `GM_addStyle` payload | High |

# Module Extraction Rules

## Extraction Readiness Requirements

A module is ready for extraction only when all of the following are true:

1. The module boundary is listed in `architecture/Refactor_Plan.md` or approved as an amendment.
2. Every function to be moved is listed by current name.
3. Every global variable used by the module is listed.
4. Every storage key read or written by the module is listed.
5. Every DOM root or DOM selector used by the module is listed.
6. Every external API used by the module is listed.
7. A characterization test or manual checklist exists for the module.
8. A rollback plan exists.
9. The extraction does not require storage migration.
10. The extraction does not require behavior changes.

## Module Extraction Must Preserve Current Calls

When a module is extracted, existing call sites must keep working.

Allowed patterns:

- Move function implementation behind a same-name facade.
- Export a module object while preserving the old top-level function name.
- Wrap a moved function with a compatibility function that delegates to the module.

Not allowed:

- Updating call sites and changing function names in the same patch.
- Moving a function and changing its arguments.
- Moving a function and changing its return type.
- Moving a function and changing sync/async behavior.

## Extraction Order Rules

Extraction must follow dependency direction:

1. Constants and pure utilities.
2. Storage facade.
3. Cache services.
4. Data modules.
5. Shared services.
6. UI lifecycle.
7. UI shell and tabs.
8. Feature UIs.
9. Renderers.
10. Runtime events.
11. Bootstrap.
12. CSS boundary, only if separately approved.

A module may not be extracted before its dependencies are stable behind compatibility facades.

## UI Extraction Rules

UI modules are extraction-late modules.

Before any UI module moves, the patch must list:

- The DOM roots it owns.
- The DOM roots it reads but does not own.
- The events it registers.
- The persistent state it reads/writes.
- The render functions it calls.
- The modals it opens or closes.

For PA, UI roots include but are not limited to:

- `panel`
- `floatingButton`
- `floatingContainer`
- `floatingSnoozeLabel`
- `tabBar`
- `tabContentContainer`
- `folderDisplay`
- `formWrapper`
- `bookmarksTabContent`
- `bookmarkFormWrapper`
- `bookmarkDisplay`
- `todoTabContent`
- `footer`
- `footerLeft`
- `footerCenter`
- `footerRight`
- `searchHost`

## Renderer Extraction Rules

`renderFolders`, `renderBookmarks`, and `renderTasksList` are compatibility-sensitive.

A renderer may move only when:

- Its data module has already been extracted or wrapped.
- Its service dependencies have already been extracted or wrapped.
- Its footer update behavior is preserved.
- Its tab visibility behavior is preserved.
- Its selected-item state behavior is preserved.
- Its context menu behavior is preserved.

## Print Extraction Rules

Print extraction is high-risk and must be late.

No print function may move until tests or manual baselines exist for:

- Code128 print path.
- QR print path.
- Text label print path.
- ZPL bridge available.
- ZPL bridge unavailable.
- Printmon HTTP fallback.
- Print log add/update behavior.
- Badge ID cookie behavior.
- Server override behavior.

The print pipeline must not be split or reordered casually. Current comments in `PA.js` explicitly state that printer behavior should not be split/reordered without printer access and regression tests.

# Function Rules

## When Functions Can Move

A function can move only when:

- Its current name remains callable.
- Its arguments remain identical.
- Its return value remains identical.
- Its sync/async behavior remains identical.
- Its side effects remain identical.
- Its dependencies are available through explicit imports, adapters, or compatibility facades.
- Its tests/checklist pass before and after the move.

## When Functions Cannot Move

A function must not move when:

- It depends on a global that has not been listed.
- It depends on DOM roots that have not been initialized at the new execution point.
- It relies on hoisting/order in a way that has not been preserved.
- It has nested functions that close over module-local state not yet modeled.
- It is part of the print pipeline and print baselines do not exist.
- It is part of bootstrap and startup-order baselines do not exist.

## Function Rename Rules

Function renames are not part of refactor extraction.

A function can be renamed only in a separate, explicitly approved compatibility-cleanup task after:

1. The module has already been extracted.
2. All call sites are known.
3. A same-name compatibility wrapper exists for at least one release/checkpoint.
4. Tests prove both old and new names behave identically.
5. The rollback strategy restores the old name without data migration.

Silent renames are forbidden.

## Compatibility Wrapper Rules

A compatibility wrapper is required when:

- A moved function is still called by existing code using the old name.
- A function is exposed through `window`, such as `window.bmSwitchTab`.
- A moved service is referenced by UI callbacks not yet extracted.
- A module is extracted before all consumers are moved.

A compatibility wrapper must:

- Keep the old function name.
- Preserve argument order.
- Preserve return type.
- Preserve thrown/caught error behavior.
- Preserve `Promise` behavior for async functions.
- Preserve side effects.

## Async Function Rules

Async functions must remain async.

A refactor must not change:

- `async` to sync.
- sync to `async`.
- Promise resolution timing.
- internal timeout/retry timing.
- callback order.

This is especially important for:

- `getFolders`
- `getBarcodes`
- `idbAddBarcode`
- `idbUpdateBarcode`
- `idbDeleteBarcode`
- `moveBarcodesToFolder`
- `updateFolderBarcodesFormat`
- `mergeImportData`
- `buildFullBackupData`
- `importBackupData`
- `renderFolders`
- `renderTasksList`
- `initialize`
- print functions that return promises

# Storage Rules

## GM Storage Rules

`gmGet` and `gmSet` are production contracts.

Rules:

- Do not change `gmGet` fallback behavior.
- Do not change `gmSet` write order.
- Do not remove localStorage mirroring.
- Do not remove GM backfill behavior from localStorage.
- Do not change how JSON parse failures are handled.
- Do not change how missing GM APIs are handled in mock/non-userscript contexts.
- Do not change behavior for async-looking GM values.

## localStorage Rules

localStorage is not temporary in PA. It is part of the compatibility model.

Rules:

- Do not remove localStorage mirrors.
- Do not change direct localStorage keys.
- Do not change modal restore behavior for `bm_barcode_modal`.
- Do not change QR preview cache format.
- Do not change QR prefetch timestamp format.
- Do not change `storage` event behavior for `bm_folders` and `bm_barcodes`.

## Cache Rules

Caches are behavioral because they affect rendering, sync, and performance-visible timing.

Rules:

- Do not remove dirty flags.
- Do not change when `barcodesCacheDirty` is set.
- Do not change when `foldersCacheDirty` is set.
- Do not change task cache invalidation behavior.
- Do not change QR preview cache max size without a separate approved performance task.
- Do not change QR prefetch interval without a separate approved behavior/performance task.
- Do not change `requestIdleCallback` fallback behavior.

## Migration Rules

Storage migrations are forbidden during refactor unless a separate migration plan is approved.

If a future change truly requires migration, it must be its own task and must include:

- Old schema.
- New schema.
- Migration trigger.
- Idempotency proof.
- Rollback behavior.
- Backup/restore compatibility.
- User-data safety checklist.

Refactor patches must not include storage migrations.

## Storage Key Rules

Storage key strings must not change.

A patch touching a storage key must include a storage-key checklist:

- Key name unchanged.
- Stored shape unchanged.
- Default value unchanged.
- Import/export behavior unchanged.
- Backup payload unchanged.
- Reset behavior unchanged.
- Cross-tab behavior unchanged where applicable.

## Backup Rules

`buildFullBackupData`, `normalizeBackupPayload`, and `importBackupData` define production data portability.

Rules:

- Do not remove fields from backup payloads.
- Do not rename backup fields.
- Do not change `schema` or `schemaVersion` during refactor.
- Do not change import dedupe behavior.
- Do not change import count messages.
- Do not change nested legacy payload compatibility.

# Amazon Boundary Rules

PA must separate general Process Assistant behavior from Amazon-specific/provider behavior over time. Until that boundary is extracted, current behavior must remain unchanged.

## What Belongs in Core

Core is everything that should work in the public GitHub version without Amazon-specific assumptions.

Core includes:

- Userscript runtime contract.
- Storage layer.
- Cache layer.
- Folder and subfolder data model.
- Barcode data model.
- Bookmark data model.
- Todo data model.
- Wellness data model.
- Import/export/backup service.
- Generic notification/reminder service.
- Generic UI shell, tabs, modals, footer, search.
- Generic barcode/QR rendering through `JsBarcode` and `QRCode`.
- Generic clipboard copy.
- Generic selected-text reading.
- Generic send-to-page mechanics, as long as no Amazon-only selector/cookie/protocol is embedded.

## What Belongs in Amazon Providers

Amazon Providers are adapters for Amazon-only production behavior.

Amazon Provider code includes:

- Amazon Printmon behavior.
- Amazon FC Printmon QR limitations.
- ZPL bridge assumptions used to work around Printmon limitations.
- Badge ID lookup from `fcmenu-employeeId` cookie.
- Any future Amazon authentication behavior.
- Any future Amazon-only page selectors.
- Any future Amazon-only workflow integrations.
- Any future Amazon-only API endpoints.
- Any future Amazon-only print templates.

## Amazon Print Rules

Amazon print behavior must be isolated behind a provider boundary only after print baselines exist.

Rules:

- Do not remove Printmon fallback.
- Do not remove ZPL bridge behavior.
- Do not change bridge port `9200` during refactor.
- Do not change Printmon query construction during refactor.
- Do not change `fcmenu-employeeId` cookie behavior during refactor.
- Do not change QR fallback to linear behavior during refactor.
- Do not generalize Amazon print behavior until the provider boundary exists and current behavior is covered.

## Amazon Authentication Rules

There is no explicit Amazon authentication module currently extracted.

If future code introduces Amazon authentication:

- It must not enter Core.
- It must live under an Amazon provider boundary.
- It must not leak Amazon-only assumptions into storage, UI shell, or generic data modules.
- It must not be required for the public GitHub version to load.

## Amazon-Only Integration Rules

Any Amazon-only integration must be placed in an Amazon provider boundary if it uses:

- Amazon cookies.
- Amazon-specific DOM selectors.
- Amazon-specific URLs.
- Amazon-specific print endpoints.
- Amazon-specific authentication.
- Amazon-specific workflow assumptions.

Everything else belongs in Core.

## Boundary Enforcement Rule

A patch must declare whether it touches:

- Core only.
- Amazon provider only.
- Core plus provider boundary.

A patch must not mix Core refactor and Amazon behavior changes.

# Public Version Rules

The public GitHub version of PA must remain independent from Amazon-specific behavior.

## Public Version Must Load Without Amazon

The public version must be able to load when:

- No Amazon page is present.
- No `fcmenu-employeeId` cookie exists.
- Printmon is unavailable.
- ZPL bridge is unavailable.
- Amazon-specific page elements do not exist.

Current generic behavior must remain usable:

- Panel opens.
- Barcode/bookmark/todo features work.
- Storage works.
- Import/export works.
- Generic QR/barcode rendering works.
- Notifications work when browser permissions allow.

## Amazon Providers Must Be Optional

Amazon-specific modules must eventually be optional adapters.

Rules:

- Core must not import Amazon providers directly unless behind a provider registry/adapter boundary.
- Missing Amazon provider must not prevent PA startup.
- Missing Printmon/ZPL bridge must not prevent non-print features.
- Public GitHub docs must not require Amazon credentials or Amazon environment to understand or run basic PA.

## Public Storage Must Not Depend on Amazon

No public storage schema may require Amazon-only fields.

Amazon-only provider data, if added later, must use provider-scoped keys or provider-scoped subobjects and must not be required by Core.

## Public UI Must Not Require Amazon

Core UI labels, layout, navigation, and tabs must not assume Amazon.

Amazon-specific UI may appear only when provider behavior is available or explicitly configured.

Current behavior that runs on all pages through `@match *://*/*` must be preserved until a separate approved public/provider packaging plan exists.

# Commit Rules

Every refactor commit must include the following metadata in the commit message, PR description, or patch note.

## Required Commit Fields

### Scope

State exactly one logical module.

Examples:

- `Scope: core/storage-keys`
- `Scope: features/bookmarks/data`
- `Scope: services/page-integration`
- `Scope: ui/lifecycle`

### Risk

Use one of:

- Low
- Medium
- High
- Very High

Risk must match or exceed the risk in `architecture/Refactor_Plan.md`.

### Test Checklist

List the exact checks run.

Examples:

- Syntax check passed.
- Mock harness load passed.
- Barcode CRUD checklist passed.
- Backup round-trip passed.
- Print generated ZPL baseline unchanged.

### Rollback Strategy

State how to revert safely.

Examples:

- Revert this commit only; no storage changes were made.
- Restore compatibility wrapper; module exports are not externally required.
- Revert extracted file and old facade delegation.

## Commit Must Not Include

- Mixed modules.
- Unrelated formatting.
- Behavior changes.
- Hidden optimizations.
- Storage migrations.
- CSS changes unless the scope is `ui/styles`.
- Function renames unless the commit is an approved compatibility cleanup task.

# Patch Rules

Every refactor patch must contain a patch note with these fields.

## Required Patch Fields

### Risk Level

Use the PA risk scale:

- Low
- Medium
- High
- Very High

### Affected Modules

List exactly which PA module is touched.

If more than one logical module is listed, the patch must be split unless the second module is a required compatibility facade.

### Changed Functions

List every moved or edited function by current name.

If no functions are changed, write:

- `Changed Functions: none`

### Migration Notes

State explicitly:

- Storage migration: yes/no
- Function rename: yes/no
- Compatibility wrapper: yes/no
- Behavior change: yes/no
- Public version impact: yes/no
- Amazon provider impact: yes/no

For normal refactor patches, the expected answer is:

- Storage migration: no
- Function rename: no
- Behavior change: no

### Regression Checklist

List module-specific and global checks.

Minimum global checks:

- `PA.js` syntax still valid.
- Mock harness loads.
- Floating button opens panel.
- Existing storage loads.
- No storage keys changed.
- No public function names removed.
- Rollback path documented.

## Patch Note Template

```text
Risk Level:
Affected Modules:
Changed Functions:
Migration Notes:
  Storage migration:
  Function rename:
  Compatibility wrapper:
  Behavior change:
  Public version impact:
  Amazon provider impact:
Regression Checklist:
Rollback Strategy:
```

# Testing Rules

## Global Tests Required Before Any Refactor Commit

Every refactor commit must pass:

1. Syntax validation for the assembled userscript.
2. Mock harness load validation through `mock_test.html`.
3. Floating button appears and opens the panel.
4. Panel remains hidden by default on startup.
5. Existing storage data loads without migration.
6. No storage key strings changed.
7. No compatibility-sensitive function names removed.
8. No unrelated module behavior changed.

## Storage Tests

Required when touching storage, cache, data modules, import/export, reset, or backup:

- `gmGet` returns the same values for GM-backed keys.
- `gmGet` returns localStorage fallback when GM is unavailable.
- `gmSet` writes GM and localStorage as before.
- JSON parse fallback behavior is unchanged.
- `bm_folders` shape unchanged.
- `bm_subfolders` shape unchanged.
- `bm_barcodes` shape unchanged.
- `bm_bookmarks` shape unchanged.
- `bm_bookmark_folders` shape unchanged.
- `bm_bookmark_subfolders` shape unchanged.
- `bm_tasks` shape unchanged.
- `bm_todo_projects` shape unchanged.
- `bm_wellness_settings` shape unchanged.
- Full backup payload unchanged.

## Barcode Tests

Required when touching barcode data, barcode forms, renderer, QR cache, print, or import/export:

- Create barcode.
- Edit barcode.
- Delete barcode.
- Move barcode to folder.
- Move barcode to subfolder.
- Batch delete barcodes.
- Batch move barcodes.
- Generate QR preview.
- Generate linear preview.
- Open big barcode modal.
- Restore barcode modal from `bm_barcode_modal`.
- Copy barcode value.
- Send barcode value to page.
- Print barcode path unchanged.

## Folder Tests

Required when touching folder data, folder UI, barcode renderer, import/export:

- Create folder.
- Rename folder.
- Delete folder.
- Create subfolder.
- Rename subfolder.
- Delete subfolder.
- Move folder into another folder.
- Move subfolder to root.
- Move subfolder to another folder.
- Cascade barcode updates/deletes as current behavior dictates.

## Bookmark Tests

Required when touching bookmark data/UI/import/export/footer/search:

- Create bookmark folder.
- Create bookmark subfolder.
- Add bookmark.
- Edit bookmark.
- Delete bookmark.
- Move bookmark.
- Batch move bookmarks.
- Favicon URL/fallback behavior unchanged.
- Legacy default migration behavior unchanged.
- Bookmark search unchanged.

## Todo Tests

Required when touching Todo data/UI/reminders/wellness/import/export/footer/search:

- Create task.
- Edit task.
- Complete task.
- Uncomplete task.
- Archive behavior unchanged.
- Recurring task behavior unchanged.
- NLP due-date parsing unchanged.
- Tags extraction unchanged.
- Project create/rename/delete unchanged.
- Subtasks behavior unchanged.
- Reminder time behavior unchanged.
- Snooze behavior unchanged.
- Pomodoro state preserved.
- Todo search/filter/sort unchanged.

## Reminder and Notification Tests

Required when touching reminders, wellness, notification service, Todo UI, bootstrap:

- Notification permission behavior unchanged.
- GM notification path unchanged.
- Native notification path unchanged.
- Chrome history notification path unchanged.
- UI fallback flash behavior unchanged.
- Reminder sound unlock behavior unchanged.
- Task reminder sends at due time.
- Snoozed reminder behavior unchanged.
- Wellness water reminder behavior unchanged.
- Wellness stretch reminder behavior unchanged.
- Notification click opens Todo tab as before.

## Print Tests

Required when touching any print module, text print UI, barcode renderer print actions, or Amazon provider boundary:

- Default print server resolution unchanged.
- Print server override unchanged.
- Print log add/update/show modal unchanged.
- Badge ID cookie lookup unchanged.
- QR ZPL unchanged for same input.
- Code128 ZPL unchanged for same input.
- Text ZPL unchanged for same input.
- Bridge availability check behavior unchanged.
- Bridge POST behavior unchanged.
- Printmon fallback URL unchanged.
- QR fallback to linear behavior unchanged.
- Copy count/quantity behavior unchanged.
- Text label modal behavior unchanged.

## Page Integration Tests

Required when touching clipboard/page-send/context menu/host-page integration:

- Copy to clipboard unchanged.
- Cached clipboard fallback unchanged.
- Manual prompt fallback unchanged.
- Selected text detection unchanged.
- Active input/textarea selected text detection unchanged.
- `getTargetElement` avoids PA panel as before.
- Synthetic keyboard events dispatch in same order: `keydown`, `keypress`, `keyup`.
- `sendValueToPage` sends Enter after value as before.

## UI Tests

Required when touching any UI module:

- Floating button exists.
- Panel opens/closes.
- Panel hidden by default.
- Panel resize persists.
- Settings dropdown opens/closes.
- Search host opens/closes.
- Tab switching unchanged.
- Modals open/close.
- Modal auto-close behavior unchanged.
- Footer count/status unchanged.
- About modal unchanged.
- Action dropdown unchanged.
- CSS class names unchanged unless the scope is explicitly `ui/styles`.

## Cross-Tab Sync Tests

Required when touching storage, cache, folder/barcode data, renderer, or event layer:

- `bm_folders` GM value changes update local cache and render.
- `bm_barcodes` GM value changes update local cache and render.
- `storage` event for `bm_folders` triggers render/footer update.
- `storage` event for `bm_barcodes` triggers render/footer update and QR prefetch.

# Definition of Done

A PA refactor is complete only when all of the following are true:

1. The patch touches one logical module only.
2. The patch note includes risk, affected modules, changed functions, migration notes, regression checklist, and rollback strategy.
3. No behavior changes were introduced.
4. No storage keys changed.
5. No stored object shapes changed.
6. No function was silently renamed.
7. Existing public/internal compatibility functions still exist.
8. Required tests/checklists for the affected module passed.
9. Global smoke checks passed.
10. Rollback is possible without storage migration.
11. `architecture/Refactor_Plan.md` remains accurate or is updated in the same documentation-only scope.
12. `analysis/PA_Code_Discovery.md` is updated only if the actual current architecture changed and that update is part of the approved documentation scope.
13. The public GitHub version remains independent of Amazon-only requirements.
14. Amazon provider behavior remains unchanged unless the patch is explicitly scoped to Amazon provider behavior.
15. The user-visible UI and data behavior are indistinguishable from before the refactor.

# Things That Must Never Be Done

## Behavior and Feature Restrictions

- No behavior changes hidden inside refactor commits.
- No feature additions inside refactor commits.
- No hidden optimizations.
- No timing changes unless explicitly approved.
- No UI/UX changes unless explicitly approved.
- No storage schema changes inside refactor commits.
- No import/export schema changes inside refactor commits.

## Function and Module Restrictions

- No silent renames.
- No removing compatibility functions during extraction.
- No changing function arguments during extraction.
- No changing return types during extraction.
- No changing sync/async behavior.
- No mixed-module commits.
- No moving UI and data logic in the same commit.
- No moving print code with unrelated cleanup.
- No unrelated formatting cleanup.
- No drive-by comment rewrites unrelated to the module being refactored.

## Storage Restrictions

- No storage key renames.
- No deleting stored fields.
- No changing default folders/projects/settings during refactor.
- No changing backup schema during refactor.
- No changing QR cache format during refactor.
- No changing `bm_barcode_modal` restore format during refactor.
- No changing reset behavior during refactor.

## Amazon/Public Boundary Restrictions

- No Amazon-only assumptions in Core.
- No making Amazon required for public GitHub usage.
- No changing Printmon/ZPL behavior as part of generic refactor.
- No removing `fcmenu-employeeId` badge lookup without an approved Amazon-provider task.
- No removing `unsafeWindow` event behavior without an approved page-integration task.
- No changing `@match *://*/*` in a refactor task.

## Testing and Release Restrictions

- No accepting refactor commits without module-specific tests/checklists.
- No accepting high-risk extraction without rollback notes.
- No accepting print extraction without print baselines.
- No accepting bootstrap extraction without startup-order verification.
- No accepting UI extraction without panel/tab/modal smoke tests.

# PA Refactor Checklist

Use this checklist before approving any refactor patch.

```text
Scope:
Risk Level:
Affected Module:
Changed Functions:
Storage Keys Touched:
DOM Roots Touched:
Amazon Boundary Touched:
Public Version Impact:
Compatibility Wrappers Required:
Behavior Change: no
Storage Migration: no
Function Rename: no
Rollback Strategy:
Tests Run:
```

A patch that cannot fill this checklist is not ready.

# Permanent Rule

PA refactoring is successful only when architecture improves and production behavior remains exactly the same.

If there is a conflict between cleaner structure and current behavior, current behavior wins.

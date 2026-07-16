# Module Ownership

## Purpose

This document defines what each module owns and where its responsibility boundary
lies. It complements the Dependency Graph: the graph says which dependencies are
allowed, this document says what each module is responsible for and what its
public entry point is.

## Status Column

The Public API column reflects the current implementation, verified against the
source. Modules marked "planned" do not yet have a service wrapper; they are
scheduled for creation in Phase 3 of the Refactoring Master Plan. Until then,
their logic exists as loose functions with module-level state.

## Platform Modules

| Module | Type | Public API | Status | Depends On |
|---|---|---|---|---|
| Storage | Platform | StorageService | Exists | StorageEngine |
| Storage (raw I/O) | Platform | StorageEngine | Exists | GM storage, localStorage |
| Serializer | Platform | (none yet) | Planned | Storage |
| Backup | Platform | (none yet) | Planned | Serializer, Storage |
| Workspace | Platform | WorkspaceService | Exists | Serializer, Storage |
| Workspace (provider) | Platform | LocalWorkspaceProvider | Exists | File System Access API |
| Workspace (diagnostics) | Platform | WorkspaceDiagnostics | Exists | (none) |
| Cloud | Platform | (none yet) | Planned | Backup |
| Platform UI Utilities | Platform | (none yet) | Planned | (none) |

Note: Serializer, Backup, and Cloud exist today only as inline logic inside
`buildFullBackupData()` and related functions. They have contracts (target
architecture) but no service implementation yet. Their separation is Phase 3 work.

## Feature Modules

| Module | Type | Public API | Status | Depends On |
|---|---|---|---|---|
| Folder | Feature | FolderDataService | Exists | Storage |
| Notebook | Feature | NoteService | Exists | Storage |
| Barcode | Feature | (loose functions) | Planned | Storage, Print |
| Bookmark | Feature | BookmarkService | Planned | Storage |
| Todo | Feature | TaskService | Planned | Storage |
| Wellness | Feature | WellnessService | Planned | Storage, Notification |
| Print | Feature | (loose functions) | Planned | (none) |

## Ownership Boundaries

Each module owns its domain logic and nothing else.

Storage owns persistence access and the storage abstraction. It does not own
serialization, business logic, or UI.

Workspace owns the connection to a local directory, snapshot lifecycle, and
workspace metadata. It does not own export packages or serialization format.

Folder owns folder and subfolder CRUD. Notebook owns note CRUD, folders, and
search. Each feature owns only its own domain models, business rules, and
domain-specific UI.

No feature owns shared platform state. No feature owns another feature's data.

## Relationship to Other Documents

- The Dependency Graph (`Architecture/Dependency-Graph.md`) shows allowed
  dependency directions.
- The Contracts (`Contracts/`) define the target responsibilities each module
  must satisfy.
- This document maps those responsibilities to concrete modules and their current
  implementation status.

## Maintenance

Update the Status column as planned services are implemented during refactoring.
When a module marked "Planned" gains its service wrapper, change its Public API
to the service name and its Status to "Exists". This document should always
reflect the true state of the code, not the target state — the target state
lives in the Contracts.

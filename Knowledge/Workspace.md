# Workspace

## Overview

Workspace is a platform subsystem of the PA platform.

It manages the connection between the platform and a user-selected local directory, coordinates workspace lifecycle, persists workspace metadata, and coordinates automatic snapshots of platform data.

Workspace is a distinct architectural concept with its own service, provider abstraction, state machine, and diagnostic layer.

## Purpose

The purpose of the Workspace subsystem is to provide a stable, user-controlled persistence boundary between platform data and the local file system.

Workspace enables the platform to save and restore its state to and from a directory chosen by the user, without exposing file system details to application features.

## Role Within the Platform

Workspace belongs to the shared platform infrastructure.

It sits above Storage in the dependency hierarchy and coordinates file system persistence through its own provider abstraction.

Application features do not interact with Workspace directly. They interact with platform services, and Workspace manages the persistence boundary on their behalf.

## Snapshot and Export Package

The platform produces two distinct artifacts from the same underlying data format.

A Snapshot is an automatic, rotating local recovery point managed entirely by Workspace. Snapshots are written to a dedicated subdirectory of the user-selected workspace folder, are limited to a maximum of ten files, and the oldest is removed when the limit is reached. Snapshots are intended for local recovery and are not designed for transfer between systems. Restore from a Snapshot is coordinated by Workspace.

An Export Package is a portable artifact produced on user request and delivered as a browser download. Export Packages are not subject to retention limits and may be imported on any system at any time. Export and Import are coordinated by the Backup subsystem.

Both artifacts share the same serialized file format and the same schema version. The Serializer subsystem owns the format. Neither Workspace nor Backup owns the serialization schema.

## Responsibilities

The Workspace subsystem is responsible for:

- Managing the connection to a user-selected local directory.
- Maintaining workspace lifecycle state.
- Persisting and restoring workspace metadata.
- Coordinating manual and automatic workspace saves.
- Coordinating manual and automatic workspace restores.
- Scheduling and executing automatic Snapshots.
- Pruning old Snapshots to enforce retention limits.
- Emitting workspace lifecycle events for platform listeners.
- Abstracting the underlying file system provider.

Workspace is not responsible for Export Package generation, serialization format decisions, or user interface rendering.

## Platform Dependencies

The current implementation depends on:

- Platform Storage, through Tampermonkey storage primitives (`gmGet`, `gmSet`), for persisting workspace metadata.
- The File System Access API (Chromium), through `LocalWorkspaceProvider`, for file system operations.
- An internal `IndexedDB` database for persisting the directory handle across page loads.

Workspace abstracts these dependencies behind its own service and provider boundaries.

The internal use of IndexedDB by Workspace for its own operational state is not governed by the Storage contract, which applies to application and platform data exposed through public Storage interfaces.

## Data Ownership

Workspace owns:

- Workspace connection state.
- Workspace lifecycle state machine.
- Workspace metadata (workspace ID, creation time, last save time, last snapshot time, snapshot count, scheduled snapshot timestamp).
- The directory handle record stored in IndexedDB.
- Snapshot files written to the workspace backup directory.

Workspace does not own:

- Application feature data.
- Serialization of platform data.
- Export Package generation.
- Cloud synchronization state.

## Architectural Boundaries

Workspace exposes its capabilities through `WorkspaceService`.

`WorkspaceService` is the single entry point for all workspace operations.

`LocalWorkspaceProvider` implements file system access behind a provider interface that allows future providers to be introduced without changing `WorkspaceService`.

`WorkspaceState` defines a lifecycle state machine with discrete states: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, and `ERROR`.

`WorkspaceDiagnostics` provides an isolated diagnostic and logging layer.

No application feature should access file system handles, workspace metadata, or Snapshot files directly.

## User Interaction Responsibilities

Workspace requires the user to select a local directory when connecting for the first time.

Permission to access the selected directory is requested and verified through the provider abstraction.

Workspace does not render user interface. User interaction is coordinated by the platform UI layer, which calls `WorkspaceService` methods in response to user actions.

## Relationship with Storage

Workspace uses platform Storage to persist workspace metadata across page loads.

Workspace metadata is stored under a dedicated storage key (`WORKSPACE_METADATA`) and is not shared with application features.

Workspace does not delegate its file system operations to the Storage subsystem. File system access is managed through its own provider abstraction.

## Relationship with Application Features

Application features do not depend on Workspace directly.

Workspace emits lifecycle events that platform listeners may observe, such as `workspace:snapshot-dirty`, `workspace:snapshot-saved`, and `workspace:metadata-changed`.

Application data is included in Snapshots through a platform-level data collection mechanism, not through direct feature coupling.

## Future Evolution

The current implementation supports only `LocalWorkspaceProvider` using the Chromium File System Access API.

The architecture explicitly reserves space for future cloud providers behind the same provider abstraction boundary.

Future phases may introduce Snapshot compression, additional retention strategies, cross-tab synchronization improvements, and additional provider implementations.

Provider-specific behavior should remain isolated behind the provider interface as the subsystem evolves.

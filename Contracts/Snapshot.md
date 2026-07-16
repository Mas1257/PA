# Snapshot

## Purpose

This document defines the architectural contract for the snapshot subsystem within the PA platform.

The Snapshot subsystem is responsible for managing automatic local recovery points while remaining independent from export functionality, cloud services, and feature-specific business logic.

## Responsibilities

The Snapshot subsystem shall:

- Create automatic recovery snapshots.
- Enforce retention limits.
- Validate snapshot integrity.
- Support schema versioning.
- Coordinate snapshot lifecycle within Workspace.

## Ownership

Snapshot owns:

- Snapshot file lifecycle.
- Retention policy enforcement.
- Snapshot scheduling coordination.
- Schema version tagging.

Snapshot does not own:

- Export package generation.
- Serialization format.
- Cloud synchronization.
- User interface.

## Guarantees

The Snapshot subsystem guarantees:

- Schema-versioned snapshot payloads.
- Immutable snapshot files after creation.
- Consistent retention enforcement.
- Predictable recovery behavior.

## Allowed Dependencies

Snapshot may depend on:

- Serializer.
- Workspace.
- Storage.
- Platform infrastructure.

Snapshot must not depend on:

- Barcode.
- Bookmark.
- Notebook.
- Todo.
- Any feature-specific implementation.

## Required Behavior

Every snapshot payload must include schema identification and version information. The system must handle or reject older schema versions during restore.

Existing snapshot files in the local file system must not be appended to or modified after creation.

## Forbidden Actions

Snapshot must never:

- Modify existing snapshot files.
- Generate export packages.
- Execute business rules.
- Render user interface.

## Evolution Rules

Future snapshot implementations may introduce compression, additional retention strategies, and schema migration while preserving immutability and versioning defined in this contract.

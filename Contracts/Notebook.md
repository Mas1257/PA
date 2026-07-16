# Notebook

## Purpose

This document defines the architectural contract for the Notebook subsystem within the PA platform.

The Notebook subsystem is responsible for managing note content lifecycle while remaining independent from storage implementation, user interface rendering, and other feature modules.

## Responsibilities

The Notebook subsystem shall:

- Create notes.
- Update note content.
- Delete notes.
- Organize notes in folders.
- Search notes.
- Sanitize note content for safe rendering.

## Ownership

Notebook owns:

- Note domain data.
- Note content sanitization.
- Note search logic.
- Note folder organization.

Notebook does not own:

- Storage persistence.
- Rich text rendering engine.
- User interface components.
- Platform infrastructure.

## Guarantees

The Notebook subsystem guarantees:

- Complete service isolation from UI rendering.
- Sanitized content output preventing cross-site scripting.
- Stable note data interfaces.
- Consistent note lifecycle behavior.

## Allowed Dependencies

Notebook may depend on:

- Storage.
- Folder.
- Platform infrastructure.

Notebook must not depend on:

- Barcode.
- Bookmark.
- Todo.
- Any other feature-specific implementation.

## Required Behavior

All rendered note content must pass through a sanitization layer before DOM insertion. Direct assignment to innerHTML without sanitization is forbidden.

NoteService must remain completely isolated from UI rendering.

## Forbidden Actions

Notebook must never:

- Render user interface directly.
- Assign unsanitized content to innerHTML.
- Execute platform infrastructure operations.
- Reference other feature modules.

## Evolution Rules

Future notebook implementations may introduce additional content formats and sanitization strategies while preserving the architectural responsibilities defined in this contract.

# Folder

## Purpose

This document defines the architectural contract for folder management within the PA platform.

The Folder subsystem is responsible for providing hierarchical organization of data across feature modules while remaining independent from business logic, storage implementation, and user interface rendering.

Folder management serves as a shared organizational layer used by multiple features including Barcode and Bookmark.

## Responsibilities

The Folder subsystem shall:

- Create folders and subfolders.
- Rename folders and subfolders.
- Delete folders and subfolders.
- Move folders between hierarchy levels.
- Provide folder path resolution.
- Maintain folder state consistency.

## Ownership

Folder owns:

- Folder hierarchy state.
- Folder lifecycle operations.
- Active folder path resolution.
- Folder navigation coordination.

Folder does not own:

- Feature-specific data within folders.
- Storage persistence implementation.
- User interface rendering.
- Business rules of contained items.

## Guarantees

The Folder subsystem guarantees:

- Consistent folder hierarchy state.
- Encapsulated folder state management.
- Stable folder interfaces.
- Predictable navigation behavior.

## Allowed Dependencies

Folder may depend on:

- Storage.
- Platform infrastructure.

Folder must not depend on:

- Barcode.
- Bookmark.
- Notebook.
- Todo.
- Any feature-specific implementation.

## Required Behavior

Feature modules requiring hierarchical organization should use the Folder subsystem rather than implementing custom folder logic.

Folder state must be encapsulated within the Folder service. Global state variables for active folder tracking are forbidden.

## Forbidden Actions

Folder must never:

- Store folder state in global variables.
- Render user interface.
- Execute feature-specific business rules.
- Reference feature-specific components.
- Duplicate hierarchy logic across features.

## Evolution Rules

Future folder implementations may introduce recursive folder trees, stable folder identifiers, and deeper nesting while preserving the architectural responsibilities defined in this contract.

Implementation-specific folder behavior should remain isolated behind stable platform interfaces.

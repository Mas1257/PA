# Todo

## Purpose

This document defines the architectural contract for the Todo and task management subsystem within the PA platform.

The Todo subsystem is responsible for managing task lifecycle, reminders, and recurrence while remaining independent from wellness functionality, user interface rendering, and other feature modules.

## Responsibilities

The Todo subsystem shall:

- Create and manage tasks.
- Handle task reminders and scheduling.
- Support task recurrence.
- Manage task projects and organization.
- Support subtask management.

## Ownership

Todo owns:

- Task domain data.
- Task lifecycle operations.
- Reminder scheduling logic.
- Recurrence logic.
- Project organization.

Todo does not own:

- Wellness timer logic.
- User interface rendering.
- Storage persistence implementation.
- Notification delivery mechanism.

## Guarantees

The Todo subsystem guarantees:

- Separated task and wellness logic.
- Consistent task lifecycle behavior.
- Stable task data interfaces.

## Allowed Dependencies

Todo may depend on:

- Storage.
- Notification services.
- Platform infrastructure.

Todo must not depend on:

- Barcode.
- Bookmark.
- Notebook.
- Wellness internals.
- Any other feature-specific implementation.

## Required Behavior

Task reminder logic and wellness timer logic must be separated into distinct sub-modules. The reminder check loop must delegate execution to independent modules rather than mixing task and wellness responsibilities.

## Forbidden Actions

Todo must never:

- Mix task logic with wellness timer logic.
- Render user interface directly.
- Reference other feature modules.

## Evolution Rules

Future todo implementations may introduce additional scheduling strategies and organization capabilities while preserving the separation defined in this contract.

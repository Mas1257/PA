# Platform

## Purpose

This document defines the architectural contract for the platform integration layer within the PA platform.

The Platform subsystem is responsible for abstracting runtime-specific APIs so that application logic remains portable across execution environments.

## Responsibilities

The Platform subsystem shall:

- Wrap runtime-specific APIs behind stable abstractions.
- Provide environment detection.
- Abstract Tampermonkey and browser-specific operations.
- Support testing without the runtime environment.

## Ownership

Platform owns:

- Runtime API abstraction.
- Environment compatibility layer.
- Platform adapter interfaces.

Platform does not own:

- Business logic.
- Feature-specific implementations.
- User interface rendering.
- Data persistence logic.

## Guarantees

The Platform subsystem guarantees:

- Stable platform interfaces regardless of runtime.
- Testable application logic without Tampermonkey.
- Consistent API wrapping behavior.

## Allowed Dependencies

Platform may depend on:

- Runtime environment APIs.

Platform must not depend on:

- Any feature-specific implementation.
- Storage.
- User interface.

## Required Behavior

Direct calls to runtime-specific functions such as GM_getValue, GM_setValue, and GM_xmlhttpRequest from within business logic are forbidden. All runtime API access must pass through the platform abstraction layer.

## Forbidden Actions

Platform must never:

- Contain business logic.
- Reference feature-specific components.
- Render user interface.

## Evolution Rules

Future platform implementations may introduce additional runtime adapters while preserving the abstraction boundary defined in this contract.

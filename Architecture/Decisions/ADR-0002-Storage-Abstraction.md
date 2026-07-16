# ADR-0002: Storage Is the Single Persistence Abstraction

## Status

Accepted.

## Context

PA persists data through Tampermonkey storage primitives and localStorage.
Multiple features accessed these directly, and some platform subsystems used
their own private persistence (for example, Workspace uses IndexedDB for a
directory handle).

Without a rule, every feature could invent its own persistence path, making
data migration and cross-tab sync impossible to reason about.

## Decision

Storage is the single abstraction layer between platform modules and physical
persistence for application and platform data exposed through public interfaces.

Internal persistence mechanisms used privately by a platform subsystem for its
own operational state (such as Workspace's IndexedDB directory handle) are not
governed by the Storage contract.

## Consequences

Positive: All application data flows through one abstraction with dual-write and
cross-tab sync. Storage implementations can be replaced without touching features.

Positive: The Workspace IndexedDB usage is explicitly allowed as internal state,
resolving the apparent contract violation found in review.

Negative: Developers must distinguish "application data" (goes through Storage)
from "internal subsystem state" (may use private mechanisms). This distinction
must be documented per subsystem.

## Alternatives Considered

Requiring every subsystem, including internal state, to use Storage exclusively.
Rejected because a directory handle is not application data and forcing it
through the application storage abstraction adds no value and complicates the
Storage contract.

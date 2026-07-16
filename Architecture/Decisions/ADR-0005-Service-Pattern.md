# ADR-0005: Data Layers Use the IIFE Service Pattern

## Status

Accepted.

## Context

Some data layers (Folder, Note) are encapsulated in IIFE service modules with a
frozen public API. Others (Bookmark, Todo, Wellness) are loose collections of
functions with module-level mutable state accessible to any code in the file.

The inconsistency makes the codebase harder to reason about: a developer cannot
predict whether a given feature has an encapsulation boundary.

## Decision

Every data layer is wrapped in an IIFE service module that exposes a frozen
public API and keeps its state private:

```javascript
const XService = (() => {
    let privateState = ...;
    function operation() { ... }
    return Object.freeze({ operation });
})();
```

Data services return results and do not call UI functions directly. UI
coordination happens at the call site.

## Consequences

Positive: Uniform structure. Every feature has a clear boundary and a discoverable
public API. State is protected from accidental external mutation.

Positive: Services become testable in isolation once UI calls are removed.

Negative: Bookmark, Todo, and Wellness require wrapping, and their many call sites
must go through compatibility facades during the transition.

## Alternatives Considered

Leaving the loose-function style for existing features and applying the service
pattern only to new ones. Rejected because it perpetuates two competing patterns
and the review found the loose style directly responsible for global mutable
state leaks.

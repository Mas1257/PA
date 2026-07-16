# ADR-0004: Shared UI Utilities Live in a Platform Layer

## Status

Accepted.

## Context

Code review found that several general-purpose utilities were defined inside
feature sections: `showFlash` in the Barcode section, context menu builders and
clipboard helpers in the Print section, and folder/barcode SVG icons duplicated
across at least five locations.

This created hidden load-order dependencies (features calling `showFlash` had to
load after the Barcode section) and repeated duplication.

## Decision

All general-purpose UI utilities live in a Platform UI Utilities layer that loads
before any feature section. This includes user feedback (`showFlash`), context
menus, clipboard and keyboard helpers, and shared icon factories.

Feature sections consume these utilities and never define their own copies.

## Consequences

Positive: No load-order dependency between features and shared utilities. A single
definition for each utility. Icons and helpers change in one place.

Positive: Establishes a clear layering: Platform Utilities below, features above.

Negative: A migration is required to move existing utilities and remove the
duplicates. This is sequenced as Phase 1 of the Refactoring Master Plan precisely
because later phases depend on it.

## Alternatives Considered

Leaving utilities where they are and documenting the load order. Rejected because
it preserves the fragility: any reordering breaks the application, and the
duplication continues to drift.

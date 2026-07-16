# ADR-0001: Workspace and Backup Are Separate Subsystems

## Status

Accepted.

## Context

PA needs both automatic local recovery points and portable data export. Early
in the architecture work it was unclear whether these should be one subsystem
or two. Both produce a file from the same data, so consolidating them seemed
natural.

Code review of the implementation revealed that the two workflows have different
lifecycles, different triggers, and different destinations.

## Decision

Workspace and Backup are separate platform subsystems.

Workspace owns automatic, rotating, local recovery points (Snapshots) written
to a user-selected directory. Backup owns portable, user-initiated Export
Packages delivered as browser downloads.

Both consume the Serializer for their file format. Neither owns the format.

## Consequences

Positive: Each subsystem has a single clear responsibility. Snapshot retention
logic does not leak into export logic. A user can rely on automatic local
recovery independently of manual portable export.

Positive: Cloud sync can build on Backup without entangling Workspace.

Negative: Two subsystems must be maintained where a naive design would have one.
Some shared logic (file format) must be deliberately routed through Serializer
rather than duplicated.

## Alternatives Considered

A single "Backup" subsystem handling both automatic and manual flows. Rejected
because it merged two lifecycles with different ownership, producing the exact
Snapshot-versus-Backup ambiguity that the review flagged as the most important
architectural issue in the repository.

# ADR-0003: Snapshot and Export Package Are Distinct Artifacts

## Status

Accepted.

## Context

Both the automatic local recovery flow and the manual portable flow produce a
file with the same extension and the same serialized format. The documentation
did not distinguish them, creating ownership ambiguity between Workspace and
Backup.

## Decision

Two distinct named artifacts are defined:

A Snapshot is an automatic, rotating local recovery point managed by Workspace,
written to a subdirectory of the user-selected folder, limited to ten files.

An Export Package is a portable artifact produced on user request, delivered as
a browser download, with no retention limit, importable on any system.

Both share the same serialized format, owned by Serializer. Snapshot creation and
Export are operations; Snapshot and Export Package are artifacts.

## Consequences

Positive: Ownership is unambiguous. Workspace owns Snapshot lifecycle; Backup
owns Export and Import; Serializer owns the format.

Positive: The two flows can evolve independently (for example, Snapshot
compression without touching Export).

Negative: Users and developers must learn two terms for what looks like one file.
This is mitigated by consistent terminology in the documentation.

## Alternatives Considered

Treating both as the same "backup file." Rejected because it collapsed two
distinct lifecycles and left the ownership boundary between Workspace and Backup
undefined.

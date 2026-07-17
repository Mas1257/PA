# Repository Health

This is the one-page status of the project. Read it after `REPOSITORY.md` to see
where things stand in under a minute.

Last updated: at creation of governance documents, before Phase 0 execution.

## Governance

```
Foundation            Complete
Architecture          Complete
Contracts             Complete (5 / 5)
Knowledge             Core complete; some feature docs pending
Dependency Graph      Complete
Module Ownership      Complete
ADR Coverage          5 records + template
Process               Complete (Definition of Done, Impact Matrix)
Verification          Defined, not yet run
Master Plan           Complete
```

## Refactoring Progress

The phase tracker below is the primary source of truth for project status.
It is small and discrete, so it is kept accurate by hand.

```
Phase 0   Baseline and Verification         [x] complete
Phase 1   Platform Foundation               [~] in progress (utilities relocated)
Phase 1.5 Cross-Cutting Standardization      [ ] not started
Phase 2   Critical Bug Fixes                [ ] not started
Phase 3   Architectural Refactoring         [ ] not started
Phase 4   Platform Cleanup                  [ ] not started
Phase 5   Large Complexity Reduction        [ ] not started
```

Completed phases: 1 / 6 (counting Phase 1.5 within the sequence, 7 stages total).

## Technical Debt

The precise, authoritative list of issues lives in the `Tasks/Fix-*.md` files.
The counts below are approximate and exist only for a quick sense of scale. Do
not treat them as exact; when in doubt, count the issues in the task files.

```
Section task files          14
Approximate high-severity   ~7   (bugs and real risks)
Approximate medium          ~25  (architecture and cohesion)
Approximate low             ~40  (cleanup and consistency)
```

Cross-cutting issues (hardcoded keys, localStorage bypass, timestamp fallback,
separator collision, missing try/catch) are counted per-section above but will
be resolved once in Phase 1.5, which will reduce the per-section counts.

## Verification State

```
Smoke test                  Baseline run recorded (Workspace, Backup detailed;
                            others verified in general use)
Performance baseline        Recorded (all metrics instant to ~2s)
Baseline snapshot           Tagged: pre-refactor-baseline (17e7f83)
```

Phase 0 deliverables complete.

## How to Keep This File Accurate

This dashboard is only useful if it is true. Update it at these moments:

- When a phase starts or completes, update the phase tracker.
- When the smoke test is first run, update the Verification State.
- When a governance document is added or a contract changes, update the
  Governance section.
- Do not try to keep the exact debt counts current on every fix. They are
  approximate by design. Update them only at phase boundaries, by re-scanning
  the task files.

If this file ever disagrees with the task files or the phase tracker, the task
files and tracker win. This dashboard is a summary, not a source of truth for
debt detail.

# Repository Manifest

This repository is governed, not just documented. If you are new here, read this
page first. It tells you where to start and in what order the documents apply.

## Governance Order

```
Foundation        Architecture/Foundation.md
   |              The governing principles. How the platform thinks.
   v
Architecture      Architecture/
   |              Module organization, dependency graph, risks, decisions (ADR).
   v
Contracts         Contracts/
   |              The target architecture. What each subsystem must be.
   v
Knowledge         Knowledge/
   |              The current implementation. What the code does today.
   v
Decisions         Architecture/Decisions/
   |              Why each structural choice was made (ADR).
   v
Process           Process/
   |              Definition of Done, Change Impact Matrix.
   v
Tasks             Tasks/
   |              Technical debt, verification, and the refactoring master plan.
   v
Source            Source/Tampermonkey/PA.user.js
                  The implementation.
```

## How to Read This Repository

- To understand **how the platform thinks**, start with `Architecture/Foundation.md`.
- To understand **what a subsystem should be**, read its file in `Contracts/`.
- To understand **what the code does now**, read the matching file in `Knowledge/`.
- To understand **why a decision was made**, read the matching ADR in
  `Architecture/Decisions/`.
- To understand **what depends on what**, read `Architecture/Dependency-Graph.md`.
- To **change the code**, start with `Tasks/Refactoring-Master-Plan.md`.

## The Three Documentation Layers

This repository separates three kinds of truth. Interpret each document by its
layer:

- **Architecture** defines governing principles. They describe intent.
- **Contracts** define target boundaries. A contract is a goal, not a description
  of today.
- **Knowledge** describes the current implementation. A knowledge document is a
  description of today, not a constraint on tomorrow.

## The Governing Rule

From the current phase onward, no change is made directly to `PA.user.js` unless
it is fed by a task in the Refactoring Master Plan and passes the smoke test in
`Tasks/Verification-And-Smoke-Test.md`. This discipline keeps architecture and
implementation converging rather than drifting.

## The Single-Owner Principle

Every precise truth has exactly one owner. All other documents reference or
summarize it; they never restate it as their own.

- Only **Contracts** own the target architecture.
- Only **Knowledge** owns the current implementation state.
- Only **Tasks** own the detail of technical debt.
- Only **ADRs** own the reasoning behind architectural decisions.
- Only the **Dependency Graph** owns the allowed dependency directions.
- Only **Module Ownership** owns each module's responsibility and current status.
- Only **Repository-Health** owns the status summary — never the detail.

When two documents would state the same fact, one owns it and the other links to
it. This is what prevents documentation drift: a fact changes in one place, and
everywhere else points to that place rather than holding a stale copy.

If you find the same precise fact asserted in two documents, that is a defect.
Resolve it by choosing the owner and converting the other to a reference.

## When to Add a New Governance Document

Governance, like code, becomes debt if it grows without need. Before adding any
new document, it must pass one test:

> Without this document, is executing or maintaining the project genuinely harder?

If the answer is no, do not create it. The governance structure is considered
complete. The next work is execution, not documentation.

## Current State

The architecture, contracts, knowledge, decision records, process documents, and
refactoring plan are complete. The next step is execution: Phase 0 of the
Refactoring Master Plan (Baseline and Verification), not further documentation.

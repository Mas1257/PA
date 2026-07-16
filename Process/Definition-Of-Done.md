# Definition of Done

## Purpose

This document defines when a task is complete. The Master Plan gives each phase
an exit condition; this document gives each individual task a completion standard.

No task is considered done, and no change enters the main branch, unless every
criterion below is met.

## Criteria

A task is done only when all of the following hold:

**1. Smoke test passes.** The full checklist in `Tasks/Verification-And-Smoke-Test.md`
runs with no regressions against the pre-task baseline.

**2. No performance regression.** If the task touches rendering, storage, or
import/export, the Performance Baseline (Section C of the verification document)
is re-checked and shows no significant regression (more than 20 percent slower
requires investigation).

**3. Documentation updated.** If the change alters observable behavior, a public
interface, or a subsystem responsibility, the corresponding Knowledge document is
updated. If the change reflects a new architectural decision, an ADR is added.

**4. No contract violation.** The change does not violate any contract in
`Contracts/`. If the change requires a contract to change, the contract is updated
first and the change is justified.

**5. No architecture review required.** The change fits within the existing
architecture. If it does not, it is escalated: an ADR is written and the
architecture is reviewed before the code change proceeds.

**6. Standard commit message.** The commit message is precise and minimal,
describing what changed, following the existing repository style (imperative mood,
no trailing period, focused scope).

**7. Sourced from the plan.** The change is traceable to a specific task in a
`Tasks/` file, which is traceable to a phase in the Master Plan. No direct change
to `PA.user.js` is made that is not fed by a planned task.

## No Speculative Documentation

A new document or ADR is created only when execution hits a real obstacle that no
existing document answers. Documentation is not written because it "might be useful
later."

This keeps governance fed by real experience rather than prediction. A document
born from an actual blocker earns its maintenance cost; a document born from
speculation becomes debt.

When a phase is in progress and a genuine gap appears — a decision with no ADR,
a rule with no home, an obstacle no task covers — that is the moment to write.
Not before.

## Rule

From this point forward, no change is made directly to `PA.user.js` unless it is
fed by one of the Master Plan tasks and subsequently passes verification. This
discipline is what keeps architecture and implementation converging rather than
drifting.

# PA

> Build something worth maintaining.

PA is a productivity platform designed to reduce friction, improve focus, and help people access what they need faster.

The project started as a personal tool to solve real workflow problems and has evolved into a modular platform focused on productivity, organization, and long-term maintainability.

## Current Status

Current focus:

- Execute the Refactoring Master Plan.
- Stabilize the platform architecture.
- Reduce technical debt.
- Prepare the first public-quality release.

## Repository Structure

```
Architecture/   Governing principles, module organization, decisions (ADR).
Contracts/      Intended architectural boundaries for each subsystem.
Knowledge/      Current implementation descriptions.
Process/        Definition of Done, Change Impact Matrix.
Tasks/          Technical debt, verification, refactoring master plan.
Research/       Background research and engineering analysis.
Archive/        Historical documents from earlier project phases.
Source/         Tampermonkey userscript source code.
```

Start with `REPOSITORY.md` for a complete guide to navigating this repository.

## Source

The platform is implemented as a single Tampermonkey userscript located at `Source/Tampermonkey/PA.user.js`.

## Core Principles

- User first.
- Less is more.
- Never assume. Verify.
- Long-term thinking.
- Quality over quantity.

## Philosophy

See `MANIFESTO.md` for the full project philosophy.

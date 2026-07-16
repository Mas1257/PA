> **Historical document.**
>
> This document represents an earlier stage of the project and is preserved for
> historical reference only.
>
> The current source of truth is the Architecture/, Contracts/, Knowledge/,
> Process/, and Tasks/ directories.

---

# UI Shell Feature Specification

## Purpose

The main extension shell including the floating button, tabbed panel, modal system, and flash messages.

## Responsibilities

Tab state management (`switchTab`, `registerTab`).

User idle monitoring for automatic panel and modal closing through `MutationObserver`.

## Technical Debt

All key DOM elements (`panel`, `formWrapper`, `flashMessage`) are accessible as global variables to all functions.

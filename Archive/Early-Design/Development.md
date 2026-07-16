> **Historical document.**
>
> This document represents an earlier stage of the project and is preserved for
> historical reference only.
>
> The current source of truth is the Architecture/, Contracts/, Knowledge/,
> Process/, and Tasks/ directories.

---

# PA Development Guide

> This document defines the development standards used throughout the project.

The goal is consistency.

Every file should feel like it was written by the same developer, regardless of when it was created.

---

# General Principles

- Readability over cleverness.
- Simplicity over complexity.
- Maintainability over shortcuts.
- Consistency over personal preference.
- User experience always comes first.

---

# Before Writing Code

Always ask:

- Does this solve a real problem?
- Is there already an existing solution?
- Can this be made simpler?
- Will this still make sense in two years?

---

# Naming

Names should be descriptive.

Avoid abbreviations unless they are universally understood.

Prefer:

```
bookmarkFolder
selectedTab
backupManager
```

Avoid:

```
tmp
data1
obj
test2
```

---

# Functions

Each function should have one responsibility.

Large functions should be divided into smaller reusable functions.

---

# Comments

Comments should explain **why**, not **what**.

Bad:

```javascript
// Increment counter
counter++;
```

Good:

```javascript
// Prevent duplicate processing during rapid barcode scans.
counter++;
```

---

# UI

Every UI element must have a purpose.

If removing a component improves usability,
it probably should be removed.

---

# Settings

Every configurable behavior belongs in Settings.

Feature logic should never contain hardcoded user preferences.

---

# Performance

Measure before optimizing.

Readable code is preferred unless profiling proves otherwise.

---

# Refactoring

Leave the code cleaner than you found it.

Small improvements over time create better software.

---

# Documentation

Architecture changes should be documented.

Major decisions should be recorded before implementation whenever practical.

---

# Final Rule

Never assume.

Observe.

Ask.

Verify.

Then implement.
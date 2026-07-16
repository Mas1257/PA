> **Historical document.**
>
> This document represents an earlier stage of the project and is preserved for
> historical reference only.
>
> The current source of truth is the Architecture/, Contracts/, Knowledge/,
> Process/, and Tasks/ directories.

---

# Search Engine Feature Specification

## Purpose

Global search across all entities (barcodes, folders, notes, tasks, and bookmarks).

## Current Status and Technical Debt

Indexing and searching are performed as linear search on arrays.

Technical debt: Variables `searchActive`, `searchInput`, and `barcodeSearchQuery` are fully global.

Search functions such as `renderBarcodeSearchResults` directly build and read the DOM.

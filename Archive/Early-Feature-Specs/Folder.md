> **Historical document.**
>
> This document represents an earlier stage of the project and is preserved for
> historical reference only.
>
> The current source of truth is the Architecture/, Contracts/, Knowledge/,
> Process/, and Tasks/ directories.

---

# Folder Engine Feature Specification

## Purpose

Hierarchical data management (two-level: Folder to Subfolder) for barcodes and bookmarks.

## Current Status and Technical Debt

Part of the logic is encapsulated in `FolderDataService`.

Technical debt: State variables such as `activeFolder` and `activeSubFolder` are defined globally and manipulated throughout the client.

## Dependencies

`StorageService` for persistence in `bm_folders` and `bm_subfolders`.

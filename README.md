# PA

PA is a personal productivity platform delivered as a Tampermonkey userscript.

It provides a shared infrastructure for managing barcodes, bookmarks, notes, tasks, and print workflows within a browser environment.

## Repository Structure

This repository contains the platform architecture, contracts, knowledge documents, research, and source code for the PA platform.

```
Architecture/   Governing principles, module organization, risks, and long-term direction.
Contracts/      Intended architectural boundaries for each platform subsystem.
Knowledge/      Current implementation descriptions for platform and feature modules.
Research/       Background research supporting architectural and implementation decisions.
Source/         Tampermonkey userscript source code.
```

## Documentation Layers

The documentation is organized into three layers.

**Architecture** defines the governing principles and long-term design philosophy. Start here to understand how the platform thinks.

**Contracts** define the intended architectural boundaries of each subsystem. They describe the target architecture that future implementations should conform to.

**Knowledge** describes the current implementation as it exists today. They reflect actual behavior, real dependencies, and present capabilities.

## Source

The platform is implemented as a single Tampermonkey userscript located at `Source/Tampermonkey/PA.user.js`.

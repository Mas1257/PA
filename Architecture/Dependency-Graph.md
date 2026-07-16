# Dependency Graph

## Purpose

This document shows the allowed dependency directions between platform subsystems
and feature modules. The dependency rules are defined in text across the Contracts;
this graph makes them visible in one place for both humans and agents.

The single rule that governs everything below: dependencies flow in one direction
only. There are no cycles.

## Platform Subsystem Dependencies

```
                    Workspace
                        |
                        v
        Cloud  ------>  Backup
                        |
                        v
                    Serializer
                        |
                        v
                     Storage
                        |
                        v
              Platform Infrastructure
```

Read each arrow as "depends on". Workspace depends on Backup. Backup depends on
Serializer. Serializer depends on Storage. Cloud depends on Backup on a separate
line. Every subsystem ultimately depends on Platform Infrastructure.

No arrow points upward. Storage never depends on Serializer; Serializer never
depends on Backup; Backup never depends on Cloud or Workspace.

## Platform and Features

```
    Platform Infrastructure
    (Storage, Serializer, Backup,
     Workspace, Cloud, UI Utilities)
              ^
              |  features depend on platform
              |  platform never depends on features
              |
    +---------+---------+---------+---------+
    |         |         |         |         |
  Barcode  Bookmark  Notebook   Todo     Print
```

Features depend on platform services. Platform never depends on any feature.
Features never depend directly on one another; all cross-feature coordination
happens through platform services.

## Feature Independence

```
  Barcode      Bookmark      Notebook      Todo
     |            |             |            |
     +------------+------+------+------------+
                         |
                         v
              Platform Services only
```

No feature module imports or calls another feature module directly. A forbidden
edge would be, for example, Barcode depending on Notebook. If two features need
to share behavior, that behavior belongs in a platform service.

## Data Layer Direction

```
  UI Layer
     |
     v
  Feature Data Service  (BarcodeService, NoteService, ...)
     |
     v
  Storage
```

The UI layer calls data services. Data services call Storage. Data services do
not call back into the UI layer. This is the decoupling target of Master Plan
Phase 3: today some data services call UI functions directly, which is a
violation of this direction.

## Reading the Graph for Impact

To find what a change affects, follow the arrows upward. Anything that points at
the changed subsystem may be affected. For example, a change to Serializer may
affect Backup (points at Serializer) and therefore Cloud and Workspace (point at
Backup). This is the basis of the Change Impact Matrix in `Process/`.

## Maintenance

Update this graph whenever a subsystem or dependency is added. Any new edge must
preserve acyclicity. An edge that would create a cycle indicates a design problem,
not a documentation problem.

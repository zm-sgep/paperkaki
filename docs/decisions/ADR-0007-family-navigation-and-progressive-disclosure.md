# ADR-0007: Family Navigation and Progressive Disclosure

## Status
Accepted

## Context
PaperKaki contains curriculum, assessment, marking, analytics and rewards. Exposing each system area as navigation would make the family experience feel like enterprise software.

## Decision
Parent has four primary destinations: Home, Prepare, Progress, Rewards.

Child has four: Today, Practice, Progress, Rewards.

Internal/admin concepts do not become primary family navigation. Advanced paper configuration is hidden under explicit customisation.

Responsive layouts may convert tabs to sidebars but must preserve the same conceptual information architecture.

## Consequences
Adding a new top-level family destination requires revisiting this ADR rather than adding a tab opportunistically.

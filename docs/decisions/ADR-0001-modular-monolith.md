# ADR-0001: Start as a Modular Monolith

## Status
Accepted

## Context
The product has tightly related curriculum, question, assessment and paper-generation transactions. The initial team is small and needs rapid iteration.

## Decision
Use one deployable web application with clear internal domain modules and one PostgreSQL database.

## Alternatives
- Microservices.
- Backend-as-a-service logic scattered across client/server functions.

## Consequences
Pros:
- simpler development and deployment;
- easier transactions;
- easier debugging;
- lower operating complexity.

Cons:
- module boundaries require discipline;
- later extraction may require work.

## Review trigger
Reconsider only when measured scale, team boundaries or deployment requirements justify service separation.

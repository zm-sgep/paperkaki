# ADR-0002: Central Provider-Independent AI Gateway

## Status
Accepted

## Context
Later product milestones need document extraction, curriculum mapping, question generation and marking. Model providers and capabilities will change.

## Decision
All model calls go through a central `AIService` interface with validated structured outputs and versioned prompt templates.

## Alternatives
- Direct SDK calls from individual features.
- One generic "chat" function with free-form text.

## Consequences
Pros:
- provider switching;
- consistent logging/evals;
- structured validation;
- clearer cost tracking.

Cons:
- additional abstraction work.

## Rule
M0–M4 should not require AI to generate printable papers. Curated questions prove the core workflow first.

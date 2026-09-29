# ADR-0005: Private Object Storage

## Status
Accepted

## Context
The product will store generated papers and later school notices/completed handwritten work involving children.

## Decision
Use private object storage. Persist object keys in the database and issue short-lived signed URLs after server-side authorisation.

## Alternatives
- Public bucket URLs.
- Store files in database blobs.

## Consequences
Safer default access model with additional signed-URL handling.

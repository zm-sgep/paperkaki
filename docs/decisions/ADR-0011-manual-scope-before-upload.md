# ADR-0011: Manual Scope Entry Until School-Notice Upload Exists

## Status
Accepted (2026-09-29)

## Context
UX_SPEC screen A makes `Upload school notice` the primary action. Upload and extraction arrive in Milestone 5. PRD section 20 excludes them from Milestones 0 to 4.

## Decision
- Until Milestone 5 ships, the setup path is: what are you preparing for, then choose topics, then generate the mock.
- The primary action on screen A is `Choose topics`. No upload button is shown until upload works. A disabled or "coming soon" control is not shown.
- When Milestone 5 ships, upload becomes the primary action and manual entry becomes the secondary `Enter details myself`, as UX_SPEC describes.

## Update (2026-09-30)
School-notice upload is built. It appears only when `AI_PROVIDER` is set to a working provider. With `AI_PROVIDER=disabled` (the default), the manual path above remains the only path, and no upload button is shown. When upload is on, `Upload school notice` is the primary action and `Enter details myself` is the quiet secondary link, as UX_SPEC describes.

## Consequences
Parents never meet a control that does nothing. The Milestone 5 change is a small swap of primary and secondary actions.

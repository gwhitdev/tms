# TMS delivery rules

The agreed direction is UK freight/delivery, extensible to mixed transport, using .NET, PostgreSQL and React. Read the current requirements and M01 decisions before implementing features. Open questions are decisions, not permission to invent business approval.

Use DDD: keep business rules in their owning bounded context; external ERP, map, identity, tracking and storage models pass through explicit adapters. Cross-context updates use versioned contracts and an outbox/inbox where asynchronous. Do not share another context's tables or force all business state into one status.

Use TDD: write an acceptance-relevant failing test, capture its actual failure, implement the smallest change, then run it passing and refactor. Compilation alone does not prove the rule. Keep command/result evidence. Tests for persistence, isolation, mobile GPS, ERP or deployment must exercise those actual boundaries; M01 contract examples cannot verify them.

Every tenant-owned command, query, cache, file, event, subscription and integration has an authenticated tenant scope. A client-supplied tenant ID is never authority. Menu visibility is not authorisation. System administration requires a separate explicit policy; support access is scoped, time bounded and audited.

Use the existing task IDs and acceptance indices. Maintain `docs/tms-plan-evidence.json` after milestone work. References must identify immutable source commits and actual assessed outcomes. A green test, generated file or commit never verifies an unreviewed criterion. Preserve open work and do not advance dependencies prematurely.

Never commit credentials, live personal data or driver locations. Container deploys use scoped secret references and signed/approved release actions. Do not run arbitrary host commands through the installer or model.

Prepare changes on review branches and open a draft pull request when review remains. Do not merge or advertise a released capability until its evidence and reviews are complete.

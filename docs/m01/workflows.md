# M01-T03 — Operational and administrative workflow review

Status: **design candidate; user review pending**. Target: UK-first freight and delivery, .NET domain/application/API services, PostgreSQL (PostGIS is an optional, proposed extension), React office/portal UI, and Android/iPhone driver applications. Mixed transport remains an extension of transport tasks, stops, resources and schedules. This document does not assert jurisdictional compliance or provider coverage.

The adjacent `prototypes.html` is a self-contained, fixture-only interaction explorer. All records are fictional and all transitions live in browser memory. Reload/reset discards them. It has no APIs, real GPS, road routing, uploads, persistence, deployment agent or external resources. UI simulation and browser checks do not establish security, accessibility conformance, native mobile reliability or operational suitability. Review does not complete implementation milestones.

## Shared interaction and navigation contract

Use a navy navigation rail, readable compact tables, restrained teal primary actions, explicit status text, contextual detail panels and recoverable inline errors. Use local units (kg/pallets, GBP when pricing exists) and Europe/London display; persist actual instants in UTC in the implementation. Keep transport records and sensitive commercial details out of platform metadata views.

`navigation.json` is the shared registered catalogue. Stable IDs reference owned modules and routes; configurable labels, groups, order and visibility never become route/command definitions. Resolve access from authenticated membership, module entitlement, permission and record scope; then apply presentation preferences. Tenant administrators cannot add platform or installer permissions through menus. Unknown catalogue IDs, unsafe URLs, scripts and configurations that strand administrators are rejected. Publication uses a version check, an audit entry and preview; reverting creates a new version. Hiding an authorised menu does not revoke access, and showing an unauthorised menu does not grant it.

The explorer deliberately exposes a **role switcher for review only**. Production applications resolve roles from identity and membership rather than this control. Essential entries remain available for tenant/system administration and the independent installer. The direct-route probe illustrates authorisation separately from visibility.

## Dispatcher: inspect, allocate, re-order and publish

1. Open tenant/depot-scoped unassigned work and a selected draft run. Show cargo, driver/vehicle eligibility, capacity, plan version and unresolved jobs.
2. Add eligible work to the draft; collection/delivery pairs remain linked to the consignment. Capacity is calculated after every stop, not only for a route total.
3. Reorder through labelled move-up/move-down controls and, later, equivalent drag/drop. Selection, filters and draft edits survive detail-panel changes.
4. Inspect hard failures (pickup precedence, negative load, weight/pallet capacity, eligibility) and soft preferences separately. Each failure identifies its stop and corrective action. The prototype uses deterministic pallet/weight/precedence rules; it does not calculate timings, roads, breaks or legal eligibility.
5. Publish only after current job/resource versions are rechecked. A stale vehicle/resource reservation produces a conflict that preserves the proposed stops and offers a fresh validation. Offline/loading/error states prevent a command from appearing committed.
6. Produce a new immutable dispatched version and retain the previous approved manifest. Replacing an active plan requires a change review and driver acknowledgement.

Prototype review scenario: allocate DEMO-B to a run containing DEMO-A, move B's collection above A's delivery, observe the capacity failure, restore a feasible sequence, inject a resource conflict, revalidate and publish the fixture version. The stop diagram is explicitly schematic.

Requirements: PLAN-02/04/05, BOOK-05, QUALITY-02/03/04/05. Future executable tests must cover concurrent reservation transactions in PostgreSQL, stale inputs, capacity at each stop, published-version immutability and keyboard reordering. The fixture cannot verify those server invariants.

## Driver: recorded work, partial quantities and offline POD

1. Display the acknowledged assigned manifest and next stop on a touch-oriented view. Distinguish the assigned version from newer pending changes.
2. Record arrival, quantities delivered, discrepancy reason and required recipient/evidence. A quantity outside 0..expected is rejected; a partial delivery requires a reason and remains operationally actionable.
3. Save evidence locally before upload. Distinguish **recorded locally**, **queued**, **uploading**, **acknowledged** and **needs review**. A network toggle never implies acknowledgement.
4. Reconnect, retry the same event IDs and wait for server acknowledgement. Deduplicate effects; late events retain their manifest/assignment provenance.
5. On manifest conflicts, preserve captured work and ask dispatch to reconcile it. Do not overwrite the POD or silently count rejected/partial quantities as complete.

Prototype review scenario: go offline, record 2 of 3 pallets with a reason and fixture evidence, then reconnect and simulate acknowledgement. Repeat with a manifest-version conflict to see the retained review queue. Its "photo" and signature controls are fixture evidence markers, not actual POD capture. Device status reports sample age/accuracy and no actual position.

Requirements: MOBILE-01/02, SCOPE-01, QUALITY-02/04/05 and tracking ingestion requirements. Native Android/iPhone permission, screen-lock/backgrounding, restart, battery, offline storage encryption and camera/accessibility tests remain necessary; the desktop prototype establishes none of these.

## Customer: own bookings and relevant delivery updates

1. Show only the current customer's bookings within its tenant. Do not expose unrelated customers, vehicle manifests, driver history, internal costs or other tenants.
2. Capture a reference, collection/delivery address, pallets and weight. Preserve field values after validation errors. Address-format validation does not imply geocoding/route suitability.
3. Submit a booking for validation and show its explicit state; a browser/network failure leaves a recoverable draft. Production creation requires idempotency and version control.
4. Show approved delivery status/ETA evidence for the customer's job. Missing/stale ETA data appears unavailable; it is not invented.

Prototype review scenario: try zero pallets, correct the input, create a fixture booking and switch to dispatch to see the fixture intake. Customer visibility is illustrated with fictional owned records only. Requirements: BOOK-03/04/05, SEC-02, QUALITY-03/05.

## Tenant administration: settings, integrations and menus

Tenant admins manage their own operation, not infrastructure or global tenants. Stage operational defaults, validate, publish a version and retain an audit. ERP screens show contract/readiness states without accepting real secrets in this prototype. The menu editor supports registered permitted entries, role-specific labels/order/visibility, preview, version-checked publication, reset and revert. Essential administration entries cannot be hidden. A role's permission set remains unchanged throughout the exercise.

Prototype review scenario: relabel/hide a dispatcher entry, preview the resulting menu, publish and revert; try to hide an essential admin entry or publish a stale version and observe recovery. Try an unknown registered route and a direct platform route as a tenant admin. Requirements: ADMIN-01/03/04/05, integration contract requirements, SEC-02.

## System administration: tenant and service metadata

Provision a tenant through validated identity/slug, plan and an invitation/bootstrap flow; never ship shared default passwords. Confirm the implications of suspension for APIs, pending jobs and drivers before applying it, with a handover policy for active journeys. Manage features/quotas and global menu defaults without granting tenant business-data access. Service checks show status, freshness and diagnostic correlation; transport UI privilege does not imply deployment-host privilege.

Prototype review scenario: create a fictional tenant, inspect its entitlement summary, suspend/reactivate it with a review dialog, simulate a service-health check and inspect the system defaults catalogue. Requirements: ADMIN-02/03/05, SEC-01/02, DEPLOY-03/07.

## Installer/operator: preflight, review, progress, retry and health

The installer has a distinct identity and control plane available when the TMS application/database is unavailable. A signed bootstrap/prepared image must start it on a clean supported host. The UI cannot replace that prerequisite.

1. Select a registered pinned release/profile and configure domain/TLS, storage, backups and one-use privileged bootstrap. Secrets go into a server-side secret store, never presentation JSON.
2. Run actual runtime/resource/port/storage/TLS preflight. Do not proceed after a failed or stale check; preserve inputs and explain fixes.
3. Review the exact release, service set, migration/backup checks and configuration revision before committing a predefined deployment operation.
4. Record completed stages durably. A retry resumes the failed stage without rerunning a completed migration; concurrency is controlled by a deployment lock.
5. Mark ready only after real dependency/readiness/smoke checks. Explain failures and the supported recovery path; schema rollback is distinct from compatible image rollback.

Prototype review scenario: simulate preflight failure, repair the fixture and retry; review, advance simulated installation, fail readiness and retry without incrementing the completed migration stage. Inspect the independent health screen. It never accesses Docker or installs anything. Requirements: DEPLOY-01..07, ADMIN-05, QUALITY-02/05.

## State, accessibility and evidence review

The state selector exposes normal, loading, empty, offline, error, conflict, permission-denied and stale examples. Loading uses labelled progress/status and disables dependent operations. Errors state what failed and preserve the draft. Offline explicitly separates local recording from server acknowledgement. Conflicts show the affected version/resource and a reconciliation action. Empty screens explain the next permitted action. Permission-denied screens omit protected content. Stale observations carry age/freshness text.

All prototype actions use native buttons/inputs/selects, associated labels, visible focus, semantic tables and status/alert announcements. Reordering does not depend on dragging; status does not depend on colour. Dialogs use native focus/escape handling. Narrow screens retain role/state controls, readable tables with contained overflow and a touch-oriented driver view. These are design provisions, not a WCAG conformance claim.

Review gates (pending): representative dispatchers, drivers, customer users, tenant/system admins and operators complete the scenarios without coaching; screen-reader/keyboard review covers the entire process; mobile review checks 360px portrait and desktop checks 1280px; every failure preserves recoverable input; no control implies real routing, GPS, POD sync or deployment. Record actual participant/task results and changes before agreeing the interface baseline. Proposed task-success target is at least 90% with zero critical dispatch/data-loss mistakes; final thresholds need user agreement and a representative sample.

M01-T03's prototype files are available for review. User approval, usability/accessibility findings, production UI, API authorisation, mobile field evidence and deployment evidence remain outstanding.

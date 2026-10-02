# M01 operating scope and decision register

Status: design candidate, 2 October 2026. UK and .NET/PostgreSQL/React are confirmed directly by the product owner. Other numbers and providers remain open. This document records ownership and downstream gates; it does not certify compliance or performance.

## Confirmed scope

Freight and delivery cover quotes, bookings, collections, deliveries, transfers, returns, multi-leg consignments, depot planning, owned/subcontracted resources, route optimisation, driver execution/POD, finance, ERP integration and reporting. A tenant is the security/contract boundary; depots and business units are tenant-owned. A customer or subcontractor is not automatically a tenant administrator.

The first operating country is the UK. Currency and timezone display can default to GBP and Europe/London after tenant configuration, while immutable timestamps are UTC and time-window inputs retain the originating timezone. Freight dimensions/quantities retain units. Native Android and iPhone devices are the first tracking sources; vehicle telematics follow through the tracking-source contract.

The platform has distinct tenant and system administration, registered navigation with administrator-managed labels/order/visibility, and an independent UI deployment console. Application services, PostgreSQL, storage and operational infrastructure are container deployable. Driver apps run on phones; build infrastructure can be containerised but device runtimes cannot be server containers.

## Mixed transport extension

Shared scheduling owns transport obligations, stops, time windows, resource eligibility and assignments. Freight owns cargo quantities, custody, handling, consignment and delivery evidence. A future passenger context owns passengers, boarding, seat capacity, accessibility and safeguarding. It supplies a separately versioned obligation/constraint adapter to planning; it does not put passenger data into cargo fields or rewrite freight history. Compatibility of simultaneous mixed services is an explicit dispatch rule, never inferred from a generic service string.

## Open decisions and owners

| ID | Decision | Accountable role | Proposed direction / evidence needed | Gate |
|---|---|---|---|---|
| UK-01 | GB/NI coverage, vehicle classes, journeys and regulated cargo | Product owner + transport compliance lead | UK confirmed; qualify the applicable policies per operation. No universal UK hours rule. | Before jurisdiction-specific booking/dispatch rules in M03–M05 |
| CARGO-01 | Pallets/parcels/bulk, ADR, temperature control, dimensional/loading rules | Product owner + operations lead | General freight examples are fixtures. Actual cargo restrictions require agreement. | M03 data model and M05 feasibility |
| SCALE-01 | Initial/peak tenants, depots, drivers, jobs/day, concurrent users, GPS devices | Product owner + engineering lead | No capacity promises. Choose representative, peak and stress workloads and test data. | M02 sizing; M05/M06/M10 load acceptance |
| HOST-01 | Production operator, host/cloud, certificates, storage and support model | System operator + engineering lead | Local containers confirmed for build control. Compose development path; production topology depends on availability targets. | M02 deployment topology and M09 production installer |
| SLO-01 | Availability, response/optimisation latency, GPS freshness, RPO/RTO | Product owner + operator | Define numeric targets and measurement windows; record exclusions explicitly. | M02 observability design; M09/M10 rehearsals |
| MAP-01 | UK road/geocode provider, truck capabilities, traffic, matrix limits, licensing | Operations lead + engineering lead | Capability matrix and representative UK routes; keep provider failure/manual planning usable. | M05 provider adapter |
| ERP-01 | First ERP/accounting systems, API access, authoritative fields and conflicts | Integration owner + finance lead | Provider-neutral adapters; mapping, replay, reconciliation and webhook signing reviewed for each connector. | M07 integration contracts |
| GPS-01 | Work tracking basis, retention, sampling, BYOD/managed devices, device support | Data protection owner + operations lead | Authorised on-duty sessions, transparent status, DPIA/notice and real-device trials; device permission is separate from lawful basis. | M06 field trials |
| IDP-01 | Identity provider, MFA, account lifecycle and support delegation | Security owner + tenant/system operators | OIDC/BFF boundary proposed; system role is not a tenant role. | M02 identity implementation |
| MOBILE-01 | Mobile framework and supported OS/device versions | Engineering lead + driver representatives | React web is confirmed. Native-capable mobile client is required; framework choice needs background/offline feasibility evidence. | M06 implementation |
| UX-01 | Representative dispatcher/driver/customer/admin/installer reviewers | Product owner | Review `prototypes.html` and record results per role; WCAG 2.2 AA target is a design target, not an attained certification. | M01-T03 approval; M10 usability acceptance |
| TEAM-01 | Named delivery, review and operational owners | Product owner | Codex prepares candidates. Product/compliance/security/user reviews need named accountable people. | Each dependent acceptance gate |

The product owner is `gwhitdev` for this initial review. Role assignments above identify responsibility, not a claim that specialists have already been appointed. Missing decisions remain visible in the site's Decisions area and must be resolved at their stated gate.

## Acceptance review

M01-T01 criterion 0: the decision register records owners and downstream effects. Criterion 1: review the freight scope and mixed-service adapter design above. Original freight/mixed direction is confirmed; approval of this detailed model remains pending. No business decision is treated as approved merely because it appears in this file.

## Primary references

[DVSA goods vehicle guidance](https://www.gov.uk/guidance/drivers-hours-goods-vehicles) distinguishes policy regimes. [The UK overview](https://www.gov.uk/drivers-hours/overview) notes Northern Ireland differences. [ICO worker monitoring guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/monitoring-workers/data-protection-and-monitoring-workers/) informs the privacy review. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) supplies the accessibility target. These sources support design questions; operational compliance requires the applicable review.

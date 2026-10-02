# M01-T01 — Scope and decisions before building

Status: **candidate for review; business acceptance incomplete**.
Baseline: `freight-tms-baseline-01`. This is a scope proposal, not implemented
capability or an approval record. The supplied context confirms the repository
selection only. No people, countries, volumes, hosting or providers are confirmed.

## Decision register and ownership

`M01-T01-decisions.json` is the authoritative structured register. Each open
decision records its question, proposed accountable role, delivery effect and
evidence needed to close it. Roles are routing proposals, not accepted assignments.
The delivery sponsor must name individuals, obtain their acceptance and set due
dates; none were supplied. M01-T01's task owner also remains unassigned.

| Decision | Proposed accountable role | Decision needed |
| --- | --- | --- |
| D01-countries | Compliance lead | Launch countries/lanes, driver rules and reviewed compliance evidence |
| D01-cargo | Freight operations lead | Cargo inclusion/exclusion, restrictions, handling and capacity units |
| D02-scale | Operations planning lead | Depots, fleet, jobs, users, devices, peaks, growth and telemetry |
| D-hosting | Platform lead | Hosting model/provider/regions, residency and operating responsibility |
| D02-availability | Service operations lead | Availability, service hours, RTO/RPO and offline tolerance |
| D03-routing | Routing technical lead | Coverage, freight road suitability, restrictions, quotas and outage policy |
| D03-erp | Integration lead | Initial ERP/accounting and device providers, field ownership and reconciliation |
| D04-team | Delivery sponsor | Named team, task/decision owners, approvers and decision dates |

Decide countries and cargo before validating routing; agree scale and service
objectives before selecting hosting capacity/resilience. Agree system-of-record
ownership before designing imports or billing synchronization. Reviews and
provider-independent domain design may proceed, but dependent implementation
commitments and support claims remain gated by the required evidence.

## Freight scope proposed for approval

- Cover quotation, booking, validation, planning, dispatch, execution, proof of
  delivery, billing and reconciliation without re-entering core data.
- Support collections, deliveries, transfers, returns and multi-leg consignments.
- Track operational, delivery and financial states independently. Cancellation,
  partial completion, failed delivery, rescheduling, credit and correction need
  controlled transitions and preserved history.
- Support tenant-owned depots, business units, owned fleets and subcontractors.
  Keep tenant, customer and subcontractor identities/permissions separate;
  subcontractors see only allocated work and explicitly permitted evidence,
  costs and status actions.
- Configure units, currencies, timezones, service types and operating rules.
  No default jurisdiction, unrestricted cargo support, numerical service target
  or selected external provider is implied.

Passenger operations are not initial delivery scope. This task does not build
freight workflows, integrations, infrastructure or user interfaces.

## Mixed-transport extension proposal

Use the baseline's modular domain boundaries, not a generic all-purpose cargo
record. Bookings owns freight orders/consignments and cargo validation. Planning
owns route composition and consumes transport requirements. Resources owns
resource capabilities and reservations; Dispatch authorizes released work;
Execution owns outcomes/evidence. Tracking observes positions. Commercial owns
pricing, invoices and credits. Integrations translates external schemas through
owned ports; Tenant/Access owns authorization boundaries. Detailed command/event
catalogues and runtime architecture checks belong to later architecture work.

The common planning vocabulary is tasks, stops, resources, schedules and
capacity. A transport requirement contract carries tenant-qualified work
identity, service type, locations, time windows and typed capacity demands.
Weight, volume and seats are distinct dimensions with explicit units; capacity
must never collapse them into a single interchangeable quantity. A service-specific
policy validates demands and resource suitability before planning. Unknown
service types or unsupported dimensions must be rejected, not treated as freight.

Freight retains cargo description, weight, volume and handling requirements in
its own model. A future Passenger Services context owns passenger journeys,
seat demand, boarding and accessibility requirements. It exposes validated
transport requirements through an adapter and receives execution outcomes through
versioned contracts. It does not write freight tables or put passengers in cargo
fields. Contexts exchange identifiers/contracts, never share persistence access.

Example for design review: an existing freight consignment requesting 500 kg
remains unchanged. A future passenger journey requesting two seats and accessible
boarding is stored in Passenger Services, then submitted to Planning with its own
tenant-qualified identity and typed requirements. Planning checks seat and
accessibility capabilities independently of freight weight capacity. Boarding
evidence returns to Passenger Services, not freight proof-of-delivery fields.
Adding the passenger model, adapter and policy must not require rewriting
existing freight records or reinterpreting their cargo fields.

This describes extension compatibility, not approval to co-load passengers and
freight. Co-loading safety, legal eligibility and resource scheduling policies
would need separate review before mixed services operate on a shared route.

## Approval and completion gate

Request two explicit sign-offs:

1. Product sponsor with freight operations lead: accept the freight scope and
   exclusions, or record amendments against SCOPE-01 through SCOPE-04.
2. Product sponsor with domain architecture lead: accept the separate passenger
   model and unchanged-freight-record extension approach under SCOPE-02.

For each, record the named authorized approver, exact document revision, date,
outcome, amendments and a review evidence reference. No sign-off was supplied, so
both remain pending in the register. Resolve named ownership before claiming the
owner-recording criterion satisfied. Open business decisions can remain tracked
with accepted owners and delivery effects, but their dependent build gates stay
closed until reviewed evidence is recorded.

Automated checks validate this candidate's decision coverage, explicit ownership
gaps, scope separation and pending approvals. They neither grant business approval
nor prove running transport behavior. Update candidate-state assertions when
real reviewed decisions/sign-offs arrive; do not change statuses merely to make
tests pass. M01-T01 and M01 must not be marked complete from these files alone.
# M01-T04: traceability, TDD and assessed delivery evidence

This is the delivery foundation for the UK freight TMS using .NET, PostgreSQL and React. It is a design candidate for review. It does not implement the production transport system or verify any future milestone.

## Exact baseline and traceability

`traceability.json` retains all 63 requirements and their 126 acceptance criteria, all 46 tasks and their 93 acceptance criteria, and the milestone dependencies from the Freight TMS specification. Criterion indices are zero-based. The embedded baseline includes the exact source titles, descriptions and acceptance text. Its canonical SHA-256 is pinned in the checker; changes to the baseline require an explicit scope review and coordinated digest update.

Mappings are criterion-specific. Each task acceptance criterion has an arranged fixture, an action and the exact expected task acceptance text. Each requirement criterion points to the scenarios that address it, and each scenario points back to the exact task and requirement criteria. These are planned coverage links; their presence does not mean the linked requirement has passed acceptance.

The inventory distinguishes:

- 93 `planned_acceptance` scenarios, including design reviews and future implementation checks. Their execution status remains `not_started`.
- 17 executable .NET `contract_example` scenarios supporting M01-T02. They are labelled `example_available`; they exercise isolated in-memory contracts. Their execution results belong in a separately assessed report.
- All 63 production requirements and all 46 task implementation statuses remain `not_started`. The four M01 document deliveries are `design_candidate`; M02–M10 delivery statuses are `not_started`.

The static inventory deliberately contains no verification or execution evidence records. The checker rejects inserted `passed` claims, fabricated evidence, automatic verification, changed baseline text, orphaned criteria, dangling links and contract examples relabelled as PostgreSQL, device or production assurance. It also prevents critical future isolation, reservation, device and restore scenarios from dropping their required runtime test layers.

This checker proves inventory integrity and the declared assessment boundaries. It cannot prove that a producer's external evidence is authentic, that a user has approved a workflow, or that a runtime service is secure. Those require inspecting the actual results and environment.

## Run the current checks

Run from the repository root with Node and the SDK declared in `global.json`:

```sh
node --test tests/traceability.test.mjs
node scripts/check-traceability.mjs
dotnet run --project tests/Tms.Contracts.Tests/Tms.Contracts.Tests.csproj --configuration Release
```

The Node test suite uses built-in modules and mutation fixtures to detect missing criteria, false backlinks, altered baseline text and false progress/evidence. The inventory checker also checks exact correspondence between the declared example cases and the .NET harness, so an executable case cannot become an orphan. The .NET console harness returns a nonzero exit code when any example fails; it does not depend on an external test package.

`.github/workflows/ci.yml` runs these checks for pushes and pull requests. It has read-only repository permissions, disables persisted checkout credentials and pins each Action to a full commit SHA. It retains individual test/example logs plus `assessment-scope.json`, which identifies the exact checked-out commit, run and the limited M01 assessment scope. For a pull request this may be GitHub's tested merge commit; record the SHA actually tested, not an assumed branch-head SHA. CI produces reports and never writes the implementation-plan evidence manifest or marks a milestone verified.

The Action pins were checked against their official release commits: [checkout v4.2.2](https://github.com/actions/checkout/commit/11bd71901bbe5b1630ceea73d27597364c9af683), [setup-node v4.4.0](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020), [setup-dotnet v4.3.1](https://github.com/actions/setup-dotnet/commit/67a3573c9a986a3f9c594539f4ab511d57bb3ce9), and [upload-artifact v4.6.2](https://github.com/actions/upload-artifact/commit/ea165f8d65b6e75b540449e92b4886f43607fa02). Updating a pin and runtime version requires rerunning the checks; a pinned release is not a claim that every dependency is vulnerability-free.

## Test-first delivery

For every new behaviour:

1. Select its requirement ID, task ID and acceptance indices. Review examples, failure cases and the layer needed to demonstrate the invariant.
2. Write the failing test before implementing the behaviour. Run it and retain a genuine RED result tied to the test revision and environment. An unrelated syntax/tooling failure is not evidence that the intended behavioural test is meaningful.
3. Implement the smallest cohesive domain behaviour or adapter change. Run the same scenario to GREEN, then the relevant regression checks.
4. Refactor with the checks still passing. Inspect skipped tests, environment differences and expected failure assertions; a green summary alone does not establish acceptance.
5. Commit the candidate, assess every affected criterion at that immutable SHA and keep outstanding requirements visible. The assessor decides whether the result supports design review, partial progress or verified acceptance.

For this traceability checker, the test source was created before the checker. The first run failed because the checker module did not exist. That is bootstrap RED evidence only. After the checker and inventory were implemented, the mutation assertions exercised the real orphan/progress/evidence rules. A further behavioural test removed `DDD-STATE-01` and its backlinks while leaving the .NET case present: it genuinely failed with `Missing expected exception` (28 passed, 1 failed), because the checker did not yet detect an orphan executable case. After implementing the exact harness-to-inventory comparison, the same suite passed 29/29 with no skipped tests. Its rejection tests retain intentionally invalid fixtures and assert the corresponding error codes. The .NET contracts retain their separate behavioural RED/GREEN record in the M01 contract delivery documents; the Node bootstrap failure must not be presented as their behavioural RED evidence.

## Required future layers

| Layer | Required environment and proof | What an M01 example cannot establish |
| --- | --- | --- |
| Domain unit | Actual context aggregates/value types with invalid transitions, quantities, prices, identity/version checks and controlled clocks | Persistence, HTTP authorisation or full workflows |
| Architecture | Compiled production modules and enforced dependency/persistence ownership rules | Isolation from a context diagram alone |
| Real API | Running .NET endpoints, production authentication/authorisation middleware and independent clients | API behaviour from directly invoked domain methods |
| PostgreSQL runtime roles | Real PostgreSQL using application runtime roles, tenant policies, connection pooling, concurrent transactions and reservation races | RLS/security from an owner-role test, mock repository or in-memory lock |
| Provider/event contract | Published versioned schemas, independent ERP/routing/telematics adapters and adversarial payloads | Supported provider capabilities from a simulated adapter |
| Integration failure | Commit/publish crashes, duplicate/reordered events, expiry/rotation/revocation, receiver outages and resumable reconciliation | Durable recovery from a local happy-path example |
| Mobile real device | Supported physical Android and iPhone devices, permission/restart/background transitions, poor network, queued GPS/POD and battery trials | Reliable background tracking from server or simulator tests |
| Browser UX/accessibility | Persisted React role workflows, keyboard/screen reader, touch/desktop layouts and recovery states with representative users | Usability or functional controls from a static screenshot |
| Container/deployment rehearsal | Clean host installation, pinned full stack, restricted independent console/agent, migration locking, interruption and compatible rollback | Deployability from a YAML parse or successful image build |
| Restore rehearsal | Isolated database and document restore, reconciliation, independently scoped credentials and measured recovery objectives | A recoverable backup from successful upload or file existence |
| Performance | Agreed realistic job/device/solver workloads, measured latency/lag/throughput and failure recovery | Capacity targets from unit tests or unsupported scale assumptions |

UK road-routing and jurisdiction-specific financial/driver/privacy rules remain provider and policy decisions requiring reviewed evidence. The baseline does not grant permission to advertise country-specific compliance merely because the operating country is agreed.

## Implementation-plan evidence contract

The Site's repository collector reads `docs/tms-plan-evidence.json` from the assessed public default-branch head. This document defines the contract; it is not itself that evidence file. A producer should prepare an entry only after examining the actual candidate and results:

| Field | Required meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `baselineId` | `freight-tms-baseline-01` |
| `entries[].id` | Existing task ID such as `M01-T04`; never a requirement ID |
| `entries[].candidateSha` | A full 40-character lowercase immutable Git commit SHA reachable from the assessed default branch |
| `entries[].patch` | Only `status`, `owner`, `notes`, `evidence`, `blocker`, `checks`; `checks` uses zero-based task acceptance indices |
| `patch.evidence` | Identifies the candidate SHA and the concrete assessed artifact/result location |
| `criterionEvidence[].index` | A distinct actual task acceptance index |
| `criterionEvidence[].result` | `passed` only when the referenced criterion has actually been assessed as passing |
| `criterionEvidence[].method` | `automated`, `review`, `device` or `rehearsal`, matching the real assessment |
| `criterionEvidence[].reference` | Includes the same immutable candidate SHA and an inspectable report, review or device/rehearsal result location |

For a `verified` task, every acceptance criterion must have passed evidence, and `checks` must cover them all. Review milestone prerequisites before advancing a milestone. Record the assessor, environment/device/role, executed scenario IDs, failure/skip counts, scope and tested SHA in the linked report or review record. The current collector checks the manifest's schema, baseline, indices, references and branch reachability; these checks do not independently authenticate a producer's claim that an external result passed.

Use `review` for this M01 design candidate until the relevant scope decisions, context contracts, operational prototypes and TDD/evidence foundations have been reviewed against their actual task criteria. A green contract suite supports the declared M01 examples; it does not verify PostgreSQL security, route-provider capabilities, Android/iPhone behaviour or a working TMS.

Do not create `verified` entries from a commit message, elapsed time, generated report template, missing evidence, skipped tests or a self-attested status. Failed/unavailable source access preserves prior evidence and reports source health; it never invents progress. Changed or failed acceptance evidence should reopen affected work for review. Plan maintenance must reconcile recorded evidence while retaining explicit blockers and unresolved decisions.

## Scope changes and production progress

This inventory is the immutable M01 design baseline. Actual progress belongs in the implementation plan and assessed reports, rather than silently rewriting `not_started` in this static document. When real behaviour is built, add executable tests in the required environment, record genuine RED/GREEN evidence and link their scenario IDs to the requirement/task criteria. If the traceability format is later extended to track assessed production execution, review its schema and checker together; do not loosen the current guards to bypass assessment.

# Milestone 01 review pack

This pack establishes the specification and delivery foundation for UK freight/delivery on .NET, PostgreSQL and React. It is a review candidate, not a running TMS.

1. Review [scope and decision ownership](scope-and-decisions.md), including mixed transport and outstanding operating parameters.
2. Review the [architecture ADR](../adr/0001-application-architecture.md) and [domain contracts](domain-model.md).
3. Open [interactive workflow prototypes](prototypes.html) and review the [workflow specification](workflows.md) and [registered navigation catalogue](navigation.json).
4. Inspect [traceability](traceability.json), [TDD delivery rules](tdd-delivery.md), and the example specification results.

Run Node traceability checks and the .NET console specification harness as documented in the root README. All fixture records are invented. The examples do not operate PostgreSQL, tracking devices, ERP providers or production infrastructure.

M01-T01 and M01-T03 require product/user review. M01-T02 executable examples and M01-T04 traceability can establish their applicable technical evidence, while their associated detailed design remains visible for review. M02 stays gated until the four M01 tasks have the required acceptance evidence.

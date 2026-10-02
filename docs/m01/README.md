# Milestone 01 review pack

This pack establishes the specification and delivery foundation for UK freight/delivery on .NET, PostgreSQL and React. The product owner completed M01 review on 2 October 2026. This pack specifies the accepted design direction; the running TMS is built through M02 onwards.

1. Review [scope and decision ownership](scope-and-decisions.md), including mixed transport and outstanding operating parameters.
2. Review the [architecture ADR](../adr/0001-application-architecture.md) and [domain contracts](domain-model.md).
3. Open [interactive workflow prototypes](prototypes.html) and review the [workflow specification](workflows.md) and [registered navigation catalogue](navigation.json).
4. Inspect [traceability](traceability.json), [TDD delivery rules](tdd-delivery.md), and the example specification results.

Run Node traceability checks and the .NET console specification harness as documented in the root README. All fixture records are invented. The examples do not operate PostgreSQL, tracking devices, ERP providers or production infrastructure.

M01-T01 and M01-T03 have product approval recorded in [product-review.json](product-review.json); M01-T02 and M01-T04 retain their limited technical assessment. All four M01 tasks are verified in the mini-site, opening M02. Acceptance of this design does not certify production security, accessibility, mobile behaviour or operational capacity.

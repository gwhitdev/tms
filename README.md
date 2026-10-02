# Transport Management System

Freight and delivery first, with a documented path to mixed transport. Initial operating country: UK. Agreed application stack: .NET, PostgreSQL and React.

This repository starts with milestone M01: executable specification, domain contracts, workflow prototypes and a traceable TDD delivery foundation. Application features remain unimplemented until their acceptance evidence is recorded.

Start with the [M01 review pack](docs/m01/README.md). The original site-assistant scope candidate is preserved under [prior-candidate](docs/m01/prior-candidate/README.md). M01 product review is complete. M02-T01 is building the local container foundation and initial installer; identity, tenant administration and operational capabilities retain their later task gates.

## Run the executable specification

Prerequisites: Node 24 and .NET SDK 10.0.400 (the pinned SDK allows a newer patch in the same feature band). No external Node or NuGet test packages are required.

```sh
node --test tests/traceability.test.mjs
node scripts/check-traceability.mjs
dotnet run --project tests/Tms.Contracts.Tests/Tms.Contracts.Tests.csproj --configuration Release
```

The .NET executable is a dependency-free scenario harness. A nonzero exit is failure; its output identifies each assessed scenario. It does not run PostgreSQL/API/mobile/ERP/security/deployment acceptance. Those real test layers are specified in [TDD delivery](docs/m01/tdd-delivery.md). CI retains limited-scope reports with the tested immutable SHA; it does not mark the TMS verified automatically.

Open `docs/m01/prototypes.html` in a browser to explore the six roles using invented fixture data. No prototype control sends bookings, tracks a device, updates a real tenant menu or deploys infrastructure. The target web application is React; the standalone HTML is a review artifact.

Do not commit credentials, personal data or live driver locations. Changes are prepared on review branches; milestone completion requires applicable review and test evidence.

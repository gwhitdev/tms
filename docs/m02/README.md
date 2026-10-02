# M02 container foundation

M01 is approved. The first implementation increment is M02-T01: a local container release containing PostgreSQL, persistent object storage, a migration job, .NET API/worker, React web gateway and a separate installation console. The launch baseline is UK parcels, one tenant, ten drivers and approximately 250 deliveries per day. Capacity has not been measured.

## Local installation

Prerequisites: a local Linux-container Docker engine and Docker Compose. From the repository root:

```sh
docker compose -f deploy/installer.compose.yaml up --detach --build --wait
docker compose -f deploy/installer.compose.yaml exec installer node /release/deploy/control/access-code.mjs
```

Open `http://127.0.0.1:8740`, enter the one-use local operator code, save an application port (default 8180), review the named release and select **Deploy foundation**. Secrets are generated in separate Docker volumes; no service password or API key belongs in the form. The console builds only the checked-in `m02-foundation` release and checks actual service readiness. Database and storage ports are private. The application opens at `http://127.0.0.1:8180` after successful installation.

The operator code and paired session are credentials. Do not commit, screenshot or share them. A paired session expires after thirty days. If the code was consumed or access must be revoked, perform the following locally, then retrieve the newly generated code:

```sh
docker compose -f deploy/installer.compose.yaml exec installer node /release/deploy/control/access-code.mjs --reset
docker compose -f deploy/installer.compose.yaml restart installer
docker compose -f deploy/installer.compose.yaml exec installer node /release/deploy/control/access-code.mjs
```

The installer state is independent of PostgreSQL. Restarting it reports an interrupted deployment as failed; retry reruns the fixed release and idempotent migration. Existing data volumes and credentials are preserved. This release has no delete/reset-data, arbitrary command, image-selection or host-mount API. M09 owns production upgrades, backup, restore and recovery controls.

## Evidence and test commands

```sh
node --test tests/installer-control.test.mjs
dotnet restore tests/Tms.Foundation.Tests/Tms.Foundation.Tests.csproj --locked-mode
dotnet run --project tests/Tms.Foundation.Tests/Tms.Foundation.Tests.csproj --configuration Release --no-restore
cd web
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

From the repository root, `node scripts/test-foundation.mjs --self-test` checks runner guards without Docker. `node scripts/test-foundation.mjs` is the actual clean-stack acceptance sequence: it unlocks/configures the installer, observes a real PostgreSQL failure before migrations, reruns migration safely, deploys through the control API, writes/read-checks a diagnostic database marker and private storage fixture, recreates containers while retaining volumes, and stops/restarts dependencies to prove readiness failure/recovery. It deliberately rejects an existing foundation installation and never deletes its data. Use CI or a fresh prepared host for a complete repeat. Reports are under `test-results/foundation`; credentials stay in memory and excluded secret volumes.

CI retains the actual tested SHA and limited-scope reports. A passing workflow does not automatically verify a plan criterion. The private filer fixture proves storage persistence; tenant-authorised POD storage, signed URLs and retention are later work.

## Implementation boundary

M02-T02 identity and tenant isolation, M02-T03 tenant/system administration, M02-T04 registered menu management and M02-T05 domain modules/outbox/observability are still pending. The application reports this accurately and exposes no tenant/business commands. This foundation is a local development release; it makes no production availability, security certification, route-planning or delivery capability claim.

See [ADR 0002](../adr/0002-local-container-foundation.md) for the control-plane privilege boundary and pinned infrastructure.

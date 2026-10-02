# M01-T01 — Local verification evidence

## Environment and scope

The workspace initially contained only `.tms-empty-repository`; no application,
architecture, test suite or build configuration was present. `python3 --version`
returned `Python 3.14.8`; the checks use only its preinstalled standard library.
`git status --short` exited 128 with `fatal: not a git repository (or any of the
parent directories): .git`, so no base revision or Git diff is available here.
No repository fetch or other external network action was attempted.

## Actual commands and results

1. Added `tests/test_scope_decisions.py` before creating the decision artifacts.
2. Ran `python3 -m unittest discover -s tests -v`.
   Exit 1: four tests ran, all errored with `FileNotFoundError` for
   `docs/M01-T01-decisions.json`. This is the expected red phase: the required
   decision/scope artifact did not yet exist.
3. Added `docs/M01-T01-decisions.json` and `docs/M01-T01-scope.md`.
4. Reran `python3 -m unittest discover -s tests -v`.
   Result: `Ran 4 tests in 0.001s`, `OK`; all four checks passed.
5. Ran `python3 -m json.tool docs/M01-T01-decisions.json > /dev/null`.
   Exit 0; JSON parsed successfully.

## What the checks establish

- All eight decision topics have traceable source IDs, proposed accountable
  roles, explicit unassigned people, questions, delivery effects and closure
  evidence requirements.
- Operating and scale inputs include countries, cargo, fleet, jobs, users,
  devices, hosting, availability, RTO/RPO and integration field ownership.
- The candidate includes freight lifecycle/workflows, independent state axes,
  ownership boundaries and separate freight/passenger field ownership.
- The record does not claim approval, accepted owner assignments or completion.

These are document acceptance checks, not runtime behavior tests or CI evidence.
They do not evaluate provider suitability, legal compliance, performance,
recovery, actual persistence isolation or human approval. The prose extension
design still requires domain review.

## Remaining acceptance gaps

The supplied context leaves delivery/task owners unassigned and supplies no
scope approval. Proposed roles are recorded, but named accountable owners must
accept their assignments. Authorized reviewers must explicitly approve freight
scope and the mixed-transport extension with revision-linked evidence.

This is a candidate for review, not a released or business-acceptance-verified
implementation. Neither M01-T01 nor milestone M01 is marked complete.
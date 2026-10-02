# M01 assessment records

These retained records support the design and contract examples in this candidate. They do not assess production transport requirements. Source hashes in `local-assessment.json` identify the checked inputs; the plan evidence manifest in the follow-up commit pins the assessed repository revision.

`domain-red.log` records 17 behavioural failures against the initial rule stubs, followed by `domain-green.log`. `domain-parent-check.log` is the independent final run. [The traceability transcript record](traceability-tdd-transcripts/README.md), added in the assessment follow-up commit, distinguishes the behavioural orphan-example failure from the earlier missing-module bootstrap failure. These transcript copies preserve original tool-visible output; original raw traceability RED/GREEN log files, exact timestamps and tested SHAs were not captured. Local filesystem prefixes are sanitised; result lines are unchanged.

The final local checks passed 17/17 domain examples and 29/29 traceability tests, with 63 requirements and all 126 requirement acceptance criteria mapped. CI retains its own reports with the SHA actually checked out, which can differ from a pull request branch head.

Browser fixture checks covered dispatch capacity blocking, offline partial delivery recording and acknowledgement, denial of a platform route from tenant administration, editable menu preview/publication/revert, and installer readiness failure/retry without applying the fixture migration twice. These were local interaction checks, not tests of persisted React workflows, access enforcement, native tracking, Docker installation or accessibility conformance. Representative role review remains pending.

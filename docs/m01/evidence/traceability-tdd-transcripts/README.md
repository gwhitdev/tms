# Preserved M01-T04 behavioural TDD command record

These files preserve the original tool-visible outputs from the completed subagent work. No RED or GREEN test was rerun to create them.

- `red.transcript.txt`: the original behavioural RED, when removing `DDD-STATE-01` and its backlinks still left the executable harness case unnoticed. The test failed with `Missing expected exception`; 28 tests passed and 1 failed.
- `green.transcript.txt`: the original subsequent GREEN after the checker gained exact harness-to-inventory case comparison. All 29 tests passed, and the inventory reported the complete baseline with `verified=0`.
- `provenance.json`: the commands, environment, original RED execution chunk ID, observed counts, limitations and sanitisation record.

The original runs were not redirected into raw log files at execution time. These are faithful text copies of the outputs retained in the Codex conversation, not original byte-for-byte stdout/stderr artifacts. Absolute user/workspace path prefixes in stack traces are replaced with `[repository]/`. No substantive test result was changed.

No immutable Git SHA or exact wall-clock timestamp was captured for either original run. Do not invent those associations. A later commit may preserve this evidence record; tests at that candidate SHA must be assessed separately. This record demonstrates the specific checker behavioural RED/GREEN sequence. It does not demonstrate a working TMS or production acceptance.

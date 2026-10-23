# Fallback rules

Used only when the named skill is not installed. Each section stands in for one skill the pipeline normally calls; install the real one for the full treatment.

## §1 Investigate — stands in for `superpowers:systematic-debugging`

- Reproduce the symptom before changing anything. If you cannot reproduce, say so and stop at a hypothesis.
- One hypothesis at a time. Write it down, name the evidence that would refute it, then look.
- Find the root cause, not the first place the symptom appears. Trace back through callers until the behaviour is explained.
- Never patch the symptom to make a test pass.

## §2 Plan — stands in for `ponytail`

- Shortest diff that satisfies the acceptance criteria. Nothing beyond the expected result.
- Reuse what the repo already has: existing helpers, existing patterns, existing tests. No new abstractions for one caller.
- No new files unless the brief allows them. No new dependencies.
- No formatting churn: do not touch lines you do not need.

## §3 Review — stands in for `superpowers:requesting-code-review`

- Read the diff against the brief: every change maps to a criterion or a named caller. Anything else is scope creep.
- For each changed function, list its callers and check each still gets what it expects.
- Comments and messages in English; no leftover instrumentation; no verification-only files.
- Report in order: blockers (does not compile, test fails), should-fix, cosmetic, environment noise.

## §4 Verify — stands in for `superpowers:verification-before-completion`

- Run the profile's verify commands and paste the actual output before claiming anything passes.
- "Should pass" is not evidence. A skipped step is reported as skipped.
- If a test fails, the report says so with the output; do not narrow the claim to make it true.

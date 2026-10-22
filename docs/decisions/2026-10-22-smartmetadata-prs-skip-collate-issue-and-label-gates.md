# SmartMetadata product PRs skip Collate issue-link and fork-label gates

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** Bernie Bai
- **Guard:** `scripts/rebuild/test_pr_hygiene_workflows.py`
- **Related:** ADR:2026-10-22-rebuild-ci-is-a-separate-workflow; `docs/rebuild/PARITY.md`

## Context

This repository (`BMJLearnToHelloWorld/SmartMetadata`) forked Collate workflows
that cannot succeed honestly on product PRs:

- GitHub **issues are disabled**. `Validate PR Metadata` required a linked
  Shipping-project issue (`Fixes #N`). Merged product PRs (#15–#17) failed that
  check; maintainers merged anyway. Fake issue links are not an option.
- `Verify PR labels` required Collate's `safe to test` label. `.github/teams.yml`
  lists Collate GitHub users, not this fork's authors. Same-repository PRs
  (write access to push a branch) still failed Java Checkstyle, JSON/YAML,
  Maven SonarCloud, and other `pull_request_target` jobs at that step.
- `Maven Collate Tests` dispatches `open-metadata/openmetadata-collate`, which
  this org does not own.

`pull_request_target` workflows run from the **base** branch. A PR that only
changes the workflow file does not change the check running on that PR; the
durable skip lands after merge. Until then, `skip-pr-checks` (already honored
by the metadata workflow on main) and `safe to test` (already the Collate
fork gate) remain the labels that make the **currently deployed** checks green.

## Decision

- **Linked-issue metadata:** skip when `GET /repos/{owner}/{repo}` reports
  `has_issues: false`. Keep the `skip-pr-checks` bypass for when issues are
  later enabled.
- **`safe to test`:** require it only for **fork** `pull_request_target` PRs
  (`head.repo.full_name != github.repository`). Same-repo PRs skip
  `Wait for the labeler` and `Verify PR labels`.
- **Maven Collate Tests:** do not dispatch to
  `open-metadata/openmetadata-collate` unless `github.repository` is
  `open-metadata/OpenMetadata`. On this fork the job must **run and succeed**
  with an explicit skip (a skipped job would leave a required check pending).
- Product gate remains Job A of `.github/workflows/smartmetadata-rebuild.yml`
  (`make verify-rebuild`). Do not treat Collate Playwright / ingestion-image
  jobs as the product gate.

## Consequences

Same-repo product PRs can pass required checks without fake issues or Collate
allowlist membership. Fork PRs still need a maintainer `safe to test` label
before privileged `pull_request_target` jobs run untrusted code. Revisit the
issues skip if GitHub issues are enabled and a real tracker exists.

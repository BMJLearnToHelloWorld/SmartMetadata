# Python artifact stamping preserves locked dependency selections

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `smartmetadata-ingestion/tests/test_update_version_script.py`
- **Related:** Upstream PR #36870; pin ADR `2026-11-02-python-artifact-stamping-preserves-locked-selections.md`; `wave2/REVIEW-W2-K-SMALL.md` condition 14; `wave2/K-S3-IMPL.md` §1

## Context

Source builds assign artifact versions before packaging. Updating project metadata alone leaves
the local package version in an adjacent `uv.lock` inconsistent. Replacing unrelated version
assignments also changes dependency metadata that belongs to the selected dependency graph.

`scripts/update_version.py` used to rewrite the version with a bare regex, which could touch any
`version = "..."` line in the file.

## Decision

- Stamp only `[project].version` and, when an adjacent `uv.lock` exists, the matching local
  editable/directory package record in that lock.
- Preserve dependency metadata and third-party lock selections.
- Validate an existing lock before and after stamping with `uv lock --check`.
- The `update_pyproject_version` subcommand takes the pyproject path and the release version;
  a lock is only consulted when one sits next to that pyproject.

## Consequences

Artifact versions can change while retaining the selected dependency graph. Version stamping
does not perform dependency maintenance: stale dependency inputs fail validation and require a
separate lock update. Projects without an adjacent lock continue to receive project-version
updates.

Product adaptations (this port differs from upstream in scope, not in rule):

- The product ingestion tree (`smartmetadata-ingestion/`) ships no `uv.lock`, so the lock
  branch is dormant in product use; it is covered at unit level through `local_lock_versions`,
  not end to end.
- The product root Makefile is rebuild-only and has no `update_pyproject_version` target, so
  there is no make entry point to the stamper; the script is invoked directly.

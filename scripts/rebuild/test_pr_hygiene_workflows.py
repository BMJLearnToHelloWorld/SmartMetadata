"""Contract: product PRs must not need Collate issue links or fork labels.

Fails if metadata validation still requires a linked issue when GitHub issues
are disabled, if `Verify PR labels` still runs on same-repo PRs, or if Maven
Collate Tests still dispatch to open-metadata/openmetadata-collate from this
fork.
"""

from __future__ import annotations

import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO / ".github" / "workflows"
METADATA = WORKFLOWS / "pr-metadata-validation.yml"
TEAM = WORKFLOWS / "team-labeler.yml"
COLLATE = WORKFLOWS / "maven-build-collate.yml"
SAME_REPO_SKIP = "github.event.pull_request.head.repo.full_name != github.repository"
UPSTREAM_ONLY = "github.repository == 'open-metadata/OpenMetadata'"


def _step_block(text: str, heading: str) -> str:
    marker = f"- name: {heading}"
    start = text.index(marker)
    rest = text[start + len(marker) :]
    nxt = rest.find("\n      - name:")
    if nxt < 0:
        nxt = rest.find("\n    - name:")
    return text[start : start + len(marker) + (len(rest) if nxt < 0 else nxt)]


class ProductPrHygieneContract(unittest.TestCase):
    def test_metadata_validation_skips_when_issues_disabled(self) -> None:
        text = METADATA.read_text(encoding="utf-8")
        self.assertIn("has_issues", text)
        self.assertIn("Repository has GitHub issues disabled", text)
        self.assertIn("skip-pr-checks", text)
        self.assertIn("labeled", text)
        self.assertIn(
            "ADR:2026-10-22-smartmetadata-prs-skip-collate-issue-and-label-gates",
            text,
        )

    def test_every_verify_pr_labels_step_skips_same_repo(self) -> None:
        missing: list[str] = []
        for path in sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml")):
            text = path.read_text(encoding="utf-8")
            if "verify-pr-label-action" not in text:
                continue
            lines = text.splitlines()
            for i, line in enumerate(lines):
                if "verify-pr-label-action" not in line:
                    continue
                window = "\n".join(lines[max(0, i - 8) : min(len(lines), i + 8)])
                if SAME_REPO_SKIP not in window:
                    missing.append(f"{path.name}: around line {i + 1}")
        self.assertFalse(
            missing,
            "Verify PR labels must skip same-repo PRs:\n" + "\n".join(missing),
        )

    def test_team_labeler_does_not_comment_when_verify_is_skipped(self) -> None:
        text = TEAM.read_text(encoding="utf-8")
        comment = _step_block(text, "Add verification comment")
        self.assertIn("steps.verify.outcome == 'failure'", comment)
        self.assertNotIn("steps.verify.outcome != 'success'", comment)

    def test_maven_collate_does_not_dispatch_from_this_fork(self) -> None:
        text = COLLATE.read_text(encoding="utf-8")
        skip = _step_block(text, "Skip Collate dispatch outside open-metadata/OpenMetadata")
        self.assertIn("github.repository != 'open-metadata/OpenMetadata'", skip)
        self.assertIn("open-metadata/openmetadata-collate", skip)
        trigger = _step_block(text, "Trigger Collate build & wait")
        self.assertIn(UPSTREAM_ONLY, trigger)
        collate_job = text[text.index("maven-collate-ci:") :]
        self.assertIn(f"if: {UPSTREAM_ONLY}", collate_job)
        self.assertIn("openmetadata-dispatch.yml", trigger)


if __name__ == "__main__":
    unittest.main()

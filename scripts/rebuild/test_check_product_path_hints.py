"""Contract for product-path misuse guards.

Run with ``python3 scripts/rebuild/test_check_product_path_hints.py``.
Stdlib only — does not import the dist CCL scanner.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HINTS = Path(__file__).with_name("check_product_path_hints.py")
DOCKER_COMMON = REPO / "docker" / "run_local_docker_common.sh"


def load_hints():
    spec = importlib.util.spec_from_file_location("check_product_path_hints", HINTS)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {HINTS}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def complete_tree(root: Path) -> None:
    write(
        root / "docs" / "rebuild" / "PRODUCT_PATH.md",
        "\n".join(
            [
                "# Product path",
                "Product: make slim-dist + smartmetadata-ui + smartmetadata-ingestion + smartmetadata-mcp.",
                "Historical trees stay **reference-only**; do not delete them in this change.",
                "Product Docker is `make docker-up` / `./docker/rebuild/up.sh`.",
                "Do not demo with `./docker/run_local_docker.sh` or Collate quickstart images.",
                "`./docker/run_local_docker.sh -i true` stays reference-only.",
                "Override the historical docker path only with I_UNDERSTAND_REFERENCE_STACK=1.",
                "Override the docker ingestion path only with I_UNDERSTAND_CCL_INGESTION=1.",
                "Default `make help` lists rebuilt targets only.",
                "CCL Make recipes live in Makefile.reference behind I_UNDERSTAND_REFERENCE_STACK=1.",
                "Console is host 8089. China runbook: DEPLOY_CN.md. Official registries: docker-up-intl.",
                "VERIFY leftovers: openmetadata-airflow-apis header/LICENSE conflict;",
                "openmetadata-ui-core-components is not in dist.",
                "",
            ]
        ),
    )
    write(
        root / "docs" / "decisions" / "2026-10-22-ccl-trees-stay-reference-only.md",
        "# CCL trees stay reference-only\n",
    )
    write(
        root / "docs" / "decisions" / "2026-10-22-product-make-is-rebuild-only.md",
        "# Product Make executes rebuilt surfaces only\n",
    )
    write(
        root / "docs" / "decisions" / "2026-10-23-product-docker-is-rebuild-only.md",
        "# Product Docker executes rebuilt compose only\n",
    )
    write(
        root / "docs" / "decisions" / "2026-10-25-product-docker-defaults-to-china-mirrors.md",
        "# Product Docker defaults to the China compose overlay\n",
    )
    write(
        root / "docs" / "rebuild" / "DEPLOY_CN.md",
        "China runbook. UI 8089. "
        "m.daocloud.io/docker.elastic.co ES proxy. "
        "maven.aliyun.com Aliyun Central. "
        "migrate Exited 0 is expected. "
        "make docker-up-intl for official registries. "
        "Hub registry-mirrors do not cover elastic.co or gcr.\n",
    )
    write(
        root / "docker" / "run_local_docker_common.sh",
        "require_ccl_ingestion_ack() {\n  :\n}\n"
        "require_reference_stack_ack() {\n  :\n}\n"
        "I_UNDERSTAND_CCL_INGESTION\n"
        "I_UNDERSTAND_REFERENCE_STACK\n"
        "require_reference_stack_ack\n"
        '  if [[ $includeIngestion == "true" ]]; then\n'
        "    require_ccl_ingestion_ack\n"
        "  fi\n",
    )
    write(
        root / "README.md",
        "See [docs/rebuild/PRODUCT_PATH.md](docs/rebuild/PRODUCT_PATH.md).\n"
        "Product Docker: make docker-up (docker/rebuild/).\n"
        "Escape hatch: I_UNDERSTAND_REFERENCE_STACK=1\n",
    )
    write(
        root / "openmetadata-dist" / "pom.xml",
        "<dependency><artifactId>openmetadata-ui</artifactId></dependency>\n",
    )
    write(
        root / "Makefile",
        "ifeq ($(I_UNDERSTAND_REFERENCE_STACK),1)\n"
        "include Makefile.reference\n"
        "include ingestion/Makefile\n"
        "endif\n"
        "docker-up:\n\t./docker/rebuild/up.sh\n"
        "docker-up-intl:\n\tSM_DOCKER_VARIANT=intl ./docker/rebuild/up.sh\n"
        "docker-down:\n\t./docker/rebuild/down.sh\n"
        "slim-dist:\n\tmvn $(MAVEN_SETTINGS)\n",
    )
    write(
        root / "Makefile.reference",
        "yarn_start_dev_ui:\n\tcd openmetadata-ui/src/main/resources/ui && yarn start\n",
    )
    write(
        root / "scripts" / "rebuild" / "require_reference_stack.py",
        "ENV = 'I_UNDERSTAND_REFERENCE_STACK'\n"
        "# NOT the SmartMetadata product path\n"
        "make docker-up\n",
    )
    write(
        root / "scripts" / "dev_setup.sh",
        "python3 scripts/rebuild/require_reference_stack.py --target dev_setup\n",
    )
    write(
        root / "docker" / "docker-compose-quickstart" / "docker-compose.yml",
        "# Historical Collate quickstart — not a SmartMetadata product demo.\n",
    )
    write(
        root / "docker" / "docker-compose-quickstart" / "up.sh",
        "python3 scripts/rebuild/require_reference_stack.py --target compose-quickstart\n"
        "docker compose -f docker-compose.yml \"$@\"\n",
    )
    write(
        root / "docker" / "rebuild" / "docker-compose.yml",
        "services:\n"
        "  mysql:\n    image: mysql:8.0\n"
        "  elasticsearch:\n    image: docker.elastic.co/elasticsearch/elasticsearch:9.3.0\n"
        "  migrate:\n    build:\n      dockerfile: docker/rebuild/Dockerfile\n"
        "  openmetadata-server:\n    build:\n      dockerfile: docker/rebuild/Dockerfile\n"
        "  ui:\n    build:\n      context: ../../smartmetadata-ui\n"
        "    ports:\n      - \"8089:80\"\n"
        "  ingest:\n    build:\n      context: ../../smartmetadata-ingestion\n"
        "  mcp:\n    build:\n      context: ../../smartmetadata-mcp\n",
    )
    write(
        root / "docker" / "rebuild" / "docker-compose.cn.yml",
        "services:\n"
        "  elasticsearch:\n"
        "    image: m.daocloud.io/docker.elastic.co/elasticsearch/elasticsearch:9.3.0\n"
        "  migrate:\n"
        "    build:\n      args:\n"
        "        DISTROLESS_IMAGE: m.daocloud.io/gcr.io/distroless/cc-debian13:debug-nonroot\n"
        "  ui:\n    ports:\n      - \"8089:80\"\n",
    )
    write(
        root / "docker" / "rebuild" / "docker-compose.intl.yml",
        "services:\n"
        "  elasticsearch:\n"
        "    image: docker.elastic.co/elasticsearch/elasticsearch:9.3.0\n"
        "  migrate:\n"
        "    build:\n      args:\n"
        "        DISTROLESS_IMAGE: gcr.io/distroless/cc-debian13:debug-nonroot\n"
        "  ui:\n    ports:\n      - \"8089:80\"\n",
    )
    write(
        root / "docker" / "rebuild" / "compose-variant.sh",
        'VARIANT="${SM_DOCKER_VARIANT:-cn}"\n'
        "COMPOSE_FILES=(-f docker/rebuild/docker-compose.yml -f docker/rebuild/docker-compose.cn.yml)\n",
    )
    write(
        root / "docker" / "rebuild" / "maven-settings.cn.xml.example",
        "<settings><mirrors><mirror>"
        "<url>https://maven.aliyun.com/repository/central</url>"
        "</mirror></mirrors></settings>\n",
    )
    write(
        root / "docker" / "rebuild" / "Dockerfile",
        "ARG DISTROLESS_IMAGE=gcr.io/distroless/cc-debian13:debug-nonroot\n"
        "COPY openmetadata-dist/target/openmetadata-*.tar.gz /\n"
        "RUN tar zxvf openmetadata-*.tar.gz\n",
    )
    write(
        root / "docker" / "rebuild" / "up.sh",
        "#!/bin/bash\n"
        "make slim-dist\n"
        "python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball\n"
        "source docker/rebuild/compose-variant.sh\n"
        "docker compose -f docker/rebuild/docker-compose.yml "
        "-f docker/rebuild/docker-compose.cn.yml up -d\n"
        "echo Console http://localhost:8089 ingest mcp\n"
        "echo migrate Exited 0 is expected\n",
    )
    write(
        root / "docker" / "rebuild" / "Dockerfile.ui",
        "FROM nginx:1.27-alpine\nCOPY dist /usr/share/nginx/html\n",
    )
    write(
        root / "docker" / "rebuild" / "Dockerfile.ingest",
        "FROM python:3.11-slim\nCOPY src ./src\n",
    )
    write(
        root / "docker" / "rebuild" / "Dockerfile.mcp",
        "FROM node:22-bookworm-slim\nCOPY dist ./dist\n",
    )
    write(
        root / "docker" / "rebuild" / "down.sh",
        "source docker/rebuild/compose-variant.sh\n"
        "docker compose -f docker/rebuild/docker-compose.yml "
        "-f docker/rebuild/docker-compose.cn.yml down\n",
    )
    write(
        root / "docker" / "development" / "docker-compose.yml",
        "# Historical reference-only compose. Product path: make docker-up.\n"
        "services:\n  ingestion:\n    build:\n      dockerfile: ingestion/Dockerfile.ci\n",
    )


class ProductPathHintsContract(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(HINTS.is_file(), "scripts/rebuild/check_product_path_hints.py must exist")

    def test_empty_tree_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            errors = hints.check_repo(Path(tmp))
        self.assertTrue(errors)
        joined = "\n".join(errors)
        self.assertIn("PRODUCT_PATH.md", joined)

    def test_complete_tree_passes_even_if_dist_pom_lists_ui(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            errors = hints.check_repo(root)
        self.assertEqual(errors, [], errors)

    def test_does_not_parse_dist_pom(self) -> None:
        hints = load_hints()
        source = HINTS.read_text(encoding="utf-8")
        self.assertNotIn("openmetadata-dist/pom.xml", source)
        self.assertNotIn("binary.xml", source)
        self.assertIn("does not re-scan", (hints.__doc__ or "").lower())

    def test_ungated_ingestion_include_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "Makefile").write_text(
                "include ingestion/Makefile\n", encoding="utf-8"
            )
            errors = hints.check_repo(root)
        self.assertTrue(
            any("ingestion/Makefile" in item for item in errors),
            errors,
        )

    def test_missing_docker_ack_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "docker" / "run_local_docker_common.sh").write_text(
                "includeIngestion=true\n", encoding="utf-8"
            )
            errors = hints.check_repo(root)
        self.assertTrue(any("I_UNDERSTAND_CCL_INGESTION" in item for item in errors), errors)

    def test_missing_cn_compose_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "docker" / "rebuild" / "docker-compose.cn.yml").unlink()
            errors = hints.check_repo(root)
        self.assertTrue(any("docker-compose.cn.yml" in item for item in errors), errors)

    def test_up_without_8089_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "docker" / "rebuild" / "up.sh").write_text(
                "#!/bin/bash\n"
                "make slim-dist\n"
                "docker compose -f docker/rebuild/docker-compose.yml up -d\n"
                "echo Console http://localhost:8080 ingest mcp\n",
                encoding="utf-8",
            )
            errors = hints.check_repo(root)
        self.assertTrue(any("8089" in item for item in errors), errors)

    def test_missing_product_docker_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "docker" / "rebuild" / "docker-compose.yml").unlink()
            errors = hints.check_repo(root)
        self.assertTrue(any("docker/rebuild" in item for item in errors), errors)

    def test_product_compose_with_ingestion_fails(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "docker" / "rebuild" / "docker-compose.yml").write_text(
                "services:\n"
                "  mysql:\n    image: mysql:8.0\n"
                "  elasticsearch:\n    image: docker.elastic.co/elasticsearch/elasticsearch:9.3.0\n"
                "  migrate:\n    build:\n      dockerfile: docker/rebuild/Dockerfile\n"
                "  openmetadata-server:\n    build:\n      dockerfile: docker/rebuild/Dockerfile\n"
                "  ui:\n    build:\n      context: ../../smartmetadata-ui\n"
                "  ingest:\n    build:\n      context: ../../smartmetadata-ingestion\n"
                "  mcp:\n    build:\n      context: ../../smartmetadata-mcp\n"
                "  ingestion:\n    build:\n      dockerfile: ingestion/Dockerfile.ci\n",
                encoding="utf-8",
            )
            errors = hints.check_repo(root)
        self.assertTrue(
            any("ingestion" in item for item in errors),
            errors,
        )

    def test_product_up_must_not_set_ccl_hatch(self) -> None:
        hints = load_hints()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            complete_tree(root)
            (root / "docker" / "rebuild" / "up.sh").write_text(
                "export I_UNDERSTAND_CCL_INGESTION=1\n"
                "docker compose -f docker/development/docker-compose.yml up -d\n",
                encoding="utf-8",
            )
            errors = hints.check_repo(root)
        self.assertTrue(
            any("I_UNDERSTAND_CCL_INGESTION" in item or "docker/rebuild" in item for item in errors),
            errors,
        )

    def test_live_tree_passes(self) -> None:
        hints = load_hints()
        self.assertEqual(hints.main([]), 0)


class CclIngestionDockerAck(unittest.TestCase):
    def _stub_bin(self, tmp: Path) -> tuple[Path, dict[str, str]]:
        stub = tmp / "bin"
        stub.mkdir()
        log = tmp / "invoked.log"
        for name in ("docker", "mvn", "make", "curl"):
            script = stub / name
            script.write_text(
                f"#!/bin/bash\nprintf '%s ' '{name}' >> '{log}'\nprintf '%s\\n' \"$*\" >> '{log}'\nexit 0\n",
                encoding="utf-8",
            )
            script.chmod(0o755)
        env = os.environ.copy()
        env.pop("I_UNDERSTAND_CCL_INGESTION", None)
        env["PATH"] = f"{stub}{os.pathsep}{env.get('PATH', '')}"
        return log, env

    def test_entry_point_refuses_without_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log, env = self._stub_bin(Path(tmp))
            completed = subprocess.run(
                ["bash", str(REPO / "docker" / "run_local_docker.sh"), "-i", "true", "-s", "true"],
                check=False,
                capture_output=True,
                text=True,
                env=env,
                cwd=str(REPO),
                timeout=8,
            )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("NOT the SmartMetadata product path", completed.stderr)
        self.assertIn("I_UNDERSTAND_REFERENCE_STACK", completed.stderr)
        self.assertIn("make docker-up", completed.stderr)
        self.assertFalse(log.is_file(), log.read_text(encoding="utf-8") if log.is_file() else "")

    def test_entry_point_refuses_ingestion_even_with_reference_hatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log, env = self._stub_bin(Path(tmp))
            env["I_UNDERSTAND_REFERENCE_STACK"] = "1"
            completed = subprocess.run(
                ["bash", str(REPO / "docker" / "run_local_docker.sh"), "-i", "true", "-s", "true"],
                check=False,
                capture_output=True,
                text=True,
                env=env,
                cwd=str(REPO),
                timeout=8,
            )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("NOT the SmartMetadata product path", completed.stderr)
        self.assertIn("I_UNDERSTAND_CCL_INGESTION", completed.stderr)
        self.assertFalse(log.is_file(), log.read_text(encoding="utf-8") if log.is_file() else "")

    def test_refuses_without_env(self) -> None:
        env = os.environ.copy()
        env.pop("I_UNDERSTAND_CCL_INGESTION", None)
        completed = subprocess.run(
            [
                "bash",
                "-c",
                f"source {DOCKER_COMMON} && require_ccl_ingestion_ack",
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("I_UNDERSTAND_CCL_INGESTION", completed.stderr)
        self.assertIn("NOT the SmartMetadata product path", completed.stderr)
        self.assertIn("\033[0;31m", completed.stderr)

    def test_allows_with_env(self) -> None:
        env = os.environ.copy()
        env["I_UNDERSTAND_CCL_INGESTION"] = "1"
        completed = subprocess.run(
            [
                "bash",
                "-c",
                f"source {DOCKER_COMMON} && require_ccl_ingestion_ack",
            ],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn("I_UNDERSTAND_CCL_INGESTION", completed.stderr)


if __name__ == "__main__":
    unittest.main()

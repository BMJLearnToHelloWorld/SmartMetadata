"""Contract: product Make/dev_setup/quickstart never execute CCL reference trees.

Run with ``python3 scripts/rebuild/test_require_reference_stack.py``.
Stdlib only. Mirrors ``test_check_product_path_hints.py``.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
GUARD = Path(__file__).with_name("require_reference_stack.py")
MAKEFILE = REPO / "Makefile"
MAKEFILE_REFERENCE = REPO / "Makefile.reference"
ANSI = re.compile(r"\x1b\[[0-9;]*m")
HATCH = "I_UNDERSTAND_REFERENCE_STACK"

PRODUCT_HELP_TARGETS = (
    "slim-dist",
    "docker-up",
    "docker-down",
    "ui_dev",
    "ui_install",
    "ingest_install",
    "mcp_install",
    "verify-rebuild",
    "live-smoke",
    "check-ccl-free-dist",
    "check-product-path-hints",
)
CCL_MAKE_TARGETS = (
    "yarn_start_dev_ui",
    "yarn_install_cache",
    "install",
    "install_dev",
    "generate",
    "dev_setup",
)


def load_guard():
    spec = importlib.util.spec_from_file_location("require_reference_stack", GUARD)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {GUARD}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def strip_ansi(text: str) -> str:
    return ANSI.sub("", text)


def run_make(args: list[str], *, env: dict[str, str] | None = None, timeout: int = 8) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    merged.pop(HATCH, None)
    merged.pop("I_UNDERSTAND_CCL_INGESTION", None)
    merged.pop("MAKEFLAGS", None)
    merged.pop("MFLAGS", None)
    merged.pop("MAKELEVEL", None)
    if env:
        merged.update(env)
    return subprocess.run(
        ["make", *args],
        check=False,
        capture_output=True,
        text=True,
        env=merged,
        cwd=str(REPO),
        timeout=timeout,
    )


class RequireReferenceStackScript(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(GUARD.is_file(), "scripts/rebuild/require_reference_stack.py must exist")

    def test_refuses_without_env(self) -> None:
        guard = load_guard()
        env = os.environ.copy()
        env.pop(HATCH, None)
        completed = subprocess.run(
            [sys.executable, str(GUARD), "--target", "yarn_start_dev_ui"],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("NOT the SmartMetadata product path", completed.stderr)
        self.assertIn(HATCH, completed.stderr)
        self.assertIn("make ui_dev", completed.stderr)
        self.assertEqual(guard.ENV_NAME, HATCH)

    def test_allows_with_env(self) -> None:
        env = os.environ.copy()
        env[HATCH] = "1"
        completed = subprocess.run(
            [sys.executable, str(GUARD), "--target", "yarn_start_dev_ui"],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertIn(HATCH, completed.stderr)

    def test_ccl_ingestion_env_is_not_enough(self) -> None:
        env = os.environ.copy()
        env.pop(HATCH, None)
        env["I_UNDERSTAND_CCL_INGESTION"] = "1"
        completed = subprocess.run(
            [sys.executable, str(GUARD), "--target", "install"],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
        )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn(HATCH, completed.stderr)


class ProductMakefileSurface(unittest.TestCase):
    def test_reference_makefile_exists(self) -> None:
        self.assertTrue(MAKEFILE_REFERENCE.is_file(), "Makefile.reference must hold CCL recipes")

    def test_help_lists_only_product_targets(self) -> None:
        completed = run_make(["help"])
        self.assertEqual(completed.returncode, 0, completed.stderr)
        text = strip_ansi(completed.stdout + completed.stderr)
        for target in PRODUCT_HELP_TARGETS:
            self.assertRegex(text, rf"(?m)^{re.escape(target)}\s", f"help must list {target}")
        for target in CCL_MAKE_TARGETS:
            self.assertNotRegex(
                text,
                rf"(?m)^{re.escape(target)}\s",
                f"help must not list CCL target {target} without {HATCH}",
            )
        self.assertIn("rebuild", text.lower())
        self.assertIn(HATCH, text)

    def test_ccl_targets_refuse_without_hatch(self) -> None:
        for target in CCL_MAKE_TARGETS:
            with self.subTest(target=target):
                completed = run_make([target])
                self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
                err = strip_ansi(completed.stderr + completed.stdout)
                self.assertIn("NOT the SmartMetadata product path", err)
                self.assertIn(HATCH, err)
                self.assertNotIn("pip install ingestion/", err)
                self.assertNotIn("cd openmetadata-ui/", err)

    def test_product_targets_still_dry_run(self) -> None:
        ui = run_make(["-n", "ui_dev"])
        self.assertEqual(ui.returncode, 0, ui.stderr)
        self.assertIn("smartmetadata-ui", ui.stdout)
        self.assertNotIn("openmetadata-ui/", ui.stdout)

        slim = run_make(["-n", "slim-dist"])
        self.assertEqual(slim.returncode, 0, slim.stderr)
        self.assertIn("openmetadata-dist", slim.stdout)
        self.assertNotIn("openmetadata-ui/", slim.stdout)

        docker_up = run_make(["-n", "docker-up"])
        self.assertEqual(docker_up.returncode, 0, docker_up.stderr)
        self.assertIn("docker/rebuild/up.sh", docker_up.stdout)
        self.assertNotIn("run_local_docker.sh", docker_up.stdout)
        self.assertNotIn("I_UNDERSTAND_CCL_INGESTION", docker_up.stdout)
        self.assertNotIn("openmetadata-ui/", docker_up.stdout)

        docker_up_intl = run_make(["-n", "docker-up-intl"])
        self.assertEqual(docker_up_intl.returncode, 0, docker_up_intl.stderr)
        self.assertIn("SM_DOCKER_VARIANT=intl", docker_up_intl.stdout)
        self.assertIn("docker/rebuild/up.sh", docker_up_intl.stdout)

    def test_hatch_enables_reference_recipes(self) -> None:
        yarn = run_make(["-n", "yarn_start_dev_ui"], env={HATCH: "1"})
        self.assertEqual(yarn.returncode, 0, yarn.stderr)
        self.assertIn("openmetadata-ui/src/main/resources/ui", yarn.stdout)

        install = run_make(["-n", "install"], env={HATCH: "1"})
        self.assertEqual(install.returncode, 0, install.stderr)
        self.assertIn("pip install", install.stdout)
        self.assertIn("ingestion", install.stdout)

    def test_unconditional_ingestion_include_is_gone(self) -> None:
        from check_product_path_hints import ingestion_include_is_gated

        errors = ingestion_include_is_gated(MAKEFILE.read_text(encoding="utf-8"))
        self.assertEqual(errors, [], errors)

    def test_product_makefile_recipes_do_not_cd_into_ccl_trees(self) -> None:
        from check_product_path_hints import product_makefile_body

        body = product_makefile_body(MAKEFILE.read_text(encoding="utf-8"))
        for needle in (
            "cd openmetadata-ui",
            "cd ingestion",
            "cd openmetadata-mcp",
            "cd openmetadata-airflow-apis",
            "cd openmetadata-ui-core-components",
            "pip install ingestion",
            "pip install \"ingestion",
        ):
            self.assertNotIn(needle, body, f"product Makefile must not execute {needle!r}")


class DevSetupAndComposeFootguns(unittest.TestCase):
    def test_dev_setup_script_refuses_without_hatch(self) -> None:
        env = os.environ.copy()
        env.pop(HATCH, None)
        completed = subprocess.run(
            ["bash", str(REPO / "scripts" / "dev_setup.sh"), "--check"],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(REPO),
            timeout=8,
        )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn(HATCH, completed.stderr)
        self.assertIn("NOT the SmartMetadata product path", completed.stderr)

    def test_quickstart_wrapper_refuses_without_hatch(self) -> None:
        wrapper = REPO / "docker" / "docker-compose-quickstart" / "up.sh"
        self.assertTrue(wrapper.is_file(), "quickstart compose must have a fail-closed wrapper")
        env = os.environ.copy()
        env.pop(HATCH, None)
        with tempfile.TemporaryDirectory() as tmp:
            stub = Path(tmp) / "bin"
            stub.mkdir()
            log = Path(tmp) / "docker.log"
            docker = stub / "docker"
            docker.write_text(
                f"#!/bin/bash\nprintf '%s\\n' \"$*\" >> '{log}'\nexit 0\n",
                encoding="utf-8",
            )
            docker.chmod(0o755)
            env["PATH"] = f"{stub}{os.pathsep}{env.get('PATH', '')}"
            completed = subprocess.run(
                ["bash", str(wrapper), "up", "-d"],
                check=False,
                capture_output=True,
                text=True,
                env=env,
                cwd=str(REPO),
                timeout=8,
            )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn(HATCH, completed.stderr)
        self.assertFalse(log.is_file(), "docker compose must not start without the hatch")

    def test_no_root_package_json_workspaces_pull_ccl_ui(self) -> None:
        root_pkg = REPO / "package.json"
        if not root_pkg.is_file():
            return
        pkg = json.loads(root_pkg.read_text(encoding="utf-8"))
        workspaces = pkg.get("workspaces") or []
        if isinstance(workspaces, dict):
            workspaces = workspaces.get("packages") or []
        joined = " ".join(str(item) for item in workspaces)
        self.assertNotIn("openmetadata-ui", joined)
        self.assertNotIn("openmetadata-ui-core-components", joined)

    def test_historical_docker_wrapper_refuses_without_hatch(self) -> None:
        env = os.environ.copy()
        env.pop(HATCH, None)
        env.pop("I_UNDERSTAND_CCL_INGESTION", None)
        with tempfile.TemporaryDirectory() as tmp:
            stub = Path(tmp) / "bin"
            stub.mkdir()
            log = Path(tmp) / "invoked.log"
            for name in ("docker", "mvn", "make", "curl"):
                script = stub / name
                script.write_text(
                    f"#!/bin/bash\nprintf '%s ' '{name}' >> '{log}'\n"
                    f"printf '%s\\n' \"$*\" >> '{log}'\nexit 0\n",
                    encoding="utf-8",
                )
                script.chmod(0o755)
            env["PATH"] = f"{stub}{os.pathsep}{env.get('PATH', '')}"
            completed = subprocess.run(
                ["bash", str(REPO / "docker" / "run_local_docker.sh"), "-s", "true"],
                check=False,
                capture_output=True,
                text=True,
                env=env,
                cwd=str(REPO),
                timeout=8,
            )
        self.assertNotEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        err = strip_ansi(completed.stderr + completed.stdout)
        self.assertIn("NOT the SmartMetadata product path", err)
        self.assertIn(HATCH, err)
        self.assertIn("make docker-up", err)
        self.assertFalse(log.is_file(), "historical docker wrapper must not start compose without the hatch")


class GuardImport(unittest.TestCase):
    def test_hints_module_exposes_makefile_helpers(self) -> None:
        spec = importlib.util.spec_from_file_location(
            "check_product_path_hints",
            Path(__file__).with_name("check_product_path_hints.py"),
        )
        self.assertIsNotNone(spec)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertTrue(callable(module.ingestion_include_is_gated))
        self.assertTrue(callable(module.product_makefile_body))


if __name__ == "__main__":
    unittest.main()

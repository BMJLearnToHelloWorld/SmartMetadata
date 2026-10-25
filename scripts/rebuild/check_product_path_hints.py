#!/usr/bin/env python3
"""Fail if the CCL-free product-path misuse guards are missing.

Checks docs, README, Make execution isolation, the rebuilt product Docker
surface, and the historical-docker acks — not the shippable dist. Dist
exclusions stay with ``check_ccl_free_dist.py`` / Maven Enforcer
``ban-ccl-modules``; this script does not re-scan ``openmetadata-dist``.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRODUCT_PATH = Path("docs") / "rebuild" / "PRODUCT_PATH.md"
ADR = Path("docs") / "decisions" / "2026-10-22-ccl-trees-stay-reference-only.md"
ADR_MAKE = Path("docs") / "decisions" / "2026-10-22-product-make-is-rebuild-only.md"
ADR_DOCKER = Path("docs") / "decisions" / "2026-10-23-product-docker-is-rebuild-only.md"
DOCKER_COMMON = Path("docker") / "run_local_docker_common.sh"
PRODUCT_COMPOSE = Path("docker") / "rebuild" / "docker-compose.yml"
PRODUCT_COMPOSE_CN = Path("docker") / "rebuild" / "docker-compose.cn.yml"
PRODUCT_COMPOSE_INTL = Path("docker") / "rebuild" / "docker-compose.intl.yml"
PRODUCT_COMPOSE_VARIANT = Path("docker") / "rebuild" / "compose-variant.sh"
PRODUCT_DOCKERFILE = Path("docker") / "rebuild" / "Dockerfile"
PRODUCT_UP = Path("docker") / "rebuild" / "up.sh"
PRODUCT_DOWN = Path("docker") / "rebuild" / "down.sh"
PRODUCT_MAVEN_CN = Path("docker") / "rebuild" / "maven-settings.cn.xml.example"
DEPLOY_CN = Path("docs") / "rebuild" / "DEPLOY_CN.md"
ADR_DOCKER_CN = Path("docs") / "decisions" / "2026-10-25-product-docker-defaults-to-china-mirrors.md"
DEV_COMPOSE = Path("docker") / "development" / "docker-compose.yml"
README = Path("README.md")
MAKEFILE = Path("Makefile")
MAKEFILE_REFERENCE = Path("Makefile.reference")
REFERENCE_GUARD = Path("scripts") / "rebuild" / "require_reference_stack.py"
QUICKSTART_COMPOSE = Path("docker") / "docker-compose-quickstart" / "docker-compose.yml"
QUICKSTART_WRAPPER = Path("docker") / "docker-compose-quickstart" / "up.sh"
DEV_SETUP = Path("scripts") / "dev_setup.sh"
HATCH = "I_UNDERSTAND_REFERENCE_STACK"

REQUIRED_PRODUCT_PATH_MARKERS = (
    "smartmetadata-ui",
    "smartmetadata-ingestion",
    "smartmetadata-mcp",
    "slim-dist",
    "docker-up",
    "docker/rebuild",
    "I_UNDERSTAND_CCL_INGESTION",
    "I_UNDERSTAND_REFERENCE_STACK",
    "-i true",
    "quickstart",
    "openmetadata-airflow-apis",
    "openmetadata-ui-core-components",
    "reference-only",
    "make help",
    "Makefile.reference",
    "8089",
    "DEPLOY_CN",
    "docker-up-intl",
)
DOCKER_ACK_MARKERS = (
    "I_UNDERSTAND_CCL_INGESTION",
    "require_ccl_ingestion_ack",
)
DOCKER_REFERENCE_MARKERS = (
    "I_UNDERSTAND_REFERENCE_STACK",
    "require_reference_stack_ack",
)
DOCKER_CALL_SITE = (
    'if [[ $includeIngestion == "true" ]]; then\n    require_ccl_ingestion_ack\n  fi'
)
REQUIRED_PRODUCT_SERVICES = frozenset(
    {
        "mysql",
        "elasticsearch",
        "migrate",
        "openmetadata-server",
        "ui",
        "ingest",
        "mcp",
    }
)
FORBIDDEN_PRODUCT_SERVICES = frozenset(
    {"ingestion", "airflow", "openmetadata-ui", "openmetadata-mcp", "fuseki"}
)
PRODUCT_IMAGE_DOCKERFILES = (
    Path("docker") / "rebuild" / "Dockerfile.ui",
    Path("docker") / "rebuild" / "Dockerfile.ingest",
    Path("docker") / "rebuild" / "Dockerfile.mcp",
)
PRODUCT_COMPOSE_FORBIDDEN_NEEDLES = (
    "ingestion/Dockerfile",
    "openmetadata-ui",
    "getcollate.io",
    "Dockerfile_mysql",
    "docker/mysql",
    "docker/development",
    "run_local_docker",
)
COMPOSE_SERVICE_KEY = re.compile(r"(?m)^  ([A-Za-z0-9._-]+):\s*$")
CCL_RECIPE_NEEDLES = (
    "cd openmetadata-ui",
    "cd ingestion",
    "cd openmetadata-mcp",
    "cd openmetadata-airflow-apis",
    "cd openmetadata-ui-core-components",
    "pip install ingestion",
    'pip install "ingestion',
    "pip install $(INGESTION_DIR)",
)


def read_text(path: Path) -> str | None:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def _conditional_stack_push(stripped: str, stack: list[bool]) -> bool:
    if stripped.startswith("ifeq") and HATCH in stripped:
        stack.append(True)
        return True
    if stripped.startswith(("ifeq", "ifneq", "ifdef", "ifndef")):
        stack.append(False)
        return True
    return False


def ingestion_include_is_gated(makefile_text: str) -> list[str]:
    """Fail if ``include ingestion/Makefile`` is parsed on the product path."""
    errors: list[str] = []
    stack: list[bool] = []
    saw_gated_include = False
    for lineno, raw in enumerate(makefile_text.splitlines(), start=1):
        stripped = raw.split("#", 1)[0].strip()
        if _conditional_stack_push(stripped, stack):
            continue
        if stripped == "else" and stack:
            stack[-1] = not stack[-1]
            continue
        if stripped == "endif":
            if stack:
                stack.pop()
            continue
        if stripped == "include ingestion/Makefile":
            if stack and stack[-1]:
                saw_gated_include = True
            else:
                errors.append(
                    f"{MAKEFILE}:{lineno} includes ingestion/Makefile outside "
                    f"ifeq ($({HATCH}),1)"
                )
    if not saw_gated_include and not errors:
        errors.append(
            f"{MAKEFILE} must include ingestion/Makefile only inside "
            f"ifeq ($({HATCH}),1) so the escape hatch still works"
        )
    return errors


def product_makefile_body(makefile_text: str) -> str:
    """Makefile text with the reference-stack ifeq/else/endif block removed."""
    kept: list[str] = []
    stack: list[bool] = []
    for raw in makefile_text.splitlines():
        stripped = raw.split("#", 1)[0].strip()
        if _conditional_stack_push(stripped, stack):
            continue
        if stripped == "else" and stack:
            stack[-1] = not stack[-1]
            continue
        if stripped == "endif":
            if stack:
                stack.pop()
            continue
        if stack:
            continue
        kept.append(raw)
    return "\n".join(kept) + ("\n" if kept else "")


def check_makefile(repo: Path) -> list[str]:
    errors: list[str] = []
    makefile = repo / MAKEFILE
    text = read_text(makefile)
    if text is None:
        return [f"missing {MAKEFILE}"]
    if HATCH not in text:
        errors.append(f"{MAKEFILE} must mention {HATCH}")
    if "include Makefile.reference" not in text:
        errors.append(f"{MAKEFILE} must include Makefile.reference behind {HATCH}")
    errors.extend(ingestion_include_is_gated(text))
    body = product_makefile_body(text)
    for needle in CCL_RECIPE_NEEDLES:
        if needle in body:
            errors.append(
                f"{MAKEFILE} product recipes must not execute {needle!r}; "
                "move them to Makefile.reference behind the hatch"
            )
    if "docker-up" not in text:
        errors.append(f"{MAKEFILE} must define docker-up")
    if "docker-up-intl" not in text:
        errors.append(f"{MAKEFILE} must define docker-up-intl for official registries")
    if "docker/rebuild/up.sh" not in body:
        errors.append(f"{MAKEFILE} product recipes must invoke docker/rebuild/up.sh")
    if "MAVEN_SETTINGS" not in text:
        errors.append(f"{MAKEFILE} must accept MAVEN_SETTINGS for China Aliyun builds")
    if "run_local_docker.sh" in body:
        errors.append(f"{MAKEFILE} product recipes must not invoke run_local_docker.sh")
    if not (repo / MAKEFILE_REFERENCE).is_file():
        errors.append(f"missing {MAKEFILE_REFERENCE}")
    else:
        reference = (repo / MAKEFILE_REFERENCE).read_text(encoding="utf-8")
        if "yarn_start_dev_ui" not in reference:
            errors.append(f"{MAKEFILE_REFERENCE} must keep yarn_start_dev_ui for the hatch")
    guard = repo / REFERENCE_GUARD
    if not guard.is_file():
        errors.append(f"missing {REFERENCE_GUARD}")
    else:
        guard_text = guard.read_text(encoding="utf-8")
        if HATCH not in guard_text:
            errors.append(f"{REFERENCE_GUARD} must require {HATCH}")
        if "NOT the SmartMetadata product path" not in guard_text:
            errors.append(f"{REFERENCE_GUARD} must refuse with a product-path error")
        if "make docker-up" not in guard_text:
            errors.append(f"{REFERENCE_GUARD} must point historical docker at make docker-up")
    return errors


def check_compose_variants(repo: Path) -> list[str]:
    """China overlay is the default; international overlay keeps official refs."""
    errors: list[str] = []
    cn = read_text(repo / PRODUCT_COMPOSE_CN)
    if cn is None:
        errors.append(f"missing {PRODUCT_COMPOSE_CN}")
    else:
        if "m.daocloud.io/docker.elastic.co/elasticsearch/elasticsearch:9.3.0" not in cn:
            errors.append(f"{PRODUCT_COMPOSE_CN} must pin ES via the DaoCloud elastic proxy")
        if "m.daocloud.io/gcr.io/distroless/cc-debian13:debug-nonroot" not in cn:
            errors.append(f"{PRODUCT_COMPOSE_CN} must pass DaoCloud distroless as DISTROLESS_IMAGE")
        if "8089" not in cn:
            errors.append(f"{PRODUCT_COMPOSE_CN} must document UI host port 8089")
        for needle in PRODUCT_COMPOSE_FORBIDDEN_NEEDLES:
            if needle in cn:
                errors.append(f"{PRODUCT_COMPOSE_CN} must not mention {needle!r}")

    intl = read_text(repo / PRODUCT_COMPOSE_INTL)
    if intl is None:
        errors.append(f"missing {PRODUCT_COMPOSE_INTL}")
    else:
        if "docker.elastic.co/elasticsearch/elasticsearch:9.3.0" not in intl:
            errors.append(f"{PRODUCT_COMPOSE_INTL} must keep the official Elasticsearch image")
        if "m.daocloud.io" in intl:
            errors.append(f"{PRODUCT_COMPOSE_INTL} must not pin DaoCloud proxies")
        if "gcr.io/distroless/cc-debian13:debug-nonroot" not in intl:
            errors.append(f"{PRODUCT_COMPOSE_INTL} must pass official gcr distroless")
        if "8089" not in intl:
            errors.append(f"{PRODUCT_COMPOSE_INTL} must document UI host port 8089")

    variant = read_text(repo / PRODUCT_COMPOSE_VARIANT)
    if variant is None:
        errors.append(f"missing {PRODUCT_COMPOSE_VARIANT}")
    else:
        if 'VARIANT="${SM_DOCKER_VARIANT:-cn}"' not in variant and "SM_DOCKER_VARIANT:-cn" not in variant:
            errors.append(f"{PRODUCT_COMPOSE_VARIANT} must default SM_DOCKER_VARIANT to cn")
        if "docker-compose.cn.yml" not in variant:
            errors.append(f"{PRODUCT_COMPOSE_VARIANT} must select {PRODUCT_COMPOSE_CN}")

    maven_cn = read_text(repo / PRODUCT_MAVEN_CN)
    if maven_cn is None:
        errors.append(f"missing {PRODUCT_MAVEN_CN}")
    elif "https://maven.aliyun.com/repository/central" not in maven_cn:
        errors.append(f"{PRODUCT_MAVEN_CN} must use Aliyun Central")
    elif "<password>" in (maven_cn or "").lower() or "server>" in maven_cn:
        errors.append(f"{PRODUCT_MAVEN_CN} must not commit Maven credentials")

    base = read_text(repo / PRODUCT_COMPOSE)
    if base is not None and "8089:80" not in base:
        errors.append(f"{PRODUCT_COMPOSE} must map UI host port 8089")
    return errors


def compose_service_names(text: str) -> set[str]:
    """Top-level compose service keys (indent-2 mapping under ``services:``)."""
    names: set[str] = set()
    in_services = False
    for raw in text.splitlines():
        if raw.startswith("services:"):
            in_services = True
            continue
        if in_services:
            if raw and not raw.startswith((" ", "#", "\t")):
                break
            match = COMPOSE_SERVICE_KEY.match(raw)
            if match:
                names.add(match.group(1))
    return names


def check_product_docker(repo: Path) -> list[str]:
    errors: list[str] = []
    compose = read_text(repo / PRODUCT_COMPOSE)
    if compose is None:
        errors.append(f"missing {PRODUCT_COMPOSE}")
    else:
        services = compose_service_names(compose)
        missing = REQUIRED_PRODUCT_SERVICES - services
        if missing:
            errors.append(
                f"{PRODUCT_COMPOSE} must define product services {sorted(missing)}"
            )
        forbidden = services & FORBIDDEN_PRODUCT_SERVICES
        if forbidden:
            errors.append(
                f"{PRODUCT_COMPOSE} must not define CCL service(s) {sorted(forbidden)}"
            )
        for needle in PRODUCT_COMPOSE_FORBIDDEN_NEEDLES:
            if needle in compose:
                errors.append(f"{PRODUCT_COMPOSE} must not mention {needle!r}")
        if "mysql:8" not in compose:
            errors.append(f"{PRODUCT_COMPOSE} must use an official mysql:8 image")
        if "elasticsearch" not in compose:
            errors.append(f"{PRODUCT_COMPOSE} must use Elasticsearch")
        for tree in ("smartmetadata-ui", "smartmetadata-ingestion", "smartmetadata-mcp"):
            if tree not in compose:
                errors.append(f"{PRODUCT_COMPOSE} must build {tree}")

    dockerfile = read_text(repo / PRODUCT_DOCKERFILE)
    if dockerfile is None:
        errors.append(f"missing {PRODUCT_DOCKERFILE}")
    else:
        if "openmetadata-*.tar.gz" not in dockerfile:
            errors.append(f"{PRODUCT_DOCKERFILE} must unpack the slim openmetadata-dist tarball")
        if "DISTROLESS_IMAGE" not in dockerfile:
            errors.append(
                f"{PRODUCT_DOCKERFILE} must ARG DISTROLESS_IMAGE so China can pin DaoCloud"
            )
        if "ingestion/" in dockerfile or "openmetadata-ui" in dockerfile:
            errors.append(f"{PRODUCT_DOCKERFILE} must not copy CCL ingestion/ui trees")

    for rel in PRODUCT_IMAGE_DOCKERFILES:
        text = read_text(repo / rel)
        if text is None:
            errors.append(f"missing {rel}")
            continue
        for needle in (
            "ingestion/Dockerfile",
            "COPY ingestion/",
            "COPY ingestion ",
            "openmetadata-ui/",
            "openmetadata-mcp/",
        ):
            if needle in text:
                errors.append(f"{rel} must not copy CCL path {needle!r}")

    up_text = read_text(repo / PRODUCT_UP)
    if up_text is None:
        errors.append(f"missing {PRODUCT_UP}")
    else:
        if "docker/rebuild/docker-compose.yml" not in up_text:
            errors.append(f"{PRODUCT_UP} must up {PRODUCT_COMPOSE}")
        if "slim-dist" not in up_text and "check_ccl_free_dist" not in up_text:
            errors.append(f"{PRODUCT_UP} must build or verify the slim dist tarball")
        if "I_UNDERSTAND_CCL_INGESTION" in up_text:
            errors.append(f"{PRODUCT_UP} must not set or mention I_UNDERSTAND_CCL_INGESTION")
        if "docker/development" in up_text or "run_local_docker" in up_text:
            errors.append(f"{PRODUCT_UP} must not invoke historical development compose")
        if "docker/rebuild/docker-compose.cn.yml" not in up_text and "compose-variant.sh" not in up_text:
            errors.append(f"{PRODUCT_UP} must default to the China compose overlay")
        if "8089" not in up_text:
            errors.append(f"{PRODUCT_UP} must print the product console URL on :8089")
        if "8080" in up_text and "8089" not in up_text:
            errors.append(f"{PRODUCT_UP} must not advertise UI host port 8080")
        if "SM_DOCKER_VARIANT" not in up_text and "compose-variant.sh" not in up_text:
            errors.append(f"{PRODUCT_UP} must select CN vs intl via SM_DOCKER_VARIANT")
        if "Exited 0" not in up_text:
            errors.append(f"{PRODUCT_UP} must say migrate Exited 0 is expected")
        if "ingest" not in up_text.lower() or "mcp" not in up_text.lower():
            errors.append(f"{PRODUCT_UP} must start ingest and MCP, not host leftovers")

    if not (repo / PRODUCT_DOWN).is_file():
        errors.append(f"missing {PRODUCT_DOWN}")
    else:
        down_text = read_text(repo / PRODUCT_DOWN) or ""
        if "compose-variant.sh" not in down_text and "docker-compose.cn.yml" not in down_text:
            errors.append(f"{PRODUCT_DOWN} must tear down the same CN/intl compose variant as up.sh")

    errors.extend(check_compose_variants(repo))

    dev_compose = read_text(repo / DEV_COMPOSE)
    if dev_compose is None:
        errors.append(f"missing {DEV_COMPOSE}")
    else:
        if "reference-only" not in dev_compose.lower() and "make docker-up" not in dev_compose:
            errors.append(
                f"{DEV_COMPOSE} must say it is reference-only and point at make docker-up"
            )
    return errors


def check_root_workspaces(repo: Path) -> list[str]:
    root_pkg = repo / "package.json"
    if not root_pkg.is_file():
        return []
    try:
        pkg = json.loads(root_pkg.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"package.json is not valid JSON: {exc}"]
    workspaces = pkg.get("workspaces") or []
    if isinstance(workspaces, dict):
        workspaces = workspaces.get("packages") or []
    errors: list[str] = []
    for item in workspaces:
        text = str(item)
        if "openmetadata-ui" in text or "openmetadata-ui-core-components" in text:
            errors.append(
                f"root package.json workspaces must not pull {text} into product installs"
            )
    return errors


def check_dev_setup_and_compose(repo: Path) -> list[str]:
    errors: list[str] = []
    dev_setup = read_text(repo / DEV_SETUP)
    if dev_setup is None:
        errors.append(f"missing {DEV_SETUP}")
    elif "require_reference_stack.py" not in dev_setup:
        errors.append(f"{DEV_SETUP} must call require_reference_stack.py before installing CCL trees")
    compose = read_text(repo / QUICKSTART_COMPOSE)
    if compose is None:
        errors.append(f"missing {QUICKSTART_COMPOSE}")
    elif "not a SmartMetadata product demo" not in compose:
        errors.append(
            f"{QUICKSTART_COMPOSE} must say it is not a SmartMetadata product demo"
        )
    wrapper = read_text(repo / QUICKSTART_WRAPPER)
    if wrapper is None:
        errors.append(f"missing {QUICKSTART_WRAPPER}")
    else:
        if "require_reference_stack.py" not in wrapper:
            errors.append(f"{QUICKSTART_WRAPPER} must call require_reference_stack.py")
        if "docker compose" not in wrapper:
            errors.append(f"{QUICKSTART_WRAPPER} must exec docker compose after the hatch")
    return errors


def check_repo(repo: Path) -> list[str]:
    errors: list[str] = []

    product_path = repo / PRODUCT_PATH
    product_text = read_text(product_path)
    if product_text is None:
        errors.append(f"missing {PRODUCT_PATH}")
    else:
        lowered = product_text.lower()
        for marker in REQUIRED_PRODUCT_PATH_MARKERS:
            if marker.lower() not in lowered:
                errors.append(f"{PRODUCT_PATH} must mention {marker!r}")

    if not (repo / ADR).is_file():
        errors.append(f"missing {ADR}")
    if not (repo / ADR_MAKE).is_file():
        errors.append(f"missing {ADR_MAKE}")
    if not (repo / ADR_DOCKER).is_file():
        errors.append(f"missing {ADR_DOCKER}")
    if not (repo / ADR_DOCKER_CN).is_file():
        errors.append(f"missing {ADR_DOCKER_CN}")
    deploy_cn = read_text(repo / DEPLOY_CN)
    if deploy_cn is None:
        errors.append(f"missing {DEPLOY_CN}")
    else:
        for marker in (
            "8089",
            "m.daocloud.io/docker.elastic.co",
            "maven.aliyun.com",
            "Exited 0",
            "docker-up-intl",
            "registry-mirrors",
        ):
            if marker not in deploy_cn:
                errors.append(f"{DEPLOY_CN} must mention {marker!r}")

    docker_text = read_text(repo / DOCKER_COMMON)
    if docker_text is None:
        errors.append(f"missing {DOCKER_COMMON}")
    else:
        for marker in DOCKER_ACK_MARKERS:
            if marker not in docker_text:
                errors.append(
                    f"{DOCKER_COMMON} must require {marker} before -i true starts CCL ingestion"
                )
        for marker in DOCKER_REFERENCE_MARKERS:
            if marker not in docker_text:
                errors.append(
                    f"{DOCKER_COMMON} must require {marker} before historical compose starts"
                )
        if DOCKER_CALL_SITE not in docker_text:
            errors.append(
                f"{DOCKER_COMMON} must call require_ccl_ingestion_ack when includeIngestion is true"
            )
        if "require_reference_stack_ack" not in docker_text:
            errors.append(
                f"{DOCKER_COMMON} must call require_reference_stack_ack before compose"
            )

    readme_text = read_text(repo / README)
    if readme_text is None:
        errors.append(f"missing {README}")
    else:
        if "docs/rebuild/PRODUCT_PATH.md" not in readme_text:
            errors.append(f"{README} must point at {PRODUCT_PATH}")
        if HATCH not in readme_text:
            errors.append(f"{README} must mention {HATCH}")
        if "make docker-up" not in readme_text and "docker/rebuild" not in readme_text:
            errors.append(f"{README} must point product Docker at make docker-up")

    errors.extend(check_makefile(repo))
    errors.extend(check_product_docker(repo))
    errors.extend(check_root_workspaces(repo))
    errors.extend(check_dev_setup_and_compose(repo))
    return errors


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo",
        type=Path,
        default=REPO,
        help="repository root (defaults to this checkout)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    repo = args.repo.resolve()
    errors = check_repo(repo)
    if errors:
        print("Product-path hint check FAILED:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        print(
            "See docs/rebuild/PRODUCT_PATH.md and "
            "ADR:2026-10-22-product-make-is-rebuild-only.",
            file=sys.stderr,
        )
        return 1
    print("Product-path hint check passed.")
    print(f"  product path: {PRODUCT_PATH}")
    print(f"  product docker: {PRODUCT_COMPOSE} + {PRODUCT_COMPOSE_CN} via make docker-up")
    print(f"  docker ack: {DOCKER_COMMON} requires {HATCH} then I_UNDERSTAND_CCL_INGESTION")
    print(f"  make hatch: {MAKEFILE} requires {HATCH} before CCL recipes")
    print("  dist scan: not this script (check_ccl_free_dist.py)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Fail if the shippable server dist still depends on Collate Community License modules.

Checks, in order:

1. ``openmetadata-dist/pom.xml`` does not declare ``openmetadata-ui``,
   ``openmetadata-mcp``, or ``openmetadata-ui-core-components`` as Maven
   dependencies (any profile).
2. ``openmetadata-dist/src/main/assembly/binary.xml`` excludes those artifacts
   from ``libs/``.
3. If a dist tarball (or ``target/libs``) is present, it contains none of those
   jars, no PyPI ``openmetadata-ingestion`` artifact, and no Collate Community
   License text.

Does not delete or refuse the in-tree CCL source trees — those stay as
reference-only. See ``docs/rebuild/PHASE0.md`` and
ADR:2026-10-22-shippable-dist-excludes-ccl-modules.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import argparse
import sys
import tarfile
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DIST_POM = REPO / "openmetadata-dist" / "pom.xml"
ASSEMBLY = REPO / "openmetadata-dist" / "src" / "main" / "assembly" / "binary.xml"
DIST_TARGET = REPO / "openmetadata-dist" / "target"

BANNED_ARTIFACTS = (
    "openmetadata-ui",
    "openmetadata-mcp",
    "openmetadata-ui-core-components",
)
BANNED_JAR_PREFIXES = tuple(f"{name}-" for name in BANNED_ARTIFACTS)
BANNED_INGESTION_NAMES = (
    "openmetadata-ingestion",
    "openmetadata_ingestion",
)
CCL_LICENSE_MARKERS = (
    "collate community license",
    "collate community licence",
)


def local_tag(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def maven_dependencies(pom: Path) -> list[tuple[str, str, str]]:
    """Return (location, groupId, artifactId) for every <dependency> in the POM."""
    tree = ET.parse(pom)
    found: list[tuple[str, str, str]] = []
    for dep in tree.iter():
        if local_tag(dep.tag) != "dependency":
            continue
        group = artifact = ""
        for child in list(dep):
            name = local_tag(child.tag)
            if name == "groupId":
                group = (child.text or "").strip()
            elif name == "artifactId":
                artifact = (child.text or "").strip()
        if artifact:
            found.append((str(pom.relative_to(REPO)), group, artifact))
    return found


def assembly_excludes(path: Path) -> set[str]:
    tree = ET.parse(path)
    excludes: set[str] = set()
    for el in tree.iter():
        if local_tag(el.tag) == "exclude" and el.text:
            excludes.add(el.text.strip())
    return excludes


def check_pom(errors: list[str]) -> None:
    if not DIST_POM.is_file():
        errors.append(f"missing {DIST_POM.relative_to(REPO)}")
        return
    for location, group, artifact in maven_dependencies(DIST_POM):
        if artifact in BANNED_ARTIFACTS:
            errors.append(
                f"{location} declares dependency {group}:{artifact} — "
                "shippable dist must not depend on CCL modules"
            )
        if artifact in BANNED_INGESTION_NAMES or artifact.endswith("-ingestion"):
            if group in ("org.open-metadata", "org.openmetadata", ""):
                errors.append(
                    f"{location} declares dependency {group}:{artifact} — "
                    "shippable dist must not depend on ingestion"
                )


def check_assembly(errors: list[str]) -> None:
    if not ASSEMBLY.is_file():
        errors.append(f"missing {ASSEMBLY.relative_to(REPO)}")
        return
    excludes = assembly_excludes(ASSEMBLY)
    for artifact in BANNED_ARTIFACTS:
        needle = f"org.open-metadata:{artifact}"
        if needle not in excludes:
            errors.append(
                f"{ASSEMBLY.relative_to(REPO)} is missing assembly exclude {needle}"
            )


def is_banned_member(name: str) -> str | None:
    base = Path(name).name
    stem = base.lower()
    for prefix in BANNED_JAR_PREFIXES:
        if base.startswith(prefix) and base.endswith(".jar"):
            return f"CCL jar {base}"
    for ingestion_name in BANNED_INGESTION_NAMES:
        if ingestion_name in stem:
            return f"ingestion artifact {base}"
    parts = Path(name).parts
    if "ingestion" in parts and "src" in parts:
        return f"ingestion source path {name}"
    return None


def scan_tarball(archive: Path, errors: list[str]) -> None:
    try:
        with tarfile.open(archive, "r:gz") as tar:
            members = tar.getmembers()
            for member in members:
                reason = is_banned_member(member.name)
                if reason:
                    errors.append(f"{archive.name}: {reason}")
                base = Path(member.name).name.lower()
                if member.isfile() and base in {"license", "license.txt", "licence"}:
                    extracted = tar.extractfile(member)
                    if extracted is None:
                        continue
                    text = extracted.read(64_000).decode("utf-8", errors="ignore").lower()
                    if any(marker in text for marker in CCL_LICENSE_MARKERS):
                        errors.append(
                            f"{archive.name}: {member.name} contains Collate Community License text"
                        )
    except tarfile.TarError as exc:
        errors.append(f"cannot read {archive}: {exc}")


def scan_libs_dir(libs: Path, errors: list[str]) -> None:
    for jar in sorted(libs.glob("*.jar")):
        reason = is_banned_member(jar.name)
        if reason:
            errors.append(f"{libs.relative_to(REPO)}: {reason}")


def find_tarballs() -> list[Path]:
    if not DIST_TARGET.is_dir():
        return []
    return sorted(DIST_TARGET.glob("openmetadata-*.tar.gz"))


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--require-tarball",
        action="store_true",
        help="fail if openmetadata-dist/target/openmetadata-*.tar.gz is missing",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    errors: list[str] = []
    check_pom(errors)
    check_assembly(errors)

    tarballs = find_tarballs()
    if args.require_tarball and not tarballs:
        errors.append(
            "no openmetadata-dist/target/openmetadata-*.tar.gz — build the slim dist first"
        )
    for archive in tarballs:
        scan_tarball(archive, errors)

    libs = DIST_TARGET / "libs"
    if libs.is_dir():
        scan_libs_dir(libs, errors)

    if errors:
        print("CCL-free dist check FAILED:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        print(
            "See docs/rebuild/PHASE0.md and ADR:2026-10-22-shippable-dist-excludes-ccl-modules.",
            file=sys.stderr,
        )
        return 1

    print("CCL-free dist check passed.")
    print(f"  pom: {DIST_POM.relative_to(REPO)} has no CCL/ingestion product deps")
    print(f"  assembly: {ASSEMBLY.relative_to(REPO)} excludes CCL artifacts")
    if tarballs:
        for archive in tarballs:
            print(f"  tarball: {archive.relative_to(REPO)}")
    else:
        print("  tarball: not built (static pom/assembly checks only)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# SmartMetadata product Makefile.
#
# Default `make` / `make help` list and run rebuilt surfaces only
# (slim-dist, docker-up, ui_*, ingest_*, mcp_*, verify-rebuild, live-smoke, check-*).
# docker-up starts the rebuilt server + Vue UI + ingest seed + MCP (China compose default).
# Historical CCL trees stay in git as read-only reference.
# Escape hatch: I_UNDERSTAND_REFERENCE_STACK=1
# Map: docs/rebuild/PRODUCT_PATH.md
# ADR:2026-10-22-product-make-is-rebuild-only

.DEFAULT_GOAL := help

.PHONY: help
help:  ## List product Make targets (rebuild surfaces only)
	@echo "SmartMetadata product Make targets (rebuild surfaces only)."
	@echo "Map: docs/rebuild/PRODUCT_PATH.md"
	@echo "Reference/CCL targets refuse unless I_UNDERSTAND_REFERENCE_STACK=1."
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[35m%-35s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: prerequisites
prerequisites:
	./scripts/check_prerequisites.sh

.PHONY: java_affected
java_affected:  ## List the Java unit tests and integration tests this branch impacts and the commands to run them
	python3 .github/scripts/plan_local_java_tests.py $(ARGS)

.PHONY: java_affected_run
java_affected_run:  ## Run the impacted Java unit + integration tests and write the PR results summary + details (ARGS="--update-pr")
	python3 .github/scripts/plan_local_java_tests.py --run $(ARGS)

## Reference docs generation (deterministic; CI fails if the committed output drifts)
.PHONY: generate-entity-index
generate-entity-index:  ## Generate docs/generated/entity-index.md from schemas + resources
	python3 scripts/generate_entity_index.py

.PHONY: generate-api-reference
generate-api-reference:  ## Generate docs/generated/api-reference.md from JAX-RS resources
	python3 scripts/generate_api_reference.py

.PHONY: generate-reference-docs
generate-reference-docs: generate-entity-index generate-api-reference  ## Regenerate all docs/generated/*.md

.PHONY: harness-check
harness-check:  ## Warn on harness decay (dead refs, doc sizes, rule globs, generated-doc freshness)
	python3 scripts/harness/check_harness.py

# Optional: MAVEN_SETTINGS=/path/to/settings.xml (China: docker/rebuild/maven-settings.cn.xml.example)
MVN_SETTINGS_FLAG := $(if $(MAVEN_SETTINGS),-s $(MAVEN_SETTINGS),)

.PHONY: slim-dist
slim-dist:  ## Build the CCL-free server distribution (no UI/MCP/ingestion)
	mvn $(MVN_SETTINGS_FLAG) -DskipTests package -pl openmetadata-dist -am
	python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball

.PHONY: check-ccl-free-dist
check-ccl-free-dist:  ## Fail if the shippable dist still depends on Collate Community License modules
	python3 scripts/rebuild/check_ccl_free_dist.py

.PHONY: check-product-path-hints
check-product-path-hints:  ## Fail if product-path docs, product Docker, or the docker CCL ingestion ack are missing
	python3 scripts/rebuild/check_product_path_hints.py

.PHONY: docker-up
docker-up:  ## Start the rebuilt product stack (China compose default: DaoCloud + UI :8089)
	./docker/rebuild/up.sh

.PHONY: docker-up-intl
docker-up-intl:  ## Start the rebuilt product stack with official registries (UI :8089)
	SM_DOCKER_VARIANT=intl ./docker/rebuild/up.sh

.PHONY: docker-down
docker-down:  ## Stop the rebuilt product Docker stack
	./docker/rebuild/down.sh

.PHONY: ui_install
ui_install:  ## Install SmartMetadata Vue UI dependencies
	cd smartmetadata-ui && npm install

.PHONY: ui_dev
ui_dev:  ## Run the clean-room Vue UI with Vite (proxies /api to the slim server)
	cd smartmetadata-ui && npm run dev

.PHONY: ui_test
ui_test:  ## Run SmartMetadata Vue UI unit tests
	cd smartmetadata-ui && npm test

.PHONY: ui_build
ui_build:  ## Typecheck and build the SmartMetadata Vue SPA
	cd smartmetadata-ui && npm run build

.PHONY: ingest_install
ingest_install:  ## Install the clean-room SmartMetadata ingestion package (editable + tests)
	python3 -m pip install -e 'smartmetadata-ingestion/[dev]'

.PHONY: ingest_test
ingest_test:  ## Run SmartMetadata ingestion unit tests
	cd smartmetadata-ingestion && python3 -m pytest

.PHONY: check-ccl-free-ingestion
check-ccl-free-ingestion:  ## Fail if smartmetadata-ingestion imports or depends on CCL ingestion
	python3 scripts/rebuild/check_ccl_free_ingestion.py

.PHONY: mcp_install
mcp_install:  ## Install the clean-room SmartMetadata MCP package
	cd smartmetadata-mcp && npm install

.PHONY: mcp_test
mcp_test:  ## Run SmartMetadata MCP unit tests
	cd smartmetadata-mcp && npm test

.PHONY: mcp_build
mcp_build:  ## Typecheck and build the SmartMetadata MCP server
	cd smartmetadata-mcp && npm run build

.PHONY: check-ccl-free-mcp
check-ccl-free-mcp:  ## Fail if smartmetadata-mcp imports or depends on official CCL MCP
	python3 scripts/rebuild/check_ccl_free_mcp.py

.PHONY: verify-rebuild
verify-rebuild:  ## Offline Phase 11 matrix: UI/ingest/MCP tests + CCL gates + product-path hints + decision records
	python3 scripts/rebuild/test_verify_rebuild.py
	python3 scripts/rebuild/test_check_product_path_hints.py
	python3 scripts/rebuild/test_require_reference_stack.py
	python3 scripts/rebuild/verify_rebuild.py $(ARGS)

.PHONY: live-smoke
live-smoke:  ## HTTP smoke against an already-running catalog (no Docker)
	python3 scripts/rebuild/test_live_smoke.py
	python3 scripts/rebuild/live_smoke.py $(ARGS)

.PHONY: install_antlr_cli
ANTLR_VERSION := 4.9.2
# Dots escaped so the banner match below is a real version match, not a
# regex wildcard, and so 4.9.20 cannot satisfy a 4.9.2 check.
ANTLR_VERSION_RE := $(subst .,\.,$(ANTLR_VERSION))
# install_antlr_cli resolves the CLI in three steps, cheapest first:
#
#   1. Already on PATH at the pinned version -> nothing to do.
#   2. Distro package, when apt offers exactly $(ANTLR_VERSION). Ubuntu noble and
#      later ship 4.9.2, matching the pinned antlr4-python3-runtime and the JS
#      antlr4 runtimes, so CI never touches a public artifact host - those
#      rate-limit our shared CI egress IP and have broken the build repeatedly.
#   3. Pinned, checksum-verified download (macOS, non-Debian images, or a distro
#      carrying a different ANTLR such as jammy's 4.7.2).
#
# The checksum is what makes step 3 trustworthy; the archive check next to it is a
# second opinion, so it reads the archive with whichever tool the host has rather
# than insisting on one. Requiring a JDK tool to install a CLI that only needs a
# JRE to run breaks slim runtime images (e.g. ingestion-base ships
# default-jre-headless, which has java but no jar) on a download that already
# verified clean. A tool that is present and rejects the archive still fails the
# build; only the case where no reader exists falls through to the checksum alone,
# and such a host has no java either, so it could not run the CLI regardless.
#
# The version match in step 2 is exact. A distro shipping a different ANTLR falls
# through to the download rather than silently generating parsers that the pinned
# runtimes will reject.
#
# For step 3, override ANTLR_MAVEN_BASE to pull from an internal Maven mirror
# instead of Central. The default primary is Google's Central mirror, which is
# CDN-backed and not subject to repo1's per-IP 429 throttling that breaks
# multi-arch Docker publishes; repo1 stays as the fallback if the mirror is
# unreachable. The pinned SHA-256 below verifies whatever is fetched, so the
# source is swappable without lowering trust.
ANTLR_MAVEN_BASE ?= https://maven-central.storage-download.googleapis.com/maven2
ANTLR_MAVEN_FALLBACK_BASE ?= https://repo1.maven.org/maven2
ANTLR_COMPLETE_JAR_PATH := org/antlr/antlr4/$(ANTLR_VERSION)/antlr4-$(ANTLR_VERSION)-complete.jar
ANTLR_COMPLETE_JAR_URL := $(ANTLR_MAVEN_BASE)/$(ANTLR_COMPLETE_JAR_PATH)
ANTLR_COMPLETE_JAR_FALLBACK_URL := $(ANTLR_MAVEN_FALLBACK_BASE)/$(ANTLR_COMPLETE_JAR_PATH)
ANTLR_COMPLETE_JAR_SHA256 := bb117b1476691dc2915a318efd36f8957c0ad93447fb1dac01107eb15fe137cd
ANTLR_INSTALL_DIR ?= /usr/local/bin

install_antlr_cli:  ## Install antlr CLI locally
	@set -eu; \
	if command -v antlr4 > /dev/null 2>&1 \
		&& antlr4 2>&1 | grep -Eq 'Version $(ANTLR_VERSION_RE)([^0-9]|$$)'; then \
		echo "ANTLR $(ANTLR_VERSION) already available at $$(command -v antlr4); nothing to do."; \
		exit 0; \
	fi; \
	if command -v apt-get > /dev/null 2>&1; then \
		candidate=$$(apt-cache policy antlr4 2>/dev/null | awk '/Candidate:/ {print $$2}'); \
		if [ -z "$$candidate" ] || [ "$$candidate" = "(none)" ]; then \
			apt-get update -qq > /dev/null 2>&1 || true; \
			candidate=$$(apt-cache policy antlr4 2>/dev/null | awk '/Candidate:/ {print $$2}'); \
		fi; \
		case "$$candidate" in \
			$(ANTLR_VERSION)|$(ANTLR_VERSION)[-+~]*) \
				if apt-get install -y -qq antlr4 > /dev/null 2>&1; then \
					if command -v antlr4 > /dev/null 2>&1 \
						&& antlr4 2>&1 | grep -Eq 'Version $(ANTLR_VERSION_RE)([^0-9]|$$)'; then \
						echo "Installed ANTLR $$candidate from the distro archive."; \
						exit 0; \
					fi; \
					echo "Distro package installed, but antlr4 on PATH resolves to $$(command -v antlr4 2>/dev/null || echo none) which is not $(ANTLR_VERSION); falling back to pinned download." >&2; \
				else \
					echo "apt-get install antlr4 failed; falling back to pinned download." >&2; \
				fi; \
				;; \
			*) \
				echo "Distro ANTLR candidate '$$candidate' is not $(ANTLR_VERSION); using pinned download." >&2; \
				;; \
		esac; \
	fi; \
	jar_file=$$(mktemp); \
	cli_file=$$(mktemp "$(ANTLR_INSTALL_DIR)/.antlr4.XXXXXX"); \
	trap 'rm -f "$$jar_file" "$$cli_file"' EXIT; \
	if command -v shasum > /dev/null 2>&1; then \
		sha_check="shasum -a 256 --check"; \
	elif command -v sha256sum > /dev/null 2>&1; then \
		sha_check="sha256sum --check"; \
	else \
		echo "Neither shasum nor sha256sum is available; cannot verify the ANTLR download." >&2; \
		exit 1; \
	fi; \
	urls=$$(printf '%s\n%s\n' "$(ANTLR_COMPLETE_JAR_URL)" "$(ANTLR_COMPLETE_JAR_FALLBACK_URL)" | awk 'NF && !seen[$$0]++'); \
	attempt=1; \
	while :; do \
		for url in $$urls; do \
			if curl --fail --location --silent --show-error \
				--retry 3 --retry-all-errors --retry-delay 2 --retry-max-time 120 \
				--connect-timeout 15 --max-time 60 \
				--output "$$jar_file" "$$url" \
				&& printf '%s  %s\n' "$(ANTLR_COMPLETE_JAR_SHA256)" "$$jar_file" | $$sha_check \
				&& { if command -v jar > /dev/null 2>&1; then \
					jar tf "$$jar_file" > /dev/null; \
				elif command -v unzip > /dev/null 2>&1; then \
					unzip -tqq "$$jar_file" > /dev/null; \
				else :; fi; }; then \
				break 2; \
			fi; \
			echo "ANTLR $(ANTLR_VERSION) download failed from $$url (attempt $$attempt)" >&2; \
		done; \
		if [ "$$attempt" -ge 3 ]; then \
			echo "Failed to download a valid ANTLR $(ANTLR_VERSION) CLI after $$attempt attempts" >&2; \
			exit 1; \
		fi; \
		attempt=$$((attempt + 1)); \
		sleep 2; \
	done; \
	printf '%s\n' '#!/usr/bin/java -jar' > "$$cli_file"; \
	cat "$$jar_file" >> "$$cli_file"; \
	chmod 755 "$$cli_file"; \
	mv "$$cli_file" "$(ANTLR_INSTALL_DIR)/antlr4"

SNYK_ARGS := --severity-threshold=high

.PHONY: snyk-catalog-report
snyk-server-report:  ## Uses Snyk CLI to validate the catalog code and container. Don't stop the execution
	@echo "Validating catalog container... Make sure the code is built and available under openmetadata-dist"
	docker build -t openmetadata-server:scan -f docker/development/Dockerfile .
	snyk container test openmetadata-server:scan --file=docker/development/Dockerfile $(SNYK_ARGS) --json > security-report/server-docker-scan.json | true;
	snyk test --all-projects $(SNYK_ARGS) --json > security-report/server-dep-scan.json | true;
	snyk code test --all-projects --severity-threshold=high --json > security-report/server-code-scan.json | true;

.PHONY: snyk-dependencies-report
snyk-dependencies-report:  ## Uses Snyk CLI to validate the project dependencies: MySQL, Postgres and ES. Only local testing.
	@echo "Validating dependencies images..."
	snyk container test mysql/mysql-server:latest $(SNYK_ARGS) --json > security-report/mysql-scan.json | true;
	snyk container test postgres:latest $(SNYK_ARGS) --json > security-report/postgres-scan.json | true;
	snyk container test docker.elastic.co/elasticsearch/elasticsearch:7.10.2 $(SNYK_ARGS) --json > security-report/es-scan.json | true;

.PHONY: export-snyk-pdf-report
export-snyk-pdf-report:  ## export json file from security-report/ to HTML
	@echo "Reading all results"
	npm install snyk-to-html -g
	ls security-report | xargs -I % snyk-to-html -i security-report/% -o security-report/%.html
	pip install pdfkit
	pip install PyPDF2
	python scripts/html_to_pdf.py

.PHONY: update_maven
update_maven:  ## To update the common and pom.xml maven version
	@echo "Updating Maven projects to version $(RELEASE_VERSION)..."; \
	mvn versions:set -DnewVersion=$(RELEASE_VERSION)
#remove comment and use the below section when want to use this sub module "update_maven" independently to update github actions
#make update_maven RELEASE_VERSION=2.2.2

.PHONY: update_openapi_version
update_openapi_version:  ## To update the OpenAPI version in OpenMetadataApplication.java
	@echo "Updating OpenAPI version to $(RELEASE_VERSION)..."; \
	python3 scripts/update_version.py update_openapi_version -v $(RELEASE_VERSION)
#make update_openapi_version RELEASE_VERSION=2.2.2

# Reference-stack recipes stay in Makefile.reference + ingestion/Makefile.
# They are not on MAKEFILE_LIST unless the hatch is set, so `make help` stays product-only.
ifeq ($(I_UNDERSTAND_REFERENCE_STACK),1)
PY_SOURCE ?= ingestion/src
include Makefile.reference
include ingestion/Makefile
else
REFERENCE_STACK_TARGETS := install install_dev_env install_dev install_test install_all install_apis static-checks precommit_install py_format py_format_check generate_settings_docs check_import_layers unit_ingestion unit_ingestion_dev_env run_ometa_integration_tests run_python_tests sonar_ingestion run_apis_tests coverage_apis coverage clean-nox install_e2e_tests run_e2e_tests yarn_install_cache yarn_start_dev_ui yarn_start_e2e yarn_start_e2e_ui yarn_start_e2e_codegen playwright_affected playwright_affected_run py_antlr js_antlr generate snyk-ingestion-report snyk-airflow-apis-report snyk-ui-report docker-base-image-cve-test snyk-ingestion-base-slim-report snyk-report build-ingestion-base-local build-ingestion-slim-local update_all update_pyproject_version update_dockerfile_version update_dockerfile_ri_version update_typescript_types license-header-fix tsc-src-fix tsc-playwright-fix i18n-sync-fix generate-app-docs ui-checkstyle-src ui-checkstyle-playwright ui-checkstyle-core-components ui-checkstyle-src-changed ui-checkstyle-playwright-changed ui-checkstyle-core-components-changed ui-checkstyle-all ui-checkstyle-changed dev_setup dev_check
.PHONY: $(REFERENCE_STACK_TARGETS)
$(REFERENCE_STACK_TARGETS):
	@python3 scripts/rebuild/require_reference_stack.py --target $@
endif

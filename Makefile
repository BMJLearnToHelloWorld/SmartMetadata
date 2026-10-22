.DEFAULT_GOAL := help
PY_SOURCE ?= smartmetadata-ingestion/src

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":"}; {printf "\033[35m%-35s\033[0m %s\n", $$2, $$3}'

.PHONY: prerequisites
prerequisites:
	./scripts/check_prerequisites.sh

.PHONY: dev_setup
dev_setup:  ## One-call dev environment setup for macOS/Linux (pass flags via ARGS=...)
	./scripts/dev_setup.sh $(ARGS)

.PHONY: dev_check
dev_check:  ## Diagnose the dev environment without changing anything
	./scripts/dev_setup.sh --check

.PHONY: yarn_install_cache
yarn_install_cache: ui_install  ## Product UI deps (smartmetadata-ui npm)

.PHONY: yarn_start_dev_ui
yarn_start_dev_ui: ui_dev  ## Product UI dev server (smartmetadata-ui)

.PHONY: precommit_install
precommit_install:  ## Install the project's precommit hooks from .pre-commit-config.yaml
	pre-commit install

.PHONY: java_affected
java_affected:  ## List the Java unit tests and integration tests this branch impacts and the commands to run them
	python3 .github/scripts/plan_local_java_tests.py $(ARGS)

.PHONY: java_affected_run
java_affected_run:  ## Run the impacted Java unit + integration tests and write the PR results summary + details (ARGS="--update-pr")
	python3 .github/scripts/plan_local_java_tests.py --run $(ARGS)

.PHONY: generate
generate:  ## Java POJOs come from Maven (openmetadata-spec). No CCL Pydantic tree remains.
	@echo "Compile Java models with: mvn -pl openmetadata-spec,openmetadata-service -am test-compile"
	@echo "Product ingest is smartmetadata-ingestion/ (no generated Pydantic from CCL ingestion/)."

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

.PHONY: slim-dist
slim-dist:  ## Build the CCL-free server distribution (no UI/MCP/ingestion)
	mvn -DskipTests package -pl openmetadata-dist -am
	python3 scripts/rebuild/check_ccl_free_dist.py --require-tarball

.PHONY: check-ccl-free-dist
check-ccl-free-dist:  ## Fail if the shippable dist still depends on Collate Community License modules
	python3 scripts/rebuild/check_ccl_free_dist.py

.PHONY: check-purged-trees
check-purged-trees:  ## Fail if purged CCL / Collate-image trees reappear
	python3 scripts/rebuild/check_purged_trees.py

.PHONY: check-product-path-hints
check-product-path-hints:  ## Fail if product-path docs or the docker CCL ingestion refusal are missing
	python3 scripts/rebuild/check_product_path_hints.py

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

.PHONY: ingest_install install_dev install_dev_env install_test
ingest_install:  ## Install the clean-room SmartMetadata ingestion package (editable + tests)
	python3 -m pip install -e 'smartmetadata-ingestion/[dev]'

install_dev: ingest_install  ## Alias used by scripts/dev_setup.sh

install_dev_env: ingest_install  ## Alias used by scripts/dev_setup.sh (no CCL extra extras)

install_test: ingest_install  ## Alias: product ingest tests live in smartmetadata-ingestion/[dev]

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
verify-rebuild:  ## Offline Phase 11 matrix: UI/ingest/MCP tests + CCL gates + purge gate + decision records
	python3 scripts/rebuild/test_verify_rebuild.py
	python3 scripts/rebuild/test_check_product_path_hints.py
	python3 scripts/rebuild/test_check_purged_trees.py
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

## SNYK
SNYK_ARGS := --severity-threshold=high

# Drop pip's build/lib tree before scanning so `snyk code test` does not
# double-report findings (once under src/, once under build/lib/). Same
# applies to snyk-airflow-apis-report below.
.PHONY: snyk-ingestion-report
snyk-ingestion-report:  ## Scan the product ingestion package
	@echo "Validating smartmetadata-ingestion. Make sure the venv is activated."
	cd smartmetadata-ingestion; \
		pip freeze > scan-requirements.txt; \
		snyk test --file=scan-requirements.txt --package-manager=pip --command=python3 $(SNYK_ARGS) --json > ../security-report/ingestion-dep-scan.json | true; \
		snyk code test $(SNYK_ARGS) --json > ../security-report/ingestion-code-scan.json | true;

.PHONY: snyk-catalog-report
snyk-server-report:  ## Uses Snyk CLI to validate the catalog code and container. Don't stop the execution
	@echo "Validating catalog container... Make sure the code is built and available under openmetadata-dist"
	docker build -t openmetadata-server:scan -f docker/development/Dockerfile .
	snyk container test openmetadata-server:scan --file=docker/development/Dockerfile $(SNYK_ARGS) --json > security-report/server-docker-scan.json | true;
	snyk test --all-projects $(SNYK_ARGS) --json > security-report/server-dep-scan.json | true;
	snyk code test --all-projects --severity-threshold=high --json > security-report/server-code-scan.json | true;

.PHONY: snyk-ui-report
snyk-ui-report:  ## Uses Snyk CLI to validate the product UI dependencies
	snyk test --file=smartmetadata-ui/package-lock.json $(SNYK_ARGS) --json > security-report/ui-dep-scan.json | true;

.PHONY: snyk-dependencies-report
snyk-dependencies-report:  ## Uses Snyk CLI to validate the project dependencies: MySQL, Postgres and ES. Only local testing.
	@echo "Validating dependencies images..."
	snyk container test mysql/mysql-server:latest $(SNYK_ARGS) --json > security-report/mysql-scan.json | true;
	snyk container test postgres:latest $(SNYK_ARGS) --json > security-report/postgres-scan.json | true;
	snyk container test docker.elastic.co/elasticsearch/elasticsearch:7.10.2 $(SNYK_ARGS) --json > security-report/es-scan.json | true;

.PHONY: snyk-ingestion-base-slim-report
snyk-ingestion-base-slim-report:
	@echo "Official CCL ingestion-base image was purged; skip."

.PHONY: snyk-report
snyk-report:  ## Uses Snyk CLI to run a security scan of the different pieces of the code
	@echo "To run this locally, make sure to install and authenticate using the Snyk CLI: https://docs.snyk.io/snyk-cli/install-the-snyk-cli"
	rm -rf security-report
	mkdir -p security-report
	$(MAKE) snyk-ingestion-report
	$(MAKE) snyk-server-report
	$(MAKE) snyk-ui-report
	$(MAKE)	export-snyk-pdf-report

.PHONY: export-snyk-pdf-report
export-snyk-pdf-report:  ## export json file from security-report/ to HTML
	@echo "Reading all results"
	npm install snyk-to-html -g
	ls security-report | xargs -I % snyk-to-html -i security-report/% -o security-report/%.html
	pip install pdfkit
	pip install PyPDF2
	python scripts/html_to_pdf.py

# Official CCL ingestion operator images were purged.

#Upgrade release automation scripts below
.PHONY: update_all
update_all:  ## To update all the release related files run make update_all RELEASE_VERSION=2.2.2
	@echo "The release version is: $(RELEASE_VERSION)" ; \
	$(MAKE) update_maven ; \
	$(MAKE) update_openapi_version ; \
	$(MAKE) update_pyproject_version ; \
	$(MAKE) update_dockerfile_version ; \
	$(MAKE) update_dockerfile_ri_version ; \
#remove comment and use the below section when want to use this sub module "update_all" independently to update github actions
#make update_all RELEASE_VERSION=2.2.2

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

.PHONY: update_pyproject_version
update_pyproject_version:  ## To update the pyproject.toml files
	file_paths="smartmetadata-ingestion/pyproject.toml"; \
	echo "Updating pyproject.toml versions to $(RELEASE_VERSION)... "; \
	for file_path in $$file_paths; do \
	    python3 scripts/update_version.py update_pyproject_version -f $$file_path -v $(RELEASE_VERSION) ; \
	done
# Commented section for independent usage of the module update_pyproject_version independently to update github actions
#make update_pyproject_version RELEASE_VERSION=2.2.2

.PHONY: update_dockerfile_version
update_dockerfile_version:  ## Collate compose files were purged; no-op
	@echo "Collate compose files were purged; nothing to retag."
#remove comment and use the below section when want to use this sub module "update_dockerfile_version" independently to update github actions
#make update_dockerfile_version RELEASE_VERSION=2.2.2

.PHONY: update_dockerfile_ri_version
update_dockerfile_ri_version:  ## Collate ingestion Dockerfiles were purged; no-op
	@echo "Collate ingestion Dockerfiles were purged; nothing to retag."
#remove comment and use the below section when want to use this sub module "update_dockerfile_ri_version" independently to update github actions
#make update_dockerfile_ri_version RELEASE_VERSION=2.2.2

#Upgrade release automation scripts above

.PHONY: ui-checkstyle-all
ui-checkstyle-all: ui_test  ## Product UI unit tests (Vue). Official React checkstyle was purged.

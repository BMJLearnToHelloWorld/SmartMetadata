#!/bin/sh
# Seed the catalog with the static smoke fixture, then stay up so the
# rebuilt ingest image remains available for further CLI runs.
set -eu

API="${OM_API_URL:-http://openmetadata-server:8585/api}"
ADMIN_URL="${OM_ADMIN_URL:-http://openmetadata-server:8586}"
CONFIG="${INGEST_CONFIG:-/config/static-smoke.yaml}"

i=1
while [ "$i" -le 60 ]; do
  if wget -q --spider "${ADMIN_URL}/healthcheck"; then
    break
  fi
  echo "ingest: waiting for slim server at ${ADMIN_URL}/healthcheck (${i}/60)" >&2
  i=$((i + 1))
  sleep 5
done

echo "ingest: seeding ${CONFIG} -> ${API}" >&2
smartmetadata-ingest run --config "${CONFIG}"
touch /tmp/ingest-ready
echo "ingest: seed complete; image idle for later smartmetadata-ingest runs" >&2
exec sleep infinity

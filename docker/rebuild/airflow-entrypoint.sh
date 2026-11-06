#!/usr/bin/env bash
# Product Airflow entrypoint: start api-server + dag-processor + scheduler
# in one container (LocalExecutor, metadata DB on the shared MySQL), with
# the SimpleAuthManager admin user the server's pipeline client logs in
# as. Clean-room rewrite of the behaviour of the official
# ingestion_dependency.sh (CCL): same env defaults, same export names,
# same three-process shape, same unconditional `airflow db migrate` on
# every start. Two deliberate differences, both documented here:
#  - the admin default is admin/admin (Bai 2026-11-06 17:18: follow the
#    official defaults exactly);
#  - the password is passed to the inline Python through the environment
#    instead of interpolated into its source, so a password containing a
#    quote cannot break the script (behaviour is identical otherwise);
#  - the logs dir is created explicitly before the servers start (the
#    official script relies on migrate to create it; the mkdir only
#    covers a failed-migrate path so the servers' own error output is
#    still captured instead of failing on the redirect).
# No `set -e`: like the official script, a failed migrate does not stop
# the later steps. Readiness is the compose layer's job (`depends_on`
# mysql healthy), not this script's.

DB_HOST=${DB_HOST:-mysql}
DB_PORT=${DB_PORT:-3306}

AIRFLOW_DB=${AIRFLOW_DB:-airflow_db}
DB_USER=${DB_USER:-airflow_user}
DB_SCHEME=${DB_SCHEME:-mysql+mysqldb}
DB_PASSWORD=${DB_PASSWORD:-airflow_pass}
DB_PROPERTIES=${DB_PROPERTIES:-""}

AIRFLOW_ADMIN_USER=${AIRFLOW_ADMIN_USER:-admin}
AIRFLOW_ADMIN_PASSWORD=${AIRFLOW_ADMIN_PASSWORD:-admin}

DB_USER_VAR=`echo "${DB_USER}" | python3 -c "import urllib.parse; print(urllib.parse.quote(input()))"`
DB_PASSWORD_VAR=`echo "${DB_PASSWORD}" | python3 -c "import urllib.parse; print(urllib.parse.quote(input()))"`

DB_CONN=`echo -n "${DB_SCHEME}://${DB_USER_VAR}:${DB_PASSWORD_VAR}@${DB_HOST}:${DB_PORT}/${AIRFLOW_DB}${DB_PROPERTIES}"`

# Airflow 3.x configuration
export AIRFLOW__API__AUTH_BACKENDS=${AIRFLOW__API__AUTH_BACKENDS:-"airflow.api.auth.backend.basic_auth,airflow.api.auth.backend.session"}
export AIRFLOW__API__BASE_URL=${AIRFLOW__API__BASE_URL:-"http://localhost:8080"}

# Enable CSRF for API endpoints (required for production security)
export AIRFLOW__API__ENABLE_CSRF=${AIRFLOW__API__ENABLE_CSRF:-"True"}

# Configure SimpleAuthManager
echo "Configuring SimpleAuthManager (default in Airflow 3.x)"
export AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_USERS="${AIRFLOW_ADMIN_USER}:admin"

AIRFLOW_HOME=${AIRFLOW_HOME:-/opt/airflow}
export AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_PASSWORDS_FILE="${AIRFLOW_HOME}/simple_auth_manager_passwords.json"

# Airflow 3.x uses [database] section for SQL Alchemy connection
export AIRFLOW__DATABASE__SQL_ALCHEMY_CONN=${AIRFLOW__DATABASE__SQL_ALCHEMY_CONN:-$DB_CONN}

airflow db migrate

# Create users for SimpleAuthManager
echo "SimpleAuthManager configured - user: ${AIRFLOW_ADMIN_USER}:admin"

PASSWORD_FILE="${AIRFLOW_HOME}/simple_auth_manager_passwords.json"

echo "Setting password for ${AIRFLOW_ADMIN_USER} in ${PASSWORD_FILE}..."
mkdir -p "${AIRFLOW_HOME}"

export SM_AIRFLOW_PASSWORD_FILE="${PASSWORD_FILE}"
export SM_AIRFLOW_ADMIN_USER="${AIRFLOW_ADMIN_USER}"
export SM_AIRFLOW_ADMIN_PASSWORD="${AIRFLOW_ADMIN_PASSWORD}"

python3 -c "
import json
import os
from pathlib import Path

password_file = Path(os.environ['SM_AIRFLOW_PASSWORD_FILE'])
passwords = {}

if password_file.exists():
    try:
        with open(password_file, 'r') as f:
            passwords = json.load(f)
    except Exception:
        pass

passwords[os.environ['SM_AIRFLOW_ADMIN_USER']] = os.environ['SM_AIRFLOW_ADMIN_PASSWORD']

with open(password_file, 'w') as f:
    json.dump(passwords, f, indent=2)

print('Password set for ' + os.environ['SM_AIRFLOW_ADMIN_USER'])
"

echo "SimpleAuthManager user created with custom password"

rm -f "${AIRFLOW_HOME}/airflow-webserver-monitor.pid"

# The logs dir is normally created by `airflow db migrate` above; make it
# explicitly so a failed migrate still leaves the servers' own error
# output in the log files instead of failing on the redirect itself.
mkdir -p "${AIRFLOW_HOME}/logs"

# Start Airflow 3.x components
echo "Starting Airflow 3.x components..."
nohup airflow api-server --port 8080 > "${AIRFLOW_HOME}/logs/api-server.log" 2>&1 &
nohup airflow dag-processor > "${AIRFLOW_HOME}/logs/dag-processor.log" 2>&1 &
airflow scheduler

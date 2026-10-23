#!/bin/sh
# Obtain a catalog JWT (bootstrap login unless OM_JWT is already set), then
# exec the stdio MCP server. Logs go to stderr so stdout stays MCP NDJSON.
set -eu

export OM_API_URL="${OM_API_URL:-http://openmetadata-server:8585}"
export OM_ADMIN_URL="${OM_ADMIN_URL:-http://openmetadata-server:8586}"
export OM_LOGIN_EMAIL="${OM_LOGIN_EMAIL:-admin@open-metadata.org}"
export OM_LOGIN_PASSWORD="${OM_LOGIN_PASSWORD:-admin}"

node -e '
  const admin = (process.env.OM_ADMIN_URL || "").replace(/\/+$/, "") + "/healthcheck";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  (async () => {
    for (let i = 1; i <= 60; i += 1) {
      try {
        const res = await fetch(admin);
        if (res.ok) return;
      } catch {
        /* server not up yet */
      }
      console.error("mcp: waiting for slim server at " + admin + " (" + i + "/60)");
      await sleep(5000);
    }
    throw new Error("slim server did not become healthy");
  })().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
'

if [ -z "${OM_JWT:-}" ]; then
  OM_JWT="$(node -e '
    const email = process.env.OM_LOGIN_EMAIL;
    const password = process.env.OM_LOGIN_PASSWORD;
    const origin = process.env.OM_API_URL;
    const encoded = Buffer.from(password, "utf8").toString("base64");
    fetch(origin.replace(/\/+$/, "") + "/api/v1/users/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: encoded }),
    }).then(async (res) => {
      const body = await res.text();
      if (!res.ok) {
        throw new Error("login failed " + res.status + " " + body);
      }
      const token = JSON.parse(body).accessToken;
      if (!token) throw new Error("login response missing accessToken");
      process.stdout.write(token);
    }).catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
  ")"
  export OM_JWT
fi

touch /tmp/mcp-ready
echo "mcp: stdio server ready (OM_API_URL=${OM_API_URL})" >&2
exec node dist/index.js

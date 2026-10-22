# Phase 2 — System administration parity (clean-room UI)

Phase 2 extends `smartmetadata-ui/` with operator admin surfaces against the
existing Apache `openmetadata-service` REST API. It does not copy, transpile, or
import `openmetadata-ui` or `openmetadata-ui-core-components`.

Earlier phases: [PHASE0.md](PHASE0.md) (slim dist) · [PHASE1.md](PHASE1.md)
(login / search / table+topic detail). ADR:2026-10-22-clean-room-vue-spa
still applies; no new packaging ADR (the SPA is still not in `openmetadata-dist`).

## What shipped

Admin section in the AppShell sider. JWT route guards from Phase 1 are unchanged.

| Surface | Location | Server contract |
|---|---|---|
| Auth provider awareness | `LoginView.vue`, `src/admin/authProvider.ts`, Settings | `GET /api/v1/system/config/auth`. Password form only for `basic` / `ldap` (or missing provider). OIDC/SAML: message only, **no fake SSO callback** |
| Users list / search / filter | `views/admin/UsersListView.vue` | `GET /v1/users?fields=profile,roles,teams&team=&isAdmin=&isBot=&include=`; search `GET /v1/search/query?index=user` |
| User create | same | `POST /v1/users` (`CreateUser`: name, email, displayName, description, isAdmin, password, confirmPassword, createPasswordType=`ADMIN_CREATE`, teams[], roles[]) |
| User edit | `UserDetailView.vue` | `PUT /v1/users` with the same CreateUser fields the API accepts |
| User deactivate / restore | same | `DELETE /v1/users/{id}` (soft-delete); `PUT /v1/users/restore` `{id}` |
| User detail + role assign | same | `GET /v1/users/{id}?fields=profile,roles,teams&include=all`; `PATCH /v1/users/{id}` RFC 6902 replace `/roles` |
| Teams list / create / edit | `TeamsListView.vue`, `TeamDetailView.vue` | `GET/POST/PUT /v1/teams` (`CreateTeam` requires `name` + `teamType`) |
| Team membership | `TeamDetailView.vue` | `PUT /v1/teams/{teamId}/users` (replace list of `{id,type:user}`); `DELETE /v1/teams/{teamId}/users/{userId}` |
| Team default roles | same | `PATCH /v1/teams/{id}` replace `/defaultRoles` |
| Roles list / detail | `RolesListView.vue`, `RoleDetailView.vue` | `GET /v1/roles?fields=policies,users,teams`; `GET /v1/roles/search?q=`; `GET /v1/roles/{id}` |
| Assign role to user/team | `RoleDetailView.vue` | PATCH user `/roles` or team `/defaultRoles` — existing permission APIs, not a new authz engine |
| Bots list / create | `BotsListView.vue` | `GET /v1/bots`; create = `POST /v1/users` `{isBot:true}` then `POST /v1/bots` `{name, botUser}` (`CreateBot` requires both) |
| Bot token generate / revoke | `BotDetailView.vue` | `PUT /v1/users/generateToken/{botUserId}` `{JWTTokenExpiry}`; `PUT /v1/users/revokeToken` `{id}` |
| Settings | `SettingsView.vue` | `GET /v1/system/version`; `GET /v1/system/config/auth`; `GET /v1/system/settings`; **edit** `PUT /v1/system/settings` for `loginConfiguration` and `emailConfiguration` only |

Routes (still JWT-guarded except `/login`):

`/admin/users`, `/admin/users/:id`, `/admin/teams`, `/admin/teams/:id`,
`/admin/roles`, `/admin/roles/:id`, `/admin/bots`, `/admin/bots/:id`,
`/admin/settings`. Phase 1 `/search` and `/assets/:entityType/:fqn` are unchanged.

## How to run

Same as Phase 1: slim server from [PHASE0.md](PHASE0.md), then

```bash
make ui_install
make ui_dev
# http://localhost:5173
```

Stock bootstrap: `admin@open-metadata.org` / `admin` when the server was initialized
with defaults. Admin APIs require a principal that the authorizer treats as admin
(or that holds the matching `EDIT_*` operations).

### Manual verify

1. Unauthenticated `/admin/users` redirects to `/login?redirect=/admin/users`.
2. Sign in with a basic-auth admin. Search still works.
3. Sider **Admin → Users**: list loads from `GET /v1/users`. Create a user with
   name, email, and `ADMIN_CREATE` password. Open the row: edit display name;
   deactivate (user leaves the Active filter); switch filter to Deactivated;
   restore.
4. **Teams**: create a `Group` team; add/remove a member via the membership APIs
   (non-Group types show an inherited-members note and hide add/remove).
5. **Roles**: open DataConsumer (or any seeded role). Assign it to a user
   (PATCH user roles) and as a team default role (PATCH team defaultRoles).
6. **Bots**: create a bot (bot user + bot entity). Generate a JWT (`JWTTokenExpiry`
   `7`); copy the token from the response. Revoke it.
7. **Settings**: auth provider card matches `GET /system/config/auth`. Save login
   configuration (failed-attempt fields). Email form is shown when the setting
   exists; skip SMTP password unless you mean to rotate it.
8. Log out. Session key `sm.auth.v1` is cleared.

OIDC-only check (optional): point the UI at a server whose
`authenticationConfiguration.provider` is `okta`/`google`/… Login must **not**
show the password form; it must name the provider from the auth config API.

## Tests

```bash
cd smartmetadata-ui && npm test && npm run build
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: auth-provider branching; user/team/bot/system clients against real
paths and bodies; JSON Patch content type; LoginView SSO-only message;
UsersListView rendering `GET /v1/users`.

## Non-goals (later phases)

- Lineage / graph (Phase 3)
- Glossary / classification deep editors (Phase 4)
- Data quality / observability dashboards (Phase 5)
- Ingestion / connectors (Phases 6–8)
- MCP (Phase 10)
- Shipping the SPA inside `openmetadata-dist` (needs a new ADR)
- OIDC/SAML browser callback, SCIM, Persona editors, policy rule authoring,
  personal access tokens for human users, CSV import/export of users/teams

## Residual risks and open questions

- **User search index.** Name search uses `index=user`. An empty or missing
  `user_search_index` 4xx/5xx; the list+filter path still works. Do not silently
  client-filter one page and call it search.
- **Soft-delete vs “deactivate”.** The server has no `isActive` flag. Deactivate
  is `DELETE` (soft); reactivate is `PUT /restore`. Hard delete is not offered.
- **Group-only membership.** `PUT /teams/{id}/users` on a Department/Division/…
  will fail the way the server already fails it. The UI hides add/remove there.
- **Bot create 409.** If the bot user name already exists, create continues to
  `POST /v1/bots`. If the bot entity exists too, the API 4xx is shown.
- **Token redaction.** `GET /v1/users/token/{id}` may nullify the JWT. The UI
  shows the token from the **generate** response only.
- **Settings secrets.** Email PUT sends the form as-is. The GET payload may
  already mask `password`; saving without retyping can persist a mask. Operators
  should only Save email when they intend a new SMTP secret.
- **Auth/authorizer settings.** `GET/PUT /v1/system/settings` refuses
  `authenticationConfiguration` and `authorizerConfiguration`. Security YAML
  edits stay on `GET/PUT /v1/system/security/config` (not wired; high blast
  radius, easy to lock the cluster out).
- **Roles from provider.** When `useRolesFromProvider` is true, PUT/PATCH of
  user roles is ignored by the server. The UI still sends the documented patch.
- **Empty catalog / missing admin grants.** 403s are shown as API errors; no
  fake users or roles are hardcoded.

## Open questions (safest default already taken)

1. **Serve SPA from slim Java?** Still **no** — same as Phase 1.
2. **OIDC callback in this console?** **No** unless the server documents a
   secret-free browser flow. Auth config is displayed; login is basic/LDAP only.
3. **Policy rule editor?** **No** in Phase 2. Roles show attached policy names
   from `GET /v1/roles/{id}?fields=policies`.
4. **Edit search/theme/lineage settings?** **Read-only list.** Only
   `loginConfiguration` and `emailConfiguration` are PUT from this UI.

## Verification checklist

1. `cd smartmetadata-ui && npm test`
2. `cd smartmetadata-ui && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Manual path above against a running Phase 0 server

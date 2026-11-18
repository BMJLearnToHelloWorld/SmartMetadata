# User and team detail edits save with JSON Patch whitelist ops, never a whole-entity PUT

- **Status:** Accepted
- **Revisions:** v1 2026-11-18 (initial)
- **Deciders:** Bai (2026-11-18: A-group batch; official 1:1 parity required, no documented deviations)
- **Guard:** `smartmetadata-ui/src/views/admin/UserDetailView.test.ts` and `smartmetadata-ui/src/views/admin/TeamDetailView.test.ts` (edit-save blocks: changed-fields-only ops, remove ops, empty-array sends, change-detection rules, forbidden paths)
- **Related:** upstream pin `a3012259ca` (`pages/UserPage/UserPage.component.tsx` `updateUserDetails`, `pages/TeamsPage/TeamsPage.tsx` `updateTeamHandler`, both sending `compare()` results unguarded)

## Context

Server PUT is whole-entity replacement: the request body is rebuilt into
a fresh entity and every omitted field is compared as null or empty, so
one detail edit silently dropped fields the form never carried — user
`personas`, `defaultPersona`, `profile`, `timezone`, `isEmailVerified`,
`personaPreferences`, `externalId`, `scimUserName`,
`identityProviderSubject`; team `users`, `parents`, `children`, `policies`,
`defaultPersona`, `email`, `profile`. Pin's detail pages instead PATCH
with the diff of changed fields, and fields a patch never mentions keep
their stored values.

## Decision

- User detail edits call `patchUser` and team detail edits call
  `patchTeam` with ops built field by field. The whitelists are fixed:
  user `{displayName, description, isAdmin, teams, roles}`, team
  `{displayName, description, teamType, isJoinable, defaultRoles}`.
  `updateUser` and `updateTeam` (PUT) are deleted; their only callers
  were these two saves.
- Change detection is the caller's job: text fields compare after
  trimming (empty normalizes to absent; clearing a stored value sends a
  `remove` op); id lists compare as order-insensitive sets; team
  `isJoinable` normalizes a missing stored value to `true` before
  comparing. Sending an extra op is harmless; omitting a changed field
  is a data-loss bug, so the rules err toward sending.
- `email` never enters the ops. The server ignores it on PATCH as it did
  on PUT; changing an address only goes through the `change-email` ops.
- An unchanged edit still sends an empty patch array, matching pin's
  unguarded `compare()` send. The save must not skip the request.
- Never diff the lossy `AdminUser`/`AdminTeam` projection wholesale with
  `diffJsonPatch`: its missing keys would produce phantom ops. Ops come
  only from the per-field builders above.

## Consequences

Unmentioned fields are preserved by the server, so `USER_FIELDS` needs no
expansion for this fix. Adding a form field means adding it to the
whitelist and its change rule in the same change; a field edited in the
form but missing from the whitelist silently stops saving. The role and
default-role assignment paths already used PATCH and are unchanged, as is
team member management through its dedicated endpoints.

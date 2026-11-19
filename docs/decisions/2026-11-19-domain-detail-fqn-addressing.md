# Domain detail is addressed by FQN, and the permission debugger links inherited domain sources

- **Status:** Accepted
- **Revisions:** v1 2026-11-19 (initial)
- **Deciders:** Bai (2026-11-19: B-9 (a1) complete `:fqn`; D8a closes with this change)
- **Guard:** `smartmetadata-ui/src/views/admin/UserPermissionsPanel.test.ts` (domain inherited source renders a link to `/governance/domains/<FQN>`); `smartmetadata-ui/src/router/routes.test.ts` (`governance-domain` resolves `/:fqn`)
- **Related:** ADR-ACC-03 (Access partition FQN addressing, `sections/03-access.md` §2.1/§10.6 D8a); upstream pin `a3012259ca` (`constants.ts` `DOMAIN_DETAILS: '/domain/:fqn'`, `rest/domainAPI.ts` `getDomainByName`, `AccessControl.utils.ts:180-191` `getEntityLink`)

## Context

The Access partition rule D8a requires entity links to follow official
`getEntityLink` semantics: policy/role/team take the settings FQN chain,
everything else takes the entity detail chain, and the key is always the
FQN, never the id. The one inherited-permission source the server emits
is `domain` (`PermissionDebugService.processOtherInheritedPermissions`),
but the product detail route was `governance/domains/:id` and fetched
`GET /v1/domains/{id}` by UUID, so the debugger could not link domain
sources and rendered them as plain text (residual R-D8a-domain). The
official detail route is `/:fqn` and fetches by name; the id endpoint
takes a UUID path parameter, so an FQN value cannot be served through it.

## Decision

- The detail route is `governance/domains/:fqn` (name `governance-domain`
  unchanged); the detail view fetches by name (`getDomainByName`).
- Every production link to a domain detail passes the
  `fullyQualifiedName`: the domains list, the home domains widget, the
  member domain labels, the marketplace announcement/hit handlers, and
  the permission debugger's `entityLinkFor` (`case 'domain'`).
- A domain without a fullyQualifiedName has no addressable target: list
  and widget clicks do nothing, member labels render plain text. No
  caller may substitute `id` or `name` for the FQN.
- The version route stays `governance/domains/:id/versions/:version` and
  version reads stay id-based (B-9 ruling: the version route keeping
  `:id` is a recorded deviation, not expanded here).
- Old `/governance/domains/<UUID>` deep links break once (they resolve
  through `getDomainByName` to a 404 error state). No UUID fallback is
  added; bookmarks and external links must be updated (release-note item).

## Consequences

- R-D8a-domain closes: the debugger's Inherited Permissions section now
  links domain sources exactly as official does, with no plain-text
  fallback.
- The version page's back-to-detail link is a known temporary gap until
  B-9 #3 lands: it still navigates to `/governance/domains/<UUID>`,
  which 404s after this change. That gap is frozen work for another
  ruling, not something this record re-opens.
- The by-name detail fetch is #2 work (asset-detail branch): this record
  takes effect together with #2 in the same batch. Merged alone, the
  detail view is unusable (a `props.id === undefined` load error), so
  this branch must merge in the same batch as #2, with no deploy in
  between.

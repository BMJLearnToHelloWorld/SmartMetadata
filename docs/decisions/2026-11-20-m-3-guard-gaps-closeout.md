# The five M-3 guard gaps (R-1–R-5) are disposed of: R-1 and R-3 mounted as route declarations, R-5 split at the call site, R-2 and R-4 closed without code

- **Status:** Accepted
- **Revisions:** v1 2026-11-20 (initial)
- **Deciders:** Bai (2026-11-19 17:34: “8 项已验 1:1 全部通过，按推荐实施” — the five (a) recommendations below are the M-3/B-12 part of that batch)
- **Guard:** `smartmetadata-ui/src/router/guards.test.ts` (declaration evaluation, incl. the audit-log declaration); `smartmetadata-ui/src/router/routes.test.ts` (route records carry the declared guards, or none); `smartmetadata-ui/src/utils/emptyPlaceholder.test.ts` (multi-pair split)
- **Related:** decision material `~/workspace/work/next-batch-prep-20261119/SECTIONS-DECISIONS.md` §1 (per-item verification against the pin, options, recommendation (a) each); closeout memo `~/workspace/work/next-batch-impl-20261119/CLOSEOUTS-R2-R4-M8.md` (R-2, R-4, M-8); upstream pin `a3012259ca`

## Context

The sections quality review (M-3) registered five guard gaps (R-1–R-5)
and required each to be disposed of before the gate — fixed, or accepted
as a known residual and filed — never silently passed. The decision
material re-verified all five against the pin at main `6c2f5551` and
corrected three of the premises the gaps were filed under: the guard
framework could already express conjunctions (R-1), the pin is admin-only
for Online Users too (R-2), and the audit-log route guard had already
landed (R-4). Bai approved all five (a) recommendations on 2026-11-19
17:34. The three code items landed in the wave-1 batch (PR #229, PR
#233); the two no-code items were closed the same day. This record is
the in-repo closeout: the five dispositions, each checkable against the
code at main `e07bbd8f`.

## Decision

| Item | Disposition | Evidence at `e07bbd8f` |
|---|---|---|
| R-1 create-user conjunction | **Implemented (a): mount the declarations.** | `smartmetadata-ui/src/router/index.ts:321-341` — the comment names R-1; `create-user` carries `CREATE_USER_GUARD_DECLARATIONS['/create-user']` (`Create(USER)`), `create-user/bot` carries the `Create(USER) ∧ Create(BOT)` conjunction. Declarations at `src/router/guards.ts:306-312`. Landed by PR #233 (`2b94941e7f0f`). No page-level gate was added, matching the pin (route gate only). |
| R-2 Online Users admin-only | **Closed, no code (a): the premise was false.** | The pin is admin-only too (bare `AdminProtectedRoute` in `SettingsRouter.tsx:903-918`, page-level `isAdminUser` gating, server `authorizeAdmin` on `listOnlineUsers`). The product's two routes (`src/router/index.ts:280-281`, `:477-478`) carry no declaration and the view gates on `isAdminUser` (`src/views/insights/OnlineUsersView.vue`): net visible behaviour matches the pin. The old “pin: any authenticated user” registration is void. The optional (b) hardening (route declaration `'admin-only'`) was not approved and was not done. |
| R-3 Alert view gate | **Implemented (a): settings-path add/edit go session-level.** | `src/router/index.ts:496-510` — the comment names R-3; the settings-path add/edit faces (`settings-notification-alert-add`, `settings-notification-alert-edit`) carry no declaration, gated in-page by `useAlertFormAccess` (`Create` for add, `EditAll` for edit), as the pin mounts them bare. The observability-path faces are session-level too (`:995-1004`). List/detail keep the `EVENT_SUBSCRIPTION` view gate (`:982-988`). Landed by PR #233 (`2b94941e7f0f`). |
| R-4 Audit Logs | **Closed, no code (a): the route layer already implements it.** | `src/router/index.ts:359` (`{ resource: 'AUDIT_LOG', operation: 'AuditLogs' }`); vocabulary at `src/settings/permissionRules.ts:64`; predicate at `src/router/guards.ts:83-94`. The view has no page-level gate, matching the pin (route gate only). The old “no `AUDIT_LOG` vocabulary” registration is stale. One live check remains (see Consequences). |
| R-5 double `<0>` rendering | **Implemented (a): split at the call site, locale untouched.** | `src/views/admin/TeamDetailView.vue:509-525` — the comment records the pin's `Transi18next` rendering and splits the message with `splitTransElements`; the multi-pair helper is at `src/utils/emptyPlaceholder.ts:151-160`. The locale value (`message.entity-transfer-message`, two `<0>` pairs, two `{entity}` interpolations) is unchanged, and `entity` is now passed. Landed by PR #229 (`aafa99bcfac3`). |

## Consequences

- M-3 is closed: no guard gap from the five remains open as a code item,
  and no item was left as an unfiled known residual.
- **R-4 keeps one live check (C-class, not blocking).** A non-admin
  account holding the `AuditLogs` permission must be seen entering the
  page with normal data loading, and an account without it must be seen
  refused. That check needs a suitably permissioned account (or Bai's
  temporary login) and is tracked with the C-class live verification,
  not with this record.
- **R-1 (a) is frontend-entry alignment only.** Whether the server
  enforces `Create(USER)` / `Create(BOT)` per caller on
  `POST /v1/users` was not verified line by line (decision-material
  item U-1); the same holds for the server-side enforcement behind
  alert create/edit (U-2). Neither statement is made by this record,
  and neither gap is closed by it — they stay open as verification
  items.
- The rejected alternatives stay rejected: (b) adding a page-level gate
  to `CreateUserPage` (beyond the pin), (c) leaving the create-user
  routes session-level, (c) widening alert creation to `'admin-only'`
  on both paths, (b) adding a page-level gate to Audit Logs, (b)
  rewriting the locale value for the transfer message, and (c) widening
  Online Users to any logged-in user (in conflict with the pin and the
  server). Reopening any of them needs a new decision, not a silent
  edit.

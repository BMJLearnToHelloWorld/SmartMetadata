# Navbar domain switcher + persona menu placement

- **Status:** Accepted
- **Revisions:** v1 2026-11-25 (initial)
- **Deciders:** Bai (2026-11-25 18:57: verify, then land items 1–2 in this batch; item 3 lineage canvas is a separate batch, not covered here)
- **Guard:** `smartmetadata-ui/src/components/shared/DomainSelect.test.ts` (button trigger, PATCH + reload, failure path, select variant untouched); `smartmetadata-ui/src/layouts/PersonaSwitcher.test.ts` (sort order, 2 + more, sessionStorage, legacy adoption); `smartmetadata-ui/src/layouts/AppShell.test.ts` (domain switcher in the header, persona section in the user menu)
- **Related:** upstream pin `a3012259ca`; verification `~/workspace/work/verify-nav-lineage-3/REPORT.md` (§1 domain switcher missing, §2 persona switcher misplaced); ADR:2026-11-17-sink-failure-semantics (the FK-deferral premise this batch revisits lives in a separate lane, not this record)

## 1. Navbar domain switcher (pin `NavBar.tsx:478-510, 573-596`)

### Pin behaviour (verified against `a3012259ca`)

- The navbar shows, left to right: sidebar toggle, `<GlobalSearchBar />`,
  then `{domainScopeSelector}` — a `DomainSelect` with
  `data-testid="domain-dropdown"`, a button trigger showing the active
  domain's display name (or "All Domains") with a globe icon, turning
  brand colour when a domain is selected.
- A domain-restricted user with exactly one domain gets a disabled,
  tooltip-wrapped trigger (`isSingleDomainUser = isDomainRestricted &&
  userDomains.length === 1`); a restricted user with several domains
  still gets "All Domains" (it only removes the filter, not the
  visible permission).
- Switching persists the pick as the user's `defaultDomain`
  (`hooks/useSwitchActiveDomain.ts`: JSON Patch `add` on
  `/defaultDomain`, value `{ id, type: DOMAIN }`, `null` clears), then
  reloads the whole page (`navigate(0)`) so the server applies the new
  scope to every list. A failed PATCH shows an error and does not
  reload.

### Product decision

- `DomainSelect.vue` gains a `triggerVariant="button"` form (pin's
  `triggerVariant` prop name) rendering the button trigger
  (`data-testid="domain-dropdown"`, globe icon, active-domain label or
  "All Domains", brand state when a domain is selected). The existing
  `select` form is unchanged and stays the page-filter dropdown.
- `AppShell.vue` renders the button form immediately right of the
  search bar, on every page including home (pin's NavBar comment
  records that suppressing the pair on home left the home page with no
  way to search or scope a domain).
- `stores/domain.ts` gains `switchDomain(id)`: PATCH the signed-in
  user's `defaultDomain` (JSON Patch `add`, through the existing
  `api/users.ts::updateUserDetail` — the same function pin's
  `useSwitchActiveDomain` calls), mirror the pick into the local
  selection on success, return whether the caller should reload. The
  caller (`DomainSelect`) reloads with `router.go(0)` only on success;
  on failure the scope is untouched and `switchErrorMessage` is set.
  With no signed-in user id the pick is local-only and the caller
  still reloads (pin's no-currentUser branch).
- `selectDomain` (local shell selection, page filters) is untouched:
  it still only scopes the shell selection and does not rewrite
  per-page queries. The header switch is the only path that PATCHes.
- Residual, unchanged: `isDomainRestricted` is `false` — no product
  endpoint for the user-scoped restriction was located, and none is
  invented. The single-domain disabled-trigger branch exists in the
  component and never fires until such an endpoint exists.

## 2. Persona switcher moves into the user menu (pin `UserProfileIcon.component.tsx`)

### Pin behaviour (verified against `a3012259ca`)

- `NavBar.tsx` mentions persona **zero** times. Persona switching lives
  in the user-profile dropdown: the trigger shows avatar + user name +
  the current persona name (or "Default", `data-testid="default-persona"`),
  and the menu carries a "Switch persona" section — a radio list of the
  user's personas (direct + inherited + default, deduplicated), default
  persona first with a "Default" badge, then the selected one, the rest
  alphabetical; 2 shown by default with a "N more" row to expand
  (`shouldCloseOnSelect={false}`).
- Clicking a persona calls `setSelectedPersona`
  (`useApplicationStore.ts:258-266`): writes sessionStorage
  (`PersonaSessionUtils.ts`, explicitly short-lived) and updates the
  store; **no page reload**.
- Pin's `PersonaSelect` is a different component: a form TreeSelect for
  *assigning* personas to users/teams. It is not a switcher and is not
  in the navbar. The product's old `PersonaSwitcher.vue` header comment
  citing it as the model was a mis-citation.

### Product decision

- `PersonaSwitcher.vue` is rewritten as the menu section (radio list,
  Default badge, 2 + more, same sort order as pin) and rendered inside
  the shell's user menu between the profile entry and logout. The
  standalone top-bar Select is deleted from the header. The misleading
  `PersonaSelect` comment is removed.
- The trigger's second line shows the current persona name (or
  "Default"), matching pin's `default-persona` line, plus a chevron.
- The user dropdown is controlled open state so the "more" row keeps
  the menu open after expanding (pin's `shouldCloseOnSelect={false}`);
  a persona pick closes the menu.
- **Persistence: sessionStorage (pin parity).** Rationale: the
  selection is a per-tab view preference, not a durable setting; pin
  deliberately scopes it to the session, and the product already falls
  back to the user's `defaultPersona` on a fresh tab, so nothing is
  lost. The store keeps the same key (`sm.persona.v1`) and adopts a
  pre-upgrade localStorage value once on hydrate (legacy key read
  first, moved to sessionStorage, legacy key cleared), so existing
  users keep their persona across the upgrade without a second source
  of truth, and existing tests that seed the legacy key keep working.
- The persona store itself and the C-4 sidebar consumption are
  untouched: only the trigger UI and the persistence mechanism move.
  C-4 never ruled on a top-bar Select (its decision record has zero
  hits for switcher/header/navbar), so this move needs no C-4 change.

## Consequences

- Header layout: search bar + domain switcher on the left, locale /
  inbox / help / user menu on the right. The "Select persona" dropdown
  disappears from the top bar.
- Switching a domain reloads the page (pin behaviour); switching a
  persona does not.
- The persona selection no longer survives a new tab or a browser
  restart — it falls back to the user's `defaultPersona`, as in pin.
- Tests: `DomainSelect.test.ts` (button trigger, PATCH + reload,
  failure path), `PersonaSwitcher.test.ts` (menu section, sort order,
  more-expand, sessionStorage + legacy adoption),
  `AppShell.test.ts` (header composition, trigger label, menu section,
  menu stays open on "more", closes on pick).

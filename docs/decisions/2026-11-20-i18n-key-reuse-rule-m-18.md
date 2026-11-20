# i18n keys are reused by reference, never by deleting a live key: the M-18 rule

- **Status:** Accepted
- **Revisions:** v1 2026-11-20 (initial)
- **Deciders:** Bai (2026-11-19 10:49: (b) + (b-1) — keep both keys with a clear division of labour, values left as they are)
- **Guard:** reviewer (no automated ledger check exists in-repo; a duplicate or a new synonymous key is caught by review against this record)
- **Related:** RESIDUAL-MASTER-LIST-6c2f5551.md §A3 R-15 / §B B-10 (the residual that asked for this rule); decision material `~/workspace/your_files/b-item-decisions-20261119.md` §B-10 (evidence table, options, recommendation); upstream pin `a3012259ca` (`zh-cn.json`)

## Context

M-18 is not one pair of keys but three places where the same concept is
carried by two translations at once: `label.no-description`,
`message.no-permission-to-view`, and `message.no-permission-for-action`.
The interim instruction (R-15) — "write reference keys, keep existing
keys, report duplicates" — was an execution order, not a rule. This
record is the rule itself, in full, with its boundary.

The deciding evidence is the official `zh-cn.json` values. No single
sweep can align all three places with official by value alone:

| Key | Official zh | Existing product zh | New key zh |
|---|---|---|---|
| `label.no-description` | “无描述” | “暂无描述” | “无描述” (identical to official) |
| `message.no-permission-to-view` | “您没有查看此数据所需的必要权限” | “你没有查看此数据的权限。” | “你没有查看此数据的必要权限。” (all three differ) |
| `message.no-permission-for-action` | “您没有执行此操作所需的必要权限” | “您没有执行此操作所需的必要权限” (identical to official) | “你没有执行此操作的必要权限。” |

Option (a) — reuse the existing keys and delete the new ones — cannot be
executed cleanly on the main item: `label.no-description` does not exist
in the old main, it is a pin-native key the sections batch added, and none
of the three existing `noDescription` keys is usable from all six call
sites (they sit in `explore` / `governance` / `settings`, while the call
sites span shared components, admin faces, and observability faces).
Deleting it would also delete a key official uses at 15+ call sites.
Option (b) keeps the pin-native key name and its official-backed zh, and
leaves the existing keys frozen. (b-1) keeps every value exactly as it
is: zero rendering change, zero test change, zero missed-rename risk.
Official tolerates the same shape in general (`en-us.json` still holds
105 non-plural duplicate values after excluding plural forms), and the
ledger already has a prior "unify the value, keep the keys" disposal
(`{field} is required.` ×7).

## Decision

- **The new pin-native keys are the generic keys.** `label.no-description`
  is the generic empty-description placeholder; every shared component and
  every newly built settings face uses it. The two new permission keys
  (`message.no-permission-to-view`, `message.no-permission-for-action`)
  are the generic keys for newly built settings faces. No new synonymous
  key may be created for any of these three meanings.
- **The existing keys are frozen, not deleted.** The three `noDescription`
  keys (`explore`, `governance`, `settings`) and the two permission keys
  (`home.noPermissionToView`, `crud.noPermissionForAction`) stay exactly
  where they are, keep serving their current call sites, and are never
  renamed, moved, or re-pointed at the new keys. A later cleanup of a
  frozen key needs its own decision; this rule does not authorise it.
- **Values stay as they are (b-1).** No value is unified, rewritten, or
  re-translated under this rule — including the two places where an
  existing value already matches official zh word for word
  (`settings.noDescription` zh “无描述” and
  `crud.noPermissionForAction` zh “您没有执行此操作所需的必要权限”).
  In particular the permission-action existing value is excluded from
  any future value-unification pass unless that pass says otherwise
  explicitly, because unifying it would lower its agreement with
  official zh.
- **Duplicates are reported, by key reference.** A newly found duplicate
  is reported against the keys it involves (ledger entry by key
  reference). An entry that only affects the i18n ledger does not get
  its own ADR; it is recorded by key reference and reviewed against
  this rule (b-1).

The inventory this rule governs, at main `e07bbd8f`:

- `label.no-description` — `smartmetadata-ui/src/i18n/locales/en-US.ts:348`
  (`'No description'`), `zh-CN.ts:348` (`'无描述'`); 6 production call
  sites (`DescriptionCell.vue:41`, `UserPopOverCard.vue:209`,
  `BotDetailView.vue:709`, `TeamHeaderSection.vue:471`,
  `PersonaDetailsCard.vue:70`, `AlertDetailView.vue:288`).
- Frozen `noDescription` — `explore` (`en-US.ts:1307`, zh `'暂无描述'`),
  `governance` (`en-US.ts:2151`, zh `'暂无描述'`), `settings`
  (`en-US.ts:3286`, zh `'无描述'`); 6 production call sites
  (`ExplorePreview.vue:89`, `SearchView.vue:710`,
  `MembersAssetList.vue:259`, `GlossaryDetailView.vue:915,1008`,
  `SearchFieldConfiguration.vue:118`).
- `message.no-permission-to-view` / `message.no-permission-for-action` —
  `en-US.ts:734-735`, `zh-CN.ts:729-730`; 11 production call sites.
- Frozen `home.noPermissionToView` (`en-US.ts:921`) and
  `crud.noPermissionForAction` (`en-US.ts:1920`); 6 production call sites.

## Consequences

- Zero rendering change, zero test change: the code at `e07bbd8f` already
  matches this rule, which is why the rule is a record, not a code
  change. The product keeps the pin-native key names and, where they
  already hold, the official zh values.
- The rule governs **only these three M-18 pairs**. It does not extend to
  the other sentence-level duplicates listed in the decision material's
  appendix (at least `server.entityLimitReached` /
  `server.entity-limit-reached` and the two `check-spelling` keys, both
  flagged there as suspected mismatches needing separate verification).
  Those stay open for their own verification and are not closed by this
  record.
- `settings.noDescriptionAdded` (`en-US.ts:3500`) is a different key with
  a different meaning and is not governed by this rule.
- Correction to the decision material: it placed the third frozen
  `noDescription` under `apps` (true at `392b3efd`); at `e07bbd8f` it
  lives under `settings` (`en-US.ts:3286`), and no `noDescription` exists
  under `apps`. This record follows the baseline measurement.

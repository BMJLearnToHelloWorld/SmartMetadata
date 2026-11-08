# Ontology browser "Open studio" gate uses the official four-item resource formula

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** W2-3 (G-18 stage 1)
- **Guard:** `OntologyExplorerView.test.ts` (each granting item, all-denied, permission error)
- **Related:** REVIEW-W2-G18-S1.md condition 7; RULING-ontology-browser.md §8 D6 (E-D6)

## Context

The browser's "Open studio" button had no permission condition at all.
Official shows the edit surface only when `computeCanEditOntology` holds
(pin `a3012259ca`,
`openmetadata-ui/src/main/resources/ui/src/pages/OntologyExplorerPage/
OntologyExplorerPage.tsx`, around line 186):

```
isAdminUser
  || EditAll(GLOSSARY)
  || EditGlossaryTerms(GLOSSARY)
  || EditEntityRelationship(GLOSSARY_TERM)
```

The product studio's own gate is a different, three-item *entity*
formula — `isAdminUser || EditAll || EditGlossaryTerms` via
`getEntityPermissionByFqn('ontology', fqn)` — which lacks the
`EditEntityRelationship` on `GLOSSARY_TERM` item. The two must not be
confused: the browser entry is a resource-level gate, not the studio's
per-entity gate.

## Decision

- The browser entry uses the official four-item resource formula above:
  `isAdminUser` from the permission store plus
  `getResourcePermission('glossary')` (`EditAll`, `EditGlossaryTerms`)
  and `getResourcePermission('glossaryTerm')`
  (`EditEntityRelationship`). Resource names are verified against the
  server (`Entity.java`: `GLOSSARY = "glossary"`,
  `GLOSSARY_TERM = "glossaryTerm"`).
- Fail-closed: while the permission calls are unresolved, or when either
  call fails, the entry is not shown. A non-admin without any of the
  four grants sees no usable entry; the button is hidden (not merely
  disabled), matching official's edit tab not appearing at all.
- The studio's three-item entity formula is left untouched; it gates
  editing inside the studio, a different surface.

## Consequences

- A user holding only `EditEntityRelationship` on glossary terms can open
  the studio from the browser, as official allows; a user with none of
  the four grants cannot.
- Two-role live verification is owed (non-admin account pending); until
  then only the admin path is verified live and the denial path rests on
  unit tests.

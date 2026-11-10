# D-2: greeting header lands, HomeHero welcome line is removed

- **Status:** Accepted (Bai decided 2026-11-08, both items as recommended)
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `features/home/HomeLandingPageHeader.test.ts`, `features/home/HomeHero.test.ts`, `views/home/MyDataView.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` D-2, official `components/MyData/HomeLandingPage/HomeLandingPageHeader.tsx`

## Context

The page had its single welcome copy in the right-rail HomeHero
("Welcome, {name}!" + slogan), while stage C adds official's
classic greeting header at the top of the page. Two welcomes would
read as a mistake; one of them had to go. The review recommended
the page-top header land and the HomeHero welcome line be removed.

## Decision

- The greeting header lands (`HomeLandingPageHeader`, 40px avatar +
  `Hi, <name>` + subtitle) as the fallback of
  `CriticalAnnouncements` — it is the page's single welcome copy.
- The HomeHero welcome line is removed (the `h2` and the slogan).
  Search, domain filter and service chips stay in the hero.
- The hero's tools area is restored as a visible functional zone:
  `.home-hero__tools` had been `display: none` since the hero was
  created in #162, so removing only the welcome copy would have
  left an empty coloured block. The un-hide is part of this
  decision, not a side change: minimal layout CSS for the
  search row, domain select and chips is added (the tools never had
  any, having never been visible).
- The `userName` prop is removed from HomeHero; the header reads
  the display name from the auth store directly.

## Consequences

- The page keeps exactly one welcome. The `home.welcome` /
  `home.slogan` keys are now unused by any component; they stay in
  the locale files (no key is deleted in this batch).
- The hero is now a tools band (search + domain + service chips)
  under the greeting header, not a second welcome.

# My-data right rail keeps HomeHero only; no official greeting header in stage A

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Bai
- **Guard:** `MyDataView.test.ts` (single welcome copy, rail contents)
- **Related:** Wave 1 W1-5 stage A, `wave1/REVIEW-W1-5-G11.md` condition 7, `RULING-my-data.md` §8裁决 3 (B-3 (a))

## Context

The product's `/my-data` page is a 3-column shell: a widget area
in columns 1–2 and a right rail in column 3. Before stage A the rail
held three things: the Total card, HomeHero (welcome + search +
domain scope + service chips, a product-owned component with no
official counterpart), and the Following card.

Stage A moves Total and Following into the 13-item grid (Total as its
own cell, Following merged into YoursAndFollowed), so the rail is
left with HomeHero alone — while the grid grows from 3 rows to 7.
Official has no rail at all: its greeting header
(`HomeLandingPageHeader`, avatar + "Hi, <name>" + subtitle) sits at
the top of the page as the fallback of the critical-announcements
slot, and it lands with stage C's announcements work.

## Decision

- Stage A keeps the existing 3-column shell: the widget grid spans
  columns 1–2, the rail stays in column 3 with **HomeHero only**.
- The rail stretches the full grid height (`align-self: start` with
  `position: sticky`, so the hero stays visible while the 7-row grid
  scrolls); it does not collapse or reflow into the grid.
- Stage A builds **no official greeting header**. The page therefore
  has exactly one welcome copy — HomeHero's. Merging the official
  greeting header with HomeHero's welcome copy (B-3) is a stage-C
  obligation, when the announcements slot it falls back from exists.

## Consequences

- Two welcomes must never appear on the page; the stage-A test
  asserts exactly one welcome copy.
- If a later stage removes HomeHero or adds the greeting header, this
  record must be revised in the same change — the rail's contents are
  a deliberate product decision, not leftover layout.

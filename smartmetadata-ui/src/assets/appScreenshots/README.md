# App screenshots (pending)

The five marketplace screenshot PNGs from the official tree
(`openmetadata-ui/.../assets/img/appScreenshots/`) are NOT in this
directory. PNGs cannot be pushed through the approval-card flow and must
not be fabricated: Bai uploads them via the GitHub web UI (residual from
the settings-sections Applications batch, 2026-11-18).

Until they land, `importAppScreenshot` throws for every name and the
marketplace detail page drops every screenshot, exactly as the official
catch path behaves for a missing file.

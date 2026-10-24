# Harness status at the pre-W7 phase boundary

The plan counted 26 scripts; the directory now has 31 because W8 added
`worldsnap.mjs`, `kindly-opening.mjs`, `kindly-content.mjs`,
`island-check.mjs`, and the earlier count omitted some utilities.

## Active Kindly Forward gates

| Script | Current subject |
|---|---|
| `worldsnap.mjs` | W1 compatibility-world identity; deterministic self-test passed |
| `kindly-opening.mjs` | W2 ferry-to-Albert slice and review capture |
| `island-check.mjs` | W3 deterministic generation, plots and connectivity |
| `silhouette.mjs` | W4 placeholder cast; deterministic self-test passed |
| `playthrough.mjs` | kept real-input systems plus W5 full-satchel claim refusal |
| `kindly-content.mjs` | W6 cast/content consistency and review capture |
| `daily.mjs` | W6 dialogue, tastes and schedules |
| `letters.mjs` | W6 fixed eight resident letters and build gates |
| `finale.mjs` | W6 three-act narrative spine and Postmaster arc |
| `smoke.mjs` | live Kindly Forward regression alarm. Repaired 2026-08-25 — it had been **dead**, not red: it pressed E at a `control` cue that resolves on a position, sat in `intro` for its whole budget, and reported an execution-context error rather than a failure. Now walks the opening route on real input via `lib/openingWalk.mjs`. Four consecutive green runs on the same commit (W8.1 self-test). |
| `save-schema.mjs` | W5 v3 clean break and recovery. Repaired 2026-08-25 — imported the deleted `IslandSolver.ts` and so could not run at all. Now gates the field the runtime actually reads (`island.templateId`), which caught a live persistence bug. |
| `kindly-activation.mjs` | W6.5 activation: residents, dialogue, letters and arcs live under `?pack=kindly-forward`; deterministic self-test passed |

## Live compatibility checks, not Kindly Forward evidence

These still have a real subject because W7 has not been authorized:
`animation-check.mjs`, `collections-visual.mjs`, `customization-visual.mjs`,
`customization.mjs`, `economy.mjs`, `faces.mjs`, `lighting-check.mjs`,
`music.mjs`, `perf.mjs`, `scenes.mjs`, `sfx.mjs`, `shopworld.mjs`, `ui.mjs`,
and `visual.mjs`.

They must not be cited as acceptance evidence for the new cast or island.
`visual.mjs`, `faces.mjs`, and the other image scripts are capture tools only.
At this boundary, `economy.mjs` fails its legacy real-E shop positioning and
`scenes.mjs` does not terminate in reasonable time. Both are explicitly
blocked compatibility-harness repairs, not silently skipped passes. W7 must
either retarget or retire every script in this section when the compatibility
world is removed. `perf.mjs` currently measures only that compatibility world;
generated-island render cost cannot be measured before renderer activation.

## The walk the harnesses have to make

`scripts/lib/openingWalk.mjs` is shared by `smoke.mjs` and `kindly-opening.mjs`.
It exists because three separate things defeat a naive walker, and each one cost
a debugging session:

1. `GameSceneHost.control` blocks on a **position**, not a duration. Pressing a
   key at it waits forever.
2. The straight line is a cliff. On `seed-80085` the office is three acres due
   north of the dock, but the only ramp onto its tier is six acres **east**, so
   the walkable route is an out-and-back.
3. The acre traversal graph is too coarse to steer by, and a point-sampled
   walkability path routes the player through gaps it cannot fit through. The
   path is found on `IslandField.walkableAt` at cell resolution using the same
   radius-cross rule as `resolveIslandMovement`, with clearance, and followed
   cell by cell — corner simplification loses the one-cell ramp corridors.

**The detour is not a harness workaround.** It is what the map asks a player to
walk, and whether that is the opening anyone wants is a human call — see
`REVIEW_QUEUE.md`.

## Repository utilities

`clean-palette-imports.mjs`, `compare.mjs`, `grade-palette.mjs`,
`lint-palette.mjs`, `migrate-palette.mjs`, and `render-music.mjs` operate on
files or supplied arguments rather than a game canon. They remain utilities,
not acceptance gates. All scripts pass `node --check`; palette lint is clean.

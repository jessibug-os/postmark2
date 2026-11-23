# Chargen contract v2

`contract.json` is the single source of truth. Blender scripts read it with
`json.load`; TypeScript imports it through `src/characters/chargen/contract.ts`,
which re-declares the id lists as literal types and throws at module load if
the JSON drifts from them.

## Frozen

- **Bones.** The ordered list in `bones`. Every body (`adult`, `child`,
  `sturdy`, `elder`) uses the same names and hierarchy and differs only in bone
  lengths. `socket_hand_*` do not deform. `extra_hair_back` and `extra_hem_*`
  are spring bones that code drives at runtime; clips leave them at rest.
- **Colour masks.** Each body atlas has an RGBA mask with the same layout:
  `r` primary, `g` secondary, `b` accent, `a` untinted detail (1 keeps the
  painted colour). Tinted texels are painted grey, and the final colour is
  `albedo_grey * mix(white, channelColour, mask)`. Skin, hair and eyes are
  recipe colours, not item colours.
- **Part properties.** Every kit mesh carries the `partProperties` keys as
  custom properties, which export as glTF extras. A mesh with a key missing
  fails the build.
- **Budgets.** 600–900 tris per character, at most 3 draw calls, 512 px atlas.

## Lanes

- **Kit build** owns `build_kit.py`, the rig per body, the mask atlas, and
  the `ctx` helpers listed under `scripts.ctx`.
- **Parts** add `assets/chargen/parts/<id>.py` files and nothing else.
- **Clips** add `assets/chargen/clips/<id>.py` files and nothing else.
- **Runtime** moves `createCharacter`, `kit.ts`, the creator UI, the player
  and saves onto `CharacterRecipeV2`, `items.ts` and mask tinting.
- **Items** add entries to `ITEMS` in `items.ts`.

## Per-part and per-clip scripts

Parts and clips are written as Python source instead of being merged by hand
into the binary `.blend`. The kit build imports each file and calls
`build(ctx)` once per body.

- A part's `build(ctx)` returns new mesh objects. It links them into
  `ctx.collection`, skins them with `ctx.skin_to` and tags them with
  `ctx.tag`. A part is only fitted to the bodies in its `kit_bodies`.
- A clip's `build(ctx)` creates actions on `ctx.rig` named
  `<asset-id>_<state>`, keyed only on deforming bones other than the
  spring bones.
- `ctx.bones` gives the world rest head and tail positions for each bone, so a
  script never has to hard-code positions for one body.

## Recipe v1 to v2

`upgradeRecipe` accepts either version. Given a v1 recipe:

- `parts.hair` becomes `hair.style`. `colors.skin` becomes `skin`,
  `colors.hair` becomes `hair.color` and `face.iris` becomes `eyes`.
- Each other v1 slot maps to the item with the same id. `apron` moves to slot
  `outer`, and the others keep their slot.
- The variant is the one whose primary colour is closest in RGB to the v1
  channel for that slot (`hat`, `top`, `bottom`, `shoes`, and `accent` for bag
  and apron). If the channel is not set, the item's first variant is used.
- `body` becomes `adult`.

Any missing or unknown field falls back to `DEFAULT_RECIPE_V2`. An empty
optional slot stays `null`, and an empty required slot (`top`, `bottom`,
`shoes`) takes the default item.

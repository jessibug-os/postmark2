# Keeper of Undelivered Things — v01

User-requested darker introductory spirit, authored through Blender MCP on
2026-09-07. A separate model study; not wired into the opening or resident cast.

- Editable source: `keeper-v01.blend` (scene `Keeper_v01`).
- Export: `public/assets/keeper-v01.glb`; front +Z in glTF, metres.
- 840 triangles, 13 deform bones, 256px baked colour/AO/top-light atlas.
- Four full-body clips: `keeper_idle` (4s), `keeper_unfold` (4s),
  `keeper_talk` (2.667s), `keeper_summon` (5s).
- Idle/talk/summon loop. Arrival should play once with its last frame clamped.
- Floating rest geometry reaches 4.67m; origin is on the floor below it.
- Palette sampled from the project's generated swatches; single amber core.

Review: `/docs/review-queue/keeper-v01/index.html` with Vite running. Orbit the
exported GLB and select each clip. This is a review studio, not proof of in-game
lighting, camera clearance, or performance. Status: AWAITING HUMAN.

Reproduce through Blender MCP in a fresh scene: execute `author_keeper.py`,
then `build(); animate(); stage(); refine(); bake(); export()`. For subsequent
MCP calls reload the script definitions first, since execution scopes are fresh.
`render_pose()` captures a still. Source colour materials remain in the blend;
export materials sample the atlas. The existing Blender scene is preserved.

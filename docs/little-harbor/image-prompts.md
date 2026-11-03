# Little Harbor — image provenance and prompts

Generated with the built-in `image_gen` tool on 25 October 2026. No external CLI or API key was used. All outputs were copied into `public/direction-media/`; originals remain in the tool's generated-image directory. These images are proposed design illustrations, not screenshots. Their rendering fidelity is above the current engine; the design document explicitly limits their use to composition, spatial intent, and atmosphere.

## Harbor arrival

File: `harbor-concept.png`

Prompt:

Create a polished game-design-document concept illustration for LITTLE HARBOR. A single wide landscape 16:9 image: a tiny working ferry town viewed from a playable elevated third-person camera, clear readable low-poly handmade 3D geometry, restrained flat-shaded materials, chunky expressive storybook HUMAN townspeople with toy-like proportions (not animals, not robots), warm cream plaster, muted sage painted wood, brick-red roofs, blue-gray sea. Foreground: a young adult newcomer holding a small suitcase arrives on a timber ferry dock. Midground: a bakery with an external stair to a modest upstairs rental room, adjacent neighborhood cafe, a small repair yard with a ferry engineer working, neighbors independently carrying groceries and chatting. Background: a wooded hill path and modest observatory. A compact inhabitable neighborhood, not a grand fantasy city. Early morning soft natural light, charming practical clutter, visible walkable paths and doors. No magical weather, no postal uniforms, no supernatural symbolism, no UI, no captions or text. This is aspirational concept art for an indie life simulation game, not a screenshot. Convey independence and a town already living before the newcomer arrives.

## Starter room

File: `room-concept.png`

Prompt:

Landscape 16:9 game design concept image for LITTLE HARBOR, starter home above a bakery. Show a modest rectangular 6 by 5 metre room in an orthographic three-quarter dollhouse cutaway, TWO walls removed so the entire usable floor and door are legible. Intentionally simple low-poly indie game rendering, visible flat polygon facets, flat Lambert-like shading, nearest-filter handpainted textures, soft ambient light, no photorealism, no cinematic depth of field, no dense clutter. Cream plaster, muted green window frames, warm wooden floor. A single bed along left wall, small usable round table and two chairs near window, a shelf displaying three found objects, a suitcase by the entrance, small counter with kettle, a blue lamp. Clear unobstructed walking lane from door at lower right to bed and table. Window looks toward blue-gray harbor and ferry, afternoon light. One small storybook human young-adult character in plain coat holding the blue lamp, another neighbor at the doorway. Express independence, ordinary comfort, room to rearrange furniture. No text, numbers, arrows, UI, grids or captions. This is a spatial concept illustration, not a screenshot. Prioritize modest scope and readable game-scale geometry.

## Café shift

File: `cafe-concept.png`

Prompt:

Wide landscape 16:9 concept illustration for a small indie 3D life-simulation game LITTLE HARBOR. A neighborhood cafe interior seen from a high three-quarter playable camera, intentionally simple low-poly faceted toy-like HUMAN adults, simple cream plaster and sage green timber, warm wood, flat shaded materials, limited textures, readable geometry. The player is a young newcomer working a short cafe shift, carrying a wooden tray with one cup and bread. June the coworker behind the counter is talking with them. Two older residents at a nearby table are independently playing cards; one visitor reads a newspaper by the window. Three clearly separated work locations: order counter, serving table, used-cup return shelf. Broad clear walking paths, short distances, four tables maximum, background window shows ferry harbor in drizzle. Design focus is a social workplace, not frenetic restaurant management. No crowd, no glowing quest markers, no HUD, no written signs or text, no photorealism, no glossy plastic rendering. Warm lived-in mood, ordinary relationships, visually distinguishable jobs and props. This is proposed staging, not current gameplay.

## Current-build screenshots

Captured using Firefox's Save visible screenshot command against `http://127.0.0.1:5173/`, served by this repository's Vite development server. No image generation or retouching was used for these captures.

- `current-title.png`: 15:38:32, title and empty save slots. Source download: `Screenshot 2026-10-25 at 15-38-32 POSTMARK — a cozy clockwork town.png`.
- `current-ferry.png`: 15:40:32, new empty review slot 3, opening ferry dialogue. Source download: `Screenshot 2026-10-25 at 15-40-32 POSTMARK — a cozy clockwork town.png`.
- `current-outdoors.png`: 15:41:16, same review slot after skipping the opening, player at the post-office handoff. Source download: `Screenshot 2026-10-25 at 15-41-16 POSTMARK — a cozy clockwork town.png`.

The separate 127.0.0.1 origin was used rather than the user's localhost-origin saves. The screenshots establish the displayed scene, not progression completeness or performance.

## Diagrams

`architecture.svg`, `neighborhood.svg`, `day-cycle.svg`, `transaction.svg`, and `room-plan.svg` are deterministic SVGs authored by `scripts/build-direction.py`. They describe proposed implementation rules. They are not image-generation outputs.

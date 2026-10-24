# Runtime architecture

`Game` is the runtime state host and composition root. Its constructor wires
rendering, systems, UI, event listeners, and test probes. Behavior is grouped by
domain in `modules/`:

- `GameLoop` — frame lifecycle, NPC creation/schedules, and state entry
- `InteractionController` — world prompts, doors, and interiors
- `CommerceController` — shop, crafting, renovation, building, and achievements
- `ActivityController` — tools, catches, gathering, and inventory use
- `SceneDirector` — staged scenes, camera blocking, props, and particles
- `SocialController` — ordinary dialogue, gifts, favors, and donations
- `CalendarMailController` — seasons, festivals, daily loop, letters, and finale
- `PersistenceController` — save serialization and restoration

Each module exports typed functions whose `this` is `Game`. `Game.ts` installs
those functions on the prototype once, preserving the existing `Game` object
used by the UI and test harness. New behavior belongs in the narrowest existing
domain module; new cross-domain state belongs on the host only when more than
one domain owns it.

`TownMap` follows the same pattern:

- `WorldFoundation` — backdrop, terrain, water, bridge, and unlock barriers
- Acre and scene fixtures — editor-authored placement; runtime procedural object
  dressing was removed on 2026-08-24
- `TownBuilder` — landmarks, plots, scaffolds, and building construction
- `BuildingBuilder` — authored building forms and plaza dressing
- `WorldRuntime` — collision, placement, feature consumption, and animation

The extraction is intentionally behavior-preserving. A future conversion from
prototype-installed domains to composed controller objects should keep these
ownership boundaries rather than recombining them.

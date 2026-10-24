# POSTMARK authored asset convention

## Coordinates and scale

- Model in metres at Blender unit scale 1.0.
- `+Z` is up in Blender; export glTF with `export_yup=True` so Three.js receives
  `+Y` up.
- Character and prop origins sit at ground contact, centred on their footprint.
- The front of an asset faces Blender `-Y`, which becomes Three.js `+Z`.
- Apply object transforms before export. Do not apply armature pose transforms.

## Naming

- Source: `assets/<category>/<asset-id>/<asset-id>.blend`.
- Runtime: `public/assets/<asset-id>.glb`.
- Objects use `<asset-id>_<part>`; materials use `mat_<category>_<finish>`.
- Armature bones use `core_*` for the shared rig and `extra_*` for
  morphology-specific mechanisms.
- Animation actions use `<asset-id>_<state>`; shared states are `idle`, `walk`,
  `run`, `wave`, `tool_*`, `react_*`, and `talk_*`.

## Materials and textures

- Material slots describe physical finishes, not arbitrary colours: brass,
  patina, ivory, painted wood, weathered timber, cloth, stone, glass, amber.
- Runtime converts opaque authored materials to flat-shaded Lambert materials
  and applies the shared retro vertex treatment.
- Texture sheets are PNG, sRGB colour, 128 or 256 px, nearest filtered.
- One sheet per small prop; characters may use one body sheet plus a face sheet.

## Triangle budgets

| Category | Target |
| --- | ---: |
| Villager / player | 600–900 |
| Hero prop / furniture | 150–700 |
| Small prop | 20–250 |
| Tree | 250–900 |
| Building exterior | 1,500–4,000 |

## Rig contract

Equipment-ready humanoid characters use the versioned `equipment-v1` core:

```text
core_root
└─ core_hips
   ├─ core_spine
   │  ├─ core_head
   │  ├─ core_upper_arm_l ─ core_forearm_l ─ core_hand_l ─ socket_hand_l
   │  └─ core_upper_arm_r ─ core_forearm_r ─ core_hand_r ─ socket_hand_r
   ├─ extra_leg_l
   └─ extra_leg_r
```

`socket_hand_l/r` are non-deforming attachment bones. Their origin is the hand
grip and their bone axis points Blender `+Z`, keeping an item's glTF `+Y` axis
upright when the item root is attached with zero local rotation. Equipment GLBs
place their primary grip at `item_root`/asset origin; a two-handed item may
expose a child node named exactly `grip_secondary`.

A prop's origin is its **grip**, not its centre or its donor character's hand
position. Author it where a hand would actually close on the object: the staff's
origin sits 0.80 up its own shaft so the tip plants near the floor and its head
stays below the shoulder; the bunny's sits at its seat, centred left/right and
front/back, so a cradle holds it against the chest instead of out to one side.
A two-hand item's grips fix which hand takes which: `item_root` is the `+X`
(holder's right) grip and `grip_secondary` the `-X` one, and the runtime must
assign them by side — driving them from a hand *preference* crosses the arms.

The shared neutral rest pose is `straight_sides_v03`: shoulder, elbow, wrist,
and fingertip lie on one straight axis at a character-specific lateral
clearance. The elbow is a deformation joint on that axis, not a waypoint that
follows the garment contour. Sleeve vertices are continuously remapped around
the rewritten chain and the lower cuff extends to overlap the hand by 0.030
Blender units. Its terminal cross-section is also aligned to the hand root with
a localized falloff, preventing a lateral open seam without moving the hand or
grip socket. A
character's baked bind geometry must not encode a clasped, carrying, reaching,
torso-intersecting, or visibly bent neutral pose. Those shapes belong
exclusively to hold clips, so `none` means the same readable neutral state for
every resident while preserving character-specific body clearance.

Layerable shared clips are `idle_base`, `walk_lower`, `arm_swing_l/r`,
`run_lower`, `arm_run_l/r`, `hold_cradle_l/r`, `hold_vertical_l/r`, and
`hold_two_front`. Versioned candidates also retain `idle` and `walk` aliases
during migration. Locomotion does not own an occupied arm: the runtime combines
the lower-body clip, each available arm swing, and the equipment-selected hold.

The two gaits are a matched pair — `walk_lower` with `arm_swing_*`, `run_lower`
with `arm_run_*` — and the runtime blends between them by speed, so all four
share the 1..25 period. A run is authored as a genuinely different gait rather
than a faster walk: longer stride, arms carried folded and high, more pelvis and
torso rotation, a narrower lateral base, and a lift at the passing pose standing
in for the flight phase. Time-scaling a walk can never produce a run, because it
preserves the ratio of contact time to cycle and so has no flight phase at all.

**Every arm-layer clip must be masked to the arm it owns before it is played.**
The glTF exporter bakes all bones into every NLA strip, so `arm_swing_l` also
carries the right arm at its rest pose, and a hold clip carries the arm it is
not holding with. Three's mixer averages equal-weight actions per property, so
playing an unmasked swing alongside a hold pulls the held arm halfway back to
rest. `armTracksOnly` in `SkeletalAnimator` and its `/models` mirror do this.

Hold poses are authored for the right arm and mirrored onto the left by
negating the Y and Z euler components. In Blender the character faces `-Y`, so
a hold reaches forward with a **negative** upper-arm X rotation.
`reauthor_equipment_holds.py` solves each pose against a target hand position
expressed as a fraction of that arm's own reach, rejecting any solution whose
elbow leaves the band beside the ribs, so one authored set transfers across all
nine differently proportioned rigs.

The same sign rule governs the gait, because the arm and leg chains both point
downward and therefore share a local axis basis: **negative upper-arm X and
negative leg X both swing forward.** A walk is counterbalanced, so each
`arm_swing_*` clip must oppose the same-side leg in `walk_lower`. Authoring both
with the same sign is the mistake that shipped through every rig from v03 to
v07. `author_locomotion.py` now derives each arm by negating the same-side leg
expression, so the relationship is structural rather than a sign kept in step by
hand, and `validate_equipment_exports.py` fails the build if it ever inverts
again — it caught exactly that regression once already.

Every layer must keep the 1..25 period: the runtime locks them all to the walk
clip's normalized time rather than letting them free-run.

A lower-body clip carries more than legs. It keys `core_root` (vertical bounce
and lateral shift), `core_hips` (yaw and roll), `core_spine` (counter-twist
against the hips) and `core_head` (counter-yaw, deliberately lagged), while the
arm layers key `core_forearm_*` for elbow drag. The **vertical bounce is derived,
not authored by eye**: a rigid leg of length L planted on the ground holds the
hip at `L*cos(theta)`, so the body drops `L*(1-cos(theta))` as the legs spread.
L is measured off each rig, so this transfers across the cast unchanged.

That derivation assumes a LOCKED knee, and so overshoots what a real gait shows,
because a real knee flexes on contact and absorbs part of the drop. Each gait's
`damp` stands in for the knee this rig does not have. It matters more the longer
the stride, which is why the run is damped far harder than the walk — undamped,
its 45-degree swing drops the body by over a fifth of the leg's length and reads
as a pogo stick.

`stride` in `author_locomotion.py` and `WALK_STRIDE`/`RUN_STRIDE` in
`SkeletalAnimator` describe the same two swings and must be changed together:
cadence is solved against them.

Held item orientation is stable in actor space; a prop does not inherit an
occupied hand's rotation. `hold_vertical_l/r` projects the staff hand forward
while the staff remains upright. `hold_cradle_l/r` supports the bunny upright
against the chest. A two-hand prop is not parented to a primary hand: its grip
midpoint is placed on the actor centreline, then both arms solve toward its
fixed primary and secondary grips. This prevents a hand/prop IK feedback loop
and makes `hold_two_front` symmetrical across the cast.

Morphology-specific parts use `extra_*` bones and may carry character-only
curves. Face materials remain texture-swapped; animation events select
expressions rather than replacing that system.

## Export

Headless authoring scripts live in `assets/scripts/`. They save the editable
`.blend` and export a binary glTF beside the runtime manifest. The checked-in
GLB is the runtime artifact; the `.blend` is the human-editable source.

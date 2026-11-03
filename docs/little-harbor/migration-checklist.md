# Little Harbor implementation status

The canonical scope remains all 31 sections of `design.md`, including the full-year production gates. This checklist records implementation evidence, not a reduced definition of completion.

## Isolated boot — in progress

- Implemented a frozen bootstrap context with runtime validation, matching content/save namespaces, idempotent configuration, and rejection of conflicting reconfiguration.
- The existing game entry now selects its context before dynamically importing the game startup module. Map construction consumes that selection. Authoring tools retain their existing standalone map selection.
- Tests cover missing configuration, immutable copies, repeated imports, conflicting maps/slots/content, malformed IDs and cross-pack namespace selection.
- Validation on 25 October 2026: `npm test` passed 25 files / 341 tests; `npm run build` passed (existing large-chunk warning). Browser behavior has not yet been verified for this change.
- Pending: pack registry, Little Harbor service bundle, authored map, `/harbor` entry, neutral save codec and storage isolation, readable boot failures, and independent browser boot verification. The context alone does not isolate storage.
- 26 October: moved legacy quest, mail, calendar, time, friendship and opening construction into `GameServices`, selected by the `Game` constructor. Mail now receives its owning inventory explicitly. Selecting Little Harbor refuses the legacy bundle rather than falling back to old progression. The Little Harbor bundle itself is still pending.
- Current validation: 367 tests in 30 files pass; production build passes. `node scripts/boot-services-check.mjs` passed in isolated headless Chrome against the development server: title screen, Kindly Forward context, matching `seed-80085` map, active `kf-albert` quest, service ownership and canvas, with no page errors. This is a legacy boot regression only, not the Little Harbor gameplay gate.
- 27 October: `createHarborArrival` installs starter furnishings and day-zero shop stock. `openHarborServices` composes Little Harbor clock/calendar, commands, jobs, shops, housing and furniture against isolated storage; it rejects legacy contexts, occupied-slot replacement and map/content-version mismatches. Command drafts capture the simulation clock before mutation. Integration tests create a furnished arrival, advance time, buy/place a chair and reload the same possessions/time while preserving legacy bytes. The Game host still selects only the legacy bundle; `/harbor`, world content and UI wiring remain pending. Pure idle clock advancement is not yet autosaved.
- Idle clock saving is now implemented through `GameCommands.checkpoint` and the service bundle's `tick`/`save` methods. Autosave counts 60 unpaused seconds; checkpoints capture volatile time without adding gameplay receipts or incrementing unchanged revisions. Tests verify hidden-pause time is excluded, idle time reloads at the threshold and manual save captures intervening ticks. The browser loop must still call these methods and acquire visibility/modal pauses.
- Browser-created Harbor services now automatically bind document visibility to an owned hidden-pause lease. On resume, the first delta is discarded to prevent background catch-up. Binding replacement and disposal remove listeners/release only that lease. The event-source integration test covers repeated hidden events, an hour-sized hidden/resume delta, independent menu pause and disposal. The Game host/frame loop and actual browser acceptance journey remain pending.

## Remaining delivery stages

- One place and simulation clock (section 30 PR 2).
- Useful home and persistent furnishing (PR 3).
- Residents, schedules, conversations and overheard scene (PR 4).
- Café work, atomic settlement and purchase (PR 5).
- Invitations, memories, journal and day-three dinner (PR 6).
- Presentation, controller journey, performance and external first-time tests (PR 7).
- First season, full year, content completion and release gates as specified in section 30.

## Save transport and command ownership — foundation implemented

- `HarborSaveCodec` implements separate Little Harbor slot/active-slot keys, checked A/B generations, readback before head commit, prior-generation recovery, explicit storage errors, and exact-snapshot retries. Newer uncommitted generations cannot replace a valid head. A missing or malformed head is reported for recovery rather than guessed from generation timestamps.
- `GameCommands` owns a cloned snapshot, validates isolated command drafts, commits effects with stable receipts, preserves unsaved in-memory revisions, and retries persistence without rerunning rewards. Rejected commands leave state unchanged; duplicate receipts survive reload.
- Fourteen focused tests cover namespace isolation, failure at each write step, first-write retry, corrupt readback, missing/invalid/checksum-damaged generations, orphan rejection, revision conflicts, storage denial, duplicate settlement across reload, rollback, and snapshot ownership. Production build passes.
- Fixed continued-play recovery after an interrupted first save: the originating codec may replace its own unchanged orphan with a later revision. A new session still cannot silently adopt that orphan, and externally changed bytes block replacement. Seventeen save/service tests and the build pass. This closes a case where first-write failure followed by time advancement previously made retry impossible.
- Pending: full gameplay state schema/content-reference normalization, visible unknown-item recovery storage, safe place relocation, neutral initial state, game/controller wiring, save/recovery/export UI and the complete browser journeys. The generic codec requires a supplied state validator; envelope validation alone does not meet the section 27 gameplay acceptance gate.
- 26 October: added runtime domain data types and `HarborState` structural validation for every save section, including nested jobs, invitations, receipts, stock, housing, settings and positions. New-game initialization uses 80 coins, 20 empty pockets, the home key and no inherited legacy progress. Map, arrival, clothing and home IDs must be supplied by content. New tests exercise full-state purchase/save/reload and invalid-draft rollback; this does not prove the shop gameplay journey. Content-reference recovery and authored initial furniture/residents remain pending.

No legacy systems or assets have been retired. No new-game gameplay acceptance gate has passed yet.

## World identity and places — initial boundary

- Created `little-harbor-v1.island` by copying the current authored map under a distinct ID as section 04 directs. It remains a layout draft with legacy dressing; this is not the finished harbor neighborhood.
- Added `PlaceRegistry` for place/anchor reference validation, layout version, declared route connectivity and safe position fallback (current place marker, then home entrance/spawn). Two tests verify separate map identity and registry behavior with synthetic anchor positions.
- Pending: Harbor-specific map editing/dressing, actual place/entrance anchors, collider/standability probes, real keyboard/pad walking times, room factories and transition occupancy. Declared graph connectivity alone does not prove walkability.
- Added runtime-derived multi-actor occupancy, destination capacity leases and atomic reconstruction from semantic positions. Transition orchestration reserves destination, pauses/locks, prepares and enters the room, then records stable position after fade-in; failure calls rollback and cleanup releases locks/leases. Three focused tests cover capacity contention, cancellation, reconstruction and failed-room rollback. Existing Interior/controller adapters are not yet wired, so mesh/collider leak and browser-transition gates remain open.

## Dialogue selection — foundation

- Added typed condition evaluation, response/appointment/story/place/ordinary precedence, stable deterministic selection, one-time introductions, simulation-day cooldowns and last-three ordinary exchange history. Selection is pure; recording occurs only after response completion. Missing translation reports its key and falls back to source text or a visible key marker.
- Two tests verify introduction/ordinary repetition across serialization and day change, bounded history and translation fallback; build passes.
- Pending: complete slice writing/localization package, completion-command integration, SocialController/DialogueBox wiring, choices/cancellation, conversation history and accessible browser behavior.
- Added source-English writing and keyed rules for all four residents: one introduction, six ordinary two-line exchanges, two place comments, work/visit responses and a busy line each, plus Basil/Ada and June/Pip overheard exchanges. Three selector/content tests and the build pass. Response/busy facts require controller wiring; text has not been staged or playtested, and object-specific visit comments/help effects still need authored interaction integration.
- Added a conversation session to Harbor services: selects once, holds a dialogue pause, rejects interruption, cancels without effects and commits seen dialogue plus daily conversation credit only after completion. Disposal releases its pause. Five conversation/service tests and the build pass, including cancel/reopen introduction and completion/reload without repeating it. Proximity, NPC movement suspension, DialogueBox/choice UI and authored action effects remain pending.

## Resident schedules — semantic planner

- Added `ResidentSystem` for half-open schedule intervals, priority-ordered scene/appointment/job/calendar overrides, weather fallback anchors, home fallback and capacity allocation. Overrides have idempotent release and do not alter base schedules; plans use semantic places rather than legacy NPC identities.
- A focused test verifies June's dry/rain destination, appointment displacement, cancellation resumption and exact schedule boundary; production build passes.
- Resident construction now validates home/primary/fallback anchors, finite transforms, positive capacity, unique schedule IDs, interval bounds/overlap and relationship references. A second test verifies a scene reservation takes a contested seat, the lower-priority resident falls back, and cancellation restores routine allocation. Both tests and the build pass; full-pack validation and rendered route checks remain pending.
- Pending: authored full resident/place/anchor content, overlap/capacity content validation, persistent activity reconstruction, onscreen pathfinding/replanning, indoor occupancy and browser day-long route checks. This planner is not yet attached to rendered NPCs.
- Added the four slice resident identities and daily semantic schedules from section 09, including June's rain fallback and home outside scheduled hours. Shared existing rigs are explicit asset references rather than identity aliases. Three content/planner tests and the build pass. The content test uses synthetic anchor positions to verify intervals/references across a day; actual world anchors, movement, renderer bindings and later residents remain pending. June's rehearsal venue and Pip's evening café window are provisional authoring choices.

## Interaction focus — resolver foundation

- Added ranked modal/stand/job-fixture/resident/tool/pickup candidates, availability filtering, aim/distance/stable-ID ordering, 15% focus retention and explicit peer cycling. Ordinary interaction excludes pickup outside decoration/alternate context; modal context excludes world actions. Resolving a prompt never executes its command.
- Three tests cover priority interrupts, pickup separation, focus stability/range, cycling and unavailable targets; production build passes.
- Pending: semantic/remappable input bindings, controller candidate generation, event consumption, standing from actual seats, pad disconnect behavior and browser/controller journeys. Existing game controllers do not yet use the resolver.
- Added `ActionBindings` to live `Input`: remappable semantic actions, raw gamepad buttons, distinct X alternate/focus versus A confirm/interact, View journal, RB rotation and both triggers for run. Consuming a semantic press removes its legacy synthesized alias so it cannot also reach world handlers. Three tests include the actual Input polling path, confirmation consumption and held-action clearing on disconnect. Controllers, remapping UI/persistence, device-specific prompts and full controller journeys remain pending.
- Wired physical press consumption into the existing primary-world action and dialogue confirmation seams while retaining legacy bindings. Pause-menu cancellation now exits before activation when cancel/confirm arrive together. The 409-test regression suite and build pass; an additional focused controller test passes for simultaneous confirmation aliases and duplicate world dispatch. Full semantic controller adoption remains pending.

## Invitations — lifecycle commands

- Added accept/decline, same-occurrence rescheduling, acknowledgement at the correct place/time, completion with relationship aftermath and missed-window expiry. Accepted/active participant/place conflicts reject overlapping windows; adjacent windows remain valid. Expiry does not penalize familiarity.
- Two focused tests verify conflict/expiry behavior and decline → reschedule → active-save/reload → completion with exactly one occurrence and one aftermath credit. Production build passes.
- Pending: authored Pip invitation/two-window offer, service/clock expiry wiring, reservation and seating reconstruction, knock/journal/UI, cancellation, real-item visitor comments and browser/controller journeys.

## Relationships — command/reducer foundation

- Added simulation-day conversation/activity/gift credit, a four-point daily cap, two-point gift cap, familiarity ceiling, completed-invitation credit once per occurrence across days, and stable authored scene/memory IDs. Unknown residents cannot inherit legacy relationships.
- Three focused tests pass for repeated actions, serialized reload, next-day credit, declined invitations, occurrence deduplication and the familiarity ceiling; production build passes.
- Pending: authored resident/taste/memory content, real gift inventory transactions, dialogue/activity/invitation wiring, memory-gated privileges, scene eligibility, descriptions and resident-initiated help. The reducer is not evidence of playable friendships.

## Daily weather — saved plan implementation

- Added deterministic seed/day weather plans, initialized at arrival and refreshed inside the sleep revision. Same-day stored plans remain authoritative. Seasonal probabilities are shared with the legacy renderer without changing its existing random roll.
- Tests cover two years of reproducible plans, winter-only snow and same-day preservation after serialization; rollover/service tests and production build pass.
- Pending: applying saved plans to the renderer, deterministic wetness/snow visual baselines, indoor dryness, covered social-event fallback, plant watering and winter-door traversal verification.

## Room placement — grid validation

- Added `RoomPlacementGrid` validation for half-metre-cell footprints, quarter-turn rotation, room bounds, overlap, unique instances and four-neighbor connectivity from the entrance to required access cells. Failed previews return blocked cells without mutating live transforms; other rooms are excluded.
- Four focused tests pass, including a wall that blocks the bed route without covering its access cell, rotated footprints, room isolation and malformed placements. Production build passes.
- Pending: authored room/furniture footprint data, placement command ownership, storage transfer, visit reservations, renderer/collider integration, preview UI and playable cancellation/reload checks. The geometry validator alone does not complete furnishing.
- Added `HarborFurniture` command ownership: placing consumes inventory only after grid validation; moves preview a complete tentative room; storage preserves the instance's item and displayed objects in safe overflow. Commands require presence in an owned room and reject edits during active visits. An integration test verifies rejected preview/move leaves state unchanged, accepted movement survives reload, room-specific pickup and duplicate-safe storage. Five focused placement tests and the build pass. Renderer, authored footprint/access data, movable-bed access, planted-pot storage and UI integration remain pending.
- Added authored `housing.ts`: 6 × 5 metre starter room, entrance approach, starter bed/lamp/trunk instances and footprints for all eight furnishings. Bed interaction access now transforms with its placement and quarter-turn rotation before connectivity validation. Six focused placement tests and the production build pass. These data are not yet installed in a playable new-game entry; renderer dimensions and interaction anchors still need verification against them.

## Café job commands — domain implementation

- Added the three-order café definition and `JobSystem` acceptance, tray pickup, ordered serve/cup-return steps, full/early settlement and stable per-run receipts. Acceptance checks location/hours and one active/paid run per day. Work props are persisted in job state, independent of pockets.
- Tests exercise all three orders with full pockets, wrong tray/seat rejection, held-tray save state, zero early pay before serving, 20 coins after the first serve, 60 on completion, failed save and duplicate settlement after reload.
- Pending: offer presentation, actor/anchor reservations, proximity checks and equipment in `JobController`, unpaid practice, day-rollover early settlement, assistance-shift exchange, delivery/repair work, and real controller/browser journeys. The command layer is not a playable café yet.
- Day-rollover early settlement is now composed in `HarborDayRollover`, using the same reducer as explicit finish. Work settlement runs before date advancement, followed by stock refresh and contribution assessment in the same sleep revision. A failed later domain hook rolls everything back. A storage failure retains the complete morning; a repeated explicit settlement returns the existing run receipt without another wage. An integration test covers day-six work through day-seven contribution/stock and retry. Remaining daily-domain hooks are still supplied by callers; no browser sleep flow is installed.

## Housing contributions — domain implementation

- Centralized starting coins, job wages, weekly contribution and optional home prices in `economy.ts`. `HousingSystem` assesses the first 90-coin contribution at day 7, keeps at most one outstanding obligation, never automatically charges the wallet, and commits explicit payments with durable receipts.
- Tests cover the free first week, several unpaid weeks without compounding or loss of home access, reassessment boundaries, payment during storage failure, retry/reload without double charging, and the 110 coins remaining after starting funds plus two café wages minus one contribution. Wages in this test are arithmetic setup, not proof of job completion.
- Pending: real rollover wiring, contribution UI, assistance-job settlement, home moves, room furnishing/access and browser journeys. No claim of completed housing gameplay.

## Inventory and shop commands — implemented, presentation pending

- Added pure `planInventoryDelta` for atomic multi-item removal/addition and currency planning. The live legacy `Inventory.add` now uses it, fixing partial additions on full pockets and emitting success only after commit.
- Added a separate Little Harbor catalog (eight furnishings, bread and basic clothing), shop definitions, seeded daily rotation, persistent sold counts, pinned essentials, atomic purchases to pockets/home storage, and 25% resale. Commands use the full Harbor state and durable receipts; no global legacy item enumeration is used.
- Tests cover capacity failure after partially filling a stack, repeated ingredient rows, invalid counts/content/balance, live inventory notifications, deterministic stock, same-day sold-count preservation, duplicate purchases across reload, resale loss and home storage when pockets are full.
- Additional catalog tuning not specified in the design: bed 120, trunk 70, planter 25, basic coat 40 coins. These are provisional values for playtesting. Model bindings and authored availability still need presentation/content work.
- Pending: real shop UI/location/opening-hours integration, stock rollover wiring, furniture renderer bindings, visible recovery storage and controller purchase journeys. These domain tests do not prove playable shopping.

## Simulation clock and sleep — foundation implemented

- `SimClock` owns fractional simulation minutes, arrival at 15:00, nested pause leases, 0.5×/1× speed, same-day appointment waits, ordered crossed-hour boundaries and the 23:00 hold. It provides the existing hour/phase/night/text/daylight views without reading wall time. `HarborCalendar` derives the 56-day year directly from it.
- `DayRollover.sleepUntilMorning` commits a stable per-day receipt and all daily effects in one command revision. Domain hooks run in order: offers, stock, plants, rent, weather, appointments, residents. A failed domain hook rolls back; a failed storage write leaves the complete morning playable in memory. Duplicate confirmations do not rewind time or repeat daily effects.
- Ten focused clock/rollover tests pass, including nested pauses at 22:59, a simulated hour while hidden, crossed appointment hours, anniversary rollover, save failure/retry, duplicate sleep across reload and rollback partway through daily effects.
- Pending: selecting this clock in the Little Harbor service bundle, game-loop/modal/visibility wiring, real daily-effect implementations, safe home placement, sleep confirmation/retry UI and browser background-tab acceptance. Unit pause tests do not prove browser integration.

## Starter-room shell — engine factory

- Added an empty authored interior factory and the 6 × 5 metre starter-room shell. South-wall segments, trim, doorway light and exit detection follow the authored offset entrance. Corner-origin placement coordinates convert to the engine's centered room coordinates; spawn stays clear of the exit trigger.
- All 424 tests across 53 files pass, and the production build passes (existing chunk-size warning). Chrome smoke verification constructs the real shell with 35 children, checks dimensions/door/spawn, and confirms the existing Kindly Forward title still boots without page errors.
- Pending: saved furnishing meshes and colliders, interaction anchors, visual layout review, transition/controller integration and the playable `/harbor` entry. Browser construction is not a visual or gameplay acceptance check.

## Saved furnishing presentation — room-owned renderer

- Added `HarborRoomFurniture`: explicit mappings reuse seven existing primitive furniture models, plus a simple bed model. Saved corner-origin positions and quarter rotations produce meshes fitted within the authored footprint. Room-local rectangular colliders use the same footprint; replacement/disposal removes old collision registrations and disposes owned geometry/materials. Failed model preparation preserves the existing room.
- Focused tests verify all eight models in all four rotations, repeated replacement without duplicate children, removal of collision, and failure preserving current meshes. Type checking and production build pass.
- Pending: controller installation and sync after commands, visual review of reused/scaled models, lamp toggling/light presentation, furniture action descriptors, displayed objects, plants, sitting and sleep flows. This renderer does not yet make the home playable.

## Home presentation owner — command bridge

- Added `HarborHomeController` to build the saved room finishes and furnishings, own scene attachment/resource cleanup, and bridge cancellable moves/storage to canonical furniture commands. Decoration holds its own clock pause; invalid confirmation stays in decoration; successful in-memory commits refresh meshes even if storage fails. Exit releases the decoration pause and room resources.
- Integration test covers cancel, invalid preview/confirmation, storage failure with visible committed movement, nested menu pause, idempotent entry/exit and twenty attach/detach cycles using a test shell. Type checking and production build pass.
- Pending: live transition/input installation, placement ghost/highlight UI, real shell GPU/memory profiling, purchase-to-placement UI and furniture interactions. The test shell cycles do not prove the design's browser performance gate.

## Decoration preview — presentation bridge

- Home move sessions now show a translucent model with a full-footprint outline, colored by the placement validator result. Preview geometry is separate from committed meshes/colliders. Cancel, confirmation and room exit dispose the ghost. Shared transform construction keeps rotated preview and committed models aligned.
- Focused controller/renderer tests and production build pass. Tests additionally check valid/invalid preview state, unchanged committed position during preview, and ghost cleanup on cancel/confirm.
- Pending: live input routing, non-color status text/blocked-cell indicators, visual review and browser decoration journeys. No claim of completed placement UX.

## Decoration input — modal routing API

- `HarborHomeController.handleInput` consumes semantic confirm/cancel/rotate and half-metre direction presses, drains other modal-inappropriate actions, and owns the closing frame. Cancel wins over simultaneous confirm. Exposes readable validation status and the last command result so the host can show save failure/retry feedback.
- Four focused action/controller tests pass, including direction+confirm, simultaneous cancel+confirm without a command, and no leaked interact press. Production build passes.
- Pending: calling this API from the Harbor game loop, onscreen status/control labels, hold-repeat tuning, gamepad browser journey and the full playable entry. This API is not yet live input integration.

## Harbor development entry — first live home loop

- `/harbor` now explicitly opens a home development preview, selecting the isolated Harbor context before dynamic game imports. It reuses Player, CameraRig, RetroPipeline, room rendering and HarborHomeController; it does not construct the legacy Game or its progression services. Narrowed Player's map dependency to its actual collision interface.
- Preview storage is in-memory and labeled as session-only. Furniture selection, movement, rotation, confirmation and cancellation now run through the real browser loop, with readable placement status. This is a development harness, not the authored arrival/title/save-slot flow.
- Production build and Chrome keyboard move check pass: move lamp right, confirm, canonical position changes by 0.5 metres and ghost disappears without page errors. Captured and inspected the room; adjusted the preview layout to give controls a separate column rather than covering furnishings.
- Pending: final Harbor entry and persistent slots, authored town and arrival, resident/interaction integration, gamepad selection, responsive/accessibility polish, room visual refinement and complete gameplay journeys. Existing room preview retains the provisional player appearance and is not visual acceptance of final art.

## Home proximity selection — live resolver integration

- The home exposes decoration candidates using distance to each rotated footprint, availability from the command validator, stable instance identity and the shared InteractionResolver. The browser loop shows the current nearby move prompt and invokes it only through alternate F / pad X; ordinary interaction is not used to pick furniture up.
- Chrome regression now verifies both button-selected keyboard movement and nearby selection/movement/confirmation through a simulated standard gamepad using the real navigator polling path. Focused controller/resolver tests and production build pass.
- Pending: physical gamepad testing, ordinary furniture-use actions, broader world candidate integration and the final playable Harbor flow. Simulated gamepad success does not establish hardware usability or final controller acceptance.

## Lamp use — ordinary interaction and saved light state

- Added shared furniture-use descriptors and a receipted lamp toggle command. Instance-specific light state is saved in facts; storing the lamp clears the obsolete instance fact. Presence and home ownership are checked by the command. Ordinary-use candidates remain separate from alternate decoration candidates.
- Room rendering now applies saved bulb emission and point-light presence. The live home loop invokes lamp use with E / pad A while F / pad X selects decoration.
- Focused tests cover toggle/reload and duplicate receipt protection. Production build and Chrome regression pass; simulated gamepad A changes the saved lamp state and removes its point light without entering decoration.
- Pending: other furniture uses (sleep, sit, storage UI, display, crafting, planting), complete persistence UI and final Harbor runtime. Preview saves remain in-memory; the reload assertion uses the service storage integration test.

## Trunk storage — live ownership loop

- Trunk ordinary use opens a modal home-storage view with keyboard/gamepad navigation. Placed furnishings can be stored and owned stored furnishings can start a cancellable placement session. Inventory is consumed only by a valid confirmation; cancel preserves storage. The menu owns a separate clock pause and blocks world movement through its closing frame.
- Home controller test covers store, cancel replacement, then successful replacement with one inventory transfer. Chrome verifies trunk opening, storing the lamp, cancelling its placement via pad B, reopening storage, and confirming replacement via pad A. Build passes.
- Pending: styling/accessibility review, pockets-to-placement UI, robust feedback for persistence failure, furniture-use completion and final persistent Harbor runtime. Browser storage checks remain inside the isolated preview session.

## Bed sleep — confirmed live rollover

- Bed ordinary interaction opens a sleep confirmation with keyboard/gamepad confirm, cancel and choice navigation. The service checks for a bed in the player's owned current home, then uses the existing atomic rollover. UI modal pause and closing-frame input ownership prevent accidental repeat interactions. Successful morning returns the preview player to the room spawn; unsaved state is surfaced in the status line.
- The home preview supplies visit expiry and explicitly rejects populated plant/resident state because those daily owners are not installed. Offers are derived from job definitions and current day rather than cached rows. Full runtime callers must supply all remaining domain hooks.
- Chrome verifies bed interaction, cancel retaining day zero, and confirmation advancing to day one. Service tests cover required-hook rollback and missing bed rejection. Focused rollover/home tests and build pass.
- Pending: plant/resident daily implementations, persistent player-position synchronization, morning scene/lighting/sound and save-retry UI. This is a working preview sleep path, not complete release rollover acceptance.

## Player position — save/command capture

- Harbor services now accept validated same-place movement samples and capture them alongside the clock at command/checkpoint boundaries, without movement receipts. Transition-time samples and implicit place changes are rejected. A sample is tied to its canonical base position so it cannot overwrite a later teleport/transition command.
- The live home loop converts renderer world coordinates into authored room-local coordinates. Sleep can commit a caller-supplied safe wake marker in the same morning revision; the preview supplies its room spawn before moving the rendered player there.
- Seven service tests pass, covering save/reload, capture during lamp use, cloned inputs, no movement receipts, stale sample rejection after teleport, transition lock, and atomic morning position. Production build passes.
- Pending: final place-registry standability validation/recovery, transition host installation and persistent title/reload UI. The movement API validates identity/numbers; collision and safe marker selection remain host responsibilities.

## Harbor character scale and foreground visibility

- Measured the visible shared player rig in Chrome: approximately 2.48 m tall and 1.24 m wide at the legacy scale. Harbor's presentation adapter now applies 0.68 scale, producing approximately 1.69 m height and 0.84 m width for the metre-based room. Legacy Game construction is unchanged.
- Installed the existing SubjectProtection in the Harbor preview loop. Visual inspection confirms the foreground doorway fades so the player remains visible at the wake marker. Shared player locomotion and collision remain in use.
- Chrome home regression passes with a measured-height assertion, covering move, storage, lamp and sleep interactions after the scale change. The updated screenshot was inspected.
- Pending: ordinary Harbor clothing/identity, final model and animation review, clearance/usability testing throughout the authored town and camera framing polish. The provisional postal outfit is not final Harbor art.

## Save durability feedback — visible retry

- Added a nonmodal save-status component with a polite live region and Retry save button. It reports pending writes and repeated failure, then clears the retry control when durability recovers. Retry calls `commands.retrySave()` on the already committed snapshot, never replays a gameplay command. The development entry labels successful writes as session-only snapshots.
- Chrome regression injects a failure into preview-only storage, commits a lamp change, retries while still failing, restores storage, then verifies successful retry retains the exact revision. Existing home interactions and production build pass.
- Pending: gamepad access to retry in the final pause/save menu, persistent title/slot flow, quit-with-pending-save handling and broader failed-save journeys. Preview storage remains isolated in memory.

## Pause menu — controller save access

- Added a live pause menu with Resume, Save and Retry pending save. Escape / pad B opens it after more specific modals have had first refusal; its owned pause freezes simulation while rendering continues. Direction and semantic confirm/cancel support keyboard and gamepad navigation, with opening/closing frames consumed.
- Chrome regression verifies pad B open, D-pad navigation, pad A save, unchanged simulation minute throughout the open menu, and pad B resume without decoration. The menu also exposes retry through controller navigation. Production build passes.
- Pending: final persistent title/quit flow, settings/accessibility controls, menu styling and hardware gamepad acceptance. Preview menu explicitly describes session-only snapshots.

## Clock-speed accessibility — saved live setting

- Pause menu now exposes the design's 1× / 0.5× clock-speed selection. A receipted settings command updates saved state and the live SimClock, including successful in-memory changes when durability fails. Replaying an old settings receipt retains the latest canonical selection.
- Eight service tests pass, including half-rate advancement, reload, duplicate old selection and paused changes. Chrome verifies D-pad/A menu selection updates the live clock and label without advancing the paused minute. Production build passes.
- Pending: other accessibility/audio settings, final settings layout and persistent title/slot entry. Preview persistence remains session-only.

## Text sizing and narrow preview layout

- Added saved text-scale commands (100–150%) and pause-menu cycling through 100%, 125% and 150%. The UI applies the committed setting immediately; command validation rejects nonfinite/out-of-range values.
- Replaced the fixed overlay layout with a two-column desktop grid and stacked narrow-screen scene/control regions. Controls and dialogs scroll within the viewport, focus outlines are visible, and renderer/camera sizing follows container changes. Camera distance adapts to narrow aspect ratios.
- Nine service tests and production build pass. Chrome checks the live 150% label and 24px button font, validates no horizontal document overflow at 390×844, and reruns home interactions. Narrow layout screenshot inspected; this is not a full accessibility audit.
- Pending: complete settings (audio, reduced motion, instant dialogue, rebinding), screen-reader/gamepad usability review and final production UI.

## Starter-home semantic place definition

- Added pack-owned `places.ts` metadata for starter-room access/capacity, required outdoor bakery-stairs entrance, room factory, stable safe-spawn and exit markers. Interior factory, preview initial state and sleep wake position now consume one authored spawn definition. Spawn is centered in the grid's reserved entrance-approach cell.
- Registry tests prove the required outdoor anchor cannot be omitted, declared disconnected entrance detection works, returned spawn values are independent copies, and the marker is outside the exit trigger. Focused tests and production build pass.
- Pending: surveying/authoring outdoor anchors against the actual map, all other place definitions, route/collision probes and live transitions. Tests use explicitly synthetic outdoor fixture coordinates; those are not authored town positions.

## Home restore — collision-checked position recovery

- Added a read-only `Interior.canStand` probe matching the engine's current wall/circle/rectangle margins. Home restoration converts authored local saves to world coordinates, accepts standable positions outside the exit trigger, or commits the authored safe marker as a recovery command. A blocked recovery marker fails explicitly without changing the save. Other-place entry remains the transition host's responsibility.
- The live preview initializes the player through this restoration path. Tests cover collision probes, valid restore, out-of-bounds recovery, idempotent subsequent restore, and blocked-marker failure retaining the invalid position for diagnosis. Focused tests and production build pass.
- Pending: place-registry recovery across removed places/layout-version changes, final persistent reload UI, and broad collider/path acceptance on the authored town. The new probe reflects current movement margins; it does not establish full human traversal clearance.

## Preview save/reload — isolated tab snapshots

- Development entry now stores snapshots in sessionStorage under `little-harbor-preview-v1:` wrapping the canonical codec keys. It loads existing snapshots on page reload and creates an arrival only for an empty preview slot. A strict adapter rejects unrelated keys and cannot read or overwrite production Harbor/Kindly Forward slots. UI labels explain tab-only persistence.
- Added Player standing-transform restoration to reset velocity and facing together; home startup and wake use it to avoid post-load drift or yaw easing toward an old heading.
- Adapter test confirms namespace isolation. Chrome now completes home interactions, saves, reloads the page, and compares furniture, settings, day, canonical position and rendered position/yaw. Production build passes.
- Pending: final persistent multi-slot title flow, save migration/recovery presentation, authored arrival, quit handling and full gameplay journey. Tab preview snapshots are not production saves and do not complete the release persistence requirement.

## Home time-of-day presentation

- Installed the shared DayNight system in the home loop, driven by SimClock hour/daylight/season. Room window and doorway daylight tint with the simulated day, and floor daylight spill fades to zero at night. Reading-lamp state remains independent. Added a late-night reminder while the clock holds at 23:00.
- Chrome verifies morning/night sky changes and zero nighttime daylight spill after the full home save/reload journey. Night screenshot inspected; focused home/interior tests and production build pass.
- Pending: weather-dependent indoor lighting, audio/ambience, final night readability review and outdoor lighting integration. Legacy interiors retain their previous behavior unless their host explicitly calls setDaylight.

## Reduced-motion preference — camera and foreground presentation

- Added a saved reduced-motion command and pause-menu toggle. The host applies it to shared CameraRig/SubjectProtection: idle tilt, shake and look-ahead are suppressed; scripted camera travel resolves immediately; foreground restoration is immediate while visibility protection remains active. Defaults preserve legacy behavior.
- Seven camera tests pass, including reduced-motion idle/shake/scripted travel behavior. Chrome toggles the setting, reloads and confirms saved settings persist through the full home journey. Production build passes.
- Pending: audit other motion sources (cutscenes, weather, shaders and UI), final controller settings navigation and accessibility usability review. This covers the connected home camera/foreground systems, not every release motion effect.

## Configured map identity — reject silent substitution

- Outdoor-map inspection found that mapConstants used templateOrDefault even with an explicit frozen bootstrap context. Added strict template lookup for configured game sessions, so a missing selected map fails before world construction instead of substituting the legacy default. Unconfigured authoring tools retain fallback behavior.
- Five bootstrap tests pass, including rejected missing-map world import and actual Harbor template/layout resolution. Production build and Chrome Kindly Forward title/room-factory regression pass.
- Outdoor authoring remains pending: the draft island still copies legacy geography/content, and the topology diagram is not surveyed coordinates. No outdoor anchors or short-loop route acceptance are claimed by this fix.

## Draft outdoor anchor survey — terrain route baseline

- Added a repeatable browser terrain survey for the explicitly selected Harbor map. Measured dock at (-35,63), elevation ~0.412 m, and the legacy commercial landmark at (-35,21), elevation 2.2 m. Authored draft dock/bakery-front/bakery-stairs/café-door coordinates in `mapDraft.ts`, with stable IDs and declared loop links; these are not generated placements.
- Terrain test connects each link on a half-metre grid while sampling 0.9 m radial clearance and limiting height discontinuities. The shortest terrain loop's distance divided by current 3.9 m/s walking speed falls within the 20–35 second target. Terrain test and production build pass.
- Pending: final building locations/meshes/signage, actual TownMap collider probes, physical route walkthroughs, dock sightline screenshot, other outdoor anchors and transition installation. Terrain samples and a speed estimate do not satisfy actual-collider or controller acceptance. Coordinates remain explicitly draft until those gates pass.

## Draft outdoor collider survey — connected route evidence

- Extended the browser survey to instantiate the current TownMap with its actual fixture definitions and query placement clearance. All four draft anchor points clear both 0.45 m player and 0.9 m passing-radius probes.
- Added bounded half-metre route search with actual `TownMap.collide` movement validation and radial terrain clearance. Current routes: dock→bakery 64 m; bakery→stairs 5 m; bakery→café 20 m; café→dock 47 m. Main loop totals 131 m, approximately 33.6 seconds at 3.9 m/s before acceleration/turning.
- Browser probe passes. This exposes limited route-length headroom and confirms fixtures are still legacy post-office/bench/lantern types.
- Pending: replacing legacy content with authored Harbor buildings and rerunning collision probes, physical keyboard/gamepad walking, turning/acceleration timing, dock sightline and final accessibility clearance. This scripted path search is stronger than terrain-only sampling but does not substitute for the required playable route acceptance.

## World-content injection — prevent legacy fixture inheritance

- TownMap now receives WorldContent (plots, object resolver, strict fixture policy). Town/fixture builders use that instance rather than global legacy tables. A Harbor bootstrap without supplied content throws before world construction; legacy/tool callers retain their existing defaults. Strict content rejects missing object definitions or model mappings.
- The draft collider survey opts explicitly into legacy content for its audit; this is no longer an implicit Harbor runtime behavior. Harbor's actual outdoor object library remains to be authored.
- All 440 tests across 59 files, production build and Chrome Kindly Forward boot pass. The terrain graph-search test needed a scoped 15-second allowance under parallel-suite load; its clearance/connectivity assertions remain unchanged.
- Pending: Harbor object definitions and buildings, fixture-level visual/collision review, scene aperture/clearance resolver injection, and outdoor runtime/transition installation. No claim of complete content-pack isolation beyond the changed builders.

## Fixture aperture and clearance content seam

- `islandApertures` and `islandKeepClear` now accept explicit WorldContent and reject implicit legacy fallback under a Harbor bootstrap. Object aperture axes retain instance rotation, and authored aperture marks retain their existing path. Opening-stage construction exposes the content argument for its aperture query.
- Regression coverage verifies custom clearance radii and rotated axes on the draft island, an empty resolver without legacy inheritance, and both missing-content errors under Harbor. All 442 tests across 59 files and the production build pass; the existing bundle-size warning remains.
- Pending: Harbor object library and outdoor host, plus migration of the legacy opening's other set/role lookups. The unused legacy `setKeepClear` wrapper still has its historical catalog and catch behavior; these changes do not make the full opening system content-independent.

## Authored café room — stations, seating and collision

- Added `cafeRoom.ts`: a 10 × 8 m corner-origin room, public place definition with 08:00–19:00 hours, safe/exit markers, counter and tray/cup-return work anchors, three job customer seats, June's staff position, rain window seat and independent Pip seat.
- Added `HarborCafe.ts`: shared room shell with teal service counters, pickup/return trays, cups, three tables and five chairs. Furnishings own matching rectangular colliders; duplicate furnishing is rejected. The factory places spawn clear of the door zone and exposes three interaction hotspots for the future controller.
- Collision-backed grid search reaches every work/door marker and a service approach within 0.8 m of every chair. Job references resolve to authored café anchors. This is reachability evidence, not a proof of two-actor passing clearance or controller usability.
- `scripts/harbor-cafe-check.mjs` constructs and renders the actual factory in Chrome, verifies spawn/hotspots, and saves `/tmp/harbor-cafe.png`. Render inspected. All 444 tests across 60 files and production build pass; existing bundle-size warning remains.
- Pending: place-transition/runtime installation, station command dispatch, patrons and seat reservations, tray carrying/serving, final art and in-game camera/keyboard/controller acceptance. The café factory is not yet reachable from `/harbor`; its current furniture is simple authored geometry, not a finished environment art package.

## Playable café station preview

- Added `HarborCafeController`, deriving current order, held prop and current customer reservation from canonical job state. It supplies proximity-gated counter/pickup/serve/return/settlement prompts, rechecks place and pause ownership, and rejects stale run/step callbacks. Reload reconstructs progress without a second controller-owned job state. Ambient seats remain unreserved.
- `/harbor?room=cafe` now boots the authored café with Player, camera, collision, semantic keyboard/gamepad inputs, pause/settings, simulation lighting, save feedback and isolated café tab storage. The existing home preview storage remains separate. Invalid saved café positions recover to its safe marker.
- Unit coverage completes the shift across held-tray reload, exercises stale/remote/paused/wrong-place actions, early finish, and continuation after acceptance hours. All 447 tests across 61 files and production build pass.
- `scripts/harbor-cafe-play-check.mjs` runs keyboard interactions at collider-checked station approaches, reloads mid-order and after settlement, verifies six steps, exactly 60 coins earned, released reservation/prop, isolated keys and no page errors. Screenshot `/tmp/harbor-cafe-play.png` inspected. The script teleports between approaches; it does not prove physical route walking or hardware controller usability.
- Pending: customer/June presentation, carrying/serving animation, order dialogue, live scheduler reservation attachment, closing behavior and real town transitions. Current serving prompts target named seats without rendered patrons. This is a playable station-flow preview, not a finished café job experience or the required purchase/place integration journey.

## Café held-prop presentation

- Added `HarborCafeCarry`: reconstructs tray/cup geometry from the canonical heldPropId, attaches through EquipmentController, uses existing two-hand carrying and one-hand cradle layers, and releases both hand layers and owned geometry/materials when props change or the presentation is disposed. Unknown prop IDs are rejected before replacing the current prop.
- Café preview installs the presentation after reload and updates it after station actions and player animation. The browser journey now checks visible held tray after reload, visible used cup after serving, and no prop after settlement; `/tmp/harbor-cafe-carry.png` and `/tmp/harbor-cafe-cup.png` inspected.
- All 448 tests across 62 files and production build pass. Legacy resident equipment types remain restricted to their asset-backed IDs; café equipment is runtime-built. Existing bundle-size warning remains.
- Inspected the four provisional resident rigs in Chrome: idle/walk and hand-hold layers exist, but seated performance clips do not. Seated customers, June presentation, scheduler integration and serving gestures remain pending. The current tray/cup models and carry pose are provisional, and the browser journey still teleports between collision-checked approaches.

## Café order dialogue ownership

- Authored June's three order instructions beside the café job definition. Pickup now opens `HarborCafeOrderMenu`, with Take the tray / Not yet, semantic confirmation/cancel, directional focus and dialogue pause. The closing frame remains owned by the dialog; confirmation releases its pause before invoking the controller's existing proximity/run guard.
- Browser journey cancels the first order without acquiring a prop or leaving a pause behind, reopens it, verifies simulation minutes remain unchanged during dialogue, confirms each order, and completes reload/payment assertions. The full 448-test suite and production build pass; TypeScript checked again after moving lines into content.
- Pending: resident models/poses and dialogue speaker presentation, serving animation, full scheduler reservation attachment, town access, purchase/home integration and hardware controller acceptance. The player still serves named table targets without visible patrons.

## June at the café counter

- Added `HarborCafeStaff` using June's pack-selected provisional rig and existing idle animator. The model is normalized to 1.7 m, installed at the semantic staff anchor, given removable collision and a stable `june` identity, and frozen while simulation is paused. Disposal removes the actor/collider while retaining asset-cache geometry and materials.
- Corrected the staff anchor facing toward customers after inspecting the first render. Café preview loads the resident-defined asset instead of treating its legacy model name as the character identity.
- Production build, subsequent TypeScript check, five focused café tests, and the complete Chrome shift/reload/payment journey pass. The browser check also verifies June's identity, room attachment and orientation. Updated screenshot inspected.
- Pending: scheduler-driven presence, dialogue gestures, customer seating/poses and serving animation. June is deliberately stationed in this isolated preview; this does not implement her daily schedule or prove the town's resident runtime.

## Explicit early-finish choice

- Counter interactions during an active café shift now show an early-finish dialogue with the actual 0/20-coin amount, loss of the remaining shift, return of work props, and next-day availability. Continue working is focused by default. Choosing Finish early releases dialogue pause before executing the existing guarded settlement command.
- The normal order dialogue resets its heading/buttons/focus when reopened after this choice. Browser coverage opens the early-finish choice, confirms the default, verifies the job remains active, and then completes all normal order/reload/payment checks. Production build passes.
- This addresses counter abandonment only. The design's continue-later/finish-early choice when leaving still depends on real place transitions, which are not installed in the isolated café preview.

## Café order journal

- Added a read-only café journal on J / View, derived from canonical job progress. It retains June's instructions after tray pickup/reload, distinguishes current/upcoming/return-cup/completed/ended-early orders, and shows the actual settlement amount.
- Journal owns menu pause and its closing input frame; semantic confirm/cancel/journal closes it, with D-pad scrolling for long content. It does not write a second copy of job state.
- Three controller tests, production build, and Chrome full-shift journey pass. Browser coverage reloads with a tray, opens the journal, verifies Ada's request/current status and frozen simulation time, closes it, and finishes all orders and payout.
- Pending: the full town journal, conversation log, hardware pad/mobile layout acceptance, and the remaining resident/transition/integration work. This is the café job portion of the journal only.

## Atomic place-transition rules

- Added `HarborPlaceTransitions` through HarborServices. Entry resolves registered entrance/safe markers and validates source proximity, hours, home/invitation access, occupant capacity and prepared-destination collision. Exit remains available after closing. Direct room-to-room jumps are rejected.
- Leaving a place with its active job requires an explicit continue-later/finish-early choice. Early settlement and saved-position change occur in one command; blocked destinations leave both unchanged, and replaying the command does not pay again. Continuing preserves job progress for return later that day.
- Four focused tests cover entry/reentry, remote doors, closed entry/open exit, private access, invitations, capacity, blocked-destination rollback, continued jobs and atomic early pay. Production build and subsequent TypeScript check pass.
- Pending: the host must prepare destinations, own transition pause/fades, install scene/player/camera state, release old room resources and supply real capacity/invitation owners. These domain rules are not yet installed in the isolated room previews; playable town/home/café transitions remain unfinished.

## Place host lifecycle and recovery

- Added `HarborPlaceHost` with asynchronous destination preparation, transition pause ownership, overlap rejection, collision-backed travel commit, installation, and old-place disposal. Receipt replay does not reinstall a previously visited destination.
- Preparation/validation failure disposes temporary resources without changing the save. Failure after commit retains destination resources and pause for an idempotent installation retry; simulation cannot resume with saved/rendered places diverged. Late preparation after disposal is cleaned up without installation.
- Four focused lifecycle tests pass, covering overlap, receipts, blocked/failed preparation, post-commit retry without another revision, late disposal and preservation of another pause owner. Production build and subsequent TypeScript check pass.
- Pending: concrete town/home/café adapters with idempotent scene/player/camera installation, visual transition fades, recovery UI, and browser integration. This host is not yet wired into either isolated preview; it establishes lifecycle behavior, not completed playable transitions.

## Concrete interior-place adapter

- Added `HarborInteriorPlace`, implementing prepared-place installation for real Interior instances: validates corner-origin saved coordinates, probes room collision, attaches the room, sets player interior collision, restores transform and snaps the camera. Repeated installation uses the same scene object.
- Disposal releases child owners first (June removes her cached model), then deduplicates disposal of shell-owned geometries/materials while retaining shared textures. Disposing the previous room does not clear a newly installed room's player collision.
- Café preview now uses this adapter for initial load/reload. Two focused tests, production build and full Chrome café shift/journal/reload/payment journey pass. The numeric position assertion uses a tolerance for floating-point conversion.
- Pending: actual town adapter, shared room-host composition, home adapter lifecycle integration, fades/recovery controls and real doorway travel. The café uses the concrete installation path, but remains an isolated preview with no town exit.

## Furnished home preparation and installation

- HarborHomeController can prepare saved finishes/furniture off-scene and return a HarborInteriorPlace. Installation uses the shared position/collision/camera path; disposal cancels decoration, releases furnishing resources, clears controller state and lets the adapter release the room shell. Legacy direct enter/exit remains available for existing callers.
- Home preview now uses the prepared-place adapter on initial load and reload. Repeated lifecycle coverage verifies no scene attachment before installation, saved furniture restored, idempotent preparation/disposal, decoration cancellation and preservation of an independent menu pause.
- Focused tests, production build and subsequent TypeScript check pass. Full suite rerun passes. Chrome home journey passes furniture movement/storage, sleep/settings, saved transform restoration and lighting checks.
- Pending: outdoor adapter and shared runtime composition. Home and café now use compatible interior preparation/installation, but their preview sessions are still isolated and no real outdoor door links are installed.

## Outdoor place adapter

- Added `HarborTownPlace`: validates finite town coordinates, placement clearance and movement collision, restores actual terrain height, assigns outdoor collision to Player, clears interior mode and snaps the camera. Disposal removes its scene attachment while retaining world-owned terrain/assets for later visits.
- Player now exposes explicit outdoor collision assignment so place installation does not rely on the constructor's previous world reference.
- Two focused tests and production build pass. Chrome draft survey installs the adapter at dock.arrival, bakery.front, bakery.stairs and cafe.door, confirms standability/terrain heights and clean detachment, and reruns actual collider route searches successfully.
- Pending: shared runtime composition, door interaction/fades/recovery UI and replacement of copied legacy buildings. The survey explicitly uses LEGACY_WORLD_CONTENT and does not establish finished Harbor outdoor content or playable town-to-room travel.

## Shared town/home/café runtime composition

- Added `HarborWorldRuntime`, composing retained town terrain, saved furnished home and authored café through one PlaceHost, Player, CameraRig, scene and HarborServices instance. It converts active-place coordinates for movement capture before travel and exposes the active room/camera target for a rendering loop.
- Added an early same-place rejection in PlaceHost so an unnecessary destination preparation cannot replace an already active room's controller reference. Receipt replay still takes precedence and remains idempotent.
- `scripts/harbor-world-travel-check.mjs` uses real TownMap, Player, CameraRig and room factories in Chrome. Thirteen travels across three repeated home/café cycles preserve exactly one place group, matching canonical place/collision mode, saved furnishings and no leaked pause. Reloading the final home save restores the home and disposal leaves no place groups.
- Eight focused transition/host tests and production build pass. The browser harness explicitly uses the copied draft's legacy fixture definitions and teleports to door approaches; this is scene/state lifecycle integration, not a rendered walking or final-map acceptance test.
- Pending: installing this composition in a user-facing shared entry, door prompts/fades/recovery UI, room-specific controllers/resident presentation, capacity/invitation owners and authored Harbor outdoor content. Existing isolated previews remain unchanged.

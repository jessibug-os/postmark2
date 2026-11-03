# Little Harbor design handoff

- `design.md`: canonical design and migration specification (31 focused sections).
- `contracts.ts`: proposed shared types and concrete authoring examples; not imported by runtime.
- `source-audit.json`: hashes, line counts, and exported declaration locations for inspected existing files.
- `image-prompts.md`: exact generation prompts and screenshot provenance.
- `concept-outline.html`: prior concept outline retained for reference, not the current specification.

The browsable document is served at `/direction`. All imagery is stored in `public/direction-media/` and included in the downloadable `LittleHarbor-Design.zip`. The ZIP contains portable Markdown, contracts, provenance, source audit, and images/diagrams.

Regenerate the page, diagrams, source audit and ZIP:

```sh
python3 scripts/build-direction.py
```

Validate the proposed types (TypeScript 7 in this repository):

```sh
./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck docs/little-harbor/contracts.ts
```

Then run `npm run build`. This validates the documentation page's TypeScript and production entry; it does not validate the unimplemented Little Harbor gameplay. `npm run dev` serves the review page locally. No runtime/gameplay files were changed by writing this design document.

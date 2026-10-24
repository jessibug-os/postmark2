import { describe, expect, it } from 'vitest';
import {
  formatScene, parseScene, validateAgainstSets,
} from '../src/cutscene/scene/SceneFormat';
import { authoredSets } from '../src/cutscene/set/SetLibrary';
import { isPerformance, roleOf } from '../src/characters/clipVocabulary';
import { fixtureMarkIds } from '../src/world/island/PieceLibrary';

/**
 * Every authored `.scene` on disk must parse, cross-reference and be canonical.
 *
 * This is the gate that keeps a hand-edit from reaching the runtime broken.
 * The editor already round-trips on save, so a file that is not canonical here
 * was edited by hand and should be normalised before it is committed.
 */
// Loaded through Vite's raw glob rather than node:fs: the app tsconfig carries
// no node types, and this keeps the gate running in the same module graph the
// runtime uses.
const sources = import.meta.glob('../src/cutscene/scenes/*.scene', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const files = Object.keys(sources).sort();

describe('authored scenes', () => {
  it('there is at least one', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const text = sources[file];

      it('parses and cross-references', () => {
        expect(() => parseScene(text, file)).not.toThrow();
      });

      it('is stored canonically', () => {
        expect(formatScene(parseScene(text, file))).toBe(text);
      });

      it('names sets that exist, and only marks a set or an acre provides', () => {
        const scene = parseScene(text, file);
        const sets = authoredSets();
        // Two sources now: the sets a scene spawns, and the fixtures a `unique`
        // acre carries. The post office moved from the first to the second when
        // it stopped being staging and became world content.
        const marks: string[] = [...fixtureMarkIds()];
        for (const id of scene.sets) {
          const found = sets.find((candidate) => candidate.id === id);
          expect(found, `scene "${scene.id}" names unknown set "${id}"`).toBeDefined();
          for (const mark of [...found!.marks, ...found!.seats]) marks.push(mark.id);
        }
        expect(() => validateAgainstSets(scene, marks, file)).not.toThrow();
      });

      /**
       * A `pose` cue may only name a clip a cutscene is allowed to play.
       *
       * The failure this catches is `pose player idle`. It looks obviously
       * right — every model has an idle — but `idle` is the locomotion base
       * the state machine blends, and pinning it as a performance replaces the
       * state machine with a frozen loop that outlives the cue. There is no
       * symptom until the actor is asked to walk, by which time the cause is
       * several beats away.
       *
       * This is a check against the *vocabulary*, not against any model: it
       * cannot know whether `seated_idle` is in the recruit's file, only that
       * `seated_idle` is the kind of name a pose cue may hold. The asset-level
       * answer needs the binary and belongs to the editor, which reads it from
       * the loaded model and will not offer what is not there.
       */
      it('poses name performance clips, never structural ones', () => {
        const scene = parseScene(text, file);
        for (const beat of scene.beats) {
          for (const cue of beat.cues) {
            if (cue.verb !== 'pose') continue;
            const [actor, pose] = cue.args;
            expect(
              isPerformance(pose),
              `beat "${beat.id}": pose ${actor} ${pose} — "${pose}" is a `
                + `${roleOf(pose)} clip, which a cutscene may not pin`,
            ).toBe(true);
          }
        }
      });

      it('has beats, and every beat has at least one cue', () => {
        const scene = parseScene(text, file);
        expect(scene.beats.length).toBeGreaterThan(0);
        for (const beat of scene.beats) {
          expect(beat.cues.length, `beat "${beat.id}" is empty`).toBeGreaterThan(0);
        }
      });
    });
  }
});

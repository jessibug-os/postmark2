import { describe, expect, it } from 'vitest';
import {
  cueEase,
  DEFAULT_EASE,
  formatScene,
  markReferences,
  parseScene,
  SceneParseError,
  validateAgainstSets,
  type Scene,
} from '../src/cutscene/scene/SceneFormat';

const SOURCE = `# scene: sample
# set: ferry-interior
# set: vestibule-set
# note: a fixture

shot establish on cabin dist 17 pitch 20 az -34 lift 1.4 axis aperture
shot two-shot between player recruit dist 6.4 pitch 17 az 62 lift 1.2 axis actors bias 0.5

actor player at player.seat
actor recruit at recruit.seat facing player.seat
actor cabin at vestibule

beat greeting
  @0 camera two-shot over 1
  @0.4 say recruit recruitOrdinary

beat departure
  @0 camera establish over 1.6
  @0.2 move recruit to vestibule over 1.7
  @2 hide recruit
`;

/** Parse a source that is expected to fail, and hand back the error. */
function failure(source: string): SceneParseError {
  try {
    parseScene(source, 'test.scene');
  } catch (error) {
    return error as SceneParseError;
  }
  throw new Error('expected a parse error, got none');
}

const withBody = (body: string): string => `# scene: s\n# set: x\n${body}`;

describe('parseScene', () => {
  const scene = parseScene(SOURCE, 'sample.scene');

  it('reads the header', () => {
    expect(scene.id).toBe('sample');
    expect(scene.sets).toEqual(['ferry-interior', 'vestibule-set']);
    expect(scene.note).toBe('a fixture');
  });

  it('names the sets it borrows its marks from', () => {
    expect(markReferences(scene).map((reference) => reference.mark))
      .toContain('player.seat');
  });

  it('reads shots with defaults applied', () => {
    const [establish, two] = scene.shots;
    expect(establish.framing).toBe('on');
    expect(establish.targets).toEqual(['cabin']);
    expect(establish.axis).toBe('aperture');
    expect(two.framing).toBe('between');
    expect(two.targets).toEqual(['player', 'recruit']);
    expect(two.bias).toBe(0.5);
  });

  it('groups cues under the beat they are indented within', () => {
    expect(scene.beats.map((beat) => beat.id)).toEqual(['greeting', 'departure']);
    expect(scene.beats[0].cues).toHaveLength(2);
    expect(scene.beats[1].cues[1]).toMatchObject({
      at: 0.2,
      verb: 'move',
      args: ['recruit', 'to', 'vestibule', 'over', '1.7'],
    });
  });

  it('accepts shot options in any order', () => {
    const reordered = parseScene(withBody(
      'shot s on m pitch 17 dist 6.4 az 3\n',
    ));
    expect(reordered.shots[0].distance).toBe(6.4);
    expect(reordered.shots[0].pitch).toBe(17);
  });
});

describe('parseScene rejects', () => {
  it('a missing scene header', () => {
    expect(() => parseScene('# set: x\n')).toThrow(/no "# scene:" header/);
  });

  it('a missing set header', () => {
    expect(() => parseScene('# scene: s\n')).toThrow(/no "# set:" header/);
  });

  it('an unknown keyword, naming the line', () => {
    const error = failure(withBody('\n\nwiggle about\n'));
    expect(error.line).toBe(5);
    expect(error.message).toContain('unknown keyword "wiggle"');
  });

  it('an unknown cue verb', () => {
    const error = failure(withBody('beat b\n  @0 explode everything\n'));
    expect(error.message).toContain('unknown cue verb "explode"');
  });

  it('a cue with the wrong argument count', () => {
    const error = failure(withBody('shot s on m dist 4\nbeat b\n  @0 camera s\n'));
    expect(error.message).toContain('camera <shot> over <seconds>');
  });

  it('a cue outside any beat', () => {
    const error = failure(withBody('@0 hold 1\n'));
    expect(error.message).toContain('cue outside any beat');
  });

  it('a negative cue offset', () => {
    const error = failure(withBody('beat b\n  @-1 hold 1\n'));
    expect(error.message).toContain('cannot be negative');
  });

  it('an unknown shot option', () => {
    const error = failure(withBody('shot s on m dist 4 zoom 2\n'));
    expect(error.message).toContain('unknown option "zoom"');
  });

  it('a shot with no distance', () => {
    const error = failure(withBody('shot s on m pitch 10\n'));
    expect(error.message).toContain('needs a dist');
  });

  it('a between-shot with only one target', () => {
    const error = failure(withBody('shot s between m dist 4\n'));
    expect(error.message).toContain('needs 2 target(s)');
  });

  it('a duplicate beat id', () => {
    const error = failure(withBody('beat b\nbeat b\n'));
    expect(error.message).toContain('duplicate beat "b"');
  });
});

/**
 * Cross-referencing is the half of the format that earns its keep: every one
 * of these would otherwise be a camera in a wall found in a capture.
 */
describe('validateScene catches dangling names inside the scene', () => {
  it('a camera cue naming a deleted shot', () => {
    const error = failure(withBody('beat b\n  @0 camera gone over 1\n'));
    expect(error.message).toContain('unknown shot "gone"');
  });

  it('a say cue naming a non-actor', () => {
    const error = failure(withBody('beat b\n  @0 say nobody line\n'));
    expect(error.message).toContain('unknown actor "nobody"');
  });

  it('a duplicate actor', () => {
    const error = failure(withBody('actor a at m\nactor a at m\n'));
    expect(error.message).toContain('duplicate actor "a"');
  });
});

/**
 * Marks live in the sets, so the mark half of cross-referencing runs where the
 * sets are: `validateAgainstSets`. These are the same failures as before —
 * a shot aimed at nothing, an actor on a deleted mark — reported at the door
 * that can actually see whether the mark exists.
 */
describe('validateAgainstSets catches dangling marks', () => {
  const check = (body: string, marks: string[]): SceneParseError => {
    const scene = parseScene(withBody(body), 'test.scene');
    try {
      validateAgainstSets(scene, marks, 'test.scene');
    } catch (error) {
      return error as SceneParseError;
    }
    throw new Error('expected a parse error, got none');
  };

  it('a shot aimed at nothing', () => {
    expect(check('shot s on ghost dist 4\n', []).message)
      .toContain('shot "s" aims at unknown mark "ghost"');
  });

  it('an actor on a deleted mark', () => {
    expect(check('actor a at gone\n', ['m']).message)
      .toContain('actor "a" stands on unknown mark "gone"');
  });

  it('a move cue naming a deleted mark', () => {
    expect(check('actor a at m\nbeat b\n  @0 move a to gone over 1\n', ['m']).message)
      .toContain('move cue names unknown mark "gone"');
  });

  it('a control cue naming a deleted mark', () => {
    expect(check('beat b\n  @0 control to gone radius 2\n', ['m']).message)
      .toContain('control cue names unknown mark "gone"');
  });

  it('names the sets that failed to provide it', () => {
    expect(check('shot s on ghost dist 4\n', []).message).toContain('sets x provide none');
  });

  it('passes when every mark is provided', () => {
    const scene = parseScene(withBody('shot s on m dist 4\nactor a at m\n'), 'test.scene');
    expect(() => validateAgainstSets(scene, ['m'], 'test.scene')).not.toThrow();
  });

  it('does not demand a mark for an actor facing another actor', () => {
    const scene = parseScene(
      withBody('actor a at m\nactor b at m facing a\n'), 'test.scene',
    );
    expect(() => validateAgainstSets(scene, ['m'], 'test.scene')).not.toThrow();
  });
});

describe('formatScene', () => {
  it('round-trips: parse(format(parse(x))) equals parse(x)', () => {
    const once = parseScene(SOURCE, 'sample.scene');
    const twice = parseScene(formatScene(once), 'sample.scene');
    const strip = (scene: Scene): unknown => JSON.parse(
      JSON.stringify(scene, (key, value) => (key === 'line' ? undefined : value)),
    );
    expect(strip(twice)).toEqual(strip(once));
  });

  it('is stable: formatting twice changes nothing', () => {
    const text = formatScene(parseScene(SOURCE, 'sample.scene'));
    expect(formatScene(parseScene(text, 'sample.scene'))).toBe(text);
  });

  it('writes one header line per set', () => {
    const text = formatScene(parseScene(SOURCE, 'sample.scene'));
    expect(text).toContain('# set: ferry-interior\n# set: vestibule-set');
  });

  it('trims trailing zeros so diffs stay small', () => {
    const text = formatScene(parseScene(SOURCE, 'sample.scene'));
    expect(text).toContain('dist 6.4 pitch 17 az 62');
  });
});

describe('a camera cue\'s optional ease', () => {
  const scene = parseScene(withBody(
    'shot wide on m dist 8\n\nbeat b\n  @0 camera wide over 1.2 ease out\n',
  ));

  it('parses the clause and reports the curve', () => {
    expect(scene.beats[0].cues[0].args).toEqual(['wide', 'over', '1.2', 'ease', 'out']);
    expect(cueEase(scene.beats[0].cues[0].args)).toBe('out');
  });

  it('defaults to in-out when the clause is absent', () => {
    expect(cueEase(['wide', 'over', '1.2'])).toBe(DEFAULT_EASE);
    expect(DEFAULT_EASE).toBe('inout');
  });

  it('round-trips the clause through the formatter', () => {
    expect(formatScene(scene)).toContain('@0 camera wide over 1.2 ease out');
  });

  it('leaves a scene that never used the field byte-identical', () => {
    // The whole reason the clause is optional: every scene authored before it
    // existed must format to exactly the bytes it formatted to before.
    expect(formatScene(parseScene(SOURCE, 'sample.scene')))
      .toContain('@0 camera two-shot over 1\n');
  });

  it('rejects a half-written clause', () => {
    expect(failure(withBody('shot w on m dist 8\n\nbeat b\n  @0 camera w over 1 out\n')).message)
      .toMatch(/camera takes/);
  });

  it('rejects a curve nothing can draw', () => {
    expect(failure(withBody(
      'shot w on m dist 8\n\nbeat b\n  @0 camera w over 1 ease sproing\n',
    )).message).toMatch(/unknown ease "sproing"/);
  });
});

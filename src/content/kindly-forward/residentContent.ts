export interface ResidentLetter {
  id: string;
  from: string;
  address: string;
  contents: readonly string[];
  requiredBuildings: readonly string[];
}

export interface ResidentQuest {
  recruit: string;
  reveal: string;
  pressure: string;
  choice: string;
  resolution: string;
}

export interface ResidentContent {
  id: string;
  role: string;
  dailyDialogue: readonly (readonly string[])[];
  quest: ResidentQuest;
  letter: ResidentLetter;
  heartScenes: readonly {
    title: string;
    register: 'warm' | 'afraid' | 'angry' | 'quiet';
    beats: readonly string[];
  }[];
  tastes: {
    loved: readonly string[];
    liked: readonly string[];
    disliked: readonly string[];
  };
  relationships: readonly string[];
}

export const KINDLY_FORWARD_RESIDENT_CONTENT: readonly ResidentContent[] = [
  {
    id: 'albert',
    role: 'administrative clerk',
    dailyDialogue: [
      ['The arrival board has stopped listing yesterday as today.', 'I am calling that structural progress.'],
      ['A quiet drawer is not an empty drawer.', 'Sometimes it is a drawer gathering courage.'],
      ['Would you stay for tea after sorting?', 'No form. No agenda. I checked twice.'],
      ['The dock bell rang once.', 'I jumped three times, which feels administratively excessive.'],
      ['Useful is a job description.', 'Maeve says it is not a reason a person deserves a chair at supper.'],
      ['Your name still has no destination beside it.', 'I wish I could call that unusual here.'],
    ],
    quest: {
      recruit: 'Repair the arrival board and recover the missing drawer key.',
      reveal: "Albert's sealed letter is written in his own hand, from before his memory begins.",
      pressure: 'Maeve finds Albert already listed as pending departure.',
      choice: 'Deliver it, keep it sealed, or ask Albert to open it himself.',
      resolution: 'Albert stops treating usefulness as proof of belonging and chooses whether to remain.',
    },
    letter: {
      id: 'kf-letter-albert',
      from: 'Albert, before the first ledger',
      address: 'ALBERT — Undeliverable Drawer',
      contents: [
        'If you are reading this, the office has asked you to mistake a destination for a duty.',
        'You are allowed to finish the list. You are also allowed to put the pen down.',
      ],
      requiredBuildings: ['post-office'],
    },
    heartScenes: [
      { title: 'After the Sorting', register: 'quiet', beats: ['The last drawer closes.', 'Albert remains after the work is finished.', 'He asks the Postmaster a question no ledger can answer.'] },
      { title: 'Pending Departure', register: 'afraid', beats: ['Maeve shows the damaged index.', 'Albert freezes at his own line.', 'The village stays beside him without choosing for him.'] },
    ],
    tastes: { loved: ['relic-letter', 'relic-stamp'], liked: ['tea', 'paper'], disliked: ['blank-form'] },
    relationships: ['maeve', 'rowan'],
  },
  {
    id: 'mira',
    role: 'mapmaker and lost child',
    dailyDialogue: [
      ['That path is not a shortcut yet.', 'It becomes one after I use it three more times.'],
      ['I am lost from somewhere, not lost here.', 'Those are different and adults keep mixing them up.'],
      ['Amina checked my pulse again.', 'I told her ghosts need less homework, not more.'],
      ['Maeve let me label a page THINGS I KNOW NOW.', 'It is already more accurate than the old file.'],
      ['The suitcase can wait.', 'It has waited longer than you have.'],
      ['If my mother comes, tell her I picked the yellow room.', 'Then tell her I picked it myself.'],
    ],
    quest: {
      recruit: 'Build a small home with a play corner and map the safe paths.',
      reveal: "Her mother's lifetime of letters proves Mira was searched for and remembered.",
      pressure: 'Mira demands delivery to a place that no longer exists.',
      choice: 'Open the suitcase with her, wait until she asks, or leave it closed.',
      resolution: 'Mira names the village as family without pretending it replaces her mother.',
    },
    letter: {
      id: 'kf-letter-mira',
      from: "Mira's mother",
      address: 'MIRA — wherever the yellow raincoat arrives',
      contents: [
        'We looked in every station and under every bridge. You were never a day we stopped living.',
        'I am old now. If this reaches you first, know that being unable to find you was never the same as leaving.',
      ],
      requiredBuildings: ['house-mira', 'boarding-house'],
    },
    heartScenes: [
      { title: 'Things I Know Now', register: 'warm', beats: ['Mira dictates a new archive page.', 'Maeve writes only what Mira chooses.', 'They leave space for what is still unknown.'] },
      { title: 'The Yellow Room', register: 'quiet', beats: ['Mira chooses where the toy shelf goes.', 'The Postmaster waits outside the suitcase lid.', 'Mira asks her to stay.'] },
    ],
    tastes: { loved: ['bug:bright', 'toy'], liked: ['snack', 'map'], disliked: ['medicine-bitter'] },
    relationships: ['amina', 'maeve'],
  },
  {
    id: 'rowan',
    role: 'ferryman',
    dailyDialogue: [
      ['A crossing begins with the knot, not the boat.', 'The boat merely makes the promise visible.'],
      ['Vittorio plays louder when I am frightened.', 'Old friendship has peculiar manners.'],
      ['The river is not impatient.', 'People lend it that quality when they are.'],
      ['Every repaired bridge steals one excuse from me.', 'Good civic work can be terribly personal.'],
      ['I can guide the next passenger.', 'Today I am practicing saying whether I want to.'],
      ['A schedule is useful until it starts pretending to be consent.'],
    ],
    quest: {
      recruit: 'Restore the ferry berth and gather rope, pitch and a lantern.',
      reveal: 'His apprentice completed the living-world route and honored his teaching.',
      pressure: "Every repaired crossing makes Rowan's own crossing harder to postpone.",
      choice: 'Ask him to guide the next soul, accompany him, or let him set the date.',
      resolution: 'Rowan accepts that guiding others never required being fearless.',
    },
    letter: {
      id: 'kf-letter-rowan',
      from: "Rowan's apprentice",
      address: 'OLD ROWAN — Ferryman, St. Mystere',
      contents: [
        'I took the winter route alone and used the knot you made me repeat until I hated rope.',
        'There are grandchildren on that ferry now. The crossing continued because you taught me how.',
      ],
      requiredBuildings: ['ferry-berth', 'bridge-one'],
    },
    heartScenes: [
      { title: 'The Unplayed Crossing', register: 'afraid', beats: ['Vittorio cannot play.', 'Rowan approaches the gangplank in silence.', 'He names his fear without surrendering the schedule.'] },
      { title: 'His Own Date', register: 'quiet', beats: ['Rowan writes one date, then leaves it erasable.', 'The Postmaster does not take the chalk.', 'They fish until the light changes.'] },
    ],
    tastes: { loved: ['rope', 'lantern'], liked: ['fish:*', 'tea'], disliked: ['clock'] },
    relationships: ['vittorio', 'albert'],
  },
  {
    id: 'liliane',
    role: 'heiress learning self-authorship',
    dailyDialogue: [
      ['Everyone asks what I shall build.', 'You were the first to ask where I wanted the chair.'],
      ['A wrong note is a sound nobody inherited for me.', 'I am developing a taste for them.'],
      ['Vittorio calls improvisation listening quickly.', 'I call it terrifying, which he accepts as progress.'],
      ['The greenhouse ignores rank.', 'Niko appears to have encouraged this.'],
      ['My father had a purpose for every room.', 'This one has a window I chose for no reason.'],
      ['Please do not call the recital brave.', 'Call it mine.'],
    ],
    quest: {
      recruit: 'Let Liliane choose and furnish her own home plot.',
      reveal: "Her father's final letter demands one last dutiful public role.",
      pressure: 'The village projects its own plans onto her resources.',
      choice: 'Host a recital, hide an improvised rehearsal, or refuse patronage.',
      resolution: 'Liliane makes one song and one life choice no one can call dutiful.',
    },
    letter: {
      id: 'kf-letter-liliane',
      from: 'The estate of her father',
      address: 'LILIANE — for immediate and proper action',
      contents: [
        'Your name remains attached to the foundation. You will accept the appointment and preserve appearances.',
        'Personal preference has never been the measure of duty.',
      ],
      requiredBuildings: ['house-liliane', 'music-room'],
    },
    heartScenes: [
      { title: 'One Bad Note', register: 'warm', beats: ['Vittorio offers no sheet music.', 'Liliane strikes one ugly note.', 'She laughs before asking permission.'] },
      { title: 'A Room of Her Own', register: 'angry', beats: ['The instruction is read aloud.', 'Liliane removes the inherited nameplate.', 'She chooses what the room is for.'] },
    ],
    tastes: { loved: ['flower:unfamiliar', 'record-blank'], liked: ['tea', 'cloth'], disliked: ['heirloom'] },
    relationships: ['vittorio', 'niko'],
  },
  {
    id: 'amina',
    role: 'field doctor',
    dailyDialogue: [
      ['No pulse. Excellent color. Spirits make very uncooperative charts.'],
      ['Mira attended her unnecessary checkup.', 'I attended mine by standing near the door.'],
      ['Rest is not an emergency intervention.', 'I am told it may be scheduled before collapse.'],
      ['Niko calls this herb hopeful.', 'That is not evidence, but it is useful bedside language.'],
      ['The clinic bell is for help.', 'Today someone rang it to bring soup. I did not object quickly enough.'],
      ['Closing the clinic does not mean care has ended.', 'I have written that where I can see it.'],
    ],
    quest: {
      recruit: 'Build the clinic and furnish its first rest ward.',
      reveal: 'A former patient writes of decades made possible by her care.',
      pressure: 'Every ordinary need arrives dressed as an emergency.',
      choice: 'Take a day off, train another caretaker, or remain always on call.',
      resolution: 'The clinic becomes a place for rest and care without crisis.',
    },
    letter: {
      id: 'kf-letter-amina',
      from: 'A patient she believed died',
      address: 'DR. AMINA — wherever she is still making rounds',
      contents: [
        'You left before I woke, so you never saw me walk home.',
        'There were children, then grandchildren, then ordinary mornings I owe partly to your impossible night.',
      ],
      requiredBuildings: ['clinic'],
    },
    heartScenes: [
      { title: 'No Emergency', register: 'warm', beats: ['The bell rings for soup.', 'Amina reaches for her bag anyway.', 'Mira makes her sit before diagnosing the bread.'] },
      { title: 'The Clinic Can Close', register: 'quiet', beats: ['Amina turns the sign.', 'Nothing terrible happens.', 'The village cares for her without requiring an injury.'] },
    ],
    tastes: { loved: ['herb:clean', 'cloth'], liked: ['tea', 'book'], disliked: ['alarm-bell'] },
    relationships: ['mira', 'niko'],
  },
  {
    id: 'niko',
    role: 'gardener',
    dailyDialogue: [
      ['This bed remembers an afternoon.', 'The next bed would like a future.'],
      ['Unknown seed, unknown season.', 'At last, a plant with no instructions for me.'],
      ['Liliane asked the vine to respect the trellis.', 'The vine has submitted a counterproposal.'],
      ['Amina wants evidence this tea works.', 'I have offered her a second cup.'],
      ['Graves need flowers, but so do kitchens.', 'The garden refuses to rank remembrance.'],
      ['New growth is not disloyal to the old garden. I am practicing that sentence.'],
    ],
    quest: {
      recruit: 'Clear a greenhouse and establish beds unlike the remembered afternoon.',
      reveal: 'His grandchild transformed the old plot into a community garden.',
      pressure: 'The perfect recreation crowds out every unfamiliar seed.',
      choice: 'Preserve it, plant the unknown seeds, or invite a shared design.',
      resolution: 'Niko grows something new and accepts an unfamiliar spring.',
    },
    letter: {
      id: 'kf-letter-niko',
      from: "Niko's grandchild",
      address: 'NIKO — care of any garden still changing',
      contents: [
        'Your neglected plot became the garden everyone uses. I hope you forgive us for moving the paths.',
        'These seeds came from what grew after your plan ended.',
      ],
      requiredBuildings: ['greenhouse'],
    },
    heartScenes: [
      { title: 'The Unknown Seed', register: 'warm', beats: ['Nobody recognizes the seed.', 'Niko gives it the central bed.', 'The old afternoon remains loved and incomplete.'] },
      { title: 'Paths Moved', register: 'quiet', beats: ['The letter describes the new community garden.', 'Niko redraws one path.', 'Liliane plants the first unfamiliar flower.'] },
    ],
    tastes: { loved: ['seed:unknown', 'soil'], liked: ['flower:*', 'tea'], disliked: ['plastic-flower'] },
    relationships: ['amina', 'liliane'],
  },
  {
    id: 'maeve',
    role: 'archivist',
    dailyDialogue: [
      ['Official does not mean neutral.', 'It often means someone owned the cabinet.'],
      ['Mira labeled this page HERSELF, CURRENTLY.', 'It is the most rigorous heading in the room.'],
      ['Albert wants one index.', 'The village has produced three exceptions before breakfast.'],
      ['I can say I do not know without erasing the question.', 'This is a recent professional skill.'],
      ['A repaired letter shows the tear.', 'Honesty need not impersonate wholeness.'],
      ['The oral archive has no owner field.', 'Everyone found that suspiciously easy to accept.'],
    ],
    quest: {
      recruit: 'Restore the archive and gather labels, shelves and testimony.',
      reveal: 'An institutional notice proves her authorship was deliberately removed.',
      pressure: "The village's memories refuse one official index.",
      choice: 'Preserve the categories, rewrite them, or begin an oral archive.',
      resolution: 'Maeve gives the village authorship of its own incomplete history.',
    },
    letter: {
      id: 'kf-letter-maeve',
      from: 'Office of Institutional Records',
      address: 'MAEVE — former assistant archivist',
      contents: [
        'The catalogue will continue under the Director name. Your annotations have been retained without attribution.',
        'No further correction to the public record is required.',
      ],
      requiredBuildings: ['archive'],
    },
    heartScenes: [
      { title: 'Without an Owner', register: 'angry', beats: ['Maeve reads the notice twice.', 'Albert offers the official correction form.', 'She chooses a blank book instead.'] },
      { title: 'What We Know Now', register: 'warm', beats: ['Residents speak their own entries.', 'Contradictions remain side by side.', 'Maeve signs only as listener.'] },
    ],
    tastes: { loved: ['label-blank', 'relic-letter'], liked: ['book', 'art:*'], disliked: ['official-seal'] },
    relationships: ['albert', 'mira'],
  },
  {
    id: 'vittorio',
    role: 'wandering musician',
    dailyDialogue: [
      ['A borrowed lyric fits until someone asks your name.'],
      ['Rowan needs no music to cross.', 'I need music to stand beside the gangplank.'],
      ['Liliane made a rhythm by dropping the metronome.', 'We are keeping it.'],
      ['The letter is honest. That is why keeping it became dishonest.'],
      ['Performance can make a room listen.', 'The difficult part is speaking after it does.'],
      ['My next song has one plain sentence.', 'It is taking longer than the symphony.'],
    ],
    quest: {
      recruit: 'Build a performance corner and recover his instrument from the landing.',
      reveal: 'His treasured love letter belongs to another man with his name.',
      pressure: 'Liliane asks for a song that cannot hide behind borrowed words.',
      choice: 'Deliver the letter, perform it, or write an answer first.',
      resolution: 'Vittorio delivers it, then speaks one plain message under his own name.',
    },
    letter: {
      id: 'kf-letter-vittorio',
      from: 'A stranger writing to another Vittorio',
      address: 'VITTORIO — the one who knows what I could not say',
      contents: [
        'I loved you before I had courage enough to make the sentence ordinary.',
        'If this reaches the wrong man, perhaps honesty can still be forwarded.',
      ],
      requiredBuildings: ['music-room', 'ferry-berth'],
    },
    heartScenes: [
      { title: 'The Wrong Vittorio', register: 'afraid', beats: ['The address mismatch is spoken aloud.', 'Vittorio stops performing.', 'The Postmaster offers to carry it onward.'] },
      { title: 'Under His Own Name', register: 'warm', beats: ['Liliane waits through the silence.', 'Vittorio says one undecorated sentence.', 'Their song begins after the truth.'] },
    ],
    tastes: { loved: ['relic-letter', 'record-blank'], liked: ['instrument-part', 'tea'], disliked: ['scripted-applause'] },
    relationships: ['rowan', 'liliane'],
  },
] as const;

export const KINDLY_FORWARD_RELATIONSHIPS = [
  ['albert', 'maeve'],
  ['mira', 'amina'],
  ['rowan', 'vittorio'],
  ['liliane', 'vittorio'],
  ['niko', 'amina'],
  ['maeve', 'mira'],
  ['albert', 'rowan'],
  ['liliane', 'niko'],
] as const;

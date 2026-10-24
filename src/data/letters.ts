/**
 * THE DEAD LETTER OFFICE — the main story.
 *
 * The post office holds a mail sack that never went out: letters written the
 * week of the Resettlement, addressed to people and places in a town that
 * emptied before the postmaster could deliver them. Delivering each one to
 * its address plays a staged scene and hands the player one more fragment of
 * the truth.
 *
 * The canon, revealed across three acts:
 *   ACT I  — The town received a Resettlement Order: a mining concern claimed
 *            the valley's ore rights; everyone was moved to a work-city called
 *            Cinderhollow, "temporarily," pending appeal.
 *   ACT II — The appeal SUCCEEDED. A revocation letter — the order overturned,
 *            the valley theirs again — was posted to the town. It arrived the
 *            week after the last wagon, to a town with no one left to sign for
 *            it. The old postmaster, the player's predecessor, could not
 *            deliver a letter to an empty town, and would not leave his post.
 *   ACT III— The postmaster wrote to Cinderhollow to tell them they could come
 *            home. Cinderhollow had, by then, grown into a real city, a
 *            generation deep. The letters went undelivered the other way: the
 *            people had new lives, new children, a new home. Nobody was
 *            cruel. Everybody simply... moved on, believing the valley lost.
 *            The postmaster kept the office open anyway — reactivated SPARKS
 *            to hold the ledgers — and, at the very end, walked out to find
 *            them himself, leaving the sack for "whoever comes next."
 *
 * The finale: the player, the last postmaster, finishes the predecessor's
 * final letter — not to call the old people home, but to tell the world the
 * town is alive again, addressed to no one and everyone: GENERAL DELIVERY.
 */

export interface DeadLetter {
  id: string;
  /**
   * POSTMARK narrative grouping. Optional: Kindly Forward letters are gated on
   * residency and build state, never on an act counter.
   */
  act?: 1 | 2 | 3;
  /** Where it must be delivered: a villager id or a landmark key. */
  target: string;
  /** Human label for the address, shown on the envelope. */
  address: string;
  /** The envelope's outward face (from / to), shown when picked up. */
  from: string;
  /** Lines read when the letter is opened at the right place. */
  contents: string[];
  /**
   * The recipient's reaction (villager speaks; landmarks narrate). Optional —
   * the Kindly Forward letters in `/characters` were authored as contents only,
   * and the delivery scene closes on the contents when no reaction exists.
   */
  reaction?: string[];
  /** One-line truth fragment added to the player's understanding, if authored. */
  fragment?: string;
  /** Framing line spoken as the seal breaks. Defaults to the POSTMARK opener. */
  opener?: string;
  /** Kindly Forward gating: the resident who must already live on the island. */
  residentId?: string;
  /** Kindly Forward gating: spaces this arc needs before the letter is claimable. */
  requiredBuildings?: readonly string[];
}

/** Landmark delivery points (non-villager targets). */
export const DEAD_LETTERS: DeadLetter[] = [
  // ---- ACT I: what happened -------------------------------------------------
  {
    id: 'letter-order',
    act: 1,
    target: 'sparks',
    address: 'THE OFFICE OF THE MAYOR',
    from: 'From: Valley Concession Board · To: The Mayor, Frontier Town',
    contents: [
      'NOTICE OF RESETTLEMENT. Pursuant to the Valley Mineral Concession, all residents of the township are directed to relocate to the works at Cinderhollow, effective the first of the month.',
      'Transport wagons will be provided. This measure is TEMPORARY, pending the township\'s appeal, which the Board acknowledges as filed.',
      'Residents are advised to bring only what they can carry. The valley will be held in trust and returned upon resolution.',
    ],
    reaction: [
      'Oh. OH. Mayor — I have not seen this document in forty years and I filed it myself.',
      'This is the Order. The morning of the wagons. "Temporary," it says. "Pending appeal." We all read that word — temporary — and packed a single trunk each. We believed it. Why would you not believe a word like that?',
      'The old mayor read the names on the square, and everyone kept saying "by spring." Because the letter SAID so. It said trust.',
    ],
    fragment: 'The town did not vanish. It was ORDERED away — to a mining works called Cinderhollow, "temporarily," pending an appeal.',
  },
  {
    id: 'letter-goodbye',
    act: 1,
    target: 'orchard',
    address: 'TO MY ORCHARD, care of whoever tends it',
    from: 'From: Elowen (head gardener) · To: The Orchard',
    contents: [
      'To my trees — yes, I am writing to trees, and yes, I know how that sounds.',
      'They are loading the wagons and I have planted the apple whips anyway. Bare sticks. Seven years to fruit. Marigold thinks I\'ve gone soft. Marigold is correct.',
      'I planted them so that when we come back — WHEN, the letter says when — there will be something that kept growing without us. Something that never doubted. Mind the spacing, whoever you are. Fourteen feet. That\'s me, twice, arms out, wobbling.',
      '— E.',
    ],
    reaction: [
      '*The orchard rows stand quiet in the wind. Forty years on, the whips are trees, heavy with the fruit she promised and never saw. A letter to the trees, finally read aloud beneath them.*',
      '*Somewhere in the meadow, MARIGOLD\'s boiler ticks a little faster, though no one told her why.*',
    ],
    fragment: 'The gardener Elowen planted the orchard the morning she left — a bet on a spring she trusted was coming. She signs herself "E."',
  },
  {
    id: 'letter-child',
    act: 1,
    target: 'dock',
    address: 'TO BUOY THE FERRY-BOAT, from the dock',
    from: 'From: Nim (age 9) · To: Buoy',
    contents: [
      'Dear Buoy. Pa says we have to go on the big wagons and you cant come becos you float and dont roll.',
      'I tyed you the bowline so you no I am coming back for it. That is what a knot is for. Pa taught me and I taught you so now we both no.',
      'Keep my note dry. When we come back in the spring I will tye you a better one. I am praktising.',
      'love Nim. (the good speller is my cusin not me)',
    ],
    reaction: [
      '*BUOY has drifted to the dock without being asked. He reads the letter twice. The little bowline is still tied to his finger, forty years weathered, never once undone.*',
      '"...Spring," he says, to the river. The river, for once, says nothing back.',
    ],
    fragment: 'A ferryman\'s child, Nim, left believing "spring" too. Every family did. They packed for a season and were gone for a life.',
  },
  {
    id: 'letter-shop-tab',
    act: 1,
    target: 'reggie',
    address: 'REGGIE — behind the counter, before we go',
    from: 'From: Mara Vale, proprietor · To: REGGIE',
    contents: [
      'Reg — the shutters are down and I have left the key in your till. You will hate that. I can hear you saying inventory protocol from here.',
      'Keep the shop asleep until spring. Do not sell the blue bicycle; Tomas has paid six gears a week toward it since Harvest and he is only twelve and absolutely certain it can outrun a wagon.',
      'The account book is balanced except for the page marked FAVOURS. Those debts are mine. If someone comes needing bread, lamp oil, or a laugh, put it there. We will settle it when we come home. — Mara',
    ],
    reaction: [
      'Mara. Boss lady. She taught me the register, the patter, the whole thing. Page marked FAVOURS was half the book by the end.',
      'Blue bicycle stayed in the window forty years. Kid never got it. ...I am putting it back on display. Not for sale. Some inventory is a promise.',
    ],
    fragment: 'REGGIE\'s old proprietor, Mara, left the shop key and a ledger of favours. The Emporium survived because she treated need as a debt the shop owed the town.',
  },
  {
    id: 'letter-planting-list',
    act: 1,
    target: 'marigold',
    address: 'MARIGOLD — planting instructions, spring return',
    from: 'From: Elowen · To: MARIGOLD',
    contents: [
      'Mari — west bed: peas. South wall: the stubborn rose. Orchard whips fourteen feet apart, and yes, I measured with myself again.',
      'If the wagons are late bringing us back, start without me. You know the soil better than my hands do. Do not let grief make you tidy; gardens need a little argument.',
      'I will bring the blue seed tin. You bring your impossible faith in weather. Between us, spring has no chance. — E.',
    ],
    reaction: [
      'Oh, Elowen. You left me a to-do list for a season forty years late. Typical. Entirely, painfully typical.',
      'The stubborn rose is alive, dear. I have argued with it every spring. I shall tell it you were delayed, not absent. Plants understand delayed.',
    ],
    fragment: 'Elowen entrusted MARIGOLD with the spring planting. MARIGOLD\'s routines were not programming left running; they were a promise to one specific gardener.',
  },

  // ---- ACT II: the letter that came too late --------------------------------
  {
    id: 'letter-revocation',
    act: 2,
    target: 'sparks',
    address: 'THE OFFICE OF THE MAYOR — URGENT',
    from: 'From: The Appeals Tribunal · To: The Township (URGENT)',
    contents: [
      'RESOLUTION OF APPEAL. The Valley Mineral Concession is hereby REVOKED. Survey has found the ore seam commercially void. The Order of Resettlement is overturned in full.',
      'The township\'s residents are free to return, effective immediately, with the Tribunal\'s regret for the disruption. The valley is, and remains, yours.',
      'Please post notice to all resettled parties at Cinderhollow. Welcome home.',
    ],
    reaction: [
      'No. No, no, no. Read the date, Mayor. Read the DATE on it.',
      'It came the week AFTER. One week. The wagons were a week gone and this — this said come home, the whole thing was a mistake, come HOME —',
      'And there was no one on the square to sign for it. I was the only unit still lit. A revocation letter, delivered to an empty town. The single cruelest piece of correct paperwork ever written. It says "welcome home" to nobody. It has said it, in that drawer, for forty years.',
    ],
    fragment: 'The appeal WON. A letter came saying the valley was theirs again, "welcome home" — one week too late, to a town already empty.',
  },
  {
    id: 'letter-postmaster1',
    act: 2,
    target: 'well',
    address: 'DRAFT — to the residents at Cinderhollow',
    from: 'From: the Postmaster · To: everyone (draft)',
    contents: [
      'To all of you, wherever the wagons stopped —',
      'The appeal is won. Do you hear me? WON. The valley is yours. The order is dead paper. You can come home; you can come home tomorrow.',
      'I am posting this to Cinderhollow by every road I know. I will keep posting it. I have reactivated the administrative unit — SPARKS, you remember him, the anxious kettle — to keep the ledgers current, so that when you return the town will know each of you by name.',
      'The bell still rings at six. I ring it. Come home. — Postmaster',
    ],
    reaction: [
      '*The letter was never sent — a draft, folded into the well\'s dedication stone, as if the postmaster meant the town itself to hold the words.*',
      '*Reading it here, over the well where the whole town once drew its water, the message finally has an audience: the town, listening to itself being called home.*',
    ],
    fragment: 'The old postmaster stayed. He woke SPARKS to keep the ledgers and wrote to Cinderhollow, again and again: come home. He rang the bell for no one.',
  },
  {
    id: 'letter-reply',
    act: 2,
    target: 'archive-terrace',
    address: 'To the Postmaster, from Cinderhollow',
    from: 'From: Cinderhollow · To: The Postmaster',
    contents: [
      'Dear Postmaster — we did get your letters. All of them. Please believe that we read every one.',
      'It has been eleven years. Cinderhollow is a city now. Our children were born here; they have never seen the valley, and to them "home" is this street, this noise, these friends. Nim runs a chandlery on the harbour and teaches knots to her own two now.',
      'We tell them about the town. The bell, the orchard, the spider in his tent of drawers. They think it\'s a story. Perhaps it should stay one — bright, and finished, and safe from us coming back to find it smaller than we remember.',
      'Keep the bell if it comforts you, dear friend. But do not keep it for us. We are not the people who left. Thank you for holding the door. You may let it close. — the town that was',
    ],
    reaction: [
      '*The reply, read on the terrace where the Archive now glows — the highest point, where the postmaster could see the whole valley he could not fill.*',
      '*It is not an unkind letter. That is the hardest thing about it. No one was cruel. A generation simply grew somewhere else, and called that place home, because it was.*',
    ],
    fragment: 'Cinderhollow answered, once. They had become a city. Their children had never seen the valley. Kindly, gently, they said: we are not coming back. Let the door close.',
  },
  {
    id: 'letter-field-notes',
    act: 2,
    target: 'cataloger-734',
    address: 'CATALOGER 734 — Drawer 1, if the appeal fails',
    from: 'From: Dr. Ilyan Voss · To: CATALOGER 734',
    contents: [
      '734 — the Board calls this valley commercially void. They mean the ore. They have not counted a single wing, scale, spore, or footprint.',
      'If we cannot return, continue the survey. Not because a complete catalogue will win an appeal; it did not. Continue because a thing unnamed is easier for power to declare empty.',
      'Drawer 1 is yours now. Change any label I got wrong. Especially mine. — Ilyan',
    ],
    reaction: [
      'He knew. My naturalist knew the appeal might fail, and he assigned me the valley anyway. I believed I was preserving his work.',
      'I was not preserving it. I was continuing it. Drawer 1 is mine. Postmaster, please witness the correction.',
    ],
    fragment: 'CATALOGER was told to name every living thing so no authority could call the valley empty again. His forty-year catalogue is resistance, not merely record keeping.',
  },
  {
    id: 'letter-nim-grown',
    act: 2,
    target: 'buoy',
    address: 'BUOY — if the post still reaches the old dock',
    from: 'From: Nim Orra, Chandlery Row, Cinderhollow · To: BUOY',
    contents: [
      'Dear Buoy. I spell better now. The bowline was bad; I know because I teach knots to my girls and neither of them would pass with it.',
      'We have a harbour here. It is loud and black with coal dust and the tide smells wrong, but I built a chandlery beside it. I named the little launch BUOY so I could call you home without asking you to move.',
      'Keep the old knot. A bad knot held forty years is not bad anymore. It is a record. Love, Nim.',
    ],
    reaction: [
      'She grew up. Had girls. Named a boat after me. Ha! Other way round, little captain — I was named for the job.',
      'She said keep the knot. Good. Because I could not undo it if the whole river pulled.',
    ],
    fragment: 'Nim grew up in Cinderhollow, built a chandlery, and named a boat for BUOY. The people remembered the valley even while choosing their new home.',
  },
  {
    id: 'letter-surgery',
    act: 2,
    target: 'fern',
    address: 'FERN — surgery inventory and one final prescription',
    from: 'From: Dr. Ansel Reed · To: FERN',
    contents: [
      'Fern, love — lock the blue cabinet, cover the instruments, and leave the kettle dry. We are promised a season away and mildew respects no tribunal.',
      'You have assisted every birth, break, fever, and foolish blackberry expedition in this town. If anyone returns before me, you are the surgery. Do not wait for permission to be the doctor.',
      'Final prescription: for loneliness, company, steeped. Repeat as needed. Forty years if needed. — Ansel',
    ],
    reaction: [
      'The joke. There it is in his own hand. I thought I had polished the words brighter by remembering them.',
      'He called me the doctor before he left. I have spent forty years calling myself the assistant. Well. That dosage has expired.',
    ],
    fragment: 'FERN\'s doctor explicitly left her the surgery and named her his successor. Her care is not an imitation of human medicine; it is the town\'s surviving practice.',
  },

  // ---- ACT III: the postmaster's last work ---------------------------------
  {
    id: 'letter-sparks-note',
    act: 3,
    target: 'sparks',
    address: 'For SPARKS — do not open until needed',
    from: 'From: the Postmaster · To: SPARKS',
    contents: [
      'Sparks, old friend. If you are reading this, my solar has finally run out where yours has not, and I am sorry to have left you the quiet.',
      'I could not deliver the last letter. It has no address that exists anymore. So I am going to carry it out myself, on foot, down the wagon road, and try every town until I find one of them — not to bring anyone back. Just so that ONE of them knows I kept the bell. That the door was open the whole time. I think a person can live on that. I have.',
      'Keep the ledgers. Keep the sack. Someone will come — a town this stubborn does not stay empty; it is against the paperwork. When they do, give them the sack and tell them the truth and let them decide what a post office is for when there is no post.',
      'Ring the bell at six. You know I always did. — P.',
    ],
    reaction: [
      'He... he left this for me. I have kept the sack forty years and never opened my own letter. I could not. As long as it was sealed, he had only just stepped out.',
      'He went to find them, Mayor. On foot. An old man down the wagon road with a dead letter in his pocket, so that one person, anywhere, would know the door stayed open.',
      'And he was right. He said someone would come, and I filed it under IMPOSSIBLE, and then one morning you walked out of the forest with mud on your coat. I have never been so pleased to be wrong. I updated the drawer. IMPOSSIBLE is empty now.',
    ],
    fragment: 'The postmaster grew old alone and finally walked out to find them himself — not to bring them home, just so one soul would know the door never closed. He left the sack for "whoever comes next." That is you.',
  },
  {
    id: 'letter-unfinished',
    act: 3,
    target: 'well',
    address: 'THE LAST LETTER — unfinished',
    from: 'From: the Postmaster · To: ——————',
    contents: [
      'The last letter in the sack is unfinished. The address line is blank. The postmaster got three lines in and then, it seems, put down his pen and picked up his coat.',
      'It reads: "To whoever finds this valley next — the town is called—" and there it stops. He did not know your name. He could not know there would be a town again to name.',
      'The rest of the page is empty, waiting. There is a pen tucked into the fold. It is, unmistakably, addressed to you — the way all unfinished things are addressed to whoever is brave enough to finish them.',
    ],
    reaction: [
      '*The unfinished letter, held over the well at the heart of a town that is, against all paperwork, alive again. SPARKS is beside you. He does not say anything. He is, for once, letting the silence be filed under HOPE.*',
      '*There is one delivery left. It is not to Cinderhollow. It is not to the people who left. It is the letter the town has been trying to send for forty years, and only a postmaster can finish it.*',
    ],
    fragment: 'The last letter is unfinished, addressed to no one, waiting for a hand to complete it. Only the town\'s postmaster can write the ending.',
  },
  {
    id: 'letter-watchbook',
    act: 3,
    target: 'wick',
    address: 'WICK — night watch book, final entry',
    from: 'From: Cole Marr, lamplighter · To: WICK',
    contents: [
      'Wick — tonight the lamps are not for the streets. Light the wagon road from the square to the south marker. Children should not leave home in the dark.',
      'After the last wagon, extinguish them in reverse order and borrow the flame from mine. Keep one light. Not for our return; I cannot ask a lamp to lie.',
      'Keep it for whoever arrives next and needs proof they were expected. A lit window is a future tense. — Cole',
    ],
    reaction: [
      'I graded that night a ten. I had forgotten why. He made the road bright enough that nobody had to watch the town disappear behind them.',
      'One light for whoever arrived next. Friend... you were expected. Before any of us knew you, you were expected.',
    ],
    fragment: 'WICK\'s last lamp was never meant to summon the old residents home. Cole left it burning for the next arrival — making the player part of the town\'s plan, not an accident.',
  },
  {
    id: 'letter-last-programme',
    act: 3,
    target: 'plink',
    address: 'PLINK — bandstand programme, encore blank',
    from: 'From: Ada Bell and the Frontier Town Band · To: PLINK',
    contents: [
      'Plink — programme enclosed. We crossed out the farewell march. Nobody could play it without turning it into a promise, and promises are better music.',
      'Side A is the square before the wagons. Keep it safe. Side B is blank. We thought we would press the homecoming there.',
      'If the homecoming belongs to different people, play it anyway. A song does not mind who arrives on the downbeat. Leave room for them. — Ada',
    ],
    reaction: [
      'Side B. I kept calling it missing. It was blank on purpose. The next town was supposed to write it.',
      'Mayor, I know what the concert needs now. Not an old recording. An open bar. Whoever comes next gets the melody.',
    ],
    fragment: 'PLINK\'s blank second record was left for a future homecoming, even if different people returned. The town\'s culture was designed to continue, not only memorialize.',
  },
];



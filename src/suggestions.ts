// Ready-made suggestions for card fields, tags, and a random name generator.
// These seed each project's templates; the writer can add, edit or remove
// suggestions per field in the template editor.

/** templateId → fieldKey → suggestions. Fields marked multi collect several picks. */
export const FIELD_SUGGESTIONS: Record<string, Record<string, { items: string[]; multi?: boolean }>> = {
  character: {
    role: {
      items: [
        'Protagonist', 'Antagonist', 'Deuteragonist', 'Mentor', 'Sidekick', 'Love interest', 'Rival', 'Foil',
        'Trickster', 'Guardian', 'Herald', 'Shapeshifter', 'Comic relief', 'Narrator', "Villain's right hand", 'Reluctant ally',
      ],
    },
    age: { items: ['Child', 'Teenager', 'Young adult', 'Twenties', 'Thirties', 'Middle-aged', 'Elderly', 'Ancient', 'Ageless'] },
    appearance: {
      multi: true,
      items: [
        'Scarred', 'Tall and lean', 'Stocky', 'Weathered', 'Striking eyes', 'Always in black', 'Ink-stained fingers',
        'Tattooed', 'Elegant', 'Unkempt', 'Freckled', 'Silver-haired', 'Walks with a limp', 'Missing a finger',
      ],
    },
    personality: {
      multi: true,
      items: [
        'Brave', 'Cunning', 'Loyal', 'Stubborn', 'Witty', 'Brooding', 'Kind', 'Ruthless', 'Curious', 'Reckless',
        'Cautious', 'Proud', 'Secretive', 'Optimistic', 'Cynical', 'Charming', 'Impulsive', 'Honourable',
      ],
    },
    want: {
      multi: true,
      items: ['Revenge', 'Freedom', 'Power', 'Love', 'Belonging', 'Redemption', 'Wealth', 'Recognition', 'To protect family', 'The truth', 'To go home', 'To escape the past'],
    },
    need_or_flaw: {
      multi: true,
      items: [
        'Learn to trust', 'Forgive themself', 'Accept loss', 'Let go of control', 'Ask for help', 'Find self-worth', 'Face the truth',
        'Pride', 'Cowardice', 'Jealousy', 'Greed', 'Self-doubt', 'Blind loyalty',
      ],
    },
    backstory: {
      multi: true,
      items: ['Orphaned young', 'Exiled noble', 'Former soldier', 'Raised by a cult', 'Hidden heir', 'Survived a massacre', 'Ran away from home', 'Lost a sibling', 'Debt to a dangerous person'],
    },
    relationships: {
      multi: true,
      items: ['Sibling of', 'Parent of', 'Mentor to', 'Sworn enemy of', 'Secretly loves', 'Owes a debt to', 'Betrayed by', 'Childhood friend of'],
    },
    first_appearance: { items: ['Prologue', 'Chapter 1', 'Act I', 'Act II', 'Midpoint', 'Act III'] },
  },
  location: {
    type: {
      items: [
        'City', 'Village', 'Fortress', 'Castle', 'Tavern', 'Temple', 'Ruins', 'Forest', 'Mountain pass', 'Harbour',
        'Desert', 'Swamp', 'Island', 'Underground', 'Palace', 'Market', 'Library', 'Ship',
      ],
    },
    region: { items: ['The north', 'The south', 'The east', 'The west', 'The capital', 'The borderlands', 'Overseas', 'The wilds'] },
    description: {
      multi: true,
      items: ['Narrow streets', 'Crumbling walls', 'Lantern light', 'Salt air', 'Bells at dusk', 'Endless rain', 'Towering spires', 'Overgrown', 'Built into a cliff'],
    },
    atmosphere: {
      multi: true,
      items: ['Eerie', 'Bustling', 'Decaying', 'Serene', 'Oppressive', 'Festive', 'Damp and cold', 'Sun-baked', 'Smoky', 'Haunted', 'Sacred', 'Lawless', 'Opulent', 'Forgotten'],
    },
    who_lives_or_works_here: {
      multi: true,
      items: ['Merchants', 'Smugglers', 'Priests', 'Soldiers', 'Scholars', 'Fishermen', 'Nobles', 'Thieves', 'Refugees', 'Nobody, anymore'],
    },
  },
  faction: {
    purpose: {
      multi: true,
      items: ['Protect the realm', 'Seize power', 'Preserve knowledge', 'Profit', 'Worship', 'Rebellion', 'Keep a secret', 'Vengeance'],
    },
    structure: { items: ['Strict hierarchy', 'Council of elders', 'Secret cells', 'Family dynasty', 'Guild', 'Elected leaders', 'Cult of personality', 'Loose alliance'] },
    resources: { multi: true, items: ['Gold', 'Spies', 'Soldiers', 'Ships', 'Magic', 'Ancient texts', 'Political influence', 'Land', 'Blackmail'] },
    allies_and_enemies: { multi: true, items: ['Allied with the crown', 'At war with the church', 'Uneasy truce', 'Secretly funded by rivals', 'Hunted by the law'] },
    secrets: { multi: true, items: ['A traitor within', 'Leader is an impostor', 'Funded by the enemy', 'Hidden prophecy', 'Broken oath', 'Founded on a lie'] },
  },
  system: {
    source_of_power: {
      items: ['Bloodline', 'Faith', 'Nature', 'The stars', 'True names', 'Emotion', 'Sacrifice', 'Artifacts', 'Science', 'Pacts with spirits'],
    },
    limits_and_costs: {
      multi: true,
      items: ['Physical exhaustion', 'Shortened lifespan', 'Memory loss', 'Needs a rare material', 'Only at night', "Can't affect oneself", 'Corrupts the user', 'Equivalent exchange'],
    },
    who_can_use_it: { items: ['Anyone with training', 'Born gifted', 'A chosen few', 'Nobility only', 'Priests', 'Forbidden to all'] },
    effect_on_society: {
      multi: true,
      items: ['Feared', 'Worshipped', 'Regulated by law', 'Hidden from the public', 'Powers the economy', 'Caused a war'],
    },
  },
  plot_event: {
    book_and_chapter: { items: ['Prologue', 'Chapter 1', 'Act I', 'Act II', 'Midpoint', 'Act III', 'Climax', 'Epilogue'] },
    what_happens: {
      multi: true,
      items: [
        'Inciting incident', 'First plot point', 'Midpoint twist', 'Dark night of the soul', 'Climax', 'Resolution',
        'Betrayal', 'Reunion', 'Revelation', 'A death', 'An escape', 'A duel', 'A heist',
      ],
    },
  },
  item: {
    origin: { multi: true, items: ['Forged by a master smith', 'Ancient relic', 'Stolen', 'Inherited', 'Found in ruins', 'Gift from a god', 'Made by the hero'] },
    significance: { multi: true, items: ['Key to the plot', 'Family heirloom', 'Symbol of power', 'Cursed', 'Sentimental', 'Weapon', 'Proof of identity'] },
  },
};

/** Fields that collect several picks (comma separated) rather than one value. */
export function isMultiField(templateId: string, key: string, type: string): boolean {
  return FIELD_SUGGESTIONS[templateId]?.[key]?.multi ?? type === 'longtext';
}

export const DEFAULT_TAGS = [
  'protagonist', 'antagonist', 'ally', 'mentor', 'pov', 'act-1', 'act-2', 'act-3',
  'subplot', 'secret', 'foreshadowing', 'deceased', 'needs-work',
];

// ---------- random names ----------

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PERSON = {
  start: ['ma', 'ka', 'el', 'ar', 'se', 'tho', 'ri', 'vel', 'bran', 'e', 'ca', 'dor', 'fen', 'is', 'lu', 'ny', 'or', 'sa', 'ty', 'wy', 'zan', 'ha', 'jo', 'mi'],
  mid: ['ra', 'li', 'an', 'en', 'or', 'ys', 'i', 'el', 'ae', 'on', 'ri', 'a', 'e'],
  end: ['n', 's', 'th', 'ra', 'wyn', 'ric', 'a', 'elle', 'mir', 'dor', 'na', 'ek', 'ia', 'iel', 'en'],
  surPre: ['Ash', 'Black', 'Thorn', 'Vell', 'Marsh', 'Iron', 'Gray', 'Hollow', 'Wren', 'Stone', 'Raven', 'Salt', 'Fair', 'Holt'],
  surSuf: ['wood', 'ford', 'vale', 'more', 'bright', 'hart', 'well', 'by', 'croft', 'mere', 'wick', 'son'],
};

/** Rejects awkward joins: three consonants or three vowels in a row, doubled letters before a consonant. */
const awkward = (w: string) => /[^aeiouy]{3}|[aeiou]{3}|(\w)\1[^aeiouy]|^(.)\2|oe|ao|eo|ae[^l]|ua|uo|aa|ii|uu|wyo|nwyn/i.test(w);

function personName(): string {
  let first = '';
  for (let i = 0; i < 20; i++) {
    first = pick(PERSON.start) + (Math.random() < 0.55 ? pick(PERSON.mid) : '') + pick(PERSON.end);
    if (first.length >= 4 && first.length <= 9 && !awkward(first)) break;
  }
  const sur = Math.random() < 0.75 ? ` ${pick(PERSON.surPre)}${pick(PERSON.surSuf)}` : '';
  return cap(first) + sur;
}

const PLACE_PRE = ['Salt', 'Raven', 'Wolf', 'Stone', 'Hollow', 'Mist', 'Gold', 'Ash', 'Thorn', 'Winter', 'Elder', 'Black', 'Silver', 'Brine', 'Gull', 'Cinder'];
const PLACE_SUF = ['reach', 'hold', 'mere', 'fall', 'haven', 'gate', 'moor', 'crest', 'ford', 'wick', 'march', 'spire', 'deep', 'watch'];
const INN_ADJ = ['Drowned', 'Gilded', 'Crooked', 'Sleeping', 'Laughing', 'Rusty', 'Wandering', 'Lonely', 'Merry', 'Hanged'];
const INN_NOUN = ['Lantern', 'Gull', 'Stag', 'Anchor', 'Crown', 'Fox', 'Barrel', 'Kettle', 'Raven', 'Mermaid'];

const FACTION_ADJ = ['Silver', 'Crimson', 'Hollow', 'Ashen', 'Gilded', 'Silent', 'Iron', 'Veiled', 'Last', 'Broken', 'Sable'];
const FACTION_GROUP = ['Order', 'Hand', 'Circle', 'Covenant', 'Brotherhood', 'Syndicate', 'Court', 'Guild', 'Company', 'Watch'];
const FACTION_NOUN = ['Dawn', 'Thorn', 'Tide', 'Ember', 'Raven', 'Lantern', 'Key', 'Crown', 'Veil', 'Salt'];

const ITEM_ADJ = ['Starlit', 'Weeping', 'Ember', 'Hollow', 'Ancient', 'Bloodbound', 'Silver', 'Sunken', 'Whispering', 'Broken'];
const ITEM_THING = ['Blade', 'Crown', 'Lantern', 'Key', 'Compass', 'Ring', 'Mirror', 'Locket', 'Codex', 'Bell', 'Dagger', 'Map'];

const ART_WORD = ['Ember', 'Bone', 'Star', 'Tide', 'Rune', 'Shadow', 'Blood', 'Dream', 'Salt', 'Song', 'Ash', 'Glass'];

/** A random name suited to the card type. `hint` (e.g. a location's type) can steer it. */
export function randomName(templateId: string, hint = ''): string {
  switch (templateId) {
    case 'location':
      if (/tavern|inn/i.test(hint) || Math.random() < 0.15) return `The ${pick(INN_ADJ)} ${pick(INN_NOUN)}`;
      return `${pick(PLACE_PRE)}${pick(PLACE_SUF)}`;
    case 'faction':
      return Math.random() < 0.5 ? `The ${pick(FACTION_ADJ)} ${pick(FACTION_GROUP)}` : `The ${pick(FACTION_GROUP)} of the ${pick(FACTION_NOUN)}`;
    case 'item':
      return Math.random() < 0.6 ? `The ${pick(ITEM_ADJ)} ${pick(ITEM_THING)}` : `The ${pick(ITEM_THING)} of ${personName().split(' ')[0]}`;
    case 'system': {
      const w = pick(ART_WORD);
      return pick([`${w}craft`, `${w}weaving`, `The ${w} Art`, `${w}binding`, `${w}song`]);
    }
    default:
      return personName();
  }
}

/** Templates whose title field gets the dice. */
export const NAMEABLE = new Set(['character', 'location', 'faction', 'item', 'system']);

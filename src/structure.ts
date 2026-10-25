// Story structure checklists, from Owen's "Fiction Structure Template".
// Fill the Core (sections 1–5) for every book, then stack the add-on modules
// that match it. A space heist is Core + Science fiction + Space opera + Heist.

export type ItemType = 'text' | 'long' | 'check' | 'beat' | 'table';

export type StructureItem = {
  id: string;
  label: string;
  hint?: string;
  type: ItemType;
  /** Beats: rough position in the book. */
  pct?: string;
  /** Tables: column headings. */
  columns?: string[];
  /** Tables: rows that start filled in (first column). */
  presetRows?: string[];
};

export type StructureGroup = { title?: string; note?: string; items: StructureItem[] };

export type StructureModule = {
  id: string;
  title: string;
  kind: 'core' | 'addon';
  /** Add-ons that build on another add-on (e.g. Space opera on Science fiction). */
  stackOn?: string;
  promise?: string;
  intro?: string;
  groups: StructureGroup[];
  hooks?: string;
  traps?: string;
};

const t = (id: string, label: string, hint?: string): StructureItem => ({ id, label, hint, type: 'text' });
const l = (id: string, label: string, hint?: string): StructureItem => ({ id, label, hint, type: 'long' });
const c = (id: string, label: string): StructureItem => ({ id, label, type: 'check' });
const b = (id: string, label: string, pct: string, hint: string): StructureItem => ({ id, label, pct, hint, type: 'beat' });
const tbl = (id: string, label: string, columns: string[], hint?: string, presetRows?: string[]): StructureItem => ({ id, label, columns, hint, presetRows, type: 'table' });

export const MODULES: StructureModule[] = [
  // ---------------- Core ----------------
  {
    id: 'core1',
    title: 'Premise, theme, stakes',
    kind: 'core',
    intro: "If you can't write the pitch in one sentence, the story isn't defined yet.",
    groups: [
      {
        items: [
          l('core1.pitch', 'One-line pitch', 'When [inciting event], [protagonist + defining flaw] must [goal] or else [stakes], but [main obstacle].'),
          l('core1.promise', 'Reader promise', 'The experience the reader signed up for (wonder, dread, puzzle, adventure, romance). The ending must pay it off.'),
          t('core1.question', 'Central dramatic question', 'The yes/no question the climax answers. "Will X get Y?"'),
          t('core1.theme', 'Theme as a question', 'Not a moral. A question the story argues both sides of, answered by the protagonist\'s final choice. "Is loyalty worth more than truth?"'),
          l('core1.external', 'External stakes', 'What the world loses if they fail.'),
          l('core1.internal', 'Internal stakes', 'What the protagonist loses as a person.'),
          l('core1.personal', 'Personal stakes', 'The specific person who gets hurt.'),
          l('core1.escalation', 'Escalation', 'How stakes get worse at the midpoint, and again before the climax.'),
          t('core1.comps', 'Comps', 'Two published books this sits beside.'),
          t('core1.format', 'Format', 'Target word count; standalone or series.'),
        ],
      },
    ],
  },
  {
    id: 'core2',
    title: 'Characters',
    kind: 'core',
    intro: 'Plot is what happens; character is why it matters. The gap between want and need drives the arc.',
    groups: [
      {
        title: 'Protagonist',
        items: [
          t('core2.want', 'Want', 'The external, conscious goal.'),
          t('core2.need', 'Need', 'What they actually lack. Usually the opposite of the lie.'),
          t('core2.lie', 'Lie / flaw', 'The false belief they operate on.'),
          l('core2.wound', 'Wound', 'The past event that made the lie feel true.'),
          t('core2.strength', 'Strength', 'The skill or trait that wins the climax. Plant it early.'),
          t('core2.arc', 'Arc type', 'Positive (lie to truth), negative (refuses truth, falls), or flat (they hold a truth and change the world around them).'),
          l('core2.startend', 'Start state → end state', 'One line each.'),
          t('core2.line', "Line they won't cross", 'Then push them to it.'),
        ],
      },
      {
        title: 'Antagonist / opposing force',
        items: [
          t('core2.ant_want', 'Want', "What they're after."),
          l('core2.ant_right', 'Why they think they\'re right', 'Their logic, in their words.'),
          l('core2.ant_collision', 'Collision', "How their goal directly blocks the protagonist's."),
          t('core2.ant_advantage', 'Advantage', "What they have or know that the protagonist doesn't."),
          t('core2.ant_mirror', 'Mirror', "How they reflect or exaggerate the protagonist's flaw."),
        ],
      },
      {
        title: 'Supporting cast',
        items: [
          tbl('core2.cast', 'Supporting cast', ['Name', 'Role', 'Want', 'How they push the protagonist', 'Changes by the end?'], 'Roles: ally, mentor, foil, rival, love interest.'),
          l('core2.relationships', 'Key relationships', 'The two or three relationships that matter most, and how each one is different at the end.'),
        ],
      },
    ],
  },
  {
    id: 'core3',
    title: 'Plot structure (beat sheet)',
    kind: 'core',
    intro: 'Three acts, 15 beats. Every act break is a choice the protagonist makes, not just something that happens to them.',
    groups: [
      {
        items: [
          b('core3.b1', 'Opening image / hook', '0–1%', 'Protagonist in their normal state, flaw visible, a question raised.'),
          b('core3.b2', 'Setup', '1–10%', "World, want, what's missing. Plant everything the climax will use."),
          b('core3.b3', 'Inciting incident', '~10%', 'The disruption that makes the status quo impossible.'),
          b('core3.b4', 'Debate / refusal', '10–20%', 'They resist or hesitate. Shows what the choice costs.'),
          b('core3.b5', 'Break into Act 2', '20–25%', 'They choose to act. Point of no return.'),
          b('core3.b6', 'Promise of the premise', '25–50%', 'Deliver the genre fun. Try-fail cycles.'),
          b('core3.b7', 'Pinch point 1', '~37%', 'The opposition shows its strength.'),
          b('core3.b8', 'Midpoint', '50%', 'False victory or false defeat. New info flips them from reacting to acting. Stakes rise.'),
          b('core3.b9', 'Opposition closes in', '50–75%', 'Plans fail, allies fracture, the flaw causes damage.'),
          b('core3.b10', 'Pinch point 2', '~62%', 'Opposition hits harder; the cost becomes personal.'),
          b('core3.b11', 'All is lost', '~75%', 'Lowest point. Something or someone dies (literal or not). The flaw caused it.'),
          b('core3.b12', 'Dark night', '75–80%', 'They confront the lie.'),
          b('core3.b13', 'Break into Act 3', '~80%', 'New plan built on the truth they just learned.'),
          b('core3.b14', 'Climax', '80–95%', 'They act on their need, not just their want. Answers the dramatic question.'),
          b('core3.b15', 'Resolution / final image', '95–100%', 'The new normal. Mirrors the opening image to show change.'),
        ],
      },
    ],
    hooks:
      'Try-fail cycles: between beats, each attempt should end in "yes, but" (they win something and it costs them) or "no, and" (they fail and it gets worse). Clean wins kill tension until the climax.',
  },
  {
    id: 'core4',
    title: 'Subplots, setting, POV',
    kind: 'core',
    groups: [
      {
        title: 'Subplots',
        note: 'The B-story is usually a relationship that carries the theme. Every subplot must put pressure on the main plot, or cut it.',
        items: [tbl('core4.subplots', 'Subplots', ['Subplot', 'Characters', 'How it pressures the main plot', 'Resolves at (beat #)'], undefined, ['B-story', 'C-story'])],
      },
      {
        title: 'Setting basics',
        items: [
          t('core4.where', 'Where and when'),
          l('core4.rules', 'Three rules of this world that cause plot problems'),
          l('core4.power', "Who holds power, and who doesn't"),
          l('core4.cost', 'What daily life costs', 'Money, danger, freedom.'),
          l('core4.sensory', 'Sensory signature', 'The sounds, smells, and textures that make it this place and not another.'),
        ],
      },
      {
        title: 'POV, tense, voice',
        items: [
          l('core4.pov', 'POV character(s)', 'Who, and why each earns a POV.'),
          t('core4.tense', 'Person and tense', 'e.g. third limited, past.'),
          t('core4.distance', 'Narrative distance', 'Close inside the head, or pulled back.'),
          l('core4.voice', 'Voice notes', 'Word choice, rhythm, what the narrator notices.'),
        ],
      },
    ],
    hooks:
      'Scene template (use for every scene): POV · Goal · Resistance · Outcome (yes-but, no-and, or rarely clean yes) · Turn (the value that shifts) · Reader learns · Carry-forward. After a big scene: reaction → dilemma → decision. That decision sets the next scene\'s goal.',
  },
  {
    id: 'core5',
    title: 'Structure check',
    kind: 'core',
    intro: 'Run this after outlining and again after the first draft.',
    groups: [
      {
        items: [
          c('core5.c1', 'The climax answers the central dramatic question.'),
          c('core5.c2', 'The protagonist wins or loses through their own choice, not luck or rescue.'),
          c('core5.c3', 'The final choice answers the theme question.'),
          c('core5.c4', 'Every act break is a decision, not just an event.'),
          c('core5.c5', 'The midpoint flips the protagonist from reacting to acting.'),
          c('core5.c6', 'The antagonist gets real wins on the page.'),
          c('core5.c7', 'Every setup is paid off, and every payoff was set up.'),
          c('core5.c8', 'The final image contrasts with the opening image.'),
          c('core5.c9', 'Every scene has a turn. Cut any scene where nothing breaks if you remove it.'),
          c('core5.c10', 'The genre promise is delivered by the 25% mark and paid off at the climax.'),
        ],
      },
      { title: 'Setup / payoff tracker', items: [tbl('core5.payoffs', 'Setup / payoff tracker', ['Setup', 'Planted in (chapter)', 'Paid off in (chapter)'])] },
    ],
  },

  // ---------------- Add-ons ----------------
  {
    id: 'sf',
    title: 'Science fiction',
    kind: 'addon',
    promise: 'An idea pushed to its consequences, through people who have to live with it.',
    groups: [
      {
        items: [
          l('sf.novum', 'The novum', 'The one (or few) speculative change(s) from our world.'),
          l('sf.chain', 'Consequence chain', '1st order (what the tech does), 2nd order (how society uses it), 3rd order (who it hurts, what nobody planned for). Plot usually lives in the 3rd order.'),
          t('sf.hardness', 'Hardness dial', 'Hard (real physics constrains the plot) to soft (tech is backdrop). Pick one and stay consistent.'),
          l('sf.limits', 'Limits and costs', "What the tech can't do, what it costs, how it fails. Limits create plot; unlimited tech kills it."),
          t('sf.control', 'Control', "Who owns it, who's shut out."),
          l('sf.timeline', 'Timeline', 'The year, and the 3–5 key events between now and then.'),
          l('sf.human', 'The human question', 'What this idea says about people. Tie it to the Core theme.'),
          l('sf.info', 'Info plan', 'How readers learn the rules without lectures (in use, in argument, through mistakes).'),
        ],
      },
    ],
    hooks: "The inciting incident is often the novum touching the protagonist's life. The midpoint often reveals something new about the tech or idea. The climax should turn on the tech's rules, which the reader already knows.",
    traps: 'Tech that solves too much. Exposition dumps. An idea with no person at the center.',
  },
  {
    id: 'space',
    title: 'Space opera',
    kind: 'addon',
    stackOn: 'sf',
    promise: 'Scale, factions, adventure, a crew, stakes that reach across worlds.',
    groups: [
      {
        items: [
          tbl('space.factions', 'Factions', ['Faction', 'Wants', 'Controls (territory, resource)', 'Strength', 'Stance toward protagonist']),
          t('space.scope', 'Scope', 'One system, a sector, or a galaxy.'),
          l('space.travel', 'Travel and comms', 'How fast ships move and how long messages take. This sets the politics: slow messages mean local governors act alone.'),
          t('space.scarcity', 'Scarcity', 'The resource everyone fights over.'),
          l('space.past', 'The past event', "The war, collapse, or discovery everyone still reacts to. What's myth and what's true."),
          l('space.home', 'Home base', 'The ship or station, its strengths, its one weakness.'),
          l('space.crew', 'Crew', 'Roles, and the friction between them.'),
          l('space.link', 'Personal-to-galactic link', "How the protagonist's personal stake ties to faction-level stakes."),
          l('space.setpieces', 'Set pieces', 'List the distinct locations and battles. Each environment should feel different.'),
        ],
      },
    ],
    hooks: 'Often multi-POV. Give every POV its own mini-arc and converge them at the climax. Escalate scale in steps: personal, local, system-wide.',
    traps: 'Too many factions in the first act. Politics with no faces. Huge scale with no felt cost.',
  },
  {
    id: 'military',
    title: 'Military SF',
    kind: 'addon',
    stackOn: 'sf',
    promise: 'Tactics that make sense, chain of command, the cost of war, the people beside you.',
    groups: [
      {
        items: [
          l('military.org', 'Organization', 'Branches, ranks, and where the protagonist sits.'),
          l('military.doctrine', 'Doctrine and tech', 'What actually wins battles here. What counters it.'),
          l('military.enemy', 'Enemy doctrine', "How the enemy fights and why it's smart. A competent enemy is required."),
          l('military.logistics', 'Logistics', 'Fuel, ammo, supply lines, comms lag. Constraints the plot must respect.'),
          t('military.roe', 'Rules of engagement', 'And who breaks them.'),
          l('military.unit', 'Unit', 'The squad or crew the reader bonds with.'),
          l('military.orders', 'Orders vs. conscience', "The order the protagonist won't want to follow."),
          l('military.cost', 'Cost ledger', 'Who dies, and what each loss changes.'),
        ],
      },
    ],
    hooks: 'Treat each battle as a scene with a goal and a turn. Every battle must change the strategic situation. The climax should be a tactical problem solved by character insight, not bigger guns.',
    traps: 'Dumb enemies. Battles that change nothing. Casualties the reader never knew.',
  },
  {
    id: 'cyber',
    title: 'Cyberpunk / near-future',
    kind: 'addon',
    stackOn: 'sf',
    promise: 'High tech, low life. Corporate power, street survival, questions about bodies and identity.',
    groups: [
      {
        items: [
          l('cyber.owns', 'Who owns the city', 'Corps, governments, gangs. Who answers to whom.'),
          l('cyber.street', 'Street economy', 'How ordinary people make money and what they sell (including themselves).'),
          l('cyber.body', 'Body and mind tech', 'Augments, implants, uploads. Who can afford them and what they cost besides money.'),
          t('cyber.surveillance', 'Surveillance level', "What's tracked, what's still dark."),
          l('cyber.edge', "Protagonist's edge", "Their outsider skill, and why the system can't simply erase them."),
          l('cyber.job', 'The job', 'The score or mission that pulls them in.'),
          t('cyber.line', 'The human line', 'At what point does a person stop being a person here?'),
        ],
      },
    ],
    hooks: 'Often runs on a job structure (see Heist). The midpoint commonly reveals the job was a setup.',
    traps: 'Aesthetic with no system underneath. Edginess standing in for theme.',
  },
  {
    id: 'dystopia',
    title: 'Dystopian / post-apocalyptic',
    kind: 'addon',
    promise: 'A broken society, and one person who starts to see it or survive it.',
    groups: [
      {
        title: 'Dystopian',
        items: [
          l('dystopia.control', 'Control mechanism', 'How the regime keeps power (surveillance, scarcity, ritual, lottery, caste).'),
          l('dystopia.justification', 'The justification', "The reason the people in charge believe it's necessary. It should be partly convincing."),
          l('dystopia.benefit', 'Who benefits, who pays'),
          t('dystopia.forbidden', "What's forbidden"),
          l('dystopia.complicity', "Protagonist's complicity", 'How they participate in the system at the start.'),
          l('dystopia.crack', 'The crack', "The moment the system's cost becomes personal."),
        ],
      },
      {
        title: 'Post-apocalyptic',
        items: [
          l('dystopia.event', 'The event', 'What happened.'),
          t('dystopia.time', 'Time since', 'Weeks, a generation, centuries. This changes everything.'),
          l('dystopia.survival', 'Survival rules', 'What kills people now, and what keeps them alive.'),
          l('dystopia.powers', 'New powers', 'Who rose to fill the gap.'),
          l('dystopia.relics', 'Relics', 'What old-world objects or knowledge mean now.'),
        ],
      },
    ],
    hooks: "Start the protagonist adapted or complicit. Book 1's climax doesn't need to topple the whole system; personal liberation or one real crack is enough.",
    traps: "A regime with no internal logic. Masses written as sheep. A collapse that doesn't change daily life.",
  },
  {
    id: 'epic',
    title: 'Epic / high fantasy',
    kind: 'addon',
    promise: 'Immersion in a secondary world, wonder, and a conflict bigger than any one person.',
    groups: [
      {
        items: [
          tbl('epic.cultures', 'Cultures', ['Culture', 'Core value', 'Religion / belief', 'Government', 'Taboo', 'In conflict with']),
          l('epic.map', 'Map', 'Regions, borders, and terrain that affects travel and war.'),
          l('epic.travel', 'Travel time', 'How long it takes to cross key distances. Readers notice when this is inconsistent.'),
          t('epic.tech', 'Tech level', 'Weapons, medicine, printing, transport.'),
          l('epic.economy', 'Economy', "What's traded, what's rare."),
          t('epic.gods', 'Gods / religion', 'Real and active, real and absent, or unknown.'),
          l('epic.history', 'History vs. myth', 'What people believe happened, and what actually did.'),
          l('epic.threat', 'The ancient threat / prophecy', 'Play it straight or subvert it. Decide which on purpose.'),
          t('epic.naming', 'Naming rules', 'Sounds and patterns per culture, so names feel related.'),
        ],
      },
    ],
    hooks: 'Quest shape works well: call → gather companions → journey with rising trials → party splits → reunion → confrontation. With multiple POVs, track each arc separately against the beat sheet. For magic, add the Magic system builder.',
    traps: 'Lore-dump prologues. Map tourism with no plot purpose. A chosen one who pays no real cost.',
  },
  {
    id: 'hidden',
    title: 'Hidden-world / urban / portal fantasy',
    kind: 'addon',
    promise: 'A magic world beside or inside ours, and the shock of crossing into it.',
    groups: [
      {
        items: [
          l('hidden.veil', 'The veil', "Why ordinary people don't know. Who enforces the secret, and how."),
          l('hidden.contact', 'Point of contact', 'Where and how the two worlds touch.'),
          l('hidden.entry', 'Entry and exit rules', 'How you get in, how you get out, what it costs.'),
          l('hidden.outsider', 'The outsider POV', "The reader's proxy. What they know that's useless here, and what they know that's an unexpected advantage."),
          l('hidden.crosses', 'What crosses over', "Which modern tech, skills, or knowledge still works. Which doesn't."),
          l('hidden.mutual', 'Mutual wants', 'What each world wants from the other.'),
          l('hidden.exposure', 'Cost of exposure', 'What happens if the secret breaks.'),
        ],
      },
    ],
    hooks: 'The crossing lands at or near the inciting incident. Act 1 is disorientation. The midpoint is when the protagonist stops being a tourist and commits to a side. The climax often forces a choice between worlds.',
    traps: 'A passive protagonist who only receives explanations. A masquerade with obvious holes.',
  },
  {
    id: 'magic',
    title: 'Magic system builder',
    kind: 'addon',
    intro: 'Works for fantasy magic, psionics, or soft-SF powers. Limits matter more than abilities.',
    groups: [
      {
        items: [
          l('magic.source', 'Source', 'Where the power comes from.'),
          l('magic.access', 'Access', 'Who can use it, how they get it.'),
          l('magic.method', 'Method', 'Words, gestures, materials, emotion.'),
          l('magic.cost', 'Cost', 'Energy, materials, time, health, memory.'),
          l('magic.limits', 'Limits', "What it can't do."),
          l('magic.failure', 'Failure', 'What happens when it goes wrong.'),
          l('magic.society', 'Society', 'Laws, religion, economy around it.'),
          l('magic.unknowns', 'Unknowns', "What characters don't understand yet."),
          t('magic.hardsoft', 'Hard vs. soft', "Hard magic has clear rules the reader can predict, so it can solve problems. Soft magic stays mysterious, so it should create problems, not solve the climax (Sanderson's First Law)."),
        ],
      },
    ],
    hooks: "Teach the rules in Act 1 and the first half of Act 2. Reveal a hidden rule or cost at the midpoint. The climax uses the rules in a way the reader didn't see coming but could have.",
    traps: 'New powers appearing exactly when needed. Costs that never actually get paid.',
  },
  {
    id: 'mystery',
    title: 'Mystery / thriller',
    kind: 'addon',
    promise: 'Mystery: a puzzle the reader could fairly solve. Thriller: danger and a clock.',
    groups: [
      {
        title: 'Mystery',
        items: [
          l('mystery.truth', 'The truth first', 'Write what really happened, as a timeline, before you plot the investigation.'),
          l('mystery.culprit', 'Culprit', 'Motive, means, opportunity.'),
          l('mystery.method', "Investigator's method", 'How they find things out, and their blind spot.'),
          tbl('mystery.clues', 'Clues', ['Clue', 'Planted in (chapter)', 'What it seems to mean', 'What it really means']),
          tbl('mystery.suspects', 'Suspects', ['Suspect', 'Motive', 'Alibi', "Secret they're hiding (not the crime)"]),
        ],
      },
      {
        title: 'Thriller',
        items: [
          l('mystery.threat', 'The threat', 'What happens if the protagonist fails, specifically.'),
          l('mystery.clock', 'The clock', "The deadline and how it's shown to the reader."),
          l('mystery.plan', "Antagonist's plan", 'Steps, in order, as if they were the protagonist.'),
          l('mystery.blind', 'Blind spot', "What the protagonist doesn't know that the reader might."),
        ],
      },
    ],
    hooks: 'Mystery: spread clues across all acts; the midpoint reframes the case. Thriller: the clock tightens at every act break.',
    traps: 'A solution built on info the reader never got. A villain who loses by being stupid.',
  },
  {
    id: 'heist',
    title: 'Heist',
    kind: 'addon',
    promise: 'Competent people, an impossible target, a plan, and a twist that was hiding in plain sight.',
    groups: [
      {
        items: [
          l('heist.target', 'Target', "What's being stolen and where it is."),
          l('heist.worth', "Why it's worth it", 'For each crew member, not just the leader.'),
          l('heist.plan', 'The real plan', "Write the full plan, including what the reader won't be told."),
          l('heist.wrong', 'What goes wrong', 'The complication nobody planned for.'),
          t('heist.cross', 'Double-cross', 'Who betrays whom, if anyone.'),
          tbl('heist.security', 'Security', ['Security layer', 'How it works', 'How the crew beats it']),
          tbl('heist.crew', 'Crew', ['Crew member', 'Specialty', "Why they're in", 'Liability or secret']),
        ],
      },
    ],
    hooks: 'Job offered (inciting) → assemble the crew (to ~25%) → planning and prep (to midpoint) → execution goes wrong (second half) → the hidden plan revealed (climax) → aftermath. A plan shown in full to the reader will fail; a plan partly hidden can succeed through the twist.',
    traps: 'A twist with no planted clues. A crew too big for each member to have a distinct voice.',
  },
  {
    id: 'horror',
    title: 'Horror',
    kind: 'addon',
    promise: 'Dread that builds, a threat that escalates, and a real cost.',
    groups: [
      {
        items: [
          t('horror.fear', 'The core fear', 'The primal fear it taps (the dark, the body, being alone, losing yourself, the people closest to you).'),
          l('horror.rules', "The threat's rules", "What it wants, what it can and can't do. Even unexplained horror needs internal consistency."),
          l('horror.leave', "Why they can't leave", 'Physical, emotional, or social trap.'),
          l('horror.isolation', 'Isolation', 'How help gets cut off.'),
          l('horror.ladder', 'Escalation ladder', 'Signs → encounters → first loss → direct assault. Plan each rung.'),
          l('horror.means', 'What it means', "The horror as a mirror of the protagonist's flaw or the theme."),
          t('horror.ending', 'Ending tone', 'Survival, pyrrhic win, or bleak.'),
        ],
      },
    ],
    hooks: 'Show less early. The full threat should be seen late, ideally after the midpoint. The all-is-lost beat often comes from trusting the wrong person or rule.',
    traps: 'Showing the monster too soon. Characters who survive only by luck or die only by stupidity.',
  },
  {
    id: 'romance',
    title: 'Romance thread',
    kind: 'addon',
    intro: 'Use as the B-story in any genre, or as the main plot. If romance is the main genre, the ending must be happy (together for good, or for now).',
    groups: [
      {
        items: [
          l('romance.pull', 'The pull', 'Why these two specifically.'),
          l('romance.external', 'External barrier', 'What outside forces keep them apart.'),
          l('romance.internal', 'Internal barrier', 'Which flaw or lie keeps each one from committing.'),
          l('romance.gives', 'What each gives the other', "How each one meets the other's need."),
          l('romance.theme', 'Theme test', 'How the relationship forces the theme question.'),
        ],
      },
      {
        title: 'Romance beats',
        note: 'Map these to the main beat sheet.',
        items: [
          b('romance.r1', 'Meet', 'Act 1', ''),
          b('romance.r2', 'Attraction and resistance', 'Early Act 2', ''),
          b('romance.r3', 'Deepening', 'Act 2', 'Forced proximity, small trusts.'),
          b('romance.r4', 'Commitment step', 'Midpoint', ''),
          b('romance.r5', 'Crisis or breakup caused by a flaw', 'All is lost', ''),
          b('romance.r6', 'The choice or grand gesture', 'Climax', ''),
          b('romance.r7', 'Together, changed', 'Resolution', ''),
        ],
      },
    ],
    traps: "A conflict one honest conversation would fix. One partner who exists only to serve the other's arc.",
  },
  {
    id: 'series',
    title: 'Series planning',
    kind: 'addon',
    intro: "Each book must answer its own question while moving the series question forward. Book 1 can't be all setup.",
    groups: [
      {
        items: [
          t('series.question', 'Series question', 'The big question the final book answers.'),
          l('series.arc', 'Protagonist arc across the series', 'Where they start in book 1 and end in the last book. Each book is one step.'),
          l('series.escalation', 'Escalation', 'How scale or stakes grow book to book.'),
          l('series.resolves', 'What book 1 fully resolves', 'At least one major plot and one character beat.'),
          tbl('series.books', 'Books', ['Book', 'Book question', 'Main antagonist', "Protagonist's lie at the start", 'Ends with'], undefined, ['1', '2', '3']),
          tbl('series.threads', 'Long threads', ['Long thread', 'Seeded in (book, chapter)', 'Paid off in (book, chapter)']),
        ],
      },
    ],
    traps: 'A middle book that only stalls. Cliffhangers that replace an ending instead of following one.',
  },
];

export const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
export const CORE_IDS = MODULES.filter((m) => m.kind === 'core').map((m) => m.id);
export const ADDON_IDS = MODULES.filter((m) => m.kind === 'addon').map((m) => m.id);

/** Genre templates: a quick way to switch on the right add-ons. */
export const GENRES: { id: string; label: string; modules: string[] }[] = [
  { id: 'sf', label: 'Science fiction', modules: ['sf'] },
  { id: 'space', label: 'Space opera', modules: ['sf', 'space'] },
  { id: 'military', label: 'Military SF', modules: ['sf', 'military'] },
  { id: 'cyber', label: 'Cyberpunk', modules: ['sf', 'cyber'] },
  { id: 'dystopia', label: 'Dystopian', modules: ['dystopia'] },
  { id: 'epic', label: 'Epic fantasy', modules: ['epic', 'magic'] },
  { id: 'urban', label: 'Urban / portal fantasy', modules: ['hidden', 'magic'] },
  { id: 'mystery', label: 'Mystery / thriller', modules: ['mystery'] },
  { id: 'heist', label: 'Heist', modules: ['heist'] },
  { id: 'spaceheist', label: 'Space heist', modules: ['sf', 'space', 'heist'] },
  { id: 'horror', label: 'Horror', modules: ['horror'] },
  { id: 'romance', label: 'Romance', modules: ['romance'] },
];

/** Saved answers for one world. */
export type StructureState = {
  modules: string[];
  answers: Record<string, string>;
  checks: Record<string, boolean>;
  skipped: Record<string, boolean>;
  tables: Record<string, string[][]>;
};

export const emptyStructure = (): StructureState => ({ modules: [], answers: {}, checks: {}, skipped: {}, tables: {} });

/** Turning on an add-on also turns on what it stacks on. */
export function withModule(modules: string[], id: string, on: boolean): string[] {
  const set = new Set(modules);
  if (on) {
    set.add(id);
    const base = MODULE_BY_ID.get(id)?.stackOn;
    if (base) set.add(base);
  } else {
    set.delete(id);
    // Removing a base removes what stacks on it.
    for (const m of MODULES) if (m.stackOn === id) set.delete(m.id);
  }
  return ADDON_IDS.filter((a) => set.has(a));
}

export function tableRows(s: StructureState, item: StructureItem): string[][] {
  const saved = s.tables[item.id];
  if (saved) return saved;
  const cols = item.columns?.length ?? 1;
  return (item.presetRows ?? []).map((r) => [r, ...Array(cols - 1).fill('')]);
}

export function isDone(s: StructureState, item: StructureItem): boolean {
  if (s.skipped[item.id]) return true;
  if (item.type === 'check') return !!s.checks[item.id];
  if (item.type === 'table') {
    // A table counts once a row has something beyond its preset label.
    return tableRows(s, item).some((row) => row.some((cell, i) => cell.trim() && !(i === 0 && item.presetRows?.includes(cell))));
  }
  return !!s.answers[item.id]?.trim();
}

export const itemsOf = (m: StructureModule) => m.groups.flatMap((g) => g.items);

export function progress(s: StructureState, m: StructureModule): { done: number; total: number } {
  const items = itemsOf(m);
  return { done: items.filter((i) => isDone(s, i)).length, total: items.length };
}

export function activeModules(s: StructureState): StructureModule[] {
  return [...CORE_IDS, ...s.modules].map((id) => MODULE_BY_ID.get(id)!).filter(Boolean);
}

/**
 * The template's fill order: pitch; want, need, lie; the ending (climax +
 * final image); the beat sheet backward from the ending; genre modules;
 * everything else.
 */
export function fillOrder(s: StructureState): string[] {
  const beats = Array.from({ length: 13 }, (_, i) => `core3.b${13 - i}`);
  const first = ['core1.pitch', 'core2.want', 'core2.need', 'core2.lie', 'core3.b14', 'core3.b15', ...beats];
  const addons = s.modules.flatMap((id) => itemsOf(MODULE_BY_ID.get(id)!).map((i) => i.id));
  const rest = activeModules(s).flatMap((m) => itemsOf(m).map((i) => i.id));
  return [...new Set([...first, ...addons, ...rest])];
}

export function nextUp(s: StructureState): StructureItem | null {
  const all = new Map(activeModules(s).flatMap((m) => itemsOf(m).map((i) => [i.id, i] as const)));
  for (const id of fillOrder(s)) {
    const item = all.get(id);
    if (item && !isDone(s, item)) return item;
  }
  return null;
}

/** The checklist as Markdown, for the Obsidian export. */
export function structureMarkdown(s: StructureState, title: string): string | null {
  const anything =
    Object.values(s.answers).some((v) => v?.trim()) || Object.values(s.checks).some(Boolean) || Object.values(s.tables).some((t) => t.length);
  if (!anything && !s.modules.length) return null;
  const out = [`# ${title}: story structure`, ''];
  for (const m of activeModules(s)) {
    const p = progress(s, m);
    out.push(`## ${m.title} (${p.done}/${p.total})`, '');
    if (m.promise) out.push(`*Promise:* ${m.promise}`, '');
    for (const g of m.groups) {
      if (g.title && g.title !== m.title) out.push(`### ${g.title}`, '');
      for (const it of g.items) {
        const skip = s.skipped[it.id] ? ' *(skipped)*' : '';
        if (it.type === 'check') out.push(`- [${s.checks[it.id] ? 'x' : ' '}] ${it.label}${skip}`);
        else if (it.type === 'table') {
          const rows = tableRows(s, it).filter((r) => r.some((c) => c.trim()));
          out.push(`**${it.label}**${skip}`, '');
          if (rows.length) {
            out.push(`| ${it.columns!.join(' | ')} |`, `| ${it.columns!.map(() => '---').join(' | ')} |`);
            for (const r of rows) out.push(`| ${r.map((c) => c.replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`);
          }
          out.push('');
        } else {
          const label = it.type === 'beat' ? `${it.label} (${it.pct})` : it.label;
          out.push(`**${label}:**${skip} ${s.answers[it.id]?.trim() ?? ''}`, '');
        }
      }
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

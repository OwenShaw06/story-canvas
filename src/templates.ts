import type { FieldType, Template } from './model';

// Default templates from the requirements doc. Templates are data: each new
// project gets its own copy, so editing them later never touches code.

type Spec = [label: string, type?: FieldType, options?: string[]];

function make(id: string, name: string, specs: Spec[]): Template {
  return {
    id,
    name,
    fields: specs.map(([label, type = 'text', options]) => ({
      key: label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, ''),
      label,
      type,
      ...(options ? { options } : {}),
    })),
  };
}

export function defaultTemplates(): Template[] {
  return [
    make('character', 'Character', [
      ['Name'],
      ['Role'],
      ['Age'],
      ['Appearance', 'longtext'],
      ['Personality', 'longtext'],
      ['Want', 'longtext'],
      ['Need or flaw', 'longtext'],
      ['Backstory', 'longtext'],
      ['Relationships', 'longtext'],
      ['First appearance'],
      ['Notes', 'longtext'],
    ]),
    make('location', 'Location', [
      ['Name'],
      ['Type'],
      ['Region'],
      ['Description', 'longtext'],
      ['Atmosphere', 'longtext'],
      ['Who lives or works here', 'longtext'],
      ['Key events', 'longtext'],
      ['Notes', 'longtext'],
    ]),
    make('faction', 'Faction', [
      ['Name'],
      ['Purpose', 'longtext'],
      ['Leader'],
      ['Members', 'longtext'],
      ['Structure', 'longtext'],
      ['Resources', 'longtext'],
      ['Allies and enemies', 'longtext'],
      ['Secrets', 'longtext'],
      ['Notes', 'longtext'],
    ]),
    make('system', 'Magic or Tech System', [
      ['Name'],
      ['How it works', 'longtext'],
      ['Source of power', 'longtext'],
      ['Limits and costs', 'longtext'],
      ['Who can use it', 'longtext'],
      ['Effect on society', 'longtext'],
      ['Rules readers must know', 'longtext'],
    ]),
    make('plot_event', 'Plot Event', [
      ['Title'],
      ['Book and chapter'],
      ['What happens', 'longtext'],
      ['Who is involved', 'longtext'],
      ['Cause', 'longtext'],
      ['Consequence', 'longtext'],
      ['Status', 'select', ['idea', 'drafted', 'written']],
    ]),
    make('item', 'Item', [
      ['Name'],
      ['Description', 'longtext'],
      ['Origin', 'longtext'],
      ['Current holder'],
      ['Significance', 'longtext'],
    ]),
    make('note', 'Note', [['Note', 'longtext']]),
    make('sketch', 'Sketch', []),
  ];
}

import type { FieldType, Template } from './model';
import { FIELD_SUGGESTIONS } from './suggestions';

// Default templates from the requirements doc. Templates are data: each new
// project gets its own copy, so editing them later never touches code.

export function fieldKey(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'field'
  );
}

type Spec = [label: string, type?: FieldType, options?: string[]];

function make(id: string, name: string, icon: string, color: string, specs: Spec[]): Template {
  return {
    id,
    name,
    icon,
    color,
    fields: specs.map(([label, type = 'text', options]) => {
      const key = fieldKey(label);
      const sug = FIELD_SUGGESTIONS[id]?.[key];
      return {
        key,
        label,
        type,
        ...(options ? { options } : {}),
        ...(sug ? { suggestions: [...sug.items], ...(sug.multi ? { multi: true } : {}) } : {}),
      };
    }),
  };
}

export function defaultTemplates(): Template[] {
  return [
    make('character', 'Character', 'person', 'blue', [
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
    make('location', 'Location', 'pin', 'green', [
      ['Name'],
      ['Type'],
      ['Region'],
      ['Description', 'longtext'],
      ['Atmosphere', 'longtext'],
      ['Who lives or works here', 'longtext'],
      ['Key events', 'longtext'],
      ['Notes', 'longtext'],
    ]),
    make('faction', 'Faction', 'flag', 'red', [
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
    make('system', 'Magic or Tech System', 'sparkle', 'purple', [
      ['Name'],
      ['How it works', 'longtext'],
      ['Source of power', 'longtext'],
      ['Limits and costs', 'longtext'],
      ['Who can use it', 'longtext'],
      ['Effect on society', 'longtext'],
      ['Rules readers must know', 'longtext'],
    ]),
    make('plot_event', 'Plot Event', 'bolt', 'orange', [
      ['Title'],
      ['Book and chapter'],
      ['What happens', 'longtext'],
      ['Who is involved', 'longtext'],
      ['Cause', 'longtext'],
      ['Consequence', 'longtext'],
      ['Status', 'select', ['idea', 'drafted', 'written']],
    ]),
    make('item', 'Item', 'gem', 'teal', [
      ['Name'],
      ['Description', 'longtext'],
      ['Origin', 'longtext'],
      ['Current holder'],
      ['Significance', 'longtext'],
    ]),
    make('note', 'Note', 'note', 'yellow', [['Note', 'longtext']]),
    make('sketch', 'Sketch', 'pencil', 'gray', []),
  ];
}

import type { ComponentChildren } from 'preact';

// Small inline icons (24px grid, stroke-based) so the app needs no icon font.

const Svg = ({ children }: { children: ComponentChildren }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const PenIcon = () => (
  <Svg>
    <path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" />
    <path d="M13.5 7l3.5 3.5" />
  </Svg>
);

export const HighlighterIcon = () => (
  <Svg>
    <path d="M9 15l-3 3v2h4l2-2" />
    <path d="M9 15l7.5-9.5a2 2 0 0 1 3 0l.1.1a2 2 0 0 1 0 2.9L12 15z" />
  </Svg>
);

export const EraserIcon = () => (
  <Svg>
    <path d="M8.5 20H20" />
    <path d="M4.6 15.4l9.9-9.9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H7.8a2 2 0 0 1-1.4-.6l-1.8-1.8a.9.9 0 0 1 0-1.2z" />
    <path d="M9 11l5 5" />
  </Svg>
);

export const UndoIcon = () => (
  <Svg>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const RedoIcon = () => (
  <Svg>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </Svg>
);

export const MenuIcon = () => (
  <Svg>
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
  </Svg>
);

import type { ComponentChildren, JSX } from 'preact';

// Inline icon set: 24px grid, 1.7 stroke, round caps. One consistent hand.

type P = { size?: number };

const Svg = ({ children, size = 22 }: { children: ComponentChildren; size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const make = (body: ComponentChildren) => (p: P) => <Svg size={p.size}>{body}</Svg>;

export const SelectIcon = make(<path d="M6 3.5l12 7.2-5.3 1.4 3.1 5.6-2.4 1.3-3.1-5.6L6.5 17z" />);
export const PenIcon = make(
  <>
    <path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" />
    <path d="M13.5 7l3.5 3.5" />
  </>,
);
export const HighlighterIcon = make(
  <>
    <path d="M9 15l-3 3v2h4l2-2" />
    <path d="M9 15l7.5-9.5a2 2 0 0 1 3 0l.1.1a2 2 0 0 1 0 2.9L12 15z" />
  </>,
);
export const EraserIcon = make(
  <>
    <path d="M8.5 20H20" />
    <path d="M4.6 15.4l9.9-9.9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H7.8a2 2 0 0 1-1.4-.6l-1.8-1.8a.9.9 0 0 1 0-1.2z" />
    <path d="M9 11l5 5" />
  </>,
);
export const LassoIcon = make(
  <>
    <path d="M7.5 15.5C4.6 14.4 3 12.6 3 10.5 3 6.9 7 4 12 4s9 2.9 9 6.5S17 17 12 17c-1 0-2-.1-2.9-.3" stroke-dasharray="2.4 2.6" />
    <path d="M9 16.7c0 1.6-1 2.8-2.6 3.3" />
    <circle cx="8.3" cy="15.6" r="1.4" />
  </>,
);
export const UndoIcon = make(
  <>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </>,
);
export const RedoIcon = make(
  <>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </>,
);
export const PlusIcon = make(<path d="M12 5v14M5 12h14" />);
export const SearchIcon = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </>,
);
export const TagIcon = make(
  <>
    <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.4 7.4a1.5 1.5 0 0 1 0 2.1l-7.5 7.5a1.5 1.5 0 0 1-2.1 0L3.8 13.3a1 1 0 0 1-.3-.7z" />
    <circle cx="8.3" cy="8.3" r="1.3" />
  </>,
);
export const MoreIcon = make(
  <>
    <circle cx="5.5" cy="12" r="1.1" fill="currentColor" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.1" fill="currentColor" />
  </>,
);
export const GridIcon = make(
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>,
);
export const ChevronLeftIcon = make(<path d="M15 5l-7 7 7 7" />);
export const ChevronDownIcon = make(<path d="M6 9l6 6 6-6" />);
export const CloseIcon = make(<path d="M6 6l12 12M18 6L6 18" />);
export const CheckIcon = make(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const StickyIcon = make(
  <>
    <path d="M5 4h14a1 1 0 0 1 1 1v9.5L14.5 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M20 14.5h-4.5a1 1 0 0 0-1 1V20" />
  </>,
);
export const TextIcon = make(
  <>
    <path d="M5 6.5V5h14v1.5" />
    <path d="M12 5v14" />
    <path d="M9.5 19h5" />
  </>,
);
export const ShapesIcon = make(
  <>
    <circle cx="8.5" cy="8.5" r="4.5" />
    <rect x="11.5" y="11.5" width="8.5" height="8.5" rx="1.5" />
  </>,
);
export const ImageIcon = make(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.7" />
    <path d="M20.5 16l-5-5-8.5 8.5" />
  </>,
);
export const FrameIcon = make(<path d="M7 3v18M17 3v18M3 7h18M3 17h18" />);
export const CardIcon = make(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <path d="M3.5 9.5h17M7 13h6M7 16h4" />
  </>,
);
export const LinkIcon = make(
  <>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <path d="M7.8 16.2l8.4-8.4" />
  </>,
);
export const TrashIcon = make(
  <>
    <path d="M4.5 6.5h15" />
    <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5" />
    <path d="M6.5 6.5l.8 12.1A2 2 0 0 0 9.3 20.5h5.4a2 2 0 0 0 2-1.9l.8-12.1" />
  </>,
);
export const DuplicateIcon = make(
  <>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </>,
);
export const FrontIcon = make(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" fill="currentColor" fill-opacity="0.18" />
    <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
  </>,
);
export const BackIcon = make(
  <>
    <rect x="4" y="4" width="11" height="11" rx="2" fill="currentColor" fill-opacity="0.18" />
    <path d="M15 9h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-3" />
  </>,
);
export const CollapseIcon = make(<path d="M7 14l5-5 5 5" />);
export const ExpandIcon = make(<path d="M7 10l5 5 5-5" />);
export const FitIcon = make(
  <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />,
);
export const ShareIcon = make(
  <>
    <path d="M12 3.5v11" />
    <path d="M8 7.5l4-4 4 4" />
    <path d="M7.5 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1.5" />
  </>,
);
export const LineSolidIcon = make(<path d="M4 12h16" />);
export const LineDashedIcon = make(<path d="M4 12h3M10.5 12h3M17 12h3" />);
export const LineArrowIcon = make(
  <>
    <path d="M4 12h15" />
    <path d="M14.5 7.5L19.5 12l-5 4.5" />
  </>,
);
export const TemplateIcon = make(
  <>
    <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </>,
);
export const DownloadIcon = make(
  <>
    <path d="M12 4v11" />
    <path d="M7.5 10.5L12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </>,
);
export const UploadIcon = make(
  <>
    <path d="M12 15V4" />
    <path d="M7.5 8.5L12 4l4.5 4.5" />
    <path d="M5 19.5h14" />
  </>,
);
export const EditIcon = make(<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />);
export const ArrowUpIcon = make(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowDownIcon = make(<path d="M12 5v14M6 13l6 6 6-6" />);

export const ExpandScreenIcon = make(
  <>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </>,
);
export const ShrinkIcon = make(
  <>
    <path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" />
  </>,
);
export const DiceIcon = make(
  <>
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" />
    <circle cx="15" cy="15" r="1.2" fill="currentColor" />
    <circle cx="15" cy="9" r="1.2" fill="currentColor" />
    <circle cx="9" cy="15" r="1.2" fill="currentColor" />
  </>,
);
export const StarIcon = make(<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />);

export const SnapGridIcon = make(
  <>
    <circle cx="6" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="6" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="6" cy="18" r="1.1" fill="currentColor" stroke="none" />
    <rect x="10.5" y="10.5" width="9" height="9" rx="1.8" />
  </>,
);
export const AlignLeftIcon = make(<><path d="M4 4v16" /><rect x="7" y="6" width="11" height="4" rx="1" /><rect x="7" y="14" width="7" height="4" rx="1" /></>);
export const AlignCenterHIcon = make(<><path d="M12 4v16" /><rect x="5.5" y="6" width="13" height="4" rx="1" /><rect x="8" y="14" width="8" height="4" rx="1" /></>);
export const AlignRightIcon = make(<><path d="M20 4v16" /><rect x="6" y="6" width="11" height="4" rx="1" /><rect x="10" y="14" width="7" height="4" rx="1" /></>);
export const AlignTopIcon = make(<><path d="M4 4h16" /><rect x="6" y="7" width="4" height="11" rx="1" /><rect x="14" y="7" width="4" height="7" rx="1" /></>);
export const AlignMiddleVIcon = make(<><path d="M4 12h16" /><rect x="6" y="5.5" width="4" height="13" rx="1" /><rect x="14" y="8" width="4" height="8" rx="1" /></>);
export const AlignBottomIcon = make(<><path d="M4 20h16" /><rect x="6" y="6" width="4" height="11" rx="1" /><rect x="14" y="10" width="4" height="7" rx="1" /></>);
export const DistributeHIcon = make(<><path d="M4 4v16M20 4v16" /><rect x="9.5" y="7" width="5" height="10" rx="1" /></>);
export const DistributeVIcon = make(<><path d="M4 4h16M4 20h16" /><rect x="7" y="9.5" width="10" height="5" rx="1" /></>);
export const TidyIcon = make(<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>);
export const ArrangeIcon = make(<><path d="M4 4v16" /><rect x="7" y="5" width="12" height="5" rx="1.2" /><rect x="7" y="14" width="8" height="5" rx="1.2" /></>);

// Template icons
export const PersonIcon = make(
  <>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.5 20.5c.8-3.9 3.8-6 7.5-6s6.7 2.1 7.5 6" />
  </>,
);
export const PinIcon = make(
  <>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </>,
);
export const FlagIcon = make(
  <>
    <path d="M5 21V4" />
    <path d="M5 4.5c4.5-2 7 2 14 0v9c-7 2-9.5-2-14 0" />
  </>,
);
export const SparkleIcon = make(
  <path d="M12 3.5l1.9 5.2a2 2 0 0 0 1.2 1.2l5.2 1.9-5.2 1.9a2 2 0 0 0-1.2 1.2L12 20.1l-1.9-5.2a2 2 0 0 0-1.2-1.2L3.7 11.8l5.2-1.9a2 2 0 0 0 1.2-1.2z" />,
);
export const BoltIcon = make(<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />);
export const GemIcon = make(
  <>
    <path d="M7 4h10l3.5 5L12 20.5 3.5 9z" />
    <path d="M3.5 9h17M9.5 4L8 9l4 11.5L16 9l-1.5-5" />
  </>,
);
export const NoteIcon = make(
  <>
    <path d="M6 3.5h8.5L19 8v11.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
    <path d="M14 3.5V8.5h5M8.5 12.5h7M8.5 16h5" />
  </>,
);
export const BookIcon = make(
  <>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15.5H5.5A1.5 1.5 0 0 0 4 21z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15.5h5.5A1.5 1.5 0 0 1 20 21z" />
  </>,
);

export const TEMPLATE_ICONS: Record<string, (p: P) => JSX.Element> = {
  person: PersonIcon,
  pin: PinIcon,
  flag: FlagIcon,
  sparkle: SparkleIcon,
  bolt: BoltIcon,
  gem: GemIcon,
  note: NoteIcon,
  pencil: PenIcon,
  book: BookIcon,
  card: CardIcon,
};

export function TemplateGlyph({ name, size }: { name?: string; size?: number }) {
  const I = (name && TEMPLATE_ICONS[name]) || CardIcon;
  return <I size={size} />;
}

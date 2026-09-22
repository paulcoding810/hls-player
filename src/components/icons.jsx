/**
 * Inline SVG icon set — no icon package, no emoji, no text glyphs.
 * 24x24 viewBox, stroked with `currentColor`, sized by the caller.
 */
function Icon({ className = 'h-4 w-4', children }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const PrevIcon = (props) => (
  <Icon {...props}>
    <path d="M19 5v14l-10-7 10-7Z" />
    <path d="M5 5v14" />
  </Icon>
)

export const NextIcon = (props) => (
  <Icon {...props}>
    <path d="M5 5v14l10-7-10-7Z" />
    <path d="M19 5v14" />
  </Icon>
)

export const PlayIcon = (props) => (
  <Icon {...props}>
    <path d="M7 4.5v15l12-7.5-12-7.5Z" />
  </Icon>
)

export const CloseIcon = (props) => (
  <Icon {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Icon>
)

export const PlusIcon = (props) => (
  <Icon {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
)

export const PlaylistIcon = (props) => (
  <Icon {...props}>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3.5 6h.01" />
    <path d="M3.5 12h.01" />
    <path d="M3.5 18h.01" />
  </Icon>
)

export const SettingsIcon = (props) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M4 17h16" />
    <circle cx="9" cy="7" r="2.25" />
    <circle cx="15" cy="17" r="2.25" />
  </Icon>
)

export const TrashIcon = (props) => (
  <Icon {...props}>
    <path d="M4 7h16" />
    <path d="M9 7V5h6v2" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </Icon>
)

export const AlertIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4l9 16H3l9-16Z" />
    <path d="M12 10v4" />
    <path d="M12 17.5h.01" />
  </Icon>
)

export const PauseIcon = (props) => (
  <Icon {...props}>
    <path d="M9 5v14" />
    <path d="M15 5v14" />
  </Icon>
)

export const VolumeIcon = (props) => (
  <Icon {...props}>
    <path d="M4 10v4h3l4 3V7L7 10H4Z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
    <path d="M18 7a7 7 0 0 1 0 10" />
  </Icon>
)

export const VolumeMutedIcon = (props) => (
  <Icon {...props}>
    <path d="M4 10v4h3l4 3V7L7 10H4Z" />
    <path d="M15 10l4 4" />
    <path d="M19 10l-4 4" />
  </Icon>
)

export const FullscreenIcon = (props) => (
  <Icon {...props}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </Icon>
)

export const FullscreenExitIcon = (props) => (
  <Icon {...props}>
    <path d="M9 4v5H4" />
    <path d="M15 4v5h5" />
    <path d="M9 20v-5H4" />
    <path d="M15 20v-5h5" />
  </Icon>
)

export const LibraryIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13" width="7" height="7" rx="1.5" />
  </Icon>
)

export const EditIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M14.5 7.5l2 2" />
  </Icon>
)

export const SearchIcon = (props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l3.5 3.5" />
  </Icon>
)

export const CheckIcon = (props) => (
  <Icon {...props}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
)

export const RefreshIcon = (props) => (
  <Icon {...props}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4v4.5H15" />
  </Icon>
)

export const DownloadIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4v11" />
    <path d="M8 11.5l4 4 4-4" />
    <path d="M5 19h14" />
  </Icon>
)

export const UploadIcon = (props) => (
  <Icon {...props}>
    <path d="M12 15V4" />
    <path d="M8 7.5l4-4 4 4" />
    <path d="M5 19h14" />
  </Icon>
)

export const FilmIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M8 5v14" />
    <path d="M16 5v14" />
    <path d="M3 12h18" />
  </Icon>
)

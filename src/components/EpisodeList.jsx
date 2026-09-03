import { PlayIcon } from './icons'

export default function EpisodeList({ episodes, currentId, onSelect }) {
  if (!episodes.length) {
    return <p className="text-ink-faint text-sm">This movie has no episodes yet.</p>
  }

  return (
    <ol className="min-h-0 flex-1 overflow-y-auto">
      {episodes.map((episode, position) => {
        const isCurrent = episode.id === currentId
        return (
          <li key={episode.id}>
            <button
              type="button"
              onClick={() => onSelect(episode.id)}
              title={episode.src}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                isCurrent ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-elevated'
              }`}
            >
              {isCurrent ? (
                <PlayIcon className="h-3 w-3 shrink-0" />
              ) : (
                <span className="text-ink-faint w-3 shrink-0 text-center">{position + 1}</span>
              )}
              <span className="truncate">{episode.title}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Add/remove tags on the open note; each change persists to note metadata via the vault bridge. */
import { X } from 'lucide-react';
import { useState } from 'react';

export function TagEditor({
  path,
  initial,
  onSaved,
}: {
  path: string;
  initial: string[];
  /** Report the note's new content hash after a tag write, so the editor's conflict guard stays in sync. */
  onSaved?: (hash: string) => void;
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');

  async function commit(next: string[]) {
    const previous = tags;
    setTags(next); // optimistic
    try {
      const saved = await window.vault.setTags(path, next);
      setTags(saved.tags);
      onSaved?.(saved.hash);
    } catch (error) {
      console.error(error);
      setTags(previous); // roll back if the write failed (e.g. note vanished)
    }
  }

  function add() {
    const value = draft.trim();
    setDraft('');
    if (value && !tags.includes(value)) void commit([...tags, value]);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="tag-editor">
      {tags.map((tag) => (
        <span
          key={tag}
          className="bg-surface text-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs"
        >
          #{tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => void commit(tags.filter((t) => t !== tag))}
            className="hover:bg-edge hover:text-ink flex h-4 w-4 items-center justify-center rounded-full"
          >
            <X size={11} strokeWidth={2.5} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        placeholder="add tag…"
        aria-label="Add tag"
        className="text-ink placeholder:text-muted focus:border-edge w-24 border-transparent border-b bg-transparent text-xs outline-none"
      />
    </div>
  );
}

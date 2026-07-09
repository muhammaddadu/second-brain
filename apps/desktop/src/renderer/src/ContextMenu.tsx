/** A small positioned context menu. A transparent backdrop closes it on any outside click. */
export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-catcher backdrop, not a control */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop closes on click; Escape is not required for a transient menu */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <ul
        className="border-edge bg-paper fixed z-50 min-w-40 overflow-hidden rounded-md border py-1 text-sm shadow-lg"
        style={{ top: y, left: x }}
        data-testid="context-menu"
      >
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              className={`hover:bg-edge/60 block w-full px-3 py-1.5 text-left ${
                item.danger ? 'text-red-600 dark:text-red-400' : ''
              }`}
              onClick={() => {
                item.onClick();
                onClose();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

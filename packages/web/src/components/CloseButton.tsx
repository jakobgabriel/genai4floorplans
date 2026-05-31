// Standardized compact icon button for dismissing modals/popovers. Small, square
// and consistent — replaces the oversized ad-hoc "✕" buttons.
export function CloseButton({ onClick, title = "Close" }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="btn-close" onClick={onClick} title={title} aria-label={title}>
      ✕
    </button>
  );
}

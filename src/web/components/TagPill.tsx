interface TagPillProps {
  tag: string;
  removable?: boolean;
  onRemove?: (tag: string) => void;
}

export function TagPill({ tag, removable = false, onRemove }: TagPillProps) {
  const slug = tag.toLowerCase().replace(/\s+/g, '-');
  return (
    <span
      data-testid={`tag-pill-${slug}`}
      className="inline-flex items-center gap-1 rounded-full bg-[#30363d] px-2 py-0.5 text-xs text-[#e6edf3]"
    >
      <span data-testid={`tag-pill-${slug}-label`}>{tag}</span>
      {removable && onRemove && (
        <button
          data-testid={`tag-pill-${slug}-remove`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tag);
          }}
          className="ml-0.5 text-[#8b949e] hover:text-[#f85149] cursor-pointer"
          aria-label={`Remove ${tag}`}
        >
          ×
        </button>
      )}
    </span>
  );
}

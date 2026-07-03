import { Tag, X } from "lucide-react";

export default function TagFilter({ availableTags = [], selectedTag = "", onTagSelect }) {
  const tags = availableTags.slice(0, 12);
  if (!tags.length) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", margin: "0.4rem 0 0.8rem 0" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-secondary)" }}>
        <Tag size={12} /> Equipment tags:
      </span>

      {tags.map((tag) => {
        const active = selectedTag === tag;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onTagSelect?.(active ? "" : tag)}
            title={active ? `Remove ${tag} filter` : `Filter equipment by ${tag}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "999px",
              fontSize: "0.7rem",
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              border: active ? "1px solid #2563eb" : "1px solid #dbe3ef",
              background: active ? "#2563eb" : "var(--bg-card)",
              color: active ? "#fff" : "var(--text-main)",
            }}
          >
            #{tag}
            {active && <X size={10} />}
          </button>
        );
      })}

      {selectedTag && (
        <button type="button" onClick={() => onTagSelect?.("")} style={{ fontSize: "0.7rem", color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
          Clear
        </button>
      )}
    </div>
  );
}

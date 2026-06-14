import { Tag, X } from "lucide-react";

/**
 * Barre de tags équipement cliquables.
 *
 * - Affiche tous les tags disponibles (issus des données de la DataPlatform).
 * - Cliquer sur un tag filtre toute la page sur les équipements portant ce tag.
 * - Re-cliquer sur le tag actif (ou sur le ✕) retire le filtre.
 *
 * Utilisé sur : Dashboard, Industry Overview, Equipment Status.
 */
export default function TagFilter({
  availableTags = [],
  selectedTag = "",
  onTagSelect,
}) {
  if (!availableTags.length) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "8px",
        margin: "0.6rem 0 1rem 0",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "0.78rem",
          fontWeight: 700,
          color: "var(--text-secondary)",
        }}
      >
        <Tag size={14} /> Tags:
      </span>

      {availableTags.map((tag) => {
        const active = selectedTag === tag;

        return (
          <button
            key={tag}
            type="button"
            onClick={() => onTagSelect?.(active ? "" : tag)}
            title={
              active
                ? `Remove tag filter "${tag}"`
                : `Show only equipment tagged "${tag}"`
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 12px",
              borderRadius: "999px",
              fontSize: "0.78rem",
              fontWeight: active ? 700 : 500,
              cursor: "pointer",
              border: active ? "1.5px solid #2563eb" : "1px solid #dbe3ef",
              background: active ? "#2563eb" : "var(--bg-card)",
              color: active ? "#fff" : "var(--text-main)",
              boxShadow: active
                ? "0 0 0 3px rgba(37, 99, 235, 0.12)"
                : "none",
              transition: "all 0.15s ease",
            }}
          >
            #{tag}
            {active && <X size={12} />}
          </button>
        );
      })}

      {selectedTag && (
        <button
          type="button"
          onClick={() => onTagSelect?.("")}
          style={{
            fontSize: "0.75rem",
            color: "#ef4444",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Clear tag
        </button>
      )}
    </div>
  );
}

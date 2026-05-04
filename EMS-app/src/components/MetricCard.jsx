function getEnergyIcon(title) {
  const lower = title.toLowerCase();

  if (lower.includes("électricité") || lower.includes("electric")) return "⚡";
  if (lower.includes("eau") || lower.includes("water")) return "💧";
  if (lower.includes("co2") || lower.includes("co₂") || lower.includes("carbon")) return "🌱";
  if (lower.includes("vapeur") || lower.includes("steam")) return "♨️";
  if (lower.includes("solaire") || lower.includes("solar")) return "☀️";
  if (lower.includes("fuel") || lower.includes("carburant")) return "🔥";
  if (lower.includes("gaz") || lower.includes("gas")) return "🛢️";
  if (lower.includes("hydrog")) return "🧪";
  if (lower.includes("diesel")) return "⛽";
  if (lower.includes("coût") || lower.includes("cost")) return "💰";

  return "🔋";
}

export default function MetricCard({ id, title, value, unit, onRemoveEnergy }) {
  return (
    <div className="card">
      <div className="card-top">
        <h4>
          <span className="card-icon">{getEnergyIcon(title)}</span>
          {title}
        </h4>

        {onRemoveEnergy && (
          <button
            className="remove-energy-btn"
            onClick={() => onRemoveEnergy(id)}
            type="button"
            title="Remove energy"
          >
            ✕
          </button>
        )}
      </div>

      <p>
        {typeof value === "number" ? value.toFixed(2) : value} {unit}
      </p>
    </div>
  );
}
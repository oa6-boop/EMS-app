// ─── Tooltip partagé pour tous les graphiques SVG de l'application ───────────
// Usage dans un chart :
//   const [hover, setHover] = useState(null);
//   <svg onMouseMove={...} onMouseLeave={() => setHover(null)}>
//     ...
//     {hover && <SvgHoverTooltip {...hover} W={W} H={H} />}
//   </svg>
//
// svgEventPoint(evt, W, H) convertit la position de la souris en coordonnées
// du viewBox (les charts utilisent preserveAspectRatio="none" → mapping linéaire).

export function svgEventPoint(evt, W, H) {
  const rect = evt.currentTarget.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * W;
  const y = ((evt.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

// Trouve l'index du point le plus proche pour un layout linéaire
// x = origin + i * step  (step = largeur utile / (n - 1))
export function nearestIndex(x, origin, usableWidth, count) {
  if (count <= 1) return 0;
  const step = usableWidth / (count - 1);
  const i = Math.round((x - origin) / step);
  return Math.max(0, Math.min(count - 1, i));
}

export function SvgHoverTooltip({
  x,
  y,
  lines = [],
  W = 760,
  H = 240,
  color = "#2563eb",
  showGuide = true,
  guideTop = 10,
  guideBottom = null,
}) {
  if (!lines.length) return null;

  const FONT = 11;
  const PAD = 8;
  const LINE_H = 15;
  const boxW = Math.max(...lines.map((l) => String(l).length)) * (FONT * 0.62) + PAD * 2;
  const boxH = lines.length * LINE_H + PAD * 1.5;

  // Étiquette à droite du point, basculée à gauche près du bord droit,
  // et clampée verticalement pour rester dans le graphe.
  let bx = x + 12;
  if (bx + boxW > W - 4) bx = x - boxW - 12;
  if (bx < 4) bx = 4;
  let by = y - boxH - 10;
  if (by < 4) by = y + 14;
  if (by + boxH > H - 4) by = Math.max(4, H - boxH - 4);

  const bottom = guideBottom == null ? H - 25 : guideBottom;

  return (
    <g style={{ pointerEvents: "none" }}>
      {showGuide && (
        <line
          x1={x} y1={guideTop} x2={x} y2={bottom}
          stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
        />
      )}
      <circle cx={x} cy={y} r="5" fill={color} stroke="white" strokeWidth="2" />
      <rect
        x={bx} y={by} width={boxW} height={boxH} rx="6"
        fill="rgba(15, 23, 42, 0.92)" stroke={color} strokeWidth="1"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={bx + PAD}
          y={by + PAD + (i + 0.62) * LINE_H}
          fontSize={FONT}
          fill={i === 0 ? "#93c5fd" : "#f1f5f9"}
          fontWeight={i === 0 ? 700 : 400}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

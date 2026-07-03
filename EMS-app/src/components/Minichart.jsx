export default function MiniChart({ title, data = [] }) {
  return (
    <div className="chart">
      <h4>{title}</h4>
      <div className="bars">
        {data.map((value, index) => (
          <div key={index} style={{ height: `${value}%` }} title={`${title || "Chart"} — Point ${index + 1}: ${value}%`}></div>
        ))}
      </div>
    </div>
  );
}
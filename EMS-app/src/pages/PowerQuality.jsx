function LineChart({ title, data = [], unit = "", colorClass = "", nominal = null }) {
  const W = 760, H = 220, P = 30;
  const hasData = data.length >= 2;
  const vals = hasData ? data : [0, 0];
  const minV = Math.min(...vals), maxV = Math.max(...vals), rng = maxV - minV || 1;
  const toX = (i, n) => P + (i * (W - P * 2)) / Math.max(n - 1, 1);
  const toY = (v)    => H - P - ((v - minV) / rng) * (H - P * 2);
  const points = vals.map((v, i) => `${toX(i, vals.length).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const nomY = nominal != null && maxV !== minV ? toY(nominal) : null;

  return (
    <div className={`svg-chart-card ${colorClass}`}>
      <div className="svg-chart-head">
        <h4>{title}</h4>
        <span>{hasData ? `${vals[vals.length-1].toFixed(unit === "" ? 3 : 1)} ${unit}` : "Waiting..."}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="svg-line-chart" preserveAspectRatio="none">
        {[0,1,2,3,4].map(r => (
          <line key={r} x1={P} y1={P + r*((H-P*2)/4)} x2={W-P} y2={P + r*((H-P*2)/4)} className="svg-grid-line" />
        ))}
        {nomY != null && (
          <line x1={P} y1={nomY} x2={W-P} y2={nomY} stroke="#f6ad55" strokeWidth="1" strokeDasharray="6,4" opacity="0.7" />
        )}
        {hasData && <polyline fill="none" points={points} className="svg-main-line" />}
        {hasData && vals.map((v, i) => (
          <circle key={i} cx={toX(i, vals.length)} cy={toY(v)} r="3" className="svg-point" />
        ))}
        {Array.from({ length: Math.min(7, vals.length) }, (_, k) => {
          const idx = Math.min(Math.floor(k * vals.length / Math.max(6, 1)), vals.length - 1);
          return (
            <text key={k} x={toX(idx, vals.length)} y={H-6} textAnchor="middle" className="svg-axis-label">
              {k === 6 ? "now" : `-${(6-k)*2}m`}
            </text>
          );
        })}
      </svg>
      {!hasData && <p style={{ textAlign:"center", color:"#888", fontSize:"0.85rem", marginTop:"-0.5rem" }}>Waiting for DataPlatform data...</p>}
    </div>
  );
}

export default function PowerQuality({ data = {}, powerQualityHistory = [], selectedLineLabel = "Production Line 1" }) {
  const voltages     = powerQualityHistory.map(p => p.voltage      ?? 0).filter(v => v > 0);
  const powerFactors = powerQualityHistory.map(p => p.power_factor ?? 0).filter(v => v > 0);
  const frequencies  = powerQualityHistory.map(p => p.frequency    ?? 50);
  const kwValues     = powerQualityHistory.map(p => p.kw).filter(v => v != null);

  const tension   = data.tension          ?? 415;
  const frequence = data.frequence        ?? 50;
  const pf        = data.facteurPuissance ?? 0.94;
  const thd       = data.thd             ?? 3.2;

  const voltStatus = tension  >= 380 && tension  <= 440 ? "Stable ✓"   : "Out of range ⚠";
  const freqStatus = frequence >= 49 && frequence <= 51  ? "Normal ✓"   : "Anomaly ⚠";
  const pfStatus   = pf >= 0.90 ? "Good ✓" : pf >= 0.85 ? "Acceptable" : "Low ⚠";
  const thdStatus  = thd <= 5  ? "Compliant ✓" : "High ⚠";

  const pfColor   = pf >= 0.90 ? "#38a169" : pf >= 0.85 ? "#d69e2e" : "#e53e3e";
  const thdColor  = thd <= 5   ? "#38a169" : "#e53e3e";
  const voltColor = tension >= 380 && tension <= 440 ? "#38a169" : "#e53e3e";
  const freqColor = frequence >= 49 && frequence <= 51 ? "#38a169" : "#e53e3e";

  return (
    <div className="overview-page">
      <div className="section-title-wrap">
        <h1>Power Quality</h1>
        <p>
          Electrical measurements — {selectedLineLabel}
          <br />
          
        </p>
      </div>

      <section className="section-block">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon blue">⚡</div>
            <div className="kpi-badge" style={{ background: voltColor }}>{voltStatus}</div>
            <h3 style={{ color: voltColor }}>{tension.toFixed(1)} V</h3>
            <p>Voltage</p>
            <span>Nominal: 415 V · Range: 380–440 V</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon emerald">〰</div>
            <div className="kpi-badge" style={{ background: freqColor }}>{freqStatus}</div>
            <h3 style={{ color: freqColor }}>{frequence.toFixed(2)} Hz</h3>
            <p>Frequency</p>
            <span>Nominal: 50 Hz · Range: 49–51 Hz</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon purple">↗</div>
            <div className="kpi-badge" style={{ background: pfColor }}>{pfStatus}</div>
            <h3 style={{ color: pfColor }}>{pf.toFixed(3)}</h3>
            <p>Power Factor</p>
            <span>cos(φ) = kW / √(kW²+kVAR²) · Target: ≥0.90</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon orange">⚠</div>
            <div className="kpi-badge" style={{ background: thdColor }}>{thdStatus}</div>
            <h3 style={{ color: thdColor }}>{thd.toFixed(2)} %</h3>
            <p>Total Harmonic Distortion</p>
            <span>IEC 61000 Limit: 5%</span>
          </div>
        </div>
      </section>

      <div className="section-title-wrap" style={{ marginTop: "1.5rem" }}>
        <h2>Real-Time Trends</h2>
        <p>
          {" "}
          {powerQualityHistory.length > 0 ? `${powerQualityHistory.length} data points` : "Waiting..."}
        </p>
      </div>

      <div className="power-quality-grid">
        <LineChart title="Voltage Trend"       data={voltages}     unit="V"  colorClass="chart-blue"   nominal={415} />
        <LineChart title="Frequency Trend"     data={frequencies}  unit="Hz" colorClass="chart-cyan"   nominal={50} />
        <LineChart title="Power Factor Trend"  data={powerFactors} unit=""   colorClass="chart-purple"  nominal={0.9} />
        {kwValues.length > 0 && (
          <LineChart title="Active Power Trend" data={kwValues} unit="kW" colorClass="chart-orange" />
        )}
      </div>

      <div className="two-column-layout" style={{ marginTop: "1.5rem" }}>
        <section className="panel-card">
          <div className="panel-head">
            <div><h2>Electrical Parameters</h2><p>Latest values from  registers</p></div>
            <span className="live-label">● Live</span>
          </div>
          <div className="mini-metrics-grid">
            <div className="mini-metric">
              <h4>Voltage</h4>
              <ul>
                <li>Current  <strong style={{ color: voltColor }}>{tension.toFixed(1)} V</strong></li>
                <li>Nominal  <strong>415.0 V</strong></li>
                <li>Delta    <strong>{(tension - 415).toFixed(1)} V</strong></li>
                <li>Status   <strong style={{ color: voltColor }}>{voltStatus}</strong></li>
              </ul>
            </div>
            <div className="mini-metric">
              <h4>Frequency</h4>
              <ul>
                <li>Current  <strong style={{ color: freqColor }}>{frequence.toFixed(3)} Hz</strong></li>
                <li>Nominal  <strong>50.000 Hz</strong></li>
                <li>Delta    <strong>{(frequence - 50).toFixed(3)} Hz</strong></li>
                <li>Status   <strong style={{ color: freqColor }}>{freqStatus}</strong></li>
              </ul>
            </div>
            <div className="mini-metric">
              <h4>Power Factor</h4>
              <ul>
                <li>Current  <strong style={{ color: pfColor }}>{pf.toFixed(3)}</strong></li>
                <li>Target   <strong>≥ 0.900</strong></li>
                <li>Score    <strong>{(pf * 100).toFixed(1)}%</strong></li>
                <li>Status   <strong style={{ color: pfColor }}>{pfStatus}</strong></li>
              </ul>
            </div>
            <div className={`mini-metric ${thd > 5 ? "warning" : ""}`}>
              <h4>THD</h4>
              <ul>
                <li>Current  <strong style={{ color: thdColor }}>{thd.toFixed(2)}%</strong></li>
                <li>Limit    <strong>5.00%</strong></li>
                <li>Margin   <strong>{(5 - thd).toFixed(2)}%</strong></li>
                <li>Status   <strong style={{ color: thdColor }}>{thdStatus}</strong></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-head">
            <div><h2>Quality Score</h2><p>Overall electrical stability</p></div>
          </div>
          <div className="carbon-kpis">
            <div className="carbon-card">
              <h4>Voltage Stability</h4>
              <strong style={{ color: voltColor }}>
                {tension >= 380 && tension <= 440
                  ? `${(100 - Math.abs((tension - 415) / 415) * 100).toFixed(1)}%`
                  : "OUT OF RANGE"}
              </strong>
              <span>Nominal ±6% = 380–440 V</span>
            </div>
            <div className="carbon-card">
              <h4>Frequency Control</h4>
              <strong style={{ color: freqColor }}>
                {frequence >= 49 && frequence <= 51
                  ? `${(100 - Math.abs((frequence - 50) / 50) * 100).toFixed(1)}%`
                  : "OUT OF RANGE"}
              </strong>
              <span>Nominal ±2% = 49–51 Hz</span>
            </div>
            <div className="carbon-card">
              <h4>Power Factor Score</h4>
              <strong style={{ color: pfColor }}>{(pf * 100).toFixed(1)}%</strong>
              <span>Target: ≥ 90%</span>
            </div>
            <div className="carbon-card">
              <h4>THD Compliance</h4>
              <strong style={{ color: thdColor }}>{thd <= 5 ? "PASS" : "FAIL"}</strong>
              <span>IEC 61000 limit: 5%</span>
            </div>
            
          </div>
        </section>
      </div>
    </div>
  );
}
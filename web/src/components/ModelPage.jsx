import { useMemo } from "react";
import { D, M, NEXT, byRound, scenario, shortName } from "../lib/model";

const LABELS = ["Gap to pole (%)", "Grid position", "Team gap to pole (%)", "Rain", "Temperature"];
const rid = (s) => { const [y, r] = s.split("-"); return `${y} round ${+r}`; };

function Importance() {
  const W = 460, rowH = 32, l = 150, r = 56, H = LABELS.length * rowH + 6, mx = Math.max(...M.importance);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="Feature importance">
      {LABELS.map((name, i) => {
        const v = M.importance[i], w = mx ? (v / mx) * (W - l - r) : 0, y = 3 + i * rowH;
        return (
          <g key={name}>
            <text className="lbl" x={l - 8} y={y + rowH / 2 + 4} textAnchor="end">{name}</text>
            <rect x={l} y={y + 7} width={Math.max(w, 1)} height={rowH - 14} fill="var(--red)" />
            <text x={l + w + 6} y={y + rowH / 2 + 4}>{(v * 100).toFixed(1)}%</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ModelPage({ onReplay }) {
  const m = M.metrics, refLap = (byRound[NEXT]?.poleTime || 95) * M.qualiToRaceFactor;
  const backtest = useMemo(() => Object.keys(D.backtest).map(Number).sort((a, b) => a - b).map((rd) => {
    const sc = scenario(rd, null), pred = sc.rows.slice(0, 3).map((x) => x.Driver);
    const act = sc.rows.filter((x) => Number.isFinite(x.actual)).sort((a, b) => a.actual - b.actual).slice(0, 3).map((x) => x.Driver);
    return { rd, sc, pred, act, win: pred[0] === act[0], hits: pred.filter((d) => act.includes(d)).length };
  }), []);
  const stats = [
    [`${m.mae.toFixed(3)}%`, `Mean error on race pace, about ${((m.mae / 100) * refLap).toFixed(2)} s/lap`],
    [m.r2.toFixed(2), "R² on held-out races"],
    [`${m.naiveMae.toFixed(3)}%`, "Baseline: predict the average"],
    [`${m.qualiOnlyMae.toFixed(3)}%`, "Baseline: qualifying gap only"],
  ];

  return (
    <main className="page" id="page-model">
      <div className="sim-head">
        <span className="eyebrow">XGBoost, from F1.ipynb</span>
        <h1>How good is the model?</h1>
      </div>
      <div className="cards">
        <div className="panel">
          <h3>Accuracy on held-out races</h3>
          <div className="stats">{stats.map(([v, k]) => <div className="stat" key={k}><span className="v num">{v}</span><span className="k">{k}</span></div>)}</div>
          <p className="muted" style={{ fontSize: ".85rem" }}>
            Trained on {m.trainRows} driver-races from {m.races - m.testRaces.length} races; tested on {m.testRows} from {m.testRaces.length} races it never saw: {m.testRaces.join(", ")}.
          </p>
        </div>
        <div className="panel"><h3>Feature importance (gain)</h3><Importance /></div>
      </div>
      <div className="panel">
        <div className="row between">
          <h3>2026 so far: predicted vs actual</h3>
          <span className="muted" style={{ fontSize: ".8rem" }}>Model only, no boosts. Races marked "trained on" were part of the training data.</span>
        </div>
        <div className="scroll">
          <table className="t">
            <thead><tr><th>Rd</th><th>Race</th><th>Data</th><th>Predicted podium</th><th>Actual podium</th><th className="r">Winner right</th><th className="r">Podium hits</th><th /></tr></thead>
            <tbody>
              {backtest.map((b) => (
                <tr key={b.rd}>
                  <td className="num">{b.rd}</td><td>{shortName(b.sc.t)}</td>
                  <td><span className={"chip" + (b.sc.inTrain ? "" : " live")}>{b.sc.inTrain ? "Trained on" : "Held out"}</span></td>
                  <td>{b.pred.join(" · ")}</td><td>{b.act.join(" · ")}</td>
                  <td className={"r " + (b.win ? "up" : "muted")}>{b.win ? "Yes" : "No"}</td>
                  <td className="r num">{b.hits}/3</td>
                  <td><button type="button" onClick={() => onReplay(b.rd)}>Replay</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <h3>How the forecast is made</h3>
        <ol className="notes">
          <li>Training data comes from FastF1: every race from {rid(m.firstRace)} to {rid(m.lastRace)}, one row per driver. Inputs are that weekend's qualifying gap to pole, grid slot, the team's best qualifying gap, whether it rained, and air temperature. The target is the driver's median green-flag race lap, as % slower than the fastest driver.</li>
          <li>XGBoost settings, monotone constraints, the ×10 scaling of qualifying gap and grid slot, and the race-grouped 80/20 split follow the original notebook. The trained trees run in your browser, so every input change reruns the same model.</li>
          <li>Predicted lap = wet-adjusted pole time × {M.qualiToRaceFactor.toFixed(4)} (median race-pace-to-pole ratio in the training races) × (1 + predicted %).</li>
          <li>At 70% chance of rain or more, qualifying times are multiplied by each driver's wet factor before gaps are computed.</li>
          <li>The regulation-change boost is added after the model, scaled by the boost weight.</li>
          <li>The simulator gives each car its own lap-by-lap times around its predicted pace, so battles happen mid-race while the total race time matches the model. It has no pit stops, safety cars or tyre wear, so it shows pace, not strategy.</li>
          <li>Upcoming rounds after the next race have no qualifying yet. They use the Inputs grid and the circuit's 2025 pole time as placeholders.</li>
        </ol>
      </div>
      <footer>Unofficial fan project, not affiliated with Formula 1. Timing data via FastF1; weather via OpenWeather.</footer>
    </main>
  );
}

import { useMemo } from "react";
import { D, M, MODELS, NEXT, P, SECONDARY, byRound, scenario, shortName } from "../lib/model";
import { ModelSwitch } from "./SimulatorPage";

const LABELS = ["Gap to pole (%)", "Grid position", "Team gap to pole (%)", "Rain", "Temperature"];
const rid = (s) => { const [y, r] = s.split("-"); return `${y} round ${+r}`; };

function Importance() {
  // XGBoost (gain) and Random Forest (impurity) importance, side by side per feature
  const W = 480, rowH = 40, l = 150, r = 56, H = LABELS.length * rowH + 30;
  const mx = Math.max(...M.importance, ...M.rf.importance);
  const bar = (v) => (mx ? (v / mx) * (W - l - r) : 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="Feature importance for both models">
      {LABELS.map((name, i) => {
        const y = 4 + i * rowH, a = M.importance[i], b = M.rf.importance[i];
        return (
          <g key={name}>
            <text className="lbl" x={l - 8} y={y + rowH / 2 + 2} textAnchor="end">{name}</text>
            <rect x={l} y={y + 6} width={Math.max(bar(a), 1)} height={11} fill="var(--red)" />
            <text x={l + bar(a) + 6} y={y + 15}>{(a * 100).toFixed(1)}%</text>
            <rect x={l} y={y + 20} width={Math.max(bar(b), 1)} height={11} fill="#d9d9db" />
            <text x={l + bar(b) + 6} y={y + 29}>{(b * 100).toFixed(1)}%</text>
          </g>
        );
      })}
      <rect x={l} y={H - 18} width="10" height="10" fill="var(--red)" /><text x={l + 15} y={H - 9}>XGBoost</text>
      <rect x={l + 90} y={H - 18} width="10" height="10" fill="#d9d9db" /><text x={l + 105} y={H - 9}>Random Forest</text>
    </svg>
  );
}

export default function ModelPage({ onReplay, model, setModel }) {
  const m = M.metrics, refLap = (byRound[NEXT]?.poleTime || 95) * M.qualiToRaceFactor;
  const backtest = useMemo(() => Object.keys(D.backtest).map(Number).sort((a, b) => a - b).map((rd) => {
    const sc = scenario(rd, null, model === "main" ? "avg" : model), pred = sc.rows.slice(0, 3).map((x) => x.Driver);
    const act = sc.rows.filter((x) => Number.isFinite(x.actual)).sort((a, b) => a.actual - b.actual).slice(0, 3).map((x) => x.Driver);
    return { rd, sc, pred, act, win: pred[0] === act[0], hits: pred.filter((d) => act.includes(d)).length };
  }), [model]);
  const stats = [
    [`${m.mae.toFixed(3)}%`, `Mean error on race pace, about ${((m.mae / 100) * refLap).toFixed(2)} s/lap`],
    [m.r2.toFixed(2), "R² on held-out races"],
    [`${m.naiveMae.toFixed(3)}%`, "Baseline: predict the average"],
    [`${m.qualiOnlyMae.toFixed(3)}%`, "Baseline: qualifying gap only"],
  ];

  return (
    <main className="page" id="page-model">
      <div className="sim-head">
        <span className="eyebrow">Formula 1 GP Predictor + secondary models</span>
        <h1>How good is the model?</h1>
      </div>
      {P && (
        <div className="panel">
          <div className="row between"><h3>Main model: Formula 1 GP Predictor</h3><span className="chip live">Default</span></div>
          <div className="stats q-stats">
            <div className="stat"><span className="v num">{Math.round(P.backtest.winner_picked * 100)}%</span><span className="k">Winners picked ({P.backtest.races}-race backtest)</span></div>
            <div className="stat"><span className="v num">{P.backtest.podium_hits.toFixed(1)}/3</span><span className="k">Podium drivers right per race</span></div>
            <div className="stat"><span className="v num">{P.backtest.finish_order_spearman.toFixed(2)}</span><span className="k">Finish-order correlation (Spearman)</span></div>
            <div className="stat"><span className="v num">{P.training_races}</span><span className="k">Races in training data</span></div>
          </div>
          <p className="muted" style={{ fontSize: ".85rem" }}>{P.model}. Prediction for the {P.event.name} generated {P.generated_utc} on a {P.grid_source} grid. It comes from the Formula 1 GP Predictor notebook and is updated there; this site shows its output. Its backtest uses different races from the secondary models below, so the numbers are not directly comparable.</p>
        </div>
      )}
      <div className="cards">
        <div className="panel">
          <h3>XGBoost accuracy on held-out races (secondary)</h3>
          <div className="stats">{stats.map(([v, k]) => <div className="stat" key={k}><span className="v num">{v}</span><span className="k">{k}</span></div>)}</div>
          <p className="muted" style={{ fontSize: ".85rem" }}>
            Trained on {m.trainRows} driver-races from {m.races - m.testRaces.length} races; tested on {m.testRows} from {m.testRaces.length} races it never saw: {m.testRaces.join(", ")}.
          </p>
        </div>
        <div className="panel"><h3>Feature importance</h3><Importance /></div>
      </div>
      <div className="panel">
        <div className="row between"><h3>Secondary models compared</h3><ModelSwitch value={model} onChange={setModel} /></div>
        <div className="scroll">
          <table className="t">
            <thead><tr><th>Model</th><th className="r">Error on race pace</th><th className="r">About</th><th className="r">R²</th><th>Notes</th></tr></thead>
            <tbody>
              {[["xgb", "Gradient-boosted trees with monotone constraints (slower qualifying can never predict a faster race)."],
                ["rf", "150 independent trees averaged; no monotone constraints, so it can pick up odd patterns."],
                ["avg", "Mean of the two predictions. Usually the safest choice."]].map(([k, note]) => {
                const m = M.models[k], best = Math.min(...Object.values(M.models).map((x) => x.mae)) === m.mae;
                return (
                  <tr key={k} style={model === k ? { background: "rgba(225,6,0,.08)" } : undefined}>
                    <td><b>{MODELS[k]}</b>{best ? <span className="chip live" style={{ marginLeft: 8 }}>Most accurate</span> : null}</td>
                    <td className="r num">{m.mae.toFixed(3)}%</td>
                    <td className="r num">{((m.mae / 100) * refLap).toFixed(2)} s/lap</td>
                    <td className="r num">{m.r2.toFixed(2)}</td>
                    <td className="muted" style={{ whiteSpace: "normal", minWidth: 220 }}>{note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: ".82rem" }}>All three are scored on the same {m.testRaces.length} held-out races. The selected model drives the simulator and the table below.</p>
      </div>
      <div className="panel">
        <div className="row between">
          <h3>2026 so far: predicted vs actual ({SECONDARY[model] || "Average"})</h3>
          <span className="muted" style={{ fontSize: ".8rem" }}>Secondary model. Races marked "trained on" were part of the training data.</span>
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
          <li>The simulator gives each car its own lap-by-lap times around its predicted pace, so battles happen mid-race while the total race time matches the model. It has no pit stops, safety cars or tyre wear, so it shows pace, not strategy.</li>
          <li>Upcoming rounds after the next race have no qualifying yet. They use the Inputs grid and the circuit's 2025 pole time as placeholders.</li>
        </ol>
      </div>
      <footer>Unofficial fan project, not affiliated with Formula 1. Timing data via FastF1; weather via OpenWeather.</footer>
    </main>
  );
}

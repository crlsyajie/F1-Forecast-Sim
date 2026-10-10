import { useMemo } from "react";
import { D, MODELS, P, byRound, predictorGap, scenario } from "../lib/model";
import { NAMES, tc } from "../lib/constants";
import { ModelSwitch } from "./SimulatorPage";

const fmtGap = (s) => (s < 0.0005 ? "POLE" : "+" + s.toFixed(3));
const fmtTime = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}`; };

function Schedule() {
  const now = Date.now();
  const items = [
    ["Practice 1", "2026-10-09T08:30:00Z"], ["Sprint Qualifying", "2026-10-09T12:30:00Z"], ["Sprint", "2026-10-10T09:00:00Z"],
    ["Qualifying", "2026-10-10T13:00:00Z"], ["Race", "2026-10-11T12:00:00Z"],
  ];
  return (
    <div className="sched">
      {items.map(([name, iso]) => {
        const t = new Date(iso), done = t.getTime() + 75 * 60e3 < now;
        const local = t.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" });
        return (
          <div key={name} className={done ? "done" : ""}>
            <b>{name}</b><span>{local} SGT</span><span className={"chip" + (done ? " done" : "")}>{done ? "Done" : "Upcoming"}</span>
          </div>
        );
      })}
    </div>
  );
}

function PredictorQualifying() {
  const rows = P.qualifying_prediction;
  const bt = P.backtest || {};
  const pct = (v) => `${Math.round(v * 100)}%`;
  return (
    <div className="panel">
      <div className="row between">
        <h2>Qualifying prediction</h2>
        <span className="muted" style={{ fontSize: ".8rem" }}>Formula 1 GP Predictor (main model) · generated {P.generated_utc}</span>
      </div>
      <div className="stats q-stats">
        <div className="stat"><span className="v num">{pct(bt.winner_picked)}</span><span className="k">Race winners picked ({bt.races}-race backtest)</span></div>
        <div className="stat"><span className="v num">{pct(bt.pole_sitter_won)}</span><span className="k">Pole sitter went on to win</span></div>
        <div className="stat"><span className="v num">{bt.podium_hits?.toFixed(1)}/3</span><span className="k">Podium drivers right per race</span></div>
        <div className="stat"><span className="v num">{P.training_races}</span><span className="k">Races in training data</span></div>
      </div>
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Pos</th><th>Driver</th><th className="hide-sm">Team</th><th className="r">Predicted lap</th><th className="r">Gap</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.Driver}>
                <td className="num"><b>{x.PredictedPosition}</b></td>
                <td><i className="sw" style={{ "--tc": tc(x.Team) }} /> <b>{x.Driver}</b> <span className="muted hide-sm">{NAMES[x.Driver] || ""}</span></td>
                <td className="muted hide-sm">{x.Team}</td>
                <td className="r num">{fmtTime(x["PredictedQ (s)"])}</td>
                <td className="r num">{fmtGap(x["Gap (s)"])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: ".82rem" }}>From the Formula 1 GP Predictor notebook. Switch to a secondary model above to see this site's own practice-based qualifying model.</p>
    </div>
  );
}

function Qualifying({ model }) {
  const Q = D.quali;
  const rows = useMemo(() => {
    const r = [...Q.rows].sort((a, b) => a[model] - b[model]);
    const best = r[0][model];
    return r.map((x, i) => ({ ...x, pos: i + 1, gapS: ((x[model] - best) / 100) * Q.poleEstimate, time: Q.poleEstimate * (1 + (x[model] - best) / 100) }));
  }, [Q, model]);
  const hasActual = rows.some((x) => x.actual);
  const m = Q.metrics, maxGap = Math.max(...rows.map((x) => x.gapS)) || 1;
  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <div className="panel">
      <div className="row between">
        <h2>Qualifying prediction</h2>
        <span className="muted" style={{ fontSize: ".8rem" }}>From {Q.session} pace and recent qualifying form · {MODELS[model]}</span>
      </div>
      <div className="stats q-stats">
        <div className="stat"><span className="v num">{pct(m[model].pole)}</span><span className="k">Pole sitter called right (held-out races)</span></div>
        <div className="stat"><span className="v num">{pct(m[model].top3)}</span><span className="k">Top-3 drivers called right</span></div>
        <div className="stat"><span className="v num">{m[model].mae.toFixed(3)}%</span><span className="k">Error on gap to pole</span></div>
        <div className="stat"><span className="v num">{m.practiceOnly.mae.toFixed(3)}%</span><span className="k">Baseline: practice gap only ({pct(m.practiceOnly.pole)} poles)</span></div>
      </div>
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Pos</th><th>Driver</th><th className="hide-sm">Team</th><th className="r">Predicted lap</th><th className="r">Gap</th><th style={{ width: "22%" }} className="hide-sm" /><th className="r">FP1 gap</th><th className="r hide-sm">Form</th>{hasActual && <th className="r">Actual</th>}</tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.Driver}>
                <td className="num"><b>{x.pos}</b></td>
                <td><i className="sw" style={{ "--tc": tc(x.Team) }} /> <b>{x.Driver}</b> <span className="muted hide-sm">{NAMES[x.Driver] || ""}</span></td>
                <td className="muted hide-sm">{x.Team}</td>
                <td className="r num">{fmtTime(x.time)}</td>
                <td className="r num">{fmtGap(x.gapS)}</td>
                <td className="hide-sm"><div className="qbar"><i style={{ width: `${100 - (x.gapS / maxGap) * 85}%`, background: tc(x.Team) }} /></div></td>
                <td className="r num muted">+{x.fpGap.toFixed(2)}%</td>
                <td className="r num muted hide-sm">{x.form == null ? "–" : "+" + x.form.toFixed(2) + "%"}</td>
                {hasActual && <td className={"r num " + (x.actual === x.pos ? "up" : "muted")}>{x.actual ? "P" + x.actual : "–"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: ".82rem" }}>
        Trained on {m.trainRows} driver-sessions from {m.races - m.testRaces} race weekends, tested on {m.testRaces} weekends it never saw. Singapore is a sprint weekend, so FP1 is the only practice.
        Predicted laps scale the FP1 best by the usual practice-to-pole ratio ({D.quali.ratio.toFixed(4)}). {hasActual ? "" : "The real result appears here after the next data refresh."}
      </p>
    </div>
  );
}

function Sprint({ model, inputs, onWatch }) {
  const SC = useMemo(() => scenario(D.sprint.round, inputs, model === "main" ? "avg" : model, "sprint"), [inputs, model]);
  const top = SC.rows.slice(0, 10);
  const actualTop3 = SC.rows.filter((x) => x.actual && x.actual <= 3).sort((a, b) => a.actual - b.actual).map((x) => x.Driver);
  const hits = SC.rows.slice(0, 3).filter((x) => actualTop3.includes(x.Driver)).length;
  return (
    <div className="panel">
      <div className="row between">
        <h2>Sprint prediction</h2>
        <button type="button" onClick={onWatch}>Watch sprint replay</button>
      </div>
      <p className="muted" style={{ fontSize: ".85rem" }}>
        {model === "main" ? "The Predictor predicts the Grand Prix only, so this uses the secondary Average model" : `The race model (${MODELS[model]})`} on the Sprint Qualifying grid over the {D.sprint.laps}-lap sprint. Winner called {SC.rows[0].Driver === actualTop3[0] ? "right" : "wrong"} · {hits}/3 podium drivers right.
      </p>
      <div className="scroll">
        <table className="t">
          <thead><tr><th>Pred</th><th>Driver</th><th className="r">Grid</th><th className="r">Actual</th></tr></thead>
          <tbody>
            {top.map((x, i) => (
              <tr key={x.Driver}>
                <td className="num"><b>{i + 1}</b></td>
                <td><i className="sw" style={{ "--tc": tc(x.Team) }} /> <b>{x.Driver}</b> <span className="muted hide-sm">{NAMES[x.Driver] || ""}</span></td>
                <td className="r num muted">P{x.GridPosition}</td>
                <td className={"r num " + (x.actual === i + 1 ? "up" : x.actual ? "muted" : "down")}>{x.actual ? "P" + x.actual : "DNF"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WeekendPage({ inputs, model, setModel, onWatchSprint }) {
  const t = byRound[D.nextRound];
  return (
    <main className="page" id="page-weekend">
      <div className="sim-head">
        <div className="row between">
          <span className="eyebrow">Round {t.round} · Session predictions</span>
          <ModelSwitch value={model} onChange={setModel} />
        </div>
        <h1>{t.name.replace("Grand Prix", "GP")} weekend</h1>
        <Schedule />
      </div>
      {model === "main" && P?.qualifying_prediction && !predictorGap(D.nextRound)
        ? <PredictorQualifying />
        : D.quali && <Qualifying model={model === "main" ? "avg" : model} />}
      {D.sprint && <Sprint model={model} inputs={inputs} onWatch={onWatchSprint} />}
    </main>
  );
}

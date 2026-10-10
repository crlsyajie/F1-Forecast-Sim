import { D, M, defaultInputs } from "../lib/model";
import { NAMES, WET_THRESHOLD, tc } from "../lib/constants";

export default function InputsPage({ inputs: S, setInputs }) {
  const set = (patch) => setInputs({ ...S, ...patch });
  const wet = S.rain / 100 >= WET_THRESHOLD;

  const editGrid = (driver, key, raw) => {
    const grid = S.grid.map((g) => ({ ...g }));
    const g = grid.find((x) => x.Driver === driver), v = parseFloat(raw);
    if (key === "GridPosition") {
      const n = Math.min(grid.length, Math.max(1, Math.round(v || g.GridPosition)));
      const other = grid.find((x) => x.GridPosition === n && x !== g);
      if (other) other.GridPosition = g.GridPosition;   // swap slots so the grid stays complete
      g.GridPosition = n;
    } else g.Q = Number.isFinite(v) ? v : NaN;
    set({ grid });
  };

  return (
    <main className="page" id="page-inputs">
      <div className="sim-head">
        <span className="eyebrow">Next race and upcoming rounds</span>
        <h1>Race inputs</h1>
        <p className="muted">These settings drive the prediction for the next race and the placeholder grids for later rounds. Completed rounds always use their real qualifying.</p>
      </div>
      <div className="cols">
        <div className="panel">
          <div className="row between"><h2>Conditions</h2><button type="button" onClick={() => setInputs(defaultInputs())}>Reset all</button></div>
          <div className="field">
            <label className="lab" htmlFor="rain">Chance of rain <output>{S.rain}%</output></label>
            <input type="range" id="rain" min="0" max="100" step="1" value={S.rain} onChange={(e) => set({ rain: +e.target.value })} />
            <div className="row"><span className={"chip" + (wet ? " live" : "")}>{wet ? "Wet adjustment on: quali times × wet factor" : "Wet adjustment off: applies at 70%+"}</span></div>
          </div>
          <div className="field">
            <label className="lab" htmlFor="temp">Air temperature <output>{S.temp.toFixed(1)}°C</output></label>
            <input type="range" id="temp" min="10" max="40" step="0.5" value={S.temp} onChange={(e) => set({ temp: +e.target.value })} />
          </div>
          <div className="field">
            <span className="lab">OpenWeather forecast, race day (SGT) <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>{D.weather.fetchedAt ? `· pulled ${D.weather.fetchedAt}` : ""}</span></span>
            <div className="fc">
              {D.weather.forecast.map((f) => {
                const sgt = (+f.t.slice(11, 13) + 8) % 24;
                return (
                  <div key={f.t} className={f.t === D.weather.at ? "race" : ""}>
                    {String(sgt).padStart(2, "0")}:00<b>{Math.round(f.temp)}°</b><b>{Math.round(f.pop * 100)}%</b>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="field">
            <span className="lab">Regulation-change boost <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>1.00 = neutral</span></span>
            <div style={{ display: "grid", gap: 6 }}>
              {Object.keys(S.boost).map((t, i) => (
                <div className="boost" key={t}>
                  <span><i className="sw" style={{ "--tc": tc(t) }} />{t}</span>
                  <input type="range" id={`boost-${i}`} min="0.5" max="1.5" step="0.01" value={S.boost[t]} aria-label={`${t} boost`}
                    onChange={(e) => set({ boost: { ...S.boost, [t]: +e.target.value } })} />
                  <output>{S.boost[t].toFixed(2)}</output>
                </div>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="lab" htmlFor="strength">Boost weight <output>{S.strength.toFixed(1)}%</output></label>
            <input type="range" id="strength" min="0" max="5" step="0.1" value={S.strength} onChange={(e) => set({ strength: +e.target.value })} />
            <p className="muted" style={{ fontSize: ".8rem" }}>Lap-time change for a full 1.00 of boost. At 2.0%, a team at 1.15 gains 0.3% per lap; a team at 0.70 loses 0.6%. Set it to 0 to see the model alone.</p>
          </div>
        </div>
        <div className="panel">
          <div className="row between"><h2>Qualifying grid</h2><button type="button" onClick={() => set({ grid: defaultInputs().grid })}>Reset grid</button></div>
          <p className="note">{D.gridSource === "Q"
            ? "Official Grand Prix qualifying classification from FastF1. Change grid slots to apply penalties."
            : "Friday's Sprint Qualifying order. Grand Prix qualifying runs Sat 21:00 SGT; it is loaded automatically before the race."}</p>
          <div className="scroll">
            <table className="t">
              <thead><tr><th>Driver</th><th className="hide-sm">Team</th><th className="r">Grid</th><th className="r">Quali lap (s)</th><th className="r">Wet factor</th><th className="r hide-sm">FP1 long run (s)</th></tr></thead>
              <tbody>
                {[...S.grid].sort((a, b) => a.GridPosition - b.GridPosition).map((g) => (
                  <tr key={g.Driver}>
                    <td><i className="sw" style={{ "--tc": tc(g.Team) }} /> <b>{g.Driver}</b> <span className="muted hide-sm">{NAMES[g.Driver] || ""}</span></td>
                    <td className="muted hide-sm">{g.Team}</td>
                    <td className="r">
                      <input key={`gp-${g.Driver}-${g.GridPosition}`} className="gp num" id={`gp-${g.Driver}`} type="number" min="1" max={S.grid.length} step="1"
                        defaultValue={g.GridPosition} aria-label={`${g.Driver} grid slot`} onBlur={(e) => editGrid(g.Driver, "GridPosition", e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
                    </td>
                    <td className="r">
                      <input key={`q-${g.Driver}-${g.Q}`} className="num" id={`q-${g.Driver}`} type="number" step="0.001" defaultValue={Number.isFinite(g.Q) ? g.Q : ""}
                        aria-label={`${g.Driver} qualifying lap`} onBlur={(e) => editGrid(g.Driver, "Q", e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && e.target.blur()} />
                    </td>
                    <td className="r num muted">{(M.wet[g.Driver] ?? 1).toFixed(3)}</td>
                    <td className="r num muted hide-sm">{Number.isFinite(g.CA) ? g.CA.toFixed(3) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { D, MODELS, hasSprint, tracks, scenario, shortName, status } from "../lib/model";
import { makeRace } from "../lib/race";
import { buildGeo, drawRace } from "../lib/geo";
import { computeTower, newBroadcast } from "../lib/broadcast";
import { NAMES, REDUCED, clock, fmtDate, fmtLap, hostCountry, surname, tc } from "../lib/constants";

const SPEEDS = [10, 30, 60, 120, 300];
const ROW_H = 24;

function useTicker() {
  const [items, setItems] = useState([]);
  const queue = useRef([]), busy = useRef(false), timers = useRef([]);
  const pump = useCallback(() => {
    if (busy.current || !queue.current.length) return;
    if (queue.current.length > 3) queue.current.splice(0, queue.current.length - 3);   // stay current at high speed
    busy.current = true;
    const m = { ...queue.current.shift(), id: Math.random() };
    setItems([m]);
    timers.current.push(setTimeout(() => {
      setItems([{ ...m, out: true }]);
      timers.current.push(setTimeout(() => { setItems([]); busy.current = false; pump(); }, 350));
    }, REDUCED ? 2600 : 2200));
  }, []);
  const push = useCallback((evs) => { queue.current.push(...evs); pump(); }, [pump]);
  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = []; queue.current = []; busy.current = false; setItems([]);
  }, []);
  useEffect(() => reset, [reset]);
  return { items, push, reset };
}

function headNote(SC) {
  if (SC.st === "sprint") return "Sprint replay: the model runs on Friday's Sprint Qualifying grid over the real 20-lap sprint distance. After the flag, the right-hand column shows the real sprint result (DNF = retired).";
  if (SC.st === "done") return `Predicted from that weekend's real qualifying. After the flag, the right-hand column shows where each driver actually finished. ${SC.inTrain ? "This race was part of the training data, so it is not an independent test." : "This race was held out of training, so it is a fair test."}`;
  if (SC.st === "next") return D.gridSource === "Q" ? "Using the official qualifying grid and your Inputs settings." : "Grid is Friday's Sprint Qualifying order until Grand Prix qualifying (Sat 21:00 SGT) is loaded. Change it on the Inputs page.";
  if (SC.st === "nodata") return "This round has been raced, but its timing data could not be downloaded yet. It uses the Inputs grid with this circuit's pole time as a what-if.";
  return "No qualifying yet for this round. It uses the Inputs grid with this circuit's 2025 pole time, so treat it as a what-if.";
}
const EYEBROW = { sprint: "Sprint: prediction vs result", done: "Completed: prediction vs result", next: "Next race: live prediction", nodata: "Completed: result data pending", upcoming: "Upcoming: placeholder grid" };

export function ModelSwitch({ value, onChange }) {
  return (
    <div className="seg" role="group" aria-label="Prediction model">
      {Object.entries(MODELS).map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export default function SimulatorPage({ round, setRound, inputs, setModel, session, setSession, active }) {
  const sess = session === "sprint" && hasSprint(round) ? "sprint" : "race";
  const SC = useMemo(() => scenario(round, inputs, inputs.model, sess), [round, inputs, sess]);
  const race = useMemo(() => makeRace(SC), [SC]);
  const geo = useMemo(() => buildGeo(SC.t), [SC.t]);

  const cvRef = useRef(null), towerRef = useRef(null);
  const sim = useRef({ t: 0, playing: !REDUCED, speed: 30, last: 0 });
  const raceRef = useRef(race), geoRef = useRef(geo), modeRef = useRef("int"), B = useRef(newBroadcast());
  const [playing, setPlaying] = useState(!REDUCED);
  const [speed, setSpeed] = useState(30);
  const [mode, setMode] = useState("int");
  const [view, setView] = useState(null);
  const ticker = useTicker();

  const inset = () => {
    const b = towerRef.current;
    return b && getComputedStyle(b).position === "absolute" ? b.offsetLeft + b.offsetWidth : 0;
  };
  const sizeCanvas = () => {
    const cv = cvRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.round(r.width * dpr)), h = Math.round(w * 0.5625);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  };
  const draw = () => { if (cvRef.current) drawRace(cvRef.current, geoRef.current, raceRef.current, sim.current.t, inset()); };
  const updateUi = (playingNow) => {
    const res = computeTower(raceRef.current, sim.current.t, B.current, modeRef.current, playingNow);
    if (res.events.length) ticker.push(res.events);
    setView(res);
  };
  const setPlay = (p) => { sim.current.playing = p; setPlaying(p); };

  // new race (or new inputs): keep the same point in the race when only the inputs changed
  const lastRound = useRef(round + sess);
  useEffect(() => {
    const key = round + sess, prev = raceRef.current, frac = prev && lastRound.current === key ? sim.current.t / prev.end : 0;
    raceRef.current = race; geoRef.current = geo; lastRound.current = key;
    sim.current.t = Math.min(race.end, frac * race.end);
    B.current = newBroadcast(); ticker.reset();
    draw(); updateUi(false);
  }, [race, geo]);   // eslint-disable-line react-hooks/exhaustive-deps

  // animation loop: canvas every frame, tower about 8 times a second
  useEffect(() => {
    let id, lastUi = 0;
    const loop = (now) => {
      const s = sim.current, R = raceRef.current;
      if (s.playing && active) {
        const dt = s.last ? Math.min(0.1, (now - s.last) / 1000) : 0;
        s.t = Math.min(R.end, s.t + dt * s.speed);
        if (s.t >= R.end) setPlay(false);
        draw();
        if (now - lastUi > 120) { lastUi = now; updateUi(true); }
      }
      s.last = now;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ro = new ResizeObserver(() => { sizeCanvas(); draw(); });
    if (cvRef.current) ro.observe(cvRef.current);
    return () => ro.disconnect();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (active) { sizeCanvas(); draw(); } else setPlay(false); }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps

  const seek = (t) => { sim.current.t = Math.max(0, Math.min(race.end, t)); draw(); updateUi(false); };
  const stepRace = (dir) => {
    const rs = tracks.map((t) => t.round), i = rs.indexOf(round);
    setRound(rs[(i + dir + rs.length) % rs.length]);
    if (!REDUCED) setPlay(true);
  };
  const chooseMode = (m) => { modeRef.current = m; setMode(m); B.current.prevOrder = null; updateUi(false); };

  const t = SC.t, win = SC.rows[0], v = view;
  const flagText = !v ? "Lights out" : v.finished ? "Chequered flag" : v.t <= 0 ? "Lights out" : "Green flag";

  return (
    <main className="page" id="page-sim">
      <div className="sim-head">
        <div className="row between">
          <span className="eyebrow">Round {t.round} · {EYEBROW[SC.st]}</span>
          {hasSprint(round) && (
            <div className="seg" role="group" aria-label="Session">
              <button type="button" aria-pressed={sess === "race"} onClick={() => setSession("race")}>Race</button>
              <button type="button" aria-pressed={sess === "sprint"} onClick={() => setSession("sprint")}>Sprint</button>
            </div>
          )}
          <ModelSwitch value={inputs.model} onChange={setModel} />
          <label className="row" htmlFor="raceSel">
            <span className="muted" style={{ fontSize: ".82rem" }}>Race</span>
            <select id="raceSel" value={round} onChange={(e) => setRound(+e.target.value)}>
              {D.tracks.map((tr) => (
                <option key={tr.round} value={tr.round} disabled={!tr.path}>
                  R{tr.round} · {shortName(tr)}{status(tr) === "next" ? " (next)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h1>{t.name.replace("Grand Prix", "GP")} 2026{sess === "sprint" ? " · Sprint" : ""}</h1>
        <div className="sim-meta">
          <span><b>{shortName(t)}</b></span><span>{fmtDate(t.date)}</span><span>{SC.laps} laps</span>
          <span>Rain {Math.round(SC.rain * 100)}% · {SC.temp.toFixed(1)}°C</span><span>Track map: {t.source}</span>
        </div>
        <p className="note">{headNote(SC)}</p>
      </div>

      <div className="podium" aria-label="Predicted podium">
        {SC.rows.slice(0, 3).map((x, i) => (
          <div className="pod" key={x.Driver} style={{ "--tc": tc(x.Team) }}>
            <span className="p">P{i + 1}</span>
            <span className="n">{NAMES[x.Driver] || x.Driver}</span>
            <span className="t">{x.Team} · from P{x.GridPosition} · {i ? `+${(x.lap - win.lap).toFixed(3)}s/lap` : `${fmtLap(x.lap)}/lap`}</span>
          </div>
        ))}
      </div>

      <p className="picks">
        <span className="muted">Model picks to win:</span>
        {Object.entries(MODELS).map(([k, label]) => (
          <span key={k} className={inputs.model === k ? "on" : ""}>{label} <b>{surname(SC.picks[k])}</b></span>
        ))}
      </p>

      <div className="sim">
        <div className="stage">
          <div className="bigno" aria-hidden="true"><b>{String(t.round).padStart(2, "0")}</b><span className="bars"><i /><i /><i /></span></div>
          <div className="bigteam" aria-hidden="true"><span className="bars"><i /><i /></span><b>{hostCountry(t)}</b></div>
          <i className="brk tl" /><i className="brk tr" /><i className="brk bl" /><i className="brk br" />
          <span className="clock-chip">{clock(Math.min(v ? v.t : 0, race.end))}</span>
          <canvas ref={cvRef} width="1200" height="675" aria-label="Race simulation on the track map" />
          <button className="chev prev" type="button" aria-label="Previous race" onClick={() => stepRace(-1)}>
            <svg viewBox="0 0 80 140" aria-hidden="true"><path d="M44 4 L8 70 L44 136 M76 4 L40 70 L76 136" /></svg>
          </button>
          <button className="chev next" type="button" aria-label="Next race" onClick={() => stepRace(1)}>
            <svg viewBox="0 0 80 140" aria-hidden="true"><path d="M36 4 L72 70 L36 136 M4 4 L40 70 L4 136" /></svg>
          </button>
          <span className={"flag chip" + (v && v.finished ? " done" : " live")}>{flagText}</span>
          <div className="ticker" aria-live="polite">
            {ticker.items.map((m) => (
              <div key={m.id} className={`tk ${m.cls || ""} ${m.out ? "out" : ""}`} style={m.color ? { "--tc": m.color } : undefined} dangerouslySetInnerHTML={{ __html: m.html }} />
            ))}
          </div>

          <div className="bcast" ref={towerRef} aria-label="Live timing tower">
            <div className="bt-head"><span className="bt-mark">CYF</span><span className="bt-title">Race</span></div>
            <div className="bt-sub">
              <span className="bt-lap">LAP {v ? v.lap : 1}/{SC.laps}</span>
              <div className="bt-mode" role="group" aria-label="Gap mode">
                <button type="button" aria-pressed={mode === "int"} onClick={() => chooseMode("int")}>Int</button>
                <button type="button" aria-pressed={mode === "lead"} onClick={() => chooseMode("lead")}>Leader</button>
              </div>
            </div>
            <div className="bt-rows" style={{ height: SC.rows.length * ROW_H + 4 }}>
              {(v ? v.rows : SC.rows.map((x, i) => ({ x, i, gap: "", chgText: "", chgCls: "" }))).map((r) => (
                <div key={r.x.Driver} className={"bt-row" + (r.fin ? " fin" : "")} style={{ transform: `translateY(${r.i * ROW_H}px)` }}>
                  {r.flash && <span key={r.flash.id} className={"bt-flash " + r.flash.cls} />}
                  <span className="bt-pos">{r.i + 1}</span>
                  <span className="bt-slit" style={{ "--tc": tc(r.x.Team) }} />
                  <span className="bt-drv">{surname(r.x.Driver)}</span>
                  <span className="bt-gap">{r.gap}</span>
                  <span className={"bt-chg " + (r.chgCls || "")} title={r.chgCls === "fast" ? "Fastest lap" : undefined}>{r.chgText}</span>
                </div>
              ))}
            </div>
            <div className="bt-foot">
              <span className="sw-ic" aria-hidden="true" />
              <span>{v && v.fast ? `${surname(v.fast.d)} ${fmtLap(v.fast.lt)} · L${v.fast.c}` : "Fastest lap: –"}</span>
            </div>
          </div>

          <div className="controls">
            <button id="play" type="button" aria-pressed={playing} onClick={() => { if (sim.current.t >= race.end) seek(0); setPlay(!playing); }}>
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => seek(0)}>Restart</button>
            <div className="sp" role="group" aria-label="Playback speed">
              {SPEEDS.map((s) => (
                <button key={s} type="button" aria-pressed={speed === s} onClick={() => { sim.current.speed = s; setSpeed(s); }}>{s}×</button>
              ))}
            </div>
            <input className="scrub" type="range" min="0" max="1000" aria-label="Race progress"
              value={Math.round(Math.min(1, (v ? v.t : 0) / race.end) * 1000)}
              onChange={(e) => seek((e.target.value / 1000) * race.end)} />
            <button type="button" onClick={() => { setPlay(false); seek(race.end); }}>Finish</button>
          </div>
        </div>
      </div>
    </main>
  );
}

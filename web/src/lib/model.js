// The XGBoost model trained in pipeline/train.py, exported as trees and evaluated here.
import DATA from "../data/site-data.json";
import { team, WET_THRESHOLD } from "./constants";

export const D = DATA;
export const M = DATA.model;
export const NEXT = D.nextRound;
export const tracks = D.tracks.filter((t) => t.path);
export const byRound = Object.fromEntries(D.tracks.map((t) => [t.round, t]));
export const shortName = (t) => D.shortNames[t.location] || t.location;
export const status = (t) => (t.round < NEXT ? "done" : t.round === NEXT ? "next" : "upcoming");

const f32 = Math.fround;

function predictRow(x) {
  let s = M.baseScore;
  for (const t of M.trees) {
    let n = t;
    while (Array.isArray(n)) {
      const v = x[n[0]];
      n = Number.isFinite(v) ? (f32(v) < f32(n[1]) ? n[2] : n[3]) : n[4] ? n[2] : n[3];
    }
    s += n;
  }
  return s;
}

// rows: [{Driver, Team, GridPosition, Q}] -> adds gap, pace, lap, pos; returns {rows, pole}
export function predictField(rows, { rain, temp, wetOn, boost, strength, pole: poleOverride }) {
  const r = rows.map((g) => ({ ...g, Team: team(g.Team) }));
  for (const x of r) {
    const wf = M.wet[x.Driver] ?? 1;
    x.QT = Number.isFinite(x.Q) ? (wetOn ? x.Q * wf : x.Q) : NaN;
  }
  const qpole = Math.min(...r.filter((x) => Number.isFinite(x.QT)).map((x) => x.QT));
  const teamMin = {};
  for (const x of r) {
    x.gap = Number.isFinite(x.QT) ? ((x.QT - qpole) / qpole) * 100 : NaN;
    if (Number.isFinite(x.gap)) teamMin[x.Team] = Math.min(teamMin[x.Team] ?? Infinity, x.gap);
  }
  const pole = poleOverride ?? qpole;
  for (const x of r) {
    const raw = [x.gap, x.GridPosition, teamMin[x.Team] ?? NaN, rain, temp];
    const v = raw.map((val, i) => (Number.isFinite(val) ? val : M.imputerMedians[i]));
    v[0] *= M.qualiScale;
    v[1] *= M.qualiScale;
    x.model = predictRow(v);
    x.pace = x.model + (boost ? (1 - (boost[x.Team] ?? 1)) * strength : 0);
    x.lap = pole * M.qualiToRaceFactor * (1 + x.pace / 100);
  }
  r.sort((a, b) => a.lap - b.lap || a.GridPosition - b.GridPosition);
  r.forEach((x, i) => (x.pos = i + 1));
  return { rows: r, pole };
}

export const defaultInputs = () => ({
  rain: Math.round(D.weather.rain * 100),
  temp: Math.round(D.weather.temp * 2) / 2,
  strength: 2.0,
  boost: { ...M.boost },
  grid: D.grid.map((g) => ({
    Driver: g.Driver, Team: team(g.Team), GridPosition: g.GridPosition,
    Q: g["QualifyingTime (s)"], CA: g["CleanAirRacePace (s)"],
  })),
});

export function scenario(round, S) {
  const t = byRound[round], laps = D.laps[t.location] || 60;
  let st = status(t);
  if (st === "done" && !D.backtest[round]) st = "nodata";
  if (st === "done") {
    const b = D.backtest[round];
    const res = predictField(
      b.rows.map((x) => ({ Driver: x.Driver, Team: x.Team, GridPosition: x.GridPosition, Q: x.Q })),
      { rain: b.rain, temp: b.temp, wetOn: false, boost: null, strength: 0, pole: b.pole },
    );
    const actual = Object.fromEntries(b.rows.map((x) => [x.Driver, x.Finish]));
    res.rows.forEach((x) => (x.actual = actual[x.Driver]));
    return { t, laps, st, ...res, rain: b.rain, temp: b.temp, inTrain: !M.metrics.testRaceIds.includes(b.raceId), raceId: b.raceId };
  }
  const rain = S.rain / 100;
  const res = predictField(S.grid.map((x) => ({ ...x })), {
    rain, temp: S.temp, wetOn: rain >= WET_THRESHOLD, boost: S.boost, strength: S.strength,
    pole: st === "next" ? undefined : t.poleTime,
  });
  return { t, laps, st, ...res, rain, temp: S.temp };
}

// Race engine: each car gets its own lap-by-lap times (predicted pace plus small random variation that sums
// to zero), so battles happen mid-race while each driver's total race time matches the model.
const LAP1 = 1.06;     // first lap is slower
const SLOT = 0.0022;   // head start per grid slot, as a fraction of a lap

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (str) => [...str].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

export function makeRace(SC) {
  const N = SC.laps;
  const rows = SC.rows.map((x) => ({ ...x }));
  const startOff = (x) => -(x.GridPosition - 1) * SLOT;

  for (const x of rows) {
    const r = rng(hash(x.Driver + ":" + SC.t.round)), sd = x.lap * 0.0032, n = N + 2;
    const e = Array.from({ length: n + 1 }, (_, l) => (l ? ((r() + r() + r() - 1.5) / 0.5) * sd : 0));
    const mean = e.slice(1).reduce((a, b) => a + b, 0) / n;
    const T = [0];
    for (let l = 1; l <= n; l++) T.push(T[l - 1] + x.lap * (l === 1 ? LAP1 : 1) + (e[l] - mean));
    x.T = T;
  }
  const lapEnd = (x, l) => {
    const n = x.T.length - 1;
    return l <= n ? x.T[l] : x.T[n] + (l - n) * x.lap;
  };
  const dist = (x, t) => {
    const T = x.T, n = T.length - 1;
    let l;
    if (t >= T[n]) l = n + Math.floor((t - T[n]) / x.lap);
    else {
      let lo = 0, hi = n;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
      l = lo;
    }
    const a = lapEnd(x, l), b = lapEnd(x, l + 1);
    return startOff(x) + l + (t - a) / (b - a);
  };
  const timeTo = (x, d) => {
    const dd = Math.max(0, d - startOff(x)), l = Math.floor(dd), a = lapEnd(x, l), b = lapEnd(x, l + 1);
    return a + (dd - l) * (b - a);
  };

  // finish: the leader takes the flag after N laps; everyone else finishes when they next cross the line
  const leader = rows[0];
  const tLead = timeTo(leader, N);
  for (const x of rows) {
    x.finLaps = x === leader ? N : Math.min(N, Math.ceil(dist(x, tLead) - 1e-9));
    x.finT = timeTo(x, x.finLaps);
    x.lapsDown = N - x.finLaps;
  }
  const end = Math.max(...rows.map((x) => x.finT));

  // every completed lap in time order, with a running fastest lap
  const log = [];
  for (const x of rows) {
    x.cross = [];
    for (let c = 1; c <= x.finLaps; c++) {
      const t = timeTo(x, c);
      x.cross.push(t);
      log.push({ t, d: x.Driver, c, lt: t - (c === 1 ? 0 : timeTo(x, c - 1)) });
    }
  }
  log.sort((a, b) => a.t - b.t);
  let best = null;
  for (const L of log) { if (L.c >= 2 && (!best || L.lt < best.lt)) best = L; L.best = best; }

  const order = (t) => {
    const done = (x) => t >= x.finT;
    return [...rows].sort((a, b) => {
      const fa = done(a), fb = done(b);
      if (fa && fb) return a.finLaps !== b.finLaps ? b.finLaps - a.finLaps : a.finT - b.finT;
      const da = fa ? a.finLaps + 1e-3 * (end - a.finT) : dist(a, t);
      const db = fb ? b.finLaps + 1e-3 * (end - b.finT) : dist(b, t);
      return db - da;
    });
  };
  const lastLapOf = (x, t) => {
    let c = 0;
    while (c < x.cross.length && x.cross[c] <= t) c++;
    return c ? { c, lt: x.cross[c - 1] - (c === 1 ? 0 : x.cross[c - 2]) } : null;
  };
  const fastestAt = (t) => {
    let lo = -1, hi = log.length;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (log[m].t <= t) lo = m; else hi = m; }
    return lo >= 0 ? log[lo].best : null;
  };
  // where a car is on track (laps, capped at its finish)
  const posAt = (x, t) => Math.min(dist(x, Math.min(t, x.finT)), x.finLaps);

  return { ...SC, rows, dist, timeTo, order, lastLapOf, fastestAt, posAt, end, tLead };
}

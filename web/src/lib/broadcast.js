// Timing-tower state for one moment of the race, plus race events (overtakes, fastest lap, flags).
// `B` carries what we saw on the previous update, so we can detect changes between updates.
import { fmtLap, tc } from "./constants";

export const newBroadcast = () => ({ prevOrder: null, prevT: 0, prevFast: null, chg: {}, flash: {}, lastLapSeen: 0 });

const lapsTxt = (n) => `+${n} LAP${n > 1 ? "S" : ""}`;

function gapText(race, x, ref, t) {
  const dr = race.posAt(ref, t), dx = race.posAt(x, t), down = Math.floor(dr - dx + 1e-9);
  if (down >= 1) return lapsTxt(down);
  return "+" + Math.max(0, race.timeTo(x, dr) - Math.min(t, ref.finT)).toFixed(1);
}

export function computeTower(race, t, B, mode, playing) {
  const order = race.order(t), lead = order[0], finished = t >= race.tLead;
  const live = playing && B.prevOrder && t >= B.prevT && t - B.prevT < lead.lap * 0.6;
  if (B.prevOrder && !live && Math.abs(t - B.prevT) > lead.lap * 0.6) { B.chg = {}; }
  const fast = race.fastestAt(t);
  const prevPos = {};
  (B.prevOrder || []).forEach((d, i) => (prevPos[d] = i));
  const events = [];

  const rows = order.map((x, i) => {
    const done = t >= x.finT;
    let gap;
    if (i === 0) gap = finished ? "WIN" : "";
    else if (done && finished) gap = x.lapsDown > 0 ? lapsTxt(x.lapsDown) : "+" + (mode === "int" ? x.finT - order[i - 1].finT : x.finT - lead.finT).toFixed(1);
    else gap = gapText(race, x, mode === "int" ? order[i - 1] : lead, t);

    if (live && x.Driver in prevPos && prevPos[x.Driver] !== i) {
      const delta = prevPos[x.Driver] - i, c = B.chg[x.Driver] || { n: 0 };
      B.chg[x.Driver] = { n: c.n + delta, until: t + x.lap };
      B.flash[x.Driver] = { cls: delta > 0 ? "gain" : "loss", id: (B.flash[x.Driver]?.id || 0) + 1 };
    }
    const c = B.chg[x.Driver];
    let chgText = "", chgCls = "";
    if (race.st === "done" && finished) {
      const a = x.actual;
      chgText = Number.isFinite(a) ? "P" + a : "DNF";
      chgCls = a === i + 1 ? "up" : "muted";
    } else if (c && c.until > t && c.n) {
      chgText = (c.n > 0 ? "▲" : "▼") + Math.abs(c.n);
      chgCls = c.n > 0 ? "up" : "down";
    } else if (fast && fast.d === x.Driver) {
      chgCls = "fast";
    }
    return { x, i, gap, fin: done, chgText, chgCls, flash: B.flash[x.Driver] };
  });

  if (live) {
    order.forEach((x, i) => {
      if (i === order.length - 1 || !(x.Driver in prevPos)) return;
      const y = order[i + 1];
      if (prevPos[x.Driver] > prevPos[y.Driver] && t < x.finT && Math.abs(race.dist(x, t) - race.dist(y, t)) < 0.5)
        events.push({ html: `<b>${x.Driver}</b> overtakes <b>${y.Driver}</b> for P${i + 1}`, color: tc(x.Team) });
    });
    if (fast && fast !== B.prevFast && fast.c >= 2) events.push({ html: `Fastest lap <b>${fast.d}</b> ${fmtLap(fast.lt)}`, cls: "purple" });
  }
  const lapNow = Math.max(1, Math.min(race.laps, Math.floor(race.posAt(lead, t)) + 1));
  if (live) {
    if (lapNow === race.laps && B.lastLapSeen < race.laps && !finished) events.push({ html: "Final lap", cls: "flag" });
    if (finished && B.prevT < race.tLead) events.push({ html: `Chequered flag · <b>${lead.Driver}</b> wins`, cls: "flag", color: tc(lead.Team) });
  }
  B.prevFast = fast;
  B.prevOrder = order.map((x) => x.Driver);
  B.prevT = t;
  B.lastLapSeen = finished ? race.laps + 1 : lapNow;

  return { rows, events, fast, finished, lap: finished ? race.laps : lapNow, t };
}

// Track geometry and canvas drawing for the race map.
import { tc } from "./constants";

export function buildGeo(t) {
  const P = t.path, n = P.length, cum = [0];
  for (let i = 1; i <= n; i++) {
    const a = P[i - 1], b = P[i % n];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  return { P, n, cum, len: cum[n], corners: t.corners || [], minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function at(g, frac) {
  const d = (((frac % 1) + 1) % 1) * g.len;
  let lo = 0, hi = g.n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.cum[m] <= d) lo = m; else hi = m; }
  const a = g.P[lo], b = g.P[(lo + 1) % g.n], seg = g.cum[lo + 1] - g.cum[lo] || 1, k = (d - g.cum[lo]) / seg;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

// fit the circuit into the canvas, leaving `inset` px on the left for the timing tower
function projector(g, W, H, pad, inset) {
  const AW = W - inset, sx = (AW - pad * 2) / (g.maxX - g.minX), sy = (H - pad * 2) / (g.maxY - g.minY), s = Math.min(sx, sy);
  const ox = inset + (AW - (g.maxX - g.minX) * s) / 2, oy = (H - (g.maxY - g.minY) * s) / 2;
  return (p) => [ox + (p[0] - g.minX) * s, oy + (p[1] - g.minY) * s];
}

// corner numbers sit just off the track, on the side with more clear space
function cornerLayout(g, proj, off) {
  const pts = g.P.map(proj);
  return g.corners.map((c) => {
    const [cx, cy] = proj([c[0], c[1]]);
    let bi = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; if (d < bd) { bd = d; bi = i; } });
    const a = pts[(bi + pts.length - 2) % pts.length], b = pts[(bi + 2) % pts.length];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    let best = null;
    for (const sgn of [1, -1]) {
      const qx = cx + sgn * nx * off, qy = cy + sgn * ny * off;
      const clear = Math.min(...pts.map((p) => (p[0] - qx) ** 2 + (p[1] - qy) ** 2));
      if (!best || clear > best[2]) best = [qx, qy, clear];
    }
    return [best[0], best[1], c[2]];
  });
}

const cornerCache = new WeakMap();

export function drawRace(cv, g, race, t, insetCss) {
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const k = Math.max(W / 1200, dpr * 0.62), tk = Math.max(W / 1200, dpr * 0.8), pad = 60 * Math.max(W / 1200, dpr * 0.5);
  const inset = insetCss * (W / (cv.getBoundingClientRect().width || W));
  const proj = projector(g, W, H, pad, inset);
  ctx.clearRect(0, 0, W, H);

  // track: painted lines on asphalt
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  g.P.forEach((p, i) => { const [x, y] = proj(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 18 * k;
  ctx.strokeStyle = "rgba(184,145,47,.55)"; ctx.lineWidth = 28 * k; ctx.stroke(); ctx.restore();
  ctx.strokeStyle = "#1b1b1c"; ctx.lineWidth = 22 * k; ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1.5 * k; ctx.setLineDash([10 * k, 14 * k]); ctx.stroke(); ctx.setLineDash([]);

  // start/finish line
  const [sx0, sy0] = proj(at(g, 0)), [sx1, sy1] = proj(at(g, 0.004));
  const ang = Math.atan2(sy1 - sy0, sx1 - sx0) + Math.PI / 2;
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 4 * k; ctx.beginPath();
  ctx.moveTo(sx0 - Math.cos(ang) * 16 * k, sy0 - Math.sin(ang) * 16 * k);
  ctx.lineTo(sx0 + Math.cos(ang) * 16 * k, sy0 + Math.sin(ang) * 16 * k);
  ctx.stroke();

  // corner numbers
  ctx.fillStyle = "#8a8a8e"; ctx.font = `600 ${13 * tk}px "JetBrains Mono", monospace`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const key = `${W}x${H}x${Math.round(inset)}`;
  let cc = cornerCache.get(g);
  if (!cc || cc.key !== key) { cc = { key, pos: cornerLayout(g, proj, 30 * k) }; cornerCache.set(g, cc); }
  for (const c of cc.pos) ctx.fillText(c[2], c[0], c[1]);

  // cars, leader drawn last so it sits on top
  const order = race.order(t);
  const cars = order.map((x, i) => ({ x, i, p: proj(at(g, race.posAt(x, t))) }));
  for (const c of [...cars].reverse()) {
    const big = c.i < 3, r = (big ? 13 : 9) * k, [px, py] = c.p, col = tc(c.x.Team);
    if (big) { ctx.fillStyle = col + "40"; ctx.beginPath(); ctx.arc(px, py, r * 1.9, 0, 7); ctx.fill(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 2 * k; ctx.stroke();
    ctx.font = `${big ? 700 : 600} ${(big ? 17 : 12.5) * tk}px "Manrope", sans-serif`;
    ctx.lineWidth = 4 * k; ctx.strokeStyle = "rgba(20,20,21,.9)"; ctx.strokeText(c.x.Driver, px, py - r - 10 * k);
    ctx.fillStyle = "#f3f5f9"; ctx.fillText(c.x.Driver, px, py - r - 10 * k);
  }
}

// small SVG path for the circuit cards
export function trackPath(t) {
  const P = t.path, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY, s = Math.min(1200 / (w || 1), 900 / (h || 1)) * 0.86;
  const ox = (1200 - w * s) / 2, oy = (900 - h * s) / 2;
  return P.map((p, i) => `${i ? "L" : "M"}${(ox + (p[0] - minX) * s).toFixed(1)} ${(oy + (p[1] - minY) * s).toFixed(1)}`).join("") + "Z";
}

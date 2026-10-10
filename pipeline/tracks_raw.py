# 2026-only circuits: outline from raw position feed (car telemetry is not published for 2026).
import json, logging, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd, fastf1
from fastf1 import _api, mvapi
logging.getLogger("fastf1").setLevel(logging.ERROR)
fastf1.Cache.enable_cache("cache_tracks")
exec(open("pipeline/tracks.py").read().split("out = []")[0].split("fastf1.Cache.enable_cache")[1].split("\n", 1)[1])  # rotate, simplify, log
out = json.load(open("data/tracks.json"))
sched = fastf1.get_event_schedule(2026, include_testing=False)
for rec in out:
    if rec.get("path"): continue
    rnd = rec["round"]
    try:
        s = fastf1.get_session(2026, rnd, "Q")
        s.load(laps=False, telemetry=False, weather=False, messages=False)
        allpos = _api.position_data(s.api_path)
        best = None
        for drv, df in allpos.items():
            df = df[df["Status"] == "OnTrack"]
            if len(df) < 600: continue
            xy0 = df[["X", "Y"]].to_numpy(dtype=float); tt = df["Date"].astype("int64").to_numpy() / 1e9
            for i in range(0, len(xy0) - 400, 25):
                d = np.hypot(*(xy0[i:i + 1200] - xy0[i]).T)
                away = np.argmax(d > 3000)
                if away == 0: continue
                back = np.argmax(d[away:] < 150)
                if back == 0: continue
                j = i + away + back
                dur = tt[j] - tt[i]
                if 60 < dur < 140 and (best is None or dur < best[0]):
                    best = (dur, xy0[i:j + 1])
        if best is None: raise RuntimeError("no closed lap in position feed")
        xy = best[1]
        lap = {"LapTime": pd.Timedelta(seconds=best[0])}
        key = s.session_info["Meeting"]["Circuit"]["Key"]
        ci = mvapi.get_circuit_info(year=2026, circuit_key=key)
        rot = float(ci.rotation) if ci is not None else 0.0
        cdf = ci.corners if ci is not None else pd.DataFrame({"X": [], "Y": [], "Number": [], "Letter": []})
        xy = rotate(xy, rot); corners = rotate(cdf[["X", "Y"]].to_numpy(dtype=float).reshape(-1, 2), rot)
        pts, _ = simplify(xy)
        lo = pts.min(0); span = (pts.max(0) - lo).max()
        P = ((pts - lo) / span * 1000).round(1); C = ((corners - lo) / span * 1000).round(1)
        h = P[:, 1].max(); P[:, 1] = h - P[:, 1]; C[:, 1] = h - C[:, 1]
        labels = (cdf["Number"].astype(str) + cdf["Letter"].fillna("").astype(str)).tolist()
        rec.update(source="2026 Q, raw positions" + ("" if ci is not None else ", no corner data"), poleTime=round(lap["LapTime"].total_seconds(), 3), path=P.tolist(),
                   corners=[[*c, l] for c, l in zip(C.tolist(), labels)])
        log(f"ok R{rnd} {rec['location']} from raw position feed, {len(xy)} samples")
    except Exception as e:
        log(f"MISSING R{rnd} {rec['location']}: {e}")
json.dump(out, open("data/tracks.json", "w"), separators=(",", ":"))
print("tracks with path:", sum(1 for r in out if r.get("path")), "of", len(out))

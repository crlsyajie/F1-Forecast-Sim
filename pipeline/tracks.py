# Pull a real outline + corner numbers for every 2026 circuit from FastF1 position data.
import json, logging, warnings, time, sys
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd, fastf1
logging.getLogger("fastf1").setLevel(logging.ERROR)
fastf1.Cache.enable_cache("cache_tracks")
log = lambda *a: print(*a, flush=True)

def rotate(xy, deg):
    a = np.deg2rad(deg); c, s = np.cos(a), np.sin(a)
    return xy @ np.array([[c, s], [-s, c]])

def simplify(pts, n=260):
    # resample evenly by arc length
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    t = np.linspace(0, d[-1], n, endpoint=False)
    return np.c_[np.interp(t, d, pts[:, 0]), np.interp(t, d, pts[:, 1])], d[-1]

out = []
sched = fastf1.get_event_schedule(2026, include_testing=False)
now = pd.Timestamp.now()
for _, ev in sched.iterrows():
    rnd = int(ev["RoundNumber"])
    done = ev["EventDate"] < now
    tries = [(2026, rnd)] if done else []
    tries += [(2025, ev["Location"]), (2026, rnd)]
    rec = None
    for yr, key in tries:
        try:
            s = fastf1.get_session(yr, key, "Q")
            if yr == 2025 and s.event["Location"] != ev["Location"]:
                continue
            s.load(laps=True, telemetry=True, weather=False, messages=False)
            lap = s.laps.pick_fastest()
            pos = lap.get_pos_data()
            xy = pos[["X", "Y"]].to_numpy(dtype=float)
            ci = s.get_circuit_info()
            rot = float(ci.rotation)
            xy = rotate(xy, rot)
            corners = rotate(ci.corners[["X", "Y"]].to_numpy(dtype=float), rot)
            pts, length = simplify(xy)
            lo = pts.min(0); span = (pts.max(0) - lo).max()
            norm = lambda p: ((p - lo) / span * 1000).round(1)
            P, C = norm(pts), norm(corners)
            # flip Y so north is up on screen
            h = P[:, 1].max()
            P[:, 1] = h - P[:, 1]; C[:, 1] = h - C[:, 1]
            labels = (ci.corners["Number"].astype(str) + ci.corners["Letter"].fillna("").astype(str)).tolist()
            rec = {"round": rnd, "name": ev["EventName"], "location": ev["Location"], "country": ev["Country"],
                   "date": str(ev["EventDate"].date()), "start": str(ev["Session5DateUtc"]) if "Session5DateUtc" in ev else None,
                   "format": ev["EventFormat"], "source": f"{yr} Q", "poleTime": round(lap["LapTime"].total_seconds(), 3),
                   "path": P.tolist(), "corners": [[*c, l] for c, l in zip(C.tolist(), labels)]}
            log(f"ok R{rnd} {ev['Location']} from {yr} Q")
            break
        except Exception as e:
            log(f"  fail R{rnd} {ev['Location']} {yr}: {str(e)[:90]}"); time.sleep(5)
    if rec is None:
        log(f"MISSING R{rnd} {ev['Location']}")
        rec = {"round": rnd, "name": ev["EventName"], "location": ev["Location"], "country": ev["Country"],
               "date": str(ev["EventDate"].date()), "format": ev["EventFormat"], "path": None}
    out.append(rec)
    json.dump(out, open("data/tracks.json", "w"), separators=(",", ":"))
log("DONE tracks", sum(1 for r in out if r["path"]), "of", len(out))

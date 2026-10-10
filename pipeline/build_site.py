# Pack model + tracks + 2026 results into web/src/data/site-data.json for the React app.
import json, sys, datetime, os
import pandas as pd
model_p, tracks_p, train_p, grid_src = sys.argv[1:5]
M = json.load(open(model_p))
tracks = json.load(open(tracks_p))
td = pd.read_csv(train_p)
LAPS = {"Melbourne":58, "Shanghai":56, "Suzuka":53, "Sakhir":57, "Jeddah":50, "Miami":57, "Miami Gardens":57, "Montréal":70, "Montreal":70,
        "Monaco":78, "Monte Carlo":78, "Barcelona":66, "Spielberg":71, "Silverstone":52, "Spa-Francorchamps":44, "Budapest":70, "Zandvoort":72,
        "Monza":53, "Madrid":57, "Baku":51, "Marina Bay":62, "Singapore":62, "Austin":56, "Mexico City":71, "São Paulo":71, "Las Vegas":50,
        "Lusail":57, "Yas Island":58, "Yas Marina":58, "Kuala Lumpur":56}
SHORT = {"Miami Gardens":"Miami", "Montréal":"Montreal", "Monte Carlo":"Monaco", "Barcelona":"Catalunya", "Spielberg":"Red Bull Ring",
         "Spa-Francorchamps":"Spa", "Budapest":"Hungaroring", "São Paulo":"Interlagos", "Lusail":"Losail", "Yas Island":"Yas Marina", "Singapore":"Marina Bay"}
nxt = next(t["round"] for t in tracks if "Singapore" in t["name"])
bt = {}
for rid, g in td[td["RaceId"].str.startswith("2026-")].groupby("RaceId"):
    rnd = int(rid[5:])
    bt[rnd] = {"raceId": rid, "pole": float(g["PoleTime (s)"].iloc[0]), "rain": float(g["RainProbability"].iloc[0]),
               "temp": float(g["Temperature"].iloc[0]),
               "rows": [{"Driver": r.Driver, "Team": r.Team, "GridPosition": int(r.GridPosition), "Q": float(r["BestQ (s)"]),
                         "Finish": None if pd.isna(r.FinishPosition) else int(r.FinishPosition)} for _, r in g.iterrows()]}
data = {"model": {k: M[k] for k in ("features","qualiScale","baseScore","trees","imputerMedians","qualiToRaceFactor","metrics","importance","wet")},
        "weather": M["weather"], "grid": M["grid"], "gridSource": grid_src, "tracks": tracks, "backtest": bt,
        "nextRound": nxt, "laps": LAPS, "shortNames": SHORT}
os.makedirs("web/src/data", exist_ok=True)
json.dump(data, open("web/src/data/site-data.json", "w"), separators=(",", ":"), ensure_ascii=False)
print("web/src/data/site-data.json", "next", nxt, "backtest", sorted(bt), "tracks", sum(1 for t in tracks if t.get("path")), "/", len(tracks))

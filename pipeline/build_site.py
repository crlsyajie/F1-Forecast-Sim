# Pack model + tracks + 2026 results into the site template.
import json, sys, datetime
import pandas as pd
tpl, model_p, tracks_p, train_p, grid_src, out = sys.argv[1:7]
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
data = {"model": {k: M[k] for k in ("features","qualiScale","baseScore","trees","imputerMedians","qualiToRaceFactor","metrics","importance","wet","boost")},
        "weather": M["weather"], "grid": M["grid"], "gridSource": grid_src, "tracks": tracks, "backtest": bt,
        "nextRound": nxt, "laps": LAPS, "shortNames": SHORT}
html = open(tpl).read().replace("/*DATA*/", json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"))
open(out, "w").write(html)
# standalone page for GitHub Pages (the artifact host adds this skeleton itself)
import os
skel = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>[hidden]{display:none!important}body{margin:0}img{max-width:100%}</style></head><body>')
head_part, body_part = html.split("<style>", 1)          # <title> and font links go in <head>
page = skel.replace("</head><body>", head_part + "<style>" + body_part.split("</style>", 1)[0] + "</style></head><body>") + body_part.split("</style>", 1)[1] + "</body></html>"
open(os.path.join(os.path.dirname(os.path.abspath(out)), "index.html"), "w").write(page)
print(out, len(html), "next", nxt, "backtest", sorted(bt), "tracks", sum(1 for t in tracks if t.get("path")), "/", len(tracks))

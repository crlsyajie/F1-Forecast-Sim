# Rebuild F1 Forecast Sim from the Formula 1 GP Predictor's latest data (the main model).
# Update the Predictor first with the /f1-gp-update skill; this script only READS ~/.f1-gp-predictor:
#   data/prediction.json        main model's race order, win/podium %, qualifying prediction, backtest
#   data/manifest.json          next event and session status
#   data/q.csv                  real qualifying grid (once published)
#   data/weather_forecast.json  OpenWeather forecast for the event
#   data/training_data.csv      past races, used to retrain this site's secondary models
# It never calls FastF1 or OpenWeather itself (F1's live-timing server returns 401 since Oct 2026).
# Run from the repo root: venv/bin/python pipeline/refresh.py
import json, os, shutil, subprocess, sys
import pandas as pd

PRED = os.path.expanduser(os.environ.get("PREDICTOR_HOME", "~/.f1-gp-predictor")) + "/data"
man = json.load(open(f"{PRED}/manifest.json"))
pred = json.load(open(f"{PRED}/prediction.json"))
ev = man["event"]
assert pred["event"]["id"] == ev["id"], f"prediction.json is for {pred['event']['id']}, manifest for {ev['id']}: run /f1-gp-update first"
print(f"event: {ev['year']} R{ev['round']} {ev['name']}, race {ev['race_utc']} UTC, grid source: {pred['grid_source']}")

shutil.copy(f"{PRED}/training_data.csv", "data/training_data.csv")
shutil.copy(f"{PRED}/weather_forecast.json", "data/owm.json")

# grid for the secondary models: real qualifying if it's in, otherwise the main model's predicted grid
if pred["grid_source"] == "qualifying" and os.path.exists(f"{PRED}/q.csv"):
    grid, src = pd.read_csv(f"{PRED}/q.csv"), "Q"
else:
    q = {r["Driver"]: r["PredictedQ (s)"] for r in (pred.get("qualifying_prediction") or [])}
    grid = pd.DataFrame([{"Driver": r["Driver"], "Team": r["Team"], "GridPosition": r["GridPosition"],
                          "QualifyingTime (s)": q.get(r["Driver"])} for r in pred["race"]])
    src = "PRED"
grid = grid.sort_values("GridPosition").reset_index(drop=True)
grid["GridPosition"] = range(1, len(grid) + 1)
grid.to_csv("data/grid_next.csv", index=False)
json.dump({"round": ev["round"], "race_utc": ev["race_utc"], "sessions": man.get("sessions", []),
           "timing_source": man.get("timing_source")}, open("data/event.json", "w"))

py = sys.executable
subprocess.run([py, "-W", "ignore", "pipeline/train.py", "data/training_data.csv", "data/grid_next.csv", "-",
                "data/owm.json", "data/model.json", ev["race_utc"]], check=True)
subprocess.run([py, "-W", "ignore", "pipeline/build_site.py", "data/model.json", "data/tracks.json",
                "data/training_data.csv", src], check=True)
# React build; site.html is the one-file version used for the private Claude artifact
env = {**os.environ, "PATH": os.path.expanduser("~/.local/node/bin") + os.pathsep + os.environ.get("PATH", "")}
subprocess.run(["npm", "run", "build:single"], cwd="web", env=env, check=True)
shutil.copy("web/dist-single/artifact.html", "site.html")
w = json.load(open("data/model.json"))["weather"]
print(f"RESULT event={ev['id']} grid={src} winner={pred['race'][0]['Driver']} {pred['race'][0]['Win %']:.1f}% "
      f"rain={round(w['rain']*100)}% temp={w['temp']:.1f}C forecast_for={w['at']} UTC")

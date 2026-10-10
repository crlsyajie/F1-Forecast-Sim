# Race-day refresh: new forecast + official qualifying grid, then rebuild the React app (web/dist) and site.html.
# Run from the repo root: venv/bin/python pipeline/refresh.py
import json, os, subprocess, sys, urllib.request, logging, warnings
warnings.filterwarnings("ignore")
key = open("owm_key").read().strip()
url = f"https://api.openweathermap.org/data/2.5/forecast?lat=1.2914&lon=103.8640&units=metric&appid={key}"
open("data/owm.json", "wb").write(urllib.request.urlopen(url, timeout=20).read())
print("forecast updated")
src = "SQ"; grid = "data/sq_singapore_2026.csv"
try:
    import fastf1, pandas as pd
    logging.getLogger("fastf1").setLevel(logging.ERROR)
    fastf1.Cache.enable_cache("cache")
    s = fastf1.get_session(2026, "Singapore", "Q"); s.load(telemetry=False, weather=False, messages=False)
    r = s.results[["Abbreviation", "TeamName", "Position"]].copy()
    best = s.laps[s.laps["Deleted"] != True].groupby("Driver")["LapTime"].min().dt.total_seconds()
    r["QualifyingTime (s)"] = r["Abbreviation"].map(best).round(3)
    r = r.rename(columns={"Abbreviation": "Driver", "TeamName": "Team", "Position": "GridPosition"})
    if r["GridPosition"].isna().all():
        # official classification not published yet: order by fastest lap
        r["GridPosition"] = r["QualifyingTime (s)"].rank(method="first")
    # drivers with no classified position (e.g. no timed lap) start at the back, slowest first
    r = r.sort_values(["GridPosition", "QualifyingTime (s)"], na_position="last").reset_index(drop=True)
    r["GridPosition"] = range(1, len(r) + 1)
    r.sort_values("GridPosition").to_csv("data/q_singapore_2026.csv", index=False)
    if len(r) >= 18 and r["QualifyingTime (s)"].notna().sum() >= 15:
        src, grid = "Q", "data/q_singapore_2026.csv"
    print("qualifying grid:", src)
except Exception as e:
    print("qualifying not available, keeping Sprint Qualifying grid:", e)
py = sys.executable
subprocess.run([py, "-W", "ignore", "pipeline/train.py", "data/training_data.csv", grid, "data/clean_air_singapore_2026.csv", "data/owm.json", "data/model.json"], check=True)
# qualifying model: re-score with the real qualifying result once it exists (data/q_singapore_2026.csv)
if os.path.exists("data/practice_best.csv"):
    subprocess.run([py, "-W", "ignore", "pipeline/train_quali.py"], check=True)
subprocess.run([py, "-W", "ignore", "pipeline/build_site.py", "data/model.json", "data/tracks.json", "data/training_data.csv", src], check=True)
# React build; site.html is the one-file version used for the private Claude artifact
import os, shutil
node_bin = os.path.expanduser("~/.local/node/bin")
env = {**os.environ, "PATH": node_bin + os.pathsep + os.environ.get("PATH", "")}
subprocess.run(["npm", "run", "build:single"], cwd="web", env=env, check=True)
shutil.copy("web/dist-single/artifact.html", "site.html")
w = json.load(open("data/model.json"))["weather"]
print(f"RESULT grid={src} rain={round(w['rain']*100)}% temp={w['temp']:.1f}C forecast_for={w['at']} UTC")

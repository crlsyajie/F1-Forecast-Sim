# Download each training race's final practice session (FP3, or FP1 on sprint weekends) and keep every
# driver's best lap. Used to train the qualifying model. Resumable: races already in the CSV are skipped.
# Run from the repo root: venv/bin/python pipeline/practice.py
import logging, os, sys, time, warnings
warnings.filterwarnings("ignore")
import pandas as pd, fastf1
from fastf1.req import RateLimitExceededError
logging.getLogger("fastf1").setLevel(logging.ERROR)
fastf1.Cache.enable_cache("cache")
log = lambda *a: print(*a, flush=True)

OUT = "data/practice_best.csv"
races = sorted(pd.read_csv("data/training_data.csv")["RaceId"].unique())
done = set(pd.read_csv(OUT)["RaceId"]) if os.path.exists(OUT) else set()
schedules = {}

for rid in races:
    if rid in done:
        continue
    yr, rnd = int(rid[:4]), int(rid[5:])
    if yr not in schedules:
        schedules[yr] = fastf1.get_event_schedule(yr, include_testing=False)
    ev = schedules[yr][schedules[yr]["RoundNumber"] == rnd].iloc[0]
    name = "FP1" if "sprint" in str(ev["EventFormat"]) else "FP3"
    for attempt in range(6):
        try:
            s = fastf1.get_session(yr, rnd, name)
            s.load(laps=True, telemetry=False, weather=False, messages=False)
            laps = s.laps[(s.laps["Deleted"] != True) & s.laps["LapTime"].notna()]
            best = laps.groupby("Driver").agg(BestFP=("LapTime", "min"), Team=("Team", "first")).reset_index()
            best["BestFP (s)"] = best["BestFP"].dt.total_seconds().round(3)
            best = best.drop(columns="BestFP").assign(RaceId=rid, Session=name)
            if len(best) < 10:
                raise RuntimeError(f"only {len(best)} drivers")
            best.to_csv(OUT, mode="a", header=not os.path.exists(OUT), index=False)
            log(f"ok {rid} {name}: {len(best)} drivers")
            break
        except RateLimitExceededError:
            log(f"rate limit at {rid}, waiting 10 min"); time.sleep(600)
        except Exception as e:
            log(f"retry {rid} {name} ({attempt + 1}): {str(e)[:80]}"); time.sleep(20 * (attempt + 1))
    else:
        log(f"skip {rid} {name}")
log("DONE", len(pd.read_csv(OUT)["RaceId"].unique()) if os.path.exists(OUT) else 0, "races")

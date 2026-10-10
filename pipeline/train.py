# F1.ipynb cells 13, 16-27 (#new versions), run locally. Writes data/model.json for the page.
import json, sys, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import mean_absolute_error, r2_score
from xgboost import XGBRegressor

train_csv, grid_csv, pace_csv, owm_json, out = sys.argv[1:6]

feature_cols = ["GapFromPole (%)", "GridPosition", "TeamGapFromPole (%)", "RainProbability", "Temperature"]
QUALI_SCALE = 10.0

# cell 20
training_data = pd.read_csv(train_csv)
X = training_data[feature_cols].copy()
y = training_data["RacePace (%)"].copy()
imputer = SimpleImputer(strategy="median")
X_imputed = imputer.fit_transform(X)

# cell 22
X_scaled = X_imputed.copy()
X_scaled[:, 0] *= QUALI_SCALE
X_scaled[:, 1] *= QUALI_SCALE

# cell 23
gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
train_idx, test_idx = next(gss.split(X_scaled, y, groups=training_data["RaceId"]))
X_train, X_test = X_scaled[train_idx], X_scaled[test_idx]
y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

# cell 26
model = XGBRegressor(
    n_estimators=600, learning_rate=0.03, max_depth=3, min_child_weight=5,
    subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0, reg_alpha=0.5,
    random_state=42, monotone_constraints=(1, 1, 1, 0, 0),
)
model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
per_race = training_data.groupby("RaceId")[["RaceRefPace (s)", "PoleTime (s)"]].first()
QUALI_TO_RACE_FACTOR = float((per_race["RaceRefPace (s)"] / per_race["PoleTime (s)"]).median())

# cell 27
y_pred_test = model.predict(X_test)
mae = mean_absolute_error(y_test, y_pred_test)
r2 = r2_score(y_test, y_pred_test)
naive_mae = mean_absolute_error(y_test, np.full(len(y_test), y_train.mean()))
coef = np.polyfit(X_train[:, 0], y_train, 1)
quali_only_mae = mean_absolute_error(y_test, np.polyval(coef, X_test[:, 0]))

# Export trees so the page can run the same model
booster = model.get_booster()
cfg = json.loads(booster.save_config())
base_score = float(cfg["learner"]["learner_model_param"]["base_score"])
trees = [json.loads(t) for t in booster.get_dump(dump_format="json")]

def compact(n):
    if "leaf" in n:
        return n["leaf"]
    kids = {c["nodeid"]: c for c in n["children"]}
    return [int(n["split"][1:]), n["split_condition"],
            compact(kids[n["yes"]]), compact(kids[n["no"]]),
            1 if n["missing"] == n["yes"] else 0]

ctrees = [compact(t) for t in trees]

def walk(t, x):
    f32 = np.float32
    while isinstance(t, list):
        t = t[2] if f32(x[t[0]]) < f32(t[1]) else t[3]
    return t

check = np.array([base_score + sum(walk(t, r) for t in ctrees) for r in X_test])
max_diff = float(np.abs(check - y_pred_test).max())
assert max_diff < 1e-3, max_diff

# Feature names in the booster are f0..f4 -> map gain importance back
imp = booster.get_score(importance_type="gain")
gain = np.array([imp.get(f"f{i}", 0.0) for i in range(len(feature_cols))])
importance = (gain / gain.sum()).round(4).tolist()

test_races = training_data.iloc[test_idx][["RaceId", "Event"]].drop_duplicates().sort_values("RaceId")

# cell 13
driver_wet_performance = {
    "ALB": 0.997434, "ALO": 0.966045, "GAS": 0.894273, "HAM": 1.003726, "HUL": 1.025956,
    "LEC": 0.997029, "NOR": 0.963355, "OCO": 0.931002, "PIA": 1.004128, "RUS": 1.008377,
    "SAI": 0.993421, "STR": 0.952181, "TSU": 1.022479, "VER": 0.985092,
}
team_alias = {"Red Bull Racing": "Red Bull", "Haas F1 Team": "Haas"}

grid = pd.read_csv(grid_csv)
grid["Team"] = grid["Team"].replace(team_alias)
pace = pd.read_csv(pace_csv).set_index("Driver")["LapTime (s)"]
grid["CleanAirRacePace (s)"] = grid["Driver"].map(pace)

# cell 16: forecast closest to race start (20:00 SGT = 12:00 UTC)
fc = json.load(open(owm_json))
target = pd.Timestamp("2026-10-11 12:00:00")
f = min(fc["list"], key=lambda f: abs(pd.Timestamp(f["dt_txt"]) - target))
import os, datetime
fetched = datetime.datetime.fromtimestamp(os.path.getmtime(owm_json)).strftime("%a %d %b, %H:%M")
weather = {"rain": float(f.get("pop", 0)), "temp": float(f["main"]["temp"]), "at": f["dt_txt"], "fetchedAt": fetched,
           "forecast": [{"t": x["dt_txt"], "temp": x["main"]["temp"], "pop": x.get("pop", 0)}
                        for x in fc["list"] if x["dt_txt"].startswith("2026-10-11")]}

out_obj = {
    "features": feature_cols, "qualiScale": QUALI_SCALE, "baseScore": base_score, "trees": ctrees,
    "imputerMedians": imputer.statistics_.round(4).tolist(),
    "qualiToRaceFactor": round(QUALI_TO_RACE_FACTOR, 5),
    "metrics": {"mae": round(float(mae), 4), "r2": round(float(r2), 3), "naiveMae": round(float(naive_mae), 4),
                "qualiOnlyMae": round(float(quali_only_mae), 4),
                "trainRows": int(len(train_idx)), "testRows": int(len(test_idx)),
                "races": int(training_data["RaceId"].nunique()),
                "testRaces": (test_races["RaceId"].str[:4] + " " + test_races["Event"].str.replace(" Grand Prix", "")).tolist(),
                "testRaceIds": test_races["RaceId"].tolist(),
                "firstRace": training_data["RaceId"].min(), "lastRace": training_data["RaceId"].max()},
    "importance": importance,
    "wet": driver_wet_performance,
    "grid": json.loads(grid.round(3).to_json(orient="records")),
    "weather": weather,
}
json.dump(out_obj, open(out, "w"), separators=(",", ":"))
print(json.dumps({k: out_obj[k] for k in ("metrics", "importance", "qualiToRaceFactor", "baseScore")}, indent=1))
print("trees", len(ctrees), "max js/py diff", max_diff, "weather", weather["at"], weather["rain"], weather["temp"])

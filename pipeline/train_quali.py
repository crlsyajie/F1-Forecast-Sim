# Qualifying model: predict each driver's qualifying gap to pole (%) from the weekend's final practice session
# and recent qualifying form. Two models (XGBoost, Random Forest) plus their average, like the race model.
# Run from the repo root: venv/bin/python pipeline/train_quali.py
import json, os, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import GroupShuffleSplit
from xgboost import XGBRegressor

FEATURES = ["FPGap (%)", "TeamFPGap (%)", "Form (%)"]

td = pd.read_csv("data/training_data.csv")
fp = pd.read_csv("data/practice_best.csv")

def practice_features(f):
    f = f.copy()
    best = f.groupby("RaceId")["BestFP (s)"].transform("min")
    f["FPGap (%)"] = (f["BestFP (s)"] - best) / best * 100
    f["TeamFPGap (%)"] = f.groupby(["RaceId", "Team"])["FPGap (%)"].transform("min")
    f["FPBest (s)"] = best
    return f

fp = practice_features(fp)

# recent form: median qualifying gap over the driver's previous 3 races (before this one)
q = td[["RaceId", "Driver", "GapFromPole (%)", "PoleTime (s)", "Event"]].sort_values("RaceId")
q["Form (%)"] = q.groupby("Driver")["GapFromPole (%)"].transform(lambda s: s.shift(1).rolling(3, min_periods=1).median())

data = q.merge(fp[["RaceId", "Driver", "FPGap (%)", "TeamFPGap (%)", "FPBest (s)", "Session"]], on=["RaceId", "Driver"], how="inner")
data = data.dropna(subset=["FPGap (%)"])
# drop practice outliers (red-flagged or no-push runs) that say nothing about qualifying pace
data = data[data["FPGap (%)"] < 5]

X, y = data[FEATURES], data["GapFromPole (%)"]
imp = SimpleImputer(strategy="median").fit(X)
Xi = imp.transform(X)
gss = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
tr, te = next(gss.split(Xi, y, groups=data["RaceId"]))

xgb = XGBRegressor(n_estimators=400, learning_rate=0.04, max_depth=3, min_child_weight=5, subsample=0.8,
                   colsample_bytree=0.9, reg_lambda=2.0, random_state=42, monotone_constraints=(1, 1, 1))
xgb.fit(Xi[tr], y.iloc[tr])
rf = RandomForestRegressor(n_estimators=200, max_depth=7, min_samples_leaf=6, random_state=42, n_jobs=-1)
rf.fit(Xi[tr], y.iloc[tr])
px, pr = xgb.predict(Xi[te]), rf.predict(Xi[te])
pa = (px + pr) / 2
yt = y.iloc[te]

# baselines: qualifying gap = practice gap (straight copy), and a straight line fitted on the practice gap
line = np.polyfit(Xi[tr][:, 0], y.iloc[tr], 1)
test = data.iloc[te].assign(px=px, pr=pr, pa=pa)

def pole_hit(col):
    hits = [g.loc[g[col].idxmin(), "Driver"] == g.loc[g["GapFromPole (%)"].idxmin(), "Driver"] for _, g in test.groupby("RaceId")]
    return round(float(np.mean(hits)), 3)

def top3_hit(col):
    out = []
    for _, g in test.groupby("RaceId"):
        out.append(len(set(g.nsmallest(3, col)["Driver"]) & set(g.nsmallest(3, "GapFromPole (%)")["Driver"])) / 3)
    return round(float(np.mean(out)), 3)

metrics = {
    "xgb": {"mae": round(float(mean_absolute_error(yt, px)), 4), "pole": pole_hit("px"), "top3": top3_hit("px")},
    "rf": {"mae": round(float(mean_absolute_error(yt, pr)), 4), "pole": pole_hit("pr"), "top3": top3_hit("pr")},
    "avg": {"mae": round(float(mean_absolute_error(yt, pa)), 4), "pole": pole_hit("pa"), "top3": top3_hit("pa")},
    "practiceOnly": {"mae": round(float(mean_absolute_error(yt, Xi[te][:, 0])), 4), "pole": pole_hit("FPGap (%)"), "top3": top3_hit("FPGap (%)")},
    "line": round(float(mean_absolute_error(yt, np.polyval(line, Xi[te][:, 0]))), 4),
    "trainRows": int(len(tr)), "testRows": int(len(te)), "races": int(data["RaceId"].nunique()), "testRaces": int(test["RaceId"].nunique()),
}
ratio = float((data.groupby("RaceId")["PoleTime (s)"].first() / data.groupby("RaceId")["FPBest (s)"].first()).median())

# --- predict this weekend (Singapore 2026: FP1 is the only practice on a sprint weekend) ---
wk = pd.read_csv("data/fp1_singapore_2026.csv").rename(columns={"BestLap (s)": "BestFP (s)"}).assign(RaceId="2026-17")
wk = practice_features(wk)
last = q.groupby("Driver")["GapFromPole (%)"].apply(lambda s: s.tail(3).median())
wk["Form (%)"] = wk["Driver"].map(last)
W = imp.transform(wk[FEATURES])
wk["xgb"], wk["rf"] = xgb.predict(W), rf.predict(W)
wk["avg"] = (wk["xgb"] + wk["rf"]) / 2
pole_est = float(wk["FPBest (s)"].iloc[0] * ratio)
actual = {}
if os.path.exists("data/q_singapore_2026.csv"):
    a = pd.read_csv("data/q_singapore_2026.csv")
    if a["QualifyingTime (s)"].notna().sum() >= 15:
        actual = {r.Driver: int(r.GridPosition) for _, r in a.iterrows()}

out = {
    "round": 17, "session": "FP1", "poleEstimate": round(pole_est, 3), "ratio": round(ratio, 4), "metrics": metrics,
    "importance": {"xgb": (xgb.feature_importances_ / xgb.feature_importances_.sum()).round(4).tolist(),
                   "rf": (rf.feature_importances_ / rf.feature_importances_.sum()).round(4).tolist()},
    "rows": [{"Driver": r.Driver, "Team": r.Team, "fpGap": round(r["FPGap (%)"], 3), "form": None if pd.isna(r["Form (%)"]) else round(r["Form (%)"], 3),
              "xgb": round(float(r.xgb), 4), "rf": round(float(r.rf), 4), "avg": round(float(r.avg), 4), "actual": actual.get(r.Driver)}
             for _, r in wk.iterrows()],
}
json.dump(out, open("data/quali_model.json", "w"), separators=(",", ":"))
print(json.dumps(metrics, indent=1))
print("pole estimate", round(pole_est, 3), "| predicted top 5 (avg):", wk.nsmallest(5, "avg")["Driver"].tolist())

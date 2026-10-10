# Secondary qualifying model: predict each driver's qualifying gap to pole (%) from the sessions run before
# qualifying that weekend. "Last session" = Sprint Qualifying on sprint weekends, else the best of FP1-FP3
# (FP3 included when it exists), blended with recent qualifying form by a robust linear fit.
# Tested with 5-fold grouped cross-validation over all weekends. XGBoost/Random Forest and adding the sprint
# result were tried and scored worse on pole and top-3 picks, so the sprint result is shown but not used.
#
# Past-weekend inputs come from the Formula 1 GP Predictor's history (read-only):
#   ~/.f1-gp-predictor/quali_history/*.csv   FP1-FP3 / SQ best laps and qualifying result per weekend
#   ~/.f1-gp-predictor/data/test_inputs.csv  past sprint results (finish, DNF, pace)
# Run from the repo root: venv/bin/python pipeline/train_quali.py
import glob, json, os, warnings
warnings.filterwarnings("ignore")
import numpy as np, pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import GroupShuffleSplit
from xgboost import XGBRegressor

PRED = os.path.expanduser(os.environ.get("PREDICTOR_HOME", "~/.f1-gp-predictor"))
FEATURES = ["PracticeGap (%)", "TeamPracticeGap (%)", "SQGap (%)", "SprintFinish", "SprintPace (%)", "Form (%)", "IsSprint"]

def gap(s):
    return (s - s.min()) / s.min() * 100

def weekend_features(df, sprint):
    """df: one weekend, columns FP1/FP2/FP3 (s), SQ (s), SprintFinish, SprintPace (%). Returns feature columns."""
    df = df.copy()
    fps = [c for c in ("FP1", "FP2", "FP3") if c in df and df[c].notna().sum() >= 10]
    df["PracticeBest"] = df[fps].min(axis=1) if fps else np.nan
    df["PracticeGap (%)"] = gap(df["PracticeBest"])
    df["TeamPracticeGap (%)"] = df.groupby("Team")["PracticeGap (%)"].transform("min")
    df["SQGap (%)"] = gap(df["SQ"]) if sprint and "SQ" in df else np.nan
    for c in ("SprintFinish", "SprintPace (%)"):
        if c not in df or not sprint:
            df[c] = np.nan
    df["IsSprint"] = 1.0 if sprint else 0.0
    return df, fps

# ---- past weekends ----
hist = pd.concat([pd.read_csv(f) for f in sorted(glob.glob(f"{PRED}/quali_history/*.csv"))], ignore_index=True)
sprints = pd.read_csv(f"{PRED}/data/test_inputs.csv")[["RaceId", "Driver", "SprintFinish", "SprintDNF", "SprintPace (%)"]]
sprints.loc[sprints["SprintDNF"] == True, ["SprintFinish", "SprintPace (%)"]] = np.nan   # a DNF says nothing about pace
hist = hist.merge(sprints.drop(columns="SprintDNF"), on=["RaceId", "Driver"], how="left")

rows = []
for rid, g in hist.groupby("RaceId"):
    sprint = g["Format"].iloc[0] == "sprint"
    f, _ = weekend_features(g, sprint)
    rows.append(f)
data = pd.concat(rows, ignore_index=True).sort_values("RaceId")
data = data.dropna(subset=["QGap (%)"])
data["Form (%)"] = data.groupby("Driver")["QGap (%)"].transform(lambda s: s.shift(1).rolling(3, min_periods=1).median())
data = data[(data["PracticeGap (%)"].isna()) | (data["PracticeGap (%)"] < 5)]

y = data["QGap (%)"].values

def last_session(d):
    b = d["SQGap (%)"].where(d["IsSprint"] == 1, d["PracticeGap (%)"]).fillna(d["PracticeGap (%)"])
    return b.fillna(d["Form (%)"])

data["Last (%)"] = last_session(data).fillna(np.nanmedian(y))
data["FormF (%)"] = data["Form (%)"].fillna(data["Last (%)"])
Xq = data[["Last (%)", "FormF (%)"]].values

from sklearn.linear_model import HuberRegressor
from sklearn.model_selection import GroupKFold
cvp = np.zeros(len(y))
for tr, te in GroupKFold(n_splits=5).split(Xq, y, groups=data["RaceId"]):
    cvp[te] = HuberRegressor().fit(Xq[tr], y[tr]).predict(Xq[te])
model = HuberRegressor().fit(Xq, y)

def score(col, d):
    pole = [g.loc[g[col].idxmin(), "Driver"] == g.loc[g["QGap (%)"].idxmin(), "Driver"] for _, g in d.groupby("RaceId")]
    top3 = [len(set(g.nsmallest(3, col)["Driver"]) & set(g.nsmallest(3, "QGap (%)")["Driver"])) / 3 for _, g in d.groupby("RaceId")]
    return {"mae": round(float(mean_absolute_error(d["QGap (%)"], d[col])), 4), "pole": round(float(np.mean(pole)), 3), "top3": round(float(np.mean(top3)), 3)}

data["cv"] = cvp
sp = data[data["IsSprint"] == 1]
metrics = {"model": score("cv", data), "baseline": score("Last (%)", data),
           "sprintWeekends": {"model": score("cv", sp), "baseline": score("Last (%)", sp)},
           "races": int(data["RaceId"].nunique()), "sprintRaces": int(sp["RaceId"].nunique()), "rows": int(len(data)),
           "method": "5-fold grouped cross-validation", "coef": [round(float(c), 4) for c in model.coef_], "intercept": round(float(model.intercept_), 4)}
# keep the old keys the page reads, all pointing at the one model
for k in ("xgb", "rf", "avg"):
    metrics[k] = metrics["model"]
metrics["practiceOnly"] = metrics["baseline"]

# ---- this weekend: Singapore 2026 (sprint weekend: FP1, Sprint Qualifying, Sprint) ----
fp1 = pd.read_csv("data/fp1_singapore_2026.csv").rename(columns={"BestLap (s)": "FP1"})
sq = pd.read_csv("data/sq_singapore_2026.csv").rename(columns={"QualifyingTime (s)": "SQ"})[["Driver", "SQ"]]
wk = fp1.merge(sq, on="Driver", how="outer")
sessions = ["FP1", "Sprint Qualifying"]
if os.path.exists("data/sprint_singapore_2026.csv"):
    s = pd.read_csv("data/sprint_singapore_2026.csv")
    full = s["Laps"].max()
    s["SprintFinish"] = s["Position"].where(s["Laps"] >= full - 1)
    pace_src = os.path.join(PRED, "data", "sprint_result.csv")      # green-flag pace, if the Predictor computed it
    if os.path.exists(pace_src):
        p = pd.read_csv(pace_src)
        s = s.merge(p[["Driver", "SprintPace (%)", "SprintDNF"]], on="Driver", how="left")
        s.loc[s["SprintDNF"] == True, "SprintPace (%)"] = np.nan
    wk = wk.merge(s[["Driver", "SprintFinish"] + (["SprintPace (%)"] if "SprintPace (%)" in s else [])], on="Driver", how="left")
    sessions.append("Sprint")
wk["Team"] = wk["Team"].fillna("")
wk, used_fp = weekend_features(wk, sprint=True)
last = data.groupby("Driver")["QGap (%)"].apply(lambda s: s.tail(3).median())
wk["Form (%)"] = wk["Driver"].map(last)
wk["Last (%)"] = last_session(wk)
wk["FormF (%)"] = wk["Form (%)"].fillna(wk["Last (%)"])
wk["avg"] = model.predict(wk[["Last (%)", "FormF (%)"]].fillna(np.nanmedian(y)).values)
wk["xgb"] = wk["rf"] = wk["avg"]
ratio = float(data.groupby("RaceId").apply(lambda g: g["Q"].min() / g["SQ"].min() if g["IsSprint"].iloc[0] == 1 else np.nan).median())
pole_est = float(wk["SQ"].min() * ratio)

actual = {}
if os.path.exists("data/q_singapore_2026.csv"):
    a = pd.read_csv("data/q_singapore_2026.csv")
    if a["QualifyingTime (s)"].notna().sum() >= 15:
        actual = {r.Driver: int(r.GridPosition) for _, r in a.iterrows()}

num = lambda v, d=3: None if pd.isna(v) else round(float(v), d)
out = {
    "round": 17, "session": " + ".join(x for x in sessions if x != "Sprint"), "sessions": sessions, "sprintShown": "Sprint" in sessions, "poleEstimate": round(pole_est, 3), "ratio": round(ratio, 4),
    "ratioFrom": "Sprint Qualifying", "metrics": metrics,
    "inputsUsed": ["Last session before qualifying (Sprint Qualifying, or best of FP1-FP3)", "Recent qualifying form"],
    "rows": [{"Driver": r.Driver, "Team": r.Team, "fpGap": num(r["PracticeGap (%)"]), "sqGap": num(r["SQGap (%)"]),
              "sprint": num(r["SprintFinish"], 0), "form": num(r["Form (%)"]),
              "xgb": round(float(r.xgb), 4), "rf": round(float(r.rf), 4), "avg": round(float(r.avg), 4), "actual": actual.get(r.Driver)}
             for _, r in wk.iterrows()],
}
json.dump(out, open("data/quali_model.json", "w"), separators=(",", ":"))
print(json.dumps(metrics, indent=1))
print("sessions used for Singapore:", sessions, "| pole estimate", round(pole_est, 3),
      "| predicted top 5 (avg):", wk.nsmallest(5, "avg")["Driver"].tolist())

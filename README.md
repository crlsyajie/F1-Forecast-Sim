# F1 Forecast Simulator

An unofficial fan project that predicts Formula 1 race results with XGBoost and replays them as a live race on real circuit maps.

**Live site:** https://crlsyajie.github.io/F1-Forecast-Sim/

## What's on the site

- **Simulator** – cars race around the real track outline at their predicted pace, with a broadcast-style timing tower (intervals, overtakes, fastest lap) and race banners.
- **Tracks** – every circuit on the 2026 calendar, drawn from FastF1 position data.
- **Inputs** – rain chance, temperature, regulation-change boost per team, and an editable qualifying grid. The model reruns in the browser.
- **Model** – accuracy on held-out races, feature importance, and predicted vs actual podiums for completed 2026 rounds.

## How the model works

- Training data: every race from 2024 to 2026 round 9 via [FastF1](https://github.com/theOehrly/Fast-F1), one row per driver.
- Features: qualifying gap to pole (%), grid position, the team's best qualifying gap, rain, air temperature.
- Target: the driver's median green-flag race lap, as % slower than the fastest driver.
- XGBoost with monotone constraints, race-grouped 80/20 train/test split. The trained trees are exported to JSON and evaluated in the page's JavaScript, so predictions update instantly.
- Held-out error: 0.63% of lap time (about 0.6 s/lap), versus 0.85% for predicting the average and 0.80% for a qualifying-gap-only line.

## Repo layout

```
index.html                 the website (self-contained, no build step needed to host)
pipeline/train.py          trains the model, exports trees + metrics to data/model.json
pipeline/build_site.py     packs model, tracks and results into index.html
pipeline/site.template.html  page template
pipeline/refresh.py        race-day refresh: OpenWeather forecast + qualifying grid, then rebuild
pipeline/tracks*.py        downloads circuit outlines and corner numbers from FastF1
data/                      training data, grid, practice pace, tracks, trained model
```

## Rebuild locally

```bash
python3 -m venv venv
venv/bin/pip install fastf1 xgboost==2.1.4 scikit-learn pandas
echo "YOUR_OPENWEATHER_KEY" > owm_key      # never committed (see .gitignore)
venv/bin/python pipeline/refresh.py
```

On macOS without Homebrew, XGBoost needs the OpenMP library; copying scikit-learn's bundled `libomp.dylib` next to `libxgboost.dylib` works.

## Credits

Timing data from FastF1. Weather from OpenWeather. Not affiliated with Formula 1, the FIA, or any team.

import { D, shortName, status } from "../lib/model";
import { fmtDate } from "../lib/constants";
import { trackPath } from "../lib/geo";

const CHIP = {
  done: <span className="chip done">Completed</span>,
  next: <span className="chip live">Next race</span>,
  upcoming: <span className="chip">Upcoming</span>,
};

export default function TracksPage({ onPick }) {
  return (
    <main className="page" id="page-tracks">
      <div className="sim-head">
        <span className="eyebrow">2026 calendar</span>
        <h1>Every circuit</h1>
        <p className="muted">Outlines come from FastF1 position data of each circuit's fastest qualifying lap. Pick one to simulate it.</p>
      </div>
      <div className="wall">
        {D.tracks.map((t) => {
          const end = new Date(t.date + "T12:00:00Z"), start = new Date(end - 2 * 864e5);
          const range = `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${fmtDate(t.date)}`;
          return (
            <button key={t.round} className="card" type="button" disabled={!t.path} aria-label={`Simulate ${t.name}`} onClick={() => onPick(t.round)}>
              {t.path ? (
                <svg viewBox="0 0 1200 900" aria-hidden="true"><path d={trackPath(t)} /></svg>
              ) : (
                <div className="muted" style={{ aspectRatio: "4/3", display: "grid", placeItems: "center" }}>No map data</div>
              )}
              <span className="rno" aria-hidden="true">{String(t.round).padStart(2, "0")}</span>
              <span className="nm">{shortName(t)}</span>
              <span className="dt">{range}</span>
              <div className="row">{CHIP[status(t)]}</div>
            </button>
          );
        })}
      </div>
    </main>
  );
}

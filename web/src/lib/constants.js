export const NAMES = {
  RUS: "George Russell", ANT: "Kimi Antonelli", VER: "Max Verstappen", HAD: "Isack Hadjar", LEC: "Charles Leclerc",
  HAM: "Lewis Hamilton", NOR: "Lando Norris", PIA: "Oscar Piastri", ALB: "Alex Albon", SAI: "Carlos Sainz",
  ALO: "Fernando Alonso", STR: "Lance Stroll", BEA: "Oliver Bearman", OCO: "Esteban Ocon", LAW: "Liam Lawson",
  LIN: "Arvid Lindblad", HUL: "Nico Hülkenberg", BOR: "Gabriel Bortoleto", GAS: "Pierre Gasly", COL: "Franco Colapinto",
  PER: "Sergio Pérez", BOT: "Valtteri Bottas", TSU: "Yuki Tsunoda", DOO: "Jack Doohan",
};

const TEAM_ALIAS = {
  "Red Bull Racing": "Red Bull", "Haas F1 Team": "Haas", "Kick Sauber": "Audi", Sauber: "Audi",
  RB: "Racing Bulls", "Alpine F1 Team": "Alpine", "Cadillac F1 Team": "Cadillac",
};
export const team = (t) => TEAM_ALIAS[t] || t;

export const TEAM_COLOR = {
  Mercedes: "#27d3b8", Ferrari: "#ff2a3d", McLaren: "#ff8a1f", "Red Bull": "#4a7fe0", Williams: "#52b9f0",
  "Aston Martin": "#2fae7f", Haas: "#b8bec8", "Racing Bulls": "#7f9cff", Audi: "#c0294f", Alpine: "#ff8cc6", Cadillac: "#cdb177",
};
export const tc = (t) => TEAM_COLOR[team(t)] || "#9aa3b2";

export const WET_THRESHOLD = 0.7;
export const REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const surname = (d) =>
  (NAMES[d] || d).split(" ").pop().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// country where the race is run, shortened where the full name would not fit
const COUNTRY_SHORT = { "United States": "USA", "United Arab Emirates": "UAE", "United Kingdom": "Great Britain" };
export const hostCountry = (t) => (t.location === "Kuala Lumpur" ? "Malaysia" : COUNTRY_SHORT[t.country] || t.country).toUpperCase();

export const fmtLap = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, "0")}`;
};
export const clock = (s) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
export const fmtDate = (iso) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

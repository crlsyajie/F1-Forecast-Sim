import { useEffect, useState } from "react";
import { NEXT, byRound, defaultInputs, tracks } from "./lib/model";
import SimulatorPage from "./components/SimulatorPage";
import TracksPage from "./components/TracksPage";
import InputsPage from "./components/InputsPage";
import ModelPage from "./components/ModelPage";

const ROUTES = ["sim", "tracks", "inputs", "model"];
const readRoute = () => (ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "sim");

const IconInputs = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
  </svg>
);
const IconModel = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [round, setRound] = useState(byRound[NEXT]?.path ? NEXT : tracks[0].round);
  const [inputs, setInputs] = useState(defaultInputs);

  useEffect(() => {
    const on = () => { setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (r) => { location.hash = r; };
  const simulate = (rd) => { setRound(rd); go("sim"); };
  const cur = (r) => (route === r ? "page" : undefined);

  return (
    <div className="frame">
      <nav className="nav" aria-label="Sections">
        <div className="nav-in">
          <a className="brand" href="#sim" aria-label="CYF Formula 1 Forecast Simulator, home">
            <i className="speed" aria-hidden="true" /><b>CYF</b><span>F1<br />Forecast</span>
          </a>
          <div className="tabs">
            <a href="#sim" aria-current={cur("sim")}>Simulator</a>
            <a href="#tracks" aria-current={cur("tracks")}>Tracks</a>
            <a href="#inputs" aria-current={cur("inputs")}>Inputs</a>
            <a href="#model" aria-current={cur("model")}>Model</a>
          </div>
          <div className="icons">
            <a href="#inputs" aria-label="Race inputs" title="Race inputs" aria-current={cur("inputs")}><IconInputs /></a>
            <a href="#model" aria-label="Model accuracy" title="Model accuracy" aria-current={cur("model")}><IconModel /></a>
          </div>
        </div>
      </nav>
      {/* the simulator stays mounted so the race keeps its place when you visit other pages */}
      <div hidden={route !== "sim"}><SimulatorPage round={round} setRound={setRound} inputs={inputs} active={route === "sim"} /></div>
      {route === "tracks" && <TracksPage onPick={simulate} />}
      {route === "inputs" && <InputsPage inputs={inputs} setInputs={setInputs} />}
      {route === "model" && <ModelPage onReplay={simulate} />}
    </div>
  );
}

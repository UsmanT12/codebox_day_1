import { useEffect, useRef, useState } from "react";
import FoodSearch from "./FoodSearch.jsx";
import Dashboard from "./Dashboard.jsx";
import Goals from "./Goals.jsx";
import { dateLabel, today } from "./format.js";

export default function Diary({ api, disabled }) {
  const [date, setDate] = useState(today);
  const [view, setView] = useState("daily");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editingGoals, setEditingGoals] = useState(false);
  const mutation = useRef(false);
  const weekly = view === "weekly";
  const dataKey = `${view}:${date}:${revision}`;
  const visibleData = data?.key === dataKey ? data.value : null;

  useEffect(() => {
    let active = true;
    setError("");
    api.request(weekly ? `/api/logs/weekly?end=${date}` : `/api/logs?date=${date}`).then((value) => {
      if (active) setData({ key: dataKey, value });
    }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [api, date, weekly, dataKey]);

  async function mutate(path, options) {
    if (mutation.current || disabled) throw new Error("Please wait for the current operation to finish.");
    mutation.current = true; setBusy(true);
    try { await api.request(path, options); setRevision((value) => value + 1); }
    finally { mutation.current = false; setBusy(false); }
  }
  async function deleteLog(id) {
    try { await mutate(`/api/logs/${id}`, { method: "DELETE" }); }
    catch (error) { setError(error.message); }
  }
  return <div id="diary-content">
    <div className="page-heading"><div><p className="eyebrow">SMALL DETAILS. A FULLER PICTURE.</p><h1>Your nutrition, in focus.</h1></div>
      <div className="diary-controls"><button className="secondary goals-toggle" disabled={!visibleData || busy || disabled} aria-expanded={editingGoals} onClick={() => setEditingGoals(!editingGoals)}>Daily goals</button><label className="date-control">Diary date<input type="date" min="1900-01-01" max="2100-12-31" required value={date} disabled={busy || disabled} onChange={(event) => { if (event.target.value && event.target.validity.valid) setDate(event.target.value); }} /></label></div>
    </div>
    {editingGoals && visibleData && <Goals values={visibleData.summary.values} busy={busy || disabled} onClose={() => setEditingGoals(false)} onSave={(goals) => mutate("/api/goals", { method: "PUT", body: JSON.stringify({ goals }) })} />}
    <div className="view-bar"><nav aria-label="Diary views">{["daily", "weekly"].map((name) => <button key={name} className={`view-button${view === name ? " active" : ""}`} aria-pressed={view === name} disabled={busy || disabled} onClick={() => setView(name)}>{name === "daily" ? "Daily" : "Weekly"}</button>)}</nav><span id="date-caption">{weekly ? visibleData && `${dateLabel(visibleData.start)} – ${dateLabel(visibleData.end)}` : dateLabel(date)}</span></div>
    <div hidden={weekly}><FoodSearch api={api} date={date} busy={busy || disabled} onAdd={(body) => mutate("/api/logs", { method: "POST", body: JSON.stringify(body) })} /></div>
    <div className={`dashboard-message${error ? " error" : ""}`} role="status" aria-live="polite">{error || (!visibleData ? "Loading your diary…" : "")}</div>
    {error && <button className="secondary" disabled={busy || disabled} onClick={() => setRevision((value) => value + 1)}>Retry loading diary</button>}
    {visibleData && <Dashboard data={visibleData} weekly={weekly} date={date} busy={busy || disabled} onDelete={deleteLog} />}
  </div>;
}

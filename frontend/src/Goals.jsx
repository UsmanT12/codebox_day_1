import { useState } from "react";

export default function Goals({ values, busy, onSave, onClose }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(values.map((item) => [item.key, String(item.target)])));
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    try { await onSave(Object.fromEntries(values.map(({ key }) => [key, Number(draft[key])]))); onClose(); }
    catch (error) { setError(error.message); }
  }
  return <section className="goals-panel" aria-labelledby="goals-title">
    <div className="section-heading"><h2 id="goals-title">Daily goals</h2><button type="button" className="text-button" onClick={onClose} disabled={busy}>Cancel</button></div>
    <form onSubmit={submit}>
      <div className="goals-grid">{values.map((item, index) => <label key={item.key}>{item.label} <span>({item.unit})</span><input autoFocus={index === 0} type="number" min="0.01" max="100000" step="any" required disabled={busy} value={draft[item.key]} onChange={(event) => setDraft({ ...draft, [item.key]: event.target.value })} /></label>)}</div>
      <div className="goals-actions"><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save goals"}</button><button type="button" className="text-button" disabled={busy} onClick={() => setDraft(Object.fromEntries(values.map((item) => [item.key, String(item.defaultTarget)])))}>Reset to defaults</button></div>
      {error && <p className="message error" role="alert">{error}</p>}
    </form>
  </section>;
}

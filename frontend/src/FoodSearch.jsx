import { useEffect, useRef, useState } from "react";
import { dateLabel, format } from "./format.js";

export default function FoodSearch({ api, date, busy, onAdd }) {
  const [query, setQuery] = useState("");
  const [amount, setAmount] = useState("100");
  const [unit, setUnit] = useState("g");
  const [foods, setFoods] = useState([]);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchVersion = useRef(0);
  const selectionVersion = useRef(0);
  const addButton = useRef(null);
  useEffect(() => () => { searchVersion.current++; selectionVersion.current++; }, []);
  useEffect(() => { if (selected) addButton.current?.focus(); }, [selected]);

  function clearSelection() {
    selectionVersion.current++;
    setSelected(null);
    setUnit((value) => ["g", "oz"].includes(value) ? value : "serving");
  }
  async function search(event) {
    event.preventDefault();
    if (query.trim().length < 2) { setMessage("Enter at least two characters."); setError(true); return; }
    const version = ++searchVersion.current;
    clearSelection(); setFoods([]); setSearching(true); setError(false); setMessage("Searching USDA foods…");
    try {
      const result = await api.request(`/api/foods/search?q=${encodeURIComponent(query.trim())}`);
      if (version !== searchVersion.current) return;
      setFoods(result.foods);
      setMessage(result.foods.length ? "Select a food." : "No foods found. Try a simpler name or a different spelling.");
    } catch (error) { if (version === searchVersion.current) { setMessage(error.message); setError(true); } }
    finally { if (version === searchVersion.current) setSearching(false); }
  }
  async function selectFood(food) {
    const version = ++selectionVersion.current;
    setSelected(null); setError(false); setMessage("Loading nutrition and serving sizes…");
    try {
      const details = await api.request(`/api/foods/${food.fdcId}`);
      if (version !== selectionVersion.current) return;
      setSelected(details);
      setUnit((value) => ["g", "oz"].includes(value) ? value : details.portions.find((portion) => portion.id !== "oz")?.id || "serving");
      setFoods([]); setMessage("");
    } catch (error) { if (version === selectionVersion.current) { setMessage(error.message); setError(true); } }
  }
  const portion = selected?.portions.find((item) => item.id === unit);
  const unavailable = unit !== "g" && !portion;
  const grams = Number(amount) * (portion?.grams || 1);
  async function add(event) {
    event.preventDefault();
    if (!selected || busy || unavailable) return;
    const version = selectionVersion.current;
    setError(false);
    try {
      await onAdd({ date, fdcId: selected.fdcId, amount: Number(amount), unit: unit === "g" ? "g" : "serving", portionId: unit });
      if (version !== selectionVersion.current) return;
      setMessage(`Added ${selected.name} to ${dateLabel(date)}.`); clearSelection();
    } catch (error) { if (version === selectionVersion.current) { setMessage(error.message); setError(true); } }
  }

  return <section className="search-panel" aria-labelledby="search-title">
    <div className="search-intro"><span className="section-number">01</span><h2 id="search-title">What’s on your plate?</h2></div>
    <form className="search-form" onSubmit={search}>
      <label className="food-input">Food<input type="search" placeholder="Search foods… e.g. egg" minLength={2} maxLength={120} required value={query} onChange={(event) => setQuery(event.target.value)} disabled={busy} /></label>
      <label>Quantity<input form="portion-form" type="number" min="0.01" max="10000" step="any" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} /></label>
      <label>Unit<select form="portion-form" required value={unit} onChange={(event) => setUnit(event.target.value)} disabled={busy}>
        <option value="g">Grams (g)</option>
        {selected ? selected.portions.map((item) => <option key={item.id} value={item.id}>{item.id === "oz" ? "Ounces (oz)" : `${item.label} (${format(item.grams)} g)`}</option>) : <option value="oz">Ounces (oz)</option>}
        {(!selected || unit === "serving") && <option value="serving">{selected ? "Servings unavailable" : "Servings"}</option>}
      </select></label>
      <button type="submit" className="primary" disabled={searching || busy}>Search foods <span aria-hidden="true">↗</span></button>
    </form>
    <p className={`message${error ? " error" : ""}`} role="status" aria-live="polite">{message}</p>
    <div className="results">{foods.map((food) => <button key={food.fdcId} className="result" type="button" onClick={() => selectFood(food)} disabled={busy}><span className="result-name">{food.name}</span><span className="result-meta">{food.dataType}{food.brand ? ` · ${food.brand}` : ""}</span></button>)}</div>
    <form id="portion-form" className="portion-form" hidden={!selected} onSubmit={add}>
      {selected && <>
        <div className="selected-food"><h3>{selected.name}</h3></div>
        <div className="portion-controls"><button ref={addButton} type="submit" className="primary" disabled={busy || unavailable}>{busy ? "Saving…" : "+ Add food"}</button><button type="button" className="text-button" onClick={clearSelection} disabled={busy}>Cancel</button></div>
        <p id="portion-preview">{unavailable ? "No serving weight is available for this food. Choose grams to add it." : grams > 0 && Number.isFinite(grams) ? `${format(grams)} g · ${selected.nutrients.calories === null ? "Calories not reported" : `${format(selected.nutrients.calories * grams / 100)} kcal`} · Add to ${dateLabel(date)}` : "Enter an amount to see your portion."}</p>
      </>}
    </form>
  </section>;
}

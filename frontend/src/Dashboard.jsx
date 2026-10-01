import { dateLabel, format, today } from "./format.js";

function Progress({ item }) {
  return <div className={`track ${item.color}`} role="meter" aria-label={`${item.label}: ${format(item.percent)}% of target, ${item.statusLabel.toLowerCase()}`} aria-valuemin={0} aria-valuemax={Math.max(100, item.percent)} aria-valuenow={item.percent}><span style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }} /></div>;
}
export default function Dashboard({ data, weekly, date, busy, onDelete }) {
  const { summary } = data;
  const macros = summary.values.filter((item) => weekly ? ["calories", "protein", "fiber"].includes(item.key) : item.group === "macro");
  return <div id="dashboard">
    <section className="summary-section" aria-labelledby="summary-title">
      <div className="section-heading"><h2 id="summary-title">{weekly ? "This week" : date === today() ? "Today" : dateLabel(date)}</h2><span>{weekly ? `${data.daysLogged} of 7 days logged · Unlogged days count as zero` : "Your daily totals"}</span></div>
      <div className="macro-grid">{macros.map((item) => <article className="macro-card" key={item.key}>
        <p className="macro-label">{weekly ? "Average " : ""}{item.label}</p>
        <p className="macro-value">{format(item.total)}<small>{item.unit}</small></p>
        <p className="macro-target">of {format(item.target)} {item.unit} / day</p><Progress item={item} />
        <div className={`macro-bottom ${item.color}`}><strong>{format(item.percent)}%</strong><span>{item.statusLabel}</span></div>
        {item.missing > 0 && <p className="missing-note">Missing in {item.missing} food{item.missing === 1 ? "" : "s"}</p>}
      </article>)}</div>
    </section>
      <section className="micro-panel" aria-labelledby="micro-title">
        <div className="section-heading"><div><p className="eyebrow">THE SMALL THINGS THAT COUNT</p><h2 id="micro-title">{weekly ? "Weekly nutrient averages" : "Micronutrients"}</h2></div><span className="target-label">DAILY TARGET</span></div>
        <div className="legend" aria-label="Micronutrient color ranges"><span className="red">Below 60%</span><span className="yellow">60–89%</span><span className="green">90% and up</span></div>
        <div className="micros">{summary.values.filter((item) => item.group === "micro").map((item) => <article className="nutrient-row" key={item.key}>
          <div className="nutrient-top"><div><h3 className="nutrient-name">{item.label}</h3><p className="nutrient-value">{format(item.total)} / {format(item.target)} {item.unit}</p></div><div className={`nutrient-percent ${item.color}`}>{format(item.percent)}%<span className="nutrient-status">{item.statusLabel}</span></div></div>
          <Progress item={item} />{item.missing > 0 && <p className="missing-note">Not reported in {item.missing} logged food{item.missing === 1 ? "" : "s"}</p>}
        </article>)}</div>
      </section>
    {!weekly && <section className="food-log" aria-labelledby="log-title">
      <div className="section-heading"><h2 id="log-title">{date === today() ? "Today’s foods" : "Foods for this day"}</h2><span>{data.logs.length} {data.logs.length === 1 ? "entry" : "entries"}</span></div>
      {!data.logs.length && <p className="empty-log">Nothing logged yet. Search for a food above and add your first serving.</p>}
      {data.logs.map((log) => <article className="log-row" key={log.id}>
        <div><h3>{log.food_name}</h3><p className="log-meta">{log.unit === "serving" && log.portion_label === "oz" ? `${format(log.amount)} oz (${format(log.grams)} g)` : `${format(log.grams)} g${log.unit === "serving" ? ` · ${format(log.amount)} × ${log.portion_label}` : ""}`} · {log.nutrients.calories === null ? "Calories not reported" : `${format(log.nutrients.calories)} kcal`}</p></div>
        <button className="delete-button" aria-label={`Delete ${log.food_name}`} disabled={busy} onClick={() => onDelete(log.id)}>Delete</button>
      </article>)}
    </section>}
  </div>;
}

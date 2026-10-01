export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
export const format = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: value > 100 ? 0 : 1 }).format(value);
export const dateLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

(function (root, factory) {
  const nutrition = factory();
  if (typeof module === "object" && module.exports) module.exports = nutrition;
  else root.Nutrition = nutrition;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const nutrients = [
    { key: "calories", label: "Calories", unit: "kcal", target: 2200, group: "macro" },
    { key: "protein", label: "Protein", unit: "g", target: 150, group: "macro" },
    { key: "carbs", label: "Carbohydrates", unit: "g", target: 275, group: "macro" },
    { key: "fat", label: "Fat", unit: "g", target: 73, group: "macro" },
    { key: "fiber", label: "Fiber", unit: "g", target: 30, group: "macro" },
    { key: "calcium", label: "Calcium", unit: "mg", target: 1000, group: "micro" },
    { key: "iron", label: "Iron", unit: "mg", target: 18, group: "micro" },
    { key: "magnesium", label: "Magnesium", unit: "mg", target: 400, group: "micro" },
    { key: "potassium", label: "Potassium", unit: "mg", target: 3400, group: "micro" },
    { key: "vitaminC", label: "Vitamin C", unit: "mg", target: 90, group: "micro" },
    { key: "vitaminD", label: "Vitamin D", unit: "mcg", target: 20, group: "micro" },
    { key: "vitaminB12", label: "Vitamin B12", unit: "mcg", target: 2.4, group: "micro" },
    { key: "folate", label: "Folate", unit: "mcg", target: 400, group: "micro" },
  ];

  function status(key, percent) {
    let color;
    if (key === "protein") color = percent >= 90 ? "green" : percent >= 60 ? "yellow" : "red";
    else if (key === "calories") {
      color = percent >= 90 && percent <= 105 ? "green"
        : percent >= 75 && percent <= 115 ? "yellow" : "red";
    } else if (key === "fat" || key === "carbs") {
      const distance = Math.abs(100 - percent);
      color = distance <= 20 ? "green" : distance <= 35 ? "yellow" : "red";
    } else if (key === "fiber") color = percent > 110 ? "orange" : percent >= 90 ? "green" : percent >= 60 ? "yellow" : "red";
    else color = percent >= 90 ? "green" : percent >= 60 ? "yellow" : "red";
    if (color === "red" && percent > 100) color = "orange";
    const label = color === "green" ? "On target" : percent > 100 ? "Above target" : "Below target";
    return { color, label };
  }

  function goalsFor(saved = {}) {
    return Object.fromEntries(nutrients.map(({ key, target }) => [key,
      typeof saved?.[key] === "number" && Number.isFinite(saved[key]) && saved[key] >= 0.01 && saved[key] <= 100000 ? saved[key] : target,
    ]));
  }

  function summarize(logs, days = 1, savedGoals = {}) {
    const goals = goalsFor(savedGoals);
    const values = nutrients.map((nutrient) => {
      let missing = 0;
      const total = logs.reduce((sum, log) => {
        const value = log.nutrients[nutrient.key];
        if (typeof value !== "number" || !Number.isFinite(value)) { missing++; return sum; }
        return sum + value;
      }, 0) / days;
      const target = goals[nutrient.key];
      const percent = total / target * 100;
      const indicator = status(nutrient.key, percent);
      return { ...nutrient, defaultTarget: nutrient.target, target, total, percent, missing, color: indicator.color, statusLabel: indicator.label };
    });
    const ranked = values.filter((value) => value.group === "micro" || value.key === "fiber");
    return {
      values,
      gaps: [...ranked].sort((a, b) => a.percent - b.percent).slice(0, 3),
      strongest: [...ranked].sort((a, b) => b.percent - a.percent).slice(0, 3),
      doingWell: ranked.filter((value) => value.percent >= 90),
    };
  }

  const gramsPerOunce = 28.349523125;
  return { nutrients, status, summarize, gramsPerOunce, goalsFor };
});

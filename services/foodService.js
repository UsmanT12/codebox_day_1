const { nutrients, gramsPerOunce } = require("./nutrition");

// USDA nutrient IDs (not nutrient numbers). All values normalized per 100 g.
const mapping = {
  calories: [2048, 2047, 1008], protein: [1003], carbs: [1005], fat: [1004],
  fiber: [1079], calcium: [1087], iron: [1089], magnesium: [1090], potassium: [1092],
  vitaminC: [1162], vitaminD: [1114], vitaminB12: [1178], folate: [1190, 1177],
};
const preferredTypes = ["Foundation", "SR Legacy", "Survey (FNDDS)"];
const cache = new Map();

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function convert(value, from, to) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const unit = String(from || "").toLowerCase().replace(/μ|µ/g, "u");
  const target = to === "mcg" ? "ug" : to;
  if (unit === target || (unit === "mcg" && target === "ug")) return value;
  const scale = { g: 1, mg: 0.001, ug: 0.000001, mcg: 0.000001 };
  if (scale[unit] && scale[target]) return value * scale[unit] / scale[target];
  if (unit === "kj" && target === "kcal") return value / 4.184;
  return null;
}

function normalizeFood(food) {
  const entries = food.foodNutrients || [];
  const values = {};
  for (const definition of nutrients) {
    let value = null;
    for (const id of mapping[definition.key]) {
      const entry = entries.find((item) => (item.nutrient?.id ?? item.nutrientId) === id);
      if (entry) value = convert(entry.amount ?? entry.value, entry.nutrient?.unitName ?? entry.unitName, definition.unit);
      if (value !== null) break;
    }
    values[definition.key] = value;
  }

  const portions = [];
  if (food.servingSize > 0 && /^(g|grm)$/i.test(food.servingSizeUnit || "")) {
    portions.push({ id: "label", label: food.householdServingFullText || "Label serving", grams: food.servingSize });
  }
  for (const [index, portion] of (food.foodPortions || []).entries()) {
    if (!(portion.gramWeight > 0) || !Number.isFinite(portion.gramWeight)) continue;
    const measure = portion.measureUnit?.name;
    const description = portion.portionDescription || [portion.amount || 1, measure && measure !== "undetermined" ? measure : "", portion.modifier].filter(Boolean).join(" ");
    portions.push({ id: `portion-${index}`, label: description || "USDA portion", grams: portion.gramWeight });
  }
  return {
    fdcId: food.fdcId, name: food.description, dataType: food.dataType,
    brand: food.brandOwner || food.brandName || null,
    servingAmount: 100, servingUnit: "g",
    // USDA "oz, yields" refers to a prepared yield, not an ounce of food weight.
    // Offer an exact weight ounce instead, while retaining other known portions.
    portions: [
      ...portions.filter((portion) => !/\b(?:oz|ounces?)\b/i.test(portion.label)).slice(0, 12),
      { id: "oz", label: "oz", grams: gramsPerOunce },
    ],
    nutrients: values,
  };
}

async function usda(path, options = {}) {
  const key = process.env.USDA_API_KEY?.trim();
  if (!key) throw fail(503, "Food search needs USDA_API_KEY in your local .env. Add it, then restart the server.");
  let response;
  try {
    response = await fetch(`https://api.nal.usda.gov/fdc/v1/${path}`, {
      ...options, headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw fail(502, "USDA could not be reached. Please try again.");
  }
  if (response.status === 404) throw fail(404, "This food could not be found in USDA.");
  if (response.status === 429) throw fail(503, "USDA's request limit was reached. Please try again later.");
  if ([401, 403].includes(response.status)) throw fail(503, "USDA rejected the API key. Check USDA_API_KEY in .env.");
  if (!response.ok) throw fail(502, "USDA is unavailable. Please try again.");
  try { return await response.json(); }
  catch { throw fail(502, "USDA returned an unreadable response. Please try again."); }
}

async function searchFoods(query) {
  const result = await usda("foods/search", {
    method: "POST", body: JSON.stringify({ query, dataType: preferredTypes, pageSize: 8 }),
  });
  let foods = result.foods || [];
  // Fill remaining places with branded matches, without displacing whole-food results.
  if (foods.length < 8) {
    const branded = await usda("foods/search", {
      method: "POST", body: JSON.stringify({ query, dataType: ["Branded"], pageSize: 8 - foods.length }),
    });
    foods = foods.concat(branded.foods || []);
  }
  return foods.slice(0, 8).map((food) => ({
    fdcId: food.fdcId, name: food.description, dataType: food.dataType,
    brand: food.brandOwner || food.brandName || null,
  }));
}

async function getFood(fdcId) {
  const cached = cache.get(fdcId);
  if (cached && cached.expires > Date.now()) return cached.food;
  const food = normalizeFood(await usda(`food/${fdcId}`));
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(fdcId, { food, expires: Date.now() + 10 * 60 * 1000 });
  return food;
}

module.exports = { getFood, searchFoods, normalizeFood, fail };

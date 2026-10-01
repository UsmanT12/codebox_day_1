import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createApi } from "../frontend/src/api.js";
import nutrition from "../services/nutrition.js";

const response = (body, status = 200) => ({ status, ok: status < 400, json: async () => body });

test("frontend shares one session refresh and rejects responses after account changes", async () => {
  let releaseRefresh;
  let refreshCount = 0;
  let renewed = false;
  const api = createApi(() => assert.fail("Unexpected expiry"), async (path) => {
    if (path === "/api/auth/refresh") {
      refreshCount++;
      await new Promise((resolve) => { releaseRefresh = resolve; });
      renewed = true;
      return response({});
    }
    if (path === "/api/auth/signout") return response(null, 204);
    return renewed ? response({ logs: [] }) : response({ error: "Expired" }, 401);
  });
  const first = api.request("/api/logs");
  const second = api.request("/api/logs");
  await new Promise(setImmediate);
  assert.equal(refreshCount, 1);
  releaseRefresh();
  await Promise.all([first, second]);

  let release;
  const pendingApi = createApi(() => {}, async (path) => {
    if (path === "/api/auth/signout") return response(null, 204);
    await new Promise((resolve) => { release = resolve; });
    return response({ logs: ["previous account"] });
  });
  const pending = pendingApi.request("/api/logs");
  await pendingApi.signOut();
  release();
  await assert.rejects(pending, /account changed/);
});

test("React supports sign-in, quantity and ounces, saving, weekly view, deletion, and sign-out", async () => {
  const temp = await mkdtemp(resolve("node_modules/.trace-react-test-"));
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/tracker/" });
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  let root;
  try {
    const result = await build({
      configFile: false, plugins: [react()], logLevel: "silent",
      build: { ssr: resolve("frontend/src/App.jsx"), write: false },
    });
    const file = resolve(temp, "App.mjs");
    await writeFile(file, result.output.find((item) => item.type === "chunk" && item.isEntry).code);
    const { default: App } = await import(pathToFileURL(file).href);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import("react-dom/client");
    let logs = [];
    let saved;
    let goals = {};
    const user = { id: "account-one", email: "test@example.com" };
    globalThis.fetch = async (path, options) => {
      if (path === "/api/auth/session" || path === "/api/auth/refresh") return response({ error: "Sign in" }, 401);
      if (path === "/api/auth/signin") return response({ user });
      if (path === "/api/auth/signout") return response(null, 204);
      if (path === "/api/goals") { goals = JSON.parse(options.body).goals; return response({ goals }); }
      if (path.startsWith("/api/foods/search")) return response({ foods: [{ fdcId: 1, name: "Egg", dataType: "Foundation" }] });
      if (path === "/api/foods/1") return response({ fdcId: 1, name: "Egg", portions: [{ id: "oz", label: "oz", grams: nutrition.gramsPerOunce }], nutrients: { calories: 150 } });
      if (path === "/api/logs" && options.method === "POST") {
        saved = JSON.parse(options.body);
        logs = [{ id: "log-one", food_name: "Egg", amount: saved.amount, unit: "serving", portion_label: "oz", grams: saved.amount * nutrition.gramsPerOunce, nutrients: { calories: 85 } }];
        return response(logs[0], 201);
      }
      if (path === "/api/logs/log-one" && options.method === "DELETE") { logs = []; return response(null, 204); }
      if (path.startsWith("/api/logs/weekly")) return response({ start: "2026-09-24", end: "2026-09-30", count: logs.length, daysLogged: 1, summary: nutrition.summarize(logs, 7, goals) });
      if (path.startsWith("/api/logs?")) return response({ logs, summary: nutrition.summarize(logs, 1, goals) });
      assert.fail(`Unexpected request: ${path}`);
    };
    const doc = dom.window.document;
    const click = async (label) => {
      await act(async () => {
      const button = [...doc.querySelectorAll("button")].find((item) => item.textContent.trim() === label);
      assert.ok(button, `Button ${label} exists`);
      button.click();
      await new Promise(setImmediate);
      });
      await act(async () => { await new Promise(setImmediate); });
    };
    const input = async (selector, value) => act(async () => {
      const element = doc.querySelector(selector);
      const prototype = element.tagName === "SELECT" ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      element.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    root = createRoot(doc.getElementById("root"));
    await act(async () => { root.render(React.createElement(App)); });
    await input('input[type="email"]', "test@example.com");
    await input('input[type="password"]', "password123");
    await click("Sign in");
    assert.match(doc.body.textContent, /Your nutrition, in focus/);
    assert.doesNotMatch(doc.body.textContent, /THE BRIGHT SPOTS|Totals use reported nutrient values/);
    await click("Daily goals");
    await input(".goals-grid input", "1800");
    await click("Save goals");
    assert.equal(goals.calories, 1800);
    assert.match(doc.querySelector(".macro-target").textContent, /1,800/);
    await click("Daily goals");
    assert.equal(doc.querySelector(".goals-grid input").value, "1800");
    await click("Reset to defaults");
    assert.equal(doc.querySelector(".goals-grid input").value, "2200");
    await click("Cancel");
    assert.equal(goals.calories, 1800);
    await input('input[type="search"]', "egg");
    await input('input[type="number"]', "2");
    await input("select", "oz");
    await act(async () => { doc.querySelector(".search-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(setImmediate); });
    await act(async () => { doc.querySelector(".result").click(); await new Promise(setImmediate); });
    assert.equal(doc.querySelector('input[type="number"]').value, "2");
    assert.equal(doc.querySelector("select").value, "oz");
    await click("+ Add food");
    assert.equal(saved.amount, 2);
    assert.equal(saved.portionId, "oz");
    assert.match(doc.querySelector(".log-meta").textContent, /2 oz/);
    await click("Weekly");
    assert.match(doc.body.textContent, /Weekly nutrient averages/);
    await click("Daily");
    await click("Delete");
    assert.match(doc.body.textContent, /Nothing logged yet/);
    await click("Sign out");
    assert.match(doc.body.textContent, /Welcome back/);
    assert.equal(doc.querySelector(".food-log"), null);
  } finally {
    if (root) await act(async () => { root.unmount(); });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.fetch = previous.fetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    await rm(temp, { recursive: true, force: true });
  }
});

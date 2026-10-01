import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Email confirmation links can contain tokens; do not retain them in the URL.
if (location.hash.includes("access_token") || location.hash.includes("error")) {
  history.replaceState(null, "", location.pathname + location.search);
}
createRoot(document.getElementById("root")).render(<App />);

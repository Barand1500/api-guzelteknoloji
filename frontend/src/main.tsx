import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./shared/fonts.css";
import "./shared/base.css";
import "./pages/login/login.css";
import "./pages/settings/settings.css";
import "./pages/dashboard/dashboard.css";
import "./pages/category/category.css";
import "./shared/shell.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

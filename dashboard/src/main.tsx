import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/fraunces/latin-400.css";
import "@fontsource/fraunces/latin-400-italic.css";

const App = React.lazy(() => import("./AdminEntry"));
import Platform from "./Platform";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense
      fallback={
        <div className="lt-app lt-loading">Opening your workspace…</div>
      }
    >
      {window.location.pathname.startsWith("/admin") ? <App /> : <Platform />}
    </React.Suspense>
  </React.StrictMode>,
);

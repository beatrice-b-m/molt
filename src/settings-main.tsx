import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { SettingsApp } from "./pages/Settings";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<SettingsApp />
	</StrictMode>,
);

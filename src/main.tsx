debugger; // Added this line to force a pause in browser execution

console.log("main.tsx: Script file loaded and starting execution.");

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";

console.log("main.tsx script started.");

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
  console.log("React app render initiated.");
} else {
  console.error("Root element with ID 'root' not found. React app cannot be mounted.");
}
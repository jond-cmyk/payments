import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";

console.log("main.tsx script started."); // Debugging line

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
  console.log("React app render initiated."); // Debugging line
} else {
  console.error("Root element with ID 'root' not found. React app cannot be mounted.");
}
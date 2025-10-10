console.log("main.tsx: Script started executing!"); // Added for debugging

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Uncommented
import './globals.css'; // Keep global styles

console.log("main.tsx is executing!"); // Added for debugging

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode> {/* Re-enabled StrictMode */}
    <App /> {/* Rendering the App component */}
  </React.StrictMode>,
);
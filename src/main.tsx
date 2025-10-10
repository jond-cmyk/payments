console.log("main.tsx: Script started executing!"); // Added for debugging

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Import the main App component
import './globals.css'; // Keep global styles

console.log("main.tsx is executing!"); // Added for debugging

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App /> {/* Render the App component */}
  </React.StrictMode>,
);
console.log("main.tsx: Script started executing!"); // Added for debugging

import React from 'react';
import ReactDOM from 'react-dom/client';
// import App from './App'; // Temporarily commented out
import './globals.css'; // Keep global styles

console.log("main.tsx is executing!"); // Added for debugging

ReactDOM.createRoot(document.getElementById('root')!).render(
  // <React.StrictMode> // Temporarily removed StrictMode
    <div style={{ padding: '20px', textAlign: 'center', fontSize: '24px', color: 'green' }}>
      Hello from Dyad! If you see this, React is working.
      <p>Check console for more logs.</p>
      <p>This is a temporary diagnostic message.</p>
    </div>
  // </React.StrictMode>,
);
import React from 'react';
import ReactDOM from 'react-dom/client';
import './globals.css'; // Keep global styles

console.log("main.tsx is executing!"); // Added for debugging

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="p-8 text-center text-2xl font-bold">
      Hello World from main.tsx!
    </div>
  </React.StrictMode>,
);
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';
import ErrorBoundary from './components/ErrorBoundary'; // Import ErrorBoundary

console.log("main.tsx is executing!"); // Added for debugging

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary> {/* Wrap App with ErrorBoundary */}
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
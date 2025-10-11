import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './globals.css';
import ErrorBoundary from './components/ErrorBoundary';

console.log("main.tsx is executing!");

ReactDOM.createRoot(document.getElementById('root')!).render(
  // Temporarily removed React.StrictMode to debug potential double-rendering issues
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
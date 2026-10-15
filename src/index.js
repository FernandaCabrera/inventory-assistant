import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { loadVisitCounter } from './visits';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Visit counts (Vercel Web Analytics). Vercel passes the counter's address to the build; the two
// values must be written out in full here so the build can put them in. See src/visits.js.
loadVisitCounter(
  document,
  process.env.REACT_APP_VERCEL_OBSERVABILITY_BASEPATH,
  process.env.REACT_APP_VERCEL_OBSERVABILITY_CLIENT_CONFIG
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

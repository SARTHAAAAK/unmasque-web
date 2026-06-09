import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

window.onerror = function(msg, src, lineno, colno, error) {
  document.body.innerHTML += '<div style="position:fixed;top:0;left:0;background:red;color:white;z-index:9999;padding:20px;">' + msg + '<br>' + (error ? error.stack : '') + '</div>';
};
window.onunhandledrejection = function(event) {
  document.body.innerHTML += '<div style="position:fixed;top:0;left:0;background:red;color:white;z-index:9999;padding:20px;">Unhandled Promise: ' + event.reason + '</div>';
};

// Initialize theme before React renders to prevent flash of unstyled content
const savedTheme = localStorage.getItem('unmasque.theme') || 'Dark'
let themeToApply = savedTheme
if (savedTheme === 'System') {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  themeToApply = prefersDark ? 'Dark' : 'Light'
}
document.documentElement.setAttribute('data-theme', themeToApply.toLowerCase())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--card)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
          },
          success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--card)' } },
          error:   { iconTheme: { primary: 'var(--red)', secondary: 'var(--card)' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)

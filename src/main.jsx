import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// The admin dashboard is code-split: participants never download it.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

if (isAdminRoute) {
  // Keep the admin page out of search engines.
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
  document.title = 'Study admin';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);

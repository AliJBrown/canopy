import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectBoard from './pages/ProjectBoard';
import ReportsPage from './pages/ReportsPage';
import GoalsPage from './pages/GoalsPage';
import OrgGoalsPage from './pages/OrgGoalsPage';
import MyGoalsPage from './pages/MyGoalsPage';
import AutomationsPage from './pages/AutomationsPage';
import AdminPage from './pages/AdminPage';

function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useApp();

  useEffect(() => {
    const token = params.get('token');
    if (token) {
      // Fetch user info then redirect
      import('./api/auth').then(({ getMe }) => {
        localStorage.setItem('auth_token', token);
        getMe().then(user => {
          login(token, user);
          navigate('/projects', { replace: true });
        }).catch(() => navigate('/login?error=oauth_error', { replace: true }));
      });
    } else {
      navigate('/login?error=oauth_error', { replace: true });
    }
  }, []);

  return (
    <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
      Completing sign in...
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/projects" replace />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="goals" element={<OrgGoalsPage />} />
              <Route path="my-goals" element={<MyGoalsPage />} />
              <Route path="p/:projectKey" element={<ProjectBoard />} />
              <Route path="p/:projectKey/reports" element={<ReportsPage />} />
              <Route path="p/:projectKey/goals" element={<GoalsPage />} />
              <Route path="p/:projectKey/automations" element={<AutomationsPage />} />
              <Route path="p/:projectKey/:view" element={<ProjectBoard />} />
              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Target } from 'lucide-react';

export default function ProtectedRoute({ adminOnly = false }) {
  const { user, isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Target size={32} className="text-indigo-500 animate-pulse" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/projects" replace />;

  return <Outlet />;
}

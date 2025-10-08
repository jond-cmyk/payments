import React from 'react';
import { useSession } from '@/contexts/SessionContext';
import { Navigate, Outlet } from 'react-router-dom';

const AuthLayout: React.FC = () => {
  const { session, loading } = useSession();

  if (loading) {
    return <div>Loading application...</div>; // Or a loading spinner
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default AuthLayout;
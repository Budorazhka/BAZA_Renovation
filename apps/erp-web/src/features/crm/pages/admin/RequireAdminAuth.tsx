import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
}

const hasAdminToken = () => {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem('admin_token') || sessionStorage.getItem('admin_token');
  return Boolean(token);
};

const RequireAdminAuth: React.FC<Props> = ({ children }) => {
  const location = useLocation();
  if (!hasAdminToken()) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
};

export default RequireAdminAuth;

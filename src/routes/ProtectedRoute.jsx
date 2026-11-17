import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function ProtectedRoute({ children, allowedRoles }) {
    const isAuthenticated = useAuthStore(s => s.isAuthenticated);
    const user = useAuthStore(s => s.user);
    const logout = useAuthStore(s => s.logout);

    // Si état incohérent (isAuthenticated=true mais user=null), nettoyer via useEffect
    useEffect(() => {
        if (isAuthenticated && !user) {
            logout();
        }
    }, [isAuthenticated, user, logout]);

    // Bloquer l'accès si non authentifié ou user manquant
    if (!isAuthenticated || !user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        if (user.role === 'super_admin') {
            return <Navigate to="/super-admin" replace />;
        }
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
}

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getMenuForRole, urlPublique } from '../utils/helpers';
import {
    LayoutDashboard, Calendar, Users, ClipboardList, CalendarOff, BarChart3,
    Pill, PackageCheck, Bell, Package, Bed, CreditCard, LogOut, Microscope, Settings, QrCode, CalendarPlus, Heart, X, UserCheck
} from 'lucide-react';

const iconMap = {
    LayoutDashboard, Calendar, Users, ClipboardList,
    CalendarOff, BarChart3, Pill, PackageCheck, Bell, Package, Bed, CreditCard, Microscope,
    Settings, QrCode, CalendarPlus, Heart, UserCheck, Receipt: CreditCard
};

export default function Sidebar({ open = false, onClose }) {
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const menuItems = getMenuForRole(user?.role);
    const [clinicInfo, setClinicInfo] = React.useState({ name: '', specialite: '' });
    const closeRef = React.useRef(null);

    // Tiroir mobile ouvert : le focus clavier passe dans la navigation
    React.useEffect(() => {
        if (open) closeRef.current?.focus();
    }, [open]);

    React.useEffect(() => {
        import('../api/axios').then(api => {
            api.default.get('/clinic').then(r => {
                if (r.data) setClinicInfo(r.data);
            }).catch(() => {});
        });
    }, []);


    const handleLogout = () => {
        logout();
        navigate('/login');
    };


    return (
        <aside id="app-sidebar" className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation principale">
            {/* Clinique en tête du menu ; le logo NextClinic ERP est dans l'en-tête de page */}
            <div className="flex items-start gap-2 px-4 pt-5 pb-4">
                {clinicInfo.name && (
                    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-primary-light p-3">
                        {clinicInfo.logoUrl && (
                            <img src={urlPublique(clinicInfo.logoUrl)} alt="" className="size-14 shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm" />
                        )}
                        <div className="min-w-0">
                            <span className="block truncate text-sm font-bold text-gray-900" title={clinicInfo.name}>
                                {clinicInfo.name}
                            </span>
                            {clinicInfo.specialite && (
                                <span className="block truncate text-[11px] font-medium text-primary">
                                    {clinicInfo.specialite}
                                </span>
                            )}
                        </div>
                    </div>
                )}
                <button
                    ref={closeRef}
                    type="button"
                    onClick={onClose}
                    aria-label="Fermer le menu"
                    className="ml-auto lg:hidden rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-primary"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="nav-section-label">Principal</div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto pb-4">
                {menuItems.map((item) => {
                    const Icon = iconMap[item.icon] || LayoutDashboard;
                    // Affiche un label de section "Administration" avant "Utilisateurs" pour l'admin
                    const isAdminSection = user?.role === 'admin' && item.path === '/admin/users';
                    return (
                        <React.Fragment key={item.path}>
                            {isAdminSection && (
                                <div className="nav-section-label mt-2">Administration</div>
                            )}
                            <NavLink
                                to={item.path}
                                className={({ isActive }) =>
                                    `nav-item ${isActive ? 'active' : ''}`
                                }
                            >
                                <Icon size={18} aria-hidden="true" />
                                {item.name}
                            </NavLink>
                        </React.Fragment>
                    );
                })}
            </nav>

            {/* User footer */}
            <div className="px-4 pb-5 border-t border-gray-100 pt-5">
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50 mb-3">
                    <div className="w-8 h-8 rounded-full bg-primary-light border border-gray-200 flex items-center justify-center text-primary font-bold text-xs overflow-hidden shrink-0">
                        {user?.avatar?.includes('/uploads/') ? (
                            <img
                                src={import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${user.avatar}` : user.avatar}
                                alt="Profil"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            user?.avatar || 'U'
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-gray-900 text-xs font-bold truncate">{user?.name}</div>
                        <div className="text-gray-400 text-[10px] truncate">{user?.email}</div>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-gray-600 hover:text-primary hover:bg-primary-light rounded-xl transition"
                >
                    <LogOut size={14} aria-hidden="true" />
                    Déconnexion
                </button>
            </div>
        </aside>

    );
}

import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Menu, Hourglass } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import NotificationCenter from './NotificationCenter';
import Logo from '../pages/landing/components/ui/Logo';
import api from '../api/axios';
import toast from 'react-hot-toast';

const roleLabels = {
    admin: 'Administrateur',
    doctor: 'Médecin',
    pharmacist: 'Pharmacien',
    nurse: 'Infirmier',
    lab_technician: 'Laborantin',
    secretary: 'Secrétaire',
};

// Rôles qui ont accès au registre des patients (même liste que la route /patients)
const PATIENT_SEARCH_ROLES = ['secretary', 'doctor', 'admin', 'nurse'];

export default function Header({ navOpen = false, onMenuClick }) {
    const { user, updateUser } = useAuthStore();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [clinicInfo, setClinicInfo] = useState({ name: '' });
    const [query, setQuery] = useState('');

    useEffect(() => {
        api.get('/clinic').then(r => setClinicInfo(r.data)).catch(() => {});
    }, []);

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('photo', file);

        try {
            const { data } = await api.post('/auth/profile-photo', formData);
            if (data.success) {
                updateUser({ avatar: data.photoUrl });
                toast.success('Photo de profil mise à jour avec succès');
            }
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erreur lors de la mise à jour de la photo');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSearch = (e) => {
        e.preventDefault();
        const q = query.trim();
        navigate(q ? `/patients?q=${encodeURIComponent(q)}` : '/patients');
    };

    const isDoctor = user?.role === 'doctor';
    const canSearchPatients = PATIENT_SEARCH_ROLES.includes(user?.role);
    const hasPhoto = user?.avatar?.includes('/uploads/');
    const photoUrl = hasPhoto ? (import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${user.avatar}` : user.avatar) : null;

    // Fin d'essai calculée par le serveur (création + 24 h, ou prolongation du super-admin)
    const getHoursLeft = () => {
        if (!clinicInfo.trialEnd) return 0;
        const diff = new Date(clinicInfo.trialEnd).getTime() - Date.now();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));
    };
    const hoursLeft = getHoursLeft();

    return (
        <header className="topbar">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                    type="button"
                    onClick={onMenuClick}
                    aria-label="Ouvrir le menu"
                    aria-controls="app-sidebar"
                    aria-expanded={navOpen}
                    className="lg:hidden -ml-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-primary"
                >
                    <Menu size={22} />
                </button>

                <Logo className="h-6 shrink-0" />
                <div className="hidden md:block h-6 w-px shrink-0 bg-gray-200" aria-hidden="true" />

                {/* Recherche : ouvre le registre des patients filtré */}
                {canSearchPatients && (
                    <form role="search" onSubmit={handleSearch} className="relative hidden w-full max-w-sm md:block">
                        <label htmlFor="topbar-search" className="sr-only">Rechercher un patient</label>
                        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input
                            id="topbar-search"
                            type="search"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Rechercher un patient (nom, CIN)…"
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-gray-50"
                        />
                    </form>
                )}
            </div>

            {/* Clinic Display */}
            {clinicInfo.subscriptionStatus === 'trial' && (
                <div className={`hidden md:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    hoursLeft <= 3
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}>
                    <Hourglass size={14} aria-hidden="true" />
                    <span>Essai : {hoursLeft} {hoursLeft > 1 ? 'heures' : 'heure'} restante{hoursLeft > 1 ? 's' : ''}</span>
                </div>
            )}

            {/* Right */}
            <div className="flex shrink-0 items-center gap-3 sm:gap-4">

                <NotificationCenter />
                <div className="hidden sm:block w-px h-6 bg-gray-200" />

                {/* Profile */}
                <div className="flex items-center gap-3">
                    <div className="hidden text-right sm:block">
                        <div className="text-sm font-semibold text-gray-900">{user?.name}</div>
                        <div className="text-xs text-muted">{roleLabels[user?.role] || 'Secrétaire'}</div>
                    </div>

                    {isDoctor ? (
                        <button
                            type="button"
                            onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
                            aria-label="Modifier votre photo de profil"
                            title="Modifier votre photo de profil"
                            className="relative w-10 h-10 rounded-full border-2 border-white shadow-sm flex items-center justify-center overflow-hidden bg-primary-light text-primary font-bold text-sm cursor-pointer hover:ring-2 hover:ring-primary/50 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                            {uploading ? (
                                <Loader2 size={16} className="animate-spin text-primary" />
                            ) : hasPhoto ? (
                                <img src={photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                user?.avatar || 'U'
                            )}
                        </button>
                    ) : (
                        <div className="relative w-10 h-10 rounded-full border-2 border-white shadow-sm flex items-center justify-center overflow-hidden bg-primary-light text-primary font-bold text-sm">
                            {hasPhoto ? (
                                <img src={photoUrl} alt="Profil" className="w-full h-full object-cover" />
                            ) : (
                                user?.avatar || 'U'
                            )}
                        </div>
                    )}

                    {/* Hidden input for doctors */}
                    {isDoctor && (
                        <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    )}
                </div>
            </div>
        </header>
    );
}

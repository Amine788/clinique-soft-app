import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2, ShieldCheck, CalendarCheck, Stethoscope, Receipt } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50/60 py-3.5 pl-11 pr-4 text-[15px] text-slate-800 placeholder:text-slate-400 transition-all focus:border-[#3b2bb8] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#3b2bb8]/10';

const features = [
    { icon: CalendarCheck, text: 'Agenda, rendez-vous et salle d’attente en temps réel' },
    { icon: Stethoscope, text: 'Dossiers patients, consultations et ordonnances' },
    { icon: Receipt, text: 'Facturation, pharmacie et laboratoire intégrés' },
];

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const navigate = useNavigate();
    const login = useAuthStore(s => s.login);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data } = await api.post('/auth/login', { email, password });
            login(data.token, data.user);
            toast.success(`Bienvenue, ${data.user.name} !`);
            // Redirection selon le rôle
            const role = data.user.role;
            if (role === 'super_admin') navigate('/super-admin');
            else if (role === 'admin') navigate('/admin/users');
            else if (role === 'doctor') navigate('/doctor/agenda');
            else navigate('/dashboard');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur de connexion');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 font-sans">

            {/* Panneau de marque (desktop) */}
            <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0b3fb8] via-[#3b2bb8] to-[#8a1fd1] p-12 text-white">
                <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-fuchsia-400/20 blur-3xl" />

                <Link to="/" className="relative inline-flex w-fit items-center gap-2 text-sm text-white/80 hover:text-white transition-colors">
                    <ArrowLeft size={16} /> Retour au site
                </Link>

                <div className="relative max-w-md">
                    <div className="mb-8 inline-flex rounded-2xl bg-white/95 p-3 shadow-xl">
                        <img src="/logo-icon.png" alt="" className="size-12" />
                    </div>
                    <h1 className="text-4xl font-bold leading-tight tracking-tight">
                        La gestion de votre clinique, simplifiée.
                    </h1>
                    <p className="mt-4 text-lg text-white/75">
                        Un seul espace pour toute votre équipe médicale et administrative.
                    </p>
                    <ul className="mt-10 space-y-4">
                        {features.map(({ icon, text }) => (
                            <li key={text} className="flex items-center gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                                    {React.createElement(icon, { size: 18 })}
                                </span>
                                <span className="text-white/90">{text}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="relative flex items-center gap-2 text-sm text-white/60">
                    <ShieldCheck size={16} /> Données médicales chiffrées et sécurisées
                </div>
            </aside>

            {/* Formulaire */}
            <main className="flex items-center justify-center p-6 sm:p-10">
                <div className="w-full max-w-[420px]">
                    <img
                        src="/logo.png"
                        alt="NextClinic ERP"
                        className="mx-auto mb-10 h-auto w-full max-w-[300px] object-contain"
                    />

                    <div className="rounded-3xl border border-slate-200/70 bg-white p-8 shadow-[0_20px_50px_-20px_rgba(59,43,184,0.25)] sm:p-10">
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Connexion</h2>
                        <p className="mt-1.5 text-sm text-slate-500">Accédez à votre espace NextClinic.</p>

                        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                            <div className="space-y-2">
                                <label htmlFor="email" className="block text-sm font-medium text-slate-700">{import.meta.env.DEV ? 'Identifiant ou email' : 'Email'}</label>
                                <div className="relative">
                                    <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        id="email"
                                        type={import.meta.env.DEV ? 'text' : 'email'}
                                        autoComplete="username"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="nom@clinique.ma"
                                        required
                                        className={inputClass}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="password" className="block text-sm font-medium text-slate-700">Mot de passe</label>
                                <div className="relative">
                                    <Lock size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        minLength={import.meta.env.DEV ? 1 : 6}
                                        className={`${inputClass} pr-12`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0b3fb8] to-[#8a1fd1] py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {loading ? (
                                    <><Loader2 size={18} className="animate-spin" /> Connexion en cours…</>
                                ) : (
                                    <>Se connecter <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" /></>
                                )}
                            </button>
                        </form>
                    </div>

                    <p className="mt-8 text-center text-sm text-slate-500">
                        Pas encore de compte ?{' '}
                        <Link to="/#demo" className="font-semibold text-[#3b2bb8] hover:underline">Créer une clinique</Link>
                    </p>
                </div>
            </main>
        </div>
    );
}

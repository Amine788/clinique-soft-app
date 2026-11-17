import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import {
    Building2, CheckCircle, Link, Shield, Save, RefreshCw, ToggleRight, ToggleLeft, ChevronRight
} from 'lucide-react';

function Section({ title, icon, color = 'text-primary', children }) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-2">
                {React.createElement(icon, { size: 18, className: color })} {title}
            </h2>
            {children}
        </div>
    );
}

// Intégrations avec toggle on/off — clé = nom dans activeModules
const TOGGLEABLE = [
    {
        key: 'email_reminders',
        name: '📧 E-mails aux patients',
        desc: 'Bienvenue à la création du dossier, confirmation du RDV et rappel la veille (dès 9 h), envoyés au nom de la clinique',
    },
    {
        key: 'realtime_notifications',
        name: '🔔 Notifications temps réel',
        desc: 'Alertes instantanées entre les rôles. Désactivées : les écrans se mettent à jour au rechargement ; les alertes patient critiques restent toujours envoyées',
    },
];

// Intégrations toujours actives (non désactivables)
const ALWAYS_ON = [
    { name: '💊 Suivi médicaments hospitalisés', desc: 'Administration des traitements en temps réel' },
    { name: '📲 Scanner QR Code patient', desc: 'Pointage infirmier via caméra jsQR' },
    { name: '🔐 Authentification JWT', desc: 'Routes API sécurisées par token signé' },
];

export default function AdminSettings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // État des toggles : { email_reminders: true, realtime_notifications: true }
    const [modules, setModules] = useState({
        email_reminders: true,
        realtime_notifications: true,
    });

    useEffect(() => {
        api.get('/clinic')
            .then(res => {
                const c = res.data;
                // Lire l'état des modules depuis activeModules
                if (c.activeModules && typeof c.activeModules === 'object' && !Array.isArray(c.activeModules)) {
                    setModules(prev => ({ ...prev, ...c.activeModules }));
                }
            })
            .catch(() => toast.error('Impossible de charger les paramètres'))
            .finally(() => setLoading(false));
    }, []);

    const toggleModule = (key) => {
        setModules(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Seuls les modules : les informations de la clinique se saisissent dans « Ma Clinique »
            await api.put('/clinic', { activeModules: modules });
            toast.success('✅ Paramètres sauvegardés avec succès');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw size={24} className="animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="page-title">Réglages Système</h1>
                    <p className="text-sm text-gray-400 mt-0.5">Intégrations et sécurité de la clinique</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-hover transition disabled:opacity-60"
                >
                    {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                    {saving ? 'Sauvegarde...' : 'Enregistrer'}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-6">

                {/* Informations de la clinique : saisies uniquement dans « Ma Clinique » */}
                <Section title="Informations de la clinique" icon={Building2}>
                    <p className="text-sm text-gray-600 leading-relaxed">
                        Nom, coordonnées, raison sociale, ICE, IF, RC, TP, RIB et logo se modifient dans <strong>Ma Clinique</strong>.
                        Ce sont ces informations qui figurent sur les factures et les ordonnances.
                    </p>
                    <RouterLink to="/admin/clinic" className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover transition">
                        Ouvrir Ma Clinique <ChevronRight size={15} />
                    </RouterLink>
                </Section>

                {/* Intégrations avec toggle */}
                <Section title="Intégrations — Activer / Désactiver" icon={Link} color="text-violet-600">
                    <div className="space-y-2">
                        {/* Toggleables */}
                        {TOGGLEABLE.map(intg => {
                            const isOn = modules[intg.key] !== false;
                            return (
                                <div key={intg.key}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition ${isOn ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-50 border-gray-100'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        {isOn
                                            ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                                            : <div className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" />
                                        }
                                        <div>
                                            <div className={`text-sm font-bold ${isOn ? 'text-gray-800' : 'text-gray-400'}`}>{intg.name}</div>
                                            <div className="text-xs text-gray-400">{intg.desc}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => toggleModule(intg.key)}
                                        className={`transition ${isOn ? 'text-primary' : 'text-gray-300'} hover:scale-110`}
                                        title={isOn ? 'Désactiver' : 'Activer'}
                                    >
                                        {isOn ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                                    </button>
                                </div>
                            );
                        })}

                        {/* Séparateur */}
                        <div className="pt-1 pb-1 flex items-center gap-2">
                            <div className="flex-1 h-px bg-gray-100" />
                            <span className="text-[10px] text-gray-400 font-semibold uppercase">Toujours actifs</span>
                            <div className="flex-1 h-px bg-gray-100" />
                        </div>

                        {/* Toujours actifs */}
                        {ALWAYS_ON.map((intg, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 opacity-80">
                                <div className="flex items-center gap-3">
                                    <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                                    <div>
                                        <div className="text-sm font-semibold text-gray-700">{intg.name}</div>
                                        <div className="text-xs text-gray-400">{intg.desc}</div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-gray-200 text-gray-500 shrink-0 ml-3">
                                    Système
                                </span>
                            </div>
                        ))}

                        <p className="text-xs text-gray-400 italic pt-1">
                            Cliquez sur le toggle puis "Enregistrer" pour appliquer les modifications.
                        </p>
                    </div>
                </Section>

                {/* Sécurité */}
                <Section title="Sécurité active" icon={Shield} color="text-red-500">
                    <div className="space-y-2">
                        {[
                            { label: 'Authentification JWT', desc: 'Tokens signés, expiration configurable' },
                            { label: 'Contrôle d\'accès par rôle', desc: 'Admin, Médecin, Infirmier, Secrétaire, Pharmacien' },
                            { label: 'Isolation multi-cliniques', desc: 'Données filtrées par clinic_id sur toutes les routes' },
                            { label: 'Mots de passe hashés bcrypt', desc: 'Jamais stockés en clair en base de données' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                <div className="flex items-center gap-3">
                                    <CheckCircle size={15} className="text-emerald-500 shrink-0" />
                                    <div>
                                        <div className="text-sm font-semibold text-gray-800">{item.label}</div>
                                        <div className="text-xs text-gray-400">{item.desc}</div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 shrink-0 ml-3">✓ Actif</span>
                            </div>
                        ))}
                    </div>
                </Section>

            </div>

            {/* Bouton bas de page */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-hover transition disabled:opacity-60 shadow-md"
                >
                    {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                    {saving ? 'Sauvegarde en cours...' : 'Enregistrer les modifications'}
                </button>
            </div>
        </div>
    );
}

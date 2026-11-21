import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { seDeconnecter } from '../api/deconnexion';
import api from '../api/axios';
import { CreditCard, ShieldAlert, LogOut, Loader2, Lock, Headphones, Phone, Mail } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SubscriptionPage() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [statusData, setStatusData] = useState(null);
    const [loading, setLoading] = useState(true);

    const isAdmin = user?.role === 'admin';

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/subscription/status');
            setStatusData(data);
        } catch (err) {
            console.error('Error fetching subscription status:', err);
            toast.error('Impossible de charger le statut de l\'abonnement');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleLogout = async () => {
        await seDeconnecter();
        navigate('/login');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 size={40} className="animate-spin text-primary mb-4" />
                <p className="text-gray-500 font-medium">Chargement des détails de l'abonnement...</p>
            </div>
        );
    }

    const isSuspended = statusData?.isSuspended || statusData?.status === 'suspended';
    const isExpired = statusData?.isExpired || (statusData?.status === 'trial' && statusData?.daysLeft === 0);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 font-sans">
            <div className="w-full max-w-[640px] bg-white rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.06)] border border-gray-150 overflow-hidden">
                
                {/* Header Banner */}
                <div className={`p-8 text-center text-white ${isSuspended ? 'bg-gradient-to-r from-red-600 to-red-700' : 'bg-gradient-to-r from-amber-500 to-amber-600'}`}>
                    <div className="inline-flex p-3 bg-white/10 rounded-full mb-4">
                        {isSuspended ? <ShieldAlert size={36} /> : <CreditCard size={36} />}
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mb-2">
                        {isSuspended ? 'Abonnement Suspendu' : 'Période d\'essai expirée'}
                    </h1>
                    <p className="text-white/80 text-sm max-w-md mx-auto">
                        {isSuspended 
                            ? `L'accès à l'espace de votre clinique "${statusData?.clinicName || 'NextClinic'}" a été suspendu pour défaut de paiement.` 
                            : `Votre période d'essai gratuit de 24 heures pour "${statusData?.clinicName || 'NextClinic'}" s'est terminée.`}
                    </p>
                </div>

                {/* Details Section */}
                <div className="p-8 space-y-6">
                    
                    {/* Status Box */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 text-sm">
                        <div>
                            <span className="text-gray-400 block mb-1">Clinique</span>
                            <span className="font-semibold text-gray-800 uppercase">{statusData?.clinicName}</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block mb-1">Formule choisie</span>
                            <span className="font-semibold text-gray-800">{statusData?.plan}</span>
                        </div>
                    </div>

                    {/* Payment Alert Box for Suspended */}
                    {isSuspended && (
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex gap-4 items-start shadow-sm">
                            <span className="text-2xl mt-0.5 shrink-0">💳</span>
                            <div className="text-sm">
                                <h4 className="font-bold text-red-800 mb-1">Règlement du paiement requis</h4>
                                {/* Pas de coordonnées bancaires ici : elles sont communiquées par l'équipe NextClinic */}
                                <p className="text-red-700 leading-relaxed mb-3">
                                    Contactez l'équipe NextClinic pour régler votre facture : l'accès à vos dossiers patients et modules est rétabli dès réception du règlement.
                                </p>
                                <div className="bg-white border border-red-100 rounded-xl p-3 text-xs space-y-1.5 font-medium text-gray-700 shadow-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Support Facturation :</span>
                                        <a href="tel:+212660406878" className="text-primary hover:underline font-bold">+212 660-406878</a>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-gray-50">
                                        <span className="text-gray-400">E-mail :</span>
                                        <a href="mailto:support@nextact-solutions.com" className="text-primary hover:underline font-bold">support@nextact-solutions.com</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Payment Alert Box for Expired Trial */}
                    {isExpired && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-4 items-start shadow-sm">
                            <span className="text-2xl mt-0.5 shrink-0">🚀</span>
                            <div className="text-sm">
                                <h4 className="font-bold text-amber-800 mb-1">Abonnement requis</h4>
                                <p className="text-amber-700 leading-relaxed mb-3">
                                    Votre période d'essai gratuit de 24 heures est terminée. Veuillez souscrire à un plan pour continuer à utiliser NextClinic sans perte de données.
                                </p>
                                <div className="bg-white border border-amber-100 rounded-xl p-3 text-xs space-y-1.5 font-medium text-gray-700 shadow-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Formule suggérée :</span>
                                        <span className="font-bold text-gray-900">Plan Pro ({statusData?.plan})</span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-gray-50">
                                        <span className="text-gray-400">Support Commercial :</span>
                                        <a href="tel:+212660406878" className="text-primary hover:underline font-bold">+212 660-406878</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Features Locked Visual */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Lock size={12} /> Modules actuellement bloqués
                        </h3>
                        <div className="grid grid-cols-2 gap-2 text-xs font-medium text-gray-500">
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Dossier médical partagé
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Agenda & consultations
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Facturation & Pharmacie
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Suivi infirmier en temps réel
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* Action Block */}
                    {/* L'activation est faite par l'équipe NextClinic (super-admin), jamais en libre-service */}
                    {isAdmin ? (
                        <div className="bg-primary/5 border border-primary/10 rounded-2xl p-5 flex gap-4 items-start">
                            <div className="p-2 bg-primary/10 rounded-xl text-primary mt-0.5 shrink-0">
                                <Headphones size={20} />
                            </div>
                            <div className="text-sm">
                                <h4 className="font-bold text-gray-900 mb-1">Activer votre abonnement</h4>
                                <p className="text-muted leading-relaxed mb-3">
                                    Contactez l'équipe NextClinic : votre abonnement est activé par notre équipe dès réception du règlement, sans perte de données.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <a href="tel:+212660406878" className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl text-sm">
                                        <Phone size={15} /> +212 660-406878
                                    </a>
                                    <a href="mailto:support@nextact-solutions.com" className="inline-flex items-center gap-2 px-4 py-2 border border-primary/30 text-primary font-medium rounded-xl text-sm hover:bg-primary/5">
                                        <Mail size={15} /> support@nextact-solutions.com
                                    </a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3 text-sm">
                            <span className="text-xl">⚠️</span>
                            <div>
                                <h4 className="font-bold text-amber-800 mb-1">Accès réservé à l'administrateur</h4>
                                <p className="text-amber-700 leading-relaxed">
                                    Votre compte est actuellement restreint. Veuillez notifier le directeur ou le responsable de l'établissement pour régulariser l'abonnement.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Bottom Actions */}
                    <div className="flex justify-between items-center pt-2">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            <LogOut size={16} /> Se déconnecter
                        </button>
                        
                        <a 
                            href="mailto:support@nextact-solutions.com"
                            className="text-xs font-semibold text-primary hover:underline"
                        >
                            Contacter le support NextClinic
                        </a>
                    </div>

                </div>
            </div>
        </div>
    );
}

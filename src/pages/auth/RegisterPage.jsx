import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, Mail, ChevronRight, CheckCircle2, ShieldCheck, ArrowLeft, Key, Copy, Check, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';

export default function RegisterPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [rawKey, setRawKey] = useState(null);
    const [keyPrefix, setKeyPrefix] = useState(null);
    const [keySaved, setKeySaved] = useState(false);
    const [keyCopied, setKeyCopied] = useState(false);
    const [emailEnvoye, setEmailEnvoye] = useState(true);
    
    const [formData, setFormData] = useState({
        clinicName: '',
        clinicType: 'general',
        ownerName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    const handleNext = () => {
        if (step === 1 && (!formData.clinicName || !formData.clinicType)) {
            return toast.error('Veuillez remplir les informations de la clinique');
        }
        setStep(step + 1);
    };

    const copyKey = () => {
        if (!rawKey) return;
        navigator.clipboard.writeText(rawKey).then(() => {
            setKeyCopied(true);
            setTimeout(() => setKeyCopied(false), 2500);
            toast.success('Clé copiée dans le presse-papiers');
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            // Page publique : pas de redirection de l'intercepteur sur 401/403
            const { data } = await api.post('/auth/register-clinic', formData, { skipAuthRedirect: true });

            setEmailEnvoye(data.emailEnvoye !== false);
            if (data.rawKey) {
                setRawKey(data.rawKey);
                setKeyPrefix(data.keyPrefix);
                setStep(3);
            } else {
                setStep(4);
            }

        } catch (error) {
            toast.error(error.response?.data?.error || 'Erreur lors de l\'inscription');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmKeySaved = () => {
        if (!keySaved) {
            return toast.error('Veuillez confirmer que vous avez sauvegardé votre clé');
        }
        setRawKey(null);
        setStep(4);
        if (emailEnvoye) toast.success('Clinique créée ! Vérifiez votre boîte mail.');
    };

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            
            <div className="w-full max-w-xl relative z-10">
                <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 border border-gray-100 p-8 mb-8 text-center">
                    <div className="w-28 h-28 bg-white rounded-3xl shadow-lg flex items-center justify-center mx-auto mb-6 border border-gray-50 p-3">
                        <img src="/logo-icon.png" alt="Logo" className="w-20 h-20 object-contain" 
                             onError={e => e.target.src = 'https://cdn-icons-png.flaticon.com/512/822/822143.png'} />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3">Bienvenue sur NextClinic</h1>
                    <p className="text-gray-500 font-medium max-w-sm mx-auto">Votre plateforme de gestion médicale tout-en-un de nouvelle génération.</p>
                </div>

                {step < 3 && (
                    <div className="flex items-center justify-center gap-2 mb-8">
                        {[1, 2].map(s => (
                            <div key={s} className={`h-1.5 rounded-full transition-all duration-500 ${step >= s ? 'w-12 bg-blue-800' : 'w-4 bg-gray-200'}`} />
                        ))}
                    </div>
                )}

                <div className="bg-white rounded-3xl shadow-2xl shadow-blue-900/5 border border-gray-100 overflow-hidden">
                    <form onSubmit={handleSubmit} className="p-8 md:p-12">
                        
                        {step === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center">
                                        <Building2 size={20} />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-900">Ma Clinique</h2>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nom de l'établissement</label>
                                        <input 
                                            type="text" 
                                            placeholder="Ex: Clinique du Soleil"
                                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-800 transition text-gray-900 font-medium"
                                            value={formData.clinicName}
                                            onChange={e => setFormData({...formData, clinicName: e.target.value})}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Type de spécialité</label>
                                        <select 
                                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-800 transition text-gray-900 font-medium appearance-none"
                                            value={formData.clinicType}
                                            onChange={e => setFormData({...formData, clinicType: e.target.value})}
                                        >
                                            <option value="general">Généraliste / Cabinet</option>
                                            <option value="dental">Dentaire</option>
                                            <option value="pediatric">Pédiatrie</option>
                                            <option value="lab">Laboratoire d'analyses</option>
                                            <option value="other">Autre spécialité</option>
                                        </select>
                                    </div>
                                </div>

                                <button type="button" onClick={handleNext} className="w-full py-5 bg-blue-800 text-white rounded-2xl font-black shadow-lg shadow-blue-800/20 hover:scale-[1.02] active:scale-95 transition flex items-center justify-center gap-2">
                                    Continuer <ChevronRight size={20} />
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="flex items-center gap-3 mb-2">
                                    <button type="button" onClick={() => setStep(1)} className="p-2 hover:bg-gray-100 rounded-lg transition">
                                        <ArrowLeft size={18} />
                                    </button>
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center">
                                        <User size={20} />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-900">Compte Admin</h2>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nom Complet du Gérant</label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-4 text-gray-400" size={20} />
                                            <input 
                                                type="text" 
                                                className="w-full pl-12 pr-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-800 transition text-gray-900 font-medium"
                                                value={formData.ownerName}
                                                onChange={e => setFormData({...formData, ownerName: e.target.value})}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email Professionnel</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-4 text-gray-400" size={20} />
                                            <input 
                                                type="email" 
                                                className="w-full pl-12 pr-5 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-800 transition text-gray-900 font-medium"
                                                value={formData.email}
                                                onChange={e => setFormData({...formData, email: e.target.value})}
                                                required
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button type="submit" disabled={loading} className="w-full py-5 bg-blue-800 text-white rounded-2xl font-black shadow-lg shadow-blue-800/20 hover:scale-[1.02] active:scale-95 transition flex items-center justify-center gap-2">
                                    {loading ? 'Création en cours...' : 'Créer ma clinique'}
                                    {!loading && <ChevronRight size={20} />}
                                </button>
                            </div>
                        )}

                        {step === 3 && rawKey && (
                            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-400">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                        <Key size={20} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900">Sauvegardez votre clé de licence</h2>
                                        <p className="text-xs text-gray-500 mt-0.5">Elle ne sera plus jamais affichée après cette étape</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-800">
                                        <strong>Important :</strong> Cette clé identifie uniquement votre clinique sur la plateforme.
                                        Copiez-la dans un endroit sécurisé. <strong>Elle ne pourra pas être récupérée.</strong>
                                    </div>
                                </div>

                                <div className="bg-gray-900 rounded-2xl p-5">
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Key size={11} /> Clé de Licence — Confidentielle
                                    </div>
                                    <div className="font-mono text-xl font-black tracking-widest text-white mb-4 select-all break-all">
                                        {rawKey}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={copyKey}
                                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition ${
                                            keyCopied
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                                        }`}
                                    >
                                        {keyCopied ? <><Check size={15} /> Copié avec succès !</> : <><Copy size={15} /> Copier la clé</>}
                                    </button>
                                </div>

                                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    <ShieldCheck size={16} className="text-gray-400 shrink-0" />
                                    <div className="text-xs text-gray-500">
                                        Après cette étape, seul le préfixe <code className="font-mono font-bold text-gray-700">{keyPrefix}-****-****</code> sera visible.
                                    </div>
                                </div>

                                <label className="flex items-start gap-3 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={keySaved}
                                        onChange={e => setKeySaved(e.target.checked)}
                                        className="mt-0.5 w-5 h-5 rounded accent-blue-800 cursor-pointer"
                                    />
                                    <span className="text-sm font-semibold text-gray-700 group-hover:text-gray-900 transition">
                                        J'ai copié et sauvegardé ma clé de licence. Je comprends qu'elle ne sera plus affichée.
                                    </span>
                                </label>

                                <button
                                    type="button"
                                    onClick={handleConfirmKeySaved}
                                    disabled={!keySaved}
                                    className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition ${
                                        keySaved
                                            ? 'bg-blue-800 text-white shadow-lg shadow-blue-800/20 hover:scale-[1.02] active:scale-95'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    <Check size={16} /> J'ai sauvegardé — Continuer
                                </button>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="text-center py-4 animate-in zoom-in duration-500">
                                <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle2 size={40} />
                                </div>
                                {emailEnvoye ? (
                                    <>
                                        <h2 className="text-2xl font-bold text-gray-900 mb-3">Vérifiez votre boîte mail !</h2>
                                        <p className="text-gray-600 mb-8 leading-relaxed">
                                            Nous avons envoyé un lien de configuration à <strong>{formData.email}</strong>. 
                                            Cliquez sur le bouton dans l'email pour définir votre mot de passe et activer votre clinique.
                                        </p>
                                        <div className="p-4 bg-blue-50 rounded-2xl text-blue-800 text-sm font-medium mb-8">
                                            Pensez à vérifier vos courriers indésirables (spams).
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="text-2xl font-bold text-gray-900 mb-3">Clinique créée</h2>
                                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-sm leading-relaxed mb-8 text-left">
                                            L'email de configuration <strong>n'a pas pu être envoyé</strong> à <strong>{formData.email}</strong>.
                                            Contactez l'équipe NextClinic au <a href="tel:+212660406878" className="font-bold underline">+212 660-406878</a> ou
                                            à <a href="mailto:support@nextact-solutions.com" className="font-bold underline">support@nextact-solutions.com</a> pour recevoir votre lien d'activation.
                                        </div>
                                    </>
                                )}
                                <button type="button" onClick={() => navigate('/login')} className="text-blue-800 font-bold hover:underline">
                                    Retour à la connexion
                                </button>
                            </div>
                        )}
                    </form>
                    
                    {step < 3 && (
                        <div className="bg-gray-50 p-6 border-t border-gray-100 flex items-center justify-center gap-6">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-blue-800" />
                                <span className="text-xs font-bold text-gray-600">Essai 14j gratuit</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-blue-800" />
                                <span className="text-xs font-bold text-gray-600">Sans engagement</span>
                            </div>
                        </div>
                    )}
                </div>

                <p className="text-center mt-8 text-sm text-muted">
                    Déjà inscrit ? <button onClick={() => navigate('/login')} className="text-blue-800 font-bold hover:underline">Se connecter</button>
                </p>
            </div>
        </div>
    );
}

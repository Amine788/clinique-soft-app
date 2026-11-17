import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle2, ShieldCheck, ArrowRight, Eye, EyeOff, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';

/* ─── Force strength meter ─── */
function PasswordStrength({ password }) {
    const checks = [
        { label: '6 caractères min.', ok: password.length >= 6 },
        { label: 'Majuscule', ok: /[A-Z]/.test(password) },
        { label: 'Chiffre', ok: /[0-9]/.test(password) },
        { label: 'Caractère spécial', ok: /[^A-Za-z0-9]/.test(password) },
    ];
    const score = checks.filter(c => c.ok).length;
    const colors = ['#EF4444', '#F59E0B', '#10B981', '#004AAD'];
    const labels = ['Faible', 'Moyen', 'Fort', 'Excellent'];

    if (!password) return null;
    return (
        <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                {[0, 1, 2, 3].map(i => (
                    <div key={i} style={{
                        flex: 1, height: 4, borderRadius: 4,
                        background: i < score ? colors[score - 1] : '#E5E7EB',
                        transition: 'background 0.3s'
                    }} />
                ))}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {checks.map((c, i) => (
                    <span key={i} style={{ fontSize: 11, color: c.ok ? '#16A34A' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {c.ok ? '✓' : '○'} {c.label}
                    </span>
                ))}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors[score - 1] || '#9CA3AF', marginTop: 4 }}>
                {password && (labels[score - 1] || 'Trop faible')}
            </div>
        </div>
    );
}

export default function SetupPasswordPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const login = useAuthStore(s => s.login);

    const [tokenData, setTokenData] = useState(null); // payload décodé
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [tokenError, setTokenError] = useState(null);

    // Décoder le token JWT côté client (juste pour l'affichage)
    useEffect(() => {
        if (!token) {
            setTokenError('Lien invalide ou expiré.');
            return;
        }
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setTokenData(payload);
            // Vérifier expiration
            if (payload.exp && Date.now() / 1000 > payload.exp) {
                setTokenError('Ce lien a expiré (valable 48h). Veuillez soumettre le formulaire à nouveau.');
            }
        } catch {
            setTokenError('Token invalide.');
        }
    }, [token]);

    const isDemo = tokenData?.source === 'demo_landing';
    const displayName = tokenData ? `${tokenData.prenom || ''} ${tokenData.nom || ''}`.trim() : '';

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) return toast.error('Les mots de passe ne correspondent pas');
        if (password.length < 6) return toast.error('Le mot de passe doit contenir au moins 6 caractères');

        setLoading(true);
        try {
            // Jeton d'activation expiré : erreur affichée ici, sans redirection de l'intercepteur
            const { data } = await api.post('/auth/setup-password', { token, password }, { skipAuthRedirect: true });

            toast.success('✅ Compte activé avec succès !');
            setSuccess(true);

            setTimeout(() => {
                if (data.token && data.user) {
                    login(data.token, data.user);
                    navigate(data.user.role === 'admin' ? '/admin' : '/dashboard');
                } else {
                    // Cas démo : pas de compte créé automatiquement → aller sur login
                    navigate('/login');
                }
            }, 2500);

        } catch (error) {
            toast.error(error.response?.data?.error || 'Erreur lors de la configuration');
        } finally {
            setLoading(false);
        }
    };

    // ─── Token Error State ───
    if (tokenError) {
        return (
            <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4FF 0%, #F5F8FA 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
                <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: 64, marginBottom: 20 }}>⏳</div>
                    <h1 style={{ fontWeight: 900, fontSize: 24, color: '#0F172A', marginBottom: 12 }}>Lien expiré ou invalide</h1>
                    <p style={{ color: '#6B7280', lineHeight: 1.7, marginBottom: 28 }}>{tokenError}</p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => navigate('/#demo')}
                            style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #004AAD, #1e40af)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                            Demander un nouveau lien
                        </button>
                        <button onClick={() => navigate('/login')}
                            style={{ padding: '12px 28px', borderRadius: 12, border: '2px solid #E5E7EB', background: 'white', color: '#374151', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                            Se connecter
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F4FF 0%, #EAF0F9 50%, #F5F8FA 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', system-ui, sans-serif", position: 'relative', overflow: 'hidden' }}>

            {/* Background blobs */}
            <div style={{ position: 'absolute', top: -100, right: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,74,173,0.06), transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -100, left: -100, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(83,46,121,0.06), transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ maxWidth: 520, width: '100%', position: 'relative', zIndex: 1 }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #004AAD, #1e40af)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 28px rgba(0,74,173,0.30)' }}>
                        <Lock size={32} color="white" />
                    </div>
                    <div style={{ display: 'inline-block', background: 'rgba(0,74,173,0.08)', color: '#004AAD', borderRadius: 999, padding: '4px 16px', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                        🏥 NextClinic — Activation du compte
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0F172A', margin: '0 0 10px', letterSpacing: '-0.5px' }}>
                        {success ? '✅ Compte activé !' : 'Créez votre mot de passe'}
                    </h1>
                    {displayName && !success && (
                        <p style={{ color: '#6B7280', fontSize: 15, margin: 0 }}>
                            Bienvenue <strong style={{ color: '#0F172A' }}>{displayName}</strong> 👋
                        </p>
                    )}
                    {isDemo && !success && (
                        <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '6px 14px', fontSize: 13, color: '#92400E', fontWeight: 600 }}>
                            📅 Suite à votre demande de démo
                        </div>
                    )}
                </div>

                {/* Card */}
                <div style={{ background: 'white', borderRadius: 28, boxShadow: '0 16px 60px rgba(0,74,173,0.10)', border: '1px solid rgba(0,74,173,0.06)', overflow: 'hidden' }}>

                    {success ? (
                        <div style={{ padding: 48, textAlign: 'center' }}>
                            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                                <CheckCircle2 size={44} color="#16A34A" />
                            </div>
                            <h2 style={{ fontWeight: 900, fontSize: 22, color: '#0F172A', marginBottom: 12 }}>Tout est prêt !</h2>
                            <p style={{ color: '#6B7280', lineHeight: 1.7, marginBottom: 24 }}>
                                Votre compte a été activé. Vous allez être redirigé vers votre {isDemo ? 'espace de connexion' : 'dashboard'} dans quelques secondes...
                            </p>
                            <div style={{ width: 40, height: 4, borderRadius: 4, background: 'linear-gradient(90deg, #004AAD, #1e40af)', margin: '0 auto', animation: 'none' }} />
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} style={{ padding: '40px' }}>

                            {/* Sécurité badge */}
                            <div style={{ padding: '14px 18px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 28 }}>
                                <ShieldCheck size={20} color="#16A34A" style={{ flexShrink: 0, marginTop: 1 }} />
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Connexion sécurisée</div>
                                    <div style={{ fontSize: 12, color: '#166534', opacity: 0.8, marginTop: 2 }}>Votre mot de passe est chiffré (bcrypt). Il ne sera jamais partagé.</div>
                                </div>
                            </div>

                            {/* Password */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ display: 'block', fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                                    Nouveau mot de passe
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••••"
                                        required
                                        style={{ width: '100%', padding: '14px 48px 14px 16px', border: '1.5px solid #E5E7EB', borderRadius: 14, fontSize: 15, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s', fontFamily: 'inherit' }}
                                        onFocus={e => e.target.style.borderColor = '#004AAD'}
                                        onBlur={e => e.target.style.borderColor = '#E5E7EB'}
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                <PasswordStrength password={password} />
                            </div>

                            {/* Confirm Password */}
                            <div style={{ marginBottom: 32 }}>
                                <label style={{ display: 'block', fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                                    Confirmer le mot de passe
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••••"
                                        required
                                        style={{
                                            width: '100%', padding: '14px 48px 14px 16px',
                                            border: `1.5px solid ${confirmPassword && confirmPassword !== password ? '#EF4444' : confirmPassword && confirmPassword === password ? '#16A34A' : '#E5E7EB'}`,
                                            borderRadius: 14, fontSize: 15, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s', fontFamily: 'inherit'
                                        }}
                                        onFocus={e => { if (!confirmPassword) e.target.style.borderColor = '#004AAD'; }}
                                        onBlur={e => { if (!confirmPassword) e.target.style.borderColor = '#E5E7EB'; }}
                                    />
                                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                                        style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {confirmPassword && confirmPassword !== password && (
                                    <div style={{ fontSize: 12, color: '#EF4444', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <AlertCircle size={12} /> Les mots de passe ne correspondent pas
                                    </div>
                                )}
                                {confirmPassword && confirmPassword === password && (
                                    <div style={{ fontSize: 12, color: '#16A34A', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        ✓ Les mots de passe correspondent
                                    </div>
                                )}
                            </div>

                            {/* Submit */}
                            <button type="submit" disabled={loading || (confirmPassword && confirmPassword !== password)}
                                style={{
                                    width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                                    background: loading ? '#A0A0B0' : 'linear-gradient(135deg, #004AAD, #1e40af)',
                                    color: 'white', fontWeight: 800, fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 6px 22px rgba(0,74,173,0.28)', transition: 'all 0.25s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}
                                onMouseOver={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                                {loading ? '⏳ Activation en cours...' : <>🔐 Activer mon compte <ArrowRight size={18} /></>}
                            </button>

                            <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 16 }}>
                                En créant votre compte, vous acceptez nos <a href="#" style={{ color: '#004AAD', textDecoration: 'none' }}>CGU</a> et notre <a href="#" style={{ color: '#004AAD', textDecoration: 'none' }}>politique de confidentialité</a>.
                            </p>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div style={{ textAlign: 'center', marginTop: 20, color: '#9CA3AF', fontSize: 12 }}>
                    © 2026 NextClinic by NEXTACT Solutions · 🇲🇦 Made in Morocco
                </div>
            </div>
        </div>
    );
}

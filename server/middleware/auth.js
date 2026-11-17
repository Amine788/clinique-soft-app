import jwt from 'jsonwebtoken';
import cls from 'cls-hooked';
import { User, Clinic } from '../models/index.js';
import { trialEndFor, TRIAL_EXPIRED_MESSAGE } from '../config/trial.js';

// Secret de signature des sessions : obligatoire, sans valeur par défaut. Un secret écrit dans le code
// permettrait à quiconque le lit de fabriquer une session valide pour n'importe quel compte.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-me') {
    throw new Error('JWT_SECRET manquant ou laissé à « change-me » : définissez un secret long et aléatoire (server/.env ou variables de l\'hébergeur).');
}

// Middleware: Vérifie que le token JWT est valide et injecte clinic_id
export async function authenticateJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token manquant ou invalide' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Rafraîchir le clinic_id depuis la BDD pour éviter les tokens périmés
        const dbUser = await User.findByPk(decoded.id, { attributes: ['id', 'clinic_id', 'statut', 'role', 'nom', 'prenom'] });

        if (!dbUser || dbUser.statut === 'inactif') {
            return res.status(403).json({ error: 'Compte suspendu ou introuvable', code: 'account_suspended' });
        }

        const realClinicId = dbUser.clinic_id || null;
        if (!realClinicId && dbUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Clinique requise pour ce compte', code: 'clinic_required' });
        }

        req.user = {
            ...decoded,
            role: dbUser.role,
            name: `${dbUser.prenom} ${dbUser.nom}`,
            clinicId: realClinicId,
            clinic_id: realClinicId,
        };

        // Injecter le clinic_id dans le namespace CLS (synchrone via import statique)
        const namespace = cls.getNamespace('clinicsoft-tenant');
        
        const proceed = async () => {
            // Ignorer la vérification d'abonnement pour les routes d'authentification et de souscription
            const isSubscriptionRoute = req.originalUrl.startsWith('/api/subscription');
            const isAuthRoute = req.originalUrl.startsWith('/api/auth');
            
            if (isSubscriptionRoute || isAuthRoute) {
                return next();
            }

            try {
                if (!realClinicId) return next();

                const clinic = await Clinic.findByPk(realClinicId, {
                    attributes: ['id', 'subscriptionStatus', 'createdAt', 'trialEndsAt']
                });

                if (!clinic) return next();

                const status = clinic.subscriptionStatus;

                // Clinique suspendue → accès bloqué
                if (status === 'suspended') {
                    return res.status(403).json({
                        error: 'Votre abonnement est suspendu. Veuillez contacter le support NextClinic.',
                        code: 'subscription_suspended'
                    });
                }

                // Trial : calculer si la période d'essai est écoulée
                if (status === 'trial') {
                    const trialEnd = trialEndFor(clinic);
                    if (new Date() > trialEnd) {
                        return res.status(403).json({
                            error: TRIAL_EXPIRED_MESSAGE,
                            code: 'trial_expired',
                            trialExpiredAt: trialEnd.toISOString()
                        });
                    }
                }

                req.subscriptionStatus = status;
                next();
            } catch (err) {
                console.error('[SUBSCRIPTION CHECK IN JWT] Erreur:', err.message);
                next();
            }
        };

        if (namespace && realClinicId) {
            namespace.run(() => {
                namespace.set('clinicId', realClinicId);
                proceed();
            });
        } else {
            proceed();
        }
    } catch (err) {
        // Jeton expiré ou invalide → 401 (le front renvoie vers /login).
        // 403 reste réservé aux refus de rôle, comptes suspendus et abonnements.
        if (['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(err.name)) {
            return res.status(401).json({ error: 'Session expirée ou jeton invalide. Veuillez vous reconnecter.', code: 'token_invalid' });
        }
        console.error('[AUTH] Erreur de vérification :', err.message);
        return res.status(500).json({ error: 'Erreur serveur lors de la vérification de la session' });
    }
}

// Middleware: Vérifie que le rôle de l'utilisateur est autorisé
export function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || (!allowedRoles.includes(req.user.role)
            && !(req.exceptionalAccess && req.method === 'GET' && allowedRoles.includes('doctor')))) {
            return res.status(403).json({ error: 'Accès refusé pour ce rôle' });
        }
        next();
    };
}

// Middleware: S'assure que l'utilisateur a bien un clinic_id (isolement multi-tenant)
export function requireClinicId(req, res, next) {
    if (!req.user || !req.user.clinic_id) {
        return res.status(403).json({ error: 'Clinique non définie pour cet utilisateur' });
    }
    next();
}

// Middleware: Vérifie que l'abonnement de la clinique est actif
// À placer APRÈS authenticateJWT sur les routes protégées
export async function checkSubscription(req, res, next) {
    const clinicId = req.user?.clinic_id || req.user?.clinicId;
    if (!clinicId) return next(); // Routes sans clinique (ex: super-admin) → pas de vérification

    try {
        const clinic = await Clinic.findByPk(clinicId, {
            attributes: ['id', 'subscriptionStatus', 'createdAt', 'trialEndsAt']
        });

        if (!clinic) return next();

        const status = clinic.subscriptionStatus;

        // Clinique suspendue → accès bloqué
        if (status === 'suspended') {
            return res.status(403).json({
                error: 'Votre abonnement est suspendu. Veuillez contacter le support NextClinic.',
                code: 'subscription_suspended'
            });
        }

        // Trial : calculer si la période d'essai est écoulée
        if (status === 'trial') {
            const trialEnd = trialEndFor(clinic);
            if (new Date() > trialEnd) {
                return res.status(403).json({
                    error: TRIAL_EXPIRED_MESSAGE,
                    code: 'trial_expired',
                    trialExpiredAt: trialEnd.toISOString()
                });
            }
        }

        // Attacher le statut d'abonnement à req pour usage aval
        req.subscriptionStatus = status;
        next();
    } catch (err) {
        // En cas d'erreur DB sur la vérification d'abonnement, on laisse passer
        // pour ne pas bloquer les utilisateurs à cause d'un problème interne
        console.error('[SUBSCRIPTION CHECK] Erreur:', err.message);
        next();
    }
}

export { JWT_SECRET };

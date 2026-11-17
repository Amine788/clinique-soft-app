// Patients — liste, recherche et vérification d'une CIN.
import { Router } from 'express';
import { accessQuery } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Patient, DossierMedical } from '../../models/index.js';
import { CIN_REGEX, formatInsurance } from './_commun.js';

const router = Router();

function maskCIN(cin) {
    if (!cin || cin.length < 4) return cin;
    return cin.slice(0, 2) + '****' + cin.slice(-2);
}

// ============================================================
// GET /api/patients — Liste avec recherche CIN/nom
// ============================================================
router.get('/', authenticateJWT, authorizeRole('secretary', 'doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const { cin, search, nom } = req.query;
        // ✅ Isolation multi-tenant : toujours filtrer par clinic_id
        const clinicId = req.user.clinic_id;

        if (!clinicId) {
            return res.status(403).json({ error: 'Clinique non définie pour cet utilisateur' });
        }

        // Recherche par CIN exacte
        if (cin) {
            const patient = await Patient.findOne(await accessQuery(req, Patient, {
                where: { cinNumero: cin.toUpperCase(), clinic_id: clinicId },
                include: [{ model: DossierMedical }]
            }));

            if (patient) {
                const dossier = patient.DossierMedical;
                return res.json({
                    mode: 'cin_exact',
                    patient: {
                        id: patient.numeroDossier,
                        dbId: patient.id,                          // ✅ vrai PK entier pour hospitalisations
                        numeroDossier: patient.numeroDossier,
                        cin: { numero: patient.cinNumero, type: patient.cinType, dateExpiration: patient.cinDateExpiration, estVerifiee: patient.cinEstVerifiee },
                        nom: patient.nom, prenom: patient.prenom, name: `${patient.prenom} ${patient.nom}`,
                        dateNaissance: patient.dateNaissance,
                        age: Math.floor((new Date() - new Date(patient.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000)),
                        sexe: patient.sexe, phone: patient.telephonePrincipal,
                        bloodType: dossier?.groupeSanguin || null,
                        allergies: dossier?.allergies ? (typeof dossier.allergies === 'string' ? JSON.parse(dossier.allergies) : dossier.allergies) : [],
                        chronic: dossier?.maladiesChroniques ? (typeof dossier.maladiesChroniques === 'string' ? JSON.parse(dossier.maladiesChroniques) : dossier.maladiesChroniques) : [],
                        status: 'Externe',
                        cinExpiree: patient.cinDateExpiration && new Date(patient.cinDateExpiration) < new Date()
                    }
                });
            }
            return res.json({ mode: 'cin_exact', patient: null, message: 'CIN non trouvée' });
        }

        // Recherche par nom
        if (nom || search) {
            const query = (nom || search).toLowerCase();
            const results = await Patient.findAll(await accessQuery(req, Patient, {
                where: {
                    clinic_id: clinicId,  // ✅ filtrer par clinique
                    [Op.or]: [
                        { nom: { [Op.like]: `%${query}%` } },
                        { prenom: { [Op.like]: `%${query}%` } },
                    ]
                },
                include: [{ model: DossierMedical }]
            }));

            if (results.length > 1) {
                return res.json({
                    mode: 'nom_ambigu',
                    count: results.length,
                    patients: results.map(p => ({
                        id: p.numeroDossier, name: `${p.prenom} ${p.nom}`, nom: p.nom, prenom: p.prenom,
                        dateNaissance: p.dateNaissance,
                        cinMasque: maskCIN(p.cinNumero),
                        sexe: p.sexe,
                    })),
                    message: `${results.length} patients trouvés. Identifiez par CIN.`
                });
            }
            if (results.length === 1) {
                const p = results[0];
                const dossier = p.DossierMedical;
                return res.json({
                    mode: 'cin_exact',
                    patient: {
                        id: p.numeroDossier,
                        dbId: p.id,                              // ✅ vrai PK entier
                        numeroDossier: p.numeroDossier,
                        cin: { numero: p.cinNumero, type: p.cinType, dateExpiration: p.cinDateExpiration, estVerifiee: p.cinEstVerifiee },
                        nom: p.nom, prenom: p.prenom, name: `${p.prenom} ${p.nom}`,
                        dateNaissance: p.dateNaissance,
                        age: Math.floor((new Date() - new Date(p.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000)),
                        sexe: p.sexe, phone: p.telephonePrincipal,
                        bloodType: dossier?.groupeSanguin || null,
                        allergies: dossier?.allergies ? (typeof dossier.allergies === 'string' ? JSON.parse(dossier.allergies) : dossier.allergies) : [],
                        cinExpiree: p.cinDateExpiration && new Date(p.cinDateExpiration) < new Date()
                    }
                });
            }
            return res.json({ mode: 'nom_ambigu', count: 0, patients: [], message: 'Aucun patient trouvé' });
        }

        // Liste complète — ✅ filtrée par clinic_id
        const where = { clinic_id: clinicId };

        const patients = await Patient.findAll(await accessQuery(req, Patient, { where, include: [{ model: DossierMedical }] }));

        const safeParse = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            try {
                const parsed = JSON.parse(val);
                if (typeof parsed === 'string') return JSON.parse(parsed);
                return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
        };

        res.json(patients.map(p => {
            const dossier = p.DossierMedical;
            return {
                id: p.numeroDossier,
                numeroDossier: p.numeroDossier,   // ✅ exposé explicitement pour handleDelete
                cin: { numero: p.cinNumero, type: p.cinType, dateExpiration: p.cinDateExpiration, estVerifiee: p.cinEstVerifiee, methodeVerification: p.cinMethodeVerif },
                nom: p.nom, prenom: p.prenom, name: `${p.prenom} ${p.nom}`,
                dateNaissance: p.dateNaissance,
                age: Math.floor((new Date() - new Date(p.dateNaissance)) / (365.25 * 24 * 60 * 60 * 1000)),
                gender: p.sexe, sexe: p.sexe,
                phone: p.telephonePrincipal, email: p.email,
                address: p.adresseRue, ville: p.adresseVille,
                insurance: formatInsurance(p),
                bloodType: dossier?.groupeSanguin || null,
                allergies: safeParse(dossier?.allergies),    // ✅ safe parse
                chronic: safeParse(dossier?.maladiesChroniques),  // ✅ safe parse
                height: dossier?.tailleCm ? `${dossier.tailleCm} cm` : null,
                weight: dossier?.poidsKg ? `${dossier.poidsKg} kg` : null,
                status: 'Externe',
                lastVisit: p.updatedAt?.toLocaleDateString('fr-FR') || '',
                createdAt: p.createdAt,   // statistique « Nouveaux ce mois » de PatientsPage
                cinExpiree: p.cinDateExpiration && new Date(p.cinDateExpiration) < new Date()
            };
        }));
    } catch (error) {
        console.error('[PATIENTS] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// GET /api/patients/check-cin/:cin  — ✅ filtré par clinic_id
// ============================================================
router.get('/check-cin/:cin', authenticateJWT, authorizeRole('secretary', 'doctor', 'nurse', 'admin'), async (req, res) => {
    const cin = req.params.cin.toUpperCase();
    const clinicId = req.user.clinic_id;

    if (!CIN_REGEX.test(cin)) {
        return res.json({ valid: false, exists: false, error: 'Format CIN invalide' });
    }

    const existing = await Patient.findOne(await accessQuery(req, Patient, {
        where: { cinNumero: cin, clinic_id: clinicId },
        include: [{ model: DossierMedical }]
    }));
    if (existing) {
        // Allergies : nécessaires à l'alerte allergie de la consultation (ConsultationPage).
        // Même lecture tolérante que GET /:id (JSON parfois sérialisé deux fois).
        const parseList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            try {
                const parsed = JSON.parse(val);
                if (typeof parsed === 'string') return JSON.parse(parsed);
                return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
        };
        const dossier = existing.DossierMedical;
        return res.json({
            valid: true,
            exists: true,
            patient: {
                id: existing.numeroDossier,
                dbId: existing.id,                  // ✅ PK entier requis pour l'hospitalisation
                numeroDossier: existing.numeroDossier,
                name: `${existing.prenom} ${existing.nom}`,
                nom: existing.nom,
                prenom: existing.prenom,
                dateNaissance: existing.dateNaissance,
                cin: { numero: existing.cinNumero },
                allergies: parseList(dossier?.allergies),
                bloodType: dossier?.groupeSanguin || null
            }
        });
    }
    res.json({ valid: true, exists: false });
});

export default router;

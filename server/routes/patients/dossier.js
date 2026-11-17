// Patients — création, lecture, modification et suppression d'un dossier.
import { Router } from 'express';
import { accessQuery, updateScoped } from '../../services/patientAccess.js';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Patient, DossierMedical, CinScan, Clinic } from '../../models/index.js';
import { sendWelcomeEmail, emailConfigure } from '../../services/emailService.js';
import { moduleActif, MODULE_EMAILS_PATIENTS } from '../../services/modulesClinique.js';
import { CIN_REGEX, formatInsurance } from './_commun.js';

const router = Router();

const GROUPES_SANGUINS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Assurance saisie en texte libre : « CNOPS (80%) » → { organisme: 'CNOPS', taux: 80 } ; le taux est facultatif
function parseInsurance(value) {
    const text = String(value || '').trim();
    if (!text) return { organisme: null, taux: null };
    const m = text.match(/^(.*?)[\s(]*(\d{1,3}(?:[.,]\d+)?)\s*%\s*\)?$/);
    if (m && m[1].trim()) return { organisme: m[1].trim().slice(0, 150), taux: Math.min(100, parseFloat(m[2].replace(',', '.'))) };
    return { organisme: text.slice(0, 150), taux: null };
}

// ============================================================
// POST /api/patients — Création  ✅ clinic_id injecté
// ============================================================
router.post('/', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        if (!clinicId) {
            return res.status(403).json({ error: 'Clinique non définie pour cet utilisateur' });
        }

        const { cin, nom, prenom, dateNaissance, sexe, telephone, email, address, ville, bloodType, allergies, chronic, insurance, cinExpiration } = req.body;

        if (!cin || !CIN_REGEX.test(cin.toUpperCase())) {
            return res.status(400).json({ error: 'CIN invalide' });
        }

        // ✅ Vérification doublon uniquement dans la même clinique
        const exists = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: cin.toUpperCase(), clinic_id: clinicId } }));
        if (exists) {
            return res.status(409).json({ error: 'Ce CIN est déjà enregistré dans cette clinique', code: 'CIN_EXISTS' });
        }

        if (!nom || !prenom || !dateNaissance || !sexe || !telephone) {
            return res.status(400).json({ error: 'Champs obligatoires manquants' });
        }

        // Générer un numéro de dossier unique pour cette clinique
        const lastPatient = await Patient.findOne(await accessQuery(req, Patient, { where: { clinic_id: clinicId }, order: [['id', 'DESC']] }));
        const nextId = lastPatient ? lastPatient.id + 1 : 1;
        const year = new Date().getFullYear();
        const numeroDossier = `PAT-${year}-${String(nextId).padStart(5, '0')}`;

        const assurance = parseInsurance(insurance);
        const patient = await Patient.create({
            clinic_id: clinicId,  // ✅ isolation multi-tenant
            cinNumero: cin.toUpperCase(),
            cinDateExpiration: cinExpiration || '2030-01-01',
            numeroDossier,
            nom: nom.toUpperCase(), prenom,
            dateNaissance, sexe,
            telephonePrincipal: telephone,
            email, adresseRue: address, adresseVille: ville,
            assuranceOrganisme: assurance.organisme,
            assuranceTaux: assurance.taux,
            creeParUserId: req.user.id
            ,...(req.user.role === 'doctor' ? { medecinTraitantId: req.user.id } : {})
        });

        // Créer le dossier médical
        await DossierMedical.create({
            patientId: patient.id,
            groupeSanguin: bloodType || null,
            allergies: JSON.stringify(allergies || []),
            maladiesChroniques: JSON.stringify(chronic || []),
        });

        console.log(`[PATIENT] Dossier ${numeroDossier} — CIN ${cin.toUpperCase()} — créé par ${req.user.name} (Clinique #${clinicId})`);

        // Link orphaned scans to this new patient (dans la même clinique)
        await CinScan.update(
            { patientId: patient.id, clinic_id: clinicId },
            await accessQuery(req, CinScan, { where: { cinNumero: cin.toUpperCase(), patientId: null, clinic_id: clinicId } })
        );

        // E-mail de bienvenue (non bloquant), si la clinique a activé les e-mails aux patients
        const clinic = email && emailConfigure() ? await Clinic.findByPk(clinicId) : null;
        if (clinic && moduleActif(clinic, MODULE_EMAILS_PATIENTS)) {
            sendWelcomeEmail({ email, prenom, nom: nom.toUpperCase(), numeroDossier, clinic })
                .catch(err => console.error('[EMAIL] Bienvenue non envoyé :', err.message));
        }

        res.status(201).json({ id: numeroDossier, cin: cin.toUpperCase(), nom: nom.toUpperCase(), prenom });
    } catch (error) {
        console.error('[PATIENTS] Erreur création :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// GET /api/patients/:id — Détail  ✅ filtré par clinic_id
// ============================================================
router.get('/:id', authenticateJWT, authorizeRole('secretary', 'doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const patient = await Patient.findOne(await accessQuery(req, Patient, {
            where: { numeroDossier: req.params.id, clinic_id: clinicId },
            include: [{ model: DossierMedical }]
        }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });
        const dossier = patient.DossierMedical;

        // Helper : parse safely even if value is double-JSON-stringified
        const safeParse = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            try {
                const parsed = JSON.parse(val);
                // If still a string (double-stringified), parse again
                if (typeof parsed === 'string') return JSON.parse(parsed);
                return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
        };

        res.json({
            id: patient.numeroDossier,
            numeroDossier: patient.numeroDossier,   // ✅ exposé pour handleDelete
            cin: { numero: patient.cinNumero, dateExpiration: patient.cinDateExpiration, estVerifiee: patient.cinEstVerifiee },
            nom: patient.nom, prenom: patient.prenom, name: `${patient.prenom} ${patient.nom}`,
            dateNaissance: patient.dateNaissance, sexe: patient.sexe,
            phone: patient.telephonePrincipal,
            telephonePrincipal: patient.telephonePrincipal,
            email: patient.email,
            adresseRue: patient.adresseRue,
            adresseVille: patient.adresseVille,
            assuranceOrganisme: patient.assuranceOrganisme,
            assuranceTaux: patient.assuranceTaux,
            bloodType: dossier?.groupeSanguin || null,
            allergies: safeParse(dossier?.allergies),     // ✅ parse robuste
            chronic: safeParse(dossier?.maladiesChroniques),  // ✅ parse robuste
            insurance: formatInsurance(patient),
            cinExpiree: patient.cinDateExpiration && new Date(patient.cinDateExpiration) < new Date()
        });
    } catch (error) {
        console.error('[PATIENTS] Erreur détail :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// PUT /api/patients/:id — Modification  ✅ vérifie clinic_id
// ============================================================
router.put('/:id', authenticateJWT, authorizeRole('secretary', 'doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const { nom, prenom, dateNaissance, sexe, telephonePrincipal, email, adresseRue, adresseVille, bloodType, allergies, chronic, cinExpiration, insurance } = req.body;

        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { numeroDossier: req.params.id, clinic_id: clinicId } }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        // Valeurs contrôlées : une valeur invalide donnait une erreur 500 (ENUM de la base)
        if (sexe && !['M', 'F'].includes(sexe)) return res.status(400).json({ error: 'Sexe invalide (M ou F)' });
        if (bloodType && !GROUPES_SANGUINS.includes(bloodType)) return res.status(400).json({ error: 'Groupe sanguin invalide' });
        if (allergies !== undefined && !Array.isArray(allergies)) return res.status(400).json({ error: 'Allergies : liste attendue' });
        if (chronic !== undefined && !Array.isArray(chronic)) return res.status(400).json({ error: 'Maladies chroniques : liste attendue' });
        // Champ facultatif envoyé vide = effacé ; absent = inchangé
        const facultatif = (valeur, actuel) => valeur === undefined ? actuel : (String(valeur).trim() || null);

        await updateScoped(req, patient, {
            nom: nom ? nom.toUpperCase() : patient.nom,
            prenom: prenom || patient.prenom,
            dateNaissance: dateNaissance || patient.dateNaissance,
            sexe: sexe || patient.sexe,
            telephonePrincipal: telephonePrincipal || patient.telephonePrincipal,
            email: facultatif(email, patient.email),
            adresseRue: facultatif(adresseRue, patient.adresseRue),
            adresseVille: facultatif(adresseVille, patient.adresseVille),
            cinDateExpiration: cinExpiration || patient.cinDateExpiration,
            // Assurance modifiée seulement si le champ est envoyé (chaîne vide = retirée)
            ...(insurance !== undefined && (({ organisme, taux }) => ({ assuranceOrganisme: organisme, assuranceTaux: taux }))(parseInsurance(insurance)))
        });

        // Dossier médical (créé s'il manque) ; une liste vide efface les allergies / maladies
        if (req.user.role === 'doctor') {
        const [dossier] = await DossierMedical.findOrCreate({ where: { patientId: patient.id }, defaults: { allergies: '[]', maladiesChroniques: '[]' } });
        await dossier.update({
            groupeSanguin: bloodType !== undefined ? (bloodType || null) : dossier.groupeSanguin,
            allergies: allergies !== undefined ? JSON.stringify(allergies) : dossier.allergies,
            maladiesChroniques: chronic !== undefined ? JSON.stringify(chronic) : dossier.maladiesChroniques
        });

        }
        console.log(`[PATIENT] Dossier ${req.params.id} mis à jour par ${req.user.name} (Clinique #${clinicId})`);
        res.json({ success: true, message: 'Patient mis à jour' });
    } catch (error) {
        console.error('[PATIENTS] Erreur modification :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.delete('/:id', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { numeroDossier: req.params.id, clinic_id: clinicId } }));
        if (!patient) return res.status(404).json({ error: 'Patient non trouvé' });

        const dossier = await DossierMedical.findOne({ where: { patientId: patient.id } });
        if (dossier) await dossier.destroy();

        await patient.destroy();

        console.log(`[PATIENT] Dossier ${req.params.id} supprimé par ${req.user.name} (Clinique #${clinicId})`);
        res.json({ success: true, message: 'Patient supprimé avec succès' });
    } catch (error) {
        console.error('[PATIENTS] Erreur suppression :', error.message);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
    }
});

export default router;

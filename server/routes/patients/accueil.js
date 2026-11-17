// Patients — pointage à l'arrivée (check-in).
import { Router } from 'express';
import { accessQuery, updateScoped } from '../../services/patientAccess.js';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Patient, DossierMedical, Pointage } from '../../models/index.js';
import { jourClinique } from '../../services/dates.js';

const router = Router();

// ============================================================
// POST /api/patients/checkin — Pointage  ✅ filtré par clinic_id
// ============================================================
router.post('/checkin', authenticateJWT, authorizeRole('secretary', 'admin'), async (req, res) => {
    try {
        const { cin, mode } = req.body;
        const clinicId = req.user.clinic_id;

        if (!cin) return res.status(400).json({ error: 'CIN requis' });

        const { RendezVous } = await import('../../models/index.js');
        const patient = await Patient.findOne(await accessQuery(req, Patient, {
            where: { cinNumero: cin.toUpperCase(), clinic_id: clinicId },  // ✅
            include: [{ model: DossierMedical }]
        }));

        if (!patient) return res.status(404).json({ error: 'Patient non trouvé avec cette CIN dans votre clinique' });

        const cinExpiree = patient.cinDateExpiration && new Date(patient.cinDateExpiration) < new Date();
        const dossier = patient.DossierMedical;
        const allergies = dossier?.allergies ? (typeof dossier.allergies === 'string' ? JSON.parse(dossier.allergies) : dossier.allergies) : [];

        // Chercher un RDV aujourd'hui pour ce patient dans la même clinique
        const todayStr = jourClinique();
        const rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, {
            where: {
                patientId: patient.id,
                clinic_id: clinicId,  // ✅
                dateRdv: todayStr,
                statut: { [Op.in]: ['planifie', 'confirme'] }
            }
        }));

        if (rdv) {
            await updateScoped(req, rdv, {
                statut: 'arrive',
                heureArrivee: new Date(),
                modePointage: mode || 'saisie_cin',
                pointePar: req.user.id
            });
        }

        // Créer le pointage en base
        await Pointage.create({
            clinic_id: clinicId,  // ✅
            patientId: patient.id,
            patientCin: patient.cinNumero,
            rdvId: rdv ? rdv.id : null,
            modePointage: mode || 'saisie_cin',
            pointePar: req.user.id,
            cinExpiree
        });

        console.log(`[CHECK-IN] ${patient.cinNumero} — ${patient.prenom} ${patient.nom} — Clinique #${clinicId} — par ${req.user.name}`);

        res.json({
            success: true,
            patient: {
                id: patient.numeroDossier,
                cin: patient.cinNumero,
                name: `${patient.prenom} ${patient.nom}`,
                nom: patient.nom, prenom: patient.prenom,
                allergies,
                bloodType: dossier?.groupeSanguin,
            },
            rdv: rdv ? { id: rdv.numeroRdv, statut: 'arrive' } : null,
            cinExpiree,
            arrivee: new Date().toISOString(),
            alertes: { cinExpiree, allergies: allergies.length > 0, allergiesListe: allergies }
        });
    } catch (error) {
        console.error('[CHECKIN] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;

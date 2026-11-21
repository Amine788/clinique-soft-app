import { patientAccess, accessQuery, scopedByPk, updateScoped } from '../services/patientAccess.js';
import { Router } from 'express';
import { Op } from 'sequelize';
import { authenticateJWT, authorizeRole, requireClinicId } from '../middleware/auth.js';
import sequelize, { RendezVous, Patient, Medecin, User, Chambre, Hospitalisation, Clinic } from '../models/index.js';
import { sendAppointmentConfirmation, emailConfigure } from '../services/emailService.js';
import { moduleActif, MODULE_EMAILS_PATIENTS } from '../services/modulesClinique.js';
import { absenceValideeLe } from './absences.js';
const messageAbsence = a => `Le médecin est absent du ${a.dateDebut} au ${a.dateFin} (absence validée) : choisissez une autre date ou un autre médecin.`;

import { clinicSocket } from '../socket/clinicSocket.js';
const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('appointments'));

// GET /api/appointments — Tous les RDV de la clinique
// nurse : lecture seule (historique des RDV dans le dossier patient, PatientProfileAdvanced)
router.get('/', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin', 'nurse'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        if (!clinicId) return res.status(403).json({ error: 'Clinique non définie' });

        // ✅ Toujours filtrer par clinic_id
        const where = { clinic_id: clinicId };

        if (req.user.role === 'doctor') {
            const medecin = await Medecin.findOne(await accessQuery(req, Medecin, { where: { userId: req.user.id } }));
            if (medecin) where.medecinId = medecin.id;
        }
        // Filtres optionnels
        if (req.query.doctorId) {
            if (req.user.role === 'doctor' && Number(req.query.doctorId) !== req.accessDoctorId) return res.status(403).json({ error: 'Périmètre médecin imposé par le serveur' });
            where.medecinId = req.query.doctorId;
        }
        if (req.query.date) where.dateRdv = req.query.date;
        if (req.query.patientCin) where.patientCin = req.query.patientCin;
        if (req.query.patientId) where.patientId = req.query.patientId;

        const rdvs = await RendezVous.findAll(await accessQuery(req, RendezVous, {
            where,
            include: [
                { model: Patient, attributes: ['cinNumero', 'nom', 'prenom', 'telephonePrincipal', 'numeroDossier'] },
                { model: Medecin, include: [{ model: User, attributes: ['nom', 'prenom'] }] }
            ],
            order: [['dateRdv', 'ASC'], ['heureDebut', 'ASC']]
        }));

        res.json(rdvs.map(r => ({
            id: r.numeroRdv,
            arrivedAt: r.heureArrivee,
            patientId: r.Patient?.numeroDossier,
            patientCin: r.patientCin,
            patient: r.Patient ? `${r.Patient.prenom} ${r.Patient.nom}` : '—',
            patientPhone: r.Patient?.telephonePrincipal,
            doctorId: r.medecinId,
            doctor: r.Medecin?.User ? `Dr. ${r.Medecin.User.prenom} ${r.Medecin.User.nom}` : '—',
            date: r.dateRdv,
            time: r.heureDebut?.slice(0, 5),
            endTime: r.heureFin?.slice(0, 5),
            type: r.typeConsultation,
            motif: r.motif,
            status: r.statut,
            salle: r.salle,
            medecinId: r.medecinId,
        })));
    } catch (error) {
        console.error('[APPOINTMENTS GET] Erreur :', error.message);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erreur serveur' });
    }
});

// POST /api/appointments — Créer un nouveau RDV  ✅ avec clinic_id
router.post('/', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        if (!clinicId) return res.status(403).json({ error: 'Clinique non définie' });

        const { patientCin, doctorId, date, heure, typeConsultation, mode, motif } = req.body;

        if (!patientCin || !doctorId || !date || !heure || !motif) {
            return res.status(400).json({ error: 'Champs obligatoires manquants (patient, médecin, date, heure, motif)' });
        }

        // ✅ Résoudre le patient dans la clinique courante uniquement
        const patient = await Patient.findOne(await accessQuery(req, Patient, { where: { cinNumero: patientCin.toUpperCase(), clinic_id: clinicId } }));
        if (!patient) return res.status(404).json({ error: `Patient introuvable avec le CIN : ${patientCin}` });

        // Résoudre le médecin
        const medecinNumId = typeof doctorId === 'string' && doctorId.startsWith('doc-')
            ? parseInt(doctorId.replace('doc-', ''), 10)
            : parseInt(doctorId, 10);

        // ✅ Vérifier que le médecin appartient bien à cette clinique
        const medecin = await Medecin.findOne(await accessQuery(req, Medecin, { where: { id: medecinNumId, clinic_id: clinicId } }));
        if (!medecin) return res.status(404).json({ error: `Médecin introuvable (id: ${medecinNumId})` });
        if (req.user.role === 'doctor' && medecin.id !== req.accessDoctorId) return res.status(403).json({ error: 'Création uniquement en votre nom' });

        // Médecin en absence validée ce jour-là
        const absence = await absenceValideeLe(medecin.id, date);
        if (absence) return res.status(409).json({ error: messageAbsence(absence) });

        // Vérifier conflit de créneau dans la même clinique
        const heureDebutDb = heure.length === 5 ? heure + ':00' : heure;
        const conflict = await RendezVous.findOne(await accessQuery(req, RendezVous, {
            where: {
                clinic_id: clinicId,  // ✅
                medecinId: medecinNumId,
                dateRdv: date,
                heureDebut: heureDebutDb,
                statut: { [Op.notIn]: ['annule', 'non_presente'] }
            }
        }));
        if (conflict) return res.status(409).json({ error: 'Ce créneau est déjà occupé pour ce médecin' });

        // Mapper les types FR → enum DB
        const typeMap = {
            'Première consultation': 'premiere',
            'Suivi': 'suivi',
            'Consultation urgente': 'urgente',
            'Bilan de santé': 'bilan',
            'Pré-opératoire': 'bilan',
            'Vaccination': 'vaccination',
            'Téléconsultation': 'teleconsultation',
        };
        // Le front envoie directement les valeurs de l'ENUM (premiere, suivi, urgente…) :
        // on les accepte telles quelles, 'preoperation' → 'bilan', les libellés restent tolérés.
        const TYPES_DB = ['premiere', 'suivi', 'urgente', 'bilan', 'vaccination', 'teleconsultation'];
        const typeDb = TYPES_DB.includes(typeConsultation) ? typeConsultation
            : typeConsultation === 'preoperation' ? 'bilan'
            : (typeMap[typeConsultation] || 'premiere');

        // Calculer heureFin
        const duree = medecin.dureeRdvMinutes || 30;
        const [h, m] = heure.split(':').map(Number);
        const finMinutes = h * 60 + m + duree;
        const heureFin = `${String(Math.floor(finMinutes / 60)).padStart(2, '0')}:${String(finMinutes % 60).padStart(2, '0')}:00`;

        // Générer le numéro de RDV unique : numero_rdv est UNIQUE sur toute la table alors que le
        // compteur est par clinique → préfixe par la clinique (les anciens numéros restent valides)
        const count = await RendezVous.count(await accessQuery(req, RendezVous, { where: { clinic_id: clinicId } }));
        const numeroRdv = `RDV-${clinicId}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
        if (numeroRdv.length > 20) { // colonne numero_rdv : VARCHAR(20)
            console.error(`[APPOINTMENTS POST] Numéro de RDV trop long (${numeroRdv.length} > 20) : ${numeroRdv}`);
            return res.status(500).json({ error: 'Impossible de générer le numéro de rendez-vous. Contactez le support.' });
        }

        // Hospitalisation planifiée (P17) : une demande d'hospitalisation est créée avec le RDV.
        // La chambre choisie n'est qu'une proposition : elle n'est occupée qu'à l'admission
        // (PUT /hospitalisations/:id/admit), comme pour une demande faite par le médecin.
        const hospitalisation = req.body.hospitalisation === true;
        let chambreNumId = null;
        let dateAdmission = null;
        let dateSortieEstimee = null;
        if (hospitalisation) {
            const JOUR = /^\d{4}-\d{2}-\d{2}$/;
            dateAdmission = req.body.dateAdmission || date;
            dateSortieEstimee = req.body.dateSortieEstimee || null;
            if (!JOUR.test(dateAdmission) || (dateSortieEstimee && !JOUR.test(dateSortieEstimee))) {
                return res.status(400).json({ error: 'Dates d\'hospitalisation invalides (AAAA-MM-JJ)' });
            }
            if (dateSortieEstimee && dateSortieEstimee < dateAdmission) {
                return res.status(400).json({ error: 'La sortie prévue précède la date d\'admission' });
            }

            if (req.body.chambreId) {
                const rawChambreId = req.body.chambreId;
                chambreNumId = typeof rawChambreId === 'string' && rawChambreId.startsWith('room-')
                    ? parseInt(rawChambreId.replace('room-', ''), 10)
                    : parseInt(rawChambreId, 10);

                const chambre = await Chambre.findOne(await accessQuery(req, Chambre, { where: { id: chambreNumId, clinic_id: clinicId } }));
                if (!chambre) return res.status(404).json({ error: 'Chambre introuvable' });
                if (chambre.statut === 'occupee') return res.status(409).json({ error: `La chambre ${chambre.numero} est déjà occupée` });
            }

            const enCours = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
                where: { clinic_id: clinicId, patientId: patient.id, statut: { [Op.in]: ['demande', 'admis', 'sortie_demandee'] } },
            }));
            if (enCours) return res.status(409).json({ error: 'Ce patient a déjà une hospitalisation demandée ou en cours' });
        }

        // RDV et demande d'hospitalisation créés ensemble ou pas du tout
        const t = await sequelize.transaction();
        let rdv, hosp = null;
        try {
            rdv = await RendezVous.create({
                clinic_id: clinicId,  // ✅
                numeroRdv,
                patientId: patient.id,
                patientCin: patient.cinNumero,
                medecinId: medecinNumId,
                dateRdv: date,
                heureDebut: heureDebutDb,
                heureFin,
                typeConsultation: typeDb,
                mode: mode || 'presentiel',
                motif,
                statut: 'planifie',
                salle: medecin.salleConsultation || null,
                creePar: req.user.id,
            }, { transaction: t });

            if (hospitalisation) {
                hosp = await Hospitalisation.create({
                    clinic_id: clinicId,
                    patientId: patient.id,
                    medecinId: medecinNumId,
                    chambreId: chambreNumId,
                    motif,
                    statut: 'demande',
                    dateAdmission,
                    dateSortieEstimee,
                }, { transaction: t });
            }
            await t.commit();
        } catch (err) {
            await t.rollback();
            throw err;
        }

        // E-mail de confirmation au patient (non bloquant), si la clinique a activé les e-mails aux patients
        const clinic = await Clinic.findByPk(clinicId);
        if (patient.email && emailConfigure() && moduleActif(clinic, MODULE_EMAILS_PATIENTS)) {
            const medecinUser = await scopedByPk(req, User, medecin.userId);
            sendAppointmentConfirmation({
                email: patient.email,
                prenom: patient.prenom,
                doctorName: medecinUser ? `Dr. ${medecinUser.prenom} ${medecinUser.nom}` : 'Votre médecin',
                date: rdv.dateRdv,
                heureDebut: rdv.heureDebut,
                clinic,
            }).catch(err => console.error('[EMAIL] Confirmation non envoyée :', err.message));
        }

        res.status(201).json({
            id: rdv.numeroRdv,
            patientCin: rdv.patientCin,
            date: rdv.dateRdv,
            time: rdv.heureDebut?.slice(0, 5),
            endTime: rdv.heureFin?.slice(0, 5),
            type: rdv.typeConsultation,
            motif: rdv.motif,
            status: rdv.statut,
            medecinId: rdv.medecinId,
            hospitalisationId: hosp?.id ?? null,
        });
    } catch (error) {
        console.error('[APPOINTMENTS POST] Erreur :', error.message);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erreur serveur lors de la création du RDV' });
    }
});

// GET /api/appointments/:id — Détail d'un RDV  ✅ vérifie clinic_id
router.get('/:id', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, {
            where: { ...(/^[0-9]+$/.test(req.params.id) ? { id: Number(req.params.id) } : { numeroRdv: req.params.id }), clinic_id: clinicId },
            include: [{ model: Patient, attributes: ['nom', 'prenom', 'cinNumero'] }]
        }));
        if (!rdv) return res.status(404).json({ error: 'RDV non trouvé' });

        res.json({
            id: rdv.numeroRdv,
            patientCin: rdv.patientCin,
            patientNom: rdv.Patient ? `${rdv.Patient.prenom} ${rdv.Patient.nom}` : '—',
            date: rdv.dateRdv,
            time: rdv.heureDebut?.slice(0, 5),
            typeConsultation: rdv.typeConsultation,
            motif: rdv.motif,
            statut: rdv.statut
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PUT /api/appointments/:id/status  ✅ vérifie clinic_id
router.put('/:id/status', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, { where: { ...(/^[0-9]+$/.test(req.params.id) ? { id: Number(req.params.id) } : { numeroRdv: req.params.id }), clinic_id: clinicId } }));
        if (!rdv) return res.status(404).json({ error: 'RDV non trouvé' });
        if (req.user.role === 'doctor' && rdv.medecinId !== req.accessDoctorId) return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres consultations' });
        if (!RendezVous.rawAttributes.statut.values.includes(req.body.status)) return res.status(400).json({ error: 'Statut de rendez-vous invalide' });
        await updateScoped(req, rdv, { statut: req.body.status });
        clinicSocket?.notifyQueueChanged?.(clinicId);

        res.json({ id: rdv.numeroRdv, status: rdv.statut });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// PATCH /api/appointments/:id — Modifier un RDV  ✅ vérifie clinic_id
router.patch('/:id', authenticateJWT, authorizeRole('secretary', 'doctor', 'admin'), async (req, res) => {
    try {
        const clinicId = req.user.clinic_id;
        const rdv = await RendezVous.findOne(await accessQuery(req, RendezVous, { where: { ...(/^[0-9]+$/.test(req.params.id) ? { id: Number(req.params.id) } : { numeroRdv: req.params.id }), clinic_id: clinicId } }));
        if (!rdv) return res.status(404).json({ error: 'RDV non trouvé' });

        const { date, heure, typeConsultation, motif, statut } = req.body;

        const typeMap = {
            'Première consultation': 'premiere', 'premiere': 'premiere',
            'Suivi': 'suivi', 'suivi': 'suivi',
            'Consultation urgente': 'urgente', 'urgente': 'urgente',
            'Bilan de santé': 'bilan', 'bilan': 'bilan',
            'Pré-opératoire': 'bilan',
            'Vaccination': 'vaccination', 'vaccination': 'vaccination',
        };

        const updates = {};
        if (date && date !== rdv.dateRdv) {
            const absence = await absenceValideeLe(rdv.medecinId, date);
            if (absence) return res.status(409).json({ error: messageAbsence(absence) });
        }
        if (date) updates.dateRdv = date;
        if (heure) {
            updates.heureDebut = heure.length === 5 ? heure + ':00' : heure;
            const medecin = await scopedByPk(req, Medecin, rdv.medecinId);
            const duree = medecin?.dureeRdvMinutes || 30;
            const [h, m] = heure.split(':').map(Number);
            const fin = h * 60 + m + duree;
            updates.heureFin = `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}:00`;
        }
        if (typeConsultation) updates.typeConsultation = typeMap[typeConsultation] || typeConsultation;
        if (motif !== undefined) updates.motif = motif;
        if (statut) updates.statut = statut;

        await updateScoped(req, rdv, updates);
        res.json({ success: true, id: rdv.numeroRdv });
    } catch (error) {
        console.error('[APPOINTMENTS PATCH]', error.message);
        res.status(500).json({ error: 'Erreur serveur lors de la modification' });
    }
});

export default router;

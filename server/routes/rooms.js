import { patientAccess, accessQuery, scopedByPk, updateScoped } from '../services/patientAccess.js';
import { Router } from 'express';
import { authenticateJWT, authorizeRole, requireClinicId } from '../middleware/auth.js';
import { Chambre, Hospitalisation, Patient, Medecin, User } from '../models/index.js';
const router = Router();
router.use(authenticateJWT, requireClinicId, patientAccess('rooms'));

// Helper : mapper statut DB → FR
const statutToFr = (s) => ({ disponible: 'Disponible', occupee: 'Occupée', reservee: 'Réservée', nettoyage: 'Nettoyage', hors_service: 'Hors service' }[s] || s);
const statutToEn = (s) => ({ disponible: 'available', occupee: 'occupied', reservee: 'reserved', nettoyage: 'maintenance', hors_service: 'maintenance' }[s] || s);
const numId = (raw) => typeof raw === 'string' && raw.startsWith('room-')
    ? parseInt(raw.replace('room-', ''), 10) : parseInt(raw, 10);

const formatRoom = (c) => ({
    id: c.id,
    roomKey: `room-${String(c.id).padStart(3, '0')}`,
    number: c.numero,
    type: c.typeChambre,
    beds: c.nbLits,
    price: parseFloat(c.tarifTtc) || 0,
    status: statutToEn(c.statut),
    statusFr: statutToFr(c.statut),
    equipements: c.equipements ? (typeof c.equipements === 'string' ? JSON.parse(c.equipements) : c.equipements) : [],
    hospitalisation: c.Hospitalisations?.[0] ? {
        id: c.Hospitalisations[0].id,
        lit: c.Hospitalisations[0].lit,
        dateAdmission: c.Hospitalisations[0].dateAdmission,
        patient: c.Hospitalisations[0].Patient ? {
            nom: c.Hospitalisations[0].Patient.nom,
            prenom: c.Hospitalisations[0].Patient.prenom,
            cinNumero: c.Hospitalisations[0].Patient.cinNumero
        } : null,
        medecin: c.Hospitalisations[0].Medecin?.User ? {
            nom: c.Hospitalisations[0].Medecin.User.nom,
            prenom: c.Hospitalisations[0].Medecin.User.prenom
        } : null,
        nurse: c.Hospitalisations[0].nurse ? {
            nom: c.Hospitalisations[0].nurse.nom,
            prenom: c.Hospitalisations[0].nurse.prenom
        } : null
    } : null
});

// GET /api/rooms — Liste des chambres
router.get('/', authenticateJWT, authorizeRole('secretary', 'doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const chambres = await Chambre.findAll(await accessQuery(req, Chambre, {
            where: { clinic_id: req.user.clinic_id },
            order: [['id', 'ASC']],
            include: [
                {
                    model: Hospitalisation,
                    where: { statut: ['admis', 'sortie_demandee'] },
                    required: false,
                    include: [
                        { model: Patient },
                        { model: Medecin, include: [{ model: User }] },
                        { model: User, as: 'nurse' }
                    ]
                }
            ]
        }));
        res.json(chambres.map(formatRoom));
    } catch (error) {
        console.error('[ROOMS GET] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/rooms/:id — Détail d'une chambre
router.get('/:id', authenticateJWT, authorizeRole('secretary', 'doctor', 'nurse', 'admin'), async (req, res) => {
    try {
        const room = await scopedByPk(req, Chambre, numId(req.params.id), {
            include: [
                {
                    model: Hospitalisation,
                    where: { statut: ['admis', 'sortie_demandee'] },
                    required: false,
                    include: [
                        { model: Patient },
                        { model: Medecin, include: [{ model: User }] },
                        { model: User, as: 'nurse' }
                    ]
                }
            ]
        });
        if (!room) return res.status(404).json({ error: 'Chambre non trouvée' });
        res.json(formatRoom(room));
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/rooms — Créer une nouvelle chambre
router.post('/', authenticateJWT, authorizeRole('secretary'), async (req, res) => {
    try {
        const { numero, typeChambre, nbLits, tarifTtc, equipements } = req.body;

        if (!numero || !typeChambre) {
            return res.status(400).json({ error: 'Le numéro et le type de chambre sont obligatoires' });
        }

        // Vérifier unicité du numéro
        const existing = await Chambre.findOne(await accessQuery(req, Chambre, { where: { numero: numero.trim() } }));
        if (existing) return res.status(409).json({ error: `La chambre "${numero}" existe déjà` });

        const chambre = await Chambre.create({
            clinic_id: req.user.clinic_id,
            numero: numero.trim(),
            typeChambre,
            nbLits: nbLits || 1,
            tarifTtc: tarifTtc || null,
            statut: 'disponible',
            equipements: equipements ? JSON.stringify(equipements) : null,
        });

        res.status(201).json(formatRoom(chambre));
    } catch (error) {
        console.error('[ROOMS POST] Erreur :', error.message);
        res.status(500).json({ error: error.message || 'Erreur serveur' });
    }
});

// PUT /api/rooms/:id/status — Changer le statut d'une chambre
router.put('/:id/status', authenticateJWT, authorizeRole('secretary', 'nurse'), async (req, res) => {
    try {
        const room = await scopedByPk(req, Chambre, numId(req.params.id));
        if (!room) return res.status(404).json({ error: 'Chambre non trouvée' });

        const VALID = ['disponible', 'occupee', 'hors_service'];
        const newStatut = req.body.statut;
        if (!VALID.includes(newStatut)) {
            return res.status(400).json({ error: `Statut invalide. Valeurs acceptées : ${VALID.join(', ')}` });
        }

        await updateScoped(req, room, { statut: newStatut });
        res.json(formatRoom(room));
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// DELETE /api/rooms/:id — Supprimer une chambre (si disponible)
router.delete('/:id', authenticateJWT, authorizeRole('secretary'), async (req, res) => {
    try {
        const room = await scopedByPk(req, Chambre, numId(req.params.id));
        if (!room) return res.status(404).json({ error: 'Chambre non trouvée' });
        if (room.statut === 'occupee') {
            return res.status(409).json({ error: 'Impossible de supprimer une chambre occupée' });
        }
        await Chambre.destroy(await accessQuery(req, Chambre, { where: { id: room.id } }));
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;

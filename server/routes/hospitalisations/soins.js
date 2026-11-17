// Hospitalisations — soins infirmiers : constantes, alertes, soins, résolution d'alerte.
import { Router } from 'express';
import { accessQuery } from '../../services/patientAccess.js';
import { authenticateJWT, authorizeRole } from '../../middleware/auth.js';
import { Hospitalisation, HospitalisationSoin, HospitalisationVital, HospitalisationAlerte, Patient, Medecin } from '../../models/index.js';
import { byIdInClinic } from '../../services/tenant.js';

const router = Router();

// Helper to check if a vital value is abnormal
function getAbnormalAlerts(vitals) {
    const alerts = [];
    const temp = parseFloat(vitals.temperature);
    if (!isNaN(temp) && (temp > 38.5 || temp < 35.5)) {
        alerts.push({ type: 'temperature', desc: `Température anormale: ${temp}°C` });
    }
    const spo2 = parseInt(vitals.saturation);
    if (!isNaN(spo2) && spo2 < 94) {
        alerts.push({ type: 'saturation', desc: `Saturation O₂ faible: ${spo2}%` });
    }
    const pouls = parseInt(vitals.pouls);
    if (!isNaN(pouls) && (pouls > 100 || pouls < 50)) {
        alerts.push({ type: 'pouls', desc: `Pouls hors limites: ${pouls} bpm` });
    }
    // Tension « 120/80 » (mmHg) ou « 12/8 » (cmHg, converti en mmHg)
    if (vitals.tension && vitals.tension.includes('/')) {
        const brut = parseFloat(vitals.tension.split('/')[0].replace(',', '.'));
        const sys = brut < 30 ? brut * 10 : brut;
        if (!isNaN(sys) && (sys > 140 || sys < 90)) {
            alerts.push({ type: 'tension', desc: `Tension artérielle anormale: ${vitals.tension}` });
        }
    }
    const glyc = parseFloat(vitals.glycemie);
    if (!isNaN(glyc) && (glyc > 1.4 || glyc < 0.7)) {
        alerts.push({ type: 'glycemie', desc: `Glycémie anormale: ${glyc} g/L` });
    }
    return alerts;
}

// 7. POST /api/hospitalisations/:id/vitals — Saisie des constantes par la nurse
router.post('/:id/vitals', authenticateJWT, authorizeRole('nurse'), async (req, res) => {
    try {
        const { temperature, tension, saturation, glycemie, pouls, respiration, poids } = req.body;
        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
            ...byIdInClinic(req),
            include: [
                { model: Patient },
                { model: Medecin }    // ✅ charger Medecin pour avoir userId
            ]
        }));
        if (!hosp) return res.status(404).json({ error: 'Hospitalisation non trouvée' });

        const vital = await HospitalisationVital.create({
            hospitalisationId: hosp.id,
            temperature, tension, saturation, glycemie, pouls, respiration, poids,
            prisPar: req.user.id
        });

        // Détection d'anomalies automatiques
        const abnormalAlerts = getAbnormalAlerts(req.body);
        for (const alert of abnormalAlerts) {
            await HospitalisationAlerte.create({
                hospitalisationId: hosp.id,
                typeAlerte: alert.type,
                description: alert.desc,
                urgency: 'urgent',
                statut: 'active'
            });

            // ✅ Notifier le médecin via son User.id (pas Medecin.id)
            try {
                import('../../index.js').then(({ clinicSocket }) => {
                    const medecinUserId = hosp.Medecin?.userId || hosp.Medecin?.user_id;
                    if (medecinUserId) {
                        clinicSocket?.emitToUser(medecinUserId, 'hosp_alert', {
                            id: hosp.id,
                            patientNom: `${hosp.Patient?.prenom} ${hosp.Patient?.nom}`,
                            message: alert.desc,
                            urgency: 'urgent'
                        });
                    }
                });
            } catch (e) {
                console.error("Socket alert error:", e.message);
            }
        }

        res.status(201).json({ success: true, vital, alertsGenerated: abnormalAlerts.length });
    } catch (error) {
        console.error('[HOSPITALISATIONS VITALS] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur', details: error.message });
    }
});

// 8. POST /api/hospitalisations/:id/alerts — Saisie manuelle d'une alerte par la nurse
router.post('/:id/alerts', authenticateJWT, authorizeRole('nurse'), async (req, res) => {
    try {
        const { typeAlerte, description, urgency } = req.body;
        if (!typeAlerte) return res.status(400).json({ error: 'Type d\'alerte requis' });

        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, {
            ...byIdInClinic(req),
            include: [
                { model: Patient },
                { model: Medecin }    // ✅ charger Medecin pour userId
            ]
        }));
        if (!hosp) return res.status(404).json({ error: 'Hospitalisation non trouvée' });
        // Après le contrôle d'accès : une hospitalisation inaccessible reste un 404, quelle que soit la saisie
        if (!HospitalisationAlerte.getAttributes().typeAlerte.values.includes(typeAlerte)) return res.status(400).json({ error: 'Type d\'alerte invalide' });
        if (urgency && !HospitalisationAlerte.getAttributes().urgency.values.includes(urgency)) return res.status(400).json({ error: 'Urgence invalide' });

        const alerte = await HospitalisationAlerte.create({
            hospitalisationId: hosp.id,
            typeAlerte,
            description,
            urgency: urgency || 'urgent',
            statut: 'active'
        });

        // ✅ Notifier le médecin via son User.id
        try {
            import('../../index.js').then(({ clinicSocket }) => {
                const medecinUserId = hosp.Medecin?.userId || hosp.Medecin?.user_id;
                if (medecinUserId) {
                    clinicSocket?.emitToUser(medecinUserId, 'hosp_alert', {
                        id: hosp.id,
                        patientNom: `${hosp.Patient?.prenom} ${hosp.Patient?.nom}`,
                        message: `${typeAlerte.toUpperCase()} : ${description || ''}`,
                        urgency: urgency || 'urgent'
                    });
                }
            });
        } catch (e) {
            console.error("Socket alert error:", e.message);
        }

        res.status(201).json(alerte);
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 9. POST /api/hospitalisations/:id/soins — Saisie d'un soin par la nurse
router.post('/:id/soins', authenticateJWT, authorizeRole('nurse'), async (req, res) => {
    try {
        const { typeSoin, notes } = req.body;
        if (!typeSoin) return res.status(400).json({ error: 'Type de soin requis' });

        const hosp = await Hospitalisation.findOne(await accessQuery(req, Hospitalisation, byIdInClinic(req)));
        if (!hosp) return res.status(404).json({ error: 'Hospitalisation non trouvée' });

        const soin = await HospitalisationSoin.create({
            hospitalisationId: hosp.id,
            typeSoin,
            notes,
            realisePar: req.user.id
        });

        res.status(201).json(soin);
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 14. PUT /api/hospitalisations/alertes/:id/resolve — Résoudre une alerte (Médecin)
router.put('/alertes/:id/resolve', authenticateJWT, authorizeRole('doctor'), async (req, res) => {
    try {
        const alerte = await HospitalisationAlerte.findOne({
            where: { id: req.params.id },
            include: [{ model: Hospitalisation, attributes: [], ...(await accessQuery(req, Hospitalisation)), required: true }]
        });
        if (!alerte) return res.status(404).json({ error: 'Alerte non trouvée' });

        await alerte.update({
            statut: 'resolue',
            resoluAt: new Date(),
            resoluPar: req.user.id
        });

        res.json({ success: true, message: 'Alerte résolue' });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

export default router;

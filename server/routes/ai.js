import { Router } from 'express';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import { streamIA } from '../services/aiService.js';
import { PATIENT_SUMMARY_PROMPT } from '../services/promptTemplates.js';
import { patientSummary, chatPrompt } from '../services/clinicalAiContext.js';
import { patientAccess } from '../services/patientAccess.js';
const router = Router();


// ============================================================
// POST /api/ai/patient-summary — Résumé automatique (SSE streaming)
// ============================================================
router.post('/patient-summary', authenticateJWT, authorizeRole('doctor'), patientAccess('ai'), async (req, res, next) => {
    try {
    const { patientId } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId requis' });

    const patientData = await patientSummary(req, patientId);
    if (!patientData) return res.status(404).json({ error: 'Patient non trouvé' });

    console.log(`[IA] Résumé patient ${patientId} demandé par ${req.user.name}`);

    const userMessage = `Génère un résumé clinique pré-consultation pour ce patient :\n${JSON.stringify(patientData, null, 2)}`;

    await streamIA(res, PATIENT_SUMMARY_PROMPT, [{ role: 'user', content: userMessage }]);
    } catch (err) { next(err); }
});

// ============================================================
// POST /api/ai/chat — Chatbot multi-rôles (SSE streaming)
// ============================================================
router.post('/chat', authenticateJWT, authorizeRole('doctor', 'secretary', 'pharmacist'), patientAccess('ai'), async (req, res, next) => {
    const { message, context, conversationHistory } = req.body;
    if (!message) return res.status(400).json({ error: 'message requis' });

    const role = req.user.role;
    const userName = req.user.name;

    console.log(`[IA Chat] ${role} ${userName}: "${message.substring(0, 50)}..."`);

    // Construire le system prompt adapté au rôle et au contexte
    let systemPrompt;
    try { systemPrompt = await chatPrompt(req, {
        ...context,
        userId: req.user.id
    }); } catch (err) { return next(err); }

    // Construire l'historique de conversation
    const messages = [
        ...(conversationHistory || []),
        { role: 'user', content: message }
    ];

    await streamIA(res, systemPrompt, messages);
});

// Ancienne API retirée : la CIN est lue localement par Tesseract.js.
router.post('/ocr-cin', authenticateJWT, authorizeRole('secretary'), (_req, res) => {
    res.status(410).json({ code: 'OCR_LOCAL', error: 'Utilisez la lecture locale Tesseract.js du formulaire patient.' });
});

export default router;

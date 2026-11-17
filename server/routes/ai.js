import { Router } from 'express';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import { streamIA, aiConfiguration, aiFailure, getAiClient, MODEL } from '../services/aiService.js';
import { PATIENT_SUMMARY_PROMPT } from '../services/promptTemplates.js';
import { patientSummary, chatPrompt } from '../services/clinicalAiContext.js';
import { patientAccess } from '../services/patientAccess.js';
const router = Router();

const OCR_INDISPONIBLE = "Lecture automatique de la CIN indisponible : la clé de l'API d'IA (ANTHROPIC_API_KEY) n'est pas configurée ou est invalide. Saisissez les informations à la main.";

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

// ============================================================
// POST /api/ai/ocr-cin — Extraction OCR de la carte CIN par l'IA
// ============================================================
router.post('/ocr-cin', authenticateJWT, authorizeRole('secretary'), async (req, res) => {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
        return res.status(400).json({ error: 'Image en base64 requise' });
    }

    try {
        if (!aiConfiguration().configured) return res.status(503).json({ error: OCR_INDISPONIBLE, code: 'AI_NOT_CONFIGURED' });
    } catch (error) { return res.status(error.status).json({ error: error.message, code: error.code }); }

    console.log(`[IA OCR] Extraction CIN demandée par ${req.user.name}`);

    const systemPrompt = `Tu es un expert en lecture de documents d'identité marocains (CIN - Carte d'Identité Nationale).
Tu reçois une photo d'une carte d'identité nationale marocaine (recto).
Tu dois extraire les informations suivantes et les retourner UNIQUEMENT en JSON, sans texte avant ni après :

{
  "cin": "Numéro CIN (lettres + chiffres, situé en bas à droite sous la photo, ex: AB123456)",
  "nom": "Nom de famille (situé généralement au-dessus de 'Né le', ex: EL ALAOUI)",
  "prenom": "Prénom (situé généralement au-dessus du nom de famille, ex: MOHAMED YASSINE)",
  "nomAr": "Nom en arabe (situé à droite du nom)",
  "prenomAr": "Prénom en arabe (situé à droite du prénom)",
  "dateNaissance": "Date de naissance extraite après 'Né le' (format YYYY-MM-DD)",
  "lieuNaissance": "Lieu de naissance extrait après 'à ' (ex: AGADIR IDA OUTANANE)",
  "sexe": "M ou F seulement si explicitement indiqué sur le document, sinon null. Ne jamais le déduire du prénom ou de la photo.",
  "adresse": null,
  "dateExpiration": "Date extraite après 'Valable jusqu'au' (format YYYY-MM-DD)",
  "confiance": 0.95
}

RÈGLES :
- Si un champ n'est pas lisible, mets null
- Convertis toujours les dates du format DD.MM.YYYY vers YYYY-MM-DD.
- Le champ "confiance" est un score entre 0 et 1 indiquant ta confiance globale dans l'extraction.
- L'adresse se trouve au verso, donc mets null pour le recto.
- Retourne UNIQUEMENT le JSON valid, rien d'autre`;

    try {
        const response = await getAiClient().messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mimeType || 'image/jpeg',
                            data: imageBase64,
                        }
                    },
                    {
                        type: 'text',
                        text: 'Extrais toutes les informations de cette carte d\'identité nationale marocaine. Retourne uniquement le JSON.'
                    }
                ]
            }],
        });

        const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
        if (!text.trim() || response.stop_reason === 'max_tokens') {
            return res.status(502).json({ error: 'La lecture automatique a retourné une réponse vide ou incomplète. Vérifiez les champs manuellement.', code: 'AI_INVALID_RESPONSE' });
        }
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            console.log(`[IA OCR] Extraction réussie — CIN: ${data.cin}, Nom: ${data.nom} ${data.prenom}, Confiance: ${data.confiance}`);
            res.json({ success: true, data });
        } else {
            res.json({ success: false, raw: text, error: 'Extraction non structurée' });
        }
    } catch (error) {
        const failure = aiFailure(error);

        // Clé API invalide ou refusée : service indisponible (ne jamais renvoyer de données fictives)
        if (failure.code === 'AI_AUTH_FAILED') {
            return res.status(503).json({ error: OCR_INDISPONIBLE, code: failure.code });
        }

        res.status(failure.status).json({ error: failure.message, code: failure.code });
    }
});

export default router;

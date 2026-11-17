import { Router } from 'express';
import { authenticateJWT, authorizeRole } from '../middleware/auth.js';
import { Op } from 'sequelize';
import { ProduitPharmacie } from '../models/index.js';
import { inClinic } from '../services/tenant.js';
const router = Router();

// GET /api/pharmacy/products
router.get('/products', authenticateJWT, authorizeRole('pharmacist'), async (req, res) => {
    try {
        const products = await ProduitPharmacie.findAll({ where: inClinic(req) });
        res.json(products.map(p => ({
            id: p.codeProduit,
            name: p.nomCommercial,
            dci: p.dci,
            form: p.forme,
            dosage: p.dosage,
            category: p.categorie,
            buyPrice: parseFloat(p.prixAchat) || 0,
            sellPrice: parseFloat(p.prixVente) || 0,
            stock: p.stockActuel,
            threshold: p.stockMinimum,
            active: p.actif,
        })));
    } catch (error) {
        console.error('[PHARMACY] Erreur :', error.message);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/pharmacy/products (Ajouter un nouveau produit)
router.post('/products', authenticateJWT, authorizeRole('pharmacist'), async (req, res) => {
    try {
        const { codeProduit, nomCommercial, forme, categorie, prixVente, stockActuel } = req.body;

        // Basic validation
        if (!codeProduit || !nomCommercial || !forme || !categorie) {
            return res.status(400).json({ error: 'Champs obligatoires manquants' });
        }

        const existing = await ProduitPharmacie.findOne({ where: inClinic(req, { codeProduit }) });
        if (existing) {
            return res.status(409).json({ error: 'Un produit avec ce code existe déjà' });
        }

        const newProduct = await ProduitPharmacie.create({
            clinic_id: req.user.clinic_id,
            codeProduit,
            dci: req.body.dci || 'N/A',
            nomCommercial,
            forme,
            dosage: req.body.dosage || 'N/A',
            categorie,
            prixAchat: req.body.prixAchat || 0,
            prixVente: prixVente || 0,
            stockMinimum: 20, // Toujours 20 comme demandé
            stockActuel: stockActuel || 0,
            actif: true
        });

        res.status(201).json({ success: true, product: newProduct });
    } catch (error) {
        console.error('[PHARMACY] Erreur création produit:', error.message);
        res.status(500).json({ error: 'Erreur serveur lors de la création' });
    }
});

// DELETE /api/pharmacy/products/:code (Supprimer un produit)
router.delete('/products/:code', authenticateJWT, authorizeRole('pharmacist'), async (req, res) => {
    try {
        const product = await ProduitPharmacie.findOne({ where: inClinic(req, { codeProduit: req.params.code }) });
        if (!product) return res.status(404).json({ error: 'Produit non trouvé' });

        await product.destroy();
        res.json({ success: true, message: 'Produit supprimé avec succès' });
    } catch (error) {
        console.error('[PHARMACY] Erreur suppression:', error.message);
        res.status(500).json({ error: 'Erreur serveur lors de la suppression' });
    }
});

// GET /api/pharmacy/stock
router.get('/stock', authenticateJWT, authorizeRole('pharmacist', 'doctor'), async (req, res) => {
    try {
        // ?search= : nom commercial ou DCI (ConsultationPage vérifie le stock d'un médicament prescrit)
        const search = String(req.query.search || '').trim();
        const where = inClinic(req, search ? { [Op.or]: [
            { nomCommercial: { [Op.like]: `%${search}%` } },
            { dci: { [Op.like]: `%${search}%` } }
        ] } : {});
        const products = await ProduitPharmacie.findAll({ where });
        res.json(products.map(p => ({
            id: p.codeProduit,
            name: p.nomCommercial,
            dci: p.dci,
            form: p.forme,
            dosage: p.dosage,
            category: p.categorie,
            stock: p.stockActuel,
            threshold: p.stockMinimum,
            buyPrice: parseFloat(p.prixAchat) || 0,
            sellPrice: parseFloat(p.prixVente) || 0,
            alert: p.stockActuel < p.stockMinimum ? 'RUPTURE_IMMINENTE' : p.stockActuel === 0 ? 'RUPTURE' : 'OK',
        })));
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/pharmacy/stock/:code (Ajuster le stock)
router.post('/stock/:code', authenticateJWT, authorizeRole('pharmacist'), async (req, res) => {
    try {
        const { quantity } = req.body;
        if (!quantity || isNaN(quantity)) return res.status(400).json({ error: 'Quantité invalide' });

        const product = await ProduitPharmacie.findOne({ where: inClinic(req, { codeProduit: req.params.code }) });
        if (!product) return res.status(404).json({ error: 'Produit non trouvé' });

        const nouveauStock = Math.max(0, product.stockActuel + parseInt(quantity, 10));
        await product.update({ stockActuel: nouveauStock });

        res.json({ success: true, stock: nouveauStock });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/pharmacy/alerts
router.get('/alerts', authenticateJWT, authorizeRole('pharmacist'), async (req, res) => {
    try {
        const products = await ProduitPharmacie.findAll({ where: inClinic(req) });
        const lowStock = products.filter(p => p.stockActuel < p.stockMinimum).map(p => ({
            id: p.codeProduit, name: p.nomCommercial, dci: p.dci, stock: p.stockActuel, threshold: p.stockMinimum
        }));

        res.json({
            lowStock: lowStock.length,
            lowStockItems: lowStock,
            expiringSoon: 0,
            expiringItems: [],
            expired: 0,
            expiredItems: [],
            totalAlerts: lowStock.length
        });
    } catch {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/pharmacy/lots — Placeholder
router.get('/lots', authenticateJWT, authorizeRole('pharmacist'), (req, res) => {
    res.json([]);
});

// GET /api/pharmacy/dispensations — Placeholder
router.get('/dispensations', authenticateJWT, authorizeRole('pharmacist'), (req, res) => {
    res.json([]);
});

export default router;

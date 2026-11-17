import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { formatMAD } from '../../utils/helpers';
import { Pill, Plus, Search, Filter, RefreshCcw, AlertCircle, X, Check, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function PharmacyStockPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('Tous');

    // Modal states
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [adjustQuantity, setAdjustQuantity] = useState('');
    const [adjusting, setAdjusting] = useState(false);

    const [showNewProductModal, setShowNewProductModal] = useState(false);
    const [savingProduct, setSavingProduct] = useState(false);

    // Delete state
    const [productToDelete, setProductToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const initialProductState = {
        codeProduit: '', nomCommercial: '', forme: 'comprime',
        categorie: 'Antibiotique', prixVente: '', stockActuel: 0
    };
    const [newProductData, setNewProductData] = useState(initialProductState);

    const fetchStock = () => {
        setLoading(true);
        api.get('/pharmacy/stock').then(r => setProducts(r.data)).catch(() => { }).finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchStock();
    }, []);

    const handleDeleteProduct = async () => {
        if (!productToDelete) return;
        setDeleting(true);
        try {
            await api.delete(`/pharmacy/products/${productToDelete.id}`);
            toast.success(`Le produit a été retiré du catalogue`);
            setProductToDelete(null);
            fetchStock();
        } catch {
            toast.error("Erreur lors de la suppression du produit");
        } finally {
            setDeleting(false);
        }
    };

    const handleAjusterStock = async () => {
        if (!adjustQuantity || isNaN(adjustQuantity) || Number(adjustQuantity) === 0) {
            toast.error("Veuillez entrer une quantité valide");
            return;
        }
        setAdjusting(true);
        try {
            await api.post(`/pharmacy/stock/${selectedProduct.id}`, { quantity: Number(adjustQuantity) });
            toast.success(`Stock de ${selectedProduct.name} mis à jour avec succès !`);
            setSelectedProduct(null);
            setAdjustQuantity('');
            fetchStock();
        } catch {
            toast.error("Erreur lors de la mise à jour du stock");
        } finally {
            setAdjusting(false);
        }
    };

    const handleAddProduct = async () => {
        const { codeProduit, nomCommercial, forme, categorie } = newProductData;
        if (!codeProduit || !nomCommercial || !forme || !categorie) {
            toast.error("Veuillez remplir les champs obligatoires (*)");
            return;
        }
        setSavingProduct(true);
        try {
            await api.post('/pharmacy/products', {
                ...newProductData,
                prixVente: Number(newProductData.prixVente) || 0,
                stockActuel: Number(newProductData.stockActuel) || 0,
                stockMinimum: 20 // Default stock minimum
            });
            toast.success("Nouveau produit ajouté au catalogue !");
            setShowNewProductModal(false);
            setNewProductData(initialProductState);
            fetchStock();
        } catch (error) {
            toast.error(error.response?.data?.error || "Erreur lors de la création du produit");
        } finally {
            setSavingProduct(false);
        }
    };

    const lowStock = products.filter(p => p.alert === 'RUPTURE_IMMINENTE');
    
    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.id?.toString().includes(searchQuery.toLowerCase());
        const matchesFilter = activeFilter === 'Tous' || p.category === activeFilter;
        return matchesSearch && matchesFilter;
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title">Stock & Médicaments</h1>
                    <p className="text-muted text-sm mt-1">Gestion du catalogue produits et niveaux de stock.</p>
                </div>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition"><RefreshCcw size={16} /></button>
                    <button onClick={() => setShowNewProductModal(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition shadow-md shadow-primary/25">
                        <Plus size={18} /> Nouveau produit
                    </button>
                </div>
            </div>

            {/* Alerte */}
            {lowStock.length > 0 && (
                <div className="bg-danger-light border border-danger/30 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
                    <AlertCircle size={22} className="text-danger mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold text-danger uppercase">Alertes de stock ({lowStock.length})</h3>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">{lowStock.length} articles sous le seuil d'alerte.</p>
                    </div>
                </div>
            )}

            {/* Toolbar & Filtres */}
            <div className="flex flex-col gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-4 shadow-sm">
                    <div className="relative flex-1 max-w-md">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-gray-50" 
                            placeholder="Rechercher (Nom, Code)..." 
                        />
                    </div>
                </div>

                {/* Filtres Catégories */}
                <div className="flex flex-wrap gap-2">
                    {['Tous', 'Antibiotique', 'Antalgique', 'Anti-inflammatoire', 'Antidiabétique', 'Gastro', 'Respiratoire', 'Cardiovasculaire', 'Consommable'].map(cat => (
                        <button 
                            key={cat}
                            onClick={() => setActiveFilter(cat)}
                            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition shadow-sm ${activeFilter === cat ? 'bg-primary text-white shadow-primary/30' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-muted">Chargement du stock...</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted uppercase">Code</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted uppercase">Produit</th>
                                <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted uppercase">Catégorie</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted uppercase">Stock</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted uppercase">Seuil</th>
                                <th className="px-5 py-3.5 text-center text-xs font-semibold text-muted uppercase">Statut</th>
                                <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted uppercase">Prix vente</th>
                                <th className="px-5 py-3.5 text-center text-xs font-semibold text-muted uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredProducts.map(p => (
                                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition">
                                    <td className="px-5 py-4 text-sm font-medium text-muted">{p.id}</td>
                                    <td className="px-5 py-4">
                                        <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                                        <div className="text-xs text-muted mt-0.5">{p.form}</div>
                                    </td>
                                    <td className="px-5 py-4 text-sm text-muted">{p.category}</td>
                                    <td className={`px-5 py-4 text-right text-lg font-bold ${p.stock < p.threshold ? 'text-danger' : 'text-success'}`}>{p.stock}</td>
                                    <td className="px-5 py-4 text-right text-sm text-muted">{p.threshold}</td>
                                    <td className="px-5 py-4 text-center">
                                        <span className={`badge ${p.alert === 'RUPTURE_IMMINENTE' ? 'badge-danger' : 'badge-success'}`}>
                                            {p.alert === 'RUPTURE_IMMINENTE' ? 'RUPTURE' : 'OK'}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-right text-sm font-medium">{formatMAD(p.sellPrice)}</td>
                                    <td className="px-5 py-4 text-center">
                                        <div className="flex justify-center items-center gap-2">
                                            <button onClick={() => setSelectedProduct(p)} className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-semibold transition" title="Ajuster le stock">
                                                Ajuster
                                            </button>
                                            <button onClick={() => setProductToDelete(p)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Supprimer le produit">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal Supression */}
            {productToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-gray-100">
                        <div className="p-5 text-center space-y-3">
                            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg">Supprimer le produit ?</h3>
                            <p className="text-sm text-muted">
                                Êtes-vous sûr de vouloir supprimer définitivement le produit <strong className="text-gray-900">{productToDelete.name}</strong> du catalogue ? Cette action est irréversible.
                            </p>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => setProductToDelete(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition hover:bg-gray-100 rounded-xl">Annuler</button>
                            <button onClick={handleDeleteProduct} disabled={deleting} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
                                {deleting ? 'Suppression...' : 'Oui, supprimer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal d'ajustement */}
            {selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100">
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Plus size={18} className="text-primary" /> Ajuster le stock
                            </h3>
                            <button onClick={() => setSelectedProduct(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"><X size={18} /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                <span className="text-xs font-semibold text-blue-600 uppercase">Produit sélectionné</span>
                                <div className="font-bold text-gray-900 mt-1">{selectedProduct.name}</div>
                                <div className="text-xs text-muted flex justify-between mt-1">
                                    <span>Stock Actuel: <strong className="text-gray-900">{selectedProduct.stock}</strong></span>
                                    <span>Seuil: {selectedProduct.threshold}</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-gray-700 block mb-2">Quantité à Mettre en Stock (Ajout)</label>
                                <input type="number" min="1" value={adjustQuantity} onChange={e => setAdjustQuantity(e.target.value)} placeholder="Ex: 50"
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition" />
                                <p className="text-xs text-muted mt-2">Le stock total sera de : <strong className="text-primary">{(selectedProduct.stock || 0) + (Number(adjustQuantity) || 0)}</strong></p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => setSelectedProduct(null)} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition hover:bg-gray-100 rounded-xl">Annuler</button>
                            <button onClick={handleAjusterStock} disabled={!adjustQuantity || adjusting} className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
                                {adjusting ? 'Mise à jour...' : <><Check size={16} /> Valider l'ajustement</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Nouveau Produit */}
            {showNewProductModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden border border-gray-100">
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Plus size={18} className="text-primary" /> Ajouter un nouveau produit
                            </h3>
                            <button onClick={() => setShowNewProductModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"><X size={18} /></button>
                        </div>
                        <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-1">Code Produit *</label>
                                    <input value={newProductData.codeProduit} onChange={e => setNewProductData({ ...newProductData, codeProduit: e.target.value })}
                                        placeholder="Ex: MED-1001" className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20" />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-1">Nom du Médicament *</label>
                                    <input value={newProductData.nomCommercial} onChange={e => setNewProductData({ ...newProductData, nomCommercial: e.target.value })}
                                        placeholder="Ex: Doliprane 1000mg" className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20" />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-1">Catégorie *</label>
                                    <select value={newProductData.categorie} onChange={e => setNewProductData({ ...newProductData, categorie: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20">
                                        <option value="Antibiotique">Antibiotique</option>
                                        <option value="Antalgique">Antalgique</option>
                                        <option value="Anti-inflammatoire">Anti-inflammatoire</option>
                                        <option value="Antidiabétique">Antidiabétique</option>
                                        <option value="Gastro">Gastro</option>
                                        <option value="Respiratoire">Respiratoire</option>
                                        <option value="Cardiovasculaire">Cardiovasculaire</option>
                                        <option value="Consommable">Consommable</option>
                                        <option value="Equipement">Equipement</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-1">Forme *</label>
                                    <select value={newProductData.forme} onChange={e => setNewProductData({ ...newProductData, forme: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary/20">
                                        <option value="comprime">Comprimé</option>
                                        <option value="sirop">Sirop</option>
                                        <option value="injectable">Injectable</option>
                                        <option value="pommade">Pommade</option>
                                        <option value="autre">Autre</option>
                                    </select>
                                </div>
                            </div>

                            <hr className="border-gray-100" />
                            <h4 className="font-semibold text-gray-900">Stock & Tarification</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-1">Prix de Vente</label>
                                    <input type="number" value={newProductData.prixVente} onChange={e => setNewProductData({ ...newProductData, prixVente: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="Ex: 25.00" />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 block mb-1">Stock Initial</label>
                                    <input type="number" value={newProductData.stockActuel} onChange={e => setNewProductData({ ...newProductData, stockActuel: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="Ex: 100" />
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center text-sm">
                            <span className="text-muted">ℹ️ Le seul d'alerte rupture est fixé à 20 par défaut.</span>
                            <div className="flex gap-3">
                                <button onClick={() => setShowNewProductModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition hover:bg-gray-100 rounded-xl">Annuler</button>
                                <button onClick={handleAddProduct} disabled={savingProduct} className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition disabled:opacity-50">
                                    {savingProduct ? 'Création...' : <><Check size={16} /> Créer</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

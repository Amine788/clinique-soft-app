import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { Bell, AlertTriangle, XCircle, AlertCircle, Package } from 'lucide-react';

export default function PharmacyAlertsPage() {
    const [alerts, setAlerts] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/pharmacy/alerts').then(r => setAlerts(r.data)).catch(() => { }).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="flex items-center justify-center h-64 text-muted">Chargement des alertes...</div>;
    if (!alerts) return <div className="text-center text-muted py-12">Erreur de chargement</div>;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="page-title">Alertes Pharmacie</h1>
                <p className="text-muted text-sm mt-1">Surveillance en temps réel des niveaux de stock et péremptions.</p>
            </div>

            {/* résumé des alertes */}
            <div className="grid grid-cols-3 gap-5">
                <div className="bg-white rounded-2xl border-l-4 border-danger border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center"><AlertCircle size={20} /></div>
                        <div>
                            <p className="text-sm text-muted font-medium">Ruptures imminentes</p>
                            <p className="text-3xl font-bold text-danger">{alerts.lowStock}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border-l-4 border-warning border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center"><AlertTriangle size={20} /></div>
                        <div>
                            <p className="text-sm text-muted font-medium">Péremptions proches</p>
                            <p className="text-3xl font-bold text-warning">{alerts.expiringSoon}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl border-l-4 border-gray-400 border border-gray-100 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center"><XCircle size={20} /></div>
                        <div>
                            <p className="text-sm text-muted font-medium">Lots expirés</p>
                            <p className="text-3xl font-bold text-gray-700">{alerts.expired}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Articles en rupture */}
            {alerts.lowStockItems?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                        <AlertCircle size={18} className="text-danger" />
                        <h2 className="font-semibold text-gray-900">Articles en rupture imminente</h2>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {alerts.lowStockItems.map(item => (
                            <div key={item.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center"><Package size={18} /></div>
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                                        <div className="text-xs text-muted">{item.id} • {item.dci}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-bold text-danger">{item.stock} unités</div>
                                    <div className="text-xs text-muted">Seuil : {item.threshold}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Lots expirant bientôt */}
            {alerts.expiringItems?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-warning" />
                        <h2 className="font-semibold text-gray-900">Lots expirant prochainement ({'<'}60 jours)</h2>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {alerts.expiringItems.map(lot => (
                            <div key={lot.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900">Lot {lot.lotNumber}</div>
                                    <div className="text-xs text-muted">Produit : {lot.productId} • Fournisseur : {lot.supplier}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-warning">Expire le {lot.expiryDate}</div>
                                    <div className="text-xs text-muted">{lot.quantity} unités</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

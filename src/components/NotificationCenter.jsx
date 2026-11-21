import React, { useEffect, useState } from 'react';
import { Bell, X, Check, AlertTriangle, Pill, Calendar, UserCheck, FileText, TrendingDown } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';

const ICONS = {
    appointment_created: Calendar,
    patient_arrived: UserCheck,
    new_prescription: Pill,
    prescription_ready: Check,
    consultation_done: FileText,
    stock_alert: TrendingDown,
    absence_request: Calendar,
    absence_decision: Calendar,
    default: Bell
};

const COLORS = {
    appointment_created: 'text-brand-500 bg-brand-50',
    patient_arrived: 'text-green-500 bg-green-50',
    new_prescription: 'text-purple-500 bg-purple-50',
    prescription_ready: 'text-green-600 bg-green-50',
    consultation_done: 'text-brand-600 bg-brand-50',
    stock_alert: 'text-red-500 bg-red-50',
    absence_request: 'text-orange-500 bg-orange-50',
    absence_decision: 'text-indigo-500 bg-indigo-50',
    default: 'text-gray-500 bg-gray-50'
};

export default function NotificationCenter() {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    const { connected } = useSocket({
        onAny: (type, data) => {
            if (type === 'user_online') return; // Ignorer
            const notif = {
                id: Date.now() + Math.random(),
                type,
                title: data.title || 'Notification',
                message: data.message || '',
                urgent: data.urgent || false,
                read: false,
                timestamp: data.timestamp || new Date().toISOString(),
                data
            };
            setNotifications(prev => [notif, ...prev].slice(0, 50)); // Max 50
            setUnread(prev => prev + 1);

            // Jouer un son si urgent
            if (data.urgent || data.sound) {
                try {
                    const ctx = new AudioContext();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = 880;
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.3);
                } catch { /* facultatif : l'échec est sans conséquence ici */ }
            }
        }
    });

    const markAllRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnread(0);
    };

    const removeNotif = (id) => {
        setNotifications(prev => {
            const n = prev.find(x => x.id === id);
            if (n && !n.read) setUnread(u => Math.max(0, u - 1));
            return prev.filter(x => x.id !== id);
        });
    };

    function timeAgo(ts) {
        const diff = Math.floor((now - new Date(ts)) / 1000);
        if (diff < 60) return 'À l\'instant';
        if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
        return `Il y a ${Math.floor(diff / 3600)}h`;
    }

    return (
        <div className="relative">
            {/* Bouton cloche */}
            <button
                onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
                className="relative p-2 rounded-xl hover:bg-gray-100 transition text-gray-600"
            >
                <Bell size={20} />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
                {connected && (
                    <span className="absolute bottom-1 right-1 w-2 h-2 bg-green-400 rounded-full" title="Temps réel actif" />
                )}
            </button>

            {/* Panneau notifications */}
            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-12 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-40 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <Bell size={16} className="text-primary" />
                                <span className="font-semibold text-gray-900 text-sm">Notifications</span>
                                {unread > 0 && (
                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">{unread}</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {notifications.length > 0 && (
                                    <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                                        Tout lire
                                    </button>
                                )}
                                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Liste */}
                        <div className="overflow-y-auto max-h-[420px]">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                                    <Bell size={32} className="opacity-30" />
                                    <p className="text-sm">Aucune notification</p>
                                    <p className="text-xs text-gray-300">
                                        {connected ? '🟢 Temps réel actif' : '🔴 Déconnecté'}
                                    </p>
                                </div>
                            ) : (
                                notifications.map(n => {
                                    const Icon = ICONS[n.type] || ICONS.default;
                                    const colorClass = COLORS[n.type] || COLORS.default;
                                    return (
                                        <div
                                            key={n.id}
                                            className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${!n.read ? 'bg-brand-50/30' : ''} ${n.urgent ? 'border-l-2 border-l-red-400' : ''}`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                                <Icon size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 leading-tight">{n.title}</p>
                                                {n.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>}
                                                <p className="text-[10px] text-gray-300 mt-1">{timeAgo(n.timestamp)}</p>
                                            </div>
                                            <button onClick={() => removeNotif(n.id)} className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5">
                                                <X size={13} />
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-2 border-t border-gray-50 flex items-center justify-between">
                            <span className="text-[10px] text-gray-300">
                                {connected ? '🟢 Connecté en temps réel' : '🔴 Hors ligne'}
                            </span>
                            {notifications.length > 0 && (
                                <button onClick={() => { setNotifications([]); setUnread(0); }} className="text-xs text-gray-400 hover:text-gray-600">
                                    Tout effacer
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

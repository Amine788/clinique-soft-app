// Formater un montant en MAD avec séparateur de milliers
export function formatMAD(amount) {
    return new Intl.NumberFormat('fr-MA', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amount) + ' MAD';
}

// Mentions « Libellé: valeur » d'un document (facture, ordonnance), sans les champs non renseignés :
// jamais de valeur par défaut, un document ne porte que les informations saisies par la clinique
export function mentions(paires, separateur = ' | ') {
    return paires.filter(([, valeur]) => valeur && String(valeur).trim()).map(([libelle, valeur]) => `${libelle}: ${valeur}`).join(separateur);
}

// Adresse absolue d'un fichier public du serveur (/uploads/logos/…) : en production le front et l'API
// sont sur deux domaines (VITE_API_URL) ; en local, le proxy Vite sert /uploads sur la même origine
export function urlPublique(chemin) {
    if (!chemin) return null;
    if (/^https?:\/\//.test(chemin)) return chemin;
    return new URL(chemin, import.meta.env.VITE_API_URL || window.location.origin).href;
}

// Formater une date en DD/MM/YYYY
export function formatDate(date) {
    if (typeof date === 'string') return date;
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Obtenir les menus de navigation selon le rôle
export function getMenuForRole(role) {
    const menus = {
        admin: [
            { name: 'Dashboard Direction', path: '/dashboard', icon: 'LayoutDashboard' },
            { name: 'Utilisateurs', path: '/admin/users', icon: 'Users' },
            { name: 'Ma Clinique', path: '/admin/clinic', icon: 'ClipboardList' },
            { name: 'Performance', path: '/admin/performance', icon: 'BarChart3' },
            { name: 'Absences médecins', path: '/absences', icon: 'CalendarOff' },
            { name: 'Réglages', path: '/admin/settings', icon: 'Settings' },
        ],

        doctor: [
            { name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
            { name: 'Mon Agenda', path: '/doctor/agenda', icon: 'Calendar' },
            { name: 'Patients', path: '/patients', icon: 'Users' },
            { name: 'Patients Hospitalisés', path: '/doctor/hospitalized', icon: 'Bed' },
            { name: 'Ordonnances', path: '/doctor/prescriptions', icon: 'Pill' },
            { name: 'Mes statistiques', path: '/doctor/stats', icon: 'BarChart3' },
            { name: 'Mes absences', path: '/doctor/absences', icon: 'CalendarOff' },
        ],
        pharmacist: [
            { name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
            { name: 'Ordonnances', path: '/pharmacy/dispensation', icon: 'ClipboardList' },
            { name: 'Stock', path: '/pharmacy/stock', icon: 'Pill' },
            { name: 'Alertes Stock', path: '/pharmacy/alerts', icon: 'Bell' },
            { name: 'Circuit médicament', path: '/medication-flow', icon: 'PackageCheck' },
        ],
        secretary: [
            { name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
            { name: 'Rendez-vous', path: '/appointments', icon: 'Calendar' },
            { name: 'Check-in patients', path: '/checkin', icon: 'UserCheck' },
            { name: 'Patients', path: '/patients', icon: 'Users' },
            { name: 'Admissions', path: '/secretary/admissions', icon: 'ClipboardList' },
            { name: 'Chambres', path: '/rooms', icon: 'Bed' },
            { name: 'Facturation', path: '/billing', icon: 'Receipt' },
            { name: 'Absences médecins', path: '/absences', icon: 'CalendarOff' },
        ],
        lab_technician: [
            { name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
            { name: 'Laboratoire / Radio', path: '/laboratory', icon: 'Microscope' },
        ],
        nurse: [
            { name: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
            { name: 'Patients Hospitalisés', path: '/nurse/hospitalized', icon: 'Bed' },
            { name: 'Prélèvements Labo', path: '/nurse/prelevements', icon: 'Microscope' },
            { name: 'Médicaments', path: '/nurse/medications', icon: 'ClipboardList' },
            { name: 'Constantes', path: '/nurse/qr', icon: 'QrCode' },
            { name: 'Circuit médicament', path: '/medication-flow', icon: 'PackageCheck' },
        ]
    };
    return menus[role] || menus.secretary;
}

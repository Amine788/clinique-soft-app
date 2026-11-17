import {
  BarChart3,
  BedDouble,
  BellRing,
  Building2,
  CalendarDays,
  ClipboardList,
  FileHeart,
  FlaskConical,
  Headphones,
  HeartPulse,
  KeyRound,
  Layers,
  Microscope,
  Pill,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  UserCog,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

/* ─── Navigation ─── */
export const navLinks = [
  { label: 'Fonctionnalités', href: '#features' },
  { label: 'Modules', href: '#modules' },
  { label: 'Espaces', href: '#roles' },
  { label: 'Sécurité', href: '#securite' },
  { label: 'FAQ', href: '#faq' },
];

/* ─── Coordonnées réelles ─── */
export const contact = {
  company: 'NEXTACT Solutions',
  address: ['Tassila, Agadir', 'Souss-Massa, Maroc'],
  mapUrl: 'https://maps.app.goo.gl/DBLMq5f87skY2RUW9',
  phone: '+212 660-406878',
  phoneHref: 'tel:+212660406878',
  email: 'support@nextact-solutions.com',
  website: 'nextact-solutions.com',
  websiteUrl: 'https://nextact-solutions.com/',
};

/* ─── Garanties du hero ─── */
export const heroGuarantees = ['Essai gratuit de 24 h', 'Aucune carte bancaire demandée', 'Données séparées pour chaque clinique'];

/* ─── Hero : étapes du parcours patient suivies dans l'application ─── */
export const heroJourney = [
  { icon: CalendarDays, label: 'Rendez-vous' },
  { icon: ScanLine, label: 'Accueil' },
  { icon: Stethoscope, label: 'Consultation' },
  { icon: FlaskConical, label: 'Examens' },
  { icon: Pill, label: 'Pharmacie' },
  { icon: Receipt, label: 'Facture' },
];

/* ─── Pour qui ─── */
export const audiences = [
  { title: 'Cliniques privées', desc: 'Consultations, hospitalisation, chambres et plateau technique sur une même plateforme.' },
  { title: 'Cabinets médicaux', desc: 'Agenda, dossier médical, ordonnances et facturation pour un ou plusieurs praticiens.' },
  { title: 'Services de laboratoire', desc: 'Demandes d’examens, prélèvements et résultats reliés au dossier du patient.' },
  { title: 'Pharmacies internes', desc: 'Stock, alertes de péremption et dispensation des ordonnances tracée.' },
];

/* ─── Modules regroupés par grande étape ─── */
export const moduleGroups = [
  {
    id: 'accueillir',
    label: 'Accueillir',
    tagline: 'Recevez chaque patient sans attente inutile.',
    modules: [
      { icon: CalendarDays, title: 'Agenda et rendez-vous', desc: 'Disponibilités des médecins, absences et planification des rendez-vous.' },
      { icon: ScanLine, title: 'Check-in par CIN ou QR code', desc: 'Lecture de la carte nationale pour enregistrer le patient, ou identification par QR code.' },
      { icon: Users, title: 'Patients et admissions', desc: 'Fiche patient, admissions et historique accessibles depuis l’accueil.' },
    ],
  },
  {
    id: 'soigner',
    label: 'Soigner',
    tagline: 'Gardez tout le suivi médical au même endroit.',
    modules: [
      { icon: FileHeart, title: 'Consultations et dossier médical', desc: 'Notes de consultation, antécédents et historique complet du patient.' },
      { icon: ClipboardList, title: 'Ordonnances', desc: 'Rédaction des ordonnances, transmises à la pharmacie.' },
      { icon: BedDouble, title: 'Hospitalisation et chambres', desc: 'Admissions, occupation des chambres et suivi des patients hospitalisés.' },
      { icon: Syringe, title: 'Soins infirmiers', desc: 'Administration des médicaments et prélèvements tracés.' },
    ],
  },
  {
    id: 'analyser',
    label: 'Analyser',
    tagline: 'Reliez le laboratoire au dossier du patient.',
    modules: [
      { icon: Microscope, title: 'Laboratoire', desc: 'Réception des demandes, saisie et validation des résultats.' },
      { icon: Sparkles, title: 'Assistant IA', desc: 'Aide à la lecture des ordonnances et alertes cliniques.' },
    ],
  },
  {
    id: 'delivrer',
    label: 'Délivrer',
    tagline: 'Maîtrisez le stock et chaque dispensation.',
    modules: [
      { icon: Pill, title: 'Stock de pharmacie', desc: 'Entrées, niveaux de stock et alertes de péremption ou de rupture.' },
      { icon: HeartPulse, title: 'Dispensation', desc: 'Délivrance des ordonnances avec traçabilité.' },
    ],
  },
  {
    id: 'gerer',
    label: 'Gérer',
    tagline: 'Pilotez la clinique et sa facturation.',
    modules: [
      { icon: Receipt, title: 'Facturation', desc: 'Factures PDF, encaissements et suivi des règlements en dirhams.' },
      { icon: UserCog, title: 'Administration', desc: 'Comptes du personnel, rôles et image de marque de la clinique.' },
      { icon: BarChart3, title: 'Performance', desc: 'Statistiques d’activité de la clinique et des médecins.' },
    ],
  },
];

/* ─── Sécurité : uniquement des mécanismes présents dans l'application ─── */
export const securityPoints = [
  { icon: KeyRound, title: 'Accès par rôle', desc: 'Chaque membre de l’équipe n’accède qu’aux pages et aux actions prévues pour son rôle.' },
  { icon: Building2, title: 'Données cloisonnées par clinique', desc: 'Chaque clinique dispose de son propre espace : ses patients et ses documents ne sont pas visibles par les autres.' },
  { icon: ShieldCheck, title: 'Connexions protégées', desc: 'Les mots de passe sont stockés sous forme hachée et chaque session est authentifiée par un jeton.' },
];

/* ─── Bande de confiance : points techniques vérifiables ─── */
export const trustItems = [
  { icon: Layers, title: 'Multi-tenant', desc: 'Un espace isolé par clinique' },
  { icon: Zap, title: 'Temps réel', desc: 'Notifications Socket.io' },
  { icon: ScanLine, title: 'OCR de la CIN', desc: 'Check-in en quelques secondes' },
  { icon: Receipt, title: 'Factures PDF', desc: 'Générées en un clic' },
  { icon: Users, title: '6 espaces métier', desc: 'Un accès par rôle' },
];

/*
 * ─── Fonctionnalités (bento) ───
 * size : 'hero' (2×2 sur desktop) | 'wide' (2×1) | 'sm' (1×1)
 */
export const features = [
  {
    id: 'ocr',
    size: 'hero',
    icon: ScanLine,
    title: 'Check-in patient par OCR de la CIN',
    desc: 'Scannez la carte nationale : nom, prénom, numéro de CIN et date de naissance sont lus automatiquement (Tesseract.js). Le patient est enregistré sans saisie, ou retrouvé par QR code.',
  },
  {
    id: 'realtime',
    size: 'wide',
    icon: BellRing,
    title: 'Notifications en temps réel',
    desc: 'Arrivée d’un patient, résultat de labo prêt, alerte de stock : chaque poste est prévenu instantanément grâce à Socket.io.',
  },
  {
    id: 'agenda',
    size: 'sm',
    icon: CalendarDays,
    title: 'Agenda & rendez-vous',
    desc: 'Disponibilités des médecins, absences et rappels automatiques des patients.',
  },
  {
    id: 'record',
    size: 'sm',
    icon: FileHeart,
    title: 'Dossier médical',
    desc: 'Consultations, ordonnances, hospitalisations et historique complet au même endroit.',
  },
  {
    id: 'pharmacy',
    size: 'sm',
    icon: Pill,
    title: 'Pharmacie',
    desc: 'Stock, alertes de péremption et dispensation tracée des ordonnances.',
  },
  {
    id: 'lab',
    size: 'sm',
    icon: FlaskConical,
    title: 'Laboratoire',
    desc: 'Prélèvements, saisie des résultats et liaison directe au dossier patient.',
  },
  {
    id: 'billing',
    size: 'sm',
    icon: Receipt,
    title: 'Facturation PDF',
    desc: 'Factures et encaissements, documents PDF générés en un clic et prêts à imprimer.',
  },
  {
    id: 'ai',
    size: 'sm',
    icon: Sparkles,
    title: 'Assistant IA',
    desc: 'Aide à la lecture des ordonnances et alertes cliniques proactives.',
  },
  {
    id: 'admin',
    size: 'wide',
    icon: Building2,
    title: 'Centre d’administration',
    desc: 'Image de marque, personnel, rôles, statistiques de performance et modules actifs : toute la clinique pilotée depuis un seul tableau de bord.',
  },
  {
    id: 'install',
    size: 'sm',
    icon: Wrench,
    title: 'Installation & réseau',
    desc: 'Déploiement sur site, configuration du matériel, mise en réseau et sécurisation locale.',
  },
  {
    id: 'support',
    size: 'sm',
    icon: Headphones,
    title: 'Support & formation',
    desc: 'Assistance réactive, mises à jour continues et formation de votre personnel.',
  },
];

/* ─── Espaces par rôle ─── */
export const roles = [
  {
    id: 'doctor',
    image: 'role-medecin',
    alt: 'Médecin au téléphone, travaillant sur son ordinateur portable',
    label: 'Médecin',
    icon: Stethoscope,
    summary: 'Tout le parcours de consultation, du rendez-vous à l’ordonnance.',
    actions: [
      'Consulter son agenda et déclarer ses absences',
      'Rédiger consultations et ordonnances dans le dossier',
      'Suivre ses patients hospitalisés et ses statistiques',
    ],
  },
  {
    id: 'secretary',
    image: 'role-secretaire',
    alt: 'Secrétaire souriante au guichet d’accueil, devant son ordinateur',
    label: 'Secrétaire',
    icon: ClipboardList,
    summary: 'L’accueil, les rendez-vous et la caisse sans papier.',
    actions: [
      'Enregistrer un patient en scannant sa CIN',
      'Planifier et déplacer les rendez-vous',
      'Générer et encaisser les factures PDF',
    ],
  },
  {
    id: 'nurse',
    image: 'role-infirmier',
    alt: 'Infirmière en tenue avec un stéthoscope, dans une chambre',
    label: 'Infirmier',
    icon: HeartPulse,
    summary: 'Les soins et les prélèvements suivis en temps réel.',
    actions: [
      'Identifier un patient par QR code',
      'Tracer l’administration des médicaments',
      'Réaliser et transmettre les prélèvements',
    ],
  },
  {
    id: 'lab',
    image: 'role-laboratoire',
    alt: 'Technicienne de laboratoire utilisant des automates d’analyse',
    label: 'Laboratoire',
    icon: Microscope,
    summary: 'Les analyses reliées directement au dossier médical.',
    actions: [
      'Recevoir les demandes d’examens',
      'Saisir et valider les résultats',
      'Notifier le médecin dès que c’est prêt',
    ],
  },
  {
    id: 'pharmacist',
    image: 'role-pharmacien',
    alt: 'Pharmacienne prenant une boîte de médicament sur une étagère',
    label: 'Pharmacien',
    icon: Pill,
    summary: 'Un stock maîtrisé et une dispensation traçable.',
    actions: [
      'Gérer le stock et les entrées',
      'Recevoir les alertes de péremption et de rupture',
      'Dispenser les ordonnances avec traçabilité',
    ],
  },
  {
    id: 'admin',
    image: 'role-administrateur',
    alt: 'Responsable travaillant sur son ordinateur, diplômes au mur',
    label: 'Administrateur',
    icon: UserCog,
    summary: 'La vue d’ensemble et le contrôle de toute la clinique.',
    actions: [
      'Créer les comptes et attribuer les rôles',
      'Personnaliser l’image de marque',
      'Suivre l’activité et les indicateurs clés',
    ],
  },
];

/* ─── Comment ça marche : le parcours d'une information, illustré étape par étape ─── */
export const steps = [
  {
    title: 'Rendez-vous',
    desc: 'Le rendez-vous est pris dans l’agenda du médecin, selon ses disponibilités et ses absences. Le secrétariat voit en un coup d’œil les créneaux libres de chaque praticien.',
    modules: ['Agenda', 'Disponibilités', 'Absences'],
    image: 'etape-rendez-vous',
    alt: 'Ordinateur portable et smartphone affichant un planning de rendez-vous',
  },
  {
    title: 'Accueil',
    desc: 'À son arrivée, le patient est enregistré en lisant sa carte nationale ou son QR code. Sa fiche s’ouvre aussitôt, et le médecin est prévenu de son arrivée.',
    modules: ['Check-in CIN', 'QR code', 'Admissions'],
    image: 'etape-accueil',
    alt: 'Équipe soignante échangeant au comptoir d’accueil d’une clinique',
  },
  {
    title: 'Consultation',
    desc: 'Le médecin retrouve l’historique du patient, complète le dossier médical, rédige l’ordonnance et demande les examens nécessaires, sans ressaisir les informations de l’accueil.',
    modules: ['Dossier médical', 'Ordonnances', 'Demandes d’examens'],
    image: 'etape-consultation',
    alt: 'Médecin en consultation avec un patient à son bureau',
  },
  {
    title: 'Examens et traitements',
    desc: 'Le laboratoire reçoit les demandes et saisit les résultats, l’infirmerie trace les soins et les prélèvements, la pharmacie délivre l’ordonnance. Chaque réponse rejoint le dossier du patient.',
    modules: ['Laboratoire', 'Soins infirmiers', 'Pharmacie'],
    image: 'etape-examens',
    alt: 'Main gantée déposant un échantillon à la pipette dans un portoir de tubes',
  },
  {
    title: 'Facturation',
    desc: 'La facture est générée à partir des actes réalisés, en dirhams, au format PDF. L’encaissement est enregistré et le suivi des règlements reste à jour.',
    modules: ['Facture PDF', 'Encaissement', 'Suivi des règlements'],
    image: 'etape-facturation',
    alt: 'Paiement par carte sur un terminal de paiement',
  },
];

/*
 * ─── Témoignages ───
 * Exemples illustratifs : à remplacer par de vrais retours clients
 * (passer `isExample` à false pour masquer le libellé « exemple »).
 */
export const testimonialsAreExamples = true;
export const testimonials = [
  {
    author: 'Médecin généraliste',
    place: 'Casablanca',
    initials: 'MG',
    text: 'Je passe moins de temps sur l’administratif et plus de temps avec mes patients. L’agenda et le dossier au même endroit changent tout.',
  },
  {
    author: 'Secrétaire médicale',
    place: 'Rabat',
    initials: 'SM',
    text: 'Avant, tout était sur papier. Aujourd’hui l’accueil, les rendez-vous et les factures sont centralisés : je gagne un temps considérable chaque jour.',
  },
  {
    author: 'Directeur de clinique',
    place: 'Marrakech',
    initials: 'DC',
    text: 'Pour une structure multi-praticiens, avoir un espace par rôle et des tableaux de bord de performance, c’est exactement ce qu’il nous fallait.',
  },
];

/* ─── Tarifs ─── */
export const plans = [
  {
    id: 'trial',
    name: 'Essai',
    price: '0',
    period: 'DH / 24 heures',
    desc: 'Pour découvrir la plateforme sans engagement.',
    highlight: false,
    features: ['Création instantanée', 'Accès complet 24h', 'Toutes les fonctionnalités', 'Email de bienvenue', 'Suspendu après 24h sans paiement'],
    cta: 'Tester gratuitement',
    action: { href: '#demo' },
  },
  {
    id: 'annual',
    name: 'Abonnement Annuel',
    price: '2 000',
    period: 'MAD / an',
    desc: 'Pour les cabinets et cliniques qui passent au numérique.',
    highlight: true,
    features: ['Médecins & patients illimités', 'Pharmacie intégrée', 'Facturation avancée', 'Confirmations par email', 'Support prioritaire', 'Sans interruption de service'],
    cta: 'S’abonner maintenant',
    action: { to: '/register' },
  },
  {
    id: 'clinic',
    name: 'Clinique',
    price: 'Sur devis',
    period: '',
    desc: 'Pour les groupes et établissements multi-sites.',
    highlight: false,
    features: ['Multi-branches', 'IA & Analyse avancée', 'Intégrations sur mesure', 'Formation & Onboarding', 'Account Manager dédié'],
    cta: 'Nous contacter',
    action: { to: '/register' },
  },
];

/* ─── FAQ ─── */
export const faqs = [
  { q: 'Mes données sont-elles sécurisées ?', a: 'Absolument. Toutes les données sont chiffrées (AES-256), hébergées sur des serveurs certifiés et conformes aux réglementations médicales marocaines. Sauvegardes automatiques quotidiennes.' },
  { q: 'Puis-je importer mes données existantes ?', a: 'Oui, notre équipe technique vous accompagne pour migrer vos données depuis n\'importe quel format (Excel, logiciels concurrents, dossiers papier scannés).' },
  { q: 'Y a-t-il une formation incluse ?', a: 'Chaque abonnement inclut une session d\'onboarding en visioconférence.' },
  { q: 'Fonctionne-t-il sur mobile ?', a: 'NextClinic est entièrement responsive et fonctionne sur tous les appareils : PC, tablette et smartphone. Application mobile native en cours de développement.' },
  { q: 'Comment fonctionne l\'essai gratuit ?', a: 'La création de votre clinique est gratuite et immédiate. Vous disposez de 24 heures d\'accès complet pour tester la plateforme. Passé ce délai, l\'accès est suspendu tant que l\'abonnement n\'est pas réglé. Vous pouvez payer à tout moment pendant ou après l\'essai pour réactiver votre espace sans perdre vos données.' },
  { q: 'Puis-je annuler à tout moment ?', a: 'Oui, sans engagement ni frais de résiliation. Vous pouvez exporter toutes vos données avant de partir.' },
];

/* ─── Section démo : arguments ─── */
export const demoPerks = [
  { icon: ShieldCheck, title: '24 heures d’essai gratuit', desc: 'Accès complet immédiat, aucune carte bancaire requise' },
  { icon: BellRing, title: 'Email de bienvenue instantané', desc: 'Lien d’activation envoyé dès la création de votre clinique' },
];


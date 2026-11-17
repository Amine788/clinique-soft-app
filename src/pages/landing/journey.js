import {
  CalendarDays,
  ScanLine,
  Stethoscope,
  FlaskConical,
  Pill,
  HeartPulse,
  Receipt,
  LayoutDashboard,
} from 'lucide-react';

/*
 * ─── « Le dossier qui voyage » ───
 * Parcours d'un dossier patient à travers les services. Chaque étape montre une capture réelle
 * de l'ERP (base de démonstration, patients fictifs) : public/images/landing/parcours/<image>-{720,1440}.webp.
 *
 * - `node` : position du service sur le plan (repère 0-100 en largeur, 0-130 en hauteur).
 * - `hotspots` : repères numérotés posés sur la capture (positions en % de l'image 1440 × 900).
 * - `events` : ce que l'ERP transmet aux autres services à cette étape (« En coulisse »).
 */
export const journeySteps = [
  {
    id: 'rdv',
    service: 'Secrétariat',
    module: 'Agenda & rendez-vous',
    icon: CalendarDays,
    node: { x: 18, y: 14 },
    image: 'rdv',
    title: 'Le rendez-vous est pris',
    desc: 'La secrétaire réserve un créneau dans l’agenda du médecin. Les absences déclarées bloquent automatiquement la période.',
    hotspots: [
      { x: 92.5, y: 13.7, text: 'Nouveau rendez-vous selon les disponibilités du médecin ; ses absences bloquent la période.' },
      { x: 67.4, y: 43.7, text: 'Chaque rendez-vous apparaît dans la semaine, avec son motif et son médecin.' },
    ],
    events: [{ to: 'Médecin', text: 'Agenda du médecin mis à jour' }],
  },
  {
    id: 'accueil',
    service: 'Accueil',
    module: 'Check-in patients',
    icon: ScanLine,
    node: { x: 82, y: 14 },
    image: 'accueil',
    title: 'Le patient est accueilli',
    desc: 'À l’arrivée, le patient est pointé par sa carte nationale ou par le QR code de son dossier, puis il passe en salle d’attente.',
    hotspots: [
      { x: 32.6, y: 26.2, text: 'Pointage par numéro de CIN ou par scan du QR code du dossier.' },
      { x: 85.4, y: 22.3, text: 'La salle d’attente se met à jour en temps réel chez le médecin.' },
    ],
    events: [
      { to: 'Médecin', text: 'Patient arrivé · salle d’attente' },
      { to: 'Infirmerie', text: 'Patient à préparer avant la consultation' },
    ],
  },
  {
    id: 'consultation',
    service: 'Médecin',
    module: 'Dossier médical',
    icon: Stethoscope,
    node: { x: 82, y: 46 },
    image: 'consultation',
    title: 'Le médecin ouvre le dossier',
    desc: 'Le médecin retrouve l’identité, les allergies, les constantes et l’historique du patient, puis prescrit les médicaments et les examens.',
    hotspots: [
      { x: 29.3, y: 44.7, text: 'Allergies et maladies chroniques visibles dès l’ouverture du dossier.' },
      { x: 30.9, y: 67.2, text: 'Constantes saisies par l’infirmerie, avec leur historique.' },
    ],
    events: [
      { to: 'Pharmacie', text: 'Nouvelle ordonnance dans la file' },
      { to: 'Laboratoire', text: 'Nouvelle demande d’examen' },
    ],
  },
  {
    id: 'labo',
    service: 'Laboratoire',
    module: 'Laboratoire & radiologie',
    icon: FlaskConical,
    node: { x: 18, y: 46 },
    image: 'labo',
    title: 'Le laboratoire traite la demande',
    desc: 'La demande arrive au laboratoire. L’infirmerie réalise le prélèvement, puis le résultat est saisi et rejoint le dossier du patient.',
    hotspots: [
      { x: 77.4, y: 40.2, text: 'Chaque demande suit son statut, jusqu’au résultat et à sa facturation.' },
      { x: 93.1, y: 60, text: 'Le prélèvement est confié à l’infirmerie avant l’analyse.' },
    ],
    events: [
      { to: 'Infirmerie', text: 'Prélèvement à réaliser' },
      { to: 'Médecin', text: 'Résultat disponible dans le dossier' },
    ],
  },
  {
    id: 'pharmacie',
    service: 'Pharmacie',
    module: 'File d’ordonnances',
    icon: Pill,
    node: { x: 18, y: 78 },
    image: 'pharmacie',
    title: 'La pharmacie prépare l’ordonnance',
    desc: 'Les ordonnances arrivent en temps réel dans la file de la pharmacie. La préparation met à jour le stock et prévient le médecin.',
    hotspots: [
      { x: 35.2, y: 54.1, text: 'Ordonnance reçue du médecin, avec diagnostic et posologie.' },
      { x: 59.7, y: 76.3, text: 'Un clic : l’ordonnance est prête et le médecin est notifié.' },
    ],
    events: [
      { to: 'Médecin', text: 'Ordonnance prête' },
      { to: 'Infirmerie', text: 'Médicaments remis · prises planifiées' },
    ],
  },
  {
    id: 'soins',
    service: 'Infirmerie',
    module: 'Patients hospitalisés',
    icon: HeartPulse,
    node: { x: 82, y: 78 },
    image: 'constantes',
    title: 'L’infirmerie administre et surveille',
    desc: 'L’infirmière valide chaque prise de médicament et saisit les constantes. Une valeur anormale déclenche une alerte chez le médecin.',
    hotspots: [
      { x: 58.5, y: 51.2, text: 'Chaque prise est validée et horodatée, créneau par créneau.' },
      { x: 54.7, y: 80.3, text: 'Une constante anormale envoie automatiquement une alerte au médecin.' },
    ],
    events: [{ to: 'Médecin', text: 'Alerte si une constante est anormale', tone: 'alert' }],
  },
  {
    id: 'facture',
    service: 'Facturation',
    module: 'Facturation',
    icon: Receipt,
    node: { x: 82, y: 110 },
    image: 'facture',
    title: 'La facture se prépare seule',
    desc: 'La secrétaire saisit la CIN : médicaments, examens et nuits d’hospitalisation sont repris automatiquement, TVA comprise.',
    hotspots: [
      { x: 31.6, y: 43.6, text: 'Les charges des autres services sont reprises automatiquement.' },
      { x: 85.3, y: 52, text: 'Total TTC calculé ; la facture PDF est créée en un clic.' },
    ],
    events: [{ to: 'Direction', text: 'Encaissement ajouté au chiffre d’affaires' }],
  },
  {
    id: 'direction',
    service: 'Direction',
    module: 'Tableau de bord direction',
    icon: LayoutDashboard,
    node: { x: 18, y: 110 },
    image: 'direction',
    title: 'La direction voit tout',
    desc: 'Chiffre d’affaires par activité, revenus par médecin et par pharmacien : le tableau de bord se met à jour de lui-même.',
    hotspots: [
      { x: 32.6, y: 26.7, text: 'Chiffre d’affaires global, par jour, par mois ou par année.' },
      { x: 59, y: 53.5, text: 'Activité et revenus par médecin, sans export ni tableur.' },
    ],
    events: [],
  },
];

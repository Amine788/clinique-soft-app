# Architecture du Projet : ClinicSoft (SaaS Multi-Tenant)

Ce document décrit l'architecture technique globale du projet **ClinicSoft**, un logiciel B2B en mode SaaS destiné à la gestion des cliniques médicales.

---

## 1. Stack Technique

Le projet repose sur une architecture moderne de type **MERN/PERN** (avec MySQL/PostgreSQL) :

### Frontend (Interface Utilisateur)
- **Framework** : React.js (via Vite)
- **Styling** : Tailwind CSS
- **État Global** : Zustand
- **Routage** : React Router DOM
- **Graphiques** : Recharts
- **Génération de PDF** : jsPDF & jsPDF-AutoTable

### Backend (Serveur API)
- **Environnement** : Node.js
- **Framework Web** : Express.js
- **ORM** : Sequelize (Compatible MySQL & PostgreSQL)
- **Base de données** : MySQL (par défaut en local)
- **Temps Réel** : Socket.io
- **Authentification** : JWT (JSON Web Tokens) & bcryptjs

---

## 2. Architecture Multi-Tenant (Isolation des Données)

C'est le cœur du système SaaS. Plutôt que d'avoir une base de données distincte par clinique (ce qui est coûteux et difficile à maintenir), **toutes les cliniques partagent la même base de données (Isolation Logique)**.

### Comment ça marche ?
1. **La clé `clinic_id`** : Presque toutes les tables du système (`users`, `patients`, `rendezvous`, `factures`, etc.) possèdent une colonne `clinic_id`.
2. **Le Contexte Global (`cls-hooked`)** : Lorsqu'un utilisateur se connecte (ex: un médecin de la Clinique A), le middleware d'authentification extrait son `clinic_id` depuis le Token JWT et le place dans une "boîte invisible" propre à sa requête HTTP (via `cls-hooked`).
3. **Filtrage Automatique (Hooks Sequelize)** : 
   - Un Hook global `beforeFind` intercepte **absolument toutes** les requêtes de lecture. Il ajoute silencieusement `WHERE clinic_id = X`.
   - Un Hook global `beforeValidate` intercepte toutes les créations et ajoute silencieusement le `clinic_id` à la nouvelle donnée.
4. **Résultat** : Les développeurs n'ont pas besoin de filtrer manuellement dans chaque route. L'isolation est garantie au plus bas niveau de l'ORM. Un médecin de la Clinique A ne pourra **jamais** voir un patient de la Clinique B.

---

## 3. Structure des Dossiers

Le projet est divisé en deux parties (Monorepo) :

```text
📦 clininique 1
 ┣ 📂 src/                  # 💻 FRONTEND (React)
 ┃ ┣ 📂 components/         # Composants réutilisables (Boutons, Modales...)
 ┃ ┣ 📂 pages/              # Vues complètes (Dashboard, Patients, Planning...)
 ┃ ┣ 📂 store/              # Gestion d'état global (Zustand)
 ┃ ┣ 📂 lib/                # Fonctions utilitaires (API, Formatage...)
 ┃ ┗ 📜 App.jsx             # Point d'entrée des routes React
 ┃
 ┣ 📂 server/               # ⚙️ BACKEND (Node.js)
 ┃ ┣ 📂 config/             # Configuration (Ex: database.js avec cls-hooked)
 ┃ ┣ 📂 middleware/         # Middlewares (Ex: auth.js pour vérifier le JWT)
 ┃ ┣ 📂 models/             # Schémas de DB Sequelize (Patient, User, Clinic...)
 ┃ ┣ 📂 routes/             # Contrôleurs de l'API REST (Ex: patients.js)
 ┃ ┣ 📂 services/           # Services externes (Email, Rappels CRON, IA...)
 ┃ ┣ 📂 socket/             # Gestion du temps réel via Socket.io
 ┃ ┗ 📜 index.js            # Point d'entrée du serveur Express
 ┃
 ┣ 📜 package.json          # Dépendances racine (Frontend)
 ┗ 📜 ARCHITECTURE.md       # Ce fichier
```

---

## 4. Sécurité, Rôles et Permissions (RBAC)

Le système utilise une sécurité basée sur les rôles (Role Based Access Control). Chaque utilisateur au sein d'une clinique a un rôle strict qui définit ce qu'il peut voir et faire.

Voici les **5 rôles principaux** configurés dans le projet :

### 👑 1. Administrateur (`admin`)
*Le Directeur ou le Gérant de la clinique.*
- **Droits complets** sur la configuration de la clinique (Nom, ICE, Logo, etc.).
- **Gestion du personnel** : Seul l'admin peut créer, inviter (par email), modifier ou désactiver les comptes des médecins, secrétaires, pharmaciens et techniciens.
- **Vision Globale** : Accès au tableau de bord financier, statistiques de performance, et vue globale sur l'activité de la clinique.

### 🩺 2. Médecin (`doctor`)
*Le Praticien de santé.*
- Possède un **profil spécialisé** (Spécialité, Numéro d'Ordre, Salle de consultation).
- **Dossier Médical** : Accès complet pour consulter l'historique des patients, créer des consultations, ajouter des notes médicales.
- **Ordonnances & Examens** : Peut générer et imprimer des ordonnances, et prescrire des examens (Laboratoire/Radiologie).
- **Agenda** : Gère ses propres rendez-vous et voit qui est en salle d'attente pour lui.

### 📋 3. Secrétaire / Réceptionniste (`secretary`)
*L'Accueil et la Gestion Administrative.*
- **Gestion des Patients** : Crée les nouveaux dossiers patients, scanne/importe les pièces d'identité (CIN).
- **Agenda Global** : Peut voir et gérer les agendas de *tous* les médecins de la clinique (prise de RDV, annulation).
- **Salle d'Attente** : Gère le pointage (arrivée/départ) des patients pour organiser la file d'attente en temps réel.
- **Facturation** : Génère les factures pour les consultations et encaisse les paiements.

### 💊 4. Pharmacien (`pharmacist`)
*Le Responsable de la Pharmacie Interne.*
- **Gestion des Stocks** : Ajoute, modifie et gère l'inventaire des médicaments de la clinique.
- **Délivrance** : A accès aux ordonnances validées par les médecins pour distribuer les médicaments aux patients avant leur sortie.

### 🔬 5. Technicien de Laboratoire / Radiologie (`lab_technician`)
*Le Spécialiste des Analyses.*
- **Traitement des Examens** : Reçoit les demandes d'examens (prises de sang, radios) prescrites par les médecins.
- **Résultats** : Saisit les résultats et upload les fichiers (PDF/Images des radios) directement dans le dossier médical du patient, qui seront instantanément visibles par le médecin.

> **Sécurisation Technique** : Les routes de l'API sont bloquées en utilisant le middleware `authorizeRole(...)`. Par exemple, si une Secrétaire tente d'accéder à la route `/api/admin/users`, le serveur rejettera la requête avec une erreur `403 Forbidden` avant même de lire la base de données.

## 5. Fonctionnalités Avancées

- **Temps réel** : Grâce à `Socket.io`, lorsqu'une secrétaire ajoute un patient en salle d'attente, le médecin voit son tableau de bord se mettre à jour instantanément sans rafraîchir la page.
- **Jobs Automatisés** : Un *Scheduler* tourne en arrière-plan pour envoyer des rappels de rendez-vous par email (via Resend/SMTP) tous les matins à 09h00.
- **Stockage de fichiers** : Les profils, les scanners (CIN) et autres fichiers sont stockés en local dans le dossier `/server/uploads/` et servis de manière statique par Express.

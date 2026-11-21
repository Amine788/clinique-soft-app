import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/authStore';
import { seDeconnecter } from './api/deconnexion';

import MainLayout from './components/MainLayout';
import ProtectedRoute from './routes/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import SetupPasswordPage from './pages/auth/SetupPasswordPage';
import LandingPage from './pages/landing/LandingPage';
import SubscriptionPage from './pages/SubscriptionPage';
import SuperAdminPage from './pages/admin/SuperAdminPage';

// Pages communes
import DashboardPage from './pages/DashboardPage';
import PatientsPage from './pages/PatientsPage';
import AppointmentsPage from './pages/AppointmentsPage';
import RoomsPage from './pages/RoomsPage';
import CreatePatientPage from './pages/CreatePatientPage';
import CheckinPage from './pages/CheckinPage';
import AdminPage from './pages/admin/AdminPage';
import AdminFinances from './pages/admin/AdminFinances';
import PatientProfileAdvanced from './pages/Patients/PatientProfileAdvanced';


// Pages Secrétaire
import NewAppointmentPage from './pages/secretary/NewAppointmentPage';
import BillingPage from './pages/secretary/BillingPage';
import AbsencesPage from './pages/secretary/AbsencesPage';
import LaboratoryPage from './pages/laboratory/LaboratoryPage';

// Pages Médecin
import DoctorStatsPage from './pages/doctor/DoctorStatsPage';
import DoctorAbsencesPage from './pages/doctor/DoctorAbsencesPage';
import DoctorAgendaPage from './pages/doctor/DoctorAgendaPage';
import ConsultationPage from './pages/doctor/ConsultationPage';
import DoctorPrescriptionsPage from './pages/doctor/DoctorPrescriptionsPage';

// Pages Pharmacien
import PharmacyStockPage from './pages/pharmacist/PharmacyStockPage';
import PharmacyAlertsPage from './pages/pharmacist/PharmacyAlertsPage';
import PharmacyDispensationPage from './pages/pharmacist/PharmacyDispensationPage';

// Pages Infirmier (Nurse)
import NurseMedicationTracking from './pages/nurse/NurseMedicationTracking';
import NurseQRPage from './pages/nurse/NurseQRPage';
import NurseDashboardPage from './pages/nurse/NurseDashboardPage';
import NursePrelevementsPage from './pages/nurse/NursePrelevementsPage';
import MedicationFlowPage from './pages/MedicationFlowPage';

// Hospitalisation pages
import DoctorHospitalizedPage from './pages/doctor/HospitalizedPatientsPage';
import NurseHospitalizedPage from './pages/nurse/HospitalizedPatientsPage';
import SecretaryAdmissionsPage from './pages/secretary/AdmissionsPage';

// Page 403
function UnauthorizedPage() {
    const handleLogout = async () => {
        await seDeconnecter();
        window.location.href = '/login';
    };
    return (
        <div className="flex-1 flex items-center justify-center flex-col gap-4 min-h-screen bg-gray-50 font-sans">
            <div className="text-6xl">🚫</div>
            <h1 className="text-2xl font-bold text-gray-900">Accès refusé</h1>
            <p className="text-gray-500 text-sm max-w-xs text-center">Vous n'avez pas les droits nécessaires pour accéder à cette page avec votre compte actuel.</p>
            <button 
                onClick={handleLogout}
                className="mt-4 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition-all shadow-sm"
            >
                Se déconnecter & Changer de compte
            </button>
        </div>
    );
}

// Page en construction
function UnderConstructionPage() {
    return (
        <div className="flex-1 flex items-center justify-center flex-col gap-2">
            <div className="text-5xl">🚧</div>
            <h2 className="text-xl font-bold text-gray-900">Module en construction</h2>
            <p className="text-muted text-sm">Cette fonctionnalité sera bientôt disponible.</p>
        </div>
    );
}

export default function App() {
    const isAuthenticated = useAuthStore(s => s.isAuthenticated);
    const user = useAuthStore(s => s.user);
    // Vérifier les DEUX pour éviter la boucle de redirection
    const isFullyAuthenticated = isAuthenticated && !!user;

    return (
        <>
            <Toaster position="top-right" toastOptions={{
                style: { borderRadius: '12px', fontFamily: 'Inter, sans-serif', fontSize: '14px' },
                success: { iconTheme: { primary: '#10b981', secondary: '#ecfdf5' } },
                error: { iconTheme: { primary: '#ef4444', secondary: '#fef2f2' } },
            }} />
            <BrowserRouter>
                <Routes>
                    {/* ── Pages publiques ── */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={
                        isFullyAuthenticated 
                            ? (user?.role === 'super_admin' 
                                ? <Navigate to="/super-admin" replace /> 
                                : <Navigate to="/dashboard" replace />)
                            : <LoginPage />
                    } />
                    <Route path="/register" element={
                        isFullyAuthenticated 
                            ? (user?.role === 'super_admin' 
                                ? <Navigate to="/super-admin" replace /> 
                                : <Navigate to="/dashboard" replace />)
                            : <RegisterPage />
                    } />
                    <Route path="/setup-password" element={<SetupPasswordPage />} />
                    <Route path="/unauthorized" element={<UnauthorizedPage />} />
                    <Route path="/subscription" element={<SubscriptionPage />} />
                    <Route path="/super-admin" element={
                        <ProtectedRoute allowedRoles={['super_admin']}>
                            <SuperAdminPage />
                        </ProtectedRoute>
                    } />

                    {/* ── Layout protégé (pathless = les enfants gardent leurs URLs absolues) ── */}
                    <Route element={
                        <ProtectedRoute allowedRoles={['admin', 'doctor', 'pharmacist', 'secretary', 'lab_technician', 'nurse']}>
                            <MainLayout />
                        </ProtectedRoute>
                    }>
                        {/* Dashboard — accessible à tous */}
                        <Route path="/dashboard" element={<DashboardPage />} />

                        {/* Patients */}
                        <Route path="/patients" element={
                            <ProtectedRoute allowedRoles={['secretary', 'doctor', 'admin', 'nurse']}>
                                <PatientsPage />
                            </ProtectedRoute>
                        } />

                        <Route path="/patients/create" element={
                            <ProtectedRoute allowedRoles={['secretary', 'doctor', 'admin']}>
                                <CreatePatientPage />
                            </ProtectedRoute>
                        } />

                        <Route path="/patients/:id/profil" element={
                            <ProtectedRoute allowedRoles={['secretary', 'doctor', 'admin', 'nurse']}>
                                <PatientProfileAdvanced />
                            </ProtectedRoute>
                        } />


                        {/* Pointage */}
                        <Route path="/checkin" element={
                            <ProtectedRoute allowedRoles={['secretary', 'admin']}>
                                <CheckinPage />
                            </ProtectedRoute>
                        } />
                        
                        {/* Secrétaire / Admin - Validation des absences des médecins */}
                        <Route path="/absences" element={
                            <ProtectedRoute allowedRoles={['secretary', 'admin']}>
                                <AbsencesPage />
                            </ProtectedRoute>
                        } />

                        {/* Secrétaire - Admissions */}
                        <Route path="/secretary/admissions" element={
                            <ProtectedRoute allowedRoles={['secretary', 'admin']}>
                                <SecretaryAdmissionsPage />
                            </ProtectedRoute>
                        } />

                        {/* Rendez-vous */}
                        <Route path="/appointments" element={
                            <ProtectedRoute allowedRoles={['secretary', 'doctor', 'admin']}>
                                <AppointmentsPage />
                            </ProtectedRoute>
                        } />

                        <Route path="/appointments/new" element={
                            <ProtectedRoute allowedRoles={['secretary', 'admin']}>
                                <NewAppointmentPage />
                            </ProtectedRoute>
                        } />

                        {/* Chambres */}
                        <Route path="/rooms" element={
                            <ProtectedRoute allowedRoles={['secretary', 'admin', 'nurse']}>
                                <RoomsPage />
                            </ProtectedRoute>
                        } />

                        {/* Facturation */}
                        <Route path="/billing" element={
                            <ProtectedRoute allowedRoles={['secretary', 'admin']}>
                                <BillingPage />
                            </ProtectedRoute>
                        } />

                        {/* Laboratoire & Radio */}
                        <Route path="/laboratory" element={
                            <ProtectedRoute allowedRoles={['lab_technician']}>
                                <LaboratoryPage />
                            </ProtectedRoute>
                        } />

                        {/* Médecin - Agenda */}
                        <Route path="/doctor/agenda" element={
                            <ProtectedRoute allowedRoles={['doctor']}>
                                <DoctorAgendaPage />
                            </ProtectedRoute>
                        } />

                        {/* Médecin - Consultation */}
                        <Route path="/consultation/:rdvId" element={
                            <ProtectedRoute allowedRoles={['doctor']}>
                                <ConsultationPage />
                            </ProtectedRoute>
                        } />

                        {/* Médecin - Stats */}
                        <Route path="/doctor/stats" element={
                            <ProtectedRoute allowedRoles={['doctor']}>
                                <DoctorStatsPage />
                            </ProtectedRoute>
                        } />

                        {/* Médecin - Ordonnances */}
                        <Route path="/doctor/prescriptions" element={
                            <ProtectedRoute allowedRoles={['doctor']}>
                                <DoctorPrescriptionsPage />
                            </ProtectedRoute>
                        } />

                        {/* Médecin - Absences */}
                        <Route path="/doctor/absences" element={
                            <ProtectedRoute allowedRoles={['doctor']}>
                                <DoctorAbsencesPage />
                            </ProtectedRoute>
                        } />

                        {/* Médecin - Patients Hospitalisés */}
                        <Route path="/doctor/hospitalized" element={
                            <ProtectedRoute allowedRoles={['doctor']}>
                                <DoctorHospitalizedPage />
                            </ProtectedRoute>
                        } />

                        {/* Pharmacie - Stock */}
                        <Route path="/pharmacy/stock" element={
                            <ProtectedRoute allowedRoles={['pharmacist']}>
                                <PharmacyStockPage />
                            </ProtectedRoute>
                        } />

                        {/* Pharmacie - Alertes */}
                        <Route path="/pharmacy/alerts" element={
                            <ProtectedRoute allowedRoles={['pharmacist']}>
                                <PharmacyAlertsPage />
                            </ProtectedRoute>
                        } />

                        {/* Pharmacie - Dispensation */}
                        <Route path="/pharmacy/dispensation" element={
                            <ProtectedRoute allowedRoles={['pharmacist']}>
                                <PharmacyDispensationPage />
                            </ProtectedRoute>
                        } />

                        {/* Infirmier - Tableau de Bord Soins */}
                        <Route path="/nurse/dashboard" element={
                            <ProtectedRoute allowedRoles={['nurse', 'doctor']}>
                                <NurseDashboardPage />
                            </ProtectedRoute>
                        } />

                        {/* Infirmier - Prélèvements Laboratoire */}
                        <Route path="/nurse/prelevements" element={
                            <ProtectedRoute allowedRoles={['nurse']}>
                                <NursePrelevementsPage />
                            </ProtectedRoute>
                        } />

                        {/* Infirmier - Suivi des Médicaments */}
                        <Route path="/nurse/medications" element={
                            <ProtectedRoute allowedRoles={['nurse', 'doctor']}>
                                <NurseMedicationTracking />
                            </ProtectedRoute>
                        } />
                        
                        {/* Infirmier - QR */}
                        <Route path="/nurse/qr" element={
                            <ProtectedRoute allowedRoles={['nurse', 'doctor']}>
                                <NurseQRPage />
                            </ProtectedRoute>
                        } />

                        {/* Infirmier - Patients Hospitalisés */}
                        <Route path="/nurse/hospitalized" element={
                            <ProtectedRoute allowedRoles={['nurse']}>
                                <NurseHospitalizedPage />
                            </ProtectedRoute>
                        } />
                        
                        {/* Flux Médicamenteux Complet */}
                        <Route path="/medication-flow" element={
                            <ProtectedRoute allowedRoles={['nurse', 'pharmacist', 'doctor']}>
                                <MedicationFlowPage />
                            </ProtectedRoute>
                        } />

                        {/* Admin */}
                        <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
                        <Route path="/admin/users" element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <AdminPage tab="users" />
                            </ProtectedRoute>
                        } />
                        <Route path="/admin/clinic" element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <AdminPage tab="clinic" />
                            </ProtectedRoute>
                        } />
                        <Route path="/admin/finances" element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <AdminFinances />
                            </ProtectedRoute>
                        } />
                        <Route path="/admin/performance" element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <AdminPage tab="performance" />
                            </ProtectedRoute>
                        } />
                        <Route path="/admin/settings" element={
                            <ProtectedRoute allowedRoles={['admin']}>
                                <AdminPage tab="settings" />
                            </ProtectedRoute>
                        } />

                        {/* 403 */}
                        <Route path="/unauthorized-app" element={<UnauthorizedPage />} />

                        {/* Catch-all interne → en construction */}
                        <Route path="*" element={<UnderConstructionPage />} />
                    </Route>
                </Routes>
            </BrowserRouter>
        </>
    );
}

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { reduireImage, estImageOcr } from '../utils/image';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { CreditCard, Upload, Camera, CheckCircle, AlertTriangle, ChevronRight, ChevronLeft, X, Sparkles, User, Calendar, MapPin, Phone, Mail, Shield, QrCode, Download, Printer, ExternalLink } from 'lucide-react';

const CIN_REGEX = /^[A-Z]{1,2}[0-9]{6}$/;

// URL de base pour le QR code (pointe vers la fiche patient)
const BASE_URL = window.location.origin;

export default function CreatePatientPage() {
    const navigate = useNavigate();
    // L'OCR (POST /ai/ocr-cin) n'est autorisé côté serveur qu'au rôle secretary
    const canEditMedical = useAuthStore(s => s.user?.role) === 'doctor';
    const canUseOcr = useAuthStore(s => s.user?.role) === 'secretary';
    const [searchParams] = useSearchParams();
    const [step, setStep] = useState(1); // 1: CIN, 2: Scan Upload, 3: Formulaire, 4: QR Code
    const [cin, setCin] = useState(searchParams.get('cin') || '');
    const [cinStatus, setCinStatus] = useState(null); // null | checking | valid | exists | invalid
    const [existingPatient, setExistingPatient] = useState(null);
    const [scanRecto, setScanRecto] = useState(null);
    const [scanVerso, setScanVerso] = useState(null);
    const [ocrData, setOcrData] = useState(null);
    const [ocrLoading, setOcrLoading] = useState(false);
    const [form, setForm] = useState({
        nom: '', prenom: '', dateNaissance: '', sexe: 'M', telephone: '', email: '',
        address: '', ville: '', bloodType: '', insurance: '', cinExpiration: '',
        allergies: '', chronic: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [createdPatient, setCreatedPatient] = useState(null); // données patient après création

    // Vérifier CIN quand l'utilisateur tape
    useEffect(() => {
        if (cin.length < 3) { setCinStatus(null); return; }

        const upper = cin.toUpperCase();
        if (!CIN_REGEX.test(upper)) {
            setCinStatus('invalid');
            return;
        }

        setCinStatus('checking');
        const timer = setTimeout(async () => {
            try {
                const { data } = await api.get(`/patients/check-cin/${upper}`);
                // Format refusé par le back : 200 avec valid: false
                if (data.valid === false) {
                    setCinStatus('invalid');
                    setExistingPatient(null);
                } else if (data.exists) {
                    setCinStatus('exists');
                    setExistingPatient(data.patient);
                } else {
                    setCinStatus('valid');
                    setExistingPatient(null);
                }
            } catch {
                setCinStatus('invalid');
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [cin]);

    // Upload scan
    const handleScanUpload = async (original, face) => {
        // Photo réduite une fois : même image pour l'archivage et pour l'OCR (V3)
        let file = original;
        try { file = await reduireImage(original); } catch { /* image illisible par le navigateur : envoyée telle quelle */ }
        if (face === 'recto') setScanRecto(file);
        else setScanVerso(file);

        // Upload vers le serveur
        const formData = new FormData();
        formData.append('face', face); // Appending face BEFORE file for multer to see it in req.body
        formData.append('scan', file);

        try {
            await api.post(`/patients/${cin.toUpperCase()}/upload-scan`, formData);
            toast.success(`Scan ${face} uploadé avec succès`);
        } catch (err) {
            console.error("Upload Error:", err);
            toast.error(`Erreur upload: ${err.response?.data?.error || err.message}`);
        }
    };

    // Soumission finale — maintenant va à l'étape 4
    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const payload = {
                cin: cin.toUpperCase(),
                nom: form.nom,
                prenom: form.prenom,
                dateNaissance: form.dateNaissance,
                sexe: form.sexe,
                telephone: form.telephone,
                email: form.email,
                address: form.address,
                ville: form.ville,
                bloodType: form.bloodType,
                insurance: form.insurance,
                cinExpiration: form.cinExpiration,
                allergies: form.allergies ? form.allergies.split(',').map(a => a.trim()) : [],
                chronic: form.chronic ? form.chronic.split(',').map(c => c.trim()) : [],
            };
            if (!canEditMedical) for (const key of ['bloodType', 'allergies', 'chronic']) delete payload[key];
            const { data } = await api.post('/patients', payload);
            // Stocker le patient créé et passer à l'étape QR Code
            setCreatedPatient({
                id: data.id,
                cin: data.cin,
                nom: data.nom,
                prenom: data.prenom,
            });
            toast.success(`Dossier ${data.id} créé avec succès !`);
            setStep(4);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Erreur de création');
        } finally {
            setSubmitting(false);
        }
    };

    // Télécharger le QR Code en PNG
    const handleDownloadQR = () => {
        const canvas = document.getElementById('qr-canvas-patient');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `QR_${createdPatient?.id || 'patient'}.png`;
        link.click();
        toast.success('QR Code téléchargé !');
    };

    // Imprimer le QR Code
    const handlePrintQR = () => {
        const printContent = document.getElementById('qr-print-zone');
        if (!printContent) return;
        const win = window.open('', '_blank', 'width=400,height=500');
        win.document.write(`
            <html>
            <head>
                <title>QR Code — ${createdPatient?.id}</title>
                <style>
                    body { font-family: Arial, sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#fff; }
                    .box { text-align:center; padding:32px; border: 2px solid #e5e7eb; border-radius:16px; }
                    h2 { font-size:18px; font-weight:700; margin:0 0 4px; color:#111827; }
                    p { font-size:13px; color:#6b7280; margin:4px 0; }
                    .dossier { font-size:14px; font-weight:700; color:#2563eb; margin:8px 0; }
                    img { margin:16px 0; }
                    .scan-txt { font-size:11px; color:#9ca3af; margin-top:8px; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h2>${createdPatient?.prenom} ${createdPatient?.nom}</h2>
                    <p>CIN : ${createdPatient?.cin}</p>
                    <p class="dossier">📁 ${createdPatient?.id}</p>
                    ${printContent.innerHTML}
                    <p class="scan-txt">Scannez ce QR code pour accéder au dossier patient</p>
                </div>
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 500);
    };

    const qrValue = createdPatient ? `${BASE_URL}/patients?id=${createdPatient.id}` : '';

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title">Nouveau Dossier Patient</h1>
                    <p className="text-muted text-sm mt-1">Identification CIN obligatoire avant création.</p>
                </div>
                <button onClick={() => navigate('/patients')} className="text-sm text-muted hover:text-gray-700 transition">← Retour</button>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-2">
                {[
                    { n: 1, label: 'Vérification CIN', icon: CreditCard },
                    { n: 2, label: 'Scan Carte', icon: Camera },
                    { n: 3, label: 'Informations', icon: User },
                    { n: 4, label: 'QR Code', icon: QrCode },
                ].map(({ n, label }) => (
                    <div key={n} className="flex items-center gap-2 flex-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${step === n ? 'bg-primary text-white shadow-md shadow-primary/25' : step > n ? 'bg-success text-white' : 'bg-gray-100 text-gray-400'
                            }`}>{step > n ? <CheckCircle size={16} /> : n}</div>
                        <span className={`text-xs font-semibold ${step >= n ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                        {n < 4 && <div className={`flex-1 h-0.5 rounded ${step > n ? 'bg-success' : 'bg-gray-200'}`} />}
                    </div>
                ))}
            </div>

            {/* ============================================================ */}
            {/* ÉTAPE 1 — Saisie et Validation CIN */}
            {/* ============================================================ */}
            {step === 1 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <CreditCard size={20} className="text-primary" /> Numéro CIN *
                    </h2>

                    <div className="relative">
                        <CreditCard size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={cin} onChange={e => setCin(e.target.value.toUpperCase())}
                            className="w-full pl-10 pr-24 py-3 border border-gray-200 rounded-xl text-lg font-mono font-bold tracking-widest focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            placeholder="BK456789"
                            maxLength={8}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {cinStatus === 'checking' && <span className="text-xs text-muted animate-pulse">Vérification...</span>}
                            {cinStatus === 'valid' && <span className="text-xs font-bold text-success">✅ Valide — Nouveau</span>}
                            {cinStatus === 'invalid' && <span className="text-xs font-bold text-danger">❌ Format invalide</span>}
                            {cinStatus === 'exists' && <span className="text-xs font-bold text-warning">⚠️ Existant</span>}
                        </div>
                    </div>

                    <p className="text-xs text-muted">Format : 1-2 lettres + 6 chiffres. Ex: A123456, BK456789, T789456</p>

                    {/* CIN existante → afficher le dossier */}
                    {cinStatus === 'exists' && existingPatient && (
                        <div className="border border-warning/30 bg-warning-light/30 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-warning mb-2">
                                <AlertTriangle size={16} /> Ce CIN est déjà enregistré
                            </div>
                            <div className="text-sm text-gray-900">
                                <p className="font-semibold">👤 {existingPatient.nom} {existingPatient.prenom}</p>
                                <p className="text-muted">📁 Dossier : {existingPatient.id} — Né(e) le {existingPatient.dateNaissance}</p>
                            </div>
                            <button onClick={() => navigate('/patients')} className="mt-3 px-4 py-2 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition">
                                Ouvrir le dossier existant
                            </button>
                        </div>
                    )}

                    {/* CIN valide et nouveau → bouton continuer */}
                    {cinStatus === 'valid' && (
                        <div className="border border-success/30 bg-success-light/30 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-success mb-2">
                                <CheckCircle size={16} /> CIN non trouvée — Nouveau patient
                            </div>
                            <button onClick={() => setStep(2)} className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition shadow-md shadow-primary/25">
                                Continuer la création du dossier <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ============================================================ */}
            {/* ÉTAPE 2 — Scan de la Carte Nationale */}
            {/* ============================================================ */}
            {step === 2 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Camera size={20} className="text-primary" /> Scan Carte Nationale *
                    </h2>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Recto */}
                        <div className={`border-2 ${scanRecto ? 'border-success' : 'border-dashed border-gray-300'} rounded-2xl p-5 text-center`}>
                            <p className="text-sm font-bold mb-2">RECTO <span className="text-danger">*</span></p>
                            {scanRecto ? (
                                <div className="space-y-2">
                                    <div className="w-full h-32 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                                        <img src={URL.createObjectURL(scanRecto)} alt="Recto" className="max-h-full object-contain" />
                                    </div>
                                    <p className="text-xs text-success font-semibold">✅ Scan reçu — {(scanRecto.size / 1024).toFixed(0)} KB</p>
                                    <button onClick={() => setScanRecto(null)} className="text-xs text-danger hover:underline">Supprimer et re-uploader</button>
                                </div>
                            ) : (
                                <label className="cursor-pointer block">
                                    <div className="w-full h-32 bg-gray-50 rounded-xl flex items-center justify-center flex-col gap-2 hover:bg-gray-100 transition">
                                        <Upload size={24} className="text-gray-400" />
                                        <span className="text-xs text-muted">Cliquer ou glisser-déposer</span>
                                    </div>
                                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => e.target.files?.[0] && handleScanUpload(e.target.files[0], 'recto')} />
                                </label>
                            )}
                        </div>

                        {/* Verso */}
                        <div className={`border-2 ${scanVerso ? 'border-success' : 'border-dashed border-gray-200'} rounded-2xl p-5 text-center`}>
                            <p className="text-sm font-bold mb-2">VERSO <span className="text-muted text-xs">(optionnel)</span></p>
                            {scanVerso ? (
                                <div className="space-y-2">
                                    <div className="w-full h-32 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                                        <img src={URL.createObjectURL(scanVerso)} alt="Verso" className="max-h-full object-contain" />
                                    </div>
                                    <p className="text-xs text-success font-semibold">✅ Scan reçu</p>
                                    <button onClick={() => setScanVerso(null)} className="text-xs text-danger hover:underline">Supprimer</button>
                                </div>
                            ) : (
                                <label className="cursor-pointer block">
                                    <div className="w-full h-32 bg-gray-50 rounded-xl flex items-center justify-center flex-col gap-2 hover:bg-gray-100 transition">
                                        <Upload size={24} className="text-gray-300" />
                                        <span className="text-xs text-muted">Optionnel — face adresse</span>
                                    </div>
                                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => e.target.files?.[0] && handleScanUpload(e.target.files[0], 'verso')} />
                                </label>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-muted">Formats acceptés : JPG, PNG, PDF — Max 5 MB</p>

                    {/* OCR IA */}
                    {scanRecto && canUseOcr && (
                        <div className="bg-primary-light/30 border border-primary/20 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
                                <Sparkles size={16} /> Extraction intelligente du texte (IA)
                            </div>
                            <p className="text-xs text-muted mb-3">L'IA analyse l'image pour extraire précisément toutes les données de la carte d'identité.</p>
                            <button disabled={ocrLoading} onClick={async () => {
                                if (!estImageOcr(scanRecto)) {
                                    return toast.error("L'extraction IA nécessite une photo (JPEG, PNG ou WebP), pas un PDF.");
                                }
                                setOcrLoading(true);
                                try {
                                    toast("Analyse de l'image par l'IA en cours...", { icon: "🤖" });

                                    // Convertir le fichier en Base64
                                    const reader = new FileReader();
                                    reader.readAsDataURL(scanRecto);
                                    reader.onload = async () => {
                                        const base64Str = reader.result.split(',')[1];

                                        try {
                                            // L'analyse par l'IA dépasse souvent les 10 s par défaut du client (V2)
                                            const res = await api.post('/ai/ocr-cin', {
                                                imageBase64: base64Str,
                                                mimeType: scanRecto.type
                                            }, { timeout: 60000 });

                                            if (res.data.success && res.data.data) {
                                                setOcrData(res.data.data);
                                                toast.success("Données extraites avec succès ! Vérifiez les champs.");
                                            } else {
                                                toast.error("L'IA n'a pas pu structurer les données.");
                                            }
                                        } catch (apiErr) {
                                            console.error("API OCR Error:", apiErr);
                                            toast.error(apiErr.response?.data?.error || "Erreur lors de la connexion au serveur IA");
                                        } finally {
                                            setOcrLoading(false);
                                        }
                                    };
                                    reader.onerror = () => {
                                        toast.error("Erreur de lecture de l'image");
                                        setOcrLoading(false);
                                    };
                                } catch (err) {
                                    toast.error("Erreur inattendue");
                                    console.error("OCR error:", err);
                                    setOcrLoading(false);
                                }
                            }} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition flex items-center gap-2 disabled:opacity-60">
                                {ocrLoading ? <span className="animate-spin">⏳</span> : <Sparkles size={14} />}
                                {ocrLoading ? "Analyse par IA en cours..." : "Lancer l'Extraction IA"}
                            </button>
                        </div>
                    )}

                    {/* Résultat OCR */}
                    {ocrData && (
                        <div className="bg-white border border-success/30 rounded-2xl p-4">
                            <div className="flex items-center gap-2 text-sm font-bold text-success mb-3"><Sparkles size={16} /> Données extraites de la carte</div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div><span className="text-muted">CIN :</span> <span className="font-bold">{ocrData.cin}</span> {ocrData.cin?.toUpperCase() === cin ? <span className="text-success text-xs">✅ Correspond</span> : <span className="text-danger text-xs">❌ Différent du CIN saisi</span>}</div>
                                <div><span className="text-muted">Nom :</span> <span className="font-bold">{ocrData.nom} {ocrData.prenom}</span></div>
                                <div><span className="text-muted">Naissance :</span> <span className="font-bold">{ocrData.dateNaissance || '—'}</span></div>
                                <div><span className="text-muted">Sexe :</span> <span className="font-bold">{ocrData.sexe || '—'}</span></div>
                                <div><span className="text-muted">Lieu :</span> <span className="font-bold">{ocrData.lieuNaissance || '—'}</span></div>
                                <div><span className="text-muted">Expiration :</span> <span className="font-bold">{ocrData.dateExpiration || '—'}</span></div>
                                {ocrData.adresse && <div className="col-span-2"><span className="text-muted">Adresse :</span> <span className="font-bold">{ocrData.adresse}</span></div>}
                                {ocrData.confiance && <div className="col-span-2"><span className="text-muted">Confiance :</span> <span className={`font-bold ${ocrData.confiance >= 0.8 ? 'text-success' : 'text-warning'}`}>{Math.round(ocrData.confiance * 100)}%</span></div>}
                            </div>
                            <button onClick={() => {
                                setForm(f => ({
                                    ...f,
                                    nom: ocrData.nom || f.nom,
                                    prenom: ocrData.prenom || f.prenom,
                                    dateNaissance: ocrData.dateNaissance || f.dateNaissance,
                                    sexe: ocrData.sexe || f.sexe,
                                    ville: ocrData.lieuNaissance || f.ville,
                                    address: ocrData.adresse || f.address,
                                    cinExpiration: ocrData.dateExpiration || f.cinExpiration,
                                }));
                                setStep(3);
                                toast.success('Formulaire pré-rempli avec les données de la carte !');
                            }} className="mt-3 px-4 py-2 bg-success hover:bg-green-600 text-white font-semibold rounded-xl text-sm transition flex items-center gap-2">
                                <CheckCircle size={14} /> Confirmer et pré-remplir le formulaire
                            </button>
                        </div>
                    )}

                    <div className="flex justify-between">
                        <button onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-muted hover:text-gray-700"><ChevronLeft size={16} /> Retour</button>
                        <button onClick={() => setStep(3)} disabled={!scanRecto} className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition shadow-md shadow-primary/25 disabled:opacity-40">
                            Continuer <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )
            }

            {/* ============================================================ */}
            {/* ÉTAPE 3 — Formulaire Patient */}
            {/* ============================================================ */}
            {
                step === 3 && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-5">
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <User size={20} className="text-primary" /> Informations du Patient
                        </h2>

                        <div className="bg-primary-light/30 border border-primary/20 rounded-xl p-3 flex items-center gap-2 text-sm">
                            <CreditCard size={16} className="text-primary" />
                            <span className="font-bold">CIN : {cin}</span>
                            <span className="text-success text-xs font-semibold">✅ Vérifié</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom *</label>
                                <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value.toUpperCase() })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="NOM DE FAMILLE" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Prénom *</label>
                                <input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Prénom" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Date de naissance *</label>
                                <input type="date" value={form.dateNaissance} onChange={e => setForm({ ...form, dateNaissance: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sexe *</label>
                                <select value={form.sexe} onChange={e => setForm({ ...form, sexe: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary">
                                    <option value="M">Masculin</option>
                                    <option value="F">Féminin</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone *</label>
                                <input value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="06 XX XX XX XX" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="email@exemple.com" />
                            </div>
                            {canEditMedical && (<div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Groupe sanguin</label>
                                <select value={form.bloodType} onChange={e => setForm({ ...form, bloodType: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary">
                                    <option value="">— Sélectionner —</option>
                                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g}>{g}</option>)}
                                </select>
                            </div>)}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Expiration CIN *</label>
                                <input type="date" value={form.cinExpiration} onChange={e => setForm({ ...form, cinExpiration: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse</label>
                                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Adresse complète" />
                            </div>
                            {canEditMedical && (<div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Allergies <span className="text-muted text-xs">(séparées par ,)</span></label>
                                <input value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Pénicilline, Aspirine..." />
                            </div>)}
                            {canEditMedical && (<div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Maladies chroniques <span className="text-muted text-xs">(séparées par ,)</span></label>
                                <input value={form.chronic} onChange={e => setForm({ ...form, chronic: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="Diabète, Hypertension..." />
                            </div>)}
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assurance</label>
                                <input value={form.insurance} onChange={e => setForm({ ...form, insurance: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="CNOPS (80%), CNSS (70%)..." />
                            </div>
                        </div>

                        <div className="flex justify-between pt-4 border-t border-gray-100">
                            <button onClick={() => setStep(2)} className="flex items-center gap-1 text-sm text-muted hover:text-gray-700"><ChevronLeft size={16} /> Retour</button>
                            <button onClick={handleSubmit} disabled={submitting || !form.nom || !form.prenom || !form.dateNaissance || !form.telephone || !form.cinExpiration}
                                className="flex items-center gap-2 px-6 py-2.5 bg-success hover:bg-green-600 text-white font-semibold rounded-xl text-sm transition shadow-md disabled:opacity-40">
                                {submitting ? <span className="animate-spin">⏳</span> : <CheckCircle size={16} />}
                                {submitting ? 'Création...' : 'Créer le dossier patient'}
                            </button>
                        </div>
                    </div>
                )
            }

            {/* ============================================================ */}
            {/* ÉTAPE 4 — QR Code Patient */}
            {/* ============================================================ */}
            {step === 4 && createdPatient && (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
                    {/* Succès header */}
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={36} className="text-success" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">Dossier Créé avec Succès !</h2>
                        <p className="text-muted text-sm">Le QR code unique du patient est prêt à être imprimé ou téléchargé.</p>
                    </div>

                    {/* Infos patient */}
                    <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                            <User size={22} className="text-primary" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-gray-900 text-lg">{createdPatient.prenom} {createdPatient.nom}</p>
                            <p className="text-sm text-muted">🪪 CIN : <span className="font-semibold text-gray-700">{createdPatient.cin}</span></p>
                            <p className="text-sm text-muted">📁 Dossier : <span className="font-bold text-primary">{createdPatient.id}</span></p>
                        </div>
                    </div>

                    {/* QR Code zone */}
                    <div className="flex flex-col items-center gap-5">
                        {/* QR Code SVG (affiché à l'écran) */}
                        <div className="p-6 bg-white border-2 border-gray-100 rounded-2xl shadow-inner flex flex-col items-center gap-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 mb-1">
                                <QrCode size={16} className="text-primary" />
                                QR Code Patient Unique
                            </div>
                            <QRCodeSVG
                                value={qrValue}
                                size={200}
                                level="H"
                                includeMargin={true}
                                imageSettings={{
                                    src: '',
                                    height: 0,
                                    width: 0,
                                    excavate: false,
                                }}
                            />
                            {/* Canvas caché pour le téléchargement PNG */}
                            <div style={{ display: 'none' }}>
                                <QRCodeCanvas
                                    id="qr-canvas-patient"
                                    value={qrValue}
                                    size={400}
                                    level="H"
                                    includeMargin={true}
                                />
                            </div>
                            {/* Zone pour impression */}
                            <div id="qr-print-zone" style={{ display: 'none' }}>
                                <QRCodeSVG value={qrValue} size={200} level="H" includeMargin={true} />
                            </div>
                            <p className="text-xs text-muted text-center max-w-xs">
                                Scannez ce QR code pour accéder directement au dossier patient
                            </p>
                            <p className="text-xs font-mono text-gray-400 bg-gray-50 px-3 py-1 rounded-lg break-all text-center">
                                {qrValue}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-3 justify-center w-full">
                            <button
                                id="btn-download-qr"
                                onClick={handleDownloadQR}
                                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-sm transition shadow-md shadow-primary/25"
                            >
                                <Download size={16} />
                                Télécharger PNG
                            </button>
                            <button
                                id="btn-print-qr"
                                onClick={handlePrintQR}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gray-700 hover:bg-gray-800 text-white font-semibold rounded-xl text-sm transition"
                            >
                                <Printer size={16} />
                                Imprimer
                            </button>
                            <button
                                id="btn-go-dossier"
                                onClick={() => navigate('/patients')}
                                className="flex items-center gap-2 px-5 py-2.5 bg-success hover:bg-green-600 text-white font-semibold rounded-xl text-sm transition"
                            >
                                <ExternalLink size={16} />
                                Aller aux Dossiers
                            </button>
                        </div>
                    </div>

                    {/* Conseil */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 flex items-start gap-2">
                        <Shield size={14} className="mt-0.5 flex-shrink-0" />
                        <span>
                            <strong>Conseil :</strong> Imprimez ce QR code et collez-le sur la fiche physique du patient ou sur son bracelet d'identification pour un accès rapide lors des consultations.
                        </span>
                    </div>
                </div>
            )}
        </div >
    );
}

import { useState, useRef, useEffect } from 'react';
import { db } from '../services/db';
import { hashString } from '../services/crypto';
import backupService from '../services/backup';
import { useToast } from './Toast';
import {
  FaSave,
  FaLock,
  FaDownload,
  FaUpload,
  FaPlus,
  FaTrash,
  FaBuilding,
  FaTint,
  FaBriefcase,
  FaCog,
  FaHistory,
  FaShieldAlt,
  FaDatabase,
} from 'react-icons/fa';

export default function Settings({
  onReset,
  compactMode,
  setCompactMode,
  currentPin,
  onPinChange,
  forceMobile,
  setForceMobile,
}) {
  // --- NAVIGATION STATE ---
  const [activeTab, setActiveTab] = useState('general');

  // --- EXISTING STATE & LOGIC ---
  // Initialize empty. We only set it if the user types a NEW pin.
  const [pin, setPin] = useState('');

  // PIN Migration Check: Detect legacy PINs (4-digit) vs hashed (SHA-256)
  const isLegacyPin = currentPin && currentPin.length === 4 && /^[0-9]+$/.test(currentPin);
  const [showPinMigrationPrompt, setShowPinMigrationPrompt] = useState(isLegacyPin);
  const [doctorName, setDoctorName] = useState('');
  const { showToast, ToastContainer } = useToast();
  const fileRef = useRef();

  const [backupDir, setBackupDir] = useState(null);
  const [backupStatus, setBackupStatus] = useState('');
  const [backupThreshold, setBackupThreshold] = useState(10);
  const [autoImportEnabled, setAutoImportEnabled] = useState(false);
  const [backupProgress, setBackupProgress] = useState({
    counter: 0,
    threshold: 10,
    progress: '0/10',
  });

  // Departments management
  const [departments, setDepartments] = useState([]);
  // Workplaces State
  const [workplaces, setWorkplaces] = useState([]);
  const [newWorkplaceName, setNewWorkplaceName] = useState('');
  const [newWorkplaceCertText, setNewWorkplaceCertText] = useState('');
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [departmentsLoading, setDepartmentsLoading] = useState(false);

  // Water Departments management (séparés)
  const [waterDepartments, setWaterDepartments] = useState([]);
  const [newWaterDepartmentName, setNewWaterDepartmentName] = useState('');
  const [waterDepartmentsLoading, setWaterDepartmentsLoading] = useState(false);

  const handleSave = async () => {
    // 1. Logic: If pin is empty, we KEEP the old one.
    let pinToSave = currentPin;

    // 2. Only if user TYPED something, we validate and update
    if (pin.length > 0) {
      if (pin.length !== 4 || isNaN(pin)) {
        showToast('Le PIN doit être composé de 4 chiffres.', 'error');
        return;
      }
      // Hash the NEW pin
      pinToSave = await hashString(pin);
    }

    // 3. Save everything
    await db.saveSettings({
      pin: pinToSave,
      doctor_name: doctorName,
    });

    // 4. Update App State
    if (pin.length > 0) {
      onPinChange(pinToSave);
      setPin(''); // Clear the field for security
    }

    showToast('Paramètres sauvegardés !', 'success');
  };

  const handleExportEncrypted = async () => {
    try {
      const pw = prompt("Entrez un mot de passe pour chiffrer l'export:");
      if (pw === null) return; // User pressed Cancel
      if (!pw.trim()) {
        showToast('Mot de passe requis', 'error');
        return;
      }

      console.log('Starting encrypted export...');
      showToast("Génération de l'export chiffré...", 'info');
      const enc = await db.exportDataEncrypted(pw);
      console.log('Export data generated, using backup service...');

      // Use backup service directly for Android native export
      await backupService.saveBackupJSON(enc, 'medical-export-encrypted.json');
      showToast('Export chiffré réussi ! Sauvegardé dans Documents/copro-watch/', 'success');
    } catch (e) {
      console.error('Encrypted export failed:', e);
      showToast("Échec de l'export chiffré: " + (e.message || e), 'error');
    }
  };

  const handleExportPlain = async () => {
    try {
      console.log('Starting plain export...');
      showToast("Génération de l'export...", 'info');
      const plain = await db.exportData();
      console.log('Export data generated, using backup service...');

      // Use backup service directly for Android native export
      await backupService.saveBackupJSON(plain, 'medical-export.json');
      showToast('Export réussi ! Sauvegardé dans Documents/copro-watch/', 'success');
    } catch (e) {
      console.error('Plain export failed:', e);
      showToast("Échec de l'export: " + (e.message || e), 'error');
    }
  };

  const handleImportEncrypted = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const pw = prompt("Entrez le mot de passe pour déchiffrer l'import:");
    if (pw === null) return; // User pressed Cancel
    if (!pw.trim()) {
      showToast('Mot de passe requis', 'error');
      return;
    }
    const text = await file.text();
    const ok = await db.importDataEncrypted(text, pw);
    showToast(
      ok ? 'Données importées (chiffrées).' : "Échec de l'import chiffré",
      ok ? 'success' : 'error'
    );
  };

  const handleImportPlain = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const ok = await db.importData(text);
    showToast(ok ? 'Données importées.' : "Échec de l'import", ok ? 'success' : 'error');
  };

  useEffect(() => {
    // load backup settings
    (async () => {
      try {
        await backupService.init();
        // Initialize threshold from service
        const currentThreshold = (await backupService.getCurrentThreshold?.()) || 10;
        setBackupThreshold(currentThreshold);
        setAutoImportEnabled(await backupService.getAutoImport());
        setBackupDir(backupService.getBackupDirName());

        // Load backup progress
        const status = await backupService.getBackupStatus();
        setBackupProgress(status);
      } catch (e) {
        console.warn('backup init failed', e);
      }
    })();

    // Load Doctor Name
    const loadDoctorName = async () => {
      const s = await db.getSettings();
      if (s.doctor_name) setDoctorName(s.doctor_name);
    };
    loadDoctorName();

    // Load departments
    loadDepartments();
    loadWorkplaces();
    // Load water departments
    loadWaterDepartments();
  }, []);

  useEffect(() => {
    // Check storage info and update UI
    updateStorageInfo();
  }, []);

  const updateStorageInfo = async () => {
    const storageInfo = backupService.getCurrentStorageInfo();
    if (storageInfo.type === 'Download only') {
      setBackupStatus('Directory access not available in this browser. Use export/import instead.');
    } else if (storageInfo.type === 'Android' || storageInfo.permission === 'granted') {
      setBackupStatus('Auto backup enabled for Android');
    }
  };

  const handleChooseBackupDir = async () => {
    try {
      await backupService.chooseDirectory();
      const dirName = backupService.getBackupDirName();
      setBackupDir(dirName);
      setBackupStatus(`Backup directory set: ${dirName}. Auto backups will save here.`);
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (e) {
      if (e.message.includes('Android') || e.message.includes('permission')) {
        setBackupStatus(
          'Storage permission required. Please allow storage access in Android settings.'
        );
      } else {
        setBackupStatus('Directory access not available. Using download fallback.');
      }
      setTimeout(() => setBackupStatus(''), 5000);
    }
  };

  const handleGetBackupNow = async () => {
    try {
      setBackupStatus('Creating backup...');
      console.log('Starting manual backup...');

      const json = await db.exportData();

      // Use helper function from backup service for consistent filename format
      const filename = backupService.generateBackupFilename('backup-manuel');

      const success = await backupService.saveBackupJSON(json, filename);

      if (success) {
        setBackupStatus(`Backup saved: ${filename}`);
        const status = await backupService.getBackupStatus();
        setBackupProgress(status);
      } else {
        setBackupStatus('Backup failed: Service returned false');
      }
    } catch (e) {
      console.error('Manual backup failed:', e);
      setBackupStatus('Backup failed: ' + (e.message || e));
    }
    setTimeout(() => setBackupStatus(''), 5000);
  };

  const handleRefreshBackupProgress = async () => {
    try {
      const status = await backupService.getBackupStatus();
      setBackupProgress(status);
      setBackupStatus('Backup progress refreshed');
      setTimeout(() => setBackupStatus(''), 2000);
    } catch (e) {
      setBackupStatus('Failed to refresh progress');
      setTimeout(() => setBackupStatus(''), 2000);
    }
  };

  // [FIX] Smart Import: Tries Auto, falls back to Manual Picker if Android blocks it
  const handleImportFromBackup = async () => {
    setBackupStatus('Recherche de sauvegarde...');
    try {
      // 1. Try Automatic Import
      const backupData = await backupService.readBackupJSON();
      
      if (!backupData || !backupData.text) {
        throw new Error("Aucun fichier trouvé"); // Trigger fallback
      }

      const ok = await db.importData(backupData.text);
      setBackupStatus(ok ? 'Succès ! Backup restauré.' : 'Échec de la restauration.');
      if(ok) showToast('Backup restauré avec succès', 'success');
      setTimeout(() => setBackupStatus(''), 3000);

    } catch (e) {
      console.warn("Auto-import failed, switching to manual:", e);
      
      // 2. Smart Fallback: Open File Picker automatically
      setBackupStatus('Ouverture du sélecteur de fichier...');
      showToast('Sécurité Android: Veuillez sélectionner le fichier manuellement.', 'info');
      
      // Small delay to ensure the Toast is visible before the picker opens
      setTimeout(() => {
        if (fileRef.current) {
          fileRef.current.click();
        }
      }, 500);
    }
  };
  const handleClearBackupDir = async () => {
    try {
      await backupService.clearDirectory();
      setBackupDir(null);
      setBackupStatus('Backup directory cleared.');
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (e) {
      setBackupStatus('Failed to clear directory.');
    }
  };

  const handleThresholdSave = async () => {
    try {
      await backupService.setThreshold(Number(backupThreshold));
      setBackupStatus('Threshold saved');
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (e) {
      setBackupStatus('Failed to save threshold');
    }
  };

  const handleToggleAutoImport = async () => {
    try {
      await backupService.setAutoImport(!autoImportEnabled);
      setAutoImportEnabled(!autoImportEnabled);
      setBackupStatus('Auto import ' + (!autoImportEnabled ? 'enabled' : 'disabled'));
    } catch (e) {
      setBackupStatus('Failed to toggle auto import');
    }
    setTimeout(() => setBackupStatus(''), 3000);
  };

  // --- WORKPLACE LOGIC ---
  const loadWorkplaces = async () => {
    try {
      const places = await db.getWorkplaces();
      setWorkplaces(places);
    } catch (error) {
      console.error('Error loading workplaces:', error);
    }
  };

  const addWorkplace = async () => {
    if (!newWorkplaceName.trim()) return;
    try {
      // Save both name and certificate text
      await db.saveWorkplace({
        name: newWorkplaceName.trim(),
        certificate_text: newWorkplaceCertText.trim(),
      });

      setNewWorkplaceName('');
      setNewWorkplaceCertText(''); // Reset the new input
      await loadWorkplaces();
      showToast('Lieu de travail ajouté !', 'success');
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de l'ajout.", 'error');
    }
  };

  const deleteWorkplace = async (id) => {
    if (window.confirm('Supprimer ce lieu de travail ?')) {
      try {
        await db.deleteWorkplace(id);
        await loadWorkplaces();
        showToast('Lieu supprimé.', 'success');
      } catch (e) {
        console.error(e);
        showToast('Erreur lors de la suppression.', 'error');
      }
    }
  };

  // --- DEPARTMENT LOGIC ---
  const loadDepartments = async () => {
    setDepartmentsLoading(true);
    try {
      const [depts, workers] = await Promise.all([db.getDepartments(), db.getWorkers()]);
      const deptsWithCount = depts.map((d) => ({
        ...d,
        count: workers.filter((w) => w.department_id === d.id && !w.archived).length,
      }));
      setDepartments(deptsWithCount);
    } catch (error) {
      console.error('Error loading departments:', error);
    }
    setDepartmentsLoading(false);
  };

  const addDepartment = async () => {
    if (!newDepartmentName.trim()) {
      showToast('Veuillez saisir un nom de service.', 'error');
      return;
    }
    try {
      const newDept = { name: newDepartmentName.trim() };
      await db.saveDepartment(newDept);
      setNewDepartmentName('');
      await loadDepartments();
      showToast('Service ajouté avec succès !', 'success');
    } catch (error) {
      console.error('Error adding department:', error);
      showToast("Erreur lors de l'ajout du service.", 'error');
    }
  };

  const deleteDepartment = async (id) => {
    const workers = await db.getWorkers();
    const linkedWorkers = workers.filter((w) => w.department_id === id);
    const count = linkedWorkers.length;

    if (count > 0) {
      const confirmMsg = `ATTENTION: Ce service contient ${count} travailleur(s).\n\nSi vous supprimez ce service, CES TRAVAILLEURS SERONT AUSSI SUPPRIMÉS.\n\nConfirmer la suppression totale ?`;
      if (!window.confirm(confirmMsg)) return;
      await Promise.all(linkedWorkers.map((w) => db.deleteWorker(w.id)));
    } else {
      if (!window.confirm('Supprimer ce service vide ?')) return;
    }

    try {
      await db.deleteDepartment(id);
      await loadDepartments();
      showToast(
        count > 0 ? `Service et ${count} travailleurs supprimés.` : 'Service supprimé.',
        'success'
      );
    } catch (error) {
      console.error('Error deleting department:', error);
      showToast('Erreur lors de la suppression.', 'error');
    }
  };

  // --- WATER DEPT LOGIC ---
  const loadWaterDepartments = async () => {
    setWaterDepartmentsLoading(true);
    try {
      const waterDepts = await db.getWaterDepartments();
      setWaterDepartments(waterDepts);
    } catch (error) {
      console.error('Error loading water departments:', error);
    }
    setWaterDepartmentsLoading(false);
  };

  const addWaterDepartment = async () => {
    if (!newWaterDepartmentName.trim()) {
      showToast("Veuillez saisir un nom de service d'eau.", 'error');
      return;
    }
    try {
      const newDept = { name: newWaterDepartmentName.trim() };
      await db.saveWaterDepartment(newDept);
      setNewWaterDepartmentName('');
      await loadWaterDepartments();
      showToast("Service d'eau ajouté avec succès !", 'success');
    } catch (error) {
      console.error('Error adding water department:', error);
      showToast("Erreur lors de l'ajout du service d'eau.", 'error');
    }
  };

  const deleteWaterDepartment = async (id) => {
    const analyses = await db.getWaterAnalyses();
    const linkedAnalyses = analyses.filter((a) => a.department_id === id || a.structure_id === id);
    const count = linkedAnalyses.length;

    if (count > 0) {
      const confirmMsg = `ATTENTION: Ce point d'eau contient ${count} analyse(s) d'historique.\n\nElles seront définitivement supprimées.\n\nConfirmer ?`;
      if (!window.confirm(confirmMsg)) return;
      await Promise.all(linkedAnalyses.map((a) => db.deleteWaterAnalysis(a.id)));
    } else {
      if (!window.confirm("Supprimer ce service d'eau ?")) return;
    }

    try {
      await db.deleteWaterDepartment(id);
      await loadWaterDepartments();
      showToast("Service d'eau et historique supprimés.", 'success');
    } catch (error) {
      console.error('Error deleting water dept:', error);
      showToast('Erreur lors de la suppression.', 'error');
    }
  };

  const handleCleanup = async () => {
    if (
      !window.confirm(
        'Voulez-vous nettoyer la base de données ?\n(Supprime les tests orphelins liés à des services supprimés)'
      )
    )
      return;

    try {
      const result = await db.cleanupOrphans();
      alert(
        `Nettoyage Terminé ! 🧹\n\nSupprimé :\n- ${result.exams} examens fantômes\n- ${result.water} analyses d'eau orphelines`
      );
      window.location.reload();
    } catch (e) {
      alert('Erreur: ' + e.message);
    }
  };

  // --- SUB-COMPONENTS FOR TABS ---

  const TabButton = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '1rem',
        border: 'none',
        borderBottom: activeTab === id ? '4px solid var(--primary)' : '4px solid transparent',
        background: activeTab === id ? 'white' : '#f1f5f9',
        color: activeTab === id ? 'var(--primary)' : 'var(--text-muted)',
        fontWeight: 'bold',
        cursor: 'pointer',
        fontSize: '1rem',
        transition: 'all 0.2s ease',
      }}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '3rem' }}>
      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <FaCog color="var(--primary)" /> Paramètres & Configuration
      </h2>

      {/* --- TAB NAVIGATION --- */}
      <div
        style={{
          display: 'flex',
          marginBottom: '2rem',
          background: '#f1f5f9',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
        }}
      >
        <TabButton id="general" icon={FaShieldAlt} label="Général" />
        <TabButton id="organization" icon={FaBuilding} label="Organisation" />
        <TabButton id="backup" icon={FaHistory} label="Sauvegardes" />
      </div>

      {/* ======================= TAB 1: GENERAL ======================= */}
      {activeTab === 'general' && (
        <div className="animate-fade-in" style={{ display: 'grid', gap: '1.5rem' }}>
          {/* Section: Affichage */}
          <div className="card" style={{ maxWidth: '600px' }}>
            <h3
              style={{
                marginTop: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--primary)',
              }}
            >
              Affichage
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: '600' }}>Mode Compact (Tableaux)</span>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Activer le défilement interne pour les tableaux longs.
                </p>
              </div>
              <button
                className="btn"
                onClick={() => setCompactMode(!compactMode)}
                style={{
                  backgroundColor: compactMode ? 'var(--primary)' : '#e2e8f0',
                  color: compactMode ? 'white' : 'var(--text-main)',
                  minWidth: '100px',
                  fontWeight: 'bold',
                }}
              >
                {compactMode ? 'Activé' : 'Désactivé'}
              </button>
            </div>

            {/* [INSERT THIS BLOCK START] */}
            {/* Force Mobile Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>Forcer "Mode Mobile"</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Optimisé pour Poco F3 / Paysage
                </div>
              </div>
              <button
                className={`btn ${forceMobile ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setForceMobile(!forceMobile)}
              >
                {forceMobile ? 'ON' : 'OFF'}
              </button>
            </div>
            {/* [INSERT THIS BLOCK END] */}

          </div>

          {/* Section: Sécurité */}
          <div className="card" style={{ maxWidth: '600px' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaLock /> Sécurité & Identité
            </h3>

            {/* Doctor Name */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Nom du Médecin (Affiché sur les rapports)
              </label>
              <input
                type="text"
                className="input"
                placeholder="Ex: Dr. Kibeche..."
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
              />
            </div>

            {/* PIN Code */}
            {showPinMigrationPrompt && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: '#fef3c7',
                  border: '2px solid #f59e0b',
                  borderRadius: '8px',
                }}
              >
                <div style={{ fontWeight: 'bold', color: '#92400e', marginBottom: '0.5rem' }}>
                  🔐 Mise à jour de sécurité requise
                </div>
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#78350f' }}>
                  Votre code PIN utilise l'ancien format vulnérable. Pour protéger les données
                  médicales, veuillez saisir un nouveau code PIN ci-dessous.
                </p>
                <button
                  className="btn btn-sm"
                  onClick={() => setShowPinMigrationPrompt(false)}
                  style={{ background: '#f59e0b', color: 'white', border: 'none' }}
                >
                  Compris, je vais changer mon PIN
                </button>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Changer le Code PIN (4 chiffres)
              </label>
              <input
                type="password"
                maxLength="4"
                placeholder="****"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={{
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  width: '100%',
                  fontSize: '1.5rem',
                  letterSpacing: '0.5rem',
                  textAlign: 'center',
                }}
              />
            </div>

            <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%' }}>
              <FaSave /> Enregistrer les modifications
            </button>
          </div>
        </div>
      )}

      {/* ======================= TAB 2: ORGANIZATION ======================= */}
      {activeTab === 'organization' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          {/* Services RH */}
          <div className="card" style={{ marginTop: 0 }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaBuilding /> Services (RH)
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Nouveau service..."
                value={newDepartmentName}
                onChange={(e) => setNewDepartmentName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addDepartment()}
                className="input"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={addDepartment}
                disabled={departmentsLoading || !newDepartmentName.trim()}
              >
                <FaPlus />
              </button>
            </div>

            <div
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '0.5rem',
                background: '#f8fafc',
              }}
            >
              {departments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                  Aucun service.
                </div>
              ) : (
                departments.map((dept) => (
                  <div
                    key={dept.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                      background: 'white',
                      marginBottom: '4px',
                      borderRadius: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: '600' }}>{dept.name}</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          background: '#e2e8f0',
                          color: '#475569',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        {dept.count || 0} agents
                      </span>
                    </div>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => deleteDepartment(dept.id)}
                      style={{ color: 'var(--danger)', borderColor: 'transparent' }}
                      title="Supprimer"
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Lieux de Travail */}
          <div className="card" style={{ marginTop: 0 }}>
            <h3
              style={{
                marginTop: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#d97706',
              }}
            >
              <FaBriefcase /> Lieux de Travail
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                placeholder="Nouveau lieu..."
                value={newWorkplaceName}
                onChange={(e) => setNewWorkplaceName(e.target.value)}
                className="input"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={addWorkplace}
                disabled={!newWorkplaceName || !newWorkplaceName.trim()}
              >
                <FaPlus />
              </button>
            </div>
            {/* New Input for Certificate Text */}
            <input
              type="text"
              placeholder="Texte certificat (ex: la CUISINE)"
              value={newWorkplaceCertText}
              onChange={(e) => setNewWorkplaceCertText(e.target.value)}
              className="input"
              style={{ fontSize: '0.9rem', marginBottom: '1rem' }}
            />

            <div
              style={{
                maxHeight: '300px',
                overflowY: 'auto',
                background: '#fffbeb',
                padding: '0.5rem',
                borderRadius: '4px',
              }}
            >
              {(!workplaces || workplaces.length === 0) && (
                <div style={{ textAlign: 'center', color: '#999', padding: '1rem' }}>
                  Aucun lieu défini
                </div>
              )}
              {workplaces &&
                workplaces.map((w) => (
                  <div
                    key={w.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      borderBottom: '1px solid #fef3c7',
                      background: 'white',
                      marginBottom: '4px',
                      borderRadius: '4px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{w.name}</div>
                      {w.certificate_text && (
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>
                          "{w.certificate_text}"
                        </div>
                      )}
                    </div>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => deleteWorkplace(w.id)}
                      style={{ color: 'var(--danger)', borderColor: 'transparent' }}
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))}
            </div>
          </div>

          {/* Services d'Eau */}
          <div className="card" style={{ marginTop: 0 }}>
            <h3
              style={{
                marginTop: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#0ea5e9',
              }}
            >
              <FaTint /> Points d'Eau
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="Nouveau point d'eau..."
                value={newWaterDepartmentName}
                onChange={(e) => setNewWaterDepartmentName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addWaterDepartment()}
                className="input"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={addWaterDepartment}
                disabled={waterDepartmentsLoading || !newWaterDepartmentName.trim()}
              >
                <FaPlus />
              </button>
            </div>

            <div
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '0.5rem',
                background: '#f0f9ff',
              }}
            >
              {waterDepartments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                  Aucun service d'eau.
                </div>
              ) : (
                waterDepartments.map((dept) => (
                  <div
                    key={dept.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      borderBottom: '1px solid #bfdbfe',
                      background: 'white',
                      marginBottom: '4px',
                      borderRadius: '4px',
                    }}
                  >
                    <span style={{ fontWeight: '500' }}>{dept.name}</span>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => deleteWaterDepartment(dept.id)}
                      style={{ color: 'var(--danger)', borderColor: 'transparent' }}
                    >
                      <FaTrash />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================= TAB 3: BACKUP & MAINTENANCE ======================= */}
      {activeTab === 'backup' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Auto Backup Status Card */}
          <div className="card" style={{ borderColor: 'var(--primary)' }}>
            <h3 style={{ marginTop: 0 }}>
              {' '}
              <FaHistory /> Statut Sauvegarde Auto
            </h3>

            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Progression vers l'export automatique:
              </div>
              <div
                style={{
                  width: '100%',
                  height: '12px',
                  backgroundColor: '#e2e8f0',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  marginBottom: '0.5rem',
                }}
              >
                <div
                  style={{
                    width: `${(backupProgress.counter / backupProgress.threshold) * 100}%`,
                    height: '100%',
                    backgroundColor:
                      backupProgress.counter >= backupProgress.threshold
                        ? 'var(--success)'
                        : 'var(--primary)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}
              >
                <span>Actuel: {backupProgress.progress} changements</span>
                <span>Seuil: {backupThreshold}</span>
              </div>

              {backupProgress.counter >= backupProgress.threshold && (
                <div style={{ marginTop: '0.5rem', color: 'var(--success)', fontWeight: 'bold' }}>
                  ⚠️ Prochain changement déclenchera une sauvegarde !
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '500' }}>Seuil:</label>
                <input
                  type="number"
                  value={backupThreshold}
                  onChange={(e) => setBackupThreshold(Number(e.target.value))}
                  style={{
                    width: '60px',
                    padding: '0.4rem',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                  }}
                />
                <button className="btn btn-sm btn-outline" onClick={handleThresholdSave}>
                  OK
                </button>
              </div>

              <div style={{ width: '1px', height: '30px', background: '#ccc' }}></div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '500' }}>Auto-Import:</label>
                <button
                  className={`btn btn-sm ${autoImportEnabled ? 'btn-primary' : 'btn-outline'}`}
                  onClick={handleToggleAutoImport}
                >
                  {autoImportEnabled ? 'Activé' : 'Désactivé'}
                </button>
              </div>
            </div>

            {/* Status Messages */}
            <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {backupStatus && (
                <div style={{ color: 'var(--primary)', fontWeight: 'bold' }}>{backupStatus}</div>
              )}
              {backupDir && <div>📂 Dossier actuel: {backupDir}</div>}
            </div>
          </div>

          {/* Actions Manuelles Grid */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              <FaDatabase /> Actions Manuelles
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
              }}
            >
              {/* Column 1: Native Backup */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#999' }}>
                  Android Native
                </h4>
                <button className="btn btn-outline" onClick={handleChooseBackupDir}>
                  📁 Choisir Dossier
                </button>
                <button className="btn btn-outline" onClick={handleGetBackupNow}>
                  💾 Sauvegarder Maintenant
                </button>
                <button className="btn btn-outline" onClick={handleImportFromBackup}>
                  📂 Importer depuis Dossier
                </button>
                <button className="btn btn-outline" onClick={handleRefreshBackupProgress}>
                  🔄 Rafraîchir
                </button>
              </div>

              {/* Column 2: File Export/Import */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: '#999' }}>
                  Fichiers (JSON)
                </h4>
                <button className="btn btn-outline" onClick={handleExportPlain}>
                  <FaDownload /> Export Simple
                </button>
                <button className="btn btn-outline" onClick={handleExportEncrypted}>
                  <FaLock /> Export Chiffré
                </button>

                <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                  <FaUpload /> Import Simple
                  <input
                    type="file"
                    ref={fileRef}
                    onChange={handleImportPlain}
                    style={{ display: 'none' }}
                  />
                </label>

                <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                  <FaUpload /> Import Chiffré
                  <input type="file" onChange={handleImportEncrypted} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>

          {/* Maintenance Zone */}
          <div className="card" style={{ borderColor: 'orange' }}>
            <h3 style={{ color: 'orange', marginTop: 0 }}>Maintenance</h3>
            <p style={{ fontSize: '0.9rem' }}>
              Utilisez cette option si vous remarquez des ralentissements ou des erreurs liées à des
              services supprimés.
            </p>
            <button
              className="btn btn-outline"
              onClick={handleCleanup}
              style={{ color: 'orange', borderColor: 'orange', width: '100%' }}
            >
              🧹 Nettoyer la Base de Données (Orphelins)
            </button>
          </div>

          {backupDir && (
            <div style={{ textAlign: 'right' }}>
              <button
                className="btn btn-sm btn-outline"
                onClick={handleClearBackupDir}
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                🗑️ Oublier le dossier de sauvegarde
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- CREDITS --- */}
      <div
        className="credit"
        style={{ marginTop: '3rem', padding: '1rem', textAlign: 'center', opacity: 0.8 }}
      >
        <div className="credit-title">Développé par</div>
        <div className="credit-author">Dr Kibeche Ali Dia Eddine</div>
        <div className="credit-version">2.1</div>
      </div>

      <ToastContainer />
    </div>
  );
}

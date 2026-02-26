# 📝 Carnet d'Idées & Roadmap

## 💡 Idées de Fonctionnalités (Backlog)

### 🩺 Valeur Médicale & Métier

- [ ] **Concept : Types d'Examens Personnalisables**
  - _Idée :_ Rendre le système générique via les paramètres.
  - _But :_ Permettre d'ajouter d'autres types que la Coprologie (ex: Visite d'embauche, Vision, Sang).
- [ ] **Concept : File d'Attente "Contre-Visites"**
  - _Idée :_ Créer une liste dédiée pour les cas positifs.
  - _But :_ Système de rappel automatique à J+7 / J+10 pour ne jamais oublier un contrôle.

### 📊 Administration & Reporting

- [x] **Concept : Export Excel Avancé**
  - _État :_ ✅ Terminé (v1.2)
  - _Détail :_ Génération de fichiers `.xlsx` avec onglets séparés (Travailleurs, Historique, Eau).
- [x] **Concept : Rapports PDF Natifs**
  - _État :_ ✅ Terminé (v1.2)
  - _Détail :_ Fiches d'aptitude, Convocations, Demandes d'analyse et Listes d'émargement groupées.
- [ ] **Concept : Tableau de Bord "Statistiques Globales"**
  - _Idée :_ Une page dédiée avec des graphiques sectoriels (Camemberts/Barres).
  - _But :_ Analyser le % de couverture vaccinale ou le taux de positivité par département.

### 🏗️ Améliorations Architecturales

- [ ] **Concept : Généraliser les Modules Travailleurs/Armes**
  - _Idée :_ Refactoriser la logique commune et les composants UI partagés entre les modules de gestion des travailleurs et des armes (qui a été forké).
  - _But :_ Réduire la duplication de code, améliorer la maintenabilité, faciliter l'ajout de nouveaux modules similaires et rendre l'architecture plus modulaire.

### 📱 Expérience Utilisateur (UX) & Mobile

- [ ] **Concept : Notifications Locales (Android)**
  - _Idée :_ L'application envoie une notification push locale chaque matin à 08h00.
  - _But :_ Rappeler proactivement : "3 visites prévues aujourd'hui" ou "Analyse d'eau requise".
- [ ] **Concept : Mode Sombre (Dark Mode)**
  - _Idée :_ Option pour basculer l'interface en noir/gris foncé.
  - _But :_ Confort visuel pour le travail de nuit et économie de batterie.
- [x] **Concept : Actions en Masse (Bulk Actions)**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Suppression, Planification, Résultats, Archivage et Impression en masse.
- [x] **Concept : Mode Compact**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Option d'affichage dense pour les listes longues.
- [ ] **Concept : Recherche Avancée**
  - _Idée :_ Filtres combinés dans la barre de recherche.
  - _But :_ Trouver "Cuisiniers" + "En Retard" + "Dep: SWAG" en une seule requête.
- [x] **Concept : Transfert de Département**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Modal pour déplacer plusieurs travailleurs entre services.

### 🔍 OCR Modal Improvements

- [x] **Concept : Tesseract Asset Availability & Error Handling**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Resolved 404 error for `fra.traineddata.gz` by ensuring local availability. Implemented robust `try-catch` in `handleGo` to prevent app crashes from OCR errors.
- [x] **Concept : Capacitor Asset Optimization for OCR**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Implemented conditional asset packaging using `scripts/prepare-capacitor-assets.js` and `vite.capacitor.config.js` to reduce APK size.

### 🔒 Sécurité & Technique

- [x] **Concept : Auto-Lock (Verrouillage Auto)**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Verrouillage automatique après 5 minutes d'inactivité pour protéger les données médicales.
- [x] **Concept : Hashed PINs**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Migration vers le hachage SHA-256 durci avec **Pepper** secret pour empêcher le brute-force.
- [x] **Concept : Chiffrement Obligatoire des Backups**
  - _État :_ ✅ Terminé (v2.1)
  - _Détail :_ Toutes les sauvegardes JSON sont désormais chiffrées par défaut avec AES-GCM.
- [ ] **Concept : Authentification Biométrique**
  - _Idée :_ Utiliser les API natives Android.
  - _But :_ Connexion par empreinte digitale ou FaceID (remplace le PIN).
- [ ] **Concept : Logs d'Audit**
  - _Idée :_ Historique technique invisible.
  - _But :_ Savoir qui a modifié une fiche et quand (traçabilité en cas d'erreur).

---

## ✅ Historique des Versions

- [x] **v1.0** : Core (Gestion Travailleurs, Examens, Eau), Sauvegarde Smart Backup.
- [x] **v1.2** : Batch Workflows (Résultats, Planning), PDF Engine, Excel Engine, Global Sync.
- [x] **v2.1** : Bulk Actions (Suppression massive, Impression groupée), Transfert inter-départements, Interface optimisée, Standalone HTML Build, **OCR Modal Improvements (Tesseract asset fix, robust error handling, Capacitor asset optimization).**

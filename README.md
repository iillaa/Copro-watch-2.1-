# Sentinel (ex-Copro-watch)

**Gestionnaire de Visites Médicales & Sécurité (Offline PWA)**

Sentinel est une application web progressive (PWA) conçue pour la gestion médicale et sécuritaire en milieu professionnel (Algérie). Elle fonctionne de manière autonome (**hors ligne**), sans serveur backend, en utilisant une base de données locale sécurisée (IndexedDB) et un système de synchronisation par fichiers JSON.

---

## 🌟 Fonctionnalités Clés

### 1. 🏥 Santé au Travail
- **Suivi des Visites** : Planification automatique des visites périodiques (6 mois) et des contre-visites.
- **Workflow Médical** : Gestion des examens (Copro-parasitologie), résultats labo, et certificats d'aptitude.
- **Tableau de Bord** : Vue synthétique des retards, des cas positifs et des actions urgentes.

### 2. 🛡️ Gestion des Armes
- **Permis de Port d'Arme** : Suivi des dates d'expiration et des renouvellements.
- **Aptitude** : Liaison directe avec le dossier médical pour valider l'aptitude au port d'arme.

### 3. 💧 Qualité de l'Eau
- **Analyses Mensuelles** : Saisie des relevés (Chlore, pH, Bactério) par service/bâtiment.
- **Statistiques** : Taux de potabilité et alertes de non-conformité.

---

## 👩‍💻 Guide du Développeur

Cette section est destinée aux ingénieurs souhaitant maintenir ou faire évoluer le projet.

### Prérequis

- **Node.js** : v18 ou supérieur
- **NPM** : v9 ou supérieur
- **Navigateur** : Chrome, Edge ou Firefox (Support IndexedDB requis)

### Installation

Clonez le projet et installez les dépendances :

```bash
git clone <url-du-repo>
cd sentinel
npm install
```

### Commandes Disponibles

| Commande | Description |
| :--- | :--- |
| `npm run dev` | Lance le serveur de développement (Vite) sur `http://localhost:5173`. |
| `npm run build` | Compile l'application pour la production dans le dossier `dist/`. |
| `npm run build:standalone` | Génère une **version portable** (fichier unique HTML) dans `dist-standalone/`. |
| `npm run lint` | Analyse le code avec ESLint pour détecter les erreurs. |
| `npm test` | Lance les tests unitaires avec Vitest. |
| `npm run preview` | Prévisualise la version de production localement. |

### Structure du Code

L'architecture suit une approche modulaire React standard.

```
src/
├── components/       # Composants UI (Tableaux, Formulaires, Modales)
│   ├── Weapons/      # Module Armes
│   ├── Dashboard.jsx # Vue principale
│   └── ...
├── services/         # Logique Métier & Base de Données
│   ├── db.js         # Couche d'accès aux données (Dexie.js / IndexedDB)
│   ├── logic.js      # ⛔ ALGORITHMES MÉDICAUX (NE PAS TOUCHER)
│   ├── backup.js     # Système d'import/export JSON
│   └── ...
├── assets/           # Images et styles globaux
└── App.jsx           # Routeur et Layout principal
```

### ⛔ Contraintes Critiques

Pour garantir la stabilité et la conformité légale de l'application, certaines règles strictes s'appliquent :

1.  **Fichiers Interdits** : Ne modifiez jamais `src/services/logic.js`. Ce fichier contient les algorithmes de calcul des dates d'expiration et d'aptitude validés médicalement.
2.  **Persistance** : Ne changez pas la structure de la base de données dans `src/services/db.js` sans prévoir une migration de données (Dexie versioning).
3.  **UI/UX** : Les modifications visuelles doivent rester légères et ne pas impacter le flux de travail des médecins.

---

## 📱 Déploiement & Utilisation

### Option A : Version Web (Recommandé)
1.  Exécutez `npm run build`.
2.  Déployez le contenu du dossier `dist/` sur n'importe quel serveur web statique (Apache, Nginx, Vercel, Netlify).

### Option B : Version Portable (Clé USB)
1.  Exécutez `npm run build:standalone`.
2.  Copiez le fichier `dist-standalone/index.html` sur une clé USB.
3.  Ouvrez-le sur n'importe quel PC (Windows/Mac/Linux) directement dans le navigateur.

### Sauvegardes & Sécurité
- L'application sauvegarde automatiquement les données dans le navigateur.
- **Important** : Effectuez régulièrement un **Export JSON** (via les Paramètres) pour sécuriser vos données sur un support externe.

---

## 📜 Licence

Ce logiciel est une propriété interne destinée à un usage médical professionnel.
Code source protégé.

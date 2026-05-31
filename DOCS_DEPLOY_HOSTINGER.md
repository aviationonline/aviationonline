# Guide de Déploiement sur Hostinger Mutualisé

Ce projet utilise une architecture **Full-stack (Express + Vite)** pour sécuriser les clés API (Stripe, Firebase Admin). Voici comment le déployer sur votre hébergement Hostinger.

## 1. Préparation du Build

Exécutez la commande suivante localement ou via votre CI/CD (GitHub Actions) :

```bash
npm run build
```

Cela générera un dossier `dist/` contenant :
- Les fichiers statiques du frontend.
- Un fichier `server.cjs` qui est votre serveur backend **tout-en-un**.

## 2. Configuration sur Hostinger (hPanel)

1. Connectez-vous à votre **hPanel Hostinger**.
2. Allez dans **Avancé > Node.js**.
3. Créez une nouvelle application Node.js :
   - **Version de Node.js** : Sélectionnez **20.x** ou plus récent.
   - **Dossier de l'application** : `aviation-online` (ou le nom de votre choix).
   - **Fichier de démarrage** : `dist/server.cjs`.
4. Cliquez sur **Créer**.

## 3. Mise en ligne des fichiers

Utilisez le **Gestionnaire de fichiers** ou un client **FTP** pour uploader l'intégralité du projet (incluant le dossier `dist`) dans le dossier de l'application créé à l'étape précédente.

## 4. Variables d'Environnement

Dans le hPanel, sous la configuration de votre application Node.js, ajoutez les variables suivantes :

- `NODE_ENV`: `production`
- `STRIPE_SECRET_KEY`: `votre_cle_secrete`
- `STRIPE_WEBHOOK_SECRET`: `votre_secret_webhook`
- `RESEND_API_KEY`: `votre_cle_resend`
- `PROJECT_ID`: `votre_id_projet_firebase`

## 5. Gestion de la base de données Firebase

Assurez-vous que le fichier `firebase-applet-config.json` et `serviceAccountKey.json` sont présents à la racine de votre application sur Hostinger pour permettre au serveur Express de s'y connecter.

## 6. Pourquoi cette nouvelle version ?

Nous avons migré de **Tailwind CSS v4** à **v3.4** pour éliminer les erreurs de "native binding" (`@tailwindcss/oxide`) qui bloquaient vos déploiements. Cette version est **100% JavaScript**, ce qui la rend parfaitement compatible avec les environnements mutualisés restreints comme Hostinger.

---
*Support Technique Aviation Online*

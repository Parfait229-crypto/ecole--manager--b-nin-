# École Manager Bénin — paiement réel FedaPay

Cette version remplace le bouton de paiement simulé par un flux FedaPay avec activation automatique de l'abonnement après confirmation serveur.

## Flux
1. L'école choisit une formule payante.
2. Le serveur crée la transaction FedaPay.
3. L'école est redirigée vers la page de paiement FedaPay.
4. FedaPay envoie un webhook au serveur.
5. Le serveur vérifie le statut de la transaction.
6. Si le paiement est `approved`, la formule est activée pour 1 mois.

## Avant de recevoir de vrais paiements
- Créer/activer votre compte marchand FedaPay.
- Commencer avec les clés Sandbox.
- Copier `.env.example` vers `.env` et renseigner les clés.
- Installer les dépendances avec `npm install`.
- Lancer avec `npm start`.
- Pour la production, utiliser une URL HTTPS publique et configurer dans FedaPay le webhook : `https://VOTRE-DOMAINE/webhooks/fedapay`.
- Remplacer les clés Sandbox par les clés Live après validation du compte.

**Important :** ne mettez jamais `FEDAPAY_SECRET_KEY` dans le HTML ou JavaScript envoyé au navigateur.

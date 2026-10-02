import express from 'express';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// fedapay est une librairie CommonJS : on la charge avec require pour éviter les erreurs d'import.
const require = createRequire(import.meta.url);
const { FedaPay, Transaction, Customer } = require('fedapay');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const DB_FILE = path.join(process.cwd(), 'subscriptions.json');

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { schools: {}, payments: {} }; }
}
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

if (!process.env.FEDAPAY_SECRET_KEY) {
  console.warn('FEDAPAY_SECRET_KEY manquante : le serveur démarre, mais les paiements réels ne fonctionneront pas.');
}

FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY || '');
FedaPay.setEnvironment(process.env.FEDAPAY_ENV || 'sandbox');

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));
// On ne sert QUE index.html (pas server.js, package.json, subscriptions.json ni .env).
app.get('/', (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(process.cwd(), 'index.html')));

const plans = {
  'École': { price: 5000 },
  'École Plus': { price: 10000 },
  'Premium': { price: 20000 }
};

app.post('/api/create-payment', async (req, res) => {
  try {
    const { schoolId, plan, firstname, lastname, email, phone } = req.body || {};
    if (!schoolId || !plans[plan] || !firstname || !lastname || !email || !phone) {
      return res.status(400).json({ error: 'Informations de paiement incomplètes.' });
    }

    const db = readDB();
    const existingSchool = db.schools[schoolId] || { id: schoolId, plan: 'Gratuit', expiresAt: null };

    const customer = await Customer.create({
      firstname,
      lastname,
      email,
      phone_number: { number: String(phone).replace(/^\+229/, ''), country: 'bj' }
    });

    const transaction = await Transaction.create({
      description: `École Manager Bénin — abonnement ${plan}`,
      amount: plans[plan].price,
      currency: { iso: 'XOF' },
      customer: { id: customer.id },
      callback_url: `${APP_URL}/?payment=return&schoolId=${encodeURIComponent(schoolId)}`,
      metadata: { schoolId, plan, paymentPurpose: 'subscription' }
    });

    const token = await transaction.generateToken();
    const paymentUrl = token.url || token;

    db.payments[String(transaction.id)] = {
      id: String(transaction.id), schoolId, plan,
      amount: plans[plan].price,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    db.schools[schoolId] = existingSchool;
    writeDB(db);

    res.json({ paymentUrl, transactionId: transaction.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Impossible de créer le paiement.', detail: err?.message || String(err) });
  }
});

// FedaPay appelle cette URL après les changements d'état. Configurez-la dans le Dashboard FedaPay.
app.post('/webhooks/fedapay', async (req, res) => {
  try {
    const event = req.body || {};
    const entity = typeof event.entity === 'string' ? JSON.parse(event.entity) : (event.entity || {});
    const type = event.name || event.type || '';
    const transactionId = String(entity.id || entity.transaction_id || '');

    if (!transactionId) return res.status(200).send('OK');

    const db = readDB();
    const payment = db.payments[transactionId];
    if (!payment) return res.status(200).send('OK');

    // Pour un événement de réussite, on revérifie le statut auprès de FedaPay avant d'activer Premium.
    if (/approved|paid|success/i.test(type) || /approved|paid|success/i.test(entity.status || '')) {
      const verified = await Transaction.retrieve(transactionId);
      const status = String(verified?.status || '').toLowerCase();
      if (status === 'approved') {
        payment.status = 'paid';
        payment.paidAt = new Date().toISOString();
        const school = db.schools[payment.schoolId] || { id: payment.schoolId };
        const currentExpiry = school.expiresAt && new Date(school.expiresAt) > new Date()
          ? new Date(school.expiresAt)
          : new Date();
        currentExpiry.setMonth(currentExpiry.getMonth() + 1);
        school.plan = payment.plan;
        school.expiresAt = currentExpiry.toISOString();
        school.lastTransactionId = transactionId;
        db.schools[payment.schoolId] = school;
        writeDB(db);
      }
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).send('OK');
  }
});

app.get('/api/subscription/:schoolId', (req, res) => {
  const db = readDB();
  const school = db.schools[req.params.schoolId] || { id: req.params.schoolId, plan: 'Gratuit', expiresAt: null };
  const expired = school.expiresAt && new Date(school.expiresAt) <= new Date();
  if (expired && school.plan !== 'Gratuit') school.plan = 'Gratuit';
  res.json({ ...school, expired: Boolean(expired) });
});

app.get('/api/health', (req, res) => res.json({ ok: true, gateway: 'FedaPay', environment: process.env.FEDAPAY_ENV || 'sandbox' }));

app.listen(PORT, () => console.log(`École Manager Bénin: ${APP_URL} (port ${PORT})`));

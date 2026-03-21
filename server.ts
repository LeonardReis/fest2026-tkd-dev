import express from "express";
import { createServer as createViteServer } from "vite";
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import cors from 'cors';
import path from 'path';
import * as dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config();

// Initialize Firebase Admin
// This requires FIREBASE_SERVICE_ACCOUNT_KEY environment variable to be set with the JSON string
let db: FirebaseFirestore.Firestore | null = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({
      credential: cert(serviceAccount)
    });
    db = getFirestore();
    console.log("Firebase Admin initialized successfully.");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY not found. Webhook won't be able to update Firestore.");
  }
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Initialize Mercado Pago
  const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
    options: { timeout: 5000 }
  });

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Create Payment Endpoint (Checkout Pro)
  app.post("/api/payments/create", async (req, res) => {
    try {
      if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
        return res.status(500).json({ error: "MERCADOPAGO_ACCESS_TOKEN não configurado." });
      }

      const { transaction_amount, description, payer_email, external_reference } = req.body;

      const preference = new Preference(client);

      const result = await preference.create({
        body: {
          items: [
            {
              id: 'inscricao_festival',
              title: description,
              quantity: 1,
              unit_price: Number(transaction_amount),
              currency_id: 'BRL',
            }
          ],
          payer: {
            email: payer_email,
          },
          external_reference: external_reference, // We pass the academyId here
          // notification_url: `${process.env.APP_URL}/api/payments/webhook`, // Optional: if we have a public URL
          back_urls: {
            success: `${process.env.APP_URL || 'http://localhost:3000'}/`,
            failure: `${process.env.APP_URL || 'http://localhost:3000'}/`,
            pending: `${process.env.APP_URL || 'http://localhost:3000'}/`,
          },
          auto_return: 'approved',
        }
      });

      res.json({
        id: result.id,
        init_point: result.init_point,
        sandbox_init_point: result.sandbox_init_point,
      });
    } catch (error) {
      console.error("Error creating preference:", error);
      res.status(500).json({ error: "Erro ao criar checkout de pagamento" });
    }
  });

  // Webhook Endpoint (Receives notifications from Mercado Pago)
  app.post("/api/payments/webhook", async (req, res) => {
    try {
      const { action, data } = req.body;
      
      if (action === 'payment.updated' || action === 'payment.created') {
        const paymentId = data.id;
        const payment = new Payment(client);
        const paymentInfo = await payment.get({ id: paymentId });
        
        if (paymentInfo.status === 'approved') {
          const academyId = paymentInfo.external_reference;
          console.log(`Payment ${paymentId} approved for academy ${academyId}`);
          
          if (db && academyId) {
            // Find all pending registrations for this academy
            const registrationsRef = db.collection('registrations');
            const snapshot = await registrationsRef
              .where('academyId', '==', academyId)
              .where('paymentStatus', '==', 'Pendente')
              .get();
              
            if (snapshot.empty) {
              console.log(`No pending registrations found for academy ${academyId}`);
            } else {
              const batch = db.batch();
              snapshot.docs.forEach((doc) => {
                batch.update(doc.ref, { 
                  paymentStatus: 'Pago',
                  status: 'Confirmado'
                });
              });
              await batch.commit();
              console.log(`Successfully updated ${snapshot.size} registrations to Pago for academy ${academyId}`);
            }
          }
        }
      }
      
      res.status(200).send('OK');
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).send('Error processing webhook');
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

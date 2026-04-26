import express from "express";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
  const PORT = parseInt(process.env.PORT || "8080");

  app.use(helmet({
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://apis.google.com", "https://www.gstatic.com", "https://*.firebaseapp.com", "https://*.googleapis.com"],
        connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "https://*.firebaseapp.com", "https://*.google-analytics.com"],
        imgSrc: ["'self'", "data:", "https://*.google.com", "https://*.googleapis.com", "https://*.gstatic.com", "https://*.google-analytics.com", "https://www.google.com", "https://lh3.googleusercontent.com", "https://grainy-gradients.vercel.app"],
        frameSrc: ["'self'", "https://*.firebaseapp.com", "https://*.web.app", "https://*.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://www.gstatic.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://www.gstatic.com"],
        upgradeInsecureRequests: [],
      },
    },
  }));
  app.use(cors({
    origin: process.env.NODE_ENV === "production" ? (process.env.APP_URL || false) : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-signature', 'x-api-key']
  }));
  app.use(express.json());

  // Rate Limiter para impedir abusos (DDoS/Força Bruta) na criação de checkouts
  const paymentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 10, // máximo de 10 boletos/checkouts por IP
    message: { error: "Muitas tentativas de checkout detectadas. Aguarde 10 minutos." }
  });

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
  app.post("/api/payments/create", paymentLimiter, async (req, res) => {
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
            success: `${process.env.APP_URL || 'http://localhost:' + PORT}/`,
            failure: `${process.env.APP_URL || 'http://localhost:' + PORT}/`,
            pending: `${process.env.APP_URL || 'http://localhost:' + PORT}/`,
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
      const signatureHeader = req.headers['x-signature'] as string;
      const requestId = req.headers['x-request-id'] as string;
      const { action, data } = req.body;
      
      // Validação de Integridade (HMAC) se a secret estiver configurada
      if (process.env.MERCADOPAGO_WEBHOOK_SECRET && signatureHeader && requestId && data?.id) {
        const parts = signatureHeader.split(',');
        let ts = '';
        let v1 = '';
        parts.forEach(part => {
          const [key, value] = part.split('=');
          if (key === 'ts') ts = value;
          if (key === 'v1') v1 = value;
        });

        const manifest = `id:${data.id};request-id:${requestId};ts:${ts};`;
        const hmac = crypto.createHmac('sha256', process.env.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
        
        if (hmac !== v1) {
          console.warn(`[Segurança] Assinatura de webhook inválida detectada. Ação: ${action}`);
          return res.status(403).send('Invalid signature');
        }
      }

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

  // ─── Results Export Endpoint (tkd-platform integration) ───────────────────
  app.get("/api/v1/results", async (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.FESTIVAL_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      return res.status(401).json({ error: "Chave de API inválida ou ausente." });
    }

    if (!db) {
      return res.status(503).json({ error: "Banco de dados não disponível. Configure FIREBASE_SERVICE_ACCOUNT_KEY." });
    }

    try {
      const [athletesSnap, registrationsSnap] = await Promise.all([
        db.collection('athletes').get(),
        db.collection('registrations').where('status', '==', 'Confirmado').get(),
      ]);

      const athleteMap = new Map<string, Record<string, unknown>>();
      athletesSnap.docs.forEach(doc => {
        athleteMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      const payload: Record<string, unknown>[] = [];

      registrationsSnap.docs.forEach(doc => {
        const reg = doc.data();
        const athlete = athleteMap.get(reg.athleteId as string);
        if (!athlete || !Array.isArray(reg.results) || reg.results.length === 0) return;

        const validResults = (reg.results as Record<string, unknown>[]).filter(
          r => r.place !== null && r.place !== 'WO'
        );

        if (validResults.length === 0) return;

        payload.push({
          athlete: {
            id: athlete.id,
            name: athlete.name,
            birthYear: athlete.birthYear,
            gender: athlete.gender,
            belt: athlete.belt,
            weight: athlete.weight,
            academyId: athlete.academyId,
          },
          results: validResults.map(r => ({
            groupKey: r.groupKey,
            modality: r.modality ?? null,
            place: r.place,
            score: r.score ?? null,
          })),
        });
      });

      res.json({
        festival: 'Festival de Taekwondo Colombo 2026',
        date: '2026-04-12',
        exportedAt: new Date().toISOString(),
        totalAthletes: payload.length,
        data: payload,
      });
    } catch (err) {
      console.error("[/api/v1/results] Erro:", err);
      res.status(500).json({ error: "Erro interno ao agregar resultados." });
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
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();

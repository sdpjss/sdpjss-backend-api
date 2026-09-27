import express from "express";
import cors from "cors";
import helmet from "helmet";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import userRouter from "./routes/userRoute.js";
import adminRouter from "./routes/adminRoute.js";
import commonRouter from "./routes/commonRoute.js";
import khandanRouter from "./routes/khandanRoute.js";
import additionalRouter from "./routes/additionalRoute.js";
import todoRouter from "./routes/todoRoute.js";
import { handleRazorpayWebhook } from "./controllers/settlementController.js";
import { syncRecentSettlements } from "./services/razorpaySettlementService.js";
import { reconcilePendingDonations } from "./controllers/userController.js";

//app config
const app = express();
const port = process.env.PORT || 4000;
await connectDB();
await connectCloudinary();

// CORS configuration with whitelisted domains
const allowedOrigins = process.env.ALLOWED_CORS_ORIGINS;
console.log("Allowed CORS Origins:", allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // If you need to send cookies/auth headers
  optionsSuccessStatus: 200, // For legacy browser support
};

// Middleware to set no-cache headers
const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
};

// Razorpay signatures must be generated from the unchanged raw request body.
app.post(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  handleRazorpayWebhook
);

//middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(noCache);
app.use(helmet());

// Serving static files from the 'public' directory
app.use('/public', express.static('public'));

//api endpoints
app.use("/api/user", userRouter);
app.use("/api/khandan", khandanRouter);
app.use("/api/admin", adminRouter);
app.use("/api/c", commonRouter);
app.use("/api/additional", additionalRouter);
app.use("/api/todopages", todoRouter);

app.get("/", (req, res) => {
  res.send("API WORKING");
});

app.listen(port, () => console.log("Server Started", port));

const settlementSyncEnabled =
  process.env.RAZORPAY_SETTLEMENT_SYNC_ENABLED !== "false";
const configuredIntervalHours = Number(
  process.env.RAZORPAY_SETTLEMENT_SYNC_INTERVAL_HOURS || 6
);
const settlementSyncIntervalMs =
  (Number.isFinite(configuredIntervalHours) && configuredIntervalHours > 0
    ? configuredIntervalHours
    : 6) *
  60 *
  60 *
  1000;

const runScheduledSettlementSync = async () => {
  try {
    await syncRecentSettlements();
  } catch (error) {
    console.error(
      "Scheduled Razorpay settlement synchronization failed:",
      error?.error?.description || error.message
    );
  }
};

if (settlementSyncEnabled) {
  const initialSyncTimer = setTimeout(runScheduledSettlementSync, 60 * 1000);
  initialSyncTimer.unref();
  const settlementSyncTimer = setInterval(
    runScheduledSettlementSync,
    settlementSyncIntervalMs
  );
  settlementSyncTimer.unref();
}

const paymentReconciliationEnabled =
  process.env.RAZORPAY_PAYMENT_RECONCILIATION_ENABLED !== "false";
const configuredPaymentReconciliationMinutes = Number(
  process.env.RAZORPAY_PAYMENT_RECONCILIATION_INTERVAL_MINUTES || 60
);
const paymentReconciliationIntervalMs =
  (Number.isFinite(configuredPaymentReconciliationMinutes) &&
  configuredPaymentReconciliationMinutes > 0
    ? configuredPaymentReconciliationMinutes
    : 60) *
  60 *
  1000;

const runScheduledPaymentReconciliation = async () => {
  try {
    await reconcilePendingDonations();
  } catch (error) {
    console.error(
      "Scheduled Razorpay payment reconciliation failed:",
      error?.error?.description || error.message
    );
  }
};

if (paymentReconciliationEnabled) {
  const initialPaymentReconciliationTimer = setTimeout(
    runScheduledPaymentReconciliation,
    60 * 1000
  );
  initialPaymentReconciliationTimer.unref();
  const paymentReconciliationTimer = setInterval(
    runScheduledPaymentReconciliation,
    paymentReconciliationIntervalMs
  );
  paymentReconciliationTimer.unref();
}

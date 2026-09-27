import crypto from "crypto";
import donationModel from "../models/DonationModel.js";
import razorpaySettlementModel from "../models/RazorpaySettlementModel.js";
import razorpaySettlementTransactionModel from "../models/RazorpaySettlementTransactionModel.js";
import razorpaySettlementSyncModel from "../models/RazorpaySettlementSyncModel.js";
import razorpayWebhookEventModel from "../models/RazorpayWebhookEventModel.js";
import {
  getIndiaYearMonth,
  getPeriodFromUnix,
  getPeriodRange,
  syncSettlementPeriod,
  syncSettlementYear,
  upsertWebhookSettlement,
} from "../services/razorpaySettlementService.js";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getRazorpayErrorMessage = (error) =>
  error?.error?.description ||
  error?.error?.reason ||
  error?.message ||
  "Unable to synchronize settlement information from Razorpay";

const validateYear = (value) => {
  const currentYear = getIndiaYearMonth().year;
  const year = Number(value || currentYear);
  if (!Number.isInteger(year) || year < 2000 || year > currentYear) {
    return { error: `Year must be between 2000 and ${currentYear}` };
  }
  return { year };
};

const getRazorpaySettlements = async (req, res) => {
  try {
    const validation = validateYear(req.query.year);
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }
    const { year } = validation;
    const { start: rangeStart } = getPeriodRange(year, 1);
    const { end: rangeEnd } = getPeriodRange(year, 12);
    const settlements = await razorpaySettlementModel
      .find({
        $or: [
          { scheduledAt: { $gte: rangeStart, $lt: rangeEnd } },
          {
            scheduledAt: null,
            createdAtRazorpay: { $gte: rangeStart, $lt: rangeEnd },
          },
        ],
      })
      .sort({ scheduledAt: -1, createdAtRazorpay: -1 })
      .lean();
    const settlementIds = settlements.map(
      (settlement) => settlement.razorpaySettlementId
    );
    const transactions = settlementIds.length
      ? await razorpaySettlementTransactionModel
          .find({ razorpaySettlementId: { $in: settlementIds } })
          .sort({ settledAt: -1, createdAtRazorpay: -1 })
          .lean()
      : [];
    const transactionsBySettlement = new Map();
    transactions.forEach((transaction) => {
      const group =
        transactionsBySettlement.get(transaction.razorpaySettlementId) || [];
      group.push(transaction);
      transactionsBySettlement.set(transaction.razorpaySettlementId, group);
    });

    const now = Date.now();
    const responseSettlements = settlements.map((settlement) => {
      const settlementTransactions =
        transactionsBySettlement.get(settlement.razorpaySettlementId) || [];
      const isFuture =
        settlement.status === "created" ||
        (settlement.scheduledAt
          ? new Date(settlement.scheduledAt).getTime() > now
          : false);

      return {
        id: settlement.razorpaySettlementId,
        status: settlement.status,
        amountPaise: settlement.amountPaise,
        actualSettledAmountPaise:
          settlement.status === "processed" && !isFuture
            ? settlement.amountPaise
            : 0,
        feesPaise: settlement.feesPaise,
        taxPaise: settlement.taxPaise,
        utr: settlement.utr,
        createdAt: settlement.createdAtRazorpay,
        scheduledAt: settlement.scheduledAt,
        isFuture,
        matchedReceiptCount: settlementTransactions.filter(
          (transaction) => transaction.matched
        ).length,
        receiptMappableCount: settlementTransactions.filter(
          (transaction) => transaction.paymentId
        ).length,
        transactionCount: settlementTransactions.length,
        transactions: settlementTransactions.map((transaction) => ({
          id: transaction.reconciliationKey,
          settlementId: transaction.razorpaySettlementId,
          entityId: transaction.entityId,
          paymentId: transaction.paymentId,
          orderId: transaction.orderId,
          type: transaction.type,
          method: transaction.method,
          currency: transaction.currency,
          grossAmountPaise: transaction.grossAmountPaise,
          creditPaise: transaction.creditPaise,
          debitPaise: transaction.debitPaise,
          feePaise: transaction.feePaise,
          taxPaise: transaction.taxPaise,
          netPaise: transaction.creditPaise - transaction.debitPaise,
          settled: transaction.settled,
          onHold: transaction.onHold,
          createdAt: transaction.createdAtRazorpay,
          settledAt: transaction.settledAt,
          settlementUtr: transaction.settlementUtr,
          receiptId: transaction.receiptId,
          donationId: transaction.donationId,
          donorName: transaction.donorName,
          donationAmount: transaction.donationAmount,
          localPaymentStatus: transaction.localPaymentStatus,
          matched: transaction.matched,
        })),
      };
    });

    const localRazorpayDonations = await donationModel
      .find({
        paymentStatus: "completed",
        transactionId: { $regex: /^pay_/ },
        createdAt: { $gte: rangeStart, $lt: rangeEnd },
      })
      .select("transactionId receiptId amount paymentStatus userId date createdAt")
      .populate("userId", "fullname")
      .lean();
    const localPaymentIds = localRazorpayDonations.map(
      (donation) => donation.transactionId
    );
    const settledTransactions = localPaymentIds.length
      ? await razorpaySettlementTransactionModel
          .find({
            type: "payment",
            settled: true,
            paymentId: { $in: localPaymentIds },
          })
          .select("paymentId")
          .lean()
      : [];
    const settledPaymentIds = new Set(
      settledTransactions.map((transaction) => transaction.paymentId)
    );
    const awaitingSettlement = localRazorpayDonations
      .filter((donation) => !settledPaymentIds.has(donation.transactionId))
      .map((donation) => ({
        donationId: donation._id,
        paymentId: donation.transactionId,
        receiptId: donation.receiptId || null,
        amount: donation.amount,
        donorName: donation.userId?.fullname || null,
        paymentStatus: donation.paymentStatus,
        donatedAt: donation.date || donation.createdAt,
      }));
    const processedSettlements = responseSettlements.filter(
      (settlement) => settlement.status === "processed" && !settlement.isFuture
    );
    const upcomingSettlements = responseSettlements.filter(
      (settlement) => settlement.isFuture || settlement.status === "created"
    );
    const syncRecords = await razorpaySettlementSyncModel
      .find({ year })
      .sort({ month: 1 })
      .lean();
    const completedSyncs = syncRecords.filter(
      (record) => record.status === "completed" && record.completedAt
    );
    const generatedAt =
      completedSyncs
        .map((record) => new Date(record.completedAt))
        .sort((a, b) => b - a)[0] || null;

    return res.json({
      success: true,
      year,
      generatedAt,
      dataSource: "database",
      summary: {
        actualSettledAmountPaise: processedSettlements.reduce(
          (sum, settlement) =>
            sum + toNumber(settlement.actualSettledAmountPaise),
          0
        ),
        upcomingAmountPaise: upcomingSettlements.reduce(
          (sum, settlement) => sum + toNumber(settlement.amountPaise),
          0
        ),
        awaitingDonationAmount: awaitingSettlement.reduce(
          (sum, donation) => sum + toNumber(donation.amount),
          0
        ),
        processedSettlementCount: processedSettlements.length,
        upcomingSettlementCount: upcomingSettlements.length,
        failedSettlementCount: responseSettlements.filter(
          (settlement) => settlement.status === "failed"
        ).length,
        unmatchedTransactionCount: transactions.filter(
          (transaction) => transaction.paymentId && !transaction.matched
        ).length,
      },
      settlements: responseSettlements,
      awaitingSettlement,
      sync: {
        records: syncRecords,
        failedPeriods: syncRecords.filter(
          (record) => record.status === "failed"
        ),
      },
    });
  } catch (error) {
    console.error("Error reading Razorpay settlement reconciliation:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to read locally stored settlement reconciliation",
    });
  }
};

const synchronizeRazorpaySettlements = async (req, res) => {
  try {
    const validation = validateYear(req.body?.year || req.query.year);
    if (validation.error) {
      return res.status(400).json({ success: false, message: validation.error });
    }
    const { results, failures } = await syncSettlementYear(
      validation.year,
      "manual"
    );
    if (!results.length && failures.length) {
      return res.status(502).json({
        success: false,
        message: failures[0].message,
        failures,
      });
    }
    return res.json({
      success: true,
      message: failures.length
        ? `Settlement sync completed with ${failures.length} failed period(s)`
        : `Razorpay settlements synchronized for ${validation.year}`,
      results,
      failures,
    });
  } catch (error) {
    console.error("Error synchronizing Razorpay settlements:", error);
    return res.status(error?.statusCode || 502).json({
      success: false,
      message: getRazorpayErrorMessage(error),
    });
  }
};

const signaturesMatch = (rawBody, signature, secret) => {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(String(signature), "utf8");
  return (
    expectedBuffer.length === signatureBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  );
};

const processSettlementWebhookEvent = async (eventKey, payload, entity) => {
  try {
    await razorpayWebhookEventModel.findOneAndUpdate(
      { eventKey },
      { $set: { status: "processing", error: null } }
    );
    await upsertWebhookSettlement(entity, payload.event);
    const period = getPeriodFromUnix(entity.created_at);
    await syncSettlementPeriod(period.year, period.month, "webhook");
    await razorpayWebhookEventModel.findOneAndUpdate(
      { eventKey },
      { $set: { status: "processed", processedAt: new Date(), error: null } }
    );
  } catch (error) {
    console.error("Error processing Razorpay settlement webhook:", error);
    await razorpayWebhookEventModel.findOneAndUpdate(
      { eventKey },
      {
        $set: {
          status: "failed",
          processedAt: new Date(),
          error: getRazorpayErrorMessage(error),
        },
      }
    );
  }
};

const handleRazorpayWebhook = async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(req.body || "");
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.get("x-razorpay-signature");

  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
    return res.status(503).json({ success: false, message: "Webhook unavailable" });
  }
  if (!signaturesMatch(rawBody, signature, webhookSecret)) {
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ success: false, message: "Invalid webhook payload" });
  }

  try {
    const entity = payload?.payload?.settlement?.entity;
    const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const eventKey = req.get("x-razorpay-event-id") || payloadHash;
    const existing = await razorpayWebhookEventModel.findOne({ eventKey }).lean();
    if (
      existing &&
      ["processing", "processed", "ignored"].includes(existing.status)
    ) {
      return res.json({ success: true, duplicate: true });
    }
    const isSettlementEvent =
      String(payload.event || "").startsWith("settlement.") && entity?.id;
    await razorpayWebhookEventModel.findOneAndUpdate(
      { eventKey },
      {
        $set: {
          eventType: payload.event || "unknown",
          accountId: payload.account_id || null,
          settlementId: entity?.id || null,
          status: isSettlementEvent ? "received" : "ignored",
          receivedAt: new Date(),
          processedAt: isSettlementEvent ? null : new Date(),
          error: null,
        },
      },
      { upsert: true, new: true }
    );
    if (!isSettlementEvent) {
      return res.json({ success: true, ignored: true });
    }

    await upsertWebhookSettlement(entity, payload.event);
    res.json({ success: true });
    setImmediate(() => processSettlementWebhookEvent(eventKey, payload, entity));
  } catch (error) {
    console.error("Error accepting Razorpay webhook:", error);
    return res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
};

export {
  getRazorpaySettlements,
  handleRazorpayWebhook,
  synchronizeRazorpaySettlements,
};

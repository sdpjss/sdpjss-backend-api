import Razorpay from "razorpay";
import donationModel from "../models/DonationModel.js";
import razorpaySettlementModel from "../models/RazorpaySettlementModel.js";
import razorpaySettlementTransactionModel from "../models/RazorpaySettlementTransactionModel.js";
import razorpaySettlementSyncModel from "../models/RazorpaySettlementSyncModel.js";

const SETTLEMENT_PAGE_SIZE = 100;
const RECONCILIATION_PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const activeSyncs = new Map();

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (unixTimestamp) =>
  unixTimestamp ? new Date(unixTimestamp * 1000) : null;

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials are not configured");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const fetchAllPages = async (fetchPage, pageSize) => {
  const allItems = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetchPage(page * pageSize, pageSize);
    const items = Array.isArray(response)
      ? response
      : Array.isArray(response?.items)
        ? response.items
        : response?.entity_id
          ? [response]
          : [];

    allItems.push(...items);
    if (items.length < pageSize) break;
  }

  return allItems;
};

const getPeriodRange = (year, month) => {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const start = new Date(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`
  );
  const end = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+05:30`
  );
  return { start, end };
};

const getIndiaYearMonth = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month) };
};

const getPeriodFromUnix = (unixTimestamp) =>
  getIndiaYearMonth(toDate(unixTimestamp) || new Date());

const validatePeriod = (year, month) => {
  if (!Number.isInteger(year) || year < 2000) {
    throw new Error("A valid settlement year is required");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("A valid settlement month is required");
  }
};

const mapDonations = async (entries) => {
  const paymentIds = [
    ...new Set(
      entries
        .map(
          (entry) =>
            entry.payment_id ||
            (entry.type === "payment" ? entry.entity_id : null)
        )
        .filter(Boolean)
    ),
  ];
  const orderIds = [
    ...new Set(entries.map((entry) => entry.order_id).filter(Boolean)),
  ];
  const conditions = [];
  if (paymentIds.length) conditions.push({ transactionId: { $in: paymentIds } });
  if (orderIds.length) conditions.push({ razorpayOrderId: { $in: orderIds } });
  if (!conditions.length) {
    return { byPaymentId: new Map(), byOrderId: new Map() };
  }

  const donations = await donationModel
    .find({ $or: conditions })
    .select(
      "transactionId razorpayOrderId receiptId amount paymentStatus userId"
    )
    .populate("userId", "fullname")
    .lean();
  const byPaymentId = new Map();
  const byOrderId = new Map();
  donations.forEach((donation) => {
    if (donation.transactionId) byPaymentId.set(donation.transactionId, donation);
    if (donation.razorpayOrderId) byOrderId.set(donation.razorpayOrderId, donation);
  });
  return { byPaymentId, byOrderId };
};

const normalizeTransactions = async (entries, syncedAt) => {
  const { byPaymentId, byOrderId } = await mapDonations(entries);

  return entries
    .filter((entry) => entry.settlement_id && entry.entity_id)
    .map((entry) => {
      const paymentId =
        entry.payment_id ||
        (entry.type === "payment" ? entry.entity_id : null);
      const donation =
        byPaymentId.get(paymentId) || byOrderId.get(entry.order_id);

      return {
        reconciliationKey: `${entry.settlement_id}:${entry.type || "unknown"}:${entry.entity_id}`,
        razorpaySettlementId: entry.settlement_id,
        entityId: entry.entity_id,
        paymentId,
        orderId: entry.order_id || null,
        type: entry.type || "unknown",
        method: entry.method || null,
        currency: entry.currency || "INR",
        grossAmountPaise: toNumber(entry.amount),
        creditPaise: toNumber(entry.credit),
        debitPaise: toNumber(entry.debit),
        feePaise: toNumber(entry.fee),
        taxPaise: toNumber(entry.tax),
        settled: Boolean(entry.settled),
        onHold: Boolean(entry.on_hold),
        createdAtRazorpay: toDate(entry.created_at),
        settledAt: toDate(entry.settled_at),
        settlementUtr: entry.settlement_utr || null,
        donationId: donation?._id || null,
        receiptId: donation?.receiptId || null,
        donorName: donation?.userId?.fullname || null,
        donationAmount: donation?.amount ?? null,
        localPaymentStatus: donation?.paymentStatus || null,
        matched: Boolean(donation),
        lastSyncedAt: syncedAt,
      };
    });
};

const buildSettlements = (entities, transactions, syncedAt, trigger) => {
  const byId = new Map();

  entities.forEach((entity) => {
    byId.set(entity.id, {
      razorpaySettlementId: entity.id,
      amountPaise: entity.amount == null ? null : toNumber(entity.amount),
      status: ["created", "processed", "failed"].includes(entity.status)
        ? entity.status
        : "unknown",
      feesPaise: toNumber(entity.fees),
      taxPaise: toNumber(entity.tax),
      utr: entity.utr || null,
      createdAtRazorpay: toDate(entity.created_at),
      scheduledAt: null,
      lastSyncedAt: syncedAt,
      lastSource: trigger,
    });
  });

  const transactionGroups = new Map();
  transactions.forEach((transaction) => {
    const group = transactionGroups.get(transaction.razorpaySettlementId) || [];
    group.push(transaction);
    transactionGroups.set(transaction.razorpaySettlementId, group);
  });

  transactionGroups.forEach((group, settlementId) => {
    const scheduledAt = group
      .map((item) => item.settledAt)
      .filter(Boolean)
      .sort((a, b) => a - b)[0] || null;
    const existing = byId.get(settlementId);
    const calculatedAmount = group.reduce(
      (sum, item) => sum + item.creditPaise - item.debitPaise,
      0
    );
    const settlement = existing || {
      razorpaySettlementId: settlementId,
      amountPaise: calculatedAmount,
      status: group.every((item) => item.settled) ? "processed" : "created",
      feesPaise: 0,
      taxPaise: 0,
      utr: group.find((item) => item.settlementUtr)?.settlementUtr || null,
      createdAtRazorpay: scheduledAt,
      lastSyncedAt: syncedAt,
      lastSource: trigger,
    };
    settlement.scheduledAt = scheduledAt;
    settlement.lastSyncedAt = syncedAt;
    settlement.lastSource = trigger;
    if (!settlement.utr) {
      settlement.utr = group.find((item) => item.settlementUtr)?.settlementUtr || null;
    }
    byId.set(settlementId, settlement);
  });

  return [...byId.values()];
};

const performPeriodSync = async (year, month, trigger) => {
  validatePeriod(year, month);
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const startedAt = new Date();
  await razorpaySettlementSyncModel.findOneAndUpdate(
    { period },
    {
      $set: {
        year,
        month,
        status: "running",
        trigger,
        startedAt,
        completedAt: null,
        error: null,
      },
    },
    { upsert: true }
  );

  try {
    const razorpay = getRazorpayClient();
    const { start, end } = getPeriodRange(year, month);
    const from = Math.floor(start.getTime() / 1000);
    const to = Math.floor(end.getTime() / 1000) - 1;
    const [entities, entries] = await Promise.all([
      fetchAllPages(
        (skip, count) =>
          razorpay.settlements.all({ from, to, count, skip }),
        SETTLEMENT_PAGE_SIZE
      ),
      fetchAllPages(
        (skip, count) =>
          razorpay.settlements.reports({ year, month, count, skip }),
        RECONCILIATION_PAGE_SIZE
      ),
    ]);
    const syncedAt = new Date();
    const transactions = await normalizeTransactions(entries, syncedAt);
    const settlements = buildSettlements(
      entities,
      transactions,
      syncedAt,
      trigger
    );

    if (settlements.length) {
      await razorpaySettlementModel.bulkWrite(
        settlements.map((settlement) => ({
          updateOne: {
            filter: {
              razorpaySettlementId: settlement.razorpaySettlementId,
            },
            update: { $set: settlement },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }
    if (transactions.length) {
      await razorpaySettlementTransactionModel.bulkWrite(
        transactions.map((transaction) => ({
          updateOne: {
            filter: { reconciliationKey: transaction.reconciliationKey },
            update: { $set: transaction },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }

    await razorpaySettlementSyncModel.findOneAndUpdate(
      { period },
      {
        $set: {
          status: "completed",
          trigger,
          settlementCount: settlements.length,
          transactionCount: transactions.length,
          completedAt: new Date(),
          error: null,
        },
      }
    );

    return {
      period,
      settlementCount: settlements.length,
      transactionCount: transactions.length,
    };
  } catch (error) {
    await razorpaySettlementSyncModel.findOneAndUpdate(
      { period },
      {
        $set: {
          status: "failed",
          trigger,
          completedAt: new Date(),
          error:
            error?.error?.description || error?.message || "Settlement sync failed",
        },
      }
    );
    throw error;
  }
};

const syncSettlementPeriod = (year, month, trigger = "scheduled") => {
  const key = `${year}-${month}`;
  if (activeSyncs.has(key)) return activeSyncs.get(key);

  const sync = performPeriodSync(year, month, trigger).finally(() => {
    activeSyncs.delete(key);
  });
  activeSyncs.set(key, sync);
  return sync;
};

const syncSettlementYear = async (year, trigger = "manual") => {
  const current = getIndiaYearMonth();
  const lastMonth = year === current.year ? current.month : 12;
  const results = [];
  const failures = [];
  for (let month = 1; month <= lastMonth; month += 1) {
    try {
      results.push(await syncSettlementPeriod(year, month, trigger));
    } catch (error) {
      failures.push({
        period: `${year}-${String(month).padStart(2, "0")}`,
        message:
          error?.error?.description || error?.message || "Settlement sync failed",
      });
    }
  }
  return { results, failures };
};

const upsertWebhookSettlement = async (entity, eventType) => {
  if (!entity?.id) return null;
  const update = {
    razorpaySettlementId: entity.id,
    amountPaise: entity.amount == null ? null : toNumber(entity.amount),
    status: ["created", "processed", "failed"].includes(entity.status)
      ? entity.status
      : eventType.endsWith(".processed")
        ? "processed"
        : eventType.endsWith(".failed")
          ? "failed"
          : "created",
    feesPaise: toNumber(entity.fees),
    taxPaise: toNumber(entity.tax),
    utr: entity.utr || null,
    createdAtRazorpay: toDate(entity.created_at),
    lastSyncedAt: new Date(),
    lastSource: "webhook",
  };
  return razorpaySettlementModel.findOneAndUpdate(
    { razorpaySettlementId: entity.id },
    { $set: update },
    { upsert: true, new: true }
  );
};

const syncRecentSettlements = async () => {
  const current = getIndiaYearMonth();
  const previousDate = new Date(Date.UTC(current.year, current.month - 2, 1));
  const previous = {
    year: previousDate.getUTCFullYear(),
    month: previousDate.getUTCMonth() + 1,
  };
  const periods = [previous, current];
  const results = [];
  const failures = [];
  for (const period of periods) {
    try {
      results.push(
        await syncSettlementPeriod(period.year, period.month, "scheduled")
      );
    } catch (error) {
      failures.push({
        period: `${period.year}-${String(period.month).padStart(2, "0")}`,
        message:
          error?.error?.description || error?.message || "Settlement sync failed",
      });
    }
  }
  if (failures.length) {
    const error = new Error(
      `Settlement synchronization failed for ${failures
        .map((failure) => failure.period)
        .join(", ")}`
    );
    error.failures = failures;
    throw error;
  }
  return results;
};

export {
  getIndiaYearMonth,
  getPeriodFromUnix,
  getPeriodRange,
  syncRecentSettlements,
  syncSettlementPeriod,
  syncSettlementYear,
  upsertWebhookSettlement,
};

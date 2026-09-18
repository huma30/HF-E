import {createHash} from "crypto";
import {initializeApp} from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions";

initializeApp();

const db = getFirestore();

setGlobalOptions({
  maxInstances: 10,
});

type OrderSource = "WEB" | "POS";

interface OrderItemInput {
  productId?: unknown;
  quantity?: unknown;
}

interface OrderInput {
  source?: unknown;
  status?: unknown;
  items?: unknown;
  idempotencyKey?: unknown;
  [key: string]: unknown;
}

interface ProductSnapshot {
  stockEnabled?: unknown;
  stock?: unknown;
  name?: unknown;
}

/**
 * Throws a client-facing invalid-argument error.
 * @param {string} message Error message for the client.
 */
function fail(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

/**
 * Recursively removes undefined properties.
 * @param {unknown} value Value to sanitize.
 * @return {unknown} Sanitized value.
 */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(source)) {
      if (entry !== undefined) {
        result[key] = stripUndefined(entry);
      }
    }

    return result;
  }

  return value;
}

/**
 * Creates a deterministic order ID for idempotent requests.
 * @param {OrderSource} source Order source.
 * @param {string} idempotencyKey Client idempotency key.
 * @return {string} Deterministic or generated order ID.
 */
function createOrderId(
  source: OrderSource,
  idempotencyKey: string,
): string {
  if (!idempotencyKey) {
    return db.collection("orders").doc().id;
  }

  const digest = createHash("sha256")
    .update(`${source}:${idempotencyKey}`)
    .digest("hex")
    .slice(0, 32);

  return `inv_${digest}`;
}

/**
 * Creates a customer-facing web order number.
 * @return {string} Customer-facing order number.
 */
function createWebOrderNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);

  return `#HF-${yy}${mm}${dd}-${random}`;
}

/**
 * Calculates the order totals from submitted order data.
 * @param {OrderInput} input Submitted order data.
 * @return {Object} Calculated order totals.
 */
function calculateOrderTotal(input: OrderInput): {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
} {
  const items = Array.isArray(input.items) ?
    input.items as Array<Record<string, unknown>> :
    [];

  const subtotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const modifiersPrice = Number(item.modifiersPrice || 0);
    const lineTotal = Number(item.lineTotal);

    if (Number.isFinite(lineTotal)) {
      return sum + lineTotal;
    }

    if (
      Number.isFinite(quantity) &&
      Number.isFinite(unitPrice) &&
      Number.isFinite(modifiersPrice)
    ) {
      return sum + (unitPrice + modifiersPrice) * quantity;
    }

    return sum;
  }, 0);

  const discount = Math.max(0, Number(input.discount) || 0);
  const deliveryFee = Math.max(0, Number(input.deliveryFee) || 0);

  return {
    subtotal: subtotal > 0 ?
      subtotal :
      Math.max(0, Number(input.subtotal) || 0),
    discount,
    deliveryFee,
    total: Math.max(0, subtotal - discount + deliveryFee),
  };
}

/**
 * Verifies that the authenticated user is active HUMA staff.
 * @param {string|undefined} uid Authenticated user ID.
 * @return {Promise<void>} Resolves when authorized.
 */
async function assertPosStaff(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new HttpsError(
      "permission-denied",
      "Login kasir diperlukan untuk transaksi POS.",
    );
  }

  const adminSnap = await db.collection("admins").doc(uid).get();

  if (!adminSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "Akun tidak memiliki akses staff HUMA.",
    );
  }

  const admin = adminSnap.data() as Record<string, unknown>;

  if (
    admin.isActive !== true ||
    ![
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "CASHIER",
    ].includes(String(admin.role))
  ) {
    throw new HttpsError(
      "permission-denied",
      "Akun staff tidak aktif atau tidak memiliki akses transaksi.",
    );
  }
}

interface RewardSnapshot {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  pointsCost?: unknown;
  productId?: unknown;
  productName?: unknown;
  redeemCount?: unknown;
  isActive?: unknown;
  validUntil?: unknown;
}

interface CustomerSnapshot {
  name?: unknown;
  status?: unknown;
  pointsBalance?: unknown;
  whatsapp?: unknown;
}

/**
 * Normalizes Indonesian WhatsApp numbers for secure self-service checks.
 *
 * @param {string} value Raw phone number.
 * @return {string} Normalized phone number.
 */
function normalizeWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("62")) {
    return `0${digits.slice(2)}`;
  }

  if (digits.startsWith("8")) {
    return `0${digits}`;
  }

  return digits;
}

/**
 * Atomically redeems a PRODUCT reward against the master product stock.
 *
 * @param {object} requestData Callable request data.
 * @param {string} requestData.mode Redemption mode.
 * @param {string} requestData.customerId Customer ID.
 * @param {string} requestData.rewardId Reward ID.
 * @param {string} [requestData.customerPhone] Customer phone.
 * @param {string} [requestData.adminName] Admin display name.
 * @param {string} [requestData.orderId] Related order ID.
 * @param {string} [requestUid] Authenticated HUMA staff user ID.
 * @return {Promise<object>} Redemption result.
 */
async function redeemProductRewardTransaction(
  requestData: Record<string, unknown>,
  requestUid?: string,
): Promise<{
  redemption: Record<string, unknown>;
  customer: Record<string, unknown>;
  reward: Record<string, unknown>;
}> {
  const mode = requestData.mode;
  const customerId = requestData.customerId;
  const rewardId = requestData.rewardId;
  const customerPhone = requestData.customerPhone;
  const adminName = requestData.adminName;
  const orderId = requestData.orderId;

  if (
    mode !== "ADMIN" &&
    mode !== "CUSTOMER"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Mode redeem reward tidak valid.",
    );
  }

  if (
    typeof customerId !== "string" ||
    !customerId.trim()
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Customer ID tidak valid.",
    );
  }

  if (
    typeof rewardId !== "string" ||
    !rewardId.trim()
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Reward ID tidak valid.",
    );
  }

  if (mode === "ADMIN") {
    await assertPosStaff(requestUid);
  } else {
    if (
      typeof customerPhone !== "string" ||
      !customerPhone.trim()
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Nomor WhatsApp pelanggan diperlukan.",
      );
    }
  }

  const customerRef = db
    .collection("customers")
    .doc(customerId);
  const rewardRef = db
    .collection("rewards")
    .doc(rewardId);

  const redemptionRef = db
    .collection("pointRedemptions")
    .doc();
  const ledgerRef = db
    .collection("pointLedger")
    .doc();

  const now = new Date().toISOString();

  let result:
    | {
        redemption: Record<string, unknown>;
        customer: Record<string, unknown>;
        reward: Record<string, unknown>;
      }
    | undefined;

  await db.runTransaction(async (transaction) => {
    const customerSnap =
      await transaction.get(customerRef);
    const rewardSnap =
      await transaction.get(rewardRef);

    if (!customerSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Data pelanggan tidak ditemukan.",
      );
    }

    if (!rewardSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Reward tidak ditemukan.",
      );
    }

    const customer =
      customerSnap.data() as CustomerSnapshot;
    const reward =
      rewardSnap.data() as RewardSnapshot;

    if (customer.status === "INACTIVE") {
      throw new HttpsError(
        "failed-precondition",
        "Pelanggan berstatus tidak aktif.",
      );
    }

    if (
      mode === "CUSTOMER" &&
      normalizeWhatsapp(String(customer.whatsapp || "")) !==
        normalizeWhatsapp(String(customerPhone))
    ) {
      throw new HttpsError(
        "permission-denied",
        "Nomor WhatsApp tidak cocok dengan akun pelanggan.",
      );
    }

    if (reward.isActive !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Reward ini sedang tidak aktif.",
      );
    }

    if (reward.type !== "PRODUCT") {
      throw new HttpsError(
        "failed-precondition",
        "Reward ini bukan reward produk.",
      );
    }

    const productId =
      typeof reward.productId === "string" ?
        reward.productId.trim() :
        "";

    if (!productId) {
      throw new HttpsError(
        "failed-precondition",
        "Reward produk belum terhubung ke produk master.",
      );
    }

    if (
      reward.validUntil &&
      new Date(String(reward.validUntil)) < new Date()
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Masa berlaku reward telah berakhir.",
      );
    }

    const pointsCost = Number(reward.pointsCost);

    if (!Number.isInteger(pointsCost) || pointsCost <= 0) {
      throw new HttpsError(
        "failed-precondition",
        "Biaya poin reward tidak valid.",
      );
    }

    const currentBalance =
      Number(customer.pointsBalance) || 0;

    if (currentBalance < pointsCost) {
      throw new HttpsError(
        "failed-precondition",
        `Poin tidak cukup. Dibutuhkan ${pointsCost} poin.`,
      );
    }

    const productRef = db
      .collection("products")
      .doc(productId);
    const productSnap =
      await transaction.get(productRef);

    if (!productSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Produk master reward tidak ditemukan.",
      );
    }

    const product =
      productSnap.data() as Record<string, unknown>;
    const currentStock = Number(product.stock);

    if (product.stockEnabled !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Stok master produk reward belum diaktifkan.",
      );
    }

    if (
      !Number.isInteger(currentStock) ||
      currentStock < 0
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Konfigurasi stok master produk tidak valid.",
      );
    }

    if (currentStock <= 0) {
      throw new HttpsError(
        "failed-precondition",
        "Stok produk reward sedang habis.",
      );
    }

    const newBalance =
      currentBalance - pointsCost;
    const newStock = currentStock - 1;
    const productName =
      String(product.name || reward.productName || reward.name);

    transaction.update(customerRef, {
      pointsBalance: newBalance,
      updatedAt: now,
    });

    transaction.update(productRef, {
      stock: newStock,
      updatedAt: now,
    });

    transaction.update(rewardRef, {
      redeemCount:
        (Number(reward.redeemCount) || 0) + 1,
    });

    const movementData = {
      id: db
        .collection("inventoryMovements")
        .doc().id,
      productId,
      productName,
      quantity: -1,
      stockBefore: currentStock,
      stockAfter: newStock,
      type: "REDEEM_REWARD",
      rewardId: String(reward.id || rewardId),
      rewardName: String(reward.name || ""),
      customerId,
      orderId,
      createdAt: now,
      createdBy:
        mode === "ADMIN" ?
          String(adminName || requestUid || "ADMIN") :
          "CUSTOMER_SELF_SERVICE",
    };

    const movementRef = db
      .collection("inventoryMovements")
      .doc(movementData.id);

    transaction.create(
      movementRef,
      movementData,
    );

    const ledgerEntry = {
      id: ledgerRef.id,
      customerId,
      customerName: String(customer.name || ""),
      type: "REDEEM",
      amount: -pointsCost,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      source:
        mode === "ADMIN" ?
          "REDEEM_PRODUCT" :
          "INSTANT_REDEEM",
      rewardId: String(reward.id || rewardId),
      rewardName: String(reward.name || ""),
      orderId,
      note:
        `Tukar ${pointsCost} poin untuk reward ` +
        `${String(reward.name || "")}`,
      createdAt: now,
      createdBy:
        mode === "ADMIN" ?
          String(adminName || requestUid || "ADMIN") :
          "CUSTOMER_SELF_SERVICE",
    };

    transaction.create(
      ledgerRef,
      ledgerEntry,
    );

    const redemptionCode =
      mode === "CUSTOMER" ?
        `RDM-${Math.floor(
          100000 + Math.random() * 900000,
        )}` :
        undefined;

    const redemption = {
      id: redemptionRef.id,
      redemptionCode,
      customerId,
      customerName: String(customer.name || ""),
      customerPhone:
        String(customer.whatsapp || customerPhone || ""),
      rewardId: String(reward.id || rewardId),
      rewardName: String(reward.name || ""),
      type: "PRODUCT",
      pointsSpent: pointsCost,
      productId,
      productName,
      orderId,
      pointsBalanceAfter: newBalance,
      createdAt: now,
      createdBy:
        mode === "ADMIN" ?
          String(adminName || requestUid || "ADMIN") :
          "CUSTOMER_SELF_SERVICE",
      status: "COMPLETED",
    };

    transaction.create(
      redemptionRef,
      redemption,
    );

    result = {
      redemption,
      customer: {
        ...customer,
        id: customerId,
        pointsBalance: newBalance,
        updatedAt: now,
      },
      reward: {
        ...reward,
        id: String(reward.id || rewardId),
        productId,
        productName,
        redeemCount:
          (Number(reward.redeemCount) || 0) + 1,
      },
    };
  });

  if (!result) {
    throw new HttpsError(
      "internal",
      "Redeem reward tidak menghasilkan data.",
    );
  }

  return result;
}

/**
 * Secure PRODUCT reward redemption callable.
 */
interface SaleMovementSnapshot {
  productId?: unknown;
  productName?: unknown;
  quantity?: unknown;
  type?: unknown;
  orderId?: unknown;
  orderNumber?: unknown;
  createdBy?: unknown;
}

interface CancelOrderResult {
  order: Record<string, unknown>;
  restored: boolean;
  restoredItems: number;
}

/**
 * Cancels an order and restores its recorded inventory movements atomically.
 * @param {string} orderId Order ID to cancel.
 * @param {string} cancellationReason Reason supplied by staff.
 * @param {string|undefined} requestUid Authenticated staff user ID.
 * @return {Promise<CancelOrderResult>} Cancellation transaction result.
 */
async function cancelOrderWithInventoryTransaction(
  orderId: string,
  cancellationReason: string,
  requestUid: string | undefined,
): Promise<CancelOrderResult> {
  await assertPosStaff(requestUid);

  if (!orderId.trim()) {
    throw new HttpsError(
      "invalid-argument",
      "Order ID tidak valid.",
    );
  }

  const orderRef = db.collection("orders").doc(orderId);
  const restorationRef = db
    .collection("inventoryRestorations")
    .doc(orderId);

  const result = await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    const restorationSnap =
      await transaction.get(restorationRef);

    if (!orderSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Pesanan tidak ditemukan.",
      );
    }

    const currentOrder =
      orderSnap.data() as Record<string, unknown>;

    if (currentOrder.status === "REFUNDED") {
      throw new HttpsError(
        "failed-precondition",
        "Pesanan yang sudah REFUNDED tidak dapat dibatalkan.",
      );
    }

    /*
     * A previous successful transaction already restored stock.
     * Returning the current order makes the callable idempotent.
     */
    if (restorationSnap.exists) {
      return {
        order: currentOrder,
        restored: true,
        restoredItems: Number(
          restorationSnap.data()?.restoredItems,
        ) || 0,
      };
    }

    const movementQuery = db
      .collection("inventoryMovements")
      .where("orderId", "==", orderId);

    const movementSnap =
      await transaction.get(movementQuery);

    const quantities = new Map<
      string,
      {
        quantity: number;
        productName: string;
      }
    >();

    for (const movementDoc of movementSnap.docs) {
      const movement =
        movementDoc.data() as SaleMovementSnapshot;

      const type = String(movement.type || "");
      if (type !== "SALE_WEB" && type !== "SALE_POS") {
        continue;
      }

      const productId = String(
        movement.productId || "",
      ).trim();
      const quantity = Number(movement.quantity);

      if (
        !productId ||
        !Number.isInteger(quantity) ||
        quantity >= 0
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Data inventory penjualan untuk order tidak valid.",
        );
      }

      const existing = quantities.get(productId);

      quantities.set(productId, {
        quantity:
          (existing?.quantity || 0) + Math.abs(quantity),
        productName:
          existing?.productName ||
          String(
            movement.productName || productId,
          ),
      });
    }

    const productEntries = [...quantities.entries()].map(
      ([productId, value]) => ({
        productId,
        quantity: value.quantity,
        productName: value.productName,
        ref: db.collection("products").doc(productId),
      }),
    );

    /*
     * Read all affected products before writing anything.
     * This keeps the entire cancellation atomic.
     */
    const productSnapshots = [];

    for (const entry of productEntries) {
      const productSnap =
        await transaction.get(entry.ref);

      productSnapshots.push({
        ...entry,
        snap: productSnap,
      });
    }

    const now = new Date().toISOString();
    let restoredItems = 0;

    for (const entry of productSnapshots) {
      if (!entry.snap.exists) {
        throw new HttpsError(
          "not-found",
          `Produk "${entry.productName}" tidak ditemukan ` +
            "sehingga stok tidak dapat dikembalikan.",
        );
      }

      const product =
        entry.snap.data() as ProductSnapshot;

      if (product.stockEnabled !== true) {
        throw new HttpsError(
          "failed-precondition",
          `Stok master produk "${String(
            product.name || entry.productName,
          )}" tidak aktif.`,
        );
      }

      const currentStock = Number(product.stock);

      if (
        !Number.isInteger(currentStock) ||
        currentStock < 0
      ) {
        throw new HttpsError(
          "failed-precondition",
          `Konfigurasi stok produk "${String(
            product.name || entry.productName,
          )}" tidak valid.`,
        );
      }

      const newStock =
        currentStock + entry.quantity;

      transaction.update(entry.ref, {
        stock: newStock,
        updatedAt: now,
      });

      const movementRef = db
        .collection("inventoryMovements")
        .doc();

      transaction.create(movementRef, {
        id: movementRef.id,
        productId: entry.productId,
        productName: String(
          product.name || entry.productName,
        ),
        quantity: entry.quantity,
        stockBefore: currentStock,
        stockAfter: newStock,
        type: "RETURN_CANCEL",
        orderId,
        orderNumber: String(
          currentOrder.orderNumber || "",
        ),
        createdAt: now,
        createdBy: requestUid || "STAFF",
        reason: "ORDER_CANCELLED",
      });

      restoredItems += entry.quantity;
    }

    transaction.set(restorationRef, {
      id: restorationRef.id,
      orderId,
      orderNumber: String(
        currentOrder.orderNumber || "",
      ),
      restoredItems,
      restoredAt: now,
      restoredBy: requestUid || "STAFF",
    });

    transaction.update(orderRef, {
      status: "CANCELLED",
      updatedAt: now,
      ...(cancellationReason.trim() ?
        {cancellationReason: cancellationReason.trim()} :
        {}),
    });

    return {
      order: {
        ...currentOrder,
        status: "CANCELLED",
        updatedAt: now,
        ...(cancellationReason.trim() ?
          {cancellationReason: cancellationReason.trim()} :
          {}),
      },
      restored: true,
      restoredItems,
    };
  });

  return result;
}

/**
 * Cancels an order and atomically restores master inventory.
 */
export const cancelOrderWithInventory = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    const data =
      request.data as Record<string, unknown> | undefined;

    const orderId =
      typeof data?.orderId === "string" ?
        data.orderId.trim() :
        "";

    const cancellationReason =
      typeof data?.cancellationReason === "string" ?
        data.cancellationReason :
        "";

    return cancelOrderWithInventoryTransaction(
      orderId,
      cancellationReason,
      request.auth?.uid,
    );
  },
);

export const redeemProductReward = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    const data =
      request.data as Record<string, unknown>;

    return redeemProductRewardTransaction(
      data,
      request.auth?.uid,
    );
  },
);

export const createOrderWithInventory = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    const input = request.data?.order as OrderInput | undefined;

    if (!input || typeof input !== "object") {
      fail("Data pesanan tidak valid.");
    }

    const source = input.source;

    if (source !== "WEB" && source !== "POS") {
      fail("Sumber pesanan tidak valid.");
    }

    if (
      source === "WEB" &&
      input.status !== "PENDING"
    ) {
      fail("Status order WEB tidak valid.");
    }

    if (source === "POS") {
      if (input.status !== "COMPLETED") {
        fail("Status order POS tidak valid.");
      }

      await assertPosStaff(request.auth?.uid);
    }

    const items = Array.isArray(input.items) ?
      input.items as OrderItemInput[] :
      [];

    if (items.length === 0) {
      fail("Pesanan tidak memiliki item.");
    }

    const quantities = new Map<string, number>();

    for (const item of items) {
      const productId =
        typeof item.productId === "string" ?
          item.productId.trim() :
          "";

      const quantity = Number(item.quantity);

      if (!productId) {
        fail("Product ID pada item pesanan tidak valid.");
      }

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        fail(
          `Jumlah produk "${productId}" harus berupa bilangan ` +
            "bulat lebih dari 0.",
        );
      }

      quantities.set(
        productId,
        (quantities.get(productId) || 0) + quantity,
      );
    }

    const idempotencyKey =
      typeof input.idempotencyKey === "string" ?
        input.idempotencyKey.trim() :
        "";

    const orderId = createOrderId(
      source,
      idempotencyKey,
    );

    const orderRef = db.collection("orders").doc(orderId);

    const existingOrder = await orderRef.get();

    if (existingOrder.exists) {
      return {
        order: existingOrder.data(),
        created: false,
      };
    }

    const createdAt = new Date().toISOString();
    const totals = calculateOrderTotal(input);

    const result = await db.runTransaction(async (transaction) => {
      const currentOrder = await transaction.get(orderRef);

      if (currentOrder.exists) {
        return {
          order: currentOrder.data(),
          created: false,
        };
      }

      const productEntries = [...quantities.entries()]
        .map(([productId, quantity]) => ({
          productId,
          quantity,
          ref: db.collection("products").doc(productId),
        }));

      const productSnapshots = [];

      for (const entry of productEntries) {
        const snap = await transaction.get(entry.ref);
        productSnapshots.push({
          ...entry,
          snap,
        });
      }

      let orderNumber = createWebOrderNumber();

      if (source === "POS") {
        const counterRef = db
          .collection("settings")
          .doc("orderCounter");
        const counterSnap = await transaction.get(counterRef);
        const currentVal = counterSnap.exists ?
          Number(counterSnap.data()?.lastNumber) || 100 :
          100;
        const nextVal = currentVal + 1;

        transaction.set(
          counterRef,
          {lastNumber: nextVal},
          {merge: true},
        );

        orderNumber =
            `#HF-${String(nextVal).padStart(6, "0")}`;
      }

      const stockUpdates: Array<{
        productId: string;
        productRef: FirebaseFirestore.DocumentReference;
        productName: string;
        before: number;
        after: number;
        quantity: number;
      }> = [];

      for (const entry of productSnapshots) {
        if (!entry.snap.exists) {
          throw new HttpsError(
            "failed-precondition",
            `Produk ${entry.productId} tidak ditemukan.`,
          );
        }

        const product = entry.snap.data() as ProductSnapshot;

        if (product.stockEnabled !== true) {
          continue;
        }

        const currentStock = Number(product.stock);

        if (
          !Number.isInteger(currentStock) ||
          currentStock < 0
        ) {
          throw new HttpsError(
            "failed-precondition",
            `Konfigurasi stok produk "${String(
              product.name || entry.productId,
            )}" tidak valid.`,
          );
        }

        if (currentStock < entry.quantity) {
          throw new HttpsError(
            "failed-precondition",
            `Stok "${String(
              product.name || entry.productId,
            )}" tidak mencukupi. Tersedia ${currentStock} pcs, ` +
            `diminta ${entry.quantity} pcs.`,
          );
        }

        const newStock = currentStock - entry.quantity;

        stockUpdates.push({
          productId: entry.productId,
          productRef: entry.ref,
          productName: String(
            product.name || entry.productId,
          ),
          before: currentStock,
          after: newStock,
          quantity: entry.quantity,
        });
      }

      const cleanInput = stripUndefined(input) as Record<
        string,
        unknown
      >;

      const orderData: Record<string, unknown> = {
        ...cleanInput,
        id: orderId,
        orderNumber,
        createdAt,
        subtotal: totals.subtotal,
        discount: totals.discount,
        deliveryFee: totals.deliveryFee,
        total: totals.total,
        status: source === "POS" ?
          "COMPLETED" :
          "PENDING",
      };

      transaction.create(
        orderRef,
        orderData,
      );

      for (const update of stockUpdates) {
        transaction.update(update.productRef, {
          stock: update.after,
          updatedAt: createdAt,
        });

        const movementRef = db
          .collection("inventoryMovements")
          .doc();

        transaction.create(movementRef, {
          id: movementRef.id,
          productId: update.productId,
          productName: update.productName,
          quantity: -update.quantity,
          stockBefore: update.before,
          stockAfter: update.after,
          type: source === "POS" ?
            "SALE_POS" :
            "SALE_WEB",
          orderId,
          orderNumber,
          createdAt,
          createdBy: request.auth?.uid || "CUSTOMER_PUBLIC",
        });
      }

      return {
        order: orderData,
        created: true,
      };
    });

    if (!result) {
      throw new HttpsError(
        "internal",
        "Transaksi inventory tidak menghasilkan data order.",
      );
    }

    if (!result.created) {
      return {
        order: result.order,
        created: false,
      };
    }

    try {
      const today = createdAt.substring(0, 10);

      await db
        .collection("analyticsDaily")
        .doc(today)
        .set(
          {
            date: today,
            orderCount: FieldValue.increment(1),
            totalRevenue: FieldValue.increment(
              Number(result.order?.total) || 0,
            ),
            posOrders: FieldValue.increment(
              source === "POS" ? 1 : 0,
            ),
            webOrders: FieldValue.increment(
              source === "WEB" ? 1 : 0,
            ),
            deliveryFeeTotal: FieldValue.increment(
              Number(result.order?.deliveryFee) || 0,
            ),
            discountsTotal: FieldValue.increment(
              Number(result.order?.discount) || 0,
            ),
          },
          {merge: true},
        );
    } catch (error) {
      console.warn(
        "[HUMA] Inventory order analytics skipped:",
        error,
      );
    }

    if (
      typeof input.promoCode === "string" &&
      input.promoCode.trim()
    ) {
      try {
        const promoSnap = await db
          .collection("promos")
          .where(
            "code",
            "==",
            input.promoCode.trim(),
          )
          .limit(1)
          .get();

        if (!promoSnap.empty) {
          await promoSnap.docs[0].ref.update({
            usedCount: FieldValue.increment(1),
          });
        }
      } catch (error) {
        console.warn(
          "[HUMA] Inventory order promo update skipped:",
          error,
        );
      }
    }

    return {
      order: result.order,
      created: true,
    };
  },
);

import {getFunctions, httpsCallable} from "firebase/functions";
import app from "./firebase";
import {
  Customer,
  Order,
  PointRedemption,
  RewardItem,
} from "../types";

type OrderInput = Omit<
  Order,
  "id" | "orderNumber" | "createdAt"
>;

interface CreateOrderResponse {
  order: Order;
  created: boolean;
}

interface CancelOrderResponse {
  order: Order;
  restored: boolean;
  restoredItems: number;
}

const functions = getFunctions(app, "us-central1");

export class InventoryService {
  public static async redeemProductReward(params: {
    mode: 'ADMIN' | 'CUSTOMER';
    customerId: string;
    rewardId: string;
    customerPhone?: string;
    adminName?: string;
    orderId?: string;
  }): Promise<{
    redemption: PointRedemption;
    customer: Customer;
    reward: RewardItem;
  }> {
    const callable = httpsCallable<
      typeof params,
      {
        redemption: PointRedemption;
        customer: Customer;
        reward: RewardItem;
      }
    >(
      functions,
      "redeemProductReward",
    );

    const response = await callable(params);

    if (
      !response.data?.redemption ||
      !response.data?.customer ||
      !response.data?.reward
    ) {
      throw new Error(
        "Backend reward tidak mengembalikan data lengkap.",
      );
    }

    return response.data;
  }

  public static async cancelOrderWithInventory(
    orderId: string,
    cancellationReason = "",
  ): Promise<CancelOrderResponse> {
    const callable = httpsCallable<
      {
        orderId: string;
        cancellationReason?: string;
      },
      CancelOrderResponse
    >(
      functions,
      "cancelOrderWithInventory",
    );

    const response = await callable({
      orderId,
      cancellationReason,
    });

    if (!response.data?.order) {
      throw new Error(
        "Backend pembatalan tidak mengembalikan pesanan.",
      );
    }

    return response.data;
  }

  public static async createOrderWithInventory(
    order: OrderInput,
  ): Promise<CreateOrderResponse> {
    const callable = httpsCallable<
      {order: OrderInput},
      CreateOrderResponse
    >(
      functions,
      "createOrderWithInventory",
    );

    const response = await callable({order});

    if (!response.data?.order) {
      throw new Error(
        "Backend inventory tidak mengembalikan pesanan.",
      );
    }

    return response.data;
  }
}

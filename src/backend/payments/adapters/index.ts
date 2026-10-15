import type { PaymentGateway, PosCredentials } from "../types.js";
import { akbankV2Gateway, looksLikeAkbankV2 } from "./akbankV2.js";
import { garantiGateway, looksLikeGaranti } from "./garanti.js";
import { nestpayGateway, looksLikeNestPay } from "./nestpay.js";
import { vakifbankGateway, looksLikeVakifBank } from "./vakifbank.js";

const gateways: PaymentGateway[] = [
  akbankV2Gateway,
  garantiGateway,
  nestpayGateway,
  vakifbankGateway,
];

export function selectPaymentGateway(pos: PosCredentials): PaymentGateway | null {
  const endpoint = `${pos.gateway3dUrl} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  if (["tosla", "iyzico", "paytr", "parampos", "stripe"].some((name) => endpoint.includes(name))) return null;
  if (looksLikeAkbankV2(pos)) return akbankV2Gateway;
  if (looksLikeVakifBank(pos)) return vakifbankGateway;
  if (looksLikeGaranti(pos)) return garantiGateway;
  if (looksLikeNestPay(pos)) return nestpayGateway;
  if (/securepay|payhosting/i.test(pos.gateway3dUrl)) return akbankV2Gateway;
  if (/mpi_enrollment|mpiapi|vakifbank/i.test(pos.gateway3dUrl)) return vakifbankGateway;
  if (/gt3dengine|garanti\.com\.tr/i.test(pos.gateway3dUrl)) return garantiGateway;
  if (pos.gateway3dUrl.trim()) return nestpayGateway;
  return null;
}

export function paymentGatewayById(id: string): PaymentGateway | undefined {
  return gateways.find((gateway) => gateway.id === id);
}

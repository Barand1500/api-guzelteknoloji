import type { PaymentGateway, PosCredentials } from "../types.js";
import { akbankV2Gateway, looksLikeAkbankV2 } from "./akbankV2.js";
import { denizbankGateway, looksLikeDenizBank } from "./denizbank.js";
import { garantiGateway, looksLikeGaranti } from "./garanti.js";
import { halkodeGateway, looksLikeHalkode } from "./halkode.js";
import { iyzicoGateway, looksLikeIyzico } from "./iyzico.js";
import { kuveytturkGateway, looksLikeKuveytTurk } from "./kuveytturk.js";
import { nestpayGateway, looksLikeNestPay } from "./nestpay.js";
import { paytrGateway, looksLikePaytr } from "./paytr.js";
import { qnbGateway, looksLikeQnb } from "./qnb.js";
import { toslaGateway, looksLikeTosla } from "./tosla.js";
import { vakifbankGateway, looksLikeVakifBank } from "./vakifbank.js";
import { yapikrediGateway, looksLikeYapiKredi } from "./yapikredi.js";

const gateways: PaymentGateway[] = [
  akbankV2Gateway,
  qnbGateway,
  denizbankGateway,
  garantiGateway,
  halkodeGateway,
  iyzicoGateway,
  kuveytturkGateway,
  nestpayGateway,
  paytrGateway,
  toslaGateway,
  vakifbankGateway,
  yapikrediGateway,
];

export function selectPaymentGateway(pos: PosCredentials): PaymentGateway | null {
  const endpoint = `${pos.gateway3dUrl} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  if (["parampos", "stripe"].some((name) => endpoint.includes(name))) return null;
  if (looksLikeAkbankV2(pos)) return akbankV2Gateway;
  if (looksLikeQnb(pos)) return qnbGateway;
  if (looksLikeDenizBank(pos)) return denizbankGateway;
  if (looksLikeHalkode(pos)) return halkodeGateway;
  if (looksLikeIyzico(pos)) return iyzicoGateway;
  if (looksLikeKuveytTurk(pos)) return kuveytturkGateway;
  if (looksLikePaytr(pos)) return paytrGateway;
  if (looksLikeTosla(pos)) return toslaGateway;
  if (looksLikeVakifBank(pos)) return vakifbankGateway;
  if (looksLikeYapiKredi(pos)) return yapikrediGateway;
  if (looksLikeGaranti(pos)) return garantiGateway;
  if (looksLikeNestPay(pos)) return nestpayGateway;
  if (/securepay|payhosting/i.test(pos.gateway3dUrl)) return akbankV2Gateway;
  if (/mpi_enrollment|mpiapi|vakifbank/i.test(pos.gateway3dUrl)) return vakifbankGateway;
  if (/gt3dengine|garanti\.com\.tr/i.test(pos.gateway3dUrl)) return garantiGateway;
  if (/posnet|yapikredi/i.test(pos.gateway3dUrl)) return yapikrediGateway;
  if (/tosla/i.test(pos.gateway3dUrl)) return toslaGateway;
  if (pos.gateway3dUrl.trim()) return nestpayGateway;
  return null;
}

export function paymentGatewayById(id: string): PaymentGateway | undefined {
  return gateways.find((gateway) => gateway.id === id);
}

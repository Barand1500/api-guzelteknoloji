import Iyzipay from 'iyzipay';
import type {
  CallbackResult,
  FinalizeCallbackInput,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
  ReversePaymentInput,
  ReversePaymentResult,
} from '../types.js';

/**
 * iyzico 3DS — referans iyzico.adapter.js (iyzipay SDK)
 * POS: merchantId=üye no, terminalSafeId=apiKey, securityKey=secretKey
 */

type IyzicoClient = InstanceType<typeof Iyzipay>;

function promiseCall<T>(fn: (payload: unknown, cb: (err: Error | null, result: unknown) => void) => void, payload: unknown) {
  return new Promise<T>((resolve, reject) => {
    fn(payload, (err, result) => {
      if (err) reject(err);
      else resolve(result as T);
    });
  });
}

function splitName(holder: string) {
  const parts = holder.trim().split(/\s+/).filter(Boolean);
  return { ad: parts[0] || 'Musteri', soyad: parts.slice(1).join(' ') || '-' };
}

function createClient(apiKey: string, secretKey: string): IyzicoClient {
  return new Iyzipay({
    apiKey,
    secretKey,
    uri: 'https://api.iyzipay.com',
  });
}

export function looksLikeIyzico(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
  apiUrl?: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.apiUrl || ''} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return blob.includes('iyzico') || blob.includes('iyzi') || pos.infrastructureId === 'infra-iyzico';
}

export const iyzicoGateway: PaymentGateway = {
  id: 'iyzico',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    // Eski sıra: üye no, apiKey, secret → merchantId / terminalSafeId / securityKey
    const resolvedApiKey = input.pos.terminalSafeId.trim();
    const resolvedSecret = input.pos.securityKey.trim();
    if (!resolvedApiKey || !resolvedSecret) {
      return { kind: 'error', message: 'iyzico: Api Anahtarı / Güvenlik Anahtarı eksik (Sanal POS)' };
    }
    if (!/^\d{15,16}$/.test(input.card.number)) {
      return { kind: 'error', message: 'Kart numarası geçersiz' };
    }
    if (!/^\d{4}$/.test(input.card.expiry)) {
      return { kind: 'error', message: 'Son kullanma MMYY olmalı' };
    }

    const ay = input.card.expiry.slice(0, 2);
    const yil = `20${input.card.expiry.slice(2, 4)}`;
    const adSoyad = (input.card.holder || '').trim() || 'Musteri';
    const { ad, soyad } = splitName(adSoyad);
    const price = input.amount.toFixed(2);
    const paidPrice = price;
    const email = (input.email || '').trim() || 'info@anypay.com.tr';
    const ip = (input.clientIp || '127.0.0.1').replace(/^::ffff:/, '');

    const iyzipay = createClient(resolvedApiKey, resolvedSecret);
    const request = {
      locale: Iyzipay.LOCALE.TR,
      conversationId: input.orderId,
      price,
      paidPrice,
      currency: Iyzipay.CURRENCY.TRY,
      installment: Math.max(1, input.installment),
      basketId: input.orderId,
      paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
      paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
      callbackUrl: input.okUrl,
      paymentCard: {
        cardHolderName: adSoyad,
        cardNumber: input.card.number,
        expireMonth: ay,
        expireYear: yil,
        cvc: input.card.cvc,
        registerCard: '0',
      },
      buyer: {
        id: '1',
        name: ad,
        surname: soyad,
        gsmNumber: '+905000000000',
        email,
        identityNumber: '11111111111',
        lastLoginDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
        registrationDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
        registrationAddress: 'Turkiye',
        ip,
        city: 'Istanbul',
        country: 'Turkey',
        zipCode: '34000',
      },
      shippingAddress: {
        contactName: adSoyad,
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Turkiye',
        zipCode: '34000',
      },
      billingAddress: {
        contactName: adSoyad,
        city: 'Istanbul',
        country: 'Turkey',
        address: 'Turkiye',
        zipCode: '34000',
      },
      basketItems: [
        {
          id: '1',
          name: 'Cari Odeme',
          category1: 'Cari',
          itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
          price,
        },
      ],
    };

    try {
      const result = await promiseCall<{
        status?: string;
        errorMessage?: string;
        htmlContent?: string;
        paymentId?: string;
      }>(iyzipay.threedsInitialize.create.bind(iyzipay.threedsInitialize), request);

      if (result.status === 'failure' || !result.htmlContent) {
        return { kind: 'error', message: result.errorMessage || 'iyzico 3D başlatılamadı' };
      }

      return {
        kind: 'form',
        adapter: this.id,
        form: {
          actionUrl: 'https://api.iyzipay.com',
          method: 'POST',
          fields: {},
          html: result.htmlContent,
        },
      };
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'iyzico 3D başlatılamadı',
      };
    }
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }
    const paymentId = (raw.paymentId || '').trim();
    const conversationId = (raw.conversationId || '').trim();
    if (!paymentId) {
      return {
        orderId: conversationId,
        success: false,
        responseCode: '',
        message: 'iyzico paymentId bulunamadı',
        raw,
        needsProvision: false,
      };
    }
    return {
      orderId: conversationId,
      success: true,
      responseCode: 'pending-provision',
      message: 'iyzico 3D dönüşü — provizyon bekleniyor',
      raw,
      needsProvision: true,
      secure: {
        secureId: paymentId,
        secureEcomInd: '',
        secureData: (raw.conversationData || '').trim(),
        secureMd: '',
        mdStatus: '1',
      },
    };
  },

  async finalizeCallback(input: FinalizeCallbackInput): Promise<CallbackResult> {
    const apiKey = input.pos.terminalSafeId.trim();
    const secretKey = input.pos.securityKey.trim();
    if (!apiKey || !secretKey) {
      return {
        orderId: input.orderId,
        success: false,
        responseCode: '',
        message: 'iyzico kimlik bilgileri eksik',
        raw: {},
        needsProvision: false,
      };
    }

    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.body)) {
      if (v == null) continue;
      body[k] = String(v);
    }
    const paymentId = (body.paymentId || '').trim();
    if (!paymentId) {
      return {
        orderId: input.orderId,
        success: false,
        responseCode: '',
        message: 'iyzico paymentId yok',
        raw: body,
        needsProvision: false,
      };
    }

    const iyzipay = createClient(apiKey, secretKey);
    try {
      const result = await promiseCall<{
        status?: string;
        errorMessage?: string;
        paymentId?: string;
        authCode?: string;
        hostReference?: string;
      }>(iyzipay.threedsPayment.create.bind(iyzipay.threedsPayment), {
        locale: Iyzipay.LOCALE.TR,
        conversationId: input.orderId,
        paymentId,
        conversationData: body.conversationData || undefined,
      });

      const basarili = result.status === 'success';
      return {
        orderId: input.orderId,
        success: basarili,
        responseCode: result.status || '',
        message: basarili ? 'Başarılı' : result.errorMessage || 'İşlem başarısız',
        raw: {
          ...body,
          paymentId: result.paymentId || paymentId,
          AuthCode: result.authCode || '',
          HostRefNum: result.hostReference || '',
        },
        needsProvision: false,
      };
    } catch (err) {
      return {
        orderId: input.orderId,
        success: false,
        responseCode: '',
        message: err instanceof Error ? err.message : 'iyzico provizyon başarısız',
        raw: body,
        needsProvision: false,
      };
    }
  },

  /** cancel / refund — iyzipay SDK (paymentId = referenceCode) */
  async reverse(input: ReversePaymentInput): Promise<ReversePaymentResult> {
    const apiKey = input.pos.terminalSafeId.trim();
    const secretKey = input.pos.securityKey.trim();
    const paymentId = (input.referenceCode || input.bankOrderId || '').trim();
    if (!apiKey || !secretKey) {
      return { success: false, message: 'iyzico iptal/iade: apiKey/secretKey eksik' };
    }
    if (!paymentId) {
      return { success: false, message: 'iyzico iptal/iade: paymentId (referans) bulunamadı' };
    }

    const iyzipay = createClient(apiKey, secretKey);
    const ip = input.clientIp || '127.0.0.1';

    try {
      if (input.kind === 'void') {
        const result = await promiseCall<{
          status?: string;
          errorMessage?: string;
        }>(iyzipay.cancel.create.bind(iyzipay.cancel), {
          locale: Iyzipay.LOCALE.TR,
          conversationId: input.orderId,
          paymentId,
          ip,
        });
        const ok = result.status === 'success';
        return {
          success: ok,
          message: ok ? 'Başarılı' : result.errorMessage || 'iyzico iptal başarısız',
          responseCode: result.status,
          referenceCode: paymentId,
          raw: result,
        };
      }

      const price = Number(input.amount || 0).toFixed(2);
      const result = await promiseCall<{
        status?: string;
        errorMessage?: string;
      }>(iyzipay.refund.create.bind(iyzipay.refund), {
        locale: Iyzipay.LOCALE.TR,
        conversationId: input.orderId,
        paymentTransactionId: paymentId,
        price,
        currency: Iyzipay.CURRENCY.TRY,
        ip,
      });
      const ok = result.status === 'success';
      return {
        success: ok,
        message: ok ? 'Başarılı' : result.errorMessage || 'iyzico iade başarısız',
        responseCode: result.status,
        referenceCode: paymentId,
        raw: result,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'iyzico iptal/iade başarısız',
      };
    }
  },
};

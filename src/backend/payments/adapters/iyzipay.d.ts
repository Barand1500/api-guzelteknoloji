declare module 'iyzipay' {
  export default class Iyzipay {
    constructor(config: { apiKey: string; secretKey: string; uri: string });
    static LOCALE: { TR: string };
    static CURRENCY: { TRY: string };
    static PAYMENT_CHANNEL: { WEB: string };
    static PAYMENT_GROUP: { PRODUCT: string };
    static BASKET_ITEM_TYPE: { PHYSICAL: string };
    threedsInitialize: {
      create: (request: unknown, cb: (err: Error | null, result: unknown) => void) => void;
    };
    threedsPayment: {
      create: (request: unknown, cb: (err: Error | null, result: unknown) => void) => void;
    };
    cancel: {
      create: (request: unknown, cb: (err: Error | null, result: unknown) => void) => void;
    };
    refund: {
      create: (request: unknown, cb: (err: Error | null, result: unknown) => void) => void;
    };
  }
}

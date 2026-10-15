/** Bankalar — yerel depo; BIN dropdown buradan okur. Sonra API’ye taşınır. */

export type BankRow = {
  id: string;
  name: string;
  shortName: string;
  logoDataUrl: string;
  gateway3dsUrl: string;
  apiUrl: string;
  xmlUrl: string;
};

export const BANKS_STORAGE_KEY = "gtk_tahsilat_banks_v1";

const SAMPLE: BankRow[] = [
  { id: "b1", name: "AKBANK T.A.Ş.", shortName: "AKBANK", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b2", name: "AKTİF YATIRIM BANKASI A.Ş.", shortName: "AKTİF BANK", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b3", name: "ALBARAKA TÜRK KATILIM BANKASI A.Ş.", shortName: "AL BARAKA", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b4", name: "ALTERNATİF BANK A.Ş.", shortName: "ALTERNATİFBANK", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b5", name: "ANADOLUBANK A.Ş.", shortName: "ANADOLUBANK", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b6", name: "BURGAN BANK A.Ş.", shortName: "BURGAN", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b7", name: "CITIBANK A.Ş.", shortName: "CITIBANK", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b8", name: "DENİZBANK A.Ş.", shortName: "DENİZBANK", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b9", name: "ENPARA BANK A.Ş.", shortName: "ENPARA", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b10", name: "FIBABANKA A.Ş.", shortName: "FIBABANKA", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b11", name: "T. GARANTİ BANKASI A.Ş.", shortName: "GARANTİ", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b12", name: "T. İŞ BANKASI A.Ş.", shortName: "İŞ BANKASI", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b13", name: "YAPI VE KREDİ BANKASI A.Ş.", shortName: "YAPI KREDİ", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b14", name: "TÜRK EKONOMİ BANKASI A.Ş.", shortName: "TEB", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
  { id: "b15", name: "ZİRAAT BANKASI A.Ş.", shortName: "ZİRAAT", logoDataUrl: "", gateway3dsUrl: "", apiUrl: "", xmlUrl: "" },
];

export function loadBanks(): BankRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BANKS_STORAGE_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw as BankRow[];
  } catch {
    /* örnek */
  }
  return SAMPLE.map((r) => ({ ...r }));
}

export function saveBanks(rows: BankRow[]) {
  localStorage.setItem(BANKS_STORAGE_KEY, JSON.stringify(rows));
}

/** BIN modalı için banka adları (Bankalar sayfasından) */
export function listBankNames(): string[] {
  const names = loadBanks()
    .map((b) => b.name.trim())
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "tr"));
}

export function newBankId() {
  return `bank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

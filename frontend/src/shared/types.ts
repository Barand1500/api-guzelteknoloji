export type View = "dashboard" | "new" | "keys" | "manage" | "statistics" | "playground" | "schema-keys" | "settings" | "appearance" | "guide";
export type PanelPage = Exclude<View, "manage" | "guide">;
export type PanelPreferences = { sidebarOrder: PanelPage[]; quickAccess: (PanelPage | null)[]; searchWidth: number; fontFamily: "inter" | "manrope" | "roboto-flex" | "ibm-plex-sans" };
export type CategoryFolder = { id: number; name: string; parentId: number | null };
export type Category = { id: number; name: string; slug: string; tableName?: string; active: boolean; icon?: string; folderId?: number | null; folderPath?: string };
export type State = { enabled: boolean; categories: Category[] };
export type Column = { id: number; name: string; sqlName?: string; fieldType: "text" | "number" | "integer" | "float" | "boolean" | "boolean_text" | "date" | "relation" | "image" | "image_upload" | "image_base64"; referenceCategoryId?: number | null };
export type DataRow = { id: string; data: Record<string, string>; active: boolean; createdAt?: string; updatedAt?: string };
export type Schema = { category: Category; columns: Column[]; rows: DataRow[]; relationOptions: Record<number, { id: string; label: string; detail?: string }[]> };
export type ApiKey = {
  id: string;
  projectName: string;
  apiKey: string;
  active: boolean;
  usageCount: number;
  minuteLimit: number | null;
  monthLimit: number | null;
  minuteUsed: number;
  monthUsed: number;
  siteCount: number;
  categoryNames: string[];
  categoryIds: number[];
  folderNames: string[];
  folderIds: number[];
};
export type UsageSummary = {
  from: string;
  to: string;
  totals: { requests: number; activeKeys: number; sites: number; lastRequest: string | null };
  daily: { day: string; requests: number }[];
  byCategory: { categoryId: number | null; name: string; requests: number }[];
  byProject: { keyId: string; projectName: string; requests: number }[];
};
export type UsageLogPage = { rows: { id: number; createdAt: string; originHost: string | null; projectName: string; categoryName: string | null }[]; page: number; pageSize: number; total: number };
export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; from: string; passwordConfigured: boolean; encryptionKeyConfigured: boolean };
export type DatabaseSchema = {
  databaseName: string;
  tables: {
    name: string;
    kind: string;
    engine: string | null;
    estimatedRows: number | null;
    dataBytes: number | null;
    indexBytes: number | null;
    category: { id: number; name: string } | null;
    referencedBy: { table: string; column: string; targetColumn: string; constraint: string }[];
    columns: {
      name: string;
      sqlType: string;
      nullable: boolean;
      defaultValue: string | null;
      extra: string;
      key: string;
      position: number;
      reference: { table: string; column: string; constraint: string } | null;
    }[];
  }[];
};
export type DatabaseTableRows = {
  rows: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
};
export type LoginSettings = {
  quickLoginEnabled: boolean;
  imageUrl: string;
};
export const DEFAULT_LOGIN_SETTINGS: LoginSettings = {
  quickLoginEnabled: true,
  imageUrl: "/login-character.jpg",
};

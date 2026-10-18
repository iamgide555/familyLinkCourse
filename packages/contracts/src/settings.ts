export type ServiceType = { id: string; name: string; active: boolean };
export type DocumentType = { id: string; name: string; sensitive: boolean; active: boolean };
export type SettingsList<T> = { items: T[]; source: 'configured' | 'synthetic' };
export type ConsentPurposeKey = 'privacy' | 'sensitiveUpload' | 'news' | 'photo';
export type ConsentText = { version: string; text: string };
export type OrganizationSettings = {
  consents: Record<ConsentPurposeKey, ConsentText>;
  retention: { generalDays: number | null; sensitiveDays: number | null; idCopyDays: number | null };
  pdf: { title: string; footer: string };
  messages: Record<string, string>;
};
export type OrganizationSettingsPatch = {
  consents?: Partial<Record<ConsentPurposeKey, { text: string }>>;
  retention?: Partial<OrganizationSettings['retention']>;
  pdf?: Partial<OrganizationSettings['pdf']>;
  messages?: Record<string, string>;
};

/**
 * Minimal, dependency-free translation layer.
 *
 * To add a language: create a dictionary file typed `Partial<Messages>`, then
 * register it in LOCALES below. Untranslated keys fall back to English.
 */
import { en, type MessageKey, type Messages } from "./en";
import { kn } from "./kn";

export type { MessageKey, Messages };

export interface LocaleDefinition {
  /** BCP 47 tag, also used for number and date formatting. */
  code: string;
  /** Name shown in the language switcher, in the language itself. */
  nativeName: string;
  messages: Partial<Messages>;
}

export const LOCALES = {
  en: { code: "en", nativeName: "English", messages: en },
  kn: { code: "kn", nativeName: "ಕನ್ನಡ", messages: kn },
} satisfies Record<string, LocaleDefinition>;

export type LocaleId = keyof typeof LOCALES;
export const DEFAULT_LOCALE: LocaleId = "en";

export function isLocaleId(value: unknown): value is LocaleId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LOCALES, value);
}

export type TranslateParams = Record<string, string | number>;

/** Returns the string for `key` in `locale`, falling back to English. */
export function translate(locale: LocaleId, key: MessageKey, params?: TranslateParams): string {
  const dict: Partial<Messages> = LOCALES[locale]?.messages ?? en;
  const template = dict[key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

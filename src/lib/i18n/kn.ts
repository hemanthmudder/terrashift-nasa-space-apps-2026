/**
 * Kannada UI strings (optional language).
 *
 * Partial by design: any key not translated here falls back to English.
 * Navigation labels reuse the wording already used in the existing app.
 * NOTE: these translations should be reviewed by a native Kannada speaker
 * before release, especially the longer coverage and data-source messages,
 * which are intentionally left in English for now.
 */
import type { Messages } from "./en";

export const kn: Partial<Messages> = {
  "app.tagline": "ಸ್ಮಾರ್ಟ್ ಬೆಳೆ ಪರಿವರ್ತನೆ. ಆರೋಗ್ಯಕರ ಮಣ್ಣು. ಹವಾಮಾನ-ಸಿದ್ಧ ಜಮೀನುಗಳು.",

  "nav.home": "ಮುಖಪುಟ",
  "nav.farm": "ಜಮೀನು ಮತ್ತು ಮಣ್ಣು",
  "nav.climate": "NASA ಹವಾಮಾನ",
  "nav.recommendations": "ಬೆಳೆ ಶಿಫಾರಸು",
  "nav.planner": "ಬೆಳೆ ಕ್ಯಾಲೆಂಡರ್",
  "nav.reports": "ವರದಿ",
  "nav.menu": "ಮೆನು",

  "settings.language": "ಭಾಷೆ",
  "settings.units": "ಘಟಕಗಳು",
  "settings.metric": "ಮೆಟ್ರಿಕ್",
  "settings.imperial": "ಇಂಪೀರಿಯಲ್",

  "action.getStarted": "ಪ್ರಾರಂಭಿಸಿ",
  "action.retry": "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",

  "state.loading": "ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
  "state.error.title": "ಏನೋ ತಪ್ಪಾಗಿದೆ",
  "value.missing": "ಲಭ್ಯವಿಲ್ಲ",

  "data.live": "ನೇರ NASA POWER ದತ್ತಾಂಶ",
  "data.source": "ಮೂಲ",
};

export const LANGUAGES = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    speechCode: "en-US",
    emptyOriginal: "Your recognized English text will appear here.",
    emptyTranslation: "English translation will appear here.",
  },
  {
    code: "th",
    name: "Thai",
    nativeName: "ภาษาไทย",
    speechCode: "th-TH",
    emptyOriginal: "ข้อความภาษาไทยที่รู้จำจะแสดงที่นี่",
    emptyTranslation: "คำแปลภาษาไทยจะแสดงที่นี่",
  },
];

export function getLanguage(code) {
  return LANGUAGES.find((language) => language.code === code) || LANGUAGES[0];
}

export function getSpeechLanguageCode(code) {
  return getLanguage(code).speechCode;
}

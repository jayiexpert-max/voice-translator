const PHRASE_REPLACEMENTS = [
  ["thank you", "แต๊งกิว"],
  ["good morning", "กู๊ด มอร์นิง"],
  ["good night", "กู๊ด ไนท์"],
  ["how are you", "ฮาว อาร์ ยู"],
  ["nice to meet you", "ไนซ์ ทู มีท ยู"],
];

const WORD_REPLACEMENTS = new Map([
  ["a", "อะ"],
  ["ai", "เอไอ"],
  ["am", "แอม"],
  ["an", "แอน"],
  ["and", "แอนด์"],
  ["app", "แอป"],
  ["are", "อาร์"],
  ["hello", "เฮลโล"],
  ["hi", "ไฮ"],
  ["i", "ไอ"],
  ["is", "อีส"],
  ["me", "มี"],
  ["my", "มาย"],
  ["no", "โน"],
  ["ok", "โอเค"],
  ["okay", "โอเค"],
  ["please", "พลีส"],
  ["sorry", "ซอร์รี"],
  ["the", "เดอะ"],
  ["to", "ทู"],
  ["translator", "ทรานส์เลเตอร์"],
  ["voice", "วอยซ์"],
  ["web", "เว็บ"],
  ["yes", "เยส"],
  ["you", "ยู"],
]);

const LETTER_NAMES = new Map([
  ["a", "เอ"],
  ["b", "บี"],
  ["c", "ซี"],
  ["d", "ดี"],
  ["e", "อี"],
  ["f", "เอฟ"],
  ["g", "จี"],
  ["h", "เอช"],
  ["i", "ไอ"],
  ["j", "เจ"],
  ["k", "เค"],
  ["l", "แอล"],
  ["m", "เอ็ม"],
  ["n", "เอ็น"],
  ["o", "โอ"],
  ["p", "พี"],
  ["q", "คิว"],
  ["r", "อาร์"],
  ["s", "เอส"],
  ["t", "ที"],
  ["u", "ยู"],
  ["v", "วี"],
  ["w", "ดับเบิลยู"],
  ["x", "เอ็กซ์"],
  ["y", "วาย"],
  ["z", "แซด"],
]);

const LETTER_PATTERNS = [
  ["tion", "ชัน"],
  ["sion", "ชัน"],
  ["ough", "อัฟ"],
  ["augh", "อาฟ"],
  ["ph", "ฟ"],
  ["ch", "ช"],
  ["sh", "ช"],
  ["th", "ธ"],
  ["ck", "ค"],
  ["qu", "คว"],
  ["ng", "ง"],
  ["ee", "อี"],
  ["oo", "ู"],
  ["ai", "เอ"],
  ["ay", "เอ"],
  ["ea", "ี"],
  ["ou", "าว"],
  ["ow", "าว"],
  ["ar", "าร์"],
  ["er", "เออร์"],
  ["or", "อร์"],
  ["ur", "เออร์"],
  ["a", "ะ"],
  ["b", "บ"],
  ["c", "ค"],
  ["d", "ด"],
  ["e", "เอ"],
  ["f", "ฟ"],
  ["g", "ก"],
  ["h", "ฮ"],
  ["i", "ิ"],
  ["j", "จ"],
  ["k", "ค"],
  ["l", "ล"],
  ["m", "ม"],
  ["n", "น"],
  ["o", "โอ"],
  ["p", "พ"],
  ["q", "ค"],
  ["r", "ร"],
  ["s", "ส"],
  ["t", "ท"],
  ["u", "ั"],
  ["v", "ว"],
  ["w", "ว"],
  ["x", "กซ์"],
  ["y", "ย"],
  ["z", "ซ"],
];

export function canTransliterate(sourceLanguage, targetLanguage) {
  return sourceLanguage === "en" && targetLanguage === "th";
}

export function transliterateEnglishToThai(text) {
  let normalizedText = text.toLowerCase().trim();

  PHRASE_REPLACEMENTS.forEach(([english, thai]) => {
    normalizedText = normalizedText.replaceAll(english, thai);
  });

  return normalizedText
    .split(/(\s+|[.,!?;:()[\]"'])/)
    .map((token) => transliterateToken(token))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateToken(token) {
  if (!token || /^\s+$/.test(token) || /^[.,!?;:()[\]"']$/.test(token)) {
    return token;
  }

  if (/[\u0E00-\u0E7F]/.test(token)) {
    return token;
  }

  if (/^\d+$/.test(token)) {
    return token;
  }

  const cleanToken = token.toLowerCase().replace(/[^a-z0-9-]/g, "");

  if (!cleanToken) {
    return token;
  }

  if (WORD_REPLACEMENTS.has(cleanToken)) {
    return WORD_REPLACEMENTS.get(cleanToken);
  }

  if (/^[a-z]$/.test(cleanToken)) {
    return LETTER_NAMES.get(cleanToken);
  }

  return transliterateByPattern(cleanToken);
}

function transliterateByPattern(word) {
  let output = "";
  let index = 0;

  while (index < word.length) {
    const pattern = LETTER_PATTERNS.find(([english]) => word.startsWith(english, index));

    if (pattern) {
      output += pattern[1];
      index += pattern[0].length;
      continue;
    }

    output += word[index];
    index += 1;
  }

  return output.replace(/์{2,}/g, "์");
}

const ROMAJI_TO_HIRAGANA = {
  a: 'あ',
  i: 'い',
  u: 'う',
  e: 'え',
  o: 'お',
  xa: 'ぁ',
  xi: 'ぃ',
  xu: 'ぅ',
  xe: 'ぇ',
  xo: 'ぉ',
  la: 'ぁ',
  li: 'ぃ',
  lu: 'ぅ',
  le: 'ぇ',
  lo: 'ぉ',
  ka: 'か',
  ki: 'き',
  ku: 'く',
  ke: 'け',
  ko: 'こ',
  kya: 'きゃ',
  kyu: 'きゅ',
  kyo: 'きょ',
  ga: 'が',
  gi: 'ぎ',
  gu: 'ぐ',
  ge: 'げ',
  go: 'ご',
  gya: 'ぎゃ',
  gyu: 'ぎゅ',
  gyo: 'ぎょ',
  sa: 'さ',
  si: 'し',
  shi: 'し',
  su: 'す',
  se: 'せ',
  so: 'そ',
  sya: 'しゃ',
  sha: 'しゃ',
  syu: 'しゅ',
  shu: 'しゅ',
  syo: 'しょ',
  sho: 'しょ',
  za: 'ざ',
  zi: 'じ',
  ji: 'じ',
  zu: 'ず',
  ze: 'ぜ',
  zo: 'ぞ',
  zya: 'じゃ',
  ja: 'じゃ',
  jya: 'じゃ',
  zyu: 'じゅ',
  ju: 'じゅ',
  jyu: 'じゅ',
  zyo: 'じょ',
  jo: 'じょ',
  jyo: 'じょ',
  ta: 'た',
  ti: 'ち',
  chi: 'ち',
  tu: 'つ',
  tsu: 'つ',
  te: 'て',
  to: 'と',
  tya: 'ちゃ',
  cha: 'ちゃ',
  cya: 'ちゃ',
  tyu: 'ちゅ',
  chu: 'ちゅ',
  cyu: 'ちゅ',
  tyo: 'ちょ',
  cho: 'ちょ',
  cyo: 'ちょ',
  xtu: 'っ',
  ltu: 'っ',
  xtsu: 'っ',
  ltsu: 'っ',
  da: 'だ',
  di: 'ぢ',
  du: 'づ',
  de: 'で',
  do: 'ど',
  dya: 'ぢゃ',
  dyu: 'ぢゅ',
  dyo: 'ぢょ',
  na: 'な',
  ni: 'に',
  nu: 'ぬ',
  ne: 'ね',
  no: 'の',
  nya: 'にゃ',
  nyu: 'にゅ',
  nyo: 'にょ',
  ha: 'は',
  hi: 'ひ',
  hu: 'ふ',
  fu: 'ふ',
  he: 'へ',
  ho: 'ほ',
  hya: 'ひゃ',
  hyu: 'ひゅ',
  hyo: 'ひょ',
  ba: 'ば',
  bi: 'び',
  bu: 'ぶ',
  be: 'べ',
  bo: 'ぼ',
  bya: 'びゃ',
  byu: 'びゅ',
  byo: 'びょ',
  pa: 'ぱ',
  pi: 'ぴ',
  pu: 'ぷ',
  pe: 'ぺ',
  po: 'ぽ',
  pya: 'ぴゃ',
  pyu: 'ぴゅ',
  pyo: 'ぴょ',
  ma: 'ま',
  mi: 'み',
  mu: 'む',
  me: 'め',
  mo: 'も',
  mya: 'みゃ',
  myu: 'みゅ',
  myo: 'みょ',
  ya: 'や',
  yu: 'ゆ',
  yo: 'よ',
  xya: 'ゃ',
  xyu: 'ゅ',
  xyo: 'ょ',
  lya: 'ゃ',
  lyu: 'ゅ',
  lyo: 'ょ',
  ra: 'ら',
  ri: 'り',
  ru: 'る',
  re: 'れ',
  ro: 'ろ',
  rya: 'りゃ',
  ryu: 'りゅ',
  ryo: 'りょ',
  wa: 'わ',
  wi: 'うぃ',
  we: 'うぇ',
  wo: 'を',
  va: 'ゔぁ',
  vi: 'ゔぃ',
  vu: 'ゔ',
  ve: 'ゔぇ',
  vo: 'ゔぉ',
  fa: 'ふぁ',
  fi: 'ふぃ',
  fe: 'ふぇ',
  fo: 'ふぉ',
  tsa: 'つぁ',
  tsi: 'つぃ',
  tse: 'つぇ',
  tso: 'つぉ',
  che: 'ちぇ',
  she: 'しぇ',
  je: 'じぇ',
};

const MAX_ROMAJI_LENGTH = Math.max(...Object.keys(ROMAJI_TO_HIRAGANA).map((key) => key.length));
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const SMALL_TSU_CONSONANTS = new Set(['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'm', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z']);

const isAsciiLetter = (char) => /^[a-z]$/i.test(char);

const isKana = (char) => {
  const code = char.charCodeAt(0);
  return (code >= 0x3040 && code <= 0x30ff) || code === 0x30fc;
};

const toKatakana = (value) =>
  value.replace(/[\u3041-\u3096]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) + 0x60)
  );

const toHiragana = (value) =>
  value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );

const shouldUseSmallTsu = (current, next) =>
  current === next && SMALL_TSU_CONSONANTS.has(current) && current !== 'n';

const shouldConvertN = (next, finalize) => {
  if (next === undefined) {
    return finalize;
  }

  return !VOWELS.has(next) && next !== 'y' && next !== 'n' && isAsciiLetter(next);
};

export const convertRomajiToHiragana = (input, options = {}) => {
  const value = input.normalize('NFKC');
  const lowerValue = value.toLowerCase();
  const finalize = options.finalize ?? false;
  let output = '';
  let index = 0;

  while (index < value.length) {
    const originalChar = value[index];
    const char = lowerValue[index];
    const next = lowerValue[index + 1];

    if (!isAsciiLetter(char)) {
      output += originalChar;
      index += 1;
      continue;
    }

    if (char === 'n') {
      if (next === "'") {
        output += 'ん';
        index += 2;
        continue;
      }

      if (next === 'n') {
        output += 'ん';
        index += 2;
        continue;
      }

      if (shouldConvertN(next, finalize)) {
        output += 'ん';
        index += 1;
        continue;
      }
    }

    if (next && shouldUseSmallTsu(char, next)) {
      output += 'っ';
      index += 1;
      continue;
    }

    let matched = '';
    for (let length = MAX_ROMAJI_LENGTH; length > 0; length -= 1) {
      const chunk = lowerValue.slice(index, index + length);
      if (ROMAJI_TO_HIRAGANA[chunk]) {
        matched = chunk;
        break;
      }
    }

    if (matched) {
      output += ROMAJI_TO_HIRAGANA[matched];
      index += matched.length;
      continue;
    }

    output += isKana(originalChar) ? originalChar : char;
    index += 1;
  }

  return output;
};

export const convertRomajiToKatakana = (input, options = {}) => {
  const hiragana = convertRomajiToHiragana(input, options);
  return toKatakana(hiragana).replace(/-/g, 'ー');
};

export const convertRomajiToKana = (
  input,
  mode,
  options = {}
) => {
  if (mode === 'hiragana') {
    return convertRomajiToHiragana(input, options);
  }

  if (mode === 'katakana') {
    return convertRomajiToKatakana(input, options);
  }

  return input.normalize('NFKC');
};

export const normalizeKanaAnswer = (input, mode = 'off') =>
  toHiragana(convertRomajiToKana(input.trim(), mode, { finalize: true }).normalize('NFKC'))
    .replace(/[\s\u3000]+/g, '')
    .replace(/[()（）]/g, '')
    .toLowerCase();

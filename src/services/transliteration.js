// --- ELITE MAGHREB TRANSLITERATION SERVICE ---

export const transliterateArToFr = (text) => {
  if (!text) return '';
  let str = text.trim();

  // 1. Common Prefixes
  const ligatures = {
    'ال': 'El ',
    'عبد ': 'Abdel ',
    'بو ': 'Bou ',
    'أبو ': 'Abou ',
    'بن ': 'Ben ',
    'آيت ': 'Ait ',
  };
  for (const [ar, fr] of Object.entries(ligatures)) {
    if (str.startsWith(ar)) {
      str = fr + str.substring(ar.length);
      break; 
    }
  }

  // 2. Phonetic Rules
  const rules = [
    [/\u062C/g, 'dj'], // Jeem -> DJ
    [/\u0648/g, 'ou'], // Waw -> OU
    [/\u0634/g, 'ch'], // Sheen -> CH
    [/\u062E/g, 'kh'], // Khah -> KH
    [/\u0639/g, 'a'],  // Ain -> A
    [/\u063A/g, 'gh'], // Ghain -> GH
    [/\u0642/g, 'k'],  // Qaf -> K
    [/\u062B/g, 'th'], // Theh -> TH
    [/\u0630/g, 'dh'], // Thal -> DH
    [/\u0636/g, 'd'],  // Dad -> D
    [/\u0638/g, 'z'],  // Zah -> Z
    [/\u0635/g, 's'],  // Sad -> S
    [/\u0629\b/g, 'a'], // Terminal Teh Marbuta -> A
  ];

  const charMap = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ى': 'a',
    'ب': 'b', 'ت': 't', 'د': 'd', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ف': 'f', 'ك': 'k', 'ل': 'l', 'م': 'm',
    'ن': 'n', 'ه': 'h', 'ي': 'y'
  };

  let result = str;
  rules.forEach(([regex, replacement]) => {
    result = result.replace(regex, replacement);
  });

  let final = '';
  for (const char of result) {
    if (/[a-zA-Z0-9\s\.\-\/]/.test(char)) {
      final += char;
    } else {
      final += charMap[char] || char;
    }
  }

  return final
    .replace(/oua/g, 'wa')
    .replace(/ouou/g, 'ou')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

export const transliterateFrToAr = (text) => {
  if (!text) return '';
  let str = text.toLowerCase().trim();

  const commonNames = {
    abdel: 'عبد ال',
    ben: 'بن ',
    bou: 'بو ',
    mohamed: 'محمد',
    fatima: 'فاطمة',
    ahmed: 'أحمد',
    brahim: 'إبراهيم',
    said: 'سعيد',
    karim: 'كريم',
    amine: 'أمين',
    el: 'ال',
  };
  for (const [fr, ar] of Object.entries(commonNames)) {
    str = str.replace(new RegExp('\\b' + fr + '\\b', 'g'), ar);
  }

  const rules = [
    [/dj/g, 'ج'],
    [/ch/g, 'ش'],
    [/kh/g, 'خ'],
    [/ou/g, 'و'],
    [/gh/g, 'غ'],
    [/th/g, 'ث'],
    [/dh/g, 'ذ'],
  ];

  const charMap = {
    'a': 'ا', 'b': 'ب', 't': 'ت', 'd': 'د', 'r': 'ر',
    'z': 'ز', 's': 'س', 'f': 'ف', 'k': 'ك', 'l': 'ل',
    'm': 'م', 'n': 'ن', 'h': 'ه', 'y': 'ي', 'i': 'ي'
  };

  rules.forEach(([regex, replacement]) => {
    str = str.replace(regex, replacement);
  });

  let final = '';
  for (const char of str) {
    final += charMap[char] || char;
  }

  return final.replace(/\s+/g, ' ').trim();
};

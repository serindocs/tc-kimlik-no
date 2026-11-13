// tc-kimlik-no — TC kimlik no, YKN, VKN, IBAN, kart ve test kişisi üretme/doğrulama.
// Bağımlılık yok. Node 18+ ve modern tarayıcılarda çalışır (crypto.getRandomValues).

const rnd = (max) => {
  // 0 <= n < max, modulo yanlılığı olmadan
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
};
const pick = (arr) => arr[rnd(arr.length)];
const digits = (n) => Array.from({ length: n }, () => rnd(10));
const onlyDigits = (v) => String(v ?? '').replace(/\s+/g, '');

/* ---------------- TC kimlik no ---------------- */

function tcknCheckDigits(first9) {
  const d = first9.map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = ((odd * 7 - even) % 10 + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return [d10, d11];
}

function tcknExplain(value) {
  const s = onlyDigits(value);
  const rules = {
    length: /^\d{11}$/.test(s),
    firstNotZero: s[0] !== undefined && s[0] !== '0',
    digit10: false,
    digit11: false,
  };
  if (rules.length) {
    const d = [...s].map(Number);
    const [d10, d11] = tcknCheckDigits(d.slice(0, 9));
    rules.digit10 = d[9] === d10;
    // 11. hane, girilen 10. haneyle hesaplanır
    rules.digit11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
  }
  return { valid: Object.values(rules).every(Boolean), rules };
}

function tcknComplete(first9) {
  const s = onlyDigits(first9);
  if (!/^[1-9]\d{8}$/.test(s)) throw new Error('İlk 9 hane 1-9 ile başlayan 9 rakam olmalı');
  return s + tcknCheckDigits([...s]).join('');
}

function tcknGenerate({ prefix = '' } = {}) {
  const p = onlyDigits(prefix);
  if (!/^\d{0,8}$/.test(p) || p[0] === '0') throw new Error('Geçersiz önek');
  const first = p ? [...p].map(Number) : [1 + rnd(9)];
  return tcknComplete([...first, ...digits(9 - first.length)].join(''));
}

function unique(gen, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Adet pozitif tam sayı olmalı');
  const set = new Set();
  let guard = count * 50;
  while (set.size < count && guard--) set.add(gen());
  if (set.size < count) throw new Error('Yeterli benzersiz değer üretilemedi');
  return [...set];
}

export const tckn = {
  generate: tcknGenerate,
  bulk: (count, opts) => unique(() => tcknGenerate(opts), count),
  validate: (v) => tcknExplain(v).valid,
  explain: tcknExplain,
  complete: tcknComplete,
  checkDigits: (first9) => tcknCheckDigits([...onlyDigits(first9)]),
};

/* ---------------- Yabancı kimlik no (99 ile başlar) ---------------- */

export const ykn = {
  generate: () => tcknGenerate({ prefix: '99' }),
  bulk: (count) => unique(() => tcknGenerate({ prefix: '99' }), count),
  validate: (v) => onlyDigits(v).startsWith('99') && tcknExplain(v).valid,
};

/* ---------------- Vergi kimlik no (10 hane) ---------------- */

function vknCheckDigit(first9) {
  let sum = 0;
  first9.map(Number).forEach((n, i) => {
    const t = (n + 9 - i) % 10;
    let v = (t * 2 ** (9 - i)) % 9;
    if (t !== 0 && v === 0) v = 9;
    sum += v;
  });
  return (10 - (sum % 10)) % 10;
}

export const vkn = {
  generate: () => {
    const d = digits(9);
    return d.join('') + vknCheckDigit(d);
  },
  bulk: (count) => unique(() => vkn.generate(), count),
  validate: (v) => {
    const s = onlyDigits(v);
    return /^\d{10}$/.test(s) && vknCheckDigit([...s.slice(0, 9)]) === Number(s[9]);
  },
  complete: (first9) => {
    const s = onlyDigits(first9);
    if (!/^\d{9}$/.test(s)) throw new Error('İlk 9 hane 9 rakam olmalı');
    return s + vknCheckDigit([...s]);
  },
};

/* ---------------- TR IBAN (MOD-97) ---------------- */

export const BANKS = {
  '00010': 'Ziraat Bankası',
  '00012': 'Halkbank',
  '00015': 'VakıfBank',
  '00032': 'TEB',
  '00046': 'Akbank',
  '00059': 'Şekerbank',
  '00062': 'Garanti BBVA',
  '00064': 'İş Bankası',
  '00067': 'Yapı Kredi',
  '00099': 'ING',
  '00111': 'QNB',
  '00123': 'HSBC',
  '00134': 'DenizBank',
  '00203': 'Albaraka Türk',
  '00205': 'Kuveyt Türk',
  '00206': 'Türkiye Finans',
};

const toNumeric = (s) => s.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
const mod97 = (numeric) => {
  let r = 0;
  for (const ch of numeric) r = (r * 10 + Number(ch)) % 97;
  return r;
};

function ibanCompact(v) {
  return String(v ?? '').replace(/\s+/g, '').toUpperCase();
}

export const iban = {
  banks: BANKS,
  generate: ({ bank } = {}) => {
    const code = bank ?? pick(Object.keys(BANKS));
    if (!/^\d{5}$/.test(code)) throw new Error('Banka kodu 5 hane olmalı');
    const bban = code + '0' + digits(16).join('');
    const check = String(98 - mod97(toNumeric(bban + 'TR00'))).padStart(2, '0');
    return 'TR' + check + bban;
  },
  bulk: (count, opts) => unique(() => iban.generate(opts), count),
  validate: (v) => {
    const s = ibanCompact(v);
    return /^TR\d{24}$/.test(s) && mod97(toNumeric(s.slice(4) + s.slice(0, 4))) === 1;
  },
  format: (v) => ibanCompact(v).replace(/(.{4})/g, '$1 ').trim(),
  bankName: (v) => BANKS[ibanCompact(v).slice(4, 9)] ?? null,
};

/* ---------------- Kart numarası (Luhn) ---------------- */

const luhnSum = (s, double) =>
  [...s].reverse().reduce((sum, ch, i) => {
    let n = Number(ch);
    if ((i % 2 === 1) !== double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    return sum + n;
  }, 0);

const NETWORKS = {
  visa: { prefixes: ['4'], length: 16 },
  mastercard: { prefixes: ['51', '52', '53', '54', '55', '2221', '2720'], length: 16 },
  amex: { prefixes: ['34', '37'], length: 15 },
  troy: { prefixes: ['9792'], length: 16 },
};

export const card = {
  networks: Object.keys(NETWORKS),
  generate: ({ network = 'visa' } = {}) => {
    const net = NETWORKS[network];
    if (!net) throw new Error('Bilinmeyen kart ağı: ' + network);
    const body = pick(net.prefixes) + '';
    const partial = body + digits(net.length - body.length - 1).join('');
    const check = (10 - (luhnSum(partial, true) % 10)) % 10;
    return partial + check;
  },
  luhn: (v) => {
    const s = onlyDigits(v);
    return /^\d{12,19}$/.test(s) && luhnSum(s, false) % 10 === 0;
  },
};

// Ödeme sağlayıcılarının yayımladığı resmi sandbox kartları.
// Kaynak: docs.iyzico.com ve docs.stripe.com/testing. Yalnızca sandbox ortamında çalışırlar.
export const TEST_CARDS = {
  iyzico: [
    { number: '5528790000000008', bank: 'Halkbank', type: 'credit', result: 'success' },
    { number: '5890040000000016', bank: 'Akbank', type: 'debit', result: 'success' },
    { number: '5400360000000003', bank: 'Garanti BBVA', type: 'credit', result: 'success' },
    { number: '4543590000000006', bank: 'İş Bankası', type: 'credit', result: 'success' },
    { number: '5451030000000000', bank: 'Yapı Kredi', type: 'credit', result: 'success' },
    { number: '9792030000000000', bank: 'QNB', type: 'credit', network: 'troy', result: 'success' },
    { number: '5400010000000004', bank: 'Yurt dışı', type: 'credit', result: 'success' },
    { number: '4111111111111129', result: 'insufficient_funds' },
    { number: '4129111111111111', result: 'do_not_honour' },
    { number: '4127111111111113', result: 'lost_card' },
    { number: '4126111111111114', result: 'stolen_card' },
    { number: '4125111111111115', result: 'expired_card' },
    { number: '4124111111111116', result: 'invalid_cvc' },
    { number: '4121111111111119', result: 'fraud_suspect' },
    { number: '4151111111111112', result: '3ds_initialize_failed' },
  ],
  stripe: [
    { number: '4242424242424242', network: 'visa', result: 'success' },
    { number: '5555555555554444', network: 'mastercard', result: 'success' },
    { number: '378282246310005', network: 'amex', result: 'success' },
    { number: '4000002500003155', result: '3ds_required' },
    { number: '4000000000000002', result: 'generic_decline' },
    { number: '4000000000009995', result: 'insufficient_funds' },
    { number: '4000000000000069', result: 'expired_card' },
    { number: '4000000000000127', result: 'incorrect_cvc' },
  ],
};

/* ---------------- Test kişisi ---------------- */

const NAMES = {
  female: ['Ayşe', 'Elif', 'Zeynep', 'Merve', 'Derya', 'Selin', 'Gizem', 'Nazlı', 'Ebru', 'Sinem', 'Duygu', 'Ece'],
  male: ['Mehmet', 'Emre', 'Burak', 'Kerem', 'Onur', 'Serkan', 'Tolga', 'Cem', 'Barış', 'Umut', 'Kaan', 'Deniz'],
};
const SURNAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Koç', 'Kurt', 'Polat', 'Erdem', 'Aksoy'];
const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Eskişehir', 'Trabzon', 'Gaziantep', 'Kayseri', 'Samsun', 'Mersin'];
const STREETS = ['Lale', 'Menekşe', 'Çınar', 'Defne', 'Ihlamur', 'Papatya', 'Gül', 'Akasya', 'Zambak', 'Söğüt'];
const PHONE_PREFIX = ['530', '532', '533', '535', '536', '542', '543', '544', '505', '506', '507', '552', '555'];

const ascii = (s) =>
  s.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]);

function birthDate(minAge = 18, maxAge = 70) {
  const now = new Date();
  const age = minAge + rnd(maxAge - minAge + 1);
  const d = new Date(now.getFullYear() - age, rnd(12), 1 + rnd(28));
  return d.toISOString().slice(0, 10);
}

export const person = {
  generate: ({ gender } = {}) => {
    const g = gender ?? pick(['female', 'male']);
    if (!NAMES[g]) throw new Error("Cinsiyet 'female' ya da 'male' olmalı");
    const firstName = pick(NAMES[g]);
    const lastName = pick(SURNAMES);
    const city = pick(CITIES);
    return {
      firstName,
      lastName,
      gender: g,
      tckn: tcknGenerate(),
      birthDate: birthDate(),
      phone: '0' + pick(PHONE_PREFIX) + digits(7).join(''),
      // example.com, RFC 2606 ile test için ayrılmış alan adıdır
      email: `${ascii(firstName)}.${ascii(lastName)}${rnd(100)}@example.com`,
      city,
      address: `${pick(STREETS)} Sokak No:${1 + rnd(120)} D:${1 + rnd(20)}, ${city}`,
      iban: iban.generate(),
    };
  },
  bulk: (count, opts) => Array.from({ length: count }, () => person.generate(opts)),
};

/* ---------------- Dışa aktarma ---------------- */

const rows = (kayitlar) => (Array.isArray(kayitlar) ? kayitlar : [kayitlar]).map((r) => (typeof r === 'object' ? r : { value: r }));
const csvCell = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const sqlVal = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const sqlIdent = (s) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new Error('Geçersiz SQL tanımlayıcısı: ' + s);
  return s;
};

export const exporter = {
  json: (kayitlar) => JSON.stringify(kayitlar, null, 2),
  csv: (kayitlar) => {
    const r = rows(kayitlar);
    const cols = Object.keys(r[0] ?? {});
    return [cols.join(','), ...r.map((o) => cols.map((c) => csvCell(o[c] ?? '')).join(','))].join('\n');
  },
  sql: (kayitlar, table = 'kayitlar') => {
    const r = rows(kayitlar);
    const cols = Object.keys(r[0] ?? {}).map(sqlIdent);
    const values = r.map((o) => '(' + cols.map((c) => sqlVal(o[c] ?? '')).join(', ') + ')');
    return `INSERT INTO ${sqlIdent(table)} (${cols.join(', ')}) VALUES\n${values.join(',\n')};`;
  },
};

export default { tckn, ykn, vkn, iban, card, person, exporter, TEST_CARDS, BANKS };

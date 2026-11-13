#!/usr/bin/env node
// Kullanım: npx tc-kimlik-no <tur> [adet] [--format json|csv|sql|txt]
import { tckn, ykn, vkn, iban, card, person, exporter } from './index.js';

const [type = 'help', ...rest] = process.argv.slice(2);
const count = Number(rest.find((a) => /^\d+$/.test(a)) ?? 1);
const fmtIdx = rest.indexOf('--format');
const format = fmtIdx >= 0 ? rest[fmtIdx + 1] : 'txt';

const generators = {
  tckn: () => tckn.bulk(count),
  ykn: () => ykn.bulk(count),
  vkn: () => vkn.bulk(count),
  iban: () => iban.bulk(count),
  kart: () => Array.from({ length: count }, () => card.generate()),
  kisi: () => person.bulk(count),
};

if (type === 'dogrula') {
  const v = rest.find((a) => !a.startsWith('--')) ?? '';
  const res = { tckn: tckn.validate(v), ykn: ykn.validate(v), vkn: vkn.validate(v), iban: iban.validate(v), kart: card.luhn(v) };
  console.log(JSON.stringify(res, null, 2));
} else if (generators[type]) {
  if (count < 1 || count > 10000) {
    console.error('Adet 1 ile 10000 arasında olmalı');
    process.exit(1);
  }
  const kayitlar = generators[type]();
  const out = { json: exporter.json, csv: exporter.csv, sql: exporter.sql }[format];
  console.log(out ? out(kayitlar) : kayitlar.map((d) => (typeof d === 'object' ? JSON.stringify(d) : d)).join('\n'));
} else {
  console.log(`tc-kimlik-no

Kullanım:
  tc-kimlik-no tckn 5                 5 TC kimlik no üret
  tc-kimlik-no ykn 3                  99 ile başlayan yabancı kimlik no
  tc-kimlik-no vkn 3                  vergi kimlik no
  tc-kimlik-no iban 3                 TR IBAN
  tc-kimlik-no kart 3                 Luhn uyumlu kart numarası
  tc-kimlik-no kisi 10 --format csv   test kişisi (json | csv | sql | txt)
  tc-kimlik-no dogrula <numara>       numarayı tüm kurallara göre kontrol et`);
}

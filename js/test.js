import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tckn, ykn, vkn, iban, card, person, exporter, TEST_CARDS } from './index.js';

test('TC kimlik no: kurallar', () => {
  assert.deepEqual(tckn.checkDigits('123456789'), [5, 0]); // README'deki örnek hesap
  const n = tckn.generate();
  assert.equal(tckn.validate(n), true);
  assert.equal(tckn.validate(n.slice(0, 10) + ((Number(n[10]) + 1) % 10)), false); // 11. hane yanlış
  assert.equal(tckn.validate('0' + n.slice(1)), false); // 0 ile başlıyor
  assert.equal(tckn.validate(n.slice(0, 10)), false); // 10 hane
  assert.equal(tckn.complete(n.slice(0, 9)), n);
});

test('TC kimlik no: 11. hane girilen 10. haneyle hesaplanır', () => {
  const n = tckn.generate();
  const bad10 = (Number(n[9]) + 1) % 10;
  const r = tckn.explain(n.slice(0, 9) + bad10 + n[10]);
  assert.equal(r.rules.digit10, false);
  assert.equal(r.rules.digit11, false);
});

test('TC kimlik no: üretilenler geçerli, son hane çift, benzersiz', () => {
  const list = tckn.bulk(2000);
  assert.equal(new Set(list).size, 2000);
  for (const n of list) {
    assert.equal(tckn.validate(n), true, n);
    assert.equal(Number(n[10]) % 2, 0, n);
  }
});

test('YKN 99 ile başlar ve geçerlidir', () => {
  for (const n of ykn.bulk(200)) {
    assert.ok(n.startsWith('99'));
    assert.equal(ykn.validate(n), true);
  }
  assert.equal(ykn.validate(tckn.generate({ prefix: '1' })), false);
});

test('VKN', () => {
  for (const n of vkn.bulk(500)) assert.equal(vkn.validate(n), true, n);
  const n = vkn.generate();
  const wrong = n.slice(0, 9) + ((Number(n[9]) + 1) % 10);
  assert.equal(vkn.validate(wrong), false);
});

test('IBAN: MOD-97, biçim ve banka adı', () => {
  for (const n of iban.bulk(500)) assert.equal(iban.validate(n), true, n);
  const g = iban.generate({ bank: '00062' });
  assert.equal(iban.bankName(g), 'Garanti BBVA');
  assert.equal(g.length, 26);
  assert.equal(iban.validate(iban.format(g)), true);
  assert.equal(iban.validate(g.slice(0, 25) + ((Number(g[25]) + 1) % 10)), false);
  assert.equal(iban.validate('DE' + g.slice(2)), false);
});

test('Kart: Luhn ve ağlar', () => {
  for (const net of card.networks) {
    for (let i = 0; i < 200; i++) assert.equal(card.luhn(card.generate({ network: net })), true, net);
  }
  assert.equal(card.generate({ network: 'amex' }).length, 15);
  assert.equal(card.luhn('4242424242424241'), false);
});

test('Resmi test kartlarının hepsi Luhn uyumlu', () => {
  for (const c of [...TEST_CARDS.iyzico, ...TEST_CARDS.stripe]) assert.equal(card.luhn(c.number), true, c.number);
});

test('Test kişisi', () => {
  const p = person.generate({ gender: 'female' });
  assert.equal(p.gender, 'female');
  assert.equal(tckn.validate(p.tckn), true);
  assert.equal(iban.validate(p.iban), true);
  assert.match(p.phone, /^05\d{9}$/);
  assert.match(p.email, /^[a-z]+\.[a-z]+\d*@example\.com$/);
});

test('Dışa aktarma', () => {
  const kayitlar = [{ ad: "O'Neil", no: 1 }, { ad: 'a,b', no: 2 }];
  assert.equal(exporter.csv(kayitlar), 'ad,no\nO\'Neil,1\n"a,b",2');
  assert.match(exporter.sql(kayitlar, 'kisiler'), /\('O''Neil', 1\)/);
  assert.throws(() => exporter.sql(kayitlar, 'x; DROP'));
  assert.equal(exporter.csv(['1', '2']), 'value\n1\n2');
});

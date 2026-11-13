<?php
declare(strict_types=1);
require __DIR__ . '/TcKimlikNo.php';

$fail = 0;
function ok(bool $cond, string $msg): void
{
    global $fail;
    if (!$cond) { $fail++; echo "HATA: $msg\n"; }
}

ok(TcKimlikNo::tcknCheckDigits('123456789') === [5, 0], 'örnek hesap');
foreach (TcKimlikNo::tcknBulk(2000) as $n) {
    ok(TcKimlikNo::tcknValidate($n), "tckn $n");
    ok((int) $n[10] % 2 === 0, "son hane çift $n");
}
$n = TcKimlikNo::tcknGenerate();
ok(!TcKimlikNo::tcknValidate(substr($n, 0, 10) . (((int) $n[10] + 1) % 10)), '11. hane yanlış');
ok(!TcKimlikNo::tcknValidate('0' . substr($n, 1)), '0 ile başlıyor');
ok(TcKimlikNo::tcknComplete(substr($n, 0, 9)) === $n, 'complete');
$y = TcKimlikNo::yknGenerate();
ok(str_starts_with($y, '99') && TcKimlikNo::yknValidate($y), 'ykn');
for ($i = 0; $i < 500; $i++) {
    ok(TcKimlikNo::vknValidate(TcKimlikNo::vknGenerate()), 'vkn');
    ok(TcKimlikNo::ibanValidate(TcKimlikNo::ibanGenerate()), 'iban');
}
$g = TcKimlikNo::ibanGenerate('00062');
ok(TcKimlikNo::ibanBankName($g) === 'Garanti BBVA', 'banka adı');
ok(TcKimlikNo::ibanValidate(TcKimlikNo::ibanFormat($g)), 'iban biçim');
foreach (['visa', 'mastercard', 'amex', 'troy'] as $net) {
    for ($i = 0; $i < 200; $i++) ok(TcKimlikNo::luhnValid(TcKimlikNo::cardGenerate($net)), $net);
}
$p = TcKimlikNo::personGenerate('female');
ok(TcKimlikNo::tcknValidate($p['tckn']) && TcKimlikNo::ibanValidate($p['iban']), 'kişi');
ok((bool) preg_match('/^[a-z]+\.[a-z]+\d*@example\.com$/', $p['email']), 'e-posta ' . $p['email']);
$kayitlar = [['ad' => "O'Neil", 'no' => 1], ['ad' => 'a,b', 'no' => 2]];
ok(TcKimlikNo::toCsv($kayitlar) === "ad,no\nO'Neil,1\n\"a,b\",2", 'csv');
ok(str_contains(TcKimlikNo::toSql($kayitlar, 'kisiler'), "('O''Neil', 1)"), 'sql');
try { TcKimlikNo::toSql($kayitlar, 'x; DROP'); ok(false, 'sql enjeksiyon'); } catch (InvalidArgumentException) {}

echo $fail === 0 ? "Tüm testler geçti\n" : "$fail hata\n";
exit($fail === 0 ? 0 : 1);

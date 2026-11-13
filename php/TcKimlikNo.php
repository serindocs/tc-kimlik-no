<?php
declare(strict_types=1);

/**
 * tc-kimlik-no: TC kimlik no, YKN, VKN, TR IBAN, kart numarası ve test kişisi
 * üretme ve doğrulama. Bağımlılık yok, PHP 8.1+.
 */
final class TcKimlikNo
{
    public const BANKS = [
        '00010' => 'Ziraat Bankası', '00012' => 'Halkbank', '00015' => 'VakıfBank', '00032' => 'TEB',
        '00046' => 'Akbank', '00059' => 'Şekerbank', '00062' => 'Garanti BBVA', '00064' => 'İş Bankası',
        '00067' => 'Yapı Kredi', '00099' => 'ING', '00111' => 'QNB', '00123' => 'HSBC',
        '00134' => 'DenizBank', '00203' => 'Albaraka Türk', '00205' => 'Kuveyt Türk', '00206' => 'Türkiye Finans',
    ];

    private const NETWORKS = [
        'visa' => [['4'], 16],
        'mastercard' => [['51', '52', '53', '54', '55', '2221', '2720'], 16],
        'amex' => [['34', '37'], 15],
        'troy' => [['9792'], 16],
    ];

    private static function digits(int $n): string
    {
        $s = '';
        for ($i = 0; $i < $n; $i++) $s .= (string) random_int(0, 9);
        return $s;
    }

    private static function clean(string $v): string
    {
        return preg_replace('/\s+/', '', $v) ?? '';
    }

    /** @return string[] */
    private static function unique(callable $gen, int $count): array
    {
        if ($count < 1) throw new InvalidArgumentException('Adet pozitif olmalı');
        $set = [];
        $guard = $count * 50;
        while (count($set) < $count && $guard-- > 0) $set[$gen()] = true;
        if (count($set) < $count) throw new RuntimeException('Yeterli benzersiz değer üretilemedi');
        return array_map('strval', array_keys($set));
    }

    /* ---------- TC kimlik no ---------- */

    /** @return array{0:int,1:int} */
    public static function tcknCheckDigits(string $first9): array
    {
        $d = array_map('intval', str_split($first9));
        $odd = $d[0] + $d[2] + $d[4] + $d[6] + $d[8];
        $even = $d[1] + $d[3] + $d[5] + $d[7];
        $d10 = (($odd * 7 - $even) % 10 + 10) % 10;
        return [$d10, (array_sum($d) + $d10) % 10];
    }

    public static function tcknComplete(string $first9): string
    {
        $s = self::clean($first9);
        if (!preg_match('/^[1-9]\d{8}$/', $s)) throw new InvalidArgumentException('İlk 9 hane 1-9 ile başlayan 9 rakam olmalı');
        return $s . implode('', self::tcknCheckDigits($s));
    }

    public static function tcknGenerate(string $prefix = ''): string
    {
        $p = self::clean($prefix);
        if (!preg_match('/^\d{0,8}$/', $p) || str_starts_with($p, '0')) throw new InvalidArgumentException('Geçersiz önek');
        $first = $p !== '' ? $p : (string) random_int(1, 9);
        return self::tcknComplete($first . self::digits(9 - strlen($first)));
    }

    /** @return string[] */
    public static function tcknBulk(int $count, string $prefix = ''): array
    {
        return self::unique(fn () => self::tcknGenerate($prefix), $count);
    }

    /** @return array{valid:bool,rules:array<string,bool>} */
    public static function tcknExplain(string $value): array
    {
        $s = self::clean($value);
        $rules = ['length' => (bool) preg_match('/^\d{11}$/', $s), 'firstNotZero' => $s !== '' && $s[0] !== '0', 'digit10' => false, 'digit11' => false];
        if ($rules['length']) {
            $d = array_map('intval', str_split($s));
            $rules['digit10'] = $d[9] === self::tcknCheckDigits(substr($s, 0, 9))[0];
            $rules['digit11'] = array_sum(array_slice($d, 0, 10)) % 10 === $d[10]; // girilen 10. haneyle
        }
        return ['valid' => !in_array(false, $rules, true), 'rules' => $rules];
    }

    public static function tcknValidate(string $value): bool
    {
        return self::tcknExplain($value)['valid'];
    }

    /* ---------- Yabancı kimlik no ---------- */

    public static function yknGenerate(): string
    {
        return self::tcknGenerate('99');
    }

    public static function yknValidate(string $value): bool
    {
        return str_starts_with(self::clean($value), '99') && self::tcknValidate($value);
    }

    /* ---------- Vergi kimlik no ---------- */

    private static function vknCheck(string $first9): int
    {
        $sum = 0;
        foreach (str_split($first9) as $i => $c) {
            $t = ((int) $c + 9 - $i) % 10;
            $v = ($t * (2 ** (9 - $i))) % 9;
            if ($t !== 0 && $v === 0) $v = 9;
            $sum += $v;
        }
        return (10 - $sum % 10) % 10;
    }

    public static function vknGenerate(): string
    {
        $f = self::digits(9);
        return $f . self::vknCheck($f);
    }

    public static function vknComplete(string $first9): string
    {
        $s = self::clean($first9);
        if (!preg_match('/^\d{9}$/', $s)) throw new InvalidArgumentException('İlk 9 hane 9 rakam olmalı');
        return $s . self::vknCheck($s);
    }

    public static function vknValidate(string $value): bool
    {
        $s = self::clean($value);
        return (bool) preg_match('/^\d{10}$/', $s) && self::vknCheck(substr($s, 0, 9)) === (int) $s[9];
    }

    /* ---------- TR IBAN ---------- */

    private static function mod97(string $s): int
    {
        $numeric = preg_replace_callback('/[A-Z]/', fn ($m) => (string) (ord($m[0]) - 55), $s);
        $r = 0;
        foreach (str_split($numeric) as $c) $r = ($r * 10 + (int) $c) % 97;
        return $r;
    }

    public static function ibanGenerate(?string $bank = null): string
    {
        $code = $bank ?? array_rand(self::BANKS);
        $code = (string) $code;
        if (!preg_match('/^\d{5}$/', $code)) throw new InvalidArgumentException('Banka kodu 5 hane olmalı');
        $bban = $code . '0' . self::digits(16);
        return sprintf('TR%02d%s', 98 - self::mod97($bban . 'TR00'), $bban);
    }

    public static function ibanValidate(string $value): bool
    {
        $s = strtoupper(self::clean($value));
        return (bool) preg_match('/^TR\d{24}$/', $s) && self::mod97(substr($s, 4) . substr($s, 0, 4)) === 1;
    }

    public static function ibanFormat(string $value): string
    {
        return trim(chunk_split(strtoupper(self::clean($value)), 4, ' '));
    }

    public static function ibanBankName(string $value): ?string
    {
        return self::BANKS[substr(strtoupper(self::clean($value)), 4, 5)] ?? null;
    }

    /* ---------- Kart (Luhn) ---------- */

    private static function luhnTotal(string $s, bool $doubleFirst): int
    {
        $sum = 0;
        foreach (array_reverse(str_split($s)) as $i => $c) {
            $n = (int) $c;
            if (($i % 2 === 0) === $doubleFirst) {
                $n *= 2;
                if ($n > 9) $n -= 9;
            }
            $sum += $n;
        }
        return $sum;
    }

    public static function cardGenerate(string $network = 'visa'): string
    {
        if (!isset(self::NETWORKS[$network])) throw new InvalidArgumentException("Bilinmeyen kart ağı: $network");
        [$prefixes, $length] = self::NETWORKS[$network];
        $p = $prefixes[array_rand($prefixes)];
        $partial = $p . self::digits($length - strlen($p) - 1);
        return $partial . (10 - self::luhnTotal($partial, true) % 10) % 10;
    }

    public static function luhnValid(string $value): bool
    {
        $s = self::clean($value);
        return (bool) preg_match('/^\d{12,19}$/', $s) && self::luhnTotal($s, false) % 10 === 0;
    }

    /* ---------- Test kişisi ---------- */

    private const NAMES = [
        'female' => ['Ayşe', 'Elif', 'Zeynep', 'Merve', 'Derya', 'Selin', 'Gizem', 'Nazlı', 'Ebru', 'Sinem', 'Duygu', 'Ece'],
        'male' => ['Mehmet', 'Emre', 'Burak', 'Kerem', 'Onur', 'Serkan', 'Tolga', 'Cem', 'Barış', 'Umut', 'Kaan', 'Deniz'],
    ];
    private const SURNAMES = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Koç', 'Kurt', 'Polat', 'Erdem', 'Aksoy'];
    private const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Eskişehir', 'Trabzon', 'Gaziantep', 'Kayseri', 'Samsun', 'Mersin'];
    private const STREETS = ['Lale', 'Menekşe', 'Çınar', 'Defne', 'Ihlamur', 'Papatya', 'Gül', 'Akasya', 'Zambak', 'Söğüt'];
    private const PHONE = ['530', '532', '533', '535', '536', '542', '543', '544', '505', '506', '507', '552', '555'];

    private static function pick(array $a): string
    {
        return $a[array_rand($a)];
    }

    private static function ascii(string $s): string
    {
        return strtolower(strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u',
            'Ç' => 'c', 'Ğ' => 'g', 'İ' => 'i', 'Ö' => 'o', 'Ş' => 's', 'Ü' => 'u']));
    }

    /** @return array<string,string> */
    public static function personGenerate(?string $gender = null): array
    {
        $g = $gender ?? self::pick(['female', 'male']);
        if (!isset(self::NAMES[$g])) throw new InvalidArgumentException("Cinsiyet 'female' ya da 'male' olmalı");
        $first = self::pick(self::NAMES[$g]);
        $last = self::pick(self::SURNAMES);
        $city = self::pick(self::CITIES);
        $birth = sprintf('%04d-%02d-%02d', (int) date('Y') - random_int(18, 70), random_int(1, 12), random_int(1, 28));
        return [
            'firstName' => $first,
            'lastName' => $last,
            'gender' => $g,
            'tckn' => self::tcknGenerate(),
            'birthDate' => $birth,
            'phone' => '0' . self::pick(self::PHONE) . self::digits(7),
            'email' => self::ascii($first) . '.' . self::ascii($last) . random_int(0, 99) . '@example.com', // RFC 2606
            'city' => $city,
            'address' => self::pick(self::STREETS) . ' Sokak No:' . random_int(1, 120) . ' D:' . random_int(1, 20) . ', ' . $city,
            'iban' => self::ibanGenerate(),
        ];
    }

    /* ---------- Dışa aktarma ---------- */

    private static function rows(array $kayitlar): array
    {
        $kayitlar = array_is_list($kayitlar) ? $kayitlar : [$kayitlar];
        return array_map(fn ($r) => is_array($r) ? $r : ['value' => $r], $kayitlar);
    }

    public static function toJson(array $kayitlar): string
    {
        return json_encode($kayitlar, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function toCsv(array $kayitlar): string
    {
        $rows = self::rows($kayitlar);
        $cols = array_keys($rows[0] ?? []);
        $cell = fn ($v) => preg_match('/[",\n;]/', (string) $v) ? '"' . str_replace('"', '""', (string) $v) . '"' : (string) $v;
        $out = [implode(',', $cols)];
        foreach ($rows as $r) $out[] = implode(',', array_map(fn ($c) => $cell($r[$c] ?? ''), $cols));
        return implode("\n", $out);
    }

    public static function toSql(array $kayitlar, string $table = 'kayitlar'): string
    {
        $ident = function (string $s): string {
            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $s)) throw new InvalidArgumentException("Geçersiz SQL tanımlayıcısı: $s");
            return $s;
        };
        $rows = self::rows($kayitlar);
        $cols = array_map($ident, array_keys($rows[0] ?? []));
        $val = fn ($v) => is_int($v) || is_float($v) ? (string) $v : "'" . str_replace("'", "''", (string) $v) . "'";
        $values = array_map(fn ($r) => '(' . implode(', ', array_map(fn ($c) => $val($r[$c] ?? ''), $cols)) . ')', $rows);
        return 'INSERT INTO ' . $ident($table) . ' (' . implode(', ', $cols) . ") VALUES\n" . implode(",\n", $values) . ';';
    }
}

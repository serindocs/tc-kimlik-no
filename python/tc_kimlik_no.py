"""tc-kimlik-no: TC kimlik no, YKN, VKN, TR IBAN, kart numarası ve test kişisi
üretme ve doğrulama. Yalnızca standart kütüphane kullanır (Python 3.8+)."""

from __future__ import annotations

import csv
import io
import json
import re
import secrets
from datetime import date

__all__ = [
    "tckn_generate", "tckn_validate", "tckn_explain", "tckn_complete", "tckn_bulk",
    "ykn_generate", "ykn_validate", "vkn_generate", "vkn_validate", "vkn_complete",
    "iban_generate", "iban_validate", "iban_format", "iban_bank_name", "BANKS",
    "card_generate", "luhn_valid", "TEST_CARDS", "person_generate",
    "to_json", "to_csv", "to_sql",
]

_rand = secrets.SystemRandom()


def _digits(n: int) -> list[int]:
    return [_rand.randrange(10) for _ in range(n)]


def _clean(value) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def _unique(gen, count: int) -> list[str]:
    if count < 1:
        raise ValueError("Adet pozitif olmalı")
    seen: dict[str, None] = {}
    guard = count * 50
    while len(seen) < count and guard:
        seen[gen()] = None
        guard -= 1
    if len(seen) < count:
        raise RuntimeError("Yeterli benzersiz değer üretilemedi")
    return list(seen)


# ---------------- TC kimlik no ----------------

def _tckn_check(first9: list[int]) -> tuple[int, int]:
    odd = sum(first9[0:9:2])
    even = sum(first9[1:8:2])
    d10 = (odd * 7 - even) % 10
    d11 = (sum(first9) + d10) % 10
    return d10, d11


def tckn_complete(first9: str) -> str:
    s = _clean(first9)
    if not re.fullmatch(r"[1-9]\d{8}", s):
        raise ValueError("İlk 9 hane 1-9 ile başlayan 9 rakam olmalı")
    d10, d11 = _tckn_check([int(c) for c in s])
    return f"{s}{d10}{d11}"


def tckn_generate(prefix: str = "") -> str:
    p = _clean(prefix)
    if not re.fullmatch(r"\d{0,8}", p) or p.startswith("0"):
        raise ValueError("Geçersiz önek")
    first = [int(c) for c in p] or [_rand.randrange(1, 10)]
    return tckn_complete("".join(map(str, first + _digits(9 - len(first)))))


def tckn_bulk(count: int, prefix: str = "") -> list[str]:
    return _unique(lambda: tckn_generate(prefix), count)


def tckn_explain(value) -> dict:
    s = _clean(value)
    rules = {"length": bool(re.fullmatch(r"\d{11}", s)), "first_not_zero": s[:1] not in ("", "0"),
             "digit10": False, "digit11": False}
    if rules["length"]:
        d = [int(c) for c in s]
        d10, _ = _tckn_check(d[:9])
        rules["digit10"] = d[9] == d10
        rules["digit11"] = sum(d[:10]) % 10 == d[10]  # girilen 10. haneyle
    return {"valid": all(rules.values()), "rules": rules}


def tckn_validate(value) -> bool:
    return tckn_explain(value)["valid"]


# ---------------- Yabancı kimlik no ----------------

def ykn_generate() -> str:
    return tckn_generate("99")


def ykn_validate(value) -> bool:
    return _clean(value).startswith("99") and tckn_validate(value)


# ---------------- Vergi kimlik no ----------------

def _vkn_check(first9: list[int]) -> int:
    total = 0
    for i, n in enumerate(first9):
        t = (n + 9 - i) % 10
        v = (t * 2 ** (9 - i)) % 9
        if t != 0 and v == 0:
            v = 9
        total += v
    return (10 - total % 10) % 10


def vkn_complete(first9: str) -> str:
    s = _clean(first9)
    if not re.fullmatch(r"\d{9}", s):
        raise ValueError("İlk 9 hane 9 rakam olmalı")
    return s + str(_vkn_check([int(c) for c in s]))


def vkn_generate() -> str:
    return vkn_complete("".join(map(str, _digits(9))))


def vkn_validate(value) -> bool:
    s = _clean(value)
    return bool(re.fullmatch(r"\d{10}", s)) and _vkn_check([int(c) for c in s[:9]]) == int(s[9])


# ---------------- TR IBAN ----------------

BANKS = {
    "00010": "Ziraat Bankası", "00012": "Halkbank", "00015": "VakıfBank", "00032": "TEB",
    "00046": "Akbank", "00059": "Şekerbank", "00062": "Garanti BBVA", "00064": "İş Bankası",
    "00067": "Yapı Kredi", "00099": "ING", "00111": "QNB", "00123": "HSBC",
    "00134": "DenizBank", "00203": "Albaraka Türk", "00205": "Kuveyt Türk", "00206": "Türkiye Finans",
}


def _numeric(s: str) -> int:
    return int("".join(str(ord(c) - 55) if c.isalpha() else c for c in s))


def iban_generate(bank: str | None = None) -> str:
    code = bank or _rand.choice(list(BANKS))
    if not re.fullmatch(r"\d{5}", code):
        raise ValueError("Banka kodu 5 hane olmalı")
    bban = code + "0" + "".join(map(str, _digits(16)))
    check = 98 - _numeric(bban + "TR00") % 97
    return f"TR{check:02d}{bban}"


def iban_validate(value) -> bool:
    s = _clean(value).upper()
    return bool(re.fullmatch(r"TR\d{24}", s)) and _numeric(s[4:] + s[:4]) % 97 == 1


def iban_format(value) -> str:
    s = _clean(value).upper()
    return " ".join(s[i:i + 4] for i in range(0, len(s), 4))


def iban_bank_name(value):
    return BANKS.get(_clean(value).upper()[4:9])


# ---------------- Kart (Luhn) ----------------

_NETWORKS = {
    "visa": (["4"], 16),
    "mastercard": (["51", "52", "53", "54", "55", "2221", "2720"], 16),
    "amex": (["34", "37"], 15),
    "troy": (["9792"], 16),
}


def _luhn_total(s: str, double_first: bool) -> int:
    total = 0
    for i, ch in enumerate(reversed(s)):
        n = int(ch)
        if (i % 2 == 0) == double_first:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total


def card_generate(network: str = "visa") -> str:
    if network not in _NETWORKS:
        raise ValueError(f"Bilinmeyen kart ağı: {network}")
    prefixes, length = _NETWORKS[network]
    partial = _rand.choice(prefixes)
    partial += "".join(map(str, _digits(length - len(partial) - 1)))
    return partial + str((10 - _luhn_total(partial, True) % 10) % 10)


def luhn_valid(value) -> bool:
    s = _clean(value)
    return bool(re.fullmatch(r"\d{12,19}", s)) and _luhn_total(s, False) % 10 == 0


# Kaynak: docs.iyzico.com ve docs.stripe.com/testing — yalnızca sandbox ortamında çalışır.
TEST_CARDS = {
    "iyzico": [
        {"number": "5528790000000008", "bank": "Halkbank", "type": "credit", "result": "success"},
        {"number": "5890040000000016", "bank": "Akbank", "type": "debit", "result": "success"},
        {"number": "5400360000000003", "bank": "Garanti BBVA", "type": "credit", "result": "success"},
        {"number": "4543590000000006", "bank": "İş Bankası", "type": "credit", "result": "success"},
        {"number": "5451030000000000", "bank": "Yapı Kredi", "type": "credit", "result": "success"},
        {"number": "9792030000000000", "bank": "QNB", "type": "credit", "network": "troy", "result": "success"},
        {"number": "5400010000000004", "bank": "Yurt dışı", "type": "credit", "result": "success"},
        {"number": "4111111111111129", "result": "insufficient_funds"},
        {"number": "4129111111111111", "result": "do_not_honour"},
        {"number": "4127111111111113", "result": "lost_card"},
        {"number": "4126111111111114", "result": "stolen_card"},
        {"number": "4125111111111115", "result": "expired_card"},
        {"number": "4124111111111116", "result": "invalid_cvc"},
        {"number": "4121111111111119", "result": "fraud_suspect"},
        {"number": "4151111111111112", "result": "3ds_initialize_failed"},
    ],
    "stripe": [
        {"number": "4242424242424242", "network": "visa", "result": "success"},
        {"number": "5555555555554444", "network": "mastercard", "result": "success"},
        {"number": "378282246310005", "network": "amex", "result": "success"},
        {"number": "4000002500003155", "result": "3ds_required"},
        {"number": "4000000000000002", "result": "generic_decline"},
        {"number": "4000000000009995", "result": "insufficient_funds"},
        {"number": "4000000000000069", "result": "expired_card"},
        {"number": "4000000000000127", "result": "incorrect_cvc"},
    ],
}


# ---------------- Test kişisi ----------------

_NAMES = {
    "female": ["Ayşe", "Elif", "Zeynep", "Merve", "Derya", "Selin", "Gizem", "Nazlı", "Ebru", "Sinem", "Duygu", "Ece"],
    "male": ["Mehmet", "Emre", "Burak", "Kerem", "Onur", "Serkan", "Tolga", "Cem", "Barış", "Umut", "Kaan", "Deniz"],
}
_SURNAMES = ["Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Aydın", "Öztürk", "Arslan", "Doğan", "Koç", "Kurt", "Polat", "Erdem", "Aksoy"]
_CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Konya", "Eskişehir", "Trabzon", "Gaziantep", "Kayseri", "Samsun", "Mersin"]
_STREETS = ["Lale", "Menekşe", "Çınar", "Defne", "Ihlamur", "Papatya", "Gül", "Akasya", "Zambak", "Söğüt"]
_PHONE = ["530", "532", "533", "535", "536", "542", "543", "544", "505", "506", "507", "552", "555"]
_TR = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


def _ascii(s: str) -> str:
    return s.translate(_TR).lower()


def person_generate(gender: str | None = None) -> dict:
    g = gender or _rand.choice(["female", "male"])
    if g not in _NAMES:
        raise ValueError("Cinsiyet 'female' ya da 'male' olmalı")
    first, last, city = _rand.choice(_NAMES[g]), _rand.choice(_SURNAMES), _rand.choice(_CITIES)
    today = date.today()
    birth = date(today.year - _rand.randint(18, 70), _rand.randint(1, 12), _rand.randint(1, 28))
    return {
        "firstName": first,
        "lastName": last,
        "gender": g,
        "tckn": tckn_generate(),
        "birthDate": birth.isoformat(),
        "phone": "0" + _rand.choice(_PHONE) + "".join(map(str, _digits(7))),
        "email": f"{_ascii(first)}.{_ascii(last)}{_rand.randrange(100)}@example.com",  # RFC 2606
        "city": city,
        "address": f"{_rand.choice(_STREETS)} Sokak No:{_rand.randint(1, 120)} D:{_rand.randint(1, 20)}, {city}",
        "iban": iban_generate(),
    }


# ---------------- Dışa aktarma ----------------

def _rows(kayitlar) -> list[dict]:
    kayitlar = kayitlar if isinstance(kayitlar, list) else [kayitlar]
    return [r if isinstance(r, dict) else {"value": r} for r in kayitlar]


def to_json(kayitlar) -> str:
    return json.dumps(kayitlar, ensure_ascii=False, indent=2)


def to_csv(kayitlar) -> str:
    rows = _rows(kayitlar)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0]) if rows else [], lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().rstrip("\n")


def _ident(s: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", s):
        raise ValueError(f"Geçersiz SQL tanımlayıcısı: {s}")
    return s


def to_sql(kayitlar, table: str = "kayitlar") -> str:
    rows = _rows(kayitlar)
    cols = [_ident(c) for c in (rows[0] if rows else {})]
    val = lambda v: str(v) if isinstance(v, (int, float)) else "'" + str(v).replace("'", "''") + "'"
    values = ",\n".join("(" + ", ".join(val(r.get(c, "")) for c in cols) + ")" for r in rows)
    return f"INSERT INTO {_ident(table)} ({', '.join(cols)}) VALUES\n{values};"

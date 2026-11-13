import unittest

import tc_kimlik_no as t


class Test(unittest.TestCase):
    def test_tckn(self):
        self.assertEqual(t._tckn_check([1, 2, 3, 4, 5, 6, 7, 8, 9]), (5, 0))
        for n in t.tckn_bulk(2000):
            self.assertTrue(t.tckn_validate(n), n)
            self.assertEqual(int(n[10]) % 2, 0)
        n = t.tckn_generate()
        self.assertFalse(t.tckn_validate(n[:10] + str((int(n[10]) + 1) % 10)))
        self.assertFalse(t.tckn_validate("0" + n[1:]))
        self.assertEqual(t.tckn_complete(n[:9]), n)
        bad = t.tckn_explain(n[:9] + str((int(n[9]) + 1) % 10) + n[10])
        self.assertFalse(bad["rules"]["digit10"])
        self.assertFalse(bad["rules"]["digit11"])

    def test_ykn(self):
        n = t.ykn_generate()
        self.assertTrue(n.startswith("99") and t.ykn_validate(n))
        self.assertFalse(t.ykn_validate(t.tckn_generate("1")))

    def test_vkn(self):
        for _ in range(500):
            self.assertTrue(t.vkn_validate(t.vkn_generate()))
        n = t.vkn_generate()
        self.assertFalse(t.vkn_validate(n[:9] + str((int(n[9]) + 1) % 10)))

    def test_iban(self):
        for _ in range(500):
            self.assertTrue(t.iban_validate(t.iban_generate()))
        g = t.iban_generate("00062")
        self.assertEqual(t.iban_bank_name(g), "Garanti BBVA")
        self.assertTrue(t.iban_validate(t.iban_format(g)))
        self.assertFalse(t.iban_validate(g[:25] + str((int(g[25]) + 1) % 10)))

    def test_card(self):
        for net in ("visa", "mastercard", "amex", "troy"):
            for _ in range(200):
                self.assertTrue(t.luhn_valid(t.card_generate(net)), net)
        for c in t.TEST_CARDS["iyzico"] + t.TEST_CARDS["stripe"]:
            self.assertTrue(t.luhn_valid(c["number"]), c["number"])

    def test_person_and_export(self):
        p = t.person_generate("male")
        self.assertTrue(t.tckn_validate(p["tckn"]) and t.iban_validate(p["iban"]))
        self.assertRegex(p["email"], r"^[a-z]+\.[a-z]+\d*@example\.com$")
        kayitlar = [{"ad": "O'Neil", "no": 1}, {"ad": "a,b", "no": 2}]
        self.assertEqual(t.to_csv(kayitlar), 'ad,no\nO\'Neil,1\n"a,b",2')
        self.assertIn("('O''Neil', 1)", t.to_sql(kayitlar, "kisiler"))
        with self.assertRaises(ValueError):
            t.to_sql(kayitlar, "x; DROP")


if __name__ == "__main__":
    unittest.main()

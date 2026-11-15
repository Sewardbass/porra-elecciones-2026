import json
import re
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from server import BASE_DIR, PorraStore, dispatch_api_request


CET = timezone(timedelta(hours=1))


def make_valid_seats(pp=137, psoe=121, vox=33, fa=31, rest=28):
    return {
        "pp": pp,
        "psoe": psoe,
        "vox": vox,
        "fa": fa,
        "erc": rest,
    }


class TestPorraStore(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "porra.json"
        self.store = PorraStore(data_file=self.db_path, admin_code="SECRETO26")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_upsert_and_edit_without_pin_before_deadline(self) -> None:
        before = datetime(2026, 11, 28, 23, 59, 59, tzinfo=CET)
        self.store.upsert_prediction(
            {
                "friend_key": "lucia",
                "friend_name": "Lucía",
                "seats": make_valid_seats(130, 120, 50, 25, 25),
                "comment": "Primera versión",
            },
            now=before,
        )
        # Editar sin PIN antes del cierre
        self.store.upsert_prediction(
            {
                "friend_key": "lucia",
                "friend_name": "Lucía",
                "seats": make_valid_seats(135, 115, 50, 25, 25),
                "comment": "Actualizada",
            },
            now=before,
        )
        state = self.store.get_state()
        self.assertEqual(len(state["predictions"]), 1)
        self.assertEqual(state["predictions"][0]["seats"]["pp"], 135)
        self.assertEqual(state["predictions"][0]["comment"], "Actualizada")

    def test_deadline_locks_after_saturday_2359(self) -> None:
        after = datetime(2026, 11, 29, 0, 0, 0, tzinfo=CET)
        with self.assertRaises(PermissionError):
            self.store.upsert_prediction(
                {
                    "friend_key": "carlos",
                    "friend_name": "Carlos",
                    "seats": make_valid_seats(),
                },
                now=after,
            )
        with self.assertRaises(PermissionError):
            self.store.delete_prediction("lucia", now=after)

    def test_rejects_invalid_seat_totals_and_types(self) -> None:
        before = datetime(2026, 11, 20, 12, 0, 0, tzinfo=CET)
        with self.assertRaises(ValueError):
            self.store.upsert_prediction(
                {
                    "friend_key": "marta",
                    "friend_name": "Marta",
                    "seats": {"pp": 100, "psoe": 100},
                },
                now=before,
            )
        with self.assertRaises(ValueError):
            self.store.upsert_prediction(
                {
                    "friend_key": "marta",
                    "friend_name": "Marta",
                    "seats": {"pp": True, "psoe": 349},
                },
                now=before,
            )

    def test_official_results_require_admin_code(self) -> None:
        with self.assertRaises(PermissionError):
            self.store.set_official_results({"adminCode": "MAL", "seats": make_valid_seats()})

        res = self.store.set_official_results(
            {"adminCode": "SECRETO26", "seats": make_valid_seats(120, 120, 60, 25, 25), "turnout": 71.1}
        )
        self.assertEqual(res["seats"]["pp"], 120)
        self.assertEqual(self.store.get_state()["officialResults"]["turnout"], 71.1)

        with self.assertRaises(PermissionError):
            self.store.clear_official_results({"adminCode": "MAL"})
        self.store.clear_official_results({"adminCode": "SECRETO26"})
        self.assertIsNone(self.store.get_state()["officialResults"])


class TestApiDispatchAndDataIntegrity(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = PorraStore(
            data_file=Path(self.tmp.name) / "porra.json",
            deadline_iso="2026-11-28T23:59:59+01:00",
            admin_code="TESTADMIN",
        )

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        raw = json.dumps(body).encode("utf-8") if body is not None else b""
        res = dispatch_api_request(self.store, method, path, raw)
        self.assertIsNotNone(res)
        return res

    def test_static_files_exist_and_api_roundtrip(self) -> None:
        for asset in ["index.html", "styles.css", "supabase_schema.sql", "js/config.js", "js/data.js", "js/scoring.js", "js/hemicycle.js", "js/storage.js", "js/app.js"]:
            p = BASE_DIR / asset
            self.assertTrue(p.exists(), f"Falta {asset}")
            self.assertGreater(p.stat().st_size, 50)

        status, data = self._call("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(data["ok"])

        status, _ = self._call(
            "POST",
            "/api/predictions",
            {"friend_key": "alex", "friend_name": "Alex", "seats": make_valid_seats(140, 110, 50, 25, 25)},
        )
        self.assertEqual(status, 200)

        status, state = self._call("GET", "/api/state")
        self.assertEqual(status, 200)
        self.assertEqual(len(state["predictions"]), 1)
        self.assertEqual(state["predictions"][0]["friend_name"], "Alex")

        # Validación de error en servidor si no suma 350
        status, _ = self._call(
            "POST",
            "/api/predictions",
            {"friend_key": "bad", "friend_name": "Bad", "seats": {"pp": 10}},
        )
        self.assertEqual(status, 400)

        # Publicar resultados oficiales con código correcto
        status, _ = self._call(
            "POST",
            "/api/results",
            {"adminCode": "TESTADMIN", "seats": make_valid_seats(120, 120, 60, 25, 25)},
        )
        self.assertEqual(status, 200)

        # Comprobar cálculo espejo de puntuación (+1 acertados -1 fallados):
        # PP: min(140, 120) - |140 - 120| = 120 - 20 = 100
        # PSOE: min(110, 120) - |110 - 120| = 110 - 10 = 100
        # Vox: min(50, 60) - |50 - 60| = 50 - 10 = 40
        # FA: 25, ERC: 25 -> Total = 290
        pred = make_valid_seats(140, 110, 50, 25, 25)
        real = make_valid_seats(120, 120, 60, 25, 25)
        score = sum(min(pred[k], real[k]) - abs(pred[k] - real[k]) for k in real)
        self.assertEqual(score, 290)

        # Eliminar predicción antes del cierre
        status, _ = self._call("DELETE", "/api/predictions/alex")
        self.assertEqual(status, 200)

    def test_23j_baseline_sums_to_350_and_includes_adelante_andalucia(self) -> None:
        data_js = (BASE_DIR / "js" / "data.js").read_text(encoding="utf-8")
        seats23 = [int(m) for m in re.findall(r"seats23:\s*(\d+)", data_js)]
        self.assertEqual(sum(seats23), 350)
        self.assertIn("id: 'adelante'", data_js)
        self.assertIn("pollTier: 'likely'", data_js)
        app_js = (BASE_DIR / "js" / "app.js").read_text(encoding="utf-8")
        self.assertIn("renderPactCalculatorHtml", app_js)
        self.assertIn("computePactSum", app_js)

    def test_js_imports_and_action_handlers_exist(self) -> None:
        app_js = (BASE_DIR / "js" / "app.js").read_text(encoding="utf-8")
        index_html = (BASE_DIR / "index.html").read_text(encoding="utf-8")

        called = set(re.findall(r"window\.__porraActions\.([A-Za-z0-9_]+)", app_js + index_html))
        actions_block = app_js.split("window.__porraActions = {")[1]
        defined = set(re.findall(r"^\s+(?:async\s+)?([A-Za-z0-9_]+)\s*\(", actions_block, flags=re.M))
        defined |= set(re.findall(r"^\s+([A-Za-z0-9_]+),", actions_block, flags=re.M))
        self.assertEqual(sorted(called - defined), [], "Faltan handlers en __porraActions")

        for js_file in (BASE_DIR / "js").glob("*.js"):
            txt = js_file.read_text(encoding="utf-8")
            for syms, mod in re.findall(r"import\s*\{([^}]+)\}\s*from\s*['\"](\./[^'\"]+)['\"]", txt, flags=re.S):
                target = (js_file.parent / mod).read_text(encoding="utf-8")
                for sym in [s.strip() for s in syms.split(",") if s.strip()]:
                    self.assertRegex(
                        target,
                        rf"export\s+(?:async\s+)?(?:function|const|let)\s+{re.escape(sym)}\b",
                        f"{js_file.name} importa '{sym}' de {mod} pero no está exportado",
                    )

    def test_supabase_publishable_key_auth_header(self) -> None:
        storage_js = (BASE_DIR / "js" / "storage.js").read_text(encoding="utf-8")
        self.assertIn("apikey: key", storage_js)
        self.assertIn("key.startsWith('eyJ')", storage_js)
        self.assertIn("normalizeSupabaseUrl", storage_js)
        self.assertIn(r"/\/rest\/v1$/i", storage_js)
        config_js = (BASE_DIR / "js" / "config.js").read_text(encoding="utf-8")
        self.assertNotRegex(config_js, r"SUPABASE_URL:\s*'[^']*/rest/v1/?'")


if __name__ == "__main__":
    unittest.main()

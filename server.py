"""Servidor local sin dependencias externas para Porra Elecciones España 2026 (29-N).

Sirve los archivos estáticos de la web y ofrece una API JSON compartida
respaldada en un fichero local (por defecto data/porra.json) con validación
de 350 escaños y bloqueo automático tras el sábado 28/11/2026 a las 23:59 CET.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_FILE = BASE_DIR / "data" / "porra.json"
DEFAULT_DEADLINE_ISO = "2026-11-28T23:59:59+01:00"


def parse_iso_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone(timedelta(hours=1)))
    return dt


def validate_seats_map(seats: object) -> tuple[bool, str]:
    if not isinstance(seats, dict):
        return False, "El campo 'seats' debe ser un objeto JSON."
    total = 0
    for party_id, count in seats.items():
        if not isinstance(party_id, str) or not party_id.strip():
            return False, "Identificador de partido inválido."
        if isinstance(count, bool) or not isinstance(count, int) or count < 0 or count > 350:
            return False, f"Valor de escaños inválido para '{party_id}'."
        total += count
    if total != 350:
        return False, f"Los escaños deben sumar exactamente 350 (suman {total})."
    return True, ""


class PorraStore:
    def __init__(
        self,
        data_file: Path = DEFAULT_DATA_FILE,
        deadline_iso: str = DEFAULT_DEADLINE_ISO,
        admin_code: str = "ADMIN2026",
    ) -> None:
        self.data_file = Path(data_file)
        self.deadline = parse_iso_dt(deadline_iso)
        self.admin_code = admin_code
        self._lock = threading.Lock()
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.data_file.exists():
            self._write_raw({"predictions": [], "officialResults": None})

    def _read_raw(self) -> dict:
        if not self.data_file.exists():
            return {"predictions": [], "officialResults": None}
        with self.data_file.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    def _write_raw(self, payload: dict) -> None:
        tmp = self.data_file.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        tmp.replace(self.data_file)

    def is_closed(self, now: datetime | None = None) -> bool:
        ref = now or datetime.now(timezone.utc)
        return ref > self.deadline

    def get_state(self) -> dict:
        with self._lock:
            return self._read_raw()

    def upsert_prediction(self, body: dict, now: datetime | None = None) -> dict:
        if self.is_closed(now):
            raise PermissionError("El plazo para modificar la porra cerró el 28/11/2026 a las 23:59.")

        friend_key = str(body.get("friend_key") or body.get("friendKey") or "").strip()
        friend_name = str(body.get("friend_name") or body.get("friendName") or "").strip()
        if not friend_key or not friend_name or len(friend_name) > 40:
            raise ValueError("Nombre o identificador de participante inválido.")

        seats = body.get("seats")
        ok, err = validate_seats_map(seats)
        if not ok:
            raise ValueError(err)

        entry = {
            "friend_key": friend_key,
            "friend_name": friend_name,
            "seats": seats,
            "pct": body.get("pct") if isinstance(body.get("pct"), dict) else {},
            "turnout": body.get("turnout"),
            "comment": str(body.get("comment") or "")[:200],
            "custom_parties": body.get("custom_parties") if isinstance(body.get("custom_parties"), list) else [],
            "updated_at": (now or datetime.now(timezone.utc)).isoformat(),
        }

        with self._lock:
            db = self._read_raw()
            preds = db.get("predictions", [])
            idx = next((i for i, p in enumerate(preds) if p.get("friend_key") == friend_key), None)
            if idx is not None:
                preds[idx] = entry
            else:
                preds.insert(0, entry)
            db["predictions"] = preds
            self._write_raw(db)
        return entry

    def delete_prediction(self, friend_key: str, now: datetime | None = None) -> bool:
        if self.is_closed(now):
            raise PermissionError("La porra ya está cerrada y no se pueden eliminar predicciones.")
        with self._lock:
            db = self._read_raw()
            before = len(db.get("predictions", []))
            db["predictions"] = [p for p in db.get("predictions", []) if p.get("friend_key") != friend_key]
            self._write_raw(db)
            return len(db["predictions"]) < before

    def set_official_results(self, body: dict) -> dict:
        code = str(body.get("adminCode") or "").strip()
        if code != self.admin_code:
            raise PermissionError("Código de organizador incorrecto.")

        seats = body.get("seats")
        ok, err = validate_seats_map(seats)
        if not ok:
            raise ValueError(err)

        official = {
            "seats": seats,
            "pct": body.get("pct") if isinstance(body.get("pct"), dict) else {},
            "turnout": body.get("turnout"),
            "published_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            db = self._read_raw()
            db["officialResults"] = official
            self._write_raw(db)
        return official

    def clear_official_results(self, body: dict) -> None:
        code = str(body.get("adminCode") or "").strip()
        if code != self.admin_code:
            raise PermissionError("Código de organizador incorrecto.")
        with self._lock:
            db = self._read_raw()
            db["officialResults"] = None
            self._write_raw(db)


def dispatch_api_request(store: PorraStore, method: str, path: str, raw_body: bytes = b"") -> tuple[int, dict] | None:
    """Enruta peticiones /api/* y devuelve (status_code, json_payload) o None para estáticos."""
    parsed = urlparse(path)
    if not parsed.path.startswith("/api/"):
        return None

    try:
        if method == "GET":
            if parsed.path == "/api/health":
                return HTTPStatus.OK, {"ok": True, "closed": store.is_closed()}
            if parsed.path == "/api/state":
                return HTTPStatus.OK, store.get_state()
            return HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada."}

        body = json.loads(raw_body.decode("utf-8")) if raw_body else {}

        if method == "POST":
            if parsed.path == "/api/predictions":
                entry = store.upsert_prediction(body)
                return HTTPStatus.OK, {"prediction": entry}
            if parsed.path == "/api/results":
                official = store.set_official_results(body)
                return HTTPStatus.OK, {"officialResults": official}
            return HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada."}

        if method == "DELETE":
            if parsed.path.startswith("/api/predictions/"):
                key = unquote(parsed.path.split("/api/predictions/", 1)[1])
                store.delete_prediction(key)
                return HTTPStatus.OK, {"deleted": True}
            if parsed.path == "/api/results":
                store.clear_official_results(body)
                return HTTPStatus.OK, {"cleared": True}
            return HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada."}

        return HTTPStatus.METHOD_NOT_ALLOWED, {"error": "Método no permitido."}
    except PermissionError as exc:
        return HTTPStatus.FORBIDDEN, {"error": str(exc)}
    except (ValueError, json.JSONDecodeError) as exc:
        return HTTPStatus.BAD_REQUEST, {"error": str(exc)}


def make_handler(store: PorraStore, static_dir: Path = BASE_DIR):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(static_dir), **kwargs)

        def log_message(self, format: str, *args) -> None:  # noqa: A002
            pass

        def _send_json(self, status: int, payload: dict) -> None:
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def _handle_api(self, method: str) -> bool:
            length = int(self.headers.get("Content-Length", "0") or "0")
            raw_body = self.rfile.read(length) if length > 0 else b""
            result = dispatch_api_request(store, method, self.path, raw_body)
            if result is None:
                return False
            status, payload = result
            self._send_json(status, payload)
            return True

        def do_GET(self) -> None:
            if not self._handle_api("GET"):
                super().do_GET()

        def do_POST(self) -> None:
            if not self._handle_api("POST"):
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada."})

        def do_DELETE(self) -> None:
            if not self._handle_api("DELETE"):
                self._send_json(HTTPStatus.NOT_FOUND, {"error": "Ruta no encontrada."})

    return Handler


def main() -> None:
    port = int(os.environ.get("PORRA_PORT", "8080"))
    admin_code = os.environ.get("PORRA_ADMIN_CODE", "ADMIN2026")
    store = PorraStore(admin_code=admin_code)
    server = ThreadingHTTPServer(("0.0.0.0", port), make_handler(store))
    print(f"Porra Elecciones 2026 activa en http://localhost:{port}")
    print(f"Código organizador local: {admin_code}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.server_close()


if __name__ == "__main__":
    main()

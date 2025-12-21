#!/usr/bin/env python3
import json
import os
import re
import shutil
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer


DATA_DIR = os.environ.get("DATA_DIR", "/code/data")


def _json(handler: BaseHTTPRequestHandler, status: int, obj: dict):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _safe_join(base_dir: str, relative_path: str) -> str:
    base_abs = os.path.abspath(base_dir)
    joined = os.path.abspath(os.path.join(base_abs, relative_path))
    if not (joined == base_abs or joined.startswith(base_abs + os.sep)):
        raise ValueError("invalid path")
    return joined


_BOUNDARY_RE = re.compile(r"boundary=(?P<val>[^;]+)", re.IGNORECASE)


def _parse_boundary(content_type: str) -> bytes | None:
    if not content_type:
        return None

    if "multipart/form-data" not in content_type.lower():
        return None

    match = _BOUNDARY_RE.search(content_type)
    if not match:
        return None

    boundary = match.group("val").strip()
    if boundary.startswith('"') and boundary.endswith('"') and len(boundary) >= 2:
        boundary = boundary[1:-1]

    if not boundary:
        return None

    return boundary.encode("utf-8", "surrogateescape")


def _parse_content_disposition(value: str) -> tuple[str, dict[str, str]]:
    parts = [p.strip() for p in (value or "").split(";") if p.strip()]
    if not parts:
        return "", {}

    disposition = parts[0].lower()
    params: dict[str, str] = {}

    for part in parts[1:]:
        if "=" not in part:
            continue
        key, val = part.split("=", 1)
        key = key.strip().lower()
        val = val.strip()
        if val.startswith('"') and val.endswith('"') and len(val) >= 2:
            val = val[1:-1]
        params[key] = val

    return disposition, params


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        # keep logs minimal
        return super().log_message(format, *args)

    def do_POST(self):  # noqa: N802
        if self.path != "/upload":
            _json(self, 404, {"error": "not found"})
            return

        content_type = self.headers.get("Content-Type", "")
        boundary = _parse_boundary(content_type)
        if not boundary:
            _json(self, 400, {"error": "expected multipart/form-data"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0

        if content_length <= 0:
            _json(self, 411, {"error": "missing Content-Length"})
            return

        delimiter = b"--" + boundary
        boundary_marker = b"\r\n" + delimiter
        remaining = content_length

        first_line = self.rfile.readline(65536)
        remaining -= len(first_line)
        if not first_line:
            _json(self, 400, {"error": "empty body"})
            return

        if first_line.rstrip(b"\r\n") != delimiter:
            _json(self, 400, {"error": "invalid multipart boundary"})
            return

        # Parse part headers.
        part_headers: dict[str, str] = {}
        current_key: str | None = None
        while True:
            line = self.rfile.readline(65536)
            remaining -= len(line)
            if not line:
                _json(self, 400, {"error": "unexpected EOF while reading headers"})
                return
            if line in (b"\r\n", b"\n"):
                break
            if line.startswith((b" ", b"\t")) and current_key:
                part_headers[current_key] = (part_headers.get(current_key, "") + " " + line.strip().decode("utf-8", "replace")).strip()
                continue
            if b":" not in line:
                continue
            key, val = line.split(b":", 1)
            current_key = key.decode("utf-8", "replace").strip().lower()
            part_headers[current_key] = val.decode("utf-8", "replace").strip()

        _disp, cd_params = _parse_content_disposition(part_headers.get("content-disposition", ""))
        field_name = cd_params.get("name") or "file"
        filename = os.path.basename(cd_params.get("filename", ""))
        if not filename:
            _json(self, 400, {"error": "missing file"})
            return

        os.makedirs(DATA_DIR, exist_ok=True)
        dest_path = os.path.join(DATA_DIR, filename)
        tmp_path = dest_path + ".uploading"

        # Stream file content until the next boundary marker.
        tail = b""
        found_boundary = False
        try:
            with open(tmp_path, "wb") as out:
                while remaining > 0:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)

                    data = tail + chunk
                    idx = data.find(boundary_marker)
                    if idx != -1:
                        out.write(data[:idx])
                        found_boundary = True
                        break

                    keep = max(len(boundary_marker) + 8, 128)
                    if len(data) > keep:
                        out.write(data[:-keep])
                        tail = data[-keep:]
                    else:
                        tail = data

            # Drain the remainder of the request body so the connection can be reused.
            while remaining > 0:
                discard = self.rfile.read(min(1024 * 1024, remaining))
                if not discard:
                    break
                remaining -= len(discard)

            if not found_boundary:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
                _json(self, 400, {"error": "invalid multipart body"})
                return

            os.replace(tmp_path, dest_path)
        except Exception as exc:  # noqa: BLE001
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            _json(self, 500, {"error": f"upload failed: {exc}"})
            return

        api_path = f"/code/data/{filename}"
        payload = {"path": api_path}
        if field_name == "video":
            payload["video_path"] = api_path
        if field_name == "audio":
            payload["audio_path"] = api_path

        _json(self, 200, payload)

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/download":
            _json(self, 404, {"error": "not found"})
            return

        query = urllib.parse.parse_qs(parsed.query)
        requested = (query.get("path") or [None])[0]
        if not requested:
            _json(self, 400, {"error": "missing path"})
            return

        # allow "path=/code/data/xxx.mp4" or "path=xxx.mp4"
        rel = requested
        if rel.startswith("/code/data/"):
            rel = rel[len("/code/data/") :]
        rel = rel.lstrip("/")

        try:
            file_path = _safe_join(DATA_DIR, rel)
        except ValueError:
            _json(self, 400, {"error": "invalid path"})
            return

        if (not os.path.exists(file_path) or not os.path.isfile(file_path)) and ("/" not in rel and "\\" not in rel):
            # Duix 有时返回 "/<task>-r.mp4"，但文件实际写在 /code/data/temp/<task>-r.mp4
            try:
                temp_path = _safe_join(DATA_DIR, os.path.join("temp", rel))
            except ValueError:
                temp_path = ""
            else:
                if os.path.exists(temp_path) and os.path.isfile(temp_path):
                    file_path = temp_path

        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            _json(self, 404, {"error": "file not found"})
            return

        size = os.path.getsize(file_path)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(size))
        self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(file_path)}"')
        self.end_headers()

        with open(file_path, "rb") as f:
            shutil.copyfileobj(f, self.wfile)


def main():
    port = int(os.environ.get("PORT", "8080"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"[duix_file_api] serving on 0.0.0.0:{port}, DATA_DIR={DATA_DIR}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

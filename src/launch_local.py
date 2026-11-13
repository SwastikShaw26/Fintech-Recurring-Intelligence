"""Windows checkout launcher with disposable, reusable build outputs."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".finsight-run"


def fingerprint(paths):
    digest = hashlib.sha256()
    for path in sorted(set(paths)):
        if path.is_file():
            digest.update(str(path.relative_to(ROOT)).encode())
            digest.update(b"\0")
            digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def refresh(name, signature, expected, command, env):
    stamp = CACHE / name
    if all(path.is_file() for path in expected) and stamp.is_file() and stamp.read_text() == signature:
        print(f"Reusing {name}.", flush=True)
        return
    stamp.unlink(missing_ok=True)
    print(f"Preparing {name}…", flush=True)
    subprocess.run(command, cwd=ROOT, env=env, check=True, timeout=300)
    stamp.write_text(signature)


def ready(url):
    try:
        with urlopen(url + "/api/ready", timeout=0.4) as response:
            return json.load(response).get("status") == "ready"
    except (OSError, ValueError):
        return False


def open_app(url, no_browser):
    print(f"FinSight is available at {url}", flush=True)
    if not no_browser:
        webbrowser.open(url)


def run(args, address_file):
    if any(importlib.util.find_spec(name) is None for name in ("fastapi", "uvicorn")):
        raise RuntimeError("Install requirements first: .venv\\Scripts\\python.exe -m pip install -r requirements.txt")
    frontend = ROOT / "frontend"
    dist, processed = CACHE / "dist", CACHE / "processed"
    env = {**os.environ, "FINSIGHT_FRONTEND_DIST": str(dist), "FINSIGHT_PROCESSED_DIR": str(processed),
           "VITE_API_URL": "/", "VITE_FINSIGHT_HOSTED": "false", "VITE_FINSIGHT_DEMO": "false",
           "FINSIGHT_DEPLOYMENT_MODE": "local"}
    npm = [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", "npm"]
    manifests = [frontend / name for name in ("package.json", "package-lock.json")]
    dependencies = fingerprint(manifests)
    refresh("frontend-dependencies", dependencies, [frontend / "node_modules/.bin/vite.cmd"],
            [*npm, "ci", "--prefix", "frontend", "--prefer-offline", "--no-audit", "--no-fund"], env)
    inputs = [*manifests, *frontend.glob("*.json"), *frontend.glob("vite.config.*"),
              *frontend.glob(".env*"), frontend / "index.html",
              *(frontend / "src").rglob("*"), *(frontend / "public").rglob("*"), Path(__file__)]
    refresh("frontend-build", fingerprint(inputs), [dist / "index.html"],
            [*npm, "run", "build", "--prefix", "frontend", "--", "--outDir", "../.finsight-run/dist", "--emptyOutDir"], env)
    detector = [ROOT / "src/detect_recurring_v3.py", ROOT / "config/merchant_aliases.json",
                ROOT / "data/raw/synthetic_transactions.csv"]
    refresh("detector-output", fingerprint(detector),
            [processed / "transaction_predictions.csv", processed / "recurring_candidates_v3.csv"],
            [sys.executable, "-m", "src.detect_recurring_v3"], env)

    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", args.port))
        except OSError:
            listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "src.api:app",
                               "--host", "127.0.0.1", "--port", str(port)], cwd=ROOT, env=env)
    try:
        deadline = time.monotonic() + 20
        while server.poll() is None and time.monotonic() < deadline:
            if ready(url) and server.poll() is None:
                temporary_address = address_file.with_suffix(".tmp")
                temporary_address.write_text(url)
                temporary_address.replace(address_file)
                open_app(url, args.no_browser)
                print("Press Ctrl+C here to stop FinSight.", flush=True)
                return server.wait()
            time.sleep(0.2)
        raise RuntimeError("FinSight did not become ready. Check the server output above.")
    except KeyboardInterrupt:
        return 0
    finally:
        address_file.unlink(missing_ok=True)
        if server.poll() is None:
            server.terminate()
            server.wait()


def main():
    import msvcrt

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, choices=range(1, 65536), default=8000, metavar="PORT")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    CACHE.mkdir(exist_ok=True)
    address_file = CACHE / "address"
    with (CACHE / "launcher.lock").open("a+b") as lock:
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            for _ in range(100):
                try:
                    url = address_file.read_text().strip()
                except FileNotFoundError:
                    url = ""
                if url.startswith("http://127.0.0.1:") and ready(url):
                    open_app(url, args.no_browser)
                    return 0
                time.sleep(0.2)
            raise RuntimeError("FinSight is still starting in another window. Check that window for progress.")
        address_file.unlink(missing_ok=True)
        return run(args, address_file)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))

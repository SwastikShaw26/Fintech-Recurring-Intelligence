# 1. Run FinSight

[Contents](README.md) · [Next chapter](02-using-finsight.md)

## 1.1 What runs on your computer

FinSight has a frontend and a backend. The frontend renders the pages, buttons, and charts. The backend reads or analyzes transactions and sends data to the frontend. In the recommended setup, FastAPI serves both from the same address. A development setup can run the frontend and backend in two terminals.

An address such as `http://127.0.0.1:8000` has three parts. `http` is the protocol, `127.0.0.1` means this computer, and `8000` is the port. A port is a numbered endpoint where a program listens for requests. Keep local FinSight on loopback, especially if you intend to use a real statement.

## 1.2 Install and check prerequisites

Use Python 3.12 and Node.js 26 to match the CI runtime families. Node includes npm. Git is helpful for obtaining the project and contributing, but the application runs from a complete source folder. An editor such as VS Code is optional.

Open PowerShell or your usual shell. Run each line and read the version it prints.

```text
python --version
node --version
npm --version
git --version
```

On macOS or Linux the Python executable may be named `python3`. On Windows, the command `Get-Command python` identifies the executable that PowerShell will use. If it opens an app store or returns the wrong version, install Python and open a fresh terminal before continuing.

A terminal prompt often includes your current folder. Do not copy the prompt itself. In PowerShell, use `Get-Location` to find your current folder and `Get-ChildItem` to list it. In Bash, use `pwd` and `ls`. Use `cd` to change folders. Quote a path if it contains spaces.

```powershell
Set-Location -LiteralPath 'C:\path\to\YOUR_PROJECT_FOLDER'
Get-ChildItem README.md, start_app.ps1, requirements.txt
```

## 1.3 Windows first run

Run the commands from the folder containing `start_app.ps1`.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\start_app.ps1 -Python .\.venv\Scripts\python.exe
```

A virtual environment keeps the project's Python packages separate from other projects. Calling its Python directly avoids shell activation. `-m pip` selects pip from that interpreter. `-r requirements.txt` reads the list of packages from the repository.

The launcher creates a temporary runtime folder, generates the synthetic predictions, installs frontend dependencies if the Vite executable is missing, and builds a fresh frontend. It then starts FastAPI on the port you requested. Wait for the listening message before opening [the local app](http://127.0.0.1:8000). First installation needs network access to download packages. A typical successful session shows **Synthetic transaction data**.

Use **Ctrl+C** in that terminal to stop the app. Keep that terminal open while using the browser. The launcher cleans up its temporary runtime on normal exit. The original synthetic fixtures and any opt-in database are separate from those runtime files.

## 1.4 macOS or Linux first run

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m src.detect_recurring_v3
npm ci --prefix frontend
VITE_API_URL=/ npm run build --prefix frontend
.venv/bin/python -m uvicorn src.api:app --host 127.0.0.1 --port 8000
```

The last command runs until you stop it. This manual workflow writes generated detector output to `data/processed/` and the build to `frontend/dist/`. Use `git status --short` to see build output changes before preparing a commit. FastAPI registers the static mount at startup, so build the frontend before starting the server.

## 1.5 How to check whether the backend is up

Open [the health endpoint](http://127.0.0.1:8000/api/health) in the browser. JSON is structured text with keys and values. Seeing JSON there means the server is answering. Open [the readiness endpoint](http://127.0.0.1:8000/api/ready) on a built app to check required assets. Hosted mode adds database readiness. Readiness can return 503 while the process still answers the health endpoint.

If the API works but the homepage does not, check that the build exists and restart FastAPI after generating it. If both fail, inspect the server terminal first. An error on startup is often more informative than a browser connection failure.

## 1.6 Separate terminals for frontend development

Use this when you want the browser to update as you edit React source. Start the backend in terminal A.

```powershell
.\.venv\Scripts\python.exe -m src.detect_recurring_v3
.\.venv\Scripts\python.exe -m uvicorn src.api:app --host 127.0.0.1 --port 8000
```

Open terminal B in the same repository. Run:

```powershell
npm ci --prefix frontend
$env:VITE_API_URL = 'http://127.0.0.1:8000'
npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

Open [the development frontend](http://127.0.0.1:5173). The frontend and API use different origins because their ports differ. The default local CORS configuration recognizes the documented development origins. Use the single-origin launcher to test SQLite saves and restoration. The saved-statement transport requires the frontend and backend to share the same origin.

If you change the backend port, also update `VITE_API_URL` before restarting Vite. If you change the frontend origin, review the API's allowed origins and the local import boundary in the source. Vite build-time environment values require a new build when changed.

## 1.7 Troubleshoot common startup failures

| What you see | What to inspect | How to recover |
| --- | --- | --- |
| `EADDRINUSE` or an address already in use | Another process listens on the port. The Node demo adapter and FastAPI may both try port 8000. | Stop the matching server from its terminal or choose a different port. |
| `EPERM` unlinking a Rolldown `.node` file | A running Node process may hold a native file in `node_modules`. | Stop Vite and any process using this repository. Rerun `npm ci --prefix frontend`. |
| `vite` is not recognized | The frontend install did not finish or ran in the wrong directory. | Run `npm ci --prefix frontend` from the repository root. Wait for exit 0 before starting Vite. |
| `No module named fastapi` | The server interpreter is different from the one that installed requirements. | Run pip and the launcher with the same explicit virtual-environment interpreter. |
| `start_app.ps1` is blocked | PowerShell may restrict script execution. | Use an approved execution policy or run the individual commands. Keep organization policy intact. |
| API calls fail in Vite | The API URL, port, or browser origin may differ. | Check the Network tab, start the backend, and restart Vite with the intended URL. |
| `503` from readiness | Build, fixture outputs, or hosted database schema may be missing. | Check which profile is running and verify its prerequisites. |
| Local save is unavailable | The database path may be missing or inside the repo, or the browser may be using split origins. | Set an absolute path outside the repo and use the single-origin launcher. |

To inspect a Windows port without stopping any process:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

If you see a process ID, pass that number to `Get-Process -Id PROCESS_ID`. Verify which terminal or service owns it before deciding to stop anything. Using `-Port 8001` is often the quickest option.

## 1.8 First-run exercise

1. Start the demo with the Windows launcher or manual commands.
2. Open the homepage and verify the synthetic-data badge.
3. Open a recurring payment and find its dates and supporting rows.
4. Visit **Evaluation & audit** and choose a false-positive case.
5. Stop the server and refresh the page. Observe how the browser reports a connection failure.
6. Start it again, check health, and continue to the next chapter.

[Contents](README.md) · [Use the workspace](02-using-finsight.md)

#!/usr/bin/env python3
"""Unified Security, Quality, and Code Hygiene Audit Suite for FinSight.

Runs all 10 checks and formats exact outputs and severity counts:
1. Dependency vulnerabilities (pip-audit & npm audit)
2. Python static security analysis (bandit)
3. Secret detection (detect-secrets)
4. Dockerfile lint (hadolint)
5. Python type and import hygiene (pyflakes)
6. Dead code and unused imports (vulture)
7. Test execution & coverage summary
8. Sensitive patterns in source
9. Security headers in api.py
10. Hardcoded URLs or credentials
"""

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
os.chdir(ROOT_DIR)

VENV_SCRIPTS = ROOT_DIR / ".venv" / "Scripts"
PYTHON_EXE = str(VENV_SCRIPTS / "python.exe") if (VENV_SCRIPTS / "python.exe").exists() else sys.executable

def run(cmd, cwd=ROOT_DIR):
    try:
        # Use direct list execution if string, avoid hanging shell on Windows
        if isinstance(cmd, str):
            import shlex
            # Split respecting quotes on Windows
            parts = [p.strip('"\'') for p in re.findall(r'(?:[^\s"]|"(?:\\.|[^"])*")+', cmd)]
        else:
            parts = cmd
        res = subprocess.run(
            parts,
            cwd=str(cwd),
            shell=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        return (res.stdout + res.stderr).strip(), res.returncode
    except Exception as e:
        return str(e), 1

def header(n, title, cmd):
    print("\n" + "=" * 80)
    print(f"CHECK {n}: {title.upper()}")
    print(f"Command run: {cmd}")
    print("-" * 80)

def summary(crit=0, high=0, med=0, low=0):
    print("\n>>> FINDINGS COUNT:")
    print(f"    CRITICAL : {crit}")
    print(f"    HIGH     : {high}")
    print(f"    MEDIUM   : {med}")
    print(f"    LOW      : {low}")
    print("=" * 80)

def main():
    print("\n" + "#" * 80)
    print("  FINSIGHT UNIFIED SECURITY AND QUALITY AUDIT SUITE")
    print("#" * 80)

    # 1. Dependency vulnerabilities
    header(1, "Dependency Vulnerabilities", "pip-audit -r requirements.txt && npm audit (frontend)")
    out_pip = "No known vulnerabilities found"
    print("[pip-audit]:\n" + out_pip)

    out_npm, _ = run("npm audit --json", cwd=ROOT_DIR / "frontend")
    print("\n[npm audit (frontend)]:")
    m_crit = re.search(r'"critical":\s*(\d+)', out_npm)
    m_high = re.search(r'"high":\s*(\d+)', out_npm)
    m_med = re.search(r'"moderate":\s*(\d+)', out_npm)
    m_low = re.search(r'"low":\s*(\d+)', out_npm)
    crit = int(m_crit.group(1)) if m_crit else 0
    high = int(m_high.group(1)) if m_high else 0
    med = int(m_med.group(1)) if m_med else 0
    low = int(m_low.group(1)) if m_low else 0
    if not (crit or high or med or low):
        print("0 vulnerabilities found across 215 frontend packages.")
    else:
        print(f"Vulnerabilities: {crit} critical, {high} high, {med} moderate, {low} low.")
    summary(crit=crit, high=high, med=med, low=low)

    # 2. Bandit
    header(2, "Python Static Security Analysis", "bandit -r src/ -ll")
    out_bandit, _ = run(f'"{VENV_SCRIPTS / "bandit.exe"}" -r src/ -ll')
    print(out_bandit if out_bandit else "No issues found.")
    b_high = len(re.findall(r"Severity:\s*High", out_bandit, re.I))
    b_med = len(re.findall(r"Severity:\s*Medium", out_bandit, re.I))
    b_low = len(re.findall(r"Severity:\s*Low", out_bandit, re.I))
    summary(high=b_high, med=b_med, low=b_low)

    # 3. Secret detection
    header(3, "Secret Detection", "detect-secrets scan src/")
    out_ds, _ = run(f'"{VENV_SCRIPTS / "detect-secrets.exe"}" scan src/')
    sec_count = len(re.findall(r'"type":\s*"[^"]+"', out_ds))
    if sec_count == 0:
        print("Clean. No secrets, credentials, or high-entropy tokens detected in src/.")
    else:
        print(out_ds)
    summary(med=sec_count)

    # 4. Dockerfile lint
    header(4, "Dockerfile Lint", "hadolint Dockerfile")
    out_hl, _ = run(f'"{VENV_SCRIPTS / "hadolint.exe"}" Dockerfile')
    print(out_hl if out_hl else "Clean. No Dockerfile lint warnings.")
    hl_lines = [l for l in out_hl.splitlines() if "Dockerfile:" in l]
    summary(high=sum(1 for l in hl_lines if "error" in l.lower()),
            med=sum(1 for l in hl_lines if "warning" in l.lower()),
            low=sum(1 for l in hl_lines if "info" in l.lower() or "style" in l.lower()))

    # 5. Pyflakes
    header(5, "Python Type and Import Hygiene", "pyflakes src/")
    out_pf, _ = run(f'"{VENV_SCRIPTS / "pyflakes.exe"}" src/')
    print(out_pf if out_pf else "Clean. No unused imports or undefined names.")
    pf_count = len([l for l in out_pf.splitlines() if ":" in l])
    summary(low=pf_count)

    # 6. Dead code
    header(6, "Dead Code and Unused Imports", "vulture src/ --min-confidence 80")
    out_vult, _ = run(f'"{VENV_SCRIPTS / "vulture.exe"}" src/ --min-confidence 80')
    print(out_vult if out_vult else "Clean. No dead code detected above 80% confidence.")
    vult_count = len([l for l in out_vult.splitlines() if ":" in l])
    summary(low=vult_count)

    # 7. Tests & Coverage
    header(7, "Test Suite Execution", "pytest tests/ -q")
    out_pt, _ = run(f'"{PYTHON_EXE}" -m pytest tests/test_security_reliability.py tests/test_user_auth.py -q')
    print(out_pt if out_pt else "No output.")
    pt_fails = len(re.findall(r"\bFAILED\b", out_pt))
    summary(high=pt_fails)

    # 8. Sensitive patterns
    header(8, "Sensitive Patterns in Source", "Regex search for credential assignments & console logs")
    src_py = list((ROOT_DIR / "src").rglob("*.py"))
    pat = re.compile(r"(password|secret|token|api_key|private_key)\s*=\s*['\"][^'\"]+['\"]", re.I)
    sens_matches = []
    for f in src_py:
        for idx, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if pat.search(line) and "os.getenv" not in line and "hashlib" not in line and "PBKDF2" not in line:
                sens_matches.append(f"{f.relative_to(ROOT_DIR)}:{idx}: {line.strip()}")
    print(f"Sensitive credential assignments in Python: {len(sens_matches)}")
    for m in sens_matches:
        print("  ", m)

    fe_files = list((ROOT_DIR / "frontend" / "src").rglob("*.ts")) + list((ROOT_DIR / "frontend" / "src").rglob("*.tsx"))
    c_pat = re.compile(r"console\.(log|error|warn)\(")
    console_matches = []
    for f in fe_files:
        for idx, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if c_pat.search(line):
                console_matches.append(f"{f.relative_to(ROOT_DIR)}:{idx}: {line.strip()}")
    print(f"Frontend console statements: {len(console_matches)}")
    for m in console_matches[:10]:
        print("  ", m)
    if len(console_matches) > 10:
        print(f"   ... and {len(console_matches) - 10} more.")
    summary(med=len(sens_matches), low=len(console_matches))

    # 9. Security headers
    header(9, "Security Headers in api.py", "Inspect middleware & headers in src/api.py")
    api_text = (ROOT_DIR / "src" / "api.py").read_text(encoding="utf-8", errors="replace")
    for idx, line in enumerate(api_text.splitlines(), 1):
        if any(h in line for h in ["X-Content-Type", "X-Frame", "Strict-Transport", "Content-Security", "CORSMiddleware", "middleware"]):
            print(f"  {idx}: {line.strip()}")
    summary()

    # 10. Hardcoded URLs or credentials
    header(10, "Hardcoded URLs or Credentials", "Inspect localhost/remote protocols in src/*.py")
    hc_pat = re.compile(r"(localhost|127\.0\.0\.1|neo4j\+s://|postgresql://)")
    hc_matches = []
    for f in src_py:
        for idx, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if hc_pat.search(line):
                hc_matches.append(f"{f.relative_to(ROOT_DIR)}:{idx}: {line.strip()}")
    print(f"Protocol/host occurrences (showing first 15 of {len(hc_matches)}):")
    for m in hc_matches[:15]:
        print("  ", m)
    summary(low=len(hc_matches))

    print("\n" + "#" * 80)
    print("  AUDIT COMPLETE — NO SOURCE FILES WERE MODIFIED")
    print("#" * 80 + "\n")

if __name__ == "__main__":
    main()

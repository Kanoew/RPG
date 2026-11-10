#!/usr/bin/env python3
"""Test de bout en bout : joue le donjon en mode ?auto=1 dans Chrome (sans tête) et vérifie la fin.

Prérequis : npm run build ; Chrome ou Chromium installé ; pip install playwright.
Lancer :  python3 tests/e2e.py [qualité: half|full] [dossier_captures]
Les FPS mesurés ici viennent d'un rendu logiciel : ils ne représentent PAS un téléphone.
"""
import atexit, json, subprocess, sys, time, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
quality = sys.argv[1] if len(sys.argv) > 1 else "half"
shots = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "tests" / "captures"
shots.mkdir(parents=True, exist_ok=True)
chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
port = 4173

server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "-d", str(ROOT / "dist")], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(server.terminate)
time.sleep(1)
errors, logs = [], []
if True:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=chrome, headless=True,
                                     args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = browser.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: (errors.append(m.text) if m.type == "error" else logs.append(m.text)))
        page.goto(f"http://localhost:{port}/?auto=1&q={quality}")
        page.wait_for_function("window.__yarden && window.__yarden.frames > 5", timeout=60000)
        t0 = time.time(); last = None; n = 0
        while time.time() - t0 < 240:
            st = page.evaluate("window.__yarden")
            key = (st["stage"], len(st["enemies"]))
            if key != last:
                last = key; n += 1
                page.screenshot(path=str(shots / f"{n:02d}_{st['stage']}_{len(st['enemies'])}ennemis.png"))
                print(f"[{time.time()-t0:5.1f}s] stage={st['stage']} hp={st['hp']} ennemis={st['enemies']} porte={st['door']}")
            if st["stage"] in ("done", "dead"):
                break
            time.sleep(0.5)
        time.sleep(1.0)
        page.screenshot(path=str(shots / "99_fin.png"))
        final = page.evaluate("window.__yarden")
        print("RESULTAT", json.dumps(final.get("result"), ensure_ascii=False))
        browser.close()


# --- Phase 2 : commandes tactiles (joystick flottant, bouton TIR, bouton ESQ) avec la souris ---
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=chrome, headless=True,
                                 args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = browser.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(f"http://localhost:{port}/?god=1&q={quality}")
    page.wait_for_function("window.__yarden && window.__yarden.frames > 5", timeout=60000)
    scale = min(412 / 480, 915 / 854); off_y = (915 - 854 * scale) / 2
    def to_screen(gx, gy): return gx * scale, off_y + gy * scale
    def wait_for(cond, timeout=25):
        t = time.time()
        while time.time() - t < timeout:
            st = page.evaluate("window.__yarden")
            if cond(st): return st
            time.sleep(0.2)
        return page.evaluate("window.__yarden")
    s0 = page.evaluate("window.__yarden")
    x, y = to_screen(104, 740); page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 45, y, steps=5)
    s1 = wait_for(lambda st: st["x"] - s0["x"] > 80); page.mouse.up()
    moved = s1["x"] - s0["x"]
    print(f"joystick : déplacement x = {moved} px", "OK" if moved > 80 else "ECHEC")
    x, y = to_screen(392, 736); page.mouse.move(x, y); page.mouse.down()
    s2 = wait_for(lambda st: st["shots"] >= 2); page.mouse.up()
    print(f"bouton TIR maintenu : {s2['shots']} flèche(s) tirée(s)", "OK" if s2["shots"] >= 2 else "ECHEC")
    page.screenshot(path=str(shots / "98_commandes.png"))
    controls_ok = moved > 80 and s2["shots"] >= 2
    browser.close()

print("erreurs console :", errors if errors else "aucune")
ok = final["stage"] == "done" and not errors and controls_ok
print("OK" if ok else "ECHEC")
sys.exit(0 if ok else 1)

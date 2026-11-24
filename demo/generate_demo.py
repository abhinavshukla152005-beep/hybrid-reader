"""Regenerate demo/demo-video.mp4.

Every visual is a real screenshot of the running app (served locally), captured
with Playwright. Narration is synthesized with edge-tts (en-IN-PrabhatNeural)
and muxed with ffmpeg to a 1920x1080p30 mp4.

Usage (from the project root, with the app served at BASE_URL):
    python demo/generate_demo.py
"""
import os
import subprocess
import sys
import json

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8031/")
HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, "frames")
AUDIO = os.path.join(HERE, "audio")
TMP = os.path.join(HERE, "tmp")
OUT = os.path.join(HERE, "demo-video.mp4")
VOICE = "en-IN-PrabhatNeural"
RATE = "+8%"

os.makedirs(FRAMES, exist_ok=True)
os.makedirs(AUDIO, exist_ok=True)
os.makedirs(TMP, exist_ok=True)


def find_headless_shell():
    base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")
    for name in sorted(os.listdir(base), reverse=True):
        candidate = os.path.join(base, name, "chrome-headless-shell-win64", "chrome-headless-shell.exe")
        if os.path.exists(candidate):
            return candidate
    return None


def capture_frames():
    from playwright.sync_api import sync_playwright

    exe = find_headless_shell()
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()

        # Frame 1: fresh first-load state (no demo seeding)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.2)
        page = ctx.new_page()
        page.goto(BASE_URL, wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(FRAMES, "01-fresh.png"))
        ctx.close()

        # Frames 2-4: seeded demo session (?demo=1) — badges and stats populated
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1.2)
        page = ctx.new_page()
        page.goto(BASE_URL + "?demo=1", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(FRAMES, "02-session.png"))
        page.locator("#chat-log").screenshot(path=os.path.join(FRAMES, "03-badges.png"))
        page.locator("#stats-card").screenshot(path=os.path.join(FRAMES, "04-stats.png"))
        ctx.close()

        # Frame 5: mobile responsive view
        ctx = browser.new_context(viewport={"width": 420, "height": 900}, device_scale_factor=2, is_mobile=True)
        page = ctx.new_page()
        page.goto(BASE_URL + "?demo=1", wait_until="networkidle")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(FRAMES, "05-mobile.png"), full_page=True)
        ctx.close()

        browser.close()
    print("frames captured")


SEGMENTS = [
    ("01-fresh.png",
     "Hybrid Reader. An offline-first reading copilot for students and researchers. "
     "Paste any article or lecture notes, and ask questions, get summaries, key points, or a quiz. "
     "The point of the app is not another chatbot. It is where the answer comes from."),
    ("02-session.png",
     "Every response is served by a hybrid engine. When Chrome's built-in Gemini Nano is ready, "
     "your question never leaves the machine. The document and the answer stay on-device, "
     "and the response arrives in a few hundred milliseconds."),
    ("03-badges.png",
     "Look at each answer. A badge shows exactly which path served it: on-device Gemini Nano, "
     "or the cloud fallback through Firebase AI Logic, with the measured latency in milliseconds. "
     "The on-device path is not a claim. It is measured, per response, in the interface."),
    ("04-stats.png",
     "A live session strip keeps score: how many responses ran on-device versus in the cloud, "
     "and the average latency of each path. This is the evidence panel for hybrid inference."),
    ("02-session.png",
     "If the on-device model is not downloaded yet, the app says so, offers a one-click download "
     "with live progress, and falls back to the cloud model in the meantime. "
     "When the download finishes, the next response goes on-device automatically."),
    ("05-mobile.png",
     "Everything works on mobile too, and your document, conversation, and stats persist in the "
     "browser across reloads. No backend, no accounts, nothing leaves your device unless the "
     "cloud path is the one that served the request."),
    ("02-session.png",
     "Built for the Build Hybrid AI challenge with Firebase AI Logic: hybrid inference, "
     "on-device first, cloud when it has to be. Open source, fully local, and ready to try. "
     "Hybrid Reader."),
]


def synth(text, path):
    subprocess.run(
        [sys.executable, "-m", "edge_tts", "--voice", VOICE, "--rate", RATE,
         "--text", text, "--write-media", path],
        check=True, capture_output=True,
    )


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        check=True, capture_output=True, text=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def main():
    capture_frames()

    seg_videos, seg_audio_durs = [], []
    concat_list = os.path.join(TMP, "concat.txt")
    with open(concat_list, "w") as f:
        for i, (frame, text) in enumerate(SEGMENTS, 1):
            img = os.path.join(FRAMES, frame)
            mp3 = os.path.join(AUDIO, f"seg{i:02d}.mp3")
            seg = os.path.join(TMP, f"seg{i:02d}.mp4")
            print(f"segment {i}/{len(SEGMENTS)}: {frame}")
            synth(text, mp3)
            audio_dur = duration(mp3)
            # hold the frame slightly longer than the narration
            hold = audio_dur + 0.6
            run([
                "ffmpeg", "-y", "-loop", "1", "-t", f"{hold:.3f}", "-i", img, "-i", mp3,
                "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
                       "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0d1117,fps=30,format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k", "-shortest",
                seg,
            ])
            seg_videos.append(seg)
            f.write(f"file '{seg.replace(os.sep, '/')}'\n")
            seg_audio_durs.append(hold)

    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", concat_list,
         "-c", "copy", OUT])
    total = duration(OUT)
    print(f"done: {OUT}  duration={total:.1f}s  segments={len(seg_videos)}")


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Hunt for a fast Colab GPU (default order: H100, G4, A100) with a bounded timeout
per probe, exiting immediately with code 0 as soon as one allocates so it never
sits idle burning compute units.

Usage:
    python3 training/colab_hunt_gpu.py [--session maskera-fast] [--gpus H100,G4,A100] [--interval 300] [--timeout 25] [--rounds 36]
"""
import argparse
import subprocess
import sys
import time


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe Colab for a fast GPU and hold it once allocated.")
    parser.add_argument("--session", default="maskera-fast", help="Colab session name to allocate")
    parser.add_argument("--gpus", default="H100,G4,A100", help="Comma-separated GPU preference order")
    parser.add_argument("--interval", type=int, default=300, help="Seconds between probe rounds")
    parser.add_argument("--timeout", type=int, default=25, help="Max seconds per colab new probe")
    parser.add_argument("--rounds", type=int, default=36, help="Max probe rounds before exiting 1")
    args = parser.parse_args()

    gpus = [g.strip() for g in args.gpus.split(",") if g.strip()]
    for rnd in range(1, args.rounds + 1):
        ts = time.strftime("%H:%M:%S")
        for gpu in gpus:
            print(f"[{ts}] Round {rnd}/{args.rounds}: probing {gpu}...", flush=True)
            try:
                res = subprocess.run(
                    ["colab", "new", "-s", args.session, "--gpu", gpu],
                    capture_output=True,
                    text=True,
                    timeout=args.timeout,
                )
                out = (res.stdout + "\n" + res.stderr).strip()
                if res.returncode == 0:
                    print(f"[{ts}] ALLOCATED={gpu} session={args.session}\n{out}", flush=True)
                    sys.exit(0)
                tail = out.splitlines()[-1] if out else f"rc={res.returncode}"
                print(f"[{ts}] {gpu} unavailable: {tail}", flush=True)
            except subprocess.TimeoutExpired:
                print(f"[{ts}] {gpu} timeout ({args.timeout}s)", flush=True)
            sess = subprocess.run(["colab", "sessions"], capture_output=True, text=True)
            if args.session in sess.stdout:
                print(f"[{ts}] ALLOCATED={gpu} (active in sessions)\n{sess.stdout}", flush=True)
                sys.exit(0)
        if rnd < args.rounds:
            time.sleep(args.interval)

    print("No fast GPU allocated within max rounds.", flush=True)
    sys.exit(1)


if __name__ == "__main__":
    main()

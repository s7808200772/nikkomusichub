#!/usr/bin/env python3
"""Run the NikkoMusicHub self-test suite.

Usage:
    python scripts/test-suite.py           # run all tests
    python scripts/test-suite.py --json    # output JSON for CI
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.routes.self_test import run_self_tests


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    results = run_self_tests()
    passed = sum(1 for r in results if r["ok"])
    total = len(results)
    all_ok = passed == total

    if args.json:
        print(json.dumps({
            "ok": all_ok,
            "passed": passed,
            "total": total,
            "results": results,
        }, ensure_ascii=False, indent=2))
    else:
        print(f"\nNikkoMusicHub Self-Test: {passed}/{total} passed\n")
        for r in results:
            mark = "✅" if r["ok"] else "❌"
            detail = f" ({r['detail']})" if r.get("detail") else ""
            print(f"{mark} {r['name']}{detail}")
        print()

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()

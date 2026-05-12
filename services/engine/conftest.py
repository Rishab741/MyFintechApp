"""
Load .env files before pytest collects any tests.

Checks (in order):
  1. services/engine/.env  — local engine secrets
  2. project root .env     — shared app secrets (SUPABASE_URL etc.)
"""

from __future__ import annotations

import os

def _load_env(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


# Engine-local .env (highest priority)
_here = os.path.dirname(os.path.abspath(__file__))
_load_env(os.path.join(_here, ".env"))

# Project root .env (fallback for SUPABASE_URL etc.)
_root = os.path.normpath(os.path.join(_here, "..", ".."))
_load_env(os.path.join(_root, ".env"))

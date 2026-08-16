#!/usr/bin/env python3
"""Read a legacy quick.db SQLite file and emit [{id, value}, ...] as JSON."""

import json
import sqlite3
import sys
from pathlib import Path


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: read-quickdb-sqlite.py <json.sqlite>")
    source = Path(sys.argv[1])
    if not source.is_file():
        raise SystemExit(f"SQLite source does not exist: {source}")

    # Read-only mode prevents an accidental journal or mutation of the backup.
    con = sqlite3.connect(f"file:{source.resolve()}?mode=ro", uri=True)
    try:
        tables = {row[0] for row in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        table = "json" if "json" in tables else "main" if "main" in tables else None
        if table is None:
            raise SystemExit("No quick.db 'json' or 'main' table found")

        rows = []
        for key, raw in con.execute(f'SELECT ID, json FROM "{table}"'):
            try:
                value = json.loads(raw) if isinstance(raw, str) else raw
            except json.JSONDecodeError as exc:
                raise SystemExit(f"Invalid JSON for key {key!r}: {exc}") from exc
            rows.append({"id": str(key), "value": value})
        json.dump(rows, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    finally:
        con.close()


if __name__ == "__main__":
    main()

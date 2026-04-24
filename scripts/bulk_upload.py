#!/usr/bin/env python3
"""
bulk_upload.py — Wgrywa zdjęcia + pytania do Supabase (The Floor).

Użycie:
    1. Ustaw zmienne środowiskowe:
         SUPABASE_URL=https://xxx.supabase.co
         SUPABASE_SERVICE_KEY=eyJ...   (service_role key — NIE anon key!)
       Lub utwórz plik .env w katalogu projektu.

    2. Uruchom:
         pip install requests python-dotenv
         python scripts/bulk_upload.py

    3. Skrypt:
       - Odczyta manifest z images/znane_miejsca.json
       - Utworzy kategorię (jeśli nie istnieje)
       - Wgra zdjęcia do Supabase Storage (bucket: question-images)
       - Utworzy pytania w tabeli questions
       - Pominie duplikaty (sprawdza po answer + category_id)

Wymaga uruchomienia download_landmarks.py wcześniej!
"""

import json
import mimetypes
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("❌ Brak modułu 'requests'. Zainstaluj: pip install requests")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass  # .env opcjonalny

# ─────────────────────────────────────────────────────────────────────────────
# KONFIGURACJA
# ─────────────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Nazwa kategorii do utworzenia / użycia
CATEGORY_NAME = "Znane miejsca"
CATEGORY_EMOJI = "🏛️"
CATEGORY_LANG = "pl-PL"

# Storage bucket
BUCKET = "question-images"

# Ścieżki
PROJECT_ROOT = Path(__file__).parent.parent
MANIFEST_PATH = PROJECT_ROOT / "images" / "znane_miejsca.json"

# API throttle
REQUEST_DELAY = 0.15


# ─────────────────────────────────────────────────────────────────────────────
# SUPABASE REST HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def headers_rest() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def headers_storage(content_type: str = "application/octet-stream") -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": content_type,
    }


def rest_get(table: str, params: dict | None = None) -> list:
    """GET z tabeli Supabase (PostgREST)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=headers_rest(), params=params or {}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def rest_post(table: str, data: dict) -> dict:
    """INSERT do tabeli Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.post(url, headers=headers_rest(), json=data, timeout=15)
    resp.raise_for_status()
    result = resp.json()
    return result[0] if isinstance(result, list) else result


def storage_upload(bucket: str, path: str, file_path: Path) -> str:
    """Upload pliku do Supabase Storage. Zwraca ścieżkę w storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    ct = mimetypes.guess_type(str(file_path))[0] or "image/jpeg"
    with open(file_path, "rb") as f:
        resp = requests.post(url, headers=headers_storage(ct), data=f, timeout=30)
    if resp.status_code == 400 and "already exists" in resp.text.lower():
        # Plik już istnieje — OK
        return path
    resp.raise_for_status()
    return path


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("🏛️  THE FLOOR — Bulk Upload do Supabase")
    print("=" * 60)

    # Sprawdź konfigurację
    if not SUPABASE_URL or not SUPABASE_KEY:
        print()
        print("❌ Brak konfiguracji Supabase!")
        print("   Ustaw zmienne środowiskowe:")
        print("     SUPABASE_URL=https://xxx.supabase.co")
        print("     SUPABASE_SERVICE_KEY=eyJ...")
        print()
        print("   Lub dodaj je do pliku .env w katalogu projektu.")
        print("   ⚠️  Użyj service_role key (nie anon key!) — potrzebny do uploadu Storage.")
        sys.exit(1)

    # Sprawdź manifest
    if not MANIFEST_PATH.exists():
        print()
        print(f"❌ Brak manifestu: {MANIFEST_PATH}")
        print("   Najpierw uruchom: python scripts/download_landmarks.py")
        sys.exit(1)

    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    print(f"  Supabase URL: {SUPABASE_URL[:40]}...")
    print(f"  Pytania:      {len(manifest)}")
    print(f"  Kategoria:    {CATEGORY_EMOJI} {CATEGORY_NAME}")
    print()

    # 1. Znajdź lub utwórz kategorię
    print("📂 Szukam kategorii...")
    existing = rest_get("categories", {"name": f"eq.{CATEGORY_NAME}", "select": "id,name"})
    if existing:
        cat_id = existing[0]["id"]
        print(f"  ✅ Znaleziono: {cat_id}")
    else:
        print(f"  📝 Tworzę kategorię '{CATEGORY_NAME}'...")
        cat = rest_post("categories", {
            "name": CATEGORY_NAME,
            "emoji": CATEGORY_EMOJI,
            "lang": CATEGORY_LANG,
        })
        cat_id = cat["id"]
        print(f"  ✅ Utworzono: {cat_id}")

    # 2. Pobierz istniejące pytania (żeby nie duplikować)
    print("🔍 Sprawdzam istniejące pytania...")
    existing_qs = rest_get("questions", {
        "category_id": f"eq.{cat_id}",
        "select": "id,answer",
    })
    existing_answers = {q["answer"].lower() for q in existing_qs}
    print(f"  Istniejące pytania: {len(existing_answers)}")

    # 3. Upload
    success = 0
    skipped = 0
    failed = 0

    for i, item in enumerate(manifest, 1):
        answer = item["answer"]
        synonyms = item.get("synonyms", [])
        image_rel = item.get("image", "")
        image_path = PROJECT_ROOT / image_rel

        print(f"\n[{i}/{len(manifest)}] {answer}")

        # Pomiń duplikaty
        if answer.lower() in existing_answers:
            print(f"  ⏭️  Już istnieje w bazie")
            skipped += 1
            continue

        # Sprawdź plik
        if not image_path.exists():
            print(f"  ❌ Brak pliku: {image_path}")
            failed += 1
            continue

        # Upload zdjęcia do Storage
        import uuid
        storage_path = f"{cat_id}/q-{uuid.uuid4()}.jpg"
        try:
            storage_path = storage_upload(BUCKET, storage_path, image_path)
            size_kb = image_path.stat().st_size // 1024
            print(f"  📷 Upload OK ({size_kb} KB) → {storage_path}")
        except Exception as e:
            print(f"  ❌ Upload error: {e}")
            failed += 1
            continue

        # Utwórz pytanie
        try:
            rest_post("questions", {
                "category_id": cat_id,
                "answer": answer,
                "synonyms": synonyms,
                "image_path": storage_path,
            })
            print(f"  ✅ Pytanie utworzone")
            success += 1
        except Exception as e:
            print(f"  ❌ Insert error: {e}")
            failed += 1

        time.sleep(REQUEST_DELAY)

    print()
    print("=" * 60)
    print(f"  ✅ Wgrano:    {success}")
    print(f"  ⏭️  Pominięto: {skipped} (duplikaty)")
    print(f"  ❌ Błędów:    {failed}")
    print(f"  📂 Kategoria: {CATEGORY_EMOJI} {CATEGORY_NAME} ({cat_id})")
    print("=" * 60)


if __name__ == "__main__":
    main()

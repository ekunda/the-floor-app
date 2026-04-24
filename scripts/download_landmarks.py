#!/usr/bin/env python3
"""
download_landmarks.py — Pobiera zdjęcia znanych miejsc na świecie z Wikimedia Commons.

Użycie:
    pip install requests Pillow
    python scripts/download_landmarks.py

Wynik:
    images/znane_miejsca/         — folder ze zdjęciami (odpowiedź jako nazwa pliku)
    images/znane_miejsca.json     — manifest do bulk uploadu

Nazewnictwo plików:
    {odpowiedź}__{synonim1,synonim2}.jpg
    np. "Wieża Eiffla__Tour Eiffel,Eiffel Tower.jpg"

Manifest JSON (do użycia ze skryptem bulk_upload.py):
    [
      {
        "answer": "Wieża Eiffla",
        "synonyms": ["Tour Eiffel", "Eiffel Tower"],
        "image": "images/znane_miejsca/Wieża Eiffla__Tour Eiffel,Eiffel Tower.jpg"
      },
      ...
    ]
"""

import json
import os
import re
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("❌ Brak modułu 'requests'. Zainstaluj: pip install requests")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("⚠️  Brak modułu 'Pillow' — zdjęcia nie będą optymalizowane.")
    print("   Zainstaluj: pip install Pillow")
    Image = None

# ─────────────────────────────────────────────────────────────────────────────
# KONFIGURACJA
# ─────────────────────────────────────────────────────────────────────────────

# Folder docelowy
OUTPUT_DIR = Path(__file__).parent.parent / "images" / "znane_miejsca"
MANIFEST_PATH = Path(__file__).parent.parent / "images" / "znane_miejsca.json"

# Docelowa szerokość zdjęcia (px) — skalowanie w dół dla szybszego ładowania w grze
TARGET_WIDTH = 800
JPEG_QUALITY = 82

# Wikimedia API
WIKI_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "TheFloorGameBot/1.0 (quiz game; educational use)"

# Opóźnienie między zapytaniami (sekundy) — szanujemy API
REQUEST_DELAY = 0.5

# ─────────────────────────────────────────────────────────────────────────────
# LISTA ZNANYCH MIEJSC
# Format: (odpowiedź_PL, [synonimy], artykuł_Wikipedia_EN)
# ─────────────────────────────────────────────────────────────────────────────

LANDMARKS = [
    # Europa
    ("Wieża Eiffla", ["Tour Eiffel", "Eiffel Tower"], "Eiffel Tower"),
    ("Koloseum", ["Colosseum", "Koloseum w Rzymie"], "Colosseum"),
    ("Krzywa Wieża w Pizie", ["Leaning Tower of Pisa", "Wieża w Pizie"], "Leaning Tower of Pisa"),
    ("Big Ben", ["Elizabeth Tower", "Wieża Elżbiety"], "Big Ben"),
    ("Sagrada Familia", ["Sagrada Família", "Bazylika Sagrada Familia"], "Sagrada Família"),
    ("Akropol", ["Acropolis", "Akropol ateński", "Parthenon"], "Acropolis of Athens"),
    ("Stonehenge", [], "Stonehenge"),
    ("Brama Brandenburska", ["Brandenburg Gate", "Brandenburger Tor"], "Brandenburg Gate"),
    ("Wawel", ["Zamek Królewski na Wawelu", "Wawel Castle"], "Wawel Castle"),
    ("Tower Bridge", ["Most Tower"], "Tower Bridge"),
    ("Bazylika św. Piotra", ["St. Peter's Basilica", "Bazylika Świętego Piotra"], "St. Peter's Basilica"),
    ("Łuk Triumfalny", ["Arc de Triomphe"], "Arc de Triomphe"),
    ("Notre-Dame", ["Katedra Notre-Dame"], "Notre-Dame de Paris"),
    ("Hagia Sophia", ["Aya Sofya", "Hagia Sofia"], "Hagia Sophia"),
    ("Kreml", ["Kremlin", "Kreml moskiewski"], "Moscow Kremlin"),
    ("Plac Świętego Marka", ["Piazza San Marco", "St. Mark's Square"], "Piazza San Marco"),
    ("Alhambra", ["Pałac Alhambra"], "Alhambra"),
    ("Zamek Neuschwanstein", ["Neuschwanstein Castle", "Neuschwanstein"], "Neuschwanstein Castle"),
    ("Błękitny Meczet", ["Blue Mosque", "Sultan Ahmed Mosque"], "Sultan Ahmed Mosque"),
    ("Fontanna di Trevi", ["Trevi Fountain", "Fontana di Trevi"], "Trevi Fountain"),

    # Ameryka
    ("Statua Wolności", ["Statue of Liberty"], "Statue of Liberty"),
    ("Machu Picchu", [], "Machu Picchu"),
    ("Chichén Itzá", ["Chichen Itza", "Piramida Kukulkana"], "Chichen Itza"),
    ("Chrystus Odkupiciel", ["Cristo Redentor", "Christ the Redeemer"], "Christ the Redeemer (statue)"),
    ("Wielki Kanion", ["Grand Canyon"], "Grand Canyon"),
    ("Golden Gate", ["Most Golden Gate", "Golden Gate Bridge"], "Golden Gate Bridge"),
    ("Niagara", ["Wodospad Niagara", "Niagara Falls"], "Niagara Falls"),
    ("Mount Rushmore", ["Góra Rushmore"], "Mount Rushmore"),
    ("Times Square", [], "Times Square"),
    ("Biały Dom", ["White House"], "White House"),

    # Azja
    ("Wielki Mur Chiński", ["Great Wall of China", "Mur Chiński"], "Great Wall of China"),
    ("Tadż Mahal", ["Taj Mahal"], "Taj Mahal"),
    ("Angkor Wat", [], "Angkor Wat"),
    ("Góra Fudżi", ["Mount Fuji", "Fudżi", "Fuji"], "Mount Fuji"),
    ("Petra", ["Skalne Miasto Petra"], "Petra"),
    ("Bagan", ["Świątynie Bagan"], "Bagan"),
    ("Burj Khalifa", ["Burdż Chalifa"], "Burj Khalifa"),
    ("Zakazane Miasto", ["Forbidden City"], "Forbidden City"),
    ("Fushimi Inari", ["Fushimi Inari-taisha"], "Fushimi Inari-taisha"),
    ("Marina Bay Sands", [], "Marina Bay Sands"),

    # Afryka
    ("Piramidy w Gizie", ["Pyramids of Giza", "Piramida Cheopsa"], "Giza pyramid complex"),
    ("Sfinks", ["Great Sphinx", "Sfinks z Gizy", "Wielki Sfinks"], "Great Sphinx of Giza"),
    ("Góra Stołowa", ["Table Mountain"], "Table Mountain"),
    ("Wodospady Wiktorii", ["Victoria Falls"], "Victoria Falls"),
    ("Medyna Fezu", ["Fez Medina", "Fes el Bali"], "Fes el Bali"),

    # Oceania
    ("Opera w Sydney", ["Sydney Opera House"], "Sydney Opera House"),
    ("Uluru", ["Ayers Rock"], "Uluru"),
    ("Wielka Rafa Koralowa", ["Great Barrier Reef"], "Great Barrier Reef"),

    # Inne kultowe
    ("Wyspa Wielkanocna", ["Easter Island", "Moai", "Rapa Nui"], "Easter Island"),
    ("Santorini", ["Thira"], "Santorini"),
]


# ─────────────────────────────────────────────────────────────────────────────
# FUNKCJE
# ─────────────────────────────────────────────────────────────────────────────

def sanitize_filename(name: str) -> str:
    """Zamienia znaki niedozwolone w nazwie pliku na podkreślniki."""
    return re.sub(r'[<>:"/\\|?*]', '_', name)


def fetch_wikipedia_image_url(article_title: str) -> str | None:
    """
    Pobiera URL głównego obrazu z artykułu Wikipedii (en).
    Używa API pageimages (thumbnail 1200px).
    """
    params = {
        "action": "query",
        "titles": article_title,
        "prop": "pageimages",
        "format": "json",
        "pithumbsize": 1200,
        "pilicense": "any",
    }
    headers = {"User-Agent": USER_AGENT}

    try:
        resp = requests.get(WIKI_API, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            thumb = page.get("thumbnail", {})
            src = thumb.get("source")
            if src:
                # Podmień rozmiar thumbnailа na większy
                src = re.sub(r'/\d+px-', '/1200px-', src)
                return src
    except Exception as e:
        print(f"  ⚠️  API error for '{article_title}': {e}")

    return None


def download_image(url: str, dest: Path) -> bool:
    """Pobiera obraz z URL i zapisuje do pliku."""
    headers = {"User-Agent": USER_AGENT}
    try:
        resp = requests.get(url, headers=headers, timeout=30, stream=True)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "")
        if "image" not in content_type and "octet-stream" not in content_type:
            print(f"  ⚠️  Nie obraz (Content-Type: {content_type})")
            return False
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"  ⚠️  Download error: {e}")
        return False


def optimize_image(path: Path) -> None:
    """Skaluje i optymalizuje obraz do docelowej szerokości JPEG."""
    if Image is None:
        return
    try:
        img = Image.open(path)
        # Konwertuj do RGB (obsługa RGBA/PNG → JPEG)
        if img.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", img.size, (0, 0, 0))
            if img.mode == "P":
                img = img.convert("RGBA")
            bg.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Skaluj w dół
        if img.width > TARGET_WIDTH:
            ratio = TARGET_WIDTH / img.width
            new_h = int(img.height * ratio)
            img = img.resize((TARGET_WIDTH, new_h), Image.LANCZOS)

        # Zapisz jako JPEG
        jpg_path = path.with_suffix(".jpg")
        img.save(jpg_path, "JPEG", quality=JPEG_QUALITY, optimize=True)

        # Usuń oryginał jeśli to inny plik
        if jpg_path != path and path.exists():
            path.unlink()

    except Exception as e:
        print(f"  ⚠️  Optimize error: {e}")


def build_filename(answer: str, synonyms: list[str]) -> str:
    """Buduje nazwę pliku: odpowiedź__synonim1,synonim2.jpg"""
    base = sanitize_filename(answer)
    if synonyms:
        syns = ",".join(sanitize_filename(s) for s in synonyms)
        return f"{base}__{syns}.jpg"
    return f"{base}.jpg"


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("🏛️  THE FLOOR — Downloader zdjęć znanych miejsc")
    print("=" * 60)
    print(f"  Miejsca do pobrania: {len(LANDMARKS)}")
    print(f"  Folder docelowy:     {OUTPUT_DIR}")
    print(f"  Manifest:            {MANIFEST_PATH}")
    print()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)

    manifest = []
    success = 0
    skipped = 0
    failed = 0

    for i, (answer, synonyms, wiki_article) in enumerate(LANDMARKS, 1):
        filename = build_filename(answer, synonyms)
        dest = OUTPUT_DIR / filename

        print(f"[{i}/{len(LANDMARKS)}] {answer}")

        # Pomiń jeśli już istnieje
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"  ✅ Już istnieje ({dest.stat().st_size // 1024} KB)")
            manifest.append({
                "answer": answer,
                "synonyms": synonyms,
                "image": str(dest.relative_to(Path(__file__).parent.parent)),
            })
            skipped += 1
            continue

        # Pobierz URL z Wikipedii
        img_url = fetch_wikipedia_image_url(wiki_article)
        if not img_url:
            print(f"  ❌ Nie znaleziono zdjęcia na Wikipedii")
            failed += 1
            time.sleep(REQUEST_DELAY)
            continue

        # Pobierz obraz
        # Tymczasowy plik z oryginalnym rozszerzeniem
        ext = img_url.rsplit(".", 1)[-1].split("?")[0].lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
            ext = "jpg"
        tmp_path = dest.with_suffix(f".{ext}")

        if not download_image(img_url, tmp_path):
            failed += 1
            time.sleep(REQUEST_DELAY)
            continue

        # Optymalizuj
        optimize_image(tmp_path)

        # Upewnij się, że plik docelowy .jpg istnieje
        final_path = dest.with_suffix(".jpg")
        if not final_path.exists() and tmp_path.exists():
            tmp_path.rename(final_path)

        if final_path.exists():
            size_kb = final_path.stat().st_size // 1024
            print(f"  ✅ Pobrano ({size_kb} KB)")
            manifest.append({
                "answer": answer,
                "synonyms": synonyms,
                "image": str(final_path.relative_to(Path(__file__).parent.parent)),
            })
            success += 1
        else:
            print(f"  ❌ Plik nie został utworzony")
            failed += 1

        time.sleep(REQUEST_DELAY)

    # Zapisz manifest
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 60)
    print(f"  ✅ Pobrano:  {success}")
    print(f"  ⏭️  Pominięto: {skipped}")
    print(f"  ❌ Błędów:   {failed}")
    print(f"  📄 Manifest: {MANIFEST_PATH}")
    print("=" * 60)
    print()
    print("Następny krok: uruchom bulk_upload.py aby wgrać do Supabase")


if __name__ == "__main__":
    main()

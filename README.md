# 🏆 The Floor

**The Floor** to interaktywna gra quizowa dla dwóch graczy, rozgrywana na jednym ekranie. Gracze rywalizują o przejęcie jak największej liczby pól planszy poprzez wygrywanie pojedynków — rundy Q&A na czas, w których odpowiedzi mogą podawać głosem lub klawiaturą.

**🔗 Live demo:** [the-floor-game.vercel.app](https://the-floor-game.vercel.app)

---

## 🎮 Jak grać

### Cel gry
Przejąć jak najwięcej pól planszy przed wyczerpaniem czasu przeciwnika. Każde zdobyte pole to jedna wygrana runda. Gracz z największą częścią planszy wygrywa.

### Przebieg rozgrywki

1. **Ekran startowy** — wybierz pole na planszy kursorami i naciśnij `Enter` aby rozpocząć pojedynek
2. **Odliczanie** — 3…2…1…START! — oboje gracze mają jednakowy czas na początku rundy
3. **Wyświetlane jest zdjęcie** — obaj gracze widzą to samo pytanie (obrazek)
4. **Gracz który zna odpowiedź** — naciska swój klawisz (`A` dla złotego, `D` dla srebrnego) lub mówi odpowiedź do mikrofonu
5. **Pas** — jeśli nikt nie zna odpowiedzi, wciśnij `P` lub `Spacja` — odjęte zostają sekundy kary
6. **Koniec rundy** — wygrywa gracz któremu skończy się czas jako drugiemu. Pole przechodzi do zwycięzcy

### Sterowanie

| Akcja | Klawisz |
|---|---|
| Nawigacja po planszy | `↑ ↓ ← →` |
| Wybierz pole / Rozpocznij walkę | `Enter` |
| Gracz 1 odpowiedział poprawnie | `A` |
| Gracz 2 odpowiedział poprawnie | `D` |
| Pas (kara czasowa) | `P` lub `Spacja` |
| Włącz/wyłącz mikrofon | `M` |
| Zamknij / Anuluj | `Esc` |

---

## ✨ Funkcje

### Rozgrywka
- **Plansza** renderowana na Canvas z animowanym kursorem i efektami glow
- **Pojedynek na czas** — każdy gracz ma osobny licznik czasu (domyślnie 45s), który odlicza tylko gdy gracz jest aktywny
- **System pytań** — losowe pytanie ze zdjęciem z bazy kategorii; pytania nie powtarzają się w ramach jednej kategorii
- **Pas z karą** — konfigurowalna kara czasowa za użycie pasa (domyślnie −2s)
- **Pasek statystyk** — pokazuje procentowy udział każdego gracza w planszy, aktualizowany na żywo
- **Persystencja sesji** — gra zapisywana w sessionStorage, przeżywa odświeżenie strony (ważna przez 24h)

### Rozpoznawanie mowy 🎤
- Działa przez **Web Speech API** (Chrome/Edge) — bez zewnętrznych usług, bez klucza API
- Obsługuje **język polski** (`pl-PL`)
- Rozpoznaje odpowiedź główną oraz wszystkie przypisane **synonimy**
- **Fuzzy matching** — akceptuje odmiany fleksyjne (np. *wodospady* zamiast *wodospad*)
- **Word-boundary matching** — unika fałszywych trafień (np. *las* nie pasuje do *klasyczny*)
- Mikrofon działa nieprzerwanie przez całą grę — zero opóźnień przy restarcie
- Komendy pasa głosem: *pas*, *dalej*, *skip*, *pomiń*
- Wskaźnik LED w nagłówku: 🟢 aktywny / 🟣 wstrzymany / ⚫ wyłączony

### Panel admina
- Dostęp przez `/admin` z hasłem, sesja wygasa po 1 godzinie
- **Zarządzanie kategoriami** — tworzenie, usuwanie, przypisywanie emoji
- **Zarządzanie pytaniami** — dodawanie/edycja/usuwanie pytań ze zdjęciami
- **Synonimy** — każde pytanie może mieć dowolną liczbę alternatywnych akceptowanych odpowiedzi
- **Bulk upload zdjęć** — masowe przesyłanie zdjęć do kategorii
- **Konfiguracja gry** — wszystkie parametry w czasie rzeczywistym bez restartowania
- **Przypisywanie kafelków** — manualne lub losowe przypisanie kategorii do konkretnych pól planszy

### Konfiguracja gry (panel admina)
| Ustawienie | Opis | Domyślnie |
|---|---|---|
| Kształt planszy | Prostokąt 4×3, Szeroka 6×2, Wysoka 3×4, Kwadrat 4×4, Duża 5×3, Bardzo duża 6×4 | 4×3 |
| Czas gracza | Sekundy na start pojedynku | 45s |
| Kara za pas | Sekundy odejmowane przy pasie | 2s |
| Głośność | Muzyka i efekty dźwiękowe | 80% |
| Rozmieszczenie kategorii | Kolejne / losowe | Kolejne |
| Statystyki widoczne | Czy pasek pojawia się od razu | Tak |

---

## 🛠 Stack technologiczny

### Frontend
- **React 18** + **TypeScript** — komponenty funkcyjne z hookami
- **Vite** — bundler i dev server
- **React Router v6** — routing SPA
- **Zustand** — globalny stan gry i konfiguracji (bez boilerplate Redux)
- **Canvas API** — plansza gry renderowana przez `requestAnimationFrame` dla płynnych animacji
- **Web Speech API** — rozpoznawanie mowy (Chrome/Edge, bez zależności)

### Backend / Infrastruktura
- **Supabase** — baza danych PostgreSQL + autentykacja + storage
  - Tabela `categories` — kategorie z emoji
  - Tabela `questions` — pytania z odpowiedziami, synonimami i ścieżką do zdjęcia
  - Tabela `config` — konfiguracja gry synchronizowana między sesjami
  - Bucket `question-images` — zdjęcia pytań (publiczny CDN)
- **Vercel** — hosting (HTTPS wymagany przez Web Speech API)

### Architektura stanu
```
useConfigStore (Zustand)        useGameStore (Zustand)
├── config (GameConfig)         ├── categories + questions
├── players [gold, silver]      ├── tiles (plansza)
└── tileCategories              ├── cursor
                                ├── duel (DuelState)
                                └── blockInput, toastText, showStats
```

### Persystencja
- **sessionStorage** — stan gry (przeżywa F5, wymazywany po zamknięciu karty)
- **localStorage** — nazwy i kolory graczy
- **Supabase DB** — konfiguracja gry (synchronizowana między urządzeniami)

---

## 🗄 Schemat bazy danych

```sql
-- Kategorie pytań
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  emoji      text NOT NULL DEFAULT '🎯',
  created_at timestamptz DEFAULT now()
);

-- Pytania z obrazkami i synonimami
CREATE TABLE questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  image_path  text,             -- ścieżka w Supabase Storage
  answer      text NOT NULL,    -- główna odpowiedź
  synonyms    text[] DEFAULT '{}', -- alternatywne akceptowane odpowiedzi
  created_at  timestamptz DEFAULT now()
);

-- Konfiguracja gry (klucz-wartość)
CREATE TABLE config (
  key   text PRIMARY KEY,
  value text NOT NULL
);
```

---

## 🚀 Lokalne uruchomienie

### Wymagania
- Node.js 18+
- Konto Supabase (darmowe)

### Instalacja

```bash
# 1. Sklonuj repozytorium
git clone https://github.com/twoj-user/the-floor.git
cd the-floor

# 2. Zainstaluj zależności
npm install

# 3. Skonfiguruj zmienne środowiskowe
cp .env.example .env
# Uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_ANON

# 4. Uruchom serwer deweloperski
npm run dev
```

### Zmienne środowiskowe

```env
VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
VITE_SUPABASE_ANON=twoj-anon-key
```

### Migracja bazy danych

Wykonaj w Supabase SQL Editor:

```sql
-- Tworzenie tabel (patrz schemat powyżej)

-- Jeśli dodajesz synonimy do istniejącej bazy:
ALTER TABLE questions ADD COLUMN IF NOT EXISTS synonyms text[] DEFAULT '{}';
UPDATE questions SET synonyms = '{}' WHERE synonyms IS NULL;

-- Storage bucket (w panelu Supabase: Storage → New bucket)
-- Nazwa: question-images, Public: true
```

### Konfiguracja admina

Ustaw hasło admina w tabeli `config`:

```sql
INSERT INTO config (key, value) VALUES ('ADMIN_PASSWORD', 'twoje-haslo');
```

---

## 📁 Struktura projektu

```
src/
├── components/
│   ├── Board.tsx              # Plansza Canvas z animacjami
│   ├── DuelModal.tsx          # Modal pojedynku z rozpoznawaniem mowy
│   └── ProtectedRoute.tsx     # Guard trasy admina
├── pages/
│   ├── Game.tsx               # Główny ekran gry
│   ├── Admin.tsx              # Logowanie do panelu
│   ├── AdminConfig.tsx        # Panel konfiguracji (kategorie, gra, gracze)
│   └── AdminQuestions.tsx     # Edytor pytań z synonimami
├── store/
│   ├── useGameStore.ts        # Stan gry (Zustand)
│   └── useConfigStore.ts      # Konfiguracja i gracze (Zustand)
├── lib/
│   ├── useSpeechRecognition.ts # Web Speech API hook + fuzzy matching
│   ├── SoundEngine.ts          # Muzyka i efekty dźwiękowe
│   ├── persistence.ts          # Serializacja/deserializacja stanu gry
│   └── supabase.ts             # Klient Supabase + helpers sesji admina
└── types.ts                   # Interfejsy TypeScript
```

---

## 🎵 Dźwięk

Gra posiada własny system dźwięku (`SoundEngine`):
- **Muzyka tła** — oddzielna dla ekranu gry i pojedynku, z płynnym fade in/out
- **Efekty** — odliczanie, poprawna odpowiedź, buzzer (pas), oklaski (wygrana)
- Głośność konfigurowana centralnie (0–100%), zapisywana w bazie

---

## 🔒 Bezpieczeństwo

- Panel admina chroniony hasłem z 1-godzinną sesją
- Sesja admina trzymana w sessionStorage (wymazywana po zamknięciu karty)
- Klucz Supabase `anon` — tylko operacje publiczne dozwolone przez RLS
- HTTPS wymagany przez Vercel (potrzebne dla Web Speech API)

---

## 📝 Licencja

Projekt prywatny. Wszelkie prawa zastrzeżone.

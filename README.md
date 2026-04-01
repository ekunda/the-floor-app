# 🏆 The Floor

**The Floor** to interaktywna gra quizowa dla dwóch graczy, rozgrywana na jednym ekranie lub online (1v1). Gracze rywalizują o przejęcie jak największej liczby pól planszy poprzez wygrywanie pojedynków — rundy Q&A na czas, w których odpowiedzi mogą podawać głosem lub klawiaturą.

**🔗 Live demo:** [the-floor-app.vercel.app](https://the-floor-app.vercel.app)

---

## 🎮 Jak grać

### Cel gry
Przejąć jak najwięcej pól planszy przed wyczerpaniem czasu przeciwnika. Każde zdobyte pole to jedna wygrana runda. Gracz z największą częścią planszy wygrywa.

### Przebieg rozgrywki

1. **Ekran startowy** — wybierz pole na planszy kursorami i naciśnij `Enter` aby rozpocząć pojedynek
2. **Odliczanie** — 3…2…1…START! — oboje gracze mają jednakowy czas na początku rundy
3. **Wyświetlane jest zdjęcie** — obaj gracze widzą to samo pytanie (obrazek)
4. **Gracz który zna odpowiedź** — naciska swój klawisz (`A` dla złotego, `D` dla srebrnego) lub mówi odpowiedź do mikrofonu
5. **PAS** — jeśli nikt nie zna odpowiedzi, wciśnij `P` lub `Spacja` albo powiedz **"PASS"** / **"PAS"** / **"DALEJ"** — odjęte zostają sekundy kary
6. **Koniec rundy** — wygrywa gracz któremu skończy się czas jako drugiemu. Pole przechodzi do zwycięzcy

### Sterowanie

| Akcja | Klawisz / Głos |
|---|---|
| Nawigacja po planszy | `↑ ↓ ← →` |
| Wybierz pole / Rozpocznij walkę | `Enter` |
| Gracz 1 odpowiedział poprawnie | `A` |
| Gracz 2 odpowiedział poprawnie | `D` |
| Pas (kara czasowa) | `P`, `Spacja` lub głos: *PASS / PAS / DALEJ / SKIP / KOLEJNE* |
| Włącz/wyłącz mikrofon | `M` |
| Zamknij / Anuluj | `Esc` |

---

## ✨ Funkcje

### Rozgrywka
- **Plansza** renderowana na Canvas z animowanym kursorem i efektami glow
- **Pojedynek na czas** — każdy gracz ma osobny licznik czasu (domyślnie 45s), który odlicza tylko gdy gracz jest aktywny
- **System pytań** — losowe pytanie ze zdjęciem z bazy kategorii; pytania nie powtarzają się w ramach jednej kategorii
- **Pas z karą** — konfigurowalna kara czasowa za użycie pasa (domyślnie −2s); opcjonalny limit pasów
- **Pasek statystyk** — pokazuje procentowy udział każdego gracza w planszy, aktualizowany na żywo
- **Persystencja sesji** — gra zapisywana w sessionStorage, przeżywa odświeżenie strony (ważna przez 24h)
- **ErrorBoundary** — przechwytuje błędy renderowania i wyświetla ekran odzyskiwania

### Rozpoznawanie mowy 🎤 — jak w programie "The Floor"
- Działa przez **Web Speech API** (Chrome/Edge) — bez zewnętrznych usług, bez klucza API
- **Wielojęzyczne** — obsługuje `pl-PL`, `en-US` oraz oba języki jednocześnie
- Język rozpoznawania ustawiany **per kategoria** w panelu admina (🇵🇱 / 🇺🇸 / 🌐)
- Tryb **🌐 Oba** działa jako leapfrog — pl-PL i en-US przełączają się bez przerw
- Rozpoznaje odpowiedź główną oraz wszystkie przypisane **synonimy**
- **Fuzzy matching** — akceptuje odmiany fleksyjne: polskie i angielskie
- **Strip articles** — usuwa angielskie przedimki ("it is a lion" → "lion" ✓)
- **Word-boundary matching** — unika fałszywych trafień
- Mikrofon działa nieprzerwanie przez całą grę — zero opóźnień przy restarcie
- **Watchdog** — automatycznie restartuje recognition gdy Chrome cicho go zatrzyma (~co 60s)
- **Komendy pasa głosem** (jak w TV show "The Floor"):
  - *pass, pas, dalej, skip, kolejne, następne, następny, następnie, pomijam, pomiń, przejdź*
  - Zabezpieczone przed podwójnym wywołaniem (debounce 180ms na interim)
  - Feedback `🎤 PAS` odróżnia pas głosem od pasa klawiaturą
- **JSGF Grammar hints** — przeglądarka zna słowa kluczowe z góry → szybsze wykrycie
- Wskaźnik LED w nagłówku: 🟢 aktywny / 🟣 wstrzymany / ⚫ wyłączony

### Tryb Multiplayer Online 🌐
- **Online 1v1** przez Supabase Realtime broadcast
- **Host-authoritative** — host prowadzi planszę, gość wysyła eventy odpowiedzi
- Automatyczny **reconnect** po utracie połączenia (2s retry)
- Rozpoznawanie mowy aktywne domyślnie — każdy gracz słucha przez swój mikrofon
- Ranking i XP — punkty za wygraną/remis/przegraną, widoczne w rankingu globalnym

### Panel admina
- Dostęp przez `/admin` z hasłem, sesja wygasa po 1 godzinie
- **Zarządzanie kategoriami** — tworzenie, usuwanie, przypisywanie emoji i języka rozpoznawania mowy
- **Zarządzanie pytaniami** — dodawanie/edycja/usuwanie pytań ze zdjęciami, synonimy, filtrowanie, paginacja
- **Bulk upload zdjęć** — masowe przesyłanie zdjęć do kategorii (nazwy plików → odpowiedzi)
- **Konfiguracja SP i MP** — niezależne ustawienia dla trybu lokalnego i online
- **Panel graczy** — lista graczy, edycja XP/statystyk, reset, usuwanie; przegląd win-rate
- **Historia gier online** — tabela z graczami, wynikami i datami
- **Aktywne pokoje** — podgląd otwartych pokoi multiplayer w czasie rzeczywistym
- **System XP** — konfigurowalne punkty za wygraną/remis/przegraną

### Konfiguracja gry (panel admina)
| Ustawienie | Opis | Domyślnie |
|---|---|---|
| Kształt planszy | Prostokąt 4×3, Szeroka 6×2, Wysoka 3×4, Kwadrat 4×4, Duża 5×3, Bardzo duża 6×4 | 4×3 |
| Czas gracza | Sekundy na start pojedynku | 45s |
| Kara za pas | Sekundy odejmowane przy pasie | 2s |
| Limit pasów | Maks. liczba pasów per duel (0 = brak) | 0 |
| Pas głosem | Rozpoznawanie "PASS/PAS/DALEJ" przez mikrofon | Włączone |
| Podpowiedź litery | Pierwsza litera odpowiedzi po 10s ciszy | Wyłączone |
| Animacja kafelka | Efekt flip przy zmianie właściciela | Włączone |
| Głośność muzyki | Muzyka tła (0–100%) | 70% |
| Głośność efektów | Efekty dźwiękowe (0–100%) | 85% |
| Statystyki widoczne | Pasek posiadania planszy od startu | Tak |

---

## 🛠 Stack technologiczny

### Frontend
- **React 19** + **TypeScript** — komponenty funkcyjne z hookami
- **Vite 7** — bundler i dev server
- **React Router v7** — routing SPA
- **Zustand 5** — globalny stan gry i konfiguracji (bez boilerplate Redux)
- **Canvas API** — plansza gry renderowana przez `requestAnimationFrame` dla płynnych animacji
- **Web Speech API** — rozpoznawanie mowy wielojęzyczne (Chrome/Edge, bez zależności)
- **Code splitting** — lazy import stron admina i multipayer (~147 kB mniej w main bundle)

### Backend / Infrastruktura
- **Supabase** — baza danych PostgreSQL + autentykacja + Realtime + storage
  - Tabela `categories` — kategorie z emoji i językiem rozpoznawania mowy
  - Tabela `questions` — pytania z odpowiedziami, synonimami i ścieżką do zdjęcia
  - Tabela `config` — konfiguracja gry synchronizowana między sesjami
  - Tabela `rooms` — pokoje multiplayer
  - Tabela `profiles` — profile graczy z XP i statystykami
  - Tabela `game_history` — historia rozegranych gier online
  - Bucket `question-images` — zdjęcia pytań (publiczny CDN)
- **Vercel** — hosting (HTTPS wymagany przez Web Speech API)
- **Playwright** — testy E2E (chromium, 13 testów)

### Architektura stanu
```
useConfigStore (Zustand)        useGameStore (Zustand)
├── config (GameConfig)         ├── categories + questions
├── players [gold, silver]      ├── tiles (plansza)
└── tileCategories              ├── cursor
                                ├── duel (DuelState)
                                │   └── lang (SpeechLang)
                                └── blockInput, toastText, showStats

useMultiplayerStore (Zustand)   useAuthStore (Zustand)
├── room / role / status        ├── user (Supabase Auth)
├── tiles + cursor              └── profile (XP, stats)
└── duel (MPDuelState)
```

### Persystencja
- **sessionStorage** — stan gry (przeżywa F5, wymazywany po zamknięciu karty)
- **localStorage** — nazwy i kolory graczy w trybie SP
- **Supabase DB** — konfiguracja gry, profile graczy, historia gier

---

## 🗄 Schemat bazy danych

```sql
-- Kategorie pytań
CREATE TABLE categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  emoji      text NOT NULL DEFAULT '🎯',
  lang       text NOT NULL DEFAULT 'pl-PL',  -- 'pl-PL' | 'en-US' | 'both'
  created_at timestamptz DEFAULT now()
);

-- Pytania z obrazkami i synonimami
CREATE TABLE questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  image_path  text,             -- ścieżka w Supabase Storage
  answer      text NOT NULL,    -- główna odpowiedź
  synonyms    text[] DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- Konfiguracja gry (klucz-wartość)
CREATE TABLE config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Profile graczy online
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id),
  username    text,
  avatar      text DEFAULT '🎮',
  xp          int  DEFAULT 0,
  wins        int  DEFAULT 0,
  losses      int  DEFAULT 0,
  win_streak  int  DEFAULT 0,
  best_streak int  DEFAULT 0,
  status      text DEFAULT 'offline',
  last_seen   timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Pokoje multiplayer
CREATE TABLE rooms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  host_id    uuid REFERENCES profiles(id),
  guest_id   uuid REFERENCES profiles(id),
  status     text DEFAULT 'waiting',
  created_at timestamptz DEFAULT now()
);

-- Historia gier online
CREATE TABLE game_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id    uuid REFERENCES profiles(id),
  loser_id     uuid REFERENCES profiles(id),
  winner_score int,
  loser_score  int,
  is_draw      boolean DEFAULT false,
  played_at    timestamptz DEFAULT now()
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
git clone https://github.com/ekunda/the-floor-app.git
cd the-floor-app

# 2. Zainstaluj zależności
npm install

# 3. Skonfiguruj zmienne środowiskowe
cp .env.example .env
# Uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_ANON

# 4. Uruchom serwer deweloperski
npm run dev

# 5. Testy E2E (opcjonalnie, wymaga działającego dev servera)
npm run test:e2e
```

### Zmienne środowiskowe

```env
VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
VITE_SUPABASE_ANON=twoj-anon-key
```

### Migracja bazy danych

Wykonaj w Supabase SQL Editor (schemat powyżej). Migracje addytywne:

```sql
-- Synonimy do istniejących pytań:
ALTER TABLE questions ADD COLUMN IF NOT EXISTS synonyms text[] DEFAULT '{}';

-- Język per kategoria:
ALTER TABLE categories ADD COLUMN IF NOT EXISTS lang text DEFAULT 'pl-PL';

-- Storage bucket (Supabase UI: Storage → New bucket)
-- Nazwa: question-images, Public: true
```

---

## 📁 Struktura projektu

```
src/
├── components/
│   ├── Board.tsx              # Plansza Canvas z animacjami
│   ├── DuelModal.tsx          # Modal pojedynku (JSX + keyboard handler)
│   ├── ErrorBoundary.tsx      # Error recovery z DefaultFallback UI
│   └── ProtectedRoute.tsx     # Guard trasy admina
├── hooks/
│   └── useDuelLogic.ts        # Logika pojedynku (wydzielona z DuelModal)
├── pages/
│   ├── Game.tsx               # Główny ekran gry (SP)
│   ├── MultiplayerLobby.tsx   # Lobby multiplayer (tworzenie/dołączanie pokoju)
│   ├── MultiplayerGame.tsx    # Gra online 1v1
│   ├── Admin.tsx              # Logowanie do panelu
│   ├── AdminConfig.tsx        # Panel konfiguracji (SP/MP/Gracze)
│   ├── AdminQuestions.tsx     # Edytor pytań z synonimami i paginacją
│   ├── AdminPlayers.tsx       # Zarządzanie graczami online
│   ├── AuthPage.tsx           # Rejestracja/logowanie gracza
│   ├── Ranking.tsx            # Ranking globalny
│   └── UserProfile.tsx        # Profil gracza
├── store/
│   ├── useGameStore.ts        # Stan gry SP (Zustand)
│   ├── useConfigStore.ts      # Konfiguracja i gracze SP (Zustand)
│   ├── useMultiplayerStore.ts # Stan gry MP (Zustand + Supabase Realtime)
│   └── useAuthStore.ts        # Autentykacja (Zustand + Supabase Auth)
├── lib/
│   ├── useSpeechRecognition.ts # Web Speech API — wielojęzyczny hook + fuzzy matching
│   ├── SoundEngine.ts          # Muzyka i efekty dźwiękowe
│   ├── persistence.ts          # Serializacja/deserializacja stanu gry (sessionStorage)
│   └── supabase.ts             # Klient Supabase + helpers sesji admina
└── types.ts                   # Interfejsy TypeScript

e2e/
├── splash.spec.ts             # Testy ekranu startowego
├── game-flow.spec.ts          # Testy przepływu gry SP
└── multiplayer-lobby.spec.ts  # Testy lobby MP
```

---

## 🎵 Dźwięk

Gra posiada własny system dźwięku (`SoundEngine`):
- **Muzyka tła** — oddzielna dla ekranu gry i pojedynku, z płynnym fade in/out
- **Efekty** — odliczanie, poprawna odpowiedź, buzzer (pas), oklaski (wygrana)
- Głośność muzyki i efektów konfigurowana niezależnie (0–100%), zapisywana w bazie

---

## 🔒 Bezpieczeństwo

- Panel admina chroniony hasłem z 1-godzinną sesją
- Sesja admina trzymana w sessionStorage (wymazywana po zamknięciu karty)
- Klucz Supabase `anon` — tylko operacje publiczne dozwolone przez RLS
- HTTPS wymagany przez Vercel (potrzebne dla Web Speech API)
- `.env` z kluczami nie jest commitowany; dostępny `.env.example`

---

## 📝 Licencja

Projekt prywatny. Wszelkie prawa zastrzeżone.

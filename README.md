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
- **Koniec gry w MP** — automatyczny gdy jedna strona zdobędzie ≥75% planszy

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

Tryb 1v1 przez internet, oparty na architekturze host-autorytarnej z Supabase Realtime.

#### Tryby gry

Lobby pozwala wybrać jeden z trzech presetów, a każdy parametr można dostosować ręcznie:

| Tryb | Czas | Kara za pas | Liczba pól | Plansza |
|---|---|---|---|---|
| 🏛️ KLASYCZNY | 45s | −2s | 12 | 4×3 |
| ⚡ BLITZ | 15s | −5s | 9 | 3×3 |
| 💀 HARDCORE | 30s | −15s | 16 | 4×4 |

Każdy tryb można dostosować ręcznie (czas, kara za pas, liczba pól).

#### Plansza dopasowana do trybu

| Liczba pól | Układ planszy |
|---|---|
| 6 | 3×2 |
| 9 | 3×3 |
| 12 | 4×3 |
| 16 | 4×4 |

#### System XP skalowany do planszy

Liczba punktów XP zależy od rozmiaru planszy — większa plansza = więcej XP:

| Pola | Wygrana | Remis | Forfeit (przegrana) |
|---|---|---|---|
| 6 | +6 | +3 | −3 |
| 9 | +9 | +4 | −4 |
| 12 | +12 | +6 | −6 |
| 16 | +16 | +8 | −8 |

- **Forfeit** (opuszczenie aktywnej gry): zwycięzca otrzymuje 1.5× normalne XP, przegrany traci 0.5× XP
- Opuszczenie aktywnego pojedynku skutkuje karą XP

#### System zaproszenia

- Gracz z otwartym pokojem może zapraszać innych graczy online przyciskiem ✉ przy ich awatarze
- Zaproszony gracz widzi powiadomienie i może zaakceptować (dołącza do pokoju) lub odrzucić
- Po odrzuceniu nadawca widzi stosowny komunikat

#### Status graczy online

- 🟢 Zielona kropka — gracz jest online
- 🟡 Żółta kropka — gracz jest w trakcie gry
- ⚫ Brak kropki — gracz offline

#### Synchronizacja i architektura

- **Host-authoritative** — host prowadzi planszę i timer, gość wysyła zdarzenia odpowiedzi
- Host broadcastuje ustawienia lobby (tryb gry, czas, kara) do gościa w czasie rzeczywistym
- Automatyczny **reconnect** po utracie połączenia (2s retry)
- Rozpoznawanie mowy aktywne domyślnie — każdy gracz słucha przez swój mikrofon

### Panel admina
- Dostęp przez `/admin` z hasłem, sesja wygasa po 1 godzinie
- **Zarządzanie kategoriami** — tworzenie, usuwanie, przypisywanie emoji i języka rozpoznawania mowy
- **Zarządzanie pytaniami** — dodawanie/edycja/usuwanie pytań ze zdjęciami, synonimy, filtrowanie, paginacja
- **Bulk upload zdjęć** — masowe przesyłanie zdjęć do kategorii (nazwy plików → odpowiedzi)
- **Konfiguracja SP i MP** — niezależne ustawienia dla trybu lokalnego i online (klucze `SP_` i `MP_`)
- **Panel graczy** — lista graczy, edycja XP/statystyk, reset, usuwanie; przegląd win-rate
- **Historia gier online** — tabela z graczami, wynikami i datami
- **Aktywne pokoje** — podgląd otwartych pokoi multiplayer w czasie rzeczywistym
- **System XP** — konfigurowalne punkty za wygraną/remis/przegraną

### Konfiguracja gry (panel admina)
| Ustawienie | Opis | Domyślnie |
|---|---|---|
| Kształt planszy | Prostokąt 4×3, Szeroka 6×2, Wysoka 3×4, Kwadrat 4×4, Duża 5×3, Bardzo duża 6×4 | 4×3 |
| Czas gracza (SP) | Sekundy na start pojedynku w trybie lokalnym | 45s |
| Kara za pas (SP) | Sekundy odejmowane przy pasie w trybie lokalnym | 2s |
| Czas gracza (MP) | Sekundy na start pojedynku w trybie online | 45s |
| Kara za pas (MP) | Sekundy odejmowane przy pasie w trybie online | 2s |
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
- **Vite 7** — bundler i dev server; handler `vite:preloadError` zapewnia automatyczny reload po nowym deployu (fix dla "Failed to fetch chunk")
- **React Router v7** — routing SPA
- **Zustand 5** — globalny stan gry i konfiguracji (bez boilerplate Redux)
- **Canvas API** — plansza gry renderowana przez `requestAnimationFrame` dla płynnych animacji
- **Web Speech API** — rozpoznawanie mowy wielojęzyczne (Chrome/Edge, bez zależności)
- **Code splitting** — lazy import stron admina i multiplayer (~147 kB mniej w main bundle)

### Backend / Infrastruktura
- **Supabase** — baza danych PostgreSQL + autentykacja + Realtime + storage
  - Tabela `categories` — kategorie z emoji i językiem rozpoznawania mowy
  - Tabela `questions` — pytania z odpowiedziami, synonimami i ścieżką do zdjęcia
  - Tabela `config` — konfiguracja gry synchronizowana między sesjami (klucze `SP_` i `MP_`)
  - Tabela `game_rooms` — pokoje multiplayer
  - Tabela `profiles` — profile graczy z XP i statystykami (Realtime włączone)
  - Tabela `game_history` — historia rozegranych gier online
  - Bucket `question-images` — zdjęcia pytań (publiczny CDN)
  - Indeksy na `profiles.status`, `profiles.xp`, `game_history.*`
  - RLS włączone na wszystkich tabelach public
  - pg_trgm w schemacie `extensions`
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
├── duel (MPDuelState)
├── gameSettings (tryb, czas, kara, pola)
└── chatMessages
```

### Persystencja
- **sessionStorage** — stan gry (przeżywa F5, wymazywany po zamknięciu karty)
- **localStorage** — nazwy i kolory graczy w trybie SP; identyfikator i nazwa gracza MP
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

-- Konfiguracja gry (klucz-wartość); klucze SP_ i MP_ dla trybów lokalnego i online
CREATE TABLE config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Profile graczy online (Realtime włączone)
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id),
  username    text,
  avatar      text DEFAULT '🎮',
  xp          int  DEFAULT 0,
  wins        int  DEFAULT 0,
  losses      int  DEFAULT 0,
  win_streak  int  DEFAULT 0,
  best_streak int  DEFAULT 0,
  status      text DEFAULT 'offline',  -- 'online' | 'in_game' | 'offline'
  last_seen   timestamptz,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Indeksy dla rankingu i statusu
CREATE INDEX ON profiles(status);
CREATE INDEX ON profiles(xp DESC);

-- Pokoje multiplayer (Realtime włączone)
CREATE TABLE game_rooms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text UNIQUE NOT NULL,
  host_id    uuid REFERENCES profiles(id),
  guest_id   uuid REFERENCES profiles(id),
  status     text DEFAULT 'waiting',  -- 'waiting' | 'lobby' | 'playing' | 'finished'
  game_state jsonb,
  host_score int DEFAULT 0,
  guest_score int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
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

-- Rozszerzenie pg_trgm (w schemacie extensions, nie public)
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
```

### RLS i Realtime
- RLS (Row Level Security) włączone na wszystkich tabelach public
- Realtime włączone dla tabel `profiles` i `game_rooms`

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

-- Zmiana nazwy tabeli rooms → game_rooms (jeśli upgrade z wcześniejszej wersji):
ALTER TABLE rooms RENAME TO game_rooms;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS game_state jsonb;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS host_score int DEFAULT 0;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS guest_score int DEFAULT 0;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

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
│   ├── MultiplayerLobby.tsx   # Lobby multiplayer (tworzenie/dołączanie/zaproszenia)
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
│   ├── SoundEngine.ts          # Muzyka i efekty dźwiękowe (init z config na starcie)
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
- **Efekty** — odliczanie (beepy 3/2/1 + START!), poprawna odpowiedź, buzzer (pas), oklaski (wygrana)
- Countdown beepy identyczne w SP i MP — `timerBeep` odpala się przy 3/2/1 i START!
- Dźwięki poprawnej odpowiedzi i buzzer aktywne także w trybie multiplayer
- `SoundEngine.init(config)` wywołany z MUSIC_VOLUME i SFX_VOLUME na starcie gry
- `SoundEngine.unlockAudio()` wywoływany przy pierwszej interakcji użytkownika w MP
- Obrazek pytania ukryty podczas odliczania, pojawia się dopiero po START!
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

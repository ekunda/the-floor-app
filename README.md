# 🏆 The Floor

> **Real-time 1v1 quiz battle.** Two players fight for control of a board by winning timed photo-duels — answering by voice or keyboard, locally on one screen or online over the internet.

**🔗 Live demo:** [the-floor-app.vercel.app](https://the-floor-app.vercel.app)

<p>
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Realtime-3FCF8E?logo=supabase&logoColor=white">
  <img alt="Zustand" src="https://img.shields.io/badge/State-Zustand_5-443E38">
</p>

**🌐 Language:** **English** · [Polski](#-the-floor--polski)

---

## Overview

The Floor is an interactive trivia game inspired by the TV show of the same name. Players take turns selecting tiles on a board and challenging the category behind them. Each tile is decided by a **duel**: a rapid-fire round of photo questions on a shared timer. The player who runs out of time *second* wins the tile. Take enough of the board and you win the match.

It runs in two modes:

- **Local (single screen)** — two players share one keyboard and microphone.
- **Online 1v1** — host-authoritative multiplayer over Supabase Realtime, with lobbies, invites, presence, an XP ladder and a global ranking.

---

## How to play

### Objective
Claim as much of the board as possible. Every tile you win is one duel won; the player holding the largest share of the board wins the game.

### Round flow
1. **Splash screen** — move the cursor across the board and press `Enter` to start a duel.
2. **Countdown** — 3…2…1…START! Both players begin the round with an equal time bank.
3. **A photo appears** — both players see the same question.
4. **Buzz in** — whoever knows the answer presses their key (`A` for gold, `D` for silver) or says it into the mic.
5. **Pass** — if nobody knows, press `P` / `Space` or say *"PASS" / "PAS" / "DALEJ"* to skip for a time penalty.
6. **Round end** — the player whose clock empties *second* wins; the tile changes hands.

### Controls

| Action | Key / Voice |
|---|---|
| Navigate the board | `↑ ↓ ← →` |
| Select tile / Start duel | `Enter` |
| Pick a random unplayed tile (lottery) | `L` |
| Player 1 answered correctly | `A` |
| Player 2 answered correctly | `D` |
| Pass (time penalty) | `P`, `Space`, or voice: *PASS / PAS / DALEJ / SKIP / KOLEJNE* |
| Toggle microphone | `M` |
| Close / Cancel | `Esc` |

---

## Features

### Gameplay
- **Canvas board** with an animated cursor, glow effects, and a flip animation when a tile changes owner.
- **Per-player timed duels** — each side has an independent clock (45s default) that ticks only while that player is active.
- **Question engine** — random photo questions drawn per category; no repeats within a category in a single duel.
- **Pass with penalty** — configurable time penalty (−2s default) and an optional pass limit.
- **Tile lottery** (`L`) — jump the cursor to a random unplayed tile.
- **Live ownership bar** — real-time percentage of the board held by each player.
- **Session persistence** — the game is saved to `sessionStorage` and survives a page refresh (valid 24h); stale saves are dropped when the board preset changes.
- **Error boundary** — render errors are caught and a recovery screen is shown.

### 🎤 Speech recognition — answer by voice
- Powered by the **Web Speech API** (Chrome/Edge) — no external service, no API key.
- **Multilingual** — `pl-PL`, `en-US`, or both at once; configured per category in the admin panel (🇵🇱 / 🇺🇸 / 🌐).
- **Both-languages mode** leapfrogs `pl-PL` and `en-US` with no gaps.
- **Fuzzy matching** accepts inflected forms (Polish & English), strips English articles, and uses word-boundary matching to avoid false hits.
- **Voice pass commands** as in the show — *pass, pas, dalej, skip, kolejne, następne…* — debounced against double-fire.
- **Watchdog** auto-restarts recognition when Chrome silently stops it (~every 60s); a header LED shows status: 🟢 active / 🟣 paused / ⚫ off.

### 🌐 Online multiplayer
Host-authoritative 1v1 over Supabase Realtime.

**Game modes** — pick a preset, then fine-tune any parameter:

| Mode | Time | Pass penalty | Tiles | Board |
|---|---|---|---|---|
| 🏛️ CLASSIC | 45s | −2s | 12 | 4×3 |
| ⚡ BLITZ | 15s | −5s | 9 | 3×3 |
| 💀 HARDCORE | 30s | −15s | 16 | 4×4 |

**XP scaled to board size** — bigger boards reward more XP:

| Tiles | Win | Draw | Forfeit (loss) |
|---|---|---|---|
| 6 | +6 | +3 | −3 |
| 9 | +9 | +4 | −4 |
| 12 | +12 | +6 | −6 |
| 16 | +16 | +8 | −8 |

- **Forfeit** (leaving an active game): the winner gets 1.5× XP, the leaver loses 0.5× XP.
- **Invites** — open a room and invite any online player with ✉; they can accept or decline, with feedback either way.
- **Presence** — 🟢 online · 🟡 in game · ⚫ offline, kept fresh by a heartbeat.
- **Architecture** — the host owns the board and timer; the guest sends answer intents; the host validates, advances state, and broadcasts results. Automatic reconnect (2s retry).

### 🔧 Admin panel
Reached at `/admin`, gated by **role-based access** (see [Security](#security-model)); the session expires after 1 hour.

- **Role-based admin** — accounts are promoted via `profiles.is_admin`; existing players can be granted/revoked admin directly from the player manager (last-admin protected).
- **Categories** — create, delete, assign emoji and speech-recognition language.
- **Questions** — add/edit/delete photo questions with synonyms, filtering, bulk select/delete, and pagination.
- **Bulk image upload** — mass-upload images to a category (filenames become answers).
- **SP & MP config** — independent settings for local and online play (`SP_` / `MP_` keys).
- **Player manager** — list, edit XP/stats, reset, ban, delete; win-rate overview; grant/revoke admin.
- **Custom board presets** plus advanced maintenance tools and hardened state-load.
- **Online history & active rooms** — game log and a live view of open multiplayer rooms.

---

## Tech stack

**Frontend** — React 19 + TypeScript, Vite 7 (with a `vite:preloadError` auto-reload guard after new deploys), React Router 7, Zustand 5 for global state, the Canvas API for the board (`requestAnimationFrame`), the Web Speech API for recognition, and code-splitting for the admin and multiplayer routes.

**Backend / infrastructure** — Supabase (PostgreSQL + Auth + Realtime + Storage):

- `categories`, `questions`, `config` — content and key-value game config.
- `profiles` — player profiles with XP, stats, presence, and the `is_admin` role (Realtime on).
- `game_rooms`, `game_history`, `game_rounds`, `matchmaking_queue` — online play.
- `question-images` storage bucket (public CDN); `pg_trgm` in the `extensions` schema.
- RLS on every public table; tuned indexes; admin RPCs.

**Tooling** — Playwright E2E (Chromium); deployed on Vercel (HTTPS is required by the Web Speech API), with a `gh-pages` deploy script also available.

### State architecture
```
useConfigStore (Zustand)        useGameStore (Zustand)
├── config (GameConfig)         ├── categories + questions
├── players [gold, silver]      ├── tiles (board)
└── tileCategories              ├── cursor
                                ├── duel (DuelState → lang: SpeechLang)
                                └── blockInput, toastText, showStats

useMultiplayerStore (Zustand)   useAuthStore (Zustand)
├── room / role / status        ├── user (Supabase Auth + profile)
├── tiles + cursor              └── is_admin, XP, stats, presence
├── duel (MPDuelState)
├── gameSettings                └── chatMessages
```

### Persistence
- **sessionStorage** — game state (survives F5, cleared on tab close) + admin session timestamp.
- **localStorage** — local-mode player names/colors; MP player id and name.
- **Supabase** — game config, player profiles, online history.

---

## Database & migrations

The authoritative schema lives in [`supabase/migrations/`](supabase/migrations). Apply the migrations in order in the Supabase SQL Editor (each is idempotent):

| Migration | Purpose |
|---|---|
| `20260424_performance_indexes.sql` | Core indexes for ranking, status, and history queries |
| `20260425_admin_optimizations.sql` | Admin-panel indexes, constraints, FK `ON DELETE` rules, and admin RPCs |
| `20260622_admin_rls_hardening.sql` | Role-based admin (`is_admin`), admin-only write RLS, and the grant/revoke RPC |

You also need a public storage bucket named `question-images` (Storage → New bucket → Public).

---

## Security model

- **Row Level Security** is enabled on all public tables. Content (`categories`, `questions`, `config`) is **publicly readable but admin-only writable** — writes are gated by `public.is_admin(auth.uid())`, a `SECURITY DEFINER` helper that avoids RLS recursion.
- **Profiles** are self-editable by their owner, with an admin override so the panel can manage every player.
- **Admin role** is stored in `profiles.is_admin`. The admin panel route checks this flag (not just an active session), and login rejects non-admin accounts.
- **`set_player_admin(target, make_admin)`** — `SECURITY DEFINER` RPC to grant/revoke admin; callable only by admins and guarded against removing the last remaining admin.
- Privileged RPCs (e.g. `admin_reset_all_stats`) verify `is_admin` server-side.
- The client uses only the Supabase **anon** key; HTTPS is enforced (also required by the Web Speech API).

> **Bootstrapping the first admin:** create the account, then set the flag once in SQL —
> `UPDATE public.profiles SET is_admin = true WHERE id = (SELECT id FROM auth.users WHERE email = 'you@example.com');`
> After that, promote others from the panel.

---

## Local development

### Requirements
- Node.js 18+
- A (free) Supabase project

### Setup
```bash
# 1. Clone
git clone https://github.com/ekunda/the-floor-app.git
cd the-floor-app

# 2. Install
npm install

# 3. Configure environment
cp .env.example .env        # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON

# 4. Run the dev server
npm run dev

# 5. (optional) E2E tests — needs the dev server running
npm run test:e2e
```

### Environment variables
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON=your-anon-key
```

### Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc`) + production build |
| `npm run preview` | Preview the production build |
| `npm run deploy` | Build and publish to GitHub Pages (`gh-pages`) |
| `npm run test:e2e` | Playwright E2E suite |

---

## Project structure
```
src/
├── components/        # Board, DuelModal, ProtectedRoute, ErrorBoundary, admin UI
├── hooks/             # useDuelLogic, useAsyncAction, useDebounce, useToast
├── pages/             # Game, Multiplayer*, Admin*, Auth, Ranking, UserProfile
├── store/             # Zustand stores (game, config, multiplayer, auth)
├── lib/               # speech recognition, SoundEngine, persistence, supabase client
└── types.ts           # shared TypeScript interfaces

e2e/                   # Playwright specs (splash, game flow, multiplayer lobby)
supabase/migrations/   # idempotent SQL migrations
```

---

## License
Private project. All rights reserved.

<br>

---

<a id="-the-floor--polski"></a>

# 🏆 The Floor — Polski

> **Quizowy pojedynek 1v1 w czasie rzeczywistym.** Dwóch graczy walczy o przejęcie planszy, wygrywając pojedynki na czas ze zdjęciami — odpowiadając głosem lub klawiaturą, lokalnie na jednym ekranie albo online przez internet.

**🔗 Demo na żywo:** [the-floor-app.vercel.app](https://the-floor-app.vercel.app)

**🌐 Język:** [English](#-the-floor) · **Polski**

---

## Wprowadzenie

The Floor to interaktywna gra quizowa inspirowana programem telewizyjnym o tej samej nazwie. Gracze na zmianę wybierają pola planszy i mierzą się z ukrytą pod nimi kategorią. O każde pole toczy się **pojedynek**: szybka runda pytań ze zdjęciami na wspólnym liczniku czasu. Wygrywa ten, komu czas skończy się jako *drugiemu*. Przejmij wystarczającą część planszy, a wygrasz mecz.

Działa w dwóch trybach:

- **Lokalny (jeden ekran)** — dwóch graczy dzieli jedną klawiaturę i mikrofon.
- **Online 1v1** — multiplayer host-autorytarny na Supabase Realtime, z lobby, zaproszeniami, statusem obecności, drabinką XP i globalnym rankingiem.

---

## Jak grać

### Cel gry
Przejmij jak najwięcej planszy. Każde zdobyte pole to jeden wygrany pojedynek; wygrywa gracz z największym udziałem w planszy.

### Przebieg rundy
1. **Ekran startowy** — przesuń kursor po planszy i naciśnij `Enter`, aby rozpocząć pojedynek.
2. **Odliczanie** — 3…2…1…START! Oboje gracze startują z równym zapasem czasu.
3. **Pojawia się zdjęcie** — obaj widzą to samo pytanie.
4. **Zgłoszenie** — kto zna odpowiedź, naciska swój klawisz (`A` złoty, `D` srebrny) albo mówi do mikrofonu.
5. **Pas** — jeśli nikt nie zna, naciśnij `P` / `Spacja` lub powiedz *„PAS / DALEJ"* — z karą czasową.
6. **Koniec rundy** — wygrywa gracz, któremu czas skończy się jako *drugiemu*; pole zmienia właściciela.

### Sterowanie

| Akcja | Klawisz / Głos |
|---|---|
| Nawigacja po planszy | `↑ ↓ ← →` |
| Wybór pola / Start pojedynku | `Enter` |
| Losowe nierozegrane pole (loteria) | `L` |
| Gracz 1 odpowiedział poprawnie | `A` |
| Gracz 2 odpowiedział poprawnie | `D` |
| Pas (kara czasowa) | `P`, `Spacja` lub głos: *PASS / PAS / DALEJ / SKIP / KOLEJNE* |
| Włącz/wyłącz mikrofon | `M` |
| Zamknij / Anuluj | `Esc` |

---

## Funkcje

### Rozgrywka
- **Plansza na Canvas** z animowanym kursorem, efektami glow i animacją flip przy zmianie właściciela pola.
- **Pojedynki na czas per gracz** — każdy ma osobny licznik (domyślnie 45s), który odlicza tylko gdy jest aktywny.
- **Silnik pytań** — losowe pytania ze zdjęciami per kategoria; bez powtórzeń w obrębie jednego pojedynku.
- **Pas z karą** — konfigurowalna kara czasowa (domyślnie −2s) i opcjonalny limit pasów.
- **Loteria pól** (`L`) — przeskok kursora na losowe nierozegrane pole.
- **Pasek posiadania** — udział każdego gracza w planszy na żywo.
- **Persystencja sesji** — gra zapisywana w `sessionStorage`, przeżywa odświeżenie (ważna 24h); nieaktualne zapisy są odrzucane po zmianie presetu planszy.
- **ErrorBoundary** — przechwytuje błędy renderowania i pokazuje ekran odzyskiwania.

### 🎤 Rozpoznawanie mowy — odpowiadaj głosem
- Działa przez **Web Speech API** (Chrome/Edge) — bez zewnętrznych usług i bez klucza API.
- **Wielojęzyczne** — `pl-PL`, `en-US` lub oba naraz; ustawiane per kategoria w panelu admina (🇵🇱 / 🇺🇸 / 🌐).
- **Tryb „oba języki"** przełącza `pl-PL` i `en-US` bez przerw (leapfrog).
- **Fuzzy matching** akceptuje odmiany fleksyjne (PL i EN), usuwa angielskie przedimki i stosuje dopasowanie po granicach słów.
- **Komendy pasa głosem** jak w programie — *pass, pas, dalej, skip, kolejne, następne…* — zabezpieczone przed podwójnym wywołaniem.
- **Watchdog** automatycznie restartuje rozpoznawanie, gdy Chrome je cicho zatrzyma (~co 60s); LED w nagłówku: 🟢 aktywny / 🟣 wstrzymany / ⚫ wyłączony.

### 🌐 Multiplayer online
Host-autorytarny 1v1 na Supabase Realtime.

**Tryby gry** — wybierz preset i dostosuj dowolny parametr:

| Tryb | Czas | Kara za pas | Pola | Plansza |
|---|---|---|---|---|
| 🏛️ KLASYCZNY | 45s | −2s | 12 | 4×3 |
| ⚡ BLITZ | 15s | −5s | 9 | 3×3 |
| 💀 HARDCORE | 30s | −15s | 16 | 4×4 |

**XP skalowane do planszy** — większa plansza, więcej XP:

| Pola | Wygrana | Remis | Forfeit (przegrana) |
|---|---|---|---|
| 6 | +6 | +3 | −3 |
| 9 | +9 | +4 | −4 |
| 12 | +12 | +6 | −6 |
| 16 | +16 | +8 | −8 |

- **Forfeit** (opuszczenie aktywnej gry): zwycięzca dostaje 1.5× XP, uciekinier traci 0.5× XP.
- **Zaproszenia** — otwórz pokój i zaproś dowolnego gracza online przyciskiem ✉; może zaakceptować lub odrzucić, z informacją zwrotną dla obu stron.
- **Obecność** — 🟢 online · 🟡 w grze · ⚫ offline, odświeżane przez heartbeat.
- **Architektura** — host prowadzi planszę i timer; gość wysyła intencje odpowiedzi; host waliduje, przesuwa stan i broadcastuje wyniki. Automatyczny reconnect (retry co 2s).

### 🔧 Panel admina
Dostępny pod `/admin`, chroniony **dostępem opartym na roli** (zob. [Bezpieczeństwo](#model-bezpieczeństwa)); sesja wygasa po 1 godzinie.

- **Rola admina** — konta są podnoszone do rangi admina przez `profiles.is_admin`; istniejącym graczom można nadać/odebrać admina wprost z menedżera graczy (z ochroną ostatniego admina).
- **Kategorie** — tworzenie, usuwanie, przypisywanie emoji i języka rozpoznawania mowy.
- **Pytania** — dodawanie/edycja/usuwanie pytań ze zdjęciami, synonimy, filtrowanie, masowe zaznaczanie/usuwanie, paginacja.
- **Masowy upload zdjęć** — wgrywanie wielu obrazków do kategorii (nazwy plików → odpowiedzi).
- **Konfiguracja SP i MP** — niezależne ustawienia trybu lokalnego i online (klucze `SP_` / `MP_`).
- **Menedżer graczy** — lista, edycja XP/statystyk, reset, blokada, usuwanie; przegląd win-rate; nadawanie/odbieranie admina.
- **Własne presety planszy** oraz zaawansowane narzędzia i utwardzone wczytywanie stanu.
- **Historia online i aktywne pokoje** — dziennik gier i podgląd otwartych pokoi na żywo.

---

## Stack technologiczny

**Frontend** — React 19 + TypeScript, Vite 7 (z handlerem `vite:preloadError` automatycznie przeładowującym po nowym deployu), React Router 7, Zustand 5 jako globalny stan, Canvas API dla planszy (`requestAnimationFrame`), Web Speech API do rozpoznawania mowy oraz code-splitting tras admina i multiplayer.

**Backend / infrastruktura** — Supabase (PostgreSQL + Auth + Realtime + Storage):

- `categories`, `questions`, `config` — treść i konfiguracja gry (klucz-wartość).
- `profiles` — profile graczy z XP, statystykami, obecnością i rolą `is_admin` (Realtime włączone).
- `game_rooms`, `game_history`, `game_rounds`, `matchmaking_queue` — rozgrywka online.
- Bucket `question-images` (publiczny CDN); `pg_trgm` w schemacie `extensions`.
- RLS na każdej tabeli public; dostrojone indeksy; RPC dla admina.

**Narzędzia** — testy E2E Playwright (Chromium); hosting na Vercel (HTTPS wymagany przez Web Speech API), z dostępnym też skryptem deployu `gh-pages`.

### Persystencja
- **sessionStorage** — stan gry (przeżywa F5, czyszczony przy zamknięciu karty) + znacznik sesji admina.
- **localStorage** — nazwy/kolory graczy w trybie lokalnym; id i nazwa gracza MP.
- **Supabase** — konfiguracja gry, profile graczy, historia online.

---

## Baza danych i migracje

Wiążący schemat znajduje się w [`supabase/migrations/`](supabase/migrations). Uruchom migracje po kolei w Supabase SQL Editor (każda jest idempotentna):

| Migracja | Cel |
|---|---|
| `20260424_performance_indexes.sql` | Podstawowe indeksy pod ranking, status i historię |
| `20260425_admin_optimizations.sql` | Indeksy panelu admina, constrainty, reguły FK `ON DELETE`, RPC admina |
| `20260622_admin_rls_hardening.sql` | Rola admina (`is_admin`), RLS „zapis tylko dla admina", RPC nadaj/odbierz |

Potrzebny jest też publiczny bucket `question-images` (Storage → New bucket → Public).

---

## Model bezpieczeństwa

- **Row Level Security** włączone na wszystkich tabelach public. Treść (`categories`, `questions`, `config`) jest **publicznie czytelna, ale zapisywalna tylko przez admina** — zapis bramkuje `public.is_admin(auth.uid())`, helper `SECURITY DEFINER`, który omija rekurencję RLS.
- **Profile** edytuje ich właściciel, z nadrzędnym dostępem admina, dzięki czemu panel może zarządzać każdym graczem.
- **Rola admina** jest w `profiles.is_admin`. Trasa panelu sprawdza tę flagę (a nie samą aktywną sesję), a logowanie odrzuca konta bez uprawnień.
- **`set_player_admin(target, make_admin)`** — RPC `SECURITY DEFINER` do nadawania/odbierania admina; wywoływalne tylko przez admina i z blokadą usunięcia ostatniego admina.
- Uprzywilejowane RPC (np. `admin_reset_all_stats`) weryfikują `is_admin` po stronie serwera.
- Klient używa wyłącznie klucza **anon** Supabase; wymuszone HTTPS (potrzebne też dla Web Speech API).

> **Bootstrap pierwszego admina:** utwórz konto, a potem jednorazowo ustaw flagę w SQL —
> `UPDATE public.profiles SET is_admin = true WHERE id = (SELECT id FROM auth.users WHERE email = 'ty@example.com');`
> Następnie kolejnych adminów nadawaj już z panelu.

---

## Uruchomienie lokalne

### Wymagania
- Node.js 18+
- (Darmowy) projekt Supabase

### Konfiguracja
```bash
# 1. Sklonuj
git clone https://github.com/ekunda/the-floor-app.git
cd the-floor-app

# 2. Zainstaluj
npm install

# 3. Skonfiguruj środowisko
cp .env.example .env        # uzupełnij VITE_SUPABASE_URL i VITE_SUPABASE_ANON

# 4. Uruchom serwer deweloperski
npm run dev

# 5. (opcjonalnie) testy E2E — wymagają działającego dev servera
npm run test:e2e
```

### Zmienne środowiskowe
```env
VITE_SUPABASE_URL=https://twoj-projekt.supabase.co
VITE_SUPABASE_ANON=twoj-anon-key
```

### Skrypty
| Skrypt | Cel |
|---|---|
| `npm run dev` | Serwer deweloperski Vite |
| `npm run build` | Sprawdzenie typów (`tsc`) + build produkcyjny |
| `npm run preview` | Podgląd buildu produkcyjnego |
| `npm run deploy` | Build i publikacja na GitHub Pages (`gh-pages`) |
| `npm run test:e2e` | Zestaw testów E2E Playwright |

---

## Struktura projektu
```
src/
├── components/        # Board, DuelModal, ProtectedRoute, ErrorBoundary, UI admina
├── hooks/             # useDuelLogic, useAsyncAction, useDebounce, useToast
├── pages/             # Game, Multiplayer*, Admin*, Auth, Ranking, UserProfile
├── store/             # Store'y Zustand (game, config, multiplayer, auth)
├── lib/               # rozpoznawanie mowy, SoundEngine, persystencja, klient supabase
└── types.ts           # współdzielone interfejsy TypeScript

e2e/                   # specyfikacje Playwright (splash, przebieg gry, lobby MP)
supabase/migrations/   # idempotentne migracje SQL
```

---

## Licencja
Projekt prywatny. Wszelkie prawa zastrzeżone.

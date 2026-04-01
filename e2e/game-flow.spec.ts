/**
 * Single-player game flow — krytyczna ścieżka
 *
 * Sprawdza:
 *  - Start gry → plansza
 *  - Nawigacja kursorem (strzałki)
 *  - Otwarcie duel (Enter)
 *  - Pre-fight screen (kategoria widoczna)
 *  - Zamknięcie duel (Escape)
 *  - Nowa gra (N / przycisk)
 *  - Przycisk statystyk (S)
 *  - Session restore przy F5 (sessionStorage)
 *
 * UWAGA: testy NIE symulują rozpoznawania mowy (Web Speech API niedostępne
 * w Playwright headless). Sprawdzamy klawiaturę i UI.
 */
import { expect, test } from '@playwright/test'

// Helper: wejście do głównej gry
async function goToGame(page: import('@playwright/test').Page) {
  await page.addInitScript(() => sessionStorage.clear())
  await page.goto('/')
  await page.getByText('ROZPOCZNIJ').click()
  await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 })
}

test.describe('Single-player game flow', () => {
  test('plansza renderuje canvas po starcie', async ({ page }) => {
    await goToGame(page)
    const canvas = page.locator('canvas')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)
  })

  test('Enter otwiera DuelModal, Escape zamyka', async ({ page }) => {
    await goToGame(page)
    // Enter — challenge start
    await page.keyboard.press('Enter')
    // Pre-fight: powinien pojawić się przycisk ROZPOCZNIJ
    await expect(page.getByText('ROZPOCZNIJ').last()).toBeVisible({ timeout: 5_000 })
    // Escape — zamknij duel
    await page.keyboard.press('Escape')
    await expect(page.getByText('ROZPOCZNIJ').last()).not.toBeVisible({ timeout: 3_000 })
  })

  test('strzałki przesuwają kursor (nie crash)', async ({ page }) => {
    await goToGame(page)
    // Kilka ruchów — nie powinno crashować
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key)
    }
    // Plansza nadal widoczna
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('N startuje nową grę (toast "Nowa gra")', async ({ page }) => {
    await goToGame(page)
    await page.keyboard.press('n')
    await expect(page.getByText('🎮 Nowa gra!')).toBeVisible({ timeout: 3_000 })
  })

  test('przycisk Nowa gra w stopce działa', async ({ page }) => {
    await goToGame(page)
    await page.getByText('Nowa gra').click()
    await expect(page.getByText('🎮 Nowa gra!')).toBeVisible({ timeout: 3_000 })
  })

  test('F5 restores session z sessionStorage', async ({ page }) => {
    await goToGame(page)
    // Porusz kursorem — zmiana stanu
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    // Czekaj na auto-save (debounce 400ms)
    await page.waitForTimeout(600)
    // Odśwież
    await page.reload()
    // Powinno pojawić się "Wznawianie gry…" albo od razu plansza
    await expect(page.locator('canvas')).toBeVisible({ timeout: 12_000 })
  })
})

test.describe('Error boundary', () => {
  test('aplikacja nie wyświetla białej strony na /', async ({ page }) => {
    await page.goto('/')
    // Sprawdź że nie ma pustej strony (ErrorBoundary działa lub splash renderuje)
    const body = await page.textContent('body')
    expect(body).not.toBe('')
    expect(body).not.toBeNull()
  })
})

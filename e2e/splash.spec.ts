/**
 * Splash screen — weryfikacja start flow
 *
 * Sprawdza:
 *  - Czy splash screen renderuje się poprawnie
 *  - Czy przyciski ROZPOCZNIJ i MULTIPLAYER są widoczne
 *  - Czy kliknięcie MULTIPLAYER przekierowuje na /multiplayer
 */
import { expect, test } from '@playwright/test'

test.describe('Splash screen', () => {
  test.beforeEach(async ({ page }) => {
    // Wyczyść sessionStorage żeby nie wchodzić w restore flow
    await page.addInitScript(() => sessionStorage.clear())
    await page.goto('/')
  })

  test('wyświetla logo i przyciski akcji', async ({ page }) => {
    await expect(page.getByText('THE REFLEKTOR')).toBeVisible()
    await expect(page.getByText('ROZPOCZNIJ')).toBeVisible()
    await expect(page.getByText('MULTIPLAYER')).toBeVisible()
  })

  test('kliknięcie MULTIPLAYER przechodzi do /multiplayer', async ({ page }) => {
    await page.getByText('MULTIPLAYER').click()
    await expect(page).toHaveURL('/multiplayer')
  })

  test('kliknięcie ROZPOCZNIJ ładuje planszę', async ({ page }) => {
    await page.getByText('ROZPOCZNIJ').click()
    // Czekamy na wyjście z loading state — pojawi się plansza (canvas)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 })
    // Stopka z przyciskami gry
    await expect(page.getByText('Nowa gra')).toBeVisible()
  })
})

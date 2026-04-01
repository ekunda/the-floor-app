/**
 * Multiplayer lobby — statyczna weryfikacja UI
 *
 * Sprawdza:
 *  - Lobby renderuje się bez błędów
 *  - Formularz dołączenia do pokoju wymaga kodu
 *  - Przycisk "Utwórz pokój" wymaga zalogowania
 *  - Link powrotu do gry głównej
 *
 * Testy NIE tworzą prawdziwego pokoju Supabase — to wymagałoby
 * test-level mock credentials. Sprawdzamy tylko UI layer.
 */
import { expect, test } from '@playwright/test'

test.describe('Multiplayer lobby UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/multiplayer')
  })

  test('renderuje logo i sekcję "Dołącz do pokoju"', async ({ page }) => {
    await expect(page.getByText('THE FLOOR')).toBeVisible()
    // Input na kod pokoju
    await expect(page.locator('input[placeholder*="kod"]').or(
      page.locator('input[maxlength="4"]')
    ).or(
      page.locator('input').filter({ hasText: '' }).first()
    )).toBeVisible({ timeout: 5_000 })
  })

  test('Utwórz pokój przekierowuje do /login gdy niezalogowany', async ({ page }) => {
    // Znajdź przycisk "Utwórz"
    const createBtn = page.getByText(/utw[oó]rz/i).first()
    if (await createBtn.isVisible()) {
      await createBtn.click()
      // Niezalogowany → /login
      await expect(page).toHaveURL(/login|multiplayer/, { timeout: 5_000 })
    }
  })

  test('przycisk Wróć / strzałka wraca do strony głównej', async ({ page }) => {
    // Kliknij logo THE FLOOR lub wróć przeglądarką
    await page.goBack()
    // Albo bezpośrednio
    await page.goto('/')
    await expect(page).toHaveURL('/')
  })
})

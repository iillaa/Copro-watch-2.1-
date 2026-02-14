from playwright.sync_api import sync_playwright, expect

def verify_ui_polish():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Taller viewport
        page = browser.new_page(viewport={"width": 375, "height": 1000})

        # 1. Navigate
        print("Navigating to app...")
        page.goto("http://localhost:5173")

        # 2. Handle PIN Lock (0000)
        try:
            page.wait_for_selector(".pin-pad", timeout=5000)
            zero_btn = page.get_by_role("button", name="0")
            for _ in range(4):
                zero_btn.click()
                page.wait_for_timeout(100)
        except:
             pass

        # 3. Verify Dashboard
        expect(page.get_by_role("heading", name="Tableau de bord")).to_be_visible(timeout=10000)
        page.screenshot(path="/home/jules/verification/dashboard_tall.png")

        # 4. Verify Water Analyses Empty State
        print("Navigating to Water Analyses...")
        page.locator('[title="Analyses d\'eau"]').click()
        expect(page.get_by_role("heading", name="Qualité de l'Eau")).to_be_visible()

        if page.get_by_text("Aucune donnée").is_visible():
            print("SUCCESS: Water Analysis Empty State IS Visible")
        else:
            print("FAILURE: Water Analysis Empty State IS NOT Visible")

        page.screenshot(path="/home/jules/verification/water_tall.png")

        # 5. Verify Weapon List Empty State
        print("Navigating to Weapon List...")
        page.locator('[title="Détenteurs Armes"]').click()
        expect(page.get_by_role("heading", name="Détenteurs d'Armes")).to_be_visible()

        if page.get_by_text("Aucun résultat").is_visible():
             print("SUCCESS: Weapon List Empty State IS Visible")
        else:
             print("FAILURE: Weapon List Empty State IS NOT Visible")

        page.screenshot(path="/home/jules/verification/weapon_tall.png")

        browser.close()

if __name__ == "__main__":
    verify_ui_polish()

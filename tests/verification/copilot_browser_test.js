
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:3003';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runTests() {
    console.log("🚀 Starting Copilot Browser Verification...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    try {
        await page.goto(BASE_URL + '/mail', { waitUntil: 'networkidle2' });
        console.log("📍 Navigated to /mail");

        // --- OPEN COPILOT ---
        console.log("🔍 Opening Copilot...");

        // Wait for and click first thread
        const threadSelector = '[id^="thread-item-"]';
        await page.waitForSelector(threadSelector, { timeout: 10000 });
        await page.click(threadSelector);
        console.log("   ✅ Thread selected.");

        // Wait for "Ask Copilot" button
        const askCopilotSelector = 'button:has(svg)'; // Generic since it has Sparkles icon
        // Better: let's use text content via evaluate if needed, but let's try a wait
        await new Promise(r => setTimeout(r, 2000)); // Wait for animation

        const buttons = await page.$$('button');
        let triggerBtn = null;
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.innerText, btn);
            if (text.includes("Ask Copilot")) {
                triggerBtn = btn;
                break;
            }
        }

        if (triggerBtn) {
            await triggerBtn.click();
            console.log("   ✅ 'Ask Copilot' clicked.");
        } else {
            console.warn("   ⚠️ 'Ask Copilot' button not found via text. Trying selector...");
            await page.click('button.bg-primary.text-primary-foreground').catch(() => { });
        }

        await new Promise(r => setTimeout(r, 2000));

        // --- SCENARIO 1: NEON GREEN BUTTON ---
        console.log("\n🧪 Scenario 1: Neon Green Button");
        const chatInputSelector = 'input[placeholder="Ask Copilot..."]';
        await page.waitForSelector(chatInputSelector, { timeout: 5000 });

        await page.type(chatInputSelector, "Change the compose button to neon green");
        await page.keyboard.press('Enter');
        console.log("   Command sent. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));

        const composeStyle = await page.evaluate(() => {
            const el = document.querySelector('#compose-button');
            return el ? window.getComputedStyle(el).backgroundColor : 'NOT FOUND';
        });
        console.log("   Compose Button Color:", composeStyle);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_neon_button.png') });

        // --- SCENARIO 2: EXAMPLE EMAIL ---
        console.log("\n🧪 Scenario 2: Example Email");
        // Reloading might close copilot, let's just clear input or type again
        await page.click(chatInputSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        await page.type(chatInputSelector, "Draft an email to mom@example.com saying happy birthday");
        await page.keyboard.press('Enter');
        console.log("   Command sent. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));

        const modalVisible = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
        console.log("   Compose Modal Visible:", modalVisible);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_example_email.png') });

        // --- SCENARIO 3: COMPLEX QUERY ---
        console.log("\n🧪 Scenario 3: Complex Query");
        await page.click(chatInputSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');

        await page.type(chatInputSelector, "Find emails from 'John' and summarize them");
        await page.keyboard.press('Enter');
        console.log("   Command sent. Waiting 15s...");
        await new Promise(r => setTimeout(r, 15000));
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_complex_query.png') });

    } catch (error) {
        console.error("❌ Error during test execution:", error);
    } finally {
        await browser.close();
        console.log("\n🏁 Verification complete. Check screenshots in tests/verification/screenshots");
    }
}

runTests();

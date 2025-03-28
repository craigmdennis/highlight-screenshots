const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const showHighlights = !args.includes("--no-highlight");
const viewportArg = args.find((arg) => arg.startsWith("--viewport="));
const [viewportWidth, viewportHeight] = viewportArg
  ? viewportArg.split("=")[1].split("x").map(Number)
  : [1440, 900];

const urlArg = args.find((arg) => arg.startsWith("--url="));
const targetUrl = urlArg ? urlArg.split("=")[1] : "https://example.com";

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: viewportWidth, height: viewportHeight });

  await page.goto(targetUrl);
  console.log(
    "Please log in manually. Press any key in the terminal to begin tracking clicks..."
  );

  // Wait for user input to start tracking clicks
  process.stdin.setRawMode(true);
  process.stdin.resume();
  await new Promise((resolve) =>
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      resolve();
    })
  );

  await page.exposeFunction("notifyClick", async (x, y) => {
    if (showHighlights) {
      await page.evaluate(
        ({ x, y }) => {
          // Remove previous markers
          document
            .querySelectorAll(".puppeteer-click-marker")
            .forEach((el) => el.remove());

          const marker = document.createElement("div");
          marker.className = "puppeteer-click-marker";
          marker.style.position = "absolute";
          marker.style.width = "20px";
          marker.style.height = "20px";
          marker.style.borderRadius = "50%";
          marker.style.background = "rgba(255, 0, 0, 0.5)";
          marker.style.left = `${x - 10}px`;
          marker.style.top = `${y - 10}px`;
          marker.style.zIndex = 9999;
          marker.style.pointerEvents = "none";
          marker.style.border = "2px solid red";
          document.body.appendChild(marker);
        },
        { x, y }
      );
    }

    console.log(
      `📸 Click registered at (${x}, ${y}) — capturing screenshot...`
    );

    try {
      const scrollY = Math.max(0, y - viewportHeight / 2);
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), scrollY);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const dateDir = new Date().toISOString().split("T")[0];
      const dirPath = path.join(__dirname, "screenshots", dateDir);
      if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

      const filePath = path.join(dirPath, `screenshot-${Date.now()}.png`);
      await page.screenshot({ path: filePath });
      console.log(`✅ Screenshot saved: ${filePath}`);
    } catch (err) {
      console.error("❌ Screenshot failed:", err);
    }
  });

  // Enable click-to-screenshot tracking
  async function enableClickTracking() {
    await page.evaluate(() => {
      if (window.__screenshotListenerAttached) return;
      document.addEventListener("click", (event) => {
        const target = event.target.closest("a");
        if (target && target.href) {
          event.preventDefault();
          const href = target.href;
          window.notifyClick(event.pageX, event.pageY).then(() => {
            setTimeout(() => {
              location.href = href;
            }, 100); // slight delay to ensure screenshot
          });
        } else {
          window.notifyClick(event.pageX, event.pageY);
        }
      });
      window.__screenshotListenerAttached = true;
    });
  }

  // Attach handler after every navigation
  page.on("framenavigated", async () => {
    console.log("Navigation detected. Re-enabling click tracking...");
    try {
      await enableClickTracking();
    } catch (e) {
      console.error("Error reattaching click handler:", e.message);
    }
  });

  // Initial enable
  await enableClickTracking();
  console.log(
    "Click on the page to capture screenshots. Close the browser manually when done."
  );
})();

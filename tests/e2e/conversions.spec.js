// @ts-check
const {test,expect}=require("@playwright/test");
const path=require("path");
const fx=n=>path.join(__dirname,"..","..","fixtures",n);

test("browser test runner is green, ffmpeg included",async({page})=>{
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("/squish-tests.html?ffmpeg=1");
  await expect(page.locator("#summary")).not.toContainText("running",{timeout:230000});
  const failing=await page.locator(".t.fail b").allTextContents();
  expect(failing,"failing browser tests").toEqual([]);
  expect(errors,"uncaught page errors").toEqual([]);
});

async function convert(page,fixture,ext){
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx(fixture));
  const input=page.locator("#targetInput");
  await expect(input).toBeVisible();
  await input.fill("."+ext);
  await input.press("Enter");
  await expect(page.locator("#convertBtn")).toBeVisible();
  await page.locator("#convertBtn").click();
  await expect(page.locator("#resultTitle")).toHaveText(/ta-da!|hmm/,{timeout:180000});
  return {title:await page.locator("#resultTitle").textContent(),sub:await page.locator("#resultSub").textContent()};
}

test("app: pdf to png downloads a zip",async({page})=>{
  const r=await convert(page,"two-page.pdf","png");
  expect(r.title).toBe("ta-da!");expect(r.sub).toContain("ZIP");
  const [dl]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:/Download/}).click()]);
  expect(dl.suggestedFilename()).toBe("two-page.zip");
});

test("app: md to docx",async({page})=>{
  const r=await convert(page,"short.md","docx");
  expect(r.title).toBe("ta-da!");expect(r.sub).toContain("DOCX");
});

test("app: wav to mp3 through ffmpeg.wasm",async({page})=>{
  const r=await convert(page,"one-second.wav","mp3");
  expect(r.title).toBe("ta-da!");expect(r.sub).toContain("MP3");
});

test("app: a bad page range fails honestly",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("two-page.pdf"));
  const input=page.locator("#targetInput");await input.fill(".png");await input.press("Enter");
  await page.locator("#modeSeg button[data-m=advanced]").click();
  await page.locator("#advBlock input[type=text]").first().fill("9");
  await page.locator("#advBlock input[type=text]").first().dispatchEvent("input");
  await page.locator("#convertBtn").click();
  await expect(page.locator("#resultTitle")).toHaveText("hmm, that didn't work",{timeout:60000});
  await expect(page.locator("#resultSub")).toContainText("No pages matched");
  await expect(page.getByRole("button",{name:/Download/})).toHaveCount(0);
});

test("app: a malformed trim explains the format",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("one-second.mp4"));
  const input=page.locator("#targetInput");await input.fill(".mp4");await input.press("Enter");
  await page.locator("#modeSeg button[data-m=advanced]").click();
  const trim=page.locator("#advBlock input[type=text]").first();
  await trim.fill("five to twelve");await trim.dispatchEvent("input");
  await page.locator("#convertBtn").click();
  await expect(page.locator("#resultTitle")).toHaveText("hmm, that didn't work",{timeout:60000});
  await expect(page.locator("#resultSub")).toContainText("m:ss-m:ss");
});

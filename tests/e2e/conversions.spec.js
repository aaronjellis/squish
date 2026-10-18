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

test("app: cancel returns to the options and the next convert works",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("one-second.wav"));
  const input=page.locator("#targetInput");await input.fill(".mp3");await input.press("Enter");
  await page.locator("#convertBtn").click();
  await page.locator("#cancelBtn").click();
  await expect(page.locator("#cancelNote")).toContainText("Cancelled",{timeout:15000});
  await expect(page.locator("#result")).not.toHaveClass(/show/);
  await page.locator("#convertBtn").click();
  await expect(page.locator("#resultTitle")).toHaveText("ta-da!",{timeout:120000});
});

test("app: csv to json downloads people.json",async({page})=>{
  const r=await convert(page,"people.csv","json");
  expect(r.title).toBe("ta-da!");expect(r.sub).toContain("JSON");
  const [dl]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:/Download/}).click()]);
  expect(dl.suggestedFilename()).toBe("people.json");
});

test("app: heic to png",async({page})=>{
  const r=await convert(page,"fx.heic","png");
  expect(r.title).toBe("ta-da!");expect(r.sub).toContain("PNG");
});

test("app: jxl to png",async({page})=>{
  const r=await convert(page,"fx.jxl","png");
  expect(r.title).toBe("ta-da!");expect(r.sub).toContain("PNG");
});

test("app: png to jxl with the lossless checkbox",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("fx.png"));
  const input=page.locator("#targetInput");await expect(input).toBeVisible();
  await input.fill(".jxl");await input.press("Enter");
  const box=page.locator("#optGrid .opt[data-key=lossless] input[type=checkbox]");
  await expect(box).toBeVisible();
  await box.check();
  await expect(page.locator("#optGrid .opt[data-key=quality]")).toHaveClass(/dim/);
  await page.locator("#convertBtn").click();
  await expect(page.locator("#resultTitle")).toHaveText("ta-da!",{timeout:60000});
  await expect(page.locator("#resultSub")).toContainText("JXL");
  const [dl]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:/Download/}).click()]);
  expect(dl.suggestedFilename()).toBe("fx.jxl");
});

test("app: the lossless checkbox only shows for jxl",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("fx.png"));
  const input=page.locator("#targetInput");await expect(input).toBeVisible();
  await input.fill(".webp");await input.press("Enter");
  await expect(page.locator("#convertBtn")).toBeVisible();
  await expect(page.locator("#optGrid .opt[data-key=lossless]")).toHaveCount(0);
});

test("app: jpg to jxl keeps the JPEG data exactly by default",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("photo.jpg"));
  const input=page.locator("#targetInput");await expect(input).toBeVisible();
  await input.fill(".jxl");await input.press("Enter");
  const box=page.locator("#optGrid .opt[data-key=transcode] input[type=checkbox]");
  await expect(box).toBeVisible();await expect(box).toBeChecked();
  await expect(page.locator("#optGrid .opt[data-key=quality]")).toHaveClass(/dim/);
  await expect(page.locator("#optGrid .opt[data-key=lossless]")).toHaveClass(/dim/);
  await page.locator("#convertBtn").click();
  await expect(page.locator("#resultTitle")).toHaveText("ta-da!",{timeout:60000});
  await expect(page.locator("#resultSub")).toContainText("JXL");
  const [dl]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:/Download/}).click()]);
  expect(dl.suggestedFilename()).toBe("photo.jxl");
  const fs=require("fs"),out=fs.readFileSync(await dl.path()),src=fs.readFileSync(fx("photo.jpg"));
  expect(out.length).toBeLessThan(src.length*0.9);
  expect(out.subarray(4,8).toString("latin1")).toBe("JXL ");
});

test("app: a jxl made from a JPEG offers to restore it, byte for byte",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("fx-from-jpeg.jxl"));
  const input=page.locator("#targetInput");await expect(input).toBeVisible();
  await input.fill(".jpg");await input.press("Enter");
  const box=page.locator("#optGrid .opt[data-key=restore] input[type=checkbox]");
  await expect(box).toBeVisible();await expect(box).toBeChecked();
  await expect(page.locator("#optGrid .opt[data-key=quality]")).toHaveClass(/dim/);
  await page.locator("#convertBtn").click();
  await expect(page.locator("#resultTitle")).toHaveText("ta-da!",{timeout:60000});
  const [dl]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:/Download/}).click()]);
  expect(dl.suggestedFilename()).toBe("fx-from-jpeg.jpg");
  const fs=require("fs");
  expect(fs.readFileSync(await dl.path()).equals(fs.readFileSync(fx("fx.jpg")))).toBe(true);
});

test("app: the restore and reversible checkboxes only show when they can work",async({page})=>{
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("fx.jxl"));
  const input=page.locator("#targetInput");await expect(input).toBeVisible();
  await input.fill(".jpg");await input.press("Enter");
  await expect(page.locator("#convertBtn")).toBeVisible();
  await expect(page.locator("#optGrid .opt[data-key=restore]")).toHaveCount(0);
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("fx.png"));
  await expect(input).toBeVisible();await input.fill(".jxl");await input.press("Enter");
  await expect(page.locator("#convertBtn")).toBeVisible();
  await expect(page.locator("#optGrid .opt[data-key=transcode]")).toHaveCount(0);
  await expect(page.locator("#optGrid .opt[data-key=quality]")).not.toHaveClass(/dim/);
});

test("app: md to epub",async({page})=>{
  const r=await convert(page,"short.md","epub");
  expect(r.title).toBe("ta-da!");expect(r.sub).toContain("EPUB");
});

test("app: voting opens a styled requested-formats panel, not an alert",async({page})=>{
  let alerts=0;page.on("dialog",d=>{alerts++;d.dismiss();});
  await page.addInitScript(()=>{window.posthog={captured:[],capture(name,props){this.captured.push({name,props});}};});
  await page.goto("/squish.html");
  await page.setInputFiles("#fileInput",fx("shapes.svg"));
  const input=page.locator("#targetInput");await input.fill(".dwg");await input.press("Enter");
  await page.locator("#vbtn").click();
  await expect(page.locator("#vbtn")).toContainText("thanks");
  await page.locator("#showStats").click();
  const dlg=page.locator("#statsDlg");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("svg");
  await expect(dlg).toContainText("dwg");
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  expect(alerts).toBe(0);
  const captured=await page.evaluate(()=>window.posthog.captured);
  expect(captured).toContainEqual({name:"format_vote_cast",props:{project:"squish",from:"svg",to:"dwg"}});
});

test("app: a finished conversion reports a PostHog event with the formats",async({page})=>{
  await page.addInitScript(()=>{window.posthog={captured:[],capture(name,props){this.captured.push({name,props});}};});
  const r=await convert(page,"people.csv","json");
  expect(r.title).toBe("ta-da!");
  const captured=await page.evaluate(()=>window.posthog.captured);
  expect(captured).toContainEqual({name:"file_converted",props:{project:"squish",from:"csv",to:"json"}});
});

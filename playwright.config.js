// @ts-check
const {defineConfig}=require("@playwright/test");
module.exports=defineConfig({
  testDir:"tests/e2e",
  timeout:240000,
  expect:{timeout:30000},
  retries:0,
  reporter:"list",
  use:{baseURL:"http://localhost:8788",headless:true},
  webServer:{command:"node scripts/serve.cjs 8788",url:"http://localhost:8788/squish.html",reuseExistingServer:true,timeout:15000},
});

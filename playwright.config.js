import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',timeout:30000,use:{baseURL:'http://127.0.0.1:5183',channel:'chromium',viewport:{width:1440,height:1100}},webServer:{command:'npm run dev',url:'http://127.0.0.1:5183',reuseExistingServer:!process.env.CI},reporter:'list'});

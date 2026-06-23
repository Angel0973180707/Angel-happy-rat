import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'service-worker.js',
  'gas/Code.gs',
  'gas/quota.gs',
  'icons/icon-192.svg',
  'icons/icon-512.svg'
];
// mode IDs as used in app.js (lowercase, no camelCase)
const modes = ['roast', 'selfmock', 'bigdream', 'lost', 'strength', 'director', 'workshop', 'share'];
const events = [
  'APP_OPEN', 'MODE_SELECT', 'GENERATE', 'REGENERATE', 'COPY', 'SHARE',
  'ENTER_WORKSHOP', 'GENERATE_SONG', 'GENERATE_IMAGE', 'GENERATE_VIDEO',
  'JOIN_WAITLIST', 'PARTNER_CLICK'
];
const sheets = [
  '01_生成紀錄', '02_模式設定', '03_小天鼠詞庫', '04_唬爛虎詞庫', '05_迷航翻譯庫',
  '06_亮點庫', '07_自導自演劇本庫', '08_歌曲模板庫', '09_繪圖提示庫', '10_影片分鏡庫',
  '11_分享文案庫', '12_禁用詞', '13_近期使用紀錄', '14_合作夥伴設定', '15_合作導流紀錄',
  '16_流量事件', '17_每日統計',
  '21_會員資料', '22_贈送額度碼', '23_額度異動紀錄'
];
const gasFunctions = [
  // Code.gs
  'doGet', 'doPost', 'saveRecord', 'jsonOutput', 'sanitizeText', 'simpleGenerate',
  'generateRoastMode', 'generateSelfMockMode', 'generateBigDreamMode', 'generateLostMode',
  'generateStrengthMode', 'generateDirectorMode', 'generateCreativeWorkshop', 'generateShareCopy',
  'generateSong', 'generateImagePrompt', 'generateStoryboard',
  'trackPartnerClick', 'updateDailyStats',
  // quota.gs
  'getQuota', 'consumeQuota', 'redeemCode', 'handleQuotaAction', 'setupQuotaSheets'
];

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

requiredFiles.forEach((file) => check(fs.existsSync(path.join(root, file)), `Missing file: ${file}`));

const html = read('index.html');
const app  = read('app.js');
const worker = read('service-worker.js');
const gasCode  = read('gas/Code.gs');
const gasQuota = read('gas/quota.gs');
const gas = gasCode + '\n' + gasQuota;
const manifest = JSON.parse(read('manifest.json'));

new vm.Script(app,    { filename: 'app.js' });
new vm.Script(worker, { filename: 'service-worker.js' });
new vm.Script(gasCode,  { filename: 'gas/Code.gs' });
new vm.Script(gasQuota, { filename: 'gas/quota.gs' });

check(html.includes('name="viewport"'), 'Viewport meta is missing');
check(html.includes('rel="manifest"'), 'Manifest link is missing');
check(manifest.display === 'standalone', 'Manifest display must be standalone');
check(manifest.start_url, 'Manifest start_url is missing');
// accept image/jpeg (rat-safe.jpg) as well as image/png
check(
  manifest.icons.some((icon) => icon.sizes === '192x192' && (icon.type === 'image/jpeg' || icon.type === 'image/png')),
  '192px icon is missing from manifest'
);
check(
  manifest.icons.some((icon) => icon.sizes === '512x512' && (icon.type === 'image/jpeg' || icon.type === 'image/png')),
  '512px icon is missing from manifest'
);
check(worker.includes("caches.match('./index.html')"), 'Offline index fallback is missing');

// modes are JS-rendered: check app.js, not index.html
modes.forEach((mode) => check(
  app.includes(`'${mode}'`) || app.includes(`"${mode}"`),
  `Mode ID missing from app.js: ${mode}`
));
events.forEach((event) => check(app.includes(`'${event}'`), `Tracking event missing: ${event}`));
sheets.forEach((sheet) => check(gas.includes(`'${sheet}'`), `Sheet missing: ${sheet}`));
gasFunctions.forEach((name) => check(new RegExp(`function\\s+${name}\\s*\\(`).test(gas), `GAS function missing: ${name}`));

if (failures.length) {
  console.error(`Validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validation passed: ${requiredFiles.length} files, ${modes.length} modes, ${events.length} events, ${sheets.length} sheets, ${gasFunctions.length} GAS functions.`);

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function i18nClient() {
  const root = path.join(__dirname, '..');
  const context = vm.createContext({
    Intl, Map, Set, Object,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { readyState: 'loading', documentElement: { dataset: {} }, querySelectorAll: () => [] },
    CustomEvent: class {}, addEventListener() {}, dispatchEvent() {},
    soduWorkAPI: { setLocale() {}, onLocaleChange() {} },
  });
  vm.runInContext('window = globalThis;', context);
  for (const file of JSON.parse(fs.readFileSync(path.join(root, 'core', 'locales', 'manifest.json'), 'utf8'))) {
    vm.runInContext(fs.readFileSync(path.join(root, 'core', 'locales', file), 'utf8'), context, { filename: file });
  }
  vm.runInContext(fs.readFileSync(path.join(root, 'core', 'i18n.js'), 'utf8'), context);
  return context.SoduWorkI18n;
}

test('Runner lifecycle diagnostics translate in all supported locales', () => {
  const api = i18nClient();
  const source = [
    '本机 Runner 的设备登记未通过，请重新登录后重试。',
    '本机 Runner 已启动，但后台尚未确认上线，正在自动重连。',
    '本机 Runner 无法连接后台，请检查网络连接；恢复后会自动重连。',
    '升级后的设备身份与旧 Runner 登记不一致，正在恢复本机连接。',
    '本机 Runner 无法保存设备身份，请检查客户端数据目录的写入权限和磁盘空间。',
    '本机 Runner 身份恢复失败，请联系管理员检查设备登记。',
    '本机 Runner 尚未启动，请检查客户端的工作目录设置后重新打开客户端。',
    '本机 Runner 正在连接后台，连接成功后会自动显示可用 Agent。',
  ];
  for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
    api.setLocale(locale);
    for (const text of source) {
      const translated = api.translateText(text);
      if (locale === 'zh-CN') assert.equal(translated, text);
      else assert.notEqual(translated, text, `${locale}: ${text}`);
    }
  }
});

test('Cloud setup validation and code-account errors translate in all locales', () => {
  const api = i18nClient();
  const source = [
    '请填写此字段。',
    '请输入有效的地址。',
    '请输入有效的值。',
    '邮箱格式不对（git 会把它原样写进每一条提交里）',
    '例如 192.0.2.20 或 dev.example.com',
  ];
  for (const locale of ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']) {
    api.setLocale(locale);
    const translated = source.map(text => api.translateText(text));
    if (locale === 'zh-CN') assert.deepEqual(translated, source);
    else translated.forEach((text, i) => assert.notEqual(text, source[i], `${locale}: ${source[i]}`));
  }
});

test('settings renderers install locale-aware validation and error translation hooks', () => {
  const cloud = fs.readFileSync(path.join(__dirname, '../components/panels/cloud-environment-setup.js'), 'utf8');
  const pet = fs.readFileSync(path.join(__dirname, '../components/pet/pet-ui.js'), 'utf8');
  assert.match(cloud, /setCustomValidity/);
  assert.match(cloud, /请填写此字段。/);
  assert.match(pet, /SoduWorkI18n\?\.translateText/);
});

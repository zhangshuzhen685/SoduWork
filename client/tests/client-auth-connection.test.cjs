'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'components', 'client-auth', 'client-auth.js'),
  'utf8',
);
const emailSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'components', 'client-auth', 'email-auth.js'),
  'utf8',
);
const accountUiSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'components', 'client-auth', 'account-ui.js'),
  'utf8',
);
const localeDir = path.resolve(__dirname, '..', 'core', 'locales');

function runtime(config) {
  const document = {
    readyState: 'loading',
    documentElement: { classList: { add() {} } },
    addEventListener() {},
  };
  const window = {
    SoduWorkAPI: { hubConfig: () => config },
  };
  vm.runInNewContext(source, {
    window,
    document,
    setTimeout,
    clearTimeout,
    Intl,
  });
  return window.ClientAuth;
}

test('connection failures explain network recovery without offering an environment switch', () => {
  for (const environment of ['development', 'production']) {
    const auth = runtime({ environment, hub: 'http://127.0.0.1:9080' });
    const message = auth.connectionMessage({ error: 'TypeError: fetch failed' });
    assert.match(message, /SoduWork/);
    assert.match(message, /\u68c0\u67e5\u7f51\u7edc/);
    assert.doesNotMatch(message, /fetch failed|127\.0\.0\.1|\u672c\u673a\u670d\u52a1|\u66f4\u6539\u670d\u52a1/);
  }
});

test('connection messages normalize raw fetch failures before localization', () => {
  const auth = runtime({ environment: 'production', hub: 'https://hub.example.test' });
  const expected = '暂时无法连接 SoduWork 服务，请检查网络后重试。';
  for (const reason of ['fetch failed', { error: 'TypeError: fetch failed' }, { message: 'Failed to fetch' }]) {
    assert.equal(auth.connectionMessage(reason), expected);
  }
  assert.equal(auth.connectionMessage({ error: '账号或密码错误' }), '账号或密码错误');
});

test('account action errors turn network failures into a localizable message', () => {
  const window = {};
  vm.runInNewContext(accountUiSource, { window });
  const expected = '暂时无法连接 SoduWork 服务，请检查网络后重试。';
  for (const reason of ['fetch failed', { error: 'TypeError: fetch failed' }, { message: 'Failed to fetch' }]) {
    assert.equal(window.AccountUI.error(reason), expected);
  }
  assert.equal(window.AccountUI.error({ error: '账号或密码错误' }), '账号或密码错误');
});

test('normalized connection copy is translated in every supported non-Chinese locale', () => {
  const context = { globalThis: {}, console };
  for (const file of ['en-US.js', 'en-US-workspace.js', 'ja-JP.js', 'ja-JP-gap-pages.js', 'ko-KR.js', 'ko-KR-gap-pages.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(localeDir, file), 'utf8'), context, { filename: file });
  }
  const source = '暂时无法连接 SoduWork 服务，请检查网络后重试。';
  const catalogs = context.globalThis.SoduWorkLocaleMessages;
  assert.equal(catalogs['en-US'][source], 'Cannot connect to SoduWork. Check your network and try again.');
  assert.equal(catalogs['ja-JP'][source], 'SoduWork サービスに接続できません。ネットワークを確認して再試行してください。');
  assert.equal(catalogs['ko-KR'][source], 'SoduWork 서비스에 연결할 수 없습니다. 네트워크를 확인 후 다시 시도하세요.');
});

test('credential errors remain server-provided instead of being mislabeled as connectivity failures', () => {
  const auth = runtime({
    environment: 'production',
    hub: 'http://192.0.2.10:8989',
    productionHub: 'http://192.0.2.10:8989',
  });
  assert.equal(auth.connectionMessage({ error: '账号或密码错误' }), '账号或密码错误');
});

test('fixed-service recovery keeps retry; the address panel renders only when editable', () => {
  assert.match(source, /soduwork-auth-retry/);
  /* Retain the panel definition but render editable connection controls only when the main process permits them. */
  assert.match(source, /soduwork-auth-connection/);
  assert.match(source, /editable !== true|editable === true/);
  assert.doesNotMatch(source, /soduwork-auth-local|soduwork-auth-production/);
  assert.doesNotMatch(source, /function switchToLocal|function switchToProduction/);
});

test('both login surfaces keep the footer service address as plain connection text', () => {
  for (const surface of [source, emailSource]) {
    assert.match(surface, /<span class="soduwork-auth-hub">(?:连接|\\u8fde\\u63a5) <b><\/b><\/span>/);
    assert.doesNotMatch(surface, /soduwork-auth-service-entry|bindServiceEntry|当前客户端使用固定的 SoduWork 服务/);
  }
});

/* Preserve the remote runtime badge without turning it into a connection selector. */
test('login page distinguishes local-code runs from packaged installs', () => {
  assert.match(source, /soduwork-auth-form-badge/);
  assert.match(source, /本地代码启动/);
  assert.match(source, /runtimeForm\(\) === 'local-code'/);
  assert.match(source, /formBadge\.hidden = !isLocalCode/);
  assert.match(source, /function switchConnection/);
  assert.doesNotMatch(source, /DEFAULT_DEVELOPMENT_HUB/);
});

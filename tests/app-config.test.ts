import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveAppConfig } from '../src/config/app-config';

test('one selector switches brand, theme, assets and QR namespace', () => {
  for (const [variant, name, theme] of [
    ['cendekia', 'Cendekia Hub', 'classic'],
    ['myppi', 'myPPI', 'fresh'],
  ]) {
    const app = resolveAppConfig({ APP_VARIANT: variant });
    assert.equal(app.name, name);
    assert.equal(app.theme, theme);
    assert.equal(app.qrNamespace, variant);
    for (const asset of Object.values(app.assets)) {
      assert.ok(asset.startsWith(`/branding/${variant}/`));
      assert.ok(existsSync(join(process.cwd(), 'public', asset)));
    }
    assert.deepEqual(resolveAppConfig({ NEXT_PUBLIC_APP_VARIANT: variant }), app);
  }
});

test('defaults retain Cendekia and unknown variants/themes fail explicitly', () => {
  assert.equal(resolveAppConfig().id, 'cendekia');
  assert.equal(resolveAppConfig().brandName, 'Cendekia');
  assert.throws(() => resolveAppConfig({ APP_VARIANT: '../myppi' }), /APP_VARIANT/);
  assert.throws(() => resolveAppConfig({ APP_VARIANT: 'missing' }), /APP_VARIANT/);
  assert.throws(() => resolveAppConfig({ NEXT_PUBLIC_APP_THEME: 'missing' }), /APP_THEME/);
});

test('PPI number changes the name and QR namespace while retaining the brand assets', () => {
  for (const number of ['38', '31', '99']) {
    const app = resolveAppConfig({ APP_VARIANT: 'myppi', APP_PPI_NUMBER: number });
    assert.equal(app.name, `myPPI ${number}`);
    assert.equal(app.brandName, `myPPI ${number}`);
    assert.equal(app.ppiNumber, number);
    assert.equal(app.qrNamespace, `myppi-${number}`);
    assert.equal(app.assets.logo, '/branding/myppi/logo.png');
    assert.deepEqual(
      resolveAppConfig({ NEXT_PUBLIC_APP_VARIANT: 'myppi', NEXT_PUBLIC_APP_PPI_NUMBER: number }),
      app,
    );
  }
  assert.equal(
    resolveAppConfig({ APP_VARIANT: 'cendekia', APP_PPI_NUMBER: '38' }).name,
    'Cendekia Hub',
  );
  assert.equal(
    resolveAppConfig({ APP_VARIANT: 'myppi', APP_PPI_NUMBER: ' 038 ' }).name,
    'myPPI 38',
  );
  for (const number of ['0', '-1', '3.8', '38abc', '9007199254740992']) {
    assert.throws(
      () => resolveAppConfig({ APP_VARIANT: 'myppi', APP_PPI_NUMBER: number }),
      /APP_PPI_NUMBER/,
    );
  }
});

test('explicit optional overrides remain compatible with existing clones', () => {
  const app = resolveAppConfig({
    APP_VARIANT: 'myppi',
    NEXT_PUBLIC_APP_THEME: 'classic',
    NEXT_PUBLIC_APP_NAME: 'MyPPI Sekolah',
    NEXT_PUBLIC_APP_QR_NAMESPACE: 'issued-cards',
  });
  assert.equal(app.theme, 'classic');
  assert.equal(app.name, 'MyPPI Sekolah');
  assert.equal(app.qrNamespace, 'issued-cards');
  assert.equal(app.assets.logo, '/branding/myppi/logo.png');
});

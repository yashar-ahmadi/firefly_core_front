// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// deploy/ubuntu/firefly.sh, the commands that need no Docker: `init` (the shop's env file) and
// `nginx` (the config it renders from deploy/nginx.conf.example, the one maintained copy). The
// docker side (deploy, rollback) was proven against a real daemon and nginx; see
// docs/deploy-ubuntu.html. Every path the script writes is redirected into a temp dir.

const SCRIPT = 'deploy/ubuntu/firefly.sh'
let root: string
let env: NodeJS.ProcessEnv

function run(...args: string[]): string {
  return execFileSync('bash', [SCRIPT, ...args], { env, encoding: 'utf8', stdio: 'pipe' })
}

/** The script's stderr when it fails (it must fail). */
function failure(...args: string[]): string {
  try {
    run(...args)
  } catch (error) {
    return String((error as { stderr?: string }).stderr)
  }
  throw new Error(`firefly.sh ${args.join(' ')} succeeded`)
}

const envPath = (shop: string) => join(root, 'etc', `${shop}.env`)
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')
const uncommented = (text: string) => text.replace(/#.*$/gm, '')

/** A ready shop: init, then the values an operator fills in. */
function shop(name: string, values: Record<string, string> = {}) {
  run('init', name)
  const settings = {
    FIREFLY_API_URL: 'https://api.shop.test',
    FIREFLY_API_KEY: 'key',
    SITE_URL: 'https://shop.test',
    ...values,
  }
  let text = readFileSync(envPath(name), 'utf8')
  for (const [key, value] of Object.entries(settings)) {
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
  }
  writeFileSync(envPath(name), text)
}

function certificate(domain: string) {
  mkdirSync(join(root, 'live', domain), { recursive: true })
  writeFileSync(join(root, 'live', domain, 'fullchain.pem'), '')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'firefly-sh-'))
  env = {
    NODE_ENV: 'test',
    PATH: process.env.PATH,
    FIREFLY_CONFIG_DIR: join(root, 'etc'),
    FIREFLY_STATE_DIR: join(root, 'state'),
    NGINX_CONF_DIR: join(root, 'conf.d'),
    NGINX_UPSTREAM_DIR: join(root, 'upstream'),
    LETSENCRYPT_LIVE: join(root, 'live'),
    ACME_ROOT: join(root, 'acme'),
    NGINX_VERSION: '1.28.3',
    NGINX_BROTLI: 'on',
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('firefly.sh init', () => {
  it('writes the app’s variables and the deploy settings, readable by root only', () => {
    run('init', 'digital')
    const text = readFileSync(envPath('digital'), 'utf8')
    expect(text).toContain(readFileSync('.env.example', 'utf8'))
    expect(text).toMatch(/^DEPLOY_PORT_BLUE=3000$/m)
    expect(text).toMatch(/^DEPLOY_PORT_GREEN=3001$/m)
    expect(statSync(envPath('digital')).mode & 0o777).toBe(0o600)
  })

  it('gives every further shop its own pair of ports, and never overwrites a shop', () => {
    run('init', 'digital')
    run('init', 'carpet')
    expect(readFileSync(envPath('carpet'), 'utf8')).toMatch(/^DEPLOY_PORT_BLUE=3010$/m)
    expect(failure('init', 'digital')).toContain('already exists')
  })

  it('accepts only simple shop names', () => {
    expect(failure('init', 'Shop')).toContain('shop name')
    expect(failure('init', '../etc')).toContain('shop name')
  })
})

describe('firefly.sh deploy: settings checked before anything is built', () => {
  it.each([
    [{ FIREFLY_API_URL: 'http://localhost:8000' }, 'points to localhost'],
    [{ SITE_URL: 'http://shop.test' }, 'https://'],
    [{ SITE_URL: 'https://www.shop.test' }, 'bare domain'],
  ])('%o is refused', (values, message) => {
    shop('paint', values)
    expect(failure('deploy', 'paint')).toContain(message)
  })
})

describe('firefly.sh nginx', () => {
  it('before the certificate: the upstream and the port-80 block only, for the ACME challenge', () => {
    shop('digital')
    run('nginx', 'digital')
    const conf = uncommented(read('conf.d', 'firefly-digital.conf'))
    expect(conf.match(/\bserver \{/g)).toHaveLength(1)
    expect(conf).toMatch(/listen 80;/)
    expect(conf).not.toMatch(/listen 443/)
    expect(conf).toContain(`root ${join(root, 'acme')};`)
    expect(conf).toContain('server_name shop.test www.shop.test;')
    // The first deploy has not run yet: nginx still needs an upstream to include.
    expect(read('upstream', 'digital.upstream')).toMatch(/^server 127\.0\.0\.1:3000;$/m)
  })

  it('with the certificate: every block of the example, for this shop', () => {
    shop('digital')
    certificate('shop.test')
    run('nginx', 'digital')
    const conf = uncommented(read('conf.d', 'firefly-digital.conf'))
    expect(conf.match(/\bserver \{/g)).toHaveLength(3)
    expect(conf).toContain(`include ${join(root, 'upstream', 'digital.upstream')};`)
    expect(conf).toContain('proxy_pass http://firefly_digital;')
    expect(conf).toContain(`ssl_certificate     ${join(root, 'live')}/shop.test/fullchain.pem;`)
    expect(conf).toContain('access_log /var/log/nginx/digital.access.log firefly_masked;')
    expect(conf).toMatch(/add_header Vary \$ff_offline_vary;/)
    expect(conf).toMatch(/http2 on;/)
    expect(conf).toMatch(/brotli on;/)
    expect(conf).not.toMatch(/<shop|firefly_storefront|127\.0\.0\.1:3000/)
    // Upstream and servers only: the http-level part lives in its own file.
    expect(conf).not.toMatch(/\bmap \$|log_format/)
  })

  it('writes the http-level part once for every shop: the log masks and the offline Vary', () => {
    shop('digital')
    run('nginx', 'digital')
    const http = uncommented(read('conf.d', 'firefly-http.conf'))
    expect(http.match(/\bmap \$/g)).toHaveLength(4)
    expect(http).toMatch(/log_format firefly_masked/)
    expect(http).not.toMatch(/\bupstream\b|\bserver \{/)
  })

  it('a second shop gets its own upstream, domain and ports', () => {
    shop('digital')
    shop('carpet', { SITE_URL: 'https://carpet.test' })
    certificate('carpet.test')
    run('nginx', 'carpet')
    const conf = uncommented(read('conf.d', 'firefly-carpet.conf'))
    expect(conf).toContain('upstream firefly_carpet {')
    expect(conf).toContain('server_name carpet.test;')
    expect(read('upstream', 'carpet.upstream')).toMatch(/^server 127\.0\.0\.1:3010;$/m)
  })

  it('nginx before 1.25.1 (Ubuntu 24.04): `listen … http2` instead of `http2 on`', () => {
    env.NGINX_VERSION = '1.24.0'
    shop('digital')
    certificate('shop.test')
    run('nginx', 'digital')
    const conf = uncommented(read('conf.d', 'firefly-digital.conf'))
    expect(conf).not.toMatch(/http2 on;/)
    expect(conf.match(/listen 443 ssl http2;/g)).toHaveLength(2)
    expect(conf.match(/listen \[::\]:443 ssl http2;/g)).toHaveLength(2)
  })

  it('without the brotli module: no brotli directive is left (nginx -t would fail on one)', () => {
    env.NGINX_BROTLI = 'off'
    shop('digital')
    certificate('shop.test')
    run('nginx', 'digital')
    const conf = uncommented(read('conf.d', 'firefly-digital.conf'))
    expect(conf).not.toMatch(/brotli/)
    // gzip_types and its continuation lines survive intact.
    expect(conf).toMatch(/gzip_types[^;]*font\/ttf;/)
  })
})

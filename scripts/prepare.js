import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// Consumers installing this repo as a git dependency trigger `prepare`
// inside npm's temp clone — dev tooling (pnpm check, husky) must never
// break their install. npm's dep-prep installs with --no-save, and
// snapshot clones lack .git for husky to hook into anyway.
// file:-deps also trigger prepare in the real working tree — .git exists
// there, so additionally detect cross-project invocations via INIT_CWD
// (npm sets it to the installer's cwd, pnpm sets it similarly).
const invokedFromElsewhere =
  typeof process.env.INIT_CWD === 'string' &&
  process.env.INIT_CWD !== '' &&
  process.env.INIT_CWD !== process.cwd()

const isDependencyInstall =
  invokedFromElsewhere ||
  process.env.npm_config_save === 'false' ||
  !existsSync('.git')

if (!isDependencyInstall) {
  execSync('node scripts/check-env.js', { stdio: 'inherit' })
  execSync('husky install', { stdio: 'inherit' })
}

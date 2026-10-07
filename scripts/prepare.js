import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

// Consumers installing this repo as a git dependency trigger `prepare`
// inside npm's temp clone — dev tooling (pnpm check, husky) must never
// break their install. npm's dep-prep installs with --no-save, and
// snapshot clones lack .git for husky to hook into anyway.
const isDependencyInstall =
  process.env.npm_config_save === 'false' || !existsSync('.git')

if (!isDependencyInstall) {
  execSync('node scripts/check-env.js', { stdio: 'inherit' })
  execSync('husky install', { stdio: 'inherit' })
}

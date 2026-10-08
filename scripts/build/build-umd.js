import { writeFileSync, mkdirSync } from 'node:fs'
import build from './build.js'
import { isDev, env } from './config.js'
import { resolvePath } from '../utils.js'

const fileName = isDev ? 'super-chart.js' : 'super-chart.min.js'
const index = resolvePath('index.ts', resolvePath('src'))

build({
  index,
  replaceValues: { 'process.env.NODE_ENV': JSON.stringify(env) },
  fileName,
  format: 'umd',
  parentDir: 'umd',
  name: 'superChart'
}).then(() => {
  // Root package.json sets "type": "module" — mark the umd dir as
  // commonjs so require('super-chart') executes the CJS branch of the
  // UMD wrapper instead of loading it as ESM (empty namespace).
  const umdDir = resolvePath('umd', resolvePath('dist'))
  mkdirSync(umdDir, { recursive: true })
  writeFileSync(resolvePath('package.json', umdDir), '{\n  "type": "commonjs"\n}\n')
})

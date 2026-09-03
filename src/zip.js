import gulp from 'gulp'
import zip from 'gulp-zip'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const browser = process.env.BROWSER ?? 'chrome'
const manifest = require(`../build/${browser}/manifest.json`)
const name = browser[0].toUpperCase() + browser.slice(1)

gulp
  .src(`build/${browser}/**`)
  .pipe(zip(`${manifest.name.replaceAll(' ', '-')}-${name}-${manifest.version}.zip`))
  .pipe(gulp.dest('package/'))

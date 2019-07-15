// @flow weak
'use strict'
const path = require('path')
const glob = require('glob')
const pify = require('pify')
const merge = require('lodash.merge')
const mergeWith = require('lodash.mergewith')
const { resolvePlugin, resolvePreset, transformFile } = require('@babel/core')
const readBabelrcUp = require('read-babelrc-up')

const localeMap = arr =>
  arr.reduce((obj, x) => {
    obj[x] = {}
    return obj
  }, {})

const concatArray = (obj, src) => {
  if (Array.isArray(obj)) {
    return obj.concat(src)
  }
  return undefined
}

const createResolveList = fn => (list, cwd) =>
  list.map(x => (typeof x === 'string' ? fn(x, cwd) : x))

const resolvePresets = createResolveList(resolvePreset)
const resolvePlugins = createResolveList(resolvePlugin)

const getBabelrc = cwd => {
  try {
    const babelrc = readBabelrcUp.sync({ cwd }).babel
    if (!babelrc.env) {
      return babelrc
    }

    const env = process.env.BABEL_ENV || process.env.NODE_ENV || 'development'

    return mergeWith(babelrc, babelrc.env[env], concatArray)
  } catch (error) {
    return { presets: [], plugins: [] }
  }
}

const getBabelrcDir = cwd => path.dirname(readBabelrcUp.sync({ cwd }).path)

module.exports = async (locales, pattern, opts) => {
  if (!Array.isArray(locales)) {
    throw new TypeError(`Expected a Array, got ${typeof locales}`)
  }

  if (typeof pattern !== 'string') {
    throw new TypeError(`Expected a string, got ${typeof pattern}`)
  }

  opts = {
    cwd: process.cwd(),
    defaultLocale: 'en',
    ...opts
  }

  const babelrc = getBabelrc(opts.cwd) || {}
  const babelrcDir = getBabelrcDir(opts.cwd)

  const { moduleSourceName, extractFromFormatMessageCall } = opts
  const pluginOptions = moduleSourceName ? { moduleSourceName } : {}
  const { presets = [], plugins = [] } = babelrc

  // eslint-disable-next-line global-require
  presets.unshift({
    plugins: [
      [
        require('babel-plugin-react-intl').default,
        { ...pluginOptions, extractFromFormatMessageCall }
      ]
    ]
  })

  const extractFromFile = async file => {
    const { metadata: result } = await pify(transformFile)(file, {
      presets: resolvePresets(presets, babelrcDir),
      plugins: resolvePlugins(plugins, babelrcDir)
    })
    const localeObj = localeMap(locales)
    for (const { id, defaultMessage } of result['react-intl'].messages) {
      for (const locale of locales) {
        localeObj[locale][id] =
          opts.defaultLocale === locale ? defaultMessage : ''
      }
    }
    return localeObj
  }

  const files = await pify(glob)(pattern)
  if (files.length === 0) {
    throw new Error(`File not found (${pattern})`)
  }
  const arr = await Promise.all(files.map(extractFromFile))
  return arr.reduce((h, obj) => merge(h, obj), localeMap(locales))
}

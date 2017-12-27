// @flow weak
'use strict'
const glob = require('glob')
const pify = require('pify')
const merge = require('lodash.merge')
const mergeWith = require('lodash.mergewith')
const { transformFile } = require('babel-core')
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

const getBabelOptions = cwd => {
  try {
    const { path, babel: babelrcOptions } = readBabelrcUp.sync({ cwd })

    // Provide config extending another absolute path config to prevent path
    // resolution errors. Plugins and errors may contain relative paths,
    // but they are resolved against transformed files.
    const babelOptions = {
      extends: path
    }

    if (!babelrcOptions.env) {
      return babelOptions
    }

    const env = process.env.BABEL_ENV || process.env.NODE_ENV || 'development'

    return mergeWith(babelOptions, babelrcOptions.env[env], concatArray)
  } catch (err) {
    return { presets: [], plugins: [] }
  }
}

module.exports = (locales, pattern, opts) => {
  if (!Array.isArray(locales)) {
    Promise.reject(new TypeError(`Expected a Array, got ${typeof locales}`))
  }

  if (typeof pattern !== 'string') {
    Promise.reject(new TypeError(`Expected a string, got ${typeof pattern}`))
  }

  opts = Object.assign(
    {
      cwd: process.cwd(),
      defaultLocale: 'en'
    },
    opts
  )

  const babelOptions = getBabelOptions(opts.cwd) || {}

  babelOptions.plugins = (babelOptions.plugins || []).concat(
    // eslint-disable-next-line global-require
    require('babel-plugin-react-intl').default
  )

  const extractFromFile = file => {
    return pify(transformFile)(file, babelOptions).then(
      ({ metadata: result }) => {
        const localeObj = localeMap(locales)
        for (const { id, defaultMessage } of result['react-intl'].messages) {
          for (const locale of locales) {
            localeObj[locale][id] =
              opts.defaultLocale === locale ? defaultMessage : ''
          }
        }
        return localeObj
      }
    )
  }

  return pify(glob)(pattern)
    .then(files => {
      if (files.length === 0) {
        return Promise.reject(new Error(`File not found (${pattern})`))
      }
      return Promise.all(files.map(extractFromFile))
    })
    .then(arr => arr.reduce((h, obj) => merge(h, obj), localeMap(locales)))
}

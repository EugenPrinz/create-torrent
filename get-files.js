import corePath from 'path'
import fs from 'fs'
import { isNotJunk } from 'junk'
import once from 'once'
import parallel from 'run-parallel'

function notHidden (file) {
  return file[0] !== '.'
}

function traversePath (path, options, fn, cb) {
  if(!Array.isArray(options.files)) {
    options.files = []
  }

  if(typeof options.reverse !== 'boolean') {
    options.reverse = false
  }

  fs.stat(path, (err, stats) => {
    if (err) return cb(err)
    if (stats.isDirectory()) {
      fs.readdir(path, (err, entries) => {
        if (err) return cb(err)

        const filter = entries.filter(notHidden).filter(isNotJunk)

        parallel(filter.map(entry => cb => {
          traversePath(corePath.join(path, entry), options, fn, cb)
        }), cb)
      })
    } else if (stats.isFile()) {
      const result = shouldInclude(path, options)

      if(result) {
        cb(null, [])
      } else {
        fn(path, cb)
      }
    }
    // Ignore other types (not a file or directory)
  })
}

/**
 * Checks if the given file path should be included based on options.
 * @param {string} path - The file path to check.
 * @param {Object} options - Filtering options (files, reverse).
 * @returns {boolean} - Returns true if the path should be included.
 */
function shouldInclude(path, options) {
  const { files, reverse } = options
  const match = filter(path, files)
  return reverse ? !match : match
}

function filter(path, files) {
  for(const target of files) {
    if(target.startsWith('*') && path.endsWith(corePath.extname(target))) {
      return true
    }

    if(corePath.basename(path) === target || path === target ||
        path.split(corePath.sep).includes(target) || path.startsWith(corePath.normalize(target))) {
      return true
    }

    if(target.includes('*')) {
      const [dir, ext] = target.split('*')
      return (path.split(corePath.sep).includes(dir) || dir.split(corePath.sep).every((element) => path.includes(element))) && path.endsWith(ext)
    }
  }

  return false
}

/**
 * Convert a file path to a lazy readable stream.
 * @param  {string} path
 * @return {function}
 */
function getFilePathStream (path) {
  return () => fs.createReadStream(path)
}

/**
 * Get all files in the given path.
 * @param path {string}
 * @param options {Object}
 *  - keepRoot: {boolean} (default: false)
 *  - files: {string[]} (default: [])
 *  - reverse: {boolean} Enable reverse matching (default: 'false')
 *  - rootFolder: {string} (default: '')
 * @param cb {Function} (err, files)
 * @description
 *  - keepRoot: whether or not to keep the root directory in the resulting files
 *  - files: You can specify the full path to the file, the file extension, or its name.
 *  - reverse: Enables reverse matching
 *  - rootFolder: The root folder to start from
 */

export default function getFiles (path, options, cb) {

  if(typeof options !== 'object' || Object.entries(options).length === 0) options = { keepRoot: false, rootFolder: '' }

  traversePath(path, options, getFileInfo, (err, files) => {
    if (err) return cb(err)

    if (Array.isArray(files)) files = files.flat(Infinity)
    else files = [files]

    path = corePath.normalize(path)

    if (options.keepRoot) {
      if(!options.rootFolder) {
        path = path.slice(0, path.lastIndexOf(corePath.sep) + 1)
      } else {
        path = path.slice(0, path.indexOf(options.rootFolder))
      }
    }

    if (path.substring(path.length - 1) !== corePath.sep) path += corePath.sep

    files.forEach(file => {
      file.getStream = getFilePathStream(file.path)
      file.path = file.path.replace(path, '').split(corePath.sep)
    })

    console.log('final result', files)

    cb(null, files)
  })
}

function getFileInfo (path, cb) {
  cb = once(cb)
  fs.stat(path, (err, stat) => {
    if (err) return cb(err)
    const info = {
      length: stat.size,
      path
    }
    cb(null, info)
  })
}

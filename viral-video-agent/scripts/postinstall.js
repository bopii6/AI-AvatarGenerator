const fs = require('fs')
const path = require('path')

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function writeFileIfMissing(filePath, contents) {
  if (fs.existsSync(filePath)) return
  fs.writeFileSync(filePath, contents, 'utf8')
}

function ensureAssertPlus() {
  const modDir = path.join(__dirname, '..', 'node_modules', 'assert-plus')
  ensureDir(modDir)

  writeFileIfMissing(
    path.join(modDir, 'package.json'),
    JSON.stringify(
      {
        name: 'assert-plus',
        version: '1.0.0',
        main: 'index.js',
        private: true,
      },
      null,
      2
    )
  )

  writeFileIfMissing(
    path.join(modDir, 'index.js'),
    `
'use strict';

const assert = require('assert');

function fail(msg) {
  const err = new assert.AssertionError({ message: msg });
  throw err;
}

function isType(v, t) { return typeof v === t; }

function ok(value, msg) { assert.ok(value, msg); }

function object(value, name) {
  if (value === null || typeof value !== 'object') fail((name || 'value') + ' must be an object');
}

function string(value, name) {
  if (!isType(value, 'string')) fail((name || 'value') + ' must be a string');
}

function func(value, name) {
  if (!isType(value, 'function')) fail((name || 'value') + ' must be a function');
}

function number(value, name) {
  if (!isType(value, 'number') || Number.isNaN(value)) fail((name || 'value') + ' must be a number');
}

function bool(value, name) {
  if (!isType(value, 'boolean')) fail((name || 'value') + ' must be a boolean');
}

function optional(check) {
  return function (value, name) {
    if (value === undefined || value === null) return;
    return check(value, name);
  };
}

module.exports = {
  ok,
  object,
  string,
  func,
  number,
  bool,
  optionalObject: optional(object),
  optionalString: optional(string),
  optionalFunc: optional(func),
  optionalNumber: optional(number),
  optionalBool: optional(bool),
};
`.trimStart()
  )
}

try {
  ensureAssertPlus()
  // eslint-disable-next-line no-console
  console.log('[postinstall] ensured assert-plus shim')
} catch (e) {
  console.warn('[postinstall] failed to ensure assert-plus shim:', e && e.message ? e.message : e)
}


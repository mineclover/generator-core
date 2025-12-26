/**
 * ESM wrapper for generator-core
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Load CommonJS modules
const generator = require('../lib/generator.js')
const logging = require('../lib/logging.js')

// Re-export generator
export const Generator = generator.Generator
export const createGenerator = generator.createGenerator
export const logStream = generator.logStream

// Re-export logging
export const LOG_LEVEL_NONE = logging.LOG_LEVEL_NONE
export const LOG_LEVEL_ERROR = logging.LOG_LEVEL_ERROR
export const LOG_LEVEL_WARNING = logging.LOG_LEVEL_WARNING
export const LOG_LEVEL_INFO = logging.LOG_LEVEL_INFO
export const LOG_LEVEL_DEBUG = logging.LOG_LEVEL_DEBUG
export const LoggerManager = logging.LoggerManager
export const createLoggerManager = logging.createLoggerManager
export const levelToString = logging.levelToString
export const dateToMilliTimeString = logging.dateToMilliTimeString
export const StreamFormatter = logging.StreamFormatter
export const createStreamFormatter = logging.createStreamFormatter

// Default export for convenience
export default {
  // Generator
  Generator,
  createGenerator,
  logStream,
  // Logging
  LOG_LEVEL_NONE,
  LOG_LEVEL_ERROR,
  LOG_LEVEL_WARNING,
  LOG_LEVEL_INFO,
  LOG_LEVEL_DEBUG,
  LoggerManager,
  createLoggerManager,
  levelToString,
  dateToMilliTimeString,
  StreamFormatter,
  createStreamFormatter,
}

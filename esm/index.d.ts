/**
 * Type declarations for generator-core ESM exports
 */

import type { EventEmitter } from 'node:events'

export interface Pixmap {
  width: number
  height: number
  pixels: Buffer
}

export interface Generator extends EventEmitter {
  start(options: { hostname: string; port: number; password: string }): Promise<void>
  shutdown?(): void
  getDocumentInfo(docId?: number, options?: Record<string, unknown>): Promise<unknown>
  getOpenDocumentIDs(): Promise<number[]>
  getPixmap(docId: number, layerId: number, options: Record<string, unknown>): Promise<Pixmap>
  streamPixmap(pixmap: Pixmap, stream: NodeJS.WritableStream, options?: Record<string, unknown>): Promise<void>
  evaluateJSXString(jsx: string): Promise<string>
  subscribeToPhotoshopEvents(events: string[]): void
  onPhotoshopEvent(event: string, handler: (event: unknown) => void): void
  INTERPOLATION_BICUBIC: number
}

// Logging constants
export const LOG_LEVEL_NONE: number
export const LOG_LEVEL_ERROR: number
export const LOG_LEVEL_WARNING: number
export const LOG_LEVEL_INFO: number
export const LOG_LEVEL_DEBUG: number

// Logging classes and functions
export const LoggerManager: new (level: number) => unknown
export function createLoggerManager(level: number): unknown
export function levelToString(level: number): string
export function dateToMilliTimeString(date: Date): string
export const StreamFormatter: unknown
export function createStreamFormatter(loggerManager: unknown, options?: unknown): unknown

// Generator
export function createGenerator(loggerManager: unknown): Generator
export const Generator: new () => Generator
export const logStream: unknown

// Default export
declare const _default: {
  // Generator
  Generator: typeof Generator
  createGenerator: typeof createGenerator
  logStream: unknown
  // Logging
  LOG_LEVEL_NONE: number
  LOG_LEVEL_ERROR: number
  LOG_LEVEL_WARNING: number
  LOG_LEVEL_INFO: number
  LOG_LEVEL_DEBUG: number
  LoggerManager: typeof LoggerManager
  createLoggerManager: typeof createLoggerManager
  levelToString: typeof levelToString
  dateToMilliTimeString: typeof dateToMilliTimeString
  StreamFormatter: unknown
  createStreamFormatter: typeof createStreamFormatter
}
export default _default

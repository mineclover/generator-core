/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

;(() => {
  // Dependencies
  // ------------

  var util = require('node:util'),
    EventEmitter = require('node:events').EventEmitter,
    net = require('node:net'),
    Q = require('q'),
    psCrypto = require('./ps_crypto')

  // Constants
  // ---------

  // Connection constants
  var DEFAULT_PASSWORD = 'password',
    DEFAULT_PORT = 49494,
    DEFAULT_HOSTNAME = '127.0.0.1',
    SOCKET_KEEPALIVE_DELAY = 1000 //milliseconds

  var CONNECTION_STATES = {
    NONE: 0,
    CONNECTING: 1,
    OPEN: 2,
    CLOSING: 3,
    CLOSED: 4,
    DESTROYED: 5,
  }

  // Protocol constants
  var MESSAGE_LENGTH_OFFSET = 0,
    MESSAGE_STATUS_OFFSET = 4,
    MESSAGE_STATUS_LENGTH = 4,
    MESSAGE_PAYLOAD_OFFSET = MESSAGE_STATUS_OFFSET + MESSAGE_STATUS_LENGTH,
    PAYLOAD_HEADER_LENGTH = 12,
    PAYLOAD_PROTOCOL_OFFSET = 0,
    PAYLOAD_ID_OFFSET = 4,
    PAYLOAD_TYPE_OFFSET = 8,
    MAX_MESSAGE_ID = 256 * 256 * 256,
    PROTOCOL_VERSION = 1,
    MESSAGE_TYPE_ERROR = 1,
    MESSAGE_TYPE_JAVASCRIPT = 2, // ExtendScript that requires refreshed scripting engine
    MESSAGE_TYPE_JAVASCRIPT_S = 10, // ExtendScript that can reuse same scripting engine
    MESSAGE_TYPE_PIXMAP = 3,
    MESSAGE_TYPE_ICC_PROFILE = 4,
    MESSAGE_TYPE_KEEPALIVE = 6,
    STATUS_NO_COMM_ERROR = 0

  // 64 kB (maximum size of the TCP packages on the Mac)
  var INITIAL_MESSAGE_BUFFER_SIZE = 65536,
    // Known strings to be sent as messages, that should not be parsed as JSON
    KNOWN_LITERAL_STRING_MESSAGES = ['', '[ActionDescriptor]', 'Yep, still alive']

  // Helper Functions
  // ----------------

  function ensureBufferSize(buffer, minimumSize, contentSize) {
    if (buffer.length >= minimumSize) {
      return buffer
    }
    var newBuffer = new Buffer(minimumSize)
    if (contentSize) {
      buffer.copy(newBuffer, 0, 0, contentSize)
    } else {
      buffer.copy(newBuffer)
    }
    return newBuffer
  }

  function round(value, decimals) {
    var factor = 10 ** decimals
    return Math.round(factor * value) / factor
  }

  /**
   * PhotoshopClient Class
   *
   * @constructor
   */
  function PhotoshopClient(options, connectListener, logger) {
    if (!(this instanceof PhotoshopClient)) {
      return new PhotoshopClient(options, connectListener, logger)
    } else {
      var password = DEFAULT_PASSWORD

      if (Object.hasOwn(options, 'password')) {
        password = options.password
      }
      if (Object.hasOwn(options, 'port')) {
        this._port = options.port
      }
      if (Object.hasOwn(options, 'hostname')) {
        this._hostname = options.hostname
      }
      if (Object.hasOwn(options, 'inputFd')) {
        this._inputFd = options.inputFd
      }
      if (Object.hasOwn(options, 'outputFd')) {
        this._outputFd = options.outputFd
      }

      this._logger = logger
      this._receiveBuffer = new Buffer(INITIAL_MESSAGE_BUFFER_SIZE)
      this._receivedBytes = 0
      this._writeQueue = []

      if (connectListener) {
        this.once('connect', connectListener)
      }

      var connectionPromise = null
      var cryptoPromise = null

      if (
        (typeof this._inputFd === 'number' && typeof this._outputFd === 'number') ||
        (typeof this._inputFd === 'string' && typeof this._outputFd === 'string')
      ) {
        connectionPromise = this._connectPipe()
        var cryptoDeferred = Q.defer()
        cryptoDeferred.resolve()
        cryptoPromise = cryptoDeferred.promise
      } else if (this._hostname && typeof this._port === 'number') {
        connectionPromise = this._connectSocket()
        cryptoPromise = this._initCrypto(password)
      } else {
        var connectionDeferred = Q.defer()
        connectionDeferred.reject()
        connectionPromise = connectionDeferred.promise
      }

      Q.all([connectionPromise, cryptoPromise]).done(
        () => {
          this.emit('connect')
        },
        (err) => {
          this.emit('error', err)
          this.disconnect()
        },
      )
    }
  }
  util.inherits(PhotoshopClient, EventEmitter)

  // Member Variables
  // ----------------

  PhotoshopClient.prototype._port = DEFAULT_PORT
  PhotoshopClient.prototype._hostname = DEFAULT_HOSTNAME
  PhotoshopClient.prototype._connectionState = CONNECTION_STATES.NONE
  PhotoshopClient.prototype._lastMessageID = 0
  PhotoshopClient.prototype._crypto = null
  PhotoshopClient.prototype._receiveBuffer = null
  PhotoshopClient.prototype._receivedBytes = 0
  PhotoshopClient.prototype._writeQueue = null
  PhotoshopClient.prototype._commandDeferreds = null

  // Methods
  // -------

  PhotoshopClient.prototype._initCrypto = function (password) {
    var cryptoDeferred = Q.defer()
    psCrypto.createPSCrypto(password, (err, crypto) => {
      if (err) {
        cryptoDeferred.reject(err)
      } else {
        this._crypto = crypto
        cryptoDeferred.resolve()
      }
    })
    return cryptoDeferred.promise
  }

  PhotoshopClient.prototype._connectPipe = function () {
    var fs = require('node:fs')
    var result = false

    try {
      this._connectionState = CONNECTION_STATES.CONNECTING

      if (typeof this._inputFd === 'number') {
        this._readStream = fs.createReadStream(null, { fd: this._inputFd })
      } else {
        // named pipe
        this.emit('info', `using named read pipe ${this._inputFd}`)
        this._readStream = fs.createReadStream(this._inputFd)
      }

      this._readStream.on('data', (incomingBuffer) => {
        var isNewMessage = this._receivedBytes === 0,
          minimumSize = incomingBuffer.length + this._receivedBytes

        this._receiveBuffer = ensureBufferSize(this._receiveBuffer, minimumSize)
        incomingBuffer.copy(this._receiveBuffer, this._receivedBytes)
        this._receivedBytes += incomingBuffer.length

        this._processReceiveBuffer(isNewMessage)
      })

      this._readStream.on('error', (err) => {
        this.emit('error', `Pipe read error: ${err}`)
        this.disconnect()
      })

      this._readStream.on('close', () => {
        this._connectionState = CONNECTION_STATES.CLOSED
        this.emit('close')
      })

      this._readStream.resume()

      if (typeof this._outputFd === 'number') {
        this._writeStream = fs.createWriteStream(null, { fd: this._outputFd })
      } else {
        // named pipe
        this.emit('info', `using named write pipe ${this._outputFd}`)
        this._writeStream = fs.createWriteStream(this._outputFd)
      }

      this._writeStream.on('error', (err) => {
        this.emit('error', `Pipe write error: ${err}`)
        this.disconnect()
      })

      this._writeStream.on('close', () => {
        this._connectionState = CONNECTION_STATES.CLOSED
        this.emit('close')
      })

      this._writeStream.on('drain', () => {
        this._doPendingWrites()
      })

      result = true
    } catch (e) {
      this.emit('error', `Connect Pipe error: ${e}`)
      this.disconnect()
    }

    return result
  }

  PhotoshopClient.prototype._connectSocket = function () {
    var connectSocketDeferred = Q.defer()

    this._socket = new net.Socket()
    this._connectionState = CONNECTION_STATES.CONNECTING

    this._socket.connect(this._port, this._hostname)

    // register event handlers for socket

    this._socket.on('connect', () => {
      this._socket.setKeepAlive(true, SOCKET_KEEPALIVE_DELAY)
      this._socket.setNoDelay()
      connectSocketDeferred.resolve(this)
      this._writeStream = this._socket
    })

    this._socket.on('error', (err) => {
      if (connectSocketDeferred.promise.isPending()) {
        connectSocketDeferred.reject(err)
      }
      this.emit('error', `Socket error: ${err}`)
      this.disconnect()
    })

    this._socket.on('close', () => {
      this._connectionState = CONNECTION_STATES.CLOSED
      this.emit('close')
    })

    this._socket.on('data', (incomingBuffer) => {
      var isNewMessage = this._receivedBytes === 0,
        minimumSize = incomingBuffer.length + this._receivedBytes

      this._receiveBuffer = ensureBufferSize(this._receiveBuffer, minimumSize)
      incomingBuffer.copy(this._receiveBuffer, this._receivedBytes)
      this._receivedBytes += incomingBuffer.length

      this._processReceiveBuffer(isNewMessage)
    })

    this._socket.on('drain', () => {
      this._doPendingWrites()
    })

    return connectSocketDeferred.promise
  }

  PhotoshopClient.prototype._writeWhenFree = function (buffer) {
    this._writeQueue.push(buffer)
    process.nextTick(() => {
      this._doPendingWrites()
    })
  }

  PhotoshopClient.prototype._doPendingWrites = function () {
    if (this._writeStream && this._writeQueue.length > 0 && !this._writeStream.busy) {
      var bufferToWrite = this._writeQueue.shift()
      var writeStatus = this._writeStream.write(bufferToWrite)
      if (writeStatus && this._writeQueue.length > 0) {
        this._doPendingWrites()
      }
    }
    // Continue to try writing as long as there is something left to write
    if (this._writeStream && this._writeQueue.length > 0) {
      process.nextTick(this._doPendingWrites.bind(this))
    }
  }

  PhotoshopClient.prototype.isConnected = function () {
    return this._connectionState === CONNECTION_STATES.OPEN
  }

  PhotoshopClient.prototype.disconnect = function (listener) {
    // NOTE: This method *must* do any actual cleanup of os resources
    // (e.g. sockets, pipes) synchronously. Listeners may be called asynchronously
    // after those resources actually close. In cases where disconnect is called
    // at process.exit, listeners may not get called.
    if (!listener) {
      listener = () => {}
    }

    if (this._socket) {
      var currentState = this._connectionState
      switch (currentState) {
        case CONNECTION_STATES.NONE:
          this._connectionState = CONNECTION_STATES.CLOSED
          process.nextTick(listener)
          return true
        case CONNECTION_STATES.CONNECTING:
          this._connectionState = CONNECTION_STATES.CLOSING
          this._socket.once('close', listener)
          this._socket.end()
          return true
        case CONNECTION_STATES.OPEN:
          this._connectionState = CONNECTION_STATES.CLOSING
          this._socket.once('close', listener)
          this._socket.end()
          return true
        case CONNECTION_STATES.CLOSING:
          this._socket.once('close', listener)
          return true
        case CONNECTION_STATES.CLOSED:
          process.nextTick(listener)
          return true
        case CONNECTION_STATES.DESTROYED:
          process.nextTick(listener)
          return true
      }
    } else {
      if (this._readStream) {
        try {
          this._readStream.close()
        } catch (_readCloseError) {
          // do nothing
        }
        this._readStream = null
      }

      if (this._writeStream) {
        try {
          this._writeStream.close()
        } catch (_writeCloseError) {
          // do nothing
        }
        this._writeStream = null
      }

      this._connectionState = CONNECTION_STATES.CLOSED
      process.nextTick(listener)
      return true
    }
  }

  PhotoshopClient.prototype.destroy = function () {
    this._connectionState = CONNECTION_STATES.DESTROYED
    if (this._socket) {
      this._socket.destroy()
    }
  }

  PhotoshopClient.prototype._sendMessage = function (payloadBuffer) {
    var cipheredPayloadBuffer = this._crypto ? this._crypto.cipher(payloadBuffer) : payloadBuffer
    var headerBuffer = new Buffer(MESSAGE_PAYLOAD_OFFSET)

    // message length includes status and payload, but not the UInt32 specifying message length
    var messageLength = cipheredPayloadBuffer.length + MESSAGE_STATUS_LENGTH
    headerBuffer.writeUInt32BE(messageLength, MESSAGE_LENGTH_OFFSET)
    headerBuffer.writeInt32BE(STATUS_NO_COMM_ERROR, MESSAGE_STATUS_OFFSET)

    this._writeWhenFree(headerBuffer)
    this._writeWhenFree(cipheredPayloadBuffer)
  }

  PhotoshopClient.prototype.sendKeepAlive = function () {
    var id = (this._lastMessageID = (this._lastMessageID + 1) % MAX_MESSAGE_ID),
      payloadBuffer = new Buffer(PAYLOAD_HEADER_LENGTH)

    payloadBuffer.writeUInt32BE(PROTOCOL_VERSION, PAYLOAD_PROTOCOL_OFFSET)
    payloadBuffer.writeUInt32BE(id, PAYLOAD_ID_OFFSET)
    payloadBuffer.writeUInt32BE(MESSAGE_TYPE_KEEPALIVE, PAYLOAD_TYPE_OFFSET)

    this._sendMessage(payloadBuffer)

    return id
  }

  /**
   * Send a JSX command to photoshop.
   * Use a special message type in the message header
   * if this script is designated safe for use with a scripting engine
   *
   * @param {string} javascript
   * @param {boolean=} sharedEngineSafe
   * @return {number} command ID
   */
  PhotoshopClient.prototype.sendCommand = function (javascript, sharedEngineSafe) {
    var id = (this._lastMessageID = (this._lastMessageID + 1) % MAX_MESSAGE_ID),
      codeBuffer = new Buffer(javascript, 'utf8'),
      payloadBuffer = new Buffer(codeBuffer.length + PAYLOAD_HEADER_LENGTH),
      messageType = sharedEngineSafe ? MESSAGE_TYPE_JAVASCRIPT_S : MESSAGE_TYPE_JAVASCRIPT

    this._logger.debug(`sendCommand ${id}with type ${messageType}: ${javascript.substr(0, 50)}`)

    payloadBuffer.writeUInt32BE(PROTOCOL_VERSION, PAYLOAD_PROTOCOL_OFFSET)
    payloadBuffer.writeUInt32BE(id, PAYLOAD_ID_OFFSET)
    payloadBuffer.writeUInt32BE(messageType, PAYLOAD_TYPE_OFFSET)
    codeBuffer.copy(payloadBuffer, PAYLOAD_HEADER_LENGTH)

    this._sendMessage(payloadBuffer)

    return id
  }

  PhotoshopClient.prototype._processReceiveBuffer = function (isNewMessage) {
    // Log when the message started to come in so we can analyze the performance
    if (isNewMessage && this._receivedBytes > 0) {
      this.messageStartTime = Date.now()
    }

    // The header hasn't arrived yet: stop here
    if (this._receivedBytes < MESSAGE_PAYLOAD_OFFSET) {
      return
    }

    // Evaluate communication status
    var commStatus = this._receiveBuffer.readInt32BE(MESSAGE_STATUS_OFFSET)
    if (commStatus !== STATUS_NO_COMM_ERROR) {
      this._logger.error(`Communication error: ${commStatus}`)
      this.emit('communicationsError', `Photoshop communication error: ${commStatus}`)
      this.disconnect()
      return
    }

    // Message length includes status and payload, but not the UInt32 specifying message length
    var messageLength = this._receiveBuffer.readUInt32BE(MESSAGE_LENGTH_OFFSET),
      totalLength = messageLength + MESSAGE_STATUS_OFFSET

    // Make sure the buffer is large enough to contain the whole message
    this._receiveBuffer = ensureBufferSize(this._receiveBuffer, totalLength, this._receivedBytes)

    // Unless the entire message has already been received, stop here
    if (this._receivedBytes < totalLength) {
      return
    }

    // Performance evaluation
    var duration = Date.now() - this.messageStartTime
    if (duration > 10) {
      var size = this._receivedBytes / 1024,
        speed = size / (duration / 1000)
      this._logger.info(`${duration}ms to receive ${round(size, 1)} kB (${round(speed, 1)} kB/s)`)
    }

    // Extract the message
    var cipheredBody = this._receiveBuffer.slice(MESSAGE_PAYLOAD_OFFSET, totalLength),
      remainingBytes = this._receivedBytes - totalLength,
      preferredBufferSize = Math.max(INITIAL_MESSAGE_BUFFER_SIZE, remainingBytes)

    // Prepare the buffer for the next message
    var oldBuffer = this._receiveBuffer
    this._receiveBuffer = new Buffer(preferredBufferSize)
    if (remainingBytes > 0) {
      oldBuffer.copy(this._receiveBuffer, 0, totalLength, this._receivedBytes)
    }
    this._receivedBytes = remainingBytes

    // Decrypt the message
    var startTime = Date.now(),
      bodyBuffer = this._crypto ? this._crypto.decipher(cipheredBody) : cipheredBody
    duration = Date.now() - startTime
    if (duration > 10) {
      this._logger.info(`${duration}ms to decrypt buffer`)
    }

    // Process message
    this._processMessage(bodyBuffer)

    // Receive buffer might have more than one message, so process again
    this._processReceiveBuffer(true)
  }

  PhotoshopClient.prototype._processMessage = function (bodyBuffer) {
    var protocolVersion = bodyBuffer.readUInt32BE(PAYLOAD_PROTOCOL_OFFSET),
      messageID = bodyBuffer.readUInt32BE(PAYLOAD_ID_OFFSET),
      messageType = bodyBuffer.readUInt32BE(PAYLOAD_TYPE_OFFSET),
      messageBody = bodyBuffer.slice(PAYLOAD_HEADER_LENGTH)

    var rawMessage = {
      protocolVersion: protocolVersion,
      id: messageID,
      type: messageType,
      body: messageBody,
    }

    if (protocolVersion !== PROTOCOL_VERSION) {
      this.emit('communicationsError', 'unknown protocol version', protocolVersion)
    } else if (messageType === MESSAGE_TYPE_JAVASCRIPT) {
      var messageBodyString = messageBody.toString('utf8')
      var messageBodyParts = messageBodyString.split('\r')
      var eventName = null
      var parsedValue = null

      if (messageBodyParts.length === 2) {
        eventName = messageBodyParts[0]
      }

      parsedValue = messageBodyParts[messageBodyParts.length - 1]

      // Most commands pass JSON back. However, some pass strings that result from
      // toStrings of un-JSON-ifiable data (e.g. "[ActionDescriptor]"). Still others
      // pass actual strings (that are not JSON) that we want to use (e.g. requests
      // for the Photoshop path). So, we try to parse as JSON, and if we fail, we just
      // use the string as the parsedValue. For some known strings, we don't try,
      // in order to avoid uninformative error messages for the console and the logs.
      //
      // TODO: In the future, it might make more sense to have a different slot in
      // the message that gives parsed data (if available) and unparsed string (always)
      if (KNOWN_LITERAL_STRING_MESSAGES.indexOf(parsedValue) === -1) {
        try {
          parsedValue = JSON.parse(parsedValue)
        } catch (_jsonParseException) {
          // do nothing; this is not unexpected
        }
      }

      if (eventName) {
        this.emit('event', messageID, eventName, parsedValue, rawMessage)
      } else {
        this.emit('message', messageID, parsedValue, rawMessage)
      }
    } else if (messageType === MESSAGE_TYPE_PIXMAP) {
      this.emit('pixmap', messageID, messageBody, rawMessage)
    } else if (messageType === MESSAGE_TYPE_ICC_PROFILE) {
      this.emit('iccProfile', messageID, messageBody, rawMessage)
    } else if (messageType === MESSAGE_TYPE_ERROR) {
      this.emit('error', { id: messageID, body: messageBody.toString('utf8') })
    } else {
      this.emit('communicationsError', 'unknown message type', messageType)
    }
  }

  // Factory Functions
  // -----------------

  function createClient(options, connectListener, logger) {
    return new PhotoshopClient(options, connectListener, logger)
  }

  // Public Interface
  // =================================

  exports.PhotoshopClient = PhotoshopClient
  exports.createClient = createClient
})()

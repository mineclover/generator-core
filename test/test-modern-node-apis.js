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
  var expect = require('chai').expect
  var photoshop = require('../lib/photoshop')
  var psCrypto = require('../lib/ps_crypto')

  describe('Modern Node API compatibility', () => {
    it('preserves Photoshop command framing after Buffer API updates', () => {
      var client = Object.create(photoshop.PhotoshopClient.prototype)
      var writes = []

      client._lastMessageID = 0
      client._crypto = null
      client._logger = { debug: () => {} }
      client._writeWhenFree = (buffer) => {
        writes.push(buffer)
      }

      var id = client.sendCommand('1 + 1', false)

      expect(id).to.equal(1)
      expect(writes).to.have.length(2)

      var header = writes[0]
      var payload = writes[1]

      expect(header.length).to.equal(8)
      expect(header.readUInt32BE(0)).to.equal(payload.length + 4)
      expect(header.readInt32BE(4)).to.equal(0)

      expect(payload.readUInt32BE(0)).to.equal(1)
      expect(payload.readUInt32BE(4)).to.equal(1)
      expect(payload.readUInt32BE(8)).to.equal(2)
      expect(payload.slice(12).toString('utf8')).to.equal('1 + 1')
    })

    it('round-trips encrypted binary payloads after Buffer API updates', (done) => {
      psCrypto.createPSCrypto('001004', (err, crypto) => {
        if (err) {
          done(err)
          return
        }

        var payload = Buffer.from([0, 1, 2, 3, 4, 127, 128, 200, 255])
        var encrypted = crypto.cipher(payload)
        var decrypted = crypto.decipher(encrypted)

        expect(Buffer.isBuffer(encrypted)).to.equal(true)
        expect(Buffer.isBuffer(decrypted)).to.equal(true)
        expect(decrypted.equals(payload)).to.equal(true)
        done()
      })
    })
  })
})()

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
  var merge = require('../lib/config')._merge

  describe('Config merge', () => {
    it('should merge into empty object', () => {
      expect(merge({}, { a: 1 })).to.deep.equal({ a: 1 })
    })

    it('should merge empty into filled object', () => {
      expect(merge({ a: 1 }, {})).to.deep.equal({ a: 1 })
    })

    it('should merge with overwrite', () => {
      expect(merge({ a: 1 }, { a: 2 })).to.deep.equal({ a: 2 })
    })

    it('should merge overwrite primitive with object', () => {
      expect(merge({ a: 1 }, { a: { b: 2 } })).to.deep.equal({ a: { b: 2 } })
    })

    it('should merge overwrite object with primitive', () => {
      expect(merge({ a: { b: 1 } }, { a: 2 })).to.deep.equal({ a: 2 })
    })

    it('should merge recursively', () => {
      expect(merge({ a: { b: 1 } }, { a: { c: 2 } })).to.deep.equal({ a: { b: 1, c: 2 } })
    })

    it('should merge recursively with overwrite', () => {
      expect(merge({ a: { b: 1, c: 3 } }, { a: { b: 2, d: 4 } })).to.deep.equal({ a: { b: 2, c: 3, d: 4 } })
    })

    it('should not merge into primitive', () => {
      expect(merge(1, { a: { b: 2, d: 4 } })).to.equal(1)
    })

    it('should treat merging in primitive as noop', () => {
      expect(merge({ a: 1 }, 1)).to.deep.equal({ a: 1 })
    })

    it('should modify src in place', () => {
      var a = { a: 1 }
      var b = { b: 2 }
      var c = merge(a, b)

      expect(a).to.equal(c)
      expect(a).to.deep.equal({ a: 1, b: 2 })
    })
  })
})()

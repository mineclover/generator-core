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
  var generator = require('../lib/generator')
  var escapePluginId = generator._escapePluginId
  var unescapePluginId = generator._unescapePluginId

  describe('Plugin ID escaping', () => {
    it('should escape and unescape plugin IDs correctly', () => {
      var unsafePluginId = 'geneRa_tor-foo.42bar.Baz#bla borg'
      var safePluginId = 'geneRa_95_tor_45_foo_46_42bar_46_Baz_35_bla_32_borg'

      expect(escapePluginId(unsafePluginId)).to.equal(safePluginId)
      expect(unescapePluginId(safePluginId)).to.equal(unsafePluginId)
    })
  })
})()

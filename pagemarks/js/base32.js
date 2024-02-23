/**
 * Extracted from base32-js, Copyright (C) 2011 by Isaac Wolkerstorfer, under the MIT license
 *
 * License text from base32-js:
 * https://raw.githubusercontent.com/agnoster/base32-js/644ebc135c715ff00b4aa8ba1450d9b903e789e6/LICENSE
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of
 * the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

 'use strict';


const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';


/**
 * A streaming encoder
 *
 *     var encoder = new base32.Encoder()
 *     var output1 = encoder.update(input1)
 *     var output2 = encoder.update(input2)
 *     var lastoutput = encode.update(lastinput, true)
 */
class Encoder {
    constructor() {
        var skip = 0; // how many bits we will skip from the first byte
        var bits = 0; // 5 high bits, carry from one byte to the next

        this.output = '';

        // Read one byte of input
        // Should not really be used except by "update"
        this.readByte = function (byte) {
            // coerce the byte to an int
            if (typeof byte == 'string')
                byte = byte.charCodeAt(0);

            if (skip < 0) { // we have a carry from the previous byte
                bits |= (byte >> (-skip));
            } else { // no carry
                bits = (byte << skip) & 248;
            }

            if (skip > 3) {
                // not enough data to produce a character, get us another one
                skip -= 8;
                return 1;
            }

            if (skip < 4) {
                // produce a character
                this.output += alphabet[bits >> 3];
                skip += 5;
            }

            return 0;
        };

        // Flush any remaining bits left in the stream
        this.finish = function (check) {
            var output = this.output + (skip < 0 ? alphabet[bits >> 3] : '') + (check ? '$' : '');
            this.output = '';
            return output;
        };
    }


    /**
     * Process additional input
     *
     * input: string of bytes to convert
     * flush: boolean, should we flush any trailing bits left
     *        in the stream
     * returns: a string of characters representing 'input' in base32
     */
    update(input, flush) {
        for (var i = 0; i < input.length;) {
            i += this.readByte(input[i]);
        }
        // consume all output
        var output = this.output;
        this.output = '';
        if (flush) {
            output += this.finish();
        }
        return output;
    }
}




/** Convenience functions
 *
 * These are the ones to use if you just have a string and
 * want to convert it without dealing with streams and whatnot.
 */

// String of data goes in, Base32-encoded string comes out.
function encode(input) {
    var encoder = new Encoder()
    var output = encoder.update(input, true)
    return output
}



var base32 = {
    Encoder: Encoder,
    encode: encode
}

if (typeof window !== 'undefined') {
    // we're in a browser - OMG!
    window.base32 = base32
}


export { Encoder, encode };

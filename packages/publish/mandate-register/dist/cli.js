#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod2) => function __require2() {
  return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
};
var __export = (target2, all) => {
  for (var name in all)
    __defProp(target2, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target2) => (target2 = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target2, "default", { value: mod2, enumerable: true }) : target2,
  mod2
));

// ../../../node_modules/.pnpm/canonicalize@2.1.0/node_modules/canonicalize/lib/canonicalize.js
var require_canonicalize = __commonJS({
  "../../../node_modules/.pnpm/canonicalize@2.1.0/node_modules/canonicalize/lib/canonicalize.js"(exports, module) {
    "use strict";
    module.exports = function serialize(object) {
      if (typeof object === "number" && isNaN(object)) {
        throw new Error("NaN is not allowed");
      }
      if (typeof object === "number" && !isFinite(object)) {
        throw new Error("Infinity is not allowed");
      }
      if (object === null || typeof object !== "object") {
        return JSON.stringify(object);
      }
      if (object.toJSON instanceof Function) {
        return serialize(object.toJSON());
      }
      if (Array.isArray(object)) {
        const values2 = object.reduce((t, cv, ci) => {
          const comma = ci === 0 ? "" : ",";
          const value = cv === void 0 || typeof cv === "symbol" ? null : cv;
          return `${t}${comma}${serialize(value)}`;
        }, "");
        return `[${values2}]`;
      }
      const values = Object.keys(object).sort().reduce((t, cv) => {
        if (object[cv] === void 0 || typeof object[cv] === "symbol") {
          return t;
        }
        const comma = t.length === 0 ? "" : ",";
        return `${t}${comma}${serialize(cv)}:${serialize(object[cv])}`;
      }, "");
      return `{${values}}`;
    };
  }
});

// ../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/decode.js
function checkedRead() {
  try {
    let result = read();
    if (bundledStrings) {
      if (position >= bundledStrings.postBundlePosition) {
        let error = new Error("Unexpected bundle position");
        error.incomplete = true;
        throw error;
      }
      position = bundledStrings.postBundlePosition;
      bundledStrings = null;
    }
    if (position == srcEnd) {
      currentStructures = null;
      src = null;
      if (referenceMap)
        referenceMap = null;
    } else if (position > srcEnd) {
      let error = new Error("Unexpected end of CBOR data");
      error.incomplete = true;
      throw error;
    } else if (!sequentialMode) {
      throw new Error("Data read, but end of buffer not reached");
    }
    return result;
  } catch (error) {
    clearSource();
    if (error instanceof RangeError || error.message.startsWith("Unexpected end of buffer")) {
      error.incomplete = true;
    }
    throw error;
  }
}
function read() {
  let token = src[position++];
  let majorType = token >> 5;
  token = token & 31;
  if (token > 23) {
    switch (token) {
      case 24:
        token = src[position++];
        break;
      case 25:
        if (majorType == 7) {
          return getFloat16();
        }
        token = dataView.getUint16(position);
        position += 2;
        break;
      case 26:
        if (majorType == 7) {
          let value = dataView.getFloat32(position);
          if (currentDecoder.useFloat32 > 2) {
            let multiplier = mult10[(src[position] & 127) << 1 | src[position + 1] >> 7];
            position += 4;
            return (multiplier * value + (value > 0 ? 0.5 : -0.5) >> 0) / multiplier;
          }
          position += 4;
          return value;
        }
        token = dataView.getUint32(position);
        position += 4;
        if (majorType === 1) return -1 - token;
        break;
      case 27:
        if (majorType == 7) {
          let value = dataView.getFloat64(position);
          position += 8;
          return value;
        }
        if (majorType > 1) {
          if (dataView.getUint32(position) > 0)
            throw new Error("JavaScript does not support arrays, maps, or strings with length over 4294967295");
          token = dataView.getUint32(position + 4);
        } else if (currentDecoder.int64AsNumber) {
          token = dataView.getUint32(position) * 4294967296;
          token += dataView.getUint32(position + 4);
        } else token = dataView.getBigUint64(position);
        position += 8;
        break;
      case 31:
        switch (majorType) {
          case 2:
          // byte string
          case 3:
            throw new Error("Indefinite length not supported for byte or text strings");
          case 4:
            let array = [];
            let value, i = 0;
            while ((value = read()) != STOP_CODE) {
              if (i >= maxArraySize) throw new Error(`Array length exceeds ${maxArraySize}`);
              array[i++] = value;
            }
            return majorType == 4 ? array : majorType == 3 ? array.join("") : Buffer.concat(array);
          case 5:
            let key;
            if (currentDecoder.mapsAsObjects) {
              let object = {};
              let i2 = 0;
              if (currentDecoder.keyMap) {
                while ((key = read()) != STOP_CODE) {
                  if (i2++ >= maxMapSize) throw new Error(`Property count exceeds ${maxMapSize}`);
                  object[safeKey(currentDecoder.decodeKey(key))] = read();
                }
              } else {
                while ((key = read()) != STOP_CODE) {
                  if (i2++ >= maxMapSize) throw new Error(`Property count exceeds ${maxMapSize}`);
                  object[safeKey(key)] = read();
                }
              }
              return object;
            } else {
              if (restoreMapsAsObject) {
                currentDecoder.mapsAsObjects = true;
                restoreMapsAsObject = false;
              }
              let map = /* @__PURE__ */ new Map();
              if (currentDecoder.keyMap) {
                let i2 = 0;
                while ((key = read()) != STOP_CODE) {
                  if (i2++ >= maxMapSize) {
                    throw new Error(`Map size exceeds ${maxMapSize}`);
                  }
                  map.set(currentDecoder.decodeKey(key), read());
                }
              } else {
                let i2 = 0;
                while ((key = read()) != STOP_CODE) {
                  if (i2++ >= maxMapSize) {
                    throw new Error(`Map size exceeds ${maxMapSize}`);
                  }
                  map.set(key, read());
                }
              }
              return map;
            }
          case 7:
            return STOP_CODE;
          default:
            throw new Error("Invalid major type for indefinite length " + majorType);
        }
      default:
        throw new Error("Unknown token " + token);
    }
  }
  switch (majorType) {
    case 0:
      return token;
    case 1:
      return ~token;
    case 2:
      return readBin(token);
    case 3:
      if (srcStringEnd >= position) {
        return srcString.slice(position - srcStringStart, (position += token) - srcStringStart);
      }
      if (srcStringEnd == 0 && srcEnd < 140 && token < 32) {
        let string = token < 16 ? shortStringInJS(token) : longStringInJS(token);
        if (string != null)
          return string;
      }
      return readFixedString(token);
    case 4:
      if (token >= maxArraySize) throw new Error(`Array length exceeds ${maxArraySize}`);
      let array = new Array(token);
      for (let i = 0; i < token; i++) array[i] = read();
      return array;
    case 5:
      if (token >= maxMapSize) throw new Error(`Map size exceeds ${maxArraySize}`);
      if (currentDecoder.mapsAsObjects) {
        let object = {};
        if (currentDecoder.keyMap) for (let i = 0; i < token; i++) object[safeKey(currentDecoder.decodeKey(read()))] = read();
        else for (let i = 0; i < token; i++) object[safeKey(read())] = read();
        return object;
      } else {
        if (restoreMapsAsObject) {
          currentDecoder.mapsAsObjects = true;
          restoreMapsAsObject = false;
        }
        let map = /* @__PURE__ */ new Map();
        if (currentDecoder.keyMap) for (let i = 0; i < token; i++) map.set(currentDecoder.decodeKey(read()), read());
        else for (let i = 0; i < token; i++) map.set(read(), read());
        return map;
      }
    case 6:
      if (token >= BUNDLED_STRINGS_ID) {
        let structure = currentStructures[token & 8191];
        if (structure) {
          if (!structure.read) structure.read = createStructureReader(structure);
          return structure.read();
        }
        if (token < 65536) {
          if (token == RECORD_INLINE_ID) {
            let length = readJustLength();
            let id = read();
            let structure2 = read();
            recordDefinition(id, structure2);
            let object = {};
            if (currentDecoder.keyMap) for (let i = 2; i < length; i++) {
              let key = currentDecoder.decodeKey(structure2[i - 2]);
              object[safeKey(key)] = read();
            }
            else for (let i = 2; i < length; i++) {
              let key = structure2[i - 2];
              object[safeKey(key)] = read();
            }
            return object;
          } else if (token == RECORD_DEFINITIONS_ID) {
            let length = readJustLength();
            let id = read();
            for (let i = 2; i < length; i++) {
              recordDefinition(id++, read());
            }
            return read();
          } else if (token == BUNDLED_STRINGS_ID) {
            return readBundleExt();
          }
          if (currentDecoder.getShared) {
            loadShared();
            structure = currentStructures[token & 8191];
            if (structure) {
              if (!structure.read)
                structure.read = createStructureReader(structure);
              return structure.read();
            }
          }
        }
      }
      let extension = currentExtensions[token];
      if (extension) {
        if (extension.handlesRead)
          return extension(read);
        else
          return extension(read());
      } else {
        let input = read();
        for (let i = 0; i < currentExtensionRanges.length; i++) {
          let value = currentExtensionRanges[i](token, input);
          if (value !== void 0)
            return value;
        }
        return new Tag(input, token);
      }
    case 7:
      switch (token) {
        case 20:
          return false;
        case 21:
          return true;
        case 22:
          return null;
        case 23:
          return;
        // undefined
        case 31:
        default:
          let packedValue = (packedValues || getPackedValues())[token];
          if (packedValue !== void 0)
            return packedValue;
          throw new Error("Unknown token " + token);
      }
    default:
      if (isNaN(token)) {
        let error = new Error("Unexpected end of CBOR data");
        error.incomplete = true;
        throw error;
      }
      throw new Error("Unknown CBOR token " + token);
  }
}
function createStructureReader(structure) {
  if (!structure) throw new Error("Structure is required in record definition");
  function readObject() {
    let length = src[position++];
    length = length & 31;
    if (length > 23) {
      switch (length) {
        case 24:
          length = src[position++];
          break;
        case 25:
          length = dataView.getUint16(position);
          position += 2;
          break;
        case 26:
          length = dataView.getUint32(position);
          position += 4;
          break;
        default:
          throw new Error("Expected array header, but got " + src[position - 1]);
      }
    }
    let compiledReader = this.compiledReader;
    while (compiledReader) {
      if (compiledReader.propertyCount === length)
        return compiledReader(read);
      compiledReader = compiledReader.next;
    }
    if (this.slowReads++ >= inlineObjectReadThreshold) {
      let array = this.length == length ? this : this.slice(0, length);
      compiledReader = currentDecoder.keyMap ? new Function("r", "return {" + array.map((k) => currentDecoder.decodeKey(k)).map((k) => validName.test(k) ? safeKey(k) + ":r()" : "[" + JSON.stringify(k) + "]:r()").join(",") + "}") : new Function("r", "return {" + array.map((key) => validName.test(key) ? safeKey(key) + ":r()" : "[" + JSON.stringify(key) + "]:r()").join(",") + "}");
      if (this.compiledReader)
        compiledReader.next = this.compiledReader;
      compiledReader.propertyCount = length;
      this.compiledReader = compiledReader;
      return compiledReader(read);
    }
    let object = {};
    if (currentDecoder.keyMap) for (let i = 0; i < length; i++) object[safeKey(currentDecoder.decodeKey(this[i]))] = read();
    else for (let i = 0; i < length; i++) {
      object[safeKey(this[i])] = read();
    }
    return object;
  }
  structure.slowReads = 0;
  return readObject;
}
function safeKey(key) {
  if (typeof key === "string") return key === "__proto__" ? "__proto_" : key;
  if (typeof key === "number" || typeof key === "boolean" || typeof key === "bigint") return key.toString();
  if (key == null) return key + "";
  throw new Error("Invalid property name type " + typeof key);
}
function setExtractor(extractStrings) {
  isNativeAccelerationEnabled = true;
  readFixedString = readString(1);
  readString8 = readString(2);
  readString16 = readString(3);
  readString32 = readString(5);
  function readString(headerLength) {
    return function readString2(length) {
      let string = strings[stringPosition++];
      if (string == null) {
        if (bundledStrings)
          return readStringJS(length);
        let extraction = extractStrings(position, srcEnd, length, src);
        if (typeof extraction == "string") {
          string = extraction;
          strings = EMPTY_ARRAY;
        } else {
          strings = extraction;
          stringPosition = 1;
          srcStringEnd = 1;
          string = strings[0];
          if (string === void 0)
            throw new Error("Unexpected end of buffer");
        }
      }
      let srcStringLength = string.length;
      if (srcStringLength <= length) {
        position += length;
        return string;
      }
      srcString = string;
      srcStringStart = position;
      srcStringEnd = position + srcStringLength;
      position += length;
      return string.slice(0, length);
    };
  }
}
function readStringJS(length) {
  let result;
  if (length < 16) {
    if (result = shortStringInJS(length))
      return result;
  }
  if (length > 64 && decoder)
    return decoder.decode(src.subarray(position, position += length));
  const end = position + length;
  const units = [];
  result = "";
  while (position < end) {
    const byte1 = src[position++];
    if ((byte1 & 128) === 0) {
      units.push(byte1);
    } else if ((byte1 & 224) === 192) {
      const byte2 = src[position++] & 63;
      const codePoint = (byte1 & 31) << 6 | byte2;
      if (codePoint < 128) {
        units.push(65533);
      } else {
        units.push(codePoint);
      }
    } else if ((byte1 & 240) === 224) {
      const byte2 = src[position++] & 63;
      const byte3 = src[position++] & 63;
      const codePoint = (byte1 & 31) << 12 | byte2 << 6 | byte3;
      if (codePoint < 2048 || codePoint >= 55296 && codePoint <= 57343) {
        units.push(65533);
      } else {
        units.push(codePoint);
      }
    } else if ((byte1 & 248) === 240) {
      const byte2 = src[position++] & 63;
      const byte3 = src[position++] & 63;
      const byte4 = src[position++] & 63;
      let unit = (byte1 & 7) << 18 | byte2 << 12 | byte3 << 6 | byte4;
      if (unit < 65536 || unit > 1114111) {
        units.push(65533);
      } else if (unit > 65535) {
        unit -= 65536;
        units.push(unit >>> 10 & 1023 | 55296);
        unit = 56320 | unit & 1023;
        units.push(unit);
      } else {
        units.push(unit);
      }
    } else {
      units.push(65533);
    }
    if (units.length >= 4096) {
      result += fromCharCode.apply(String, units);
      units.length = 0;
    }
  }
  if (units.length > 0) {
    result += fromCharCode.apply(String, units);
  }
  return result;
}
function longStringInJS(length) {
  let start = position;
  let bytes = new Array(length);
  for (let i = 0; i < length; i++) {
    const byte = src[position++];
    if ((byte & 128) > 0) {
      position = start;
      return;
    }
    bytes[i] = byte;
  }
  return fromCharCode.apply(String, bytes);
}
function shortStringInJS(length) {
  if (length < 4) {
    if (length < 2) {
      if (length === 0)
        return "";
      else {
        let a = src[position++];
        if ((a & 128) > 1) {
          position -= 1;
          return;
        }
        return fromCharCode(a);
      }
    } else {
      let a = src[position++];
      let b = src[position++];
      if ((a & 128) > 0 || (b & 128) > 0) {
        position -= 2;
        return;
      }
      if (length < 3)
        return fromCharCode(a, b);
      let c = src[position++];
      if ((c & 128) > 0) {
        position -= 3;
        return;
      }
      return fromCharCode(a, b, c);
    }
  } else {
    let a = src[position++];
    let b = src[position++];
    let c = src[position++];
    let d = src[position++];
    if ((a & 128) > 0 || (b & 128) > 0 || (c & 128) > 0 || (d & 128) > 0) {
      position -= 4;
      return;
    }
    if (length < 6) {
      if (length === 4)
        return fromCharCode(a, b, c, d);
      else {
        let e = src[position++];
        if ((e & 128) > 0) {
          position -= 5;
          return;
        }
        return fromCharCode(a, b, c, d, e);
      }
    } else if (length < 8) {
      let e = src[position++];
      let f = src[position++];
      if ((e & 128) > 0 || (f & 128) > 0) {
        position -= 6;
        return;
      }
      if (length < 7)
        return fromCharCode(a, b, c, d, e, f);
      let g = src[position++];
      if ((g & 128) > 0) {
        position -= 7;
        return;
      }
      return fromCharCode(a, b, c, d, e, f, g);
    } else {
      let e = src[position++];
      let f = src[position++];
      let g = src[position++];
      let h = src[position++];
      if ((e & 128) > 0 || (f & 128) > 0 || (g & 128) > 0 || (h & 128) > 0) {
        position -= 8;
        return;
      }
      if (length < 10) {
        if (length === 8)
          return fromCharCode(a, b, c, d, e, f, g, h);
        else {
          let i = src[position++];
          if ((i & 128) > 0) {
            position -= 9;
            return;
          }
          return fromCharCode(a, b, c, d, e, f, g, h, i);
        }
      } else if (length < 12) {
        let i = src[position++];
        let j = src[position++];
        if ((i & 128) > 0 || (j & 128) > 0) {
          position -= 10;
          return;
        }
        if (length < 11)
          return fromCharCode(a, b, c, d, e, f, g, h, i, j);
        let k = src[position++];
        if ((k & 128) > 0) {
          position -= 11;
          return;
        }
        return fromCharCode(a, b, c, d, e, f, g, h, i, j, k);
      } else {
        let i = src[position++];
        let j = src[position++];
        let k = src[position++];
        let l = src[position++];
        if ((i & 128) > 0 || (j & 128) > 0 || (k & 128) > 0 || (l & 128) > 0) {
          position -= 12;
          return;
        }
        if (length < 14) {
          if (length === 12)
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l);
          else {
            let m = src[position++];
            if ((m & 128) > 0) {
              position -= 13;
              return;
            }
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m);
          }
        } else {
          let m = src[position++];
          let n = src[position++];
          if ((m & 128) > 0 || (n & 128) > 0) {
            position -= 14;
            return;
          }
          if (length < 15)
            return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n);
          let o = src[position++];
          if ((o & 128) > 0) {
            position -= 15;
            return;
          }
          return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o);
        }
      }
    }
  }
}
function readBin(length) {
  return currentDecoder.copyBuffers ? (
    // specifically use the copying slice (not the node one)
    Uint8Array.prototype.slice.call(src, position, position += length)
  ) : src.subarray(position, position += length);
}
function getFloat16() {
  let byte0 = src[position++];
  let byte1 = src[position++];
  let exponent = (byte0 & 127) >> 2;
  if (exponent === 31) {
    if (byte1 || byte0 & 3)
      return NaN;
    return byte0 & 128 ? -Infinity : Infinity;
  }
  if (exponent === 0) {
    let abs = ((byte0 & 3) << 8 | byte1) / (1 << 24);
    return byte0 & 128 ? -abs : abs;
  }
  u8Array[3] = byte0 & 128 | // sign bit
  (exponent >> 1) + 56;
  u8Array[2] = (byte0 & 7) << 5 | // last exponent bit and first two mantissa bits
  byte1 >> 3;
  u8Array[1] = byte1 << 5;
  u8Array[0] = 0;
  return f32Array[0];
}
function combine(a, b) {
  if (typeof a === "string")
    return a + b;
  if (a instanceof Array)
    return a.concat(b);
  return Object.assign({}, a, b);
}
function getPackedValues() {
  if (!packedValues) {
    if (currentDecoder.getShared)
      loadShared();
    else
      throw new Error("No packed values available");
  }
  return packedValues;
}
function registerTypedArray(TypedArray, tag) {
  let dvMethod = "get" + TypedArray.name.slice(0, -5);
  let bytesPerElement;
  if (typeof TypedArray === "function")
    bytesPerElement = TypedArray.BYTES_PER_ELEMENT;
  else
    TypedArray = null;
  for (let littleEndian = 0; littleEndian < 2; littleEndian++) {
    if (!littleEndian && bytesPerElement == 1)
      continue;
    let sizeShift = bytesPerElement == 2 ? 1 : bytesPerElement == 4 ? 2 : bytesPerElement == 8 ? 3 : 0;
    currentExtensions[littleEndian ? tag : tag - 4] = bytesPerElement == 1 || littleEndian == isLittleEndianMachine ? (buffer) => {
      if (!TypedArray)
        throw new Error("Could not find typed array for code " + tag);
      if (!currentDecoder.copyBuffers) {
        if (bytesPerElement === 1 || bytesPerElement === 2 && !(buffer.byteOffset & 1) || bytesPerElement === 4 && !(buffer.byteOffset & 3) || bytesPerElement === 8 && !(buffer.byteOffset & 7))
          return new TypedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength >> sizeShift);
      }
      return new TypedArray(Uint8Array.prototype.slice.call(buffer, 0).buffer);
    } : (buffer) => {
      if (!TypedArray)
        throw new Error("Could not find typed array for code " + tag);
      let dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      let elements = buffer.length >> sizeShift;
      let ta = new TypedArray(elements);
      let method = dv[dvMethod];
      for (let i = 0; i < elements; i++) {
        ta[i] = method.call(dv, i << sizeShift, littleEndian);
      }
      return ta;
    };
  }
}
function readBundleExt() {
  let length = readJustLength();
  let bundlePosition = position + read();
  for (let i = 2; i < length; i++) {
    let bundleLength = readJustLength();
    position += bundleLength;
  }
  let dataPosition = position;
  position = bundlePosition;
  bundledStrings = [readStringJS(readJustLength()), readStringJS(readJustLength())];
  bundledStrings.position0 = 0;
  bundledStrings.position1 = 0;
  bundledStrings.postBundlePosition = position;
  position = dataPosition;
  return read();
}
function readJustLength() {
  let token = src[position++] & 31;
  if (token > 23) {
    switch (token) {
      case 24:
        token = src[position++];
        break;
      case 25:
        token = dataView.getUint16(position);
        position += 2;
        break;
      case 26:
        token = dataView.getUint32(position);
        position += 4;
        break;
    }
  }
  return token;
}
function loadShared() {
  if (currentDecoder.getShared) {
    let sharedData = saveState(() => {
      src = null;
      return currentDecoder.getShared();
    }) || {};
    let updatedStructures = sharedData.structures || [];
    currentDecoder.sharedVersion = sharedData.version;
    packedValues = currentDecoder.sharedValues = sharedData.packedValues;
    if (currentStructures === true)
      currentDecoder.structures = currentStructures = updatedStructures;
    else
      currentStructures.splice.apply(currentStructures, [0, updatedStructures.length].concat(updatedStructures));
  }
}
function saveState(callback) {
  let savedSrcEnd = srcEnd;
  let savedPosition = position;
  let savedStringPosition = stringPosition;
  let savedSrcStringStart = srcStringStart;
  let savedSrcStringEnd = srcStringEnd;
  let savedSrcString = srcString;
  let savedStrings = strings;
  let savedReferenceMap = referenceMap;
  let savedBundledStrings = bundledStrings;
  let savedSrc = new Uint8Array(src.slice(0, srcEnd));
  let savedStructures = currentStructures;
  let savedDecoder = currentDecoder;
  let savedSequentialMode = sequentialMode;
  let value = callback();
  srcEnd = savedSrcEnd;
  position = savedPosition;
  stringPosition = savedStringPosition;
  srcStringStart = savedSrcStringStart;
  srcStringEnd = savedSrcStringEnd;
  srcString = savedSrcString;
  strings = savedStrings;
  referenceMap = savedReferenceMap;
  bundledStrings = savedBundledStrings;
  src = savedSrc;
  sequentialMode = savedSequentialMode;
  currentStructures = savedStructures;
  currentDecoder = savedDecoder;
  dataView = new DataView(src.buffer, src.byteOffset, src.byteLength);
  return value;
}
function clearSource() {
  src = null;
  referenceMap = null;
  currentStructures = null;
}
function addExtension(extension) {
  currentExtensions[extension.tag] = extension.decode;
}
function setSizeLimits(limits) {
  if (limits.maxMapSize) maxMapSize = limits.maxMapSize;
  if (limits.maxArraySize) maxArraySize = limits.maxArraySize;
  if (limits.maxObjectSize) maxObjectSize = limits.maxObjectSize;
}
function roundFloat32(float32Number) {
  f32Array[0] = float32Number;
  let multiplier = mult10[(u8Array[3] & 127) << 1 | u8Array[2] >> 7];
  return (multiplier * float32Number + (float32Number > 0 ? 0.5 : -0.5) >> 0) / multiplier;
}
var decoder, src, srcEnd, position, EMPTY_ARRAY, LEGACY_RECORD_INLINE_ID, RECORD_DEFINITIONS_ID, RECORD_INLINE_ID, BUNDLED_STRINGS_ID, PACKED_REFERENCE_TAG_ID, STOP_CODE, maxArraySize, maxMapSize, maxObjectSize, strings, stringPosition, currentDecoder, currentStructures, srcString, srcStringStart, srcStringEnd, bundledStrings, referenceMap, currentExtensions, currentExtensionRanges, packedValues, dataView, restoreMapsAsObject, defaultOptions, sequentialMode, inlineObjectReadThreshold, Decoder, validName, readFixedString, readString8, readString16, readString32, isNativeAccelerationEnabled, fromCharCode, f32Array, u8Array, keyCache, Tag, recordDefinition, glbl, packedTable, SHARED_DATA_TAG_ID, isLittleEndianMachine, typedArrays, typedArrayTags, mult10, defaultDecoder, decode, decodeMultiple, FLOAT32_OPTIONS;
var init_decode = __esm({
  "../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/decode.js"() {
    try {
      decoder = new TextDecoder();
    } catch (error) {
    }
    position = 0;
    EMPTY_ARRAY = [];
    LEGACY_RECORD_INLINE_ID = 105;
    RECORD_DEFINITIONS_ID = 57342;
    RECORD_INLINE_ID = 57343;
    BUNDLED_STRINGS_ID = 57337;
    PACKED_REFERENCE_TAG_ID = 6;
    STOP_CODE = {};
    maxArraySize = 11281e4;
    maxMapSize = 1681e4;
    maxObjectSize = 1671e4;
    strings = EMPTY_ARRAY;
    stringPosition = 0;
    currentDecoder = {};
    srcStringStart = 0;
    srcStringEnd = 0;
    currentExtensions = [];
    currentExtensionRanges = [];
    defaultOptions = {
      useRecords: false,
      mapsAsObjects: true
    };
    sequentialMode = false;
    inlineObjectReadThreshold = 2;
    try {
      new Function("");
    } catch (error) {
      inlineObjectReadThreshold = Infinity;
    }
    Decoder = class _Decoder {
      constructor(options) {
        if (options) {
          if ((options.keyMap || options._keyMap) && !options.useRecords) {
            options.useRecords = false;
            options.mapsAsObjects = true;
          }
          if (options.useRecords === false && options.mapsAsObjects === void 0)
            options.mapsAsObjects = true;
          if (options.getStructures)
            options.getShared = options.getStructures;
          if (options.getShared && !options.structures)
            (options.structures = []).uninitialized = true;
          if (options.keyMap) {
            this.mapKey = /* @__PURE__ */ new Map();
            for (let [k, v] of Object.entries(options.keyMap)) this.mapKey.set(v, k);
          }
        }
        Object.assign(this, options);
      }
      /*
      decodeKey(key) {
      	return this.keyMap
      		? Object.keys(this.keyMap)[Object.values(this.keyMap).indexOf(key)] || key
      		: key
      }
      */
      decodeKey(key) {
        return this.keyMap ? this.mapKey.get(key) || key : key;
      }
      encodeKey(key) {
        return this.keyMap && this.keyMap.hasOwnProperty(key) ? this.keyMap[key] : key;
      }
      encodeKeys(rec) {
        if (!this._keyMap) return rec;
        let map = /* @__PURE__ */ new Map();
        for (let [k, v] of Object.entries(rec)) map.set(this._keyMap.hasOwnProperty(k) ? this._keyMap[k] : k, v);
        return map;
      }
      decodeKeys(map) {
        if (!this._keyMap || map.constructor.name != "Map") return map;
        if (!this._mapKey) {
          this._mapKey = /* @__PURE__ */ new Map();
          for (let [k, v] of Object.entries(this._keyMap)) this._mapKey.set(v, k);
        }
        let res = {};
        map.forEach((v, k) => res[safeKey(this._mapKey.has(k) ? this._mapKey.get(k) : k)] = v);
        return res;
      }
      mapDecode(source, end) {
        let res = this.decode(source);
        if (this._keyMap) {
          switch (res.constructor.name) {
            case "Array":
              return res.map((r) => this.decodeKeys(r));
          }
        }
        return res;
      }
      decode(source, end) {
        if (src) {
          return saveState(() => {
            clearSource();
            return this ? this.decode(source, end) : _Decoder.prototype.decode.call(defaultOptions, source, end);
          });
        }
        srcEnd = end > -1 ? end : source.length;
        position = 0;
        stringPosition = 0;
        srcStringEnd = 0;
        srcString = null;
        strings = EMPTY_ARRAY;
        bundledStrings = null;
        src = source;
        try {
          dataView = source.dataView || (source.dataView = new DataView(source.buffer, source.byteOffset, source.byteLength));
        } catch (error) {
          src = null;
          if (source instanceof Uint8Array)
            throw error;
          throw new Error("Source must be a Uint8Array or Buffer but was a " + (source && typeof source == "object" ? source.constructor.name : typeof source));
        }
        if (this instanceof _Decoder) {
          currentDecoder = this;
          packedValues = this.sharedValues && (this.pack ? new Array(this.maxPrivatePackedValues || 16).concat(this.sharedValues) : this.sharedValues);
          if (this.structures) {
            currentStructures = this.structures;
            return checkedRead();
          } else if (!currentStructures || currentStructures.length > 0) {
            currentStructures = [];
          }
        } else {
          currentDecoder = defaultOptions;
          if (!currentStructures || currentStructures.length > 0)
            currentStructures = [];
          packedValues = null;
        }
        return checkedRead();
      }
      decodeMultiple(source, forEach) {
        let values, lastPosition = 0;
        try {
          let size = source.length;
          sequentialMode = true;
          let value = this ? this.decode(source, size) : defaultDecoder.decode(source, size);
          if (forEach) {
            if (forEach(value) === false) {
              return;
            }
            while (position < size) {
              lastPosition = position;
              if (forEach(checkedRead()) === false) {
                return;
              }
            }
          } else {
            values = [value];
            while (position < size) {
              lastPosition = position;
              values.push(checkedRead());
            }
            return values;
          }
        } catch (error) {
          error.lastPosition = lastPosition;
          error.values = values;
          throw error;
        } finally {
          sequentialMode = false;
          clearSource();
        }
      }
    };
    validName = /^[a-zA-Z_$][a-zA-Z\d_$]*$/;
    readFixedString = readStringJS;
    readString8 = readStringJS;
    readString16 = readStringJS;
    readString32 = readStringJS;
    isNativeAccelerationEnabled = false;
    fromCharCode = String.fromCharCode;
    f32Array = new Float32Array(1);
    u8Array = new Uint8Array(f32Array.buffer, 0, 4);
    keyCache = new Array(4096);
    Tag = class {
      constructor(value, tag) {
        this.value = value;
        this.tag = tag;
      }
    };
    currentExtensions[0] = (dateString) => {
      return new Date(dateString);
    };
    currentExtensions[1] = (epochSec) => {
      return new Date(Math.round(epochSec * 1e3));
    };
    currentExtensions[2] = (buffer) => {
      let value = BigInt(0);
      for (let i = 0, l = buffer.byteLength; i < l; i++) {
        value = BigInt(buffer[i]) + (value << BigInt(8));
      }
      return value;
    };
    currentExtensions[3] = (buffer) => {
      return BigInt(-1) - currentExtensions[2](buffer);
    };
    currentExtensions[4] = (fraction) => {
      return +(fraction[1] + "e" + fraction[0]);
    };
    currentExtensions[5] = (fraction) => {
      return fraction[1] * Math.exp(fraction[0] * Math.log(2));
    };
    recordDefinition = (id, structure) => {
      id = id - 57344;
      let existingStructure = currentStructures[id];
      if (existingStructure && existingStructure.isShared) {
        (currentStructures.restoreStructures || (currentStructures.restoreStructures = []))[id] = existingStructure;
      }
      currentStructures[id] = structure;
      structure.read = createStructureReader(structure);
    };
    currentExtensions[LEGACY_RECORD_INLINE_ID] = (data) => {
      let length = data.length;
      let structure = data[1];
      recordDefinition(data[0], structure);
      let object = {};
      for (let i = 2; i < length; i++) {
        let key = structure[i - 2];
        object[safeKey(key)] = data[i];
      }
      return object;
    };
    currentExtensions[14] = (value) => {
      if (bundledStrings)
        return bundledStrings[0].slice(bundledStrings.position0, bundledStrings.position0 += value);
      return new Tag(value, 14);
    };
    currentExtensions[15] = (value) => {
      if (bundledStrings)
        return bundledStrings[1].slice(bundledStrings.position1, bundledStrings.position1 += value);
      return new Tag(value, 15);
    };
    glbl = { Error, RegExp };
    currentExtensions[27] = (data) => {
      return (glbl[data[0]] || Error)(data[1], data[2]);
    };
    packedTable = (read2) => {
      if (src[position++] != 132) {
        let error = new Error("Packed values structure must be followed by a 4 element array");
        if (src.length < position)
          error.incomplete = true;
        throw error;
      }
      let newPackedValues = read2();
      if (!newPackedValues || !newPackedValues.length) {
        let error = new Error("Packed values structure must be followed by a 4 element array");
        error.incomplete = true;
        throw error;
      }
      packedValues = packedValues ? newPackedValues.concat(packedValues.slice(newPackedValues.length)) : newPackedValues;
      packedValues.prefixes = read2();
      packedValues.suffixes = read2();
      return read2();
    };
    packedTable.handlesRead = true;
    currentExtensions[51] = packedTable;
    currentExtensions[PACKED_REFERENCE_TAG_ID] = (data) => {
      if (!packedValues) {
        if (currentDecoder.getShared)
          loadShared();
        else
          return new Tag(data, PACKED_REFERENCE_TAG_ID);
      }
      if (typeof data == "number")
        return packedValues[16 + (data >= 0 ? 2 * data : -2 * data - 1)];
      let error = new Error("No support for non-integer packed references yet");
      if (data === void 0)
        error.incomplete = true;
      throw error;
    };
    currentExtensions[28] = (read2) => {
      if (!referenceMap) {
        referenceMap = /* @__PURE__ */ new Map();
        referenceMap.id = 0;
      }
      let id = referenceMap.id++;
      let startingPosition = position;
      let token = src[position];
      let target2;
      if (token >> 5 == 4)
        target2 = [];
      else
        target2 = {};
      let refEntry = { target: target2 };
      referenceMap.set(id, refEntry);
      let targetProperties = read2();
      if (refEntry.used) {
        if (Object.getPrototypeOf(target2) !== Object.getPrototypeOf(targetProperties)) {
          position = startingPosition;
          target2 = targetProperties;
          referenceMap.set(id, { target: target2 });
          targetProperties = read2();
        }
        return Object.assign(target2, targetProperties);
      }
      refEntry.target = targetProperties;
      return targetProperties;
    };
    currentExtensions[28].handlesRead = true;
    currentExtensions[29] = (id) => {
      let refEntry = referenceMap.get(id);
      refEntry.used = true;
      return refEntry.target;
    };
    currentExtensions[258] = (array) => new Set(array);
    (currentExtensions[259] = (read2) => {
      if (currentDecoder.mapsAsObjects) {
        currentDecoder.mapsAsObjects = false;
        restoreMapsAsObject = true;
      }
      return read2();
    }).handlesRead = true;
    SHARED_DATA_TAG_ID = 1399353956;
    currentExtensionRanges.push((tag, input) => {
      if (tag >= 225 && tag <= 255)
        return combine(getPackedValues().prefixes[tag - 224], input);
      if (tag >= 28704 && tag <= 32767)
        return combine(getPackedValues().prefixes[tag - 28672], input);
      if (tag >= 1879052288 && tag <= 2147483647)
        return combine(getPackedValues().prefixes[tag - 1879048192], input);
      if (tag >= 216 && tag <= 223)
        return combine(input, getPackedValues().suffixes[tag - 216]);
      if (tag >= 27647 && tag <= 28671)
        return combine(input, getPackedValues().suffixes[tag - 27639]);
      if (tag >= 1811940352 && tag <= 1879048191)
        return combine(input, getPackedValues().suffixes[tag - 1811939328]);
      if (tag == SHARED_DATA_TAG_ID) {
        return {
          packedValues,
          structures: currentStructures.slice(0),
          version: input
        };
      }
      if (tag == 55799)
        return input;
    });
    isLittleEndianMachine = new Uint8Array(new Uint16Array([1]).buffer)[0] == 1;
    typedArrays = [
      Uint8Array,
      Uint8ClampedArray,
      Uint16Array,
      Uint32Array,
      typeof BigUint64Array == "undefined" ? { name: "BigUint64Array" } : BigUint64Array,
      Int8Array,
      Int16Array,
      Int32Array,
      typeof BigInt64Array == "undefined" ? { name: "BigInt64Array" } : BigInt64Array,
      Float32Array,
      Float64Array
    ];
    typedArrayTags = [64, 68, 69, 70, 71, 72, 77, 78, 79, 85, 86];
    for (let i = 0; i < typedArrays.length; i++) {
      registerTypedArray(typedArrays[i], typedArrayTags[i]);
    }
    mult10 = new Array(147);
    for (let i = 0; i < 256; i++) {
      mult10[i] = +("1e" + Math.floor(45.15 - i * 0.30103));
    }
    defaultDecoder = new Decoder({ useRecords: false });
    decode = defaultDecoder.decode;
    decodeMultiple = defaultDecoder.decodeMultiple;
    FLOAT32_OPTIONS = {
      NEVER: 0,
      ALWAYS: 1,
      DECIMAL_ROUND: 3,
      DECIMAL_FIT: 4
    };
  }
});

// ../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/encode.js
function writeEntityLength(length, majorValue) {
  if (length < 24)
    target[position2++] = majorValue | length;
  else if (length < 256) {
    target[position2++] = majorValue | 24;
    target[position2++] = length;
  } else if (length < 65536) {
    target[position2++] = majorValue | 25;
    target[position2++] = length >> 8;
    target[position2++] = length & 255;
  } else {
    target[position2++] = majorValue | 26;
    targetView.setUint32(position2, length);
    position2 += 4;
  }
}
function writeArrayHeader(length) {
  if (length < 24)
    target[position2++] = 128 | length;
  else if (length < 256) {
    target[position2++] = 152;
    target[position2++] = length;
  } else if (length < 65536) {
    target[position2++] = 153;
    target[position2++] = length >> 8;
    target[position2++] = length & 255;
  } else {
    target[position2++] = 154;
    targetView.setUint32(position2, length);
    position2 += 4;
  }
}
function isBlob(object) {
  if (object instanceof BlobConstructor)
    return true;
  let tag = object[Symbol.toStringTag];
  return tag === "Blob" || tag === "File";
}
function findRepetitiveStrings(value, packedValues2) {
  switch (typeof value) {
    case "string":
      if (value.length > 3) {
        if (packedValues2.objectMap[value] > -1 || packedValues2.values.length >= packedValues2.maxValues)
          return;
        let packedStatus = packedValues2.get(value);
        if (packedStatus) {
          if (++packedStatus.count == 2) {
            packedValues2.values.push(value);
          }
        } else {
          packedValues2.set(value, {
            count: 1
          });
          if (packedValues2.samplingPackedValues) {
            let status = packedValues2.samplingPackedValues.get(value);
            if (status)
              status.count++;
            else
              packedValues2.samplingPackedValues.set(value, {
                count: 1
              });
          }
        }
      }
      break;
    case "object":
      if (value) {
        if (value instanceof Array) {
          for (let i = 0, l = value.length; i < l; i++) {
            findRepetitiveStrings(value[i], packedValues2);
          }
        } else {
          let includeKeys = !packedValues2.encoder.useRecords;
          for (var key in value) {
            if (value.hasOwnProperty(key)) {
              if (includeKeys)
                findRepetitiveStrings(key, packedValues2);
              findRepetitiveStrings(value[key], packedValues2);
            }
          }
        }
      }
      break;
    case "function":
      console.log(value);
  }
}
function typedArrayEncoder(tag, size) {
  if (!isLittleEndianMachine2 && size > 1)
    tag -= 4;
  return {
    tag,
    encode: function writeExtBuffer(typedArray, encode2) {
      let length = typedArray.byteLength;
      let offset = typedArray.byteOffset || 0;
      let buffer = typedArray.buffer || typedArray;
      encode2(hasNodeBuffer ? Buffer2.from(buffer, offset, length) : new Uint8Array(buffer, offset, length));
    }
  };
}
function writeBuffer(buffer, makeRoom) {
  let length = buffer.byteLength;
  if (length < 24) {
    target[position2++] = 64 + length;
  } else if (length < 256) {
    target[position2++] = 88;
    target[position2++] = length;
  } else if (length < 65536) {
    target[position2++] = 89;
    target[position2++] = length >> 8;
    target[position2++] = length & 255;
  } else {
    target[position2++] = 90;
    targetView.setUint32(position2, length);
    position2 += 4;
  }
  if (position2 + length >= target.length) {
    makeRoom(position2 + length);
  }
  target.set(buffer.buffer ? buffer : new Uint8Array(buffer), position2);
  position2 += length;
}
function insertIds(serialized, idsToInsert) {
  let nextId;
  let distanceToMove = idsToInsert.length * 2;
  let lastEnd = serialized.length - distanceToMove;
  idsToInsert.sort((a, b) => a.offset > b.offset ? 1 : -1);
  for (let id = 0; id < idsToInsert.length; id++) {
    let referee = idsToInsert[id];
    referee.id = id;
    for (let position3 of referee.references) {
      serialized[position3++] = id >> 8;
      serialized[position3] = id & 255;
    }
  }
  while (nextId = idsToInsert.pop()) {
    let offset = nextId.offset;
    serialized.copyWithin(offset + distanceToMove, offset, lastEnd);
    distanceToMove -= 2;
    let position3 = offset + distanceToMove;
    serialized[position3++] = 216;
    serialized[position3++] = 28;
    lastEnd = offset;
  }
  return serialized;
}
function writeBundles(start, encode2) {
  targetView.setUint32(bundledStrings2.position + start, position2 - bundledStrings2.position - start + 1);
  let writeStrings = bundledStrings2;
  bundledStrings2 = null;
  encode2(writeStrings[0]);
  encode2(writeStrings[1]);
}
function addExtension2(extension) {
  if (extension.Class) {
    if (!extension.encode)
      throw new Error("Extension has no encode function");
    extensionClasses.unshift(extension.Class);
    extensions.unshift(extension);
  }
  addExtension(extension);
}
var textEncoder, extensions, extensionClasses, Buffer2, hasNodeBuffer, ByteArrayAllocate, ByteArray, MAX_STRUCTURES, MAX_BUFFER_SIZE, throwOnIterable, target, targetView, position2, safeEnd, bundledStrings2, MAX_BUNDLE_SIZE, hasNonLatin, RECORD_SYMBOL, Encoder, SharedData, BlobConstructor, isLittleEndianMachine2, defaultEncoder, encode, encodeAsIterable, encodeAsAsyncIterable, NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT, REUSE_BUFFER_MODE, RESET_BUFFER_MODE, THROW_ON_ITERABLE;
var init_encode = __esm({
  "../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/encode.js"() {
    init_decode();
    init_decode();
    init_decode();
    try {
      textEncoder = new TextEncoder();
    } catch (error) {
    }
    Buffer2 = typeof globalThis === "object" && globalThis.Buffer;
    hasNodeBuffer = typeof Buffer2 !== "undefined";
    ByteArrayAllocate = hasNodeBuffer ? Buffer2.allocUnsafeSlow : Uint8Array;
    ByteArray = hasNodeBuffer ? Buffer2 : Uint8Array;
    MAX_STRUCTURES = 256;
    MAX_BUFFER_SIZE = hasNodeBuffer ? 4294967296 : 2144337920;
    position2 = 0;
    bundledStrings2 = null;
    MAX_BUNDLE_SIZE = 61440;
    hasNonLatin = /[\u0080-\uFFFF]/;
    RECORD_SYMBOL = Symbol("record-id");
    Encoder = class extends Decoder {
      constructor(options) {
        super(options);
        this.offset = 0;
        let typeBuffer;
        let start;
        let sharedStructures;
        let hasSharedUpdate;
        let structures;
        let referenceMap2;
        options = options || {};
        let encodeUtf8 = ByteArray.prototype.utf8Write ? function(string, position3) {
          return target.utf8Write(string, position3, target.byteLength - position3);
        } : textEncoder && textEncoder.encodeInto ? function(string, position3) {
          return textEncoder.encodeInto(string, target.subarray(position3)).written;
        } : false;
        let encoder = this;
        let hasSharedStructures = options.structures || options.saveStructures;
        let maxSharedStructures = options.maxSharedStructures;
        if (maxSharedStructures == null)
          maxSharedStructures = hasSharedStructures ? 128 : 0;
        if (maxSharedStructures > 8190)
          throw new Error("Maximum maxSharedStructure is 8190");
        let isSequential = options.sequential;
        if (isSequential) {
          maxSharedStructures = 0;
        }
        if (!this.structures)
          this.structures = [];
        if (this.saveStructures)
          this.saveShared = this.saveStructures;
        let samplingPackedValues, packedObjectMap2, sharedValues = options.sharedValues;
        let sharedPackedObjectMap2;
        if (sharedValues) {
          sharedPackedObjectMap2 = /* @__PURE__ */ Object.create(null);
          for (let i = 0, l = sharedValues.length; i < l; i++) {
            sharedPackedObjectMap2[sharedValues[i]] = i;
          }
        }
        let recordIdsToRemove = [];
        let transitionsCount = 0;
        let serializationsSinceTransitionRebuild = 0;
        this.mapEncode = function(value, encodeOptions) {
          if (this._keyMap && !this._mapped) {
            switch (value.constructor.name) {
              case "Array":
                value = value.map((r) => this.encodeKeys(r));
                break;
            }
          }
          return this.encode(value, encodeOptions);
        };
        this.encode = function(value, encodeOptions) {
          if (!target) {
            target = new ByteArrayAllocate(8192);
            targetView = new DataView(target.buffer, 0, 8192);
            position2 = 0;
          }
          safeEnd = target.length - 10;
          if (safeEnd - position2 < 2048) {
            target = new ByteArrayAllocate(target.length);
            targetView = new DataView(target.buffer, 0, target.length);
            safeEnd = target.length - 10;
            position2 = 0;
          } else if (encodeOptions === REUSE_BUFFER_MODE)
            position2 = position2 + 7 & 2147483640;
          start = position2;
          if (encoder.useSelfDescribedHeader) {
            targetView.setUint32(position2, 3654940416);
            position2 += 3;
          }
          referenceMap2 = encoder.structuredClone ? /* @__PURE__ */ new Map() : null;
          if (encoder.bundleStrings && typeof value !== "string") {
            bundledStrings2 = [];
            bundledStrings2.size = Infinity;
          } else
            bundledStrings2 = null;
          sharedStructures = encoder.structures;
          if (sharedStructures) {
            if (sharedStructures.uninitialized) {
              let sharedData = encoder.getShared() || {};
              encoder.structures = sharedStructures = sharedData.structures || [];
              encoder.sharedVersion = sharedData.version;
              let sharedValues2 = encoder.sharedValues = sharedData.packedValues;
              if (sharedValues2) {
                sharedPackedObjectMap2 = {};
                for (let i = 0, l = sharedValues2.length; i < l; i++)
                  sharedPackedObjectMap2[sharedValues2[i]] = i;
              }
            }
            let sharedStructuresLength = sharedStructures.length;
            if (sharedStructuresLength > maxSharedStructures && !isSequential)
              sharedStructuresLength = maxSharedStructures;
            if (!sharedStructures.transitions) {
              sharedStructures.transitions = /* @__PURE__ */ Object.create(null);
              for (let i = 0; i < sharedStructuresLength; i++) {
                let keys = sharedStructures[i];
                if (!keys)
                  continue;
                let nextTransition, transition = sharedStructures.transitions;
                for (let j = 0, l = keys.length; j < l; j++) {
                  if (transition[RECORD_SYMBOL] === void 0)
                    transition[RECORD_SYMBOL] = i;
                  let key = keys[j];
                  nextTransition = transition[key];
                  if (!nextTransition) {
                    nextTransition = transition[key] = /* @__PURE__ */ Object.create(null);
                  }
                  transition = nextTransition;
                }
                transition[RECORD_SYMBOL] = i | 1048576;
              }
            }
            if (!isSequential)
              sharedStructures.nextId = sharedStructuresLength;
          }
          if (hasSharedUpdate)
            hasSharedUpdate = false;
          structures = sharedStructures || [];
          packedObjectMap2 = sharedPackedObjectMap2;
          if (options.pack) {
            let packedValues2 = /* @__PURE__ */ new Map();
            packedValues2.values = [];
            packedValues2.encoder = encoder;
            packedValues2.maxValues = options.maxPrivatePackedValues || (sharedPackedObjectMap2 ? 16 : Infinity);
            packedValues2.objectMap = sharedPackedObjectMap2 || false;
            packedValues2.samplingPackedValues = samplingPackedValues;
            findRepetitiveStrings(value, packedValues2);
            if (packedValues2.values.length > 0) {
              target[position2++] = 216;
              target[position2++] = 51;
              writeArrayHeader(4);
              let valuesArray = packedValues2.values;
              encode2(valuesArray);
              writeArrayHeader(0);
              writeArrayHeader(0);
              packedObjectMap2 = Object.create(sharedPackedObjectMap2 || null);
              for (let i = 0, l = valuesArray.length; i < l; i++) {
                packedObjectMap2[valuesArray[i]] = i;
              }
            }
          }
          throwOnIterable = encodeOptions & THROW_ON_ITERABLE;
          try {
            if (throwOnIterable)
              return;
            encode2(value);
            if (bundledStrings2) {
              writeBundles(start, encode2);
            }
            encoder.offset = position2;
            if (referenceMap2 && referenceMap2.idsToInsert) {
              position2 += referenceMap2.idsToInsert.length * 2;
              if (position2 > safeEnd)
                makeRoom(position2);
              encoder.offset = position2;
              let serialized = insertIds(target.subarray(start, position2), referenceMap2.idsToInsert);
              referenceMap2 = null;
              return serialized;
            }
            if (encodeOptions & REUSE_BUFFER_MODE) {
              target.start = start;
              target.end = position2;
              return target;
            }
            return target.subarray(start, position2);
          } finally {
            if (sharedStructures) {
              if (serializationsSinceTransitionRebuild < 10)
                serializationsSinceTransitionRebuild++;
              if (sharedStructures.length > maxSharedStructures)
                sharedStructures.length = maxSharedStructures;
              if (transitionsCount > 1e4) {
                sharedStructures.transitions = null;
                serializationsSinceTransitionRebuild = 0;
                transitionsCount = 0;
                if (recordIdsToRemove.length > 0)
                  recordIdsToRemove = [];
              } else if (recordIdsToRemove.length > 0 && !isSequential) {
                for (let i = 0, l = recordIdsToRemove.length; i < l; i++) {
                  recordIdsToRemove[i][RECORD_SYMBOL] = void 0;
                }
                recordIdsToRemove = [];
              }
            }
            if (hasSharedUpdate && encoder.saveShared) {
              if (encoder.structures.length > maxSharedStructures) {
                encoder.structures = encoder.structures.slice(0, maxSharedStructures);
              }
              let returnBuffer = target.subarray(start, position2);
              if (encoder.updateSharedData() === false)
                return encoder.encode(value);
              return returnBuffer;
            }
            if (encodeOptions & RESET_BUFFER_MODE)
              position2 = start;
          }
        };
        this.findCommonStringsToPack = () => {
          samplingPackedValues = /* @__PURE__ */ new Map();
          if (!sharedPackedObjectMap2)
            sharedPackedObjectMap2 = /* @__PURE__ */ Object.create(null);
          return (options2) => {
            let threshold = options2 && options2.threshold || 4;
            let position3 = this.pack ? options2.maxPrivatePackedValues || 16 : 0;
            if (!sharedValues)
              sharedValues = this.sharedValues = [];
            for (let [key, status] of samplingPackedValues) {
              if (status.count > threshold) {
                sharedPackedObjectMap2[key] = position3++;
                sharedValues.push(key);
                hasSharedUpdate = true;
              }
            }
            while (this.saveShared && this.updateSharedData() === false) {
            }
            samplingPackedValues = null;
          };
        };
        const encode2 = (value) => {
          if (position2 > safeEnd)
            target = makeRoom(position2);
          var type = typeof value;
          var length;
          if (type === "string") {
            if (packedObjectMap2) {
              let packedPosition = packedObjectMap2[value];
              if (packedPosition >= 0) {
                if (packedPosition < 16)
                  target[position2++] = packedPosition + 224;
                else {
                  target[position2++] = 198;
                  if (packedPosition & 1)
                    encode2(15 - packedPosition >> 1);
                  else
                    encode2(packedPosition - 16 >> 1);
                }
                return;
              } else if (samplingPackedValues && !options.pack) {
                let status = samplingPackedValues.get(value);
                if (status)
                  status.count++;
                else
                  samplingPackedValues.set(value, {
                    count: 1
                  });
              }
            }
            let strLength = value.length;
            if (bundledStrings2 && strLength >= 4 && strLength < 1024) {
              if ((bundledStrings2.size += strLength) > MAX_BUNDLE_SIZE) {
                let extStart;
                let maxBytes2 = (bundledStrings2[0] ? bundledStrings2[0].length * 3 + bundledStrings2[1].length : 0) + 10;
                if (position2 + maxBytes2 > safeEnd)
                  target = makeRoom(position2 + maxBytes2);
                target[position2++] = 217;
                target[position2++] = 223;
                target[position2++] = 249;
                target[position2++] = bundledStrings2.position ? 132 : 130;
                target[position2++] = 26;
                extStart = position2 - start;
                position2 += 4;
                if (bundledStrings2.position) {
                  writeBundles(start, encode2);
                }
                bundledStrings2 = ["", ""];
                bundledStrings2.size = 0;
                bundledStrings2.position = extStart;
              }
              let twoByte = hasNonLatin.test(value);
              bundledStrings2[twoByte ? 0 : 1] += value;
              target[position2++] = twoByte ? 206 : 207;
              encode2(strLength);
              return;
            }
            let headerSize;
            if (strLength < 32) {
              headerSize = 1;
            } else if (strLength < 256) {
              headerSize = 2;
            } else if (strLength < 65536) {
              headerSize = 3;
            } else {
              headerSize = 5;
            }
            let maxBytes = strLength * 3;
            if (position2 + maxBytes > safeEnd)
              target = makeRoom(position2 + maxBytes);
            if (strLength < 64 || !encodeUtf8) {
              let i, c1, c2, strPosition = position2 + headerSize;
              for (i = 0; i < strLength; i++) {
                c1 = value.charCodeAt(i);
                if (c1 < 128) {
                  target[strPosition++] = c1;
                } else if (c1 < 2048) {
                  target[strPosition++] = c1 >> 6 | 192;
                  target[strPosition++] = c1 & 63 | 128;
                } else if ((c1 & 64512) === 55296 && ((c2 = value.charCodeAt(i + 1)) & 64512) === 56320) {
                  c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
                  i++;
                  target[strPosition++] = c1 >> 18 | 240;
                  target[strPosition++] = c1 >> 12 & 63 | 128;
                  target[strPosition++] = c1 >> 6 & 63 | 128;
                  target[strPosition++] = c1 & 63 | 128;
                } else {
                  target[strPosition++] = c1 >> 12 | 224;
                  target[strPosition++] = c1 >> 6 & 63 | 128;
                  target[strPosition++] = c1 & 63 | 128;
                }
              }
              length = strPosition - position2 - headerSize;
            } else {
              length = encodeUtf8(value, position2 + headerSize, maxBytes);
            }
            if (length < 24) {
              target[position2++] = 96 | length;
            } else if (length < 256) {
              if (headerSize < 2) {
                target.copyWithin(position2 + 2, position2 + 1, position2 + 1 + length);
              }
              target[position2++] = 120;
              target[position2++] = length;
            } else if (length < 65536) {
              if (headerSize < 3) {
                target.copyWithin(position2 + 3, position2 + 2, position2 + 2 + length);
              }
              target[position2++] = 121;
              target[position2++] = length >> 8;
              target[position2++] = length & 255;
            } else {
              if (headerSize < 5) {
                target.copyWithin(position2 + 5, position2 + 3, position2 + 3 + length);
              }
              target[position2++] = 122;
              targetView.setUint32(position2, length);
              position2 += 4;
            }
            position2 += length;
          } else if (type === "number") {
            if (!this.alwaysUseFloat && value >>> 0 === value) {
              if (value < 24) {
                target[position2++] = value;
              } else if (value < 256) {
                target[position2++] = 24;
                target[position2++] = value;
              } else if (value < 65536) {
                target[position2++] = 25;
                target[position2++] = value >> 8;
                target[position2++] = value & 255;
              } else {
                target[position2++] = 26;
                targetView.setUint32(position2, value);
                position2 += 4;
              }
            } else if (!this.alwaysUseFloat && value >> 0 === value) {
              if (value >= -24) {
                target[position2++] = 31 - value;
              } else if (value >= -256) {
                target[position2++] = 56;
                target[position2++] = ~value;
              } else if (value >= -65536) {
                target[position2++] = 57;
                targetView.setUint16(position2, ~value);
                position2 += 2;
              } else {
                target[position2++] = 58;
                targetView.setUint32(position2, ~value);
                position2 += 4;
              }
            } else if (!this.alwaysUseFloat && value < 0 && value >= -4294967296 && Math.floor(value) === value) {
              target[position2++] = 58;
              targetView.setUint32(position2, -1 - value);
              position2 += 4;
            } else {
              let useFloat32;
              if ((useFloat32 = this.useFloat32) > 0 && value < 4294967296 && value >= -2147483648) {
                target[position2++] = 250;
                targetView.setFloat32(position2, value);
                let xShifted;
                if (useFloat32 < 4 || // this checks for rounding of numbers that were encoded in 32-bit float to nearest significant decimal digit that could be preserved
                (xShifted = value * mult10[(target[position2] & 127) << 1 | target[position2 + 1] >> 7]) >> 0 === xShifted) {
                  position2 += 4;
                  return;
                } else
                  position2--;
              }
              target[position2++] = 251;
              targetView.setFloat64(position2, value);
              position2 += 8;
            }
          } else if (type === "object") {
            if (!value)
              target[position2++] = 246;
            else {
              if (referenceMap2) {
                let referee = referenceMap2.get(value);
                if (referee) {
                  target[position2++] = 216;
                  target[position2++] = 29;
                  target[position2++] = 25;
                  if (!referee.references) {
                    let idsToInsert = referenceMap2.idsToInsert || (referenceMap2.idsToInsert = []);
                    referee.references = [];
                    idsToInsert.push(referee);
                  }
                  referee.references.push(position2 - start);
                  position2 += 2;
                  return;
                } else
                  referenceMap2.set(value, { offset: position2 - start });
              }
              let constructor = value.constructor;
              if (constructor === Object) {
                if (this.skipFunction === true) {
                  value = Object.fromEntries([...Object.keys(value).filter((x) => typeof value[x] !== "function").map((x) => [x, value[x]])]);
                }
                writeObject(value);
              } else if (constructor === Array) {
                length = value.length;
                if (length < 24) {
                  target[position2++] = 128 | length;
                } else {
                  writeArrayHeader(length);
                }
                for (let i = 0; i < length; i++) {
                  encode2(value[i]);
                }
              } else if (constructor === Map) {
                if (this.mapsAsObjects ? this.useTag259ForMaps !== false : this.useTag259ForMaps) {
                  target[position2++] = 217;
                  target[position2++] = 1;
                  target[position2++] = 3;
                }
                length = value.size;
                if (length < 24) {
                  target[position2++] = 160 | length;
                } else if (length < 256) {
                  target[position2++] = 184;
                  target[position2++] = length;
                } else if (length < 65536) {
                  target[position2++] = 185;
                  target[position2++] = length >> 8;
                  target[position2++] = length & 255;
                } else {
                  target[position2++] = 186;
                  targetView.setUint32(position2, length);
                  position2 += 4;
                }
                if (encoder.keyMap) {
                  for (let [key, entryValue] of value) {
                    encode2(encoder.encodeKey(key));
                    encode2(entryValue);
                  }
                } else {
                  for (let [key, entryValue] of value) {
                    encode2(key);
                    encode2(entryValue);
                  }
                }
              } else {
                for (let i = 0, l = extensions.length; i < l; i++) {
                  let extensionClass = extensionClasses[i];
                  if (value instanceof extensionClass) {
                    let extension = extensions[i];
                    let tag = extension.tag;
                    if (tag == void 0)
                      tag = extension.getTag && extension.getTag.call(this, value);
                    if (tag < 24) {
                      target[position2++] = 192 | tag;
                    } else if (tag < 256) {
                      target[position2++] = 216;
                      target[position2++] = tag;
                    } else if (tag < 65536) {
                      target[position2++] = 217;
                      target[position2++] = tag >> 8;
                      target[position2++] = tag & 255;
                    } else if (tag > -1) {
                      target[position2++] = 218;
                      targetView.setUint32(position2, tag);
                      position2 += 4;
                    }
                    extension.encode.call(this, value, encode2, makeRoom);
                    return;
                  }
                }
                if (value[Symbol.iterator]) {
                  if (throwOnIterable) {
                    let error = new Error("Iterable should be serialized as iterator");
                    error.iteratorNotHandled = true;
                    throw error;
                  }
                  target[position2++] = 159;
                  for (let entry of value) {
                    encode2(entry);
                  }
                  target[position2++] = 255;
                  return;
                }
                if (value[Symbol.asyncIterator] || isBlob(value)) {
                  let error = new Error("Iterable/blob should be serialized as iterator");
                  error.iteratorNotHandled = true;
                  throw error;
                }
                if (this.useToJSON && value.toJSON) {
                  const json = value.toJSON();
                  if (json !== value)
                    return encode2(json);
                }
                writeObject(value);
              }
            }
          } else if (type === "boolean") {
            target[position2++] = value ? 245 : 244;
          } else if (type === "bigint") {
            if (value < BigInt(1) << BigInt(64) && value >= 0) {
              target[position2++] = 27;
              targetView.setBigUint64(position2, value);
            } else if (value > -(BigInt(1) << BigInt(64)) && value < 0) {
              target[position2++] = 59;
              targetView.setBigUint64(position2, -value - BigInt(1));
            } else {
              if (this.largeBigIntToFloat) {
                target[position2++] = 251;
                targetView.setFloat64(position2, Number(value));
              } else {
                if (value >= BigInt(0))
                  target[position2++] = 194;
                else {
                  target[position2++] = 195;
                  value = BigInt(-1) - value;
                }
                let bytes = [];
                while (value) {
                  bytes.push(Number(value & BigInt(255)));
                  value >>= BigInt(8);
                }
                writeBuffer(new Uint8Array(bytes.reverse()), makeRoom);
                return;
              }
            }
            position2 += 8;
          } else if (type === "undefined") {
            target[position2++] = 247;
          } else {
            throw new Error("Unknown type: " + type);
          }
        };
        const writeObject = this.useRecords === false ? this.variableMapSize ? (object) => {
          let keys = Object.keys(object);
          let vals = Object.values(object);
          let length = keys.length;
          if (length < 24) {
            target[position2++] = 160 | length;
          } else if (length < 256) {
            target[position2++] = 184;
            target[position2++] = length;
          } else if (length < 65536) {
            target[position2++] = 185;
            target[position2++] = length >> 8;
            target[position2++] = length & 255;
          } else {
            target[position2++] = 186;
            targetView.setUint32(position2, length);
            position2 += 4;
          }
          let key;
          if (encoder.keyMap) {
            for (let i = 0; i < length; i++) {
              encode2(encoder.encodeKey(keys[i]));
              encode2(vals[i]);
            }
          } else {
            for (let i = 0; i < length; i++) {
              encode2(keys[i]);
              encode2(vals[i]);
            }
          }
        } : (object) => {
          target[position2++] = 185;
          let objectOffset = position2 - start;
          position2 += 2;
          let size = 0;
          if (encoder.keyMap) {
            for (let key in object) if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
              encode2(encoder.encodeKey(key));
              encode2(object[key]);
              size++;
            }
          } else {
            for (let key in object) if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
              encode2(key);
              encode2(object[key]);
              size++;
            }
          }
          target[objectOffset++ + start] = size >> 8;
          target[objectOffset + start] = size & 255;
        } : (object, skipValues) => {
          let nextTransition, transition = structures.transitions || (structures.transitions = /* @__PURE__ */ Object.create(null));
          let newTransitions = 0;
          let length = 0;
          let parentRecordId;
          let keys;
          if (this.keyMap) {
            keys = Object.keys(object).map((k) => this.encodeKey(k));
            length = keys.length;
            for (let i = 0; i < length; i++) {
              let key = keys[i];
              nextTransition = transition[key];
              if (!nextTransition) {
                nextTransition = transition[key] = /* @__PURE__ */ Object.create(null);
                newTransitions++;
              }
              transition = nextTransition;
            }
          } else {
            for (let key in object) if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key)) {
              nextTransition = transition[key];
              if (!nextTransition) {
                if (transition[RECORD_SYMBOL] & 1048576) {
                  parentRecordId = transition[RECORD_SYMBOL] & 65535;
                }
                nextTransition = transition[key] = /* @__PURE__ */ Object.create(null);
                newTransitions++;
              }
              transition = nextTransition;
              length++;
            }
          }
          let recordId = transition[RECORD_SYMBOL];
          if (recordId !== void 0) {
            recordId &= 65535;
            target[position2++] = 217;
            target[position2++] = recordId >> 8 | 224;
            target[position2++] = recordId & 255;
          } else {
            if (!keys)
              keys = transition.__keys__ || (transition.__keys__ = Object.keys(object));
            if (parentRecordId === void 0) {
              recordId = structures.nextId++;
              if (!recordId) {
                recordId = 0;
                structures.nextId = 1;
              }
              if (recordId >= MAX_STRUCTURES) {
                structures.nextId = (recordId = maxSharedStructures) + 1;
              }
            } else {
              recordId = parentRecordId;
            }
            structures[recordId] = keys;
            if (recordId < maxSharedStructures) {
              target[position2++] = 217;
              target[position2++] = recordId >> 8 | 224;
              target[position2++] = recordId & 255;
              transition = structures.transitions;
              for (let i = 0; i < length; i++) {
                if (transition[RECORD_SYMBOL] === void 0 || transition[RECORD_SYMBOL] & 1048576)
                  transition[RECORD_SYMBOL] = recordId;
                transition = transition[keys[i]];
              }
              transition[RECORD_SYMBOL] = recordId | 1048576;
              hasSharedUpdate = true;
            } else {
              transition[RECORD_SYMBOL] = recordId;
              targetView.setUint32(position2, 3655335680);
              position2 += 3;
              if (newTransitions)
                transitionsCount += serializationsSinceTransitionRebuild * newTransitions;
              if (recordIdsToRemove.length >= MAX_STRUCTURES - maxSharedStructures)
                recordIdsToRemove.shift()[RECORD_SYMBOL] = void 0;
              recordIdsToRemove.push(transition);
              writeArrayHeader(length + 2);
              encode2(57344 + recordId);
              encode2(keys);
              if (skipValues) return;
              for (let key in object)
                if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key))
                  encode2(object[key]);
              return;
            }
          }
          if (length < 24) {
            target[position2++] = 128 | length;
          } else {
            writeArrayHeader(length);
          }
          if (skipValues) return;
          for (let key in object)
            if (typeof object.hasOwnProperty !== "function" || object.hasOwnProperty(key))
              encode2(object[key]);
        };
        const makeRoom = (end) => {
          let newSize;
          if (end > 16777216) {
            if (end - start > MAX_BUFFER_SIZE)
              throw new Error("Encoded buffer would be larger than maximum buffer size");
            newSize = Math.min(
              MAX_BUFFER_SIZE,
              Math.round(Math.max((end - start) * (end > 67108864 ? 1.25 : 2), 4194304) / 4096) * 4096
            );
          } else
            newSize = (Math.max(end - start << 2, target.length - 1) >> 12) + 1 << 12;
          let newBuffer = new ByteArrayAllocate(newSize);
          targetView = new DataView(newBuffer.buffer, 0, newSize);
          if (target.copy)
            target.copy(newBuffer, 0, start, end);
          else
            newBuffer.set(target.slice(start, end));
          position2 -= start;
          start = 0;
          safeEnd = newBuffer.length - 10;
          return target = newBuffer;
        };
        let chunkThreshold = 100;
        let continuedChunkThreshold = 1e3;
        this.encodeAsIterable = function(value, options2) {
          return startEncoding(value, options2, encodeObjectAsIterable);
        };
        this.encodeAsAsyncIterable = function(value, options2) {
          return startEncoding(value, options2, encodeObjectAsAsyncIterable);
        };
        function* encodeObjectAsIterable(object, iterateProperties, finalIterable) {
          let constructor = object.constructor;
          if (constructor === Object) {
            let useRecords2 = encoder.useRecords !== false;
            if (useRecords2)
              writeObject(object, true);
            else
              writeEntityLength(Object.keys(object).length, 160);
            for (let key in object) {
              let value = object[key];
              if (!useRecords2) encode2(key);
              if (value && typeof value === "object") {
                if (iterateProperties[key])
                  yield* encodeObjectAsIterable(value, iterateProperties[key]);
                else
                  yield* tryEncode(value, iterateProperties, key);
              } else encode2(value);
            }
          } else if (constructor === Array) {
            let length = object.length;
            writeArrayHeader(length);
            for (let i = 0; i < length; i++) {
              let value = object[i];
              if (value && (typeof value === "object" || position2 - start > chunkThreshold)) {
                if (iterateProperties.element)
                  yield* encodeObjectAsIterable(value, iterateProperties.element);
                else
                  yield* tryEncode(value, iterateProperties, "element");
              } else encode2(value);
            }
          } else if (object[Symbol.iterator] && !object.buffer) {
            target[position2++] = 159;
            for (let value of object) {
              if (value && (typeof value === "object" || position2 - start > chunkThreshold)) {
                if (iterateProperties.element)
                  yield* encodeObjectAsIterable(value, iterateProperties.element);
                else
                  yield* tryEncode(value, iterateProperties, "element");
              } else encode2(value);
            }
            target[position2++] = 255;
          } else if (isBlob(object)) {
            writeEntityLength(object.size, 64);
            yield target.subarray(start, position2);
            yield object;
            restartEncoding();
          } else if (object[Symbol.asyncIterator]) {
            target[position2++] = 159;
            yield target.subarray(start, position2);
            yield object;
            restartEncoding();
            target[position2++] = 255;
          } else {
            encode2(object);
          }
          if (finalIterable && position2 > start) yield target.subarray(start, position2);
          else if (position2 - start > chunkThreshold) {
            yield target.subarray(start, position2);
            restartEncoding();
          }
        }
        function* tryEncode(value, iterateProperties, key) {
          let restart = position2 - start;
          try {
            encode2(value);
            if (position2 - start > chunkThreshold) {
              yield target.subarray(start, position2);
              restartEncoding();
            }
          } catch (error) {
            if (error.iteratorNotHandled) {
              iterateProperties[key] = {};
              position2 = start + restart;
              yield* encodeObjectAsIterable.call(this, value, iterateProperties[key]);
            } else throw error;
          }
        }
        function restartEncoding() {
          chunkThreshold = continuedChunkThreshold;
          encoder.encode(null, THROW_ON_ITERABLE);
        }
        function startEncoding(value, options2, encodeIterable) {
          if (options2 && options2.chunkThreshold)
            chunkThreshold = continuedChunkThreshold = options2.chunkThreshold;
          else
            chunkThreshold = 100;
          if (value && typeof value === "object") {
            encoder.encode(null, THROW_ON_ITERABLE);
            return encodeIterable(value, encoder.iterateProperties || (encoder.iterateProperties = {}), true);
          }
          return [encoder.encode(value)];
        }
        async function* encodeObjectAsAsyncIterable(value, iterateProperties) {
          for (let encodedValue of encodeObjectAsIterable(value, iterateProperties, true)) {
            let constructor = encodedValue.constructor;
            if (constructor === ByteArray || constructor === Uint8Array)
              yield encodedValue;
            else if (isBlob(encodedValue)) {
              let reader = encodedValue.stream().getReader();
              let next;
              while (!(next = await reader.read()).done) {
                yield next.value;
              }
            } else if (encodedValue[Symbol.asyncIterator]) {
              for await (let asyncValue of encodedValue) {
                restartEncoding();
                if (asyncValue)
                  yield* encodeObjectAsAsyncIterable(asyncValue, iterateProperties.async || (iterateProperties.async = {}));
                else yield encoder.encode(asyncValue);
              }
            } else {
              yield encodedValue;
            }
          }
        }
      }
      useBuffer(buffer) {
        target = buffer;
        targetView = new DataView(target.buffer, target.byteOffset, target.byteLength);
        position2 = 0;
      }
      clearSharedData() {
        if (this.structures)
          this.structures = [];
        if (this.sharedValues)
          this.sharedValues = void 0;
      }
      updateSharedData() {
        let lastVersion = this.sharedVersion || 0;
        this.sharedVersion = lastVersion + 1;
        let structuresCopy = this.structures.slice(0);
        let sharedData = new SharedData(structuresCopy, this.sharedValues, this.sharedVersion);
        let saveResults = this.saveShared(
          sharedData,
          (existingShared) => (existingShared && existingShared.version || 0) == lastVersion
        );
        if (saveResults === false) {
          sharedData = this.getShared() || {};
          this.structures = sharedData.structures || [];
          this.sharedValues = sharedData.packedValues;
          this.sharedVersion = sharedData.version;
          this.structures.nextId = this.structures.length;
        } else {
          structuresCopy.forEach((structure, i) => this.structures[i] = structure);
        }
        return saveResults;
      }
    };
    SharedData = class {
      constructor(structures, values, version) {
        this.structures = structures;
        this.packedValues = values;
        this.version = version;
      }
    };
    BlobConstructor = typeof Blob === "undefined" ? function() {
    } : Blob;
    isLittleEndianMachine2 = new Uint8Array(new Uint16Array([1]).buffer)[0] == 1;
    extensionClasses = [
      Date,
      Set,
      Error,
      RegExp,
      Tag,
      ArrayBuffer,
      Uint8Array,
      Uint8ClampedArray,
      Uint16Array,
      Uint32Array,
      typeof BigUint64Array == "undefined" ? function() {
      } : BigUint64Array,
      Int8Array,
      Int16Array,
      Int32Array,
      typeof BigInt64Array == "undefined" ? function() {
      } : BigInt64Array,
      Float32Array,
      Float64Array,
      SharedData
    ];
    extensions = [
      {
        // Date
        tag: 1,
        encode(date, encode2) {
          let seconds = date.getTime() / 1e3;
          if ((this.useTimestamp32 || date.getMilliseconds() === 0) && seconds >= 0 && seconds < 4294967296) {
            target[position2++] = 26;
            targetView.setUint32(position2, seconds);
            position2 += 4;
          } else {
            target[position2++] = 251;
            targetView.setFloat64(position2, seconds);
            position2 += 8;
          }
        }
      },
      {
        // Set
        tag: 258,
        // https://github.com/input-output-hk/cbor-sets-spec/blob/master/CBOR_SETS.md
        encode(set, encode2) {
          let array = Array.from(set);
          encode2(array);
        }
      },
      {
        // Error
        tag: 27,
        // http://cbor.schmorp.de/generic-object
        encode(error, encode2) {
          encode2([error.name, error.message]);
        }
      },
      {
        // RegExp
        tag: 27,
        // http://cbor.schmorp.de/generic-object
        encode(regex, encode2) {
          encode2(["RegExp", regex.source, regex.flags]);
        }
      },
      {
        // Tag
        getTag(tag) {
          return tag.tag;
        },
        encode(tag, encode2) {
          encode2(tag.value);
        }
      },
      {
        // ArrayBuffer
        encode(arrayBuffer, encode2, makeRoom) {
          writeBuffer(arrayBuffer, makeRoom);
        }
      },
      {
        // Uint8Array
        getTag(typedArray) {
          if (typedArray.constructor === Uint8Array) {
            if (this.tagUint8Array || hasNodeBuffer && this.tagUint8Array !== false)
              return 64;
          }
        },
        encode(typedArray, encode2, makeRoom) {
          writeBuffer(typedArray, makeRoom);
        }
      },
      typedArrayEncoder(68, 1),
      typedArrayEncoder(69, 2),
      typedArrayEncoder(70, 4),
      typedArrayEncoder(71, 8),
      typedArrayEncoder(72, 1),
      typedArrayEncoder(77, 2),
      typedArrayEncoder(78, 4),
      typedArrayEncoder(79, 8),
      typedArrayEncoder(85, 4),
      typedArrayEncoder(86, 8),
      {
        encode(sharedData, encode2) {
          let packedValues2 = sharedData.packedValues || [];
          let sharedStructures = sharedData.structures || [];
          if (packedValues2.values.length > 0) {
            target[position2++] = 216;
            target[position2++] = 51;
            writeArrayHeader(4);
            let valuesArray = packedValues2.values;
            encode2(valuesArray);
            writeArrayHeader(0);
            writeArrayHeader(0);
            packedObjectMap = Object.create(sharedPackedObjectMap || null);
            for (let i = 0, l = valuesArray.length; i < l; i++) {
              packedObjectMap[valuesArray[i]] = i;
            }
          }
          if (sharedStructures) {
            targetView.setUint32(position2, 3655335424);
            position2 += 3;
            let definitions = sharedStructures.slice(0);
            definitions.unshift(57344);
            definitions.push(new Tag(sharedData.version, 1399353956));
            encode2(definitions);
          } else
            encode2(new Tag(sharedData.version, 1399353956));
        }
      }
    ];
    defaultEncoder = new Encoder({ useRecords: false });
    encode = defaultEncoder.encode;
    encodeAsIterable = defaultEncoder.encodeAsIterable;
    encodeAsAsyncIterable = defaultEncoder.encodeAsAsyncIterable;
    ({ NEVER, ALWAYS, DECIMAL_ROUND, DECIMAL_FIT } = FLOAT32_OPTIONS);
    REUSE_BUFFER_MODE = 512;
    RESET_BUFFER_MODE = 1024;
    THROW_ON_ITERABLE = 2048;
  }
});

// ../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/stream.js
import { Transform } from "stream";
var EncoderStream, DecoderStream;
var init_stream = __esm({
  "../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/stream.js"() {
    init_encode();
    init_decode();
    EncoderStream = class extends Transform {
      constructor(options) {
        if (!options)
          options = {};
        options.writableObjectMode = true;
        super(options);
        options.sequential = true;
        this.encoder = options.encoder || new Encoder(options);
      }
      async _transform(value, encoding, callback) {
        try {
          for await (let chunk of this.encoder.encodeAsAsyncIterable(value)) {
            this.push(chunk);
          }
          callback();
        } catch (error) {
          callback(error);
        }
      }
    };
    DecoderStream = class extends Transform {
      constructor(options) {
        if (!options)
          options = {};
        options.objectMode = true;
        super(options);
        options.structures = [];
        this.decoder = options.decoder || new Decoder(options);
      }
      _transform(chunk, encoding, callback) {
        if (this.incompleteBuffer) {
          chunk = Buffer.concat([this.incompleteBuffer, chunk]);
          this.incompleteBuffer = null;
        }
        let values;
        try {
          values = this.decoder.decodeMultiple(chunk);
        } catch (error) {
          if (error.incomplete) {
            this.incompleteBuffer = chunk.slice(error.lastPosition);
            values = error.values;
          } else {
            return callback(error);
          }
        } finally {
          for (let value of values || []) {
            if (value === null)
              value = this.getNullValue();
            this.push(value);
          }
        }
        callback();
      }
      getNullValue() {
        return Symbol.for(null);
      }
    };
  }
});

// ../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/iterators.js
function encodeIter(objectIterator, options = {}) {
  if (!objectIterator || typeof objectIterator !== "object") {
    throw new Error("first argument must be an Iterable, Async Iterable, or a Promise for an Async Iterable");
  } else if (typeof objectIterator[Symbol.iterator] === "function") {
    return encodeIterSync(objectIterator, options);
  } else if (typeof objectIterator.then === "function" || typeof objectIterator[Symbol.asyncIterator] === "function") {
    return encodeIterAsync(objectIterator, options);
  } else {
    throw new Error("first argument must be an Iterable, Async Iterable, Iterator, Async Iterator, or a Promise");
  }
}
function* encodeIterSync(objectIterator, options) {
  const encoder = new Encoder(options);
  for (const value of objectIterator) {
    yield encoder.encode(value);
  }
}
async function* encodeIterAsync(objectIterator, options) {
  const encoder = new Encoder(options);
  for await (const value of objectIterator) {
    yield encoder.encode(value);
  }
}
function decodeIter(bufferIterator, options = {}) {
  if (!bufferIterator || typeof bufferIterator !== "object") {
    throw new Error("first argument must be an Iterable, Async Iterable, Iterator, Async Iterator, or a promise");
  }
  const decoder2 = new Decoder(options);
  let incomplete;
  const parser = (chunk) => {
    let yields;
    if (incomplete) {
      chunk = Buffer.concat([incomplete, chunk]);
      incomplete = void 0;
    }
    try {
      yields = decoder2.decodeMultiple(chunk);
    } catch (err) {
      if (err.incomplete) {
        incomplete = chunk.slice(err.lastPosition);
        yields = err.values;
      } else {
        throw err;
      }
    }
    return yields;
  };
  if (typeof bufferIterator[Symbol.iterator] === "function") {
    return (function* iter() {
      for (const value of bufferIterator) {
        yield* parser(value);
      }
    })();
  } else if (typeof bufferIterator[Symbol.asyncIterator] === "function") {
    return (async function* iter() {
      for await (const value of bufferIterator) {
        yield* parser(value);
      }
    })();
  }
}
var init_iterators = __esm({
  "../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/iterators.js"() {
    init_encode();
    init_decode();
  }
});

// ../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/process.js
var require_process = __commonJS({
  "../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/process.js"(exports, module) {
    "use strict";
    var isLinux = () => process.platform === "linux";
    var report = null;
    var getReport = () => {
      if (!report) {
        if (isLinux() && process.report) {
          const orig = process.report.excludeNetwork;
          process.report.excludeNetwork = true;
          report = process.report.getReport();
          process.report.excludeNetwork = orig;
        } else {
          report = {};
        }
      }
      return report;
    };
    module.exports = { isLinux, getReport };
  }
});

// ../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/filesystem.js
var require_filesystem = __commonJS({
  "../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/filesystem.js"(exports, module) {
    "use strict";
    var fs = __require("fs");
    var LDD_PATH = "/usr/bin/ldd";
    var SELF_PATH = "/proc/self/exe";
    var MAX_LENGTH = 2048;
    var readFileSync = (path) => {
      const fd = fs.openSync(path, "r");
      const buffer = Buffer.alloc(MAX_LENGTH);
      const bytesRead = fs.readSync(fd, buffer, 0, MAX_LENGTH, 0);
      fs.close(fd, () => {
      });
      return buffer.subarray(0, bytesRead);
    };
    var readFile = (path) => new Promise((resolve, reject) => {
      fs.open(path, "r", (err, fd) => {
        if (err) {
          reject(err);
        } else {
          const buffer = Buffer.alloc(MAX_LENGTH);
          fs.read(fd, buffer, 0, MAX_LENGTH, 0, (_, bytesRead) => {
            resolve(buffer.subarray(0, bytesRead));
            fs.close(fd, () => {
            });
          });
        }
      });
    });
    module.exports = {
      LDD_PATH,
      SELF_PATH,
      readFileSync,
      readFile
    };
  }
});

// ../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/elf.js
var require_elf = __commonJS({
  "../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/elf.js"(exports, module) {
    "use strict";
    var interpreterPath = (elf) => {
      if (elf.length < 64) {
        return null;
      }
      if (elf.readUInt32BE(0) !== 2135247942) {
        return null;
      }
      if (elf.readUInt8(4) !== 2) {
        return null;
      }
      if (elf.readUInt8(5) !== 1) {
        return null;
      }
      const offset = elf.readUInt32LE(32);
      const size = elf.readUInt16LE(54);
      const count = elf.readUInt16LE(56);
      for (let i = 0; i < count; i++) {
        const headerOffset = offset + i * size;
        const type = elf.readUInt32LE(headerOffset);
        if (type === 3) {
          const fileOffset = elf.readUInt32LE(headerOffset + 8);
          const fileSize = elf.readUInt32LE(headerOffset + 32);
          return elf.subarray(fileOffset, fileOffset + fileSize).toString().replace(/\0.*$/g, "");
        }
      }
      return null;
    };
    module.exports = {
      interpreterPath
    };
  }
});

// ../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/detect-libc.js
var require_detect_libc = __commonJS({
  "../../../node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/lib/detect-libc.js"(exports, module) {
    "use strict";
    var childProcess = __require("child_process");
    var { isLinux, getReport } = require_process();
    var { LDD_PATH, SELF_PATH, readFile, readFileSync } = require_filesystem();
    var { interpreterPath } = require_elf();
    var cachedFamilyInterpreter;
    var cachedFamilyFilesystem;
    var cachedVersionFilesystem;
    var command = "getconf GNU_LIBC_VERSION 2>&1 || true; ldd --version 2>&1 || true";
    var commandOut = "";
    var safeCommand = () => {
      if (!commandOut) {
        return new Promise((resolve) => {
          childProcess.exec(command, (err, out) => {
            commandOut = err ? " " : out;
            resolve(commandOut);
          });
        });
      }
      return commandOut;
    };
    var safeCommandSync = () => {
      if (!commandOut) {
        try {
          commandOut = childProcess.execSync(command, { encoding: "utf8" });
        } catch (_err) {
          commandOut = " ";
        }
      }
      return commandOut;
    };
    var GLIBC = "glibc";
    var RE_GLIBC_VERSION = /LIBC[a-z0-9 \-).]*?(\d+\.\d+)/i;
    var MUSL = "musl";
    var isFileMusl = (f) => f.includes("libc.musl-") || f.includes("ld-musl-");
    var familyFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return GLIBC;
      }
      if (Array.isArray(report.sharedObjects)) {
        if (report.sharedObjects.some(isFileMusl)) {
          return MUSL;
        }
      }
      return null;
    };
    var familyFromCommand = (out) => {
      const [getconf, ldd1] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return GLIBC;
      }
      if (ldd1 && ldd1.includes(MUSL)) {
        return MUSL;
      }
      return null;
    };
    var familyFromInterpreterPath = (path) => {
      if (path) {
        if (path.includes("/ld-musl-")) {
          return MUSL;
        } else if (path.includes("/ld-linux-")) {
          return GLIBC;
        }
      }
      return null;
    };
    var getFamilyFromLddContent = (content) => {
      content = content.toString();
      if (content.includes("musl")) {
        return MUSL;
      }
      if (content.includes("GNU C Library")) {
        return GLIBC;
      }
      return null;
    };
    var familyFromFilesystem = async () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = await readFile(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var familyFromFilesystemSync = () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = readFileSync(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var familyFromInterpreter = async () => {
      if (cachedFamilyInterpreter !== void 0) {
        return cachedFamilyInterpreter;
      }
      cachedFamilyInterpreter = null;
      try {
        const selfContent = await readFile(SELF_PATH);
        const path = interpreterPath(selfContent);
        cachedFamilyInterpreter = familyFromInterpreterPath(path);
      } catch (e) {
      }
      return cachedFamilyInterpreter;
    };
    var familyFromInterpreterSync = () => {
      if (cachedFamilyInterpreter !== void 0) {
        return cachedFamilyInterpreter;
      }
      cachedFamilyInterpreter = null;
      try {
        const selfContent = readFileSync(SELF_PATH);
        const path = interpreterPath(selfContent);
        cachedFamilyInterpreter = familyFromInterpreterPath(path);
      } catch (e) {
      }
      return cachedFamilyInterpreter;
    };
    var family = async () => {
      let family2 = null;
      if (isLinux()) {
        family2 = await familyFromInterpreter();
        if (!family2) {
          family2 = await familyFromFilesystem();
          if (!family2) {
            family2 = familyFromReport();
          }
          if (!family2) {
            const out = await safeCommand();
            family2 = familyFromCommand(out);
          }
        }
      }
      return family2;
    };
    var familySync = () => {
      let family2 = null;
      if (isLinux()) {
        family2 = familyFromInterpreterSync();
        if (!family2) {
          family2 = familyFromFilesystemSync();
          if (!family2) {
            family2 = familyFromReport();
          }
          if (!family2) {
            const out = safeCommandSync();
            family2 = familyFromCommand(out);
          }
        }
      }
      return family2;
    };
    var isNonGlibcLinux = async () => isLinux() && await family() !== GLIBC;
    var isNonGlibcLinuxSync = () => isLinux() && familySync() !== GLIBC;
    var versionFromFilesystem = async () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = await readFile(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromFilesystemSync = () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = readFileSync(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return report.header.glibcVersionRuntime;
      }
      return null;
    };
    var versionSuffix = (s) => s.trim().split(/\s+/)[1];
    var versionFromCommand = (out) => {
      const [getconf, ldd1, ldd2] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return versionSuffix(getconf);
      }
      if (ldd1 && ldd2 && ldd1.includes(MUSL)) {
        return versionSuffix(ldd2);
      }
      return null;
    };
    var version = async () => {
      let version2 = null;
      if (isLinux()) {
        version2 = await versionFromFilesystem();
        if (!version2) {
          version2 = versionFromReport();
        }
        if (!version2) {
          const out = await safeCommand();
          version2 = versionFromCommand(out);
        }
      }
      return version2;
    };
    var versionSync = () => {
      let version2 = null;
      if (isLinux()) {
        version2 = versionFromFilesystemSync();
        if (!version2) {
          version2 = versionFromReport();
        }
        if (!version2) {
          const out = safeCommandSync();
          version2 = versionFromCommand(out);
        }
      }
      return version2;
    };
    module.exports = {
      GLIBC,
      MUSL,
      family,
      familySync,
      isNonGlibcLinux,
      isNonGlibcLinuxSync,
      version,
      versionSync
    };
  }
});

// ../../../node_modules/.pnpm/node-gyp-build-optional-packages@5.1.1/node_modules/node-gyp-build-optional-packages/index.js
var require_node_gyp_build_optional_packages = __commonJS({
  "../../../node_modules/.pnpm/node-gyp-build-optional-packages@5.1.1/node_modules/node-gyp-build-optional-packages/index.js"(exports, module) {
    var fs = __require("fs");
    var path = __require("path");
    var url = __require("url");
    var vars = process.config && process.config.variables || {};
    var prebuildsOnly = !!process.env.PREBUILDS_ONLY;
    var versions = process.versions;
    var abi = versions.modules;
    if (versions.deno || process.isBun) {
      abi = "unsupported";
    }
    var runtime = isElectron() ? "electron" : "node";
    var arch = process.arch;
    var platform = process.platform;
    var libc = process.env.LIBC || (isMusl(platform) ? "musl" : "glibc");
    var armv = process.env.ARM_VERSION || (arch === "arm64" ? "8" : vars.arm_version) || "";
    var uv = (versions.uv || "").split(".")[0];
    module.exports = load;
    function load(dir) {
      if (typeof __webpack_require__ === "function")
        return __non_webpack_require__(load.path(dir));
      else
        return __require(load.path(dir));
    }
    load.path = function(dir) {
      dir = path.resolve(dir || ".");
      var packageName = "";
      try {
        if (typeof __webpack_require__ === "function")
          packageName = __non_webpack_require__(path.join(dir, "package.json")).name;
        else
          packageName = __require(path.join(dir, "package.json")).name;
        var varName = packageName.toUpperCase().replace(/-/g, "_") + "_PREBUILD";
        if (process.env[varName]) dir = process.env[varName];
      } catch (err) {
      }
      if (!prebuildsOnly) {
        var release = getFirst(path.join(dir, "build/Release"), matchBuild);
        if (release) return release;
        var debug = getFirst(path.join(dir, "build/Debug"), matchBuild);
        if (debug) return debug;
      }
      var prebuild = resolve(dir);
      if (prebuild) return prebuild;
      var nearby = resolve(path.dirname(process.execPath));
      if (nearby) return nearby;
      var platformPackage = (packageName[0] == "@" ? "" : "@" + packageName + "/") + packageName + "-" + platform + "-" + arch;
      try {
        var prebuildPackage = path.dirname(__require("module").createRequire(url.pathToFileURL(path.join(dir, "package.json"))).resolve(platformPackage));
        return resolveFile(prebuildPackage);
      } catch (error) {
      }
      var target2 = [
        "platform=" + platform,
        "arch=" + arch,
        "runtime=" + runtime,
        "abi=" + abi,
        "uv=" + uv,
        armv ? "armv=" + armv : "",
        "libc=" + libc,
        "node=" + process.versions.node,
        process.versions.electron ? "electron=" + process.versions.electron : "",
        typeof __webpack_require__ === "function" ? "webpack=true" : ""
        // eslint-disable-line
      ].filter(Boolean).join(" ");
      throw new Error("No native build was found for " + target2 + "\n    attempted loading from: " + dir + " and package: " + platformPackage + "\n");
      function resolve(dir2) {
        var tuples = readdirSync(path.join(dir2, "prebuilds")).map(parseTuple);
        var tuple = tuples.filter(matchTuple(platform, arch)).sort(compareTuples)[0];
        if (!tuple) return;
        return resolveFile(path.join(dir2, "prebuilds", tuple.name));
      }
      function resolveFile(prebuilds) {
        var parsed = readdirSync(prebuilds).map(parseTags);
        var candidates = parsed.filter(matchTags(runtime, abi));
        var winner = candidates.sort(compareTags(runtime))[0];
        if (winner) return path.join(prebuilds, winner.file);
      }
    };
    function readdirSync(dir) {
      try {
        return fs.readdirSync(dir);
      } catch (err) {
        return [];
      }
    }
    function getFirst(dir, filter) {
      var files = readdirSync(dir).filter(filter);
      return files[0] && path.join(dir, files[0]);
    }
    function matchBuild(name) {
      return /\.node$/.test(name);
    }
    function parseTuple(name) {
      var arr = name.split("-");
      if (arr.length !== 2) return;
      var platform2 = arr[0];
      var architectures = arr[1].split("+");
      if (!platform2) return;
      if (!architectures.length) return;
      if (!architectures.every(Boolean)) return;
      return { name, platform: platform2, architectures };
    }
    function matchTuple(platform2, arch2) {
      return function(tuple) {
        if (tuple == null) return false;
        if (tuple.platform !== platform2) return false;
        return tuple.architectures.includes(arch2);
      };
    }
    function compareTuples(a, b) {
      return a.architectures.length - b.architectures.length;
    }
    function parseTags(file) {
      var arr = file.split(".");
      var extension = arr.pop();
      var tags = { file, specificity: 0 };
      if (extension !== "node") return;
      for (var i = 0; i < arr.length; i++) {
        var tag = arr[i];
        if (tag === "node" || tag === "electron" || tag === "node-webkit") {
          tags.runtime = tag;
        } else if (tag === "napi") {
          tags.napi = true;
        } else if (tag.slice(0, 3) === "abi") {
          tags.abi = tag.slice(3);
        } else if (tag.slice(0, 2) === "uv") {
          tags.uv = tag.slice(2);
        } else if (tag.slice(0, 4) === "armv") {
          tags.armv = tag.slice(4);
        } else if (tag === "glibc" || tag === "musl") {
          tags.libc = tag;
        } else {
          continue;
        }
        tags.specificity++;
      }
      return tags;
    }
    function matchTags(runtime2, abi2) {
      return function(tags) {
        if (tags == null) return false;
        if (tags.runtime !== runtime2 && !runtimeAgnostic(tags)) return false;
        if (tags.abi !== abi2 && !tags.napi) return false;
        if (tags.uv && tags.uv !== uv) return false;
        if (tags.armv && tags.armv !== armv) return false;
        if (tags.libc && tags.libc !== libc) return false;
        return true;
      };
    }
    function runtimeAgnostic(tags) {
      return tags.runtime === "node" && tags.napi;
    }
    function compareTags(runtime2) {
      return function(a, b) {
        if (a.runtime !== b.runtime) {
          return a.runtime === runtime2 ? -1 : 1;
        } else if (a.abi !== b.abi) {
          return a.abi ? -1 : 1;
        } else if (a.specificity !== b.specificity) {
          return a.specificity > b.specificity ? -1 : 1;
        } else {
          return 0;
        }
      };
    }
    function isElectron() {
      if (process.versions && process.versions.electron) return true;
      if (process.env.ELECTRON_RUN_AS_NODE) return true;
      return typeof window !== "undefined" && window.process && window.process.type === "renderer";
    }
    function isMusl(platform2) {
      if (platform2 !== "linux") return false;
      const { familySync, MUSL } = require_detect_libc();
      return familySync() === MUSL;
    }
    load.parseTags = parseTags;
    load.matchTags = matchTags;
    load.compareTags = compareTags;
    load.parseTuple = parseTuple;
    load.matchTuple = matchTuple;
    load.compareTuples = compareTuples;
  }
});

// ../../../node_modules/.pnpm/cbor-extract@2.2.2/node_modules/cbor-extract/index.js
var require_cbor_extract = __commonJS({
  "../../../node_modules/.pnpm/cbor-extract@2.2.2/node_modules/cbor-extract/index.js"(exports, module) {
    module.exports = require_node_gyp_build_optional_packages()(__dirname);
  }
});

// ../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/node-index.js
var node_index_exports = {};
__export(node_index_exports, {
  ALWAYS: () => ALWAYS,
  DECIMAL_FIT: () => DECIMAL_FIT,
  DECIMAL_ROUND: () => DECIMAL_ROUND,
  Decoder: () => Decoder,
  DecoderStream: () => DecoderStream,
  Encoder: () => Encoder,
  EncoderStream: () => EncoderStream,
  FLOAT32_OPTIONS: () => FLOAT32_OPTIONS,
  NEVER: () => NEVER,
  REUSE_BUFFER_MODE: () => REUSE_BUFFER_MODE,
  Tag: () => Tag,
  addExtension: () => addExtension2,
  clearSource: () => clearSource,
  decode: () => decode,
  decodeIter: () => decodeIter,
  decodeMultiple: () => decodeMultiple,
  encode: () => encode,
  encodeAsAsyncIterable: () => encodeAsAsyncIterable,
  encodeAsIterable: () => encodeAsIterable,
  encodeIter: () => encodeIter,
  isNativeAccelerationEnabled: () => isNativeAccelerationEnabled,
  mapsAsObjects: () => mapsAsObjects,
  roundFloat32: () => roundFloat32,
  setSizeLimits: () => setSizeLimits,
  useRecords: () => useRecords
});
import { createRequire } from "module";
var useRecords, mapsAsObjects, nativeAccelerationDisabled;
var init_node_index = __esm({
  "../../../node_modules/.pnpm/cbor-x@1.6.4/node_modules/cbor-x/node-index.js"() {
    init_encode();
    init_decode();
    init_stream();
    init_iterators();
    init_decode();
    useRecords = false;
    mapsAsObjects = true;
    nativeAccelerationDisabled = process.env.CBOR_NATIVE_ACCELERATION_DISABLED !== void 0 && process.env.CBOR_NATIVE_ACCELERATION_DISABLED.toLowerCase() === "true";
    if (!nativeAccelerationDisabled) {
      let extractor;
      try {
        if (typeof __require == "function")
          extractor = require_cbor_extract();
        else
          extractor = createRequire(import.meta.url)("cbor-extract");
        if (extractor)
          setExtractor(extractor.extractStrings);
      } catch (error) {
      }
    }
  }
});

// ../../apps/register/src/cli.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// ../../apps/register/src/provision.ts
import { randomUUID } from "node:crypto";

// ../../libs/privy-admin/src/policy-method.ts
var DELEGATION_POLICY_ALLOW_METHOD = "*";
var ETHEREUM_POLICY_DENY_CHAIN_IDS = [
  "1",
  "10",
  "56",
  "137",
  "8453",
  "84532",
  "42161",
  "11155111"
];
var DENIED_MODE_C_POLICY_METHODS = [
  "exportPrivateKey",
  "exportSeedPhrase",
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_signUserOperation",
  "eth_signTypedData_v4",
  "personal_sign",
  "eth_sign7702Authorization",
  "wallet_sendCalls",
  "signTransaction",
  "signAndSendTransaction",
  "transfer",
  "earn_deposit",
  "earn_withdraw",
  "signTransactionBytes"
];

// ../../libs/privy-admin/src/policy.ts
var DEFAULT_POLICY_NAME = "Mandate Mode C delegation signing";
var ETHEREUM_TX_CHAIN_DENY_CONDITION = {
  field_source: "ethereum_transaction",
  field: "chain_id",
  operator: "in",
  value: [...ETHEREUM_POLICY_DENY_CHAIN_IDS]
};
var EARN_AMOUNT_DENY_CONDITION = {
  field_source: "action_request_body",
  field: "amount",
  operator: "gte",
  value: "0"
};
var TRANSFER_DENY_CONDITION = {
  field_source: "action_request_body",
  field: "source.amount",
  operator: "gte",
  value: "0"
};
var ETH_SIGN7702_DENY_CONDITION = {
  field_source: "ethereum_7702_authorization",
  field: "contract",
  operator: "eq",
  value: "0x0000000000000000000000000000000000000001"
};
var ALWAYS_DENY_SYSTEM_CONDITION = {
  field_source: "system",
  field: "current_unix_timestamp",
  operator: "gte",
  value: "0"
};
function denyConditionsForMethod(method) {
  switch (method) {
    case "exportPrivateKey":
    case "exportSeedPhrase":
    case "signTransaction":
    case "signAndSendTransaction":
    case "signTransactionBytes":
      return [ALWAYS_DENY_SYSTEM_CONDITION];
    case "eth_sendTransaction":
    case "eth_signTransaction":
    case "eth_signUserOperation":
    case "wallet_sendCalls":
      return [ETHEREUM_TX_CHAIN_DENY_CONDITION];
    case "transfer":
      return [TRANSFER_DENY_CONDITION];
    case "personal_sign":
      return [ALWAYS_DENY_SYSTEM_CONDITION];
    case "eth_signTypedData_v4":
      return ETHEREUM_POLICY_DENY_CHAIN_IDS.map((chainId) => ({
        field_source: "ethereum_typed_data_domain",
        field: "chainId",
        operator: "eq",
        value: chainId
      }));
    case "eth_sign7702Authorization":
      return [ETH_SIGN7702_DENY_CONDITION];
    case "earn_deposit":
    case "earn_withdraw":
      return [EARN_AMOUNT_DENY_CONDITION];
    default:
      return [];
  }
}
function buildDeniedModeCRules() {
  const rules = [];
  for (const method of DENIED_MODE_C_POLICY_METHODS) {
    const conditions = denyConditionsForMethod(method);
    if (method === "eth_signTypedData_v4") {
      for (const condition of conditions) {
        rules.push({
          name: `Deny ${method} chain ${condition.value}`,
          method,
          conditions: [condition],
          action: "DENY"
        });
      }
      continue;
    }
    rules.push({
      name: `Deny ${method}`,
      method,
      conditions,
      action: "DENY"
    });
  }
  return rules;
}
function buildDelegationSigningPolicy(name = DEFAULT_POLICY_NAME) {
  return {
    version: "1.0",
    name,
    chain_type: "ethereum",
    rules: [
      {
        name: "Allow delegation signing",
        method: DELEGATION_POLICY_ALLOW_METHOD,
        conditions: [],
        action: "ALLOW"
      },
      ...buildDeniedModeCRules()
    ]
  };
}
async function createDelegationSigningPolicy(client, name) {
  const body = buildDelegationSigningPolicy(name);
  return client.createPolicy(body);
}

// ../../libs/privy-admin/src/privy-rest-error.ts
var PrivyRestError = class extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "PrivyRestError";
  }
};

// ../../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/cryptoNode.js
import * as nc from "node:crypto";
var crypto2 = nc && typeof nc === "object" && "webcrypto" in nc ? nc.webcrypto : nc && typeof nc === "object" && "randomBytes" in nc ? nc : void 0;

// ../../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto2 && typeof crypto2.getRandomValues === "function") {
    return crypto2.getRandomValues(new Uint8Array(bytesLength));
  }
  if (crypto2 && typeof crypto2.randomBytes === "function") {
    return Uint8Array.from(crypto2.randomBytes(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}

// ../../../node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/utils.js
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
function _abool2(value, title = "") {
  if (typeof value !== "boolean") {
    const prefix = title && `"${title}"`;
    throw new Error(prefix + "expected boolean, got type=" + typeof value);
  }
  return value;
}
function _abytes2(value, length, title = "") {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function numberToHexUnpadded(num) {
  const hex = num.toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  abytes(bytes);
  return hexToNumber(bytesToHex(Uint8Array.from(bytes).reverse()));
}
function numberToBytesBE(n, len) {
  return hexToBytes(n.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function ensureBytes(title, hex, expectedLength) {
  let res;
  if (typeof hex === "string") {
    try {
      res = hexToBytes(hex);
    } catch (e) {
      throw new Error(title + " must be hex string or Uint8Array, cause: " + e);
    }
  } else if (isBytes(hex)) {
    res = Uint8Array.from(hex);
  } else {
    throw new Error(title + " must be hex string or Uint8Array");
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(title + " of length " + expectedLength + " expected, got " + len);
  return res;
}
var isPosBig = (n) => typeof n === "bigint" && _0n <= n;
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new Error("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
var bitMask = (n) => (_1n << BigInt(n)) - _1n;
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  if (typeof hashLen !== "number" || hashLen < 2)
    throw new Error("hashLen must be a number");
  if (typeof qByteLen !== "number" || qByteLen < 2)
    throw new Error("qByteLen must be a number");
  if (typeof hmacFn !== "function")
    throw new Error("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const u8of = (byte) => Uint8Array.of(byte);
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...b) => hmacFn(k, v, ...b);
  const reseed = (seed = u8n(0)) => {
    k = h(u8of(0), seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(u8of(1), seed);
    v = h();
  };
  const gen = () => {
    if (i++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while (!(res = pred(gen())))
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function _validateObject(object, fields, optFields = {}) {
  if (!object || typeof object !== "object")
    throw new Error("expected valid options object");
  function checkField(fieldName, expectedType, isOpt) {
    const val = object[fieldName];
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  }
  Object.entries(fields).forEach(([k, v]) => checkField(k, v, false));
  Object.entries(optFields).forEach(([k, v]) => checkField(k, v, true));
}
function memoized(fn) {
  const map = /* @__PURE__ */ new WeakMap();
  return (arg, ...args) => {
    const val = map.get(arg);
    if (val !== void 0)
      return val;
    const computed = fn(arg, ...args);
    map.set(arg, computed);
    return computed;
  };
}

// ../../../node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/modular.js
var _0n2 = BigInt(0);
var _1n2 = BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _7n = /* @__PURE__ */ BigInt(7);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _16n = /* @__PURE__ */ BigInt(16);
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp, root, n) {
  if (!Fp.eql(Fp.sqr(root), n))
    throw new Error("Cannot find square root");
}
function sqrt3mod4(Fp, n) {
  const p1div4 = (Fp.ORDER + _1n2) / _4n;
  const root = Fp.pow(n, p1div4);
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const p5div8 = (Fp.ORDER - _5n) / _8n;
  const n2 = Fp.mul(n, _2n);
  const v = Fp.pow(n2, p5div8);
  const nv = Fp.mul(n, v);
  const i = Fp.mul(Fp.mul(nv, _2n), v);
  const root = Fp.mul(nv, Fp.sub(i, Fp.ONE));
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return (Fp, n) => {
    let tv1 = Fp.pow(n, c4);
    let tv2 = Fp.mul(tv1, c1);
    const tv3 = Fp.mul(tv1, c2);
    const tv4 = Fp.mul(tv1, c3);
    const e1 = Fp.eql(Fp.sqr(tv2), n);
    const e2 = Fp.eql(Fp.sqr(tv3), n);
    tv1 = Fp.cmov(tv1, tv2, e1);
    tv2 = Fp.cmov(tv4, tv3, e2);
    const e3 = Fp.eql(Fp.sqr(tv2), n);
    const root = Fp.cmov(tv1, tv2, e3);
    assertIsSquare(Fp, root, n);
    return root;
  };
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    if (Fp.is0(n))
      return n;
    if (FpLegendre(Fp, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = Fp.mul(Fp.ONE, cc);
    let t = Fp.pow(n, Q);
    let R = Fp.pow(n, Q1div2);
    while (!Fp.eql(t, Fp.ONE)) {
      if (Fp.is0(t))
        return Fp.ZERO;
      let i = 1;
      let t_tmp = Fp.sqr(t);
      while (!Fp.eql(t_tmp, Fp.ONE)) {
        i++;
        t_tmp = Fp.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = Fp.pow(c, exponent);
      M = i;
      c = Fp.sqr(b);
      t = Fp.mul(t, c);
      R = Fp.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  _validateObject(field, opts);
  return field;
}
function FpPow(Fp, num, power) {
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return Fp.ONE;
  if (power === _1n2)
    return num;
  let p = Fp.ONE;
  let d = num;
  while (power > _0n2) {
    if (power & _1n2)
      p = Fp.mul(p, d);
    d = Fp.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (Fp.is0(num))
      return acc;
    inverted[i] = acc;
    return Fp.mul(acc, num);
  }, Fp.ONE);
  const invertedAcc = Fp.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (Fp.is0(num))
      return acc;
    inverted[i] = Fp.mul(acc, inverted[i]);
    return Fp.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  const p1mod2 = (Fp.ORDER - _1n2) / _2n;
  const powered = Fp.pow(n, p1mod2);
  const yes = Fp.eql(powered, Fp.ONE);
  const zero = Fp.eql(powered, Fp.ZERO);
  const no = Fp.eql(powered, Fp.neg(Fp.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber(nBitLength);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLenOrOpts, isLE = false, opts = {}) {
  if (ORDER <= _0n2)
    throw new Error("invalid field: expected ORDER > 0, got " + ORDER);
  let _nbitLength = void 0;
  let _sqrt = void 0;
  let modFromBytes = false;
  let allowedLengths = void 0;
  if (typeof bitLenOrOpts === "object" && bitLenOrOpts != null) {
    if (opts.sqrt || isLE)
      throw new Error("cannot specify opts in two arguments");
    const _opts = bitLenOrOpts;
    if (_opts.BITS)
      _nbitLength = _opts.BITS;
    if (_opts.sqrt)
      _sqrt = _opts.sqrt;
    if (typeof _opts.isLE === "boolean")
      isLE = _opts.isLE;
    if (typeof _opts.modFromBytes === "boolean")
      modFromBytes = _opts.modFromBytes;
    allowedLengths = _opts.allowedLengths;
  } else {
    if (typeof bitLenOrOpts === "number")
      _nbitLength = bitLenOrOpts;
    if (opts.sqrt)
      _sqrt = opts.sqrt;
  }
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, _nbitLength);
  if (BYTES > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let sqrtP;
  const f = Object.freeze({
    ORDER,
    isLE,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n2,
    ONE: _1n2,
    allowedLengths,
    create: (num) => mod(num, ORDER),
    isValid: (num) => {
      if (typeof num !== "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof num);
      return _0n2 <= num && num < ORDER;
    },
    is0: (num) => num === _0n2,
    // is valid and invertible
    isValidNot0: (num) => !f.is0(num) && f.isValid(num),
    isOdd: (num) => (num & _1n2) === _1n2,
    neg: (num) => mod(-num, ORDER),
    eql: (lhs, rhs) => lhs === rhs,
    sqr: (num) => mod(num * num, ORDER),
    add: (lhs, rhs) => mod(lhs + rhs, ORDER),
    sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
    mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
    pow: (num, power) => FpPow(f, num, power),
    div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
    // Same as above, but doesn't normalize
    sqrN: (num) => num * num,
    addN: (lhs, rhs) => lhs + rhs,
    subN: (lhs, rhs) => lhs - rhs,
    mulN: (lhs, rhs) => lhs * rhs,
    inv: (num) => invert(num, ORDER),
    sqrt: _sqrt || ((n) => {
      if (!sqrtP)
        sqrtP = FpSqrt(ORDER);
      return sqrtP(f, n);
    }),
    toBytes: (num) => isLE ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES),
    fromBytes: (bytes, skipValidation = true) => {
      if (allowedLengths) {
        if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
          throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
        }
        const padded = new Uint8Array(BYTES);
        padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
        bytes = padded;
      }
      if (bytes.length !== BYTES)
        throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
      let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
      if (modFromBytes)
        scalar = mod(scalar, ORDER);
      if (!skipValidation) {
        if (!f.isValid(scalar))
          throw new Error("invalid field element: outside of range 0..ORDER");
      }
      return scalar;
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (lst) => FpInvertBatch(f, lst),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (a, b, c) => c ? b : a
  });
  return Object.freeze(f);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  const bitLength = fieldOrder.toString(2).length;
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE = false) {
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = getMinHashLength(fieldOrder);
  if (len < 16 || len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num = isLE ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num, fieldOrder - _1n2) + _1n2;
  return isLE ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// ../../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView2 = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView2, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var SHA384_IV = /* @__PURE__ */ Uint32Array.from([
  3418070365,
  3238371032,
  1654270250,
  914150663,
  2438529370,
  812702999,
  355462360,
  4144912697,
  1731405415,
  4290775857,
  2394180231,
  1750603025,
  3675008525,
  1694076839,
  1203062813,
  3204075428
]);
var SHA512_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]);

// ../../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/_u64.js
var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
var _32n = /* @__PURE__ */ BigInt(32);
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var shrSH = (h, _l, s) => h >>> s;
var shrSL = (h, l, s) => h << 32 - s | l >>> s;
var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;

// ../../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var K512 = /* @__PURE__ */ (() => split([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((n) => BigInt(n))))();
var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
var SHA512 = class extends HashMD {
  constructor(outputLen = 64) {
    super(128, outputLen, 16, false);
    this.Ah = SHA512_IV[0] | 0;
    this.Al = SHA512_IV[1] | 0;
    this.Bh = SHA512_IV[2] | 0;
    this.Bl = SHA512_IV[3] | 0;
    this.Ch = SHA512_IV[4] | 0;
    this.Cl = SHA512_IV[5] | 0;
    this.Dh = SHA512_IV[6] | 0;
    this.Dl = SHA512_IV[7] | 0;
    this.Eh = SHA512_IV[8] | 0;
    this.El = SHA512_IV[9] | 0;
    this.Fh = SHA512_IV[10] | 0;
    this.Fl = SHA512_IV[11] | 0;
    this.Gh = SHA512_IV[12] | 0;
    this.Gl = SHA512_IV[13] | 0;
    this.Hh = SHA512_IV[14] | 0;
    this.Hl = SHA512_IV[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
  }
  // prettier-ignore
  set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
    this.Ah = Ah | 0;
    this.Al = Al | 0;
    this.Bh = Bh | 0;
    this.Bl = Bl | 0;
    this.Ch = Ch | 0;
    this.Cl = Cl | 0;
    this.Dh = Dh | 0;
    this.Dl = Dl | 0;
    this.Eh = Eh | 0;
    this.El = El | 0;
    this.Fh = Fh | 0;
    this.Fl = Fl | 0;
    this.Gh = Gh | 0;
    this.Gl = Gl | 0;
    this.Hh = Hh | 0;
    this.Hl = Hl | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4) {
      SHA512_W_H[i] = view.getUint32(offset);
      SHA512_W_L[i] = view.getUint32(offset += 4);
    }
    for (let i = 16; i < 80; i++) {
      const W15h = SHA512_W_H[i - 15] | 0;
      const W15l = SHA512_W_L[i - 15] | 0;
      const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
      const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
      const W2h = SHA512_W_H[i - 2] | 0;
      const W2l = SHA512_W_L[i - 2] | 0;
      const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
      const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
      const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
      const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
      SHA512_W_H[i] = SUMh | 0;
      SHA512_W_L[i] = SUMl | 0;
    }
    let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
    for (let i = 0; i < 80; i++) {
      const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
      const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
      const CHIh = Eh & Fh ^ ~Eh & Gh;
      const CHIl = El & Fl ^ ~El & Gl;
      const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
      const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
      const T1l = T1ll | 0;
      const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
      const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
      const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
      const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
      Hh = Gh | 0;
      Hl = Gl | 0;
      Gh = Fh | 0;
      Gl = Fl | 0;
      Fh = Eh | 0;
      Fl = El | 0;
      ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
      Dh = Ch | 0;
      Dl = Cl | 0;
      Ch = Bh | 0;
      Cl = Bl | 0;
      Bh = Ah | 0;
      Bl = Al | 0;
      const All = add3L(T1l, sigma0l, MAJl);
      Ah = add3H(All, T1h, sigma0h, MAJh);
      Al = All | 0;
    }
    ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
    ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
    ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
    ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
    ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
    ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
    ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
    ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
    this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
  }
  roundClean() {
    clean(SHA512_W_H, SHA512_W_L);
  }
  destroy() {
    clean(this.buffer);
    this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
};
var SHA384 = class extends SHA512 {
  constructor() {
    super(48);
    this.Ah = SHA384_IV[0] | 0;
    this.Al = SHA384_IV[1] | 0;
    this.Bh = SHA384_IV[2] | 0;
    this.Bl = SHA384_IV[3] | 0;
    this.Ch = SHA384_IV[4] | 0;
    this.Cl = SHA384_IV[5] | 0;
    this.Dh = SHA384_IV[6] | 0;
    this.Dl = SHA384_IV[7] | 0;
    this.Eh = SHA384_IV[8] | 0;
    this.El = SHA384_IV[9] | 0;
    this.Fh = SHA384_IV[10] | 0;
    this.Fl = SHA384_IV[11] | 0;
    this.Gh = SHA384_IV[12] | 0;
    this.Gl = SHA384_IV[13] | 0;
    this.Hh = SHA384_IV[14] | 0;
    this.Hl = SHA384_IV[15] | 0;
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());
var sha512 = /* @__PURE__ */ createHasher(() => new SHA512());
var sha384 = /* @__PURE__ */ createHasher(() => new SHA384());

// ../../../node_modules/.pnpm/@noble+hashes@1.8.0/node_modules/@noble/hashes/esm/hmac.js
var HMAC = class extends Hash {
  constructor(hash, _key) {
    super();
    this.finished = false;
    this.destroyed = false;
    ahash(hash);
    const key = toBytes(_key);
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash.create();
    for (let i = 0; i < pad.length; i++)
      pad[i] ^= 54 ^ 92;
    this.oHash.update(pad);
    clean(pad);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes(out, this.outputLen);
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to || (to = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash, key, message) => new HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new HMAC(hash, key);

// ../../../node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/curve.js
var _0n3 = BigInt(0);
var _1n3 = BigInt(1);
function negateCt(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function normalizeZ(c, points) {
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window2, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window2 * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window2 % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
function validateMSMPoints(points, c) {
  if (!Array.isArray(points))
    throw new Error("array expected");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    if (!field.isValid(s))
      throw new Error("invalid scalar at index " + i);
  });
}
var pointPrecomputes = /* @__PURE__ */ new WeakMap();
var pointWindowSizes = /* @__PURE__ */ new WeakMap();
function getW(P) {
  return pointWindowSizes.get(P) || 1;
}
function assert0(n) {
  if (n !== _0n3)
    throw new Error("invalid wNAF");
}
var wNAF = class {
  // Parametrized with a given Point class (not individual point)
  constructor(Point, bits) {
    this.BASE = Point.BASE;
    this.ZERO = Point.ZERO;
    this.Fn = Point.Fn;
    this.bits = bits;
  }
  // non-const time multiplication ladder
  _unsafeLadder(elm, n, p = this.ZERO) {
    let d = elm;
    while (n > _0n3) {
      if (n & _1n3)
        p = p.add(d);
      d = d.double();
      n >>= _1n3;
    }
    return p;
  }
  /**
   * Creates a wNAF precomputation window. Used for caching.
   * Default window size is set by `utils.precompute()` and is equal to 8.
   * Number of precomputed points depends on the curve size:
   * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
   * - 𝑊 is the window size
   * - 𝑛 is the bitlength of the curve order.
   * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
   * @param point Point instance
   * @param W window size
   * @returns precomputed point tables flattened to a single array
   */
  precomputeWindow(point, W) {
    const { windows, windowSize } = calcWOpts(W, this.bits);
    const points = [];
    let p = point;
    let base = p;
    for (let window2 = 0; window2 < windows; window2++) {
      base = p;
      points.push(base);
      for (let i = 1; i < windowSize; i++) {
        base = base.add(p);
        points.push(base);
      }
      p = base.double();
    }
    return points;
  }
  /**
   * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
   * More compact implementation:
   * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
   * @returns real and fake (for const-time) points
   */
  wNAF(W, precomputes, n) {
    if (!this.Fn.isValid(n))
      throw new Error("invalid scalar");
    let p = this.ZERO;
    let f = this.BASE;
    const wo = calcWOpts(W, this.bits);
    for (let window2 = 0; window2 < wo.windows; window2++) {
      const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window2, wo);
      n = nextN;
      if (isZero) {
        f = f.add(negateCt(isNegF, precomputes[offsetF]));
      } else {
        p = p.add(negateCt(isNeg, precomputes[offset]));
      }
    }
    assert0(n);
    return { p, f };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
    const wo = calcWOpts(W, this.bits);
    for (let window2 = 0; window2 < wo.windows; window2++) {
      if (n === _0n3)
        break;
      const { nextN, offset, isZero, isNeg } = calcOffsets(n, window2, wo);
      n = nextN;
      if (isZero) {
        continue;
      } else {
        const item = precomputes[offset];
        acc = acc.add(isNeg ? item.negate() : item);
      }
    }
    assert0(n);
    return acc;
  }
  getPrecomputes(W, point, transform) {
    let comp = pointPrecomputes.get(point);
    if (!comp) {
      comp = this.precomputeWindow(point, W);
      if (W !== 1) {
        if (typeof transform === "function")
          comp = transform(comp);
        pointPrecomputes.set(point, comp);
      }
    }
    return comp;
  }
  cached(point, scalar, transform) {
    const W = getW(point);
    return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
  }
  unsafe(point, scalar, transform, prev) {
    const W = getW(point);
    if (W === 1)
      return this._unsafeLadder(point, scalar, prev);
    return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(P, W) {
    validateW(W, this.bits);
    pointWindowSizes.set(P, W);
    pointPrecomputes.delete(P);
  }
  hasCache(elm) {
    return getW(elm) !== 1;
  }
};
function mulEndoUnsafe(Point, point, k1, k2) {
  let acc = point;
  let p1 = Point.ZERO;
  let p2 = Point.ZERO;
  while (k1 > _0n3 || k2 > _0n3) {
    if (k1 & _1n3)
      p1 = p1.add(acc);
    if (k2 & _1n3)
      p2 = p2.add(acc);
    acc = acc.double();
    k1 >>= _1n3;
    k2 >>= _1n3;
  }
  return { p1, p2 };
}
function pippenger(c, fieldN, points, scalars) {
  validateMSMPoints(points, c);
  validateMSMScalars(scalars, fieldN);
  const plength = points.length;
  const slength = scalars.length;
  if (plength !== slength)
    throw new Error("arrays of points and scalars must have equal length");
  const zero = c.ZERO;
  const wbits = bitLen(BigInt(plength));
  let windowSize = 1;
  if (wbits > 12)
    windowSize = wbits - 3;
  else if (wbits > 4)
    windowSize = wbits - 2;
  else if (wbits > 0)
    windowSize = 2;
  const MASK = bitMask(windowSize);
  const buckets = new Array(Number(MASK) + 1).fill(zero);
  const lastBits = Math.floor((fieldN.BITS - 1) / windowSize) * windowSize;
  let sum = zero;
  for (let i = lastBits; i >= 0; i -= windowSize) {
    buckets.fill(zero);
    for (let j = 0; j < slength; j++) {
      const scalar = scalars[j];
      const wbits2 = Number(scalar >> BigInt(i) & MASK);
      buckets[wbits2] = buckets[wbits2].add(points[j]);
    }
    let resI = zero;
    for (let j = buckets.length - 1, sumI = zero; j > 0; j--) {
      sumI = sumI.add(buckets[j]);
      resI = resI.add(sumI);
    }
    sum = sum.add(resI);
    if (i !== 0)
      for (let j = 0; j < windowSize; j++)
        sum = sum.double();
  }
  return sum;
}
function createField(order, field, isLE) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE });
  }
}
function _createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(typeof val === "bigint" && val > _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn };
}

// ../../../node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/abstract/weierstrass.js
var divNearest = (num, den) => (num + (num >= 0 ? den : -den) / _2n2) / den;
function _splitEndoScalar(k, basis, n) {
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n);
  const c2 = divNearest(-b1 * k, n);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n4;
  const k2neg = k2 < _0n4;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n4 || k1 >= MAX_NUM || k2 < _0n4 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed, k=" + k);
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  _abool2(optsn.lowS, "lowS");
  _abool2(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
var DERErr = class extends Error {
  constructor(m = "") {
    super(m);
  }
};
var DER = {
  // asn.1 DER encoding utils
  Err: DERErr,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = DER;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    // v - value, l - left bytes (unparsed)
    decode(tag, data) {
      const { Err: E } = DER;
      let pos = 0;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(num) {
      const { Err: E } = DER;
      if (num < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = DER;
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(hex) {
    const { Err: E, _int: int, _tlv: tlv } = DER;
    const data = ensureBytes("signature", hex);
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    return { r: int.decode(rBytes), s: int.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int } = DER;
    const rs = tlv.encode(2, int.encode(sig.r));
    const ss = tlv.encode(2, int.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
var _0n4 = BigInt(0);
var _1n4 = BigInt(1);
var _2n2 = BigInt(2);
var _3n2 = BigInt(3);
var _4n2 = BigInt(4);
function _normFnElement(Fn, key) {
  const { BYTES: expected } = Fn;
  let num;
  if (typeof key === "bigint") {
    num = key;
  } else {
    let bytes = ensureBytes("private key", key);
    try {
      num = Fn.fromBytes(bytes);
    } catch (error) {
      throw new Error(`invalid private key: expected ui8a of size ${expected}, got ${typeof key}`);
    }
  }
  if (!Fn.isValidNot0(num))
    throw new Error("invalid private key: out of range [1..N-1]");
  return num;
}
function weierstrassN(params, extraOpts = {}) {
  const validated = _createCurveFields("weierstrass", params, extraOpts);
  const { Fp, Fn } = validated;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  _validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    wrapPrivateKey: "boolean"
  });
  const { endo } = extraOpts;
  if (endo) {
    if (!Fp.is0(CURVE.a) || typeof endo.beta !== "bigint" || !Array.isArray(endo.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const lengths = getWLengths(Fp, Fn);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes(_c, point, isCompressed) {
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    _abool2(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes(pprefix(hasEvenY), bx);
    } else {
      return concatBytes(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    _abytes2(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const isYOdd = Fp.isOdd(y);
      const isHeadOdd = (head & 1) === 1;
      if (isHeadOdd !== isYOdd)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = extraOpts.toBytes || pointToBytes;
  const decodePoint = extraOpts.fromBytes || pointFromBytes;
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n2);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return n;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point))
      throw new Error("ProjectivePoint expected");
  }
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  }
  const toAffineMemo = memoized((p, iz) => {
    const { X, Y, Z } = p;
    if (Fp.eql(Z, Fp.ONE))
      return { x: X, y: Y };
    const is0 = p.is0();
    if (iz == null)
      iz = is0 ? Fp.ONE : Fp.inv(Z);
    const x = Fp.mul(X, iz);
    const y = Fp.mul(Y, iz);
    const zz = Fp.mul(Z, iz);
    if (is0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (!Fp.eql(zz, Fp.ONE))
      throw new Error("invZ was invalid");
    return { x, y };
  });
  const assertValidMemo = memoized((p) => {
    if (p.is0()) {
      if (extraOpts.allowInfinityPoint && !Fp.is0(p.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x, y } = p.toAffine();
    if (!Fp.isValid(x) || !Fp.isValid(y))
      throw new Error("bad point: x or y not field elements");
    if (!isValidXY(x, y))
      throw new Error("bad point: equation left != right");
    if (!p.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return true;
  });
  function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
    k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
    k1p = negateCt(k1neg, k1p);
    k2p = negateCt(k2neg, k2p);
    return k1p.add(k2p);
  }
  class Point {
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point.ZERO;
      return new Point(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point.fromAffine(decodePoint(_abytes2(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point.fromBytes(ensureBytes("pointHex", hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     *
     * @param windowSize
     * @param isLazy true will defer table computation until the first multiplication
     * @returns
     */
    precompute(windowSize = 8, isLazy = true) {
      wnaf.createCache(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      assertValidMemo(this);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point(this.X, Fp.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b } = CURVE;
      const b3 = Fp.mul(b, _3n2);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = Fp.mul(a, Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = Fp.mul(a, t2);
      t3 = Fp.sub(t0, t2);
      t3 = Fp.mul(a, t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      const a = CURVE.a;
      const b3 = Fp.mul(CURVE.b, _3n2);
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = Fp.mul(a, t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = Fp.mul(a, t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = Fp.mul(a, t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point(X3, Y3, Z3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      const { endo: endo2 } = extraOpts;
      if (!Fn.isValidNot0(scalar))
        throw new Error("invalid scalar: out of range");
      let point, fake;
      const mul = (n) => wnaf.cached(this, n, (p) => normalizeZ(Point, p));
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
        const { p: k1p, f: k1f } = mul(k1);
        const { p: k2p, f: k2f } = mul(k2);
        fake = k1f.add(k2f);
        point = finishEndo(endo2.beta, k1p, k2p, k1neg, k2neg);
      } else {
        const { p, f } = mul(scalar);
        point = p;
        fake = f;
      }
      return normalizeZ(Point, [point, fake])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(sc) {
      const { endo: endo2 } = extraOpts;
      const p = this;
      if (!Fn.isValid(sc))
        throw new Error("invalid scalar: out of range");
      if (sc === _0n4 || p.is0())
        return Point.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasCache(this))
        return this.multiply(sc);
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
        const { p1, p2 } = mulEndoUnsafe(Point, p, k1, k2);
        return finishEndo(endo2.beta, p1, p2, k1neg, k2neg);
      } else {
        return wnaf.unsafe(p, sc);
      }
    }
    multiplyAndAddUnsafe(Q, a, b) {
      const sum = this.multiplyUnsafe(a).add(Q.multiplyUnsafe(b));
      return sum.is0() ? void 0 : sum;
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      return toAffineMemo(this, invertedZ);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree } = extraOpts;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point, this);
      return wnaf.unsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      const { clearCofactor } = extraOpts;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(cofactor).is0();
    }
    toBytes(isCompressed = true) {
      _abool2(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
    // TODO: remove
    get px() {
      return this.X;
    }
    get py() {
      return this.X;
    }
    get pz() {
      return this.Z;
    }
    toRawBytes(isCompressed = true) {
      return this.toBytes(isCompressed);
    }
    _setWindowSize(windowSize) {
      this.precompute(windowSize);
    }
    static normalizeZ(points) {
      return normalizeZ(Point, points);
    }
    static msm(points, scalars) {
      return pippenger(Point, Fn, points, scalars);
    }
    static fromPrivateKey(privateKey) {
      return Point.BASE.multiply(_normFnElement(Fn, privateKey));
    }
  }
  Point.BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
  Point.ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
  Point.Fp = Fp;
  Point.Fn = Fn;
  const bits = Fn.BITS;
  const wnaf = new wNAF(Point, extraOpts.endo ? Math.ceil(bits / 2) : bits);
  Point.BASE.precompute(8);
  return Point;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp, Fn) {
  return {
    secretKey: Fn.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    signature: 2 * Fn.BYTES
  };
}
function ecdh(Point, ecdhOpts = {}) {
  const { Fn } = Point;
  const randomBytes_ = ecdhOpts.randomBytes || randomBytes;
  const lengths = Object.assign(getWLengths(Point.Fp, Fn), { seed: getMinHashLength(Fn.ORDER) });
  function isValidSecretKey(secretKey) {
    try {
      return !!_normFnElement(Fn, secretKey);
    } catch (error) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !!Point.fromBytes(publicKey);
    } catch (error) {
      return false;
    }
  }
  function randomSecretKey(seed = randomBytes_(lengths.seed)) {
    return mapHashToField(_abytes2(seed, lengths.seed, "seed"), Fn.ORDER);
  }
  function getPublicKey(secretKey, isCompressed = true) {
    return Point.BASE.multiply(_normFnElement(Fn, secretKey)).toBytes(isCompressed);
  }
  function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  }
  function isProbPub(item) {
    if (typeof item === "bigint")
      return false;
    if (item instanceof Point)
      return true;
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    if (Fn.allowedLengths || secretKey === publicKey)
      return void 0;
    const l = ensureBytes("key", item).length;
    return l === publicKey || l === publicKeyUncompressed;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = _normFnElement(Fn, secretKeyA);
    const b = Point.fromHex(publicKeyB);
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey,
    // TODO: remove
    isValidPrivateKey: isValidSecretKey,
    randomPrivateKey: randomSecretKey,
    normPrivateKeyToScalar: (key) => _normFnElement(Fn, key),
    precompute(windowSize = 8, point = Point.BASE) {
      return point.precompute(windowSize, false);
    }
  };
  return Object.freeze({ getPublicKey, getSharedSecret, keygen, Point, utils, lengths });
}
function ecdsa(Point, hash, ecdsaOpts = {}) {
  ahash(hash);
  _validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const randomBytes2 = ecdsaOpts.randomBytes || randomBytes;
  const hmac2 = ecdsaOpts.hmac || ((key, ...msgs) => hmac(hash, key, concatBytes(...msgs)));
  const { Fp, Fn } = Point;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  const { keygen, getPublicKey, getSharedSecret, utils, lengths } = ecdh(Point, ecdsaOpts);
  const defaultSigOpts = {
    prehash: false,
    lowS: typeof ecdsaOpts.lowS === "boolean" ? ecdsaOpts.lowS : false,
    format: void 0,
    //'compact' as ECDSASigFormat,
    extraEntropy: false
  };
  const defaultSigOpts_format = "compact";
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num) {
    if (!Fn.isValidNot0(num))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num;
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return _abytes2(bytes, sizer, `${format} signature`);
  }
  class Signature {
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null)
        this.recovery = recovery;
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts_format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        const { r: r2, s: s2 } = DER.toSig(_abytes2(bytes));
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = Fn.BYTES;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes(hex), format);
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    recoverPublicKey(messageHash) {
      const FIELD_ORDER = Fp.ORDER;
      const { r, s, recovery: rec } = this;
      if (rec == null || ![0, 1, 2, 3].includes(rec))
        throw new Error("recovery id invalid");
      const hasCofactor = CURVE_ORDER * _2n2 < FIELD_ORDER;
      if (hasCofactor && rec > 1)
        throw new Error("recovery id is ambiguous for h>1 curve");
      const radj = rec === 2 || rec === 3 ? r + CURVE_ORDER : r;
      if (!Fp.isValid(radj))
        throw new Error("recovery id 2 or 3 invalid");
      const x = Fp.toBytes(radj);
      const R = Point.fromBytes(concatBytes(pprefix((rec & 1) === 0), x));
      const ir = Fn.inv(radj);
      const h = bits2int_modN(ensureBytes("msgHash", messageHash));
      const u1 = Fn.create(-h * ir);
      const u2 = Fn.create(s * ir);
      const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
      if (Q.is0())
        throw new Error("point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts_format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes(DER.hexFromSig(this));
      const r = Fn.toBytes(this.r);
      const s = Fn.toBytes(this.s);
      if (format === "recovered") {
        if (this.recovery == null)
          throw new Error("recovery bit must be present");
        return concatBytes(Uint8Array.of(this.recovery), r, s);
      }
      return concatBytes(r, s);
    }
    toHex(format) {
      return bytesToHex(this.toBytes(format));
    }
    // TODO: remove
    assertValidity() {
    }
    static fromCompact(hex) {
      return Signature.fromBytes(ensureBytes("sig", hex), "compact");
    }
    static fromDER(hex) {
      return Signature.fromBytes(ensureBytes("sig", hex), "der");
    }
    normalizeS() {
      return this.hasHighS() ? new Signature(this.r, Fn.neg(this.s), this.recovery) : this;
    }
    toDERRawBytes() {
      return this.toBytes("der");
    }
    toDERHex() {
      return bytesToHex(this.toBytes("der"));
    }
    toCompactRawBytes() {
      return this.toBytes("compact");
    }
    toCompactHex() {
      return bytesToHex(this.toBytes("compact"));
    }
  }
  const bits2int = ecdsaOpts.bits2int || function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num >> BigInt(delta) : num;
  };
  const bits2int_modN = ecdsaOpts.bits2int_modN || function bits2int_modN_def(bytes) {
    return Fn.create(bits2int(bytes));
  };
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num) {
    aInRange("num < 2^" + fnBits, num, _0n4, ORDER_MASK);
    return Fn.toBytes(num);
  }
  function validateMsgAndHash(message, prehash) {
    _abytes2(message, void 0, "message");
    return prehash ? _abytes2(hash(message), void 0, "prehashed message") : message;
  }
  function prepSig(message, privateKey, opts) {
    if (["recovered", "canonical"].some((k) => k in opts))
      throw new Error("sign() legacy options not supported");
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = _normFnElement(Fn, privateKey);
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes2(lengths.secretKey) : extraEntropy;
      seedArgs.push(ensureBytes("extraEntropy", e));
    }
    const seed = concatBytes(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn.isValidNot0(k))
        return;
      const ik = Fn.inv(k);
      const q = Point.BASE.multiply(k).toAffine();
      const r = Fn.create(q.x);
      if (r === _0n4)
        return;
      const s = Fn.create(ik * Fn.create(m + r * d));
      if (s === _0n4)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n4);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts = {}) {
    message = ensureBytes("message", message);
    const { seed, k2sig } = prepSig(message, secretKey, opts);
    const drbg = createHmacDrbg(hash.outputLen, Fn.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig;
  }
  function tryParsingSig(sg) {
    let sig = void 0;
    const isHex = typeof sg === "string" || isBytes(sg);
    const isObj = !isHex && sg !== null && typeof sg === "object" && typeof sg.r === "bigint" && typeof sg.s === "bigint";
    if (!isHex && !isObj)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (isObj) {
      sig = new Signature(sg.r, sg.s);
    } else if (isHex) {
      try {
        sig = Signature.fromBytes(ensureBytes("sig", sg), "der");
      } catch (derError) {
        if (!(derError instanceof DER.Err))
          throw derError;
      }
      if (!sig) {
        try {
          sig = Signature.fromBytes(ensureBytes("sig", sg), "compact");
        } catch (error) {
          return false;
        }
      }
    }
    if (!sig)
      return false;
    return sig;
  }
  function verify(signature, message, publicKey, opts = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
    publicKey = ensureBytes("publicKey", publicKey);
    message = validateMsgAndHash(ensureBytes("message", message), prehash);
    if ("strict" in opts)
      throw new Error("options.strict was renamed to lowS");
    const sig = format === void 0 ? tryParsingSig(signature) : Signature.fromBytes(ensureBytes("sig", signature), format);
    if (sig === false)
      return false;
    try {
      const P = Point.fromBytes(publicKey);
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn.inv(s);
      const u1 = Fn.create(h * is);
      const u2 = Fn.create(r * is);
      const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2));
      if (R.is0())
        return false;
      const v = Fn.create(R.x);
      return v === r;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts = {}) {
    const { prehash } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey,
    getSharedSecret,
    utils,
    lengths,
    Point,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash
  });
}
function _weierstrass_legacy_opts_to_new(c) {
  const CURVE = {
    a: c.a,
    b: c.b,
    p: c.Fp.ORDER,
    n: c.n,
    h: c.h,
    Gx: c.Gx,
    Gy: c.Gy
  };
  const Fp = c.Fp;
  let allowedLengths = c.allowedPrivateKeyLengths ? Array.from(new Set(c.allowedPrivateKeyLengths.map((l) => Math.ceil(l / 2)))) : void 0;
  const Fn = Field(CURVE.n, {
    BITS: c.nBitLength,
    allowedLengths,
    modFromBytes: c.wrapPrivateKey
  });
  const curveOpts = {
    Fp,
    Fn,
    allowInfinityPoint: c.allowInfinityPoint,
    endo: c.endo,
    isTorsionFree: c.isTorsionFree,
    clearCofactor: c.clearCofactor,
    fromBytes: c.fromBytes,
    toBytes: c.toBytes
  };
  return { CURVE, curveOpts };
}
function _ecdsa_legacy_opts_to_new(c) {
  const { CURVE, curveOpts } = _weierstrass_legacy_opts_to_new(c);
  const ecdsaOpts = {
    hmac: c.hmac,
    randomBytes: c.randomBytes,
    lowS: c.lowS,
    bits2int: c.bits2int,
    bits2int_modN: c.bits2int_modN
  };
  return { CURVE, curveOpts, hash: c.hash, ecdsaOpts };
}
function _ecdsa_new_output_to_legacy(c, _ecdsa) {
  const Point = _ecdsa.Point;
  return Object.assign({}, _ecdsa, {
    ProjectivePoint: Point,
    CURVE: Object.assign({}, c, nLength(Point.Fn.ORDER, Point.Fn.BITS))
  });
}
function weierstrass(c) {
  const { CURVE, curveOpts, hash, ecdsaOpts } = _ecdsa_legacy_opts_to_new(c);
  const Point = weierstrassN(CURVE, curveOpts);
  const signs = ecdsa(Point, hash, ecdsaOpts);
  return _ecdsa_new_output_to_legacy(c, signs);
}

// ../../../node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/_shortw_utils.js
function createCurve(curveDef, defHash) {
  const create = (hash) => weierstrass({ ...curveDef, hash });
  return { ...create(defHash), create };
}

// ../../../node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/nist.js
var p256_CURVE = {
  p: BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"),
  n: BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),
  h: BigInt(1),
  a: BigInt("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc"),
  b: BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b"),
  Gx: BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
  Gy: BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")
};
var p384_CURVE = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff"),
  n: BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973"),
  h: BigInt(1),
  a: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000fffffffc"),
  b: BigInt("0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef"),
  Gx: BigInt("0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7"),
  Gy: BigInt("0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f")
};
var p521_CURVE = {
  p: BigInt("0x1ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
  n: BigInt("0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409"),
  h: BigInt(1),
  a: BigInt("0x1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc"),
  b: BigInt("0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00"),
  Gx: BigInt("0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66"),
  Gy: BigInt("0x011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650")
};
var Fp256 = Field(p256_CURVE.p);
var Fp384 = Field(p384_CURVE.p);
var Fp521 = Field(p521_CURVE.p);
var p256 = createCurve({ ...p256_CURVE, Fp: Fp256, lowS: false }, sha256);
var p384 = createCurve({ ...p384_CURVE, Fp: Fp384, lowS: false }, sha384);
var p521 = createCurve({ ...p521_CURVE, Fp: Fp521, lowS: false, allowedPrivateKeyLengths: [130, 131, 132] }, sha512);

// ../../../node_modules/.pnpm/@noble+curves@1.9.7/node_modules/@noble/curves/esm/p256.js
var p2562 = p256;

// ../../libs/privy-admin/src/jcs.ts
var import_canonicalize = __toESM(require_canonicalize(), 1);
function canonicalizeJson(value) {
  const result = (0, import_canonicalize.default)(value);
  if (typeof result !== "string") {
    throw new Error("JCS: cannot canonicalize value");
  }
  return result;
}
function normalizePrivyAuthorizationBody(body) {
  if (Object.keys(body).length === 0) {
    return "";
  }
  return body;
}

// ../../libs/privy-admin/src/authorization-signature.ts
var importedKeyCache = /* @__PURE__ */ new Map();
async function buildPrivyAuthorizationSignature(input) {
  if (!input.authorizationKey?.trim()) return void 0;
  const headers = {
    "privy-app-id": input.appId,
    "privy-request-expiry": String(input.requestExpiryMs)
  };
  const payload = {
    version: 1,
    method: input.method,
    url: input.url,
    headers,
    body: normalizePrivyAuthorizationBody(input.body)
  };
  const jcsBytes = new TextEncoder().encode(canonicalizeJson(payload));
  const privateKey = await importAuthorizationPrivateKey(input.authorizationKey);
  const rawSignature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, jcsBytes)
  );
  if (rawSignature.length !== 64) {
    throw new Error(
      `expected Web Crypto ECDSA P-1363 compact signature (64 bytes), got ${rawSignature.length}`
    );
  }
  const der = p2562.Signature.fromCompact(rawSignature).toDERRawBytes();
  return Buffer.from(der).toString("base64");
}
async function importAuthorizationPrivateKey(authorizationKey) {
  const trimmed = authorizationKey.trim();
  const cached = importedKeyCache.get(trimmed);
  if (cached) return cached;
  const base64 = trimmed.startsWith("wallet-auth:") ? trimmed.slice("wallet-auth:".length) : trimmed;
  const der = Buffer.from(base64, "base64");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  importedKeyCache.set(trimmed, key);
  return key;
}

// ../../libs/privy-admin/src/privy-rest.ts
var DEFAULT_REQUEST_EXPIRY_SKEW_MS = 6e4;
var PrivyRestClient = class {
  constructor(config) {
    this.config = config;
    if (!config.apiBase?.trim()) {
      throw new PrivyRestError("MANDATE_PRIVY_API_BASE is required", 0);
    }
    this.apiBase = config.apiBase.trim().replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }
  apiBase;
  fetchImpl;
  get appId() {
    return this.config.appId;
  }
  async createPolicy(body) {
    const response = await this.request({
      method: "POST",
      path: "/v1/policies",
      body
    });
    return await response.json();
  }
  async getPolicy(policyId) {
    const response = await this.request({
      method: "GET",
      path: `/v1/policies/${policyId}`
    });
    return await response.json();
  }
  async request(opts) {
    const url = `${this.apiBase}${opts.path}`;
    const body = opts.body ?? {};
    const requestExpiryMs = opts.requestExpiryMs ?? Date.now() + DEFAULT_REQUEST_EXPIRY_SKEW_MS;
    const authSig = await buildPrivyAuthorizationSignature({
      method: opts.method,
      url,
      body: opts.method === "GET" ? {} : body,
      appId: this.config.appId,
      authorizationKey: opts.authorizationKey,
      requestExpiryMs
    });
    const headers = {
      Authorization: this.basicAuthHeader(),
      "privy-app-id": this.config.appId,
      "Content-Type": "application/json",
      "privy-request-expiry": String(requestExpiryMs)
    };
    if (authSig) {
      headers["privy-authorization-signature"] = authSig;
    }
    const response = await this.fetchImpl(url, {
      method: opts.method,
      headers,
      body: opts.method === "GET" ? void 0 : JSON.stringify(body)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new PrivyRestError(
        `Privy ${opts.method} ${opts.path} failed: ${response.status}`,
        response.status,
        text
      );
    }
    return response;
  }
  basicAuthHeader() {
    const encoded = Buffer.from(`${this.config.appId}:${this.config.appSecret}`).toString("base64");
    return `Basic ${encoded}`;
  }
};

// ../../libs/privy-admin/src/owner-topology-error.ts
var OwnerTopologyError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OwnerTopologyError";
  }
};

// ../../libs/privy-admin/src/owner-topology.ts
function assertMandateNotWalletOwner(wallet, mandateSignerId) {
  const ownerId = wallet.owner_id?.trim();
  if (ownerId && ownerId === mandateSignerId) {
    throw new OwnerTopologyError(
      "mandate signer id matches wallet owner_id \u2014 prohibited owner-topology (I2)"
    );
  }
}
function assertMandateAbsentFromAdditionalSigners(wallet, mandateSignerId) {
  const signers = wallet.additional_signers ?? [];
  if (mandateSignerId) {
    const found = signers.some((s) => s.signer_id === mandateSignerId);
    if (found) {
      throw new OwnerTopologyError(
        `mandate signer ${mandateSignerId} is still registered as an additional signer`
      );
    }
    return;
  }
  if (signers.length > 0) {
    throw new OwnerTopologyError(
      `wallet still has ${signers.length} additional signer(s) after revoke`
    );
  }
}
function mandateListedAsAdditionalSigner(wallet, mandateSignerId) {
  return (wallet.additional_signers ?? []).some((s) => s.signer_id === mandateSignerId);
}
function assertMandateIsAdditionalSignerOnly(wallet, mandateSignerId) {
  assertMandateNotWalletOwner(wallet, mandateSignerId);
  const signers = wallet.additional_signers ?? [];
  const found = signers.some((s) => s.signer_id === mandateSignerId);
  if (!found) {
    throw new OwnerTopologyError(
      `mandate signer ${mandateSignerId} is not registered as an additional signer`
    );
  }
  if (wallet.owner_id === mandateSignerId) {
    throw new OwnerTopologyError("mandate signer must not be wallet owner");
  }
}
function assertOwnerQuorumExcludesMandate(quorum, mandateSignerId) {
  const members = quorum.members ?? [];
  const includesMandate = members.some(
    (m) => m.key_quorum_id === mandateSignerId || m.authorization_key_id === mandateSignerId
  );
  if (includesMandate) {
    throw new OwnerTopologyError("owner quorum includes mandate signer \u2014 prohibited (ARC-0022 I2)");
  }
}
function assertWalletIsUserOwned(wallet) {
  const ownerId = wallet.owner_id?.trim();
  if (ownerId) return;
  const owner = wallet.owner;
  const userId = owner?.user_id?.trim();
  const publicKey = owner?.public_key?.trim();
  if (userId || publicKey) return;
  throw new OwnerTopologyError(
    "wallet is ownerless \u2014 Mode C requires a user-owned wallet (ARC-0022 I2)"
  );
}
function assertSignerNotOwner(wallet, mandateSignerId, ownerQuorum) {
  assertMandateNotWalletOwner(wallet, mandateSignerId);
  if (ownerQuorum) {
    assertOwnerQuorumExcludesMandate(ownerQuorum, mandateSignerId);
  }
}

// ../../libs/privy-admin/src/wallet-api.ts
async function getWallet(client, walletId) {
  const response = await client.request({
    method: "GET",
    path: `/v1/wallets/${walletId}`
  });
  return await response.json();
}
async function updateWallet(client, walletId, body, ownerAuthorizationKey) {
  const response = await client.request({
    method: "PATCH",
    path: `/v1/wallets/${walletId}`,
    body,
    authorizationKey: ownerAuthorizationKey
  });
  return await response.json();
}
async function getKeyQuorum(client, quorumId) {
  const response = await client.request({
    method: "GET",
    path: `/v1/key_quorums/${quorumId}`
  });
  return await response.json();
}
async function removeAllAdditionalSigners(client, walletId, ownerAuthorizationKey) {
  return updateWallet(client, walletId, { additional_signers: [] }, ownerAuthorizationKey);
}
function withoutSigner(signers, signerId) {
  return (signers ?? []).filter((s) => s.signer_id !== signerId);
}
async function removeMandateAdditionalSigner(client, walletId, mandateSignerId, ownerAuthorizationKey, walletSnapshot) {
  const wallet = walletSnapshot ?? await getWallet(client, walletId);
  assertWalletIsUserOwned(wallet);
  const current = wallet.additional_signers ?? [];
  const next = withoutSigner(current, mandateSignerId);
  if (next.length === current.length) {
    throw new OwnerTopologyError(
      `mandate signer ${mandateSignerId} is not registered as an additional signer \u2014 nothing to revoke`
    );
  }
  return updateWallet(client, walletId, { additional_signers: next }, ownerAuthorizationKey);
}
function mergeAdditionalSigner(existing, entry) {
  const signers = [...existing ?? []];
  const index = signers.findIndex((s) => s.signer_id === entry.signer_id);
  if (index >= 0) {
    signers[index] = entry;
  } else {
    signers.push(entry);
  }
  return signers;
}

// ../../libs/privy-admin/src/onboard-mode-c.ts
async function onboardModeCWallet(client, input) {
  const walletBefore = await getWallet(client, input.walletId);
  assertWalletIsUserOwned(walletBefore);
  assertSignerNotOwner(walletBefore, input.mandateSignerId);
  if (walletBefore.owner_id) {
    try {
      const ownerQuorum = await getKeyQuorum(client, walletBefore.owner_id);
      assertSignerNotOwner(walletBefore, input.mandateSignerId, ownerQuorum);
    } catch (error) {
      if (error instanceof PrivyRestError && error.status === 404) {
      } else {
        throw error;
      }
    }
  }
  const policyId = input.policyId ?? (await createDelegationSigningPolicy(client, input.policyName)).id;
  const additionalSigners = mergeAdditionalSigner(walletBefore.additional_signers, {
    signer_id: input.mandateSignerId,
    override_policy_ids: [policyId]
  });
  const walletAfter = await updateWallet(
    client,
    input.walletId,
    { additional_signers: additionalSigners },
    input.ownerAuthorizationKey
  );
  assertMandateIsAdditionalSignerOnly(walletAfter, input.mandateSignerId);
  const keyDirectoryEntry = {
    walletId: input.walletId,
    rootSignerAddress: walletAfter.address,
    logIds: [input.logId],
    requiresAuthorizationSignature: true
  };
  const operatorEntry = {
    alg: "KS256",
    rootSignerAddress: walletAfter.address,
    kind: "remote",
    signerUrl: input.signerUrl,
    keyRef: input.keyRef
  };
  return {
    walletId: input.walletId,
    walletAddress: walletAfter.address,
    policyId,
    keyRef: input.keyRef,
    logId: input.logId,
    keyDirectory: { [input.keyRef]: keyDirectoryEntry },
    operatorRootKeys: { [input.logId]: operatorEntry }
  };
}

// ../../libs/privy-admin/src/revoke-mode-c.ts
async function revokeModeCWallet(client, input) {
  const walletBefore = await getWallet(client, input.walletId);
  assertWalletIsUserOwned(walletBefore);
  const hadMandateSigner = mandateListedAsAdditionalSigner(walletBefore, input.mandateSignerId);
  if (!hadMandateSigner) {
    throw new OwnerTopologyError(
      `mandate signer ${input.mandateSignerId} is not registered as an additional signer \u2014 nothing to revoke`
    );
  }
  if (input.clearAllAdditionalSigners) {
    await removeAllAdditionalSigners(client, input.walletId, input.ownerAuthorizationKey);
  } else {
    await removeMandateAdditionalSigner(
      client,
      input.walletId,
      input.mandateSignerId,
      input.ownerAuthorizationKey,
      walletBefore
    );
  }
  const walletAfter = await getWallet(client, input.walletId);
  assertMandateAbsentFromAdditionalSigners(walletAfter, input.mandateSignerId);
  return {
    walletId: input.walletId,
    walletAddress: walletAfter.address,
    additionalSignersAfter: walletAfter.additional_signers ?? [],
    revoked: hadMandateSigner,
    hadMandateSigner,
    action: input.clearAllAdditionalSigners ? "full-clear" : "targeted"
  };
}

// ../../apps/register/src/cose-alg.ts
var COSE_ALG_ES256 = -7;
var COSE_ALG_KS256 = -65799;

// ../../apps/register/src/eth-address.ts
function parseEthAddressToBytes(address) {
  const hex = address.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
    throw new Error(`invalid Ethereum address: ${address}`);
  }
  return Buffer.from(hex, "hex");
}
function parseUnivocityAddrHex(hex40) {
  const hex = hex40.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) {
    throw new Error(`univocity address must be 40 hex chars; got ${hex.length}`);
  }
  return Buffer.from(hex, "hex");
}

// ../../apps/register/src/cbor-int-key.ts
init_node_index();
var cborEncoder = new Encoder({ mapsAsObjects: false });
function cborIntKeyBytes(value) {
  const encoded = cborEncoder.encode(value);
  return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
}

// ../../apps/register/src/forest-genesis-labels.ts
var FOREST_GENESIS_LABEL_GENESIS_VERSION = -68009;
var FOREST_GENESIS_LABEL_UNIVOCITY_ADDR = -68011;
var FOREST_GENESIS_LABEL_CHAIN_ID = -68013;
var FOREST_GENESIS_LABEL_GENESIS_ALG = -68014;
var FOREST_GENESIS_LABEL_BOOTSTRAP_KEY = -68015;
var FOREST_GENESIS_SCHEMA_V2 = 2;

// ../../apps/register/src/genesis-request.ts
function assertBootstrapKey(genesisAlg, bootstrapKey) {
  if (genesisAlg === COSE_ALG_KS256 && bootstrapKey.length !== 20) {
    throw new Error("KS256 bootstrapKey must be 20 bytes (Ethereum address)");
  }
  if (genesisAlg === COSE_ALG_ES256 && bootstrapKey.length !== 64) {
    throw new Error("ES256 bootstrapKey must be 64 bytes (x||y)");
  }
  if (genesisAlg !== COSE_ALG_KS256 && genesisAlg !== COSE_ALG_ES256) {
    throw new Error(`unsupported genesisAlg ${genesisAlg}`);
  }
}
function buildGenesisCborBody(input) {
  if (input.univocityAddr.length !== 20) {
    throw new Error("univocityAddr must be 20 bytes");
  }
  assertBootstrapKey(input.genesisAlg, input.bootstrapKey);
  const map = /* @__PURE__ */ new Map([
    [FOREST_GENESIS_LABEL_GENESIS_VERSION, FOREST_GENESIS_SCHEMA_V2],
    [FOREST_GENESIS_LABEL_GENESIS_ALG, input.genesisAlg],
    [FOREST_GENESIS_LABEL_BOOTSTRAP_KEY, input.bootstrapKey],
    [FOREST_GENESIS_LABEL_UNIVOCITY_ADDR, input.univocityAddr],
    [FOREST_GENESIS_LABEL_CHAIN_ID, input.chainId]
  ]);
  return cborIntKeyBytes(map);
}

// ../../apps/register/src/genesis-client.ts
init_node_index();

// ../../apps/register/src/genesis-client-error.ts
var GenesisClientError = class extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = "GenesisClientError";
  }
};

// ../../apps/register/src/genesis-client.ts
function normalizeBaseUrl(url) {
  return url.trim().replace(/\/$/, "");
}
function assertCoordinatorOk(coordinator) {
  if (!coordinator) {
    throw new GenesisClientError("genesis response missing coordinator forward status");
  }
  if (coordinator.publicRoot !== "ok" || coordinator.webhook !== "ok") {
    throw new GenesisClientError(
      `coordinator registration incomplete (publicRoot=${coordinator.publicRoot}, webhook=${coordinator.webhook})`,
      503,
      coordinator.detail
    );
  }
}
async function postGenesis(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = normalizeBaseUrl(input.canopyBaseUrl);
  const query = input.webhookUrl ? `?webhookUrl=${encodeURIComponent(input.webhookUrl)}` : "";
  const url = `${base}/api/forest/${input.forestR}/genesis${query}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.onboardToken}`,
      "Content-Type": "application/cbor",
      Accept: "application/cbor"
    },
    body: input.body
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GenesisClientError(
      `genesis POST failed: ${response.status}`,
      response.status,
      detail.slice(0, 500)
    );
  }
  const raw = new Uint8Array(await response.arrayBuffer());
  const decoded = decode(raw);
  if (input.webhookUrl) {
    assertCoordinatorOk(decoded.coordinator);
  }
  return decoded;
}

// ../../apps/register/src/log-id.ts
function uuidToHex32(uuid) {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32 || !/^[0-9a-f]+$/.test(hex)) {
    throw new Error(`invalid UUID for log id: ${uuid}`);
  }
  return hex;
}
function logIdFromR(forestR) {
  return uuidToHex32(forestR);
}
function normalizeForestR(forestR) {
  const trimmed = forestR.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new Error("forest R must be a canonical dashed UUID");
  }
  return trimmed.toLowerCase();
}

// ../../apps/register/src/provision.ts
function buildModeBDescriptors(logIdHex32, input) {
  const keyRef = input.keyRef;
  return {
    keyDirectory: {},
    operatorRootKeys: {
      [logIdHex32]: {
        alg: "KS256",
        rootSignerAddress: input.rootSignerAddress,
        kind: "remote",
        signerUrl: input.userSignerUrl,
        keyRef,
        bearerEnvKey: "USER_SIGNER_BEARER"
      }
    }
  };
}
async function provisionInstance(config) {
  const forestR = config.forestR ? normalizeForestR(config.forestR) : randomUUID();
  const logIdHex32 = logIdFromR(forestR);
  const univocityAddr = parseUnivocityAddrHex(config.univocityAddr);
  const fetchImpl = config.fetchImpl;
  let bootstrapKey;
  let descriptors;
  if (config.mode === "C") {
    const modeC = config.modeC;
    if (!modeC) {
      throw new Error("mode C provisioning requires modeC inputs");
    }
    const keyRef = modeC.keyRef ?? "user-log-wallet";
    const client = new PrivyRestClient({
      appId: modeC.appId,
      appSecret: modeC.appSecret,
      apiBase: modeC.apiBase
    });
    const onboard = await onboardModeCWallet(client, {
      walletId: modeC.walletId,
      mandateSignerId: modeC.mandateSignerId,
      keyRef,
      logId: logIdHex32,
      signerUrl: modeC.signerUrl,
      ownerAuthorizationKey: modeC.ownerAuthorizationKey,
      policyId: modeC.policyId
    });
    bootstrapKey = parseEthAddressToBytes(onboard.walletAddress);
    descriptors = {
      keyDirectory: onboard.keyDirectory,
      operatorRootKeys: onboard.operatorRootKeys
    };
  } else if (config.mode === "B") {
    const modeB = config.modeB;
    if (!modeB) {
      throw new Error("mode B provisioning requires modeB inputs");
    }
    bootstrapKey = parseEthAddressToBytes(modeB.rootSignerAddress);
    descriptors = buildModeBDescriptors(logIdHex32, modeB);
  } else {
    throw new Error(`unsupported delegation mode: ${config.mode}`);
  }
  const body = buildGenesisCborBody({
    genesisAlg: COSE_ALG_KS256,
    bootstrapKey,
    univocityAddr,
    chainId: config.chainId
  });
  let genesis;
  try {
    genesis = await postGenesis({
      forestR,
      body,
      onboardToken: config.onboardToken,
      webhookUrl: config.agentWebhookUrl,
      canopyBaseUrl: config.canopyBaseUrl,
      fetchImpl
    });
  } catch (error) {
    if (error instanceof GenesisClientError) {
      throw error;
    }
    throw error;
  }
  const coordinator = genesis.coordinator;
  if (!coordinator) {
    throw new GenesisClientError("genesis succeeded but coordinator status missing");
  }
  return {
    forestR,
    logIdHex32,
    mode: config.mode,
    genesis,
    descriptors,
    coordinator
  };
}

// ../../apps/register/src/onboard-client.ts
var CBOR_LABEL = 1;
var CBOR_CHAIN_ID = 2;
var CBOR_UNIVOCITY_ADDR = 3;
var CBOR_CONTACT_EMAIL = 4;
var CBOR_MANDATE_ORIGIN = 5;
var CBOR_REDEEM_CODE = 1;
async function decodeCborResponse(res) {
  const { decode: decode2 } = await Promise.resolve().then(() => (init_node_index(), node_index_exports));
  return decode2(new Uint8Array(await res.arrayBuffer()));
}
function normalizeBase(base) {
  return base.trim().replace(/\/$/, "");
}
async function requestOnboardToken(opts) {
  const { encode: encode2 } = await Promise.resolve().then(() => (init_node_index(), node_index_exports));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = /* @__PURE__ */ new Map([
    [CBOR_LABEL, opts.label],
    [CBOR_CHAIN_ID, opts.chainId],
    [CBOR_UNIVOCITY_ADDR, opts.univocityAddr.replace(/^0x/i, "")],
    [CBOR_CONTACT_EMAIL, opts.contactEmail]
  ]);
  if (opts.mandateOrigin) {
    body.set(CBOR_MANDATE_ORIGIN, opts.mandateOrigin);
  }
  const response = await fetchImpl(`${normalizeBase(opts.canopyBaseUrl)}/api/onboarding/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/cbor",
      Accept: "application/cbor"
    },
    body: new Uint8Array(encode2(body))
  });
  if (response.status !== 201) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `request onboard: expected 201, got ${response.status}: ${detail.slice(0, 300)}`
    );
  }
  const parsed = await decodeCborResponse(response);
  return {
    requestId: String(parsed.requestId),
    status: String(parsed.status),
    expiresAt: Number(parsed.expiresAt),
    redeemCode: String(parsed.redeemCode)
  };
}
async function getOnboardRequestStatus(canopyBaseUrl, requestId, fetchImpl = fetch) {
  const response = await fetchImpl(
    `${normalizeBase(canopyBaseUrl)}/api/onboarding/requests/${encodeURIComponent(requestId)}`,
    { headers: { Accept: "application/cbor" } }
  );
  if (response.status !== 200) {
    throw new Error(`onboard status: expected 200, got ${response.status}`);
  }
  const parsed = await decodeCborResponse(response);
  return {
    requestId: String(parsed.requestId),
    status: String(parsed.status),
    expiresAt: parsed.expiresAt != null ? Number(parsed.expiresAt) : void 0,
    onboardTokenRef: typeof parsed.onboardTokenRef === "string" ? parsed.onboardTokenRef : void 0
  };
}
async function redeemOnboardToken(opts) {
  const { encode: encode2 } = await Promise.resolve().then(() => (init_node_index(), node_index_exports));
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${normalizeBase(opts.canopyBaseUrl)}/api/onboarding/requests/${encodeURIComponent(opts.requestId)}/redeem`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/cbor",
        Accept: "application/cbor"
      },
      body: new Uint8Array(encode2(/* @__PURE__ */ new Map([[CBOR_REDEEM_CODE, opts.redeemCode]])))
    }
  );
  if (response.status !== 200) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `redeem onboard: expected 200, got ${response.status}: ${detail.slice(0, 300)}`
    );
  }
  const parsed = await decodeCborResponse(response);
  const token = parsed.token;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("redeem onboard: response missing token");
  }
  return token.trim();
}

// ../../apps/register/src/revoke-mode-c-command.ts
function addressesEqual(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}
async function runRevokeModeCCommand(client, options, io) {
  if (!options.mandateSignerId) {
    io.stderr(
      "revoke requires --mandate-signer-id / MANDATE_PRIVY_SIGNER_ID (mandatory for targeted and full-clear revoke paths)"
    );
    return 1;
  }
  if (options.confirmWalletId !== void 0 && options.confirmWalletId !== options.walletId) {
    io.stderr(
      `--confirm-wallet-id (${options.confirmWalletId}) does not match --wallet-id (${options.walletId}); aborting without contacting Privy`
    );
    return 1;
  }
  const action = options.clearAllAdditionalSigners ? "full clear (ALL signers)" : "targeted revoke";
  const wallet = await getWallet(client, options.walletId);
  const before = wallet.additional_signers ?? [];
  if (options.confirmWalletAddress !== void 0 && !addressesEqual(options.confirmWalletAddress, wallet.address)) {
    io.stderr(
      `--confirm-wallet-address (${options.confirmWalletAddress}) does not match Privy wallet address (${wallet.address}); aborting without contacting Privy`
    );
    return 1;
  }
  io.stdout("Mode C revoke \u2014 custody kill switch (ARC-0022 I3)");
  io.stdout(`  walletId:                 ${options.walletId}`);
  io.stdout(`  walletAddress:            ${wallet.address}`);
  io.stdout(`  mandateSigner:            ${options.mandateSignerId}`);
  io.stdout(`  additionalSigners before: ${before.length}`);
  io.stdout(`  action:                   ${action}`);
  if (options.nonInteractive) {
    if (!options.yes) {
      io.stderr(
        "refusing to revoke in non-interactive mode without --yes (pass --yes --confirm-wallet-id <wallet-id> --confirm-wallet-address <address>)"
      );
      return 1;
    }
    if (options.confirmWalletId === void 0) {
      io.stderr("non-interactive revoke requires --confirm-wallet-id <wallet-id>");
      return 1;
    }
    if (options.confirmWalletAddress === void 0) {
      io.stderr(
        "non-interactive revoke requires --confirm-wallet-address <address> (must match the Privy wallet address from the pre-revoke summary)"
      );
      return 1;
    }
  } else if (!options.yes) {
    const proceed = io.confirm ? await io.confirm("Proceed with revoke? [y/N] ") : false;
    if (!proceed) {
      io.stderr("aborted by operator");
      return 1;
    }
  }
  const output = await revokeModeCWallet(client, {
    walletId: options.walletId,
    ownerAuthorizationKey: options.ownerAuthorizationKey,
    mandateSignerId: options.mandateSignerId,
    clearAllAdditionalSigners: options.clearAllAdditionalSigners
  });
  io.stdout(JSON.stringify(output, null, 2));
  emitPostRevokeHint(io, options.walletId);
  return 0;
}
function emitPostRevokeHint(io, walletId) {
  io.stderr(
    `next: run \`mandate-register privy describe-post-revoke-actions --wallet-id ${walletId} --key-ref <keyRef>\` to prune the KEY_DIRECTORY entry and rotate signer Worker secrets`
  );
}

// ../../apps/register/src/describe-post-revoke-actions.ts
var PostRevokeActionsError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "PostRevokeActionsError";
  }
};
function logIdsStillServed(keyDirectory, excludeKeyRef) {
  const served = /* @__PURE__ */ new Set();
  for (const [ref, entry] of Object.entries(keyDirectory)) {
    if (ref === excludeKeyRef) continue;
    for (const logId of entry.logIds) {
      served.add(logId.toLowerCase());
    }
  }
  return served;
}
function describePostRevokeActions(input) {
  const entry = input.keyDirectory[input.keyRef];
  if (!entry) {
    throw new PostRevokeActionsError(`keyRef "${input.keyRef}" not found in KEY_DIRECTORY`);
  }
  if (entry.walletId !== input.walletId) {
    throw new PostRevokeActionsError(
      `keyRef "${input.keyRef}" maps to wallet ${entry.walletId}, not ${input.walletId}`
    );
  }
  const emitUpdatedKeyDirectory = {};
  for (const [ref, value] of Object.entries(input.keyDirectory)) {
    if (ref !== input.keyRef) {
      emitUpdatedKeyDirectory[ref] = value;
    }
  }
  const stillServed = logIdsStillServed(input.keyDirectory, input.keyRef);
  const logIdsOrphaned = entry.logIds.filter((id) => !stillServed.has(id.toLowerCase()));
  const operatorRootKeysEntriesToRemove = {};
  let emitUpdatedOperatorRootKeys;
  if (input.operatorRootKeys && logIdsOrphaned.length > 0) {
    emitUpdatedOperatorRootKeys = { ...input.operatorRootKeys };
    for (const logId of logIdsOrphaned) {
      const descriptor = input.operatorRootKeys[logId];
      if (descriptor && descriptor.keyRef === input.keyRef) {
        operatorRootKeysEntriesToRemove[logId] = descriptor;
        delete emitUpdatedOperatorRootKeys[logId];
      }
    }
    if (Object.keys(emitUpdatedOperatorRootKeys).length === 0) {
      emitUpdatedOperatorRootKeys = {};
    }
  }
  const wranglerHints = [
    `Remove "${input.keyRef}" from KEY_DIRECTORY in Doppler (mandate config).`,
    "Update the signer Worker secret with the pruned directory, e.g.:",
    "  printf '%s' '<updated KEY_DIRECTORY json>' | wrangler secret put KEY_DIRECTORY --name mandate-signer"
  ];
  if (Object.keys(operatorRootKeysEntriesToRemove).length > 0) {
    wranglerHints.push(
      "Prune orphaned logIds from OPERATOR_ROOT_KEYS in Doppler (agent config):",
      `  logIds: ${Object.keys(operatorRootKeysEntriesToRemove).join(", ")}`,
      "  printf '%s' '<updated OPERATOR_ROOT_KEYS json>' | wrangler secret put OPERATOR_ROOT_KEYS --name mandate-agent"
    );
  }
  return {
    walletId: input.walletId,
    keyRef: input.keyRef,
    keyDirectoryEntryToRemove: entry,
    operatorRootKeysAffected: [entry.rootSignerAddress],
    logIdsOrphaned,
    operatorRootKeysEntriesToRemove,
    emitUpdatedKeyDirectory,
    emitUpdatedOperatorRootKeys,
    wranglerHints,
    expectedAgentBehavior: "Until the signer KEY_DIRECTORY secret is updated the signer rejects RPC (Privy 401/403) and the agent fails closed with 502 on sign for this logId; the coordinator may retry. This is the expected state after a custody revoke."
  };
}

// ../../apps/register/src/describe-post-revoke-command.ts
function parseKeyDirectory(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PostRevokeActionsError("KEY_DIRECTORY must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PostRevokeActionsError("KEY_DIRECTORY must be a JSON object");
  }
  return parsed;
}
function runDescribePostRevokeActionsCommand(options, io) {
  if (!options.keyDirectoryJson) {
    io.stderr(
      "KEY_DIRECTORY not provided \u2014 pass --key-directory-json <json> or set the KEY_DIRECTORY environment variable"
    );
    return 1;
  }
  try {
    const keyDirectory = parseKeyDirectory(options.keyDirectoryJson);
    let operatorRootKeys;
    if (options.operatorRootKeysJson) {
      operatorRootKeys = parseKeyDirectory(
        options.operatorRootKeysJson
      );
    }
    const actions = describePostRevokeActions({
      walletId: options.walletId,
      keyRef: options.keyRef,
      keyDirectory,
      operatorRootKeys
    });
    if (options.emitUpdatedKeyDirectory) {
      io.stdout(JSON.stringify(actions.emitUpdatedKeyDirectory, null, 2));
    } else {
      io.stdout(JSON.stringify(actions, null, 2));
    }
    return 0;
  } catch (error) {
    if (error instanceof PostRevokeActionsError) {
      io.stderr(error.message);
      return 1;
    }
    throw error;
  }
}

// ../../apps/register/src/cli.ts
function usageOnboardRequest() {
  console.error(`Usage: mandate-register onboard request [options]

Options:
  --canopy-url       E2E_CANOPY_API_URL (required)
  --label            Instance label (required)
  --chain-id         EIP-155 chain id (required)
  --univocity-addr   40-hex Univocity contract (required)
  --contact-email    Operator contact email (required)
  --mandate-origin   Deployed mandate UI URL (optional)
`);
  process.exit(1);
}
function usageOnboardRedeem() {
  console.error(`Usage: mandate-register onboard redeem [options]

Options:
  --canopy-url       E2E_CANOPY_API_URL (required)
  --request-id       Onboard request id from request step (required)
  --redeem-code      Redeem code from request step (required)
`);
  process.exit(1);
}
function usageOnboardStatus() {
  console.error(`Usage: mandate-register onboard status [options]

Options:
  --canopy-url       E2E_CANOPY_API_URL (required)
  --request-id       Onboard request id (required)
`);
  process.exit(1);
}
function usageProvision() {
  console.error(`Usage: mandate-register provision [options]

Options (env fallbacks in parentheses):
  --onboard-token       E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN (required)
  --canopy-url          E2E_CANOPY_API_URL (required)
  --coordinator-url     E2E_DELEGATION_COORDINATOR_URL (required)
  --webhook-url         E2E_MANDATE_AGENT_WEBHOOK_URL (required)
  --mode                Delegation mode B or C (default: C)
  --univocity-addr      40-hex Univocity contract (E2E_CANOPY_UNIVOCITY_ADDR)
  --chain-id            EIP-155 chain id (E2E_CANOPY_CHAIN_ID)
  --forest-r            Optional dashed UUID for genesis R (generated if omitted)

Mode C (Privy):
  --wallet-id           E2E_MODE_C_USER_PRIVY_WALLET_ID
  --mandate-signer-id   MANDATE_PRIVY_SIGNER_ID
  --owner-auth-key      E2E_MODE_C_PRIVY_OWNER_AUTH_KEY
  --key-ref             KEY_DIRECTORY keyRef (default: user-log-wallet)
  --signer-url          MANDATE_SIGNER_URL
  --policy-id           Existing Privy policy id (optional)

Mode B (user remote signer \u2014 descriptor only, FOR-111):
  --root-address        User KS256 root address (0x\u2026)
  --user-signer-url     User signer POST /v1/sign URL
  --key-ref             keyRef for OPERATOR_ROOT_KEYS
`);
  process.exit(1);
}
function usageOnboardModeC() {
  console.error(`Usage: mandate-register privy onboard-mode-c [options]

Options (env fallbacks in parentheses):
  --wallet-id           Privy user-owned wallet id (E2E_MODE_C_USER_PRIVY_WALLET_ID)
  --mandate-signer-id   Mandate key quorum id (MANDATE_PRIVY_SIGNER_ID)
  --owner-auth-key      Owner authorization key for wallet PATCH (E2E_MODE_C_PRIVY_OWNER_AUTH_KEY)
  --key-ref             KEY_DIRECTORY keyRef (default: user-log-wallet)
  --log-id              32-hex log id (required)
  --signer-url          mandate-signer /v1/sign URL (MANDATE_SIGNER_URL)
  --policy-id           Existing policy id (optional; creates policy if omitted)
`);
  process.exit(1);
}
function usageRevokeModeC() {
  console.error(`Usage: mandate-register privy revoke-mode-c [options]

Destructive: removes mandate as an additional signer on a user-owned Privy
wallet (custody kill switch, ARC-0022 I3). Prints a pre-revoke summary
(wallet id, address, signer count, action) before any change.

Options (env fallbacks in parentheses):
  --wallet-id                     Privy user-owned wallet id (E2E_MODE_C_USER_PRIVY_WALLET_ID)
  --owner-auth-key                Owner authorization key for wallet PATCH (E2E_MODE_C_PRIVY_OWNER_AUTH_KEY)
  --mandate-signer-id             Mandate key quorum id; enables targeted revoke (MANDATE_PRIVY_SIGNER_ID)
  --confirm-wallet-id             Must equal --wallet-id; required in non-interactive/CI runs
  --confirm-wallet-address        Must equal Privy wallet address; required in non-interactive/CI
  --yes                           Skip the interactive prompt (required in non-interactive/CI runs)
  --clear-all-additional-signers  Ops escape hatch: remove ALL additional signers (full clear)

Targeted revoke (default) preserves other authorized signers; full clear requires
--clear-all-additional-signers. --mandate-signer-id is always required.
Prefer E2E_MODE_C_PRIVY_OWNER_AUTH_KEY env over --owner-auth-key (argv is visible in ps).
In CI pass --yes --confirm-wallet-id and --confirm-wallet-address from the pre-revoke summary.
`);
  process.exit(1);
}
function usageDescribePostRevoke() {
  console.error(`Usage: mandate-register privy describe-post-revoke-actions [options]

Emit the operator checklist for retiring a revoked Mode C wallet's signer
secrets. Read-only: never mutates Cloudflare or Doppler secrets.

Options (env fallbacks in parentheses):
  --wallet-id                   Revoked Privy wallet id (E2E_MODE_C_USER_PRIVY_WALLET_ID)
  --key-ref                     KEY_DIRECTORY keyRef to retire (default: user-log-wallet)
  --key-directory-json          KEY_DIRECTORY JSON (KEY_DIRECTORY env)
  --operator-root-keys-json     OPERATOR_ROOT_KEYS JSON (OPERATOR_ROOT_KEYS env)
  --emit-updated-key-directory  Print only the pruned KEY_DIRECTORY for piping
`);
  process.exit(1);
}
function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return void 0;
  return process.argv[index + 1];
}
function hasFlag(name) {
  return process.argv.includes(name);
}
async function promptYesNo(question) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
function envOr(flag, ...names) {
  if (flag) return flag;
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return void 0;
}
function requireOperationalEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}
function requirePrivyClientConfig() {
  return {
    appId: requireOperationalEnv("MANDATE_PRIVY_APP_ID"),
    appSecret: requireOperationalEnv("MANDATE_PRIVY_APP_SECRET"),
    apiBase: requireOperationalEnv("MANDATE_PRIVY_API_BASE")
  };
}
async function runOnboardRequest() {
  const canopyBaseUrl = envOr(readFlag("--canopy-url"), "E2E_CANOPY_API_URL");
  const label = readFlag("--label");
  const chainId = readFlag("--chain-id");
  const univocityAddr = readFlag("--univocity-addr");
  const contactEmail = readFlag("--contact-email");
  const mandateOrigin = readFlag("--mandate-origin");
  if (!canopyBaseUrl || !label || !chainId || !univocityAddr || !contactEmail) {
    usageOnboardRequest();
  }
  const result = await requestOnboardToken({
    canopyBaseUrl,
    label,
    chainId,
    univocityAddr,
    contactEmail,
    mandateOrigin
  });
  console.log(JSON.stringify(result, null, 2));
}
async function runOnboardRedeem() {
  const canopyBaseUrl = envOr(readFlag("--canopy-url"), "E2E_CANOPY_API_URL");
  const requestId = readFlag("--request-id");
  const redeemCode = readFlag("--redeem-code");
  if (!canopyBaseUrl || !requestId || !redeemCode) {
    usageOnboardRedeem();
  }
  const token = await redeemOnboardToken({
    canopyBaseUrl,
    requestId,
    redeemCode
  });
  console.log(JSON.stringify({ token, requestId }, null, 2));
}
async function runOnboardStatus() {
  const canopyBaseUrl = envOr(readFlag("--canopy-url"), "E2E_CANOPY_API_URL");
  const requestId = readFlag("--request-id");
  if (!canopyBaseUrl || !requestId) {
    usageOnboardStatus();
  }
  const status = await getOnboardRequestStatus(canopyBaseUrl, requestId);
  console.log(JSON.stringify(status, null, 2));
}
async function runProvision() {
  const onboardToken = envOr(readFlag("--onboard-token"), "E2E_CANOPY_PAYMENTS_ONBOARD_TOKEN");
  const canopyBaseUrl = envOr(readFlag("--canopy-url"), "E2E_CANOPY_API_URL");
  const coordinatorBaseUrl = envOr(readFlag("--coordinator-url"), "E2E_DELEGATION_COORDINATOR_URL");
  const agentWebhookUrl = envOr(readFlag("--webhook-url"), "E2E_MANDATE_AGENT_WEBHOOK_URL");
  const modeRaw = (readFlag("--mode") ?? process.env.MANDATE_DELEGATION_MODE ?? "C").toUpperCase();
  const mode = modeRaw === "B" ? "B" : "C";
  const univocityAddr = envOr(readFlag("--univocity-addr"), "E2E_CANOPY_UNIVOCITY_ADDR");
  const chainId = envOr(readFlag("--chain-id"), "E2E_CANOPY_CHAIN_ID");
  const forestR = readFlag("--forest-r") ?? process.env.MANDATE_FOREST_R;
  if (!onboardToken || !canopyBaseUrl || !coordinatorBaseUrl || !agentWebhookUrl || !univocityAddr || !chainId) {
    usageProvision();
  }
  const base = {
    onboardToken,
    canopyBaseUrl,
    coordinatorBaseUrl,
    agentWebhookUrl,
    mode,
    univocityAddr,
    chainId,
    forestR: forestR ?? randomUUID2()
  };
  if (mode === "C") {
    const walletId = envOr(readFlag("--wallet-id"), "E2E_MODE_C_USER_PRIVY_WALLET_ID");
    const mandateSignerId = envOr(readFlag("--mandate-signer-id"), "MANDATE_PRIVY_SIGNER_ID");
    const ownerAuthorizationKey = envOr(
      readFlag("--owner-auth-key"),
      "E2E_MODE_C_PRIVY_OWNER_AUTH_KEY"
    );
    const signerUrl = envOr(readFlag("--signer-url"), "MANDATE_SIGNER_URL");
    const privy = requirePrivyClientConfig();
    if (!walletId || !mandateSignerId || !ownerAuthorizationKey || !signerUrl) {
      usageProvision();
    }
    const output2 = await provisionInstance({
      ...base,
      modeC: {
        ...privy,
        walletId,
        mandateSignerId,
        ownerAuthorizationKey,
        signerUrl,
        keyRef: readFlag("--key-ref") ?? "user-log-wallet",
        policyId: readFlag("--policy-id")
      }
    });
    console.log(JSON.stringify(output2, null, 2));
    return;
  }
  const rootSignerAddress = readFlag("--root-address");
  const userSignerUrl = readFlag("--user-signer-url");
  const keyRef = readFlag("--key-ref");
  if (!rootSignerAddress || !userSignerUrl || !keyRef) {
    usageProvision();
  }
  const output = await provisionInstance({
    ...base,
    modeB: {
      rootSignerAddress,
      userSignerUrl,
      keyRef
    }
  });
  console.log(JSON.stringify(output, null, 2));
}
async function runOnboardModeC() {
  const walletId = readFlag("--wallet-id") ?? process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
  const mandateSignerId = readFlag("--mandate-signer-id") ?? process.env.MANDATE_PRIVY_SIGNER_ID;
  const ownerAuthorizationKey = readFlag("--owner-auth-key") ?? process.env.E2E_MODE_C_PRIVY_OWNER_AUTH_KEY;
  const keyRef = readFlag("--key-ref") ?? "user-log-wallet";
  const logId = readFlag("--log-id");
  const signerUrl = readFlag("--signer-url") ?? process.env.MANDATE_SIGNER_URL;
  const policyId = readFlag("--policy-id");
  const privy = requirePrivyClientConfig();
  if (!walletId || !mandateSignerId || !ownerAuthorizationKey || !logId || !signerUrl) {
    usageOnboardModeC();
  }
  const client = new PrivyRestClient(privy);
  const output = await onboardModeCWallet(client, {
    walletId,
    mandateSignerId,
    keyRef,
    logId,
    signerUrl,
    ownerAuthorizationKey,
    policyId
  });
  console.log(JSON.stringify(output, null, 2));
}
async function runRevokeModeC() {
  const walletId = readFlag("--wallet-id") ?? process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
  const ownerAuthFromArgv = readFlag("--owner-auth-key");
  const ownerAuthorizationKey = ownerAuthFromArgv ?? process.env.E2E_MODE_C_PRIVY_OWNER_AUTH_KEY;
  const mandateSignerId = readFlag("--mandate-signer-id") ?? process.env.MANDATE_PRIVY_SIGNER_ID;
  const confirmWalletId = readFlag("--confirm-wallet-id");
  const confirmWalletAddress = readFlag("--confirm-wallet-address");
  const yes = hasFlag("--yes");
  const clearAllAdditionalSigners = hasFlag("--clear-all-additional-signers");
  const privy = requirePrivyClientConfig();
  if (!walletId || !ownerAuthorizationKey) {
    usageRevokeModeC();
  }
  if (!mandateSignerId) {
    console.error("Missing --mandate-signer-id / MANDATE_PRIVY_SIGNER_ID");
    usageRevokeModeC();
  }
  if (ownerAuthFromArgv !== void 0) {
    console.error(
      "warning: --owner-auth-key on the command line is visible in process listings; prefer E2E_MODE_C_PRIVY_OWNER_AUTH_KEY from the environment"
    );
  }
  const client = new PrivyRestClient(privy);
  const nonInteractive = process.env.CI === "true" || !process.stdout.isTTY;
  const exitCode = await runRevokeModeCCommand(
    client,
    {
      walletId,
      ownerAuthorizationKey,
      mandateSignerId,
      confirmWalletId,
      confirmWalletAddress,
      yes,
      clearAllAdditionalSigners,
      nonInteractive
    },
    {
      stdout: (line) => console.log(line),
      stderr: (line) => console.error(line),
      confirm: promptYesNo
    }
  );
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
async function runDescribePostRevokeActions() {
  const walletId = readFlag("--wallet-id") ?? process.env.E2E_MODE_C_USER_PRIVY_WALLET_ID;
  const keyRef = readFlag("--key-ref") ?? "user-log-wallet";
  const keyDirectoryJson = readFlag("--key-directory-json") ?? process.env.KEY_DIRECTORY;
  const operatorRootKeysJson = readFlag("--operator-root-keys-json") ?? process.env.OPERATOR_ROOT_KEYS;
  const emitUpdatedKeyDirectory = hasFlag("--emit-updated-key-directory");
  if (!walletId) {
    usageDescribePostRevoke();
  }
  const exitCode = runDescribePostRevokeActionsCommand(
    {
      walletId,
      keyRef,
      keyDirectoryJson,
      operatorRootKeysJson,
      emitUpdatedKeyDirectory
    },
    {
      stdout: (line) => console.log(line),
      stderr: (line) => console.error(line)
    }
  );
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
async function main() {
  const sub = process.argv[2];
  const cmd = process.argv[3];
  if (sub === "onboard" && cmd === "request") {
    await runOnboardRequest();
    return;
  }
  if (sub === "onboard" && cmd === "redeem") {
    await runOnboardRedeem();
    return;
  }
  if (sub === "onboard" && cmd === "status") {
    await runOnboardStatus();
    return;
  }
  if (sub === "provision") {
    await runProvision();
    return;
  }
  if (sub === "privy" && cmd === "onboard-mode-c") {
    await runOnboardModeC();
    return;
  }
  if (sub === "privy" && cmd === "revoke-mode-c") {
    await runRevokeModeC();
    return;
  }
  if (sub === "privy" && cmd === "describe-post-revoke-actions") {
    await runDescribePostRevokeActions();
    return;
  }
  console.log("mandate-register: Univocity instance provisioning (FOR-100)");
  console.log("  subcommands:");
  console.log("    onboard request          Self-service onboard token request (FOR-173)");
  console.log("    onboard status           Poll onboard request status");
  console.log("    onboard redeem           Redeem approved request for onboard token");
  console.log("    provision                Full genesis + descriptor emission");
  console.log("    privy onboard-mode-c   Mode C Privy wallet onboarding only (FOR-112)");
  console.log(
    "    privy revoke-mode-c    Mode C kill switch \u2014 remove additional signers (FOR-114)"
  );
  console.log(
    "    privy describe-post-revoke-actions  Post-revoke KEY_DIRECTORY checklist (FOR-131)"
  );
  process.exit(sub ? 1 : 0);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/utils.js:
@noble/curves/esm/abstract/modular.js:
@noble/curves/esm/abstract/curve.js:
@noble/curves/esm/abstract/weierstrass.js:
@noble/curves/esm/_shortw_utils.js:
@noble/curves/esm/nist.js:
@noble/curves/esm/p256.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
//# sourceMappingURL=cli.js.map

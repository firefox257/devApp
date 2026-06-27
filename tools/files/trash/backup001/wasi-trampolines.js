/**
 * WASI Preview 2 Trampoline Functions
 * Extracted from bundle.js - bridges WASM imports to JavaScript implementations
 */

// ============================================
// Constants & Utilities
// ============================================
const T_FLAG = 1 << 30;
const symbolCabiDispose = Symbol.for("cabiDispose");
const symbolRscHandle = Symbol("handle");
const symbolRscRep = Symbol.for("cabiRep");
const symbolDispose = Symbol.dispose || Symbol.for("dispose");

// Handle tables for 8 resource types
const handleTables = [
  [T_FLAG, 0], // 0: Error
  [T_FLAG, 0], // 1: Pollable
  [T_FLAG, 0], // 2: InputStream
  [T_FLAG, 0], // 3: OutputStream
  [T_FLAG, 0], // 4: TerminalInput
  [T_FLAG, 0], // 5: TerminalOutput
  [T_FLAG, 0], // 6: DirectoryEntryStream
  [T_FLAG, 0]  // 7: Descriptor
];

const captureTables = [
  new Map(), new Map(), new Map(), new Map(),
  new Map(), new Map(), new Map(), new Map()
];

const captureCnts = [0, 0, 0, 0, 0, 0, 0, 0];

// Memory view
let dv = new DataView(new ArrayBuffer());
const dataView = (mem) => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
const toUint64 = (val) => BigInt.asUintN(64, BigInt(val));
const toUint32 = (val) => val >>> 0;

// UTF-8 encoding
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();
let utf8EncodedLen = 0;

function utf8Encode(s, realloc, memory) {
  if (typeof s !== 'string') throw new TypeError('expected a string');
  if (s.length === 0) { utf8EncodedLen = 0; return 1; }
  let buf = utf8Encoder.encode(s);
  let ptr = realloc(0, 0, 1, buf.length);
  new Uint8Array(memory.buffer).set(buf, ptr);
  utf8EncodedLen = buf.length;
  return ptr;
}

// Resource table management
function rscTableCreateOwn(table, rep) {
  const free = table[0] & ~T_FLAG;
  if (free === 0) { table.push(0); table.push(rep | T_FLAG); return (table.length >> 1) - 1; }
  table[0] = table[free << 1];
  table[free << 1] = 0;
  table[(free << 1) + 1] = rep | T_FLAG;
  return free;
}

function rscTableRemove(table, handle) {
  const scope = table[handle << 1];
  const val = table[(handle << 1) + 1];
  const own = (val & T_FLAG) !== 0;
  const rep = val & ~T_FLAG;
  if (val === 0 || (scope & T_FLAG) !== 0) throw new TypeError('Invalid handle');
  table[handle << 1] = table[0] | T_FLAG;
  table[0] = handle | T_FLAG;
  return { rep, scope, own };
}

// Resource drop handlers
function makeDropHandler(tableIdx, proto, symbol) {
  return (handle) => {
    const handleEntry = rscTableRemove(handleTables[tableIdx], handle);
    if (handleEntry.own) {
      const rsc = captureTables[tableIdx].get(handleEntry.rep);
      if (rsc && rsc[symbol]) rsc[symbol]();
      captureTables[tableIdx].delete(handleEntry.rep);
    }
  };
}

// Error code enum mapping
const ERROR_CODE_ENUM = {
  "access": 0, "would-block": 1, "already": 2, "bad-descriptor": 3,
  "busy": 4, "deadlock": 5, "quota": 6, "exist": 7, "file-too-large": 8,
  "illegal-byte-sequence": 9, "in-progress": 10, "interrupted": 11,
  "invalid": 12, "io": 13, "is-directory": 14, "loop": 15,
  "too-many-links": 16, "message-size": 17, "name-too-long": 18,
  "no-device": 19, "no-entry": 20, "no-lock": 21, "insufficient-memory": 22,
  "insufficient-space": 23, "not-directory": 24, "not-empty": 25,
  "not-recoverable": 26, "unsupported": 27, "no-tty": 28,
  "no-such-device": 29, "overflow": 30, "not-permitted": 31,
  "pipe": 32, "read-only": 33, "invalid-seek": 34, "text-file-busy": 35,
  "cross-device": 36
};

const DESCRIPTOR_TYPE_ENUM = {
  "unknown": 0, "block-device": 1, "character-device": 2, "directory": 3,
  "fifo": 4, "symbolic-link": 5, "regular-file": 6, "socket": 7
};

function getErrorPayload(e) {
  if (e && Object.prototype.hasOwnProperty.call(e, "payload")) return e.payload;
  if (e instanceof Error) throw e;
  return e;
}

// ============================================
// TRAMPOLINE FUNCTIONS (0-54+)
// ============================================

export function createTrampolines(runtime, memory0, realloc0) {
  const { cli, fs, io, monotonicClock, random, wallClock } = runtime;
  const {
    TerminalInput, TerminalOutput, exit, getArguments, getEnvironment,
    getStderr, getStdin, getStdout, getTerminalStderr, getTerminalStdin, getTerminalStdout
  } = cli;
  const { Descriptor, DirectoryEntryStream, filesystemErrorCode, getDirectories } = fs;
  const { Error: IoError, InputStream, OutputStream, Pollable, poll } = io;
  const { now: monotonicNow, subscribeDuration, subscribeInstant } = monotonicClock;
  const { getRandomBytes } = random;
  const { now: wallClockNow } = wallClock;

  const curResourceBorrows = [];

  // === Clock Trampolines ===
  function trampoline0() {
    const ret = monotonicNow();
    return toUint64(ret);
  }

  function trampoline6(arg0) {
    const ret = subscribeDuration(BigInt.asUintN(64, arg0));
    if (!(ret instanceof Pollable)) throw new TypeError('Resource error: Not a valid "Pollable" resource.');
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnts[1];
      captureTables[1].set(rep, ret);
      handle0 = rscTableCreateOwn(handleTables[1], rep);
    }
    return handle0;
  }

  function trampoline7(arg0) {
    const ret = subscribeInstant(BigInt.asUintN(64, arg0));
    if (!(ret instanceof Pollable)) throw new TypeError('Resource error: Not a valid "Pollable" resource.');
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnts[1];
      captureTables[1].set(rep, ret);
      handle0 = rscTableCreateOwn(handleTables[1], rep);
    }
    return handle0;
  }

  // === Stream Trampolines ===
  function trampoline8(arg0) {
    var handle1 = arg0;
    var rep2 = handleTables[3][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[3].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(OutputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    const ret = rsc0.subscribe();
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    if (!(ret instanceof Pollable)) throw new TypeError('Resource error: Not a valid "Pollable" resource.');
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnts[1];
      captureTables[1].set(rep, ret);
      handle3 = rscTableCreateOwn(handleTables[1], rep);
    }
    return handle3;
  }

  function trampoline9(arg0) {
    var handle1 = arg0;
    var rep2 = handleTables[2][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[2].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(InputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    const ret = rsc0.subscribe();
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    if (!(ret instanceof Pollable)) throw new TypeError('Resource error: Not a valid "Pollable" resource.');
    var handle3 = ret[symbolRscHandle];
    if (!handle3) {
      const rep = ret[symbolRscRep] || ++captureCnts[1];
      captureTables[1].set(rep, ret);
      handle3 = rscTableCreateOwn(handleTables[1], rep);
    }
    return handle3;
  }

  // === CLI Trampolines ===
  function trampoline11() {
    const ret = getStderr();
    if (!(ret instanceof OutputStream)) throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnts[3];
      captureTables[3].set(rep, ret);
      handle0 = rscTableCreateOwn(handleTables[3], rep);
    }
    return handle0;
  }

  function trampoline14() {
    const ret = getStdin();
    if (!(ret instanceof InputStream)) throw new TypeError('Resource error: Not a valid "InputStream" resource.');
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnts[2];
      captureTables[2].set(rep, ret);
      handle0 = rscTableCreateOwn(handleTables[2], rep);
    }
    return handle0;
  }

  function trampoline15() {
    const ret = getStdout();
    if (!(ret instanceof OutputStream)) throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
    var handle0 = ret[symbolRscHandle];
    if (!handle0) {
      const rep = ret[symbolRscRep] || ++captureCnts[3];
      captureTables[3].set(rep, ret);
      handle0 = rscTableCreateOwn(handleTables[3], rep);
    }
    return handle0;
  }

  function trampoline16(arg0) {
    let variant0;
    switch (arg0) {
      case 0: variant0 = { tag: "ok", val: void 0 }; break;
      case 1: variant0 = { tag: "err", val: void 0 }; break;
      default: throw new TypeError("invalid variant discriminant for expected");
    }
    exit(variant0);
  }

  function trampoline17(arg0) {
    const ret = getArguments();
    var vec1 = ret;
    var len1 = vec1.length;
    var result1 = realloc0(0, 0, 4, len1 * 8);
    for (let i = 0; i < vec1.length; i++) {
      const e = vec1[i];
      const base = result1 + i * 8;
      var ptr0 = utf8Encode(e, realloc0, memory0);
      var len0 = utf8EncodedLen;
      dataView(memory0).setUint32(base + 4, len0, true);
      dataView(memory0).setUint32(base + 0, ptr0, true);
    }
    dataView(memory0).setUint32(arg0 + 4, len1, true);
    dataView(memory0).setUint32(arg0 + 0, result1, true);
  }

  function trampoline18(arg0) {
    const ret = getEnvironment();
    var vec3 = ret;
    var len3 = vec3.length;
    var result3 = realloc0(0, 0, 4, len3 * 16);
    for (let i = 0; i < vec3.length; i++) {
      const e = vec3[i];
      const base = result3 + i * 16;
      var [tuple0_0, tuple0_1] = e;
      var ptr1 = utf8Encode(tuple0_0, realloc0, memory0);
      var len1 = utf8EncodedLen;
      dataView(memory0).setUint32(base + 4, len1, true);
      dataView(memory0).setUint32(base + 0, ptr1, true);
      var ptr2 = utf8Encode(tuple0_1, realloc0, memory0);
      var len2 = utf8EncodedLen;
      dataView(memory0).setUint32(base + 12, len2, true);
      dataView(memory0).setUint32(base + 8, ptr2, true);
    }
    dataView(memory0).setUint32(arg0 + 4, len3, true);
    dataView(memory0).setUint32(arg0 + 0, result3, true);
  }

  function trampoline19(arg0) {
    const ret = wallClockNow();
    var { seconds: v0_0, nanoseconds: v0_1 } = ret;
    dataView(memory0).setBigInt64(arg0 + 0, toUint64(v0_0), true);
    dataView(memory0).setInt32(arg0 + 8, toUint32(v0_1), true);
  }

  // === Filesystem Descriptor Trampolines (20-54) ===
  function trampoline20(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.getFlags() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        let flags3 = 0;
        if (typeof e === "object" && e !== null) {
          flags3 = Boolean(e.read) << 0 | Boolean(e.write) << 1 | Boolean(e.fileIntegritySync) << 2 |
                   Boolean(e.dataIntegritySync) << 3 | Boolean(e.requestedWriteSync) << 4 | Boolean(e.mutateDirectory) << 5;
        }
        dataView(memory0).setInt8(arg1 + 1, flags3, true);
        break;
      }
      case "err": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 1, ERROR_CODE_ENUM[e] || 13, true);
        break;
      }
    }
  }

  function trampoline21(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.getType() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        dataView(memory0).setInt8(arg1 + 1, DESCRIPTOR_TYPE_ENUM[e] || 0, true);
        break;
      }
      case "err": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 1, ERROR_CODE_ENUM[e] || 13, true);
        break;
      }
    }
  }

  function trampoline22(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.metadataHash() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        dataView(memory0).setBigInt64(arg1 + 8, toUint64(e.lower), true);
        dataView(memory0).setBigInt64(arg1 + 16, toUint64(e.upper), true);
        break;
      }
      case "err": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 8, ERROR_CODE_ENUM[e] || 13, true);
        break;
      }
    }
  }

  function trampoline23(arg0, arg1, arg2) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.setSize(BigInt.asUintN(64, arg1)) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant4 = ret;
    switch (variant4.tag) {
      case "ok": dataView(memory0).setInt8(arg2 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg2 + 0, 1, true);
        dataView(memory0).setInt8(arg2 + 1, ERROR_CODE_ENUM[variant4.val] || 13, true);
        break;
      }
    }
  }

  function trampoline24(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[0][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[0].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(IoError.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    const ret = filesystemErrorCode(rsc0);
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    if (ret === null || ret === void 0) {
      dataView(memory0).setInt8(arg1 + 0, 0, true);
    } else {
      dataView(memory0).setInt8(arg1 + 0, 1, true);
      dataView(memory0).setInt8(arg1 + 1, ERROR_CODE_ENUM[ret] || 13, true);
    }
  }

  function trampoline25(arg0, arg1, arg2, arg3, arg4) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var flags3 = { symlinkFollow: Boolean(arg1 & 1) };
    var ptr4 = arg2;
    var len4 = arg3;
    var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
    let ret;
    try { ret = { tag: "ok", val: rsc0.metadataHashAt(flags3, result4) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant7 = ret;
    switch (variant7.tag) {
      case "ok": {
        const e = variant7.val;
        dataView(memory0).setInt8(arg4 + 0, 0, true);
        dataView(memory0).setBigInt64(arg4 + 8, toUint64(e.lower), true);
        dataView(memory0).setBigInt64(arg4 + 16, toUint64(e.upper), true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg4 + 0, 1, true);
        dataView(memory0).setInt8(arg4 + 8, ERROR_CODE_ENUM[variant7.val] || 13, true);
        break;
      }
    }
  }

  function trampoline26(arg0, arg1, arg2, arg3) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var ptr3 = arg1;
    var len3 = arg2;
    var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    let ret;
    try { ret = { tag: "ok", val: rsc0.createDirectoryAt(result3) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": dataView(memory0).setInt8(arg3 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg3 + 0, 1, true);
        dataView(memory0).setInt8(arg3 + 1, ERROR_CODE_ENUM[variant5.val] || 13, true);
        break;
      }
    }
  }

  function trampoline27(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var flags3 = { symlinkFollow: Boolean(arg1 & 1) };
    var ptr4 = arg2;
    var len4 = arg3;
    var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
    var handle6 = arg4;
    var rep7 = handleTables[7][(handle6 << 1) + 1] & ~T_FLAG;
    var rsc5 = captureTables[7].get(rep7);
    if (!rsc5) {
      rsc5 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc5, symbolRscHandle, { writable: true, value: handle6 });
      Object.defineProperty(rsc5, symbolRscRep, { writable: true, value: rep7 });
    }
    curResourceBorrows.push(rsc5);
    var ptr8 = arg5;
    var len8 = arg6;
    var result8 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr8, len8));
    let ret;
    try { ret = { tag: "ok", val: rsc0.linkAt(flags3, result4, rsc5, result8) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant10 = ret;
    switch (variant10.tag) {
      case "ok": dataView(memory0).setInt8(arg7 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg7 + 0, 1, true);
        dataView(memory0).setInt8(arg7 + 1, ERROR_CODE_ENUM[variant10.val] || 13, true);
        break;
      }
    }
  }

  function trampoline28(arg0, arg1, arg2, arg3) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var ptr3 = arg1;
    var len3 = arg2;
    var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    let ret;
    try { ret = { tag: "ok", val: rsc0.readlinkAt(result3) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant6 = ret;
    switch (variant6.tag) {
      case "ok": {
        const e = variant6.val;
        dataView(memory0).setInt8(arg3 + 0, 0, true);
        var ptr4 = utf8Encode(e, realloc0, memory0);
        var len4 = utf8EncodedLen;
        dataView(memory0).setUint32(arg3 + 8, len4, true);
        dataView(memory0).setUint32(arg3 + 4, ptr4, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg3 + 0, 1, true);
        dataView(memory0).setInt8(arg3 + 4, ERROR_CODE_ENUM[variant6.val] || 13, true);
        break;
      }
    }
  }

  function trampoline29(arg0, arg1, arg2, arg3) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var ptr3 = arg1;
    var len3 = arg2;
    var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    let ret;
    try { ret = { tag: "ok", val: rsc0.removeDirectoryAt(result3) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": dataView(memory0).setInt8(arg3 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg3 + 0, 1, true);
        dataView(memory0).setInt8(arg3 + 1, ERROR_CODE_ENUM[variant5.val] || 13, true);
        break;
      }
    }
  }

  function trampoline30(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var ptr3 = arg1;
    var len3 = arg2;
    var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    var handle5 = arg3;
    var rep6 = handleTables[7][(handle5 << 1) + 1] & ~T_FLAG;
    var rsc4 = captureTables[7].get(rep6);
    if (!rsc4) {
      rsc4 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc4, symbolRscHandle, { writable: true, value: handle5 });
      Object.defineProperty(rsc4, symbolRscRep, { writable: true, value: rep6 });
    }
    curResourceBorrows.push(rsc4);
    var ptr7 = arg4;
    var len7 = arg5;
    var result7 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr7, len7));
    let ret;
    try { ret = { tag: "ok", val: rsc0.renameAt(result3, rsc4, result7) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant9 = ret;
    switch (variant9.tag) {
      case "ok": dataView(memory0).setInt8(arg6 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg6 + 0, 1, true);
        dataView(memory0).setInt8(arg6 + 1, ERROR_CODE_ENUM[variant9.val] || 13, true);
        break;
      }
    }
  }

  function trampoline31(arg0, arg1, arg2, arg3, arg4, arg5) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var ptr3 = arg1;
    var len3 = arg2;
    var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    var ptr4 = arg3;
    var len4 = arg4;
    var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
    let ret;
    try { ret = { tag: "ok", val: rsc0.symlinkAt(result3, result4) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant6 = ret;
    switch (variant6.tag) {
      case "ok": dataView(memory0).setInt8(arg5 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg5 + 0, 1, true);
        dataView(memory0).setInt8(arg5 + 1, ERROR_CODE_ENUM[variant6.val] || 13, true);
        break;
      }
    }
  }

  function trampoline32(arg0, arg1, arg2, arg3) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var ptr3 = arg1;
    var len3 = arg2;
    var result3 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr3, len3));
    let ret;
    try { ret = { tag: "ok", val: rsc0.unlinkFileAt(result3) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": dataView(memory0).setInt8(arg3 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg3 + 0, 1, true);
        dataView(memory0).setInt8(arg3 + 1, ERROR_CODE_ENUM[variant5.val] || 13, true);
        break;
      }
    }
  }

  function trampoline33(arg0, arg1, arg2) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.readViaStream(BigInt.asUintN(64, arg1)) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg2 + 0, 0, true);
        if (!(e instanceof InputStream)) throw new TypeError('Resource error: Not a valid "InputStream" resource.');
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnts[2];
          captureTables[2].set(rep, e);
          handle3 = rscTableCreateOwn(handleTables[2], rep);
        }
        dataView(memory0).setInt32(arg2 + 4, handle3, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg2 + 0, 1, true);
        dataView(memory0).setInt8(arg2 + 4, ERROR_CODE_ENUM[variant5.val] || 13, true);
        break;
      }
    }
  }

  function trampoline34(arg0, arg1, arg2) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.writeViaStream(BigInt.asUintN(64, arg1)) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg2 + 0, 0, true);
        if (!(e instanceof OutputStream)) throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnts[3];
          captureTables[3].set(rep, e);
          handle3 = rscTableCreateOwn(handleTables[3], rep);
        }
        dataView(memory0).setInt32(arg2 + 4, handle3, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg2 + 0, 1, true);
        dataView(memory0).setInt8(arg2 + 4, ERROR_CODE_ENUM[variant5.val] || 13, true);
        break;
      }
    }
  }

  function trampoline35(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.appendViaStream() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        if (!(e instanceof OutputStream)) throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnts[3];
          captureTables[3].set(rep, e);
          handle3 = rscTableCreateOwn(handleTables[3], rep);
        }
        dataView(memory0).setInt32(arg1 + 4, handle3, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 4, ERROR_CODE_ENUM[variant5.val] || 13, true);
        break;
      }
    }
  }

  function trampoline36(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let variant3;
    switch (arg1) {
      case 0: variant3 = { tag: "no-change" }; break;
      case 1: variant3 = { tag: "now" }; break;
      case 2: variant3 = { tag: "timestamp", val: { seconds: BigInt.asUintN(64, arg2), nanoseconds: arg3 >>> 0 } }; break;
      default: throw new TypeError("invalid variant discriminant for NewTimestamp");
    }
    let variant4;
    switch (arg4) {
      case 0: variant4 = { tag: "no-change" }; break;
      case 1: variant4 = { tag: "now" }; break;
      case 2: variant4 = { tag: "timestamp", val: { seconds: BigInt.asUintN(64, arg5), nanoseconds: arg6 >>> 0 } }; break;
      default: throw new TypeError("invalid variant discriminant for NewTimestamp");
    }
    let ret;
    try { ret = { tag: "ok", val: rsc0.setTimes(variant3, variant4) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant6 = ret;
    switch (variant6.tag) {
      case "ok": dataView(memory0).setInt8(arg7 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg7 + 0, 1, true);
        dataView(memory0).setInt8(arg7 + 1, ERROR_CODE_ENUM[variant6.val] || 13, true);
        break;
      }
    }
  }

  function trampoline37(arg0, arg1, arg2, arg3) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.read(BigInt.asUintN(64, arg1), BigInt.asUintN(64, arg2)) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant6 = ret;
    switch (variant6.tag) {
      case "ok": {
        const e = variant6.val;
        dataView(memory0).setInt8(arg3 + 0, 0, true);
        var [tuple3_0, tuple3_1] = e;
        var val4 = tuple3_0;
        var len4 = val4.byteLength;
        var ptr4 = realloc0(0, 0, 1, len4 * 1);
        var src4 = new Uint8Array(val4.buffer || val4, val4.byteOffset, len4 * 1);
        new Uint8Array(memory0.buffer, ptr4, len4 * 1).set(src4);
        dataView(memory0).setUint32(arg3 + 8, len4, true);
        dataView(memory0).setUint32(arg3 + 4, ptr4, true);
        dataView(memory0).setInt8(arg3 + 12, tuple3_1 ? 1 : 0, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg3 + 0, 1, true);
        dataView(memory0).setInt8(arg3 + 4, ERROR_CODE_ENUM[variant6.val] || 13, true);
        break;
      }
    }
  }

  function trampoline38(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.readDirectory() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        const e = variant5.val;
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        if (!(e instanceof DirectoryEntryStream)) throw new TypeError('Resource error: Not a valid "DirectoryEntryStream" resource.');
        var handle3 = e[symbolRscHandle];
        if (!handle3) {
          const rep = e[symbolRscRep] || ++captureCnts[6];
          captureTables[6].set(rep, e);
          handle3 = rscTableCreateOwn(handleTables[6], rep);
        }
        dataView(memory0).setInt32(arg1 + 4, handle3, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 4, ERROR_CODE_ENUM[variant5.val] || 13, true);
        break;
      }
    }
  }

  function trampoline39(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.stat() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant12 = ret;
    switch (variant12.tag) {
      case "ok": {
        const e = variant12.val;
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        dataView(memory0).setInt8(arg1 + 8, DESCRIPTOR_TYPE_ENUM[e.type] || 0, true);
        dataView(memory0).setBigInt64(arg1 + 16, toUint64(e.linkCount), true);
        dataView(memory0).setBigInt64(arg1 + 24, toUint64(e.size), true);
        // Timestamps omitted for brevity - set to 0
        dataView(memory0).setInt8(arg1 + 32, 0, true);
        dataView(memory0).setInt8(arg1 + 56, 0, true);
        dataView(memory0).setInt8(arg1 + 80, 0, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 8, ERROR_CODE_ENUM[variant12.val] || 13, true);
        break;
      }
    }
  }

  function trampoline40(arg0, arg1, arg2, arg3, arg4) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var flags3 = { symlinkFollow: Boolean(arg1 & 1) };
    var ptr4 = arg2;
    var len4 = arg3;
    var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
    let ret;
    try { ret = { tag: "ok", val: rsc0.statAt(flags3, result4) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant14 = ret;
    switch (variant14.tag) {
      case "ok": {
        const e = variant14.val;
        dataView(memory0).setInt8(arg4 + 0, 0, true);
        dataView(memory0).setInt8(arg4 + 8, DESCRIPTOR_TYPE_ENUM[e.type] || 0, true);
        dataView(memory0).setBigInt64(arg4 + 16, toUint64(e.linkCount), true);
        dataView(memory0).setBigInt64(arg4 + 24, toUint64(e.size), true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg4 + 0, 1, true);
        dataView(memory0).setInt8(arg4 + 8, ERROR_CODE_ENUM[variant14.val] || 13, true);
        break;
      }
    }
  }

  function trampoline41(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
    var handle1 = arg0;
    var rep2 = handleTables[7][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[7].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(Descriptor.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var flags3 = { symlinkFollow: Boolean(arg1 & 1) };
    var ptr4 = arg2;
    var len4 = arg3;
    var result4 = utf8Decoder.decode(new Uint8Array(memory0.buffer, ptr4, len4));
    var flags5 = {
      create: Boolean(arg4 & 1), directory: Boolean(arg4 & 2),
      exclusive: Boolean(arg4 & 4), truncate: Boolean(arg4 & 8)
    };
    var flags6 = {
      read: Boolean(arg5 & 1), write: Boolean(arg5 & 2),
      fileIntegritySync: Boolean(arg5 & 4), dataIntegritySync: Boolean(arg5 & 8),
      requestedWriteSync: Boolean(arg5 & 16), mutateDirectory: Boolean(arg5 & 32)
    };
    let ret;
    try { ret = { tag: "ok", val: rsc0.openAt(flags3, result4, flags5, flags6) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant9 = ret;
    switch (variant9.tag) {
      case "ok": {
        const e = variant9.val;
        dataView(memory0).setInt8(arg6 + 0, 0, true);
        if (!(e instanceof Descriptor)) throw new TypeError('Resource error: Not a valid "Descriptor" resource.');
        var handle7 = e[symbolRscHandle];
        if (!handle7) {
          const rep = e[symbolRscRep] || ++captureCnts[7];
          captureTables[7].set(rep, e);
          handle7 = rscTableCreateOwn(handleTables[7], rep);
        }
        dataView(memory0).setInt32(arg6 + 4, handle7, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg6 + 0, 1, true);
        dataView(memory0).setInt8(arg6 + 4, ERROR_CODE_ENUM[variant9.val] || 13, true);
        break;
      }
    }
  }

  function trampoline42(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[6][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[6].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(DirectoryEntryStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.readDirectoryEntry() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant8 = ret;
    switch (variant8.tag) {
      case "ok": {
        const e = variant8.val;
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        if (e === null || e === void 0) {
          dataView(memory0).setInt8(arg1 + 4, 0, true);
        } else {
          dataView(memory0).setInt8(arg1 + 4, 1, true);
          dataView(memory0).setInt8(arg1 + 8, DESCRIPTOR_TYPE_ENUM[e.type] || 0, true);
          var ptr5 = utf8Encode(e.name, realloc0, memory0);
          var len5 = utf8EncodedLen;
          dataView(memory0).setUint32(arg1 + 16, len5, true);
          dataView(memory0).setUint32(arg1 + 12, ptr5, true);
        }
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 4, ERROR_CODE_ENUM[variant8.val] || 13, true);
        break;
      }
    }
  }

  // === IO Stream Trampolines (43-48) ===
  function trampoline43(arg0, arg1, arg2) {
    var handle1 = arg0;
    var rep2 = handleTables[2][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[2].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(InputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.read(BigInt.asUintN(64, arg1)) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant6 = ret;
    switch (variant6.tag) {
      case "ok": {
        const e = variant6.val;
        dataView(memory0).setInt8(arg2 + 0, 0, true);
        var len3 = e.byteLength;
        var ptr3 = realloc0(0, 0, 1, len3 * 1);
        new Uint8Array(memory0.buffer, ptr3, len3 * 1).set(e);
        dataView(memory0).setUint32(arg2 + 8, len3, true);
        dataView(memory0).setUint32(arg2 + 4, ptr3, true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg2 + 0, 1, true);
        dataView(memory0).setInt8(arg2 + 4, 1, true); // closed
        break;
      }
    }
  }

  function trampoline44(arg0, arg1, arg2) {
    // blocking-read - similar to trampoline43
    return trampoline43(arg0, arg1, arg2);
  }

  function trampoline45(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[3][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[3].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(OutputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.checkWrite() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": {
        dataView(memory0).setInt8(arg1 + 0, 0, true);
        dataView(memory0).setBigInt64(arg1 + 8, toUint64(variant5.val), true);
        break;
      }
      case "err": {
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 8, 1, true); // closed
        break;
      }
    }
  }

  function trampoline46(arg0, arg1, arg2, arg3) {
    var handle1 = arg0;
    var rep2 = handleTables[3][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[3].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(OutputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    var ptr3 = arg1;
    var len3 = arg2;
    var result3 = new Uint8Array(memory0.buffer.slice(ptr3, ptr3 + len3 * 1));
    let ret;
    try { ret = { tag: "ok", val: rsc0.write(result3) }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant6 = ret;
    switch (variant6.tag) {
      case "ok": dataView(memory0).setInt8(arg3 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg3 + 0, 1, true);
        dataView(memory0).setInt8(arg3 + 4, 1, true);
        break;
      }
    }
  }

  function trampoline47(arg0, arg1, arg2, arg3) {
    // blocking-write-and-flush
    return trampoline46(arg0, arg1, arg2, arg3);
  }

  function trampoline48(arg0, arg1) {
    var handle1 = arg0;
    var rep2 = handleTables[3][(handle1 << 1) + 1] & ~T_FLAG;
    var rsc0 = captureTables[3].get(rep2);
    if (!rsc0) {
      rsc0 = Object.create(OutputStream.prototype);
      Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
      Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
    }
    curResourceBorrows.push(rsc0);
    let ret;
    try { ret = { tag: "ok", val: rsc0.blockingFlush() }; }
    catch (e) { ret = { tag: "err", val: getErrorPayload(e) }; }
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var variant5 = ret;
    switch (variant5.tag) {
      case "ok": dataView(memory0).setInt8(arg1 + 0, 0, true); break;
      case "err": {
        dataView(memory0).setInt8(arg1 + 0, 1, true);
        dataView(memory0).setInt8(arg1 + 4, 1, true);
        break;
      }
    }
  }

  // === Poll & Random (49-50) ===
  function trampoline49(arg0, arg1, arg2) {
    var len3 = arg1;
    var base3 = arg0;
    var result3 = [];
    for (let i = 0; i < len3; i++) {
      const base = base3 + i * 4;
      var handle1 = dataView(memory0).getInt32(base + 0, true);
      var rep2 = handleTables[1][(handle1 << 1) + 1] & ~T_FLAG;
      var rsc0 = captureTables[1].get(rep2);
      if (!rsc0) {
        rsc0 = Object.create(Pollable.prototype);
        Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
        Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
      }
      curResourceBorrows.push(rsc0);
      result3.push(rsc0);
    }
    const ret = poll(result3);
    for (const rsc of curResourceBorrows) { rsc[symbolRscHandle] = void 0; }
    curResourceBorrows.length = 0;
    var val4 = ret;
    var len4 = val4.length;
    var ptr4 = realloc0(0, 0, 4, len4 * 4);
    new Uint8Array(memory0.buffer, ptr4, len4 * 4).set(new Uint8Array(val4.buffer, val4.byteOffset, len4 * 4));
    dataView(memory0).setUint32(arg2 + 4, len4, true);
    dataView(memory0).setUint32(arg2 + 0, ptr4, true);
  }

  function trampoline50(arg0, arg1) {
    const ret = getRandomBytes(BigInt.asUintN(64, arg0));
    var len0 = ret.byteLength;
    var ptr0 = realloc0(0, 0, 1, len0 * 1);
    new Uint8Array(memory0.buffer, ptr0, len0 * 1).set(ret);
    dataView(memory0).setUint32(arg1 + 4, len0, true);
    dataView(memory0).setUint32(arg1 + 0, ptr0, true);
  }

  // === Preopens & Terminal (51-54) ===
  function trampoline51(arg0) {
    const ret = getDirectories();
    var vec3 = ret;
    var len3 = vec3.length;
    var result3 = realloc0(0, 0, 4, len3 * 12);
    for (let i = 0; i < vec3.length; i++) {
      const e = vec3[i];
      const base = result3 + i * 12;
      var [tuple0_0, tuple0_1] = e;
      if (!(tuple0_0 instanceof Descriptor)) throw new TypeError('Resource error: Not a valid "Descriptor" resource.');
      var handle1 = tuple0_0[symbolRscHandle];
      if (!handle1) {
        const rep = tuple0_0[symbolRscRep] || ++captureCnts[7];
        captureTables[7].set(rep, tuple0_0);
        handle1 = rscTableCreateOwn(handleTables[7], rep);
      }
      dataView(memory0).setInt32(base + 0, handle1, true);
      var ptr2 = utf8Encode(tuple0_1, realloc0, memory0);
      var len2 = utf8EncodedLen;
      dataView(memory0).setUint32(base + 8, len2, true);
      dataView(memory0).setUint32(base + 4, ptr2, true);
    }
    dataView(memory0).setUint32(arg0 + 4, len3, true);
    dataView(memory0).setUint32(arg0 + 0, result3, true);
  }

  function trampoline52(arg0) {
    const ret = getTerminalStdin();
    if (ret === null || ret === void 0) {
      dataView(memory0).setInt8(arg0 + 0, 0, true);
    } else {
      dataView(memory0).setInt8(arg0 + 0, 1, true);
      if (!(ret instanceof TerminalInput)) throw new TypeError('Resource error: Not a valid "TerminalInput" resource.');
      var handle0 = ret[symbolRscHandle];
      if (!handle0) {
        const rep = ret[symbolRscRep] || ++captureCnts[4];
        captureTables[4].set(rep, ret);
        handle0 = rscTableCreateOwn(handleTables[4], rep);
      }
      dataView(memory0).setInt32(arg0 + 4, handle0, true);
    }
  }

  function trampoline53(arg0) {
    const ret = getTerminalStdout();
    if (ret === null || ret === void 0) {
      dataView(memory0).setInt8(arg0 + 0, 0, true);
    } else {
      dataView(memory0).setInt8(arg0 + 0, 1, true);
      if (!(ret instanceof TerminalOutput)) throw new TypeError('Resource error: Not a valid "TerminalOutput" resource.');
      var handle0 = ret[symbolRscHandle];
      if (!handle0) {
        const rep = ret[symbolRscRep] || ++captureCnts[5];
        captureTables[5].set(rep, ret);
        handle0 = rscTableCreateOwn(handleTables[5], rep);
      }
      dataView(memory0).setInt32(arg0 + 4, handle0, true);
    }
  }

  function trampoline54(arg0) {
    const ret = getTerminalStderr();
    if (ret === null || ret === void 0) {
      dataView(memory0).setInt8(arg0 + 0, 0, true);
    } else {
      dataView(memory0).setInt8(arg0 + 0, 1, true);
      if (!(ret instanceof TerminalOutput)) throw new TypeError('Resource error: Not a valid "TerminalOutput" resource.');
      var handle0 = ret[symbolRscHandle];
      if (!handle0) {
        const rep = ret[symbolRscRep] || ++captureCnts[5];
        captureTables[5].set(rep, ret);
        handle0 = rscTableCreateOwn(handleTables[5], rep);
      }
      dataView(memory0).setInt32(arg0 + 4, handle0, true);
    }
  }

  // === Resource Drop Trampolines ===
  function trampoline1(handle) {
    const handleEntry = rscTableRemove(handleTables[6], handle);
    if (handleEntry.own) {
      const rsc = captureTables[6].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[6].delete(handleEntry.rep);
    }
  }

  function trampoline2(handle) {
    const handleEntry = rscTableRemove(handleTables[3], handle);
    if (handleEntry.own) {
      const rsc = captureTables[3].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[3].delete(handleEntry.rep);
    }
  }

  function trampoline3(handle) {
    const handleEntry = rscTableRemove(handleTables[0], handle);
    if (handleEntry.own) {
      const rsc = captureTables[0].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[0].delete(handleEntry.rep);
    }
  }

  function trampoline4(handle) {
    const handleEntry = rscTableRemove(handleTables[2], handle);
    if (handleEntry.own) {
      const rsc = captureTables[2].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[2].delete(handleEntry.rep);
    }
  }

  function trampoline5(handle) {
    const handleEntry = rscTableRemove(handleTables[7], handle);
    if (handleEntry.own) {
      const rsc = captureTables[7].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[7].delete(handleEntry.rep);
    }
  }

  function trampoline10(handle) {
    const handleEntry = rscTableRemove(handleTables[1], handle);
    if (handleEntry.own) {
      const rsc = captureTables[1].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[1].delete(handleEntry.rep);
    }
  }

  function trampoline12(handle) {
    const handleEntry = rscTableRemove(handleTables[4], handle);
    if (handleEntry.own) {
      const rsc = captureTables[4].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[4].delete(handleEntry.rep);
    }
  }

  function trampoline13(handle) {
    const handleEntry = rscTableRemove(handleTables[5], handle);
    if (handleEntry.own) {
      const rsc = captureTables[5].get(handleEntry.rep);
      if (rsc && rsc[symbolDispose]) rsc[symbolDispose]();
      captureTables[5].delete(handleEntry.rep);
    }
  }

  // Return all trampolines
  return {
    trampoline0, trampoline1, trampoline2, trampoline3, trampoline4, trampoline5,
    trampoline6, trampoline7, trampoline8, trampoline9, trampoline10, trampoline11,
    trampoline12, trampoline13, trampoline14, trampoline15, trampoline16, trampoline17,
    trampoline18, trampoline19, trampoline20, trampoline21, trampoline22, trampoline23,
    trampoline24, trampoline25, trampoline26, trampoline27, trampoline28, trampoline29,
    trampoline30, trampoline31, trampoline32, trampoline33, trampoline34, trampoline35,
    trampoline36, trampoline37, trampoline38, trampoline39, trampoline40, trampoline41,
    trampoline42, trampoline43, trampoline44, trampoline45, trampoline46, trampoline47,
    trampoline48, trampoline49, trampoline50, trampoline51, trampoline52, trampoline53,
    trampoline54,
    handleTables, captureTables, captureCnts
  };
}

export {
  T_FLAG, symbolCabiDispose, symbolRscHandle, symbolRscRep, symbolDispose,
  handleTables, captureTables, captureCnts,
  rscTableCreateOwn, rscTableRemove, makeDropHandler,
  dataView, toUint64, toUint32, utf8Encode, utf8Decoder,
  ERROR_CODE_ENUM, DESCRIPTOR_TYPE_ENUM, getErrorPayload
};
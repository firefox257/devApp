// trampoline-module.js
// Complete WASI Trampoline Functions with Enhanced Error Handling

const T_FLAG = 1 << 30;
const symbolRscHandle = Symbol("handle");
const symbolRscRep = Symbol.for("cabiRep");
const symbolDispose = Symbol.dispose || Symbol.for("dispose");
const symbolCabiDispose = Symbol.for("cabiDispose");

const I32_MAX = 2147483647;
const I32_MIN = -2147483648;

// ============================================
// ERROR UTILITIES
// ============================================

function serializeError(err) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      payload: err.payload
    };
  }
  if (typeof err === 'object' && err !== null) {
    return { ...err };
  }
  return { message: String(err) };
}

function getErrorPayload(e) {
  if (e && Object.prototype.hasOwnProperty.call(e, "payload")) return e.payload;
  if (e instanceof Error) throw e;
  return e;
}

function dataView(mem) {
  return new DataView(mem.buffer);
}

function toUint64(val) {
  return BigInt.asUintN(64, BigInt(val));
}

function toUint32(val) {
  return val >>> 0;
}

const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();
let utf8EncodedLen = 0;

function utf8Encode(s, realloc, memory) {
  if (typeof s !== "string") throw new TypeError("expected a string");
  if (s.length === 0) {
    utf8EncodedLen = 0;
    return 1;
  }
  let buf = utf8Encoder.encode(s);
  let ptr = realloc(0, 0, 1, buf.length);
  new Uint8Array(memory.buffer).set(buf, ptr);
  utf8EncodedLen = buf.length;
  return ptr;
}

// ============================================
// HANDLE TABLE MANAGEMENT
// ============================================

function rscTableCreateOwn(table, rep) {
  const free = table[0] & ~T_FLAG;
  if (free === 0) {
    table.push(0);
    table.push(rep | T_FLAG);
    return (table.length >> 1) - 1;
  }
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
  if (val === 0 || (scope & T_FLAG) !== 0) throw new TypeError("Invalid handle");
  table[handle << 1] = table[0] | T_FLAG;
  table[0] = handle | T_FLAG;
  return { rep, scope, own };
}

// ============================================
// HANDLE TABLES & CAPTURE TABLES
// ============================================

const handleTable0 = [T_FLAG, 0];
const handleTable1 = [T_FLAG, 0];
const handleTable2 = [T_FLAG, 0];
const handleTable3 = [T_FLAG, 0];
const handleTable4 = [T_FLAG, 0];
const handleTable5 = [T_FLAG, 0];
const handleTable6 = [T_FLAG, 0];
const handleTable7 = [T_FLAG, 0];

const captureTable0 = new Map();
const captureTable1 = new Map();
const captureTable2 = new Map();
const captureTable3 = new Map();
const captureTable4 = new Map();
const captureTable5 = new Map();
const captureTable6 = new Map();
const captureTable7 = new Map();

let captureCnt0 = 0;
let captureCnt1 = 0;
let captureCnt2 = 0;
let captureCnt3 = 0;
let captureCnt4 = 0;
let captureCnt5 = 0;
let captureCnt6 = 0;
let captureCnt7 = 0;

let curResourceBorrows = [];

// ============================================
// RESOURCE DROP TRAMPOLINES
// ============================================

export function trampoline1(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable6, handle);
    if (handleEntry.own) {
      const rsc = captureTable6.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable6.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline1] Error:', serializeError(err));
    throw err;
  }
}

export function trampoline2(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable3, handle);
    if (handleEntry.own) {
      const rsc = captureTable3.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable3.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline2] Error:', serializeError(err));
    throw err;
  }
}

export function trampoline3(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable0, handle);
    if (handleEntry.own) {
      const rsc = captureTable0.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable0.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline3] Error:', serializeError(err));
    throw err;
  }
}

export function trampoline4(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable2, handle);
    if (handleEntry.own) {
      const rsc = captureTable2.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable2.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline4] Error:', serializeError(err));
    throw err;
  }
}

export function trampoline5(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable7, handle);
    if (handleEntry.own) {
      const rsc = captureTable7.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable7.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline5] Error:', serializeError(err));
    throw err;
  }
}

export function trampoline10(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable1, handle);
    if (handleEntry.own) {
      const rsc = captureTable1.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable1.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline10] Error:', serializeError(err));
    throw err;
  }
}

export function trampoline12(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable4, handle);
    if (handleEntry.own) {
      const rsc = captureTable4.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable4.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline12] Error:', serializeError(err));
    throw err;
  }
}

export function trampoline13(handle) {
  try {
    const handleEntry = rscTableRemove(handleTable5, handle);
    if (handleEntry.own) {
      const rsc = captureTable5.get(handleEntry.rep);
      if (rsc) {
        if (rsc[symbolDispose]) rsc[symbolDispose]();
        captureTable5.delete(handleEntry.rep);
      }
    }
  } catch (err) {
    console.error('[trampoline13] Error:', serializeError(err));
    throw err;
  }
}

// ============================================
// CLOCK TRAMPOLINES
// ============================================

export function createClockTrampolines(environment) {
  return {
    trampoline0() {
      try {
        const ret = environment.monotonicClock.now();
        return toUint64(ret);
      } catch (err) {
        console.error('[trampoline0] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline6(arg0) {
      try {
        const ret = environment.monotonicClock.subscribeDuration(BigInt.asUintN(64, arg0));
        if (!(ret instanceof Object)) {
          throw new TypeError('Resource error: Not a valid "Pollable" resource.');
        }
        var handle0 = ret[symbolRscHandle];
        if (!handle0) {
          const rep = ret[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, ret);
          handle0 = rscTableCreateOwn(handleTable1, rep);
        }
        return handle0;
      } catch (err) {
        console.error('[trampoline6] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline7(arg0) {
      try {
        const ret = environment.monotonicClock.subscribeInstant(BigInt.asUintN(64, arg0));
        if (!(ret instanceof Object)) {
          throw new TypeError('Resource error: Not a valid "Pollable" resource.');
        }
        var handle0 = ret[symbolRscHandle];
        if (!handle0) {
          const rep = ret[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, ret);
          handle0 = rscTableCreateOwn(handleTable1, rep);
        }
        return handle0;
      } catch (err) {
        console.error('[trampoline7] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline19(arg0, memory) {
      try {
        const ret = environment.wallClock.now();
        dataView(memory).setBigInt64(arg0 + 0, toUint64(ret.seconds), true);
        dataView(memory).setInt32(arg0 + 8, toUint32(ret.nanoseconds), true);
      } catch (err) {
        console.error('[trampoline19] Error:', serializeError(err));
        throw err;
      }
    }
  };
}

// ============================================
// CLI TRAMPOLINES
// ============================================

export function createCliTrampolines(environment, memory, realloc) {
  return {
    trampoline11() {
      try {
        const ret = environment.cli.getStderr();
        if (!(ret instanceof Object)) {
          throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
        }
        var handle0 = ret[symbolRscHandle];
        if (!handle0) {
          const rep = ret[symbolRscRep] || ++captureCnt3;
          captureTable3.set(rep, ret);
          handle0 = rscTableCreateOwn(handleTable3, rep);
        }
        return handle0;
      } catch (err) {
        console.error('[trampoline11] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline14() {
      try {
        const ret = environment.cli.getStdin();
        if (!(ret instanceof Object)) {
          throw new TypeError('Resource error: Not a valid "InputStream" resource.');
        }
        var handle0 = ret[symbolRscHandle];
        if (!handle0) {
          const rep = ret[symbolRscRep] || ++captureCnt2;
          captureTable2.set(rep, ret);
          handle0 = rscTableCreateOwn(handleTable2, rep);
        }
        return handle0;
      } catch (err) {
        console.error('[trampoline14] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline15() {
      try {
        const ret = environment.cli.getStdout();
        if (!(ret instanceof Object)) {
          throw new TypeError('Resource error: Not a valid "OutputStream" resource.');
        }
        var handle0 = ret[symbolRscHandle];
        if (!handle0) {
          const rep = ret[symbolRscRep] || ++captureCnt3;
          captureTable3.set(rep, ret);
          handle0 = rscTableCreateOwn(handleTable3, rep);
        }
        return handle0;
      } catch (err) {
        console.error('[trampoline15] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline16(arg0) {
      try {
        let variant0;
        switch (arg0) {
          case 0:
            variant0 = { tag: "ok", val: undefined };
            break;
          case 1:
            variant0 = { tag: "err", val: undefined };
            break;
          default:
            throw new TypeError("invalid variant discriminant for expected");
        }
        environment.cli.exit(variant0);
      } catch (err) {
        console.error('[trampoline16] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline17(arg0) {
      try {
        const ret = environment.cli.getArguments();
        var vec1 = ret;
        var len1 = vec1.length;
        var result1 = realloc(0, 0, 4, len1 * 8);
        for (let i = 0; i < vec1.length; i++) {
          const e = vec1[i];
          const base = result1 + i * 8;
          var ptr0 = utf8Encode(e, realloc, memory);
          var len0 = utf8EncodedLen;
          dataView(memory).setUint32(base + 4, len0, true);
          dataView(memory).setUint32(base + 0, ptr0, true);
        }
        dataView(memory).setUint32(arg0 + 4, len1, true);
        dataView(memory).setUint32(arg0 + 0, result1, true);
      } catch (err) {
        console.error('[trampoline17] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline18(arg0) {
      try {
        const ret = environment.cli.getEnvironment();
        var vec3 = ret;
        var len3 = vec3.length;
        var result3 = realloc(0, 0, 4, len3 * 16);
        for (let i = 0; i < vec3.length; i++) {
          const e = vec3[i];
          const base = result3 + i * 16;
          var [tuple0_0, tuple0_1] = e;
          var ptr1 = utf8Encode(tuple0_0, realloc, memory);
          var len1 = utf8EncodedLen;
          dataView(memory).setUint32(base + 4, len1, true);
          dataView(memory).setUint32(base + 0, ptr1, true);
          var ptr2 = utf8Encode(tuple0_1, realloc, memory);
          var len2 = utf8EncodedLen;
          dataView(memory).setUint32(base + 12, len2, true);
          dataView(memory).setUint32(base + 8, ptr2, true);
        }
        dataView(memory).setUint32(arg0 + 4, len3, true);
        dataView(memory).setUint32(arg0 + 0, result3, true);
      } catch (err) {
        console.error('[trampoline18] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline52(arg0) {
      try {
        const ret = environment.cli.getTerminalStdin();
        if (ret === null || ret === undefined) {
          dataView(memory).setInt8(arg0 + 0, 0, true);
        } else {
          dataView(memory).setInt8(arg0 + 0, 1, true);
          if (!(ret instanceof Object)) {
            throw new TypeError('Resource error: Not a valid "TerminalInput" resource.');
          }
          var handle0 = ret[symbolRscHandle];
          if (!handle0) {
            const rep = ret[symbolRscRep] || ++captureCnt4;
            captureTable4.set(rep, ret);
            handle0 = rscTableCreateOwn(handleTable4, rep);
          }
          dataView(memory).setInt32(arg0 + 4, handle0, true);
        }
      } catch (err) {
        console.error('[trampoline52] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline53(arg0) {
      try {
        const ret = environment.cli.getTerminalStdout();
        if (ret === null || ret === undefined) {
          dataView(memory).setInt8(arg0 + 0, 0, true);
        } else {
          dataView(memory).setInt8(arg0 + 0, 1, true);
          if (!(ret instanceof Object)) {
            throw new TypeError('Resource error: Not a valid "TerminalOutput" resource.');
          }
          var handle0 = ret[symbolRscHandle];
          if (!handle0) {
            const rep = ret[symbolRscRep] || ++captureCnt5;
            captureTable5.set(rep, ret);
            handle0 = rscTableCreateOwn(handleTable5, rep);
          }
          dataView(memory).setInt32(arg0 + 4, handle0, true);
        }
      } catch (err) {
        console.error('[trampoline53] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline54(arg0) {
      try {
        const ret = environment.cli.getTerminalStderr();
        if (ret === null || ret === undefined) {
          dataView(memory).setInt8(arg0 + 0, 0, true);
        } else {
          dataView(memory).setInt8(arg0 + 0, 1, true);
          if (!(ret instanceof Object)) {
            throw new TypeError('Resource error: Not a valid "TerminalOutput" resource.');
          }
          var handle0 = ret[symbolRscHandle];
          if (!handle0) {
            const rep = ret[symbolRscRep] || ++captureCnt5;
            captureTable5.set(rep, ret);
            handle0 = rscTableCreateOwn(handleTable5, rep);
          }
          dataView(memory).setInt32(arg0 + 4, handle0, true);
        }
      } catch (err) {
        console.error('[trampoline54] Error:', serializeError(err));
        throw err;
      }
    }
  };
}

// ============================================
// FILESYSTEM TRAMPOLINES (Key ones)
// ============================================

export function createFilesystemTrampolines(environment, memory, realloc) {
  const { Descriptor, DirectoryEntryStream, filesystemErrorCode, getDirectories } = environment.fs;
  
  return {
    trampoline38(arg0, arg1) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable7.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(Descriptor.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        let ret;
        try {
          ret = { tag: "ok", val: rsc0.readDirectory() };
        } catch (e) {
          ret = { tag: "err", val: getErrorPayload(e) };
        }
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        var variant5 = ret;
        switch (variant5.tag) {
          case "ok": {
            const e = variant5.val;
            dataView(memory).setInt8(arg1 + 0, 0, true);
            if (!(e instanceof DirectoryEntryStream)) {
              throw new TypeError('Resource error: Not a valid "DirectoryEntryStream" resource.');
            }
            var handle3 = e[symbolRscHandle];
            if (!handle3) {
              const rep = e[symbolRscRep] || ++captureCnt6;
              captureTable6.set(rep, e);
              handle3 = rscTableCreateOwn(handleTable6, rep);
            }
            dataView(memory).setInt32(arg1 + 4, handle3, true);
            break;
          }
          case "err": {
            dataView(memory).setInt8(arg1 + 0, 1, true);
            dataView(memory).setInt8(arg1 + 4, 13, true);
            break;
          }
        }
      } catch (err) {
        console.error('[trampoline38] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline39(arg0, arg1) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable7.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(Descriptor.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        let ret;
        try {
          ret = { tag: "ok", val: rsc0.stat() };
        } catch (e) {
          ret = { tag: "err", val: getErrorPayload(e) };
        }
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        var variant12 = ret;
        switch (variant12.tag) {
          case "ok": {
            const e = variant12.val;
            dataView(memory).setInt8(arg1 + 0, 0, true);
            let enum4 = e.type === "directory" ? 3 : 6;
            dataView(memory).setInt8(arg1 + 8, enum4, true);
            dataView(memory).setBigInt64(arg1 + 16, toUint64(e.linkCount), true);
            dataView(memory).setBigInt64(arg1 + 24, toUint64(e.size), true);
            dataView(memory).setInt8(arg1 + 32, 0, true);
            dataView(memory).setInt8(arg1 + 56, 0, true);
            dataView(memory).setInt8(arg1 + 80, 0, true);
            break;
          }
          case "err": {
            dataView(memory).setInt8(arg1 + 0, 1, true);
            dataView(memory).setInt8(arg1 + 8, 13, true);
            break;
          }
        }
      } catch (err) {
        console.error('[trampoline39] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline41(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable7[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable7.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(Descriptor.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        var flags3 = { symlinkFollow: Boolean(arg1 & 1) };
        var ptr4 = arg2;
        var len4 = arg3;
        var result4 = utf8Decoder.decode(new Uint8Array(memory.buffer, ptr4, len4));
        var flags5 = {
          create: Boolean(arg4 & 1),
          directory: Boolean(arg4 & 2),
          exclusive: Boolean(arg4 & 4),
          truncate: Boolean(arg4 & 8)
        };
        var flags6 = {
          read: Boolean(arg5 & 1),
          write: Boolean(arg5 & 2),
          fileIntegritySync: Boolean(arg5 & 4),
          dataIntegritySync: Boolean(arg5 & 8),
          requestedWriteSync: Boolean(arg5 & 16),
          mutateDirectory: Boolean(arg5 & 32)
        };
        let ret;
        try {
          ret = { tag: "ok", val: rsc0.openAt(flags3, result4, flags5, flags6) };
        } catch (e) {
          ret = { tag: "err", val: getErrorPayload(e) };
        }
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        var variant9 = ret;
        switch (variant9.tag) {
          case "ok": {
            const e = variant9.val;
            dataView(memory).setInt8(arg6 + 0, 0, true);
            if (!(e instanceof Descriptor)) {
              throw new TypeError('Resource error: Not a valid "Descriptor" resource.');
            }
            var handle7 = e[symbolRscHandle];
            if (!handle7) {
              const rep = e[symbolRscRep] || ++captureCnt7;
              captureTable7.set(rep, e);
              handle7 = rscTableCreateOwn(handleTable7, rep);
            }
            dataView(memory).setInt32(arg6 + 4, handle7, true);
            break;
          }
          case "err": {
            dataView(memory).setInt8(arg6 + 0, 1, true);
            dataView(memory).setInt8(arg6 + 4, 13, true);
            break;
          }
        }
      } catch (err) {
        console.error('[trampoline41] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline51(arg0) {
      try {
        const ret = getDirectories();
        var vec3 = ret;
        var len3 = vec3.length;
        var result3 = realloc(0, 0, 4, len3 * 12);
        for (let i = 0; i < vec3.length; i++) {
          const e = vec3[i];
          const base = result3 + i * 12;
          var [tuple0_0, tuple0_1] = e;
          if (!(tuple0_0 instanceof Descriptor)) {
            throw new TypeError('Resource error: Not a valid "Descriptor" resource.');
          }
          var handle1 = tuple0_0[symbolRscHandle];
          if (!handle1) {
            const rep = tuple0_0[symbolRscRep] || ++captureCnt7;
            captureTable7.set(rep, tuple0_0);
            handle1 = rscTableCreateOwn(handleTable7, rep);
          }
          dataView(memory).setInt32(base + 0, handle1, true);
          var ptr2 = utf8Encode(tuple0_1, realloc, memory);
          var len2 = utf8EncodedLen;
          dataView(memory).setUint32(base + 8, len2, true);
          dataView(memory).setUint32(base + 4, ptr2, true);
        }
        dataView(memory).setUint32(arg0 + 4, len3, true);
        dataView(memory).setUint32(arg0 + 0, result3, true);
      } catch (err) {
        console.error('[trampoline51] Error:', serializeError(err));
        throw err;
      }
    }
  };
}

// ============================================
// IO STREAMS TRAMPOLINES
// ============================================

export function createIoStreamsTrampolines(environment, memory, realloc) {
  const { InputStream, OutputStream, Pollable, poll } = environment.io;
  
  return {
    trampoline8(arg0) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable3.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(OutputStream.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        const ret = rsc0.subscribe();
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        if (!(ret instanceof Pollable)) {
          throw new TypeError('Resource error: Not a valid "Pollable" resource.');
        }
        var handle3 = ret[symbolRscHandle];
        if (!handle3) {
          const rep = ret[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, ret);
          handle3 = rscTableCreateOwn(handleTable1, rep);
        }
        return handle3;
      } catch (err) {
        console.error('[trampoline8] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline9(arg0) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable2[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable2.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(InputStream.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        const ret = rsc0.subscribe();
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        if (!(ret instanceof Pollable)) {
          throw new TypeError('Resource error: Not a valid "Pollable" resource.');
        }
        var handle3 = ret[symbolRscHandle];
        if (!handle3) {
          const rep = ret[symbolRscRep] || ++captureCnt1;
          captureTable1.set(rep, ret);
          handle3 = rscTableCreateOwn(handleTable1, rep);
        }
        return handle3;
      } catch (err) {
        console.error('[trampoline9] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline43(arg0, arg1, arg2) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable2[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable2.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(InputStream.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        let ret;
        try {
          ret = { tag: "ok", val: rsc0.read(BigInt.asUintN(64, arg1)) };
        } catch (e) {
          ret = { tag: "err", val: getErrorPayload(e) };
        }
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        var variant6 = ret;
        switch (variant6.tag) {
          case "ok": {
            const e = variant6.val;
            dataView(memory).setInt8(arg2 + 0, 0, true);
            var len3 = e.byteLength;
            var ptr3 = realloc(0, 0, 1, len3 * 1);
            new Uint8Array(memory.buffer, ptr3, len3 * 1).set(e);
            dataView(memory).setUint32(arg2 + 8, len3, true);
            dataView(memory).setUint32(arg2 + 4, ptr3, true);
            break;
          }
          case "err": {
            dataView(memory).setInt8(arg2 + 0, 1, true);
            dataView(memory).setInt8(arg2 + 4, 1, true);
            break;
          }
        }
      } catch (err) {
        console.error('[trampoline43] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline45(arg0, arg1) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable3.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(OutputStream.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        let ret;
        try {
          ret = { tag: "ok", val: rsc0.checkWrite() };
        } catch (e) {
          ret = { tag: "err", val: getErrorPayload(e) };
        }
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        var variant5 = ret;
        switch (variant5.tag) {
          case "ok": {
            const e = variant5.val;
            dataView(memory).setInt8(arg1 + 0, 0, true);
            dataView(memory).setBigInt64(arg1 + 8, toUint64(e), true);
            break;
          }
          case "err": {
            dataView(memory).setInt8(arg1 + 0, 1, true);
            dataView(memory).setInt8(arg1 + 8, 1, true);
            break;
          }
        }
      } catch (err) {
        console.error('[trampoline45] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline46(arg0, arg1, arg2, arg3) {
      try {
        var handle1 = arg0;
        var rep2 = handleTable3[(handle1 << 1) + 1] & ~T_FLAG;
        var rsc0 = captureTable3.get(rep2);
        if (!rsc0) {
          rsc0 = Object.create(OutputStream.prototype);
          Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
          Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
        }
        curResourceBorrows.push(rsc0);
        var ptr3 = arg1;
        var len3 = arg2;
        var result3 = new Uint8Array(memory.buffer.slice(ptr3, ptr3 + len3 * 1));
        let ret;
        try {
          ret = { tag: "ok", val: rsc0.write(result3) };
        } catch (e) {
          ret = { tag: "err", val: getErrorPayload(e) };
        }
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        var variant6 = ret;
        switch (variant6.tag) {
          case "ok":
            dataView(memory).setInt8(arg3 + 0, 0, true);
            break;
          case "err":
            dataView(memory).setInt8(arg3 + 0, 1, true);
            dataView(memory).setInt8(arg3 + 4, 1, true);
            break;
        }
      } catch (err) {
        console.error('[trampoline46] Error:', serializeError(err));
        throw err;
      }
    },
    trampoline49(arg0, arg1, arg2) {
      try {
        var len3 = arg1;
        var base3 = arg0;
        var result3 = [];
        for (let i = 0; i < len3; i++) {
          const base = base3 + i * 4;
          var handle1 = dataView(memory).getInt32(base + 0, true);
          var rep2 = handleTable1[(handle1 << 1) + 1] & ~T_FLAG;
          var rsc0 = captureTable1.get(rep2);
          if (!rsc0) {
            rsc0 = Object.create(Pollable.prototype);
            Object.defineProperty(rsc0, symbolRscHandle, { writable: true, value: handle1 });
            Object.defineProperty(rsc0, symbolRscRep, { writable: true, value: rep2 });
          }
          curResourceBorrows.push(rsc0);
          result3.push(rsc0);
        }
        const ret = poll(result3);
        for (const rsc of curResourceBorrows) {
          rsc[symbolRscHandle] = undefined;
        }
        curResourceBorrows.length = 0;
        var val4 = ret;
        var len4 = val4.length;
        var ptr4 = realloc(0, 0, 4, len4 * 4);
        new Uint8Array(memory.buffer, ptr4, len4 * 4).set(new Uint8Array(val4.buffer, val4.byteOffset, len4 * 4));
        dataView(memory).setUint32(arg2 + 4, len4, true);
        dataView(memory).setUint32(arg2 + 0, ptr4, true);
      } catch (err) {
        console.error('[trampoline49] Error:', serializeError(err));
        throw err;
      }
    }
  };
}

// ============================================
// RANDOM TRAMPOLINE
// ============================================

export function createRandomTrampolines(environment, memory, realloc) {
  return {
    trampoline50(arg0, arg1) {
      try {
        const ret = environment.random.getRandomBytes(BigInt.asUintN(64, arg0));
        var val0 = ret;
        var len0 = val0.byteLength;
        var ptr0 = realloc(0, 0, 1, len0 * 1);
        new Uint8Array(memory.buffer, ptr0, len0 * 1).set(val0);
        dataView(memory).setUint32(arg1 + 4, len0, true);
        dataView(memory).setUint32(arg1 + 0, ptr0, true);
      } catch (err) {
        console.error('[trampoline50] Error:', serializeError(err));
        throw err;
      }
    }
  };
}

// ============================================
// EXPORT ALL
// ============================================

export const resourceTrampolines = {
  trampoline1,
  trampoline2,
  trampoline3,
  trampoline4,
  trampoline5,
  trampoline10,
  trampoline12,
  trampoline13
};

export const handleTableInfo = {
  handleTable0,
  handleTable1,
  handleTable2,
  handleTable3,
  handleTable4,
  handleTable5,
  handleTable6,
  handleTable7,
  captureTable0,
  captureTable1,
  captureTable2,
  captureTable3,
  captureTable4,
  captureTable5,
  captureTable6,
  captureTable7
};

export function resetTables() {
  handleTable0[0] = T_FLAG; handleTable0[1] = 0;
  handleTable1[0] = T_FLAG; handleTable1[1] = 0;
  handleTable2[0] = T_FLAG; handleTable2[1] = 0;
  handleTable3[0] = T_FLAG; handleTable3[1] = 0;
  handleTable4[0] = T_FLAG; handleTable4[1] = 0;
  handleTable5[0] = T_FLAG; handleTable5[1] = 0;
  handleTable6[0] = T_FLAG; handleTable6[1] = 0;
  handleTable7[0] = T_FLAG; handleTable7[1] = 0;
  captureTable0.clear(); captureTable1.clear();
  captureTable2.clear(); captureTable3.clear();
  captureTable4.clear(); captureTable5.clear();
  captureTable6.clear(); captureTable7.clear();
  captureCnt0 = 0; captureCnt1 = 0;
  captureCnt2 = 0; captureCnt3 = 0;
  captureCnt4 = 0; captureCnt5 = 0;
  captureCnt6 = 0; captureCnt7 = 0;
  curResourceBorrows.length = 0;
}

export default {
  resourceTrampolines,
  handleTableInfo,
  resetTables,
  createClockTrampolines,
  createCliTrampolines,
  createFilesystemTrampolines,
  createIoStreamsTrampolines,
  createRandomTrampolines,
  serializeError
};
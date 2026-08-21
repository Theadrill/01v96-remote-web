/**
 * Motor físico dos medidores.
 * Guarda o estado (nível atual) de cada canal para poder aplicar
 * a balística (Attack instantâneo, Release suave) entre os frames.
 */
export class MeterEngine {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MeterEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_meterengine_free(ptr, 0);
    }
    /**
     * Retorna o ponteiro para o buffer de níveis. O JS usa isso para criar
     * uma view zero-copy na memória do WASM, sem custo de bindgen.
     * @returns {number}
     */
    get_levels_ptr() {
        const ret = wasm.meterengine_get_levels_ptr(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} ch
     * @returns {number}
     */
    get_raw_step(ch) {
        const ret = wasm.meterengine_get_raw_step(this.__wbg_ptr, ch);
        return ret;
    }
    /**
     * @param {number} num_channels
     */
    constructor(num_channels) {
        const ret = wasm.meterengine_new(num_channels);
        this.__wbg_ptr = ret;
        MeterEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Extrai níveis de um pacote SysEx bruto, alimentado via stream/websockets.
     * @param {Uint8Array} raw_data
     */
    processar_pacote_sysex(raw_data) {
        const ptr0 = passArray8ToWasm0(raw_data, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.meterengine_processar_pacote_sysex(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Chamado pelo JS a 60fps dentro do requestAnimationFrame.
     * Calcula a balística e atualiza o buffer in-place.
     * @param {number} delta_time_ms
     */
    render_frame(delta_time_ms) {
        wasm.meterengine_render_frame(this.__wbg_ptr, delta_time_ms);
    }
    /**
     * Recebe as tabelas de calibração pre-calculadas do JS (0 a 32 steps)
     * @param {Float32Array} inputs
     * @param {Float32Array} master
     */
    set_calibration_tables(inputs, master) {
        const ptr0 = passArrayF32ToWasm0(inputs, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(master, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.meterengine_set_calibration_tables(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * Permite ao JS configurar o tempo de queda
     * @param {number} rate
     */
    set_decay_rate(rate) {
        wasm.meterengine_set_decay_rate(this.__wbg_ptr, rate);
    }
    /**
     * Atualiza os valores "alvo" de onde o medidor deve chegar.
     * Se o novo valor for maior que o atual (Attack), ele sobe instantaneamente.
     * @param {Float32Array} targets
     */
    update_targets(targets) {
        const ptr0 = passArrayF32ToWasm0(targets, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.meterengine_update_targets(this.__wbg_ptr, ptr0, len0);
    }
}
if (Symbol.dispose) MeterEngine.prototype[Symbol.dispose] = MeterEngine.prototype.free;

export class MidiDispatcher {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MidiDispatcherFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_mididispatcher_free(ptr, 0);
    }
    /**
     * @param {number} throttle_ms
     */
    constructor(throttle_ms) {
        const ret = wasm.mididispatcher_new(throttle_ms);
        this.__wbg_ptr = ret;
        MidiDispatcherFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Retorna `true` se o evento deve ser enviado imediatamente (não foi throttled).
     * Caso contrário, o evento é retido para envio posterior e retorna `false`.
     * @param {string} msg_type
     * @param {number} channel
     * @param {number} value
     * @param {number} now_ms
     * @returns {boolean}
     */
    push_event(msg_type, channel, value, now_ms) {
        const ptr0 = passStringToWasm0(msg_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.mididispatcher_push_event(this.__wbg_ptr, ptr0, len0, channel, value, now_ms);
        return ret !== 0;
    }
    /**
     * @param {number} throttle_ms
     */
    set_throttle(throttle_ms) {
        wasm.mididispatcher_set_throttle(this.__wbg_ptr, throttle_ms);
    }
    /**
     * Retorna os eventos pendentes que já podem ser enviados, no formato "type:channel:value"
     * @param {number} now_ms
     * @returns {string[]}
     */
    tick(now_ms) {
        const ret = wasm.mididispatcher_tick(this.__wbg_ptr, now_ms);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) MidiDispatcher.prototype[Symbol.dispose] = MidiDispatcher.prototype.free;

export class WasmRta {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmRtaFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmrta_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.wasmrta_new();
        this.__wbg_ptr = ret;
        WasmRtaFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Float32Array} input
     * @returns {Float32Array}
     */
    process_audio(input) {
        const ptr0 = passArrayF32ToWasm0(input, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrta_process_audio(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
}
if (Symbol.dispose) WasmRta.prototype[Symbol.dispose] = WasmRta.prototype.free;

export function main() {
    wasm.main();
}

/**
 * @returns {string}
 */
export function ping() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.ping();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_new_from_slice_956df4f769fb782c: function(arg0, arg1) {
            const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./client_wasm_bg.js": import0,
    };
}

const MeterEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_meterengine_free(ptr, 1));
const MidiDispatcherFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_mididispatcher_free(ptr, 1));
const WasmRtaFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmrta_free(ptr, 1));

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('client_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };

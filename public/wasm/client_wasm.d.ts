/* tslint:disable */
/* eslint-disable */

/**
 * Motor físico dos medidores.
 * Guarda o estado (nível atual) de cada canal para poder aplicar
 * a balística (Attack instantâneo, Release suave) entre os frames.
 */
export class MeterEngine {
    free(): void;
    [Symbol.dispose](): void;
    get_raw_step(ch: number): number;
    constructor(num_channels: number);
    /**
     * Extrai níveis de um pacote SysEx bruto, alimentado via stream/websockets.
     */
    processar_pacote_sysex(raw_data: Uint8Array): void;
    /**
     * Chamado pelo JS a 60fps dentro do requestAnimationFrame.
     * Retorna as alturas exatas de cada barra para aquele milissegundo.
     */
    render_frame(delta_time_ms: number): Float32Array;
    /**
     * Recebe as tabelas de calibração pre-calculadas do JS (0 a 32 steps)
     */
    set_calibration_tables(inputs: Float32Array, master: Float32Array): void;
    /**
     * Permite ao JS configurar o tempo de queda
     */
    set_decay_rate(rate: number): void;
    /**
     * Atualiza os valores "alvo" de onde o medidor deve chegar.
     * Se o novo valor for maior que o atual (Attack), ele sobe instantaneamente.
     */
    update_targets(targets: Float32Array): void;
}

export class MidiDispatcher {
    free(): void;
    [Symbol.dispose](): void;
    constructor(throttle_ms: number);
    /**
     * Retorna `true` se o evento deve ser enviado imediatamente (não foi throttled).
     * Caso contrário, o evento é retido para envio posterior e retorna `false`.
     */
    push_event(msg_type: string, channel: number, value: number, now_ms: number): boolean;
    set_throttle(throttle_ms: number): void;
    /**
     * Retorna os eventos pendentes que já podem ser enviados, no formato "type:channel:value"
     */
    tick(now_ms: number): string[];
}

export class WasmRta {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    process_audio(input: Float32Array): Float32Array;
}

export function main(): void;

export function ping(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_meterengine_free: (a: number, b: number) => void;
    readonly meterengine_get_raw_step: (a: number, b: number) => number;
    readonly meterengine_new: (a: number) => number;
    readonly meterengine_processar_pacote_sysex: (a: number, b: number, c: number) => void;
    readonly meterengine_render_frame: (a: number, b: number) => [number, number];
    readonly meterengine_set_calibration_tables: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly meterengine_set_decay_rate: (a: number, b: number) => void;
    readonly meterengine_update_targets: (a: number, b: number, c: number) => void;
    readonly __wbg_mididispatcher_free: (a: number, b: number) => void;
    readonly __wbg_wasmrta_free: (a: number, b: number) => void;
    readonly main: () => void;
    readonly mididispatcher_new: (a: number) => number;
    readonly mididispatcher_push_event: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly mididispatcher_set_throttle: (a: number, b: number) => void;
    readonly mididispatcher_tick: (a: number, b: number) => [number, number];
    readonly ping: () => [number, number];
    readonly wasmrta_new: () => number;
    readonly wasmrta_process_audio: (a: number, b: number, c: number) => any;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

import DefaultWeakMap from "mnemonist/default-weak-map.js";

import type { Decoder } from "./decoder";
import type { Encodable } from "./encoder";
import type { EvDecoder } from "./ev-decoder";
import type { StructFieldType } from "./struct-field";

const RECORDS = new DefaultWeakMap<Extensible, Map<number, unknown>>(() => new Map());

/** An TLV element that allows extension sub element. */
export interface Extensible {
  readonly [Extensible.TAG]: ExtensionRegistry<any>;
}

export namespace Extensible {
  export const TAG = Symbol("@ndn/tlv#Extensible");

  /** Clone extension fields of src to dst. */
  export function cloneRecord(dst: Extensible, src: Extensible): void {
    RECORDS.set(dst, new Map(RECORDS.get(src)));
  }

  /**
   * Define simple getters and setters.
   * @param typ - Extensible subclass constructor.
   * @param exts - Extensions, each key is a property name and each value is the TLV-TYPE number.
   */
  export function defineGettersSetters<T extends Extensible>(typ: new() => T, exts: Record<string, number>): void {
    for (const [prop, tt] of Object.entries(exts)) {
      Object.defineProperty(typ.prototype, prop, {
        enumerable: true,
        get(this: T) {
          return Extension.get(this, tt);
        },
        set(this: T, value: unknown) {
          if (value === undefined) {
            Extension.clear(this, tt);
          } else {
            Extension.set(this, tt, value);
          }
        },
      });
    }
  }
}

/**
 * An extension sub element on a parent TLV element.
 * @typeParam T - Parent TLV element type.
 * @typeParam R - Value type of this extension.
 */
export interface Extension<T, R = unknown> {
  /** TLV-TYPE. */
  readonly tt: number;

  /** Order relative to other extensions, used on encoding only. */
  readonly order?: number;

  /**
   * Decode extension element.
   * @param obj - Parent object.
   * @param tlv - TLV of sub element; its TLV-TYPE would be `this.tt`.
   * @param accumulator - Previous decoded value, if extension element appears more than once.
   */
  decode: (obj: T, tlv: Decoder.Tlv, accumulator?: R) => R;

  /**
   * Encode extension element.
   * @param obj - Parent object.
   * @param value - Decoded value.
   * @returns Encoding of sub element; its TLV-TYPE should be `this.tt`.
   */
  encode: (obj: T, value: R) => Encodable;
}

export namespace Extension {
  /** Retrieve value of an extension field. */
  export function get(obj: Extensible, tt: number): unknown {
    return RECORDS.get(obj).get(tt);
  }

  /** Assign value of an extension field. */
  export function set(obj: Extensible, tt: number, value: unknown): void {
    RECORDS.get(obj).set(tt, value);
  }

  /** Clear value of an extension field. */
  export function clear(obj: Extensible, tt: number): void {
    RECORDS.get(obj).delete(tt);
  }
}

type ExtensionFieldType<R> = Pick<StructFieldType<R>, "encode" | "decode">;

export interface ExtensionOptions {
  order?: number;
}

interface StructFieldExtension {
  type: ExtensionFieldType<any>;
  order?: number;
}

type AnyExtension = StructFieldExtension | Extension<any, any>;

/** Registry of known extension fields of a parent TLV element. */
export class ExtensionRegistry<T extends Extensible> {
  private readonly table = new Map<number, AnyExtension>();

  /** Add an extension. */
  public readonly register = <R>(tt: number, type: ExtensionFieldType<R>, { order }: ExtensionOptions = {}): void => {
    this.table.set(tt, { type, order });
  };

  /** Add an extension. */
  public readonly registerExtension = <R>(ext: Extension<T, R>): void => {
    this.table.set(ext.tt, ext);
  };

  /** Remove an extension. */
  public readonly unregisterExtension = (tt: number): void => {
    this.table.delete(tt);
  };

  /** UnknownElementCallback for EvDecoder. */
  public readonly decodeUnknown: EvDecoder.UnknownElementHandler<T> = (target, tlv) => {
    const { type: tt } = tlv;
    const ext = this.table.get(tt);
    if (!ext) {
      return false;
    }

    const record = RECORDS.get(target);
    let type: ExtensionFieldType<any> | undefined;
    if ((type = (ext as StructFieldExtension).type) === undefined) {
      record.set(tt, (ext as Extension<T, any>).decode(target, tlv, record.get(tt)));
    } else {
      record.set(tt, type.decode(tlv));
    }
    return true;
  };

  /** Encode extension fields. */
  public encode(source: T): Encodable[] {
    const record = RECORDS.peek(source);
    if (!record) {
      return [];
    }

    const fields: Array<{ tt: number; value: unknown; ext: AnyExtension }> = [];
    for (const [tt, value] of record) {
      const ext = this.table.get(tt);
      if (!ext) {
        throw new Error(`unknown extension type ${tt}`);
      }
      fields.push({ tt, value, ext });
    }

    fields.sort((a, b) => (a.ext.order ?? a.tt) - (b.ext.order ?? b.tt));
    return fields.map(({ tt, value, ext }) => {
      let type: ExtensionFieldType<any> | undefined;
      if ((type = (ext as StructFieldExtension).type) !== undefined) {
        return [tt, type.encode(value)];
      }
      return (ext as Extension<T, any>).encode(source, value);
    });
  }
}

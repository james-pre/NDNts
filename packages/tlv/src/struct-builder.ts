import { assert, toUtf8 } from "@ndn/util";
import type { Constructor, Simplify } from "type-fest";

import type { Decodable, Decoder } from "./decoder";
import type { Encodable, EncodableObj, Encoder } from "./encoder";
import { EvDecoder } from "./ev-decoder";
import { NNI } from "./nni";

/**
 * Represents a field type in StructBuilder.
 * @template T value type.
 */
export interface StructFieldType<T> {
  newValue(this: void): T;
  encode(this: void, value: T): Encodable;
  decode(this: void, tlv: Decoder.Tlv): T;
  asString?(this: void, value: T): string;
}

/**
 * Field type of non-negative integer.
 * The field is defined as number.
 * If the field is required, it is initialized as zero.
 */
export const StructFieldNNI: StructFieldType<number> = {
  newValue: () => 0,
  encode: NNI,
  decode: ({ nni }) => nni,
};

/**
 * Field type of non-negative integer.
 * The field is defined as bigint.
 * If the field is required, it is initialized as zero.
 */
export const StructFieldNNIBig: StructFieldType<bigint> = {
  newValue: () => 0n,
  encode: NNI,
  decode: ({ nniBig }) => nniBig,
};

/**
 * Field type of UTF-8 text.
 * The field is defined as string.
 * If the field is required, it is initialized as an empty string.
 */
export const StructFieldText: StructFieldType<string> = {
  newValue: () => "",
  encode: toUtf8,
  decode: ({ text }) => text,
};

/** StructBuilder field options. */
export interface StructFieldOptions<Required extends boolean = boolean, Repeat extends boolean = boolean> extends Partial<EvDecoder.RuleOptions> {
  /**
   * Whether the field is required.
   * If both .required and .repeat are false, the field may be set to undefined and is initialized as undefined.
   * @default false
   */
  required?: Required;
  /**
   * Whether the field is repeated.
   * If .repeat is true, the field is defined as an array and is initialized as an empty array.
   * @default false
   */
  repeat?: Repeat;
}

interface Rule<T> extends EvDecoder.RuleOptions {
  readonly tt: number;
  readonly key: string;
  newValue(): T;
  encode(v: T): Iterable<Encodable>;
  asString(v: T): Iterable<string>;
}

type InferField<T, Required extends boolean, Repeat extends boolean> =
  Repeat extends true ? T[] :
  Required extends true ? T :
  (T | undefined);

/**
 * Helper to build a base class that represents a TLV structure.
 * The TLV structure shall contain a sequence of sub-TLV elements with distinct TLV-TYPE numbers,
 * where each sub-TLV-TYPE may appear zero, one, or multiple times.
 * Calling code should invoke .add() method to define these sub-TLV elements.
 * The resulting base class, obtained via .baseClass() method, would contain one field for each
 * sub-TLV-TYPE as defined.
 * Calling code should declare a subclass deriving from this base class, and then assign its
 * constructor to .subclass property of the builder.
 */
export class StructBuilder<U extends {}> {
  constructor(public readonly typeName: string, public readonly topTT?: number) {
    this.EVD = new EvDecoder<any>(typeName, topTT);
  }

  public subclass?: Constructor<U, []>;
  private readonly rules: Array<Rule<any>> = [];
  private readonly EVD: EvDecoder<any>;

  public add<T, K extends string, Required extends boolean = false, Repeat extends boolean = false>(
      tt: number,
      key: K,
      type: StructFieldType<T>,
      opts: StructFieldOptions<Required, Repeat> = {},
  ): StructBuilder<U & { [key in K]: InferField<T, Required, Repeat> }> {
    const fo = { ...opts, ...this.EVD.applyDefaultsToRuleOptions(opts) };
    const { asString: itemAsString = (value) => `${value}` } = type;

    if (fo.repeat) {
      this.rules.push({
        ...fo,
        tt,
        key,
        newValue: () => [],
        *encode(vec) {
          for (const item of vec) {
            yield type.encode(item);
          }
        },
        *asString(vec) {
          if (vec.length === 0) {
            return;
          }
          let delim = ` ${key}=[`;
          for (const item of vec) {
            yield `${delim}${itemAsString(item)}`;
            delim = ", ";
          }
          yield "]";
        },
      } satisfies Rule<T[]>);
    } else if (fo.required) {
      this.rules.push({
        ...fo,
        tt,
        key,
        newValue: type.newValue,
        *encode(v) {
          yield type.encode(v);
        },
        *asString(v) {
          yield ` ${key}=${itemAsString(v)}`;
        },
      } satisfies Rule<T>);
    } else {
      this.rules.push({
        ...fo,
        tt,
        key,
        newValue: () => undefined,
        *encode(v) {
          if (v !== undefined) {
            yield type.encode(v);
          }
        },
        *asString(v) {
          if (v !== undefined) {
            yield ` ${key}=${itemAsString(v)}`;
          }
        },
      } satisfies Rule<T | undefined>);
    }

    this.EVD.add(
      tt,
      fo.repeat ?
        (t, tlv) => t[key].push(type.decode(tlv)) :
        (t, tlv) => t[key] = type.decode(tlv),
      fo,
    );

    return this as any;
  }

  public setIsCritical(cb: EvDecoder.IsCritical): this {
    this.EVD.setIsCritical(cb);
    return this;
  }

  public baseClass<S>(): (new() => Simplify<U> & EncodableObj) & Decodable<S> {
    this.rules.sort(({ order: a }, { order: b }) => a - b);
    const b = this; // eslint-disable-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
    return class {
      constructor() {
        for (const { key, newValue: construct } of b.rules) {
          (this as any)[key] = construct();
        }
      }

      public encodeTo(encoder: Encoder): void {
        const elements: Encodable[] = [];
        for (const { tt, key, encode } of b.rules) {
          for (const value of encode((this as any)[key])) {
            elements.push([tt, value]);
          }
        }

        if (b.topTT === undefined) {
          encoder.encode(elements);
        } else {
          encoder.encode([b.topTT, ...elements]);
        }
      }

      public static decodeFrom(decoder: Decoder): S {
        assert(b.subclass, `StructBuilder(${b.typeName}).subclass is unset`);
        const t = new b.subclass();
        return b.EVD[b.topTT === undefined ? "decodeValue" : "decode"](t, decoder) as any;
      }

      public toString(): string {
        const tokens: string[] = [b.typeName];
        for (const { key, asString } of b.rules) {
          tokens.push(...asString((this as any)[key]));
        }
        return tokens.join("");
      }
    } as any;
  }
}

import { SigInfo } from "@ndn/packet";
import { type Decoder, type Encoder, EvDecoder, Extension, StructFieldType } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

import { TT } from "./an";

const timestampRe = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/;

function decodeTimestamp(str: string): number {
  const match = timestampRe.exec(str);
  if (!match) {
    throw new Error("invalid ISO8601 compact timestamp");
  }
  const [y, m, d, h, i, s] = match.slice(1).map((c) => Number.parseInt(c, 10)) as
    [number, number, number, number, number, number];
  return Date.UTC(y, m - 1, d, h, i, s);
}

function padDateNum(n: number, size = 2): string {
  return n.toString().padStart(size, "0");
}

function encodeTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  return `${padDateNum(d.getUTCFullYear(), 4)}${padDateNum(1 + d.getUTCMonth())}${padDateNum(d.getUTCDate())}T${padDateNum(d.getUTCHours())}${padDateNum(d.getUTCMinutes())}${padDateNum(d.getUTCSeconds())}`;
}

const EVD = new EvDecoder<ValidityPeriod>("ValidityPeriod", TT.ValidityPeriod)
  .add(TT.NotBefore, (t, { text }) => t.notBefore = decodeTimestamp(text), { required: true })
  .add(TT.NotAfter, (t, { text }) => t.notAfter = decodeTimestamp(text), { required: true });

/** Certificate validity period. */
export class ValidityPeriod {
  public static decodeFrom(decoder: Decoder): ValidityPeriod {
    return EVD.decode(new ValidityPeriod(), decoder);
  }

  constructor();
  constructor(notBefore: ValidityPeriod.TimestampInput, notAfter: ValidityPeriod.TimestampInput);
  constructor(
      notBefore: ValidityPeriod.TimestampInput = 0,
      notAfter: ValidityPeriod.TimestampInput = 0,
  ) {
    this.notBefore = Number(notBefore);
    this.notAfter = Number(notAfter);
  }

  public notBefore: number;
  public notAfter: number;

  public encodeTo(encoder: Encoder) {
    return encoder.prependTlv(TT.ValidityPeriod,
      [TT.NotBefore, toUtf8(encodeTimestamp(this.notBefore))],
      [TT.NotAfter, toUtf8(encodeTimestamp(this.notAfter))],
    );
  }

  /** Determine whether the specified timestamp is within validity period. */
  public includes(t: ValidityPeriod.TimestampInput): boolean {
    t = Number(t);
    return this.notBefore <= t && t <= this.notAfter;
  }

  /** Determine whether this validity period equals another. */
  public equals({ notBefore, notAfter }: ValidityPeriod): boolean {
    return this.notBefore === notBefore && this.notAfter === notAfter;
  }

  /** Compute the intersection of this and other validity periods. */
  public intersect(...validityPeriods: ValidityPeriod[]): ValidityPeriod {
    return new ValidityPeriod(
      Math.max(this.notBefore, ...validityPeriods.map(({ notBefore }) => notBefore)),
      Math.min(this.notAfter, ...validityPeriods.map(({ notAfter }) => notAfter)),
    );
  }

  public toString(): string {
    return `${encodeTimestamp(this.notBefore)}-${encodeTimestamp(this.notAfter)}`;
  }
}

SigInfo.registerExtensionWithStructFieldType(TT.ValidityPeriod, StructFieldType.wrap(ValidityPeriod));

export namespace ValidityPeriod {
  export type TimestampInput = number | Date;

  /** A very long ValidityPeriod. */
  export const MAX = new ValidityPeriod(
    540109800000,
    253402300799000,
  );

  /** Construct ValidityPeriod for n days from now. */
  export function daysFromNow(n: number): ValidityPeriod {
    const notBefore = Date.now();
    const notAfter = new Date(notBefore);
    notAfter.setUTCDate(notAfter.getUTCDate() + n);
    return new ValidityPeriod(notBefore, notAfter);
  }

  /** Retrieve ValidityPeriod from SigInfo. */
  export function get(si: SigInfo): ValidityPeriod | undefined {
    return Extension.get(si, TT.ValidityPeriod) as ValidityPeriod | undefined;
  }

  /** Assign ValidityPeriod onto SigInfo. */
  export function set(si: SigInfo, v?: ValidityPeriod) {
    Extension.set(si, TT.ValidityPeriod, v);
  }
}

import "@ndn/tlv/test-fixture/expect";

import { Decoder } from "@ndn/tlv";
import { expect, test } from "vitest";

import { AltUri, Component } from "..";

test("decode", () => {
  let comp = new Component();
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqualUint8Array([]);
  expect(comp.toString()).toEqual("8=...");
  expect(AltUri.ofComponent(comp)).toEqual("...");

  const decoder = new Decoder(Uint8Array.of(0xF0, 0x03, 0x41, 0x01, 0xA0));
  comp = decoder.decode(Component);
  expect(comp.type).toBe(0xF0);
  expect(comp.value).toEqualUint8Array([0x41, 0x01, 0xA0]);
  expect(comp.toString()).toEqual("240=A%01%A0");
  expect(AltUri.ofComponent(comp)).toEqual("240=A%01%A0");

  // eslint-disable-next-line etc/no-deprecated
  comp = new Component(undefined, Uint8Array.of(0x2E, 0x2E, 0x2E, 0x42));
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqualUint8Array([0x2E, 0x2E, 0x2E, 0x42]);
  expect(comp.toString()).toEqual("8=...B");
  expect(AltUri.ofComponent(comp)).toEqual("...B");

  comp = new Component(0xFFFF, Uint8Array.of(0x41));
  expect(comp.type).toBe(0xFFFF);
  expect(comp.value).toEqualUint8Array([0x41]);
  expect(comp.toString()).toEqual("65535=A");
  expect(AltUri.ofComponent(comp)).toEqual("65535=A");
});

test("decode TLV-TYPE out of range", () => {
  expect(() => new Component(0x00)).toThrow();
  expect(() => new Component(0x10000)).toThrow();

  let decoder = new Decoder(Uint8Array.of(0x00, 0x01, 0x41));
  expect(() => decoder.decode(Component)).toThrow();
  decoder = new Decoder(Uint8Array.of(0xFE, 0x00, 0x01, 0x00, 0x00, 0x01, 0x41));
  expect(() => decoder.decode(Component)).toThrow();
});

test("decode junk after end", () => {
  expect(() => new Component(Uint8Array.of(0x08, 0x01, 0xC0, 0xFF))).toThrow();
});

test("from URI or string", () => {
  let comp = Component.from("A");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(1);
  expect(comp.value).toEqualUint8Array([0x41]);
  expect(comp.text).toBe("A");

  comp = Component.from("20=A%00B");
  expect(comp.type).toBe(0x14);
  expect(comp).toHaveLength(3);
  expect(comp.value).toEqualUint8Array([0x41, 0x00, 0x42]);

  comp = new Component(0x14, "A%00B");
  expect(comp.type).toBe(0x14);
  expect(comp).toHaveLength(5);
  expect(comp.value).toEqualUint8Array([0x41, 0x25, 0x30, 0x30, 0x42]);
  expect(comp.text).toBe("A%00B");

  comp = Component.from("...");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(0);
  expect(comp.text).toBe("");

  comp = Component.from(".....");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(2);
  expect(comp.value).toEqualUint8Array([0x2E, 0x2E]);
  expect(comp.text).toBe("..");

  comp = Component.from("...B");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(4);
  expect(comp.value).toEqualUint8Array([0x2E, 0x2E, 0x2E, 0x42]);
  expect(comp.text).toBe("...B");

  comp = Component.from("56=%0f%a0");
  expect(comp.type).toBe(0x38);
  expect(comp).toHaveLength(2);
  expect(comp.value).toEqualUint8Array([0x0F, 0xA0]);

  // best effort parsing of invalid inputs

  comp = Component.from("..");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(2);
  expect(comp.value).toEqualUint8Array([0x2E, 0x2E]);

  comp = Component.from("x=A");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(3);
  expect(comp.value).toEqualUint8Array([0x78, 0x3D, 0x41]);

  comp = Component.from("3x=A");
  expect(comp.type).toBe(0x03);
  expect(comp).toHaveLength(1);
  expect(comp.value).toEqualUint8Array([0x41]);

  comp = Component.from("0=A");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(3);
  expect(comp.value).toEqualUint8Array([0x30, 0x3D, 0x41]);

  comp = Component.from("65536=A");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(7);
  expect(comp.value).toEqualUint8Array([0x36, 0x35, 0x35, 0x33, 0x36, 0x3D, 0x41]);

  comp = Component.from("%0Q");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(1);
  expect(comp.value).toEqualUint8Array([0x00]);

  comp = Component.from("%Q0");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(1);
  expect(comp.value).toEqualUint8Array([0x00]);
});

test("compare", () => {
  const comp = new Component(0xF0, Uint8Array.of(0x41, 0x42));
  expect(comp.compare("241=AB")).toBe(Component.CompareResult.LT);
  expect(comp.compare("240=ABC")).toBe(Component.CompareResult.LT);
  expect(comp.compare("240=AC")).toBe(Component.CompareResult.LT);
  expect(comp.compare("240=AB")).toBe(Component.CompareResult.EQUAL);
  expect(comp.compare("240=AA")).toBe(Component.CompareResult.GT);
  expect(comp.compare("240=A")).toBe(Component.CompareResult.GT);
  expect(comp.compare("239=AB")).toBe(Component.CompareResult.GT);
  expect(comp.equals("240=AB")).toBeTruthy();
  expect(comp.equals("240=AC")).toBeFalsy();
});

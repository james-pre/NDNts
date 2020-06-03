import "@ndn/packet/test-fixture/expect";

import { Name, NameLike } from "@ndn/packet";

import { pattern as P } from "../..";

function match(p: P.Pattern, name: NameLike): P.Vars[] {
  return Array.from(p.match(new Name(name)));
}

test("const variable concat", () => {
  const p = new P.ConcatPattern([
    new P.ConstPattern("/P/Q"),
    new P.VariablePattern("a"),
    new P.VariablePattern("b", { minComps: 0, maxComps: 2 }),
    new P.VariablePattern("c", {
      minComps: 2,
      maxComps: 2,
      accept: (name) => name.equals("/c/c"),
    }),
  ]);

  expect(match(p, "")).toHaveLength(0);
  expect(match(p, "/Z/Z/Z/Z/Z")).toHaveLength(0);
  expect(match(p, "/P/Q")).toHaveLength(0);

  let m = match(p, "/P/Q/a/c/c");
  expect(m).toHaveLength(1);
  expect(m[0].a).toEqualName("/a");
  expect(m[0].b).toEqualName("/");
  expect(m[0].c).toEqualName("/c/c");

  m = match(p, "/P/Q/a/b/c/c");
  expect(m).toHaveLength(1);
  expect(m[0].a).toEqualName("/a");
  expect(m[0].b).toEqualName("/b");
  expect(m[0].c).toEqualName("/c/c");

  m = match(p, "/P/Q/a/b/b/c/c");
  expect(m).toHaveLength(1);
  expect(m[0].a).toEqualName("/a");
  expect(m[0].b).toEqualName("/b/b");
  expect(m[0].c).toEqualName("/c/c");

  expect(match(p, "/P/Q/a/b/b/c/cc")).toHaveLength(0);

  expect(() => p.build()).toThrow();
  expect(p.build({ a: "/a", b: "/", c: "/c/c" })).toEqualName("/P/Q/a/c/c");
  expect(p.build({ a: "/a", b: "/b", c: "/c/c" })).toEqualName("/P/Q/a/b/c/c");
  expect(() => p.build({ a: "/a", b: "/b", c: "/c/cc" })).toThrow();
});

test("certname", () => {
  const p = new P.ConcatPattern([
    new P.VariablePattern("subject", { maxComps: Infinity }),
    new P.CertNamePattern(),
  ]);

  expect(match(p, "/identity")).toHaveLength(0);
  expect(match(p, "/identity/KEY")).toHaveLength(0);
  expect(match(p, "/identity/KEY/key-id/issuer-id")).toHaveLength(0);

  let m = match(p, "/identity/KEY/key-id");
  expect(m).toHaveLength(1);
  expect(m[0].subject).toEqualName("/identity");

  m = match(p, "/identity/KEY/key-id/issuer-id/version");
  expect(m).toHaveLength(1);
  expect(m[0].subject).toEqualName("/identity");

  expect(p.build({ subject: "/identity" })).toEqualName("/identity");
});

test("alternate", () => {
  const p = new P.AlternatePattern([
    new P.ConcatPattern([
      new P.ConstPattern("/P"),
      new P.VariablePattern("a"),
      new P.ConstPattern("/A"),
    ]),
    new P.ConcatPattern([
      new P.ConstPattern("/P"),
      new P.VariablePattern("b"),
      new P.ConstPattern("/B"),
    ]),
  ]);

  expect(match(p, "/P/c/C")).toHaveLength(0);

  let m = match(p, "/P/a/A");
  expect(m).toHaveLength(1);
  expect(m[0].a).toEqualName("/a");

  m = match(p, "/P/b/B");
  expect(m).toHaveLength(1);
  expect(m[0].b).toEqualName("/b");

  expect(() => p.build({ c: "/c" })).toThrow();
  expect(p.build({ a: "/a" })).toEqualName("/P/a/A");
  expect(p.build({ b: "/b" })).toEqualName("/P/b/B");
});

test("simplify", () => {
  const p = new P.AlternatePattern([
    new P.ConcatPattern([
      new P.ConstPattern("/A"),
      new P.ConcatPattern([
        new P.ConstPattern("/B"),
        new P.ConstPattern("/C"),
        new P.CertNamePattern(),
      ]),
    ]),
    new P.AlternatePattern([
      new P.ConstPattern("/M/N"),
      new P.VariablePattern("x"),
    ]),
  ]).simplify();

  expect(p).toBeInstanceOf(P.AlternatePattern);
  if (p instanceof P.AlternatePattern) {
    expect(p.choices).toHaveLength(3);
    const [p0, p1, p2] = p.choices;

    expect(p0).toBeInstanceOf(P.ConcatPattern);
    if (p0 instanceof P.ConcatPattern) {
      expect(p0.parts).toHaveLength(2);
      const [p00, p01] = p0.parts;
      expect(p00).toBeInstanceOf(P.ConstPattern);
      if (p00 instanceof P.ConstPattern) {
        expect(p00.name).toEqualName("/A/B/C");
      }
      expect(p01).toBeInstanceOf(P.CertNamePattern);
    }

    expect(p1).toBeInstanceOf(P.ConstPattern);
    if (p1 instanceof P.ConstPattern) {
      expect(p1.name).toEqualName("/M/N");
    }

    expect(p2).toBeInstanceOf(P.VariablePattern);
    if (p2 instanceof P.VariablePattern) {
      expect(p2.id).toBe("x");
    }
  }
});

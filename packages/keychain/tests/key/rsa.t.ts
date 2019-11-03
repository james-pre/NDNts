import "@ndn/name/test-fixture";

import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { Certificate, KeyChain, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaModulusLength,
         RsaPrivateKey, RsaPublicKey } from "../../src";
import * as TestSignVerify from "../../test-fixture/sign-verify";

interface Row extends TestSignVerify.Row {
  modulusLength: RsaModulusLength;
}

const TABLE = TestSignVerify.TABLE.flatMap((row) =>
  RSA_MODULUS_LENGTHS.map((modulusLength) => ({ ...row, modulusLength })),
) as Row[];

test.each(TABLE)("sign-verify %p", async ({ cls, modulusLength }) => {
  const [pvtA, pubA] = await RsaPrivateKey.generate("/RSAKEY-A/KEY/x", modulusLength);
  const [pvtB, pubB] = await RsaPrivateKey.generate("/RSAKEY-B/KEY/x", modulusLength);

  expect(PrivateKey.isPrivateKey(pvtA)).toBeTruthy();
  expect(PrivateKey.isPrivateKey(pubA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pvtA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pubA)).toBeTruthy();
  expect(pvtA.name).toEqualName("/RSAKEY-A/KEY/x");
  expect(pubA.name).toEqualName("/RSAKEY-A/KEY/x");
  expect(pvtB.name).toEqualName("/RSAKEY-B/KEY/x");
  expect(pubB.name).toEqualName("/RSAKEY-B/KEY/x");

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record, true, false);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithRsa);
  expect(record.sA0.sigInfo.keyLocator).toBeInstanceOf(Name);
  expect(record.sA0.sigInfo.keyLocator).toEqualName(pvtA.name);
});

test.each(RSA_MODULUS_LENGTHS)("load %p", async (modulusLength) => {
  const keyChain = KeyChain.createTemp();
  const name = new Name("/RSAKEY/KEY/x");
  await RsaPrivateKey.generate(name, modulusLength, keyChain);

  const pvt = await keyChain.getKey(name);
  expect(pvt).toBeInstanceOf(RsaPrivateKey);

  const certName = (await keyChain.listCerts(name))[0];
  const cert = await keyChain.getCert(certName);
  const pub = await Certificate.getPublicKey(cert);
  expect(pub).toBeInstanceOf(RsaPublicKey);
  expect(pub.name).toEqualName(pvt.name);
});

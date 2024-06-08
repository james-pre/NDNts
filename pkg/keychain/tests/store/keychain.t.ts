import "@ndn/packet/test-fixture/expect";

import { Component, Data, digestSigning, KeyLocator, Name, ValidityPeriod } from "@ndn/packet";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { Certificate, CertNaming, generateSigningKey, KeyChain, type NamedSigner, type NamedVerifier, SigningAlgorithmListFull } from "../..";
import * as TestCertStore from "../../test-fixture/cert-store";
import * as TestKeyStore from "../../test-fixture/key-store";

test("temp KeyStore", async () => {
  const keyChain = KeyChain.createTemp(SigningAlgorithmListFull);
  const record = await TestKeyStore.execute(keyChain);
  TestKeyStore.check(record);
});

test("temp CertStore", async () => {
  const keyChain = KeyChain.createTemp(SigningAlgorithmListFull);
  const record = await TestCertStore.execute(keyChain);
  TestCertStore.check(record);
});

test("persistent KeyStore", async () => {
  using tmpDir = makeTmpDir();
  const keyChain = KeyChain.open(tmpDir.name, SigningAlgorithmListFull);
  const record = await TestKeyStore.execute(keyChain);
  TestKeyStore.check(record);
});

test("persistent CertStore", async () => {
  using tmpDir = makeTmpDir();
  const keyChain = KeyChain.open(tmpDir.name, SigningAlgorithmListFull);
  const record = await TestCertStore.execute(keyChain);
  TestCertStore.check(record);
});

describe("getSigner", () => {
  const keyChain = KeyChain.createTemp(SigningAlgorithmListFull);
  let pvtA: NamedSigner.PrivateKey;
  let pubA: NamedVerifier.PublicKey;
  let selfA: Certificate;
  let certA: Certificate;
  let pvtB: NamedSigner.PrivateKey;
  let pubB: NamedVerifier.PublicKey;
  let selfB: Certificate;
  let pvtC: NamedSigner.PrivateKey;
  let pubC: NamedVerifier.PublicKey;

  beforeAll(async () => {
    const [pvtR] = await generateSigningKey(keyChain, "/root");

    [pvtA, pubA] = await generateSigningKey(keyChain, "/C/A");
    selfA = await Certificate.selfSign({
      publicKey: pubA,
      privateKey: pvtA,
    });
    await keyChain.insertCert(selfA);
    certA = await Certificate.issue({
      publicKey: pubA,
      issuerPrivateKey: pvtR,
      issuerId: Component.from("H"),
      validity: ValidityPeriod.daysFromNow(1),
    });
    await keyChain.insertCert(certA);

    [pvtB, pubB] = await generateSigningKey(keyChain, "/B");
    selfB = await Certificate.selfSign({
      publicKey: pubB,
      privateKey: pvtB,
    });
    await keyChain.insertCert(selfB);

    [pvtC, pubC] = await generateSigningKey(keyChain, "/C");
  });

  async function getSignerKeyLocator(...args: Parameters<KeyChain["getSigner"]>): Promise<Name> {
    const signer = await keyChain.getSigner(...args);
    const data = new Data("/D");
    await signer.sign(data);
    return KeyLocator.mustGetName(data.sigInfo.keyLocator);
  }

  test("from cert name", async () => {
    await expect(getSignerKeyLocator(certA.name))
      .resolves.toEqualName(certA.name);
    await expect(getSignerKeyLocator(selfA.name))
      .resolves.toEqualName(selfA.name);
  });

  test("from key name with issued certificate", async () => {
    await expect(getSignerKeyLocator(pvtA.name))
      .resolves.toEqualName(certA.name);
  });

  test("from key name with self-signed certificate only", async () => {
    await expect(getSignerKeyLocator(pvtB.name))
      .resolves.toEqualName(pubB.name);
  });

  test("from key name without certificate", async () => {
    await expect(getSignerKeyLocator(pvtC.name))
      .resolves.toEqualName(pubC.name);
  });

  test("from subject name with issued certificate", async () => {
    await expect(getSignerKeyLocator(new Name("/C/A")))
      .resolves.toEqualName(certA.name);
  });

  test("from subject name with self-signed certificate only", async () => {
    await expect(getSignerKeyLocator(new Name("/B")))
      .resolves.toEqualName(pubB.name);
  });

  test("from subject name without certificate", async () => {
    await expect(getSignerKeyLocator(new Name("/C")))
      .resolves.toEqualName(pubC.name);
  });

  test("from subject name prefix", async () => {
    await expect(getSignerKeyLocator(new Name("/C"), { prefixMatch: true }))
      .resolves.toEqualName(certA.name);
  });

  test("missing cert name", async () => {
    const certName = CertNaming.makeCertName(new Name("/N"));
    await expect(keyChain.getSigner(certName)).rejects.toThrow(/not found/);
  });

  test("missing key name", async () => {
    const keyName = CertNaming.makeKeyName(new Name("/N"));
    await expect(keyChain.getSigner(keyName)).rejects.toThrow(/not found/);
  });

  test("missing subject name", async () => {
    await expect(keyChain.getSigner(new Name("/N"))).rejects.toThrow(/not found/);
  });

  test("fallback function", async () => {
    const fallback = vi.fn().mockRejectedValue(new Error("fallback-error"));
    await expect(keyChain.getSigner(new Name("/N"), { fallback }))
      .rejects.toThrow(/fallback-error/);
  });

  test("fallback signer", async () => {
    await expect(keyChain.getSigner(new Name("/N"), { fallback: digestSigning }))
      .resolves.toBe(digestSigning);
  });
});

import { consume } from "@ndn/endpoint";
import { FwTracer } from "@ndn/fw";
import { H3Transport } from "@ndn/quic-transport";
import { delay, fromHex } from "@ndn/util";
import { WebBluetoothTransport } from "@ndn/web-bluetooth-transport";

import { addManualTest } from "../../test-fixture/manual";

FwTracer.enable();

async function facePing(pingPrefix: string) {
  const names: string[] = [];
  const rtts: number[] = [];
  for (let i = 0; i < 50; ++i) {
    const t0 = Date.now();
    const data = await consume(`${pingPrefix}/${Math.trunc(Math.random() * 1e8)}`);
    const t1 = Date.now();
    rtts.push(t1 - t0);
    names.push(data.name.toString());
    await delay(10);
  }

  const lines = names.map((name, i) => `${rtts[i]} ${name}`);
  lines.unshift(
    `RTT min=${Math.min(...rtts)}`,
    `RTT avg=${rtts.reduce((sum, rtt) => sum + rtt, 0) / rtts.length}`,
    `RTT max=${Math.max(...rtts)}`,
  );
  return lines;
}

async function testWebBluetooth() {
  await WebBluetoothTransport.createFace({});
  return facePing("/example/esp8266/ble/ping");
}

async function testH3() {
  document.body.innerHTML = `
    <form>
    HTTP3 router:
    <input type="text" name="router" value="https://localhost:6367/ndn">
    <br>
    Certificate hash:
    <input type="text" name="cert-hash">
    <br>
    ping:
    <input type="text" name="prefix" value="/example/quic/ping">
    <br>
    <button>OK</button>
    </form>
  `;
  const [router, certHash, prefix] = await new Promise<[string, string, string]>((resolve) => {
    const $form = document.querySelector("form")!;
    $form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      resolve([
        document.querySelector<HTMLInputElement>("input[name=router]")!.value,
        document.querySelector<HTMLInputElement>("input[name=cert-hash]")!.value,
        document.querySelector<HTMLInputElement>("input[name=prefix]")!.value,
      ]);
      document.body.innerHTML = "";
    });
  });
  const opts: WebTransportOptions = {};
  if (certHash) {
    opts.serverCertificateHashes = [{
      algorithm: "sha-256",
      value: fromHex(certHash.replaceAll(":", "")),
    }];
  }
  await H3Transport.createFace({}, router, opts);
  return facePing(prefix);
}

addManualTest("test WebBluetoothTransport", testWebBluetooth);
addManualTest("test H3Transport", testH3);

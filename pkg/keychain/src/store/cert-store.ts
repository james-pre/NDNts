import { Data, type Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { Certificate } from "../certificate";
import { StoreBase } from "./store-base";

interface StoredCert {
  certBuffer: Uint8Array | string;
}

/** KV store of certificates. */
export class CertStore extends StoreBase<StoredCert> {
  public async get(name: Name): Promise<Certificate> {
    let { certBuffer } = await this.getValue(name);
    certBuffer = StoreBase.bufferFromStorable(certBuffer);
    return Certificate.fromData(Decoder.decode(certBuffer, Data));
  }

  public async insert(cert: Certificate): Promise<void> {
    await this.insertValue(cert.name, {
      certBuffer: this.bufferToStorable(Encoder.encode(cert.data)),
    });
  }
}

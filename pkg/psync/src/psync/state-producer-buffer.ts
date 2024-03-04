import type { Endpoint } from "@ndn/endpoint";
import type { Name, Signer } from "@ndn/packet";
import { BufferChunkSource, type Server, serveVersioned } from "@ndn/segmented-object";
import { assert } from "@ndn/util";

import type { PSyncCodec } from "./codec";
import type { PSyncCore } from "./core";

export class StateProducerBuffer {
  constructor(
      private readonly endpoint: Endpoint,
      private readonly describe: string,
      private readonly codec: PSyncCodec,
      private readonly signer: Signer | undefined,
      private readonly limit: number,
  ) {
    assert(limit >= 1);
  }

  private readonly servers: Server[] = [];

  public close(): void {
    this.evict(0);
  }

  public add(name: Name, state: PSyncCore.State, freshnessPeriod: number): Server {
    const source = new BufferChunkSource(this.codec.state2buffer(state));
    const server = serveVersioned(name, source, {
      freshnessPeriod,
      signer: this.signer,
      pOpts: {
        ...this.endpoint.pOpts,
        describe: `${this.describe}[pb]`,
        announcement: false,
      },
    });
    this.servers.push(server);
    this.evict();
    return server;
  }

  private evict(n = this.limit): void {
    while (this.servers.length > n) {
      const server = this.servers.shift();
      server!.close();
    }
  }
}

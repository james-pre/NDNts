import { Forwarder, FwFace } from "@ndn/fw";
import { Data, Interest, Name, NameLike } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { filter, pipeline, tap, transform } from "streaming-iterables";

/**
 * Producer handler function.
 * @returns Data reply, or false to cause timeout.
 */
export type Handler = (interest: Interest) => Promise<Data|false>;

export interface Options {
  concurrency?: number;
  describe?: string;
}

/** A running producer. */
export interface Producer {
  readonly prefix: Name|undefined;

  readonly face: FwFace;

  /** Close the producer. */
  close(): void;
}

/** Producer functionality of Endpoint. */
export class EndpointProducer {
  declare public fw: Forwarder;
  declare public opts: Options;

  /**
   * Start a producer.
   * @param prefixInput prefix registration; if undefined, prefixes may be added later.
   * @param handler function to handle incoming Interest.
   */
  public produce(prefixInput: NameLike|undefined, handler: Handler, opts: Options = {}): Producer {
    const prefix = typeof prefixInput === "undefined" ? undefined : new Name(prefixInput);
    const {
      concurrency = 1,
      describe = `produce(${prefix})`,
    } = { ...this.opts, ...opts };

    const face = this.fw.addFace({
      transform(rxIterable) {
        return pipeline(
          () => rxIterable,
          filter((item): item is Interest => item instanceof Interest),
          transform(concurrency, handler),
          filter((item): item is Data => item instanceof Data),
          tap((data) => Encoder.encode(data)),
        );
      },
      toString: () => describe,
    },
    {
      local: true,
    });
    if (prefix) {
      face.addRoute(prefix);
    }

    return {
      prefix,
      face,
      close() { face.close(); },
    };
  }
}

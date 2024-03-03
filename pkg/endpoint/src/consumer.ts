import { CancelInterest, Forwarder, FwPacket } from "@ndn/fw";
import { Data, Interest, type NameLike, type Verifier } from "@ndn/packet";
import { pushable } from "@ndn/util";

import { makeRetxGenerator, type RetxPolicy } from "./retx";

/** {@link consume} options. */
export interface ConsumerOptions {
  /**
   * Logical forwarder instance.
   * @defaultValue `Forwarder.getDefault()`
   */
  fw?: Forwarder;

  /**
   * Description for debugging purpose.
   * @defaultValue
   * "consume" + Interest name.
   */
  describe?: string;

  /** AbortSignal that allows canceling the Interest via AbortController. */
  signal?: AbortSignal;

  /**
   * Modify Interest according to specified options.
   * @defaultValue
   * `undefined`, no modification.
   */
  modifyInterest?: Interest.Modify;

  /**
   * Retransmission policy.
   * @defaultValue
   * `undefined`, no retransmission.
   */
  retx?: RetxPolicy;

  /**
   * Data verifier.
   * @defaultValue
   * `undefined`, no verification.
   */
  verifier?: Verifier;
}

/**
 * Progress of Data retrieval.
 *
 * @remarks
 * This is a Promise that resolves with the retrieved Data and rejects upon timeout,
 * annotated with the Interest and some counters.
 */
export interface ConsumerContext extends Promise<Data> {
  readonly interest: Interest;
  readonly nRetx: number;
}

function makeConsumer(
    interest: Interest,
    {
      fw = Forwarder.getDefault(),
      describe = `consume(${interest.name})`,
      signal,
      modifyInterest,
      retx,
      verifier,
    }: ConsumerOptions,
): ConsumerContext {
  Interest.makeModifyFunc(modifyInterest)(interest);

  let nRetx = -1;
  const retxGen = makeRetxGenerator(retx)(interest.lifetime)[Symbol.iterator]();

  const promise = new Promise<Data>((resolve, reject) => {
    const rx = pushable<FwPacket>();

    let timer: NodeJS.Timeout | number | undefined;
    const cancelRetx = () => {
      clearTimeout(timer);
      timer = undefined;
    };

    const sendInterest = () => {
      cancelRetx();
      const { value, done } = retxGen.next();
      if (!done) {
        timer = setTimeout(sendInterest, value);
      }
      rx.push(FwPacket.create(interest));
      ++nRetx;
    };

    const onAbort = () => {
      cancelRetx();
      rx.push(new CancelInterest(interest));
    };
    signal?.addEventListener("abort", onAbort);

    fw.addFace({
      rx,
      async tx(iterable) {
        for await (const pkt of iterable) {
          if (pkt.l3 instanceof Data) {
            try {
              await verifier?.verify(pkt.l3);
            } catch (err: unknown) {
              reject(new Error(`Data verify failed: ${err} @${describe}`));
              break;
            }
            resolve(pkt.l3);
            break;
          }
          if (pkt.reject && !timer) {
            reject(new Error(`Interest rejected: ${pkt.reject} @${describe}`));
            break;
          }
        }
        cancelRetx();
        signal?.removeEventListener("abort", onAbort);
        rx.stop();
      },
    },
    {
      describe,
      local: true,
    });

    sendInterest();
  });

  return Object.defineProperties(promise, {
    interest: { value: interest },
    nRetx: { get() { return nRetx; } },
  }) as ConsumerContext;
}

/**
 * Retrieve a single piece of Data.
 * @param interest - Interest or Interest name.
 */
export function consume(interest: Interest | NameLike, opts: ConsumerOptions = {}): ConsumerContext {
  return makeConsumer(
    interest instanceof Interest ? interest : new Interest(interest),
    opts,
  );
}

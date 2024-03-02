import { exitClosers, openUplinks } from "@ndn/cli-common";
import { createVerifier, SigningAlgorithmListFull } from "@ndn/keychain";
import { Server, type ServerChallenge, ServerEmailChallenge, ServerNopChallenge, ServerPinChallenge, ServerPossessionChallenge } from "@ndn/ndncert";
import type { Verifier } from "@ndn/packet";
import { makePersistentDataStore, PrefixRegShorter, RepoProducer } from "@ndn/repo";
import { toHex } from "@ndn/util";
import envvar from "env-var";
import { createTransport as createMT } from "nodemailer";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { inputCaProfile, inputCertBase64, keyChain } from "./util";

interface Args {
  profile: string;
  store: string;
  challenge: readonly string[];
  possessionIssuer?: string;
}

export const Ndncert03CaCommand: CommandModule<{}, Args> = {
  command: "ndncert03-ca",
  describe: "run NDNCERT 0.3 certificate authority",

  builder(argv) {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      })
      .option("store", {
        demandOption: true,
        desc: "repo store path",
        type: "string",
      })
      .option("challenge", {
        array: true,
        choices: ["nop", "pin", "email", "possession"],
        demandOption: true,
        desc: "supported challenges",
        type: "string",
      })
      .option("possession-issuer", {
        defaultDescription: "CA certificate",
        desc: "possession challenge - existing issuer certificate file",
        type: "string",
      });
  },

  async handler({ profile: profileFile, store, challenge: challengeIds, possessionIssuer }) {
    await openUplinks();

    const profile = await inputCaProfile(profileFile, true);
    const signer = await keyChain.getSigner(profile.cert.name);

    const repo = await makePersistentDataStore(store);
    RepoProducer.create(repo, { reg: PrefixRegShorter(2) });

    const challenges: ServerChallenge[] = [];
    for (const challengeId of challengeIds) {
      switch (challengeId) {
        case "nop": {
          challenges.push(new ServerNopChallenge());
          break;
        }
        case "pin": {
          const challenge = new ServerPinChallenge();
          challenge.addEventListener("newpin", ({ requestId, pin }) => {
            stdout.write(`PinChallenge requestId=${toHex(requestId)} pin=${pin}\n`);
          });
          challenges.push(challenge);
          break;
        }
        case "email": {
          const host = envvar.get("CA_EMAIL_HOST").required().asString();
          const port = envvar.get("CA_EMAIL_PORT").default(587).asPortNumber();
          const user = envvar.get("CA_EMAIL_USER").required().asString();
          const pass = envvar.get("CA_EMAIL_PASS").required().asString();
          const from = envvar.get("CA_EMAIL_FROM").required().asString(); // asEmailString() is too strict
          const challenge = new ServerEmailChallenge({
            mail: createMT({ host, port, secure: port === 465, auth: { user, pass } }),
            template: {
              from,
              subject: "NDNCERT email challenge",
              text: `Hi there

Someone has requested a Named Data Networking certificate from an NDNCERT certificate authority.

Requested subject name: $subjectName$
Requested key name: $keyName$
Certificate authority name: $caPrefix$
Request ID: $requestId$

If this is you, please validate the above information, and enter the following PIN code:
    $pin$

Otherwise, please disregard this message.`,
            },
          });
          challenge.addEventListener("emailsent", ({ requestId, sent }) => {
            stdout.write(`EmailChallenge requestId=${toHex(requestId)} sent=${JSON.stringify(sent)}\n`);
          });
          challenge.addEventListener("emailerror", ({ requestId, error }) => {
            stdout.write(`EmailChallenge requestId=${toHex(requestId)} err=${error}\n`);
          });
          challenges.push(challenge);
          break;
        }
        case "possession": {
          let verifier: Verifier;
          if (possessionIssuer) {
            const issuerCert = await inputCertBase64(possessionIssuer);
            verifier = await createVerifier(issuerCert, { algoList: SigningAlgorithmListFull });
          } else {
            verifier = profile.publicKey;
          }
          challenges.push(new ServerPossessionChallenge(verifier));
          break;
        }
      }
    }

    const server = Server.create({
      repo,
      profile,
      signer,
      challenges,
    });
    exitClosers.push(server);
    await exitClosers.wait();
  },
};

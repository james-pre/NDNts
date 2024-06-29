# @ndn/ndncert

This package is part of [NDNts](https://yoursunny.com/p/NDNts/), Named Data Networking libraries for the modern web.

This package partially implements [NDN Certificate Management protocol v0.3](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.3/841f2a2e66cc3256d113cfe61242420b9cdab6c1) and [challenges](https://github.com/named-data/ndncert/wiki/NDNCERT-Protocol-0.3-Challenges/46700d99c67dc94d13d26f838e4594f1f66d7c76).
This implementation is validated against the reference implementation using [ndncert-interop](../../integ/ndncert-interop).

Features:

* [X] CA profile (segmentation not supported)
* [X] PROBE command
* [X] PROBE extension for redirection
* [ ] PROBE extension for privacy
* [X] certificate issuance: NEW and CHALLENGE commands
* [ ] certificate renewal
* [ ] certificate revocation
* [X] CA publishes issued certificates to `@ndn/repo`

Challenges:

* [X] PIN
* [X] email, with name assignment policy
* [X] proof of possession, with name assignment policy
* [X] "nop" (not in NDNCERT spec)

`@ndn/keychain-cli` package offers `ndnts-keychain ndncert03-make-profile`, `ndnts-keychain ndncert03-show-profile`, `ndnts-keychain ndncert03-ca`, `ndnts-keychain ndncert03-probe`, and `ndnts-keychain ndncert03-client` commands that use this implementation.

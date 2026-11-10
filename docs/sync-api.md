# Sync API

The computer serves this API to paired phones over the local network. It is the
contract for the mobile client: what it sends, what it gets back and what each error
means. The exchange format itself is `core/sync/exchange.ts` (`schemaVersion: 1`), and
the merge the phone runs is the one in `core/sync`, pinned by `test/contract/sync.json`.

## Transport

- **HTTPS on its own port**, 3443 by default (Settings → Devices). In Docker the
  container always listens on 3443 and the port in the QR is the published one.
- **The certificate is self-signed and carries no address.** The phone trusts it by its
  pin, never by a CA or a host name: the pin is the lowercase hex SHA-256 of the
  certificate's DER. Check it on the open connection **before** writing anything to it,
  the pairing token included. The certificate does not change when the address or the
  port does.
- **JSON in both directions.** A request body may be sent with `Content-Encoding: gzip`;
  send `Accept-Encoding: gzip` to receive one. A body may take up to 4 MiB as sent and
  16 MiB decompressed.
- **Every error is `{ "error": "<code>" }`**, sometimes with more fields, never text. The
  codes are listed under *Errors*.

## Pairing

The QR shown in Settings → Devices holds one line of JSON:

```json
{ "v": 1, "host": "192.168.1.20", "port": 3443, "sha256": "<pin>", "token": "<one-use token>", "name": "<computer>" }
```

1. Connect to `host:port`, check the pin, and optionally call `GET /v1/hello`.
2. Generate a `deviceId` once (a UUID) and keep it: it is this phone's identity in every
   exchange.
3. `POST /v1/pair` with `{ "token", "deviceId", "name" }` (`name` is 1 to 100 characters).
4. Show the six digit code: `HMAC-SHA256(key = token, message = deviceId)`, its first four
   bytes as a big-endian unsigned integer, modulo 1 000 000, padded with zeros to six
   digits. The cases in `test/contract/sync-pairing.json` were worked out apart with
   openssl. The screen shows the same code beside the phone's name.
5. The request is held open until the owner confirms or rejects on the computer. It
   answers `200 { "token": "<device token>" }` on confirmation. Keep that token: it is
   shown once, and the computer stores only its hash.

**Deadlines.** The QR is valid for 2 minutes, which cover the scan only. A valid token
starts 60 seconds of its own for the confirmation, so **the client must wait more than
60 seconds for the answer** (75 seconds is enough). When those 60 seconds run out, or the
phone hangs up, the pairing ends as `410 expired` and the screen offers a new code. A
token is used once: a second request with it is `401 invalid-token`, and ten wrong tokens
end the session.

## Authenticated requests

Every request except `GET /v1/hello` and `POST /v1/pair` carries both headers:

```
Authorization: Bearer <device token>
X-Quoin-Device: <deviceId>
```

A wrong or missing token is `401 unauthorized`; a revoked device is `403 revoked`, and
stays so: it has to pair again, as a new device.

## Endpoints

### `GET /v1/hello`

No authentication. `200 { "versions": [1], "name": "<computer>" }`: the exchange
versions the computer reads and its name, the one in the QR.

### `GET /v1/sync`

`200` with the computer's whole state as an exchange, and an `ETag` header. The ETag is
the SHA-256 of the state without its `exportHlc`, quoted, so two reads of the same state
give the same ETag. `deviceName` is the computer's name, the same as in hello.

### `POST /v1/sync`

The phone's whole state after merging, as an exchange, with
`If-Match: <ETag of the GET it merged>`. The body's `deviceId` must be the one in
`X-Quoin-Device`.

`200 { "status", "counts", "setAside" }`:

- `status` is `applied`, `up-to-date` (nothing new for the computer; only the seen marks
  moved) or `conflicts` (nothing was written).
- `counts` is what the exchange brought, by kind. The computer also shows it in
  Settings → Devices, with any download that failed after it.
- `setAside` lists the keys of ledger entries that differ on the two sides. Each side
  keeps its own and the rest applies; the key comes back on every sync until both agree.

`applied` answers once the write is committed. Downloads it implies (the price history of
a new symbol, the rates of a new currency) run afterwards, one at a time.

### `POST /v1/prices`

The phone reports, per instrument, the series it holds:

```json
{ "instruments": [{ "instrumentId": "IE00TEST0001", "seriesVersion": "<version or null>", "last": "<newest asOf or null>" }] }
```

Each answer is one of:

- `pending`: a download for that instrument is queued or running. Change nothing and
  ask again later. It is never pending for good: a failed download stops being pending.
- `full`, with `seriesVersion` and `rows`: replace every row of the instrument.
- `tail`, with `seriesVersion`, `from` and `rows`: delete the rows at or after `from` and
  write `rows`. `from` is `last` minus seven days, so a live row replaced by its day's
  candle heals.

A version is compared for equality only and is never null in an answer. A phone with
nothing sends null for both and gets `full`. Rows carry `asOf`, `price` (a decimal string),
`currency` and `source`. Exchange rates do not travel: the phone fetches its own.
`test/contract/sync-prices.json` holds the cases.

## The flow

1. `GET /v1/sync`, keep the ETag.
2. Merge the computer's state into the phone's, with the phone's own conflict rules.
3. `POST /v1/sync` with the merged state and `If-Match`. A `409 state-changed` means the
   computer changed in between: start again from step 1 with nothing lost.
4. `POST /v1/prices` for the instruments held; while any answer is `pending`, ask again
   after a few seconds.

## Errors

| Status | Code | When |
|---|---|---|
| 400 | `invalid-request` | A body that is not JSON, a gzip that does not decompress, or a pairing or prices body of the wrong shape |
| 400 | `invalid-exchange` | An exchange that does not parse |
| 400 | `unsupported-schema-version` | With `found`, `supported` and `update`: `server` when the computer is the one to update, `client` when the phone is |
| 400 | `same-device` | An exchange carrying the computer's own `deviceId` |
| 401 | `invalid-token` | A pairing token that is wrong, already used, or with no pairing under way |
| 401 | `unauthorized` | A missing or wrong device token, or an unknown `X-Quoin-Device` |
| 403 | `rejected` | The owner rejected the pairing |
| 403 | `revoked` | The device was revoked |
| 403 | `device-mismatch` | The body's `deviceId` is not the header's |
| 404 | `not-found` | Any other method or path |
| 409 | `state-changed` | `If-Match` is not the current ETag, or is missing |
| 410 | `expired` | The pairing ran out of time, the phone hung up, or a new pairing replaced it |
| 413 | `too-large` | A body over either limit |
| 415 | `unsupported-encoding` | A `Content-Encoding` other than gzip |
| 429 | `too-many-attempts` | Every request but hello, once more than five pairing or device tokens in a row have failed, with `Retry-After` in seconds: 1, then doubling up to 60. Any success resets it |
| 500 | `internal` | Anything else; the computer logs the cause |
| 503 | `busy` | The database is busy with another write; nothing was done. Retry after `Retry-After` (1 s) |

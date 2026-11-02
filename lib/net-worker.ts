// SPDX-License-Identifier: GPL-3.0-or-later
// lib/net-worker.ts — the worker every networked applet here
// declares (lib/net-wire.ts NET_WORKER): it performs the UI's requests with
// the host's `http` node and streams each answer back as response records.
// On a 3DS the node rides the Pocket Link to the paired Mac; on a Tab5 it is
// the firmware's own HTTP over Wi-Fi; on Omarchy Pocket the host hands it to
// omarchy-pocketd.
//
// At most NODE_REQUESTS run at once; the rest wait in arrival order. Each
// running request is one task. The answers of every task share one queue toward
// the response ring, which retries every 15 ms while the ring is full, so a
// page the UI has not drained yet holds the next records instead of losing
// them.
//
// The response ring's records are as large as the device's host contract
// makes them (NET_WORKER declares it "host"), and the node's facts carry at
// most 1 KiB each. While the ring is full, a head or body fact joins the
// queued record of the same request and kind until that record is full, so
// a large channel moves its full size per frame.

import { FactKind, io, ResourceStatus, type HttpRequest } from "@pocketjs/framework/io";
import { settle, sleep } from "@pocketjs/framework/worker";
import { Answer, answerBytes, decodeRequest, encodeAnswer, encodeEnd, NODE_REQUESTS, requestId, text } from "./net-wire.ts";

const RETRY_MICROS = 15_000;

const responses = io.channel("response");
/** What one response record carries after its header. */
const ANSWER = answerBytes(responses.recordBytes);

/** A record waiting for the ring: its payload in parts. */
interface Unsent {
  id: number;
  kind: number;
  parts: Uint8Array[];
  length: number;
}
const unsent: Unsent[] = [];
let flushing = false;

function encoded(entry: Unsent): Uint8Array {
  if (entry.parts.length === 1) return encodeAnswer(entry.id, entry.kind, entry.parts[0]!);
  const payload = new Uint8Array(entry.length);
  let at = 0;
  for (const part of entry.parts) {
    payload.set(part, at);
    at += part.length;
  }
  return encodeAnswer(entry.id, entry.kind, payload);
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  while (unsent.length > 0) {
    if (responses.publish(encoded(unsent[0]!))) unsent.shift();
    else await sleep(RETRY_MICROS);
  }
  flushing = false;
}

/** `payload` in records of at most ANSWER bytes; an empty one is one record.
 *  A head or body first fills the last queued record of its request and
 *  kind. An end is a record of its own. */
function send(id: number, kind: number, payload: Uint8Array): void {
  let at = 0;
  const last = unsent[unsent.length - 1];
  if (kind !== Answer.end && last && last.id === id && last.kind === kind && last.length < ANSWER && payload.length > 0) {
    const part = payload.subarray(0, ANSWER - last.length);
    last.parts.push(part);
    last.length += part.length;
    at = part.length;
  }
  if (payload.length === 0) unsent.push({ id, kind, parts: [payload], length: 0 });
  for (; at < payload.length; at += ANSWER) {
    const part = payload.subarray(at, at + ANSWER);
    unsent.push({ id, kind, parts: [part], length: part.length });
  }
  void flush();
}

function end(id: number, status: number, failure = ""): void {
  send(id, Answer.end, encodeEnd(status, failure));
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One request: the headers record, the body and the end stream back as they
 *  arrive, and the loop stops at the end fact. Closing the resource ends its
 *  stream and drops the records it holds, so it closes after the loop: a
 *  completion can arrive in the same turn as the last records. A request the
 *  node never started completes without an end fact; its resource closes a
 *  turn after the completion, when the loop has read everything before it.
 *  Every request gets one end, whatever fails. */
async function perform(record: Uint8Array): Promise<void> {
  const id = requestId(record);
  let ended = false;
  const finish = (status: number, failure: string) => {
    if (ended) return;
    ended = true;
    end(id, status, status === ResourceStatus.ok ? "" : failure);
  };
  try {
    let resource: HttpRequest;
    try {
      resource = io.http("http").open(decodeRequest(record).descriptor);
    } catch (error) {
      finish(ResourceStatus.invalid, `invalid_request: ${reason(error)}`);
      return;
    }
    const started = resource.submit();
    if (started < 0) {
      resource.close();
      finish(ResourceStatus.busy, "unavailable: the request could not start");
      return;
    }
    const completion = settle(started);
    let sawEnd = false;
    void completion.then(() => sleep(0)).then(() => {
      if (!sawEnd) resource.close();
    });
    let failure = "";
    for await (const fact of resource.observe()) {
      if (fact.kind === FactKind.headers) send(id, Answer.head, fact.data);
      else if (fact.kind === FactKind.data) send(id, Answer.body, fact.data);
      else if (fact.kind === FactKind.error) failure = text(fact.data);
      else if (fact.kind === FactKind.end) {
        sawEnd = true;
        finish(fact.status, failure);
        break;
      }
    }
    const outcome = await completion;
    resource.close();
    finish(outcome.status, failure);
  } catch (error) {
    finish(ResourceStatus.failed, `other: ${reason(error)}`);
  }
}

const waiting: Uint8Array[] = [];
let running = 0;

function next(): void {
  while (running < NODE_REQUESTS && waiting.length > 0) {
    running++;
    void perform(waiting.shift()!).then(() => {
      running--;
      next();
    });
  }
}

async function main(): Promise<void> {
  for await (const record of io.channel("request").observe()) {
    waiting.push(record);
    next();
  }
}
main();

import { describe, expect, test } from "bun:test";
import { createMockWorker, findRoute, mockErrors, urlMatches, type MockData } from "./mock.ts";
import { Answer, decodeAnswer, decodeEnd, encodeRequest, text, utf8 } from "./net-wire.ts";

const REQUEST = 1, RESPONSE = 2;
let nextId = 1;
const send = (worker: ReturnType<typeof createMockWorker>, url: string, method = "GET", body?: string) => {
  const id = nextId++;
  worker.bridge.publish(REQUEST, encodeRequest(id, utf8(JSON.stringify({ url, method, ...(body !== undefined ? { body } : {}), timeoutMs: 10_000, maxBytes: 65536 }))));
  return id;
};
/** Every answer settled within 150 ms: id -> {status, failure, head, body}. */
const settle = async (worker: ReturnType<typeof createMockWorker>) => {
  await new Promise((r) => setTimeout(r, 150));
  const answers = new Map<number, { status?: number; failure?: string; head: string; body: string }>();
  for (let look = 0; look < 64; look++) {
    for (const record of worker.bridge.observe(RESPONSE)) {
      const { id, kind, payload } = decodeAnswer(record);
      const answer = answers.get(id) ?? { head: "", body: "" };
      if (kind === Answer.head) answer.head += text(payload);
      else if (kind === Answer.body) answer.body += text(payload);
      else Object.assign(answer, decodeEnd(payload));
      answers.set(id, answer);
    }
  }
  return answers;
};
const route = (worker: ReturnType<typeof createMockWorker>, id: number, answers: Awaited<ReturnType<typeof settle>>) => answers.get(id)!;

describe("sample data", () => {
  test("a pattern's * stands for any run of characters", () => {
    expect(urlMatches("https://a.test/x", "https://a.test/x")).toBe(true);
    expect(urlMatches("https://a.test/x", "https://a.test/xy")).toBe(false);
    expect(urlMatches("https://a.test/v1/forecast?*", "https://a.test/v1/forecast?latitude=35.6&longitude=139.7")).toBe(true);
    expect(urlMatches("https://a.test/*/item/*.json", "https://a.test/v0/item/42.json")).toBe(true);
    expect(urlMatches("https://a.test/*/item/*.json", "https://a.test/v0/user/42.json")).toBe(false);
    expect(urlMatches("https://a.test/*x*x", "https://a.test/x")).toBe(false);
  });

  test("routes are tried in order, by method", () => {
    const data: MockData = { mock: 1, routes: [{ method: "POST", url: "https://a.test/*", text: "post" }, { url: "https://a.test/one", text: "one" }, { method: "*", url: "https://a.test/*", text: "any" }] };
    expect(findRoute(data, "GET", "https://a.test/one")?.text).toBe("one");
    expect(findRoute(data, "POST", "https://a.test/one")?.text).toBe("post");
    expect(findRoute(data, "DELETE", "https://a.test/two")?.text).toBe("any");
    expect(findRoute(data, "GET", "https://b.test/")).toBeNull();
  });

  test("the worker's channels answer a route, the store service and nothing else", async () => {
    const heard: string[] = [];
    const worker = createMockWorker(
      { mock: 1, store: { weather: { units: "c" } }, routes: [{ url: "https://a.test/forecast?*", text: '{"t":14}', headers: { "Content-Type": "application/json" }, delay: 5 }] },
      { request: (n) => heard.push(`${n.method} ${n.url} ${n.answer ?? "-"} ${n.status}`) },
    );
    const forecast = send(worker, "https://a.test/forecast?lat=1");
    const saved = send(worker, "https://companion.pocket/store/get?name=weather");
    // nothing shows before the answers settle
    expect(worker.bridge.observe(RESPONSE)).toEqual([]);
    const first = await settle(worker);
    expect(route(worker, forecast, first).status).toBe(0);
    expect(JSON.parse(route(worker, forecast, first).head)).toMatchObject({ status: 200, headers: { "content-type": "application/json" } });
    expect(route(worker, forecast, first).body).toBe('{"t":14}');
    expect(JSON.parse(route(worker, saved, first).body)).toEqual({ value: { units: "c" } });

    const set = send(worker, "https://companion.pocket/store/set?name=weather", "POST", '{"units":"f"}');
    const missing = send(worker, "https://b.test/nothing");
    const later = await settle(worker);
    expect(later.get(set)?.status).toBe(0);
    expect(later.get(missing)?.failure).toStartWith("connect:");
    expect(worker.store()).toEqual({ weather: { units: "f" } });
    expect(heard).toContain("GET https://b.test/nothing - 0");
    expect(heard).toContain("GET https://a.test/forecast?lat=1 route 200");
  });

  test("two requests run at once and a long body takes several looks", async () => {
    const big = "x".repeat(20_000);
    const worker = createMockWorker({ mock: 1, routes: [{ url: "https://a.test/*", text: big, delay: 1 }] });
    const ids = [send(worker, "https://a.test/1"), send(worker, "https://a.test/2"), send(worker, "https://a.test/3")];
    await new Promise((r) => setTimeout(r, 60));
    expect(worker.bridge.observe(RESPONSE).length).toBe(8);
    const answers = await settle(worker);
    for (const id of ids) expect(answers.get(id)?.body.length ?? 0).toBeGreaterThan(0);
  });

  test("malformed sample data says what is wrong", () => {
    expect(mockErrors({ mock: 1, routes: [] })).toEqual([]);
    expect(mockErrors({ routes: [{ url: "ftp://x", method: "FETCH", status: 9 }] })).toEqual([
      "sample data says mock: 1",
      "routes[0].url is an http(s) URL pattern",
      "routes[0].method is one of GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS or *",
      "routes[0].status is 100 to 599",
    ]);
  });
});

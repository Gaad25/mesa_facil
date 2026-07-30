import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { POST } from "../app/api/sync/route";

const SYNC_CODE = "MESA-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ";

type RedisCommand = Array<string | number>;

function syncRequest(
  action: "save" | "load" | "delete",
  payload?: unknown,
  ip = "203.0.113.10",
) {
  return new NextRequest("https://mesa.test/api/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify({
      action,
      code: SYNC_CODE,
      ...(payload === undefined ? {} : { payload }),
    }),
  });
}

test("API sanitiza, expira e permite excluir o backup", async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  const commands: RedisCommand[] = [];
  const counters = new Map<string, number>();

  process.env.KV_REST_API_URL = "https://redis.test";
  process.env.KV_REST_API_TOKEN = "test-token";
  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as RedisCommand;
    commands.push(command);
    let result: unknown = 1;

    if (command[0] === "INCR") {
      const key = String(command[1]);
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      result = count;
    } else if (command[0] === "SET") {
      result = "OK";
    }

    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const payload = {
      version: 1,
      copilotEnabled: true,
      mood: "focused",
      session: null,
      archivedHands: [],
      trainingAnswered: 0,
      trainingCorrect: 0,
      syncCode: "nao-deve-sair-do-aparelho",
    };
    const saveResponse = await POST(syncRequest("save", payload));

    assert.equal(saveResponse.status, 200);
    const setCommand = commands.find((command) => command[0] === "SET");
    assert.ok(setCommand);
    assert.equal(setCommand[3], "EX");
    assert.equal(setCommand[4], 60 * 60 * 24 * 180);

    const storedRecord = JSON.parse(String(setCommand[2])) as {
      payload: Record<string, unknown>;
    };
    assert.equal("syncCode" in storedRecord.payload, false);

    const deleteResponse = await POST(syncRequest("delete"));
    assert.equal(deleteResponse.status, 200);
    assert.ok(commands.some((command) => command[0] === "DEL"));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previousUrl;
    if (previousToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previousToken;
  }
});

test("API limita tentativas repetidas de recuperação", async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.KV_REST_API_URL;
  const previousToken = process.env.KV_REST_API_TOKEN;
  const counters = new Map<string, number>();

  process.env.KV_REST_API_URL = "https://redis.test";
  process.env.KV_REST_API_TOKEN = "test-token";
  globalThis.fetch = (async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as RedisCommand;
    let result: unknown = null;
    if (command[0] === "INCR") {
      const key = String(command[1]);
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      result = count;
    } else if (command[0] === "EXPIRE") {
      result = 1;
    }
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      response = await POST(syncRequest("load", undefined, "198.51.100.8"));
    }
    assert.equal(response?.status, 429);
    assert.equal((await response?.json())?.status, "rate-limited");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = previousUrl;
    if (previousToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = previousToken;
  }
});

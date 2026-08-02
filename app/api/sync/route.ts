import { NextRequest, NextResponse } from "next/server";

import { CLOUD_SYNC_MAX_PAYLOAD_BYTES } from "@/lib/cloud-sync";
import { normalizeTrainingProgress } from "@/lib/training/progress";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = CLOUD_SYNC_MAX_PAYLOAD_BYTES + 16 * 1024;
const MIN_NORMALIZED_CODE_LENGTH = 20;
const MAX_CODE_INPUT_LENGTH = 160;
const KEY_PREFIX = "mesa-certa:sync:v1:";
const RATE_KEY_PREFIX = "mesa-certa:rate:v1:";
const BACKUP_TTL_SECONDS = 60 * 60 * 24 * 180;

type SyncAction = "save" | "load" | "delete";

const RATE_LIMITS: Record<SyncAction, number> = {
  save: 6,
  load: 30,
  delete: 6,
};

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

type RedisConfig = {
  url: string;
  token: string;
};

type StoredSyncRecord = {
  version: 1;
  payload: unknown;
  updatedAt: string;
};

class StorageError extends Error {
  constructor() {
    super("Cloud storage request failed");
    this.name = "StorageError";
  }
}

function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

function getRedisConfig(): RedisConfig | null {
  const candidates = [
    {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    },
    {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    },
  ];

  for (const candidate of candidates) {
    const url = candidate.url?.trim();
    const token = candidate.token?.trim();

    if (url && token) {
      return {
        url: url.replace(/\/+$/, ""),
        token,
      };
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value.length === 0 || value.length > MAX_CODE_INPUT_LENGTH) {
    return null;
  }

  const normalized = value.trim().toUpperCase().replace(/[\s-]/g, "");

  if (
    normalized.length < MIN_NORMALIZED_CODE_LENGTH ||
    normalized.length > 128 ||
    !/^[A-Z0-9]+$/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

async function createStorageKey(normalizedCode: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizedCode);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${KEY_PREFIX}${hash}`;
}

async function createRateKey(
  request: NextRequest,
  action: SyncAction,
): Promise<string> {
  const forwardedFor =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const minute = Math.floor(Date.now() / 60_000);

  return `${RATE_KEY_PREFIX}${action}:${hash}:${minute}`;
}

async function redisCommand(
  config: RedisConfig,
  command: unknown[],
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });
  } catch {
    throw new StorageError();
  }

  if (!response.ok) {
    throw new StorageError();
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new StorageError();
  }

  if (
    !isRecord(body) ||
    typeof body.error === "string" ||
    !Object.prototype.hasOwnProperty.call(body, "result")
  ) {
    throw new StorageError();
  }

  return body.result;
}

async function isRateLimited(
  config: RedisConfig,
  request: NextRequest,
  action: SyncAction,
): Promise<boolean> {
  const rateKey = await createRateKey(request, action);
  const count = await redisCommand(config, ["INCR", rateKey]);

  if (typeof count !== "number") {
    throw new StorageError();
  }

  if (count === 1) {
    await redisCommand(config, ["EXPIRE", rateKey, 70]);
  }

  return count > RATE_LIMITS[action];
}

function sanitizeSyncPayload(value: unknown): Record<string, unknown> | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.copilotEnabled !== "boolean" ||
    !["focused", "tired", "tilted"].includes(String(value.mood)) ||
    !Array.isArray(value.archivedHands) ||
    !(
      value.session === null ||
      value.session === undefined ||
      isRecord(value.session)
    ) ||
    typeof value.trainingAnswered !== "number" ||
    typeof value.trainingCorrect !== "number"
  ) {
    return null;
  }

  return {
    version: 1,
    copilotEnabled: value.copilotEnabled,
    mood: value.mood,
    session: value.session ?? null,
    archivedHands: value.archivedHands,
    trainingAnswered: value.trainingAnswered,
    trainingCorrect: value.trainingCorrect,
    ...(isRecord(value.trainingProgress)
      ? { trainingProgress: normalizeTrainingProgress(value.trainingProgress) }
      : {}),
    ...(typeof value.lastCloudSync === "string"
      ? { lastCloudSync: value.lastCloudSync }
      : {}),
  };
}

function unconfiguredResponse(): NextResponse {
  return jsonResponse(
    {
      ok: false,
      status: "not-configured",
      message:
        "A sincronização na nuvem ainda não foi configurada neste ambiente.",
    },
    503,
  );
}

export async function GET(): Promise<NextResponse> {
  if (!getRedisConfig()) {
    return unconfiguredResponse();
  }

  return jsonResponse({
    ok: true,
    status: "ready",
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = getRedisConfig();

  if (!config) {
    return unconfiguredResponse();
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonResponse(
      {
        ok: false,
        status: "invalid-request",
        message: "Envie a solicitação como JSON.",
      },
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return jsonResponse(
      {
        ok: false,
        status: "payload-too-large",
        message: "O backup ultrapassa o limite de 750 KB.",
      },
      413,
    );
  }

  let rawBody: ArrayBuffer;

  try {
    rawBody = await request.arrayBuffer();
  } catch {
    return jsonResponse(
      {
        ok: false,
        status: "invalid-request",
        message: "Não foi possível ler a solicitação.",
      },
      400,
    );
  }

  if (rawBody.byteLength > MAX_REQUEST_BYTES) {
    return jsonResponse(
      {
        ok: false,
        status: "payload-too-large",
        message: "O backup ultrapassa o limite de 750 KB.",
      },
      413,
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonResponse(
      {
        ok: false,
        status: "invalid-request",
        message: "O corpo da solicitação não contém JSON válido.",
      },
      400,
    );
  }

  if (!isRecord(body)) {
    return jsonResponse(
      {
        ok: false,
        status: "invalid-request",
        message: "A solicitação de sincronização é inválida.",
      },
      400,
    );
  }

  const action = body.action;

  if (action !== "save" && action !== "load" && action !== "delete") {
    return jsonResponse(
      {
        ok: false,
        status: "invalid-request",
        message: "Escolha uma ação de sincronização válida.",
      },
      400,
    );
  }

  try {
    if (await isRateLimited(config, request, action)) {
      return jsonResponse(
        {
          ok: false,
          status: "rate-limited",
          message:
            "Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.",
        },
        429,
      );
    }
  } catch {
    return jsonResponse(
      {
        ok: false,
        status: "storage-error",
        message:
          "A nuvem está temporariamente indisponível. Tente novamente em instantes.",
      },
      502,
    );
  }

  const normalizedCode = normalizeCode(body.code);

  if (!normalizedCode) {
    return jsonResponse(
      {
        ok: false,
        status: "invalid-code",
        message: "Use um código de sincronização válido.",
      },
      400,
    );
  }

  const storageKey = await createStorageKey(normalizedCode);

  if (action === "delete") {
    try {
      await redisCommand(config, ["DEL", storageKey]);
    } catch {
      return jsonResponse(
        {
          ok: false,
          status: "storage-error",
          message:
            "A nuvem está temporariamente indisponível. Tente novamente em instantes.",
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      status: "deleted",
    });
  }

  if (action === "save") {
    if (!Object.prototype.hasOwnProperty.call(body, "payload")) {
      return jsonResponse(
        {
          ok: false,
          status: "invalid-payload",
          message: "Nenhum dado foi enviado para o backup.",
        },
        400,
      );
    }

    const sanitizedPayload = sanitizeSyncPayload(body.payload);

    if (!sanitizedPayload) {
      return jsonResponse(
        {
          ok: false,
          status: "invalid-payload",
          message: "O backup não contém dados válidos do Mesa Certa.",
        },
        400,
      );
    }

    let serializedPayload: string | undefined;

    try {
      serializedPayload = JSON.stringify(sanitizedPayload);
    } catch {
      return jsonResponse(
        {
          ok: false,
          status: "invalid-payload",
          message: "Os dados enviados não formam um JSON válido.",
        },
        400,
      );
    }

    if (serializedPayload === undefined) {
      return jsonResponse(
        {
          ok: false,
          status: "invalid-payload",
          message: "Os dados enviados não formam um JSON válido.",
        },
        400,
      );
    }

    const payloadBytes = new TextEncoder().encode(
      serializedPayload,
    ).byteLength;

    if (payloadBytes > CLOUD_SYNC_MAX_PAYLOAD_BYTES) {
      return jsonResponse(
        {
          ok: false,
          status: "payload-too-large",
          message: "O backup ultrapassa o limite de 750 KB.",
        },
        413,
      );
    }

    const updatedAt = new Date().toISOString();
    const record: StoredSyncRecord = {
      version: 1,
      payload: sanitizedPayload,
      updatedAt,
    };

    try {
      const result = await redisCommand(config, [
        "SET",
        storageKey,
        JSON.stringify(record),
        "EX",
        BACKUP_TTL_SECONDS,
      ]);

      if (result !== "OK") {
        throw new StorageError();
      }
    } catch {
      return jsonResponse(
        {
          ok: false,
          status: "storage-error",
          message:
            "A nuvem está temporariamente indisponível. Tente novamente em instantes.",
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      status: "saved",
      updatedAt,
      bytes: payloadBytes,
    });
  }

  let storedValue: unknown;

  try {
    storedValue = await redisCommand(config, ["GET", storageKey]);
  } catch {
    return jsonResponse(
      {
        ok: false,
        status: "storage-error",
        message:
          "A nuvem está temporariamente indisponível. Tente novamente em instantes.",
      },
      502,
    );
  }

  if (storedValue === null) {
    return jsonResponse(
      {
        ok: false,
        status: "not-found",
        message: "Nenhum backup foi encontrado para este código.",
      },
      404,
    );
  }

  if (typeof storedValue !== "string") {
    return jsonResponse(
      {
        ok: false,
        status: "storage-error",
        message: "O backup salvo está em um formato incompatível.",
      },
      502,
    );
  }

  let record: unknown;

  try {
    record = JSON.parse(storedValue);
  } catch {
    return jsonResponse(
      {
        ok: false,
        status: "storage-error",
        message: "O backup salvo está em um formato incompatível.",
      },
      502,
    );
  }

  if (
    !isRecord(record) ||
    record.version !== 1 ||
    typeof record.updatedAt !== "string" ||
    !Object.prototype.hasOwnProperty.call(record, "payload")
  ) {
    return jsonResponse(
      {
        ok: false,
        status: "storage-error",
        message: "O backup salvo está em um formato incompatível.",
      },
      502,
    );
  }

  return jsonResponse({
    ok: true,
    status: "loaded",
    payload: record.payload,
    updatedAt: record.updatedAt,
  });
}

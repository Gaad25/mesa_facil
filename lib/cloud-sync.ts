export const CLOUD_SYNC_MAX_PAYLOAD_BYTES = 750 * 1024;

const SYNC_ENDPOINT = "/api/sync";
const SYNC_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SYNC_CODE_RANDOM_LENGTH = 24;
const MIN_NORMALIZED_CODE_LENGTH = 20;
const MAX_CODE_INPUT_LENGTH = 160;

export type CloudSyncErrorStatus =
  | "invalid-code"
  | "invalid-payload"
  | "payload-too-large"
  | "invalid-request"
  | "not-configured"
  | "not-found"
  | "rate-limited"
  | "network-error"
  | "storage-error"
  | "invalid-response";

export type CloudSyncStatus =
  | "idle"
  | "saving"
  | "loading"
  | "ready"
  | "saved"
  | "loaded"
  | "deleting"
  | "deleted"
  | CloudSyncErrorStatus;

export type CloudSyncFailure = {
  ok: false;
  status: CloudSyncErrorStatus;
  message: string;
};

export type CloudSyncSaved = {
  ok: true;
  status: "saved";
  updatedAt: string;
  bytes: number;
};

export type CloudSyncLoaded<T = unknown> = {
  ok: true;
  status: "loaded";
  payload: T;
  updatedAt: string;
};

export type CloudSyncSaveResult = CloudSyncSaved | CloudSyncFailure;
export type CloudSyncLoadResult<T = unknown> =
  | CloudSyncLoaded<T>
  | CloudSyncFailure;

export type CloudSyncDeleted = {
  ok: true;
  status: "deleted";
};

export type CloudSyncDeleteResult = CloudSyncDeleted | CloudSyncFailure;

export type CloudSyncRequestOptions = {
  signal?: AbortSignal;
};

const errorStatuses: ReadonlySet<CloudSyncErrorStatus> = new Set([
  "invalid-code",
  "invalid-payload",
  "payload-too-large",
  "invalid-request",
  "not-configured",
  "not-found",
  "rate-limited",
  "network-error",
  "storage-error",
  "invalid-response",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidCode(code: string): boolean {
  if (code.length === 0 || code.length > MAX_CODE_INPUT_LENGTH) {
    return false;
  }

  const normalized = code.trim().toUpperCase().replace(/[\s-]/g, "");

  return (
    normalized.length >= MIN_NORMALIZED_CODE_LENGTH &&
    normalized.length <= 128 &&
    /^[A-Z0-9]+$/.test(normalized)
  );
}

function failure(
  status: CloudSyncErrorStatus,
  message: string,
): CloudSyncFailure {
  return { ok: false, status, message };
}

function parseFailure(
  value: unknown,
  fallbackMessage: string,
): CloudSyncFailure {
  if (!isRecord(value)) {
    return failure("invalid-response", fallbackMessage);
  }

  const status = value.status;
  const message = value.message;

  if (
    typeof status === "string" &&
    errorStatuses.has(status as CloudSyncErrorStatus)
  ) {
    return failure(
      status as CloudSyncErrorStatus,
      typeof message === "string" && message.length > 0
        ? message
        : fallbackMessage,
    );
  }

  return failure("invalid-response", fallbackMessage);
}

async function postSyncRequest(
  body: Record<string, unknown>,
  options: CloudSyncRequestOptions,
): Promise<{ response: Response; data: unknown } | CloudSyncFailure> {
  try {
    const response = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      signal: options.signal,
    });

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      return failure(
        "invalid-response",
        "O servidor respondeu em um formato inesperado.",
      );
    }

    return { response, data };
  } catch (error) {
    const wasAborted =
      error instanceof DOMException && error.name === "AbortError";

    return failure(
      "network-error",
      wasAborted
        ? "A sincronização foi cancelada."
        : "Não foi possível conectar à nuvem. Confira sua internet e tente novamente.",
    );
  }
}

/**
 * Cria um segredo com 120 bits aleatórios. Guarde-o como uma senha:
 * qualquer pessoa que possua o código pode ler e substituir os dados salvos.
 */
export function createSyncCode(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error(
      "Este navegador não oferece geração segura de códigos de sincronização.",
    );
  }

  const randomBytes = new Uint8Array(SYNC_CODE_RANDOM_LENGTH);
  globalThis.crypto.getRandomValues(randomBytes);

  const randomPart = Array.from(
    randomBytes,
    (byte) => SYNC_CODE_ALPHABET[byte & 31],
  ).join("");
  const groups = randomPart.match(/.{1,4}/g) ?? [randomPart];

  return `MESA-${groups.join("-")}`;
}

export async function saveToCloud(
  code: string,
  payload: unknown,
  options: CloudSyncRequestOptions = {},
): Promise<CloudSyncSaveResult> {
  if (!isValidCode(code)) {
    return failure(
      "invalid-code",
      "Use um código de sincronização válido.",
    );
  }

  let serializedPayload: string | undefined;

  try {
    serializedPayload = JSON.stringify(payload);
  } catch {
    return failure(
      "invalid-payload",
      "Estes dados não podem ser convertidos para JSON.",
    );
  }

  if (serializedPayload === undefined) {
    return failure(
      "invalid-payload",
      "Escolha dados válidos para salvar na nuvem.",
    );
  }

  const payloadBytes = new TextEncoder().encode(serializedPayload).byteLength;

  if (payloadBytes > CLOUD_SYNC_MAX_PAYLOAD_BYTES) {
    return failure(
      "payload-too-large",
      "O backup ultrapassa o limite de 750 KB.",
    );
  }

  const result = await postSyncRequest(
    { action: "save", code, payload },
    options,
  );

  if (!("response" in result)) {
    return result;
  }

  if (!result.response.ok) {
    return parseFailure(
      result.data,
      "Não foi possível salvar o backup na nuvem.",
    );
  }

  if (
    isRecord(result.data) &&
    result.data.ok === true &&
    result.data.status === "saved" &&
    typeof result.data.updatedAt === "string" &&
    typeof result.data.bytes === "number"
  ) {
    return {
      ok: true,
      status: "saved",
      updatedAt: result.data.updatedAt,
      bytes: result.data.bytes,
    };
  }

  return failure(
    "invalid-response",
    "O servidor não confirmou o salvamento do backup.",
  );
}

export async function loadFromCloud<T = unknown>(
  code: string,
  options: CloudSyncRequestOptions = {},
): Promise<CloudSyncLoadResult<T>> {
  if (!isValidCode(code)) {
    return failure(
      "invalid-code",
      "Use um código de sincronização válido.",
    );
  }

  const result = await postSyncRequest({ action: "load", code }, options);

  if (!("response" in result)) {
    return result;
  }

  if (!result.response.ok) {
    return parseFailure(
      result.data,
      "Não foi possível carregar o backup da nuvem.",
    );
  }

  if (
    isRecord(result.data) &&
    result.data.ok === true &&
    result.data.status === "loaded" &&
    typeof result.data.updatedAt === "string" &&
    Object.prototype.hasOwnProperty.call(result.data, "payload")
  ) {
    return {
      ok: true,
      status: "loaded",
      payload: result.data.payload as T,
      updatedAt: result.data.updatedAt,
    };
  }

  return failure(
    "invalid-response",
    "O servidor não devolveu um backup válido.",
  );
}

export async function deleteFromCloud(
  code: string,
  options: CloudSyncRequestOptions = {},
): Promise<CloudSyncDeleteResult> {
  if (!isValidCode(code)) {
    return failure(
      "invalid-code",
      "Use um código de sincronização válido.",
    );
  }

  const result = await postSyncRequest({ action: "delete", code }, options);

  if (!("response" in result)) {
    return result;
  }

  if (!result.response.ok) {
    return parseFailure(
      result.data,
      "Não foi possível apagar o backup da nuvem.",
    );
  }

  if (
    isRecord(result.data) &&
    result.data.ok === true &&
    result.data.status === "deleted"
  ) {
    return { ok: true, status: "deleted" };
  }

  return failure(
    "invalid-response",
    "O servidor não confirmou a exclusão do backup.",
  );
}

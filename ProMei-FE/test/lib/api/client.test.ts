import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, apiFetch } from "@/lib/api/client";
import { ApiError } from "@/lib/api/api-error";
import { getErrorCode, getErrorMessage } from "@/lib/api/error-message";
import { CORRELATION_ID_HEADER } from "@/lib/api/correlation-id";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setSession,
  SESSION_EXPIRED_EVENT,
} from "@/lib/api/session-store";

type FetchCall = { url: string; init: RequestInit & { headers: Record<string, string> } };

const calls: FetchCall[] = [];

function jsonResponse(status: number, body: unknown, correlationId = "cid-api"): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      [CORRELATION_ID_HEADER]: correlationId,
    },
  });
}

function errorBody(statusCode: number, code: string, message: string) {
  return { statusCode, code, message, correlationId: "cid-api" };
}

/** Encadeia respostas: cada chamada de fetch consome a próxima da fila. */
function mockFetchSequence(responses: Array<() => Response>) {
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init: init as FetchCall["init"] });
      const next = queue.shift();
      if (!next) throw new Error(`fetch inesperado para ${url}`);
      return Promise.resolve(next());
    }),
  );
}

beforeEach(() => {
  calls.length = 0;
  // localStorage mínimo: o session-store roda em ambiente node nestes testes.
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    dispatchEvent: vi.fn(),
  });
  clearSession();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("correlation id", () => {
  it("manda x-correlation-id em toda requisição", async () => {
    mockFetchSequence([() => jsonResponse(200, { ok: true })]);

    await api.get("/items");

    expect(calls[0].init.headers[CORRELATION_ID_HEADER]).toMatch(/.+/);
  });

  it("expõe no erro o correlation id devolvido pela API", async () => {
    mockFetchSequence([
      () => jsonResponse(422, errorBody(422, "ESTOQUE_INSUFICIENTE", "Estoque insuficiente.")),
    ]);

    const error = await api.post("/stock-movements", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).correlationId).toBe("cid-api");
  });
});

describe("erros de negócio", () => {
  it("preserva code e message da API para exibição", async () => {
    mockFetchSequence([
      () =>
        jsonResponse(422, errorBody(422, "LIMITE_PLANO_EXCEDIDO", "Seu plano permite 50 itens.")),
    ]);

    const error = await api.post("/items", {}).catch((e: unknown) => e);

    expect(getErrorCode(error)).toBe("LIMITE_PLANO_EXCEDIDO");
    expect(getErrorMessage(error)).toBe("Seu plano permite 50 itens.");
  });

  it("não repete requisição em 4xx de negócio (isClientFault)", async () => {
    mockFetchSequence([() => jsonResponse(403, errorBody(403, "PERMISSAO_NEGADA", "Sem acesso."))]);

    const error = (await api.get("/users").catch((e: unknown) => e)) as ApiError;

    expect(error.isClientFault).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("cai em RESPOSTA_INVALIDA quando o body foge do envelope", async () => {
    mockFetchSequence([
      () =>
        new Response("<html>502</html>", { status: 502, headers: { "content-type": "text/html" } }),
    ]);

    const error = (await api.get("/items").catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("RESPOSTA_INVALIDA");
  });
});

describe("401 dispara refresh", () => {
  it("renova a sessão e repete a requisição original", async () => {
    setSession({ accessToken: "expirado", refreshToken: "refresh-1", expiresIn: 900 });

    mockFetchSequence([
      () => jsonResponse(401, errorBody(401, "NAO_AUTENTICADO", "Token expirado.")),
      () => jsonResponse(200, { accessToken: "novo", refreshToken: "refresh-2", expiresIn: 900 }),
      () => jsonResponse(200, { items: [] }),
    ]);

    const data = await api.get<{ items: unknown[] }>("/items");

    expect(data).toEqual({ items: [] });
    expect(calls.map((c) => c.url)).toEqual([
      "http://api.test/api/v1/items",
      "http://api.test/api/v1/auth/refresh",
      "http://api.test/api/v1/items",
    ]);
    // A repetição já vai com o token novo, e o refresh rotacionado foi persistido.
    expect(calls[2].init.headers.Authorization).toBe("Bearer novo");
    expect(getRefreshToken()).toBe("refresh-2");
  });

  it("renova uma vez só quando várias requisições tomam 401 em paralelo", async () => {
    setSession({ accessToken: "expirado", refreshToken: "refresh-1", expiresIn: 900 });

    mockFetchSequence([
      () => jsonResponse(401, errorBody(401, "NAO_AUTENTICADO", "Token expirado.")),
      () => jsonResponse(401, errorBody(401, "NAO_AUTENTICADO", "Token expirado.")),
      () => jsonResponse(200, { accessToken: "novo", refreshToken: "refresh-2", expiresIn: 900 }),
      () => jsonResponse(200, { items: [] }),
      () => jsonResponse(200, { users: [] }),
    ]);

    await Promise.all([api.get("/items"), api.get("/users")]);

    const refreshes = calls.filter((c) => c.url.endsWith("/auth/refresh"));
    expect(refreshes).toHaveLength(1);
  });

  it("encerra a sessão quando o refresh é recusado", async () => {
    setSession({ accessToken: "expirado", refreshToken: "refresh-invalido", expiresIn: 900 });

    mockFetchSequence([
      () => jsonResponse(401, errorBody(401, "NAO_AUTENTICADO", "Token expirado.")),
      () => jsonResponse(401, errorBody(401, "REFRESH_INVALIDO", "Refresh token inválido.")),
    ]);

    const error = (await api.get("/items").catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("REFRESH_INVALIDO");
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    // Limpar a sessão também dispara `session-changed` (é o que avisa o `UserProvider`),
    // então o que importa é que o aviso de expiração esteja entre os eventos — não que
    // seja o primeiro.
    const dispatched = (
      window.dispatchEvent as unknown as { mock: { calls: [CustomEvent][] } }
    ).mock.calls.map(([event]) => event.type);

    expect(dispatched).toContain(SESSION_EXPIRED_EVENT);
  });

  it("renova antes de gastar a requisição quando só o refresh sobreviveu ao reload", async () => {
    setSession({ accessToken: "em-memoria", refreshToken: "refresh-1", expiresIn: 900 });
    // Simula o reload: o access token (em memória) some, o refresh (storage) fica.
    const refreshToken = getRefreshToken() as string;
    clearSession();
    window.localStorage.setItem("promei.refresh-token", refreshToken);

    mockFetchSequence([
      () => jsonResponse(200, { accessToken: "novo", refreshToken: "refresh-2", expiresIn: 900 }),
      () => jsonResponse(200, { items: [] }),
    ]);

    await api.get("/items");

    expect(calls[0].url).toBe("http://api.test/api/v1/auth/refresh");
    expect(calls[1].init.headers.Authorization).toBe("Bearer novo");
  });

  it("não tenta refresh em rota pública (auth: false)", async () => {
    mockFetchSequence([
      () =>
        jsonResponse(401, errorBody(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha inválidos.")),
    ]);

    const error = (await apiFetch("/auth/login", {
      method: "POST",
      body: { email: "a@b.c", password: "x" },
      auth: false,
    }).catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("CREDENCIAIS_INVALIDAS");
    expect(calls).toHaveLength(1);
  });
});

describe("montagem da requisição", () => {
  it("monta query string ignorando undefined/null", async () => {
    mockFetchSequence([() => jsonResponse(200, {})]);

    await api.get("/items", { query: { page: 1, limit: 20, search: undefined, tag: null } });

    expect(calls[0].url).toBe("http://api.test/api/v1/items?page=1&limit=20");
  });

  it("trata 204 como resposta vazia", async () => {
    mockFetchSequence([() => new Response(null, { status: 204 })]);

    await expect(api.delete("/items/1")).resolves.toBeUndefined();
  });

  it("traduz falha de rede em FALHA_DE_REDE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    const error = (await api.get("/items").catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("FALHA_DE_REDE");
  });
});

describe("resposta binária", () => {
  it("devolve o PDF como Blob, sem passar por texto", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    mockFetchSequence([
      () => new Response(pdf, { status: 200, headers: { "content-type": "application/pdf" } }),
    ]);

    const blob = await api.get<Blob>("/receipts/1/pdf", { responseType: "blob" });

    expect(blob).toBeInstanceOf(Blob);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(pdf);
  });

  // Um 403 no download não pode virar "PDF": o corpo de erro continua sendo JSON.
  it("continua traduzindo erro em ApiError no download", async () => {
    mockFetchSequence([
      () => jsonResponse(403, errorBody(403, "PERMISSAO_NEGADA", "Sem permissão")),
    ]);

    const error = (await api
      .get("/receipts/1/pdf", { responseType: "blob" })
      .catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("PERMISSAO_NEGADA");
  });
});

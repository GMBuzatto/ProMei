import { describe, expect, it } from "vitest";
import {
  buildLoginHref,
  resolvePostLoginRoute,
  sanitizeRedirectPath,
} from "@/features/auth/redirect";

describe("sanitizeRedirectPath", () => {
  it("aceita caminho interno e preserva query e hash", () => {
    expect(sanitizeRedirectPath("/items")).toBe("/items");
    expect(sanitizeRedirectPath("/items?page=2")).toBe("/items?page=2");
    expect(sanitizeRedirectPath("/items?page=2#topo")).toBe("/items?page=2#topo");
  });

  it("rejeita valor ausente ou vazio", () => {
    expect(sanitizeRedirectPath(null)).toBeNull();
    expect(sanitizeRedirectPath(undefined)).toBeNull();
    expect(sanitizeRedirectPath("")).toBeNull();
  });

  it("rejeita destino externo (open redirect)", () => {
    expect(sanitizeRedirectPath("https://evil.com")).toBeNull();
    expect(sanitizeRedirectPath("http://evil.com/items")).toBeNull();
    // Protocol-relative: o browser completa com o esquema atual e sai do site.
    expect(sanitizeRedirectPath("//evil.com")).toBeNull();
    expect(sanitizeRedirectPath("//evil.com/items")).toBeNull();
    // Barra invertida vira barra em esquemas especiais: "/\evil.com" sai do site igual.
    expect(sanitizeRedirectPath("/\\evil.com")).toBeNull();
    expect(sanitizeRedirectPath("/\\/evil.com")).toBeNull();
    expect(sanitizeRedirectPath("\\\\evil.com")).toBeNull();
  });

  it("rejeita esquemas que não são navegação de página", () => {
    expect(sanitizeRedirectPath("javascript:alert(1)")).toBeNull();
    expect(sanitizeRedirectPath("data:text/html,<script></script>")).toBeNull();
  });

  it("rejeita caminho relativo", () => {
    expect(sanitizeRedirectPath("items")).toBeNull();
    expect(sanitizeRedirectPath("../items")).toBeNull();
  });

  it("rejeita caracteres de controle antes que o parser os apague", () => {
    expect(sanitizeRedirectPath("/\titems")).toBeNull();
    expect(sanitizeRedirectPath("/\nitems")).toBeNull();
    expect(sanitizeRedirectPath("/\r/evil.com")).toBeNull();
  });

  it("rejeita o próprio login para não criar laço de redirect", () => {
    expect(sanitizeRedirectPath("/login")).toBeNull();
    expect(sanitizeRedirectPath("/login?next=/items")).toBeNull();
  });
});

describe("buildLoginHref", () => {
  it("carrega o destino pretendido codificado", () => {
    expect(buildLoginHref("/items")).toBe("/login?next=%2Fitems");
    expect(buildLoginHref("/items", "?page=2")).toBe("/login?next=%2Fitems%3Fpage%3D2");
  });

  it("cai no login seco quando o destino não é confiável", () => {
    expect(buildLoginHref("/login")).toBe("/login");
    expect(buildLoginHref("//evil.com")).toBe("/login");
  });
});

describe("resolvePostLoginRoute", () => {
  it("usa o destino pedido quando ele é interno", () => {
    expect(resolvePostLoginRoute("/items")).toBe("/items");
    expect(resolvePostLoginRoute("/inventory?tab=baixo")).toBe("/inventory?tab=baixo");
  });

  it("cai no dashboard quando não há destino ou ele é suspeito", () => {
    expect(resolvePostLoginRoute(null)).toBe("/dashboard");
    expect(resolvePostLoginRoute("")).toBe("/dashboard");
    expect(resolvePostLoginRoute("https://evil.com")).toBe("/dashboard");
    expect(resolvePostLoginRoute("/login")).toBe("/dashboard");
  });
});

import { describe, expect, it } from "vitest";
import { decodeJwt, extractRolesFromToken } from "@/lib/jwt";

describe("JWT utilities", () => {
  describe("decodeJwt", () => {
    it("decodifica um JWT válido", () => {
      // JWT com payload { sub: "user-1", roles: ["admin"], company_id: "comp-1" }
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlcyI6WyJhZG1pbiJdLCJjb21wYW55X2lkIjoiY29tcC0xIn0.signature";
      const payload = decodeJwt(token);

      expect(payload).toEqual({
        sub: "user-1",
        roles: ["admin"],
        company_id: "comp-1",
      });
    });

    it("retorna null para token inválido", () => {
      expect(decodeJwt("invalid")).toBeNull();
      expect(decodeJwt("a.b")).toBeNull();
      expect(decodeJwt("a.b.c.d")).toBeNull();
    });

    it("retorna null quando payload não é JSON válido", () => {
      const invalidPayload = btoa("not json");
      const token = `header.${invalidPayload}.signature`;
      expect(decodeJwt(token)).toBeNull();
    });

    it("decodifica payload com must_change_password", () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlcyI6W10sIm11c3RfY2hhbmdlX3Bhc3N3b3JkIjp0cnVlfQ.sig";
      const payload = decodeJwt(token);

      expect(payload?.must_change_password).toBe(true);
    });
  });

  describe("extractRolesFromToken", () => {
    it("extrai roles do token", () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlcyI6WyJhZG1pbiIsImNvbGFib3JhZG9yIl19.sig";
      const roles = extractRolesFromToken(token);

      expect(roles).toEqual(["admin", "colaborador"]);
    });

    it("retorna array vazio para token sem roles", () => {
      const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig";
      const roles = extractRolesFromToken(token);

      expect(roles).toEqual([]);
    });

    it("retorna array vazio para token inválido", () => {
      expect(extractRolesFromToken("invalid")).toEqual([]);
    });
  });
});

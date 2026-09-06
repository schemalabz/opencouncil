const mockEnv: { NOTIS_SERVICE_TOKEN?: string } = {};
jest.mock("@/env.mjs", () => ({ env: mockEnv }));

import { requireService, tokensMatch } from "../service-auth";

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";

function request(authorization?: string): Request {
  return new Request("http://notis.test/api/subscriptions/user1", {
    headers: authorization ? { authorization } : {},
  });
}

describe("requireService", () => {
  beforeEach(() => {
    mockEnv.NOTIS_SERVICE_TOKEN = TOKEN;
  });

  it("fails closed when no token is configured", async () => {
    delete mockEnv.NOTIS_SERVICE_TOKEN;
    const denied = requireService(request(`Bearer ${TOKEN}`));
    expect(denied?.status).toBe(503);
  });

  it("rejects a missing, malformed or wrong token", () => {
    expect(requireService(request())?.status).toBe(401);
    expect(requireService(request(TOKEN))?.status).toBe(401);
    expect(requireService(request("Basic abc"))?.status).toBe(401);
    expect(requireService(request(`Bearer ${TOKEN.slice(0, -1)}x`))?.status).toBe(401);
    expect(requireService(request("Bearer "))?.status).toBe(401);
  });

  it("passes the configured token", () => {
    expect(requireService(request(`Bearer ${TOKEN}`))).toBeNull();
    expect(requireService(request(`Bearer ${TOKEN} `))).toBeNull();
  });
});

describe("tokensMatch", () => {
  it("compares by digest, so lengths need not agree before the comparison", () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(tokensMatch("short", TOKEN)).toBe(false);
    expect(tokensMatch("", TOKEN)).toBe(false);
  });
});

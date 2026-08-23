describe("sessionCookieName", () => {
  afterEach(() => {
    delete process.env.MAIN_SESSION_COOKIE_NAME;
    delete process.env.OPENCOUNCIL_BASE_URL;
    jest.resetModules();
  });

  test("defaults to the deployed mirror name outside development", () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { sessionCookieName } = require("../session-cookie");
      expect(sessionCookieName()).toBe("__Secure-oc-session");
    });
  });

  test("MAIN_SESSION_COOKIE_NAME overrides (staging's suffixed mirror)", () => {
    process.env.MAIN_SESSION_COOKIE_NAME = "__Secure-oc-session-staging";
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { sessionCookieName } = require("../session-cookie");
      expect(sessionCookieName()).toBe("__Secure-oc-session-staging");
    });
  });

  test("dev name derives its port from OPENCOUNCIL_BASE_URL", () => {
    process.env.OPENCOUNCIL_BASE_URL = "http://localhost:3005";
    const nodeEnv = Object.getOwnPropertyDescriptor(process.env, "NODE_ENV");
    Object.defineProperty(process.env, "NODE_ENV", { value: "development", configurable: true });
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { sessionCookieName } = require("../session-cookie");
        expect(sessionCookieName()).toBe("authjs.session-token-3005");
      });
    } finally {
      if (nodeEnv) Object.defineProperty(process.env, "NODE_ENV", nodeEnv);
    }
  });
});

describe("cookieCarriesRawToken", () => {
  test("raw Auth.js dev cookies hash before lookup; mirror values pass through", () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { cookieCarriesRawToken } = require("../session-cookie");
      expect(cookieCarriesRawToken("authjs.session-token-3000")).toBe(true);
      expect(cookieCarriesRawToken("__Secure-oc-session")).toBe(false);
      expect(cookieCarriesRawToken("__Secure-oc-session-staging")).toBe(false);
    });
  });
});

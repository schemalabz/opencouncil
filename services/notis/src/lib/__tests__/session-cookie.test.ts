describe("sessionCookieName", () => {
  afterEach(() => {
    delete process.env.MAIN_SESSION_COOKIE_NAME;
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
});

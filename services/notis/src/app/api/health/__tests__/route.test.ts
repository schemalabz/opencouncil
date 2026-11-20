import { GET } from "../route";
import { env } from "@/env.mjs";

const mutableEnv = env as { NEXT_PUBLIC_BUILD_COMMIT_SHA: string | undefined };

describe("GET /api/health", () => {
  beforeEach(() => {
    mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = undefined;
  });

  it("publishes the service and the commit the build carries", async () => {
    mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = "ff8e6c270c02d02c8a2b9830cf53eee2e4cab935";

    const body = await GET().json();

    expect(body).toEqual({ ok: true, service: "notis", commit: "ff8e6c270c02d02c8a2b9830cf53eee2e4cab935" });
  });

  it("reports a null commit when the variable is absent", async () => {
    const body = await GET().json();

    expect(body.commit).toBeNull();
  });

  it("forbids caching at the origin", () => {
    expect(GET().headers.get("Cache-Control")).toBe("no-store");
  });
});

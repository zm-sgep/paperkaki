import { expect, test } from "@playwright/test";

test("a file link that is missing, unsigned or tampered with looks like any other missing page", async ({
  request,
}) => {
  const urls = [
    "/api/files/paper-pdfs/family/paper.pdf",
    "/api/files/paper-pdfs/family/paper.pdf?exp=9999999999&sig=AAAA",
    "/api/files/not-a-bucket/x.pdf?exp=9999999999&sig=AAAA",
    "/api/files/paper-pdfs/%2e%2e/secret?exp=9999999999&sig=AAAA",
  ];
  for (const url of urls) {
    const response = await request.get(url);
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});

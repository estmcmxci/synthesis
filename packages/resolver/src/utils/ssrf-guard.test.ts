import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicHttpUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  SsrfBlockedError,
} from "./ssrf-guard.js";

test("isPrivateIPv4 — RFC 1918 ranges", () => {
  assert.equal(isPrivateIPv4("10.0.0.1"), true);
  assert.equal(isPrivateIPv4("10.255.255.255"), true);
  assert.equal(isPrivateIPv4("172.16.0.1"), true);
  assert.equal(isPrivateIPv4("172.31.255.255"), true);
  assert.equal(isPrivateIPv4("192.168.1.1"), true);
  assert.equal(isPrivateIPv4("192.168.255.255"), true);
});

test("isPrivateIPv4 — loopback + link-local + cloud metadata", () => {
  assert.equal(isPrivateIPv4("127.0.0.1"), true);
  assert.equal(isPrivateIPv4("127.255.255.254"), true);
  assert.equal(isPrivateIPv4("169.254.1.1"), true);
  // AWS/GCP/Azure metadata endpoint — the canonical SSRF target.
  assert.equal(isPrivateIPv4("169.254.169.254"), true);
});

test("isPrivateIPv4 — other reserved ranges", () => {
  assert.equal(isPrivateIPv4("0.0.0.0"), true); // "this network"
  assert.equal(isPrivateIPv4("100.64.0.1"), true); // CGNAT
  assert.equal(isPrivateIPv4("100.127.255.255"), true); // CGNAT upper bound
  assert.equal(isPrivateIPv4("198.18.0.1"), true); // benchmark
  assert.equal(isPrivateIPv4("224.0.0.1"), true); // multicast
  assert.equal(isPrivateIPv4("240.0.0.1"), true); // reserved
  assert.equal(isPrivateIPv4("255.255.255.255"), true); // broadcast
});

test("isPrivateIPv4 — public addresses pass", () => {
  assert.equal(isPrivateIPv4("8.8.8.8"), false); // Google DNS
  assert.equal(isPrivateIPv4("1.1.1.1"), false); // Cloudflare DNS
  assert.equal(isPrivateIPv4("104.21.0.1"), false); // arbitrary public
  assert.equal(isPrivateIPv4("172.15.255.255"), false); // just below 172.16/12
  assert.equal(isPrivateIPv4("172.32.0.0"), false); // just above 172.16/12
  assert.equal(isPrivateIPv4("100.63.255.255"), false); // just below CGNAT
  assert.equal(isPrivateIPv4("100.128.0.0"), false); // just above CGNAT
  assert.equal(isPrivateIPv4("169.253.255.255"), false); // just below link-local
  assert.equal(isPrivateIPv4("169.255.0.0"), false); // just above link-local
});

test("isPrivateIPv4 — malformed strings rejected", () => {
  assert.equal(isPrivateIPv4("not-an-ip"), true);
  assert.equal(isPrivateIPv4("10.0.0"), true);
  assert.equal(isPrivateIPv4("256.0.0.0"), true);
  assert.equal(isPrivateIPv4(""), true);
});

test("isPrivateIPv6 — loopback + unspecified + link-local + ULA", () => {
  assert.equal(isPrivateIPv6("::"), true);
  assert.equal(isPrivateIPv6("::1"), true);
  assert.equal(isPrivateIPv6("fe80::1"), true);
  assert.equal(isPrivateIPv6("febf::1"), true); // upper edge of fe80::/10
  assert.equal(isPrivateIPv6("fc00::1"), true);
  assert.equal(isPrivateIPv6("fd00::1"), true);
  assert.equal(isPrivateIPv6("fdff::1"), true); // upper edge of fc00::/7
});

test("isPrivateIPv6 — IPv4-mapped private", () => {
  assert.equal(isPrivateIPv6("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateIPv6("::ffff:10.0.0.1"), true);
  assert.equal(isPrivateIPv6("::ffff:169.254.169.254"), true);
});

test("isPrivateIPv6 — public addresses pass", () => {
  assert.equal(isPrivateIPv6("2001:4860:4860::8888"), false); // Google DNS v6
  assert.equal(isPrivateIPv6("2606:4700:4700::1111"), false); // Cloudflare v6
  assert.equal(isPrivateIPv6("::ffff:8.8.8.8"), false); // mapped public IPv4
  assert.equal(isPrivateIPv6("fec0::1"), false); // deprecated site-local, not in fe80::/10
});

test("assertPublicHttpUrl — rejects malformed", async () => {
  await assert.rejects(() => assertPublicHttpUrl("not a url"), SsrfBlockedError);
});

test("assertPublicHttpUrl — rejects non-http schemes", async () => {
  await assert.rejects(() => assertPublicHttpUrl("file:///etc/passwd"), SsrfBlockedError);
  await assert.rejects(() => assertPublicHttpUrl("ftp://example.com/"), SsrfBlockedError);
  await assert.rejects(() => assertPublicHttpUrl("gopher://localhost/"), SsrfBlockedError);
});

test("assertPublicHttpUrl — rejects literal local hostnames", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/"), SsrfBlockedError);
  await assert.rejects(() => assertPublicHttpUrl("http://LOCALHOST:6379/"), SsrfBlockedError);
  await assert.rejects(() => assertPublicHttpUrl("http://ip6-localhost/"), SsrfBlockedError);
});

test("assertPublicHttpUrl — rejects literal private IPs (no DNS)", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/"), SsrfBlockedError);
  await assert.rejects(
    () => assertPublicHttpUrl("http://169.254.169.254/latest/meta-data/"),
    SsrfBlockedError,
  );
  await assert.rejects(() => assertPublicHttpUrl("http://10.0.0.1/"), SsrfBlockedError);
  await assert.rejects(() => assertPublicHttpUrl("http://192.168.1.1/"), SsrfBlockedError);
  await assert.rejects(() => assertPublicHttpUrl("http://[::1]/"), SsrfBlockedError);
  await assert.rejects(() => assertPublicHttpUrl("http://[fe80::1]/"), SsrfBlockedError);
});

test("assertPublicHttpUrl — accepts literal public IP", async () => {
  // Public DNS resolver, stable.
  await assert.doesNotReject(() => assertPublicHttpUrl("https://8.8.8.8/"));
});

test("assertPublicHttpUrl — accepts public hostname (DNS lookup)", async () => {
  // example.com is reserved for documentation and resolves to a public IP.
  // This test does require network access; if it flakes locally without
  // DNS, the failure mode is a clear DNS-resolution error from the guard
  // itself, not a silent pass.
  await assert.doesNotReject(() => assertPublicHttpUrl("https://example.com/"));
});

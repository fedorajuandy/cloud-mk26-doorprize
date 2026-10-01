import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt, jwtVerify } from "jose";
import { cookie, tokenFor } from "../src/server/auth.js";

test("JWT lifetime supports non-expiring and timed sessions with matching cookies", async () => {
  const previous = {
    secret: process.env.JWT_SECRET,
    ttl: process.env.JWT_TTL_SECONDS,
  };
  process.env.JWT_SECRET = "test-auth-lifetime-secret-at-least-32-characters";
  try {
    delete process.env.JWT_TTL_SECONDS;
    const token = await tokenFor({ id: 1, password: "hashed-password" });
    assert.equal(decodeJwt(token).exp, undefined);
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET), {
      currentDate: new Date("2099-01-01"),
    });
    assert.match(cookie(token), /Max-Age=34560000/);
    assert.match(cookie("", true), /Max-Age=0/);
    process.env.JWT_TTL_SECONDS = "28800";
    const timed = await tokenFor({ id: 1, password: "hashed-password" });
    assert.equal(decodeJwt(timed).exp - decodeJwt(timed).iat, 28800);
    assert.match(cookie(timed), /Max-Age=28800/);
    await assert.rejects(
      jwtVerify(timed, new TextEncoder().encode(process.env.JWT_SECRET), {
        currentDate: new Date("2099-01-01"),
      }),
    );
    process.env.JWT_TTL_SECONDS = "invalid";
    await assert.rejects(
      tokenFor({ id: 1, password: "hashed-password" }),
      /JWT_TTL_SECONDS/,
    );
  } finally {
    for (const [key, value] of [
      ["JWT_SECRET", previous.secret],
      ["JWT_TTL_SECONDS", previous.ttl],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./plugin-fixture.cjs");
test("native playback supports both SSRC mapping directions", async (t) => {
  const f = fixture(t);
  const conn = f.getConnection();
  conn.getUserIdBySsrc = () => undefined;
  conn.remoteAudioSSRCs = new Map([["friend", 1]]);
  const p = f.create();
  assert.equal(p.resolveId(conn, 1), "friend");
  await f.tick(p);
  assert(f.volume.get("friend") < 100);
  p.stop();
  conn.remoteAudioSSRCs = new Map([[1, "friend"]]);
  assert.equal(p.resolveId(conn, 1), "friend");
  assert.equal(f.volume.get("friend"), 100);
});

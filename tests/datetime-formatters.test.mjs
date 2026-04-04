import assert from "node:assert/strict";
import test from "node:test";

const {
  formatBangkokDateTime,
  formatBangkokTime,
  formatPlainDate
} = await import("../lib/datetime.ts");

test("formats UTC morning scan as Bangkok time", () => {
  assert.equal(formatBangkokTime("2026-04-02T00:50:01+00:00"), "07:50");
  assert.equal(
    formatBangkokDateTime("2026-04-02T00:50:01+00:00", { includeSeconds: true }),
    "02/04/2026 07:50:01"
  );
});

test("formats night shift enter as Bangkok local time", () => {
  assert.equal(formatBangkokTime("2026-04-01T12:12:57+00:00", { includeSeconds: true }), "19:12:57");
  assert.equal(
    formatBangkokDateTime("2026-04-01T12:12:57+00:00", { includeSeconds: true }),
    "01/04/2026 19:12:57"
  );
});

test("formats cross-day exit using next Bangkok calendar day", () => {
  assert.equal(formatBangkokTime("2026-04-01T21:01:19+00:00", { includeSeconds: true }), "04:01:19");
  assert.equal(
    formatBangkokDateTime("2026-04-01T21:01:19+00:00", { includeSeconds: true }),
    "02/04/2026 04:01:19"
  );
});

test("formats work_date as plain business date without timezone conversion", () => {
  assert.equal(formatPlainDate("2026-04-01"), "01/04/2026");
});

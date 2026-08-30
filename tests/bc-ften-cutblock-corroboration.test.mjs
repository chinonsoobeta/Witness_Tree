import assert from "node:assert/strict";
import { readFile, writeFile, rename } from "node:fs/promises";
import test from "node:test";

import { validateBcFtenCutblockCorroboration } from "../scripts/check-bc-ften-cutblock-corroboration.mjs";
import { fisherExactTwoTailed } from "../scripts/lib/two-proportion.mjs";

const RECORD = "data/bc-ften-cutblock-corroboration.json";
const BACKUP = "data/bc-ften-cutblock-corroboration.json.test-backup";

// Each tamper is applied to a copy of the real record, checked, and rolled back
// even if the assertion throws. Nothing here can leave the record modified.
async function withTamper(mutate, run) {
  const original = await readFile(RECORD, "utf8");
  await writeFile(BACKUP, original);
  try {
    const record = JSON.parse(original);
    mutate(record);
    await writeFile(RECORD, `${JSON.stringify(record, null, 2)}\n`);
    await run();
  } finally {
    await rename(BACKUP, RECORD);
  }
}

test("the recorded corroboration is internally consistent", async () => {
  const record = await validateBcFtenCutblockCorroboration();
  assert.equal(record.results.length, 100);
  assert.equal(record.summary.lossObserved.candidates, 50);
  assert.equal(record.summary.knownNoLoss.candidates, 50);
  // A guard against a vacuous pass: if every query came back empty there would
  // be nothing to corroborate and the contrast would be meaningless.
  assert.ok(
    record.summary.lossObserved.withAnyCutblock > 0,
    "no loss-observed candidate matched any cutblock, so this test would pass on an empty run",
  );
});

test("a record that claims more than it measured is rejected", async () => {
  for (const claim of [
    "corroboratesGroundTruth",
    "constitutesReview",
    "provesHarvestOccurred",
    "absenceProvesNoHarvest",
    "isPublisherEdition",
    "movesAnyGate",
  ]) {
    await withTamper(
      (record) => {
        record.claims[claim] = true;
      },
      async () => {
        await assert.rejects(validateBcFtenCutblockCorroboration(), new RegExp(`claims ${claim}`));
      },
    );
  }
});

test("promotion to a publishable or production record is rejected", async () => {
  for (const flag of ["published", "productionEligible", "isEdition", "isSnapshot"]) {
    await withTamper(
      (record) => {
        record[flag] = true;
      },
      async () => {
        await assert.rejects(validateBcFtenCutblockCorroboration(), new RegExp(`sets ${flag} to true`));
      },
    );
  }
});

test("a run whose positive control never fired is rejected", async () => {
  await withTamper(
    (record) => {
      record.method.positiveControl.numberMatched = 0;
    },
    async () => {
      await assert.rejects(validateBcFtenCutblockCorroboration(), /positive control that matched 0/);
    },
  );
});

test("a summary that does not follow from the results is rejected", async () => {
  await withTamper(
    (record) => {
      record.summary.lossObserved.withCutblockInInterval += 5;
    },
    async () => {
      await assert.rejects(validateBcFtenCutblockCorroboration(), /in interval, results give/);
    },
  );

  // The subtler tamper: move a real result rather than the summary, so the
  // record stays superficially plausible.
  await withTamper(
    (record) => {
      const entry = record.results.find(
        (item) =>
          item.observedClass === "known-no-loss" && item.inInterval === 0 && item.outsideInterval > 0,
      );
      entry.inInterval = 1;
      entry.outsideInterval = Math.max(0, entry.outsideInterval - 1);
    },
    async () => {
      await assert.rejects(validateBcFtenCutblockCorroboration(), /in interval, results give/);
    },
  );
});

test("a p value that does not recompute is rejected", async () => {
  await withTamper(
    (record) => {
      record.summary.contrast.cutblockInInterval.fisherExactTwoTailedP = 0.0001;
    },
    async () => {
      await assert.rejects(validateBcFtenCutblockCorroboration(), /p value is recorded as/);
    },
  );
});

test("dropping a caveat is rejected", async () => {
  await withTamper(
    (record) => {
      record.limits = record.limits.filter((limit) => !/harvesting authority/i.test(limit));
    },
    async () => {
      await assert.rejects(validateBcFtenCutblockCorroboration(), /has lost the limit/);
    },
  );
});

test("a candidate set other than the retired review packet is rejected", async () => {
  await withTamper(
    (record) => {
      record.packet.sha256 = "0".repeat(64);
    },
    async () => {
      await assert.rejects(validateBcFtenCutblockCorroboration(), /must be the same candidates/);
    },
  );
});

test("classifying more cutblocks than were matched is rejected", async () => {
  // The arithmetic guard fires first and says the same thing, so accept either
  // rejection rather than pinning the test to which one wins the race.
  await withTamper(
    (record) => {
      const entry = record.results.find((item) => item.cutblocksIntersecting === 0);
      entry.inInterval = 1;
    },
    async () => {
      await assert.rejects(
        validateBcFtenCutblockCorroboration(),
        /but only 0 were matched|in-interval cutblock with no cutblock matched/,
      );
    },
  );
});

test("the two-proportion test agrees with tables computed by hand", () => {
  // With margins of 5 and 5 there are C(10,5) = 252 equally likely
  // arrangements. Both extremes sit at 1/252, so the two-tailed p is 2/252.
  assert.equal(Number(fisherExactTwoTailed(5, 0, 0, 5).toPrecision(6)), Number((2 / 252).toPrecision(6)));
  // An even split cannot separate the groups at all.
  assert.equal(Number(fisherExactTwoTailed(25, 25, 25, 25).toFixed(6)), 1);
  // The test is symmetric under swapping the rows.
  assert.equal(fisherExactTwoTailed(18, 32, 4, 46), fisherExactTwoTailed(4, 46, 18, 32));
});

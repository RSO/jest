/**
 * Copyright (c) 2014-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @emails oncall+jsinfra
 */
'use strict';

const fs = require('fs');
const path = require('path');
const runJest = require('../runJest');
const skipOnWindows = require('skipOnWindows');

const emptyTest = 'describe("", () => {it("", () => {})})';
const snapshotDir =
  path.resolve(__dirname, '../snapshot/__tests__/__snapshots__');
const snapshotFile = path.resolve(snapshotDir, 'snapshot-test.js.snap');
const secondSnapshotFile = path.resolve(
  snapshotDir,
  'second-snapshot-test.js.snap'
);
const snapshotOfCopy = path.resolve(snapshotDir, 'snapshot-test_copy.js.snap');
const originalTestPath = path.resolve(
  __dirname,
  '../snapshot/__tests__/snapshot-test.js'
);
const originalTestContent = fs.readFileSync(originalTestPath, 'utf8');
const copyOfTestPath = originalTestPath.replace('.js', '_copy.js');

const snapshotEscapeDir =
  path.resolve(__dirname, '../snapshot-escape/__tests__/');
const snapshotEscapeTestFile =
  path.resolve(snapshotEscapeDir, 'snapshot-test.js');
const snapshotEscapeSnapshotDir =
  path.resolve(snapshotEscapeDir, '__snapshots__');
const snapshotEscapeFile =
  path.resolve(snapshotEscapeSnapshotDir, 'snapshot-test.js.snap');

const initialTestData = fs.readFileSync(snapshotEscapeTestFile, 'utf8');

const fileExists = filePath => {
  try {
    return fs.statSync(filePath).isFile();
  } catch (e) {}
  return false;
};
const getSnapshotOfCopy = () => {
  const exports = Object.create(null);
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(snapshotOfCopy, 'utf8'));
  return exports;
};

describe('Snapshot', () => {
  skipOnWindows.suite();

  const cleanup = () => {
    [
      snapshotFile,
      secondSnapshotFile,
      snapshotOfCopy,
      copyOfTestPath,
      snapshotEscapeFile,
    ].forEach(file => {
      if (fileExists(file)) {
        fs.unlinkSync(file);
      }
    });
    if (fileExists(snapshotDir)) {
      fs.rmdirSync(snapshotDir);
    }
    if (fileExists(snapshotEscapeSnapshotDir)) {
      fs.rmdirSync(snapshotEscapeSnapshotDir);
    }

    fs.writeFileSync(snapshotEscapeTestFile, initialTestData, 'utf8');
  };

  beforeEach(cleanup);
  afterAll(cleanup);

  it('works as expected', () => {
    const result = runJest.json('snapshot', []);
    const json = result.json;

    expect(json.numTotalTests).toBe(4);
    expect(json.numPassedTests).toBe(4);
    expect(json.numFailedTests).toBe(0);
    expect(json.numPendingTests).toBe(0);
    expect(result.status).toBe(0);

    const content = require(snapshotFile);
    expect(
      content['snapshot is not influenced by previous counter 1']
    ).not.toBe(undefined);

    const info = result.stderr.toString();
    expect(info).toMatch('4 snapshots written in 2 test files');
    expect(info).toMatch('4 tests passed');
    expect(info).toMatch('4 total in 2 test suites, 4 snapshots');
  });

  it('works with escaped characters', () => {
    // Write the first snapshot
    let result = runJest('snapshot-escape');
    let stderr = result.stderr.toString();

    expect(stderr).toMatch('1 snapshot written');
    expect(stderr).toMatch('1 total in 1 test suite, 1 snapshot,');
    expect(result.status).toBe(0);

    // Write the second snapshot
    const testData =
      `test('escape strings two', () => expect('two: \\\'\"').` +
      `toMatchSnapshot());`;
    const newTestData = initialTestData + testData;
    fs.writeFileSync(snapshotEscapeTestFile, newTestData, 'utf8');

    result = runJest('snapshot-escape');
    stderr = result.stderr.toString();

    expect(stderr).toMatch('1 snapshot written');
    expect(stderr).toMatch('2 total in 1 test suite, 2 snapshots,');
    expect(result.status).toBe(0);

    // Now let's check again if everything still passes.
    // If this test doesn't pass, some snapshot data was not properly escaped.
    result = runJest('snapshot-escape');
    stderr = result.stderr.toString();

    expect(stderr).not.toMatch('Snapshot Summary');
    expect(stderr).toMatch('2 total in 1 test suite, 2 snapshots,');
    expect(result.status).toBe(0);
  });

  describe('Validation', () => {

    beforeEach(() => {
      fs.writeFileSync(copyOfTestPath, originalTestContent);
    });

    it('deletes the snapshot if the test file has been removed', () => {
      const firstRun = runJest.json('snapshot', []);
      fs.unlinkSync(copyOfTestPath);

      const content = require(snapshotOfCopy);
      expect(content).not.toBe(undefined);
      const secondRun = runJest.json('snapshot', ['-u']);

      expect(firstRun.json.numTotalTests).toBe(7);
      expect(secondRun.json.numTotalTests).toBe(4);
      expect(fileExists(snapshotOfCopy)).toBe(false);

      const infoFR = firstRun.stderr.toString();
      const infoSR = secondRun.stderr.toString();
      expect(infoFR).toMatch('7 snapshots written in 3 test files');
      expect(infoFR).toMatch('7 tests passed');
      expect(infoFR).toMatch('7 total in 3 test suites');
      expect(infoSR).toMatch('1 snapshot file removed');
      expect(infoSR).toMatch('4 tests passed');
      expect(infoSR).toMatch('4 total in 2 test suites');
    });

    it('deletes a snapshot when a test does removes all the snapshots', () => {
      const firstRun = runJest.json('snapshot', []);

      fs.writeFileSync(copyOfTestPath, emptyTest);
      const secondRun = runJest.json('snapshot', ['-u']);
      fs.unlinkSync(copyOfTestPath);

      expect(firstRun.json.numTotalTests).toBe(7);
      expect(secondRun.json.numTotalTests).toBe(5);

      expect(fileExists(snapshotOfCopy)).toBe(false);
      const infoFR = firstRun.stderr.toString();
      const infoSR = secondRun.stderr.toString();
      expect(infoFR).toMatch('7 snapshots written in 3 test files');
      expect(infoFR).toMatch('7 tests passed');
      expect(infoFR).toMatch('7 total in 3 test suites');
      expect(infoSR).toMatch('1 snapshot file removed');
      expect(infoSR).toMatch('5 tests passed');
      expect(infoSR).toMatch('5 total in 3 test suites, 4 snapshots');
    });

    it('updates the snapshot when a test removes some snapshots', () => {
      const firstRun = runJest.json('snapshot', []);
      fs.unlinkSync(copyOfTestPath);
      const beforeRemovingSnapshot = getSnapshotOfCopy();

      fs.writeFileSync(copyOfTestPath, originalTestContent.replace(
        '.toMatchSnapshot()',
        '.not.toBe(undefined)'
      ));
      const secondRun = runJest.json('snapshot', ['-u']);
      fs.unlinkSync(copyOfTestPath);

      expect(firstRun.json.numTotalTests).toBe(7);
      expect(secondRun.json.numTotalTests).toBe(7);
      expect(fileExists(snapshotOfCopy)).toBe(true);
      const afterRemovingSnapshot = getSnapshotOfCopy();

      expect(
        Object.keys(beforeRemovingSnapshot).length - 1
      ).toBe(
        Object.keys(afterRemovingSnapshot).length
      );
      const keyToCheck =
        'snapshot works with plain objects and the title has `escape` ' +
        'characters 2';
      expect(
        beforeRemovingSnapshot[keyToCheck]
      ).not.toBe(undefined);
      expect(
        afterRemovingSnapshot[keyToCheck]
      ).toBe(undefined);

      const infoFR = firstRun.stderr.toString();
      const infoSR = secondRun.stderr.toString();
      expect(infoFR).toMatch('7 snapshots written in 3 test files');
      expect(infoFR).toMatch('7 tests passed');
      expect(infoFR).toMatch('7 total in 3 test suites, 7 snapshots');
      expect(infoSR).toMatch('1 snapshot updated in 1 test file');
      expect(infoSR).toMatch('1 obsolete snapshot removed');
      expect(infoSR).toMatch('7 tests passed');
      expect(infoSR).toMatch('7 total in 3 test suites, 6 snapshots');
    });
  });

});

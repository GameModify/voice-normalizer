const original = global.performance;
// Simulate polling time instead of depending on how fast the test machine runs.
function mockClock(t) {
  let time = 0;
  global.performance = { now: () => time };
  t?.after(() => {
    global.performance = original;
  });
  return (elapsed = 100) => {
    time += elapsed;
  };
}
module.exports = { mockClock };

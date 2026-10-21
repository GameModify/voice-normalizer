"use strict";

// A Discord promise cannot be aborted, but it must not own a polling slot forever.
// Resolve cancellation/timeouts locally and ignore any late underlying completion.
function createStatsRequest(connection, timeoutMs = 2000) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(
      () => finish(reject, new Error("Voice statistics timed out")),
      timeoutMs,
    );
    cancel = () => finish(resolve, null);
    try {
      Promise.resolve(connection.getStats()).then(
        (data) => finish(resolve, data),
        (error) => finish(reject, error),
      );
    } catch (error) {
      finish(reject, error);
    }
  });
  return { promise, cancel: () => cancel() };
}

module.exports = { createStatsRequest };

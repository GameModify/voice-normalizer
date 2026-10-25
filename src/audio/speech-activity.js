"use strict";

// Audio statistics do not identify speech with certainty. This deliberately
// conservative gate excludes isolated one- or two-poll events from the average.
const MIN_ACTIVITY_LEVEL = 0.0005;
const REQUIRED_ACTIVE_POLLS = 3;

function detectSpeech(state, level, detected) {
  const active = (detected === true || detected === 1) && level >= MIN_ACTIVITY_LEVEL;
  state.activityPolls = active ? Math.min(REQUIRED_ACTIVE_POLLS, state.activityPolls + 1) : 0;
  const confirmed = active && state.activityPolls >= REQUIRED_ACTIVE_POLLS;
  state.talking = confirmed;
  return { active, confirmed };
}

module.exports = { detectSpeech, MIN_ACTIVITY_LEVEL, REQUIRED_ACTIVE_POLLS };

const PREF_TYPES = {
  YESNO: 'YESNO',
  YESNOIFNEEDBE: 'YESNOIFNEEDBE',
};
// TODO: Move these enums somewhere accessible by other files like purge.js
const STATES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

const COLORS = {
  GREEN: 0x43B581,
  YELLOW: 0xFAA61A,
  RED: 0xF04747,
  GRAY: 0x848484,
};
const ANSWERED_THRESHOLDS = {
  GOOD: 0.9,
  MEDIUM: 0.6,
  BAD: 0.4,
};

const SHOW_EMOTES = true;
const EMOTES = {
  YES: ':white_check_mark:',
  NO: ':no_entry:',
  MAYBE: ':warning:',
  UNANSWERED: ':bangbang:',
  UNEXPECTED: ':question:',
};

const MAX_OPTIONS = 3;
const DISPLAY_OPTIONS = true;

// https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html
const LIMITS = {
  USERNAME: 32,
  CONTENT: 2000,
  EMBEDS: 10,
  FILE: 10,
  TITLE: 256,
  DESCRIPTION: 2048,
  AUTHOR_NAME: 256,
  FIELDS: 25,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FOOTER_TEXT: 2048,
  SUM_CHAR_IN_EMBED: 6000,
};

const formatDate = (date, timezone = 'UTC') => {
  const dateObj = new Date(date);
  const dateFormat = {
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  };
  return dateObj.toLocaleDateString('us', dateFormat);
};

const formatDateRange = (start, end, timezone = 'UTC') => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startFormat = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  };
  const endFormat = {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  };
  return `${startDate.toLocaleDateString('us', startFormat)} - ${endDate.toLocaleTimeString('us', endFormat)}`;
};

const formatOption = (option, participants, timezone) => {
  const optionTitle = option.allday
    ? formatDate(option.start, timezone)
    : formatDateRange(option.start, option.end, timezone);

  return `__${optionTitle}__ (${participants.length}): ${participants.join(', ')}\n`;
};

/**
 * Remove punctuation and extra characters from participant names
 *
 * @param {String} name name to clean
 */
const cleanName = (name) => name.replace(/[^A-Za-z\s]/g, '').trim();

/**
 * Replace participants names with normalized ones from expected aliases
 *
 * @param {Array} participants participants from api call
 */
const normalizeParticipants = (participants, expectedNames) => {
  const normalized = participants.map((participant) => {
    const { name } = participant;
    // find an alias list with a matching participant name
    const aliasList = expectedNames.find((aliases) => aliases
      .map((alias) => alias.toLowerCase())
      .includes(cleanName(name).toLowerCase()));
    // map current participant to participant with normalized name
    return {
      ...participant,
      name: aliasList && aliasList.length ? aliasList[0] : name,
    };
  });
  return normalized;
};

// eslint-disable-next-line arrow-body-style
const checkExpectedParticipants = (participants, expected) => {
  return expected.map((aliases) => {
    const cleanPartiNames = participants.map((parti) => parti.name.toLowerCase()).map(cleanName);
    return [
      aliases[0],
      aliases.reduce((acc, alias) => acc || cleanPartiNames.includes(alias.toLowerCase()), false),
    ];
  });
};

/**
 *
 * @param {Array} participants normalized participant list
 * @param {Array} expected array of alias arrays
 */
// eslint-disable-next-line arrow-body-style
const checkUnexpectedParticipants = (participants, expected) => {
  return participants.filter((participant) => { // eslint-disable-line arrow-body-style
    // reduce alias arrays into a true false if any contains this participant
    // return opposite of that to filter for unexpected names
    return !expected.reduce((acc, aliases) => { // eslint-disable-line arrow-body-style
      return acc || aliases.includes(participant.name);
    }, false);
  });
};

const generateYesField = (participants, options, preferencesType, timezone) => {
  let output = '';
  options.forEach((option, i) => {
    const filteredParticipants = participants.filter((parti) => {
      if (preferencesType === PREF_TYPES.YESNO) {
        return parti.preferences[i] === 1;
      }
      if (preferencesType === PREF_TYPES.YESNOIFNEEDBE) {
        return parti.preferences[i] === 2;
      }
      throw new Error(`Unknown preferencesType: ${preferencesType}`);
    }).map((parti) => parti.name).sort();
    output += formatOption(option, filteredParticipants, timezone);
  });
  if (output.length > LIMITS.FIELD_VALUE || options.length > MAX_OPTIONS) {
    output = 'Too many options to display, see full poll for results';
  }
  return {
    name: `${SHOW_EMOTES ? EMOTES.YES : ''} Yes`,
    value: output,
  };
};
const generateMaybeField = (participants, options, preferencesType, timezone) => {
  let output = '';
  options.forEach((option, i) => {
    const filteredParticipants = participants.filter((parti) => {
      if (preferencesType === PREF_TYPES.YESNO) {
        return false; // if not in Maybe preference Type mode filter ALL out
      }
      if (preferencesType === PREF_TYPES.YESNOIFNEEDBE) {
        return parti.preferences[i] === 1;
      }
      throw new Error(`Unknown preferencesType: ${preferencesType}`);
    }).map((parti) => parti.name).sort();
    output += formatOption(option, filteredParticipants, timezone);
  });
  if (output.length > LIMITS.FIELD_VALUE || options.length > MAX_OPTIONS) {
    output = 'Too many options to display, see full poll for results';
  }
  return {
    name: `${SHOW_EMOTES ? EMOTES.MAYBE : ''} Maybe`,
    value: output,
  };
};
const generateNoField = (participants, options, timezone) => {
  let output = '';
  options.forEach((option, i) => {
    const filteredParticipants = participants
      .filter((parti) => parti.preferences[i] === 0)
      .map((parti) => parti.name)
      .sort();
    output += formatOption(option, filteredParticipants, timezone);
  });
  if (output.length > LIMITS.FIELD_VALUE || options.length > MAX_OPTIONS) {
    output = 'Too many options to display, see full poll for results';
  }
  return {
    name: `${SHOW_EMOTES ? EMOTES.NO : ''} No`,
    value: output,
  };
};

/**
 * Convert doodle poll object to an embed for a discord webhook
 * see https://discohook.jaylineko.com/ for example structure
 *
 * @param {Doodle} doodle poll object from the doodle api
 */
module.exports.doodleToEmbed = (doodle, expectedNames) => {
  const {
    id,
    title,
    state,
    participants,
    initiator,
    participantsCount,
    preferencesType,
    options,
  } = doodle;

  const pollClosed = state === STATES.CLOSED;

  const normalizedParticipants = normalizeParticipants(participants, expectedNames);
  const names = normalizedParticipants.map((parti) => parti.name).sort();

  const fields = [];
  // Don't want to display options
  if (!DISPLAY_OPTIONS) {
    fields.push({
      name: 'All participants',
      value: names.join(', '),
    });
  }
  // Want to display options but too many
  else if (options.length > MAX_OPTIONS) {
    fields.push({
      name: `${SHOW_EMOTES ? EMOTES.YES : ''} Yes / ${SHOW_EMOTES ? EMOTES.NO : ''} No / ${SHOW_EMOTES ? EMOTES.MAYBE : ''} Maybe`,
      value: 'Too many options to display, see full poll for results',
    });
    fields.push({
      name: 'All participants',
      value: names.join(', '),
    });
  }
  // Want to display options
  else {
    const { timeZone } = initiator;
    fields.push(generateYesField(normalizedParticipants, options, preferencesType, timeZone));
    fields.push(generateNoField(normalizedParticipants, options, timeZone));
    fields.push(generateMaybeField(normalizedParticipants, options, preferencesType, timeZone));
  }

  // TODO: Add a Duplicates field. There are times someone answers twice and the participant count
  // is higher because of it but the number attending and whatnot are accurate. These people have
  // answered but we need to follow up to see which answer is the "real" answer

  // TODO: maybe change out things are shown for closed polls, not really waiting for responses
  // so don't really need the expected/unexpected

  // TODO: Add commands to toggle each field for a given server

  const expectedStatuses = checkExpectedParticipants(normalizedParticipants, expectedNames);
  const notAnswered = expectedStatuses.filter((status) => !status[1]).map((status) => status[0]);
  if (notAnswered.length) {
    fields.push({
      name: `${SHOW_EMOTES ? EMOTES.UNANSWERED : ''} **Unanswered**`,
      value: notAnswered.join(', '),
    });
  }

  const unexpectedNames = checkUnexpectedParticipants(normalizedParticipants, expectedNames);
  const unexpected = unexpectedNames.map((parti) => parti.name);
  if (unexpectedNames.length) {
    fields.push({
      name: `${SHOW_EMOTES ? EMOTES.UNEXPECTED : ''} **Unexpected**`,
      value: unexpected.join(', '),
    });
  }

  const ratioAnswered = (expectedStatuses.length - notAnswered.length) / expectedStatuses.length;
  let color = COLORS.GREEN;
  if (ratioAnswered < ANSWERED_THRESHOLDS.GOOD) {
    color = COLORS.YELLOW;
  }
  if (ratioAnswered < ANSWERED_THRESHOLDS.MEDIUM) {
    color = COLORS.RED;
  }
  if (pollClosed) {
    color = COLORS.GRAY;
  }
  // TODO: add a gray option for when a doodle is closed or other times.
  // when the poll is closed change the color scale to "percentage yes/maybe for final option"?

  return {
    title: `**${title}** ${pollClosed ? '(Closed)' : ''}`,
    url: `https://doodle.com/poll/${id}`,
    description: `${participantsCount} participants`,
    fields,
    color,
  };
};

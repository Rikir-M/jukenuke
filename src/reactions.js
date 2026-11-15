// The reactions people can give the song that's playing.

// The page builds its buttons from whatever the server sends back,
// so this list is the only place to change them.
const REACTION_EMOJIS = ['🔥', '❤️', '😂', '👏', '😴'];

// Who reacted with what is only needed while a song plays, so it lives
// on the current song as { emoji: Set<ip> } and is never saved — only
// the final counts are copied into history.
function newVoters() {
  const voters = {};

  REACTION_EMOJIS.forEach((emoji) => {
    voters[emoji] = new Set();
  });

  return voters;
}

function counts(voters) {
  const result = {};

  REACTION_EMOJIS.forEach((emoji) => {
    result[emoji] = voters[emoji].size;
  });

  return result;
}

function madeBy(voters, ip) {
  return REACTION_EMOJIS.filter((emoji) => voters[emoji].has(ip));
}

// Tapping again takes your vote back.
function toggle(voters, emoji, ip) {
  if (voters[emoji].has(ip)) {
    voters[emoji].delete(ip);
  } else {
    voters[emoji].add(ip);
  }
}

module.exports = { REACTION_EMOJIS, newVoters, counts, madeBy, toggle };

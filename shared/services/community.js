const DAILY_QUESTIONS = [
    'What is one small win you had this week?',
    'Which game could you play forever?',
    'What song belongs on the server playlist?',
    'What is a skill you would like to learn?',
    'Which fictional world would you visit for a day?',
    'What is your comfort food?',
    'What is the best advice you have received?',
    'Which app do you use every day?',
    'What is one goal you are working toward?',
    'What is an underrated movie or show everyone should see?',
    'What is your favorite way to spend a free evening?',
    'Which historical event would you witness in person?',
    'What is something that always makes you laugh?',
    'What is the most useful thing you own?',
    'What is a place you would love to visit?'
];

const WOULD_YOU_RATHER = [
    ['always have perfect internet', 'always have a fully charged phone'],
    ['be able to speak every language', 'be able to play every instrument'],
    ['live by the ocean', 'live in the mountains'],
    ['know the future', 'change one thing in the past'],
    ['have unlimited books', 'have unlimited games'],
    ['never need sleep', 'never need to eat'],
    ['be famous for your talent', 'be anonymous but wealthy'],
    ['travel through space', 'explore the deepest ocean'],
    ['always be ten minutes early', 'always be twenty minutes late'],
    ['have a pause button for life', 'have a rewind button for life']
];

const TRUTHS = [
    'What is a hobby you wish you had started earlier?',
    'What is the funniest thing you believed as a child?',
    'Which three people would you invite to a dream dinner?',
    'What is a small thing that instantly improves your mood?',
    'What is the most spontaneous thing you have done?',
    'Which fictional character do you relate to most?',
    'What is a talent people may not know you have?',
    'What is the last thing that made you laugh out loud?',
    'What is one habit you would like to break?',
    'What is a goal you have not told many people about?'
];

const DARES = [
    'Send the next message using only three words.',
    'Use a completely different nickname for the next ten minutes.',
    'Describe your day as if it were a movie trailer.',
    'Reply with the first five emojis in your recent emoji list.',
    'Write a compliment for the person above you.',
    'Share a song that matches your current mood.',
    'Tell the server your most-used word.',
    'Type one sentence with your eyes closed.',
    'Create a new catchphrase and use it once.',
    'Post a harmless hot take about your favorite game.'
];

function dayKey(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function dayNumber(date = new Date()) {
    return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

function stableIndex(seed, length) {
    let hash = 0;
    for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash) % length;
}

function getDailyQuestion(guildId, date = new Date()) {
    return DAILY_QUESTIONS[stableIndex(`${guildId}:${dayNumber(date)}`, DAILY_QUESTIONS.length)];
}

function getWouldYouRather(guildId, date = new Date()) {
    return WOULD_YOU_RATHER[stableIndex(`${guildId}:${dayNumber(date)}`, WOULD_YOU_RATHER.length)];
}

function getPrompt(list, guildId) {
    return list[stableIndex(`${guildId}:${Date.now()}:${Math.random()}`, list.length)];
}

async function updateStreak(db, guildId, userId) {
    const key = `community_streak_${guildId}_${userId}`;
    const current = await db.get(key) || { current: 0, best: 0, lastDay: null };
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 86400000));

    if (current.lastDay === today) return { ...current, claimedToday: false };

    const next = {
        current: current.lastDay === yesterday ? current.current + 1 : 1,
        best: Math.max(current.best || 0, current.lastDay === yesterday ? current.current + 1 : 1),
        lastDay: today
    };
    await db.set(key, next);
    return { ...next, claimedToday: true };
}

async function getCommunityStats(db, guildId, userId) {
    const streak = await db.get(`community_streak_${guildId}_${userId}`) || { current: 0, best: 0 };
    const points = Number(await db.get(`points_${guildId}_${userId}`)) || 0;
    const rep = Number(
        (await db.get(`rep_${guildId}_${userId}`)) ||
        0
    );
    return { streak, points, rep };
}

function getBadges({ streak, points, rep }) {
    const badges = [];
    if (streak.current >= 3) badges.push({ name: 'Daily Regular', description: 'Maintained a 3-day streak.' });
    if (streak.current >= 7) badges.push({ name: 'On Fire', description: 'Maintained a 7-day streak.' });
    if (streak.best >= 30) badges.push({ name: 'Community Constant', description: 'Reached a 30-day best streak.' });
    if (rep >= 5) badges.push({ name: 'Good Vibes', description: 'Received at least 5 reputation points.' });
    if (points >= 100) badges.push({ name: 'Point Collector', description: 'Collected at least 100 points.' });
    return badges;
}

module.exports = {
    DARES,
    TRUTHS,
    getBadges,
    getCommunityStats,
    getDailyQuestion,
    getPrompt,
    getWouldYouRather,
    updateStreak
};
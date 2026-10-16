import { prisma } from '../lib/prisma.js';


// ============================================================
// PRIVATE CONTENT PROTECTION
// ============================================================

const PRIVATE_KEYS = new Set([
    'answer',
    'answers',
    'correct',
    'iscorrect',
    'correctanswer',
    'correctanswers',
    'correctvalues',
    'correctorder',
    'expectedorder',
    'correctoptionid',
    'correctoptionids',
    'correctindex',
    'correctoptionindex',
    'correctoptionvalue',
    'correctvalue',
    'mapping',
    'solution',
    'explanation',
    'expectedmatches',
    'correctmatches'
]);

function normalizeKey(key) {
    return String(key)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function sanitizeContent(value) {
    if (Array.isArray(value)) {
        return value.map(sanitizeContent);
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => {
                return !PRIVATE_KEYS.has(normalizeKey(key));
            })
            .map(([key, item]) => [
                key,
                sanitizeContent(item)
            ])
    );
}

function sanitizeQuestionContent(value) {
    if (typeof value !== 'string') {
        return sanitizeContent(value);
    }

    try {
        const parsed = JSON.parse(value);

        if (parsed && typeof parsed === 'object') {
            return sanitizeContent(parsed);
        }
    } catch {
        // Pertahankan string biasa jika bukan JSON.
    }

    return value;
}


// ============================================================
// COMMON HELPERS
// ============================================================

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        message
    });
}

function getUserId(req) {
    return req.user?.id ??
        req.auth?.userId ??
        null;
}

function parseJson(value) {
    if (typeof value !== 'string') {
        return value ?? {};
    }

    try {
        const parsed = JSON.parse(value);

        return parsed &&
            typeof parsed === 'object'
            ? parsed
            : {};
    } catch {
        return {};
    }
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function publishedQuizWhere() {
    return {
        status: 'PUBLISHED',
        OR: [
            { scheduledAt: null },
            { scheduledAt: { lte: new Date() } }
        ]
    };
}

function getPagination(query) {
    const requestedPage = Number.parseInt(query.page, 10);
    const requestedLimit = Number.parseInt(query.limit, 10);

    const page = Number.isInteger(requestedPage) &&
        requestedPage > 0
        ? requestedPage
        : 1;

    const limit = Number.isInteger(requestedLimit) &&
        requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20;

    return { page, limit };
}


// ============================================================
// ANSWER NORMALIZATION
// ============================================================

function normalizeType(value) {
    const type = String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

    if ([
        'CHOICE',
        'SINGLE',
        'SINGLE_CHOICE',
        'SINGLE_SELECT'
    ].includes(type)) {
        return 'single_choice';
    }

    if ([
        'MULTIPLE',
        'MULTIPLE_CHOICE',
        'MULTI_SELECT'
    ].includes(type)) {
        return 'multiple_choice';
    }

    if ([
        'TRUE_FALSE',
        'TRUEFALSE',
        'BOOLEAN'
    ].includes(type)) {
        return 'true_false';
    }

    if ([
        'ORDER',
        'ORDERING',
        'SEQUENCE',
        'SEQUENCING'
    ].includes(type)) {
        return 'ordering';
    }

    if ([
        'MATCH',
        'MATCHING',
        'PAIRING'
    ].includes(type)) {
        return 'matching';
    }

    if ([
        'TEXT',
        'SHORT_TEXT',
        'SHORT_ANSWER'
    ].includes(type)) {
        return 'text';
    }

    if ([
        'CASE',
        'CASE_ANALYSIS',
        'CASE_STUDY'
    ].includes(type)) {
        return 'case_analysis';
    }

    return type.toLowerCase();
}

function unwrapToken(value) {
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value)
    ) {
        return value;
    }

    return value.value ??
        value.id ??
        value.optionId ??
        value.index ??
        value.answer ??
        value.label ??
        value.text ??
        value.title ??
        value;
}

function normalizeValue(value) {
    if (typeof value === 'string') {
        return value.trim().toLowerCase();
    }

    if (Array.isArray(value)) {
        return value.map(normalizeValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map(key => [
                    key,
                    normalizeValue(value[key])
                ])
        );
    }

    return value;
}

function answersEqual(first, second) {
    return JSON.stringify(normalizeValue(first)) ===
        JSON.stringify(normalizeValue(second));
}

function unorderedAnswersEqual(first, second) {
    if (
        !Array.isArray(first) ||
        !Array.isArray(second) ||
        first.length !== second.length
    ) {
        return false;
    }

    const a = first
        .map(item => JSON.stringify(normalizeValue(item)))
        .sort();

    const b = second
        .map(item => JSON.stringify(normalizeValue(item)))
        .sort();

    return JSON.stringify(a) === JSON.stringify(b);
}

function getExpectedAnswerTokens(answer) {
    if (answer === undefined || answer === null) {
        return [];
    }

    if (Array.isArray(answer)) {
        return answer;
    }

    if (typeof answer !== 'object') {
        return [answer];
    }

    const arrayKeys = [
        'correctValues',
        'correctOptionIds',
        'correctAnswers'
    ];

    for (const key of arrayKeys) {
        if (Array.isArray(answer[key])) {
            return answer[key];
        }
    }

    const scalarKeys = [
        'value',
        'correctValue',
        'optionId',
        'correctOptionId',
        'correctOptionIndex',
        'correctOption',
        'correctAnswer',
        'answer',
        'index',
        'correctIndex'
    ];

    for (const key of scalarKeys) {
        if (
            answer[key] !== undefined &&
            answer[key] !== null
        ) {
            return [answer[key]];
        }
    }

    return [];
}

function getSubmittedTokens(submitted) {
    if (Array.isArray(submitted)) {
        return submitted;
    }

    if (
        submitted &&
        typeof submitted === 'object'
    ) {
        const arrayKeys = [
            'selectedValues',
            'optionIds',
            'values',
            'answers',
            'selectedOptions'
        ];

        for (const key of arrayKeys) {
            if (Array.isArray(submitted[key])) {
                return submitted[key];
            }
        }

        const scalarKeys = [
            'selectedValue',
            'optionValue',
            'optionId',
            'value',
            'selectedIndex',
            'index',
            'answer'
        ];

        for (const key of scalarKeys) {
            if (
                submitted[key] !== undefined &&
                submitted[key] !== null
            ) {
                return [submitted[key]];
            }
        }

        return [];
    }

    return submitted === undefined ||
        submitted === null
        ? []
        : [submitted];
}


// ============================================================
// OPTION HELPERS
// ============================================================

function optionCandidates(option, index) {
    return [
        option?.value,
        option?.id,
        option?.label,
        option?.text,
        String(index),
        index,
        String.fromCharCode(65 + index)
    ].filter(value => value !== undefined && value !== null);
}

function sameToken(first, second) {
    const a = unwrapToken(first);
    const b = unwrapToken(second);

    if (a === undefined || a === null ||
        b === undefined || b === null) {
        return false;
    }

    return String(a).trim().toLowerCase() ===
        String(b).trim().toLowerCase();
}

function resolveOptionIndex(options, token) {
    return asArray(options).findIndex(
        (option, index) => {
            return optionCandidates(option, index)
                .some(candidate => sameToken(candidate, token));
        }
    );
}

function getSelectedOptionIndices(question, submitted) {
    return getSubmittedTokens(submitted)
        .map(token => resolveOptionIndex(
            question.options,
            token
        ));
}

function getExpectedOptionIndices(question) {
    return getExpectedAnswerTokens(question.answer)
        .map(token => resolveOptionIndex(
            question.options,
            token
        ));
}


// ============================================================
// CHOICE GRADING
// ============================================================

function gradeSingleChoice(question, submitted) {
    const options = asArray(question.options);

    const selected = getSelectedOptionIndices(
        question,
        submitted
    );

    if (selected.length !== 1 || selected[0] < 0) {
        return false;
    }

    const correctOptions = options
        .map((option, index) => (
            option.isCorrect === true ? index : -1
        ))
        .filter(index => index >= 0);

    if (correctOptions.length > 0) {
        return selected[0] === correctOptions[0] &&
            correctOptions.length === 1;
    }

    const expected = getExpectedOptionIndices(question);

    if (expected.length > 0) {
        return expected.length === 1 &&
            expected[0] >= 0 &&
            selected[0] === expected[0];
    }

    return answersEqual(
        getSubmittedTokens(submitted)[0],
        question.answer
    );
}

function gradeMultipleChoice(question, submitted) {
    const options = asArray(question.options);

    const selected = getSelectedOptionIndices(
        question,
        submitted
    );

    if (
        selected.length === 0 ||
        selected.some(index => index < 0) ||
        new Set(selected).size !== selected.length
    ) {
        return false;
    }

    const correctOptions = options
        .map((option, index) => (
            option.isCorrect === true ? index : -1
        ))
        .filter(index => index >= 0);

    if (correctOptions.length > 0) {
        return unorderedAnswersEqual(
            selected,
            correctOptions
        );
    }

    const expected = getExpectedOptionIndices(question);

    if (
        expected.length > 0 &&
        expected.every(index => index >= 0)
    ) {
        return unorderedAnswersEqual(
            selected,
            expected
        );
    }

    return unorderedAnswersEqual(
        getSubmittedTokens(submitted),
        getExpectedAnswerTokens(question.answer)
    );
}

function normalizeBoolean(value) {
    const token = unwrapToken(value);

    if (typeof token === 'boolean') {
        return token;
    }

    if (typeof token === 'number') {
        if (token === 1) return true;
        if (token === 0) return false;
    }

    if (typeof token === 'string') {
        const normalized = token.trim().toLowerCase();

        if ([
            'true',
            'benar',
            'yes',
            'ya',
            '1'
        ].includes(normalized)) {
            return true;
        }

        if ([
            'false',
            'salah',
            'no',
            'tidak',
            '0'
        ].includes(normalized)) {
            return false;
        }
    }

    return null;
}

function gradeTrueFalse(question, submitted) {
    const submittedToken = getSubmittedTokens(submitted)[0];
    const actual = normalizeBoolean(submittedToken);

    if (actual === null) {
        return false;
    }

    const correctOptions = asArray(question.options)
        .filter(option => option.isCorrect === true);

    if (correctOptions.length === 1) {
        const correctValue = normalizeBoolean(
            correctOptions[0].value
        );

        if (correctValue !== null) {
            return actual === correctValue;
        }
    }

    const expectedToken = getExpectedAnswerTokens(
        question.answer
    )[0];

    const expected = normalizeBoolean(expectedToken);

    return expected !== null && actual === expected;
}


// ============================================================
// ORDERING HELPERS
// ============================================================

function itemCandidates(item, index) {
    if (
        item &&
        typeof item === 'object' &&
        !Array.isArray(item)
    ) {
        return [
            item.value,
            item.id,
            item.index,
            item.label,
            item.text,
            item.title,
            String(index),
            index
        ].filter(value => value !== undefined && value !== null);
    }

    return [
        String(index),
        index,
        item
    ].filter(value => value !== undefined && value !== null);
}

function resolveItemIndex(token, items) {
    const value = unwrapToken(token);

    if (
        Number.isInteger(value) &&
        value >= 0 &&
        value < items.length
    ) {
        return value;
    }

    const index = items.findIndex(
        (item, itemIndex) => {
            return itemCandidates(item, itemIndex)
                .some(candidate => sameToken(candidate, value));
        }
    );

    if (index >= 0) {
        return index;
    }

    if (
        typeof value === 'string' &&
        /^\d+$/.test(value)
    ) {
        const numeric = Number(value);

        if (numeric >= 0 && numeric < items.length) {
            return numeric;
        }
    }

    return -1;
}

function gradeOrdering(question, submitted) {
    const content = parseJson(question.content);
    const items = asArray(content.items);

    const answer = question.answer;

    const expected = Array.isArray(answer)
        ? answer
        : answer?.order ??
          answer?.sequence ??
          answer?.correctOrder ??
          answer?.items ??
          answer?.correctValues ??
          [];

    const payload = (
        submitted &&
        typeof submitted === 'object' &&
        !Array.isArray(submitted)
    )
        ? submitted
        : { submittedOrder: submitted };

    const actual = payload.submittedOrder ??
        payload.order ??
        payload.sequence;

    if (
        !Array.isArray(actual) ||
        !Array.isArray(expected) ||
        !items.length ||
        actual.length !== items.length ||
        expected.length !== items.length
    ) {
        return false;
    }

    const actualIndices = actual.map(
        token => resolveItemIndex(token, items)
    );

    const expectedIndices = expected.map(
        token => resolveItemIndex(token, items)
    );

    if (
        actualIndices.some(index => index < 0) ||
        expectedIndices.some(index => index < 0)
    ) {
        return false;
    }

    if (
        new Set(actualIndices).size !== items.length ||
        new Set(expectedIndices).size !== items.length
    ) {
        return false;
    }

    return actualIndices.every(
        (index, position) => index === expectedIndices[position]
    );
}


// ============================================================
// MATCHING HELPERS
// ============================================================

function buildExpectedMatches(question, leftItems, rightItems) {
    const answer = question.answer;

    const pairs = answer?.pairs ??
        answer?.matches ??
        answer?.mapping ??
        answer;

    const result = {};

    if (Array.isArray(pairs)) {
        pairs.forEach((pair, index) => {
            if (
                typeof pair === 'string' ||
                typeof pair === 'number'
            ) {
                const rightIndex = resolveItemIndex(
                    pair,
                    rightItems
                );

                if (rightIndex >= 0 && index < leftItems.length) {
                    result[index] = rightIndex;
                }

                return;
            }

            if (pair && typeof pair === 'object') {
                const left = resolveItemIndex(
                    pair.leftIndex ?? pair.left ?? pair.from ?? index,
                    leftItems
                );

                const right = resolveItemIndex(
                    pair.rightIndex ?? pair.right ?? pair.to,
                    rightItems
                );

                if (left >= 0 && right >= 0) {
                    result[left] = right;
                }
            }
        });

        return result;
    }

    if (pairs && typeof pairs === 'object') {
        for (const [leftToken, rightToken] of Object.entries(pairs)) {
            const left = resolveItemIndex(leftToken, leftItems);
            const right = resolveItemIndex(rightToken, rightItems);

            if (left >= 0 && right >= 0) {
                result[left] = right;
            }
        }
    }

    return result;
}

function buildSubmittedMatches(value, leftItems, rightItems) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    const pairs = value.pairs ?? value.matches ?? value;

    const result = {};

    if (Array.isArray(pairs)) {
        pairs.forEach((pair, index) => {
            if (!pair || typeof pair !== 'object') {
                return;
            }

            const left = resolveItemIndex(
                pair.leftIndex ?? pair.left ?? pair.from ?? index,
                leftItems
            );

            const right = resolveItemIndex(
                pair.rightIndex ?? pair.right ?? pair.to,
                rightItems
            );

            if (left >= 0 && right >= 0) {
                result[left] = right;
            }
        });

        return result;
    }

    if (pairs && typeof pairs === 'object') {
        for (const [leftToken, rightToken] of Object.entries(pairs)) {
            const left = resolveItemIndex(leftToken, leftItems);
            const right = resolveItemIndex(rightToken, rightItems);

            if (left >= 0 && right >= 0) {
                result[left] = right;
            }
        }
    }

    return result;
}

function gradeMatching(question, submitted) {
    const content = parseJson(question.content);

    const leftItems = asArray(content.left);
    const rightItems = asArray(content.right);

    if (
        leftItems.length === 0 ||
        rightItems.length === 0 ||
        leftItems.length !== rightItems.length
    ) {
        return false;
    }

    const expected = buildExpectedMatches(
        question,
        leftItems,
        rightItems
    );

    const actual = buildSubmittedMatches(
        submitted,
        leftItems,
        rightItems
    );

    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);

    if (
        expectedKeys.length !== leftItems.length ||
        actualKeys.length !== leftItems.length ||
        new Set(Object.values(actual)).size !== rightItems.length
    ) {
        return false;
    }

    return expectedKeys.every(
        key => expected[key] === actual[key]
    );
}


// ============================================================
// TEXT ANSWER
// ============================================================

function gradeText(question, submitted) {
    const submittedTokens = getSubmittedTokens(submitted);

    if (submittedTokens.length !== 1) {
        return false;
    }

    const actual = normalizeValue(
        unwrapToken(submittedTokens[0])
    );

    const expected = getExpectedAnswerTokens(
        question.answer
    ).map(value => normalizeValue(unwrapToken(value)));

    return expected.some(value => answersEqual(value, actual));
}


// ============================================================
// QUESTION GRADING DISPATCHER
// ============================================================

function gradeQuestion(question, submitted) {
    const type = normalizeType(question.type);

    switch (type) {
        case 'single_choice':
            return gradeSingleChoice(question, submitted);

        case 'multiple_choice':
            return gradeMultipleChoice(question, submitted);

        case 'true_false':
            return gradeTrueFalse(question, submitted);

        case 'ordering':
            return gradeOrdering(question, submitted);

        case 'matching':
            return gradeMatching(question, submitted);

        case 'text':
            return gradeText(question, submitted);

        case 'case_analysis':
            return asArray(question.options).length > 0
                ? gradeSingleChoice(question, submitted)
                : gradeText(question, submitted);

        default:
            return gradeText(question, submitted);
    }
}


// ============================================================
// ATTEMPT HELPERS
// ============================================================

function buildAnswerResult({
    attemptId,
    question,
    savedAnswer,
    submitted
}) {
    return {
        attemptId,
        questionId: question.id,
        type: normalizeType(question.type),
        correct: savedAnswer.correct,
        isCorrect: savedAnswer.correct,
        points: savedAnswer.pointsAwarded,
        pointsAwarded: savedAnswer.pointsAwarded,
        earnedPoints: savedAnswer.pointsAwarded,
        answer: savedAnswer.answer ?? submitted,
        explanation: ''
    };
}

function summarizeAttempt(attempt) {
    const questions = asArray(attempt.quiz?.questions);
    const answers = asArray(attempt.answers);

    const totalQuestions = questions.length;

    const correctCount = answers.filter(
        answer => answer.correct === true
    ).length;

    const score = answers.reduce(
        (total, answer) => {
            return total + Number(answer.pointsAwarded ?? 0);
        },
        0
    );

    const totalPoints = questions.reduce(
        (total, question) => {
            return total + Math.max(
                0,
                Number(question.points ?? 0)
            );
        },
        0
    );

    const percentage = attempt.completedAt
        ? Number(attempt.percentage ?? 0)
        : totalPoints > 0
            ? Math.round((score / totalPoints) * 100)
            : totalQuestions > 0
                ? Math.round((correctCount / totalQuestions) * 100)
                : 0;

    const passed = attempt.completedAt
        ? Boolean(attempt.passed)
        : percentage >= Number(attempt.quiz?.passingScore ?? 80);

    const xpEarned = correctCount *
        Number(attempt.quiz?.xpPerCorrect ?? 0);

    return {
        id: attempt.id,
        quizId: attempt.quizId,
        score: attempt.completedAt
            ? Number(attempt.score ?? 0)
            : score,
        percentage,
        passed,
        correctCount,
        totalQuestions,
        answeredCount: answers.length,
        xpEarned,
        xp: xpEarned,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        message: passed
            ? 'Selamat, kamu berhasil mencapai nilai minimum kuis.'
            : `Nilai kamu ${percentage}%. Nilai minimum kelulusan adalah ${attempt.quiz?.passingScore ?? 80}%.`
    };
}

async function findAttemptForUser(attemptId, userId) {
    return prisma.quizAttempt.findFirst({
        where: {
            id: attemptId,
            userId
        },
        include: {
            quiz: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    scheduledAt: true,
                    passingScore: true,
                    xpPerCorrect: true,
                    maxAttempts: true,
                    timeLimitSeconds: true,
                    showExplanation: true,
                    questions: {
                        select: {
                            id: true,
                            points: true
                        },
                        orderBy: {
                            order: 'asc'
                        }
                    }
                }
            },
            answers: {
                select: {
                    id: true,
                    questionId: true,
                    answer: true,
                    correct: true,
                    pointsAwarded: true,
                    createdAt: true
                }
            }
        }
    });
}


// ============================================================
// PUBLIC: LIST QUIZZES
// GET /api/quizzes?page=1&limit=20
// ============================================================

export async function publicListQuizzes(req, res) {
    try {
        const { page, limit } = getPagination(req.query);
        const where = publishedQuizWhere();

        const [quizzes, total] = await prisma.$transaction([
            prisma.quiz.findMany({
                where,
                select: {
                    id: true,
                    materialId: true,
                    title: true,
                    description: true,
                    passingScore: true,
                    xpPerCorrect: true,
                    timeLimitSeconds: true,
                    maxAttempts: true,
                    order: true,
                    publishedAt: true,
                    _count: {
                        select: {
                            questions: true
                        }
                    }
                },
                orderBy: [
                    { order: 'asc' },
                    { publishedAt: 'desc' }
                ],
                skip: (page - 1) * limit,
                take: limit
            }),

            prisma.quiz.count({ where })
        ]);

        const items = quizzes.map(({ _count, ...quiz }) => ({
            ...quiz,
            questionCount: _count.questions
        }));

        return res.status(200).json({
            success: true,
            data: {
                items,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('publicListQuizzes:', error);

        return sendError(
            res,
            500,
            'Gagal mengambil daftar kuis.'
        );
    }
}


// ============================================================
// PUBLIC: GET PUBLISHED QUIZ
// GET /api/quizzes/:quizId
//
// Jawaban benar, penjelasan, dan kolom answer tidak dikirim.
// ============================================================

export async function getPublishedQuiz(req, res) {
    try {
        const { quizId } = req.params;

        const quiz = await prisma.quiz.findFirst({
            where: {
                id: quizId,
                ...publishedQuizWhere()
            },
            select: {
                id: true,
                materialId: true,
                title: true,
                description: true,
                passingScore: true,
                xpPerCorrect: true,
                timeLimitSeconds: true,
                maxAttempts: true,
                order: true,
                publishedAt: true,
                questions: {
                    orderBy: {
                        order: 'asc'
                    },
                    select: {
                        id: true,
                        title: true,
                        question: true,
                        type: true,
                        content: true,
                        points: true,
                        order: true,
                        options: {
                            orderBy: {
                                order: 'asc'
                            },
                            select: {
                                id: true,
                                label: true,
                                value: true,
                                order: true
                            }
                        }
                    }
                }
            }
        });

        if (!quiz) {
            return sendError(
                res,
                404,
                'Kuis tidak ditemukan atau belum dipublikasikan.'
            );
        }

        const safeQuiz = {
            ...quiz,
            questions: quiz.questions.map(question => ({
                ...question,
                content: sanitizeQuestionContent(question.content)
            }))
        };

        return res.status(200).json({
            success: true,
            data: {
                quiz: safeQuiz
            }
        });
    } catch (error) {
        console.error('getPublishedQuiz:', error);

        return sendError(
            res,
            500,
            'Gagal mengambil detail kuis.'
        );
    }
}


// ============================================================
// PUBLIC: START QUIZ ATTEMPT
// POST /api/quizzes/:quizId/attempts
// ============================================================

export async function startQuizAttempt(req, res) {
    try {
        const userId = getUserId(req);
        const { quizId } = req.params;

        if (!userId) {
            return sendError(
                res,
                401,
                'Pengguna belum terautentikasi.'
            );
        }

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                status: true
            }
        });

        if (!user) {
            return sendError(
                res,
                403,
                'Profil pengguna tidak ditemukan.'
            );
        }

        if (user.status && user.status !== 'ACTIVE') {
            return sendError(
                res,
                403,
                'Akun pengguna tidak aktif.'
            );
        }

        const quiz = await prisma.quiz.findFirst({
            where: {
                id: quizId,
                ...publishedQuizWhere()
            },
            select: {
                id: true,
                title: true,
                passingScore: true,
                xpPerCorrect: true,
                maxAttempts: true,
                timeLimitSeconds: true,
                questions: {
                    select: {
                        id: true
                    },
                    orderBy: {
                        order: 'asc'
                    }
                }
            }
        });

        if (!quiz) {
            return sendError(
                res,
                404,
                'Kuis tidak ditemukan atau belum dipublikasikan.'
            );
        }

        if (quiz.questions.length === 0) {
            return sendError(
                res,
                409,
                'Kuis belum memiliki soal yang dapat dikerjakan.'
            );
        }

        if (
            quiz.maxAttempts !== null &&
            quiz.maxAttempts !== undefined
        ) {
            const attemptsUsed = await prisma.quizAttempt.count({
                where: {
                    userId,
                    quizId
                }
            });

            if (attemptsUsed >= quiz.maxAttempts) {
                return sendError(
                    res,
                    409,
                    'Batas percobaan untuk kuis ini sudah tercapai.'
                );
            }
        }

        const attempt = await prisma.quizAttempt.create({
            data: {
                userId,
                quizId,
                score: 0,
                percentage: 0,
                passed: false
            },
            select: {
                id: true,
                quizId: true,
                score: true,
                percentage: true,
                passed: true,
                startedAt: true,
                completedAt: true
            }
        });

        return res.status(201).json({
            success: true,
            message: 'Percobaan kuis berhasil dimulai.',
            data: {
                attempt: {
                    ...attempt,
                    totalQuestions: quiz.questions.length
                },
                quiz: {
                    id: quiz.id,
                    title: quiz.title,
                    passingScore: quiz.passingScore,
                    xpPerCorrect: quiz.xpPerCorrect,
                    timeLimitSeconds: quiz.timeLimitSeconds
                }
            }
        });
    } catch (error) {
        console.error('startQuizAttempt:', error);

        return sendError(
            res,
            500,
            'Gagal memulai kuis.'
        );
    }
}


// ============================================================
// PUBLIC: SUBMIT ANSWER
// POST /api/quizzes/attempts/:attemptId/answers
//
// Body:
// {
//   "questionId": "question_id",
//   "answer": "A"
// }
// ============================================================

export async function submitQuizAnswer(req, res) {
    try {
        const userId = getUserId(req);
        const { attemptId } = req.params;

        const questionId = req.body?.questionId ??
            req.body?.question_id;

        const answer = req.body?.answer;

        if (!userId) {
            return sendError(
                res,
                401,
                'Pengguna belum terautentikasi.'
            );
        }

        if (
            typeof questionId !== 'string' ||
            !questionId.trim()
        ) {
            return sendError(
                res,
                400,
                'questionId wajib diisi.'
            );
        }

        if (answer === undefined || answer === null) {
            return sendError(
                res,
                400,
                'Jawaban wajib dikirim.'
            );
        }

        const attempt = await findAttemptForUser(
            attemptId,
            userId
        );

        if (!attempt) {
            return sendError(
                res,
                404,
                'Percobaan kuis tidak ditemukan.'
            );
        }

        if (attempt.completedAt) {
            return sendError(
                res,
                409,
                'Percobaan kuis sudah selesai.'
            );
        }

        const timeLimit = Number(
            attempt.quiz.timeLimitSeconds ?? 0
        );

        const timeExpired = timeLimit > 0 &&
            Date.now() >
            attempt.startedAt.getTime() + timeLimit * 1000;

        if (timeExpired) {
            return sendError(
                res,
                408,
                'Waktu pengerjaan kuis telah habis.'
            );
        }

        const question = await prisma.question.findFirst({
            where: {
                id: questionId,
                quizId: attempt.quizId
            },
            include: {
                options: {
                    orderBy: {
                        order: 'asc'
                    },
                    select: {
                        id: true,
                        label: true,
                        value: true,
                        isCorrect: true,
                        order: true
                    }
                }
            }
        });

        if (!question) {
            return sendError(
                res,
                404,
                'Soal tidak ditemukan pada kuis ini.'
            );
        }

        const existing = await prisma.quizAnswer.findUnique({
            where: {
                attemptId_questionId: {
                    attemptId,
                    questionId
                }
            }
        });

        if (existing) {
            return res.status(200).json({
                success: true,
                message: 'Jawaban untuk soal ini sudah tersimpan.',
                data: {
                    result: buildAnswerResult({
                        attemptId,
                        question,
                        submitted: answer,
                        savedAnswer: existing
                    })
                }
            });
        }

        const correct = gradeQuestion(
            question,
            answer
        );

        const pointsAwarded = correct
            ? Math.max(0, Number(question.points ?? 0))
            : 0;

        const savedAnswer = await prisma.quizAnswer.create({
            data: {
                attemptId,
                questionId,
                answer,
                correct,
                pointsAwarded
            }
        });

        const result = buildAnswerResult({
            attemptId,
            question,
            submitted: answer,
            savedAnswer: {
                ...savedAnswer,
                correct,
                pointsAwarded
            }
        });

        if (!attempt.quiz.showExplanation) {
            result.explanation = '';
        } else {
            result.explanation = question.explanation ?? '';
        }

        return res.status(200).json({
            success: true,
            message: 'Jawaban berhasil dinilai.',
            data: {
                result
            }
        });
    } catch (error) {
        console.error('submitQuizAnswer:', error);

        // Jika dua request bersamaan menyimpan soal yang sama,
        // ambil jawaban yang sudah tersimpan.
        if (error?.code === 'P2002') {
            try {
                const userId = getUserId(req);
                const { attemptId } = req.params;
                const questionId = req.body?.questionId ??
                    req.body?.question_id;

                const savedAnswer = await prisma.quizAnswer.findUnique({
                    where: {
                        attemptId_questionId: {
                            attemptId,
                            questionId
                        }
                    }
                });

                const attempt = await findAttemptForUser(
                    attemptId,
                    userId
                );

                const question = await prisma.question.findFirst({
                    where: {
                        id: questionId,
                        quizId: attempt?.quizId
                    },
                    include: {
                        options: {
                            orderBy: {
                                order: 'asc'
                            }
                        }
                    }
                });

                if (savedAnswer && attempt && question) {
                    const result = buildAnswerResult({
                        attemptId,
                        question,
                        submitted: req.body?.answer,
                        savedAnswer
                    });

                    if (attempt.quiz.showExplanation) {
                        result.explanation = question.explanation ?? '';
                    }

                    return res.status(200).json({
                        success: true,
                        message: 'Jawaban untuk soal ini sudah tersimpan.',
                        data: {
                            result
                        }
                    });
                }
            } catch (recoveryError) {
                console.error(
                    'submitQuizAnswer recovery:',
                    recoveryError
                );
            }
        }

        return sendError(
            res,
            500,
            'Gagal menyimpan jawaban kuis.'
        );
    }
}


// ============================================================
// PUBLIC: COMPLETE QUIZ ATTEMPT
// POST /api/quizzes/attempts/:attemptId/complete
// ============================================================

export async function completeQuizAttempt(req, res) {
    try {
        const userId = getUserId(req);
        const { attemptId } = req.params;

        if (!userId) {
            return sendError(
                res,
                401,
                'Pengguna belum terautentikasi.'
            );
        }

        const attempt = await findAttemptForUser(
            attemptId,
            userId
        );

        if (!attempt) {
            return sendError(
                res,
                404,
                'Percobaan kuis tidak ditemukan.'
            );
        }

        if (attempt.completedAt) {
            return res.status(200).json({
                success: true,
                message: 'Hasil kuis sudah tersedia.',
                data: {
                    attempt: summarizeAttempt(attempt)
                }
            });
        }

        const totalQuestions = attempt.quiz.questions.length;

        const answeredQuestionIds = new Set(
            attempt.answers.map(item => item.questionId)
        );

        const timeLimit = Number(
            attempt.quiz.timeLimitSeconds ?? 0
        );

        const timeExpired = timeLimit > 0 &&
            Date.now() >
            attempt.startedAt.getTime() + timeLimit * 1000;

        if (
            answeredQuestionIds.size < totalQuestions &&
            !timeExpired
        ) {
            return sendError(
                res,
                409,
                'Selesaikan semua pertanyaan sebelum mengakhiri kuis.'
            );
        }

        const correctCount = attempt.answers.filter(
            item => item.correct === true
        ).length;

        const score = attempt.answers.reduce(
            (total, item) => {
                return total + Number(item.pointsAwarded ?? 0);
            },
            0
        );

        const totalPoints = attempt.quiz.questions.reduce(
            (total, question) => {
                return total + Math.max(
                    0,
                    Number(question.points ?? 0)
                );
            },
            0
        );

        const percentage = totalPoints > 0
            ? Math.round((score / totalPoints) * 100)
            : totalQuestions > 0
                ? Math.round((correctCount / totalQuestions) * 100)
                : 0;

        const passed = percentage >= Number(
            attempt.quiz.passingScore ?? 80
        );

        const completedAt = new Date();

        const updatedAttempt = await prisma.quizAttempt.update({
            where: {
                id: attemptId
            },
            data: {
                score,
                percentage,
                passed,
                completedAt
            },
            select: {
                id: true,
                quizId: true,
                score: true,
                percentage: true,
                passed: true,
                startedAt: true,
                completedAt: true
            }
        });

        const xpEarned = correctCount * Number(
            attempt.quiz.xpPerCorrect ?? 0
        );

        const summary = {
            ...updatedAttempt,
            correctCount,
            wrongCount: answeredQuestionIds.size - correctCount,
            totalQuestions,
            answeredCount: answeredQuestionIds.size,
            xpEarned,
            xp: xpEarned,
            message: passed
                ? 'Selamat, kamu berhasil mencapai nilai minimum kuis.'
                : `Nilai kamu ${percentage}%. Nilai minimum kelulusan adalah ${attempt.quiz.passingScore ?? 80}%.`
        };

        return res.status(200).json({
            success: true,
            message: 'Kuis berhasil diselesaikan.',
            data: {
                attempt: summary
            }
        });
    } catch (error) {
        console.error('completeQuizAttempt:', error);

        return sendError(
            res,
            500,
            'Gagal menyelesaikan kuis.'
        );
    }
}


// ============================================================
// PUBLIC: GET QUIZ ATTEMPT RESULT
// GET /api/quizzes/attempts/:attemptId
//
// Pengguna hanya dapat melihat attempt miliknya sendiri.
// ============================================================

export async function getQuizAttempt(req, res) {
    try {
        const userId = getUserId(req);
        const { attemptId } = req.params;

        if (!userId) {
            return sendError(
                res,
                401,
                'Pengguna belum terautentikasi.'
            );
        }

        const attempt = await prisma.quizAttempt.findFirst({
            where: {
                id: attemptId,
                userId
            },
            select: {
                id: true,
                quizId: true,
                score: true,
                percentage: true,
                passed: true,
                startedAt: true,
                completedAt: true,
                quiz: {
                    select: {
                        id: true,
                        title: true,
                        passingScore: true,
                        xpPerCorrect: true,
                        showExplanation: true,
                        questions: {
                            select: {
                                id: true,
                                points: true
                            },
                            orderBy: {
                                order: 'asc'
                            }
                        }
                    }
                },
                answers: {
                    select: {
                        id: true,
                        questionId: true,
                        answer: true,
                        correct: true,
                        pointsAwarded: true,
                        createdAt: true,
                        question: {
                            select: {
                                id: true,
                                title: true,
                                question: true,
                                type: true,
                                points: true,
                                explanation: true
                            }
                        }
                    }
                }
            }
        });

        if (!attempt) {
            return sendError(
                res,
                404,
                'Hasil percobaan tidak ditemukan.'
            );
        }

        const summary = summarizeAttempt(attempt);

        const answers = attempt.answers.map(item => ({
            id: item.id,
            questionId: item.questionId,
            answer: item.answer,
            correct: item.correct,
            pointsAwarded: item.pointsAwarded,
            createdAt: item.createdAt,
            question: {
                id: item.question.id,
                title: item.question.title,
                question: item.question.question,
                type: item.question.type,
                points: item.question.points,
                explanation: attempt.quiz.showExplanation
                    ? item.question.explanation
                    : ''
            }
        }));

        return res.status(200).json({
            success: true,
            data: {
                attempt: summary,
                quiz: {
                    id: attempt.quiz.id,
                    title: attempt.quiz.title,
                    passingScore: attempt.quiz.passingScore
                },
                answers
            }
        });
    } catch (error) {
        console.error('getQuizAttempt:', error);

        return sendError(
            res,
            500,
            'Gagal mengambil hasil pengerjaan kuis.'
        );
    }
}
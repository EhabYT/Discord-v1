/**
 * Request schema validation and sanitization middleware.
 *
 * SECURITY MODEL — reject unknown fields, enforce types, clamp sizes.
 *
 * The dashboard SPA is the only legitimate client; its requests are fully
 * predictable. Any unexpected field, wrong type, or oversized value is
 * rejected early — before it reaches route handlers, database queries, or
 * Discord API calls. This prevents:
 *
 *   - Prototype pollution via __proto__ or constructor keys
 *   - Injection through unexpected string fields
 *   - Memory exhaustion via oversized payloads
 *   - Type confusion attacks on numeric/boolean fields
 */



const SNOWFLAKE = /^\d{17,20}$/;
const SAFE_STRING_MAX = 2000;
const URL_MAX = 2048;

/**
 * Validate that req.body matches an expected schema.
 *
 * @param {Object} schema - Field definitions: { fieldName: { type, required, max, min, pattern, enum, custom } }
 * @param {Object} options - { allowUnknown: false, stripUnknown: true }
 */
function validateBody(schema, options = {}) {
    const { allowUnknown = false, stripUnknown = true } = options;

    return (req, res, next) => {
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({ error: 'Request body must be a JSON object', code: 'INVALID_BODY' });
        }

        const errors = [];
        const validated = {};

        // Check declared fields
        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];
            const result = validateField(field, value, rules);
            if (result.error) {
                errors.push(result.error);
            } else if (result.value !== undefined) {
                validated[field] = result.value;
            }
        }

        // Check for unknown fields
        if (!allowUnknown) {
            for (const key of Object.keys(req.body)) {
                if (!(key in schema)) {
                    if (stripUnknown) {
                        // Silently strip unknown fields
                    } else {
                        errors.push(`Unknown field: ${key}`);
                    }
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors.slice(0, 10), // Limit error count
            });
        }

        // Replace body with validated/sanitized version
        req.body = stripUnknown ? validated : req.body;
        return next();
    };
}

function validateField(name, value, rules) {
    const { type, required, max, min, pattern, enum: allowedValues, custom, trim } = rules;

    // Required check
    if (required && (value === undefined || value === null || value === '')) {
        return { error: `${name} is required` };
    }

    // Optional + absent = valid
    if (value === undefined || value === null) {
        return { value: undefined };
    }

    let validated = value;

    // Trim strings
    if (trim && typeof validated === 'string') {
        validated = validated.trim();
    }

    // Type validation
    if (type === 'string') {
        if (typeof validated !== 'string') {
            return { error: `${name} must be a string` };
        }
        // Prevent null bytes
        if (validated.includes('\0')) {
            return { error: `${name} contains invalid characters` };
        }
        // Length limits
        if (max && validated.length > max) {
            return { error: `${name} exceeds maximum length of ${max}` };
        }
        if (min && validated.length < min) {
            return { error: `${name} must be at least ${min} characters` };
        }
        // Pattern matching
        if (pattern && !pattern.test(validated)) {
            return { error: `${name} has an invalid format` };
        }
    } else if (type === 'number') {
        const num = Number(validated);
        if (isNaN(num) || !Number.isFinite(num)) {
            return { error: `${name} must be a valid number` };
        }
        validated = num;
        if (max !== undefined && num > max) {
            return { error: `${name} must be at most ${max}` };
        }
        if (min !== undefined && num < min) {
            return { error: `${name} must be at least ${min}` };
        }
    } else if (type === 'boolean') {
        if (typeof validated !== 'boolean') {
            // Accept string 'true'/'false'
            if (validated === 'true') validated = true;
            else if (validated === 'false') validated = false;
            else return { error: `${name} must be a boolean` };
        }
    } else if (type === 'array') {
        if (!Array.isArray(validated)) {
            return { error: `${name} must be an array` };
        }
        if (max && validated.length > max) {
            return { error: `${name} exceeds maximum items of ${max}` };
        }
    } else if (type === 'object') {
        if (typeof validated !== 'object' || Array.isArray(validated)) {
            return { error: `${name} must be an object` };
        }
        // Block prototype pollution keys
        if ('__proto__' in validated || 'constructor' in validated || 'prototype' in validated) {
            return { error: `${name} contains forbidden keys` };
        }
    }

    // Enum validation
    if (allowedValues && !allowedValues.includes(validated)) {
        return { error: `${name} must be one of: ${allowedValues.join(', ')}` };
    }

    // Custom validation
    if (custom) {
        const err = custom(validated);
        if (err) return { error: `${name}: ${err}` };
    }

    return { value: validated };
}

// Pre-built validators for common patterns

const validators = {
    snowflake: (_name = 'id') => ({
        type: 'string', required: true, pattern: SNOWFLAKE,
        custom: (v) => !SNOWFLAKE.test(v) ? 'Invalid ID format' : null,
    }),

    optionalSnowflake: (_name = 'id') => ({
        type: 'string', pattern: SNOWFLAKE,
        custom: (v) => v && !SNOWFLAKE.test(v) ? 'Invalid ID format' : null,
    }),

    safeString: (max = SAFE_STRING_MAX) => ({
        type: 'string', max, trim: true,
        custom: (v) => {
            if (v.includes('\r') || v.includes('\n')) return 'Cannot contain line breaks';
            return null;
        },
    }),

    reason: () => ({
        type: 'string', max: 512, trim: true,
        custom: (v) => {
            if (v && (v.includes('\r') || v.includes('\n'))) return 'Reason cannot contain line breaks';
            return null;
        },
    }),

    url: (max = URL_MAX) => ({
        type: 'string', max,
        custom: (v) => {
            try { const u = new URL(v); if (!['http:', 'https:'].includes(u.protocol)) return 'Only HTTP(S) URLs allowed'; }
            catch { return 'Invalid URL'; }
            return null;
        },
    }),

    duration: () => ({
        type: 'string',
        custom: (v) => {
            if (!v) return null;
            if (!/^\d+[smhdw]$/.test(v)) return 'Use format: 30s, 5m, 2h, 1d, 1w';
            return null;
        },
    }),

    email: () => ({
        type: 'string', max: 254,
        custom: (v) => {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Invalid email format';
            return null;
        },
    }),

    roleColor: () => ({
        type: 'string',
        custom: (v) => {
            if (!/^#?[0-9a-fA-F]{6}$/.test(v)) return 'Must be a hex color (e.g. #ff0000)';
            return null;
        },
    }),
};

// Middleware that validates guild ID from params
function validateGuildId(req, res, next) {
    const { guildId } = req.params;
    if (!guildId || !SNOWFLAKE.test(String(guildId))) {
        return res.status(404).json({ error: 'Server not found' });
    }
    next();
}

// Middleware that validates user ID from params or body
function validateUserId(paramName = 'userId') {
    return (req, res, next) => {
        const id = req.params[paramName] || req.body?.[paramName];
        if (!id || !SNOWFLAKE.test(String(id))) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        next();
    };
}

module.exports = {
    validateBody,
    validateField,
    validators,
    validateGuildId,
    validateUserId,
    SNOWFLAKE,
};

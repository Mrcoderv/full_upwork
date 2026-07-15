import { inputValidator } from "./security.js";

/**
 * Lightweight Zod-like request validator.
 * Validates req.body, req.query, or req.params against a custom schema.
 */
export const validate = (schema, target = "body") => {
    return (req, res, next) => {
        const data = req[target] || {};
        const errors = {};

        for (const [key, rules] of Object.entries(schema)) {
            const value = data[key];

            // 1. Required check
            if (rules.required && (value === undefined || value === null || value === "")) {
                errors[key] = `${key} is required`;
                continue;
            }

            // If value is provided, run other checks
            if (value !== undefined && value !== null && value !== "") {
                // 2. Type check
                if (rules.type && typeof value !== rules.type) {
                    errors[key] = `${key} must be of type ${rules.type}`;
                    continue;
                }

                // 3. String length checks
                if (rules.type === "string") {
                    if (rules.min && value.length < rules.min) {
                        errors[key] = `${key} must be at least ${rules.min} characters long`;
                        continue;
                    }
                    if (rules.max && value.length > rules.max) {
                        errors[key] = `${key} must be at most ${rules.max} characters long`;
                        continue;
                    }
                }

                // 4. Email check
                if (rules.email && !inputValidator.validateEmail(value)) {
                    errors[key] = `Invalid email format`;
                    continue;
                }

                // 5. Password check
                if (rules.password) {
                    const pwdValidation = inputValidator.validatePassword(value);
                    if (!pwdValidation.isValid) {
                        const firstError = Object.values(pwdValidation.errors).find((e) => e !== null);
                        errors[key] = firstError || `Password is too weak`;
                        continue;
                    }
                }

                // 6. MongoDB ObjectId check
                if (rules.objectId && !inputValidator.validateObjectId(value)) {
                    errors[key] = `Invalid ID format`;
                    continue;
                }

                // 7. Custom validation
                if (rules.custom) {
                    const customError = rules.custom(value);
                    if (customError) {
                        errors[key] = customError;
                        continue;
                    }
                }

                // Sanitization: sanitize input if it's a string
                if (rules.sanitize && typeof value === "string") {
                    data[key] = inputValidator.sanitizeInput(value);
                }
            }
        }

        if (Object.keys(errors).length > 0) {
            // For backward compatibility with existing tests, return specific Swedish message if required fields are missing
            const missingRequired = Object.entries(schema).some(
                ([k, r]) => r.required && (data[k] === undefined || data[k] === null || data[k] === "")
            );
            if (missingRequired) {
                return res.status(400).json({ message: "Alla fält är obligatoriska!" });
            }

            return res.status(400).json({
                success: false,
                message: "Validering misslyckades",
                details: errors,
            });
        }

        next();
    };
};

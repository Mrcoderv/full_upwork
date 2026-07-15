import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.development" });

if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "test-secret";
}

/**
 * Authentication Controller
 * Handles user registration, login, authentication, session, and logout.
 * Uses JWT for authentication and bcrypt for password hashing.
 */
export const register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const allowedRoles = ["admin", "user", "moderator"];
        const primaryRole = role && allowedRoles.includes(role) ? role : "user";
        const roles = [primaryRole];

        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
            roles,
        });

        console.log(
            `✅ User Registered: ${newUser.email} - Role: ${newUser.role}`
        );

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                roles: newUser.roles,
            },
        });
    } catch (error) {
        console.error("❌ Error registering user:", error);
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * Logs in a user and sets a JWT token cookie.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log(`[LOGIN] Attempting login for email: ${email}`);
        
        const user = await User.findOne({ email });
        if (!user) {
            console.log(`[LOGIN] ❌ User not found for email: ${email}`);
            return res.status(401).json({ error: "Fel email eller lösenord" });
        }

        console.log(`[LOGIN] ✅ User found: ${user.username || user.email} (ID: ${user._id})`);
        console.log(`[LOGIN] User has password: ${!!user.password}`);
        console.log(`[LOGIN] User roles: ${JSON.stringify(user.roles || [])}`);

        if (!user.password) {
            console.log(`[LOGIN] ❌ User has no password set`);
            return res.status(401).json({ error: "Fel email eller lösenord" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`[LOGIN] Password match: ${isMatch}`);
        
        if (!isMatch) {
            console.log(`[LOGIN] ❌ Password mismatch for user: ${user.username || user.email}`);
            return res.status(401).json({ error: "Fel email eller lösenord" });
        }

        const tokenPayload = {
            userId: user._id,
            roles: user.roles,
            role: user.role,
            name: user.name,
            email: user.email,
        };

        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Ensure role is always set from roles array (for backward compatibility)
        const primaryRole = user.roles && user.roles.length > 0 ? user.roles[0] : (user.role || 'guest');
        
        res.json({
            message: "Login successful",
            user: {
                userId: user._id, // ✅ Standard key
                name: user.name || user.username || "",
                email: user.email,
                role: primaryRole,
                roles: user.roles || [],
            },
        });
    } catch (error) {
        console.error("❌ Error logging in:", error);
        res.status(500).json({ error: "Server error" });
    }
};

/**
 * Middleware to authenticate a user using JWT from cookie or Authorization header.
 * Sets req.user and req.userId if valid.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const authenticateUser = (req, res, next) => {
    if (req.user) {
        req.userId = req.userId || req.user.userId || req.user._id || req.user.id;
        return next();
    }
    let token = req.cookies?.token;

    if (!token) {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        return res.status(401).json({ error: "Ingen giltig token angiven." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const roles = decoded.roles || (decoded.role ? [decoded.role] : []);
        const userWithRoles = {
            ...decoded,
            roles,
            role: decoded.role || (roles[0] ?? null),
        };

        // 🛠 Set full decoded user with fallback `id`
        req.user = userWithRoles;
        req.userId = userWithRoles.userId;

        if (!req.userId) {
            return res
                .status(401)
                .json({ error: "Autentisering saknas (No userId in token)." });
        }

        next();
    } catch (error) {
        console.error("❌ JWT verification error:", error.message);
        return res.status(401).json({ error: "Ogiltig token." });
    }
};

/**
 * Logs out the user by clearing the token cookie.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const logout = async (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
    });

    res.json({ message: "Logout successful" });
};

/**
 * Gets the current session user if a valid token is present.
 * @async
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
export const getSession = async (req, res) => {
    console.log("🔹 Incoming Session Request...");
    console.log("🔍 Cookies Received:", req.cookies);

    const token = req.cookies.token || req.cookies.authToken;

    if (!token) {
        console.log("❌ No valid token found.");
        return res.status(401).json({ error: "No active session" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("✅ Decoded JWT:", decoded);

        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
            console.log("❌ User not found in DB");
            return res.status(404).json({ error: "User not found" });
        }

        // Ensure role is always set from roles array (for backward compatibility)
        const primaryRole = user.roles && user.roles.length > 0 ? user.roles[0] : (user.role || 'guest');
        
        res.json({
            user: {
                userId: user._id, // ✅ Match login response
                name: user.name,
                email: user.email,
                role: primaryRole,
                roles: user.roles || [],
            },
        });
    } catch (error) {
        console.error("❌ Invalid session:", error);
        res.status(403).json({ error: "Invalid session" });
    }
};

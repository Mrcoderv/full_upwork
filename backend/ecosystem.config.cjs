module.exports = {
    apps: [
        {
            name: "ML-Backend",
            script: "./index.js",
            instances: "max",
            exec_mode: "cluster",
            env: {
                NODE_ENV: "development",
                PORT: 5001,
            },
            env_production: {
                NODE_ENV: "production",
                PORT: 5001,
                MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/mindfullearning",
                JWT_SECRET: process.env.JWT_SECRET,
                GOOGLE_PWD: process.env.GOOGLE_PWD,
                CLIENT_URL: process.env.CLIENT_URL || "https://mindfullearning.se",
                ALLOWED_ORIGINS: "https://mindfullearning.se,https://www.mindfullearning.se,http://localhost:5173",
            },
        },
    ],
};

import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer;
let testUri = "";

export const connectTestDatabase = async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    mongoServer = await MongoMemoryServer.create();
    testUri = mongoServer.getUri();
    await mongoose.connect(testUri);
    return testUri;
};

export const disconnectTestDatabase = async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    }
    if (mongoServer) {
        await mongoServer.stop();
        mongoServer = null;
    }
    testUri = "";
};

export const getTestMongoUri = () => {
    return testUri;
};

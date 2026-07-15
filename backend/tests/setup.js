import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bson = require("bson");

// MongoDB driver expects BSON.onDemand to expose NumberUtils/ByteUtils, but bson@7
// only includes parseToElements. Patch the exported BSON object before the driver loads.
if (bson.BSON && bson.BSON.onDemand) {
    if (!bson.BSON.onDemand.NumberUtils && bson.NumberUtils) {
        bson.BSON.onDemand.NumberUtils = bson.NumberUtils;
    }
    if (!bson.BSON.onDemand.ByteUtils && bson.ByteUtils) {
        bson.BSON.onDemand.ByteUtils = bson.ByteUtils;
    }
}

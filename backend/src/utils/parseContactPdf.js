import logger from "./logger.js";

function parseContactPdf(text) {
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);

    let result = {
        personnummer: "",
        namn: "",
        adress: "",
        email: "",
        telefon: "",
        föredragna_kontaktsätt: [],
        kurser: [],
        totalt_poäng: "",
    };

    let i = 0;
    let tot = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith("Personnummer")) {
            result["personnummer"] = lines[i + 1] || "";
            i++;
        } else if (line.startsWith("Namn")) {
            result["namn"] = lines[i + 1] || "";
            i++;
        } else if (line.startsWith("Adress")) {
            result["adress"] = `${lines[i + 1] || ""}, ${lines[i + 2] || ""}`;
            i += 2;
        } else if (line.startsWith("E-postadress")) {
            result["email"] = lines[i + 1] || "";
            i++;
        } else if (line.startsWith("Telefonnummer")) {
            result["telefon"] = lines[i + 1] || "";
            i++;
        } else if (line.startsWith("Föredragna kontaktsätt")) {
            result["föredragna_kontaktsätt"] = [];
            while (
                i + 1 < lines.length &&
                !lines[i + 1].startsWith("Sökta kurser")
            ) {
                let contact = lines[i + 1].trim();
                if (!contact.includes("_")) {
                    result["föredragna_kontaktsätt"].push(contact);
                }
                i++;
            }
        } else if (line.startsWith("Sökta kurser")) {
            result["kurser"] = [];
            i++;
            logger.debug("Detected 'Sökta kurser' section");

            while (i < lines.length) {
                logger.debug({ line: lines[i] }, "Processing line in course loop");

                // Match course name and points

                let courseMatch = lines[i].match(
                    /^[0-9]+\.\s(.+),\s([0-9]+)\spoäng/
                );
                logger.debug({ courseMatch }, "Course regex match result");
                if (courseMatch) {
                    let courseName = courseMatch[1];
                    logger.debug({ courseName }, "Parsed course name");
                    let coursePoints = courseMatch[2];
                    logger.debug({ coursePoints }, "Parsed course points");

                    // Ensure next line contains course details
                    let nextLine = lines[i + 1]?.trim();
                    logger.debug({ nextLine }, "Details line");
                    logger.debug({ match: nextLine.match(/^[0-9]+\./) }, "Next line match");

                    if (nextLine && nextLine.match(/^[0-9]+\./)) {
                        logger.debug("Detail line matched");
                        let details = nextLine.split(",").map((d) => d.trim());
                        let Dates = details[0].slice(2).split(" ");
                        let startDate = Dates[0];
                        let endDate = Dates[2];
                        logger.debug({ count: details.length, details }, "Course details parsed");
                        if (details.length >= 5) {
                            let courseObj = {
                                namn: courseName,
                                poäng: coursePoints,
                                start: startDate || "",
                                slut: endDate || "",
                                veckor: details[1] || "",
                                skola: details[2] || "",
                                studieform: details[3] || "",
                                kod: details[4] || "",
                            };
                            tot += Number(coursePoints);
                            logger.debug({ totalPoints: tot }, "Running total");
                            logger.debug({ course: courseObj }, "Adding course");
                            result["kurser"].push(courseObj);
                            i++; // Move past course details
                        } else {
                            logger.debug({ details }, "Skipping course due to missing details");
                        }
                    }
                }

                i++; // Move to the next potential course
            }
        } else if (line.startsWith("Totalt antal sökta poäng")) {
            logger.debug("Processed total points section");
            result["totalt_poäng"] = lines[i + 1]?.replace("poäng", "").trim();
            i++;
        }

        i++;
    }
    result["totalt_poäng"] = tot;
    return result;
}

export { parseContactPdf };

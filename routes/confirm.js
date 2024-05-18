const express = require("express");
const router = express.Router();
const db = require("../db");
const authMember = require("../middlewares/authmember");

//확정권한 있는 사람만 확정하기 가능(비회원인 경우 전체 허용일 경우만 가능 회원은 memberjoin 내 권한으로 확인)
//confirmed table에 promiseId, place, notice 넣어서 만든 후 confirmedtime table에도 시간 추가
router.post("/add", authMember, async (req, res) => {
    const { promiseId, place, notice } = req.body;

    try {
        // promise 테이블에서 weekvsdate, ampmvstime 값 가져오기
        const [promiseSettings] = await db.promise().query(`
            SELECT weekvsdate, ampmvstime, start_time, end_time, canallconfirm
            FROM promise WHERE promise_id = ${promiseId};
        `);

        // 이미 확정된 약속인지 확인
        const [existingConfirmation] = await db.promise().query(
            `
            SELECT id FROM confirmed WHERE promise_id = ?;
        `,
            [promiseId]
        );

        if (existingConfirmation.length > 0) {
            return res.status(400).json({
                statusCode: 4001,
                message: "this promise has already been confirmed.",
            });
        }

        const { weekvsdate, ampmvstime, start_time, end_time, canallconfirm } =
            promiseSettings[0];
        // 권한 확인
        let memberPermission = [];
        if (req.isMember === true) {
            memberPermission = await db.promise().query(
                `
                SELECT canconfirm
                FROM memberjoin
                WHERE member_id = ? AND promise_id = ?
            `,
                [req.memberId, promiseId]
            );

            if (memberPermission[0].length === 0) {
                return res.status(403).json({
                    statusCode: 4033,
                    message: "no member found in this promise.",
                });
            } else if (memberPermission[0][0].canconfirm !== "T") {
                return res.status(403).json({
                    statusCode: 4034,
                    message:
                        "you do not have permission to confirm this promise as member.",
                });
            }
        } else if (req.isMember === false) {
            if (canallconfirm !== "T") {
                return res.status(403).json({
                    statusCode: 4035,
                    message:
                        "you do not have permission to confirm this promise as nonmember.",
                });
            }
        }

        // confirmed 테이블에 정보 추가
        const [result] = await db.promise().query(
            `
            INSERT INTO confirmed (promise_id, confirmed_place, confirmed_notice)
            VALUES (?, ?, ?)
        `,
            [promiseId, place, notice]
        );

        const confirmedId = result.insertId;
        console.log(confirmedId);

        if (weekvsdate === "W" && ampmvstime === "F") {
            const correctString = [
                "SUN",
                "MON",
                "TUE",
                "WED",
                "THU",
                "FRI",
                "SAT",
            ];
            const weekAvailable = req.body.weekAvailable;

            for (let weekday of weekAvailable) {
                if (correctString.includes(weekday)) {
                    await db.promise().query(
                        `
                        INSERT INTO confirmedtime (confirmed_id, week_confirmed)
                        VALUES (?, ?)
                    `,
                        [confirmedId, weekday]
                    );
                } else {
                    return res.status(400).json({
                        statusCode: 1750,
                        message: "wrong weekday string",
                    });
                }
            }
            return res.status(201).json({
                message: "time confirmed successfully",
            });
        } else if (weekvsdate === "D" && ampmvstime === "F") {
            // 해당 promise_id에 해당하는 datetomeet 값 가져오기
            const dateAvailable = req.body.dateAvailable;
            const [validDates] = await db.promise().query(`
                SELECT datetomeet FROM promisedate WHERE promise_id = ${promiseId}
            `);
            const validDatesArray = validDates.map((item) => {
                const date = new Date(item.datetomeet);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth()는 0부터 시작하므로 1을 더함
                const day = String(date.getDate()).padStart(2, "0");
                return `${year}-${month}-${day}`;
            });
            for (let date of dateAvailable) {
                if (validDatesArray.includes(date)) {
                    await db.promise().query(
                        `
                        INSERT INTO confirmedtime (confirmed_id, date_confirmed)
                        VALUES (?, ?)
                    `,
                        [confirmedId, date]
                    );
                } else {
                    return res.status(400).json({
                        statusCode: 1751,
                        message: "date out of range of promise",
                    });
                }
            }
            return res.status(201).json({
                message: "time confirmed successfully",
            });
        } else if (weekvsdate === "W" && ampmvstime === "T") {
            const weekTimeAvailable = req.body.weekTimeAvailable;
            const correctString = [
                "SUN",
                "MON",
                "TUE",
                "WED",
                "THU",
                "FRI",
                "SAT",
            ];
            for (let weekdaytime of weekTimeAvailable) {
                const [weekday, startTime, endTime] = weekdaytime.split(" ");
                if (correctString.includes(weekday)) {
                    if (startTime >= start_time && endTime <= end_time) {
                        const [timeSlot] = await db.promise().query(`
                            SELECT id FROM timeslot 
                            WHERE start_time = '${startTime}' AND end_time = '${endTime}'
                        `);
                        const timeId = timeSlot[0]?.id;
                        if (timeId) {
                            await db.promise().query(
                                `
                                INSERT INTO confirmedtime (confirmed_id, week_confirmed, time_id)
                                VALUES (?, ?, ?)
                            `,
                                [confirmedId, weekday, timeId]
                            );
                        } else {
                            return res.status(400).json({
                                statusCode: 1752,
                                message: "wrong time id",
                            });
                        }
                    } else {
                        return res.status(400).json({
                            statusCode: 1753,
                            message: "wrong time range",
                        });
                    }
                } else {
                    return res.status(400).json({
                        statusCode: 1750,
                        message: "wrong weekday string",
                    });
                }
            }
            return res.status(201).json({
                message: "time confirmed successfully",
            });
        } else if (weekvsdate === "D" && ampmvstime === "T") {
            const dateTimeAvailable = req.body.dateTimeAvailable;
            const [validDates] = await db.promise().query(`
                SELECT datetomeet FROM promisedate WHERE promise_id = ${promiseId}
            `);
            const validDatesArray = validDates.map((item) => {
                const date = new Date(item.datetomeet);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth()는 0부터 시작하므로 1을 더함
                const day = String(date.getDate()).padStart(2, "0");
                return `${year}-${month}-${day}`;
            });
            for (let datetime of dateTimeAvailable) {
                const [date, startTime, endTime] = datetime.split(" ");
                if (validDatesArray.includes(date)) {
                    if (startTime >= start_time && endTime <= end_time) {
                        const [timeSlot] = await db.promise().query(`
                            SELECT id FROM timeslot 
                            WHERE start_time = '${startTime}' AND end_time = '${endTime}'
                        `);
                        const timeId = timeSlot[0]?.id;
                        if (timeId) {
                            await db.promise().query(
                                `
                                INSERT INTO confirmedtime (confirmed_id, date_confirmed, time_id)
                                VALUES (?, ?, ?)
                            `,
                                [confirmedId, date, timeId]
                            );
                        } else {
                            return res.status(400).json({
                                statusCode: 1752,
                                message: "wrong time id",
                            });
                        }
                    } else {
                        return res.status(400).json({
                            statusCode: 1753,
                            message: "wrong time range",
                        });
                    }
                } else {
                    return res.status(400).json({
                        statusCode: 1751,
                        message: "date out of range of promise",
                    });
                }
            }
            return res.status(201).json({
                message: "time confirmed successfully",
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "An error occurred while confirming the promise.",
            error: error.message,
        });
    }
});

// 확정 권한이  있는 회원/비회원은 확정을 수정할 수 있음(공지사항, 장소)
router.patch("/update", authMember, async (req, res) => {
    const { promiseId, place, notice } = req.body;

    try {
        // promise 테이블에서 weekvsdate, ampmvstime 값 가져오기
        const [promiseSettings] = await db.promise().query(`
            SELECT weekvsdate, ampmvstime, start_time, end_time, canallconfirm
            FROM promise WHERE promise_id = ${promiseId};
        `);

        // 이미 확정된 약속인지 확인
        const [existingConfirmation] = await db.promise().query(
            `
            SELECT id FROM confirmed WHERE promise_id = ?;
        `,
            [promiseId]
        );

        const confirmedId = existingConfirmation[0]?.id;

        if (existingConfirmation.length === 0) {
            return res.status(404).json({
                statusCode: 4044,
                message: "this promise has not been confirmed yet.",
            });
        }

        const { weekvsdate, ampmvstime, start_time, end_time, canallconfirm } =
            promiseSettings[0];
        // 권한 확인
        let memberPermission = [];
        if (req.isMember === true) {
            memberPermission = await db.promise().query(
                `
                SELECT canconfirm
                FROM memberjoin
                WHERE member_id = ? AND promise_id = ?
            `,
                [req.memberId, promiseId]
            );

            if (memberPermission[0].length === 0) {
                return res.status(403).json({
                    statusCode: 4033,
                    message: "no member found in this promise.",
                });
            } else if (memberPermission[0][0].canconfirm !== "T") {
                return res.status(403).json({
                    statusCode: 4034,
                    message:
                        "you do not have permission to confirm this promise as member.",
                });
            }
        } else if (req.isMember === false) {
            if (canallconfirm !== "T") {
                return res.status(403).json({
                    statusCode: 4035,
                    message:
                        "you do not have permission to confirm this promise as nonmember.",
                });
            }
        }

        // 확정 정보 업데이트
        await db.promise().query(
            `
            UPDATE confirmed
            SET confirmed_place = ?, confirmed_notice = ?
            WHERE id = ?
        `,
            [place, notice, confirmedId]
        );

        await db.promise().query(
            `
            DELETE FROM confirmedtime
            WHERE confirmed_id = ?`,
            [confirmedId]
        );

        if (weekvsdate === "W" && ampmvstime === "F") {
            const correctString = [
                "SUN",
                "MON",
                "TUE",
                "WED",
                "THU",
                "FRI",
                "SAT",
            ];
            const weekAvailable = req.body.weekAvailable;

            for (let weekday of weekAvailable) {
                if (correctString.includes(weekday)) {
                    await db.promise().query(
                        `
                        INSERT INTO confimedtime (confirmed_id, week_confirmed)
                        VALUES (?, ?)
                    `,
                        [weekday, confirmedId]
                    );
                } else {
                    return res.status(400).json({
                        statusCode: 1750,
                        message: "wrong weekday string",
                    });
                }
            }
            return res.status(200).json({
                message: "time updated successfully",
            });
        } else if (weekvsdate === "D" && ampmvstime === "F") {
            // 해당 promise_id에 해당하는 datetomeet 값 가져오기
            const dateAvailable = req.body.dateAvailable;
            const [validDates] = await db.promise().query(`
                SELECT datetomeet FROM promisedate WHERE promise_id = ${promiseId}
            `);
            const validDatesArray = validDates.map((item) => {
                const date = new Date(item.datetomeet);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth()는 0부터 시작하므로 1을 더함
                const day = String(date.getDate()).padStart(2, "0");
                return `${year}-${month}-${day}`;
            });

            for (let date of dateAvailable) {
                if (validDatesArray.includes(date)) {
                    await db.promise().query(
                        `
                        INSERT INTO confirmedtime (confirmed_id, date_confirmed)
                        VALUES (?, ?)
                        `,
                        [confirmedId, date]
                    );
                } else {
                    return res.status(400).json({
                        statusCode: 1751,
                        message: "date out of range of promise",
                    });
                }
            }
            return res.status(200).json({
                message: "time updated successfully",
            });
        } else if (weekvsdate === "W" && ampmvstime === "T") {
            const weekTimeAvailable = req.body.weekTimeAvailable;
            const correctString = [
                "SUN",
                "MON",
                "TUE",
                "WED",
                "THU",
                "FRI",
                "SAT",
            ];
            for (let weekdaytime of weekTimeAvailable) {
                const [weekday, startTime, endTime] = weekdaytime.split(" ");
                if (correctString.includes(weekday)) {
                    if (startTime >= start_time && endTime <= end_time) {
                        const [timeSlot] = await db.promise().query(`
                            SELECT id FROM timeslot 
                            WHERE start_time = '${startTime}' AND end_time = '${endTime}'
                        `);
                        const timeId = timeSlot[0]?.id;
                        if (timeId) {
                            await db.promise().query(
                                `
                                INSERT INTO confirmedtime (confirmed_id, week_confirmed, time_id)
                                VALUES (?, ?, ?)
                            `,
                                [weekday, timeId, confirmedId]
                            );
                        } else {
                            return res.status(400).json({
                                statusCode: 1752,
                                message: "wrong time id",
                            });
                        }
                    } else {
                        return res.status(400).json({
                            statusCode: 1753,
                            message: "wrong time range",
                        });
                    }
                } else {
                    return res.status(400).json({
                        statusCode: 1750,
                        message: "wrong weekday string",
                    });
                }
            }
            return res.status(200).json({
                message: "time updated successfully",
            });
        } else if (weekvsdate === "D" && ampmvstime === "T") {
            const dateTimeAvailable = req.body.dateTimeAvailable;
            const [validDates] = await db.promise().query(`
                SELECT datetomeet FROM promisedate WHERE promise_id = ${promiseId}
            `);
            const validDatesArray = validDates.map((item) => {
                const date = new Date(item.datetomeet);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth()는 0부터 시작하므로 1을 더함
                const day = String(date.getDate()).padStart(2, "0");
                return `${year}-${month}-${day}`;
            });
            for (let datetime of dateTimeAvailable) {
                const [date, startTime, endTime] = datetime.split(" ");
                if (validDatesArray.includes(date)) {
                    if (startTime >= start_time && endTime <= end_time) {
                        const [timeSlot] = await db.promise().query(`
                            SELECT id FROM timeslot 
                            WHERE start_time = '${startTime}' AND end_time = '${endTime}'
                        `);
                        const timeId = timeSlot[0]?.id;
                        if (timeId) {
                            await db.promise().query(
                                `
                                INSERT INTO confirmedtime (confirmed_id, date_confirmed, time_id)
                                VALUES (?, ?, ?)
                            `,
                                [date, timeId, confirmedId]
                            );
                        } else {
                            return res.status(400).json({
                                statusCode: 1752,
                                message: "wrong time id",
                            });
                        }
                    } else {
                        return res.status(400).json({
                            statusCode: 1753,
                            message: "wrong time range",
                        });
                    }
                } else {
                    return res.status(400).json({
                        statusCode: 1751,
                        message: "date out of range of promise",
                    });
                }
            }
            return res.status(200).json({
                message: "time updated successfully",
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "An error occurred while confirming the promise.",
            error: error.message,
        });
    }
});

// 확정권한이 있는 회원/비회원은 확정을 취소할 수 있음
// 확정 취소 시 캘린더에 연동한 회원의 일정이 모두 삭제됨
router.delete("/cancel", authMember, async (req, res) => {});

// 확정된 약속을 표시하는 것은 약속세부 가져오기를 수정하는 것이 좋을듯
// 같은 맥락으로 (회원) 내 캘린더에 약속이 있는 경우에도 일정있는 날짜임을 표시해야함
// 내 캘린더에 연동하는 경우 장소, 공지사항은 수정이 불가능하고 회원만 가능하다. 일정명은 기본적으로 약속명이고 시간정보가 입력되어있다(calendartime 기반)

// 내 캘린더에 연동할 때 기본으로 가져올 정보들(약속명, 장소, 공지사항, 시간정보)
router.get("/confirminfo", authMember, async (req, res) => {});

// 내 캘린더에 연동하기
// 시간정보가 없는 약속의 경우 회원이 직접 추가해야함(기본 00~24)
// 시간정보가 있는 약속은 시간정보를 수정할 수 없음
// 날짜기준인 경우 반복 정보를 설정할 수 없음
// 요일기준인 경우 반복 정보를 반드시 설정해야함(기본 반복없음, 날짜 입력해야함 언제 월요일인지)
// 약속의 시간정보 여부, 날짜기준 요일 기준에 따라 받아오는 정보가 달라지고 만들어진 calendarId와 promiseId를 calendarpromise table에 mapping 시키는 것 외에는 캘린더에 일반정보를 추가하는 것과 동일하다.
router.post("/linktocalendar", authMember, async (req, res) => {});

// 추가적으로 연동 후 캘린더에서 삭제하는 경우에 연동을 해제하는 것이므로 calendarpromise table에서 mapping을 삭제하면 된다. -> /caledar/delete에서 추가

module.exports = router;

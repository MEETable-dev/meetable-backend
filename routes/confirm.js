const express = require("express");
const router = express.Router();
const db = require("../db");
const authMember = require("../middlewares/authmember");

const dayjs = require("dayjs");
const weekday = require("dayjs/plugin/weekday");
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter");
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore");

dayjs.extend(weekday);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

function getDatesForWeekSchedule(startDate, scheduleTimes) {
    const dayMap = {
        SUN: 0,
        MON: 1,
        TUE: 2,
        WED: 3,
        THU: 4,
        FRI: 5,
        SAT: 6,
    };

    const dates = scheduleTimes.map((scheduleTime) => {
        const [dayOfWeek, startTime, endTime] = scheduleTime.split(" ");
        const baseDate = dayjs(startDate).weekday(dayMap[dayOfWeek]);
        if (baseDate.isBefore(dayjs(startDate))) {
            baseDate.add(1, "week");
        }
        return {
            date: baseDate.format("YYYY-MM-DD"),
            startTime: startTime,
            endTime: endTime,
        };
    });

    return dates;
}

//TODO: 시간정보가 있는 약속을 확정하고 캘린더에 연동할 때 연속된 시간 또는 같은 날짜?를 합쳐서 전달해야함
//TODO: 캘린더에 추가된 확정된 약속은 calendar promise table에 mapping해서 정보 가져와야함 공지사항, 장소 등 공유되는 정보
// 추가적으로 연동 후 캘린더에서 삭제하는 경우에 연동을 해제하는 것이므로 calendarpromise table에서 mapping을 삭제하면 된다. -> /caledar/delete에서 추가

// 날짜 포매팅 함수
function formatDateToUTC(date) {
    const d = new Date(date);
    d.setDate(date.getDate());
    return d.toISOString().split("T")[0];
}

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

// 확정 권한이 있는 회원/비회원은 확정을 수정할 수 있음(공지사항, 장소)
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

// 확정된 약속을 표시하는 것은 약속세부 가져오기를 수정하는 것이 좋을듯
// 같은 맥락으로 (회원) 내 캘린더에 약속이 있는 경우에도 일정있는 날짜임을 표시해야함
// 내 캘린더에 연동하는 경우 장소, 공지사항은 수정이 불가능하고 회원만 가능하다. 일정명은 기본적으로 약속명이고 시간정보가 입력되어있다(calendartime 기반)

// 내 캘린더에 연동할 때 기본으로 가져올 정보들(약속명, 장소, 공지사항, 시간정보)
// 확정된 일정을 조회할 때도 사용
router.get("/confirminfo/:promiseid", authMember, async (req, res) => {
    const promiseid = parseInt(req.params.promiseid);
    // if (req.isMember == false) {
    //     res.status(403).send({
    //         statusCode: 1802,
    //         message: "nonmember can't use this api",
    //     });
    // }
    // promiseid = parseInt(promiseid);
    try {
        const [promiseInfo] = await db.promise().query(
            `
            SELECT 
                memberjoin.member_promise_name,
                promise.weekvsdate,
                promise.ampmvstime
            FROM memberjoin
            INNER JOIN promise ON memberjoin.promise_id = promise.promise_id
            WHERE memberjoin.member_id = ? AND memberjoin.promise_id = ?;
        `,
            [req.memberId, promiseid]
        );
        const { member_promise_name, weekvsdate, ampmvstime } = promiseInfo[0];
        const [confirmedInfo] = await db.promise().query(
            `
            SELECT id, confirmed_place, confirmed_notice FROM confirmed WHERE promise_id = ?
        `,
            [promiseid]
        );
        if (confirmedInfo.length === 0) {
            return res.status(404).json({
                statusCode: 4044,
                message: "this promise has not been confirmed yet.",
            });
        }

        if (weekvsdate === "W" && ampmvstime === "F") {
            const [weekConfirmed] = await db.promise().query(
                `
                SELECT week_confirmed FROM confirmedtime WHERE confirmed_id = ?;
            `,
                [confirmedInfo[0].id]
            );
            return res.status(200).json({
                promiseName: member_promise_name,
                place: confirmedInfo[0].confirmed_place,
                notice: confirmedInfo[0].confirmed_notice,
                weekConfirmed: weekConfirmed.map((item) => item.week_confirmed),
            });
        } else if (weekvsdate === "D" && ampmvstime === "F") {
            const [dateConfirmed] = await db.promise().query(
                `
                SELECT date_confirmed FROM confirmedtime WHERE confirmed_id = ?;
            `,
                [confirmedInfo[0].id]
            );
            return res.status(200).json({
                promiseName: member_promise_name,
                place: confirmedInfo[0].confirmed_place,
                notice: confirmedInfo[0].confirmed_notice,
                dateConfirmed: dateConfirmed.map((item) =>
                    formatDateToUTC(item.date_confirmed)
                ),
            });
        } else if (weekvsdate === "W" && ampmvstime === "T") {
            const [weekTimeConfirmed] = await db.promise().query(
                `
                SELECT CONCAT(week_confirmed, ' ', start_time, ' ', end_time) AS weektime
                FROM confirmedtime
                INNER JOIN timeslot ON confirmedtime.time_id = timeslot.id
                WHERE confirmed_id = ?;
            `,
                [confirmedInfo[0].id]
            );
            return res.status(200).json({
                promiseName: member_promise_name,
                place: confirmedInfo[0].confirmed_place,
                notice: confirmedInfo[0].confirmed_notice,
                weekTimeConfirmed: weekTimeConfirmed.map(
                    (item) => item.weektime
                ),
            });
        } else if (weekvsdate === "D" && ampmvstime === "T") {
            const [dateTimeConfirmed] = await db.promise().query(
                `
                SELECT CONCAT(date_confirmed, ' ', start_time, ' ', end_time) AS datetime
                FROM confirmedtime
                INNER JOIN timeslot ON confirmedtime.time_id = timeslot.id
                WHERE confirmed_id = ?;
            `,
                [confirmedInfo[0].id]
            );
            return res.status(200).json({
                promiseName: member_promise_name,
                place: confirmedInfo[0].confirmed_place,
                notice: confirmedInfo[0].confirmed_notice,
                dateTimeConfirmed: dateTimeConfirmed.map(
                    (item) =>
                        formatDateToUTC(item.datetime.split(" ")[0]) +
                        " " +
                        item.datetime.split(" ")[1] +
                        " " +
                        item.datetime.split(" ")[2]
                ),
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "An error occurred while getting the promise information.",
            error: error.message,
        });
    }
});

// 내 캘린더에 복사하기
// 시간정보가 없는 약속의 경우 회원이 직접 추가해야함(기본 00~24)
// 시간정보가 있는 약속은 시간정보를 수정할 수 없음
// 날짜기준인 경우 반복 정보를 설정할 수 없음
// 요일기준인 경우 반복 정보를 반드시 설정해야함(기본 반복없음, 날짜 입력해야함 언제 월요일인지)
// 약속의 시간정보 여부, 날짜기준 요일 기준에 따라 받아오는 정보가 달라지고 만들어진 calendarId와 promiseId를 calendarpromise table에 mapping 시키는 것 외에는 캘린더에 일반정보를 추가하는 것과 동일하다.
router.post("/copytocalendar", authMember, async (req, res) => {
    if (req.isMember === false) {
        return res.status(401).json({
            statusCode: 1000,
            message: "access denied. only members can add a link to calendar.",
        });
    }
    // 권한 확인
    let memberPermission = [];

    const memberId = req.memberId;
    const {
        promiseid,
        color,
        name,
        place,
        notice,
        memo,
        isreptition,
        scheduleTimes,
        reptitioncycle,
        iscontinuous,
        reptition_time,
        start_date,
        end_date,
    } = req.body;

    if (req.isMember === true) {
        memberPermission = await db.promise().query(
            `
             SELECT canconfirm
             FROM memberjoin
             WHERE member_id = ? AND promise_id = ?
         `,
            [req.memberId, promiseid]
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
    }

    const [promiseInfo] = await db.promise().query(
        `
        SELECT weekvsdate
        FROM promise WHERE promise_id = ?;`,
        [promiseid]
    );

    const [memberjoinInfo] = await db.promise().query(
        `
        SELECT memberjoin_id FROM memberjoin WHERE promise_id = ? AND member_id = ?;
    `,
        [promiseid, memberId]
    );

    const { weekvsdate } = promiseInfo[0];
    const memberjoinid = memberjoinInfo[0].memberjoin_id;

    // 입력값 검증
    if (!(color >= 0 && color <= 8) || !name || !Array.isArray(scheduleTimes)) {
        return res.status(400).json({
            statusCode: 1024,
            message: "Invalid input. Please provide the correct data.",
        });
    }

    // 반복 일정의 추가 검증
    if (isreptition === "T") {
        const isContinuousValid = iscontinuous === "T";
        const isReptitionTimeValid = reptition_time > 0;
        const isEndDateValid = end_date != null; // end_date가 문자열 형식의 날짜여야 함

        // 적어도 하나의 값이 기본값이 아니어야 함
        if (!isContinuousValid && !isReptitionTimeValid && !isEndDateValid) {
            return res.status(400).json({
                statusCode: 1025,
                message:
                    "Invalid repetition settings. Provide a valid 'iscontinuous', 'reptition_time', or 'end_date' value.",
            });
        }
    }

    if (weekvsdate === "D" && isreptition === "T") {
        return res.status(400).json({
            statusCode: 1026,
            message:
                "Invalid repetition settings. Date-based repetition does not support repetition settings.",
        });
    }

    if (start_date === null && weekvsdate === "W") {
        return res.status(400).json({
            statusCode: 1027,
            message: "Please provide a start date for the week-based schedule.",
        });
    }

    try {
        // calendar 테이블에 데이터 삽입
        const [calendarResult] = await db.promise().query(
            `
            INSERT INTO calendar (member_id, schedule_color, schedule_name, schedule_place, schedule_memo, isreptition, reptitioncycle, iscontinuous, reptition_time, end_date, notice)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            [
                memberId,
                color,
                name,
                place,
                memo,
                isreptition || "F",
                reptitioncycle || 0,
                iscontinuous || "F",
                reptition_time || 0,
                end_date,
                notice
            ]
        );
        const calendarId = calendarResult.insertId;

        await db.promise().query(
            `
           INSERT INTO calendarpromise (calendar_id, memberjoin_id)
            VALUES (?, ?) 
        `,
            [calendarId, memberjoinid]
        );

        if (weekvsdate === "D") {
            // scheduleTimes 배열을 사용하여 calendartime 테이블에 여러 날짜와 시간 데이터 삽입
            scheduleTimes.forEach(async (scheduleTime) => {
                const [date, startTime, endTime] = scheduleTime.split(" ");

                await db.promise().query(
                    `
                    INSERT INTO calendartime (calendar_id, calendar_date, start_time, end_time)
                    VALUES (?, ?, ?, ?)
                `,
                    [calendarId, date, startTime, endTime]
                );
            });

            return res.status(201).json({
                message:
                    "Schedule added successfully with multiple dates and times.",
            });
        } else if (weekvsdate === "W") {
            const dates = getDatesForWeekSchedule(start_date, scheduleTimes);
            for (const date of dates) {
                await db.promise().query(
                    `
                    INSERT INTO calendartime (calendar_id, calendar_date, start_time, end_time)
                    VALUES (?, ?, ?, ?)
                `,
                    [calendarId, date.date, date.startTime, date.endTime]
                );
            }
            return res.status(201).json({
                message:
                    "Schedule added successfully with week-based schedule.",
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message:
                "An error occurred while linking the promise to the calendar.",
            error: error.message,
        });
    }
});

// 확정권한이 있는 회원/비회원은 확정을 취소할 수 있음
router.delete("/cancel", authMember, async (req, res) => {
    const { promiseid } = req.body;
    // promise 테이블에서 weekvsdate, ampmvstime 값 가져오기
    const [promiseSettings] = await db.promise().query(`
        SELECT canallconfirm
        FROM promise WHERE promise_id = ?;
    `, [promiseid]);

    // 이미 확정된 약속인지 확인
    const [existingConfirmation] = await db.promise().query(
        `
        SELECT id FROM confirmed WHERE promise_id = ?;
    `,
        [promiseid]
    );

    if (existingConfirmation.length === 0) {
        return res.status(404).json({
            statusCode: 4044,
            message: "this promise has not been confirmed yet.",
        });
    }

    const { canallconfirm } =
    promiseSettings[0];
    if (req.isMember === true) {
        memberPermission = await db.promise().query(
            `
            SELECT canconfirm
            FROM memberjoin
            WHERE member_id = ? AND promise_id = ?
        `,
            [req.memberId, promiseid]
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
    try {
        await db.promise().query(`
            DELETE FROM confirmed WHERE promise_id = ?;`
        , [promiseid]);
        return res.status(200).json({
            message: "confirmed promise canceled successfully."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "An error occurred while canceling the promise.",
            error: error.message,
        });
    }
   

});

module.exports = router;

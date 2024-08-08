const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require("../middlewares/authmember");

router.post("/add", authMember, async (req, res) => {
    if (req.isMember === false) {
        return res.status(401).json({
            statusCode: 1000,
            message: "access denied. only members can add a schedule.",
        });
    }

    const memberId = req.memberId;
    const {
        color,
        name,
        place,
        memo,
        isreptition,
        scheduleTimes,
        reptitioncycle,
        iscontinuous,
        reptition_time,
        end_date,
    } = req.body;

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

    try {
        // calendar 테이블에 데이터 삽입
        const [calendarResult] = await db.promise().query(
            `
            INSERT INTO calendar (member_id, schedule_color, schedule_name, schedule_place, schedule_memo, isreptition, reptitioncycle, iscontinuous, reptition_time, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            ]
        );

        const calendarId = calendarResult.insertId;

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
    } catch (error) {
        console.error(error);
        res.status(500).json({
            statusCode: 1234,
            message: `Error adding schedule: ${error.message}`,
        });
    }
});

router.delete("/delete", authMember, async (req, res) => {
    if (!req.isMember) {
        return res.status(401).json({
            statusCode: 1000,
            message: "Access denied. Only members can delete a schedule.",
        });
    }

    const calendarId = req.body.calendarId;

    if (!calendarId) {
        return res.status(400).json({
            statusCode: 1024,
            message: "calendar ID is required.",
        });
    }

    try {
        // Check if the calendar entry exists and belongs to the member
        const [entry] = await db.promise().query(
            `
            SELECT id FROM calendar WHERE id = ? AND member_id = ?
        `,
            [calendarId, req.memberId]
        );

        if (entry.length === 0) {
            return res.status(404).json({
                statusCode: 1812,
                message: "calendar schedule not found",
            });
        }

        // Delete the calendar event
        await db.promise().query(
            `
            DELETE FROM calendar WHERE id = ?
        `,
            [calendarId]
        );

        res.status(200).json({
            message: "Calendar schedule deleted successfully.",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: `Error deleting calendar schedule: ${error.message}`,
        });
    }
});

router.patch("/update", authMember, async (req, res) => {
    if (!req.isMember) {
        return res.status(401).json({
            message: "access denied. Only members can update a schedule.",
        });
    }

    const {
        calendarId,
        color,
        name,
        place,
        memo,
        isreptition,
        scheduleTimes,
        reptitioncycle,
        iscontinuous,
        reptition_time,
        end_date,
        updateType,
    } = req.body;

    // 입력값 검증
    if (
        !calendarId ||
        !(color >= 0 && color <= 8) ||
        !name ||
        !Array.isArray(scheduleTimes)
    ) {
        return res.status(400).json({
            statusCode: 1024,
            message:
                "invalid input. Please provide the correct data and ensure all required fields are included.",
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

    try {
        if (updateType === "single" && isreptition === "T") {
            // 반복 일정에서 특정 날짜 분리
            const [date, startTime, endTime] = scheduleTimes[0].split(" ");

            // 기존 일정에서 특정 날짜 제외하고 새로운 일정 생성
            const [result] = await db.promise().query(
                `
                 INSERT INTO calendar (member_id, schedule_color, schedule_name, schedule_place, schedule_memo, notice, isreptition, reptitioncycle, iscontinuous, reptition_time, end_date)
                 SELECT member_id, ?, ?, ?, ?, notice, 'F', 0, 'F', 0, end_date
                 FROM calendar
                 WHERE id = ?
                 `,
                [color, name, place, memo, calendarId]
            );

            const newCalendarId = result.insertId;

            await db.promise().query(
                `
                 INSERT INTO calendartime (calendar_id, calendar_date, start_time, end_time)
                 VALUES (?, ?, ?, ?)
                 `,
                [newCalendarId, date, startTime, endTime]
            );

            await db.promise().query(
                `
                 INSERT INTO calendar_mapping (parent_calendar_id, child_calendar_id)
                 VALUES (?, ?)
                 `,
                [calendarId, newCalendarId]
            );

            res.status(200).json({
                message: "Specific date schedule updated successfully.",
            });
        } else if (
            updateType === "single" &&
            specificDate &&
            isreptition === "F"
        ) {
            // 단일 날짜의 반복되지 않는 일정 업데이트
            const [date, startTime, endTime] = scheduleTimes[0].split(" ");

            await db.promise().query(
                `
                UPDATE calendartime 
                SET start_time = ?, end_time = ?
                WHERE calendar_id = ? AND calendar_date = ?
            `,
                [startTime, endTime, calendarId, date]
            );

            res.status(200).json({
                message:
                    "Non-repeating schedule for a specific date updated successfully.",
            });
        } else {
            // Update the main calendar entry
            await db.promise().query(
                `
            UPDATE calendar 
            SET schedule_color = ?, schedule_name = ?, schedule_place = ?, schedule_memo = ?, isreptition = ?, reptitioncycle = ?, iscontinuous = ?, reptition_time = ?, end_date = ?
            WHERE id = ? AND member_id = ?
        `,
                [
                    color,
                    name,
                    place,
                    memo,
                    isreptition || "F",
                    reptitioncycle || 0,
                    iscontinuous || "F",
                    reptition_time || 0,
                    end_date,
                    calendarId,
                    req.memberId,
                ]
            );

            // Delete old times associated with this calendar
            await db.promise().query(
                `
            DELETE FROM calendartime WHERE calendar_id = ?
        `,
                [calendarId]
            );

            // Insert new times
            scheduleTimes.forEach(async (scheduleTime) => {
                const [date, start, end] = scheduleTime.split(" ");
                const startTime = start.replace("-", ":");
                const endTime = end.replace("-", ":");

                await db.promise().query(
                    `
                INSERT INTO calendartime (calendar_id, calendar_date, start_time, end_time)
                VALUES (?, ?, ?, ?)
            `,
                    [calendarId, date, startTime, endTime]
                );
            });

            res.status(200).json({
                message: "calendar schedule updated successfully.",
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: `Error updating calendar schedule: ${error.message}`,
        });
    }
});

// 날짜 포매팅 함수
function formatDateToUTC(date) {
    const d = new Date(date);
    d.setDate(date.getDate());
    return d.toISOString().split("T")[0];
}

router.get("/scheduleinfo", authMember, async (req, res) => {
    if (!req.isMember) {
        return res.status(401).json({
            statusCode: 1000,
            message:
                "access denied. only members can access schedule information.",
        });
    }
    const month = req.query.month; // 예: month="2023-12"
    if (!month) {
        return res.status(400).json({
            statusCode: 1024,
            message: "please provide a month for querying schedules.",
        });
    }

    const memberId = req.memberId;

    try {
        const schedules = await db.promise().query(
            `
            SELECT calendar.id, calendar.schedule_color, calendar.schedule_name, calendar.schedule_place, calendar.schedule_memo, calendar.notice, calendar.isreptition, calendar.reptitioncycle, calendar.iscontinuous, calendar.reptition_time, calendar.end_date, calendartime.calendar_date
            FROM calendar
            JOIN calendartime ON calendar.id = calendartime.calendar_id
            WHERE member_id = ?
        `,
            [memberId]
        );

        const childMappings = await db.promise().query(
            `
            SELECT parent_calendar_id, child_calendar_id FROM calendar_mapping WHERE parent_calendar_id IN (SELECT id FROM calendar WHERE member_id = ?)
        `,
            [memberId]
        );

        const childMappingMap = new Map();
        childMappings[0].forEach((mapping) => {
            if (!childMappingMap.has(mapping.child_calendar_id)) {
                childMappingMap.set(mapping.child_calendar_id, []);
            }
            childMappingMap
                .get(mapping.child_calendar_id)
                .push(mapping.parent_calendar_id);
        });
        console.log(childMappingMap);

        let formattedResponse = {};

        for (const schedule of schedules[0]) {
            const [isCopiedFromPromise] = await db.promise().query(
                `
                SELECT confirmed_id FROM calendarpromise WHERE calendar_id = ?
            `,
                [schedule.id]
            );
            let isDeleted;
            let promiseid;
            if (isCopiedFromPromise.length !== 0) {
                const [trashId] = await db.promise().query(
                    `
                    SELECT folder_id FROM folder WHERE folder_name = 'trash' AND member_id = ?
                `,
                    [memberId]
                );
                promiseid = await db.promise().query(
                    `
                    SELECT mj.promise_id, p.promise_code 
                    FROM memberjoin mj
                    INNER JOIN promise p ON mj.promise_id = p.promise_id
                    WHERE mj.memberjoin_id = ?;
                `,
                    [isCopiedFromPromise[0].memberjoin_id]
                );

                isDeleted = await db
                    .promise()
                    .query(
                        `SELECT * FROM folder_promise WHERE folder_id =? AND promise_id = ?`,
                        [trashId[0].folder_id, promiseid[0][0].promise_id]
                    );
            }
            let calendarDateString =
                schedule.calendar_date instanceof Date
                    ? formatDateToUTC(schedule.calendar_date)
                    : schedule.calendar_date;
            let endDateString = schedule.end_date
                ? formatDateToUTC(schedule.end_date)
                : null;
            let currentDate = new Date(calendarDateString);
            let iscontinuous = schedule.iscontinuous === "T";
            const parentIds = childMappingMap.get(schedule.id);
            if (
                schedule.isreptition === "T" &&
                currentDate <
                    new Date(month.split("-")[0], month.split("-")[1] + 1, 1)
            ) {
                // 반복 일정에 대한 처리
                let endDate = endDateString
                    ? new Date(endDateString)
                    : new Date(calendarDateString);
                let repeatCycle = schedule.reptitioncycle * 7;
                let repeatCount = schedule.reptition_time;

                while (
                    currentDate <= endDate ||
                    iscontinuous ||
                    repeatCount > 0
                ) {
                    if (iscontinuous && repeatCycle === 0) {
                        return res.status(400).json({
                            statusCode: 1025,
                            message:
                                "Invalid repetition cycle setting. please check database. repeatcycle should be greater than 0.",
                        });
                    }
                    let yearMonth = `${currentDate.getFullYear()}-${String(
                        currentDate.getMonth() + 1
                    ).padStart(2, "0")}`;
                    if (yearMonth === month) {
                        let dayKey = currentDate.toISOString().split("T")[0];
                        if (!formattedResponse[dayKey]) {
                            formattedResponse[dayKey] = [];
                        }
                        if (
                            isCopiedFromPromise.length > 0 &&
                            isDeleted[0].length === 0
                        ) {
                            formattedResponse[dayKey].push({
                                id: schedule.id,
                                place: schedule.schedule_place,
                                memo: schedule.schedule_memo,
                                color: schedule.schedule_color,
                                name: schedule.schedule_name,
                                promise:
                                    promiseid[0].promise_id +
                                    "_" +
                                    promiseid[0].promise_code,
                            });
                        } else {
                            formattedResponse[dayKey].push({
                                id: schedule.id,
                                place: schedule.schedule_place,
                                memo: schedule.schedule_memo,
                                color: schedule.schedule_color,
                                name: schedule.schedule_name,
                            });
                        }
                    }

                    if (currentDate.getMonth() > new Date(month).getMonth()) {
                        // 다음 달로 넘어갔으므로 중단
                        break;
                    }

                    if (
                        repeatCount !== null &&
                        --repeatCount <= 0 &&
                        schedule.iscontinuous !== "T" &&
                        currentDate === endDate
                    ) {
                        // 지정된 반복 횟수에 도달하면 중단
                        break;
                    }
                    // 다음 반복 일정으로 날짜 업데이트
                    currentDate.setDate(currentDate.getDate() + repeatCycle);
                }
            } else if (schedule.isreptition === "F") {
                // 반복되지 않는 일정에 대한 처리
                if (calendarDateString.startsWith(month)) {
                    let dateKey = calendarDateString;
                    if (!formattedResponse[dateKey]) {
                        formattedResponse[dateKey] = [];
                    }
                    if (parentIds) {
                        formattedResponse[dateKey] = formattedResponse[
                            dateKey
                        ].filter(
                            (schedule) => !parentIds.includes(schedule.id)
                        );
                    }
                    if (
                        isCopiedFromPromise.length > 0 &&
                        isDeleted[0].length === 0
                    ) {
                        formattedResponse[dateKey].push({
                            id: schedule.id,
                            color: schedule.schedule_color,
                            name: schedule.schedule_name,
                            place: schedule.schedule_place,
                            memo: schedule.schedule_memo,
                            notice: schedule.notice,
                            promise:
                                promiseid[0][0].promise_id +
                                "_" +
                                promiseid[0][0].promise_code,
                        });
                    } else {
                        formattedResponse[dateKey].push({
                            id: schedule.id,
                            place: schedule.schedule_place,
                            memo: schedule.schedule_memo,
                            color: schedule.schedule_color,
                            name: schedule.schedule_name,
                        });
                    }
                }
            }
        }
        // Sort formattedResponse by date
        const sortedResponse = Object.keys(formattedResponse).sort();

        // Create a new object with sorted dates
        const orderedResponse = {};
        for (const date of sortedResponse) {
            orderedResponse[date] = formattedResponse[date];
        }

        return res.status(200).json(orderedResponse);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: `Error retrieving schedule information: ${error.message}`,
        });
    }
});

router.get("/detail", authMember, async (req, res) => {
    // 쿼리 파라미터로부터 calendarId를 추출합니다.
    const { calendarId } = req.query;

    if (!req.isMember) {
        return res.status(401).json({
            statusCode: 1000,
            message:
                "access denied. only members can access schedule information.",
        });
    }

    // calendarId가 제공되지 않은 경우, 클라이언트에 에러를 반환합니다.
    if (!calendarId) {
        return res.status(400).json({
            statusCode: 1024,
            message: "calendar ID is required.",
        });
    }

    try {
        // CALENDAR 테이블에서 해당 calendarId의 상세 정보를 가져옵니다.
        const [calendarDetails] = await db.promise().query(
            `
             SELECT * FROM calendar WHERE id = ?
         `,
            [calendarId]
        );

        // 해당 ID의 CALENDARTIME 정보를 가져옵니다.
        const [calendarTimes] = await db.promise().query(
            `
             SELECT * FROM calendartime WHERE calendar_id = ?
         `,
            [calendarId]
        );

        // CALENDAR의 상세 정보가 존재하지 않는 경우, 클라이언트에 에러를 반환합니다.
        if (calendarDetails.length === 0) {
            return res.status(404).json({
                statusCode: 1812,
                message: "calendar details not found.",
            });
        }

        // 결과를 포맷하여 클라이언트에 반환합니다.
        const result = {
            color: calendarDetails[0].schedule_color,
            name: calendarDetails[0].schedule_name,
            times: calendarTimes.map((time) => ({
                date: time.calendar_date,
                startTime: time.start_time,
                endTime: time.end_time,
            })),
            isReptition: calendarDetails[0].isreptition,
            reptitionCycle: calendarDetails[0].reptitioncycle,
            isContinuous: calendarDetails[0].iscontinuous,
            reptitionTime: calendarDetails[0].reptition_time,
            endDate: calendarDetails[0].end_date,
            place: calendarDetails[0].schedule_place,
            memo: calendarDetails[0].schedule_memo,
        };

        res.status(200).json(result);
    } catch (error) {
        // 데이터베이스 조회 중 오류가 발생한 경우, 클라이언트에 에러를 반환합니다.
        console.error(error);
        res.status(500).json({
            statusCode: 1234,
            message: `Error retrieving calendar details: ${error.message}`,
        });
    }
});

module.exports = router;
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

        res.status(201).json({
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
    } = req.body;

    // 입력값 검증
    if (
        !calendarId ||
        !(color >= 0 && color <= 8) ||
        !name ||
        !Array.isArray(scheduleTimes)
    ) {
        return res.status(400).json({
            message:
                "invalid input. Please provide the correct data and ensure all required fields are included.",
        });
    }

    try {
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
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: `Error updating calendar schedule: ${error.message}`,
        });
    }
});

router.get("/scheduleinfo", authMember, async (req, res) => {
    if (!req.isMember) {
        return res
            .status(401)
            .json({
                message:
                    "Access denied. Only members can access schedule information.",
            });
    }

    const { month } = req.query; // 예: month="2023-12"
    if (!month) {
        return res
            .status(400)
            .json({
                message: "Please provide a month for querying schedules.",
            });
    }

    const memberId = req.memberId;

    try {
        const schedules = await db.promise().query(
            `
            SELECT id, schedule_name, isreptition, reptitioncycle, iscontinuous, reptition_time, end_date, calendar_date
            FROM CALENDAR
            JOIN CALENDARTIME ON CALENDAR.id = CALENDARTIME.calendar_id
            WHERE member_id = ?
        `,
            [memberId]
        );

        let formattedResponse = {};

        schedules.forEach((schedule) => {
            if (schedule.isreptition === "T") {
                // 반복 일정에 대한 처리
                let currentDate = new Date(schedule.calendar_date);
                let endDate = schedule.end_date
                    ? new Date(schedule.end_date)
                    : new Date();
                let repeatCycle = schedule.reptitioncycle * 7;
                let repeatCount = schedule.reptition_time;

                while (currentDate < endDate || schedule.iscontinuous === "T") {
                    let yearMonth = `${currentDate.getFullYear()}-${String(
                        currentDate.getMonth() + 1
                    ).padStart(2, "0")}`;
                    if (yearMonth === month) {
                        let dayKey = currentDate.toISOString().split("T")[0];
                        if (!formattedResponse[dayKey]) {
                            formattedResponse[dayKey] = [];
                        }
                        formattedResponse[dayKey].push({
                            id: schedule.id,
                            name: schedule.schedule_name,
                        });
                    }

                    if (currentDate.getMonth() > new Date(month).getMonth()) {
                        // 다음 달로 넘어갔으므로 중단
                        break;
                    }

                    if (
                        repeatCount !== null &&
                        --repeatCount <= 0 &&
                        schedule.iscontinuous !== "T"
                    ) {
                        // 지정된 반복 횟수에 도달하면 중단
                        break;
                    }

                    // 다음 반복 일정으로 날짜 업데이트
                    currentDate.setDate(currentDate.getDate() + repeatCycle);
                }
            } else {
                // 반복되지 않는 일정에 대한 처리
                if (schedule.calendar_date.startsWith(month)) {
                    let dateKey = schedule.calendar_date;
                    if (!formattedResponse[dateKey]) {
                        formattedResponse[dateKey] = [];
                    }
                    formattedResponse[dateKey].push({
                        id: schedule.id,
                        name: schedule.schedule_name,
                    });
                }
            }
        });

        res.json(formattedResponse);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: `Error retrieving schedule information: ${error.message}`,
        });
    }
});

router.get("/detail", authMember, async (req, res) => {});

module.exports = router;